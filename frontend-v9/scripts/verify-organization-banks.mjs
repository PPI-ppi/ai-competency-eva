// Local fixture-based browser QA. Run Vite on 4173; override CHROME_BIN if needed.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = fileURLToPath(new URL('..', import.meta.url));
const output = path.join(root, '.typography-qa', 'organization-banks');
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


  await send('Page.addScriptToEvaluateOnNewDocument',{source:`
    sessionStorage.setItem('ripple-auth','1');sessionStorage.setItem('ripple-role','teacher');sessionStorage.setItem('ripple-user',JSON.stringify({id:42,name:'测试管理员',username:'测试管理员'}));
    window.__added=false;window.__posts=[];
    const original={id:7,title:'挑战原题',content:'完整题干',type:'DIALOGUE',questionKind:'test',rubric:'标准',tags:['提示词工程'],assessmentPoints:['提示词书写']};
    const variant={...original,id:8,title:'挑战训练变体',questionKind:'training',sourceQuestionId:7};
    const originalFetch=window.fetch;
    window.fetch=async(url,options={})=>{
      const path=new URL(url,location.origin).pathname;
      if(!path.startsWith('/api/'))return originalFetch(url,options);
      let data=[];
      if(path==='/api/users/me')data={id:42,name:'测试管理员'};
      if(path==='/api/classes/managed')data=[{id:99,name:'测试组织'}];
      if(path==='/api/classes/99')data={classroom:{id:99,name:'测试组织'},inviteCode:'TEST'};
      if(path==='/api/classes/weight-support')data={supported:true,field:'pointWeights'};
      if(path==='/api/questions/taxonomy')data=${JSON.stringify(taxonomyFixture)};
      if(path==='/api/questions')data=[original,variant];
      if(path==='/api/questions/7')data=original;
      if(path==='/api/classes/99/question-banks/TEST/questions')data=window.__added?[original]:[];
      if(path==='/api/classes/99/question-banks/TRAINING/questions')data=window.__added?[variant]:[];
      if(path==='/api/classes/99/questions/7'&&options.method==='POST'){window.__posts.push(path);window.__added=true;data={trainingStatus:'success',trainingQuestionId:8};}
      return new Response(JSON.stringify({code:0,data}),{headers:{'Content-Type':'application/json'}});
    };
  `});
  await send('Page.navigate',{url:'http://127.0.0.1:4173/ripple-ai-assessment/'});
  await waitFor(()=>evaluate(`Boolean(document.querySelector('.portal-primary'))`));
  await evaluate(`[...document.querySelectorAll('.portal-primary button')].find(b=>b.title==='我的组织').click()`);
  await waitFor(()=>evaluate(`Boolean(document.querySelector('.teacher-class-tabs'))`));
  const tab=label=>evaluate(`[...document.querySelectorAll('.teacher-class-tabs button')].find(b=>b.textContent.includes(${JSON.stringify(label)})).click()`);
  await tab('组织测试题库');
  await evaluate(`document.querySelector('.class-question-tools button').click()`);
  await waitFor(()=>evaluate(`document.querySelectorAll('.class-question-picker-list article').length===1`));
  assert.equal(await evaluate(`document.querySelector('.class-question-picker-list').textContent.includes('挑战训练变体')`),false);
  await evaluate(`document.querySelector('.class-question-picker-list article>button:last-child').click()`);
  await waitFor(()=>evaluate(`document.querySelector('.class-question-picker-list article>button:last-child').disabled`));
  await evaluate(`document.querySelector('.class-question-picker>header>button').click()`);
  await waitFor(()=>evaluate(`document.querySelectorAll('.teacher-member-list article').length===1`));
  assert.equal(await evaluate(`document.querySelector('.teacher-member-list .question-detail-link').textContent`),'挑战原题');
  assert.equal(await evaluate(`[...document.querySelectorAll('.teacher-member-list article button')].some(b=>b.textContent==='生成训练变体')`),false);
  assert.ok(await evaluate(`document.querySelector('.training-variant-ready').textContent.includes('已生成训练变体')`));
  assert.equal(await evaluate(`window.__posts.length`),1);
  const shot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(output,'test-original-only.png'),Buffer.from(shot.data,'base64'));
  await tab('组织训练题库');
  assert.equal(await evaluate(`document.querySelector('.teacher-member-list .question-detail-link').textContent`),'挑战训练变体');
  assert.equal(await evaluate(`document.querySelectorAll('.teacher-member-list article').length`),1);
  console.log('PASS: picker excludes variants; adding one source gives one test original and one training variant; original shows generated state');
  await send('Browser.close');
} finally {socket?.close();chrome.kill()}
