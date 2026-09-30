// 组织考察点权重：管理员为每个已选考察点填写 0-10 的整数。
// 不要求权重总和等于 100；评分时由后端按实际参与评分的考察点归一化。
export function weightValue(value) {
  const text=String(value ?? '').trim();
  if(!/^\d+$/.test(text))return null;
  const weight=Number(text);
  return Number.isSafeInteger(weight)&&weight>=0&&weight<=10?weight:null;
}
export const pointKey=(dimension,name)=>JSON.stringify([dimension,name]);
export function weightSummary(rows) {
  const values=rows.map(row=>weightValue(row.weight));
  const total=values.reduce((sum,value)=>sum+(value??0),0);
  const unique=new Set(rows.map(row=>pointKey(row.dimension,row.assessmentPoint))).size===rows.length;
  return {total,valid:rows.length>0&&unique&&values.every(value=>value!==null)};
}
// 后端契约是 Map<考察点名, 0-10整数>。
export function weightPayload(rows) {
  if(!weightSummary(rows).valid)throw new Error('请选择考察点，并为每个考察点填写 0-10 的整数权重');
  return Object.fromEntries(rows.map(({assessmentPoint,weight})=>[assessmentPoint,weightValue(weight)]));
}
export function readWeights(value) {
  if(Array.isArray(value))return value;
  let parsed=value;
  if(typeof value==='string'){try{parsed=JSON.parse(value)}catch{return []}}
  if(parsed&&typeof parsed==='object')return Object.entries(parsed).map(([assessmentPoint,weight])=>({dimension:'',assessmentPoint,weight}));
  return [];
}
