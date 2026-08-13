"use client";

import { useState } from "react";
import { Users, Play, X, Plus } from "lucide-react";
import { Group, Quiz, Grade } from "@/lib/store";
import Link from "next/link";

interface GroupSelectModalProps {
  isOpen: boolean;
  quiz: Quiz | null;
  grade: Grade | null;
  groups: Group[];
  onClose: () => void;
  onConfirm: (selectedGroup: Group | null) => void;
}

export default function GroupSelectModal({
  isOpen,
  quiz,
  grade,
  groups,
  onClose,
  onConfirm,
}: GroupSelectModalProps) {
  const [selectedGroupId, setSelectedGroupId] = useState<string>(
    groups.length > 0 ? groups[0].id : ""
  );

  if (!isOpen || !quiz) return null;

  const handleStart = (e: React.FormEvent) => {
    e.preventDefault();
    const found = groups.find((g) => g.id === selectedGroupId) || null;
    onConfirm(found);
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
      <div className="bg-white rounded-[2.5rem] p-7 md:p-8 max-w-md w-full shadow-ambient border border-[#e6e2da]">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#ffd659] flex items-center justify-center text-[#171818]">
              <Play className="w-5 h-5 fill-current ml-0.5" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-[#171818]">Iniciar Evaluación</h3>
              <p className="text-xs text-[#737373] line-clamp-1">{quiz.title}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-[#737373] hover:bg-[#f0f0f0] cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleStart} className="space-y-5">
          <div>
            <label className="block text-xs font-bold text-[#171818] mb-2 flex items-center gap-1.5">
              <Users className="w-4 h-4 text-[#745b00]" />
              ¿Con cuál grupo deseas jugar esta sesión?
            </label>

            {groups.length === 0 ? (
              <div className="p-4 bg-[#fdf9f1] rounded-2xl border border-[#e6e2da] text-center space-y-2">
                <p className="text-xs text-[#737373]">
                  Aún no tienes grupos creados en {grade?.name || "este grado"}.
                </p>
                <Link
                  href={grade ? `/grades/${grade.id}/groups` : "/grades"}
                  className="inline-flex items-center gap-1 text-xs font-bold text-[#745b00] hover:underline"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Crear un grupo primero
                </Link>
              </div>
            ) : (
              <div className="space-y-2 max-h-[180px] overflow-y-auto pr-1 custom-scrollbar">
                {groups.map((grp) => {
                  const isSelected = selectedGroupId === grp.id || (selectedGroupId === "" && groups[0].id === grp.id);
                  return (
                    <div
                      key={grp.id}
                      onClick={() => setSelectedGroupId(grp.id)}
                      className={`p-3.5 rounded-2xl border flex items-center justify-between cursor-pointer transition-all ${
                        isSelected
                          ? "bg-[#ffd659]/20 border-[#ffd659] shadow-xs"
                          : "bg-[#fcf8f0] border-[#e6e2da]/60 hover:bg-white"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs ${
                            isSelected
                              ? "bg-[#ffd659] text-[#171818]"
                              : "bg-white text-[#737373]"
                          }`}
                        >
                          {grp.name}
                        </div>
                        <div>
                          <span className="font-bold text-xs text-[#171818] block">
                            Grupo {grp.name}
                          </span>
                          <span className="text-[10px] text-[#737373]">
                            Nivel: {grade?.name || "Grado"}
                          </span>
                        </div>
                      </div>

                      <div
                        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                          isSelected
                            ? "border-[#171818] bg-[#171818]"
                            : "border-[#d8d3c9]"
                        }`}
                      >
                        {isSelected && <div className="w-2 h-2 rounded-full bg-[#ffd659]" />}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="bg-[#f0f0f0] p-3 rounded-2xl text-[11px] text-[#737373] flex justify-between items-center">
            <span>Tiempo por pregunta: <strong>{quiz.timeLimitSeconds}s</strong></span>
            <span>Total preguntas: <strong>{quiz.questions.length}</strong></span>
          </div>

          {/* Footer */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3.5 rounded-full border border-[#e6e2da] text-xs font-semibold text-[#737373] hover:bg-[#f0f0f0] cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="flex-1 py-3.5 rounded-full bg-[#ffd659] hover:bg-[#eac247] text-[#171818] text-xs font-bold shadow-ambient transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>Generar PIN de Juego</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
