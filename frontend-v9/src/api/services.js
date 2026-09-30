import { fetchEventSource } from "@microsoft/fetch-event-source";
import {streamUpdate,normalizeZipReport} from './zipBackendContract';
import { ApiError, buildApiUrl, clearAuthToken, getAuthHeaders, http, saveAuthToken } from "./client";

export const authApi = {
  async login(name, password, role, accountOverride) {
    const normalizedRole = String(role || "").toUpperCase();
    const data = await http.post("/api/auth/login", {
      name,
      password,
      role: normalizedRole,
      // 兼容尚未升级的后端：界面仍然只让用户填写姓名。
      account: accountOverride || name,
    });
    saveAuthToken(data?.tokenName, data?.tokenValue);
    return data;
  },
  registerStudent: body => http.post("/api/auth/register/student", body),
  registerTeacher: body => http.post("/api/auth/register/teacher", body),
  async logout() {
    try { return await http.post("/api/auth/logout"); }
    finally { clearAuthToken(); }
  },
};

export const userApi = {
  me: () => http.get("/api/users/me"),
  updateMe: body => http.put("/api/users/me", body),
  updatePassword: body => http.put("/api/users/password", body),
  removeMe: body => http.delete("/api/users/me", { body }),
};

export const questionApi = {
  list: query => http.get("/api/questions", { query }),
  detail: questionId => http.get(`/api/questions/${questionId}`),
  create: body => http.post("/api/questions", body),
  update: (questionId, body) => http.put(`/api/questions/${questionId}`, body),
  remove: questionId => http.delete(`/api/questions/${questionId}`),
  publish: questionId => http.post(`/api/questions/${questionId}/publish`),
  unpublish: questionId => http.post(`/api/questions/${questionId}/unpublish`),
  publicList: query => http.get("/api/questions/public", { query }),
  copyPublic: questionId => http.post(`/api/questions/public/${questionId}/copy`),
  taxonomy: () => http.get("/api/questions/taxonomy"),
  dimensions: () => http.get("/api/questions/taxonomy"),
  offline: questionId => http.post(`/api/questions/${questionId}/offline`),
  restore: questionId => http.post(`/api/questions/${questionId}/restore`),
};

export const classApi = {
  managed: () => http.get("/api/classes/managed"),
  joined: () => http.get("/api/classes/joined"),
  create: body => http.post("/api/classes", body),
  update: (classId, body) => http.put(`/api/classes/${classId}`, body),
  remove: classId => http.delete(`/api/classes/${classId}`),
  join: inviteCode => http.post("/api/classes/join", { inviteCode }),
  leave: classId => http.delete(`/api/classes/${classId}/leave`),
  members: classId => http.get(`/api/classes/${classId}/members`),
  removeMember: (classId, studentId) => http.delete(`/api/classes/${classId}/members/${studentId}`),
  questions: classId => http.get(`/api/classes/${classId}/questions`),
  addQuestion: (classId, questionId) => http.post(`/api/classes/${classId}/questions/${questionId}`),
  removeQuestion: (classId, questionId) => http.delete(`/api/classes/${classId}/questions/${questionId}`),
  refreshInviteCode: classId => http.post(`/api/classes/${classId}/invite-code`),
};

export const assessmentApi = {
  list: query => http.get("/api/assessments", { query }),
  status: assessmentId => http.get(`/api/assessments/${assessmentId}`),
  detail: assessmentId => http.get(`/api/assessments/${assessmentId}/detail`),
  availableTasks: query => http.get("/api/assessment-tasks/available", { query }),
  startSelf: (classId, body = {}) => http.post(`/api/classes/${classId}/self-assessments/start`, body),
  startTask: taskId => http.post(`/api/assessment-tasks/${taskId}/start`),
  nextQuestion: assessmentId => http.post(`/api/assessments/${assessmentId}/next`),
  answer: (assessmentId, recordQuestionId, answer) => http.put(`/api/assessments/${assessmentId}/questions/${recordQuestionId}/answer`, { answer }),
  submit: assessmentId => http.post(`/api/assessments/${assessmentId}/submit`),
  result: async assessmentId => normalizeZipReport(await http.get(`/api/assessments/${assessmentId}/result`)),
  reportList: query => http.get("/api/reports", { query }),
  reportSnapshot: reportId => http.get(`/api/reports/${reportId}/snapshot`),
  learningAdvice: assessmentId => http.post(`/api/assessments/${assessmentId}/learning-advice`, undefined, { timeout: 180000 }),
  latestResult: classId => http.get("/api/assessments/results/latest", { query: { classId } }),
  resultHistory: query => http.get("/api/assessments/results/history", { query }),
  classTasks: (classId, query) => http.get(`/api/classes/${classId}/assessment-tasks`, { query }),
  createClassTask: (classId, body) => http.post(`/api/classes/${classId}/assessment-tasks`, body),
  removeTask: taskId => http.delete(`/api/assessment-tasks/${taskId}`),
  classAverage: classId => http.get(`/api/classes/${classId}/assessment-results/average`),
  teacherTaskResults: taskId => http.get(`/api/teacher/assessment-tasks/${taskId}/results`),
  teacherAssessmentDetail: async assessmentId => normalizeZipReport(await http.get(`/api/teacher/assessments/${assessmentId}`)),
  conversation: assessmentId => http.get(`/api/assessments/${assessmentId}/conversation`),
  workspace: assessmentId => http.get(`/api/assessments/${assessmentId}/workspace`),
  questionWorkspace: (assessmentId, recordQuestionId) => http.get(`/api/assessments/${assessmentId}/questions/${recordQuestionId}/workspace`),
  selectQuestion: (assessmentId, recordQuestionId) => http.post(`/api/assessments/${assessmentId}/questions/${recordQuestionId}/select`),
  submitFinalAnswer: (assessmentId, recordQuestionId, answer) => http.put(`/api/assessments/${assessmentId}/questions/${recordQuestionId}/final-answer`, { answer }),
  requestFollowUp: (assessmentId, recordQuestionId) => http.post(`/api/assessments/${assessmentId}/questions/${recordQuestionId}/follow-up`),
  uploadArtifact: (assessmentId, questionId, file, artifactType = "image", codeLanguage) => {
    const form = new FormData();
    form.append("file", file);
    form.append("assessmentId", String(assessmentId));
    form.append("assessmentQuestionId", String(questionId));
    form.append("artifactType", artifactType);
    if (codeLanguage) form.append("codeLanguage", codeLanguage);
    return http.post("/api/agent/files", form);
  },
  complete: assessmentId => http.post(`/api/assessments/${assessmentId}/complete`),
};

class SseError extends ApiError {
  constructor(message, options = {}) {
    super(message, options);
    this.name = "SseError";
    this.reported = options.reported || false;
  }
}

async function responseError(response) {
  let payload = null;
  try {
    payload = await response.clone().json();
  } catch {
    try { payload = await response.clone().text(); } catch { /* ignore unreadable body */ }
  }
  return new SseError(payload?.message || (typeof payload === "string" && payload) || `请求失败：${response.status}`, {
    status: response.status,
    code: payload?.code,
    data: payload,
  });
}

export async function sendAgentMessage(
  assessmentId,
  recordQuestionId,
  content,
  onToken = () => {},
  onDone = () => {},
  onError = () => {},
  signal,
) {
  let completed = false;
  let doneResult;

  await fetchEventSource(
    buildApiUrl(`/api/assessments/${assessmentId}/questions/${recordQuestionId}/session/messages`),
    {
      method: "POST",
      headers: getAuthHeaders({
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      }),
      body: JSON.stringify({ content }),
      credentials: "include",
      signal,
      openWhenHidden: true,
      async onopen(response) {
        if (!response.ok) throw await responseError(response);
        const contentType = response.headers.get("content-type") || "";
        if (!contentType.includes("text/event-stream")) {
          throw new SseError("后端没有返回 SSE 数据", { status: response.status });
        }
      },
      onmessage(event) {
        if (event.event === "token") {
          onToken(event.data);
          return;
        }
        if (event.event === "done") {
          try {
            doneResult = JSON.parse(event.data);
          } catch (error) {
            throw new SseError("SSE 完成事件不是有效的 JSON", { cause: error, data: event.data });
          }
          completed = true;
          onDone(doneResult);
          return;
        }
        if (event.event === "error") {
          const error = new SseError(event.data || "Agent 返回错误", { reported: true });
          onError(error.message);
          throw error;
        }
      },
      onclose() {
        if (!completed) throw new SseError("SSE 连接在完成事件前已关闭");
      },
      onerror(error) {
        if (error?.name !== "AbortError" && !error?.reported) onError(error?.message || "流式请求失败");
        throw error;
      },
    },
  );

  return doneResult;
}

export async function sendAssessmentChat(assessmentId, content, handlers = {}, signal, extra = {}) {
  let completed = false;
  await fetchEventSource(buildApiUrl(`/api/assessments/${assessmentId}/chat/stream`), {
    method: "POST",
    headers: getAuthHeaders({ "Content-Type": "application/json", Accept: "text/event-stream" }),
    body: JSON.stringify({ content, ...extra }), credentials: "include", signal, openWhenHidden: true,
    async onopen(response) {
      if (!response.ok) throw await responseError(response);
      if (!(response.headers.get("content-type") || "").includes("text/event-stream")) throw new SseError("后端没有返回 SSE 数据", { status: response.status });
    },
    onmessage(event) {
      let data = event.data;
      try { data = JSON.parse(event.data); } catch { /* text delta */ }
      if (["delta", "token"].includes(event.event)) handlers.onDelta?.(typeof data === "string" ? data : data?.text ?? data?.content ?? "");
      else if (["question", "state", "finished"].includes(event.event)) handlers.onState?.(streamUpdate(event.event,data));
      else if (["done", "complete"].includes(event.event)) { completed = true; handlers.onDone?.(data); }
      else if (event.event === "error") throw new SseError(typeof data === "string" ? data : data?.message || "Agent 返回错误");
    },
    onclose() { if (!completed) { handlers.onClose?.(); throw new SseError("对话连接提前中断，请刷新确认作答记录后再重试"); } },
    onerror(error) { handlers.onError?.(error); throw error; },
  });
}

export async function sendAssessmentPlainChat(assessmentId, content, handlers = {}, signal) {
  let completed = false;
  await fetchEventSource(buildApiUrl(`/api/assessments/${assessmentId}/chat`), {
    method: "POST",
    headers: getAuthHeaders({ "Content-Type": "application/json", Accept: "text/event-stream" }),
    body: JSON.stringify({ content }), credentials: "include", signal, openWhenHidden: true,
    async onopen(response) {
      if (!response.ok) throw await responseError(response);
      if (!(response.headers.get("content-type") || "").includes("text/event-stream")) throw new SseError("后端没有返回 SSE 数据", { status: response.status });
    },
    onmessage(event) {
      let data = event.data;
      try { data = JSON.parse(event.data); } catch { /* text delta */ }
      if (["delta", "token"].includes(event.event)) handlers.onDelta?.(typeof data === "string" ? data : data?.text ?? data?.content ?? "");
      else if (["done", "complete"].includes(event.event)) { completed = true; handlers.onDone?.(data); }
      else if (event.event === "error") throw new SseError(typeof data === "string" ? data : data?.message || "对话模型返回错误");
    },
    onclose() { if (!completed) { handlers.onClose?.(); throw new SseError("对话连接提前中断，请刷新确认记录后再重试"); } },
    onerror(error) { handlers.onError?.(error); throw error; },
  });
}

export const agentApi = {
  getSession: (assessmentId, recordQuestionId) => http.get(`/api/assessments/${assessmentId}/questions/${recordQuestionId}/session`),
  createSession: (assessmentId, recordQuestionId) => http.post(`/api/assessments/${assessmentId}/questions/${recordQuestionId}/session`),
  sendMessage: sendAgentMessage,
  finishSession: (assessmentId, recordQuestionId) => http.post(`/api/assessments/${assessmentId}/questions/${recordQuestionId}/session/finish`, undefined, { timeout: 180000 }),
  history: (assessmentId, recordQuestionId) => http.get(`/api/assessments/${assessmentId}/questions/${recordQuestionId}/history`),
};

export const api = { auth: authApi, user: userApi, questions: questionApi, classes: classApi, assessments: assessmentApi, agent: agentApi };
