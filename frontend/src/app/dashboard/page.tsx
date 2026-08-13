"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AuthGuard from "@/components/AuthGuard";
import TopNavBar from "@/components/TopNavBar";
import Footer from "@/components/Footer";
import ConfirmModal from "@/components/ConfirmModal";
import GroupSelectModal from "@/components/GroupSelectModal";
import {
  FolderOpen,
  FileText,
  History,
  School,
  ArrowRight,
  Plus,
  Play,
  Users,
  Sparkles,
  FileSpreadsheet,
  Trash2,
} from "lucide-react";
import {
  Grade,
  Group,
  Quiz,
  Session,
  getStoredData,
  setStoredData,
  generate4DigitPin,
  normalizeGroup,
  normalizeQuiz,
} from "@/lib/store";
import {
  apiGetGrades,
  apiGetGroups,
  apiGetQuizzes,
  apiGetHistory,
  apiDeleteSession,
  apiStartPlay,
} from "@/lib/api";
import { exportQuizResultsToExcel } from "@/lib/excelExport";

export default function DashboardPage() {
  const router = useRouter();
  const [grades, setGrades] = useState<Grade[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);

  // Play modal state
  const [quizToPlay, setQuizToPlay] = useState<Quiz | null>(null);
  const [gradeForPlay, setGradeForPlay] = useState<Grade | null>(null);
  const [groupsForPlay, setGroupsForPlay] = useState<Group[]>([]);

  // Delete session modal
  const [sessionToDelete, setSessionToDelete] = useState<Session | null>(null);

  const fetchDashboardData = async () => {
    try {
      const gradesData = await apiGetGrades();
      if (Array.isArray(gradesData)) {
        setGrades(gradesData);
        setStoredData("grades", gradesData);

        const groupPromises = gradesData.map((g) => apiGetGroups(g.id).catch(() => []));
        const quizPromises = gradesData.map((g) => apiGetQuizzes(g.id).catch(() => []));

        const groupsResults = await Promise.all(groupPromises);
        const quizzesResults = await Promise.all(quizPromises);

        const allGroups = groupsResults.flat().map(normalizeGroup);
        const allQuizzes = quizzesResults.flat().map(normalizeQuiz);

        setGroups(allGroups);
        setQuizzes(allQuizzes);
        setStoredData("groups", allGroups);
        setStoredData("quizzes", allQuizzes);
      }
    } catch {
      const storedGrades = getStoredData<Grade[]>("grades", []);
      const storedGroups = getStoredData<Group[]>("groups", []).map(normalizeGroup);
      const storedQuizzes = getStoredData<Quiz[]>("quizzes", []).map(normalizeQuiz);
      setGrades(storedGrades);
      setGroups(storedGroups);
      setQuizzes(storedQuizzes);
    }

    try {
      const historyData = await apiGetHistory();
      if (Array.isArray(historyData)) {
        const mappedSessions: Session[] = historyData.map((item: any) => ({
          id: item.session.id,
          pin: item.session.pin,
          quizId: item.session.quiz_id,
          gradeId: item.session.grade_id,
          groupId: item.session.group_id,
          groupName: item.group_name,
          gradeName: item.grade_name,
          quizTitle: item.quiz_title,
          status: item.session.status,
          currentQuestionIndex: item.session.current_question_index || 0,
          timeRemaining: 30,
          participants: [],
          createdAt: item.session.created_at || "",
        }));
        setSessions(mappedSessions);
        setStoredData("sessions", mappedSessions);
      }
    } catch {
      const storedSessions = getStoredData<Session[]>("sessions", []);
      setSessions(storedSessions);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const handleOpenPlayModal = (quiz: Quiz) => {
    const foundGrade = grades.find((g) => g.id === (quiz.gradeId || quiz.grade_id)) || null;
    const filteredGroups = groups.filter(
      (grp) => (grp.gradeId || grp.grade_id) === (quiz.gradeId || quiz.grade_id)
    );

    setQuizToPlay(quiz);
    setGradeForPlay(foundGrade);
    setGroupsForPlay(filteredGroups);
  };

  const handleConfirmPlaySession = async (selectedGroup: Group | null) => {
    if (!quizToPlay) return;

    let pin = generate4DigitPin();

    try {
      const res = await apiStartPlay(quizToPlay.id, selectedGroup?.id);
      if (res && res.pin) {
        pin = res.pin;
      }
    } catch {
      // Fallback
    }

    const newSession: Session = {
      id: `sess-${Date.now()}`,
      pin,
      quizId: quizToPlay.id,
      gradeId: quizToPlay.gradeId || quizToPlay.grade_id || "",
      groupId: selectedGroup?.id,
      groupName: selectedGroup ? `Grupo ${selectedGroup.name}` : undefined,
      gradeName: gradeForPlay?.name,
      quizTitle: quizToPlay.title,
      status: "lobby",
      currentQuestionIndex: 0,
      timeRemaining: quizToPlay.timeLimitSeconds || 30,
      participants: [],
      createdAt: new Date().toISOString(),
    };

    const currentSessions = getStoredData<Session[]>("sessions", []);
    const updated = [newSession, ...currentSessions];
    setStoredData("sessions", updated);

    setQuizToPlay(null);
    router.push(`/lobby/${pin}`);
  };

  const handleExportHistorySession = (session: Session) => {
    const quiz = quizzes.find((q) => q.id === session.quizId);
    const totalQ = quiz?.questions.length || 5;

    const studentRows = session.participants.map((p) => ({
      name: p.name,
      correctCount: p.correctCount || 0,
      totalQuestions: totalQ,
      score: p.score || 0,
    }));

    exportQuizResultsToExcel(
      session.pin,
      session.quizTitle || quiz?.title || "Evaluacion_Historial",
      session.gradeName || "Educación Básica",
      studentRows
    );
  };

  const confirmDeleteSession = async () => {
    if (!sessionToDelete) return;

    await apiDeleteSession(sessionToDelete.id).catch(() => null);

    const updated = sessions.filter((s) => s.id !== sessionToDelete.id);
    setSessions(updated);
    setStoredData("sessions", updated);
    setSessionToDelete(null);
  };

  return (
    <AuthGuard>
      <div className="min-h-screen flex flex-col pt-24 pb-12 antialiased">
        <TopNavBar activeTab="dashboard" />

        <main className="max-w-[1120px] mx-auto px-4 md:px-8 w-full space-y-10 my-auto flex-1">
          {/* Header Section */}
          <header className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-[#ffd659]/30 text-[#745b00] text-xs font-bold mb-2">
                  <Sparkles className="w-3.5 h-3.5" />
                  Panel Administrativo
                </div>
                <h1 className="text-4xl md:text-5xl font-bold text-[#171818] tracking-tight">
                  Bienvenido, Docente
                </h1>
              </div>

              <div className="flex gap-3">
                <Link
                  href="/grades"
                  className="px-5 py-3 rounded-full bg-[#2c2c2c] hover:bg-[#171818] text-white text-xs font-semibold shadow-ambient flex items-center gap-2 transition-all"
                >
                  <Plus className="w-4 h-4" />
                  Gestionar Grados
                </Link>
              </div>
            </div>

            {/* Stats Row */}
            <div className="flex flex-wrap gap-3">
              <div className="bg-white/80 backdrop-blur-md px-5 py-2.5 rounded-full shadow-sm flex items-center gap-2.5 border border-[#e6e2da]/50">
                <span className="w-2.5 h-2.5 rounded-full bg-[#ffd659]"></span>
                <span className="text-xs font-semibold text-[#444748]">
                  Total Grados: <strong className="text-[#171818]">{grades.length}</strong>
                </span>
              </div>
              <div className="bg-white/80 backdrop-blur-md px-5 py-2.5 rounded-full shadow-sm flex items-center gap-2.5 border border-[#e6e2da]/50">
                <span className="w-2.5 h-2.5 rounded-full bg-[#ffd659]"></span>
                <span className="text-xs font-semibold text-[#444748]">
                  Total Grupos: <strong className="text-[#171818]">{groups.length}</strong>
                </span>
              </div>
              <div className="bg-white/80 backdrop-blur-md px-5 py-2.5 rounded-full shadow-sm flex items-center gap-2.5 border border-[#e6e2da]/50">
                <span className="w-2.5 h-2.5 rounded-full bg-[#ffd659]"></span>
                <span className="text-xs font-semibold text-[#444748]">
                  Total Evaluaciones: <strong className="text-[#171818]">{quizzes.length}</strong>
                </span>
              </div>
              <div className="bg-white/80 backdrop-blur-md px-5 py-2.5 rounded-full shadow-sm flex items-center gap-2.5 border border-[#e6e2da]/50">
                <span className="w-2.5 h-2.5 rounded-full bg-[#ffd659]"></span>
                <span className="text-xs font-semibold text-[#444748]">
                  Sesiones Realizadas: <strong className="text-[#171818]">{sessions.length}</strong>
                </span>
              </div>
            </div>
          </header>

          {/* Bento Grid Section */}
          <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Column 1: Grados */}
            <div className="bg-[#fcf8f0] rounded-[2.5rem] p-7 md:p-8 shadow-ambient border border-[#e6e2da]/40 flex flex-col justify-between">
              <div>
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-xl font-bold text-[#171818]">Grados</h2>
                  <div className="w-8 h-8 rounded-full bg-[#ffd659]/30 flex items-center justify-center text-[#745b00]">
                    <FolderOpen className="w-4 h-4" />
                  </div>
                </div>

                <div className="space-y-3">
                  {grades.length === 0 ? (
                    <div className="py-8 text-center bg-white/70 rounded-2xl p-4 border border-[#e6e2da]/40">
                      <p className="text-xs text-[#737373] mb-3">No hay grados creados aún.</p>
                      <Link
                        href="/grades"
                        className="text-xs font-bold text-[#745b00] bg-[#ffd659] px-4 py-2 rounded-full inline-block"
                      >
                        + Crear Primer Grado
                      </Link>
                    </div>
                  ) : (
                    grades.slice(0, 4).map((g) => {
                      const grpCount = groups.filter(
                        (grp) => (grp.gradeId || grp.grade_id) === g.id
                      ).length;
                      const qCount = quizzes.filter(
                        (q) => (q.gradeId || q.grade_id) === g.id
                      ).length;
                      return (
                        <Link
                          key={g.id}
                          href={`/grades/${g.id}/quizzes`}
                          className="bg-white rounded-2xl p-4 flex items-center justify-between shadow-sm hover:shadow-md transition-all group"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-[#fdf9f1] flex items-center justify-center text-[#745b00] group-hover:bg-[#ffd659] transition-colors">
                              <School className="w-5 h-5" />
                            </div>
                            <div>
                              <p className="font-semibold text-sm text-[#171818]">{g.name}</p>
                              <p className="text-xs text-[#737373]">{grpCount} grupos • {qCount} evaluaciones</p>
                            </div>
                          </div>
                          <ArrowRight className="w-4 h-4 text-[#737373] group-hover:text-[#171818] group-hover:translate-x-1 transition-all" />
                        </Link>
                      );
                    })
                  )}
                </div>
              </div>

              <Link
                href="/grades"
                className="mt-6 w-full py-3.5 rounded-full border-2 border-[#171818] text-[#171818] text-xs font-bold hover:bg-[#171818] hover:text-white transition-colors text-center block"
              >
                Ver todos los grados
              </Link>
            </div>

            {/* Column 2: Evaluaciones */}
            <div className="bg-white rounded-[2.5rem] p-7 md:p-8 shadow-ambient border border-[#e6e2da]/40 flex flex-col justify-between">
              <div>
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-xl font-bold text-[#171818]">Evaluaciones</h2>
                  <div className="w-8 h-8 rounded-full bg-[#ffd659]/30 flex items-center justify-center text-[#745b00]">
                    <FileText className="w-4 h-4" />
                  </div>
                </div>

                <div className="space-y-3">
                  {quizzes.length === 0 ? (
                    <div className="py-8 text-center bg-[#fdf9f1] rounded-2xl p-4 border border-[#e6e2da]/40">
                      <p className="text-xs text-[#737373] mb-3">No hay evaluaciones registradas.</p>
                      <Link
                        href="/grades"
                        className="text-xs font-bold text-[#171818] bg-[#ffd659] px-4 py-2 rounded-full inline-block"
                      >
                        Ir a Grados para Crear Quiz
                      </Link>
                    </div>
                  ) : (
                    quizzes.slice(0, 4).map((q) => (
                      <div
                        key={q.id}
                        className="bg-[#fdf9f1] rounded-2xl p-4 flex items-center justify-between shadow-sm hover:shadow-md transition-all border border-transparent hover:border-[#ffd659]/50"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-2 h-10 rounded-full bg-[#ffd659]"></div>
                          <div>
                            <p className="font-semibold text-sm text-[#171818] line-clamp-1">{q.title}</p>
                            <p className="text-xs text-[#737373]">
                              {q.questions.length} preguntas • {q.timeLimitSeconds}s
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() => handleOpenPlayModal(q)}
                          className="px-3.5 py-1.5 rounded-full bg-[#ffd659] hover:bg-[#eac247] text-[#171818] text-xs font-bold flex items-center gap-1 shadow-sm transition-transform active:scale-95 cursor-pointer"
                          title="Lanzar sesión en vivo seleccionando grupo"
                        >
                          <Play className="w-3.5 h-3.5 fill-current" />
                          Jugar
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <Link
                href="/grades"
                className="mt-6 w-full py-3.5 rounded-full bg-[#171818] hover:bg-[#2c2c2c] text-white text-xs font-bold transition-all shadow-md text-center block"
              >
                Gestionar Quizzes (.md)
              </Link>
            </div>

            {/* Column 3: Historial Preview */}
            <div id="historial" className="bg-[#2c2c2c] rounded-[2.5rem] p-7 md:p-8 shadow-dark-card text-white flex flex-col justify-between">
              <div>
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-xl font-bold text-white flex items-center gap-2">
                    Historial de Sesiones
                  </h2>
                  <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-[#ffd659]">
                    <History className="w-4 h-4" />
                  </div>
                </div>

                <div className="space-y-4">
                  {sessions.length === 0 ? (
                    <div className="py-8 text-center text-xs text-white/50 bg-white/5 rounded-2xl p-4">
                      <p>Aún no hay sesiones jugadas.</p>
                      <p className="mt-1 text-[11px] text-white/40">
                        Al darle clic a &quot;Jugar&quot; en una evaluación, se creará el PIN y el historial aquí.
                      </p>
                    </div>
                  ) : (
                    sessions.slice(0, 4).map((s, idx) => (
                      <div
                        key={s.id || idx}
                        className="relative pl-5 pb-3 border-l border-white/20 last:border-0"
                      >
                        <div className="absolute -left-[5px] top-1.5 w-2 h-2 rounded-full bg-[#ffd659] ring-4 ring-[#2c2c2c]"></div>
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-xs font-bold text-white">
                            PIN: {s.pin} {s.groupName && <span className="text-[#ffd659] font-normal">({s.groupName})</span>}
                          </span>
                          <button
                            onClick={() => setSessionToDelete(s)}
                            className="text-white/40 hover:text-[#f87171] p-1 rounded-full transition-colors cursor-pointer"
                            title="Eliminar sesión del historial"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <div className="bg-white/10 rounded-xl p-2.5 backdrop-blur-sm flex justify-between items-center text-xs text-white/80">
                          <span className="flex items-center gap-1.5">
                            <Users className="w-3.5 h-3.5 text-[#ffd659]" />
                            {s.participants.length} Participantes
                          </span>

                          <button
                            onClick={() => handleExportHistorySession(s)}
                            className="bg-[#16a34a] hover:bg-[#15803d] text-white text-[10px] font-bold px-2.5 py-1 rounded-full flex items-center gap-1 transition-all cursor-pointer"
                            title="Descargar Excel (.xlsx) de esta sesión"
                          >
                            <FileSpreadsheet className="w-3 h-3" />
                            XLSX
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-white/10 text-center">
                <Link
                  href="/history"
                  className="text-xs text-[#ffd659] hover:underline font-bold inline-flex items-center gap-1"
                >
                  <span>Ver historial completo</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          </section>
        </main>

        {/* Group Selection Modal before Play */}
        <GroupSelectModal
          isOpen={!!quizToPlay}
          quiz={quizToPlay}
          grade={gradeForPlay}
          groups={groupsForPlay}
          onClose={() => setQuizToPlay(null)}
          onConfirm={handleConfirmPlaySession}
        />

        {/* Delete Session Modal */}
        <ConfirmModal
          isOpen={!!sessionToDelete}
          title="Eliminar Sesión"
          message={`¿Estás seguro de eliminar el registro de la sesión ${sessionToDelete?.pin}?`}
          confirmText="Eliminar"
          isDestructive={true}
          onConfirm={confirmDeleteSession}
          onCancel={() => setSessionToDelete(null)}
        />

        <Footer />
      </div>
    </AuthGuard>
  );
}
