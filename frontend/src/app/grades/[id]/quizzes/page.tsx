"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AuthGuard from "@/components/AuthGuard";
import TopNavBar from "@/components/TopNavBar";
import Footer from "@/components/Footer";
import ConfirmModal from "@/components/ConfirmModal";
import GroupSelectModal from "@/components/GroupSelectModal";
import {
  ChevronRight,
  Plus,
  Play,
  Edit2,
  Trash2,
  Clock,
  CheckCircle2,
  AlertTriangle,
  FileCode2,
  X,
  Sparkles,
  Eye,
  Check,
  AlertCircle,
} from "lucide-react";
import {
  Grade,
  Group,
  Quiz,
  Session,
  getStoredData,
  setStoredData,
  generate4DigitPin,
  normalizeQuiz,
  normalizeGroup,
  generateUUID,
} from "@/lib/store";
import { parseMarkdownQuiz, sampleMarkdownQuiz } from "@/lib/mdParser";
import {
  apiGetGrades,
  apiGetGroups,
  apiGetQuizzes,
  apiCreateQuiz,
  apiDeleteQuiz,
  apiStartPlay,
} from "@/lib/api";

export default function GradeQuizzesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const router = useRouter();
  const gradeId = resolvedParams.id;

  const [grade, setGrade] = useState<Grade | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingQuiz, setEditingQuiz] = useState<Quiz | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Play modal state
  const [quizToPlay, setQuizToPlay] = useState<Quiz | null>(null);

  // Form State
  const [quizTitle, setQuizTitle] = useState("");
  const [timeLimit, setTimeLimit] = useState(30);
  const [mdContent, setMdContent] = useState("");
  const [parsedPreview, setParsedPreview] = useState(parseMarkdownQuiz(""));

  // Delete modal state
  const [quizToDelete, setQuizToDelete] = useState<{ id: string; title: string } | null>(null);

  const fetchQuizzesData = async () => {
    try {
      const gradesList = await apiGetGrades();
      const found = gradesList.find((g: Grade) => g.id === gradeId);
      if (found) setGrade(found);

      const groupsData = await apiGetGroups(gradeId);
      if (Array.isArray(groupsData)) {
        setGroups(groupsData.map(normalizeGroup));
      }

      const quizzesData = await apiGetQuizzes(gradeId);
      if (Array.isArray(quizzesData)) {
        const normalized = quizzesData.map(normalizeQuiz);
        setQuizzes(normalized);

        // Keep local store in sync with all quizzes
        const allStored = getStoredData<Quiz[]>("quizzes", []);
        const otherQuizzes = allStored.filter((q) => (q.gradeId || q.grade_id) !== gradeId);
        setStoredData("quizzes", [...otherQuizzes, ...normalized]);
        return;
      }
    } catch (err: any) {
      console.warn("Backend fetch failed, using local storage:", err);
      const storedGrades = getStoredData<Grade[]>("grades", []);
      const found = storedGrades.find((g) => g.id === gradeId);
      if (found) setGrade(found);

      const storedGroups = getStoredData<Group[]>("groups", []);
      setGroups(
        storedGroups
          .filter((g) => (g.gradeId || g.grade_id) === gradeId)
          .map(normalizeGroup)
      );

      const storedQuizzes = getStoredData<Quiz[]>("quizzes", []);
      setQuizzes(
        storedQuizzes
          .filter((q) => (q.gradeId || q.grade_id) === gradeId)
          .map(normalizeQuiz)
      );
    }
  };

  useEffect(() => {
    fetchQuizzesData();
  }, [gradeId]);

  const handleMdChange = (text: string) => {
    setMdContent(text);
    const result = parseMarkdownQuiz(text);
    setParsedPreview(result);
  };

  const handleOpenCreateModal = (quizToEdit?: Quiz) => {
    setSubmitError(null);
    if (quizToEdit) {
      setEditingQuiz(quizToEdit);
      setQuizTitle(quizToEdit.title);
      setTimeLimit(quizToEdit.timeLimitSeconds || 30);
      setMdContent(quizToEdit.markdownContent);
      setParsedPreview(parseMarkdownQuiz(quizToEdit.markdownContent));
    } else {
      setEditingQuiz(null);
      setQuizTitle("");
      setTimeLimit(30);
      setMdContent("");
      setParsedPreview(parseMarkdownQuiz(""));
    }
    setIsCreateModalOpen(true);
  };

  const handleSaveQuiz = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quizTitle.trim() || parsedPreview.questions.length === 0) return;

    setSaving(true);
    setSubmitError(null);

    let savedQuiz: Quiz = {
      id: generateUUID(),
      gradeId: gradeId,
      grade_id: gradeId,
      title: quizTitle.trim(),
      timeLimitSeconds: Number(timeLimit) || 30,
      markdownContent: mdContent,
      questions: parsedPreview.questions,
      createdAt: new Date().toISOString().split("T")[0],
    };

    try {
      const res = await apiCreateQuiz(
        gradeId,
        quizTitle.trim(),
        Number(timeLimit) || 30,
        mdContent
      );
      if (res) {
        savedQuiz = normalizeQuiz(res);
      }
    } catch (err: any) {
      console.warn("Backend quiz save error, saved locally:", err);
      // If error message is available
      if (err.message && !err.message.includes("Failed to fetch")) {
        setSubmitError(err.message);
        setSaving(false);
        return;
      }
    }

    const allQuizzes = getStoredData<Quiz[]>("quizzes", []);
    const updated = editingQuiz
      ? allQuizzes.map((q) => (q.id === editingQuiz.id ? savedQuiz : q))
      : [savedQuiz, ...allQuizzes.filter((q) => q.id !== savedQuiz.id)];

    setStoredData("quizzes", updated);
    setQuizzes(
      updated
        .filter((q) => (q.gradeId || q.grade_id) === gradeId)
        .map(normalizeQuiz)
    );
    setSaving(false);
    setIsCreateModalOpen(false);
  };

  const confirmDeleteQuiz = async () => {
    if (!quizToDelete) return;

    await apiDeleteQuiz(quizToDelete.id).catch(() => null);

    const allQuizzes = getStoredData<Quiz[]>("quizzes", []);
    const updated = allQuizzes.filter((q) => q.id !== quizToDelete.id);
    setStoredData("quizzes", updated);
    setQuizzes(
      updated
        .filter((q) => (q.gradeId || q.grade_id) === gradeId)
        .map(normalizeQuiz)
    );
    setQuizToDelete(null);
  };

  // Launch Play with Selected Group
  const handleConfirmPlaySession = async (selectedGroup: Group | null) => {
    if (!quizToPlay) return;

    let pin = generate4DigitPin();

    try {
      const res = await apiStartPlay(quizToPlay.id, selectedGroup?.id);
      if (res && res.pin) {
        pin = res.pin;
      }
    } catch (err) {
      console.warn("Play start fallback to local:", err);
    }

    const newSession: Session = {
      id: generateUUID(),
      pin,
      quizId: quizToPlay.id,
      gradeId: gradeId,
      groupId: selectedGroup?.id,
      groupName: selectedGroup ? `Grupo ${selectedGroup.name}` : undefined,
      gradeName: grade?.name,
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

  return (
    <AuthGuard>
      <div className="min-h-screen flex flex-col pt-24 pb-12 antialiased">
        <TopNavBar activeTab="grades" />

        <main className="max-w-[1120px] mx-auto px-4 md:px-8 w-full space-y-10 my-auto flex-1">
          {/* Header Section with Breadcrumb */}
          <section className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
            <div className="flex flex-col gap-2">
              <nav className="flex items-center gap-2 text-[#737373] text-xs font-medium">
                <Link href="/grades" className="hover:text-[#171818] transition-colors">
                  Grados
                </Link>
                <ChevronRight className="w-3.5 h-3.5" />
                <span className="text-[#171818] font-bold">{grade?.name || "Grado"}</span>
                <ChevronRight className="w-3.5 h-3.5" />
                <span className="text-[#745b00] font-semibold bg-[#ffd659]/30 px-2.5 py-0.5 rounded-full">
                  Evaluaciones
                </span>
              </nav>

              <h1 className="text-3xl md:text-4xl font-bold text-[#171818] tracking-tight">
                Evaluaciones de {grade?.name || "este Grado"}
              </h1>
              <p className="text-xs text-[#737373]">
                Crea cuestionarios pegando Markdown (.md) y lánzalos seleccionando el grupo al que deseas evaluar.
              </p>
            </div>

            <button
              onClick={() => handleOpenCreateModal()}
              className="bg-[#2c2c2c] hover:bg-[#171818] text-white text-xs font-bold px-6 py-3.5 rounded-full shadow-ambient hover:shadow-lg transition-all flex items-center gap-2 active:scale-95 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Nueva Evaluación (.md)
            </button>
          </section>

          {/* Quizzes Grid */}
          {quizzes.length === 0 ? (
            <div className="bg-white rounded-[2.5rem] p-12 text-center shadow-ambient border border-[#e6e2da]/40 flex flex-col items-center">
              <div className="w-16 h-16 rounded-full bg-[#ffd659]/30 flex items-center justify-center text-[#745b00] mb-4">
                <FileCode2 className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-[#171818] mb-2">
                No hay evaluaciones creadas en este grado
              </h3>
              <p className="text-xs text-[#737373] max-w-md mx-auto mb-6">
                Pega tu texto en Markdown con formato <code>## Pregunta</code> y opciones <code>- [ ]</code> marcando <code>- [x]</code> o <code>-[ x ]</code> la correcta.
              </p>
              <button
                onClick={() => handleOpenCreateModal()}
                className="bg-[#ffd659] text-[#171818] font-bold text-xs px-6 py-3.5 rounded-full hover:bg-[#eac247] shadow-sm transition-all cursor-pointer"
              >
                + Crear Primera Evaluación (.md)
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {quizzes.map((quiz) => (
                <article
                  key={quiz.id}
                  className="bg-white rounded-[2rem] p-7 shadow-ambient border border-[#e6e2da]/40 flex flex-col justify-between hover:shadow-md transition-all gap-5"
                >
                  <div className="flex flex-col gap-3 items-start">
                    <span className="bg-[#ffd659] text-[#745b00] px-3 py-1 rounded-full text-xs font-bold shadow-xs">
                      {quiz.questions.length} Preguntas
                    </span>

                    <h2 className="text-lg font-bold text-[#171818] leading-snug line-clamp-2">
                      {quiz.title}
                    </h2>

                    <div className="flex items-center gap-1.5 text-[#737373] text-xs font-medium">
                      <Clock className="w-3.5 h-3.5 text-[#745b00]" />
                      <span>{quiz.timeLimitSeconds || 30}s por pregunta</span>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-[#e6e2da]/40 flex items-center gap-2">
                    <button
                      onClick={() => setQuizToPlay(quiz)}
                      className="flex-1 bg-[#ffd659] hover:bg-[#eac247] text-[#171818] text-xs font-bold py-3 rounded-full shadow-sm hover:shadow-md transition-all flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer"
                      title="Seleccionar grupo y jugar evaluación"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>Jugar</span>
                    </button>

                    <button
                      onClick={() => handleOpenCreateModal(quiz)}
                      className="w-10 h-10 flex items-center justify-center rounded-full text-[#737373] hover:bg-[#f0f0f0] hover:text-[#171818] transition-colors cursor-pointer"
                      title="Editar evaluación"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>

                    <button
                      onClick={() => setQuizToDelete({ id: quiz.id, title: quiz.title })}
                      className="w-10 h-10 flex items-center justify-center rounded-full text-[#737373] hover:bg-[#ffdad6]/50 hover:text-[#ba1a1a] transition-colors cursor-pointer"
                      title="Eliminar"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </main>

        {/* Modal: Smart Markdown Quiz Creator / Editor */}
        {isCreateModalOpen && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in overflow-y-auto">
            <div className="bg-white rounded-[2.5rem] p-6 md:p-8 max-w-4xl w-full shadow-ambient border border-[#e6e2da] max-h-[90vh] flex flex-col my-auto">
              <div className="flex justify-between items-center pb-4 border-b border-[#e6e2da]">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-2xl bg-[#ffd659] flex items-center justify-center text-[#171818] font-bold">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-[#171818]">
                      {editingQuiz ? "Editar Evaluación" : "Lector Inteligente de Evaluaciones (.md)"}
                    </h3>
                    <p className="text-xs text-[#737373]">
                      Pega tu archivo Markdown. Se interpretan preguntas automáticas y respuestas correctas (soporta -[ x ]).
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setIsCreateModalOpen(false)}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-[#737373] hover:bg-[#f0f0f0] cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {submitError && (
                <div className="my-3 p-3 bg-[#ffdad6] text-[#ba1a1a] rounded-2xl text-xs font-semibold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{submitError}</span>
                </div>
              )}

              <form onSubmit={handleSaveQuiz} className="flex-1 overflow-y-auto py-4 space-y-4 pr-1">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="md:col-span-2">
                    <label className="block text-xs font-bold text-[#171818] mb-1">
                      Título del Examen / Evaluación
                    </label>
                    <input
                      type="text"
                      value={quizTitle}
                      onChange={(e) => setQuizTitle(e.target.value)}
                      placeholder="Ej: Examen de Ciencias Naturales - Primer Periodo"
                      required
                      className="w-full px-5 py-3 rounded-full bg-[#f0f0f0] border-2 border-transparent focus:border-[#ffd659] focus:bg-white text-sm outline-none font-medium"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#171818] mb-1">
                      Tiempo por Pregunta (Segundos)
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        value={timeLimit}
                        onChange={(e) => setTimeLimit(Number(e.target.value))}
                        min={5}
                        max={180}
                        required
                        className="w-full px-5 py-3 rounded-full bg-[#f0f0f0] border-2 border-transparent focus:border-[#ffd659] focus:bg-white text-sm outline-none font-bold text-[#171818]"
                      />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-[#737373] font-semibold">
                        segundos
                      </span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                  <div className="flex flex-col">
                    <div className="flex justify-between items-center mb-1.5">
                      <label className="text-xs font-bold text-[#171818] flex items-center gap-1.5">
                        <FileCode2 className="w-4 h-4 text-[#745b00]" />
                        Contenido Markdown (.md)
                      </label>
                      <button
                        type="button"
                        onClick={() => handleMdChange(sampleMarkdownQuiz)}
                        className="text-[11px] text-[#745b00] hover:underline font-semibold cursor-pointer"
                      >
                        Cargar plantilla de ejemplo
                      </button>
                    </div>
                    <textarea
                      rows={12}
                      value={mdContent}
                      onChange={(e) => handleMdChange(e.target.value)}
                      placeholder={`## Pregunta 1\n-[ ] Opción A\n-[ x ] Opción B (correcta)\n-[ ] Opción C\n-[ ] Opción D`}
                      className="w-full p-4 font-mono text-xs rounded-2xl bg-[#f8f9fb] border border-[#e6e2da] focus:border-[#ffd659] focus:bg-white outline-none resize-none"
                    />
                    <span className="text-[11px] text-[#737373] mt-1">
                      Formato: <code>## Pregunta</code> y <code>- [ ] Opción</code> (marca <code>-[ x ]</code> la correcta)
                    </span>
                  </div>

                  <div className="flex flex-col">
                    <div className="flex justify-between items-center mb-1.5">
                      <label className="text-xs font-bold text-[#171818] flex items-center gap-1.5">
                        <Eye className="w-4 h-4 text-[#745b00]" />
                        Vista Previa Interpretada ({parsedPreview.questions.length} preguntas)
                      </label>
                      {parsedPreview.success ? (
                        <span className="text-[11px] text-[#22c55e] font-bold flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Formato válido
                        </span>
                      ) : (
                        <span className="text-[11px] text-[#ba1a1a] font-bold flex items-center gap-1">
                          <AlertTriangle className="w-3.5 h-3.5" /> Errores detectados
                        </span>
                      )}
                    </div>

                    <div className="w-full h-[285px] overflow-y-auto p-4 rounded-2xl bg-[#fcf8f0] border border-[#e6e2da] space-y-3 custom-scrollbar text-xs">
                      {parsedPreview.errors.length > 0 && (
                        <div className="p-3 bg-[#ffdad6] rounded-xl text-[#ba1a1a] space-y-1">
                          {parsedPreview.errors.map((err, i) => (
                            <p key={i} className="font-semibold">• {err}</p>
                          ))}
                        </div>
                      )}

                      {parsedPreview.questions.map((q, qIndex) => (
                        <div key={q.id || qIndex} className="bg-white p-3.5 rounded-xl shadow-xs border border-[#e6e2da]/50">
                          <p className="font-bold text-[#171818] mb-2">
                            {qIndex + 1}. {q.text}
                          </p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                            {q.options.map((opt) => (
                              <div
                                key={opt.id}
                                className={`p-2 rounded-lg text-[11px] flex items-center justify-between ${
                                  opt.isCorrect
                                    ? "bg-[#dcfce7] text-[#166534] font-bold border border-[#86efac]"
                                    : "bg-[#f5f5f5] text-[#444748]"
                                }`}
                              >
                                <span>
                                  <strong>{opt.label})</strong> {opt.text}
                                </span>
                                {opt.isCorrect && (
                                  <Check className="w-3.5 h-3.5 text-[#166534] shrink-0" />
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-[#e6e2da]">
                  <button
                    type="button"
                    onClick={() => setIsCreateModalOpen(false)}
                    className="px-6 py-3 rounded-full border border-[#e6e2da] text-xs font-semibold text-[#737373] hover:bg-[#f0f0f0] cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={parsedPreview.questions.length === 0 || saving}
                    className="px-8 py-3 rounded-full bg-[#ffd659] hover:bg-[#eac247] text-[#171818] text-xs font-bold shadow-ambient disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    {saving ? "Guardando..." : editingQuiz ? "Guardar Cambios" : "Guardar Evaluación"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Group Selection Modal before Play */}
        <GroupSelectModal
          isOpen={!!quizToPlay}
          quiz={quizToPlay}
          grade={grade}
          groups={groups}
          onClose={() => setQuizToPlay(null)}
          onConfirm={handleConfirmPlaySession}
        />

        {/* Custom Confirmation Modal */}
        <ConfirmModal
          isOpen={!!quizToDelete}
          title="Eliminar Evaluación"
          message={`¿Estás seguro de que deseas eliminar la evaluación "${quizToDelete?.title}"?`}
          confirmText="Eliminar"
          isDestructive={true}
          onConfirm={confirmDeleteQuiz}
          onCancel={() => setQuizToDelete(null)}
        />

        <Footer />
      </div>
    </AuthGuard>
  );
}
