"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import AuthGuard from "@/components/AuthGuard";
import TopNavBar from "@/components/TopNavBar";
import Footer from "@/components/Footer";
import ConfirmModal from "@/components/ConfirmModal";
import {
  History,
  FileSpreadsheet,
  Trash2,
  Users,
  Calendar,
  Sparkles,
  ArrowRight,
  School,
  Play,
  Award,
} from "lucide-react";
import {
  Session,
  Quiz,
  Grade,
  Group,
  Participant,
  getStoredData,
  setStoredData,
} from "@/lib/store";
import { apiGetHistory, apiDeleteSession } from "@/lib/api";
import { exportQuizResultsToExcel } from "@/lib/excelExport";

export default function HistoryPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [sessionToDelete, setSessionToDelete] = useState<Session | null>(null);

  const fetchHistoryData = async () => {
    try {
      const historyData = await apiGetHistory();
      if (Array.isArray(historyData)) {
        const mappedSessions: Session[] = historyData.map((item: any) => {
          const parts: Participant[] = (item.participants || []).map((p: any) => ({
            id: p.id,
            name: p.name,
            joinedAt: p.joined_at || "",
            answers: {},
            score: p.score ?? 0,
            correctCount: p.correct_count ?? 0,
          }));

          return {
            id: item.session.id,
            pin: item.session.pin,
            quizId: item.session.quiz_id,
            gradeId: item.session.grade_id,
            groupId: item.session.group_id,
            groupName: item.group_name || undefined,
            gradeName: item.grade_name || undefined,
            quizTitle: item.quiz_title || undefined,
            status: item.session.status,
            currentQuestionIndex: item.session.current_question_index || 0,
            timeRemaining: 30,
            participants: parts,
            createdAt: item.session.created_at || "",
          };
        });

        setSessions(mappedSessions);

        // Keep local store populated with complete participant history
        const existingLocal = getStoredData<Session[]>("sessions", []);
        const merged = mappedSessions.concat(
          existingLocal.filter((localS) => !mappedSessions.some((m) => m.id === localS.id))
        );
        setStoredData("sessions", merged);
      }
    } catch {
      const stored = getStoredData<Session[]>("sessions", []);
      setSessions(stored);
    }

    const storedQuizzes = getStoredData<Quiz[]>("quizzes", []);
    const storedGrades = getStoredData<Grade[]>("grades", []);
    const storedGroups = getStoredData<Group[]>("groups", []);

    setQuizzes(storedQuizzes);
    setGrades(storedGrades);
    setGroups(storedGroups);
  };

  useEffect(() => {
    fetchHistoryData();
  }, []);

  const handleExportExcel = (s: Session) => {
    const quiz = quizzes.find((q) => q.id === s.quizId);
    const totalQ = quiz?.questions.length || 5;

    const studentRows = (s.participants || []).map((p) => ({
      name: p.name,
      correctCount: p.correctCount ?? (p as any).correct_count ?? 0,
      totalQuestions: totalQ,
      score: p.score ?? 0,
    }));

    exportQuizResultsToExcel(
      s.pin,
      s.quizTitle || quiz?.title || "Evaluacion_Historial",
      s.gradeName || "Educación Básica",
      studentRows
    );
  };

  const confirmDeleteAction = async () => {
    if (!sessionToDelete) return;

    await apiDeleteSession(sessionToDelete.id).catch(() => null);

    const updated = sessions.filter((s) => s.id !== sessionToDelete.id);
    setSessions(updated);

    const localSessions = getStoredData<Session[]>("sessions", []);
    setStoredData("sessions", localSessions.filter((s) => s.id !== sessionToDelete.id));
    setSessionToDelete(null);
  };

  return (
    <AuthGuard>
      <div className="min-h-screen flex flex-col pt-24 pb-12 antialiased">
        <TopNavBar activeTab="history" />

        <main className="max-w-[1120px] mx-auto px-4 md:px-8 w-full space-y-8 my-auto flex-1">
          {/* Header Section */}
          <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-[#ffd659]/30 text-[#745b00] text-xs font-bold mb-2">
                <Sparkles className="w-3.5 h-3.5" />
                Registro Académico
              </div>
              <h1 className="text-4xl font-bold text-[#171818] tracking-tight">
                Historial de Evaluaciones
              </h1>
              <p className="text-sm text-[#737373]">
                Consulta todas las sesiones jugadas, sus estudiantes, calificaciones y descarga reportes en Excel.
              </p>
            </div>

            <div className="flex gap-3">
              <Link
                href="/grades"
                className="px-5 py-3 rounded-full bg-[#ffd659] hover:bg-[#eac247] text-[#171818] text-xs font-bold shadow-ambient flex items-center gap-2 transition-all active:scale-95 cursor-pointer"
              >
                <Play className="w-4 h-4 fill-current" />
                Lanzar Nueva Evaluación
              </Link>
            </div>
          </header>

          {/* Sessions History List */}
          {sessions.length === 0 ? (
            <div className="bg-white rounded-[2.5rem] p-12 text-center shadow-ambient border border-[#e6e2da]/40 flex flex-col items-center">
              <div className="w-16 h-16 rounded-full bg-[#ffd659]/30 flex items-center justify-center text-[#745b00] mb-4">
                <History className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-[#171818] mb-2">
                No hay sesiones en el historial
              </h3>
              <p className="text-xs text-[#737373] max-w-sm mb-6">
                Cuando inicies una evaluación en vivo con tus estudiantes y la finalices, quedará registrada automáticamente aquí.
              </p>
              <Link
                href="/grades"
                className="px-6 py-3 rounded-full bg-[#2c2c2c] hover:bg-[#171818] text-white text-xs font-bold shadow-sm transition-all"
              >
                Ir a Grados y Evaluaciones
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {sessions.map((s) => {
                const quiz = quizzes.find((q) => q.id === s.quizId);
                const grade = grades.find((g) => g.id === s.gradeId);
                const group = groups.find((grp) => grp.id === s.groupId);

                const displayTitle = s.quizTitle || quiz?.title || "Evaluación";
                const displayGrade = s.gradeName || grade?.name || "Grado";
                const displayGroup = s.groupName || (group ? `Grupo ${group.name}` : "");
                const participantCount = s.participants ? s.participants.length : 0;

                const dateStr = s.createdAt
                  ? new Date(s.createdAt).toLocaleDateString("es-CO", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "Reciente";

                return (
                  <div
                    key={s.id || s.pin}
                    className="bg-white rounded-3xl p-6 md:p-7 shadow-xs hover:shadow-ambient border border-[#e6e2da]/60 hover:border-[#ffd659] transition-all flex flex-col md:flex-row items-start md:items-center justify-between gap-6 group"
                  >
                    <div className="space-y-3 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-bold bg-[#fdf9f1] border border-[#ffd659] text-[#745b00] px-3 py-1 rounded-full">
                          PIN: {s.pin}
                        </span>

                        <span className="text-xs font-semibold bg-[#f0f0f0] text-[#444748] px-3 py-1 rounded-full flex items-center gap-1.5">
                          <School className="w-3 h-3" />
                          {displayGrade} {displayGroup ? `• ${displayGroup}` : ""}
                        </span>

                        <span className="text-xs font-semibold bg-[#e0f2fe] text-[#0369a1] px-3 py-1 rounded-full flex items-center gap-1.5">
                          <Users className="w-3 h-3" />
                          {participantCount} Estudiantes
                        </span>
                      </div>

                      <div>
                        <h2 className="text-xl font-bold text-[#171818] tracking-tight group-hover:text-[#745b00] transition-colors">
                          {displayTitle}
                        </h2>
                        <div className="flex items-center gap-2 text-xs text-[#737373] mt-1 font-medium">
                          <Calendar className="w-3.5 h-3.5" />
                          <span>Finalizado el {dateStr}</span>
                        </div>
                      </div>

                      {/* Participant Preview badges */}
                      {s.participants && s.participants.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5 pt-1">
                          {s.participants.slice(0, 5).map((p, pIdx) => (
                            <span
                              key={p.id || pIdx}
                              className="text-[11px] font-semibold bg-[#f7f3eb] text-[#171818] px-2.5 py-0.5 rounded-full border border-[#e6e2da]"
                            >
                              {p.name}: <strong className="text-[#745b00]">{p.score ?? 0}</strong>
                            </span>
                          ))}
                          {s.participants.length > 5 && (
                            <span className="text-[11px] text-[#737373] font-semibold">
                              +{s.participants.length - 5} más
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto justify-end pt-3 md:pt-0 border-t md:border-t-0 border-[#f0f0f0]">
                      <button
                        onClick={() => handleExportExcel(s)}
                        className="px-4 py-2.5 rounded-full bg-[#16a34a] hover:bg-[#15803d] text-white text-xs font-bold shadow-xs flex items-center gap-2 transition-all cursor-pointer"
                        title="Descargar Excel (.xlsx) de esta evaluación"
                      >
                        <FileSpreadsheet className="w-4 h-4" />
                        <span>Excel</span>
                      </button>

                      <Link
                        href={`/teacher/session/${s.pin}`}
                        className="px-4 py-2.5 rounded-full bg-[#2c2c2c] hover:bg-[#171818] text-white text-xs font-bold shadow-xs flex items-center gap-1.5 transition-all cursor-pointer"
                      >
                        <Award className="w-4 h-4 text-[#ffd659]" />
                        <span>Ver Resultados</span>
                      </Link>

                      <button
                        onClick={() => setSessionToDelete(s)}
                        className="p-2.5 rounded-full bg-[#fee2e2]/60 hover:bg-[#fee2e2] text-[#dc2626] transition-all cursor-pointer"
                        title="Eliminar del historial"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </main>

        <ConfirmModal
          isOpen={!!sessionToDelete}
          title="¿Eliminar sesión del historial?"
          message={`¿Estás seguro de eliminar el registro de la sesión con PIN ${sessionToDelete?.pin}? Esta acción no se puede deshacer.`}
          confirmText="Sí, Eliminar"
          isDestructive={true}
          onConfirm={confirmDeleteAction}
          onCancel={() => setSessionToDelete(null)}
        />

        <Footer />
      </div>
    </AuthGuard>
  );
}
