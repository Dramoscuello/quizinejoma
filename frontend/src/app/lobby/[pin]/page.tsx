"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AuthGuard from "@/components/AuthGuard";
import ConfirmModal from "@/components/ConfirmModal";
import {
  Users,
  Play,
  Copy,
  Check,
  XCircle,
} from "lucide-react";
import {
  Session,
  Quiz,
  Grade,
  Group,
  Participant,
  getStoredData,
  setStoredData,
  normalizeQuiz,
} from "@/lib/store";
import {
  apiGetQuizzes,
  apiDeleteSession,
  apiGetParticipants,
  connectSessionWebSocket,
} from "@/lib/api";

export default function TeacherLobbyPage({
  params,
}: {
  params: Promise<{ pin: string }>;
}) {
  const resolvedParams = use(params);
  const router = useRouter();
  const pin = resolvedParams.pin;

  const [session, setSession] = useState<Session | null>(null);
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [grade, setGrade] = useState<Grade | null>(null);
  const [group, setGroup] = useState<Group | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [copied, setCopied] = useState(false);
  const [isListExpanded, setIsListExpanded] = useState(true);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);

  // 1. Initial Load and Session info
  useEffect(() => {
    const allSessions = getStoredData<Session[]>("sessions", []);
    const current = allSessions.find((s) => s.pin === pin);

    if (current) {
      setSession(current);
      setParticipants(current.participants || []);

      const allQuizzes = getStoredData<Quiz[]>("quizzes", []);
      const foundQuiz = allQuizzes.find((q) => q.id === current.quizId);
      if (foundQuiz) {
        setQuiz(normalizeQuiz(foundQuiz));
      } else if (current.gradeId) {
        apiGetQuizzes(current.gradeId)
          .then((list) => {
            const qz = list.find((item: any) => (item.quiz ? item.quiz.id : item.id) === current.quizId);
            if (qz) setQuiz(normalizeQuiz(qz));
          })
          .catch(() => null);
      }

      const allGrades = getStoredData<Grade[]>("grades", []);
      const foundGrade = allGrades.find((g) => g.id === current.gradeId);
      if (foundGrade) setGrade(foundGrade);

      const allGroups = getStoredData<Group[]>("groups", []);
      const foundGroup = allGroups.find((grp) => grp.id === current.groupId);
      if (foundGroup) setGroup(foundGroup);
    }
  }, [pin]);

  // 2. Real-time WebSocket connection to receive connected students instantly
  useEffect(() => {
    if (!pin) return;

    let ws: WebSocket | null = null;
    try {
      ws = connectSessionWebSocket(pin, { role: "teacher" });

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "LobbyUpdate" && msg.payload?.participants) {
            const wsParts = msg.payload.participants.map((p: any) => ({
              id: p.id,
              name: p.name,
              joinedAt: new Date().toISOString(),
              answers: {},
              score: 0,
              correctCount: 0,
            }));
            setParticipants(wsParts);

            // Sync with local storage
            const allSessions = getStoredData<Session[]>("sessions", []);
            const updated = allSessions.map((s) =>
              s.pin === pin ? { ...s, participants: wsParts } : s
            );
            setStoredData("sessions", updated);
          }
        } catch {
          // Safe
        }
      };
    } catch {
      // Safe fallback
    }

    return () => {
      if (ws) ws.close();
    };
  }, [pin]);

  // 3. Fallback Poll for newly connected students from Backend API
  useEffect(() => {
    const fetchLiveParticipants = async () => {
      try {
        const list = await apiGetParticipants(pin);
        if (Array.isArray(list)) {
          const mapped: Participant[] = list.map((p: any) => ({
            id: p.id,
            name: p.name,
            joinedAt: p.joined_at || new Date().toISOString(),
            answers: {},
            score: p.score || 0,
            correctCount: p.correct_count || 0,
          }));
          setParticipants(mapped);

          // Update local session
          const allSessions = getStoredData<Session[]>("sessions", []);
          const updated = allSessions.map((s) =>
            s.pin === pin ? { ...s, participants: mapped } : s
          );
          setStoredData("sessions", updated);
          return;
        }
      } catch {
        // Fallback to local storage
        const allSessions = getStoredData<Session[]>("sessions", []);
        const current = allSessions.find((s) => s.pin === pin);
        if (current && current.participants) {
          setParticipants(current.participants);
        }
      }
    };

    fetchLiveParticipants();
    const interval = setInterval(fetchLiveParticipants, 1500);
    return () => clearInterval(interval);
  }, [pin]);

  const handleCopyPin = () => {
    navigator.clipboard.writeText(pin);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleStartQuiz = () => {
    const allSessions = getStoredData<Session[]>("sessions", []);
    const updated = allSessions.map((s) =>
      s.pin === pin
        ? {
            ...s,
            status: "question" as const,
            currentQuestionIndex: 0,
            timeRemaining: quiz?.timeLimitSeconds || 30,
            participants,
          }
        : s
    );
    setStoredData("sessions", updated);

    // Notify via WS
    try {
      const ws = connectSessionWebSocket(pin, { role: "teacher" });
      ws.onopen = () => {
        ws.send(JSON.stringify({ type: "TeacherStartQuiz" }));
        setTimeout(() => ws.close(), 300);
      };
    } catch {
      // Safe
    }

    router.push(`/teacher/session/${pin}`);
  };

  const handleCancelSession = async () => {
    // 1. Delete from backend if exists
    if (session?.id) {
      await apiDeleteSession(session.id).catch(() => null);
    }

    // 2. Notify via WS
    try {
      const ws = connectSessionWebSocket(pin, { role: "teacher" });
      ws.onopen = () => {
        ws.send(JSON.stringify({ type: "TeacherCancelQuiz" }));
        setTimeout(() => ws.close(), 500);
      };
    } catch {
      // Safe
    }

    // 3. Remove from local store so it NEVER appears in /history
    const allSessions = getStoredData<Session[]>("sessions", []);
    const updated = allSessions.filter((s) => s.pin !== pin);
    setStoredData("sessions", updated);

    setIsCancelModalOpen(false);
    router.replace("/dashboard");
  };

  const digits = pin.split("");
  const displayGradeName = session?.gradeName || grade?.name || "";
  const displayGroupName = session?.groupName || (group ? `Grupo ${group.name}` : "");

  return (
    <AuthGuard>
      <div className="min-h-screen flex flex-col items-center justify-between pt-16 pb-12 px-4 md:px-8 antialiased">
        {/* Top Header */}
        <header className="w-full max-w-[1120px] mx-auto text-center mb-6">
          <div className="flex justify-between items-center mb-3">
            <button
              onClick={() => setIsCancelModalOpen(true)}
              className="text-xs font-semibold px-4 py-2 rounded-full bg-white/80 hover:bg-[#ffdad6]/40 text-[#ba1a1a] border border-[#e6e2da] shadow-sm flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <XCircle className="w-3.5 h-3.5" />
              Cancelar Evaluación
            </button>
            <div className="flex items-center gap-2">
              {(displayGradeName || displayGroupName) && (
                <span className="text-xs font-bold text-[#171818] bg-white px-3.5 py-1 rounded-full border border-[#e6e2da] shadow-xs">
                  {displayGradeName} {displayGroupName ? `• ${displayGroupName}` : ""}
                </span>
              )}
              <span className="text-xs font-bold text-[#745b00] uppercase tracking-widest bg-[#ffd659]/30 px-3.5 py-1 rounded-full border border-[#ffd659]/40">
                Sala de Espera
              </span>
            </div>
          </div>

          <h1 className="text-3xl md:text-5xl font-bold text-[#171818] tracking-tight">
            {quiz?.title || session?.quizTitle || "Evaluación en Vivo"}
          </h1>
          <p className="text-xs text-[#737373] mt-1 font-medium">
            {quiz?.questions.length || 0} Preguntas • {quiz?.timeLimitSeconds || 30}s por pregunta
          </p>
        </header>

        {/* Main Content Layout */}
        <main className="w-full max-w-2xl mx-auto flex flex-col gap-6 relative z-10 my-auto">
          {/* PIN Display Card */}
          <section className="bg-white rounded-[2.5rem] p-8 md:p-10 shadow-ambient text-center flex flex-col items-center justify-center border border-[#e6e2da]/40 relative overflow-hidden">
            <p className="text-sm font-semibold text-[#737373] mb-4 uppercase tracking-wider">
              PIN de Acceso
            </p>

            <div
              onClick={handleCopyPin}
              className="flex items-center justify-center gap-3 md:gap-5 mb-4 cursor-pointer group"
              title="Click para copiar PIN"
            >
              {digits.map((digit, i) => (
                <div
                  key={i}
                  className="w-16 h-20 md:w-20 md:h-24 rounded-2xl bg-[#fdf9f1] border-2 border-[#e6e2da] group-hover:border-[#ffd659] flex items-center justify-center shadow-xs transition-all"
                >
                  <span className="text-5xl md:text-7xl font-bold text-[#171818]">
                    {digit}
                  </span>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-[#444748] bg-[#f7f3eb] px-4 py-2 rounded-full border border-[#e6e2da]/50">
                Los estudiantes ingresan a <strong className="text-[#171818]">/</strong> y meten este PIN
              </span>
              <button
                onClick={handleCopyPin}
                className="p-2 rounded-full bg-[#f7f3eb] hover:bg-[#ffd659] text-[#171818] transition-colors cursor-pointer"
                title="Copiar PIN"
              >
                {copied ? <Check className="w-4 h-4 text-[#166534]" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          </section>

          {/* Connected Students Card */}
          <section className="bg-[#2c2c2c] rounded-[2.5rem] p-6 md:p-8 shadow-dark-card text-white border border-white/10 flex flex-col">
            {/* Header & Counter */}
            <div
              onClick={() => setIsListExpanded(!isListExpanded)}
              className="flex items-center justify-between pb-4 border-b border-white/15 cursor-pointer select-none group"
            >
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-full bg-[#ffd659] flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform">
                  <span className="text-2xl font-bold text-[#171818]">
                    {participants.length}
                  </span>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    Estudiantes conectados
                  </h3>
                  <p className="text-xs text-white/60">
                    {isListExpanded ? "Haz clic para contraer lista" : "Haz clic para ver los nombres"}
                  </p>
                </div>
              </div>

              <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
                <Users className="w-4 h-4 text-[#ffd659]" />
              </div>
            </div>

            {/* Expandable Scrollable Student Names List */}
            {isListExpanded && (
              <div className="mt-4 max-h-[220px] overflow-y-auto pr-1 space-y-2 custom-scrollbar">
                {participants.length === 0 ? (
                  <div className="py-8 text-center text-xs text-white/50 animate-pulse-subtle">
                    Esperando que los estudiantes ingresen el PIN {pin} desde su dispositivo...
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {participants.map((p, idx) => {
                      const initials = p.name
                        .split(" ")
                        .map((n) => n[0])
                        .join("")
                        .toUpperCase()
                        .slice(0, 2);

                      const colors = [
                        "bg-[#ffd659] text-[#171818]",
                        "bg-[#dcfce7] text-[#166534]",
                        "bg-[#e0e7ff] text-[#3730a3]",
                        "bg-[#fce7f3] text-[#831843]",
                        "bg-[#fed7aa] text-[#7c2d12]",
                      ];
                      const colorClass = colors[idx % colors.length];

                      return (
                        <div
                          key={p.id || idx}
                          className="flex items-center gap-3 p-2.5 rounded-2xl bg-white/10 hover:bg-white/15 transition-all border border-white/5"
                        >
                          <div
                            className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${colorClass}`}
                          >
                            {initials}
                          </div>
                          <span className="text-xs font-semibold text-white truncate">
                            {p.name}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Start Quiz Action Button */}
          <div className="flex justify-center w-full">
            <button
              onClick={handleStartQuiz}
              disabled={participants.length === 0}
              className="w-full bg-[#ffd659] hover:bg-[#eac247] disabled:opacity-50 disabled:cursor-not-allowed text-[#171818] font-bold text-lg px-12 py-4.5 rounded-full shadow-ambient hover:shadow-xl transition-all duration-300 hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-3 cursor-pointer"
            >
              <span>Comenzar Evaluación ({participants.length} conectados)</span>
              <Play className="w-5 h-5 fill-current" />
            </button>
          </div>
        </main>

        {/* Modal: Confirm Cancel Session */}
        <ConfirmModal
          isOpen={isCancelModalOpen}
          title="¿Cancelar evaluación antes de tiempo?"
          message="Si cancelas la sesión ahora, no se guardará ningún registro en el historial y los estudiantes conectados serán redirigidos al inicio."
          confirmText="Sí, Cancelar Evaluación"
          isDestructive={true}
          onConfirm={handleCancelSession}
          onCancel={() => setIsCancelModalOpen(false)}
        />

        {/* Footer */}
        <footer className="w-full max-w-[1120px] py-4 text-center text-xs text-[#737373]">
          © {new Date().getFullYear()} QuizInejoma. Academic Excellence.
        </footer>
      </div>
    </AuthGuard>
  );
}
