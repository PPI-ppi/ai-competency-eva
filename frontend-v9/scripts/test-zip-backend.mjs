// Run with node --experimental-vm-modules scripts/test-zip-backend.mjs.
// Exercises the real frontend adapters with HTTP/SSE responses matching the supplied ZIP.
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../src/',import.meta.url));
const calls=[];let responseData={},events=[];
const storage=new Map();
const context=vm.createContext({console,URL,AbortController,FormData,setTimeout,clearTimeout,
  window:{location:{origin:'http://local'}},
  localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
  fetch:async(url,options)=>{calls.push({url:String(url),...options,body:options.body?JSON.parse(options.body):null});return {ok:true,status:200,headers:{get:()=> 'application/json'},json:async()=>({code:0,data:responseData})}}});
const cache=new Map();
async function moduleAt(filename){
  if(cache.has(filename))return cache.get(filename);
  let mod;
  if(filename.endsWith('.json'))mod=new vm.SyntheticModule(['default'],function(){this.setExport('default',JSON.parse(fs.readFileSync(filename,'utf8')))},{context});
  else mod=new vm.SourceTextModule(fs.readFileSync(filename,'utf8'),{context,identifier:filename,initializeImportMeta:meta=>{meta.env={}}});
  cache.set(filename,mod);
  await mod.link(async(specifier,parent)=>{
    if(specifier==='@microsoft/fetch-event-source')return new vm.SyntheticModule(['fetchEventSource'],function(){this.setExport('fetchEventSource',async(url,options)=>{calls.push({url,method:options.method,body:JSON.parse(options.body)});for(const event of events)options.onmessage(event);options.onclose()})},{context});
    let target=path.resolve(path.dirname(parent.identifier),specifier);
    if(!fs.existsSync(target))target+='.js';
    return moduleAt(target);
  });return mod;
}
async function load(name){const mod=await moduleAt(path.join(root,name));if(mod.status!=='evaluated')await mod.evaluate();return mod.namespace;}
const {teacherData,studentData}=await load('services/portalServices.js');
const {assessmentApi,sendAssessmentChat,authApi}=await load('api/services.js');
const {supportsZipRoute,normalizeConversation}=await load('api/zipBackendContract.js');
assert.equal(supportsZipRoute('POST','/api/questions/3/generate-similar'),false);
assert.equal(supportsZipRoute('GET','/api/classes/weight-support'),true);
responseData={tokenName:'satoken',tokenValue:'test-token'};
await authApi.login('姓名','password','teacher','account-name');
assert.equal(calls.at(-1).body.account,'account-name');
responseData={id:8};calls.length=0;
await teacherData.copyPublicQuestion(7);
assert.equal(calls.length,1);assert.ok(calls[0].url.endsWith('/api/questions/public/7/copy'));
assert.equal(calls[0].headers.satoken,'test-token');
await teacherData.createTask(2,{title:'任务',questionCount:1,deadlineAt:'ignored',dimensions:['AI基础认知'],assessmentPoints:['AI基本概念理解']});
assert.ok(calls.at(-1).url.endsWith('/api/classes/2/assessment-tasks'));
assert.equal(calls.at(-1).body.questionCount,1);assert.equal('deadlineAt' in calls.at(-1).body,false);
responseData={supported:true,field:'pointWeights',version:1};
assert.equal((await teacherData.creationOptions()).assessmentPointWeights,false);
const before=calls.length;
await assert.rejects(()=>studentData.startTraining({skills:['AI工具使用']}));
await assert.rejects(()=>teacherData.endTask(1));
assert.equal(calls.length,before,'unsupported operations must not make network requests');
responseData={assessment:{status:'completed',averageScore:71,abilityLevel:'L3'},dimensions:[{dimensionName:'AI基础认知',score:71}]};
assert.equal((await assessmentApi.result(2)).averageScore,71);
assert.equal(normalizeConversation({assessment:{status:'completed'},question:null}).finished,true);
events=[{event:'delta',data:JSON.stringify({text:'你好'})},{event:'question',data:JSON.stringify({id:9,content:'下一题'})},{event:'finished',data:'{}'},{event:'done',data:'{}'}];
let text='',question,finished=false,done=0;
await sendAssessmentChat(2,'作答',{onDelta:t=>text+=t,onState:update=>{question=update.question||question;finished=update.finished||finished},onDone:()=>done++});
assert.equal(text,'你好');assert.equal(question.id,9);assert.equal(finished,true);assert.equal(done,1);
events=[{event:'delta',data:'{"text":"中断"}'}];
await assert.rejects(()=>sendAssessmentChat(2,'作答'));
responseData=[{id:17,sourceQuestionId:7,classId:2,assessmentPoints:'["AI基本概念理解"]',tags:'["AI基础认知"]'}];
const training=await teacherData.classifiedClassQuestions(2,'TRAINING');
assert.equal(training[0].sourceQuestionId,7);assert.deepEqual([...training[0].assessmentPoints],['AI基本概念理解']);
assert.ok(calls.at(-1).url.endsWith('/api/classes/2/question-banks/TRAINING/questions'));
responseData={id:17};await teacherData.generateTrainingQuestion(2,7);
assert.ok(calls.at(-1).url.endsWith('/api/classes/2/questions/7/generate-training'));
await teacherData.removeClassifiedQuestion(2,'TRAINING',17);
assert.equal(calls.at(-1).method,'DELETE');
assert.ok(calls.at(-1).url.endsWith('/api/classes/2/question-banks/TRAINING/questions/17'));
console.log('PASS: ZIP routes, auth headers, private copy, task payload, unsupported guards, report mapping and SSE lifecycle');
