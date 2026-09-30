export const TOOL_DIMENSION='AI工具使用';
export const TOOL_SCENARIOS=['文本写作','图像生成','视频制作','音频处理','设计辅助','办公与写作','编程开发','数据分析与商业智能'];
export const TOOL_POINTS=['工具选型及局限性认知','工具使用能力','工作流整合','智能体编排'];
export function pointParts(value) {
  const name=typeof value==='string'?value:value.name;
  for(const scenario of TOOL_SCENARIOS) {
    const suffix=`-${scenario}`;
    if(name.endsWith(suffix)&&TOOL_POINTS.includes(name.slice(0,-suffix.length)))return {name,baseName:name.slice(0,-suffix.length),scenario};
  }
  return {name,baseName:name,scenario:''};
}
export const pointDisplay=name=>TOOL_POINTS.includes(name)?`${name}（未区分场景）`:name;
export function expandTaxonomy(groups) {
  return groups.map(group=>{
    if(group.dimension!==TOOL_DIMENSION)return group;
    const original=(group.points||[]).map(point=>typeof point==='string'?{name:point}:point);
    return {...group,points:[...original.filter(point=>TOOL_POINTS.includes(point.name)),...TOOL_SCENARIOS.flatMap(scenario=>TOOL_POINTS.map(baseName=>{
      const name=`${baseName}-${scenario}`,existing=original.find(point=>point.name===name);
      const base=original.find(point=>point.name===baseName);
      const lines=(base?.description||'').split('\n');
      const description=lines.find(line=>line.startsWith(`${scenario}：`))?.slice(scenario.length+1)||base?.description||'';
      return {...(existing||{description}),name,baseName,scenario,available:existing?.available!==false&&Boolean(existing)};
    }))]};
  });
}
export function pointGroups(taxonomy,dimensions,selected=[]) {
  return taxonomy.filter(group=>dimensions.includes(group.dimension)).flatMap(group=>{
    if(group.dimension!==TOOL_DIMENSION)return [{title:group.dimension,points:group.points||[]}];
    const groups=TOOL_SCENARIOS.map(scenario=>({title:scenario,points:(group.points||[]).filter(point=>pointParts(point).scenario===scenario)}));
    const legacy=[...new Set([...(group.points||[]).map(point=>point.name||point).filter(name=>TOOL_POINTS.includes(name)),...selected.filter(name=>TOOL_POINTS.includes(name))])];
    if(legacy.length)groups.push({title:'原有考察点（未区分场景）',points:legacy.map(name=>({name}))});
    return groups.filter(item=>item.points.length);
  });
}
export function filterQuestions(questions,{query='',dimension='',point=''}={}) {
  const keyword=query.trim().toLowerCase();
  return questions.filter(question=>(!dimension||(question.tags||[]).includes(dimension))&&(!point||(question.assessmentPoints||[]).includes(point))&&[question.title,question.content,...(question.tags||[]),...(question.assessmentPoints||[])].join(' ').toLowerCase().includes(keyword));
}
export function filterOptions(taxonomy,questions,dimension='') {
  return {
    dimensions:[...new Set([...taxonomy.map(group=>group.dimension),...questions.flatMap(question=>question.tags||[])])],
    points:[...new Set([...taxonomy.filter(group=>!dimension||group.dimension===dimension).flatMap(group=>(group.points||[]).map(point=>point.name||point)),...questions.filter(question=>!dimension||(question.tags||[]).includes(dimension)).flatMap(question=>question.assessmentPoints||[])])],
  };
}
