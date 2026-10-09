// Local fixture-based browser QA. Run Vite on 4173; override CHROME_BIN if needed.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = fileURLToPath(new URL('..', import.meta.url));
const output = path.join(root, '.typography-qa', 'assessment-init');
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


  await send('Page.addScriptToEvaluateOnNewDocument',{source:String.raw`
    sessionStorage.setItem('ripple-auth','1');sessionStorage.setItem('ripple-role','student');sessionStorage.setItem('ripple-user',JSON.stringify({id:42,name:'测试学生',username:'测试学生'}));
    window.__initializations=0;window.__submitted=[];window.__choiceOptions='A. NLP 和 CV 是 AI 的分支 B. NLP = CV < AI C. AI 是 NLP 的分支 D. 三者完全相同';
    const originalFetch=window.fetch;
    window.fetch=async(url,options={})=>{
      const path=new URL(url,location.origin).pathname;
      if(!path.startsWith('/api/'))return originalFetch(url,options);
      let data=[];
      if(path==='/api/users/me')data={id:42,name:'测试学生',stats:{}};
      if(path==='/api/classes/joined')data=[{id:99,name:'测试组织'}];
      if(path==='/api/classes/99/self-assessments/start')data={id:77};
      if(path==='/api/assessments/77/conversation')data=window.__initializations===0?{}:{question:{id:7,type:'SINGLE',title:'AI 基础概念',content:'以下哪一项描述正确？',options:window.__choiceOptions},questions:[]};
      if(path==='/api/assessments/77/chat/stream'){
        window.__initializations++;window.__submitted.push(JSON.parse(options.body).content);
        return new Response('event: done\ndata: {}\n\n',{headers:{'Content-Type':'text/event-stream'}});
      }
      return new Response(JSON.stringify({code:0,data}),{headers:{'Content-Type':'application/json'}});
    };
  `});
  await send('Page.navigate',{url:'http://127.0.0.1:4173/ripple-ai-assessment/'});
  await waitFor(()=>evaluate(`Boolean(document.querySelector('.portal-primary'))`));
  await evaluate(`[...document.querySelectorAll('.portal-primary button')].find(b=>b.title==='测评中心').click()`);
  await waitFor(()=>evaluate(`Boolean(document.querySelector('.assessment-hero-v2 button'))`));
  await evaluate(`document.querySelector('.assessment-hero-v2 button').click()`);
  await waitFor(()=>evaluate(`Boolean(document.querySelector('.agent-question-detail h2'))`));
  assert.equal(await evaluate(`window.__initializations`),1,'StrictMode must initialize exactly once');
  assert.equal(await evaluate(`document.querySelector('.agent-workbench-error')===null`),true);
  console.log('PASS: StrictMode loads one initialization stream and restores one question without stale error');

} finally {socket?.close();chrome.kill()}
