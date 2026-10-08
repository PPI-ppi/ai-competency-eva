import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./styles.css";
import {questionPresentation,isQuestionCopied,readQuestionCopies,saveQuestionCopies} from "./questionBank";
import {reportSortOptions,sortHistoryReports} from "./reportSorting";
import AssessmentPointChoices from "./AssessmentPointChoices.jsx";
import QuestionDetailDialog from "./QuestionDetailDialog.jsx";
import {expandTaxonomy,filterQuestions,filterOptions,pointDisplay,TOOL_DIMENSION,TOOL_POINTS} from "./assessmentTaxonomy";
import OrganizationWeights from "./OrganizationWeights.jsx";
import {weightSummary,weightPayload,readWeights} from "./organizationWeights";
import "./organization.css";
import {
  ArrowRight, BadgeCheck, BarChart3, BookOpen, Bot, BrainCircuit,
  Check, ChevronRight, CircleUserRound, Clock3, Code2, Compass,
  FileCheck2, Gauge, GraduationCap, HelpCircle, History, Home,
  Image, Layers3, Leaf, LibraryBig, LockKeyhole, LogOut, Menu,
  MessageCircleMore, Play, Route, ShieldCheck, Sparkles, Target,
  Trophy, UserRound, UsersRound, X, Zap, Search, Bell, Settings,
  ClipboardList, PanelLeftClose, PanelLeftOpen, ChevronLeft, CalendarDays, Crown, Wrench
  , Building2, School, Database, Plus, Edit3, Trash2, Eye, IdCard, BriefcaseBusiness
} from "lucide-react";
import {
  Area, AreaChart, CartesianGrid, PolarAngleAxis, PolarGrid,
  Radar, RadarChart, ResponsiveContainer, Tooltip, XAxis, YAxis
} from "recharts";
import { API_BASE_URL, clearAuthToken } from "./api/client";
import {normalizeConversation} from "./api/zipBackendContract";
import { agentApi, assessmentApi, authApi, classApi, questionApi, sendAssessmentChat, sendAssessmentPlainChat, userApi } from "./api/services";
import { normalizeQuestion, studentData, teacherData } from "./services/portalServices";

const recordClassId = row => row?.classId ?? row?.class?.id ?? row?.classroomId ?? row?.assessment?.classId ?? row?.task?.classId ?? row?.assessmentTask?.classId;
const belongsToClass = (row, classId) => Boolean(classId) && String(recordClassId(row) ?? "") === String(classId);

const dimensions = [
  { name: "基础认知", score: 0, icon: BrainCircuit },
  { name: "提示词工程", score: 0, icon: MessageCircleMore },
  { name: "工具使用", score: 0, icon: Layers3 },
  { name: "结果评估", score: 0, icon: FileCheck2 },
  { name: "人机协同", score: 0, icon: Bot },
  { name: "伦理合规", score: 0, icon: ShieldCheck },
];

const recent = [];

const emptyStats = { assessments:0, trainings:0, tasks:0, minutes:0, score:0, badges:0, streak:0 };
const abilityLevelFromScore=score=>score==null?"L0":score>=90?"L5":score>=80?"L4":score>=70?"L3":score>=60?"L2":"L1";
const UserContext = createContext(null);
const useCurrentUser = () => useContext(UserContext);
const readStoredUser = () => {
  try { return JSON.parse(sessionStorage.getItem("ripple-user")) || null; }
  catch { return null; }
};

function RippleCanvas() {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas.getContext("2d");
    let frame = 0, ripples = [], drops = [], last = 0;
    const resize = () => {
      const dpr = Math.min(devicePixelRatio || 1, 2);
      canvas.width = innerWidth * dpr; canvas.height = innerHeight * dpr;
      canvas.style.width = innerWidth + "px"; canvas.style.height = innerHeight + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const addDrop = (x = innerWidth * (.15 + Math.random() * .7), y = -20) => {
      drops.push({ x, y, vy: 2 + Math.random() * 1.4, r: 3 + Math.random() * 2 });
    };
    const click = e => {
      ripples.push({ x: e.clientX, y: e.clientY, r: 5, a: .65 });
    };
    const draw = t => {
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      if (t - last > 1250) { addDrop(); last = t; }
      drops.forEach((d, i) => {
        d.vy += .025; d.y += d.vy;
        const g = ctx.createLinearGradient(d.x, d.y - 14, d.x, d.y + 6);
        g.addColorStop(0, "rgba(255,255,255,0)");
        g.addColorStop(1, "rgba(255,255,255,.72)");
        ctx.beginPath(); ctx.moveTo(d.x, d.y - 13); ctx.bezierCurveTo(d.x-6,d.y-2,d.x-5,d.y+5,d.x,d.y+7);
        ctx.bezierCurveTo(d.x+5,d.y+5,d.x+6,d.y-2,d.x,d.y-13); ctx.fillStyle=g; ctx.fill();
        const lakeY = innerHeight * .74;
        if (d.y > lakeY) { ripples.push({x:d.x,y:lakeY,r:4,a:.8}); drops.splice(i,1); }
      });
      ripples.forEach((p,i) => {
        p.r += 1.25; p.a *= .983;
        for (let ring=0; ring<3; ring++) {
          ctx.beginPath(); ctx.ellipse(p.x,p.y,p.r+ring*17,(p.r+ring*17)*.25,0,0,Math.PI*2);
          ctx.strokeStyle=`rgba(255,255,255,${p.a/(ring+1)})`; ctx.lineWidth=1.2; ctx.stroke();
        }
        if(p.a<.025) ripples.splice(i,1);
      });
      frame = requestAnimationFrame(draw);
    };
    resize(); addEventListener("resize", resize); addEventListener("pointerdown", click);
    frame=requestAnimationFrame(draw);
    return()=>{cancelAnimationFrame(frame);removeEventListener("resize",resize);removeEventListener("pointerdown",click)};
  }, []);
  return <canvas ref={ref} className="ripple-canvas" aria-hidden="true" />;
}

function Brand({ dark=false }) {
  return <div className={`brand ${dark?"dark":""}`}><span className="brand-mark"><span/></span><b>智测经纬</b><small>AI 能力测评</small></div>;
}

function LandingV2({ onLogin }) {
  const [activeSection, setActiveSection] = useState("home");
  const [slide, setSlide] = useState(0);
  const sections = [
    ["home", "首页"], ["overview", "多维题库"], ["profile", "能力画像"],
    ["interaction", "师生互动"], ["rich-modes", "模式丰富"], ["about-us", "关于我们"],
  ];
  const slides = [
    { id:"overview", en:"multi-dimensional question bank", title:"多维题库", text:"覆盖多项 AI 能力维度，构建精准测评体系", image:"/ripple-ai-assessment/landing/feature-bank-v2.png" },
    { id:"profile", en:"competency profile", title:"能力画像", text:"多维能力分析，呈现 AI 技能优势与短板", image:"/ripple-ai-assessment/landing/feature-profile-v2.png" },
    { id:"interaction", en:"teacher-student interaction", title:"师生互动", text:"兼顾任务发布与成长反馈，实现高效协同", image:"/ripple-ai-assessment/landing/feature-interaction-v2.png" },
  ];

  useEffect(() => {
    const observed = [["home","home"],["feature-overview",slides[slide].id],["rich-modes","rich-modes"],["about-us","about-us"]];
    const observers = observed.map(([elementId, activeId]) => {
      const element = document.getElementById(elementId);
      if (!element) return null;
      const observer = new IntersectionObserver(([entry]) => {
        if (entry.isIntersecting) setActiveSection(activeId);
      }, { rootMargin:"-38% 0px -54%", threshold:0 });
      observer.observe(element);
      return observer;
    });
    return () => observers.forEach(observer => observer?.disconnect());
  }, [slide]);

  const go = id => {
    const index = slides.findIndex(item => item.id === id);
    if (index >= 0) {
      setSlide(index); setActiveSection(id);
      document.getElementById("feature-overview")?.scrollIntoView({behavior:"smooth",block:"start"});
      return;
    }
    document.getElementById(id)?.scrollIntoView({behavior:"smooth",block:"start"});
  };
  const changeSlide = direction => setSlide(current => {
    const next = (current + direction + slides.length) % slides.length;
    setActiveSection(slides[next].id);
    return next;
  });

  return <main className="landing-v2">
    <nav className="landing-v2-nav" aria-label="首页导航">
      {sections.map(([id,label]) => <button key={id} className={activeSection===id?"active":""} onClick={()=>go(id)}>{label}</button>)}
    </nav>
    <section id="home" className="landing-v2-hero landing-v2-bg">
      <div className="landing-v2-hero-copy">
        <h1>欢迎选择智测经纬</h1><h2>探索你的 AI 能力边界</h2>
        <p>基于多维能力模型，智能评估 AI 应用水平，生成个人能力画像，助力精准成长。</p>
        <div className="landing-v2-actions">
          <button className="landing-v2-black" onClick={onLogin}>立即体验 <ArrowRight size={20}/></button>
          <button className="landing-v2-yellow" onClick={()=>go("overview")}>了解平台详情 <ArrowRight size={20}/></button>
        </div>
        <div className="landing-v2-metrics">
          <article><Clock3/><strong>100+</strong><b>专业测评题库</b><small>覆盖 AI 认知、应用与协作等核心场景</small></article>
          <article><Gauge/><strong>6维</strong><b>AI 能力诊断</b><small>精准定位优势与提升方向</small></article>
        </div>
      </div>
    </section>
    <section id="feature-overview" className="landing-v2-carousel landing-v2-bg" aria-label="功能总览轮播">
      <header><h2>多元功能体系，构建完整 AI 成长闭环</h2><p>从能力评估到成长反馈，打造智能化学习体验</p></header>
      <div className="landing-v2-stage">
        <button className="carousel-arrow prev" onClick={()=>changeSlide(-1)} aria-label="上一项"><ChevronLeft/></button>
        {[-1,0,1].map(offset=>{const index=(slide+offset+slides.length)%slides.length;const item=slides[index];return <article key={`${item.id}-${offset}`} className={`feature-shot ${offset===0?"current":offset<0?"previous":"next"}`}><img src={item.image} alt={`${item.title}功能界面`}/></article>})}
        <button className="carousel-arrow next-arrow" onClick={()=>changeSlide(1)} aria-label="下一项"><ChevronRight/></button>
      </div>
      <div className="landing-v2-caption"><span>{slides[slide].en}</span><h3>{slides[slide].title}</h3><p>{slides[slide].text}</p></div>
      <div className="landing-v2-dots">{slides.map((item,index)=><button key={item.id} aria-label={`切换到${item.title}`} className={slide===index?"active":""} onClick={()=>{setSlide(index);setActiveSection(item.id)}}/>)}</div>
    </section>
    <section id="rich-modes" className="landing-v2-modes landing-v2-bg">
      <header><h2>功能丰富，满足多样化测评与学习需求</h2><p>多种核心功能覆盖测评、分析、学习、管理全流程，助力 AI 能力训练</p></header>
      <div className="mode-gallery">
        <article><CalendarDays/><h3>多维测评</h3><p>覆盖六大 AI 能力维度，智能体精准评估综合能力水平。</p></article>
        <article><BarChart3/><h3>能力成长趋势</h3><p>用可视化曲线记录每一次进步，掌握六维能力变化。</p></article>
        <article><Edit3/><h3>自定义出题</h3><p>自由选择维度、题型与难度，快速生成训练计划。</p></article>
        <article><MessageCircleMore/><h3>多种交互模式</h3><p>支持客观题、对话式测评与实操任务，贴近真实 AI 场景。</p></article>
        <article><UsersRound/><h3>创建题库</h3><p>管理员自主创建与管理题目，支持公开、私有和组织题库。</p></article>
        <article><FileCheck2/><h3>智能报告</h3><p>输出六维画像、文字解读与学习建议，形成完整成长闭环。</p></article>
      </div>
    </section>
    <section id="about-us" className="landing-v2-about landing-v2-bg">
      <span>ABOUT ZHICE JINGWEI</span><h2>让每个人都能看见自己的 AI 能力</h2>
      <p>智测经纬以科学、可信、可持续的方式连接测评、训练与反馈，让每一次学习都有迹可循。</p>
      <button onClick={onLogin}>立即开始 <ArrowRight size={19}/></button>
    </section>
  </main>;
}

const portalOptions = [
  {id:"student",name:"学生端",icon:GraduationCap,desc:"参加测评与训练，查看六维能力画像和成长报告",items:["测评中心","训练场","学习记录"]},
  {id:"teacher",name:"管理端",icon:School,desc:"管理题库与组织，组织学生完成训练任务",items:["题库管理","任务管理","我的组织"]},
];

function RoleSelect({onBack,onSelect}){
  return <main className="portal-select-page"><RippleCanvas/><div className="grain"/><button className="back" onClick={onBack}>← 返回首页</button><section className="portal-select-card"><Brand dark/><div className="portal-select-head"><span>CHOOSE YOUR PORTAL</span><h1>请选择使用端</h1><p>选择身份后进入对应的登录或注册流程</p></div><div className="portal-options">{portalOptions.map(({id,name,icon:Icon,desc,items})=><button key={id} onClick={()=>onSelect(id)}><i><Icon/></i><h2>{name}</h2><p>{desc}</p><footer>{items.map(x=><span key={x}>{x}</span>)}</footer><ArrowRight/></button>)}</div><small className="portal-note"><ShieldCheck/> 不同端的数据与权限相互隔离，登录后仍可由管理员调整角色</small></section></main>
}

function Login({ onBack, onSuccess, role="student" }) {
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mode,setMode]=useState("login");
  const [password,setPassword]=useState(""),[name,setName]=useState(""),[studentNo,setStudentNo]=useState(""),[phone,setPhone]=useState(""),[email,setEmail]=useState(""),[error,setError]=useState("");
  const portal=portalOptions.find(x=>x.id===role)||portalOptions[0];
  const PortalIcon=portal.icon;
  const resetFields=()=>{setName("");setStudentNo("");setPassword("");setPhone("");setEmail("");setError("")};
  const changeMode=next=>{setMode(next);resetFields()};
  const completeLogin=async(fallback,result)=>{
    let latest={...fallback,...(result?.user||{})};
    try{
      const profile=await userApi.me();
      if(profile)latest={...latest,...profile};
    }catch(_error){/* Some older backends do not expose /users/me yet. */}
    onSuccess(role,latest);
  };
  const submit=async event=>{
    event.preventDefault();setError("");
    const cleanName=name.trim(),cleanStudentNo=studentNo.trim(),cleanPhone=phone.trim(),cleanEmail=email.trim();
    if(!cleanName)return setError(mode==="login"?"请输入登录账号":"请输入姓名");
    if(mode==="register"&&role==="student"&&!cleanStudentNo)return setError("请输入学号");
    if(/[\u3400-\u9fff]/.test(password))return setError("密码不能包含中文");
    if(cleanPhone&&!/^\d+$/.test(cleanPhone))return setError("手机号只能输入数字");
    setLoading(true);
    try{
      if(mode==="login"){
        const result=await authApi.login(cleanName,password,role);
        await completeLogin({name:cleanName,realName:cleanName,username:cleanName},result);
      }else{
        const register=role==="student"?authApi.registerStudent:authApi.registerTeacher;
        const normalizedRole=role.toUpperCase();
        const profile={
          name:cleanName,
          realName:cleanName,
          nickname:cleanName,
          username:cleanName,
          password,
          phone:cleanPhone,
          email:cleanEmail,
          organizationCode:"",
          role:normalizedRole,
          ...(role==="student"?{studentNo:cleanStudentNo,account:cleanStudentNo}:{account:cleanName}),
        };
        await register(profile);
        const result=await authApi.login(cleanName,password,role,role==="student"?cleanStudentNo:cleanName);
        await completeLogin(profile,result);
      }
    }catch(err){setError(err?.message||(mode==="login"?"登录失败":"注册失败"))}
    finally{setLoading(false)}
  };
  return <main className="login-page">
    <RippleCanvas/><div className="grain"/>
    <button className="back" onClick={onBack}>← 重新选择使用端</button>
    <div className="login-quote login-capability-board" aria-label="AI 能力检测功能介绍"><img src="/ripple-ai-assessment/landing/login-ai-capability-board.png" alt="AI 能力检测，多维度评估你的 AI 应用能力"/></div>
    <form className="login-card" onSubmit={submit} autoComplete="off">
      <Brand dark/>
      <div className="portal-badge"><PortalIcon/><span>{portal.name}</span></div>
      <div className="auth-tabs"><button type="button" className={mode==="login"?"active":""} onClick={()=>changeMode("login")}>登录</button><button type="button" className={mode==="register"?"active":""} onClick={()=>changeMode("register")}>注册</button></div>
      <div className="login-head"><span>{mode==="login"?"WELCOME BACK":"CREATE ACCOUNT"}</span><h1>{mode==="login"?"欢迎回来":"创建账号"}</h1><p>{mode==="login"?`登录${portal.name}继续使用平台`:`注册新的${portal.name}账号`}</p></div>
      <label>{mode==="login"?"登录账号":"姓名"}<div><UserRound size={17}/><input required name="ripple-person-name" autoComplete="off" value={name} onChange={e=>setName(e.target.value)} placeholder={mode==="login"?"请输入注册时的账号（学生通常为学号）":"请输入姓名"}/></div></label>
      {mode==="register"&&role==="student"&&<label>学号<div><IdCard size={17}/><input required name="ripple-student-number" autoComplete="off" value={studentNo} onChange={e=>setStudentNo(e.target.value)} placeholder="请输入学号"/></div></label>}
      <label>密码<div><LockKeyhole size={17}/><input required name="ripple-password" autoComplete={mode==="register"?"new-password":"off"} value={password} onChange={e=>{setPassword(e.target.value);if(/[\u3400-\u9fff]/.test(e.target.value))setError("密码不能包含中文");else setError("")}} type={show?"text":"password"} placeholder="请输入密码（不能包含中文）"/><button type="button" onClick={()=>setShow(!show)}>{show?"隐藏":"显示"}</button></div></label>
      {mode==="register"&&<><label>手机号（选填）<div><IdCard size={17}/><input inputMode="numeric" autoComplete="off" value={phone} onChange={e=>setPhone(e.target.value.replace(/\D/g,""))} placeholder="未填写则暂不绑定"/></div></label><label>邮箱（选填）<div><MessageCircleMore size={17}/><input type="email" autoComplete="off" value={email} onChange={e=>setEmail(e.target.value)} placeholder="未填写则暂不绑定"/></div></label></>}
      <div className="login-meta"><label><input type="checkbox" defaultChecked/> {mode==="login"?"记住我":"我已阅读并同意用户协议"}</label>{mode==="login"&&<a>忘记密码？</a>}</div>
      <button className="submit">{loading?<span className="spinner"/>:<>{mode==="login"?"进入平台":"完成注册"} <ArrowRight size={18}/></>}</button>
      {error&&<p className="api-error">{error}</p>}
      <p className="signup">{mode==="login"?"还没有账号？":"已有账号？"}<a onClick={()=>changeMode(mode==="login"?"register":"login")}>{mode==="login"?"立即注册":"返回登录"}</a></p>
      <div className="privacy"><ShieldCheck size={14}/> API：{API_BASE_URL} · 使用真实后端数据</div>
    </form>
  </main>
}

function TrainingSetup({ onClose, onStart }) {
  const [skills,setSkills]=useState(["提示词工程","结果评估与优化","人机协同解决问题"]);
  const [mode,setMode]=useState("实操任务测评");
  const [level,setLevel]=useState("进阶");
  const [duration,setDuration]=useState("30分钟");
  const skillOptions=["AI基础认知","提示词工程","AI工具使用","结果评估与优化","人机协同解决问题","AI伦理与合规"];
  const toggle=s=>setSkills(v=>v.includes(s)?v.filter(x=>x!==s):[...v,s]);
  return <div className="training-modal"><div className="training-dialog"><button className="training-close" onClick={onClose}><X/></button>
    <div className="setup-steps"><b className="active"><i>1</i>选择训练配置</b><span/><b><i>2</i>选择题目</b><span/><b><i>3</i>确认计划</b><span/><b><i>4</i>开始训练</b></div>
    <section className="setup-block"><h3><i>01</i>选择训练配置</h3><p>根据你的目标，选择合适的训练配置</p>
      <label>能力维度（可多选）<small>选择你想要提升的能力维度</small></label><div className="choice-grid skills">{skillOptions.map(s=><button key={s} className={skills.includes(s)?"selected":""} onClick={()=>toggle(s)}>{s}{skills.includes(s)&&<Check/>}</button>)}</div>
      <label>测评方式（可多选）<small>选择你希望的测评方式</small></label><div className="choice-grid three">{["对话式测评","实操任务测评","客观题测评"].map(s=><button key={s} className={mode===s?"selected coral":""} onClick={()=>setMode(s)}>{s}</button>)}</div>
      <label>难度等级<small>选择适合你的难度等级</small></label><div className="choice-grid three">{[["基础","适合入门学习者"],["进阶","适合有一定经验"],["挑战","适合高阶学习者"]].map(([s,d])=><button key={s} className={level===s?"selected":""} onClick={()=>setLevel(s)}><b>{s}</b><small>{d}</small></button>)}</div>
      <label>设置训练时长<small>选择本次训练的时长</small></label><div className="choice-grid five">{["不限时","15分钟","30分钟","60分钟","自定义"].map(s=><button key={s} className={duration===s?"selected coral":""} onClick={()=>setDuration(s)}>{s}</button>)}</div>
      <div className="estimate">预计完成时间：<b>{duration}</b><span/>预计题量：<b>18～22 题</b></div>
    </section>
    <section className="setup-block preview"><h3><i>02</i>训练内容预览</h3><p>系统将根据你的选择生成以下训练内容</p><div className="donut"><strong>18～22<small>题</small></strong></div><div className="preview-bars"><p><b>对话式测评</b><span><i style={{width:"40%"}}/></span>40%</p><p><b>实操任务测评</b><span><i style={{width:"40%"}}/></span>40%</p><p><b>客观题测评</b><span><i style={{width:"20%"}}/></span>20%</p></div></section>
    <div className="setup-actions"><button onClick={onClose}>取消</button><button onClick={()=>onStart({skills,mode,level,duration})}>确认配置并开始训练 <ArrowRight/></button></div>
  </div></div>
}

function TrainingCenter({ notify }) {
  const [setup,setSetup]=useState(false);
  const radarData=dimensions.map(d=>({subject:d.name,A:d.score,fullMark:100}));
  const days=Array.from({length:35},(_,i)=>i<4?26+i:i-3);
  return <div className="training-page"><header><div><h1>训练中心</h1><p>个性化AI能力训练，智能提升你的AI素养</p></div><span className="training-user">陈语溪</span></header>
    <section className="training-overview panel"><h2>我的AI能力概览</h2><div className="training-radar"><ResponsiveContainer width="48%" height={300}><RadarChart data={radarData}><PolarGrid stroke="#dce6df"/><PolarAngleAxis dataKey="subject" tick={{fill:"#536158",className:"ripple-chart-label-11"}}/><Radar dataKey="A" stroke="#55b98e" fill="#72d2a6" fillOpacity={.3}/></RadarChart></ResponsiveContainer><div className="training-summary"><article><span>综合能力得分</span><b>82<small>分</small></b><em>超过 78% 的用户</em></article><article><span>当前等级</span><b>L3<small>熟练应用者</small></b><i><em style={{width:"72%"}}/></i><small>距离 L4 还差 18 分</small></article><article><span>能力成长趋势（近30天）</span><strong>+15<small>分</small></strong><svg viewBox="0 0 240 50"><polyline points="0,40 45,34 95,27 145,18 190,12 240,11" fill="none" stroke="#62bd73" strokeWidth="3"/><circle cx="240" cy="11" r="4" fill="#62bd73"/></svg></article></div></div></section>
    <div className="training-two"><section className="panel calendar"><h2>训练日历 <small>2026年6月</small></h2><div className="week">{["日","一","二","三","四","五","六"].map(x=><b key={x}>{x}</b>)}</div><div className="days">{days.map((d,i)=><span key={i} className={d===17?"today":i%8===0?"trained":""}>{d}</span>)}</div><footer><i/>未训练 <i/>完成训练 <i/>训练计划 <i/>连续训练</footer></section>
      <section className="panel bubble"><h2>今日训练分布概览 <small>时长视图</small></h2><div className="bubbles"><i className="b1">2.5h<small>AI工具使用</small></i><i className="b2">1.8h<small>提示词工程</small></i><i className="b3">1.2h<small>AI基础认知</small></i><i className="b4">0.8h<small>结果评估</small></i><i className="b5">0.5h<small>人机协同</small></i></div></section></div>
    <section className="panel training-start"><h2>开始一次新的训练</h2><p>选择训练模式，定制你的专属能力提升计划</p><div><article><h3>推荐训练</h3><p>根据你的能力弱项进行均衡推荐</p><ul><li>目标能力：AI结果评估与优化</li><li>推荐方式：实操任务 + 对话式</li><li>推荐难度：进阶</li><li>预计时长：30 分钟</li></ul><button onClick={()=>setSetup(true)}>开始推荐训练</button></article><article><h3>自定义训练</h3><p>自由组合能力、方式和难度</p><div className="custom-icons"><span><Target/>选择能力维度</span><span><FileCheck2/>选择测评方式</span><span><Gauge/>选择难度与时长</span></div><button onClick={()=>setSetup(true)}>创建自定义训练</button></article></div></section>
    <div className="training-two lower"><section className="panel"><h2>最近训练记录</h2>{recent.map(r=><div className="training-record" key={r.title}><BadgeCheck/><span><b>{r.title}</b><small>{r.mode} · {r.date}</small></span><strong>{r.score}分</strong><button onClick={()=>notify("训练报告已打开")}>查看报告</button></div>)}</section><section className="panel"><h2>个性化训练建议</h2>{["提升AI结果评估能力","加强提示词工程能力","尝试综合实战训练"].map((x,i)=><div className="training-tip" key={x}><Sparkles/><span><b>{x}</b><small>根据近期表现为你智能推荐</small></span><button onClick={()=>setSetup(true)}>去提升</button></div>)}</section></div>
    {setup&&<TrainingSetup onClose={()=>setSetup(false)} onStart={config=>{setSetup(false);notify(`已生成${config.duration} · ${config.level}训练计划`)}}/>}
  </div>
}

function CustomTrainingModal({onClose,onStart}){
  const [skills,setSkills]=useState([]),[modes,setModes]=useState([]),[level,setLevel]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const toggle=(value,list,setter)=>setter(list.includes(value)?list.filter(x=>x!==value):[...list,value]);
  const six=["AI基础认知","提示词工程","AI工具使用","AI结果评估与优化","人机协同解决问题","AI伦理与合规"];
  const icons=[BrainCircuit,MessageCircleMore,Layers3,BarChart3,UsersRound,ShieldCheck];
  const ready=skills.length>0&&modes.length>0;
  const start=async()=>{if(!ready||busy)return;setBusy(true);setError("");try{await onStart({skills,modes,level})}catch(err){setError(err?.message||"生成训练失败")}finally{setBusy(false)}};
  return <div className="custom-training-overlay" onMouseDown={e=>e.target===e.currentTarget&&onClose()}><div className="custom-training-dialog planner"><i className="planner-plane">➤</i><i className="planner-clipboard">✓</i><header><em>自定义训练</em><h2><Sparkles/>创建你的专属训练计划<Sparkles/></h2><p>配置训练目标、模式与难度，AI 将为你生成专属训练计划</p></header><main><section className="planner-target"><h3><b>1</b>选择训练目标（可多选）</h3><small>你想提升哪方面能力？至少选择一项</small><div>{six.map((x,i)=>{const I=icons[i];return <button className={skills.includes(x)?"selected":""} onClick={()=>toggle(x,skills,setSkills)} key={x}><I/><span>{x}</span></button>})}</div><footer>已选择 {skills.length} 项</footer></section><section className="planner-mode"><h3><b>2</b>选择训练模式（可多选）</h3><small>不同模式，训练效果不同；至少选择一项</small>{[["对话式测评","通过与 AI 对话互动，评估思维过程",MessageCircleMore],["实操任务测评","完成真实场景任务，检验工具使用能力",BriefcaseBusiness],["客观题测评","通过单选和判断题掌握知识",ClipboardList]].map(([x,d,I])=><button className={modes.includes(x)?"selected":""} onClick={()=>toggle(x,modes,setModes)} key={x}><I/><span><b>{x}</b><small>{d}</small></span></button>)}</section><section className="planner-side"><div><h3><b>3</b>设置训练难度（可不选）</h3><small>不选择时由 AI 自动匹配难度</small>{["L1","L2","L3","L4","L5"].map(x=><button className={level===x?"selected":""} onClick={()=>setLevel(level===x?null:x)} key={x}><span>{x}</span></button>)}</div></section><section className="planner-preview"><h3><b>4</b>AI 生成预览</h3><p><strong>训练方向</strong>{skills.join("、")||"尚未选择"}</p><p><strong>训练模式</strong>{modes.join("、")||"尚未选择"}</p><p><strong>训练难度</strong>{level||"AI 自动匹配"}</p></section><section className="planner-schedule planner-actions"><footer><button className="planner-cancel" onClick={onClose}>取消</button><button onClick={start}>{busy?"正在生成…":"生成训练计划"}<Sparkles/></button></footer>{!ready&&<p className="planner-required">请至少选择一项训练目标与一种训练模式</p>}{error&&<p className="planner-required">{error}</p>}</section></main></div></div>
}

function LearningTrainingCenter({notify,onStart}){
  const [custom,setCustom]=useState(false); const [month,setMonth]=useState(7);
  const monthDate=new Date(2026,month,1),year=monthDate.getFullYear(),monthNo=monthDate.getMonth(),first=(monthDate.getDay()+6)%7,daysInMonth=new Date(year,monthNo+1,0).getDate();
  const days=Array.from({length:42},(_,i)=>{const d=i-first+1;return d>0&&d<=daysInMonth?d:null});
  const startTraining=title=>onStart({id:`training-${title}`,deadline:"今日训练",teacher:"AI训练助手",name:title,short:title,questions:12,minutes:30});
  return <div className="learning-training"><header className="assessment-head"><div><h1>嗨，陈语溪！</h1></div><div className="assessment-tools"><label><Search/><input placeholder="搜索训练、记录或能力"/></label><button className="user-avatar"><UserRound/></button></div></header><div className="training-dashboard-top"><section className="duration-card"><h2>训练时长分布</h2><div className="duration-bubbles"><i className="yellow">提示词工程<b>1.5h</b></i><i>AI基础认知<b>0.5h</b></i><i>AI结果<br/>评估与优化<b>0.7h</b></i><i className="dark">AI工具使用<b>0.5h</b></i></div></section><section className="start-card"><h2>开始训练</h2><button onClick={()=>startTraining("个性化训练")}>个性化训练</button><p>随机生成适配训练</p><button onClick={()=>setCustom(true)}>自定义训练</button><p>自定义各种题型与模式</p></section><section className="testing-calendar training-calendar-clone"><div className="calendar-title"><div><span>训练日历</span><nav><button onClick={()=>setMonth(m=>m-1)}><ChevronLeft/></button><b>{year}年 {monthNo+1}月</b><button onClick={()=>setMonth(m=>m+1)}><ChevronRight/></button></nav></div><CalendarDays/></div><div className="test-week">{["一","二","三","四","五","六","日"].map(x=><b key={x}>{x}</b>)}</div><div className="test-days">{days.map((d,i)=><span className={[1,3,10].includes(d)?"train":[6,12].includes(d)?"test":d===2?"both":""} key={i}>{d||""}</span>)}</div><footer><span><i className="train"/>训练日</span><span><i className="test"/>测试日</span><span><i className="both"/>测试+训练日</span></footer></section></div><div className="assessment-bottom training-matched-bottom"><section className="test-analysis"><h2>训练分析</h2><div className="analysis-content"><div className="mini-radar"><ResponsiveContainer width="100%" height={235}><RadarChart data={dimensions}><PolarGrid stroke="#d8d3c3"/><PolarAngleAxis dataKey="name" tick={{fill:"#4e5552",className:"ripple-chart-label-9"}}/><Radar dataKey="score" stroke="#d1aa19" fill="#f4cf31" fillOpacity={.32}/></RadarChart></ResponsiveContainer></div><div className="analysis-stats"><article><span>综合得分</span><b>83<small>分</small></b></article><article><span>当前等级</span><b>L3<small>熟练应用者</small></b></article><article className="ai-advice"><Sparkles/><div><span>AI 建议</span><p>继续加强复杂任务中的约束条件设置与结果评估。</p></div></article></div></div></section><section className="test-records"><div className="record-title"><h2>训练记录</h2><button onClick={()=>notify("已显示全部训练记录")}>查看全部 <ChevronRight/></button></div>{recent.map((r,i)=><div className="test-record" key={r.title}><div><b>{r.title}</b><small>{r.mode}</small></div><time>{r.date}</time><strong>{r.score}分</strong><ScoreBars score={r.score}/><button onClick={()=>notify(`正在打开「${r.title}」训练报告`)}>查看报告</button></div>)}</section></div>{custom&&<CustomTrainingModal onClose={()=>setCustom(false)} onStart={c=>{setCustom(false);startTraining("自定义训练")}}/>}</div>
}

function TrainingGround({notify,onStart}){
  const [custom,setCustom]=useState(false),[month,setMonth]=useState(7),[report,setReport]=useState(null);
  const date=new Date(2026,month,1),year=date.getFullYear(),monthNo=date.getMonth(),first=(date.getDay()+6)%7,total=new Date(year,monthNo+1,0).getDate();
  const days=Array.from({length:42},(_,i)=>{const d=i-first+1;return d>0&&d<=total?d:null});
  const start=(title,teacher="AI 训练助手")=>onStart({id:`training-${title}`,deadline:"今日训练",teacher,name:title,short:title,questions:12,minutes:30});
  const modes=[
    ["AI 个性化主题","根据你的六维能力短板，智能推荐题目、难度与训练时长",Sparkles,()=>start("AI 个性化主题")],
    ["自定义主题","自主选择能力维度、题型、难度与训练时长",Settings,()=>setCustom(true)],
    ["管理员发布任务主题","林管理员发布：《提示词工程进阶》，08月18日截止",School,()=>start("管理员发布任务主题","林管理员")],
  ];
  return <div className="learning-training training-ground"><header className="assessment-head"><div><h1>嗨，陈语溪！欢迎来到训练场</h1><p>选择适合你的主题，开始今天的 AI 能力训练</p></div><div className="assessment-tools"><label><Search/><input placeholder="搜索训练、记录或能力"/></label><button className="user-avatar"><UserRound/></button></div></header><div className="training-ground-top"><section className="duration-card"><h2>训练时长分布</h2><div className="duration-bubbles"><i className="yellow">提示词工程<b>1.5h</b></i><i>AI基础认知<b>0.5h</b></i><i>结果评估与优化<b>0.7h</b></i><i className="dark">AI工具使用<b>0.5h</b></i></div></section><section className="training-mode-panel"><h2>开始训练</h2>{modes.map(([title,desc,Icon,action])=><button key={title} onClick={action}><i><Icon/></i><span><b>{title}</b><small>{desc}</small></span><ArrowRight/></button>)}</section><section className="testing-calendar"><div className="calendar-title"><div><span>训练日历</span><nav><button onClick={()=>setMonth(m=>m-1)}><ChevronLeft/></button><b>{year}年 {monthNo+1}月</b><button onClick={()=>setMonth(m=>m+1)}><ChevronRight/></button></nav></div><CalendarDays/></div><div className="test-week">{["一","二","三","四","五","六","日"].map(x=><b key={x}>{x}</b>)}</div><div className="test-days">{days.map((d,i)=><span className={[1,3,10].includes(d)?"train":[6,12,18].includes(d)?"test":d===2?"both":""} key={i}>{d||""}</span>)}</div><footer><span><i className="train"/>训练日</span><span><i className="test"/>测试日</span><span><i className="both"/>测试+训练日</span></footer></section></div><div className="assessment-bottom"><section className="test-analysis"><h2>训练分析</h2><div className="analysis-content"><div className="mini-radar"><ResponsiveContainer width="100%" height={235}><RadarChart data={dimensions}><PolarGrid stroke="#d8d3c3"/><PolarAngleAxis dataKey="name" tick={{fill:"#4e5552",className:"ripple-chart-label-9"}}/><Radar dataKey="score" stroke="#d1aa19" fill="#f4cf31" fillOpacity={.32}/></RadarChart></ResponsiveContainer></div><div className="analysis-stats"><article><span>综合得分</span><b>83<small>分</small></b></article><article><span>当前等级</span><b>L3<small>熟练应用者</small></b></article><article className="ai-advice"><Sparkles/><div><span>AI 建议</span><p>继续加强复杂任务中的约束条件设置与结果评估。</p></div></article></div></div></section><section className="test-records"><div className="record-title"><h2>训练记录</h2><button>查看全部 <ChevronRight/></button></div>{recent.map(r=><div className="test-record" key={r.title}><div><b>{r.title}</b><small>{r.mode}</small></div><time>{r.date}</time><strong>{r.score}分</strong><ScoreBars score={r.score}/><button onClick={()=>setReport([r.title,r.mode,r.date,r.score])}>查看报告</button></div>)}</section></div>{custom&&<CustomTrainingModal onClose={()=>setCustom(false)} onStart={()=>{setCustom(false);start("自定义主题")}}/>}{report&&<AssessmentReportModal report={report} onClose={()=>setReport(null)} notify={notify}/>}</div>
}

function AssessmentReportModal({report,onClose,notify}){
  const [tab,setTab]=useState("recent"); const current=report||["提示词工程","实操 + 对话","07-08 16:32",83];
  const compare=dimensions.map((d,i)=>({...d,previous:Math.max(45,d.score-[4,7,3,9,5,2][i])}));
  return <div className="report-modal enhanced-report" onMouseDown={e=>e.target===e.currentTarget&&onClose()}><article><button className="report-close" onClick={onClose}><X/></button><header><div><span className="report-tag">AI 能力测评报告</span><h2>{current[0]}</h2><p>{current[1]} · {current[2]}</p></div><div className="report-score"><strong>{current[3]}</strong><span>综合总评<small>L3 熟练应用者</small></span></div></header><div className="report-tabs"><button className={tab==="recent"?"active":""} onClick={()=>setTab("recent")}>最近一次测验</button><button className={tab==="all"?"active":""} onClick={()=>setTab("all")}>所有测验对比</button></div>{tab==="recent"?<div className="report-grid"><section className="report-radar"><h3>六维能力画像</h3><ResponsiveContainer width="100%" height={245}><RadarChart data={dimensions}><PolarGrid/><PolarAngleAxis dataKey="name" tick={{className:"ripple-chart-label-10"}}/><Radar dataKey="score" stroke="#d6a900" fill="#f4cf23" fillOpacity={.28}/></RadarChart></ResponsiveContainer></section><section className="written-report"><h3>文字版解策报告</h3><p>你能准确理解任务目标，并使用结构化提示词完成复杂要求。当前优势集中在 AI 基础认知、工具使用和伦理合规。</p><h3>学习建议</h3><ul><li>加强结果核验与事实检查</li><li>尝试多轮人机协同任务</li><li>练习复杂约束条件的表达</li></ul></section><section className="skill-tree"><h3>技能树点亮</h3><div>{dimensions.map((d,i)=><span className={d.score>=75?"lit":""} key={d.name}><i>{i+1}</i><b>{d.name}</b><small>{d.score>=75?"已点亮":"待提升"}</small></span>)}</div></section></div>:<div className="report-compare"><section><h3>距离上一次六维能力变化</h3>{compare.map(d=><div key={d.name}><span>{d.name}</span><i><em style={{width:d.score+"%"}}/></i><b>+{d.score-d.previous}</b></div>)}</section><section><h3>测验能力画像对比</h3><ResponsiveContainer width="100%" height={300}><RadarChart data={compare}><PolarGrid/><PolarAngleAxis dataKey="name" tick={{className:"ripple-chart-label-10"}}/><Radar name="本次" dataKey="score" stroke="#f4c323" fill="#f4c323" fillOpacity={.28}/><Radar name="上次" dataKey="previous" stroke="#7b8280" fill="#7b8280" fillOpacity={.08}/></RadarChart></ResponsiveContainer><p><i/>本次测验 <i/>上次测验</p></section></div>}<footer><button onClick={()=>notify("报告下载任务已创建")}>下载报告</button><button onClick={onClose}>关闭报告</button></footer></article></div>
}

function LearningRecords({notify}){
  const trend=[{d:"05-20",v:58},{d:"05-27",v:65},{d:"06-03",v:72},{d:"06-10",v:76},{d:"06-17",v:82}];
  const rows=[...recent,{title:"AI伦理与合规进阶",mode:"客观题",score:88,date:"6月18日",color:"mint"},{title:"人机协同综合任务",mode:"实操任务",score:84,date:"6月12日",color:"blue"},{title:"AI工具应用专项",mode:"对话式",score:79,date:"6月06日",color:"coral"}];
  const metrics=[["当前等级","L3","熟练应用者"],["综合得分","82","较上次提升 +8"],["完成任务","21","今天新增 +3 个"],["累计时长","12.5","今天新增 +1.2h"]];
  return <div className="learning-records-page"><header className="assessment-head"><div><h1>嗨，陈语溪！欢迎来到学习记录</h1></div><div className="assessment-tools"><label><Search/><input placeholder="搜索学习记录"/></label><button className="user-avatar"><UserRound/></button></div></header><div className="record-metrics">{metrics.map(([n,v,s])=><article key={n}><span>{n}</span><b>{v}{n==="综合得分"&&<small>/100</small>}</b><small>{s}</small></article>)}</div><section className="record-ability record-ability-simple"><ResponsiveContainer width="100%" height={300}><RadarChart data={dimensions} outerRadius="38%"><PolarGrid stroke="#5a5a50"/><PolarAngleAxis dataKey="name" tick={{fill:"#fff",className:"ripple-chart-label-10"}}/><Radar dataKey="score" stroke="#f4cf23" fill="#f4cf23" fillOpacity={.25} dot={{r:4,fill:"#f4cf23"}}/></RadarChart></ResponsiveContainer></section><div className="record-charts"><section><h2>能力成长趋势</h2><ResponsiveContainer width="92%" height={210}><AreaChart data={trend} margin={{left:18,right:18}}><CartesianGrid vertical={false} stroke="#eee7d8"/><XAxis dataKey="d" tick={{className:"ripple-chart-label-10"}}/><YAxis hide/><Area type="monotone" dataKey="v" stroke="#d6a900" fill="#fff1af" strokeWidth={3} dot={{r:5,fill:"#f4cf23",stroke:"#fff",strokeWidth:2}} activeDot={{r:6,fill:"#f4cf23"}}/></AreaChart></ResponsiveContainer></section><section className="dimension-compare-card"><h2>能力维度对比</h2>{dimensions.slice(0,4).map(d=><div className="compare-bar" key={d.name}><span>{d.name}</span><b>{d.score}</b><i><em style={{width:d.score+"%"}}/></i></div>)}</section></div><section className="all-learning-records"><h2>所有学习记录</h2><div className="learning-table-head"><span>学习内容</span><span>类型</span><span>完成时间</span><span>得分</span><span>学习时长</span><span>状态</span></div>{rows.map((r,i)=><div className="learning-table-row" key={r.title+i}><b>{r.title}</b><span>{r.mode}</span><time>{r.date}</time><strong>{r.score}分</strong><span>{15+i*3}分钟</span><button onClick={()=>notify(`正在查看「${r.title}」详情`)}>查看详情</button></div>)}</section><section className="personal-growth"><h2>个性化提升建议</h2><div>{["提升结果评估与优化能力","强化人机协同解决问题","挑战综合实操任务","保持连续学习习惯"].map(x=><article key={x}><Sparkles/><h3>{x}</h3><p>结合你的六维能力表现，为你推荐针对性练习与学习路径。</p><button onClick={()=>notify(`已创建「${x}」计划`)}>去提升</button></article>)}</div></section></div>
}

function MyProfile({notify}){
  const snapshots=[{name:"全部数据",score:82,color:"#741a1e"},{name:"训练数据",score:78,color:"#cfc8b8"},{name:"测试数据",score:86,color:"#f4bd19"},{name:"单次记录",score:80,color:"#d7d3ca"}];
  return <div className="my-profile-page"><header className="assessment-head"><div><h1>我的</h1><p>管理你的 AI 能力档案，见证每一次成长</p></div><div className="assessment-tools"><label><Search/><input placeholder="搜索功能、测评或报告"/></label><button onClick={()=>notify("暂无新通知")} className="user-avatar"><Bell/></button></div></header><section className="profile-overview"><div className="identity-card"><div className="portrait"><UserRound/></div><div><h2>陈语溪</h2><b>L3 熟练应用者</b><p>加入时间：2026年7月15日</p><span>当前学习状态：持续提升中</span><button onClick={()=>notify("个人资料编辑已打开")}>编辑资料</button></div></div><div className="profile-score-card"><span>AI 成长编号</span><b>AI-202608001</b><div><p>累计训练<strong>18<small>次</small></strong></p><p>能力积分<strong>825<small>分</small></strong></p></div><i><em style={{width:"87%"}}/></i><small>超过了 87% 的同学</small></div></section><div className="profile-stats">{[[CalendarDays,"累计训练","18","次"],[Clock3,"累计时长","12.5","小时"],[ClipboardList,"完成任务","236","个"],[Zap,"连续学习","7","天"]].map(([I,n,v,u])=><article key={n}><I/><span>{n}<b>{v}<small>{u}</small></b></span></article>)}</div><section className="profile-radar"><div><h2>我的 AI 能力画像</h2><ResponsiveContainer width="100%" height={330}><RadarChart data={dimensions}><PolarGrid stroke="#555"/><PolarAngleAxis dataKey="name" tick={{fill:"#fff",className:"ripple-chart-label-10"}}/><Radar dataKey="score" stroke="#f4c323" fill="#b18838" fillOpacity={.6}/></RadarChart></ResponsiveContainer></div><aside><h3>优势能力</h3>{dimensions.slice(1,3).map(d=><p key={d.name}><span>{d.name}</span><b>{d.score}分</b></p>)}<h3>待提升能力</h3>{dimensions.slice(3,5).map(d=><p key={d.name}><span>{d.name}</span><b>{d.score}分</b></p>)}<button onClick={()=>notify("六维能力详情已打开")}>查看能力详情</button></aside></section><section className="profile-history"><h2>雷达图分析</h2><div>{snapshots.map((s,i)=><article key={s.name}><h3>{s.name}</h3><ResponsiveContainer width="100%" height={150}><RadarChart data={dimensions}><PolarGrid/><Radar dataKey="score" stroke={s.color} fill={s.color} fillOpacity={.2}/></RadarChart></ResponsiveContainer><b>{s.score}<small>/100</small></b></article>)}</div></section><div className="profile-extra"><section><h2>我的 AI 使用档案</h2><strong>326<small>次</small></strong><p>最常使用：ChatGPT、代码助手、办公 AI</p></section><section><h2>擅长场景</h2><p>✓ 文档生成</p><p>✓ 数据分析</p><p>✓ 信息整理</p></section></div><section className="account-settings"><h2>账户与设置</h2>{[[ShieldCheck,"账号安全"],[Bell,"通知设置"],[LockKeyhole,"隐私设置"],[Compass,"帮助中心"],[LogOut,"退出登录"]].map(([I,n])=><button onClick={()=>notify(`${n}已打开`)} key={n}><I/>{n}<ChevronRight/></button>)}</section></div>
}

function NotificationCenter({notify}){
  const [filter,setFilter]=useState("全部");
  const items=[
    ["管理员通知","周知管理员发布了新的AI训练任务","提示词工程专项训练 · 截止时间 08月09日","10分钟前","查看任务","teacher"],
    ["任务通知","任务即将截止提醒","伦理与工程综合测试还剩 2 天截止","2小时前","去完成","task"],
    ["学生消息","张同学发来消息","你的 Prompt 设计模板可以分享一下吗？","昨天 18:30","回复","message"],
    ["管理员通知","李管理员回复了你的训练结果","任务拆解能力较强，建议加强输出约束设计。","昨天 20:15","查看评价","teacher"],
    ["系统通知","测评报告已生成","AI工具使用能力测评报告已经可以查看。","昨天 10:20","查看报告","system"],
    ["系统通知","新增AI能力测评模块","现已上线结果评估与优化专项测评。","08月01日","查看详情","system"]
  ];
  const shown=filter==="全部"?items:items.filter(x=>x[0]===filter);
  return <div className="notice-page"><header className="assessment-head"><div><h1>通知中心</h1><p>查看管理员通知、任务动态、消息交流和系统公告</p></div><div className="assessment-tools"><label><Search/><input placeholder="搜索通知内容或联系人"/></label><button className="notice-all" onClick={()=>notify("全部通知已标记为已读")}>全部已读</button><button className="user-avatar"><UserRound/></button></div></header><div className="notice-summary">{[[GraduationCap,"管理员通知",6],[ClipboardList,"任务通知",4],[MessageCircleMore,"学生消息",3],[Bell,"系统通知",2]].map(([I,n,v])=><article key={n}><I/><span><b>{v}</b>{n}<small>条未读</small></span></article>)}</div><div className="notice-layout"><main><nav>{["全部","管理员通知","任务通知","学生消息","系统通知"].map(x=><button className={filter===x?"active":""} onClick={()=>setFilter(x)} key={x}>{x}</button>)}</nav>{shown.map((x,i)=><article className="notice-item" key={x[1]}><i className={x[5]}>{x[5]==="teacher"?<UsersRound/>:x[5]==="task"?<ClipboardList/>:x[5]==="message"?<MessageCircleMore/>:<Bell/>}</i><div><small>{x[0]}</small><h3>{x[1]}</h3><p>{x[2]}</p></div><time>{x[3]}</time><button onClick={()=>notify(`${x[4]}已打开`)}>{x[4]}</button></article>)}</main><aside><section><h2>快捷消息</h2>{["发起私信","我的对话","群组消息"].map(x=><button onClick={()=>notify(`${x}已打开`)} key={x}><MessageCircleMore/>{x}<ChevronRight/></button>)}</section><section className="notice-tip"><Sparkles/><h2>通知小贴士</h2><p>重要通知将通过站内信、邮件和短信等渠道提醒，请保持关注。</p></section></aside></div></div>
}

function SettingsPage({notify}){
  const [switches,setSwitches]=useState({teacher:true,task:true,student:true,system:true,animation:true,login:true});
  const toggle=k=>setSwitches(s=>({...s,[k]:!s[k]}));
  return <div className="settings-page"><header className="assessment-head"><div><h1>设置</h1><p>管理你的账户、安全、通知、隐私和学习偏好</p></div><div className="assessment-tools"><label><Search/><input placeholder="搜索设置项"/></label><button className="user-avatar"><Bell/></button></div></header><section className="settings-profile"><div className="portrait"><UserRound/></div><div><h2>陈语溪 <b>L3 熟练应用者</b></h2><p>AI 成长编号：AI-202608001</p><small>加入时间：2026年7月15日</small></div><button onClick={()=>notify("资料编辑窗口已打开")}>编辑资料</button></section><div className="settings-groups"><section><h2><UserRound/>账户设置</h2>{["个人信息","账号与绑定","修改密码","登录设备管理"].map(x=><button onClick={()=>notify(`${x}已打开`)} key={x}><b>{x}</b><span>查看和管理{x}</span><ChevronRight/></button>)}</section><section><h2><Bell/>通知设置</h2>{[["teacher","管理员通知"],["task","任务通知"],["student","学生消息"],["system","系统通知"]].map(([k,n])=><div className="setting-switch" key={k}><span><b>{n}</b><small>接收最新的{n}与提醒</small></span><button className={switches[k]?"on":""} onClick={()=>toggle(k)}><i/></button></div>)}</section><section><h2><ShieldCheck/>隐私设置</h2>{["谁可以给我发消息","个人主页可见范围","学习记录可见范围","黑名单管理"].map(x=><button onClick={()=>notify(`${x}已打开`)} key={x}><b>{x}</b><span>仅按你的授权范围展示</span><ChevronRight/></button>)}</section><section><h2><GraduationCap/>学习设置</h2>{["默认训练难度：二级","每次训练时长：30分钟","偏好能力领域：提示词工程、AI工具使用","目标设置：提升 Prompt 工程能力"].map(x=><button onClick={()=>notify("学习偏好已打开") } key={x}><b>{x}</b><ChevronRight/></button>)}</section><section><h2><Gauge/>显示与安全</h2>{[["animation","界面动画"],["login","登录保护"]].map(([k,n])=><div className="setting-switch" key={k}><span><b>{n}</b><small>保障良好的使用体验与账户安全</small></span><button className={switches[k]?"on":""} onClick={()=>toggle(k)}><i/></button></div>)}</section><section className="danger-setting"><button onClick={()=>notify("退出登录前需要再次确认")}><LogOut/>退出登录<ChevronRight/></button></section></div></div>
}

const testTasks = [
  { id:1, deadline:"08月09日截止", teacher:"周知管理员", name:"提示词工程阶段测评", short:"《提示词工程》", questions:12, minutes:25 },
  { id:2, deadline:"08月12日截止", teacher:"彭佩管理员", name:"伦理与工程综合测试", short:"《伦理与工程》", questions:12, minutes:20 },
  { id:3, deadline:"08月18日截止", teacher:"林管理员", name:"AI工具实操能力测评", short:"《AI工具使用》", questions:15, minutes:30 }
];

function ScoreBars({score}){return <span className="visual-score">{Array.from({length:10},(_,i)=><i key={i} className={i<Math.round(score/10)?"on":""}/>)}</span>}

function AssessmentCenter({ onStart, notify }) {
  const [selected,setSelected]=useState(testTasks[1]);
  const [report,setReport]=useState(null);
  const [month,setMonth]=useState(7);
  const monthDate=new Date(2026,month,1), year=monthDate.getFullYear(), monthNo=monthDate.getMonth(), daysInMonth=new Date(year,monthNo+1,0).getDate(), first=(monthDate.getDay()+6)%7;
  const calendarDays=Array.from({length:42},(_,i)=>{const d=i-first+1;return d>0&&d<=daysInMonth?d:null});
  const records=[
    ["提示词工程","实操 + 对话","07-08 16:32",83],
    ["AI工具应用","客观题 + 实操","07-03 14:10",91],
    ["AI伦理与合规","客观题","06-26 09:20",86],
    ["结果评估优化","对话 + 实操","06-18 15:05",78]
  ];
  return <div className="assessment-page">
    <header className="assessment-head"><div><h1>嗨，陈语溪！</h1></div><div className="assessment-tools"><label><Search/><input placeholder="搜索功能、测评或报告" onKeyDown={e=>e.key==="Enter"&&notify(`正在搜索：${e.currentTarget.value||"全部功能"}`)}/></label><button className="user-avatar"><UserRound/></button></div></header>
    <div className="assessment-top">
      <section className="pending-tests"><h2>待做测试 <small>{testTasks.length} 个任务</small></h2><div className="pending-body"><div className="task-list">{testTasks.map(t=><button key={t.id} className={selected.id===t.id?"chosen":""} onClick={()=>setSelected(t)}><span>{t.deadline}</span><b>{t.teacher}</b><em>{t.short}</em>{selected.id===t.id&&<Check/>}</button>)}</div><div className="task-action"><span>当前选择</span><b>{selected.teacher} · {selected.short}</b><small>{selected.questions} 道题 · 预计 {selected.minutes} 分钟</small><button onClick={()=>onStart(selected)}>开始测试 <ArrowRight/></button></div></div></section>
      <section className="testing-calendar"><div className="calendar-title"><div><span>测试日历</span><nav><button aria-label="上个月" onClick={()=>setMonth(m=>m-1)}><ChevronLeft/></button><b>{year}年 {monthNo+1}月</b><button aria-label="下个月" onClick={()=>setMonth(m=>m+1)}><ChevronRight/></button></nav></div><CalendarDays/></div><div className="test-week">{["一","二","三","四","五","六","日"].map(x=><b key={x}>{x}</b>)}</div><div className="test-days">{calendarDays.map((d,i)=>{const cls=monthNo===7?([2,10].includes(d)?"both":[1,3,11].includes(d)?"train":[6,12,18].includes(d)?"test":""):"";return <span key={i} className={cls}>{d||""}</span>})}</div><footer><span><i className="train"/>训练日</span><span><i className="test"/>测试日</span><span><i className="both"/>测试+训练日</span></footer></section>
    </div>
    <div className="assessment-bottom">
      <section className="test-analysis"><h2>测试分析</h2><div className="analysis-content"><div className="mini-radar"><ResponsiveContainer width="100%" height={235}><RadarChart data={dimensions}><PolarGrid stroke="#d8d3c3"/><PolarAngleAxis dataKey="name" tick={{fill:"#4e5552",className:"ripple-chart-label-9"}}/><Radar dataKey="score" stroke="#d1aa19" fill="#f4cf31" fillOpacity={.32}/></RadarChart></ResponsiveContainer></div><div className="analysis-stats"><article><span>综合得分</span><b>83<small>分</small></b></article><article><span>当前等级</span><b>L3<small>熟练应用者</small></b></article><article className="ai-advice"><Sparkles/><div><span>AI 建议</span><p>提示词结构清晰，建议加强复杂任务中的约束条件设置。</p></div></article></div></div></section>
      <section className="test-records"><div className="record-title"><h2>测试记录</h2><button onClick={()=>notify("已显示全部测试记录")}>查看全部 <ChevronRight/></button></div>{records.map((r,i)=><div className="test-record" key={i}><div><b>{r[0]}</b><small>{r[1]}</small></div><time>{r[2]}</time><strong>{r[3]}分</strong><ScoreBars score={r[3]}/><button onClick={()=>setReport(r)}>查看报告</button></div>)}</section>
    </div>
    {report&&<AssessmentReportModal report={report} onClose={()=>setReport(null)} notify={notify}/>}
  </div>
}

const questionBank=[
  {type:"单选题",text:"在设计高质量提示词时，以下哪一项最有助于模型准确理解任务目标？",options:["明确角色、任务、约束条件和输出格式","只提供尽可能多的背景文字","使用大量专业术语但不说明目标","省略示例以减少提示词长度"],answer:0},
  {type:"判断题",text:"提示词中的输出格式要求越具体，模型生成结果通常越稳定。",options:["正确","错误"],answer:0},
  {type:"多选题",text:"评估 AI 生成内容质量时，应重点检查哪些方面？",options:["事实准确性","任务相关性","安全与合规性","文字长度越长越好"],answer:[0,1,2]},
  {type:"单选题",text:"面对复杂任务时，哪种提示策略更合理？",options:["将任务拆分为清晰的步骤","一次输入所有内容且不设要求","只告诉模型最终答案","反复使用相同提示词"],answer:0},
  {type:"对话式测评",text:"请通过对话回答 AI 测评官的问题，系统会根据你的回答继续追问。",prompt:"你好，我是你的 AI 测评官。请解释一下提示词工程的核心目标是什么，并举一个实际应用例子。"},
  {type:"实操任务测评",text:"使用 AI 完成任务，并按照要求提交你的成果与优化过程。",prompt:"请设计一段用于生成校园活动策划案的高质量提示词。要求包含角色、背景、任务目标、约束条件和输出格式，并通过至少一轮对话优化结果。"},
  {type:"单选题",text:"当 AI 输出包含无法确认的数据时，最恰当的处理方式是什么？",options:["核对权威来源并标注不确定性","直接采用输出内容","删除所有数字","让 AI 重复生成直到满意"],answer:0},
  {type:"对话式测评",text:"围绕 AI 结果评估完成情境问答，测评官将根据你的判断继续提问。",prompt:"某份 AI 生成的调研摘要引用了三组数据，却没有给出来源。你会如何核验这些信息，并决定哪些内容可以保留？"},
  {type:"多选题",text:"在人机协同完成复杂任务时，哪些做法有助于提高结果质量？",options:["明确双方分工","设置阶段性检查点","记录关键修改依据","完全放弃人工复核"],answer:[0,1,2]},
  {type:"实操任务测评",text:"完成一项真实办公场景任务，并提交提示词与优化后的最终结果。",prompt:"请使用 AI 将一份杂乱的会议记录整理为行动清单，输出负责人、截止时间、优先级和风险项，并说明你如何检查遗漏。"},
  {type:"判断题",text:"在使用公开 AI 工具前，应先确认输入内容是否包含隐私或敏感信息。",options:["正确","错误"],answer:0},
  {type:"对话式测评",text:"分析一个人机协同场景，并说明你的决策依据。",prompt:"如果 AI 给出的方案效率很高，但可能对部分用户群体不公平，你会如何发现问题、调整方案并验证改进效果？"}
];

function calculateAssessmentResult(questions,answers,elapsed){
  const typeRows={客观题:{count:0,total:0},对话式测评:{count:0,total:0},实操任务:{count:0,total:0}};
  const dimensionValues=[[],[],[],[],[],[]]; let correct=0, answered=0;
  questions.forEach((q,i)=>{const value=answers[i]||[];if(value.length)answered++;let points=0,type="客观题";
    if(q.options){const expected=Array.isArray(q.answer)?q.answer:[q.answer];const selected=value.filter(Number.isInteger).sort();points=selected.length===expected.length&&selected.every((x,j)=>x===expected.slice().sort()[j])?100:selected.filter(x=>expected.includes(x)).length/expected.length*65;if(points===100)correct++}
    else if(q.type==="对话式测评"){type="对话式测评";const text=value.join("");points=text?Math.min(100,42+text.length*.8):0}
    else{type="实操任务";const text=value.join("");points=value.includes("done")?Math.min(100,58+Math.max(0,text.length-4)*.45):text?45:0}
    typeRows[type].count++;typeRows[type].total+=points;dimensionValues[i%6].push(points);
  });
  const radar=dimensions.map((d,i)=>({...d,score:Math.round(dimensionValues[i].length?dimensionValues[i].reduce((a,b)=>a+b,0)/dimensionValues[i].length:0)}));
  const score=Math.round(radar.reduce((a,d)=>a+d.score,0)/radar.length);const sorted=[...radar].sort((a,b)=>b.score-a.score);
  const level=score>=90?"L5":score>=80?"L4":score>=70?"L3":score>=60?"L2":"L1";
  return {score,level,radar,answered,correct,elapsed,performance:Object.entries(typeRows).filter(([,v])=>v.count).map(([name,v])=>({name,count:v.count,score:Math.round(v.total/v.count)})),strengths:sorted.slice(0,2),weaknesses:sorted.slice(-2).reverse()};
}


const beijingLocalToIso=value=>{if(!value)return null;const normalized=value.length===16?`${value}:00`:value;const date=new Date(`${normalized}+08:00`);return Number.isNaN(date.valueOf())?null:date.toISOString()};
const beijingDeadlineLabel=value=>{if(!value)return "无限期";const date=new Date(value);return Number.isNaN(date.valueOf())?"截止时间待确认":date.toLocaleString("zh-CN",{timeZone:"Asia/Shanghai",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hour12:false})};
function TeacherTasksPage({onBack,onStart,classId}){
  const {user,username}=useCurrentUser();
  const [filter,setFilter]=useState("全部任务"),[tasks,setTasks]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState("");
  const [classNames,setClassNames]=useState({});
  const unknownClassTasks=tasks.filter(task=>recordClassId(task)==null).length;
  useEffect(()=>{let alive=true;Promise.allSettled([studentData.joinedClasses(),studentData.availableTasks()]).then(([classesResult,tasksResult])=>{
    if(!alive)return;
    if(classesResult.status==="fulfilled")setClassNames(Object.fromEntries(classesResult.value.map(item=>[String(item.id),item.name])));
    if(tasksResult.status==="fulfilled")setTasks(tasksResult.value);
    else setError(tasksResult.reason?.message||"组织任务加载失败");
  }).finally(()=>{if(alive)setLoading(false)});return()=>{alive=false}},[]);
  const completed=task=>["completed","completed_with_scoring_failure"].includes(String(task.assessmentStatus||task.status||"").toLowerCase());
  const ended=task=>["ended","closed","expired"].includes(String(task.status||"").toLowerCase())||Boolean((task.deadlineAt||task.deadline)&&new Date(task.deadlineAt||task.deadline)<=new Date());
  const shown=tasks.filter(task=>belongsToClass(task,classId)).filter(task=>filter==="全部任务"||(filter==="已完成"?completed(task):!completed(task)));
  const start=async task=>{try{const result=completed(task)&&task.assessmentId?{assessmentId:task.assessmentId}:await assessmentApi.startTask(task.id);onStart({...task,name:task.title||task.name,assessmentId:result.id||result.assessmentId,id:result.id||result.assessmentId,live:true,source:"teacher-task",returnLabel:"返回组织任务"})}catch(err){setError(err?.message||"开始组织任务失败")}};
  const deadlineLabel=task=>beijingDeadlineLabel(task.deadlineAt||task.deadline);
  const canContinue=task=>String(task.assessmentStatus||"").toLowerCase()==="in_progress";
  return <div className="teacher-tasks-page shared-page-bg"><header><button onClick={onBack}><ChevronLeft/>返回训练场</button><div><h1>组织任务 <Sparkles/></h1><p>查看并完成管理员布置的训练任务</p></div></header>{tasks.length>0&&<nav>{["全部任务","待完成","已完成"].map(x=><button className={filter===x?"active":""} onClick={()=>setFilter(x)} key={x}>{x}</button>)}</nav>}<main>{loading?<div className="teacher-task-empty">正在加载组织任务…</div>:error?<div className="teacher-task-empty">{error}</div>:shown.length?shown.map((task,i)=><article key={task.id}><i>{i%3===0?<BarChart3/>:i%3===1?<MessageCircleMore/>:<Layers3/>}</i><div><h2>{task.title||task.name}</h2><p><b>备注：</b>{task.description||"无"}</p><small>组织：{classNames[String(task.classId||task.class?.id||task.classroomId)]||task.className||"组织名称待后端返回"}　　{task.taskType==="REMEDIAL"?"小灶任务":"组织任务"}　　截止：{deadlineLabel(task)}</small></div><em className={completed(task)?"done":ended(task)?"ended":"pending"}>{completed(task)?"已完成":ended(task)?"已结束":"待完成"}</em>{(!ended(task)||completed(task)||canContinue(task))&&<button onClick={()=>start(task)}>{completed(task)?"查看结果":canContinue(task)?"继续完成":"去完成"}<ArrowRight/></button>}</article>):<div className="teacher-task-empty"><School/><h2>暂无组织任务</h2><p>{unknownClassTasks?`有 ${unknownClassTasks} 个任务缺少组织信息，暂无法归入当前组织。`:"没有符合条件的任务"}</p></div>}</main></div>;
}

function CompletionReport({task,onBack,onTraining,notify,result}){
  const verdict=result.score>=90?"卓越":result.score>=80?"优秀":result.score>=70?"良好":result.score>=60?"合格":"继续努力";
  const detailAdvice={"基础认知":"加强 AI 基础概念、模型边界和适用场景判断","提示词工程":"练习角色、目标、约束和输出格式的结构化表达","工具使用":"增加不同 AI 工具的组合应用与实际操作","结果评估":"加强事实核验、质量判断与多轮优化","人机协同":"练习任务拆解、分工与过程复核","伦理合规":"关注隐私、版权、偏见和责任边界"};
  const detailSummary={"基础认知":"理解 AI 基本概念，掌握核心原理与模型边界。","提示词工程":"能够根据任务目标设计清晰、有效的提示词。","工具使用":"能够选择合适的 AI 工具完成各类实际任务。","结果评估":"具备结果核验能力，能够判断输出质量与风险。","人机协同":"能够与 AI 协作完成任务并优化工作流程。","伦理合规":"了解 AI 使用规范，能够遵守隐私与版权要求。"};
  return <div className="completion-page detailed-completion"><header><div><BadgeCheck/><div><h1>AI能力测评报告</h1><p>{task.name} · 本次结果根据实际作答生成</p></div></div></header>
    <section className="report-top-grid"><article className="result-score-card"><i className="report-tape"/><span className="laurel laurel-left">❧</span><span className="laurel laurel-right">❧</span><small>综合评分 <Sparkles/></small><strong>{result.score}<i>/100</i></strong><b>{result.level}　{verdict}</b><p>本次报告根据客观题、对话过程与实操完成情况综合计算。</p></article><article className="radar-paper"><h2>六维能力雷达图</h2><ResponsiveContainer width="100%" height={260}><RadarChart data={result.radar}><PolarGrid stroke="#ead9bc"/><PolarAngleAxis dataKey="name" tick={{className:"ripple-chart-label-10"}}/><Radar dataKey="score" stroke="#f0a717" fill="#ffc952" fillOpacity={.28}/></RadarChart></ResponsiveContainer></article><article className="result-notes"><i className="note-tape"/><i className="paperclip">⌕</i><h2>能力优势 <Sparkles/></h2>{result.strengths.map(x=><p key={x.name}><Check/>{x.name} <b>{x.score}分</b></p>)}<hr/><h2>提升方向 <Sparkles/></h2>{result.weaknesses.map(x=><p key={x.name}><Target/>{x.name}</p>)}</article></section>
    <section className="written-diagnosis"><h2>检测报告</h2><p>你本次共完成 {result.answered} 道题。当前优势集中在 <b>{result.strengths.map(x=>x.name).join("、")}</b>；需要优先提升 <b>{result.weaknesses.map(x=>x.name).join("、")}</b>。系统结合你的选择题准确率、对话回答完整度和实操任务完成情况生成本报告，后续训练建议将随真实作答持续更新。</p></section>
    <section className="dimension-details"><header><h2>六维能力详情与建议 <Sparkles/></h2><span>查看能力维度说明 <ArrowRight/></span></header><div>{result.radar.map((d,i)=>{const Icon=d.icon||dimensions[i].icon;return <article key={d.name} className={`dimension-tone-${i}`}><header><i><Icon/></i><span>{d.name}</span><strong>{d.score}<small>分</small></strong></header><p className="dimension-summary">{detailSummary[d.name]}</p><div className="dimension-advice"><b>建议：</b><p>{detailAdvice[d.name]}</p></div></article>})}</div></section>
    <section className="skill-tree-report"><div><h2>技能树点亮情况</h2><p>技能树结构保持完整，圆形节点会随各维度掌握度逐步点亮。</p><div className="skill-tree-visual"><div className="tree-crown">{result.radar.flatMap((d,i)=>[25,50,75,90].map((threshold,j)=>{const state=d.score>=threshold?"mastered":d.score>=threshold-18?"learning":"locked";return <i key={`${d.name}-${threshold}`} className={`skill-node ${state}`} style={{"--branch":i,"--node":j}} title={`${d.name} · ${threshold}% 掌握节点`}><b>{state==="mastered"?"✓":state==="learning"?"·":""}</b></i>}))}</div><i className="tree-trunk"/><i className="tree-ground"/><strong className="tree-core"><BookOpen/></strong>{result.radar.map((d,i)=><span key={d.name} className={`branch-label label-${i} ${d.score>=75?"mastered":d.score>=40?"learning":"locked"}`}>{d.name}</span>)}</div><div className="tree-legend"><span className="mastered">● 已掌握</span><span className="learning">● 学习中</span><span className="locked">● 未解锁</span></div></div><aside><h3>本次技能点亮变化</h3><section><h4>已掌握</h4>{result.radar.filter(d=>d.score>=75).map(d=><p key={d.name} className="lit">◆ {d.name}</p>)}{!result.radar.some(d=>d.score>=75)&&<p>暂无完全掌握维度</p>}</section><section><h4>持续掌握</h4>{result.radar.filter(d=>d.score>=40&&d.score<75).map(d=><p key={d.name} className="learning">● {d.name}</p>)}{!result.radar.some(d=>d.score>=40&&d.score<75)&&<p>暂无学习中维度</p>}</section><section><h4>仍需努力</h4>{result.radar.filter(d=>d.score<40).map(d=><p key={d.name}>○ {d.name}</p>)}</section></aside></section>
    <section className="completion-summary"><span>作答 {result.answered}/{task.questions} 题</span><span>客观题全对 {result.correct} 题</span><span>用时 {Math.floor(result.elapsed/60)}分{result.elapsed%60}秒</span>{result.performance.map(x=><span key={x.name}>{x.name} {x.score}分</span>)}</section>
    <footer><button onClick={onBack}>返回</button><button onClick={onTraining}>前往针对性训练</button></footer></div>
}

const assessmentQuestionId=question=>question?.recordQuestionId||question?.questionRecordId||question?.id||question?.questionId;
const assessmentQuestionType=question=>({SINGLE:"单选题",SINGLE_CHOICE:"单选题",MULTIPLE:"多选题",MULTIPLE_CHOICE:"多选题",TRUE_FALSE:"判断题",DIALOGUE:"对话题",PRACTICAL:"实操题"}[question?.type]||question?.type||"测评题");
const assessmentQuestionText=question=>question?.content||question?.contentSnapshot||question?.text||question?.title||"等待后端返回题目";
const cleanConversationText=value=>String(value||"")
  .replace(/\\([*_`#])/g,"$1")
  .replace(/^#{1,6}\s+/gm,"")
  .replace(/\*\*(.*?)\*\*/gs,"$1")
  .replace(/__(.*?)__/gs,"$1")
  .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g,"$1")
  .replace(/`([^`]+)`/g,"$1")
  .replace(/^\s*[-*+]\s+/gm,"• ")
  .trim();
const comparableConversationText=value=>cleanConversationText(value)
  .replace(/^\s*\d+[.、)]\s*/,"")
  .replace(/[\s\p{P}\p{S}]/gu,"")
  .toLowerCase();
const conversationMessageContent=message=>message?.content??message?.text??message?.message?.content??message?.message?.text??message?.message??"";
const conversationMessageIsUser=message=>{
  if(message?.isUser===true||message?.fromUser===true||message?.mine===true||message?.self===true)return true;
  if(message?.isAssistant===true||message?.fromAssistant===true||message?.fromAgent===true)return false;
  const candidates=[message?.role,message?.sender,message?.senderRole,message?.author,message?.authorRole,message?.senderType,message?.authorType,message?.actor,message?.source,message?.type,message?.message?.role,message?.message?.sender,message?.message?.senderRole];
  const roles=candidates.map(value=>String(value??"").trim().toUpperCase()).filter(Boolean);
  if(roles.some(role=>["USER","STUDENT","HUMAN","CLIENT","LEARNER","MEMBER"].some(value=>role===value||role.endsWith(`_${value}`))))return true;
  if(roles.some(role=>["ASSISTANT","AI","BOT","AGENT","MODEL","SYSTEM"].some(value=>role===value||role.endsWith(`_${value}`))))return false;
  return false;
};

function AgentAssessmentWorkbench({title,subtitle,questions,question,activeId,onSelect,messages,input,setInput,onSend,streaming,assistantText,finalAnswer,setFinalAnswer,onSubmitFinal,submitting,submitted,followUps=[],error,loading,finished,onFinish,onExit,preview=false,questionIndex=0,onSubmitOption,artifacts=[],onUploadFile,uploading=false}){
  const options=Array.isArray(question?.options)?question.options:safeList(question?.options);
  // 客观题（有选项且非对话/实操）：点击选项即自动提交答案并进入下一题
  const autoSubmitOption=options.length>0&&question?.type!=="DIALOGUE"&&question?.type!=="PRACTICAL";
  // 客观题模式：右栏只保留题目与选项（隐藏对话模型与提交面板）
  const isObjective=autoSubmitOption;
  // 实操题：右栏只保留题目、成果附件与提交区（隐藏对话模型）
  const isPractical=String(question?.type||"").toUpperCase()==="PRACTICAL";
  const visibleQuestions=questions.length?questions:(question?[question]:[]);
  const total=visibleQuestions.length||1;
  const questionText=cleanConversationText(assessmentQuestionText(question));
  const normalizedQuestion=comparableConversationText(questionText);
  const visibleMessages=messages.filter(message=>{
    const content=cleanConversationText(conversationMessageContent(message));
    if(!content)return false;
    const normalizedContent=comparableConversationText(content);
    const overlap=normalizedQuestion&&normalizedContent&&(normalizedQuestion.includes(normalizedContent)||normalizedContent.includes(normalizedQuestion));
    const similarity=overlap?Math.min(normalizedQuestion.length,normalizedContent.length)/Math.max(normalizedQuestion.length,normalizedContent.length):0;
    return normalizedContent!==normalizedQuestion&&similarity<.82;
  });
  return <main className={`agent-workbench ${preview?"preview":""} ${isObjective?" objective-mode":""}`}>
    <aside className="agent-workbench-left">
      <button className="agent-workbench-exit" onClick={onExit}><ChevronLeft/>{preview?"退出预览":"退出做题"}</button>
      <header><i><Bot/></i><div><h1>Agent 测评官</h1><p><span/>在线 · 正在引导{preview?"预览":"测评"}流程</p></div></header>
      <section className="agent-workbench-brief"><b>{title}</b><p>{subtitle}</p><small>共 {total} 题 · 对话与最终方案由平台记录</small></section>
      <nav className="agent-question-list">{visibleQuestions.map((item,index)=>{const id=assessmentQuestionId(item)||index;const selected=String(id)===String(activeId??assessmentQuestionId(question));const done=Boolean(item.completed||item.answered||item.finalAnswer||item.submitted);return <button className={`${selected?"active":""} ${done?"done":""}`} onClick={()=>onSelect(item,index)} key={id}><span>{done?<Check/>:index+1}</span><div><small>{assessmentQuestionType(item)}</small><b>{assessmentQuestionText(item)}</b></div><ChevronRight/></button>})}</nav>
      {submitted&&<section className="agent-timeline-card submission"><small>已提交的最终方案</small><p>{submitted}</p></section>}
      {followUps.map((item,index)=><section className="agent-timeline-card follow-up" key={item.id||index}><small>Agent 追问</small><p>{item.content||item.text||item.question||item}</p></section>)}
    </aside>
    <section className="agent-workbench-right">
      <header><span>{assessmentQuestionType(question)}</span></header>
      {error&&<p className="agent-workbench-error">{error}</p>}
      {loading?<div className="agent-workbench-empty">正在加载真实题目与会话记录…</div>:finished?<div className="agent-workbench-empty"><FileCheck2/><h2>本次题目已经完成</h2><button onClick={onFinish}>生成报告</button></div>:<>
        <section className="agent-question-detail"><small>作答要求：在对话中作答或提交整理后的方案，Agent 根据回答追问或进入下一题</small><h2>{questionText}</h2>{question?.description&&<p>{cleanConversationText(question.description)}</p>}</section>
        {options.length>0&&<div className="agent-option-list">{options.map((option,index)=><button className={finalAnswer===option?"selected":""} disabled={streaming||submitting} onClick={()=>{if(autoSubmitOption){onSubmitOption?onSubmitOption(option):setFinalAnswer(option)}else{setFinalAnswer(option)}}} key={option}><i>{String.fromCharCode(65+index)}</i>{option}</button>)}</div>}
        {!isObjective&&!isPractical&&<section className="agent-chat-panel"><header><span><Bot/>对话模型</span><small>已连接 · 对话过程自动保存</small></header><div className="agent-chat-stream">{visibleMessages.length?visibleMessages.map((message,index)=>{const isUser=conversationMessageIsUser(message);return <article className={isUser?"user":"assistant"} key={message.id||index}>{!isUser&&<Bot/>}<p>{cleanConversationText(conversationMessageContent(message))}</p>{isUser&&<UserRound/>}</article>}):<div className="agent-chat-placeholder">在这里提交回答，Agent 会根据你的作答继续提问。</div>}{assistantText&&<article className="assistant"><Bot/><p>{cleanConversationText(assistantText)}</p></article>}</div><div className="agent-chat-input"><textarea value={input} onChange={event=>setInput(event.target.value)} placeholder="向对话模型提问…"/><button disabled={streaming||!input.trim()} onClick={onSend}>{streaming?"回复中…":"发送"}</button></div></section>}
        {String(question?.type||"").toUpperCase()==="PRACTICAL"&&<section className="agent-artifact-panel"><header><FileCheck2/>成果附件</header><label className="agent-artifact-upload"><input type="file" disabled={uploading||submitting||streaming} onChange={event=>{const file=event.target.files?.[0];if(file)onUploadFile?.(file);event.target.value=""}}/><span>{uploading?"上传中…":"点击选择成果文件上传"}</span></label>{artifacts.length>0&&<div className="agent-artifact-list">{artifacts.map((item,index)=><p key={item.artifactId||index}><FileCheck2/>{item.fileName}</p>)}</div>}</section>}
        {!isObjective&&<section className="agent-final-panel"><header><FileCheck2/><b>提交最终方案</b></header><textarea value={finalAnswer} onChange={event=>setFinalAnswer(event.target.value)} placeholder="将你与模型对话后整理出的最终答案或技术方案填写在这里…"/><footer><span>提交后，Agent 将根据方案追问或进入下一题。</span><button disabled={submitting||streaming||!finalAnswer.trim()} onClick={onSubmitFinal}>{submitting?"提交中…":"提交方案"}</button></footer></section>}
      </>}
    </section>
  </main>;
}

function LiveAssessmentSession({task,onExit,onReportClose,notify}){
  const [state,setState]=useState(null),[input,setInput]=useState(""),[streaming,setStreaming]=useState(false),[assistantText,setAssistantText]=useState(""),[finalAnswer,setFinalAnswer]=useState(""),[submitted,setSubmitted]=useState(""),[submitting,setSubmitting]=useState(false),[activeQuestion,setActiveQuestion]=useState(null),[report,setReport]=useState(null),[error,setError]=useState(""),[artifacts,setArtifacts]=useState([]),[uploading,setUploading]=useState(false);
  const assessmentId=task.assessmentId||task.id;
  const applyConversation=input=>{const data=normalizeConversation(input);setState(current=>({...current,...data}));const current=data?.currentQuestion||data?.question;setActiveQuestion(current||null);setSubmitted(previous=>current?.finalAnswer||data?.finalAnswer||previous)};
  const load=async()=>{try{setError("");let data;try{data=await assessmentApi.conversation(assessmentId)}catch(err){if(err?.status!==404)throw err;data=await assessmentApi.conversation(assessmentId)}data=normalizeConversation(data||{});applyConversation(data);if(!data?.currentQuestion&&!data?.question&&!data?.finished){setStreaming(true);setAssistantText("");await sendAssessmentChat(assessmentId,"",{onDelta:delta=>setAssistantText(current=>current+delta),onState:update=>applyConversation(update||{}),onDone:async update=>{if(update&&typeof update==="object")applyConversation(update);try{applyConversation(await assessmentApi.conversation(assessmentId))}catch{}},onError:err=>setError(err?.message||"第一题加载失败")});setStreaming(false)}}catch(err){setStreaming(false);setError(err?.message||"测评会话加载失败")}};
  useEffect(()=>{load()},[assessmentId]);
  const currentQuestion=state?.currentQuestion||state?.question;
  const questions=state?.questions||state?.assignedQuestions||state?.questionList||(currentQuestion?[currentQuestion]:[]);
  const question=activeQuestion||currentQuestion;
  const activeId=assessmentQuestionId(question);
  useEffect(()=>{setArtifacts([])},[activeId]);
  const currentId=assessmentQuestionId(currentQuestion);
  const messages=question?.messages||(String(activeId)===String(currentId)?state?.messages||state?.conversation||[]:[]);
  const followUps=question?.followUps||state?.followUps||state?.followups||[];
  const selectQuestion=async(item,index)=>{const id=assessmentQuestionId(item);setActiveQuestion(item);setFinalAnswer(item.finalAnswer||"");setSubmitted(item.finalAnswer||"");setError("");if(String(id)===String(currentId))return;try{let next;try{next=await assessmentApi.selectQuestion(assessmentId,id)}catch(err){if(![404,405].includes(err?.status))throw err;next=await assessmentApi.questionWorkspace(assessmentId,id)}setState(current=>({...current,...next,currentIndex:index}));setActiveQuestion(next?.currentQuestion||next?.question||item)}catch(err){if([404,405].includes(err?.status)){/* 题目内容已在左侧列表中，辅助接口未接入时直接使用列表项 */}else{setError(err?.message||"该题暂时不能打开")}}};
  const sendContent=async(content,extra={})=>{
    if(!content||streaming||submitting)return false;
    setStreaming(true);setAssistantText("");setError("");
    try {
      await sendAssessmentChat(assessmentId,content,{
        onDelta:delta=>setAssistantText(current=>current+delta),
        onState:update=>{if(update)applyConversation({...state,...update})},
        onError:err=>setError(err?.message||"作答发送失败")
      },undefined,extra);
      applyConversation(await assessmentApi.conversation(assessmentId));
      setAssistantText("");return true;
    }catch(err){setError(err?.message||"作答发送失败，请确认记录后重试");return false}
    finally{setStreaming(false)}
  };
  // 对话模型窗口：纯 LLM 对话（普通聊天，不评分、不推进状态机），消息入库供 Agent 监测/自动保存。
  // 正式作答/追问答案必须在「提交最终方案」框提交（走 sendContent → chat/stream 状态机）。
  const send=async()=>{
    const content=input.trim();
    if(!content||streaming||submitting)return;
    setStreaming(true);setAssistantText("");setError("");
    try{
      await sendAssessmentPlainChat(assessmentId,content,{
        onDelta:delta=>setAssistantText(current=>current+delta),
        onError:err=>setError(err?.message||"对话发送失败")
      });
      applyConversation(await assessmentApi.conversation(assessmentId));
      setAssistantText("");setInput("");
    }catch(err){setError(err?.message||"对话发送失败，请确认记录后重试")}
    finally{setStreaming(false)}
  };
  const submitFinal=async()=>{const answer=finalAnswer.trim();if(await sendContent(answer,{artifactIds:artifacts.map(item=>item.artifactId)})){setSubmitted(answer);setFinalAnswer("");setArtifacts([])}};
  // 客观题点击选项：直接提交该选项（复用状态机），提交后自动进入下一题
  const submitOption=async option=>{if(await sendContent(option)){setSubmitted(option);setFinalAnswer("")}};
  // 实操题成果附件上传（image/code 存档，随最终方案提交）
  const uploadFile=async file=>{
    if(!file||uploading)return;
    setUploading(true);setError("");
    try{
      const data=await assessmentApi.uploadArtifact(assessmentId,assessmentQuestionId(question),file,"image");
      setArtifacts(previous=>[...previous,{artifactId:data.artifactId,fileName:data.fileName||file.name,fileUrl:data.fileUrl}]);
    }catch(err){setError(err?.message||"附件上传失败")}
    finally{setUploading(false)}
  };
  const complete=async()=>{try{await assessmentApi.complete(assessmentId);setReport(await assessmentApi.result(assessmentId))}catch(err){setError(err?.message||"生成报告失败")}};
  if(report)return <ReportSnapshotDetail snapshot={{...report,title:report.title||task.name||task.title,reportType:report.reportType||(String(task.source||"").includes("teacher")?"TASK":"ASSESSMENT")}} onClose={onReportClose||onExit} backLabel={task.returnLabel||"返回来源页面"}/>;
  return <AgentAssessmentWorkbench title={task.name||task.title||"AI能力测评"} subtitle={`${task.description||task.teacher||"Agent 测评"}${task.minutes?` · 限时 ${task.minutes} 分钟`:""}`} questions={questions} question={question} activeId={activeId} onSelect={selectQuestion} messages={messages} input={input} setInput={setInput} onSend={send} streaming={streaming} assistantText={assistantText} finalAnswer={finalAnswer} setFinalAnswer={setFinalAnswer} onSubmitFinal={submitFinal} onSubmitOption={submitOption} submitting={submitting} submitted={submitted} artifacts={artifacts} onUploadFile={uploadFile} uploading={uploading} followUps={followUps} error={error} loading={!state&&!error} finished={Boolean(state?.finished)} onFinish={complete} onExit={onExit} questionIndex={state?.currentIndex??state?.answeredCount??0}/>;
}

function ObjectiveTest({ task, onExit, onTraining, notify }){
  const {addActivity}=useCurrentUser();
  const {username}=useCurrentUser();
  const activityRecorded=useRef(false);
  const questions=Array.from({length:task.questions},(_,i)=>questionBank[i%questionBank.length]);
  const [index,setIndex]=useState(0); const [answers,setAnswers]=useState({}); const [overview,setOverview]=useState(false);
  const [complete,setComplete]=useState(false); const [input,setInput]=useState(""); const [messages,setMessages]=useState([]); const [tool,setTool]=useState("DeepSeek");
  const [secondsLeft,setSecondsLeft]=useState((task.minutes||20)*60);
  const totalSeconds=(task.minutes||20)*60;
  useEffect(()=>{const timer=setInterval(()=>setSecondsLeft(s=>s>0?s-1:0),1000);return()=>clearInterval(timer)},[]);
  useEffect(()=>{setMessages([]);setInput("")},[index]);
  const result=useMemo(()=>calculateAssessmentResult(questions,answers,totalSeconds-secondsLeft),[questions,answers,totalSeconds,secondsLeft]);
  useEffect(()=>{if(complete&&!activityRecorded.current){activityRecorded.current=true;addActivity({type:String(task.id).startsWith("training-")?"training":"assessment",score:result.score,minutes:Math.max(1,Math.ceil(result.elapsed/60))})}},[complete,addActivity,task,result]);
  const q=questions[index], picked=answers[index]||[];
  const choose=i=>setAnswers(a=>({...a,[index]:q.type==="多选题"?(picked.includes(i)?picked.filter(x=>x!==i):[...picked,i]):[i]}));
  const send=()=>{if(!input.trim())return;const followups={"提示词":"你提到了提示词设计。请进一步说明，你会用什么标准比较优化前后的输出质量？","数据":"如果不同权威来源给出的数字不一致，你会如何判断并在结果中呈现这种差异？","公平":"请再具体说明，你会选择哪些用户样本或指标来验证调整后的方案更加公平？"};const key=Object.keys(followups).find(k=>(q.prompt||"").includes(k));const reply=q.type==="对话式测评"?(followups[key]||"请结合一个更具体的操作步骤，继续说明你的判断依据。"):`已根据“${q.prompt.slice(0,18)}…”生成初稿。你可以继续提出修改要求。`;setMessages(m=>[...m,{role:"user",text:input},{role:"bot",text:reply}]);setAnswers(a=>({...a,[index]:[input]}));setInput("")};
  const clock=`${String(Math.floor(secondsLeft/60)).padStart(2,"0")}:${String(secondsLeft%60).padStart(2,"0")}`;
  if(complete)return <CompletionReport task={task} onBack={onExit} onTraining={onTraining} notify={notify} result={result}/>;
  return <div className={`objective-page paper-${q.type.includes("实操")?"practical":"dialogue"}`}><button className="exit-paper" onClick={onExit}><ChevronLeft/>退出做题</button><header className="objective-head"><div><div><h1>《{task.short||"伦理与工程"}》</h1><p>{task.teacher}　{task.deadline}</p></div></div><div className="question-progress"><b>第 <strong>{index+1}/{questions.length}</strong> 题</b><span><i style={{width:`${(index+1)/questions.length*100}%`}}/></span></div><div className={`time-left ${secondsLeft<300?"urgent":""}`}><span>剩余时间</span><b><Clock3/>{clock}</b></div></header>
    <main className={`question-card ${q.type.includes("测评")?"interactive-question":""}`}><div className="question-line"><span>{q.type}</span><h2>{q.text}</h2></div>{q.options?<div className="answers">{q.options.map((o,i)=><button key={o} className={picked.includes(i)?"selected":""} onClick={()=>choose(i)}><i>{String.fromCharCode(65+i)}</i><span>{o}</span></button>)}</div>:q.type==="对话式测评"?<div className="dialogue-assessment"><div className="chat-stream"><div className="chat bot"><Bot/><p>{q.prompt}</p></div>{messages.map((m,i)=><div key={i} className={`chat ${m.role}`} >{m.role==="bot"&&<Bot/>}<p>{m.text}</p>{m.role==="user"&&<UserRound/>}</div>)}</div><div className="chat-input"><textarea value={input} onChange={e=>setInput(e.target.value)} placeholder="请输入你的回答"/><span>{input.length} / 10000</span><button onClick={send}>发送 <ArrowRight/></button></div></div>:<div className="practical-assessment"><section><h3>任务要求</h3><p>{q.prompt}</p></section><div className="tool-picker"><label>选择 AI 工具</label>{["DeepSeek","Codex","GPT","豆包"].map(x=><button className={tool===x?"active":""} onClick={()=>setTool(x)} key={x}>{x}</button>)}<select aria-label="模型版本"><option>{tool==="DeepSeek"?"DeepSeek V3.1":tool==="Codex"?"GPT-5.3-Codex":tool==="GPT"?"GPT-5.2":"豆包 1.6 Pro"}</option><option>通用稳定版</option><option>快速响应版</option></select></div><div className="practice-chat">{messages.slice(-2).map((m,i)=><p key={i} className={m.role}>{m.text}</p>)}</div><div className="chat-input"><textarea value={input} onChange={e=>setInput(e.target.value)} placeholder={`向 ${tool} 输入提示词或修改要求`}/><button onClick={send}>发送 <ArrowRight/></button></div><button className="submit-task" onClick={()=>{setAnswers(a=>({...a,[index]:["done"]}));notify("实操任务成果已保存")}}>提交任务</button></div>}</main>
    <footer className="question-actions"><button className="paper-next" onClick={()=>index<questions.length-1?setIndex(i=>i+1):setComplete(true)}>{index===questions.length-1?"提交测评":"下一题"}<ChevronRight/></button></footer>
  </div>
}

function UserIdentityCard(){
  const fields=[["用户 ID","U-202608001"],["姓名","陈语溪"],["账号","2026001 / 138****2026"],["密码","••••••••"],["角色","学生"],["所属组织 ID","CLASS-A01-2026"],["注册时间","2026-07-15 09:30"],["最后登录时间","2026-08-06 10:24"]];
  return <section className="identity-fields"><div><h2>账户身份信息</h2><p>以下字段与用户权限及组织关系保持同步</p></div><div>{fields.map(([k,v])=><article key={k}><span>{k}</span><b>{v}</b></article>)}</div></section>
}

const teacherQuestions=[
  ["Q-OBJ-0001","单选题","提示词工程","一级·基础","已发布","5分","2026-08-05"],
  ["Q-OBJ-0002","多选题","AI伦理与合规","二级·进阶","草稿","8分","2026-08-04"],
  ["Q-PRC-0008","实操任务","AI工具使用","三级·挑战","已发布","20分","2026-08-02"],
  ["Q-DIA-0012","对话式","人机协同解决问题","二级·进阶","已发布","15分","2026-07-30"],
  ["Q-OBJ-0021","判断题","结果评估与优化","一级·基础","已停用","5分","2026-07-28"],
];

function PortalSidebar({portal,active,collapsed,onSelect,onToggle,onExit,primary,secondary=[],classSelector=null}){
  const portalLabel={student:"学生端",teacher:"管理端"}[portal]||"平台";
  const [mobile,setMobile]=useState(()=>window.matchMedia('(max-width: 1023px)').matches);
  const [open,setOpen]=useState(false);
  const sidebarRef=useRef(null),toggleRef=useRef(null);
  const close=()=>{setOpen(false);toggleRef.current?.focus()};
  useEffect(()=>{
    const media=window.matchMedia('(max-width: 1023px)');
    const sync=()=>{setMobile(media.matches);setOpen(false)};
    media.addEventListener('change',sync);
    return()=>media.removeEventListener('change',sync);
  },[]);
  useEffect(()=>{
    if(!mobile||!open)return;
    const panel=sidebarRef.current,content=panel.parentElement.querySelector('.dash-main');
    const previousOverflow=document.body.style.overflow,previousInert=content?.inert;
    document.body.style.overflow='hidden';
    if(content)content.inert=true;
    panel.querySelector('.portal-mobile-close')?.focus();
    const keyboard=e=>{
      if(e.key==='Escape'){e.preventDefault();close()}
      if(e.key==='Tab'){
        const items=[...panel.querySelectorAll('button,select,input,a[href],[tabindex="0"]')].filter(el=>!el.disabled&&el.getClientRects().length);
        const first=items[0],last=items.at(-1);
        if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus()}
        else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}
      }
    };
    document.addEventListener('keydown',keyboard);
    return()=>{document.body.style.overflow=previousOverflow;if(content)content.inert=previousInert;document.removeEventListener('keydown',keyboard)};
  },[mobile,open]);
  const select=name=>{onSelect(name);if(mobile)close()};
  return <>
    <button ref={toggleRef} className="portal-mobile-toggle" aria-label="打开导航" aria-expanded={open} aria-controls={`${portal}-navigation`} onClick={()=>setOpen(true)}><Menu/><span>导航</span></button>
    {mobile&&open&&<div className="portal-mobile-backdrop" onClick={close} aria-hidden="true"/>}
    <aside ref={sidebarRef} id={`${portal}-navigation`} className={`portal-sidebar ${portal}-portal-sidebar`} data-mobile={mobile?true:undefined} data-open={open} inert={mobile&&!open} role={mobile?'dialog':undefined} aria-modal={mobile&&open?true:undefined} aria-label={`${portalLabel}导航`}>
    <button className="portal-mobile-close" aria-label="关闭导航" onClick={close}><X/><span>关闭导航</span></button>
    <button className="portal-exit" title={`退出${portalLabel}`} onClick={onExit}><ChevronLeft/><span>退出{portalLabel}</span></button>
    <nav className="portal-primary">{primary.map(([name,Icon])=><button title={name} className={active===name?"active":""} onClick={()=>select(name)} key={name}><Icon/><span>{name}</span><ChevronRight/></button>)}</nav>
    {secondary.length>0&&<nav className="portal-secondary">{secondary.map(([name,Icon,target])=><button title={name} className={active===name||target?.includes(active)?"active":""} onClick={()=>select(name)} key={name}><Icon/><span>{name}</span><ChevronRight/></button>)}</nav>}
    {classSelector}
    <button className="portal-collapse" onClick={onToggle}>{collapsed?<PanelLeftOpen/>:<PanelLeftClose/>}<span>{collapsed?"展开导航":"收起导航"}</span></button>
  </aside></>
}

function TeacherDashboard({onLogout}){
  const {user,username}=useCurrentUser();
  const [tab,setTab]=useState("首页"),[query,setQuery]=useState(""),[apiQuestions,setApiQuestions]=useState([]);
  useEffect(()=>{let active=true;questionApi.list().then(list=>{if(!active)return;setApiQuestions((list||[]).map(q=>[`Q-${q.id}`,({SINGLE_CHOICE:"单选题",MULTIPLE_CHOICE:"多选题",TRUE_FALSE:"判断题",DIALOGUE:"对话式",PRACTICAL:"实操任务"})[q.type]||q.type,q.indicators?.[0]?.dimensionName||"未设置",`${q.difficulty||1}级`,q.isPublic?"已发布":"草稿",`${q.score||0}分`,String(q.updatedAt||"").slice(0,10)]))}).catch(()=>{});return()=>{active=false}},[]);
  const rows=(apiQuestions.length?apiQuestions:teacherQuestions).filter(r=>r.join(" ").includes(query));
  const teacherName=user.name||user.realName||username;
  const teacherMenu=[["首页",Home],["AI使用能力等级标准",BadgeCheck],["题库管理",Database],["任务发布",ClipboardList],["组织分析",BarChart3],["学生档案",UsersRound],["通知中心",Bell]];
  if(tab==="首页")return <main className="role-dashboard teacher-dashboard-v2"><aside><Brand dark/><div className="role-label"><School/>管理端</div>{teacherMenu.map(([x,I])=><button className={tab===x?"active":""} onClick={()=>setTab(x)} key={x}><I/>{x}</button>)}<button className="logout" onClick={onLogout}><LogOut/>退出登录</button></aside><section><header><div><span>管理工作台</span><h1>首页</h1></div><div className="assessment-tools"><button className="user-avatar"><UserRound/></button></div></header><div className="teacher-home"><section className="teacher-hero"><div><h1>Hi，{teacherName}</h1><p>通过系统化测评与个性化训练，全面提升学生的 AI 能力。</p><small>为未来的学习和职业发展打下坚实基础。</small></div><img src="/ripple-ai-assessment/landing/training-scene-teacher.png" alt="管理工作台"/></section><section className="teacher-managed"><header><h2>我管理的组织</h2><button onClick={()=>setTab("组织分析")}>更多组织 <ChevronRight/></button></header>{(user.teacherClasses||[]).length?<div>{user.teacherClasses.map((c,i)=><article key={c.id||c.name}><small>{String.fromCharCode(73+i)}</small><h3>{c.name}</h3><em>{c.level||"能力待评估"}</em><p><span>学生人数<b>{c.students||0}人</b></span><span>完成测评<b>{c.completed||0}人</b></span></p><label>任务完成率　{c.progress||0}%<i><b style={{width:`${c.progress||0}%`}}/></i></label></article>)}</div>:<div className="teacher-home-empty"><School/><b>暂无管理组织</b><span>创建或加入组织后，这里会显示组织整体情况</span></div>}</section><div className="teacher-home-grid"><section><header><h2>近期任务完成情况</h2><button onClick={()=>setTab("任务发布")}>查看任务 <ChevronRight/></button></header>{(user.teacherTasks||[]).length?user.teacherTasks.slice(0,4).map(t=><p key={t.title}><ClipboardList/><span><b>{t.title}</b><small>{t.className||"未指定组织"}</small></span><em>{t.progress||0}%</em></p>):<div className="teacher-mini-empty">暂无已发布任务</div>}</section><section><header><h2>最新资讯</h2></header>{[["AI 新趋势","AI 能力标准与课堂教学实践"],["能力培养","如何设计有效的 AI 实操任务"],["教学观察","未来职场必备的 AI 协同能力"]].map(([tag,title])=><p key={title}><i>{tag}</i><span><b>{title}</b><small>管理员教学与能力培养内容</small></span><ChevronRight/></p>)}</section></div><section className="teacher-level-strip"><header><div><h2>AI 使用能力等级标准</h2><p>基于科学的能力模型，划分为 5 个等级，帮助明确成长路径。</p></div><button onClick={()=>setTab("AI使用能力等级标准")}>了解完整标准 <ArrowRight/></button></header><div>{[["L1","基础认知者"],["L2","工具使用者"],["L3","应用进阶者"],["L4","人机协同专家"],["L5","创新应用者"]].map(([l,n],i)=><article className={i===2?"active":""} key={l}><b>{l}</b><span>{n}</span><small>{["了解 AI 基本概念","能够使用常见工具","掌握提示词与实践","善于协同创造价值","具备创新思维"][i]}</small></article>)}</div></section><section className="teacher-quick"><h2>快捷入口</h2><div>{[["01","AI 能力测评","直接做题",Target,"题库管理"],["02","智能训练场","进入选题界面",Zap,"题库管理"],["03","发布任务","进入任务发布",ClipboardList,"任务发布"]].map(([no,title,desc,I,to])=><button key={title} onClick={()=>setTab(to)}><strong>{no}</strong><span><b>{title}</b><small>{desc}</small></span><I/><ArrowRight/></button>)}</div></section></div></section></main>;
  return <main className="role-dashboard teacher-dashboard-v2"><aside><Brand dark/><div className="role-label"><School/>管理端</div>{teacherMenu.map(([x,I])=><button className={tab===x?"active":""} onClick={()=>setTab(x)} key={x}><I/>{x}</button>)}<button className="logout" onClick={onLogout}><LogOut/>退出管理端</button></aside><section><header><div><span>管理工作台</span><h1>{tab}</h1></div><div className="assessment-tools"><label><Search/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="搜索题目 ID、题型或维度"/></label><button className="user-avatar"><UserRound/></button></div></header>{tab==="题库管理"?<><div className="teacher-stats">{[[Database,"题库总量",rows.length],[FileCheck2,"公开题库",rows.filter(r=>r[4]==="已发布").length],[Edit3,"私人题库",rows.filter(r=>r[4]==="草稿").length],[Layers3,"组织题库",0]].map(([I,n,v])=><article key={n}><I/><span>{n}<b>{v}</b></span></article>)}</div><section className="question-bank"><div className="question-bank-head"><div><h2>题库列表</h2><p>公开题库、私人题库与组织题库统一管理</p></div><button><Plus/>新建题目</button></div><div className="question-table"><div className="question-row head">{["题目 ID","题型","所属维度","难度标签","状态","分值","更新时间","操作"].map(x=><b key={x}>{x}</b>)}</div>{rows.map(r=><div className="question-row" key={r[0]}>{r.map((v,i)=><span className={i===4?`status ${v}`:""} key={i}>{v}</span>)}<nav><button title="查看"><Eye/></button><button title="编辑"><Edit3/></button><button title="删除"><Trash2/></button></nav></div>)}</div></section></>:tab==="AI使用能力等级标准"?<section className="teacher-level-strip teacher-standard-full"><header><div><h2>AI 使用能力等级标准</h2><p>与学生端使用同一套五级能力标准，仅供滑动浏览。</p></div></header><div>{[["L1","基础认知者"],["L2","工具使用者"],["L3","应用进阶者"],["L4","人机协同专家"],["L5","创新应用者"]].map(([l,n],i)=><article key={l}><b>{l}</b><span>{n}</span><small>{["了解 AI 基本概念","能够使用常见工具","掌握提示词与实践","善于协同创造价值","具备创新思维"][i]}</small></article>)}</div></section>:<section className="role-placeholder"><div><Sparkles/><h2>{tab}</h2><p>{tab==="组织分析"?"查看等级分布、学生能力对比和组织能力档案。":tab==="任务发布"?"选择题目与组织，发布任务并查看任务进度。":tab==="学生档案"?"查看学生个人中心并定向发布任务。":"查看学生通知与系统通知。"}</p></div></section>}</section></main>
}

const safeList=value=>{
  if(Array.isArray(value))return value;
  if(!value)return [];
  try{return JSON.parse(value)}catch{return [String(value)]}
};

const skillTaxonomy=[
  ["AI基础认知",["AI基本概念理解","数据影响AI输出的认知","AI决策的基本逻辑","AI发展历程认知","AI能力边界认知","AI社会影响认知","批判性看待AI"]],
  ["提示词工程",["提示词书写"]],
  ["AI工具使用",["工具选型及局限性认知","工具使用能力","工作流整合","智能体编排"]],
  ["AI结果评估与优化",["评估AI结果","优化AI结果"]],
  ["人机协同解决问题",["与AI协作解决问题"]],
  ["AI伦理与合规",["伦理意识与价值判断","合规使用能力"]],
];
const fallbackTaxonomy=expandTaxonomy(skillTaxonomy.map(([dimension,points])=>({dimension,points:points.map(name=>({name}))})));

function TeacherQuestionBank({notify}){
  const {user}=useCurrentUser();
  const [copies,setCopies]=useState(()=>readQuestionCopies(user?.id,localStorage));
  const copying=useRef(false);
  const blank={type:"SINGLE_CHOICE",title:"",content:"",options:"",answer:"",rubric:"",difficulty:"",tags:[],assessmentPoints:[],visibility:"private"};
  const [detailQuestion,setDetailQuestion]=useState(null);
  const [view,setView]=useState("mine");
  const [mine,setMine]=useState([]);
  const [publicItems,setPublicItems]=useState([]);
  const [filterDimension,setFilterDimension]=useState(""),[filterPoint,setFilterPoint]=useState("");
  const [taxonomy,setTaxonomy]=useState(fallbackTaxonomy);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [query,setQuery]=useState("");
  const [formOpen,setFormOpen]=useState(false);
  const [editing,setEditing]=useState(null);
  const [saveMode,setSaveMode]=useState("overwrite");
  const [busy,setBusy]=useState(false);
  const [form,setForm]=useState(blank);

  const load=async()=>{
    setLoading(true);setError("");
    try{
      const [privateRows,publicRows,taxonomyRows]=await Promise.all([
        teacherData.myQuestions(),teacherData.publicQuestions(),teacherData.taxonomy(),
      ]);
      setMine(privateRows);setPublicItems(publicRows);
      if(taxonomyRows.length)setTaxonomy(taxonomyRows);
    }catch(err){setMine([]);setPublicItems([]);setError(err?.message||"题库加载失败")}finally{setLoading(false)}
  };
  useEffect(()=>{load()},[]);
  const openCreate=()=>{setEditing(null);setSaveMode("overwrite");setForm(blank);setFormOpen(true)};
  const openEdit=question=>{
    const item=normalizeQuestion(question);
    setEditing(item);setSaveMode("overwrite");
    setForm({...blank,...item,options:item.options.join("\n"),tags:item.tags,assessmentPoints:item.assessmentPoints});
    setFormOpen(true);
  };
  const objective=["SINGLE","SINGLE_CHOICE","TRUE_FALSE"].includes(form.type);
  const options=form.type==="TRUE_FALSE"?["正确","错误"]:form.options.split(/\r?\n/).map(item=>item.trim()).filter(Boolean);
  const canSave=Boolean(form.title.trim()&&form.content.trim()&&form.difficulty&&form.tags.length&&form.assessmentPoints.length&&(objective?(options.length>=2&&form.answer):(form.rubric.trim())));
  const togglePoint=(key,value)=>setForm(current=>({...current,[key]:current[key].includes(value)?current[key].filter(item=>item!==value):[...current[key],value]}));
  const toggleDimension=value=>setForm(current=>{
    const selected=current.tags.includes(value)?current.tags.filter(item=>item!==value):[...current.tags,value];
    const validPoints=taxonomy.filter(group=>selected.includes(group.dimension)).flatMap(group=>(group.points||[]).map(point=>point.name||point));
    return {...current,tags:selected,assessmentPoints:current.assessmentPoints.filter(point=>validPoints.includes(point)||(selected.includes(TOOL_DIMENSION)&&TOOL_POINTS.includes(point)))};
  });
  const submit=async event=>{
    event.preventDefault();if(!canSave)return;
    setBusy(true);
    const payload={...form,options,answer:objective?form.answer:"",rubric:objective?"":form.rubric};
    try{
      if(editing&&saveMode==="overwrite"){
        await teacherData.updateQuestion(editing.id,payload);
        if(payload.visibility!==editing.visibility)await (payload.visibility==="public"?teacherData.publishQuestion(editing.id):teacherData.makePrivate(editing.id));
      }else if(editing&&saveMode==="save-as")await teacherData.forkQuestion({...payload,visibility:"private"});
      else await teacherData.createQuestion(payload);
      setFormOpen(false);notify(editing&&saveMode==="save-as"?"已另存为新的私有题目":editing?"题目已保存":"题目已创建");await load();
    }catch(err){notify(err?.message||"保存失败，未产生临时题目")}finally{setBusy(false)}
  };
  const operate=async(action,question,success)=>{
    setBusy(true);
    try{await action(question.id);notify(success);await load()}catch(err){notify(err?.message||"操作失败，数据未更改")}finally{setBusy(false)}
  };
  const copyQuestion=async question=>{
    if(copying.current||isQuestionCopied(question,mine,copies))return;
    copying.current=true;setBusy(true);
    try{const copied=await teacherData.copyPublicQuestion(question.id);const id=copied.id||copied.questionId;
      setMine(current=>[...current.filter(item=>String(item.id)!==String(id)),normalizeQuestion({...copied,id})]);
      setCopies(current=>{const next={...current,[question.id]:id};saveQuestionCopies(user?.id,next,localStorage);return next});
    }catch(err){notify(err?.message||"复制失败，请重试")}finally{copying.current=false;setBusy(false)}
  };
  const source=view==="mine"?mine:publicItems;
  const bankFilters=filterOptions(taxonomy,source,filterDimension);
  const rows=filterQuestions(source,{query,dimension:filterDimension,point:filterPoint});
  const inMyLibrary=question=>isQuestionCopied(question,mine,copies);
  const typeName={DIALOGUE:"对话题",SINGLE:"单选题",SINGLE_CHOICE:"单选题",TRUE_FALSE:"判断题",PRACTICAL:"实操题"};
  return <div className="teacher-bank-page">
    <section className="teacher-bank-title"><div><span>QUESTION BANK</span><h1>题库管理</h1><p>公开题库汇集系统与管理员公开题目；私有题库只展示当前管理员拥有的题目。</p><strong className={`bank-view-status ${view}`}>当前在{view==="mine"?"私有题库":"公开题库"}</strong></div><aside><button onClick={()=>setView(view==="mine"?"public":"mine")}><Eye/>切换到{view==="mine"?"公开题库":"私有题库"}</button><button className="primary" onClick={openCreate}><Plus/>创建题目</button></aside></section>
    <div className="question-bank-filters"><label className="picker-filter">维度<select value={filterDimension} onChange={event=>{setFilterDimension(event.target.value);setFilterPoint("")}}><option value="">全部维度</option>{bankFilters.dimensions.map(name=><option key={name} value={name}>{name}</option>)}</select></label><label className="picker-filter">考察点<select value={filterPoint} onChange={event=>setFilterPoint(event.target.value)}><option value="">全部考察点</option>{bankFilters.points.map(name=><option key={name} value={name}>{pointDisplay(name)}</option>)}</select></label><label className="teacher-bank-search"><Search/><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="搜索题目内容、维度或考察点"/></label><button className="picker-filter-reset" onClick={()=>{setQuery("");setFilterDimension("");setFilterPoint("")}}>重置筛选</button></div>
    <section className="teacher-bank-table"><div className={`teacher-bank-row head ${view}`}>{(view==="mine"?["题目","维度","考察点","类型","分值","状态","操作"]:["公开题目","维度","考察点","题型","分值","操作"]).map(label=><b key={label}>{label}</b>)}</div>
      {loading?<div className="bank-empty">正在加载真实题库…</div>:error?<div className="bank-empty">{error}</div>:rows.length?rows.map(question=><div className={`teacher-bank-row ${view}`} key={question.id}><span className="question-summary"><button type="button" className="question-detail-link" onClick={()=>setDetailQuestion(question)}><strong>{questionPresentation(question).heading}</strong></button>{questionPresentation(question).subtitle&&<small>{questionPresentation(question).subtitle}</small>}{questionPresentation(question).difficulty&&<span className="question-difficulty">难度：{questionPresentation(question).difficulty}</span>}</span><span>{question.tags.join(" / ")||"未分类"}</span><span className="question-point-labels">{question.assessmentPoints.length?question.assessmentPoints.map(name=><span key={name}>{pointDisplay(name)}</span>):"未设置"}</span><span>{typeName[question.type]||question.type}</span><span className="question-score">{question.score??"—"}{question.score!=null?" 分":""}</span>{view==="mine"&&<span>{question.status==="offline"?"已下线":question.visibility==="public"?"公开":question.visibility==="private"?"私有":"状态未知"}</span>}<nav><button type="button" onClick={()=>setDetailQuestion(question)}>查看详情</button>{view==="mine"?<><button onClick={()=>openEdit(question)}>编辑</button>{question.canManageStatus!==false&&<>{question.visibility!=="unknown"&&<button disabled={busy} onClick={()=>operate(question.visibility==="public"?teacherData.makePrivate:teacherData.publishQuestion,question,question.visibility==="public"?"已转为私有题目":"题目已公开")}>{question.visibility==="public"?"转私有":"公开"}</button>}<button disabled={busy} onClick={()=>operate(teacherData.offlineQuestion,question,"题目已永久下线")}>下线</button></>}</>:<button disabled={busy||inMyLibrary(question)} onClick={()=>copyQuestion(question)}>{inMyLibrary(question)?<><Check/>已复制</>:<><LibraryBig/>复制到我的题库</>}</button>}</nav></div>):<div className="bank-empty">{view==="mine"?"私有题库暂无题目":"公开题库暂无题目"}</div>}
    </section>
    {detailQuestion&&<QuestionDetailDialog question={detailQuestion} onClose={()=>setDetailQuestion(null)}/>}
    {formOpen&&<div className="question-form-backdrop" onMouseDown={event=>event.target===event.currentTarget&&setFormOpen(false)}><form className="question-create-form" onSubmit={submit}><header><div><span>QUESTION EDITOR</span><h2>{editing?"编辑题目":"创建题目"}</h2></div><button type="button" onClick={()=>setFormOpen(false)}><X/></button></header>
      <div className="question-form-grid"><label>题型<select value={form.type} onChange={event=>setForm({...form,type:event.target.value,answer:"",options:"",rubric:""})}><option value="SINGLE_CHOICE">单选题</option><option value="TRUE_FALSE">判断题</option><option value="DIALOGUE">对话题</option><option value="PRACTICAL">实操题</option></select></label><label>难度 <b>*</b><select required value={form.difficulty} onChange={event=>setForm({...form,difficulty:event.target.value})}><option value="">请选择</option>{[1,2,3,4,5].map(level=><option value={level} key={level}>L{level}</option>)}</select></label></div>
      <label>题目名称 <b>*</b><input required value={form.title} onChange={event=>setForm({...form,title:event.target.value})} placeholder="请输入题目名称"/></label><label>{form.type==="PRACTICAL"?"任务要求":"题目内容"} <b>*</b><textarea required value={form.content} onChange={event=>setForm({...form,content:event.target.value})}/></label>
      {form.type==="SINGLE_CHOICE"&&<><label>选项（每行一项） <b>*</b><textarea required value={form.options} onChange={event=>setForm({...form,options:event.target.value,answer:""})}/></label><label>正确答案 <b>*</b><select required value={form.answer} onChange={event=>setForm({...form,answer:event.target.value})}><option value="">请选择正确答案</option>{options.map(option=><option value={option} key={option}>{option}</option>)}</select></label></>}
      {form.type==="TRUE_FALSE"&&<label>正确答案 <b>*</b><select required value={form.answer} onChange={event=>setForm({...form,answer:event.target.value})}><option value="">请选择正确答案</option><option value="正确">正确</option><option value="错误">错误</option></select></label>}
      {!objective&&<label>评分标准 <b>*</b><textarea required value={form.rubric} onChange={event=>setForm({...form,rubric:event.target.value})} placeholder="请输入后端 AI 评分使用的评分标准"/></label>}
      <fieldset><legend>能力维度 <b>*</b></legend><div>{taxonomy.map(group=><button type="button" className={form.tags.includes(group.dimension)?"active":""} onClick={()=>toggleDimension(group.dimension)} key={group.dimension}>{group.dimension}</button>)}</div></fieldset>
      <fieldset><legend>具体考察点 <b>*</b></legend><AssessmentPointChoices taxonomy={taxonomy} dimensions={form.tags} value={form.assessmentPoints} onToggle={name=>togglePoint("assessmentPoints",name)}/></fieldset>
      <label className="question-public-setting"><input type="checkbox" checked={form.visibility==="public"} onChange={event=>setForm({...form,visibility:event.target.checked?"public":"private"})}/>保存后公开（公开题仍同时保留在我的私有题库）</label>
      {editing&&<fieldset><legend>保存方式</legend><div><button type="button" className={saveMode==="overwrite"?"active":""} onClick={()=>setSaveMode("overwrite")}>覆盖当前私有副本</button><button type="button" className={saveMode==="save-as"?"active":""} onClick={()=>setSaveMode("save-as")}>另存为新的私有题目</button></div><small>无论选择哪种方式，公开来源题都不会被修改。</small></fieldset>}
      <footer><button type="button" onClick={()=>setFormOpen(false)}>取消</button><button className="primary" disabled={busy||!canSave}>{busy?"保存中…":editing?"保存修改":"保存题目"}</button></footer>
    </form></div>}
  </div>;
}

function TeacherClassesPage({notify}){
  const [detailQuestion,setDetailQuestion]=useState(null);
  const [creationError,setCreationError]=useState("");
  const [taxonomyError,setTaxonomyError]=useState("");
  const [weightsAvailable,setWeightsAvailable]=useState(false);
  useEffect(()=>{let alive=true;teacherData.creationOptions().then(options=>{if(alive)setWeightsAvailable(options?.assessmentPointWeights===true)}).catch(()=>{});return()=>{alive=false}},[]);
  const [classes,setClasses]=useState([]),[selected,setSelected]=useState(null),[members,setMembers]=useState([]),[classQuestions,setClassQuestions]=useState([]),[classified,setClassified]=useState({TRAINING:[]}),[bankErrors,setBankErrors]=useState({}),[loading,setLoading]=useState(true),[creating,setCreating]=useState(false),[saving,setSaving]=useState(false),[tab,setTab]=useState("组织成员"),[form,setForm]=useState({name:"",description:"",assessmentPointWeights:[]});
  const [memberError,setMemberError]=useState(""),[questionError,setQuestionError]=useState("");
  const [picker,setPicker]=useState(false),[privateQuestions,setPrivateQuestions]=useState([]),[questionQuery,setQuestionQuery]=useState(""),[pickerLoading,setPickerLoading]=useState(false),[addingQuestionId,setAddingQuestionId]=useState(null);
  const [pickerDimension,setPickerDimension]=useState(""),[pickerPoint,setPickerPoint]=useState("");
  const [memberAction,setMemberAction]=useState(null),[studentReports,setStudentReports]=useState(null),[studentReportDetail,setStudentReportDetail]=useState(null),[studentProfile,setStudentProfile]=useState(null);
  const emptyRemedial={title:"",description:"",deadlineMode:"UNLIMITED",deadlineAt:"",dimensions:[],assessmentPoints:[]};
  const [taxonomy,setTaxonomy]=useState([]),[taskForm,setTaskForm]=useState(emptyRemedial);
  const load=async()=>{setLoading(true);try{const rows=await teacherData.classes();const list=Array.isArray(rows)?rows:[];setClasses(list);setSelected(current=>list.find(item=>String(item.id)===String(current?.id))||list[0]||null)}catch(error){notify(error?.message||"组织加载失败")}finally{setLoading(false)}};
  const loadMembers=async classroom=>{if(!classroom){setMembers([]);setMemberError("");return}setMemberError("");try{const rows=await teacherData.members(classroom.id);setMembers(Array.isArray(rows)?rows:[])}catch(error){setMembers([]);setMemberError(error?.message||"组织成员加载失败")}};
  const loadClassQuestions=async classroom=>{if(!classroom){setClassQuestions([]);setQuestionError("");return}setQuestionError("");try{const rows=await teacherData.classQuestions(classroom.id);setClassQuestions(Array.isArray(rows)?rows:[])}catch(error){setClassQuestions([]);setQuestionError(error?.message||"组织测试题库加载失败")}};
  const loadBanks=async classroom=>{setBankErrors({});setClassified({TRAINING:[]});if(!classroom)return;try{const rows=await teacherData.classifiedClassQuestions(classroom.id,"TRAINING");setClassified({TRAINING:rows})}catch(error){setBankErrors({TRAINING:error?.status===404?"训练题库接口暂未部署，请更新后端后重试":error?.message||"训练题库加载失败，请重试"})}};
  const loadDetail=async classroom=>{if(!classroom){setMembers([]);setClassQuestions([]);setMemberError("");setQuestionError("");return}await Promise.allSettled([loadMembers(classroom),loadClassQuestions(classroom),loadBanks(classroom)])};
  const loadTaxonomy=async()=>{setTaxonomyError("");try{const rows=await teacherData.taxonomy();if(!rows.length)throw new Error("暂未获取到考察点，请重试");setTaxonomy(rows)}catch(error){setTaxonomyError(error?.message||"考察点加载失败，请重试")}};
  useEffect(()=>{load();loadTaxonomy()},[]);
  useEffect(()=>{loadDetail(selected)},[selected?.id]);
  const create=async event=>{
    event.preventDefault();if(!weightsAvailable||saving||!form.name.trim()||!weightSummary(form.assessmentPointWeights).valid)return;
    setSaving(true);setCreationError("");
    try{
      const result=await teacherData.createClass({name:form.name.trim(),description:form.description.trim(),pointWeights:weightPayload(form.assessmentPointWeights)});
      setCreating(false);setForm({name:"",description:"",assessmentPointWeights:[]});await load();if(result?.id)setSelected(result);
      notify("组织及考察点权重已保存，并生成邀请码");
    }catch(error){setCreationError(error?.message||"创建组织失败，请重试")}finally{setSaving(false)}
  };
  const refresh=async()=>{if(!selected)return;try{const result=await teacherData.refreshInvite(selected.id);const code=result?.code||result?.inviteCode;if(code){setSelected(current=>({...current,inviteCode:code}));setClasses(rows=>rows.map(item=>item.id===selected.id?{...item,inviteCode:code}:item));notify("新邀请码已生效，旧邀请码已失效")}}catch(error){notify(error?.message||"刷新邀请码失败")}};
  const removeMember=async member=>{if(!selected)return;try{const studentId=member.studentUserId||member.studentId||member.userId;await teacherData.removeMember(selected.id,studentId);await loadDetail(selected);notify("学生已移出组织")}catch(error){notify(error?.message||"移出失败")}};
  const openReports=async member=>{if(!selected)return;setMemberAction({type:"reports",member});setStudentReports(null);setStudentReportDetail(null);try{setStudentReports(await teacherData.studentReports(member.studentUserId||member.studentId||member.userId,selected.id))}catch(error){notify(error?.message||"学生报告加载失败")}};
  const openStudentProfile=async member=>{if(!selected)return;setMemberAction({type:"profile",member});setStudentProfile(null);try{setStudentProfile(await teacherData.studentProfile(selected.id,member.studentUserId||member.studentId||member.userId))}catch(error){notify(error?.message||"学生详情加载失败")}};
  const openStudentReport=async row=>{try{setStudentReportDetail({...row,...await assessmentApi.reportSnapshot(row.reportId||row.id||row.assessmentId)})}catch(error){notify(error?.message||"学生历史报告快照加载失败")}};
  const bankType=tab==="组织测试题库"?"TEST":"TRAINING";
  const currentBank=bankType==="TEST"?classQuestions:classified[bankType]||[];
  const classifiedIds=new Set(classified.TRAINING.map(item=>String(item.sourceQuestionId)));
  const openPicker=async()=>{setPicker(true);setQuestionQuery("");setPickerDimension("");setPickerPoint("");setPickerLoading(true);try{const [questions]=await Promise.all([teacherData.privateQuestions(),loadClassQuestions(selected)]);setPrivateQuestions(questions)}catch(error){setPrivateQuestions([]);notify(error?.message||"私有题库加载失败")}finally{setPickerLoading(false)}};
  const addQuestion=async question=>{if(bankType!=="TEST"||addingQuestionId!==null)return;setAddingQuestionId(question.id);try{const result=await teacherData.addClassQuestion(selected.id,question.id);await Promise.all([loadClassQuestions(selected),loadBanks(selected)]);notify(result?.trainingStatus==="failed"?result.trainingMessage:"原题已加入组织测试题库" )}catch(error){notify(error?.message||"加入题目失败")}finally{setAddingQuestionId(null)}};
  const generateTraining=async question=>{if(addingQuestionId!==null)return;setAddingQuestionId(question.id||question.questionId);try{await teacherData.generateTrainingQuestion(selected.id,question.id||question.questionId);await loadBanks(selected);notify("AI 变体已加入组织训练题库")}catch(error){notify(error?.message||"AI 变体生成失败，请重试")}finally{setAddingQuestionId(null)}};
  const toggleTask=(key,value)=>setTaskForm(current=>({...current,[key]:current[key].includes(value)?current[key].filter(item=>item!==value):[...current[key],value]}));
  const submitRemedial=async event=>{event.preventDefault();const studentId=memberAction.member.studentUserId||memberAction.member.studentId||memberAction.member.userId;if(!selected)return;if(!taskForm.dimensions.length||!taskForm.assessmentPoints.length)return notify("请选择能力维度和考察点");if(taskForm.deadlineMode==="TIMED"&&(!beijingLocalToIso(taskForm.deadlineAt)||new Date(beijingLocalToIso(taskForm.deadlineAt))<=new Date()))return notify("请选择未来的北京时间截止时间");setSaving(true);try{await teacherData.createRemedialTask(studentId,{classId:selected.id,title:taskForm.title.trim(),description:taskForm.description.trim(),deadlineAt:taskForm.deadlineMode==="TIMED"?beijingLocalToIso(taskForm.deadlineAt):null,dimensions:taskForm.dimensions,assessmentPoints:taskForm.assessmentPoints});notify("小灶任务已发布");setMemberAction(null);setTaskForm(emptyRemedial)}catch(error){notify(error?.message||"小灶任务发布失败")}finally{setSaving(false)}};
  const inClassBank=question=>classQuestions.some(item=>String(item.id||item.questionId)===String(question.id||question.questionId));
  const {dimensions:pickerDimensions,points:pickerPoints}=filterOptions(taxonomy,privateQuestions,pickerDimension);
  const shownQuestions=filterQuestions(privateQuestions,{query:questionQuery,dimension:pickerDimension,point:pickerPoint});
  const pickerTypeName={DIALOGUE:"对话题",SINGLE:"单选题",SINGLE_CHOICE:"单选题",TRUE_FALSE:"判断题",PRACTICAL:"实操题"};
  return <div className="teacher-class-page"><header><div><span>MANAGED ORGANIZATIONS</span><h1>我的组织</h1><p>管理组织邀请码、成员与组织题库。</p></div><button disabled={saving} onClick={()=>{setCreating(value=>!value);setCreationError("")}}><Plus/>{creating?"取消创建":"创建组织"}</button></header>
    {creating&&<form className="teacher-class-create" onSubmit={create}><label>组织名称 <b>*</b><input required value={form.name} onChange={event=>setForm({...form,name:event.target.value})}/></label><label>组织说明<textarea value={form.description} onChange={event=>setForm({...form,description:event.target.value})}/></label>{!weightsAvailable&&<p role="status">当前服务尚未开放组织考察点权重设置；创建组织暂不可提交。</p>}<OrganizationWeights taxonomy={taxonomy} value={form.assessmentPointWeights} onChange={assessmentPointWeights=>{setForm(current=>({...current,assessmentPointWeights}));setCreationError("")}} disabled={saving||!weightsAvailable} error={taxonomyError} onRetry={loadTaxonomy}/>{creationError&&<p className="organization-create-error" role="alert">{creationError}</p>}<button disabled={!weightsAvailable||saving||!form.name.trim()||!weightSummary(form.assessmentPointWeights).valid}><FileCheck2/>{saving?"正在保存…":"保存并生成邀请码"}</button></form>}
    {classes.length>0&&<nav><span>切换组织 · 共 {classes.length} 个</span>{classes.map(item=><button className={selected?.id===item.id?"active":""} onClick={()=>setSelected(item)} key={item.id}>{item.name}</button>)}</nav>}
    <section>{loading?<div className="bank-empty">正在加载组织…</div>:selected?<><header><div><h2>{selected.name}</h2><small>{selected.description||"暂无组织说明"} · 学生 {members.length} 人</small></div><div><span>邀请码：<b>{selected.inviteCode||"暂无"}</b></span><button onClick={refresh}>刷新邀请码</button><button onClick={()=>loadDetail(selected)}>刷新数据</button></div></header>{readWeights(selected.pointWeights||selected.assessmentPointWeights).length>0&&<details className="organization-saved-weights"><summary>组织考察点权重</summary><ul>{readWeights(selected.pointWeights||selected.assessmentPointWeights).map(row=><li key={`${row.dimension}-${row.assessmentPoint}`}><span>{row.dimension} · {row.assessmentPoint}</span><b>{row.weight}/10</b></li>)}</ul></details>}<nav className="teacher-class-tabs"><button className={tab==="组织成员"?"active":""} onClick={()=>setTab("组织成员")}><UserRound/>组织成员 · {members.length}</button>{[["组织测试题库",questionError?"加载失败":classQuestions.length],["组织训练题库",bankErrors.TRAINING?"加载失败":classified.TRAINING.length]].map(([label,count])=><button key={label} className={tab===label?"active":""} onClick={()=>setTab(label)}><BookOpen/>{label} · {count}</button>)}</nav>
      {tab==="组织成员"?<div className="teacher-member-list">{memberError?<div className="bank-empty"><p>{memberError}</p><button onClick={()=>loadMembers(selected)}>重新加载组织成员</button></div>:members.length?members.map(member=><article key={member.id||member.studentUserId||member.studentId||member.userId}><UserRound/><span><b>{member.name||member.realName||member.nickname||member.username||"未命名学生"}</b><small>能力等级：{member.abilityLevel||member.level||"待后端返回"}</small></span><button onClick={()=>openStudentProfile(member)}>详情</button><button onClick={()=>{setMemberAction({type:"remedial",member});setTaskForm(emptyRemedial)}}>小灶</button><button onClick={()=>removeMember(member)}><Trash2/>移出</button></article>):<div className="bank-empty">暂无学生，请将邀请码发送给学生加入</div>}</div>:<div className="teacher-member-list"><header className="class-question-tools"><span>{bankType==="TEST"?"教师加入的原题，用于组织测试":"测试原题对应的 AI 变体题，用于训练"}</span>{bankType==="TEST"&&<button onClick={openPicker}><Plus/>加入题目</button>}</header>{bankErrors[bankType]&&<div className="bank-empty"><p>{bankErrors[bankType]}</p><button onClick={()=>loadBanks(selected)}>重新加载</button></div>}{bankType==="TEST"&&questionError?<div className="bank-empty"><p>{questionError}</p><button onClick={()=>loadClassQuestions(selected)}>重新加载组织测试题库</button></div>:currentBank.length?currentBank.map((question,index)=><article key={question.id||question.questionId||`class-question-${index}`}><BookOpen/><span><button type="button" className="question-detail-link" onClick={()=>setDetailQuestion(question)}>{question.title||question.name||"未命名题目"}</button><small>{Array.isArray(question.tags)&&question.tags.length?question.tags.join(" / "):"未分类"}</small></span>{bankType==="TEST"&&!classifiedIds.has(String(question.id||question.questionId))&&<button disabled={addingQuestionId!==null} onClick={()=>generateTraining(question)}>{addingQuestionId===(question.id||question.questionId)?"生成中…":"生成训练变体"}</button>}{question.id||question.questionId?<button onClick={()=>(bankType==="TEST"?teacherData.removeClassQuestion(selected.id,question.id||question.questionId):teacherData.removeClassifiedQuestion(selected.id,bankType,question.id||question.questionId)).then(()=>loadDetail(selected)).catch(error=>notify(error?.message||"移除失败"))}>移出题库</button>:<small>缺少题目 ID，暂不可操作</small>}</article>):!bankErrors[bankType]&&<div className="bank-empty">{bankType==="TEST"?"暂无测试原题，请加入题目":"暂无 AI 变体训练题"}</div>}</div>}
    </>:<div className="bank-empty">暂无组织，点击右上角创建组织</div>}</section>
    {detailQuestion&&<QuestionDetailDialog question={detailQuestion} onClose={()=>setDetailQuestion(null)} action={picker?{label:inClassBank(detailQuestion)?"已加入组织题库":addingQuestionId===detailQuestion.id?"加入中…":"加入组织题库",disabled:addingQuestionId!==null||inClassBank(detailQuestion),onClick:()=>addQuestion(detailQuestion)}:null}/>}
    {picker&&<div className="task-dialog-backdrop class-question-picker-backdrop" onMouseDown={event=>event.target===event.currentTarget&&setPicker(false)}><section className="task-result-dialog class-question-picker"><header><div><h2>加入{bankType==="TEST"?"组织测试题库":"组织训练题库"}</h2><p>加入的原题用于组织测试，原题仍保留在管理员私有题库；加入时会生成对应 AI 训练变体</p></div><button onClick={()=>setPicker(false)}><X/></button></header><div className="class-question-picker-filters"><label className="teacher-bank-search"><Search/><input value={questionQuery} onChange={event=>setQuestionQuery(event.target.value)} placeholder="搜索名称、内容、维度或考察点"/></label><label className="picker-filter">维度<select value={pickerDimension} onChange={event=>{setPickerDimension(event.target.value);setPickerPoint("")}}><option value="">全部维度</option>{pickerDimensions.map(name=><option key={name} value={name}>{name}</option>)}</select></label><label className="picker-filter">考察点<select value={pickerPoint} onChange={event=>setPickerPoint(event.target.value)}><option value="">全部考察点</option>{pickerPoints.map(name=><option key={name} value={name}>{pointDisplay(name)}</option>)}</select></label><button className="picker-filter-reset" onClick={()=>{setQuestionQuery("");setPickerDimension("");setPickerPoint("")}}>重置筛选</button></div><div className="class-question-picker-list">{pickerLoading?<div className="task-result-empty">正在加载真实私有题库…</div>:shownQuestions.length?shownQuestions.map(question=>{const added=inClassBank(question);return <article key={question.id}><div><button type="button" className="question-detail-link" onClick={()=>setDetailQuestion(question)}><strong>{question.title||"未命名题目"}</strong></button><p>{question.content||"暂无题目内容"}</p><small><span>{pickerTypeName[question.type]||question.type||"题型未知"}</span><span>{question.difficulty?`L${question.difficulty}`:"难度未知"}</span><span>{question.visibility==="public"?"公开":"私有"}</span></small><small>维度：{(question.tags||[]).join(" / ")||"未设置"}</small><small>考察点：{(question.assessmentPoints||[]).map(pointDisplay).join(" / ")||"未设置"}</small></div><button type="button" onClick={()=>setDetailQuestion(question)}>查看详情</button><button className={added?"added":""} disabled={added||addingQuestionId===question.id} onClick={()=>addQuestion(question)}>{added?"已在组织测试题库":addingQuestionId===question.id?"加入中…":"加入题目"}</button></article>}):<div className="task-result-empty">没有符合条件的私有题目</div>}</div></section></div>}
    {memberAction?.type==="profile"&&<div className="task-dialog-backdrop" onMouseDown={event=>event.target===event.currentTarget&&setMemberAction(null)}><section className="task-result-dialog task-result-detail"><header><div><h2>{memberAction.member.name||memberAction.member.realName||"学生"}的能力画像</h2><p>{selected?.name||"当前组织"} · 仅展示当前组织数据</p></div><button onClick={()=>setMemberAction(null)}><X/></button></header>{studentProfile?<div className="teacher-student-report-list"><article><div><small>当前综合能力</small><b>{studentProfile.profile?.latest?.levelName||studentProfile.profile?.latest?.level||"等待启程"}</b></div><span>{studentProfile.profile?.latest?.averageScore==null?"—":`${Number(studentProfile.profile.latest.averageScore).toFixed(1)} 分`}</span><button onClick={()=>openReports(memberAction.member)}>历史报告</button></article>{safeList(studentProfile.profile?.dimensions).map(row=><article key={row.dimension}><div><small>能力维度</small><b>{row.dimension}</b></div><span>{row.score==null?"—":`${Number(row.score).toFixed(1)} 分`}</span></article>)}</div>:<div className="task-result-empty">正在加载学生能力画像…</div>}<footer><button onClick={()=>{setMemberAction({type:"remedial",member:memberAction.member});setTaskForm(emptyRemedial)}}>布置小灶</button><button onClick={()=>setMemberAction(null)}>关闭</button></footer></section></div>}
    {memberAction?.type==="reports"&&!studentReportDetail&&<div className="task-dialog-backdrop" onMouseDown={event=>event.target===event.currentTarget&&setMemberAction(null)}><section className="task-result-dialog task-result-detail"><header><div><h2>{memberAction.member.name||memberAction.member.realName||"学生"}的报告中心</h2><p>所有报告、测评报告与任务报告</p></div><button onClick={()=>setMemberAction(null)}><X/></button></header>{studentReports?<div className="teacher-student-report-list">{safeList(studentReports).length?safeList(studentReports).map(row=><article key={row.reportId||row.id||row.assessmentId}><div><small>{reportTypeOf(row)}</small><b>{row.title||row.name||row.taskTitle||"历史报告"}</b></div><span>{row.score??row.averageScore??row.totalScore??"—"} 分</span><button onClick={()=>openStudentReport(row)}>查看报告</button></article>):<div className="task-result-empty">该学生暂无历史报告</div>}</div>:<div className="task-result-empty">正在加载学生真实报告…</div>}</section></div>}
    {studentReportDetail&&<ReportSnapshotDetail snapshot={studentReportDetail} heading="学生报告详情" onClose={()=>setStudentReportDetail(null)}/>} 
    {memberAction?.type==="remedial"&&<div className="task-dialog-backdrop"><form className="task-publish-dialog" onSubmit={submitRemedial}><header><div><h2>小灶任务</h2><p>发给【{memberAction.member.name||memberAction.member.realName||"学生"}】同学的小灶任务</p></div><button type="button" onClick={()=>setMemberAction(null)}><X/></button></header><label>任务名称 <b>*</b><input required value={taskForm.title} onChange={event=>setTaskForm({...taskForm,title:event.target.value})}/></label><label>任务说明<textarea value={taskForm.description} onChange={event=>setTaskForm({...taskForm,description:event.target.value})}/></label><label>截止时间<select value={taskForm.deadlineMode} onChange={event=>setTaskForm({...taskForm,deadlineMode:event.target.value})}><option value="UNLIMITED">无限期</option><option value="TIMED">指定时间</option></select></label>{taskForm.deadlineMode==="TIMED"&&<label>截止日期和时间（北京时间） <b>*</b><input required type="datetime-local" value={taskForm.deadlineAt} onChange={event=>setTaskForm({...taskForm,deadlineAt:event.target.value})}/></label>}<fieldset><legend>能力维度 <b>*</b></legend><div>{taxonomy.map(group=><button type="button" className={taskForm.dimensions.includes(group.dimension)?"active":""} onClick={()=>toggleTask("dimensions",group.dimension)} key={group.dimension}>{group.dimension}</button>)}</div></fieldset><fieldset><legend>考察点 <b>*</b></legend><AssessmentPointChoices taxonomy={taxonomy} dimensions={taskForm.dimensions} value={taskForm.assessmentPoints} onToggle={name=>toggleTask("assessmentPoints",name)}/></fieldset><footer><button type="button" onClick={()=>setMemberAction(null)}>取消</button><button className="primary" disabled={saving}>发布小灶任务</button></footer></form></div>}
  </div>;
}

function TeacherTaskManagement({notify}){
  const emptyForm={classId:"",title:"",description:"",deadlineMode:"UNLIMITED",deadlineAt:"",dimensions:[],assessmentPoints:[]};
  const [classes,setClasses]=useState([]),[tasks,setTasks]=useState([]),[results,setResults]=useState({}),[taxonomy,setTaxonomy]=useState(fallbackTaxonomy),[statistics,setStatistics]=useState(null),[loading,setLoading]=useState(true),[publishing,setPublishing]=useState(false),[statusFilter,setStatusFilter]=useState("全部"),[saving,setSaving]=useState(false),[form,setForm]=useState(emptyForm),[resultTask,setResultTask]=useState(null),[resultDetail,setResultDetail]=useState(null);
  const load=async()=>{setLoading(true);try{const [managed,taxonomyRows,stats]=await Promise.all([teacherData.classes(),teacherData.taxonomy().catch(()=>[]),teacherData.taskStatistics().catch(()=>null)]);const classRows=Array.isArray(managed)?managed:[];setClasses(classRows);if(taxonomyRows.length)setTaxonomy(taxonomyRows);setStatistics(stats);const taskLists=await Promise.all(classRows.map(item=>teacherData.classTasks(item.id).catch(()=>[])));const all=taskLists.flat().map(task=>({...task,classId:task.classId||classRows.find(item=>(taskLists[classRows.indexOf(item)]||[]).some(row=>row.id===task.id))?.id,className:classRows.find(item=>String(item.id)===String(task.classId))?.name||classRows.find(item=>(taskLists[classRows.indexOf(item)]||[]).some(row=>row.id===task.id))?.name||"未命名组织"}));setTasks(all);const resultLists=await Promise.all(all.map(task=>teacherData.taskResults(task.id).catch(()=>[])));setResults(Object.fromEntries(all.map((task,index)=>[String(task.id),Array.isArray(resultLists[index])?resultLists[index]:[]])))}catch(error){notify(error?.message||"任务数据加载失败")}finally{setLoading(false)}};
  useEffect(()=>{load()},[]);
  const done=row=>["completed","completed_with_scoring_failure"].includes(row.status);
  const metrics={published:statistics?.publishedCount??tasks.length,running:statistics?.activeCount??tasks.filter(task=>["active","in_progress"].includes(String(task.status).toLowerCase())).length,students:statistics?.participantCount,completion:statistics?.averageCompletionRate};
  const taskStatus=task=>["ended","closed","completed","expired"].includes(String(task.status||"").toLowerCase())||Boolean((task.deadlineAt||task.deadline)&&new Date(task.deadlineAt||task.deadline)<=new Date());
  const shownTasks=tasks.filter(task=>statusFilter==="全部"||(statusFilter==="已结束"?taskStatus(task):!taskStatus(task)));
  const operateTask=async(task,action)=>{if(!window.confirm(action==="delete"?`确定删除任务「${task.title}」吗？`:`确定结束任务「${task.title}」吗？`))return;setSaving(true);try{await(action==="delete"?teacherData.deleteTask(task.id):teacherData.endTask(task.id));await load();notify(action==="delete"?"任务已删除":"任务已结束")}catch(error){notify(error?.status===404?"后端尚未提供该操作接口，任务未改变":error?.message||"操作失败，任务未改变")}finally{setSaving(false)}};
  const toggle=(key,value)=>setForm(current=>{const next=current[key].includes(value)?current[key].filter(item=>item!==value):[...current[key],value];if(key!=="dimensions")return {...current,[key]:next};const allowed=taxonomy.filter(group=>next.includes(group.dimension)).flatMap(group=>group.points.map(point=>point.name||point));return {...current,dimensions:next,assessmentPoints:current.assessmentPoints.filter(point=>allowed.includes(point))}});
  const publish=async event=>{event.preventDefault();if(!form.classId)return notify("请选择发布组织");if(!form.dimensions.length)return notify("请至少选择一个能力维度");if(!form.assessmentPoints.length)return notify("请至少选择一个考察点");if(form.deadlineMode==="TIMED"&&(!beijingLocalToIso(form.deadlineAt)||new Date(beijingLocalToIso(form.deadlineAt))<=new Date()))return notify("请选择未来的北京时间截止时间");setSaving(true);try{await teacherData.createTask(form.classId,{title:form.title.trim(),description:form.description.trim(),deadlineAt:form.deadlineMode==="TIMED"?beijingLocalToIso(form.deadlineAt):null,dimensions:form.dimensions,assessmentPoints:form.assessmentPoints});notify("任务发布成功");setForm(emptyForm);setPublishing(false);await load()}catch(error){notify(error?.message||"任务发布失败")}finally{setSaving(false)}};
  const openResults=task=>setResultTask({...task,rows:results[String(task.id)]||[]});
  const openDetail=async row=>{try{let detail;try{detail=await assessmentApi.reportSnapshot(row.reportId||row.assessmentId)}catch(error){if(error?.status!==404)throw error;detail=await assessmentApi.teacherAssessmentDetail(row.assessmentId)}setResultDetail({...row,...detail,reportType:"TASK"})}catch(error){notify(error?.message||"任务报告详情加载失败")}};
  return <div className="teacher-task-manage">
    <header className="task-manage-title"><div><span>ASSESSMENT TASKS</span><h1>任务管理</h1><p>发布任务并查看学生完成情况与结果。</p></div><button onClick={()=>setPublishing(true)}><Plus/>发布任务</button></header>
    <section className="task-manage-metrics">{[[ClipboardList,"已发布任务",metrics.published,"gold"],[Play,"进行中任务",metrics.running,"orange"],[UsersRound,"参与学生",metrics.students==null?"待后端统计":metrics.students,"blue"],[Gauge,"平均完成率",metrics.completion==null?"待后端统计":`${metrics.completion}%`,"green"]].map(([Icon,label,value,tone])=><article className={tone} key={label}><i><Icon/></i><span>{label}<b>{loading?"—":value}</b></span></article>)}</section>
    <nav className="task-status-tabs">{["全部","进行中","已结束"].map(label=><button key={label} className={statusFilter===label?"active":""} onClick={()=>setStatusFilter(label)}>{label}</button>)}</nav>
    <section className="task-manage-list">{loading?<div className="task-manage-empty">正在加载任务…</div>:shownTasks.length?shownTasks.map((task,index)=><article key={task.id}><div><h2>{index+1}. {task.title}</h2><p>{task.description||"无"}</p></div><aside><span>{task.className}</span><i/><span>{task.taskType==="REMEDIAL"?"小灶任务":"组织任务"}</span><span>{task.deadlineAt?`截止 ${beijingDeadlineLabel(task.deadlineAt)}`:"无限期"}</span><span>{taskStatus(task)?"已结束":"进行中"}</span><button onClick={()=>openResults(task)}><Eye/>查看结果</button>{!taskStatus(task)&&<button disabled={saving} onClick={()=>operateTask(task,"end")}>结束任务</button>}<button disabled={saving} onClick={()=>operateTask(task,"delete")}>删除</button></aside></article>):<div className="task-manage-empty"><ClipboardList/><h2>还没有发布任务</h2><p>请先在“我的组织”中建立组织题库，再发布任务。</p></div>}</section>
    {publishing&&<div className="task-dialog-backdrop" onMouseDown={e=>e.target===e.currentTarget&&setPublishing(false)}><form className="task-publish-dialog" onSubmit={publish}><header><div><span>NEW TASK</span><h2>发布任务</h2><p>从组织训练题库生成学生任务</p></div><button type="button" onClick={()=>setPublishing(false)}><X/></button></header><label>发布组织 <b>*</b><select required value={form.classId} onChange={e=>setForm({...form,classId:e.target.value})}><option value="">请选择组织</option>{classes.map(item=><option value={item.id} key={item.id}>{item.name}</option>)}</select></label><label>任务名称 <b>*</b><input required value={form.title} onChange={e=>setForm({...form,title:e.target.value})} placeholder="请输入任务名称"/></label><label>任务说明<textarea value={form.description} onChange={e=>setForm({...form,description:e.target.value})} placeholder="请输入任务说明（选填）"/></label><label>截止时间 <b>*</b><select value={form.deadlineMode} onChange={e=>setForm({...form,deadlineMode:e.target.value})}><option value="UNLIMITED">无限期</option><option value="TIMED">指定时间</option></select></label>{form.deadlineMode==="TIMED"&&<label>截止日期和时间（北京时间） <b>*</b><input required type="datetime-local" value={form.deadlineAt} onChange={e=>setForm({...form,deadlineAt:e.target.value})}/></label>}<fieldset><legend>能力维度（可多选） <b>*</b></legend><div>{taxonomy.map(group=><button type="button" className={form.dimensions.includes(group.dimension)?"active":""} onClick={()=>toggle("dimensions",group.dimension)} key={group.dimension}>{group.dimension}</button>)}</div></fieldset><fieldset><legend>考察点（可多选） <b>*</b></legend><AssessmentPointChoices taxonomy={taxonomy} dimensions={form.dimensions} value={form.assessmentPoints} onToggle={name=>toggle("assessmentPoints",name)}/></fieldset><footer><button type="button" onClick={()=>setPublishing(false)}>取消</button><button className="primary" disabled={saving||!form.dimensions.length||!form.assessmentPoints.length}>{saving?"发布中…":"保存并发布"}</button></footer></form></div>}
    {resultTask&&!resultDetail&&<div className="task-dialog-backdrop" onMouseDown={e=>e.target===e.currentTarget&&setResultTask(null)}><section className="task-result-dialog"><header><div><span>TASK RESULTS</span><h2>{resultTask.title}</h2><p>{resultTask.className} · 共 {resultTask.rows.length} 份测评</p></div><button onClick={()=>setResultTask(null)}><X/></button></header>{resultTask.rows.length?resultTask.rows.map(row=><article key={row.assessmentId}><div><b>{row.studentNickname||row.studentName||row.studentAccount||"学生"}</b><small>{done(row)?"已完成":taskStatus(resultTask)?"未完成":"进行中"}</small></div><span>等级：{row.abilityLevel||row.level||"待后端返回"}</span><strong>{done(row)?`${row.averageScore??row.totalScore??"—"} 分`:"—"}</strong>{done(row)?<button className="detail-button" onClick={()=>openDetail(row)}>查看详情</button>:<span>不生成报告</span>}</article>):<div className="task-result-empty">暂无学生参加此任务</div>}<footer><button onClick={()=>setResultTask(null)}>关闭</button></footer></section></div>}
    {resultDetail&&<ReportSnapshotDetail snapshot={{...resultDetail,title:resultDetail.task?.title||resultTask?.title||resultDetail.title}} heading="学生任务报告" onClose={()=>setResultDetail(null)}/>} 
  </div>;
}

function TeacherPreview({mode,onExit,notify}){
  const [session,setSession]=useState(null),[loading,setLoading]=useState(true),[input,setInput]=useState(""),[messages,setMessages]=useState([]),[finalAnswer,setFinalAnswer]=useState(""),[submitted,setSubmitted]=useState(""),[activeQuestion,setActiveQuestion]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(""),[report,setReport]=useState(null);
  const previewId=useRef(null);
  const title=mode==="assessment"?"Agent能力测评":"智能训练场";
  useEffect(()=>{let alive=true;teacherData.createPreview(mode).then(data=>{if(!alive)return;previewId.current=data.id;setSession(data);setActiveQuestion(data?.currentQuestion||data?.question||data?.questions?.[data?.currentIndex||0])}).catch(err=>{if(alive)setError(err?.message||"管理员预览接口尚未提供")}).finally(()=>alive&&setLoading(false));return()=>{alive=false;if(previewId.current)teacherData.discardPreview(previewId.current).catch(()=>{})}},[mode]);
  const currentQuestion=session?.currentQuestion||session?.question||session?.questions?.[session?.currentIndex||0];
  const questions=session?.questions||session?.assignedQuestions||(currentQuestion?[currentQuestion]:[]);
  const question=activeQuestion||currentQuestion;
  const activeId=assessmentQuestionId(question);
  const currentId=assessmentQuestionId(currentQuestion);
  const visibleMessages=question?.messages||(String(activeId)===String(currentId)?session?.messages||messages:[]);
  const selectQuestion=async(item,index)=>{setActiveQuestion(item);setFinalAnswer(item.finalAnswer||"");setSubmitted(item.finalAnswer||"");const id=assessmentQuestionId(item);if(String(id)===String(currentId))return;try{const next=await teacherData.previewSelectQuestion(session.id,id);setSession(current=>({...current,...next,currentIndex:index}));setActiveQuestion(next?.currentQuestion||next?.question||item)}catch(err){setError(err?.message||"该预览题目暂时不能打开")}};
  const send=async()=>{const content=input.trim();if(!content||!session?.id||busy)return;setInput("");setBusy(true);setError("");setMessages(rows=>[...rows,{role:"user",content}]);try{const next=await teacherData.previewMessage(session.id,{content,questionId:activeId});setMessages(rows=>[...rows,...(next?.reply?[{role:"assistant",content:next.reply}]:[])]);setSession(current=>({...current,...next}))}catch(err){setError(err?.message||"预览对话发送失败")}finally{setBusy(false)}};
  const submitFinal=async()=>{const answer=finalAnswer.trim();if(!answer||!session?.id||!activeId||busy)return;setBusy(true);setError("");try{let next;try{next=await teacherData.previewFinalAnswer(session.id,activeId,answer)}catch(err){if(err?.status!==404)throw err;next=await teacherData.previewAnswer(session.id,{questionId:activeId,answer})}setSubmitted(answer);setFinalAnswer("");setSession(current=>({...current,...next}));if(next?.nextQuestion)setActiveQuestion(next.nextQuestion);else if(next?.currentQuestion)setActiveQuestion(next.currentQuestion)}catch(err){setError(err?.message||"预览方案提交失败")}finally{setBusy(false)}};
  const finish=async()=>{if(!session?.id)return;try{setReport(await teacherData.previewReport(session.id))}catch(err){setError(err?.message||"预览报告接口尚未提供")}};
  if(report)return <div className="teacher-preview-page"><header><button onClick={onExit}><ChevronLeft/>退出预览</button><div><b>管理员预览 · 不产生记录</b><h1>临时预览报告</h1><p>本报告不写入历史记录、能力画像或任务统计。</p></div></header><section className="preview-report"><pre>{JSON.stringify(report,null,2)}</pre><button onClick={onExit}>退出预览</button></section></div>;
  return <AgentAssessmentWorkbench title={title} subtitle="管理员预览 · 可以完整作答与多轮对话，但不产生任何正式记录" questions={questions} question={question} activeId={activeId} onSelect={selectQuestion} messages={visibleMessages} input={input} setInput={setInput} onSend={send} streaming={busy} assistantText="" finalAnswer={finalAnswer} setFinalAnswer={setFinalAnswer} onSubmitFinal={submitFinal} submitting={busy} submitted={submitted} followUps={question?.followUps||session?.followUps||[]} error={error} loading={loading} finished={Boolean(session?.finished)} onFinish={finish} onExit={onExit} preview questionIndex={session?.currentIndex||0}/>;
}

function TeacherPortal({onLogout}){
  const {user,username}=useCurrentUser();
  const [active,setActive]=useState("首页"),[collapsed,setCollapsed]=useState(false),[toast,setToast]=useState(""),[preview,setPreview]=useState(null);
  const name=user.name||user.realName||username;const notify=text=>{setToast(text);setTimeout(()=>setToast(""),2200)};
  const primary=[["首页",Home],["AI能力标准",BadgeCheck],["题库管理",Database],["任务管理",ClipboardList],["我的组织",UsersRound],["个人中心",UserRound]];
  const level=<section className="level-standard teacher-level-standard"><div className="level-standard-head"><div><h2>AI 使用能力等级标准</h2><p>基于科学的能力模型，划分为 5 个等级，帮助明确成长路径。</p></div><button onClick={()=>setActive("AI能力标准")}>了解完整标准 <ArrowRight/></button></div><div className="level-path"><svg className="level-rise-arrow" viewBox="0 0 1000 180" preserveAspectRatio="none"><path d="M35 154 C210 150 310 139 445 126 S710 100 928 38"/><path className="arrow-head" d="M906 31 L948 32 L925 64"/></svg>{[["L1","基础认知者","了解 AI 基本概念"],["L2","工具使用者","掌握常用 AI 工具"],["L3","应用进阶者","解决实际问题"],["L4","人机协同专家","善于人机协作"],["L5","创新应用者","具备创新思维"]].map(([l,n,d],i)=>{const Icon=[BrainCircuit,Wrench,BadgeCheck,UsersRound,Crown][i];return <article key={l} className={`step-${i+1}`}><div className="level-icon"><Icon/></div><span><b>{l}</b><small>{n}</small></span><p>{d}</p></article>})}</div></section>;
  const home=<div className="teacher-home teacher-home-clean"><section className="teacher-hero"><div><h1>Hi，{name}</h1><p>管理教学题库，关注学生 AI 能力成长。</p><small>从能力标准到任务管理，帮助你更清晰地开展教学。</small></div><img src="/ripple-ai-assessment/landing/training-scene-teacher.png" alt="管理工作台"/></section>{level}<section className="teacher-quick"><h2>快捷入口</h2><div><button onClick={()=>setPreview("assessment")}><strong>01</strong><span><b>Agent能力测评</b><small>预览学生端多维测评</small></span><Target/><ArrowRight/></button><button onClick={()=>setPreview("training")}><strong>02</strong><span><b>智能训练场</b><small>自主出题/管理员出题</small></span><Zap/><ArrowRight/></button><button onClick={()=>setActive("任务管理")}><strong>03</strong><span><b>任务管理</b><small>查看和管理训练任务</small></span><ClipboardList/><ArrowRight/></button></div></section></div>;
  const page=active==="首页"?home:active==="AI能力标准"?<LevelStandardPage onProfile={()=>setActive("个人中心")}/>:active==="题库管理"?<TeacherQuestionBank notify={notify}/>:active==="任务管理"?<TeacherTaskManagement notify={notify}/>:active==="我的组织"?<TeacherClassesPage notify={notify}/>:<ProfileV2 notify={notify} role="teacher"/>;
  if(preview)return <><TeacherPreview mode={preview} onExit={()=>setPreview(null)} notify={notify}/>{toast&&<div className="toast"><Check/>{toast}</div>}</>;
  return <main className={`dashboard student-home-shell teacher-shared-shell ${collapsed?"sidebar-collapsed":""}`}><PortalSidebar portal="teacher" active={active} collapsed={collapsed} onSelect={setActive} onToggle={()=>setCollapsed(v=>!v)} onExit={onLogout} primary={primary} classSelector={<div className="sidebar-class-card sidebar-account-only"><div className="sidebar-account"><span>{(name||"师").slice(0,1).toUpperCase()}</span><div><b>{name}</b><small>{username}</small></div><button title="个人中心" onClick={()=>setActive("个人中心")}><UserRound/></button></div></div>}/><section className="dash-main teacher-shared-main">{active==="首页"&&<header className="design-page-head"><div><h1>{active}</h1><span>管理工作台</span></div></header>}{page}</section>{toast&&<div className="toast"><Check/>{toast}</div>}</main>;
}







function StudentHome({onNavigate,notify,classId}){
  const {username,user}=useCurrentUser();
  const [overview,setOverview]=useState({score:0,level:"L0",dimensions:[],latest:null});
  useEffect(()=>{let alive=true;(async()=>{try{const classes=await studentData.joinedClasses();const selectedClassId=classId||classes[0]?.id;const [ability,assessments]=await Promise.all([selectedClassId?studentData.ability(selectedClassId):Promise.resolve(null),studentData.assessments()]);if(!alive)return;const completed=assessments.filter(item=>belongsToClass(item,selectedClassId)&&String(item.status||"").toLowerCase().startsWith("completed")).sort((a,b)=>new Date(b.completedAt||0)-new Date(a.completedAt||0));const score=Number(ability?.latest?.averageScore??completed[0]?.score??0);setOverview({score,level:ability?.latest?.level||abilityLevelFromScore(score),dimensions:ability?.dimensions||[],latest:completed[0]||null})}catch(error){if(alive)notify(error?.message||"能力概览加载失败")}})();return()=>{alive=false}},[classId]);
  const score=overview.score;
  const level=overview.level||abilityLevelFromScore(score);
  const levelName={L0:"等待启程",L1:"基础认知者",L2:"工具使用者",L3:"应用进阶者",L4:"人机协同专家",L5:"创新应用者"}[level];
  const radar=dimensions.map(d=>{const row=overview.dimensions.find(item=>(item.dimension||item.name)?.includes(d.name.replace("基础",""))||d.name.includes(item.dimension||item.name));return {subject:d.name,A:Number(row?.score)||0}});
  const recentDate=overview.latest?.completedAt?String(overview.latest.completedAt).slice(0,10):"暂无测评";
  const capabilityCards=[
    {no:"01",title:"Agent 能力测评",text:"多维度科学评估，精准定位你的 AI 能力水平",icon:Target,page:"测评中心",tone:"orange"},
    {no:"02",title:"智能训练场",text:"匹配你的能力短板，提供个性化训练任务",icon:Zap,page:"训练场",tone:"cyan"},
    {no:"03",title:"能力成长档案",text:"记录每一次进步，见证你的蜕变与成长",icon:Trophy,page:"我的",tone:"blue"},
  ];
  const levels=[["L1","基础认知者","了解 AI 基本概念"],["L2","工具使用者","掌握常用 AI 工具"],["L3","应用进阶者","解决实际问题"],["L4","人机协同专家","善于人机协作"],["L5","创新应用者","具备创新思维"]];
  return <div className="student-home-v2">
    
    <section className="student-welcome">
      <div className="welcome-copy"><span>Hi，{username}同学</span><h1>能力 <em>进阶</em>，未来可期</h1><p>通过系统化测评与个性化训练，全面提升你的 AI 能力，<br/>为未来的学习和职业发展打下坚实基础。</p></div>
      <div className="welcome-landscape"><i/><i/><i/><i/></div>
    </section>

    <section className="home-section capability-overview"><div className="home-title"><h2>能力概览</h2><HelpCircle size={16}/></div>
      <div className="overview-grid">
        <article className="level-card"><div className="level-medal"><StarGlyph/></div><b>{level}</b><span>{levelName}</span><small>当前等级</small></article>
        <article className="score-card"><h3>综合能力评分</h3><b>{score}<small>/100</small></b><div className="score-track"><i style={{width:`${score}%`}}/></div><p>{score?"评分来自最近一次真实测评":"完成首次测评后生成"}</p></article>
        <article className="home-radar"><h3>六维能力雷达图</h3><ResponsiveContainer width="100%" height={245}><RadarChart data={radar}><PolarGrid stroke="#eadfcf"/><PolarAngleAxis dataKey="subject" tick={{fill:"#34312c",className:"ripple-chart-label-11"}}/><Radar dataKey="A" stroke="#ff9f22" fill="#ffc56c" fillOpacity={.25}/></RadarChart></ResponsiveContainer><div className="radar-legend"><i/>你的水平 <span/>组织平均</div></article>
        <article className="overview-advice"><div><CalendarDays/><span>最近测评时间<b>{recentDate}</b></span></div><button onClick={()=>onNavigate("报告中心")}>查看完整报告 <ArrowRight/></button></article>
      </div>
    </section>

    <section className="home-section core-capabilities"><div className="home-title"><h2>平台核心能力</h2></div><div className="core-grid">{capabilityCards.map(({no,title,text,page,tone})=><article key={no} className={`capability-ticket ${tone}`}><h3><b>{no}</b> {title}</h3><div className="core-illustration" aria-hidden="true"/><footer><span>{text}</span><button onClick={()=>onNavigate(page)} aria-label={`进入${title}`}><ArrowRight/></button></footer></article>)}</div></section>

    <section className="level-standard"><div className="level-standard-head"><div><h2>AI 使用能力等级标准</h2><p>基于科学的能力模型，划分为 5 个等级，助你明晰成长路径。</p></div><button onClick={()=>onNavigate("AI 能力标准")}>了解完整标准 <ArrowRight/></button></div><div className="level-path"><svg className="level-rise-arrow" viewBox="0 0 1000 180" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="goldRise" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stopColor="#5d4217"/><stop offset=".48" stopColor="#e4ad42"/><stop offset="1" stopColor="#ffd879"/></linearGradient><filter id="goldGlow"><feGaussianBlur stdDeviation="5" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs><path d="M35 154 C210 150 310 139 445 126 S710 100 928 38"/><path className="arrow-head" d="M906 31 L948 32 L925 64"/></svg>{levels.map(([l,n,d],i)=>{const Icon=[BrainCircuit,Wrench,BadgeCheck,UsersRound,Crown][i];return <article key={l} className={`${level===l?"current":""} step-${i+1}`}><div className="level-icon"><Icon/></div><span><b>{l}</b><small>{n}</small></span><p>{d}</p></article>})}</div></section>

    <section className="growth-cta"><div><h2>开启你的 <em>AI</em> 能力成长之旅</h2><p>通过测评了解自己，通过训练提升自己，通过成长记录见证自己！</p><button onClick={()=>onNavigate("测评中心")}>立即开始测评 <ArrowRight/></button></div><div className="cta-art"><BarChart3/><FileCheck2/><Trophy/></div></section>
  </div>
}

function StarGlyph(){return <span className="star-glyph">★</span>}


function LevelStandardPage({onProfile}){
  const {username}=useCurrentUser();
  const groups=[
    {
      title:"AI 基础认知", Icon:BrainCircuit,
      points:["AI 基本概念理解","数据影响 AI 输出的认知","AI 决策的基本逻辑","AI 发展历程认知","AI 能力边界认知","AI 社会影响认知","批判性看待 AI"],
      standards:[
        "能准确区分 AI、机器学习、深度学习、大语言模型等核心概念及其关系；能用通俗语言向非专业人士解释这些概念",
        "能说明训练数据中的偏差如何导致 AI 输出偏误；能举例说明数据质量（完整性、代表性、时效性）对 AI 生成内容准确性的影响",
        "能理解 AI 系统基于数据和概率做出决策的基本逻辑；能区分基于规则的系统与基于学习的系统的差异",
        "能概述 AI 发展的重要里程碑；能理解当前生成式 AI 的技术定位",
        "能准确说明 AI 擅长什么、不擅长什么；能识别 AI 的局限性",
        "能分析 AI 对就业、教育、信息传播、社会公平等领域的影响",
        "能对 AI 输出保持审慎态度，从技术、伦理、社会等多维度评估 AI 应用",
      ],
    },
    {
      title:"提示词工程", Icon:MessageCircleMore,
      points:["提示词书写"],
      standards:["能编写高质量提示词，包含角色设定、任务描述、上下文、约束条件、示例、思维链等要素，确保 AI 输出符合预期"],
    },
    {
      title:"AI 工具使用", Icon:BriefcaseBusiness,
      points:["工具选型及局限性认知","工具使用能力","工作流整合","智能体编排"],
      standards:[
        "能根据任务需求选择合适的 AI 工具；能识别不同工具的差异与局限",
        "能熟练使用各类 AI 工具完成任务",
        "能将 AI 工具系统性地嵌入工作流程，形成“人–AI”协作模式",
        "能编排多个智能体完成复杂任务，设定协作规则与交接机制",
      ],
    },
    {
      title:"AI 结果评估与优化", Icon:Target,
      points:["评估 AI 结果","优化 AI 结果"],
      standards:["能进行事实核查、幻觉识别、偏见察觉、指令遵循验证","能针对问题优化指令，进行多轮迭代优化"],
    },
    {
      title:"人机协同解决问题", Icon:UsersRound,
      points:["与 AI 协作解决问题"],
      standards:["能合理拆解任务，选择合适时机调用 AI，批判性评估 AI 输出，根据反馈调整策略，形成高效协作"],
    },
    {
      title:"AI 伦理与合规", Icon:ShieldCheck,
      points:["伦理意识与价值判断","合规使用能力"],
      standards:["能识别 AI 可能带来的伦理问题，做出负责任的价值判断","能在使用 AI 时遵守法律法规、平台规则与学术诚信要求"],
    },
  ];
  const references=[
    ["01","联合国教科文组织 UNESCO（2024）","《学生人工智能能力框架》"],
    ["02","中原大学人文与教育学院（2025）","《以人为本的 AI 教育行动指引：AI 素养白皮书》"],
    ["03","OECD、欧盟委员会（2026）","《赋能学习者迎接 AI 时代：面向中小学教育的 AI 素养框架》"],
    ["04","欧盟委员会人工智能高级专家组（2019）","《可信赖人工智能伦理准则》"],
    ["05","全国网络安全标准化技术委员会（2026）","TC260-005《人工智能应用伦理安全指引1.0》"],
    ["06","岳彦龙、罗江华（2025）","《人智协同问题解决能力：概念框架、核心维度与指标体系》"],
    ["07","Ganuthula、Balaraman（2025）","《人工智能商数（AIQ）：衡量人类与人工智能协作的框架》"],
    ["08","Yang 等（NeurIPS 2025）","《Any Large Language Model Can Be a Reliable Judge》"],
    ["09","江南大学（2025）","《大学生人工智能素养红皮书（2025版）》"],
    ["10","Google/Kaggle，Lee Boonstra（2025）","《提示词工程白皮书（Prompt Engineering）》"],
    ["11","IEEE 7015-2026","《数据与人工智能素养、技能和准备度标准》"],
  ];
  return <div className="standard-page standard-table-page shared-page-bg">
    <header className="assessment-head standard-table-head"><div><h1><em>AI</em> 使用能力等级标准体系</h1><p>建立统一 AI 能力评价标准，明确用户必须掌握的 AI 核心能力</p></div></header>
    <section className="ability-standard-table" aria-label="AI 使用能力标准明细">
      <div className="ability-table-header"><b><Layers3/>维度</b><b><ClipboardList/>具体考察点罗列</b><b><ShieldCheck/>标准（能力说明）</b></div>
      {groups.map(({title,Icon,points,standards})=><article className="ability-table-row" key={title}>
        <div className="ability-dimension"><i><Icon/></i><b>{title}</b></div>
        <ol>{points.map(point=><li key={point}>{point}</li>)}</ol>
        <ul>{standards.map(standard=><li key={standard}>{standard}</li>)}</ul>
      </article>)}
    </section>
    <section className="standard-references">
      <header><BookOpen/><b>参考文献与标准依据</b><small>共 {references.length} 项 · 重复框架已合并</small></header>
      <div>{references.map(([no,source,title])=><article key={no}><small>{no}</small><p>{source}{title&&<><br/><span>{title}</span></>}</p></article>)}</div>
    </section>
  </div>
}

function AssessmentCenterV2({onStart,onReports,classId}){
  const {user}=useCurrentUser(); const stats={...emptyStats,...user.stats};const [latest,setLatest]=useState(null),[starting,setStarting]=useState(false),[error,setError]=useState("");
  const task={id:1,deadline:"完成后生成能力报告",teacher:"AI 测评助手",name:"AI 能力综合测评",short:"AI 能力综合测评",questions:12,minutes:20};
  useEffect(()=>{studentData.assessments().then(rows=>setLatest(rows.filter(item=>belongsToClass(item,classId)&&String(item.status||"").toLowerCase().startsWith("completed")).sort((a,b)=>new Date(b.completedAt||0)-new Date(a.completedAt||0))[0]||null)).catch(err=>setError(err?.message||"历史测评加载失败"))},[classId]);
  const score=Number(latest?.score||0);const currentLevel=latest?.abilityLevel||latest?.level||abilityLevelFromScore(score);
  const levelLabel={L0:"待提升",L1:"基础认知者",L2:"工具使用者",L3:"应用进阶者",L4:"人机协同专家",L5:"创新应用者"}[currentLevel];
  const recentAssessment=latest?.completedAt?String(latest.completedAt).slice(0,16).replace("T"," "):"暂无记录";
  const start=async()=>{setStarting(true);setError("");try{const classes=await studentData.joinedClasses();const storedClassId=localStorage.getItem("ripple-current-class");const classId=classes.some(item=>String(item.id)===String(storedClassId))?storedClassId:classes[0]?.id;if(!classId)throw new Error("请先加入并选择组织后再开始测评");const result=await assessmentApi.startSelf(classId,{});const assessmentId=result?.id||result?.assessmentId;if(!assessmentId)throw new Error("创建测评失败：后端未返回测评编号");onStart({...task,id:assessmentId,assessmentId,live:true,source:"assessment",returnLabel:"返回测评中心"})}catch(err){setError(err?.message||"开始测评失败")}finally{setStarting(false)}};
  const notes=["测评过程请独立完成，不要借助他人帮助","部分任务需要实际使用 AI 工具完成","测评完成后将生成个人 AI 能力报告","可根据报告结果进入训练场针对性提升","测评可随时中断，进度将自动保存"];
  return <div className="design-page assessment-v2 shared-page-bg">
    <header className="design-page-head"><div><h1>多维测评</h1><span>AI 能力综合测评入口</span></div></header>
    <section className="assessment-hero-v2"><div><h2><em>AI</em> 能力综合测评</h2><p>通过多维度测试，全面评估你的 AI 应用能力水平</p><div className="assessment-facts"><span><Clock3/><b>预计耗时</b>15–20 分钟</span><span><ClipboardList/><b>测评模式</b>三种模式混合</span><span><ShieldCheck/><b>结果产出</b>AI 能力报告</span></div><button disabled={starting} onClick={start}>{starting?"正在创建测评…":"开始测评"}</button>{error&&<small className="form-error">{error}</small>}<small>测评数据仅用于能力评估与学习建议</small></div></section>
    <section className="assessment-dim-v2"><h2>我们将评估你的六大能力维度</h2><div>{dimensions.map((d,i)=><article key={d.name}><b>0{i+1}</b><strong>{d.name}</strong><p>{["了解 AI 基本概念、模型特点、伦理安全","评估你设计 Prompt、拆解任务的能力","评估使用大模型、办公 AI、数据 AI 的能力","判断 AI 输出质量并识别问题","评估真实任务中的人机协作能力","评估隐私、版权、责任与合规意识"][i]}</p></article>)}</div></section>
    <div className="assessment-info-v2 assessment-notes-only"><section><h2>开始前请注意</h2>{notes.map(x=><p key={x}><Check/>{x}</p>)}</section></div>
    <section className="history-strip"><h2>我的历史测评</h2><div><span>最近一次测评<b>{recentAssessment}</b></span><span>AI 能力等级<b>{latest?`${currentLevel} ${levelLabel}`:"待测评"}</b></span><span>综合评分<b>{latest?score:0}<small>/100</small></b></span><button onClick={onReports}>查看报告</button></div></section>
  </div>
}

function TrainingGroundV2({onStart,onReports,openTeacherTasks=false,onTeacherTasksClosed,classId}){
  const {username}=useCurrentUser();
  const [custom,setCustom]=useState(false),[teacherTasks,setTeacherTasks]=useState(openTeacherTasks);
  const cards=[["自定义训练","自主选择训练内容，灵活组合训练练习","去组题",()=>setCustom(true)],["组织任务","完成管理员布置的任务，巩固所学知识","去查看",()=>setTeacherTasks(true)]];
  const generate=async config=>{const result=await studentData.startTraining(config);const assessmentId=result.id||result.assessmentId;if(!assessmentId)throw new Error("生成训练失败：后端未返回训练编号");setCustom(false);onStart({name:"自定义训练",assessmentId,id:assessmentId,live:true,source:"training",returnLabel:"返回训练场"})};
  if(teacherTasks)return <TeacherTasksPage onBack={()=>{setTeacherTasks(false);onTeacherTasksClosed?.()}} onStart={onStart} classId={classId}/>;
  return <div className="design-page training-v2 shared-page-bg">
    <header className="design-page-head"><div><h1>欢迎来到训练场</h1><span>根据能力画像匹配你的专属训练</span></div></header>
    <section className="training-plan-v2 training-welcome-v2"><div><h2>Hi，欢迎来到训练场</h2><p>你可以自主选择训练内容，按自己的节奏完成个性化 AI 能力提升练习。</p></div></section>
    <section className="training-cards-v2">{cards.map(([t,d,label,go],i)=><article key={t} className={`training-ticket t${i+1}`}><header><b>{t}</b><span>0{i+1}</span></header><div className="ticket-rule"/><div className="ticket-art" aria-hidden="true"/><p>{d}</p><button className="ticket-action" onClick={go} aria-label={label}><ArrowRight/><span>{label}</span><ArrowRight/></button></article>)}</section>
    <div className="training-bottom-v2 training-advice-only"><section className="training-advice-note"><h2>能力提升建议</h2>{[
      ["提示词工程精进","你的提示词设计已达到 L4 水准，可在复杂任务中补充角色设定、约束条件与输出格式，尝试一次成型的高质量提示词。"],
      ["强化结果核验与迭代","面对 AI 输出养成先核验、后使用的习惯，通过多轮对比与追问迭代优化结果质量。"],
      ["深化伦理与问责认知","在分享 AI 成果时注意版权标注与责任边界，持续强化隐私保护与合规意识。"],
      ["保持高频人机协作实践","持续参与组织任务与自主测评，巩固人机协同专家水平，向 L5 创新应用者进阶。"],
    ].map(([t,c],i)=><p key={i}><b>{i+1}</b><span><strong>{t}</strong><small>{c}</small></span></p>)}<div className="advice-illustration"><Sparkles/><BookOpen/></div></section></div>
    <footer className="training-security"><ShieldCheck/>数据安全保障　|　训练数据仅用于能力提升与分析，保护你的隐私安全</footer>
    {custom&&<CustomTrainingModal onClose={()=>setCustom(false)} onStart={c=>{setCustom(false)}}/>}
  </div>
}

function ProfileV2({notify,role="student"}){
  const {user,username,updateUser}=useCurrentUser();
  const stats={...emptyStats,...user.stats};
  const [dialog,setDialog]=useState(null);const [value,setValue]=useState("");const [passwords,setPasswords]=useState({old:"",next:"",confirm:""});const [draft,setDraft]=useState({});const [saving,setSaving]=useState(false);
  useEffect(()=>{userApi.me().then(profile=>profile&&updateUser(profile)).catch(()=>{})},[]);
  const close=()=>{setDialog(null);setValue("");setPasswords({old:"",next:"",confirm:""});setDraft({})};
  const openEdit=()=>{setDraft({name:user.name||user.realName||username,studentNo:user.studentNo||user.account||"",phone:user.phone||"",email:user.email||""});setDialog("profile")};
  const saveProfile=async()=>{setSaving(true);try{const payload={name:draft.name,realName:draft.name,phone:draft.phone||null,email:draft.email||null,...(role==="student"?{studentNo:draft.studentNo,account:draft.studentNo}:{})};const result=await userApi.updateMe(payload);updateUser({...result,...payload,username:draft.name});notify("资料修改成功");close()}catch(error){notify(error?.message||"资料修改失败")}finally{setSaving(false)}};
  const changePassword=async()=>{if(!passwords.old)return notify("请输入当前密码");if(passwords.next.length<8||passwords.next.length>16)return notify("新密码需为 8—16 位");if(passwords.next!==passwords.confirm)return notify("两次输入的新密码不一致");try{await userApi.updatePassword({oldPassword:passwords.old,newPassword:passwords.next});notify("密码修改成功");close()}catch(error){notify(error?.message||"密码修改失败")}};
  const removeAccount=async()=>{if(!value)return notify("请输入登录密码");try{await userApi.removeMe({password:value});localStorage.removeItem("ripple-user-profile");sessionStorage.removeItem("ripple-user");sessionStorage.removeItem("ripple-auth");location.reload()}catch(error){notify(error?.message||"注销账号接口尚未提供")}};
  const identityName=role==="teacher"?"管理员":"学生";
  const fields=role==="student"?[["姓名",user.name||user.realName||username],["学号",user.studentNo||user.account],["手机号",user.phone],["邮箱",user.email]]:[["姓名",user.name||user.realName||username],["手机号",user.phone],["邮箱",user.email]];
  return <div className="design-page profile-v2 shared-page-bg"><header className="design-page-head"><div><h1>个人中心</h1><span>管理个人资料与账号安全</span></div></header><section className="profile-main-v2 profile-main-single"><div className="profile-person"><div className="portrait"><UserRound/></div><div><h2>{user.name||user.realName||username}</h2><em>{role==="student"?(stats.score?abilityLevelFromScore(stats.score):"新用户"):identityName}</em><div className="profile-field-list">{fields.map(([label,content])=><p key={label}><span>{label}</span><b className={!content?"empty":""}>{content||"暂未绑定"}</b></p>)}</div><button onClick={openEdit}>编辑资料</button></div></div></section><section className="profile-action-v2"><h2>账号安全</h2><button onClick={()=>setDialog("password")}><LockKeyhole/><span><b>修改密码</b>定期修改密码，保护账号安全</span><ChevronRight/></button><button onClick={()=>setDialog("delete")}><LogOut/><span><b>注销账号</b>注销后账号数据不可恢复</span><ChevronRight/></button></section>{dialog&&<div className="profile-dialog-backdrop" onMouseDown={event=>event.target===event.currentTarget&&close()}><section className={`profile-dialog ${dialog==="delete"?"warning":""}`}><button className="dialog-close" onClick={close}><X/></button>{dialog==="profile"&&<><h2>编辑资料</h2><label>姓名<input value={draft.name||""} onChange={event=>setDraft({...draft,name:event.target.value})}/></label>{role==="student"&&<label>学号<input value={draft.studentNo||""} onChange={event=>setDraft({...draft,studentNo:event.target.value})}/></label>}<label>手机号（选填）<input value={draft.phone||""} onChange={event=>setDraft({...draft,phone:event.target.value.replace(/\D/g,"")})}/></label><label>邮箱（选填）<input type="email" value={draft.email||""} onChange={event=>setDraft({...draft,email:event.target.value})}/></label><footer><button onClick={close}>取消</button><button disabled={saving} onClick={saveProfile}>{saving?"保存中…":"确认编辑"}</button></footer></>}{dialog==="password"&&<><h2>修改密码</h2>{[["当前密码","old"],["新密码","next"],["确认新密码","confirm"]].map(([label,key])=><label key={key}>{label}<input type="password" value={passwords[key]} onChange={event=>setPasswords({...passwords,[key]:event.target.value})}/>{key==="next"&&<small>密码需包含8–16位字符</small>}</label>)}<footer><button onClick={close}>取消</button><button onClick={changePassword}>保存修改</button></footer></>}{dialog==="delete"&&<><h2>注销账号</h2><p>注销账号是不可逆操作，账号信息及相关数据都将被永久删除。</p><label>请输入登录密码进行验证<input type="password" value={value} onChange={event=>setValue(event.target.value)}/></label><footer><button onClick={close}>取消</button><button className="danger" onClick={removeAccount}>确认注销</button></footer></>}</section></div>}</div>
}

function NotificationCenterV2({notify}){
  const {user,username}=useCurrentUser();const [tab,setTab]=useState("全部通知");const stats={...emptyStats,...user.stats};
  const notices=[];
  if(user.organizationCode){notices.push(["组织任务","管理员发布了新的 AI 训练任务","进入训练场查看组织任务","teacher"]);if(stats.tasks)notices.push(["训练提醒","你的个性化训练计划已更新","已根据最近一次练习结果调整训练内容","teacher"])}
  if(stats.assessments)notices.push(["测评通知","新的 AI 能力报告已经生成","可前往报告中心查看本次真实测评结果","system"]);
  if(stats.trainings)notices.push(["训练记录","本次训练记录已经保存","能力变化已同步至个人档案","system"]);
  const shown=tab==="未读通知"?notices:notices;
  return <div className="design-page notice-v2 shared-page-bg"><header className="design-page-head"><div><h1>通知中心</h1><span>通知会根据组织关系和实际学习记录自动同步</span></div></header>{notices.length>0&&<nav><button className={tab==="全部通知"?"active":""} onClick={()=>setTab("全部通知")}>全部通知</button><button className={tab==="未读通知"?"active":""} onClick={()=>setTab("未读通知")}>未读通知 <b>{notices.length}</b></button></nav>}<section>{shown.length?shown.map(([type,title,text,kind],i)=><article key={title} className={kind}><i>{kind==="teacher"?<School/>:<Bell/>}</i><div><small>{kind==="teacher"?"管理员通知":"系统通知"}</small><h2>{title}</h2><p>{text}</p></div><time>{i?"较早前":"刚刚"}</time><button onClick={()=>notify(`${type}已打开`)}>查看详情 <ArrowRight/></button></article>):<div className="notice-empty"><Bell/><h2>暂无通知</h2><p>{user.organizationCode?"当前没有新的组织任务或系统消息":"你尚未加入组织，加入后管理员发布的任务和通知会显示在这里"}</p></div>}</section></div>
}

const reportTypeOf=row=>{
  const value=String(row?.reportType||row?.category||row?.mode||row?.assessmentType||row?.type||"").toUpperCase();
  if(row?.taskId||row?.remedialTaskId||value.includes("TASK")||value.includes("任务"))return "任务报告";
  if(value.includes("TRAIN")||value.includes("训练"))return "训练报告";
  return "测评报告";
};

const canonicalDimensions=["AI基础认知","提示词工程","AI工具使用","AI结果评估与优化","人机协同解决问题","AI伦理与合规"];
const canonicalDimensionName=value=>{
  const name=String(value||"").replace(/\s/g,"");
  if(["基础认知","AI基础认知"].includes(name))return "AI基础认知";
  if(["提示词","提示词工程"].includes(name))return "提示词工程";
  if(["工具使用","AI工具使用"].includes(name))return "AI工具使用";
  if(["结果评估","结果评估与优化","AI结果评估与优化"].includes(name))return "AI结果评估与优化";
  if(["人机协同","人机协同解决问题"].includes(name))return "人机协同解决问题";
  if(["伦理合规","AI伦理与合规"].includes(name))return "AI伦理与合规";
  return name;
};
const finiteNumber=value=>value!==null&&value!==undefined&&value!==""&&Number.isFinite(Number(value))?Number(value):null;
const reportScoreOf=row=>finiteNumber(row?.score??row?.averageScore??row?.totalScore??row?.assessment?.averageScore??row?.assessment?.totalScore);
const completedReport=row=>{
  const score=reportScoreOf(row);
  if(score===null)return false;
  const status=String(row?.status||row?.assessmentStatus||row?.state||"").toUpperCase();
  if(["IN_PROGRESS","STARTED","CREATED","PENDING","DRAFT","UNFINISHED","SCORING","FAILED","FAILURE","ERROR","CANCELLED"].some(value=>status.includes(value)))return false;
  const completed=["COMPLETED","FINISHED","SCORED","SUBMITTED"].some(value=>status.includes(value));
  const snapshot=Boolean(row?.reportId||row?.snapshotId||row?.reportType)&&Boolean(row?.completedAt||row?.generatedAt||row?.submittedAt);
  return completed||snapshot||Boolean(row?.completedAt||row?.submittedAt);
};
const formatReportTime=value=>{
  if(!value)return "时间待后端返回";
  const date=new Date(value);
  if(Number.isNaN(date.getTime()))return String(value).slice(0,16).replace("T"," ");
  const pad=number=>String(number).padStart(2,"0");
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};
const formatTrendTime=value=>{
  const date=new Date(value);
  if(Number.isNaN(date.getTime()))return String(value||"").slice(0,16).replace("T"," ");
  const pad=number=>String(number).padStart(2,"0");
  return `${pad(date.getMonth()+1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const reportDimensions=snapshot=>{
  const before=snapshot?.beforeDimensions||snapshot?.abilityBefore?.dimensions||[];
  const after=snapshot?.afterDimensions||snapshot?.abilityAfter?.dimensions||snapshot?.dimensions||[];
  return canonicalDimensions.map(name=>{
    const beforeItem=before.find(item=>canonicalDimensionName(item.dimension||item.dimensionName||item.name)===name)||{};
    const afterItem=after.find(item=>canonicalDimensionName(item.dimension||item.dimensionName||item.name)===name)||{};
    const previous=finiteNumber(afterItem.beforeScore??beforeItem.score??beforeItem.value);
    const current=finiteNumber(afterItem.afterScore??afterItem.score??afterItem.value);
    const change=finiteNumber(afterItem.change)??(previous!==null&&current!==null?current-previous:null);
    return {name,previous,current,change,analysis:afterItem.analysis||afterItem.description||beforeItem.analysis||""};
  });
};

const skillItemsFrom=value=>{
  if(Array.isArray(value))return value;
  if(!value||typeof value!=="object")return [];
  const direct=safeList(value.skills||value.points||value.items||value.nodes);
  const groups=safeList(value.dimensions||value.branches||value.groups);
  return [...direct,...groups.flatMap(group=>skillItemsFrom(group).map(item=>typeof item==="string"?{name:item,dimension:group.dimension||group.name}:{...item,dimension:item.dimension||group.dimension||group.name}))];
};
const skillItemName=item=>typeof item==="string"?item:item?.name||item?.assessmentPoint||item?.title||item?.pointName||"";
const normalizeSkillName=value=>String(value||"").replace(/[\s_-]/g,"").toLowerCase();
const findSkillItem=(items,dimension,name)=>items.find(item=>normalizeSkillName(skillItemName(item))===normalizeSkillName(name))||items.find(item=>normalizeSkillName(item.dimension||item.dimensionName)===normalizeSkillName(dimension)&&normalizeSkillName(skillItemName(item)).includes(normalizeSkillName(name)));
const skillStateOf=item=>{
  const status=String(item?.status||item?.state||"").toUpperCase();
  const score=finiteNumber(item?.score??item?.masteryScore??item?.value);
  const lit=item?.lit??item?.unlocked??item?.mastered;
  if(lit===true||["LIT","MASTERED","UNLOCKED"].includes(status)||score!==null&&score>=75)return "mastered";
  if(["LEARNING","IN_PROGRESS"].includes(status)||score!==null&&score>0)return "learning";
  return "locked";
};

function SkillTreeView({skills=[],emptyText="暂无技能树数据"}){
  const items=skillItemsFrom(skills);
  if(!items.length)return <div className="snapshot-empty skill-tree-empty">{emptyText}</div>;
  const stateLabel={mastered:"已掌握",learning:"学习中",locked:"未解锁"};
  return <div className="skill-tree-board"><div className="skill-tree-core"><BookOpen/><b>AI能力</b></div><div className="skill-tree-branches">{[0,1,2].map(column=><div className="skill-branch-column" key={column}>{[column,column+3].map(branchIndex=>{const [dimension,points]=skillTaxonomy[branchIndex];return <section className={`skill-branch branch-${branchIndex}`} key={dimension}><h4>{dimension}<small>{points.length} 个技能点</small></h4><div>{points.map(name=>{const item=findSkillItem(items,dimension,name);const state=item?skillStateOf(item):"locked";return <span className={state} key={name}><i>{state==="mastered"?<Check/>:state==="learning"?<Sparkles/>:<LockKeyhole/>}</i><b>{name}</b><em>{stateLabel[state]}</em></span>})}</div></section>})}</div>)}</div><footer><span className="mastered"/>已掌握 <span className="learning"/>学习中 <span className="locked"/>未解锁</footer></div>;
}

function ReportSnapshotDetail({snapshot,onClose,heading="报告详情",backLabel="返回报告中心"}){
  const rows=reportDimensions(snapshot);
  const hasDimensionData=rows.some(item=>item.previous!==null||item.current!==null);
  const score=reportScoreOf(snapshot);
  const advice=snapshot?.aiAdvice||snapshot?.advice||snapshot?.recommendation||snapshot?.analysisAdvice;
  const skills=skillItemsFrom(snapshot?.skillTree||snapshot?.skills||snapshot?.skillPoints);
  const adviceParsed=(()=>{if(!advice||typeof advice!=="string")return null;try{const value=JSON.parse(advice);return value&&typeof value==="object"&&(value.overall||value.dimensions||value.suggestions)?value:null}catch{return null}})();
  const explicitNewSkills=skillItemsFrom(snapshot?.newlyLitSkills||snapshot?.skillTree?.newlyLitSkills);
  const newlyLit=explicitNewSkills.length?explicitNewSkills:skills.filter(item=>item.newlyLit||item.litThisTime);
  const newlyLitNames=new Set(newlyLit.map(item=>normalizeSkillName(skillItemName(item))));
  const snapshotSkillStates=skillTaxonomy.flatMap(([dimension,points])=>points.map(name=>{const item=findSkillItem(skills,dimension,name);return {dimension,name,item,state:item?skillStateOf(item):"locked",newlyLit:newlyLitNames.has(normalizeSkillName(name))||Boolean(item?.newlyLit||item?.litThisTime)}}));
  const snapshotSkillGroups=[["已掌握",snapshotSkillStates.filter(item=>item.state==="mastered"),"mastered"],["学习中",snapshotSkillStates.filter(item=>item.state==="learning"),"learning"],["未解锁",snapshotSkillStates.filter(item=>item.state==="locked"),"locked"]];
  const reportType=reportTypeOf(snapshot);
  return <main className="report-snapshot-detail report-snapshot-page shared-page-bg">
    <header><button onClick={onClose}><ChevronLeft/>{backLabel}</button><div><span>{reportType}</span><h2>{snapshot?.title||snapshot?.name||snapshot?.taskTitle||heading}</h2><p>{snapshot?.completedAt||snapshot?.createdAt?`完成时间：${formatReportTime(snapshot.completedAt||snapshot.createdAt)}`:"历史报告快照"}</p></div></header>
    <section className="snapshot-score-advice"><article className="snapshot-score-bar"><small>本次真实分数</small><strong>{score??"—"}<i>{score==null?"":"分"}</i></strong><b>{snapshot?.abilityLevel||snapshot?.level||(score==null?"待后端返回":abilityLevelFromScore(Number(score)))}</b></article><article><h3><Sparkles/>AI 建议</h3>{adviceParsed?<div className="snapshot-advice-structured">{adviceParsed.overall&&<p className="snapshot-advice-overall">{adviceParsed.overall}</p>}{adviceParsed.dimensions&&<div className="snapshot-advice-dims">{Object.entries(adviceParsed.dimensions).map(([dimension,text])=><p key={dimension}><b>{dimension}</b><span>{typeof text==="string"?text:(text?.text||text?.content||JSON.stringify(text))}</span></p>)}</div>}{(adviceParsed.points||[]).length>0&&<div className="snapshot-advice-list"><h4>考察点表现</h4>{(adviceParsed.points||[]).map((point,index)=><p key={index}>· {typeof point==="string"?point:(point?.name||point?.assessmentPoint||point?.comment||point?.text||JSON.stringify(point))}</p>)}</div>}{(adviceParsed.suggestions||[]).length>0&&<div className="snapshot-advice-list"><h4>学习建议</h4>{(adviceParsed.suggestions||[]).map((item,index)=><p key={index}>· {typeof item==="string"?item:(item?.text||item?.content||JSON.stringify(item))}</p>)}</div>}</div>:advice?<p>{advice}</p>:<p className="snapshot-missing">后端尚未返回基于本次作答生成的200–300字建议。</p>}</article></section>
    <section className="snapshot-dimension-analysis"><header><h3>六维能力分析</h3><small>只展示本次作答生成并保存在报告快照中的分析</small></header>{hasDimensionData?<div>{rows.map(item=><article key={item.name}><header><b>{item.name}</b><strong>{item.current===null?"—":`${item.current}分`}</strong></header><p>{item.analysis||"后端尚未返回该维度分析。"}</p></article>)}</div>:<div className="snapshot-empty">后端尚未返回六维能力分析。</div>}</section>
    <section className="snapshot-radar-change"><div><h3>测评前后雷达图对比</h3>{hasDimensionData?<ResponsiveContainer width="100%" height={360}><RadarChart data={rows} outerRadius="68%"><PolarGrid stroke="#dfd3c2"/><PolarAngleAxis dataKey="name" tick={{className:"ripple-chart-label-10",fill:"#5d574f"}}/><Tooltip/><Radar name="测评前" dataKey="previous" stroke="#8792a0" fill="#8792a0" fillOpacity={.08}/><Radar name="测评后" dataKey="current" stroke="#efa719" fill="#ffc84f" fillOpacity={.3}/></RadarChart></ResponsiveContainer>:<div className="snapshot-empty">暂无测评前后六维数据</div>}<footer><span className="before"/>测评前 <span className="after"/>测评后</footer></div><aside><h3>本次测评数据变化</h3>{hasDimensionData?rows.map(item=><p key={item.name}><span>{item.name}</span><small>{item.previous??"—"} → {item.current??"—"}</small><b className={item.change>0?"up":item.change<0?"down":""}>{item.change===null?"—":`${item.change>0?"+":""}${item.change}`}</b></p>):<div className="snapshot-empty">暂无变化数据</div>}</aside></section>
    <section className="snapshot-skill-tree"><div><header><h3>测评后技能树</h3><small>六个主分支、17个技能点，状态来自本次报告快照</small></header><SkillTreeView skills={skills} emptyText="后端尚未返回测评后的技能树。"/></div><aside className="skill-status-summary snapshot-skill-summary"><h3>技能掌握说明</h3>{!skills.length?<div className="snapshot-empty">后端尚未返回本次报告的技能快照。</div>:<><section className="newly-lit"><h4><Sparkles/>本次新点亮 <b>{snapshotSkillStates.filter(item=>item.newlyLit).length}</b></h4>{snapshotSkillStates.some(item=>item.newlyLit)?<div>{snapshotSkillStates.filter(item=>item.newlyLit).map(item=><p key={`new-${item.dimension}-${item.name}`}><i className="mastered"/><span>{item.name}</span><em>本次点亮</em></p>)}</div>:<small>本次暂无新点亮技能</small>}</section>{snapshotSkillGroups.map(([label,list,state])=><details open key={label}><summary><span><i className={state}/>{label}</span><b>{list.length}</b></summary><div>{list.map(item=><p key={`${item.dimension}-${item.name}`}><i className={state}/><span>{item.name}</span><em>{item.newlyLit?"本次点亮":item.dimension}</em></p>)}</div></details>)}</>}</aside></section>
  </main>;
}

function HistoryReportsV2({notify,classId}){

  const {user,username}=useCurrentUser();
  const [unknownClassReports,setUnknownClassReports]=useState(0);
  const [tab,setTab]=useState("所有报告"),[query,setQuery]=useState(""),[sort,setSort]=useState("newest"),[period,setPeriod]=useState("最近六个月"),[reports,setReports]=useState([]),[ability,setAbility]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState(""),[detail,setDetail]=useState(null);
  useEffect(()=>{let alive=true;(async()=>{try{const classes=await studentData.joinedClasses();const selectedClassId=classId||classes[0]?.id;const [reportRows,abilityData]=await Promise.all([studentData.reports(),selectedClassId?studentData.ability(selectedClassId):Promise.resolve(null)]);if(alive){setUnknownClassReports(reportRows.filter(row=>recordClassId(row)==null).length);setReports(reportRows.filter(row=>belongsToClass(row,selectedClassId)));setAbility(abilityData)}}catch(err){if(alive)setError(err?.message||"报告数据加载失败")}finally{if(alive)setLoading(false)}})();return()=>{alive=false}},[classId]);
  const normalized=reports.filter(completedReport).map(row=>{const type=reportTypeOf(row);const score=reportScoreOf(row);return {...row,score,type,title:row.name||row.title||row.taskTitle||`${type}详情`,date:row.completedAt||row.submittedAt||row.generatedAt||row.updatedAt,level:row.abilityLevel||row.level||abilityLevelFromScore(score)}});
  const assessmentRows=normalized.filter(row=>row.type==="测评报告"),trainingRows=normalized.filter(row=>row.type==="训练报告"),taskRows=normalized.filter(row=>row.type==="任务报告");
  const source=tab==="测评报告"?assessmentRows:tab==="任务报告"?taskRows:normalized;
  const cutoff=period==="最近一个月"?30:period==="最近六个月"?183:null;
  const trend=source.filter(row=>row.date&&(!cutoff||Date.now()-new Date(row.date).getTime()<=cutoff*86400000)).sort((a,b)=>new Date(a.date)-new Date(b.date)).map(row=>({date:formatTrendTime(row.date),score:row.score,fullTime:formatReportTime(row.date)}));
  const rows=sortHistoryReports(source,query,sort);
  const abilityDimensions=ability?.dimensions||ability?.abilityDimensions||[];
  const dimensionRows=canonicalDimensions.map(name=>{const item=abilityDimensions.find(row=>canonicalDimensionName(row.dimension||row.dimensionName||row.name)===name)||{};return {name,score:finiteNumber(item.score??item.value)}});
  const hasAbilityDimensions=dimensionRows.some(item=>item.score!==null);
  const skills=skillItemsFrom(ability?.points||ability?.skillTree||ability?.skills);
  const allSkillStates=skillTaxonomy.flatMap(([dimension,points])=>points.map(name=>{const item=findSkillItem(skills,dimension,name);return {dimension,name,item,state:item?skillStateOf(item):"locked"}}));
  const currentNewSkills=skillItemsFrom(ability?.newlyLitSkills||ability?.latest?.newlyLitSkills||ability?.skillTree?.newlyLitSkills).filter(item=>item?.newlyLit!==false);
  const masteredSkills=allSkillStates.filter(item=>item.state==="mastered"),learningSkills=allSkillStates.filter(item=>item.state==="learning"),lockedSkills=allSkillStates.filter(item=>item.state==="locked");
  const average=list=>list.length?Math.round(list.reduce((sum,item)=>sum+item.score,0)/list.length):null;
  const openDetail=async row=>{try{let snapshot;try{snapshot=await assessmentApi.reportSnapshot(row.reportId||row.id)}catch(err){if(err?.status!==404)throw err;snapshot=await assessmentApi.result(row.assessmentId||row.id)}setDetail({...row,...snapshot})}catch(err){notify(err?.message||"报告详情加载失败")}};
  if(detail)return <ReportSnapshotDetail snapshot={detail} onClose={()=>setDetail(null)}/>;
  const overallAverage=average(normalized),sourceAverage=average(source);
  return <div className="design-page reports-v2 shared-page-bg"><header className="design-page-head"><div><h1>报告中心</h1><span>记录你的测评、训练与任务历程，见证成长轨迹</span></div></header><nav>{["所有报告","测评报告","任务报告"].map(label=><button className={tab===label?"active":""} onClick={()=>setTab(label)} key={label}>{label}</button>)}</nav>
    {tab==="所有报告"?<section className="report-summary-v2"><article><BadgeCheck/><span>当前能力等级<b>{ability?.latest?.level||ability?.level||(normalized.length?abilityLevelFromScore(normalized[0].score):"待生成")}</b></span></article><article><ClipboardList/><span>历史测评次数<b>{assessmentRows.length} 次</b></span></article><article><BookOpen/><span>历史训练次数<b>{trainingRows.length} 次</b></span></article><article><Gauge/><span>平均能力评分<b>{overallAverage===null?"—":`${overallAverage} 分`}</b></span></article></section>:<section className="report-summary-v2 report-summary-three"><article><ClipboardList/><span>{tab}总数<b>{source.length} 份</b></span></article><article><Gauge/><span>平均评分<b>{sourceAverage===null?"—":`${sourceAverage} 分`}</b></span></article><article><BadgeCheck/><span>最高能力等级<b>{source.length?abilityLevelFromScore(Math.max(...source.map(row=>row.score))):"待生成"}</b></span></article></section>}
    {tab==="所有报告"&&<><section className="report-skill-v2"><header><h2>当前技能树掌握状态</h2><small>六个主分支、17个技能点，数据来自后端真实能力画像</small></header><div className="report-tree"><SkillTreeView skills={skills} emptyText="暂无技能树数据，完成有效测评后生成"/></div><aside className="skill-status-summary"><h3>技能掌握说明</h3>{!skills.length?<div className="snapshot-empty">暂无真实技能数据，完成有效测评后生成。</div>:<><section className="newly-lit"><h4><Sparkles/>本次新点亮 <b>{currentNewSkills.length}</b></h4>{currentNewSkills.length?<div>{currentNewSkills.map((item,index)=><p key={item.id||skillItemName(item)||index}><i className="mastered"/><span>{skillItemName(item)}</span><em>本次点亮</em></p>)}</div>:<small>本次暂无新点亮技能</small>}</section>{[["已掌握",masteredSkills,"mastered"],["学习中",learningSkills,"learning"],["未解锁",lockedSkills,"locked"]].map(([label,list,state])=><details open key={label}><summary><span><i className={state}/>{label}</span><b>{list.length}</b></summary><div>{list.map(item=><p key={`${item.dimension}-${item.name}`}><i className={state}/><span>{item.name}</span><em>{item.dimension}</em></p>)}</div></details>)}</>}</aside></section><section className="report-compare-v2"><div><h2>总体雷达图</h2>{hasAbilityDimensions?<ResponsiveContainer width="100%" height={320}><RadarChart data={dimensionRows} outerRadius="68%"><PolarGrid stroke="#ddcfb9"/><PolarAngleAxis dataKey="name" tick={{className:"ripple-chart-label-10",fill:"#625a50"}}/><Tooltip/><Radar dataKey="score" stroke="#efa719" fill="#ffc954" fillOpacity={.28}/></RadarChart></ResponsiveContainer>:<div className="growth-empty">暂无真实六维能力数据</div>}</div></section></>}
    <section className="special-growth-v2"><header><h2>成长轨迹</h2><nav>{["最近一个月","最近六个月","全部"].map(label=><button className={period===label?"active":""} onClick={()=>setPeriod(label)} key={label}>{label}</button>)}</nav></header>{trend.length>=2?<ResponsiveContainer width="100%" height={230}><AreaChart data={trend}><CartesianGrid vertical={false} stroke="#eee4d5"/><XAxis dataKey="date"/><YAxis domain={[0,100]}/><Tooltip/><Area dataKey="score" stroke="#efa719" strokeWidth={3} fill="#fff1c4" dot={{r:5,fill:"#efa719"}}/></AreaChart></ResponsiveContainer>:<div className="growth-empty"><BarChart3/><b>暂无成长轨迹</b><span>至少完成两次后生成趋势</span></div>}</section>
    <section className={`report-list-v2 ${tab!=="所有报告"?"special-report-list":""}`}><header><div><h2>{tab==="所有报告"?"历史报告":tab}</h2><small>仅展示当前组织已完成且具有真实评分的报告{unknownClassReports?`；${unknownClassReports} 份报告缺少组织归属，暂未展示`:""}</small></div><div className="report-filters"><label><Search/><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="搜索报告关键词"/></label><select className="report-sort" aria-label="报告排序" value={sort} onChange={event=>setSort(event.target.value)}>{reportSortOptions.map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></div></header>{loading?<div className="report-empty">正在加载真实报告…</div>:error?<div className="report-empty">{error}</div>:rows.length?rows.map(row=><article className="yellow" key={row.reportId||row.id}><FileCheck2/><div><small>{row.type}</small><h3>{row.title}</h3><p>作答时间：{formatReportTime(row.date)}</p></div><span className="report-row-score"><small>综合评分</small><b>{row.score} 分</b></span><span className="report-row-level"><small>能力等级</small><b>{row.level}</b></span><button onClick={()=>openDetail(row)}>查看报告 <ArrowRight/></button></article>):<div className="report-empty"><ClipboardList/><b>{query.trim()?"没有符合条件的报告":`暂无${tab==="所有报告"?"有效历史报告":tab}`}</b></div>}</section>
  </div>
}

function MyClassPage({notify}){
  const {user,username}=useCurrentUser();
  const [classes,setClasses]=useState([]);


  const [inviteCode,setInviteCode]=useState("");
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [leaveTarget,setLeaveTarget]=useState(null);
  const loadClasses=()=>{
    setLoading(true);
    setError("");
    return Promise.allSettled([studentData.joinedClasses()]).then(([classResult])=>{
      const list=classResult.status==="fulfilled"?(Array.isArray(classResult.value)?classResult.value:[]):[];
      setClasses(list);
      const stored=localStorage.getItem("ripple-current-class");
      const selected=list.some(item=>String(item.id)===String(stored))?String(stored):String(list[0]?.id||"");

      if(selected)localStorage.setItem("ripple-current-class",selected);
      else localStorage.removeItem("ripple-current-class");
      if(classResult.status==="rejected")setError(classResult.reason?.message||"组织信息暂时无法加载");
    }).finally(()=>setLoading(false));
  };
  useEffect(()=>{loadClasses()},[]);
  const joinClass=async()=>{
    const code=inviteCode.trim();
    if(!code)return notify("请输入组织邀请码");
    setBusy(true);
    try{
      const joined=await studentData.joinByInvite(code);
      setInviteCode("");
      if(joined?.id)localStorage.setItem("ripple-current-class",String(joined.id));
      await loadClasses();
      window.dispatchEvent(new Event("ripple-classes-changed"));
      notify("已成功加入组织");
    }catch(err){notify(err?.message||"邀请码无效或加入失败")}finally{setBusy(false)}
  };
  const leaveClass=async item=>{
    setBusy(true);
    try{
      await classApi.leave(item.id);
      if(localStorage.getItem("ripple-current-class")===String(item.id))localStorage.removeItem("ripple-current-class");
      await loadClasses();
      window.dispatchEvent(new Event("ripple-classes-changed"));
      notify("已退出组织");
      setLeaveTarget(null);
    }catch(err){setError(err?.message||"退出组织失败")}finally{setBusy(false)}
  };
  return <div className="design-page my-class-page shared-page-bg">
    <header className="design-page-head"><div><h1>我的组织</h1><span>查看已加入组织并管理当前组织</span></div></header>
    <section className="class-join-card"><div><School/><span><h2>输入邀请码</h2><p>输入管理员提供的组织邀请码</p></span></div><label><input value={inviteCode} onChange={e=>setInviteCode(e.target.value.toUpperCase())} onKeyDown={e=>e.key==="Enter"&&joinClass()} placeholder="请输入邀请码" maxLength={24}/><button disabled={busy} onClick={joinClass}>{busy?"处理中":"加入"}</button></label></section>
    <section className="class-list-card"><header><div><h2>已加入的组织</h2><p>共 {classes.length} 个组织</p></div><button onClick={loadClasses} disabled={loading}>{loading?"正在加载":"刷新"}</button></header>

      {loading?<div className="class-empty"><School/><b>正在加载组织信息</b></div>:classes.length?<div className="class-grid">{classes.map((item,index)=><article key={item.id}><i>{String(index+1).padStart(2,"0")}</i><School/><div><h3>{item.name}</h3><p>{item.description||"暂无组织说明"}</p><small>组织 ID：{item.id}</small></div><button disabled={busy} onClick={()=>{setError("");setLeaveTarget(item)}}>退出组织</button></article>)}</div>:<div className="class-empty"><UsersRound/><b>暂未加入组织</b><span>{error||"输入管理员提供的邀请码加入组织"}</span></div>}
    </section>{leaveTarget&&createPortal(<div className="confirm-backdrop" onMouseDown={event=>event.target===event.currentTarget&&!busy&&setLeaveTarget(null)}><section className="confirm-dialog"><button className="dialog-close" disabled={busy} onClick={()=>setLeaveTarget(null)}><X/></button><div className="confirm-icon"><LogOut/></div><h2>确认退出组织</h2><p>退出后，该组织的任务和相关内容将不再显示。确认退出“{leaveTarget.name}”吗？</p>{error&&<small className="confirm-error">{error}</small>}<footer><button disabled={busy} onClick={()=>setLeaveTarget(null)}>取消</button><button className="danger" disabled={busy} onClick={()=>leaveClass(leaveTarget)}>{busy?"退出中…":"确认退出"}</button></footer></section></div>,document.body)}
    
  </div>
}

function Dashboard({ onLogout }) {
  const {username,user}=useCurrentUser();
  const [active, setActive] = useState("首页");
  const [joinedClasses,setJoinedClasses]=useState([]);
  const [classId,setClassId]=useState(()=>localStorage.getItem("ripple-current-class")||"");
  useEffect(()=>{let alive=true;const refresh=()=>studentData.joinedClasses().then(classes=>{if(!alive)return;setJoinedClasses(classes);const saved=localStorage.getItem("ripple-current-class");const selected=classes.some(row=>String(row.id)===String(saved))?String(saved):String(classes[0]?.id||"");setClassId(selected);if(selected)localStorage.setItem("ripple-current-class",selected);else localStorage.removeItem("ripple-current-class")}).catch(()=>{if(alive)setJoinedClasses([])});refresh();window.addEventListener("ripple-classes-changed",refresh);return()=>{alive=false;window.removeEventListener("ripple-classes-changed",refresh)}},[]);
  const [collapsed,setCollapsed]=useState(false);
  const [testTask,setTestTask]=useState(null);
  const [exitTask,setExitTask]=useState(false);
  const [resumeTeacherTasks,setResumeTeacherTasks]=useState(false);
  const [toast, setToast] = useState("");
  const radarData = dimensions.map(d=>({subject:d.name,A:d.score,fullMark:100}));
  const trend=[{m:"3月",v:54},{m:"4月",v:61},{m:"5月",v:68},{m:"6月",v:72},{m:"7月",v:80}];
  const notify=t=>{setToast(t);setTimeout(()=>setToast(""),2200)};
  const openReports=tab=>{setActive("报告中心");if(tab)setTimeout(()=>document.querySelectorAll(".reports-v2>nav button").forEach(button=>button.textContent.trim()===tab&&button.click()),0)};
  useEffect(()=>{window.scrollTo({top:0,left:0,behavior:"instant"})},[active]);
  useEffect(()=>{const open=()=>setActive("个人中心");window.addEventListener("ripple-open-profile",open);return()=>window.removeEventListener("ripple-open-profile",open)},[]);
  const menu=[["首页",Home],["AI能力标准",BadgeCheck],["测评中心",Target],["训练场",Zap],["报告中心",FileCheck2],["我的组织",UsersRound],["个人中心",UserRound]];
  const returnFromTask=()=>{if(testTask?.source==="teacher-task"){setActive("训练场");setResumeTeacherTasks(true)}else if(testTask?.source==="assessment")setActive("测评中心");else setActive("训练场");setExitTask(false);setTestTask(null)};
  if(testTask)return <><LiveAssessmentSession task={testTask} onExit={()=>setExitTask(true)} onReportClose={returnFromTask} notify={notify}/>{exitTask&&<div className="confirm-backdrop" onMouseDown={event=>event.target===event.currentTarget&&setExitTask(false)}><section className="confirm-dialog"><button className="dialog-close" onClick={()=>setExitTask(false)}><X/></button><div className="confirm-icon"><LogOut/></div><h2>确认退出做题</h2><p>当前未提交的内容可能不会保存。确认退出并返回{testTask.source==="teacher-task"?"组织任务列表":testTask.source==="assessment"?"测评中心":"训练场"}吗？</p><footer><button onClick={()=>setExitTask(false)}>继续作答</button><button className="danger" onClick={returnFromTask}>确认退出</button></footer></section></div>}</>;
  return <main className={`dashboard student-home-shell ${collapsed?"sidebar-collapsed":""}`}>
    <PortalSidebar portal="student" active={active} collapsed={collapsed} onSelect={setActive} onToggle={()=>setCollapsed(v=>!v)} onExit={onLogout} primary={menu} classSelector={<div className="sidebar-class-card"><label htmlFor="sidebar-current-class">当前组织</label><select id="sidebar-current-class" value={classId} disabled={!joinedClasses.length} onChange={event=>{const selected=event.target.value;setClassId(selected);localStorage.setItem("ripple-current-class",selected)}}>{!joinedClasses.length?<option value="">暂未加入组织</option>:joinedClasses.map(row=><option key={row.id} value={String(row.id)}>{row.name}</option>)}</select><div className="sidebar-account"><span>{(user.name||user.realName||username||"用").slice(0,1).toUpperCase()}</span><div><b>{user.name||user.realName||username}</b><small>{username}</small></div><button title="个人中心" onClick={()=>setActive("个人中心")}><LogOut/></button></div></div>}/>
    <section className="dash-main">{active==="首页"?<StudentHome key={classId} classId={classId} onNavigate={p=>setActive(p==="我的"?"个人中心":p==="AI 能力标准"?"AI能力标准":p)} notify={notify}/>:active==="AI能力标准"?<LevelStandardPage onProfile={()=>setActive("个人中心")}/>:active==="训练场"?<TrainingGroundV2 key={classId} classId={classId} onStart={setTestTask} onReports={()=>openReports("训练报告")} openTeacherTasks={resumeTeacherTasks} onTeacherTasksClosed={()=>setResumeTeacherTasks(false)}/>:active==="测评中心"?<AssessmentCenterV2 key={classId} classId={classId} onStart={setTestTask} onReports={()=>openReports("测评报告")}/>:active==="报告中心"?<HistoryReportsV2 key={classId} classId={classId} notify={notify}/>:active==="我的组织"?<MyClassPage notify={notify}/>:active==="个人中心"?<ProfileV2 notify={notify}/>:<>
      <header><div><span>欢迎使用 AI 能力测评平台</span><h1>你好，{username} <i>☀</i></h1><p>每一次练习，都在让你更懂 AI。</p></div><div className="header-actions"><button onClick={()=>notify("暂无新消息")}><HelpCircle size={20}/></button><button onClick={()=>setActive("我的")}><CircleUserRound size={24}/></button></div></header>
      <div className="hero-card"><div><span className="tag"><Sparkles size={13}/> 今日推荐</span><h2>用 15 分钟，<br/>刷新你的 AI 能力画像</h2><p>系统会根据你的历史表现，智能选择最适合的题目。</p><button onClick={()=>notify("正在为你准备自适应测评…")}>开始自适应测评 <ArrowRight size={17}/></button></div><div className="orb"><div className="orb-core"><BrainCircuit/></div><i/><i/><i/></div><div className="hero-progress"><span>预计 15 分钟</span><b>上次综合得分 80</b></div></div>
      <div className="stat-row">
        <article><div><Gauge/><span>综合能力</span></div><b>{user.stats?.score||0}<small>/100</small></b><em>完成测评后生成</em></article>
        <article><div><BadgeCheck/><span>已完成测评</span></div><b>{user.stats?.assessments||0}<small>次</small></b><em>根据实际测试累计</em></article>
        <article><div><Clock3/><span>累计训练</span></div><b>{((user.stats?.minutes||0)/60).toFixed(1)}<small>小时</small></b><em>根据实际训练累计</em></article>
        <article><div><Trophy/><span>能力徽章</span></div><b>{user.stats?.badges||0}<small>枚</small></b><em>达成条件后获得</em></article>
      </div>
      <div className="dash-grid">
        <article className="panel radar-panel"><div className="panel-title"><div><span>能力画像</span><small>基于最近 5 次测评</small></div><button onClick={()=>notify("完整能力报告已生成")}>查看报告 <ChevronRight size={15}/></button></div>
          <div className="radar-wrap"><ResponsiveContainer width="54%" height={260}><RadarChart data={radarData}><PolarGrid stroke="#dce6df"/><PolarAngleAxis dataKey="subject" tick={{fill:"#536158",className:"ripple-chart-label-12"}}/><Radar dataKey="A" stroke="#55b98e" fill="#75d8ad" fillOpacity={.38}/></RadarChart></ResponsiveContainer>
          <div className="score-list">{dimensions.map(d=><div key={d.name}><span>{d.name}</span><b>{d.score}</b><i><em style={{width:d.score+"%"}}/></i></div>)}</div></div>
        </article>
        <article className="panel trend-panel"><div className="panel-title"><div><span>成长趋势</span><small>近五个月综合能力变化</small></div><em>+26</em></div>
          <ResponsiveContainer width="100%" height={190}><AreaChart data={trend}><defs><linearGradient id="growth" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#ef8f76" stopOpacity={.35}/><stop offset="95%" stopColor="#ef8f76" stopOpacity={0}/></linearGradient></defs><CartesianGrid vertical={false} stroke="#edf0ed"/><XAxis dataKey="m" axisLine={false} tickLine={false}/><YAxis hide domain={[40,90]}/><Tooltip/><Area type="monotone" dataKey="v" stroke="#e77d65" strokeWidth={3} fill="url(#growth)"/></AreaChart></ResponsiveContainer>
          <div className="insight"><Sparkles size={18}/><span><b>AI 洞察</b>你的结果评估能力提升最快，建议继续加强提示词的上下文编排。</span></div>
        </article>
      </div>
      <section className="recent"><div className="section-title"><h3>最近测评</h3><button onClick={()=>notify("已展开全部测评记录")}>查看全部 <ArrowRight size={15}/></button></div><div className="recent-grid">{recent.map((r,i)=><article key={r.title}><div className={`recent-icon ${r.color}`}>{i===0?<BrainCircuit/>:i===1?<Code2/>:<FileCheck2/>}</div><div><span>{r.mode} · {r.date}</span><b>{r.title}</b><small>{r.score>=85?"表现优秀，保持状态":"已生成专属提升建议"}</small></div><strong>{r.score}<small>分</small></strong><button onClick={()=>notify(`正在打开「${r.title}」报告`)}><ChevronRight/></button></article>)}</div></section></>}
    </section>
    {toast&&<div className="toast"><Check size={17}/>{toast}</div>}
  </main>
}

function UserRuntimeBridge(){
  const {username,user,updateUser}=useCurrentUser();
  useEffect(()=>{
    const sync=()=>{
      const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
      let node;
      while((node=walker.nextNode())) if(node.nodeValue?.includes("陈语溪")) node.nodeValue=node.nodeValue.replaceAll("陈语溪",username);
      const stats={...emptyStats,...user.stats};
      const metricValues={"综合得分":`${stats.score}`,"完成任务":`${stats.tasks}`,"累计训练":`${stats.trainings}`,"累计时长":`${(stats.minutes/60).toFixed(1)}`,"连续学习":`${stats.streak}`};
      document.querySelectorAll("span").forEach(label=>{
        const value=metricValues[label.childNodes[0]?.nodeValue?.trim()||label.textContent.trim()];
        const target=label.querySelector("b")||label.closest("article")?.querySelector("b");
        if(value!==undefined&&target&&target.childNodes[0]?.nodeValue!==value) target.childNodes[0].nodeValue=value;
      });
    };
    sync(); const observer=new MutationObserver(sync); observer.observe(document.body,{subtree:true,childList:true});
    return()=>observer.disconnect();
  },[username,user.stats,updateUser]);
  return null;
}

export default function App(){
  const [page,setPage]=useState(()=>typeof window !== "undefined" && sessionStorage.getItem("ripple-auth")?(portalOptions.some(option=>option.id===sessionStorage.getItem("ripple-role"))?"dashboard":"role-select"):"landing");
  const [role,setRole]=useState(()=>portalOptions.some(option=>option.id===sessionStorage.getItem("ripple-role"))?sessionStorage.getItem("ripple-role"):"student");
  const [user,setUser]=useState(()=>readStoredUser()||{username:"用户",name:"用户",stats:{...emptyStats},isNew:true});
  const [logoutRequested,setLogoutRequested]=useState(false);
  useEffect(()=>{
    const storedRole=sessionStorage.getItem("ripple-role");
    if(storedRole&&!portalOptions.some(option=>option.id===storedRole)){
      clearAuthToken();
      for(const key of ["ripple-auth","ripple-role","ripple-user"])sessionStorage.removeItem(key);
      setUser({username:"用户",name:"用户",stats:{...emptyStats},isNew:true});
    }
  },[]);
  const updateUser=patch=>setUser(current=>{const next={...current,...patch,stats:{...emptyStats,...current.stats,...patch.stats}};sessionStorage.setItem("ripple-user",JSON.stringify(next));return next});
  const addActivity=({type="training",score=0,minutes=0}={})=>setUser(current=>{const stats={...emptyStats,...current.stats};if(type==="assessment")stats.assessments+=1;else stats.trainings+=1;stats.tasks+=1;stats.minutes+=minutes;stats.score=Number(score);const now=new Date();const stamp=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")} ${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`;const next={...current,isNew:false,stats,level:abilityLevelFromScore(stats.score),lastActivityAt:stamp,...(type==="assessment"?{lastAssessmentAt:stamp}:{lastTrainingAt:stamp})};sessionStorage.setItem("ripple-user",JSON.stringify(next));return next});
  const go=p=>{setPage(p);window.scrollTo(0,0)};
  const chooseRole=r=>{setRole(r);go("login")};
  const login=(selectedRole,incoming)=>{const name=incoming?.name||incoming?.realName||incoming?.username||"用户";const next={...incoming,name,realName:incoming?.realName||name,username:name,stats:{...emptyStats,...(incoming?.stats||{})}};setRole(selectedRole);setUser(next);localStorage.removeItem("ripple-user-profile");sessionStorage.setItem("ripple-auth","1");sessionStorage.setItem("ripple-role",selectedRole);sessionStorage.setItem("ripple-user",JSON.stringify(next));go("dashboard")};
  const logout=()=>{setLogoutRequested(false);authApi.logout().catch(()=>{});clearAuthToken();localStorage.removeItem("ripple-user-profile");localStorage.removeItem("ripple-current-class");sessionStorage.removeItem("ripple-auth");sessionStorage.removeItem("ripple-role");sessionStorage.removeItem("ripple-user");sessionStorage.removeItem("api-demo-mode");setUser({username:"用户",name:"用户",stats:{...emptyStats},isNew:true});go("role-select")};
  if(page==="landing")return <LandingV2 onLogin={()=>go("role-select")}/>;
  if(page==="role-select")return <RoleSelect onBack={()=>go("landing")} onSelect={chooseRole}/>;
  if(page==="login")return <Login role={role} onBack={()=>go("role-select")} onSuccess={login}/>;
  const content=role==="teacher"?<TeacherPortal onLogout={()=>setLogoutRequested(true)}/>:<Dashboard onLogout={()=>setLogoutRequested(true)}/>;
  return <UserContext.Provider value={{user,username:user.username||user.name||user.account||"用户",updateUser,addActivity}}>{content}{logoutRequested&&<div className="confirm-backdrop" onMouseDown={event=>event.target===event.currentTarget&&setLogoutRequested(false)}><section className="confirm-dialog"><button className="dialog-close" onClick={()=>setLogoutRequested(false)}><X/></button><div className="confirm-icon"><LogOut/></div><h2>确认退出{role==="teacher"?"管理端":"学生端"}</h2><p>退出后将返回使用端选择页面，需要重新登录才能继续使用。</p><footer><button onClick={()=>setLogoutRequested(false)}>取消</button><button className="danger" onClick={logout}>确认退出</button></footer></section></div>}</UserContext.Provider>;
}
