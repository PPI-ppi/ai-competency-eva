import {parseQuestionOptions} from "../questionOptions";
import {expandTaxonomy} from "../assessmentTaxonomy";
import { ApiError, http } from "../api/client";

const asList = value => {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];
  for (const key of ["items", "content", "records", "rows", "list", "results", "data"]) {
    if (Array.isArray(value[key])) return value[key];
  }
  return [];
};
const parseList = value => {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return String(value).split(/\r?\n|,/).map(item => item.trim()).filter(Boolean);
  }
};

const unsupported = feature => Promise.reject(
  new ApiError(`${feature}需要后端新增接口，前端未使用模拟数据`),
);

const normalizeVisibility = (question, publicCatalog = false) => {
  const raw = question.visibility ?? question.scope ?? question.accessLevel;
  if (raw != null) {
    const value = String(raw).toUpperCase();
    if (["PUBLIC", "PUBLISHED"].includes(value)) return "public";
    if (["PRIVATE", "DRAFT"].includes(value)) return "private";
  }
  if (question.isPublic === true || question.published === true) return "public";
  if (question.isPublic === false || question.published === false) return "private";
  return publicCatalog ? "public" : "unknown";
};

const normalizeStatus = question => {
  const value = String(question.status || "ACTIVE").toUpperCase();
  return ["OFFLINE", "DELETED", "DISABLED"].includes(value) ? "offline" : "active";
};

export const normalizeQuestion = (question, options = {}) => {
  const publicCatalog = options.publicCatalog === true;
  const explicitlyOwned = question.isOwner === true || question.ownedByCurrentUser === true || question.canEdit === true;
  const rawOwnership = String(question.ownership || "").toUpperCase();
  const ownedByCurrentUser = explicitlyOwned || ["OWN", "MINE", "TEACHER_OWNED"].includes(rawOwnership);
  const ownership = rawOwnership || (publicCatalog && !ownedByCurrentUser ? "PUBLIC_SOURCE" : "OWN");
  return {
    ...question,
    tags: parseList(question.tags),
    assessmentPoints: parseList(question.assessmentPoints),
    options: parseQuestionOptions(question.options),
    answer: question.answer ?? question.correctAnswer ?? "",
    visibility: normalizeVisibility(question, publicCatalog),
    status: normalizeStatus(question),
    ownership,
    canManageStatus: question.canManageStatus ?? (publicCatalog ? ownedByCurrentUser : true),
  };
};

const questionPayload = body => ({
  type: body.type,
  title: String(body.title || "").trim(),
  content: String(body.content || "").trim(),
  options: Array.isArray(body.options) ? body.options.filter(Boolean).join("\n") : (body.options || null),
  answer: body.answer || null,
  rubric: body.rubric || null,
  difficulty: Number(body.difficulty),
  tags: body.tags || [],
  assessmentPoints: body.assessmentPoints || [],
});

export const teacherData = {
  taxonomy: async () => expandTaxonomy(asList(await http.get("/api/questions/taxonomy")).map(group => ({
    ...group,
    dimension: group.dimension || group.name || group.code,
    points: asList(group.points),
  }))),
  myQuestions: async () => asList(await http.get("/api/questions")).map(question => ({
    ...normalizeQuestion(question), ownership: "OWN", canManageStatus: true,
  })),
  privateQuestions: async () => asList(await http.get("/api/questions")).filter(question => !question.questionKind || String(question.questionKind).toLowerCase()==="test").map(question => ({
    ...normalizeQuestion(question), ownership: "OWN", canManageStatus: true,
  })),
  publicQuestions: async () => asList(await http.get("/api/questions/public")).map(question => ({
    ...normalizeQuestion(question, { publicCatalog: true }),
  })),
  async createQuestion(body) {
    const created = await http.post("/api/questions", questionPayload(body));
    if (body.visibility === "public" && created?.id) await http.post(`/api/questions/${created.id}/publish`);
    return created;
  },
  updateQuestion: (id, body) => http.put(`/api/questions/${id}`, questionPayload(body)),
  forkQuestion: body => http.post("/api/questions", questionPayload({ ...body, visibility: "private" })),
  publishQuestion: id => http.post(`/api/questions/${id}/publish`),
  makePrivate: id => http.post(`/api/questions/${id}/unpublish`),
  offlineQuestion: id => http.post(`/api/questions/${id}/offline`),
  async copyPublicQuestion(id) {
    const copied = await http.post(`/api/questions/public/${id}/copy`, { visibility: "PUBLIC" });
    const copiedId = copied?.id || copied?.questionId;
    if (!copiedId) throw new ApiError("复制成功后后端未返回新题目 ID，无法将副本设为公开");
    // The ZIP backend creates a private copy; do not publish it implicitly.
    return copied;
  },
  classes: async () => {
    const rows=asList(await http.get("/api/classes/managed"));
    return Promise.all(rows.map(async row=>{
      const detail=await http.get(`/api/classes/${row.id}`);
      return {...row,...detail.classroom,inviteCode:detail.inviteCode,pointWeights:detail.pointWeights};
    }));
  },
  creationOptions: async () => { const data=await http.get("/api/classes/weight-support"); return {...data,assessmentPointWeights:Boolean(data?.supported&&data?.field==="pointWeights")}; },
  async createClass(body) {
    // Check before creation: older servers silently discard unknown request fields.
    const options=await teacherData.creationOptions().catch(error=>{
      if([400,404,405].includes(error.status))throw new ApiError("当前服务尚未支持组织考察点权重，请更新服务后再创建组织");
      throw error;
    });
    if(options?.assessmentPointWeights!==true)throw new ApiError("当前服务尚未支持组织考察点权重，请更新服务后再创建组织");
    return http.post("/api/classes", body);
  },
  members: async id => asList(await http.get(`/api/classes/${id}/members`)),
  refreshInvite: id => http.post(`/api/classes/${id}/invite-code`),
  removeMember: (classId, studentId) => http.delete(`/api/classes/${classId}/members/${studentId}`),
  classQuestions: async id => asList(await http.get(`/api/classes/${id}/question-banks/TEST/questions`)).map(question => normalizeQuestion(question)),
  addClassQuestion: (classId, questionId) => http.post(`/api/classes/${classId}/questions/${questionId}`, undefined, {timeout:180000}),
  removeClassQuestion: (classId, questionId) => http.delete(`/api/classes/${classId}/questions/${questionId}`),
  generateTrainingQuestion: (classId, questionId) => http.post(`/api/classes/${classId}/questions/${questionId}/generate-training`, undefined, {timeout:180000}),
  classifiedClassQuestions: async (classId, bankType) => asList(await http.get(`/api/classes/${classId}/question-banks/${bankType}/questions`)).map(question => normalizeQuestion(question)),
  addClassifiedQuestion: (classId, bankType, questionId) => http.post(`/api/classes/${classId}/question-banks/${bankType}/questions/${questionId}`),
  removeClassifiedQuestion: (classId, bankType, questionId) => http.delete(`/api/classes/${classId}/question-banks/${bankType}/questions/${questionId}`),
  classTasks: id => http.get(`/api/classes/${id}/assessment-tasks`),
  createTask: (classId, body) => http.post(`/api/classes/${classId}/assessment-tasks`, {questionCount:body.questionCount,requestKey:body.requestKey,title:body.title,description:body.description,deadlineAt:body.deadlineAt||null,dimensions:body.dimensions,assessmentPoints:body.assessmentPoints}),
  taskStatistics: () => http.get("/api/teacher/assessment-tasks/statistics"),
  taskResults: id => http.get(`/api/teacher/assessment-tasks/${id}/results`),
  endTask: id => http.post(`/api/assessment-tasks/${id}/end`),
  deleteTask: id => http.delete(`/api/assessment-tasks/${id}`),
  taskDetail: assessmentId => http.get(`/api/teacher/assessments/${assessmentId}`),
  studentReports: (studentId,classId) => http.get(`/api/teacher/students/${studentId}/reports?classId=${encodeURIComponent(classId)}`),
  studentProfile: (classId,studentId) => http.get(`/api/teacher/classes/${classId}/students/${studentId}/profile`),
  createRemedialTask: (studentId, body) => http.post(`/api/teacher/students/${studentId}/remedial-tasks`, body),
  createPreview: mode => http.post("/api/teacher/previews", { mode }),
  previewAnswer: (previewId, body) => http.post(`/api/teacher/previews/${previewId}/answers`, body),
  previewMessage: (previewId, body) => http.post(`/api/teacher/previews/${previewId}/messages`, body),
  previewSelectQuestion: (previewId, questionId) => http.post(`/api/teacher/previews/${previewId}/questions/${questionId}/select`),
  previewFinalAnswer: (previewId, questionId, answer) => http.put(`/api/teacher/previews/${previewId}/questions/${questionId}/final-answer`, { answer }),
  previewFollowUp: (previewId, questionId) => http.post(`/api/teacher/previews/${previewId}/questions/${questionId}/follow-up`),
  previewReport: previewId => http.post(`/api/teacher/previews/${previewId}/report`),
  discardPreview: previewId => http.delete(`/api/teacher/previews/${previewId}`),
};

const normalizeAssessment = row => {
  const sourceType=String((row.trainingConfig?"TRAINING":null)||row.reportType||row.type||row.category||row.mode||row.assessmentType||"").toUpperCase();
  const type=row.taskId||row.remedialTaskId||sourceType.includes("TASK")||sourceType.includes("任务")?"任务报告":sourceType.includes("TRAIN")||sourceType.includes("训练")?"训练报告":"测评报告";
  return {
    ...row,
    id: row.id || row.reportId || row.assessmentId,
    name: row.name || row.title || row.taskTitle || (type==="任务报告"?"组织任务报告":type==="训练报告"?"训练报告":"自主能力测评"),
    type,
    score: row.score ?? row.averageScore ?? row.totalScore ?? null,
    scope: [row.scope,...parseList(row.dimensions),...parseList(row.assessmentPoints)].filter(Boolean).join("、"),
    completedAt: row.completedAt || row.updatedAt || row.createdAt,
  };
};

export const studentData = {
  joinedClasses: async () => asList(await http.get("/api/classes/joined")),
  ability: classId => http.get(`/api/classes/${classId}/my-ability`),
  assessments: async () => asList(await http.get("/api/assessments")).map(normalizeAssessment),
  reports: async () => {
    try { return asList(await http.get("/api/reports")).map(normalizeAssessment); }
    catch (error) {
      if (error.status !== 404) throw error;
      return asList(await http.get("/api/assessments")).map(normalizeAssessment);
    }
  },
  availableTasks: async () => asList(await http.get("/api/assessment-tasks/available")),
  joinByInvite: inviteCode => http.post("/api/classes/join", { inviteCode }),
  createPersonalOrganization: body => http.post("/api/classes/personal", body),
  trainingAdvice: classId => http.get(`/api/training/advice?classId=${encodeURIComponent(classId)}`),
  trainingPreview: body => http.post("/api/training/preview", body),
  startTraining: body => http.post("/api/training/start", body),
};

export const missingBackend = unsupported;
