import {supportsZipRoute} from './zipBackendContract';

const DEFAULT_API_BASE_URL =
  typeof window !== "undefined" ? window.location.origin : "http://localhost:8080";

export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE_URL).replace(/\/$/, "");
export const API_DEMO_FALLBACK = String(import.meta.env.VITE_API_DEMO_FALLBACK ?? "false") === "true";

const TOKEN_NAME_KEY = "huiqi-token-name";
const TOKEN_VALUE_KEY = "huiqi-token-value";

export class ApiError extends Error {
  constructor(message, { status = 0, code = null, data = null, cause = null } = {}) {
    super(String(message).replaceAll("教师任务","组织任务").replaceAll("教师端","管理端").replaceAll("班级","组织").replaceAll("老师","管理员").replaceAll("教师","管理员"));
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.data = data;
    this.cause = cause;
  }
}

export function saveAuthToken(tokenName, tokenValue) {
  if (!tokenValue) return;
  localStorage.setItem(TOKEN_NAME_KEY, tokenName || "Authorization");
  localStorage.setItem(TOKEN_VALUE_KEY, tokenValue);
}

export function clearAuthToken() {
  localStorage.removeItem(TOKEN_NAME_KEY);
  localStorage.removeItem(TOKEN_VALUE_KEY);
}

export function getAuthToken() {
  return {
    name: localStorage.getItem(TOKEN_NAME_KEY) || "Authorization",
    value: localStorage.getItem(TOKEN_VALUE_KEY) || "",
  };
}

export function buildApiUrl(path, query) {
  const url = new URL(path.startsWith("http") ? path : `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`);
  Object.entries(query || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  });
  return url.toString();
}

export function getAuthHeaders(headers = {}) {
  const token = getAuthToken();
  return token.value ? { ...headers, [token.name]: token.value } : { ...headers };
}

export async function request(path, options = {}) {
  const { method = "GET", query, body, headers = {}, timeout = 15000, signal, raw = false } = options;
  if (!supportsZipRoute(method,path)) throw new ApiError("此功能暂未接入：当前后端未提供对应接口", {status:404,code:"FRONTEND_NOT_INTEGRATED"});
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("API 请求超时")), timeout);
  const requestHeaders = getAuthHeaders({ Accept: "application/json", ...headers });
  if (body !== undefined && !(body instanceof FormData)) requestHeaders["Content-Type"] = "application/json";

  try {
    const response = await fetch(buildApiUrl(path, query), {
      method,
      headers: requestHeaders,
      body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
      credentials: "include",
      signal: signal || controller.signal,
    });
    const contentType = response.headers.get("content-type") || "";
    const payload = contentType.includes("application/json") ? await response.json() : await response.text();
    if (!response.ok) throw new ApiError(payload?.message || `HTTP ${response.status}`, { status: response.status, data: payload });
    if (raw) return payload;
    if (payload && typeof payload === "object" && Object.prototype.hasOwnProperty.call(payload, "code")) {
      if (payload.code !== 0 && payload.code !== 200) throw new ApiError(payload.message || "接口调用失败", { status: response.status, code: payload.code, data: payload.data });
      return payload.data;
    }
    return payload;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    const message = error?.name === "AbortError" ? "API 请求超时" : "无法连接后端服务";
    throw new ApiError(message, { cause: error });
  } finally {
    clearTimeout(timer);
  }
}

export const http = {
  get: (path, options) => request(path, { ...options, method: "GET" }),
  post: (path, body, options) => request(path, { ...options, method: "POST", body }),
  put: (path, body, options) => request(path, { ...options, method: "PUT", body }),
  delete: (path, options) => request(path, { ...options, method: "DELETE" }),
};
