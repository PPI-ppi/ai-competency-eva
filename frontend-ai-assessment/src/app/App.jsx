import React, { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { authApi } from "../services/api";
import {
  clearSession,
  readRole,
  readToken,
  readUser,
  writeRole,
  writeUser,
} from "./storage";
import { Landing } from "../components/layout/Landing";
import { Shell } from "../components/layout/Shell";
import { Loading, ToastHost } from "../components/Feedback";
import { AuthPage } from "../pages/auth/AuthPage";
import {
  StudentDashboard,
  TeacherDashboard,
} from "../pages/dashboard/DashboardPages";
import {
  AssessmentPage,
  ResultPage,
} from "../pages/assessment/AssessmentPages";
import {
  StudentClassesPage,
  StudentTasksPage,
  RecordsPage,
  ReportsPage,
} from "../pages/student/StudentPages";
import { ProfilePage } from "../pages/account/AccountPages";
import { StandardsPage } from "../components/AbilityOverview";

/**
 * 教师端三个页面单独成 chunk：学生端永远用不到，不该压进首屏包里。
 *
 * 三个入口指向同一个模块，构建后会合并成一个共用的异步 chunk，
 * 所以第一次进任意教师页时下载的仍是同一份代码。
 */
const TeacherClassesPage = lazy(() =>
  import("../pages/teacher/TeacherPages").then((m) => ({ default: m.TeacherClassesPage })),
);
const TeacherQuestionsPage = lazy(() =>
  import("../pages/teacher/TeacherPages").then((m) => ({ default: m.TeacherQuestionsPage })),
);
const TrainingQuestionsPage = lazy(() => import("../pages/teacher/TrainingQuestionsPage"));
const TeacherTasksPage = lazy(() =>
  import("../pages/teacher/TeacherPages").then((m) => ({ default: m.TeacherTasksPage })),
);

export function App() {
  const [screen, setScreen] = useState(() =>
    readToken() ? "dashboard" : "landing",
  );
  const [role, setRole] = useState(() => readRole() || "student");
  const [user, setUser] = useState(readUser);
  const [toasts, setToasts] = useState([]);

  const dismissToast = useCallback(
    (id) => setToasts((previous) => previous.filter((item) => item.id !== id)),
    [],
  );

  /**
   * 全局提示：挂在 App 最外层，所以登录页、注册页同样看得到。
   *
   *   notify("资料已更新")                  → info，3 秒
   *   notify(error)                         → error（传 Error 对象自动识别），6 秒
   *   notify("账号或密码错误", "error")      → error，显式指定
   *
   * 最多同时显示 3 条，多的把最旧的挤掉，避免刷屏。
   */
  const notify = useCallback((message, type) => {
    const text =
      message instanceof Error ? message.message : String(message ?? "").trim();
    if (!text) return;
    const kind = type || (message instanceof Error ? "error" : "info");
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((previous) => [...previous.slice(-2), { id, text, type: kind }]);
    setTimeout(
      () => setToasts((previous) => previous.filter((item) => item.id !== id)),
      kind === "error" ? 6000 : 3000,
    );
  }, []);

  // 稳定引用：它会作为依赖传给页面级的 effect，每次渲染换新函数会让那些 effect 反复执行
  const go = useCallback((nextScreen) => setScreen(nextScreen), []);

  const login = (nextUser, nextRole) => {
    setUser(nextUser);
    setRole(nextRole);
    writeUser(nextUser);
    writeRole(nextRole);
    go("dashboard");
  };

  const logout = async () => {
    try {
      await authApi.logout();
    } catch {
      // 退出登录失败也要把本地会话清干净，不打断用户
    }
    clearSession();
    setUser(null);
    go("landing");
  };

  // 登录态失效：api 层发现 401 会发这个事件，这里统一提示并回到登录页，
  // 而不是让页面默默刷新一下、把用户丢回首页却不说原因。
  useEffect(() => {
    const onExpired = () => {
      setUser(null);
      setScreen("landing");
      notify("登录已过期，请重新登录", "error");
    };
    window.addEventListener("session-expired", onExpired);
    return () => window.removeEventListener("session-expired", onExpired);
  }, [notify]);

  let view;
  if (screen === "landing") {
    view = (
      <Landing
        choose={(nextRole) => {
          setRole(nextRole);
          go("login");
        }}
      />
    );
  } else if (screen === "login") {
    view = (
      <AuthPage
        mode="login"
        role={role}
        back={() => go("landing")}
        register={() => go("register")}
        onLogin={login}
        notify={notify}
      />
    );
  } else if (screen === "register") {
    view = (
      <AuthPage
        mode="register"
        role={role}
        back={() => go("login")}
        register={() => go("login")}
        onLogin={login}
        notify={notify}
      />
    );
  } else {
    view = (
      <Shell
        role={role}
        user={user}
        screen={screen}
        go={go}
        logout={logout}
        notify={notify}
      >
        {/* 懒加载页面在切换时先显示占位，避免白屏一瞬间 */}
        <Suspense fallback={<Loading text="正在打开页面…" />}>
          <Page screen={screen} role={role} user={user} go={go} notify={notify} />
        </Suspense>
      </Shell>
    );
  }

  return (
    <>
      {view}
      <ToastHost toasts={toasts} onDismiss={dismissToast} />
    </>
  );
}

function Page({ screen, role, user, go, notify }) {
  if (screen === "dashboard")
    return role === "student" ? (
      <StudentDashboard user={user} go={go} notify={notify} />
    ) : (
      <TeacherDashboard user={user} go={go} />
    );
  if (screen === "classes")
    return role === "student" ? (
      <StudentClassesPage go={go} notify={notify} />
    ) : (
      <TeacherClassesPage notify={notify} />
    );
  if (screen === "records") return <RecordsPage go={go} notify={notify} />;
  if (screen === "reports") return <ReportsPage go={go} notify={notify} />;
  if (screen === "standards") return <StandardsPage notify={notify} />;
  if (screen === "profile")
    return <ProfilePage role={role} user={user} notify={notify} />;
  if (screen === "questions")
    return role === "teacher" ? (
      <TeacherQuestionsPage notify={notify} />
    ) : (
      <StudentDashboard user={user} go={go} notify={notify} />
    );
  if (screen === "training") return role === "teacher" ? <TrainingQuestionsPage notify={notify} /> : <StudentDashboard user={user} go={go} notify={notify} />;
  if (screen === "tasks")
    return role === "student" ? (
      <StudentTasksPage go={go} notify={notify} />
    ) : (
      <TeacherTasksPage notify={notify} />
    );
  if (screen === "assessment")
    return <AssessmentPage go={go} notify={notify} />;
  if (screen === "result") return <ResultPage go={go} notify={notify} />;
  return <StudentDashboard user={user} go={go} notify={notify} />;
}
