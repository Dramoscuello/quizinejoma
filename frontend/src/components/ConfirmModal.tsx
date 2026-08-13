"use client";

import { AlertTriangle, Trash2, X } from "lucide-react";

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  isDestructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmModal({
  isOpen,
  title,
  message,
  confirmText = "Confirmar",
  cancelText = "Cancelar",
  isDestructive = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
      <div className="bg-white rounded-[2.5rem] p-7 md:p-8 max-w-md w-full shadow-ambient border border-[#e6e2da] text-center flex flex-col items-center">
        <div
          className={`w-14 h-14 rounded-full flex items-center justify-center mb-4 ${
            isDestructive ? "bg-[#fee2e2] text-[#dc2626]" : "bg-[#fef3c7] text-[#d97706]"
          }`}
        >
          {isDestructive ? <Trash2 className="w-7 h-7" /> : <AlertTriangle className="w-7 h-7" />}
        </div>

        <h3 className="text-xl font-bold text-[#171818] mb-2 tracking-tight">
          {title}
        </h3>

        <p className="text-xs text-[#737373] leading-relaxed mb-6 font-medium">
          {message}
        </p>

        <div className="flex gap-3 w-full">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-3.5 rounded-full border border-[#e6e2da] text-xs font-semibold text-[#737373] hover:bg-[#f0f0f0] transition-colors"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`flex-1 py-3.5 rounded-full text-xs font-bold text-white transition-all active:scale-95 shadow-sm ${
              isDestructive
                ? "bg-[#dc2626] hover:bg-[#b91c1c]"
                : "bg-[#2c2c2c] hover:bg-[#171818]"
            }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
