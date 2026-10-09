import React, {useEffect,useState} from "react";
import {createPortal} from "react-dom";
import {X} from "lucide-react";
import AssessmentPointChoices from "./AssessmentPointChoices.jsx";
import {teacherData} from "./services/portalServices";

export default function CustomTrainingModal({onClose,onStart}) {
  const [taxonomy,setTaxonomy]=useState([]),[loading,setLoading]=useState(true),[loadError,setLoadError]=useState("");
  const [form,setForm]=useState({dimensions:[],assessmentPoints:[],modes:[],difficulty:"",questionCount:10});
  const [busy,setBusy]=useState(false),[error,setError]=useState("");
  const load=async()=>{setLoading(true);setLoadError("");try{setTaxonomy(await teacherData.taxonomy());}catch(err){setLoadError(err.message||"考察点加载失败");}finally{setLoading(false);}};
  useEffect(()=>{load();},[]);
  const toggle=(key,value)=>setForm(current=>{
    const values=current[key].includes(value)?current[key].filter(item=>item!==value):[...current[key],value];
    if(key!=="dimensions")return {...current,[key]:values};
    const allowed=taxonomy.filter(group=>values.includes(group.dimension)).flatMap(group=>group.points.map(point=>point.name||point));
    return {...current,dimensions:values,assessmentPoints:current.assessmentPoints.filter(point=>allowed.includes(point))};
  });
  const ready=!loading&&!loadError&&form.dimensions.length>0&&form.assessmentPoints.length>0&&form.modes.length>0;
  const start=async event=>{event.preventDefault();if(!ready||busy)return;setBusy(true);setError("");try{await onStart({...form,difficulty:form.difficulty?Number(form.difficulty):null});}catch(err){setError(err.message||"创建训练失败");}finally{setBusy(false);}};
  return createPortal(<div className="task-dialog-backdrop" onMouseDown={event=>event.target===event.currentTarget&&!busy&&onClose()}>
    <form className="task-publish-dialog custom-training-form" onSubmit={start} role="dialog" aria-modal="true" aria-labelledby="custom-training-title">
      <header><div><h2 id="custom-training-title">自定义训练</h2><p>从当前组织训练题库选择题目，创建你的专属训练计划。</p></div><button type="button" disabled={busy} onClick={onClose} aria-label="关闭自定义训练"><X/></button></header>
      {loading?<p role="status">正在加载能力维度与考察点…</p>:loadError?<div role="alert"><p>{loadError}</p><button type="button" onClick={load}>重新加载</button></div>:<>
        <fieldset disabled={busy}><legend>能力维度 <b>*</b></legend><div>{taxonomy.map(group=><button type="button" aria-pressed={form.dimensions.includes(group.dimension)} className={form.dimensions.includes(group.dimension)?"active":""} onClick={()=>toggle("dimensions",group.dimension)} key={group.dimension}>{group.dimension}</button>)}</div></fieldset>
        <fieldset disabled={busy}><legend>考察点 <b>*</b></legend><AssessmentPointChoices taxonomy={taxonomy} dimensions={form.dimensions} value={form.assessmentPoints} onToggle={name=>toggle("assessmentPoints",name)}/></fieldset>
        <fieldset disabled={busy}><legend>训练模式 <b>*</b></legend><div>{[["DIALOGUE","对话题"],["PRACTICAL","实操题"],["OBJECTIVE","客观题"]].map(([value,label])=><button type="button" key={value} aria-pressed={form.modes.includes(value)} className={form.modes.includes(value)?"active":""} onClick={()=>toggle("modes",value)}>{label}</button>)}</div></fieldset>
        <label>训练难度<select disabled={busy} value={form.difficulty} onChange={event=>setForm({...form,difficulty:event.target.value})}><option value="">自动匹配</option>{[1,2,3,4,5].map(value=><option key={value} value={value}>L{value}</option>)}</select></label>
        <label>题量上限<select disabled={busy} value={form.questionCount} onChange={event=>setForm({...form,questionCount:Number(event.target.value)})}>{[5,10,20,0].map(value=><option key={value} value={value}>{value?`${value} 题`:"不限"}</option>)}</select></label>
      </>}
      {error&&<p className="form-error" role="alert">{error}</p>}
      <footer><button type="button" disabled={busy} onClick={onClose}>取消</button><button className="primary" type="submit" disabled={!ready||busy}>{busy?"正在创建…":"开始训练"}</button></footer>
    </form>
  </div>,document.body);
}
