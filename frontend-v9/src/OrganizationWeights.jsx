import React,{useId} from 'react';
import {pointKey,weightSummary} from './organizationWeights';
import {pointGroups,pointParts,TOOL_DIMENSION} from './assessmentTaxonomy';

export default function OrganizationWeights({taxonomy,value,onChange,disabled=false,error='',onRetry}) {
  const id=useId(),summary=weightSummary(value);
  const toggle=(dimension,name)=>{
    const key=pointKey(dimension,name);
    onChange(value.some(row=>pointKey(row.dimension,row.assessmentPoint)===key)
      ?value.filter(row=>pointKey(row.dimension,row.assessmentPoint)!==key)
      :[...value,{dimension,assessmentPoint:name,weight:''}]);
  };
  return <section className="organization-weights" aria-labelledby={`${id}-title`}>
    <header><h2 id={`${id}-title`}>考察点与权重</h2><p>按维度查看考察点，勾选后填写 0–10 的整数权重。权重无需合计为 100，评分时系统会自动归一化。</p></header>
    {!taxonomy.length&&(error?<p role="alert">{error} <button type="button" onClick={onRetry}>重新加载考察点</button></p>:<p role="status">正在加载考察点…</p>)}
    <div className="organization-weight-groups">
      {[0,1].map(column=><div className="organization-weight-column" key={column}>{taxonomy.map((group,groupIndex)=>({group,groupIndex})).filter(({groupIndex})=>groupIndex%2===column).map(({group,groupIndex})=><fieldset disabled={disabled} key={group.dimension}>
        <legend>{group.dimension}</legend>
        {pointGroups([group],[group.dimension],value.map(row=>row.assessmentPoint)).map(section=><section className="organization-weight-scene" key={section.title}>
        {group.dimension===TOOL_DIMENSION&&<h4>{section.title}</h4>}
        {section.points.map((point,index)=>{
          const name=point.name||point,key=pointKey(group.dimension,name),row=value.find(item=>pointKey(item.dimension,item.assessmentPoint)===key);
          const inputId=`${id}-${groupIndex}-${section.title}-${index}`;
          return <div className={`organization-weight-row${row?' selected':''}`} key={key}>
            <label className="organization-point-choice"><input type="checkbox" disabled={point.available===false} title={point.available===false?"暂未接入":undefined} aria-label={name} checked={Boolean(row)} onChange={()=>toggle(group.dimension,name)}/><span>{pointParts(name).baseName}</span></label>
            {row&&<div className="organization-point-weight"><label htmlFor={inputId}>权重</label><input id={inputId} aria-label={`${name}权重`} type="number" inputMode="numeric" min="0" max="10" step="1" required value={row.weight} onChange={event=>onChange(value.map(item=>pointKey(item.dimension,item.assessmentPoint)===key?{...item,weight:event.target.value}:item))}/><span>/10</span></div>}
          </div>;
        })}</section>)}
      </fieldset>)}</div>)}
    </div>
    <p className={`organization-weight-total${summary.valid?' valid':''}`} role="status" aria-live="polite">已选 {value.length} 个考察点，原始权重合计 {summary.total}{summary.valid?'，可以保存':'，请为每项填写 0–10 整数'}</p>
  </section>;
}
