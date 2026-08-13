"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { User, KeyRound, ArrowRight, Sparkles, AlertCircle } from "lucide-react";
import { getStoredData, setStoredData, Session, generateUUID } from "@/lib/store";
import { apiValidatePin, apiJoinSession } from "@/lib/api";

export default function StudentEntryPage() {
  const router = useRouter();
  const [step, setStep] = useState<"pin" | "name">("pin");
  const [pinDigits, setPinDigits] = useState<string[]>(["", "", "", ""]);
  const [studentName, setStudentName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const inputRefs = [
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
  ];

  useEffect(() => {
    if (step === "pin") {
      inputRefs[0].current?.focus();
    }
  }, [step]);

  const handleDigitChange = (index: number, value: string) => {
    setError(null);
    const cleaned = value.replace(/[^0-9]/g, "");

    if (cleaned.length > 1) {
      const digits = cleaned.slice(0, 4).split("");
      const newPins = [...pinDigits];
      digits.forEach((d, i) => {
        if (index + i < 4) newPins[index + i] = d;
      });
      setPinDigits(newPins);
      const nextIndex = Math.min(index + digits.length, 3);
      inputRefs[nextIndex].current?.focus();
      return;
    }

    const newPins = [...pinDigits];
    newPins[index] = cleaned;
    setPinDigits(newPins);

    if (cleaned && index < 3) {
      inputRefs[index + 1].current?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !pinDigits[index] && index > 0) {
      inputRefs[index - 1].current?.focus();
    }
  };

  const handleValidatePin = async (e: React.FormEvent) => {
    e.preventDefault();
    const pin = pinDigits.join("");
    if (pin.length !== 4) {
      setError("Por favor, ingresa los 4 dígitos del PIN.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // 1. Strict Backend validation: check if PIN is currently active
      const backendRes = await apiValidatePin(pin).catch(() => null);

      if (backendRes !== null) {
        if (backendRes.valid && backendRes.status !== "finished" && backendRes.status !== "cancelled") {
          setStep("name");
          setLoading(false);
          return;
        } else {
          setError("El PIN ingresado no está activo o la evaluación ya finalizó.");
          setLoading(false);
          return;
        }
      }

      // 2. Fallback to active sessions in storage if offline
      const sessions = getStoredData<Session[]>("sessions", []);
      const found = sessions.find(
        (s) => s.pin === pin && s.status !== "finished"
      );

      if (found) {
        setStep("name");
      } else {
        setError("PIN no encontrado o la evaluación ya finalizó. Consulta con tu docente.");
      }
    } catch {
      setError("No se pudo verificar el PIN. Inténtalo nuevamente.");
    } finally {
      setLoading(false);
    }
  };

  const handleJoinLobby = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentName.trim()) {
      setError("Por favor, escribe tu nombre para unirte.");
      return;
    }

    setLoading(true);
    const pin = pinDigits.join("");
    let participantId = generateUUID();

    // 1. Register student in backend database
    try {
      const res = await apiJoinSession(pin, studentName.trim()).catch(() => null);
      if (res && res.participant?.id) {
        participantId = res.participant.id;
      }
    } catch {
      // Fallback
    }

    // 2. Add to local session storage
    const sessions = getStoredData<Session[]>("sessions", []);
    const updatedSessions = sessions.map((s) => {
      if (s.pin === pin) {
        const existing = s.participants.find(
          (p) => p.name.toLowerCase() === studentName.trim().toLowerCase()
        );
        if (!existing) {
          return {
            ...s,
            participants: [
              ...s.participants,
              {
                id: participantId,
                name: studentName.trim(),
                joinedAt: new Date().toISOString(),
                answers: {},
                score: 0,
                correctCount: 0,
              },
            ],
          };
        }
      }
      return s;
    });

    if (sessions.length > 0) {
      setStoredData("sessions", updatedSessions);
    }

    sessionStorage.setItem("quizinejoma_student_name", studentName.trim());
    sessionStorage.setItem("quizinejoma_student_id", participantId);

    setLoading(false);
    router.push(`/play/${pin}?name=${encodeURIComponent(studentName.trim())}`);
  };

  return (
    <div className="min-h-screen flex flex-col justify-between items-center p-4 md:p-8 relative overflow-hidden">
      {/* Top Header */}
      <header className="w-full max-w-[1120px] flex justify-between items-center py-4 z-10">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-2xl bg-[#ffd659] flex items-center justify-center shadow-sm font-bold text-[#171818]">
            Q
          </div>
          <span className="font-bold text-xl text-[#171818] tracking-tight">QuizInejoma</span>
        </div>
        <Link
          href="/login"
          className="text-xs font-semibold px-5 py-2.5 rounded-full bg-white/80 hover:bg-white text-[#2c2c2c] transition-all border border-[#e6e2da] shadow-sm flex items-center gap-1.5"
        >
          <User className="w-3.5 h-3.5" />
          Acceso Docente
        </Link>
      </header>

      {/* Main Form Container */}
      <main className="w-full max-w-md my-auto relative z-10 animate-fade-in">
        {step === "pin" ? (
          /* STEP 1: PIN ENTRY */
          <div className="bg-white rounded-[2.5rem] p-8 md:p-12 shadow-ambient border border-[#e6e2da]/40 flex flex-col items-center text-center">
            <div className="mb-6">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-[#ffd659]/30 text-[#745b00] mb-3">
                <KeyRound className="w-7 h-7" />
              </div>
              <h1 className="text-3xl font-bold text-[#171818] tracking-tight">QuizInejoma</h1>
              <p className="text-sm text-[#737373] mt-1 font-medium">¿Tienes un PIN?</p>
            </div>

            <form onSubmit={handleValidatePin} className="w-full flex flex-col items-center gap-6">
              {/* 4 OTP Digit Boxes */}
              <div className="flex justify-center gap-3 md:gap-4 w-full">
                {pinDigits.map((digit, idx) => (
                  <input
                    key={idx}
                    ref={inputRefs[idx]}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleDigitChange(idx, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(idx, e)}
                    className="otp-input shadow-inner"
                    placeholder="•"
                    autoFocus={idx === 0}
                  />
                ))}
              </div>

              {error && (
                <div className="flex items-center gap-2 text-xs text-[#ba1a1a] bg-[#ffdad6]/80 px-4 py-2.5 rounded-full border border-[#fca5a5]">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#2c2c2c] hover:bg-[#171818] text-white font-semibold text-lg py-4 px-8 rounded-full shadow-ambient hover:shadow-lg transition-all duration-200 active:scale-[0.98] flex items-center justify-center gap-2 mt-2 cursor-pointer"
              >
                {loading ? (
                  <span className="inline-block w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    Ingresar
                    <ArrowRight className="w-5 h-5" />
                  </>
                )}
              </button>
            </form>

            <div className="mt-8 pt-6 border-t border-[#f1ede6] w-full text-xs text-[#737373] text-center">
              <span>Ingreso seguro para estudiantes sin necesidad de registro</span>
            </div>
          </div>
        ) : (
          /* STEP 2: NAME ENTRY */
          <div className="bg-white rounded-[2.5rem] p-8 md:p-12 shadow-ambient border border-[#e6e2da]/40 flex flex-col items-center text-center">
            <div className="mb-6">
              <span className="inline-block bg-[#ffd659] text-[#745b00] text-xs font-bold px-4 py-1.5 rounded-full mb-3 shadow-sm">
                PIN: {pinDigits.join("")}
              </span>
              <h2 className="text-3xl font-bold text-[#171818] tracking-tight">Bienvenido al Quiz</h2>
              <p className="text-sm text-[#737373] mt-1">Ingresa tu nombre para unirte a la sala de espera</p>
            </div>

            <form onSubmit={handleJoinLobby} className="w-full flex flex-col items-center gap-6">
              <div className="relative w-full">
                <span className="absolute left-5 top-1/2 -translate-y-1/2 text-[#737373]">
                  <User className="w-5 h-5" />
                </span>
                <input
                  type="text"
                  value={studentName}
                  onChange={(e) => {
                    setStudentName(e.target.value);
                    setError(null);
                  }}
                  placeholder="¿Cuál es tu nombre completo?"
                  required
                  autoFocus
                  className="w-full pl-13 pr-5 py-4 rounded-full bg-[#f0f0f0] border-2 border-transparent focus:border-[#ffd659] focus:bg-[#fffdf5] text-[#171818] font-medium text-base placeholder-[#737373] transition-all outline-none"
                />
              </div>

              {error && (
                <div className="flex items-center gap-2 text-xs text-[#ba1a1a] bg-[#ffdad6]/80 px-4 py-2.5 rounded-full border border-[#fca5a5]">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#ffd659] hover:bg-[#eac247] text-[#171818] font-bold text-lg py-4 px-8 rounded-full shadow-ambient hover:shadow-lg transition-all duration-200 active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer"
              >
                {loading ? (
                  <span className="inline-block w-5 h-5 border-2 border-[#171818]/30 border-t-[#171818] rounded-full animate-spin" />
                ) : (
                  <>
                    <span>Unirme a la Evaluación</span>
                    <Sparkles className="w-5 h-5 text-[#745b00]" />
                  </>
                )}
              </button>
            </form>

            <button
              onClick={() => {
                setStep("pin");
                setPinDigits(["", "", "", ""]);
                setError(null);
              }}
              className="mt-6 text-xs text-[#737373] hover:text-[#171818] transition-colors cursor-pointer"
            >
              ← Cambiar PIN
            </button>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="w-full max-w-[1120px] py-4 text-center text-xs text-[#737373]">
        © {new Date().getFullYear()} QuizInejoma. Academic Excellence.
      </footer>
    </div>
  );
}
