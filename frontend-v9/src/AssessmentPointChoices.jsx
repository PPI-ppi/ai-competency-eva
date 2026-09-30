import React from 'react';
import {pointGroups,pointParts,pointDisplay} from './assessmentTaxonomy';

export default function AssessmentPointChoices({taxonomy,dimensions,value,onToggle}) {
  return <div className="assessment-point-groups">
    {taxonomy.some(group=>dimensions.includes(group.dimension)&&group.points.some(point=>point.available===false))&&<small role="status">部分场景考察点暂未接入，接入后可选择。</small>}
    {!dimensions.length&&<small>请先选择能力维度</small>}
    {pointGroups(taxonomy,dimensions,value).map(group=><section className="assessment-point-group" key={group.title} aria-label={group.title}>
      <h4>{group.title}</h4><div>{group.points.map(point=>{
        const {name,baseName,scenario}=pointParts(point);
        return <button type="button" disabled={point.available===false} title={point.available===false?"暂未接入":undefined} key={name} aria-label={name} aria-pressed={value.includes(name)} className={value.includes(name)?'active':''} onClick={()=>onToggle(name)}>{scenario?baseName:pointDisplay(name)}</button>;
      })}</div>
    </section>)}
  </div>;
}
