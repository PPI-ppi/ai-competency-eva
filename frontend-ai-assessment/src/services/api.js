import { readToken, saveToken, clearSession } from "../app/storage";

/**
 * 接口地址：
 *   · 开发（npm run dev）默认连本机 8080；
 *   · 生产构建默认走同源 `/api`（由 nginx 反代），**不写死域名**——
 *     否则忘了设 VITE_API_BASE 时，产物会指向 localhost:8080，
 *     部署到服务器后浏览器连的是访问者自己的电脑，表现为"网络连接失败"。
 *   · 需要直连别的域名时用 VITE_API_BASE 覆盖。
 */
const API_BASE =
  import.meta.env.VITE_API_BASE ||
  (import.meta.env.DEV ? "http://localhost:8080/api" : "/api");
const DEFAULT_TIMEOUT = 20000;

/**
 * 让界面能反映真实的后端可达性：任何请求成功算「在线」，网络层失败算「异常」。
 * Shell 顶部的状态灯订阅这个事件——之前那里写死「系统运行中」，后端挂了也照样显示绿灯。
 */
const reportStatus = (online) =>
  window.dispatchEvent(
    new CustomEvent("api-status", { detail: online ? "online" : "offline" }),
  );

export async function request(path, options = {}) {
  const token = readToken();
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    options.timeout ?? DEFAULT_TIMEOUT,
  );
  let response;
  try {
    response = await fetch(API_BASE + path, {
      ...options,
      signal: options.signal ?? controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: token } : {}),
        ...(options.headers || {}),
      },
    });
  } catch (error) {
    // 请求根本没到服务器：超时或断网。给一句人话，而不是让按钮一直转圈。
    reportStatus(false);
    throw new Error(
      error?.name === "AbortError"
        ? "请求超时，请稍后重试"
        : "网络连接失败，请检查网络后重试",
    );
  } finally {
    clearTimeout(timer);
  }
  reportStatus(true);

  const body = await response
    .json()
    .catch(() => ({ message: "服务返回了无法解析的内容" }));
  // 401 的含义分两种，别混：
  //   · 登录接口自己返回 401 = 账号或密码错误，要原样告诉用户；
  //   · 带着令牌请求却收到 401 = 登录态失效，才清会话、回登录页。
  const isAuthCall = path.startsWith("/auth/");
  const unauthorized = response.status === 401 || body.code === 401;
  if (unauthorized && !isAuthCall && token) {
    saveToken();
    clearSession();
    // 交给 App 统一处理：提示一句「登录已过期」再回到登录页。
    // 这里不再直接 reload——刷新会把提示一起冲掉，用户只会莫名其妙回到首页。
    window.dispatchEvent(new CustomEvent("session-expired"));
    throw new Error("登录已过期，请重新登录");
  }
  if (!response.ok || (body.code && body.code !== 200))
    throw new Error(body.message || `请求失败（${response.status}）`);
  return body.data ?? body;
}
export const post = (path, body) =>
  request(path, { method: "POST", body: JSON.stringify(body) });
export const put = (path, body) =>
  request(path, { method: "PUT", body: JSON.stringify(body) });

/**
 * 前端错误上报：发到 /api/client-logs，由后端写进服务端日志。
 *
 * 用 keepalive 是为了页面崩溃/跳转途中也能发出去；失败一律静默——
 * 上报本身绝不能再给用户添一个错误。
 */
export function reportClientLog(payload) {
  try {
    fetch(`${API_BASE}/client-logs`, {
      method: "POST",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => {});
  } catch {
    // 忽略：上报失败不影响任何功能
  }
}

export const authApi = {
  login: (payload) => post("/auth/login", payload),
  register: (role, payload) => post(`/auth/register/${role}`, payload),
  logout: () => post("/auth/logout", {}),
};
export const userApi = {
  me: () => request("/users/me"),
  update: (payload) => put("/users/me", payload),
  password: (payload) => put("/users/password", payload),
};
export const classApi = {
  joined: () => request("/classes/joined"),
  managed: () => request("/classes/managed"),
  join: (inviteCode) => post("/classes/join", { inviteCode }),
  // 班级能力数据：一次拿到雷达图、技能树、趋势曲线、上一次对比需要的全部数据。
  myAbility: (classId) => request(`/classes/${classId}/my-ability`),
  create: (payload) => post("/classes", payload),
  weightSupport: () => request("/classes/weight-support"),
  detail: (id) => request(`/classes/${id}`),
  members: (id) => request(`/classes/${id}/members`),
  leave: (id) => request(`/classes/${id}/leave`, { method: "DELETE" }),
  tasks: (id) => request(`/classes/${id}/assessment-tasks`),
  addQuestion: (cid, qid) => post(`/classes/${cid}/questions/${qid}`, {}),
  questions: (id) => request(`/classes/${id}/questions`),
  removeMember: (id, studentId) => request(`/classes/${id}/members/${studentId}`, { method: "DELETE" }),
  removeQuestion: (id, questionId) => request(`/classes/${id}/questions/${questionId}`, { method: "DELETE" }),
  refreshInvite: (id) => post(`/classes/${id}/invite-code`, {}),
};
export const questionApi = {
  list: () => request("/questions"),
  create: (payload) => post("/questions", payload),
  update: (id, payload) => put(`/questions/${id}`, payload),
  publish: (id) => post(`/questions/${id}/publish`, {}),
  offline: (id) => post(`/questions/${id}/offline`, {}),
  restore: (id) => post(`/questions/${id}/restore`, {}),
  detail: (id) => request(`/questions/${id}`),
  publicList: () => request("/questions/public"),
  unpublish: (id) => post(`/questions/${id}/unpublish`, {}),
  copyPublic: (id) => post(`/questions/public/${id}/copy`, {}),
  // 固定分类词表：维度 + 该维度下的考察点，前端只能用这里返回的值。
  taxonomy: () => request("/questions/taxonomy"),
};
export const taskApi = {
  available: () => request("/assessment-tasks/available"),
  detail: (id) => request(`/assessment-tasks/${id}`),
  managed: (classId) => request(`/classes/${classId}/assessment-tasks`),
  start: (id) => post(`/assessment-tasks/${id}/start`, {}),
  create: (cid, payload) => post(`/classes/${cid}/assessment-tasks`, payload),
  // options 是学生自选的考察范围 { dimensions, assessmentPoints }；不传表示不限制。
  startSelf: (classId, options) => post(`/classes/${classId}/self-assessments/start`, options || {}),
};
export const teacherApi = {
  classResults: (classId) => request(`/teacher/classes/${classId}/results`),
  taskResults: (taskId) =>
    request(`/teacher/assessment-tasks/${taskId}/results`),
  detail: (id) => request(`/teacher/assessments/${id}`),
};
export const assessmentApi = {
  // 不带 classId 时返回全部记录（兼容老行为）；带上就只返回该班级的记录。
  list: (classId) => request(classId ? `/assessments?classId=${classId}` : "/assessments"),
  status: (id) => request(`/assessments/${id}`),
  // 恢复现场：整场对话消息 + 当前题目
  conversation: (id) => request(`/assessments/${id}/conversation`),
  complete: (id) => post(`/assessments/${id}/complete`, {}),
  /**
   * 测评中的对话：一个请求一个回合。
   * 事件由后端决定——question（当前题目）、delta（发言片段）、
   * answered（某题答完）、finished（整场结束）、error。
   */
  chat: async (id, content, onEvent, extra = {}) => {
    const token = readToken();
    const response = await fetch(
      `${API_BASE}/assessments/${id}/chat/stream`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
          ...(token ? { Authorization: token } : {}),
        },
        body: JSON.stringify({ content, ...extra }),
      },
    );
    if (!response.ok || !response.body) {
      const body = await response.json().catch(() => null);
      throw new Error(body?.message || "流式连接失败");
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    const handle = (block) => {
      const eventName = block
        .split("\n")
        .find((line) => line.startsWith("event:"))
        ?.slice(6)
        .trim();
      const data = block
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim())
        .join("\n");
      if (!eventName || !data) return;
      let payload;
      try {
        payload = JSON.parse(data);
      } catch {
        payload = data;
      }
      if (eventName === "error")
        throw new Error(typeof payload === "string" ? payload : payload?.message || "对话失败");
      onEvent?.(eventName, payload);
    };
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split("\n\n");
      buffer = blocks.pop() || "";
      blocks.forEach(handle);
    }
    if (buffer.trim()) handle(buffer);
  },
  result: (id) => request(`/assessments/${id}/result`),
};
