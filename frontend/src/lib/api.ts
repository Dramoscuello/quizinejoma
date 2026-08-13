const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080/api";
const WS_BASE = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8080/ws";

function getAuthHeader(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const authData = localStorage.getItem("quizinejoma_auth");
    if (authData) {
      const parsed = JSON.parse(authData);
      if (parsed.token) {
        return { Authorization: `Bearer ${parsed.token}` };
      }
    }
  } catch (e) {
    console.error("Auth header error:", e);
  }
  return {};
}

// 1. Auth
export async function apiLogin(username: string, password: string) {
  const res = await fetch(`${API_BASE}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Error de autenticación" }));
    throw new Error(err.error || "Credenciales inválidas");
  }
  return res.json();
}

// 2. Grades
export async function apiGetGrades() {
  const res = await fetch(`${API_BASE}/grades`);
  if (!res.ok) throw new Error("Error obteniendo grados");
  return res.json();
}

export async function apiCreateGrade(name: string, description?: string) {
  const res = await fetch(`${API_BASE}/grades`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeader(),
    },
    body: JSON.stringify({ name, description }),
  });
  if (!res.ok) throw new Error("Error creando grado");
  return res.json();
}

export async function apiDeleteGrade(id: string) {
  const res = await fetch(`${API_BASE}/grades/${id}`, {
    method: "DELETE",
    headers: { ...getAuthHeader() },
  });
  if (!res.ok) throw new Error("Error eliminando grado");
  return res.json();
}

// 3. Groups
export async function apiGetGroups(gradeId: string) {
  const res = await fetch(`${API_BASE}/grades/${gradeId}/groups`);
  if (!res.ok) throw new Error("Error obteniendo grupos");
  return res.json();
}

export async function apiCreateGroup(gradeId: string, name: string, studentCount?: number) {
  const res = await fetch(`${API_BASE}/grades/${gradeId}/groups`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeader(),
    },
    body: JSON.stringify({ name: name.trim(), student_count: studentCount || 0 }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Error creando grupo" }));
    throw new Error(err.error || "Error creando grupo");
  }
  return res.json();
}

export async function apiDeleteGroup(id: string) {
  const res = await fetch(`${API_BASE}/groups/${id}`, {
    method: "DELETE",
    headers: { ...getAuthHeader() },
  });
  if (!res.ok) throw new Error("Error eliminando grupo");
  return res.json();
}

// 4. Quizzes & Markdown
export async function apiGetQuizzes(gradeId: string) {
  const res = await fetch(`${API_BASE}/grades/${gradeId}/quizzes`);
  if (!res.ok) throw new Error("Error obteniendo quizzes");
  return res.json();
}

export async function apiCreateQuiz(
  gradeId: string,
  title: string,
  timeLimitSeconds: number,
  markdownContent: string
) {
  const res = await fetch(`${API_BASE}/grades/${gradeId}/quizzes`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeader(),
    },
    body: JSON.stringify({
      title,
      time_limit_seconds: timeLimitSeconds,
      markdown_content: markdownContent,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Error guardando quiz" }));
    throw new Error(err.error || "Error creando evaluación");
  }
  return res.json();
}

export async function apiDeleteQuiz(id: string) {
  const res = await fetch(`${API_BASE}/quizzes/${id}`, {
    method: "DELETE",
    headers: { ...getAuthHeader() },
  });
  if (!res.ok) throw new Error("Error eliminando quiz");
  return res.json();
}

// 5. Play Sessions & PIN
export async function apiStartPlay(quizId: string, groupId?: string) {
  const res = await fetch(`${API_BASE}/quizzes/${quizId}/play`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeader(),
    },
    body: JSON.stringify({ group_id: groupId || null }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Error iniciando juego" }));
    throw new Error(err.error || "Error iniciando sesión de juego");
  }
  return res.json(); // returns { pin, session_id, quiz_title, group_id, ... }
}

export async function apiValidatePin(pin: string) {
  const res = await fetch(`${API_BASE}/sessions/join`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pin }),
  });
  if (!res.ok) throw new Error("Error validando PIN");
  return res.json(); // returns { valid: boolean, quiz_title, ... }
}

export async function apiJoinSession(pin: string, name: string) {
  const res = await fetch(`${API_BASE}/sessions/${pin}/join`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error("Error uniéndose a la sesión");
  return res.json();
}

export async function apiGetParticipants(pin: string) {
  const res = await fetch(`${API_BASE}/sessions/${pin}/participants`);
  if (!res.ok) throw new Error("Error obteniendo participantes");
  return res.json();
}

export async function apiGetSessionResults(sessionId: string) {
  const res = await fetch(`${API_BASE}/sessions/${sessionId}/results`, {
    headers: { ...getAuthHeader() },
  });
  if (!res.ok) throw new Error("Error obteniendo resultados de la sesión");
  return res.json(); // returns { session, quiz_title, grade_name, group_name, participants }
}

export async function apiGetHistory() {
  const res = await fetch(`${API_BASE}/sessions/history`, {
    headers: { ...getAuthHeader() },
  });
  if (!res.ok) throw new Error("Error obteniendo historial");
  return res.json();
}

export async function apiDeleteSession(id: string) {
  const res = await fetch(`${API_BASE}/sessions/${id}`, {
    method: "DELETE",
    headers: { ...getAuthHeader() },
  });
  if (!res.ok) throw new Error("Error eliminando sesión del historial");
  return res.json();
}

// 6. WebSocket Factory
export function connectSessionWebSocket(
  pin: string,
  options: { role?: "teacher" | "student"; name?: string }
): WebSocket {
  const params = new URLSearchParams();
  if (options.role) params.set("role", options.role);
  if (options.name) params.set("name", options.name);

  const queryStr = params.toString() ? `?${params.toString()}` : "";
  const wsUrl = `${WS_BASE}/session/${pin}${queryStr}`;

  return new WebSocket(wsUrl);
}
