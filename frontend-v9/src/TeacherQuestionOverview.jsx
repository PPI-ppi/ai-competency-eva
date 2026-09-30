import { ArrowRight, BookOpen, ClipboardCheck, Clock3, FileCheck2, Globe2, GraduationCap, HelpCircle, Layers3, MessageSquare, Send, Target, UsersRound, BarChart3 } from 'lucide-react';
import './teacher-question-overview.css';

const banks = [
  { name: '公开题库', icon: Globe2, desc: '平台共享资源', left: ['优质资源', '持续更新', '精选内容'], right: ['一键引入', '加入私人题库', '快速使用'] },
  { name: '我的私人题库', icon: ClipboardCheck, desc: '个人资源空间', left: ['专属资源', '自主管理', '随时调用'], right: ['整合分类', '灵活编辑', '优化内容'] },
  { name: '组织题库', icon: UsersRound, desc: '组织共享资源', left: ['教学共享', '高效管理', '统一资源'], right: ['组织训练', '发布任务', '跟踪进度'] },
];
const steps = [
  { title: '选择题库', subtitle: '从题库中选择合适的训练资源', items: [[Globe2, '公开题库'], [ClipboardCheck, '私人题库'], [UsersRound, '组织题库']] },
  { title: '配置任务', subtitle: '设置任务详细信息', items: [[UsersRound, '选择发布组织'], [Target, '选择能力维度'], [BarChart3, '选择任务难度'], [FileCheck2, '填写评分提示词']] },
  { title: '发布任务', subtitle: '确认并发布任务', items: [[FileCheck2, '生成训练任务'], [MessageSquare, '发送通知提醒'], [GraduationCap, '学生开始训练']] },
  { title: '学生完成', subtitle: '学生完成任务后', items: [[ClipboardCheck, '查看完成进度'], [BarChart3, '分析训练结果'], [FileCheck2, '生成智能报告']] },
];

export default function TeacherQuestionOverview({ onBank, onPublish, classes = [] }) {
  return <section className="tqo">
    <header className="tqo-heading"><div><h2>出题中心</h2><p>管理教学资源，创建个性化 AI 能力训练任务</p></div><Send aria-hidden="true"/></header>
    <div className="tqo-entries">
      <article className="tqo-entry">
        <div className="tqo-entry-top"><div><h3>题库管理</h3><p>浏览、整理和管理 AI 训练资源</p><button onClick={onBank}>进入题库 <ArrowRight/></button></div><div className="tqo-book-art" aria-hidden="true"><BookOpen/><i/><i/></div></div>
        <div className="tqo-features">{banks.map(({name, icon: Icon, desc})=><div key={name}><b><Icon/>{name}</b><span>{desc}</span></div>)}</div>
      </article>
      <article className="tqo-entry tqo-publish">
        <div className="tqo-entry-top"><div><h3>发布任务</h3><p>从题库选择内容，快速创建训练任务</p><button onClick={onPublish}>创建任务 <ArrowRight/></button></div><div className="tqo-plane-art" aria-hidden="true"><Send/><i/></div></div>
        <div className="tqo-features">{[[Target,'维度选择','能力方向设置'],[BarChart3,'难度设置','匹配学生水平'],[UsersRound,'组织发布','选择发布范围'],[Clock3,'时间管理','设置任务周期']].map(([Icon,name,desc])=><div key={name}><b><Icon/>{name}</b><span>{desc}</span></div>)}</div>
      </article>
    </div>
    <div className="tqo-flows">
      <section className="tqo-flow"><header><h3>题库资源流转图 <HelpCircle/></h3><span>使用指南</span></header>
        <div className="tqo-bank-flow">{banks.map(({name,icon:Icon,desc,left,right},index)=><div className={`tqo-bank-stage stage-${index}`} key={name}>
          <aside><b>{left[0]}</b><span>{left[1]}</span><span>{left[2]}</span></aside><div className="tqo-bank-node"><Icon/><b>{name}</b><span>{desc}</span></div><aside><b>{right[0]}</b><span>{right[1]}</span><span>{right[2]}</span></aside>
          {index<2&&<small className="tqo-bank-connector">{index===0?'引入 / 收藏':'分享 / 发布'}<span>↓</span></small>}
        </div>)}</div>
        <div className="tqo-class-targets">{classes.length ? classes.slice(0,3).map(c=><span key={c.id||c.name}><b>{c.name}</b><small>{c.students ?? 0} 人</small></span>) : <span className="tqo-no-classes"><UsersRound/>关联组织后，可向组织共享题目</span>}</div>
      </section>
      <section className="tqo-flow"><header><h3>任务发布流程图 <HelpCircle/></h3><span>使用指南</span></header>
        <div className="tqo-task-flow">{steps.map(({title,subtitle,items},index)=><article className={`tqo-task-step step-${index}`} key={title}>
          <div className="tqo-step-title"><b>0{index+1}</b><div><h4>{title}</h4><p>{subtitle}</p></div></div>
          <div className="tqo-step-items">{items.map(([Icon,label])=><span key={label}><Icon/>{label}</span>)}</div>
        </article>)}</div>
      </section>
    </div>
  </section>;
}
