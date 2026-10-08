// Local fixture-based browser QA. Run Vite on 4173; override CHROME_BIN if needed.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = fileURLToPath(new URL('..', import.meta.url));
const output = path.join(root, '.typography-qa', 'question-details');
const viewportWidth = Number(process.argv[2] || 1440);
const taxonomyFixture=JSON.parse(fs.readFileSync(new URL('./fixtures/taxonomy.json',import.meta.url),'utf8'));
fs.mkdirSync(output, { recursive: true });
const profile = fs.mkdtempSync(path.join(output, 'chrome-'));
const chrome = spawn(process.env.CHROME_BIN || (process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : 'C:/Program Files/Google/Chrome/Application/chrome.exe'), [
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

  const fixtures = [
    {id:501,type:'SINGLE_CHOICE',title:'完整客观题',content:'第一行题干\n第二行题干\n'+('长题干内容。'.repeat(150)),options:'选项一\n选项二',answer:'选项二',rubric:null,difficulty:2,tags:['AI基础认知'],assessmentPoints:['AI基本概念理解']},
    {id:502,type:'PRACTICAL',title:'实操任务',content:'完成任务要求\n提交最终成果',rubric:'评估提示词质量\n评估最终成果',difficulty:3,tags:['提示词工程'],assessmentPoints:['提示词书写']},
    {id:503,type:'DIALOGUE',title:'对话任务',content:'完整对话题干',rubric:null,difficulty:1,tags:[],assessmentPoints:[]},
  ];
  await send('Page.addScriptToEvaluateOnNewDocument', {source:`
    const fixtures=${JSON.stringify(fixtures)};
    window.__qaAdded=[];window.__qaRequests=[];window.__qaFail=false;
    sessionStorage.setItem('ripple-auth','1');sessionStorage.setItem('ripple-role','teacher');sessionStorage.setItem('ripple-user',JSON.stringify({id:42,name:'测试管理员',username:'测试管理员'}));
    const originalFetch=window.fetch;
    window.fetch=async(url,options={})=>{
      const path=new URL(url,location.origin).pathname;
      if(!path.startsWith('/api/'))return originalFetch(url,options);
      window.__qaRequests.push({path,method:options.method||'GET'});
      let data=[];
      if(path==='/api/users/me')data={id:42,name:'测试管理员',username:'测试管理员'};
      if(path==='/api/questions')data=fixtures;
      if(path==='/api/questions/public')data=[{...fixtures[0],id:504,title:'公开题目',answer:undefined,rubric:undefined}];
      if(/^\\/api\\/questions\\/\\d+$/.test(path)){
        if(window.__qaFail){return new Response(JSON.stringify({message:'详情加载失败'}),{status:503,headers:{'Content-Type':'application/json'}});}
        const id=Number(path.split('/').pop());data=id===504?{...fixtures[0],id,title:'公开题目',answer:undefined,rubric:undefined}:fixtures.find(q=>q.id===id);
      }
      if(path==='/api/questions/taxonomy')data=${JSON.stringify(taxonomyFixture)};
      if(path==='/api/classes/managed')data=[{id:99,name:'测试组织'}];
      if(path==='/api/classes/99')data={classroom:{id:99,name:'测试组织'},inviteCode:'TEST'};
      if(path==='/api/classes/weight-support')data={supported:true,field:'pointWeights'};
      if((path==='/api/classes/99/questions'||path==='/api/classes/99/question-banks/TEST/questions'))data=fixtures.filter(q=>window.__qaAdded.includes(q.id));
      if(path==='/api/classes/99/questions/501'&&options.method==='POST'){window.__qaAdded.push(501);data={};}
      return new Response(JSON.stringify({code:0,data}),{headers:{'Content-Type':'application/json'}});
    };
  `});
  await send('Page.navigate',{url:'http://127.0.0.1:4173/ripple-ai-assessment/'});
  await waitFor(()=>evaluate(`Boolean(document.querySelector('.portal-primary'))`));
  const click = text => evaluate(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)}||b.title===${JSON.stringify(text)});if(!b)throw Error('Missing button: '+${JSON.stringify(text)});b.click()})()`);
  const open = async index => {
    await evaluate(`document.querySelectorAll('.teacher-bank-row:not(.head) .question-detail-link')[${index}].click()`);
    await waitFor(()=>evaluate(`Boolean(document.querySelector('.question-detail-name'))`));
  };
  const close = () => evaluate(`document.querySelector('[aria-label="关闭题目详情"]').click()`);
  await click('题库管理');
  await waitFor(()=>evaluate(`document.querySelectorAll('.teacher-bank-row:not(.head)').length===3`));
  await open(0);
  assert.equal(await evaluate(`document.querySelector('dialog').open`),true);
  assert.equal(await evaluate(`document.querySelectorAll('.question-detail-options li').length`),2);
  assert.ok((await evaluate(`document.querySelector('dialog').textContent`)).includes('选项二'));
  assert.ok((await evaluate(`document.querySelector('dialog .question-detail-text').textContent`)).includes('第二行题干'));
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('.question-detail-text')).whiteSpace`),'pre-wrap');
  assert.equal(await evaluate(`document.querySelector('.question-detail-body').scrollHeight>document.querySelector('.question-detail-body').clientHeight`),true);
  const capture = async name => {const r=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(output,`${name}-${viewportWidth}.png`),Buffer.from(r.data,'base64'));};
  await capture('objective');await close();
  await open(1);assert.ok((await evaluate(`document.querySelector('dialog').textContent`)).includes('评估最终成果'));await close();
  await open(2);assert.ok((await evaluate(`document.querySelector('dialog').textContent`)).includes('未设置'));await close();
  await evaluate(`window.__qaFail=true;document.querySelector('.question-detail-link').click()`);
  await waitFor(()=>evaluate(`Boolean(document.querySelector('dialog [role="alert"]'))`));
  await evaluate(`window.__qaFail=false`);await click('重新加载');await waitFor(()=>evaluate(`Boolean(document.querySelector('.question-detail-name'))`));await close();
  await click('切换到公开题库');
  await waitFor(()=>evaluate(`document.querySelector('.question-detail-link')?.textContent.includes('第一行')`));
  await open(0);assert.ok((await evaluate(`document.querySelector('dialog').textContent`)).includes('当前公开题目未提供参考答案'));await close();
  await click('我的组织');await waitFor(()=>evaluate(`Boolean(document.querySelector('.teacher-class-tabs'))`));
  await evaluate(`[...document.querySelectorAll('.teacher-class-tabs button')].find(b=>b.textContent.includes('组织测试题库')).click()`);
  await click('加入题目');await waitFor(()=>evaluate(`document.querySelectorAll('.class-question-picker-list article').length===3`));
  await evaluate(`document.querySelector('.class-question-picker-list .question-detail-link').click()`);
  await waitFor(()=>evaluate(`Boolean(document.querySelector('.question-detail-name'))`));
  await capture('organization');
  await click('加入组织题库');await waitFor(()=>evaluate(`document.querySelector('.question-detail-primary')?.textContent==='已加入组织题库'`));
  assert.equal(await evaluate(`document.querySelector('.question-detail-primary').disabled`),true);
  assert.equal(await evaluate(`window.__qaRequests.filter(r=>r.path==='/api/classes/99/questions/501'&&r.method==='POST').length`),1);
  await close();assert.equal(await evaluate(`Boolean(document.querySelector('.class-question-picker'))`),true);
  await evaluate(`document.querySelector('.class-question-picker .question-detail-link').focus();document.querySelector('.class-question-picker .question-detail-link').click()`);
  await waitFor(()=>evaluate(`Boolean(document.querySelector('.question-detail-name'))`));await close();
  assert.equal(await evaluate(`document.activeElement.classList.contains('question-detail-link')`),true);
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false});
  await evaluate(`document.querySelector('.class-question-picker .question-detail-link').click()`);
  await waitFor(()=>evaluate(`Boolean(document.querySelector('.question-detail-name'))`));
  assert.equal(await evaluate(`(()=>{const r=document.querySelector('dialog').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight})()`),true);
  await capture('mobile');
  console.log('PASS: full objective/practical/dialogue details, missing/public fields, retry, organization add once, retained picker, focus restoration, long content and mobile bounds');
  await send('Browser.close');
} finally {socket?.close();chrome.kill()}
