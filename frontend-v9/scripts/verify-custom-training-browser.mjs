// Local fixture-based browser QA. Run Vite on 4173; override CHROME_BIN if needed.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = fileURLToPath(new URL('..', import.meta.url));
const output = path.join(root, '.typography-qa', 'custom-training');
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
    window.__requests=[];window.__fail=true;
    const originalFetch=window.fetch;
    window.fetch=async(url,options={})=>{
      const path=new URL(url,location.origin).pathname;
      if(!path.startsWith('/api/'))return originalFetch(url,options);
      let data=[];
      if(path==='/api/questions/taxonomy')data=[
  {
    "dimension": "AI基础认知",
    "points": [
      {
        "name": "AI基本概念理解"
      },
      {
        "name": "数据影响AI输出的认知"
      },
      {
        "name": "AI决策的基本逻辑"
      },
      {
        "name": "AI发展历程认知"
      },
      {
        "name": "AI能力边界认知"
      },
      {
        "name": "AI社会影响认知"
      },
      {
        "name": "批判性看待AI"
      }
    ]
  },
  {
    "dimension": "提示词工程",
    "points": [
      {
        "name": "提示词书写"
      }
    ]
  },
  {
    "dimension": "AI工具使用",
    "points": [
      {
        "name": "工具选型及局限性认知"
      },
      {
        "name": "工具使用能力"
      },
      {
        "name": "工作流整合"
      },
      {
        "name": "智能体编排"
      }
    ]
  },
  {
    "dimension": "AI结果评估与优化",
    "points": [
      {
        "name": "评估AI结果"
      },
      {
        "name": "优化AI结果"
      }
    ]
  },
  {
    "dimension": "人机协同解决问题",
    "points": [
      {
        "name": "与AI协作解决问题"
      }
    ]
  },
  {
    "dimension": "AI伦理与合规",
    "points": [
      {
        "name": "隐私保护意识"
      },
      {
        "name": "合规意识"
      },
      {
        "name": "偏见及有害内容识别"
      },
      {
        "name": "版权与知识产权认知"
      },
      {
        "name": "问责意识"
      }
    ]
  }
];
      if(path==='/api/training/start'){window.__requests.push(JSON.parse(options.body));if(window.__fail){window.__fail=false;return new Response(JSON.stringify({code:400,message:'组织训练题库暂无匹配题目'}),{status:400,headers:{'Content-Type':'application/json'}});}data={id:77};}
      if(path==='/api/users/me')data={id:42,name:'测试学生',stats:{}};
      if(path==='/api/classes/joined')data=[{id:99,name:'测试组织'}];
      if(path==='/api/classes/99/self-assessments/start')data={id:77};
      if(path==='/api/assessments/77/conversation')data={question:{id:7,type:'DIALOGUE',title:'AI 基础概念',content:'以下哪一项描述正确？',options:[]},questions:[]};
      if(path==='/api/assessments/77/chat/stream'){
        window.__submitted.push(JSON.parse(options.body).content);
        return new Response('event: done\ndata: {}\n\n',{headers:{'Content-Type':'text/event-stream'}});
      }
      return new Response(JSON.stringify({code:0,data}),{headers:{'Content-Type':'application/json'}});
    };
  `});
  await send('Page.navigate',{url:'http://127.0.0.1:4173/ripple-ai-assessment/'});
  await waitFor(()=>evaluate(`Boolean(document.querySelector('.portal-primary'))`));
  await evaluate(`[...document.querySelectorAll('.portal-primary button')].find(b=>b.title==='训练场').click()`);
  await waitFor(()=>evaluate(`Boolean(document.querySelector('.training-ticket.t1 .ticket-action'))`));
  await evaluate(`document.querySelector('.training-ticket.t1 .ticket-action').click()`);
  await waitFor(()=>evaluate(`document.querySelectorAll('.custom-training-form fieldset').length===3`));
  assert.equal(await evaluate(`document.querySelector('.custom-training-form button[type=submit]').disabled`),true);
  const click=label=>evaluate(`[...document.querySelectorAll('.custom-training-form button')].find(b=>b.textContent===${JSON.stringify(label)}||b.getAttribute('aria-label')===${JSON.stringify(label)}).click()`);
  await click('提示词工程');await click('提示词书写');
  await click('提示词工程');
  await click('AI基础认知');await click('AI基本概念理解');await click('对话题');
  assert.equal(await evaluate(`document.querySelector('.custom-training-form button[type=submit]').disabled`),false);
  await evaluate(`(()=>{const field=document.querySelector('.custom-training-form select');field.value='3';field.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  const shot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(output,'task-style-form.png'),Buffer.from(shot.data,'base64'));
  await evaluate(`document.querySelector('.custom-training-form button[type=submit]').click()`);
  await waitFor(()=>evaluate(`Boolean(document.querySelector('.custom-training-form .form-error'))`));
  assert.ok(await evaluate(`document.querySelector('.custom-training-form .form-error').textContent.includes('暂无匹配')`));
  assert.equal(await evaluate(`[...document.querySelectorAll('.custom-training-form button')].find(b=>b.getAttribute('aria-label')==='AI基本概念理解').getAttribute('aria-pressed')`),'true');
  await evaluate(`document.querySelector('.custom-training-form button[type=submit]').click()`);
  await waitFor(()=>evaluate(`Boolean(document.querySelector('.agent-workbench'))`));
  const requests=await evaluate(`window.__requests`);
  assert.equal(requests.length,2);
  assert.deepEqual(requests[1],{dimensions:['AI基础认知'],assessmentPoints:['AI基本概念理解'],modes:['DIALOGUE'],difficulty:3,questionCount:10,classId:99});
  assert.equal(await evaluate(`document.querySelector('.custom-training-form')===null`),true);
  console.log('PASS: task-style form, required points, dimension removal clears points, error retains choices, selected config reaches training API and session');

} finally {socket?.close();chrome.kill()}
