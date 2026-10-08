// Local fixture-based browser QA. Run Vite on 4173; override CHROME_BIN if needed.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = fileURLToPath(new URL('..', import.meta.url));
const output = path.join(root, '.typography-qa', 'teacher-overview');
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
    window.__failStats=false;window.__failProfile=false;window.__zeroStats=false;window.__requests=[];
    const originalFetch=window.fetch;
    window.fetch=async(url,options={})=>{
      const path=new URL(url,location.origin).pathname;
      if(!path.startsWith('/api/'))return originalFetch(url,options);
      window.__requests.push(path);
      let data=[];
      if(path==='/api/users/me')data={id:42,name:'测试管理员',username:'测试管理员'};
      if(path==='/api/classes/managed')data=[{id:99,name:'测试组织'}];
      if(path==='/api/classes/99')data={classroom:{id:99,name:'测试组织'},inviteCode:'TEST'};
      if(path==='/api/classes/weight-support')data={supported:true,field:'pointWeights'};
      if(path==='/api/questions/taxonomy')data=${JSON.stringify(taxonomyFixture)};
      if(path==='/api/classes/99/assessment-tasks')data=[{id:11,classId:99,title:'进行中任务',status:'active'},{id:12,classId:99,title:'已结束任务',status:'ended'}];
      if(path==='/api/teacher/assessment-tasks/statistics'){
        if(window.__failStats)return new Response(JSON.stringify({message:'统计服务暂时失败'}),{status:503,headers:{'Content-Type':'application/json'}});
        data=window.__zeroStats?{publishedCount:0,activeCount:0,participantCount:0,averageCompletionRate:0}:{publishedCount:2,activeCount:1,participantCount:3,averageCompletionRate:75};
      }
      if(path==='/api/classes/99/members')data=[{id:1,studentUserId:201,name:'已测评成员',hasAssessment:true,abilityLevel:'L3',abilityLevelName:'应用进阶者'},{id:2,studentUserId:202,name:'未测评成员',hasAssessment:false,abilityLevel:null}];
      if(path.startsWith('/api/teacher/classes/99/students/')){
        if(window.__failProfile)return new Response(JSON.stringify({message:'画像服务暂时失败'}),{status:503,headers:{'Content-Type':'application/json'}});
        data={profile:{hasAssessment:path.includes('/201/'),latest:path.includes('/201/')?{level:'L3',levelName:'应用进阶者',averageScore:75}:null,dimensions:[]}};
      }
      return new Response(JSON.stringify({code:0,data}),{headers:{'Content-Type':'application/json'}});
    };
  `});
  await send('Page.navigate',{url:'http://127.0.0.1:4173/ripple-ai-assessment/'});
  await waitFor(()=>evaluate(`Boolean(document.querySelector('.portal-primary'))`));
  const navigate=async title=>{await evaluate(`[...document.querySelectorAll('.portal-primary button')].find(b=>b.title===${JSON.stringify(title)}).click()`);};
  const metrics=()=>evaluate(`[...document.querySelectorAll('.task-manage-metrics b')].map(b=>b.textContent)`);
  const capture=async name=>{const shot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(output,`${name}-${viewportWidth}.png`),Buffer.from(shot.data,'base64'));};
  await navigate('任务管理');
  await waitFor(async()=>JSON.stringify(await metrics())==='["2","1","3","75%"]');
  assert.ok(await evaluate(`window.__requests.includes('/api/teacher/assessment-tasks/statistics')`),'statistics must reach fetch through route guard');
  await capture('task-statistics');
  await evaluate(`[...document.querySelectorAll('.task-status-tabs button')].find(b=>b.textContent==='已结束').click()`);
  assert.ok((await evaluate(`document.querySelector('.teacher-task-manage').textContent`)).includes('已结束任务'));
  await navigate('我的组织');await waitFor(()=>evaluate(`document.querySelectorAll('.teacher-member-list article').length===2`));
  assert.deepEqual(await evaluate(`[...document.querySelectorAll('.teacher-member-list article small')].map(x=>x.textContent)`),['能力等级：L3 · 应用进阶者','能力等级：尚未测评']);
  await capture('member-levels');
  await evaluate(`document.querySelector('.teacher-member-list article button').click()`);
  await waitFor(()=>evaluate(`Boolean(document.querySelector('.teacher-student-report-list'))`));
  assert.ok((await evaluate(`document.querySelector('.task-result-detail').textContent`)).includes('应用进阶者'));
  await evaluate(`[...document.querySelectorAll('.task-result-detail footer button')].find(b=>b.textContent==='关闭').click()`);
  await evaluate(`document.querySelectorAll('.teacher-member-list article')[1].querySelector('button').click()`);
  await waitFor(()=>evaluate(`Boolean(document.querySelector('.teacher-student-report-list'))`));
  assert.ok((await evaluate(`document.querySelector('.task-result-detail').textContent`)).includes('尚未测评'));
  await evaluate(`[...document.querySelectorAll('.task-result-detail footer button')].find(b=>b.textContent==='关闭').click();window.__failProfile=true;document.querySelector('.teacher-member-list article button').click()`);
  await waitFor(()=>evaluate(`Boolean(document.querySelector('.task-result-detail [role="alert"]'))`));
  await evaluate(`window.__failProfile=false;document.querySelector('.task-result-detail [role="alert"] button').click()`);
  await waitFor(()=>evaluate(`Boolean(document.querySelector('.teacher-student-report-list'))`));
  await evaluate(`[...document.querySelectorAll('.task-result-detail footer button')].find(b=>b.textContent==='关闭').click();window.__failStats=true`);
  await navigate('任务管理');
  await waitFor(async()=>JSON.stringify(await metrics())==='["2","1","加载失败","加载失败"]');
  assert.ok((await evaluate(`document.querySelector('.teacher-task-manage [role="alert"]').textContent`)).includes('统计服务暂时失败'));
  await evaluate(`window.__failStats=false;window.__zeroStats=true;document.querySelector('.teacher-task-manage [role="alert"] button').click()`);
  await waitFor(async()=>JSON.stringify(await metrics())==='["0","0","0","0%"]');
  console.log('PASS: task metrics and zero values, ended tasks, member levels, untested states, statistics/profile retry and route guards');
  await send('Browser.close');
} finally {socket?.close();chrome.kill()}
