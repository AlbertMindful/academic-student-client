import type {
  DashboardData,
  Exam,
  Grade,
  Semester,
  StudentProfile,
  CourseSchedule,
  AcademicSyncPayload,
} from "@/lib/types";

export interface ApiErrorBody {
  code: string;
  message: string;
}

export class ApiError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
  } catch {
    throw new ApiError(
      "NETWORK_ERROR",
      "网络连接失败，请检查网络后重试。",
      0,
    );
  }

  if (res.status === 204) return undefined as T;

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  if (!res.ok) {
    const err = (body as { error?: ApiErrorBody })?.error;
    throw new ApiError(
      err?.code ?? "UNKNOWN_ERROR",
      err?.message ?? "请求失败，请稍后重试。",
      res.status,
    );
  }

  return body as T;
}

export const api = {
  login(username: string, password: string): Promise<{ ok: boolean }> {
    return request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
  },
  smsSend(
    username: string,
    captchaWidth: number,
    previousPendingId?: string,
  ): Promise<{ ok: boolean; pendingId: string; cooldown: number }> {
    return request("/api/auth/sms/send", {
      method: "POST",
      body: JSON.stringify({ username, captchaWidth, previousPendingId }),
    });
  },
  smsVerify(
    pendingId: string,
    code: string,
  ): Promise<{ ok: boolean }> {
    return request("/api/auth/sms/verify", {
      method: "POST",
      body: JSON.stringify({ pendingId, code }),
    });
  },
  logout(): Promise<{ ok: boolean }> {
    return request("/api/auth/logout", { method: "POST" });
  },
  getSession(): Promise<{
    authenticated: boolean;
    profile?: StudentProfile;
    dataSource: string;
  }> {
    return request("/api/auth/session");
  },
  getDashboard(): Promise<DashboardData> {
    return request("/api/academic/dashboard");
  },
  getSemesters(): Promise<Semester[]> {
    return request("/api/academic/semesters");
  },
  getSchedule(semesterId?: string): Promise<CourseSchedule[]> {
    const q = semesterId ? `?semesterId=${encodeURIComponent(semesterId)}` : "";
    return request(`/api/academic/schedule${q}`);
  },
  getGrades(semesterId?: string): Promise<Grade[]> {
    const q = semesterId ? `?semesterId=${encodeURIComponent(semesterId)}` : "";
    return request(`/api/academic/grades${q}`);
  },
  getExams(semesterId?: string): Promise<Exam[]> {
    const q = semesterId ? `?semesterId=${encodeURIComponent(semesterId)}` : "";
    return request(`/api/academic/exams${q}`);
  },
  syncAcademicCenter(officialCourseNames: string[] = [], knownAcademicCourseNames: string[] = []): Promise<AcademicSyncPayload> {
    return request("/api/academic/sync", {
      method: "POST",
      body: JSON.stringify({ officialCourseNames, knownAcademicCourseNames }),
    });
  },
  startChaoxingConnection(): Promise<{ pendingId: string }> {
    return request("/api/chaoxing/connect/start", { method: "POST" });
  },
  pollChaoxingConnection(pendingId: string): Promise<{ status: "waiting" | "scanned" | "connected" | "expired" | "error" }> {
    return request("/api/chaoxing/connect/poll", { method: "POST", body: JSON.stringify({ pendingId }) });
  },
  getChaoxingSession(): Promise<{ connected: boolean }> {
    return request("/api/chaoxing/session");
  },
  disconnectChaoxing(): Promise<{ connected: boolean }> {
    return request("/api/chaoxing/session", { method: "DELETE" });
  },
};
