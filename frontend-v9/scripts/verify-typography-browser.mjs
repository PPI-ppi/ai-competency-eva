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
        if(pathname==='/api/questions/taxonomy')data=${JSON.stringify(taxonomyFixture)};
        if(pathname==='/api/classes/creation-options')data={assessmentPointWeights:window.__weightsSupported};
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
  const fill=async(selector,value)=>{
    await evaluate(`(()=>{const input=document.querySelector(${JSON.stringify(selector)});const prototype=input.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:input.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(prototype,'value').set.call(input,${JSON.stringify(value)});input.dispatchEvent(new Event(input.tagName==='SELECT'?'change':'input',{bubbles:true}));})()`);
    await delay(40);
  };
  for (const role of ['student', 'teacher']) {
    await evaluate(`sessionStorage.setItem('ripple-auth','1');sessionStorage.setItem('ripple-role',${JSON.stringify(role)});sessionStorage.setItem('ripple-user',JSON.stringify({name:'字号检查',username:'字号检查'}));`);
    await navigate();
    await inspect(`${role}-home`, true);
    if(viewportWidth>1023)assert.ok(await evaluate(`document.querySelector('.portal-sidebar').getBoundingClientRect().right <= document.querySelector('.dash-main').getBoundingClientRect().left+1`),'Desktop sidebar must not overlap content');
    if (viewportWidth <= 1023) {
      assert.equal(await evaluate(`document.querySelector('.portal-sidebar').inert`), true);
      await evaluate(`document.querySelector('.portal-mobile-toggle').click()`);
      await delay(100);
      assert.equal(await evaluate(`document.querySelector('.dash-main').inert`), true);
      assert.equal(await evaluate(`document.activeElement.className`), 'portal-mobile-close');
      const drawer = await send('Page.captureScreenshot', {format:'png'});
      fs.writeFileSync(path.join(output, `${role}-drawer-${viewportWidth}.png`),Buffer.from(drawer.data,'base64'));
      await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'});
      await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape'});
      await delay(100);
      assert.equal(await evaluate(`document.activeElement.className`),'portal-mobile-toggle');
      assert.equal(await evaluate(`document.querySelector('.dash-main').inert`), false);
    }
    const menu = await evaluate(`[...document.querySelectorAll('.portal-primary button')].map(el=>el.title)`);
    for (const title of menu.slice(1)) {
      if(viewportWidth<=1023)await evaluate(`document.querySelector('.portal-mobile-toggle').click()`);
      await evaluate(`[...document.querySelectorAll('.portal-primary button')].find(el=>el.title===${JSON.stringify(title)}).click()`);
      await inspect(`${role}-${title}`, title === '训练场');
      if(viewportWidth<=1023)assert.equal(await evaluate(`document.querySelector('.portal-sidebar').inert`),true);
      if(role==='teacher'&&title==='题库管理'){
        for(const view of ['mine','public']){
          if(view==='public')await evaluate(`document.querySelector('.teacher-bank-title aside button').click()`);
          await fill('.question-bank-filters .picker-filter select','AI工具使用');
          await fill('.question-bank-filters .picker-filter:nth-child(2) select','工具使用能力-文本写作');
          assert.equal(await evaluate(`document.querySelectorAll('.teacher-bank-row:not(.head)').length`),1);
          assert.equal(await evaluate(`document.querySelector('.question-point-labels').textContent`),'工具使用能力-文本写作');
          await inspect('question-bank-scenes-'+view,true);
          await fill('.question-bank-filters input','图像');
          assert.equal(await evaluate(`document.querySelectorAll('.teacher-bank-row:not(.head)').length`),0);
          await evaluate(`document.querySelector('.question-bank-filters .picker-filter-reset').click()`);
        }
        await evaluate(`document.querySelector('.teacher-bank-title aside button').click()`);
      }
      const editor = role==='teacher' && (title==='题库管理' ? ['.teacher-bank-title .primary','.question-create-form','create-question'] : title==='任务管理' ? ['.task-manage-title>button','.task-publish-dialog','publish-task'] : null);
      if(editor){
        const [trigger,form,label]=editor;
        await evaluate(`document.querySelector(${JSON.stringify(trigger)}).click()`);
        await inspect(label,true);
        if(label==='create-question')assert.equal(await evaluate(`/分值|题数|题目数量/.test(document.querySelector('.question-create-form').innerText)`),false);
        assert.ok(await evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(form)}),r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&el.scrollWidth<=el.clientWidth+1})()`),`${label}: dialog fits viewport without horizontal scrolling`);
        if(label==='publish-task'){
          assert.equal(await evaluate(`/预计时长|题目数量/.test(document.querySelector('.task-publish-dialog').innerText)`),false);
          assert.equal(await evaluate(`document.querySelector('.task-publish-dialog').innerText.includes('截止时间')`),true);
          await fill('.task-publish-dialog>label select','99');
          await fill('.task-publish-dialog>label input','场景任务');
          await evaluate(`[...document.querySelectorAll('.task-publish-dialog fieldset button')].find(el=>el.textContent==='AI工具使用').click()`);
          await evaluate(`document.querySelector('.task-publish-dialog [aria-label="工具使用能力-图像生成"]').click()`);
          await inspect('publish-task-scenes',true);
          await evaluate(`document.querySelector('.task-publish-dialog footer .primary').click()`);
          await waitFor(()=>evaluate(`!document.querySelector('.task-publish-dialog')`));
          const task=await evaluate(`window.__apiRequests.find(r=>r.pathname==='/api/classes/99/assessment-tasks'&&r.method==='POST').body`);
          assert.equal('estimatedDuration' in task,false);
          assert.deepEqual(task.assessmentPoints,['工具使用能力-图像生成']);
          assert.equal(task.deadlineAt,null);
        }

        if(label==='create-question'){
          await fill('.question-form-grid select','TRUE_FALSE');
          await fill('.question-form-grid label:nth-child(2) select','1');
          await fill('.question-create-form>label input','不填写分值的题目');
          await fill('.question-create-form>label textarea','测试题干');
          await fill('.question-create-form>label select','正确');
          await evaluate(`[...document.querySelectorAll('.question-create-form fieldset button')].find(el=>el.textContent==='AI工具使用').click()`);
          await delay(50);
          assert.equal(await evaluate(`document.querySelectorAll('.question-create-form .assessment-point-group').length`),8);
          assert.equal(await evaluate(`document.querySelectorAll('.question-create-form .assessment-point-group button').length`),32);
          await evaluate(`document.querySelector('.question-create-form [aria-label="工具使用能力-文本写作"]').click();document.querySelector('.question-create-form [aria-label="工具使用能力-图像生成"]').click()`);
          await inspect('create-question-scenes',true);
          await delay(50);
          await evaluate(`document.querySelector('.question-create-form footer .primary').click()`);
          await waitFor(()=>evaluate(`!document.querySelector('.question-create-form')`));
          const body=await evaluate(`window.__apiRequests.find(r=>r.pathname==='/api/questions'&&r.method==='POST').body`);
          assert.equal('score' in body,false);
          assert.equal('questionCount' in body,false);
          assert.deepEqual(body.assessmentPoints,['工具使用能力-文本写作','工具使用能力-图像生成']);
        }
      }
      if(role==='student'&&title==='训练场'){
        await evaluate(`document.querySelector('.training-ticket .ticket-action').click()`);
        await inspect('custom-training',true);
        assert.ok(await evaluate(`(()=>{const p=document.querySelector('.planner-preview').getBoundingClientRect(),a=document.querySelector('.planner-actions').getBoundingClientRect();return p.bottom<=a.top+1})()`),'Preview must not overlap actions');
        assert.equal(await evaluate(`/分值|题数|任务数量/.test(document.querySelector('.custom-training-dialog').innerText)`),false);
        await evaluate(`document.querySelector('.planner-target button').click();document.querySelector('.planner-mode>button').click()`);
        await delay(50);
        await evaluate(`document.querySelector('.planner-actions footer button:last-child').click()`);
        await waitFor(()=>evaluate(`window.__apiRequests.some(r=>r.pathname==='/api/training/sessions')`));
        const request=await evaluate(`window.__apiRequests.find(r=>r.pathname==='/api/training/sessions').body`);
        assert.equal('questionCount' in request,false);
        assert.equal('score' in request,false);
        await evaluate(`document.querySelector('.planner-cancel').click()`);
      }
      if(role==='teacher'&&title==='我的组织'){
        await evaluate(`document.querySelector('.teacher-class-page>header>button').click()`);
        await inspect('create-organization',true);
        assert.equal(await evaluate(`document.querySelectorAll('.organization-weight-groups legend input').length`),0);
        await fill('.teacher-class-create>label input','权重测试组织');
        await evaluate(`document.querySelector('.organization-point-choice input').click()`);
        await fill('.organization-point-weight input','99.99');
        assert.equal(await evaluate(`document.querySelector('.teacher-class-create>button').disabled`),true);
        await fill('.organization-point-weight input','100');
        assert.equal(await evaluate(`document.querySelector('.teacher-class-create>button').disabled`),false);
        await evaluate(`window.__weightsSupported=false;document.querySelector('.teacher-class-create>button').click()`);
        await waitFor(()=>evaluate(`Boolean(document.querySelector('.organization-create-error'))`));
        assert.equal(await evaluate(`window.__apiRequests.filter(r=>r.pathname==='/api/classes'&&r.method==='POST').length`),0,'Old server must not create an organization without weights');
        await evaluate(`window.__weightsSupported=true;[...document.querySelectorAll('.organization-point-choice')].find(el=>el.textContent==='提示词书写').querySelector('input').click()`);
        await fill('.organization-point-weight input','40');
        await fill('.organization-weight-column:nth-child(2) fieldset:first-child .organization-point-weight input','60');
        await inspect('organization-weights-valid',true);
        assert.ok(await evaluate(`(()=>{const el=document.querySelector('.teacher-class-create'),r=el.getBoundingClientRect();return r.right<=innerWidth&&el.scrollWidth<=el.clientWidth+1})()`),'Organization form fits viewport');
        await evaluate(`document.querySelector('.teacher-class-create>button').click()`);
        await waitFor(()=>evaluate(`!document.querySelector('.teacher-class-create')`));
        assert.deepEqual(await evaluate(`window.__apiRequests.find(r=>r.pathname==='/api/classes'&&r.method==='POST').body.assessmentPointWeights`),[
          {dimension:'AI基础认知',assessmentPoint:'AI基本概念理解',weight:40},
          {dimension:'提示词工程',assessmentPoint:'提示词书写',weight:60}
        ]);
        await evaluate(`document.querySelector('.organization-saved-weights summary').click()`);
        await inspect('organization-saved',true);
        await navigate();
        if(viewportWidth<=1023)await evaluate(`document.querySelector('.portal-mobile-toggle').click()`);
        await evaluate(`[...document.querySelectorAll('.portal-primary button')].find(el=>el.title==='我的组织').click()`);
        await waitFor(()=>evaluate(`Boolean(document.querySelector('.organization-saved-weights'))`));
        assert.equal(await evaluate(`document.querySelectorAll('.organization-saved-weights li').length`),2,'Saved weights survive reload');
        for(const bankName of ['组织测试题库','组织训练题库']){
          await evaluate(`[...document.querySelectorAll('.teacher-class-tabs button')].find(el=>el.textContent.includes('${bankName}')).click()`);
          await evaluate(`[...document.querySelectorAll('.teacher-class-page button')].find(el=>el.textContent==='加入题目').click()`);
          await waitFor(()=>evaluate(`document.querySelectorAll('.class-question-picker-list article').length===6`));
          const choose=async(index,value)=>{await evaluate(`(()=>{const el=document.querySelectorAll('.picker-filter select')[${index}];el.value=${JSON.stringify(value)};el.dispatchEvent(new Event('change',{bubbles:true}))})()`);await delay(50)};
          await choose(0,'AI基础认知');
          assert.equal(await evaluate(`document.querySelectorAll('.class-question-picker-list article').length`),2);
          assert.equal(await evaluate(`[...document.querySelectorAll('.picker-filter select')[1].options].some(el=>el.value==='提示词书写')`),false);
          await choose(1,'AI基本概念理解');
          assert.equal(await evaluate(`document.querySelectorAll('.class-question-picker-list article').length`),1);
          await fill('.class-question-picker-filters input','无匹配关键词');
          assert.equal(await evaluate(`document.querySelectorAll('.class-question-picker-list article').length`),0);
          await fill('.class-question-picker-filters input','');
          await choose(0,'提示词工程');
          assert.equal(await evaluate(`document.querySelectorAll('.picker-filter select')[1].value`),'');
          assert.equal(await evaluate(`document.querySelectorAll('.class-question-picker-list article').length`),1);
          await inspect(bankName==='组织测试题库'?'test-bank-filters':'training-bank-filters',true);
          await evaluate(`document.querySelector('.picker-filter-reset').click()`);
          assert.equal(await evaluate(`document.querySelectorAll('.class-question-picker-list article').length`),6);
          await evaluate(`document.querySelector('.class-question-picker>header>button').click()`);
        }

      }
    }
    // A desktop collapse preference must not hide navigation labels after resizing.
    await send('Emulation.setDeviceMetricsOverride',{width:1440,height:700,deviceScaleFactor:1,mobile:false});
    await delay(100);
    await evaluate(`document.querySelector('.portal-collapse').click()`);
    await send('Emulation.setDeviceMetricsOverride',{width:390,height:600,deviceScaleFactor:1,mobile:false});
    await delay(100);
    await evaluate(`document.querySelector('.portal-mobile-toggle').click()`);
    await delay(100);
    assert.ok(await evaluate(`[...document.querySelectorAll('.portal-primary button span')].every(el=>getComputedStyle(el).display!=='none')`));
    await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',modifiers:8});
    assert.ok(await evaluate(`document.querySelector('.portal-sidebar').contains(document.activeElement)`));
    await evaluate(`document.querySelector('.portal-mobile-close').click()`);
    await send('Emulation.setDeviceMetricsOverride',{width:viewportWidth,height:1000,deviceScaleFactor:1,mobile:false});
  }
  await evaluate(`sessionStorage.setItem('ripple-auth','1');sessionStorage.setItem('ripple-role','enterprise')`);
  await navigate();
  assert.equal(await evaluate(`document.querySelectorAll('.portal-options button').length`),2,'Removed role returns to supported portal choices');
  assert.equal(await evaluate(`sessionStorage.getItem('ripple-auth')`),null);
  fs.writeFileSync(path.join(output, `results-${viewportWidth}.json`), JSON.stringify(summaries, null, 2));
  console.log(JSON.stringify(summaries.map(({name,overflow,outside,clippedButtons})=>({name,overflow,outside,clippedButtons})), null, 2));
  await send('Browser.close');
} finally {
  socket?.close();
  chrome.kill();
}
