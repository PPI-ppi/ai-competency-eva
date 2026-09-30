import routes from './zip-backend-routes.json';

// This frontend targets the backend-java tree supplied in ai-competency-eva-master.zip.
const matchers=routes.map(route=>({method:route.method,pattern:new RegExp('^'+route.path.replace(/\{[^}]+\}/g,'[^/]+')+'$')}));
export function supportsZipRoute(method,path) {
  const pathname=new URL(path,'http://local').pathname;
  return matchers.some(route=>route.method===method.toUpperCase()&&route.pattern.test(pathname));
}
export function normalizeConversation(data={}) {
  const finished=Boolean(data.finished)||['completed','completed_with_scoring_failure'].includes(data.assessment?.status);
  return {...data,finished,currentQuestion:data.question??data.currentQuestion??null};
}
export function streamUpdate(kind,data) {
  if(kind==='question')return {question:data,currentQuestion:data};
  if(kind==='finished')return {finished:true};
  return kind==='state'?data:null;
}
export function normalizeZipReport(data={}) {
  return {...data.assessment,...data,dimensions:Array.isArray(data.dimensions)?data.dimensions:[],
    title:data.title||data.task?.title||data.assessment?.taskTitle};
}
