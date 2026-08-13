"use client";

import { useState, useEffect, use, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import confetti from "canvas-confetti";
import {
  Clock,
  CheckCircle2,
  XCircle,
  Award,
  Sparkles,
  Hourglass,
  LogOut,
  AlertTriangle,
} from "lucide-react";
import {
  Session,
  Quiz,
  getStoredData,
  initialQuizzes,
  normalizeQuiz,
} from "@/lib/store";
import { connectSessionWebSocket } from "@/lib/api";

interface LiveQuestionData {
  id?: string;
  index: number;
  total: number;
  text: string;
  timeLimit: number;
  options: Array<{ id: string; label: string; text: string }>;
}

export default function StudentPlayPage({
  params,
}: {
  params: Promise<{ pin: string }>;
}) {
  const resolvedParams = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const pin = resolvedParams.pin;

  const [studentName, setStudentName] = useState<string>("");
  const [session, setSession] = useState<Session | null>(null);
  const [quiz, setQuiz] = useState<Quiz | null>(null);

  // Live Game State Driven by WebSocket
  const [gamePhase, setGamePhase] = useState<"lobby" | "question" | "review" | "finished">("lobby");
  const [currentLiveQuestion, setCurrentLiveQuestion] = useState<LiveQuestionData | null>(null);
  const [correctOptionInfo, setCorrectOptionInfo] = useState<{
    id?: string;
    label: string;
    text: string;
  } | null>(null);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);

  // Cancellation state
  const [isCancelled, setIsCancelled] = useState(false);
  const [cancelMessage, setCancelMessage] = useState("");

  // Student interaction state
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(30);

  // WebSocket reference
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const nameFromUrl = searchParams.get("name");
    const nameFromStorage = sessionStorage.getItem("quizinejoma_student_name");
    const name = (nameFromUrl || nameFromStorage || "").trim();

    if (!name) {
      router.replace("/");
      return;
    }

    setStudentName(name);

    if (nameFromUrl) {
      sessionStorage.setItem("quizinejoma_student_name", nameFromUrl);
    }
  }, [searchParams, router]);

  // Prevent student from leaving (Back Button Trap & Close Confirmation)
  useEffect(() => {
    // 1. Trap Back button in browser history
    window.history.pushState(null, "", window.location.href);

    const handlePopState = (e: PopStateEvent) => {
      window.history.pushState(null, "", window.location.href);
    };

    window.addEventListener("popstate", handlePopState);

    // 2. Alert when user tries to close the browser or reload
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "¿Seguro que deseas salir de la evaluación? Perderás tu progreso.";
      return e.returnValue;
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("popstate", handlePopState);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, []);

  // WebSocket real-time connection
  useEffect(() => {
    if (!pin || !studentName) return;

    let ws: WebSocket | null = null;
    try {
      ws = connectSessionWebSocket(pin, {
        role: "student",
        name: studentName,
      });
      wsRef.current = ws;

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);

          if (msg.type === "QuestionStarted") {
            const payload = msg.payload;
            setCurrentLiveQuestion({
              id: payload.question_id,
              index: payload.question_index,
              total: payload.total_questions,
              text: payload.text,
              timeLimit: payload.time_limit_seconds || 30,
              options: payload.options || [],
            });
            setSelectedOptionId(null);
            setHasSubmitted(false);
            setTimerSeconds(payload.time_limit_seconds || 30);
            setGamePhase("question");
          } else if (msg.type === "QuestionResult") {
            const payload = msg.payload;
            setCorrectOptionInfo({
              id: payload.correct_option_id,
              label: payload.correct_option_label,
              text: payload.correct_option_text,
            });
            setGamePhase("review");
          } else if (msg.type === "QuizFinished") {
            const payload = msg.payload;
            setLeaderboard(payload.leaderboard || []);
            setGamePhase("finished");
          } else if (msg.type === "QuizCancelled") {
            setIsCancelled(true);
            setCancelMessage(
              msg.payload?.message || "La evaluación ha sido cancelada por el docente."
            );
          }
        } catch (err) {
          console.error("WS Parse error:", err);
        }
      };
    } catch (err) {
      console.warn("WS Connection error:", err);
    }

    return () => {
      if (ws) ws.close();
    };
  }, [pin, studentName]);

  // Initial local backup info
  useEffect(() => {
    const allSessions = getStoredData<Session[]>("sessions", []);
    const current = allSessions.find((s) => s.pin === pin);
    if (current) {
      setSession(current);
      const allQuizzes = getStoredData<Quiz[]>("quizzes", initialQuizzes);
      const currentQuiz = allQuizzes.find((q) => q.id === current.quizId);
      if (currentQuiz) setQuiz(normalizeQuiz(currentQuiz));
    }
  }, [pin]);

  // Question Timer Countdown
  useEffect(() => {
    if (gamePhase !== "question") return;

    const timer = setInterval(() => {
      setTimerSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          if (!hasSubmitted) {
            setHasSubmitted(true);
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [gamePhase, hasSubmitted, currentLiveQuestion?.index]);

  // Auto redirect on cancellation
  useEffect(() => {
    if (isCancelled) {
      const timer = setTimeout(() => {
        sessionStorage.clear();
        router.replace("/");
      }, 3500);
      return () => clearTimeout(timer);
    }
  }, [isCancelled, router]);

  const handleSelectOption = (opt: { id: string; label: string; text: string }) => {
    if (hasSubmitted || gamePhase !== "question" || !currentLiveQuestion) return;

    setSelectedOptionId(opt.id);
    setHasSubmitted(true);

    const timeTaken = (currentLiveQuestion.timeLimit || 30) - timerSeconds;

    // Send answer via WebSocket
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: "StudentSubmitAnswer",
          payload: {
            question_id: currentLiveQuestion.id || null,
            option_id: opt.id || null,
            time_taken_seconds: timeTaken,
          },
        })
      );
    }
  };

  // Pastels for Option cards matching Stitch design
  const optionBgColors = [
    { bg: "bg-[#e8f4fd]", border: "border-[#bfdbfe]", badge: "bg-[#2563eb] text-white", label: "A" },
    { bg: "bg-[#e8fde8]", border: "border-[#bbf7d0]", badge: "bg-[#16a34a] text-white", label: "B" },
    { bg: "bg-[#fdf3e8]", border: "border-[#fed7aa]", badge: "bg-[#ea580c] text-white", label: "C" },
    { bg: "bg-[#fde8f0]", border: "border-[#fbcfe8]", badge: "bg-[#db2777] text-white", label: "D" },
    { bg: "bg-[#f3e8fd]", border: "border-[#e9d5ff]", badge: "bg-[#9333ea] text-white", label: "E" },
  ];

  /* ------------------------------------------------------------- */
  /* VIEW 0: CANCELLED OVERLAY                                     */
  /* ------------------------------------------------------------- */
  if (isCancelled) {
    return (
      <div className="fixed inset-0 bg-[#fdf9f1] flex flex-col justify-center items-center p-6 text-center z-50 animate-fade-in">
        <div className="bg-white rounded-[2.5rem] p-8 md:p-12 max-w-md w-full shadow-ambient border-2 border-[#fca5a5] flex flex-col items-center">
          <div className="w-16 h-16 rounded-full bg-[#fee2e2] flex items-center justify-center text-[#dc2626] mb-4">
            <AlertTriangle className="w-8 h-8" />
          </div>

          <h1 className="text-2xl font-bold text-[#171818] mb-2">Evaluación Cancelada</h1>
          <p className="text-xs text-[#737373] mb-6">
            {cancelMessage || "El docente ha cancelado la sesión antes de tiempo."}
          </p>

          <p className="text-[11px] text-[#737373] mb-6 font-semibold bg-[#f0f0f0] px-4 py-2 rounded-full">
            Serás redirigido a la pantalla principal...
          </p>

          <button
            onClick={() => {
              sessionStorage.clear();
              router.replace("/");
            }}
            className="w-full py-3.5 rounded-full bg-[#2c2c2c] hover:bg-[#171818] text-white text-xs font-bold shadow-ambient transition-all cursor-pointer"
          >
            Volver al Inicio Ahora
          </button>
        </div>
      </div>
    );
  }

  /* ------------------------------------------------------------- */
  /* VIEW 1: LOBBY STATE (Waiting for teacher to start)            */
  /* ------------------------------------------------------------- */
  if (gamePhase === "lobby") {
    return (
      <div className="min-h-screen flex flex-col justify-between items-center p-6 md:p-12 text-center antialiased">
        <header className="w-full max-w-md flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-[#ffd659] flex items-center justify-center font-bold text-[#171818] text-xs">
              Q
            </div>
            <span className="font-bold text-sm text-[#171818]">QuizInejoma</span>
          </div>
          <span className="text-xs font-bold bg-[#ffd659] text-[#745b00] px-3 py-1 rounded-full">
            PIN: {pin}
          </span>
        </header>

        <main className="w-full max-w-md my-auto animate-fade-in">
          <div className="bg-white rounded-[2.5rem] p-8 md:p-10 shadow-ambient border border-[#e6e2da]/50 flex flex-col items-center">
            <div className="w-16 h-16 rounded-full bg-[#fdf9f1] border-4 border-[#ffd659] flex items-center justify-center text-[#745b00] mb-4 animate-pulse-subtle">
              <Hourglass className="w-7 h-7" />
            </div>

            <h1 className="text-2xl font-bold text-[#171818] mb-1">¡Estás en la Sala de Espera!</h1>
            <p className="text-sm font-semibold text-[#745b00] bg-[#ffd659]/30 px-4 py-1.5 rounded-full mb-6">
              {studentName}
            </p>

            <div className="p-4 rounded-2xl bg-[#fcf8f0] border border-[#e6e2da]/40 w-full mb-6 text-xs text-[#737373] space-y-1">
              <p className="font-bold text-[#171818]">{quiz?.title || session?.quizTitle || "Evaluación en Vivo"}</p>
              <p>El docente iniciará la evaluación en cualquier momento...</p>
            </div>

            <div className="flex items-center gap-2 text-xs text-[#737373]">
              <span className="inline-block w-2 h-2 rounded-full bg-[#22c55e] animate-ping" />
              <span>Conectado en tiempo real</span>
            </div>
          </div>
        </main>

        <footer className="text-xs text-[#737373]">
          Permanece en esta pantalla para responder cuando comience.
        </footer>
      </div>
    );
  }

  /* ------------------------------------------------------------- */
  /* VIEW 2: FINAL SCORE STATE (Quiz completed)                    */
  /* ------------------------------------------------------------- */
  if (gamePhase === "finished") {
    const myEntry = leaderboard.find((e) => e.name.toLowerCase() === studentName.toLowerCase());
    const finalScore = myEntry?.score !== undefined ? myEntry.score : 5.0;
    const correctTotal = myEntry?.correct_count !== undefined ? myEntry.correct_count : 0;

    return (
      <div className="min-h-screen flex flex-col justify-between items-center p-6 md:p-12 text-center antialiased">
        <header className="w-full max-w-md flex justify-between items-center">
          <span className="font-bold text-sm text-[#171818]">QuizInejoma</span>
          <span className="text-xs font-bold text-[#745b00] bg-[#ffd659]/30 px-3 py-1 rounded-full">
            Evaluación Finalizada
          </span>
        </header>

        <main className="w-full max-w-md my-auto animate-fade-in">
          <div className="bg-white rounded-[2.5rem] p-8 md:p-10 shadow-ambient border border-[#e6e2da]/50 flex flex-col items-center">
            <div className="w-20 h-20 rounded-full bg-[#ffd659] flex items-center justify-center text-[#171818] mb-4 shadow-md">
              <Award className="w-10 h-10" />
            </div>

            <p className="text-xs font-bold uppercase tracking-wider text-[#737373] mb-1">
              Resultados de {studentName}
            </p>
            <h1 className="text-xl font-bold text-[#171818] mb-4">{quiz?.title || "Evaluación"}</h1>

            <div className="bg-[#fcf8f0] rounded-3xl p-6 w-full border border-[#e6e2da]/60 mb-6 flex flex-col items-center">
              <span className="text-xs text-[#737373] font-semibold mb-1">Tu Calificación Final</span>
              <div className="text-6xl font-black text-[#171818] tracking-tight">
                {finalScore} <span className="text-2xl font-bold text-[#737373]">/ 5.0</span>
              </div>

              <div className="w-full bg-[#e6e2da] h-3 rounded-full overflow-hidden mt-4">
                <div
                  className="bg-[#ffd659] h-full rounded-full transition-all duration-1000"
                  style={{ width: `${(finalScore / 5.0) * 100}%` }}
                />
              </div>

              <div className="flex justify-between w-full text-xs text-[#737373] mt-2 font-medium">
                <span>{correctTotal} correctas</span>
                <span>{myEntry?.rank ? `Puesto #${myEntry.rank}` : "Completado"}</span>
              </div>
            </div>

            <button
              onClick={() => {
                sessionStorage.clear();
                router.replace("/");
              }}
              className="w-full bg-[#2c2c2c] hover:bg-[#171818] text-white font-bold text-sm py-4 rounded-full shadow-ambient transition-all active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>Finalizar y Salir</span>
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </main>

        <footer className="text-xs text-[#737373]">
          © {new Date().getFullYear()} QuizInejoma. Academic Excellence.
        </footer>
      </div>
    );
  }

  /* ------------------------------------------------------------- */
  /* VIEW 3: QUESTION RESULTS / REVIEW STATE                        */
  /* ------------------------------------------------------------- */
  if (gamePhase === "review") {
    const isCorrect = selectedOptionId && correctOptionInfo?.id
      ? selectedOptionId === correctOptionInfo.id
      : false;

    const studentOption = currentLiveQuestion?.options.find((o) => o.id === selectedOptionId);

    return (
      <div className="min-h-screen flex flex-col justify-between items-center p-6 md:p-12 text-center antialiased">
        <header className="w-full max-w-lg flex justify-between items-center">
          <span className="text-xs font-bold text-[#737373]">
            Pregunta {(currentLiveQuestion?.index || 0) + 1} de {currentLiveQuestion?.total || 1}
          </span>
          <span className="text-xs font-bold text-[#745b00] bg-[#ffd659]/30 px-3 py-1 rounded-full">
            {studentName}
          </span>
        </header>

        <main className="w-full max-w-md my-auto animate-fade-in">
          {isCorrect ? (
            <div className="bg-white rounded-[2.5rem] p-8 md:p-10 shadow-ambient border-2 border-[#86efac] flex flex-col items-center">
              <div className="w-20 h-20 rounded-full bg-[#dcfce7] flex items-center justify-center text-[#166534] mb-4 shadow-sm">
                <CheckCircle2 className="w-12 h-12" />
              </div>

              <h1 className="text-3xl font-extrabold text-[#166534] mb-1 tracking-tight">
                ¡Correcto!
              </h1>
              <p className="text-xs text-[#737373] mb-6 font-medium">
                Respuesta acertada
              </p>

              <div className="p-4 rounded-2xl bg-[#dcfce7]/60 border border-[#86efac] w-full text-xs text-[#166534] font-bold mb-6">
                Respuesta correcta: {correctOptionInfo?.label}) {correctOptionInfo?.text}
              </div>

              <div className="flex items-center gap-2 text-xs text-[#737373] animate-pulse-subtle">
                <Hourglass className="w-4 h-4 text-[#ffd659]" />
                <span>Esperando siguiente pregunta del docente...</span>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-[2.5rem] p-8 md:p-10 shadow-ambient border-2 border-[#fca5a5] flex flex-col items-center">
              <div className="w-20 h-20 rounded-full bg-[#fee2e2] flex items-center justify-center text-[#dc2626] mb-4 shadow-sm">
                <XCircle className="w-12 h-12" />
              </div>

              <h1 className="text-3xl font-extrabold text-[#dc2626] mb-1 tracking-tight">
                ¡Incorrecto!
              </h1>
              <p className="text-xs text-[#737373] mb-4 font-medium">
                {studentOption
                  ? `Tu respuesta fue: ${studentOption.label}) ${studentOption.text}`
                  : "Se acabó el tiempo sin responder"}
              </p>

              <div className="p-4 rounded-2xl bg-[#dcfce7] border border-[#86efac] w-full text-xs text-[#166534] font-bold mb-6">
                La respuesta correcta era: {correctOptionInfo?.label}) {correctOptionInfo?.text}
              </div>

              <div className="flex items-center gap-2 text-xs text-[#737373] animate-pulse-subtle">
                <Hourglass className="w-4 h-4 text-[#ffd659]" />
                <span>Esperando siguiente pregunta del docente...</span>
              </div>
            </div>
          )}
        </main>

        <footer className="text-xs text-[#737373]">
          QuizInejoma • Evaluaciones en Vivo
        </footer>
      </div>
    );
  }

  /* ------------------------------------------------------------- */
  /* VIEW 4: ACTIVE QUESTION PRESENTATION & OPTIONS                */
  /* ------------------------------------------------------------- */
  const currentQ = currentLiveQuestion;
  const qIndex = currentQ?.index || 0;
  const totalQ = currentQ?.total || 1;

  return (
    <div className="min-h-screen flex flex-col justify-between pt-6 pb-10 px-4 md:px-8 antialiased max-w-4xl mx-auto">
      {/* Header */}
      <header className="space-y-4">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <span className="font-bold text-xs bg-[#ffd659] text-[#745b00] px-3.5 py-1.5 rounded-full shadow-xs">
              Pregunta {qIndex + 1} de {totalQ}
            </span>
          </div>

          <div className="flex items-center gap-2 bg-white px-4 py-1.5 rounded-full shadow-sm border border-[#e6e2da]">
            <Clock className="w-4 h-4 text-[#745b00]" />
            <span className="font-bold text-sm text-[#171818]">
              {timerSeconds}s
            </span>
          </div>
        </div>

        <div className="w-full bg-[#e6e2da]/60 h-2 rounded-full overflow-hidden">
          <div
            className="bg-[#ffd659] h-full rounded-full transition-all duration-300"
            style={{ width: `${((qIndex + 1) / totalQ) * 100}%` }}
          />
        </div>
      </header>

      {/* Question and Options */}
      <main className="my-auto py-6 space-y-6">
        <div className="bg-white rounded-[2.5rem] p-8 md:p-12 shadow-ambient border border-[#e6e2da]/50 text-center">
          <h2 className="text-2xl md:text-3xl font-bold text-[#171818] leading-tight tracking-tight">
            {currentQ?.text || "Cargando pregunta..."}
          </h2>
        </div>

        {hasSubmitted ? (
          <div className="bg-[#2c2c2c] text-white rounded-3xl p-8 text-center shadow-dark-card animate-fade-in flex flex-col items-center gap-2">
            <Hourglass className="w-8 h-8 text-[#ffd659] animate-pulse-subtle" />
            <h3 className="text-xl font-bold text-white">Respuesta enviada</h3>
            <p className="text-xs text-white/70">
              Esperando a que los demás compañeros terminen o el docente avance...
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {currentQ?.options.map((opt, optIdx) => {
              const color = optionBgColors[optIdx % optionBgColors.length];
              return (
                <button
                  key={opt.id || optIdx}
                  onClick={() => handleSelectOption(opt)}
                  className={`${color.bg} ${color.border} border-2 rounded-[1.75rem] p-6 text-left shadow-xs hover:shadow-md hover:scale-[1.01] active:scale-98 transition-all flex items-center gap-4 group cursor-pointer`}
                >
                  <div
                    className={`w-11 h-11 rounded-full ${color.badge} flex items-center justify-center font-black text-sm shrink-0 shadow-xs group-hover:scale-110 transition-transform`}
                  >
                    {opt.label || color.label}
                  </div>
                  <span className="font-bold text-base md:text-lg text-[#171818]">
                    {opt.text}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="text-center text-xs text-[#737373] flex justify-between items-center pt-2">
        <span>Estudiante: <strong className="text-[#171818]">{studentName}</strong></span>
        <span>QuizInejoma • En Vivo</span>
      </footer>
    </div>
  );
}
