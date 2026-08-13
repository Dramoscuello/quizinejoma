import { ParsedQuestion } from "./mdParser";

export interface Group {
  id: string;
  name: string;
  gradeId: string;
  grade_id?: string;
  studentCount?: number;
  student_count?: number;
  createdAt?: string;
}

export interface Quiz {
  id: string;
  title: string;
  gradeId: string;
  grade_id?: string;
  timeLimitSeconds: number; // default 30
  markdownContent: string;
  questions: ParsedQuestion[];
  createdAt: string;
}

export interface Grade {
  id: string;
  name: string;
  description?: string;
  createdAt?: string;
}

export interface Participant {
  id: string;
  name: string;
  joinedAt: string;
  answers: Record<string, { optionId: string; isCorrect: boolean; timeTaken: number }>;
  score: number; // Calculated / 5.0
  correctCount: number;
}

export interface Session {
  id: string;
  pin: string;
  quizId: string;
  gradeId: string;
  groupId?: string;
  groupName?: string;
  gradeName?: string;
  quizTitle?: string;
  status: "lobby" | "question" | "review" | "finished";
  currentQuestionIndex: number;
  timeRemaining: number;
  participants: Participant[];
  createdAt: string;
}

// Generates RFC 4122 compliant UUID v4 string
export function generateUUID(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Clean initial empty state
export const initialGrades: Grade[] = [];
export const initialGroups: Group[] = [];
export const initialQuizzes: Quiz[] = [];

// Helper to normalize group
export function normalizeGroup(item: any): Group {
  const gId = item.grade_id || item.gradeId || "";
  return {
    id: item.id,
    name: item.name,
    gradeId: gId,
    grade_id: gId,
    studentCount: item.student_count ?? item.studentCount ?? 0,
    student_count: item.student_count ?? item.studentCount ?? 0,
    createdAt: item.created_at || item.createdAt || "",
  };
}

// Helper to normalize quiz from backend or local storage
export function normalizeQuiz(item: any): Quiz {
  const qData = item.quiz || item;
  const questionsRaw = item.questions || qData.questions || [];

  const mappedQuestions: ParsedQuestion[] = questionsRaw.map((q: any, qIdx: number) => ({
    id: q.id || generateUUID(),
    text: q.text || "",
    order: q.order_index ?? q.order ?? (qIdx + 1),
    options: (q.options || []).map((opt: any, oIdx: number) => ({
      id: opt.id || generateUUID(),
      label: opt.label || ["A", "B", "C", "D", "E"][oIdx] || `Opt ${oIdx + 1}`,
      text: opt.text || "",
      isCorrect: opt.is_correct ?? opt.isCorrect ?? false,
    })),
  }));

  return {
    id: qData.id,
    gradeId: qData.grade_id || qData.gradeId || "",
    grade_id: qData.grade_id || qData.gradeId || "",
    title: qData.title || "Evaluación",
    timeLimitSeconds: qData.time_limit_seconds || qData.timeLimitSeconds || 30,
    markdownContent: qData.markdown_content || qData.markdownContent || "",
    questions: mappedQuestions,
    createdAt: qData.created_at || qData.createdAt || "",
  };
}

// Helper to manage storage in browser
export function getStoredData<T>(key: string, defaultValue: T): T {
  if (typeof window === "undefined") return defaultValue;
  try {
    const item = localStorage.getItem(`quizinejoma_${key}`);
    return item ? JSON.parse(item) : defaultValue;
  } catch {
    return defaultValue;
  }
}

export function setStoredData<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(`quizinejoma_${key}`, JSON.stringify(value));
  } catch (e) {
    console.error("Storage error:", e);
  }
}

// Generate random 4-digit PIN
export function generate4DigitPin(): string {
  return Math.floor(1000 + Math.random() * 9000).toString();
}
