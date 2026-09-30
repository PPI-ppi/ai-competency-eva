// Optional local visual QA. Requires Chrome on Windows and npm run preview on 4173.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = fileURLToPath(new URL('..', import.meta.url));
const output = path.join(root, '.typography-qa');
const viewportWidth = Number(process.argv[2] || 1440);
const taxonomyFixture=JSON.parse(fs.readFileSync(new URL('./fixtures/taxonomy.json',import.meta.url),'utf8'));
fs.mkdirSync(output, { recursive: true });
const profile = fs.mkdtempSync(path.join(output, 'chrome-'));
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank',
], { windowsHide: true, stdio: 'ignore' });
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const waitFor = async fn => {
  for (let i = 0; i < 100; i++) { const value = await fn(); if (value) return value; await delay(100); }
  throw new Error('Browser timed out');
};
let socket;
try {
  const activePort = path.join(profile, 'DevToolsActivePort');
  const port = await waitFor(() => {
    try { return fs.readFileSync(activePort, 'utf8').split('\n')[0] || false; }
    catch(error) { if(['ENOENT','EBUSY'].includes(error.code))return false;throw error; }
  });
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  socket = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let serial = 0;
  const pending = new Map();
  socket.onmessage = event => {
    const response = JSON.parse(event.data);
    if (pending.has(response.id)) {
      const { resolve, reject } = pending.get(response.id);
      pending.delete(response.id);
      response.error ? reject(response.error) : resolve(response.result);
    }
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++serial; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: viewportWidth, height: 1000, deviceScaleFactor: 1, mobile: false });
  // Empty local fixtures prevent backend calls. This never changes production data.
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `
    const originalFetch = window.fetch;
    window.__apiRequests=[];
    window.__weightsSupported=true;
    window.fetch = (url, options={}) => {
      if (String(url).includes('/api/')) {
        const pathname=new URL(url,location.origin).pathname,method=options.method||'GET';
        const body=options.body?JSON.parse(options.body):null;
        window.__apiRequests.push({pathname,method,body});
        let data=pathname.endsWith('/users/me')?{name:'字号检查',username:'字号检查'}:[];
        if(['/api/questions','/api/questions/public'].includes(pathname)&&method==='GET')data=[{id:501,title:'认知题甲',content:'概念知识',tags:['AI基础认知'],assessmentPoints:['AI基本概念理解']},{id:502,title:'提示题乙',content:'提示练习',tags:['提示词工程'],assessmentPoints:['提示词书写']},{id:503,title:'认知题丙',content:'历史知识',tags:['AI基础认知'],assessmentPoints:['AI发展历程认知']},{id:504,title:'写作场景题',tags:['AI工具使用'],assessmentPoints:['工具使用能力-文本写作']},{id:505,title:'图像场景题',tags:['AI工具使用'],assessmentPoints:['工具使用能力-图像生成']},{id:506,title:'旧工具题',tags:['AI工具使用'],assessmentPoints:['工具使用能力']}];
        if(pathname==='/api/questions/public'&&method==='GET')data=[{id:501,title:'【入门 · 0.2】',content:'下列哪项最准确地描述了人工智能、机器学习和深度学习三者的关系？',score:100,type:'SINGLE_CHOICE',tags:['AI基础认知'],assessmentPoints:['AI基本概念理解']}];
        if(pathname==='/api/questions'&&method==='GET')data=JSON.parse(localStorage.getItem('qa-copies')||'[]');
        if(pathname==='/api/questions/public/501/copy'&&method==='POST'){data={id:999,title:'【入门 · 0.2】',content:'复制后的题目',score:100,type:'SINGLE_CHOICE',tags:['AI基础认知'],assessmentPoints:['AI基本概念理解']};localStorage.setItem('qa-copies',JSON.stringify([data]));}
        if(pathname==='/api/questions/taxonomy')data=${JSON.stringify(taxonomyFixture)};
        if(pathname==='/api/classes/weight-support')data={supported:true,version:1,field:'pointWeights'};if(pathname==='/api/classes/99')data={classroom:{id:99,name:'测试组织'},inviteCode:'TEST2026',pointWeights:{'提示词书写':8}};
        if(pathname==='/api/classes/managed')data=JSON.parse(sessionStorage.getItem('qa-organizations')||'[{"id":99,"name":"测试组织"}]');
        if(pathname==='/api/classes'&&method==='POST'){
          data={...body,id:99,inviteCode:'TEST2026'};
          sessionStorage.setItem('qa-organizations',JSON.stringify([{...data,assessmentPointWeights:JSON.stringify(body.assessmentPointWeights)}]));
        }
        return Promise.resolve(new Response(JSON.stringify({code:0,data}), {headers:{'Content-Type':'application/json'}}));
      }
      return originalFetch(url, options);
    };
  ` });
  const navigate = async () => {
    await send('Page.navigate', { url: 'http://127.0.0.1:4173/ripple-ai-assessment/' });
    await waitFor(() => evaluate(`Boolean(document.querySelector('#root')?.children.length)`));
    await delay(200);
  };
  const summaries = [];
  const inspect = async (name, screenshot = false) => {
    await delay(150);
    const summary = await evaluate(`(() => {
      const visible = [...document.querySelectorAll('body *')].filter(el =>
        !['SCRIPT','STYLE'].includes(el.tagName) && el.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}) &&
        ([...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)));
      const rows = visible.map(el => { const s=getComputedStyle(el); return {
        tag:el.tagName, text:(el.textContent||el.placeholder||'').trim().slice(0,45),
        size:s.fontSize, weight:s.fontWeight, family:s.fontFamily
      }; });
      return {sizes:[...new Set(rows.map(r=>r.size))].sort(), weights:[...new Set(rows.map(r=>r.weight))].sort(), count:rows.length,
        invalid:rows.filter(r=>!r.family.includes('Microsoft YaHei')),
        headings:rows.filter(r=>r.tag==='H1'),
        overflow:document.documentElement.scrollWidth>innerWidth,
        outside:visible.filter(el=>{const r=el.getBoundingClientRect();if(!r.width || (r.right<=innerWidth+2 && r.left>=-2) || el.closest('.portal-sidebar'))return false;for(let p=el.parentElement;p&&p!==document.body;p=p.parentElement){if(['auto','scroll'].includes(getComputedStyle(p).overflowX)&&p.scrollWidth>p.clientWidth)return false;}return true;}).map(el=>({tag:el.tagName,cls:el.className,text:el.textContent.trim().slice(0,25)})).slice(0,30),
        clippedButtons:[...document.querySelectorAll('button')].filter(el=>el.checkVisibility() && el.scrollHeight>el.clientHeight+3 && getComputedStyle(el).overflowY==='hidden').map(el=>el.textContent.trim())};
    })()`);
    summaries.push({ name, ...summary });
    assert.ok(summary.count > 0, `${name} must render`);
    assert.deepEqual(summary.invalid, [], `${name}: invalid typography`);
    assert.equal(summary.overflow, false, `${name}: page overflow`);
    assert.deepEqual(summary.outside, [], `${name}: content outside viewport`);
    assert.deepEqual(summary.clippedButtons, [], `${name}: clipped buttons`);
    assert.equal(await evaluate(`Boolean(document.querySelector('.home-iqi,.page-user-button,.user-pill,.iq-pill,.notice-username,.design-page-head>b'))`),false,`${name}: removed username badge`);
    assert.equal(await evaluate(`/企业端|教师端|教师任务|班级/.test(document.body.innerText)`),false,`${name}: old terminology`);
    const originalSizes = { login: ['.login-head h1','32px'], 'student-home': ['.welcome-copy h1','42px'], 'teacher-home': ['.teacher-hero h1','31px'] };
    if (viewportWidth === 1440 && originalSizes[name]) {
      const [selector, size] = originalSizes[name];
      assert.equal(await evaluate(`getComputedStyle(document.querySelector(${JSON.stringify(selector)})).fontSize`), size, `${name}: restore original heading size`);
    }
    if (screenshot || viewportWidth < 1100) {
      const result = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      fs.writeFileSync(path.join(output, `${name}-${viewportWidth}.png`), Buffer.from(result.data, 'base64'));
    }
  };
  await navigate();
  await inspect('landing', true);
  await evaluate(`document.querySelector('.landing-v2-actions button').click()`);
  await inspect('role-select');
  assert.deepEqual(await evaluate(`[...document.querySelectorAll('.portal-options h2')].map(el=>el.textContent)`),['学生端','管理端']);
  await evaluate(`document.querySelector('.portal-options button').click()`);
  await inspect('login', true);

  await evaluate(`sessionStorage.setItem('ripple-auth','1');sessionStorage.setItem('ripple-role','teacher');sessionStorage.setItem('ripple-user',JSON.stringify({id:42,name:'接口测试',username:'接口测试'}));`);
  await navigate();await inspect('zip-teacher-home',true);
  await evaluate(`[...document.querySelectorAll('.portal-primary button')].find(el=>el.title==='题库管理').click()`);
  await delay(200);await inspect('zip-question-bank',true);

  await evaluate(`document.querySelector('.teacher-bank-title aside button').click()`);
  await delay(150);
  assert.equal(await evaluate(`document.querySelector('.question-summary strong').textContent.startsWith('下列哪项')`),true);
  assert.equal(await evaluate(`document.querySelector('.question-difficulty').textContent`),'难度：入门 · 0.2');
  assert.equal(await evaluate(`(()=>{const el=document.querySelector('.question-score');return el.scrollWidth<=el.clientWidth})()`),true);
  await inspect('bank-refined-before',true);
  await evaluate(`document.querySelector('.teacher-bank-row.public:not(.head) nav button').click();document.querySelector('.teacher-bank-row.public:not(.head) nav button').click()`);
  await waitFor(()=>evaluate(`document.querySelector('.teacher-bank-row.public:not(.head) nav button')?.textContent==='已复制'`));
  assert.equal(await evaluate(`document.querySelector('.teacher-bank-row.public:not(.head) nav button').disabled`),true);
  assert.equal(await evaluate(`window.__apiRequests.filter(r=>r.pathname.endsWith('/501/copy')).length`),1);
  assert.equal(await evaluate(`document.body.innerText.includes('已复制到我的私有题库')`),false);
  await inspect('bank-refined-copied',true);
  await navigate();
  await evaluate(`[...document.querySelectorAll('.portal-primary button')].find(el=>el.title==='题库管理').click()`);
  await delay(200);
  await evaluate(`document.querySelector('.teacher-bank-title aside button').click()`);
  await waitFor(()=>evaluate(`document.querySelector('.teacher-bank-row.public:not(.head) nav button')?.textContent==='已复制'`));
  console.log('PASS copy button changes, repeat click sends one request, persists across refresh, score fits, question content leads');
  await send('Browser.close');
}finally{socket?.close();chrome.kill()}
