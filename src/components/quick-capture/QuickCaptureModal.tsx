"use client";

import React, { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { FileText, Grip, Save, X } from "lucide-react";
import { buildQuickCaptureNote } from "../../lib/utils/quickCapture";

interface QuickCaptureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (title: string, content: string) => Promise<void>;
}

export function QuickCaptureModal({ isOpen, onClose, onSave }: QuickCaptureModalProps) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [hasMoved, setHasMoved] = useState(false);
  const dragRef = useRef({ active: false, startX: 0, startY: 0, originX: 0, originY: 0 });
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setTitle("");
    setContent("");
    setPosition({ x: 0, y: 0 });
    setHasMoved(false);
    const timer = window.setTimeout(() => titleRef.current?.focus(), 160);
    return () => window.clearTimeout(timer);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        void handleSave();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  const handleSave = async () => {
    const note = buildQuickCaptureNote(title, content);
    if (!note) return;
    setIsSaving(true);
    try {
      await onSave(note.title, note.content);
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  const handlePointerMove = (event: PointerEvent) => {
    if (!dragRef.current.active) return;
    setHasMoved(true);
    setPosition({
      x: dragRef.current.originX + event.clientX - dragRef.current.startX,
      y: dragRef.current.originY + event.clientY - dragRef.current.startY,
    });
  };

  const stopDragging = () => {
    dragRef.current.active = false;
    window.removeEventListener("pointermove", handlePointerMove);
    window.removeEventListener("pointerup", stopDragging);
  };

  const startDragging = (event: React.PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("button")) return;
    dragRef.current = {
      active: true,
      startX: event.clientX,
      startY: event.clientY,
      originX: position.x,
      originY: position.y,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopDragging);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-[70] bg-black/35 backdrop-blur-[2px]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) onClose();
          }}
        >
          <motion.section
            role="dialog"
            aria-modal="true"
            aria-labelledby="quick-capture-title"
            className="absolute left-1/2 top-1/2 w-[min(92vw,520px)] overflow-hidden rounded-2xl border border-cyan-300/20 bg-[#081020]/95 shadow-[0_24px_90px_rgba(0,0,0,0.5)] backdrop-blur-2xl"
            style={{ transform: `translate(calc(-50% + ${position.x}px), calc(-50% + ${position.y}px))` }}
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 10 }}
            transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
          >
            <div
              onPointerDown={startDragging}
              className={`flex cursor-grab items-center justify-between border-b border-white/10 px-5 py-4 active:cursor-grabbing ${hasMoved ? "select-none" : ""}`}
            >
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-300/10 text-cyan-200">
                  <FileText className="h-4 w-4" />
                </span>
                <div>
                  <h2 id="quick-capture-title" className="text-sm font-semibold text-white">Captura rápida</h2>
                  <p className="text-xs text-white/40">Registre agora. Organize depois.</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Grip className="h-4 w-4 text-white/25" aria-hidden="true" />
                <button type="button" onClick={onClose} className="rounded-lg p-2 text-white/40 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70" aria-label="Fechar captura rápida">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <form className="space-y-4 p-5" onSubmit={(event) => { event.preventDefault(); void handleSave(); }}>
              <div>
                <label htmlFor="quick-capture-title-input" className="mb-2 block text-xs font-medium uppercase tracking-[0.16em] text-white/40">Título</label>
                <input
                  ref={titleRef}
                  id="quick-capture-title-input"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Ex.: Revisar roteiro do lançamento"
                  className="w-full rounded-xl border border-white/10 bg-white/[0.045] px-4 py-3 text-sm text-white outline-none transition-colors placeholder:text-white/25 focus:border-cyan-300/60 focus:bg-white/[0.07]"
                />
              </div>
              <div>
                <label htmlFor="quick-capture-content" className="mb-2 block text-xs font-medium uppercase tracking-[0.16em] text-white/40">Contexto opcional</label>
                <textarea
                  id="quick-capture-content"
                  value={content}
                  onChange={(event) => setContent(event.target.value)}
                  placeholder="Escreva uma ideia, detalhe ou próxima ação..."
                  rows={4}
                  className="w-full resize-none rounded-xl border border-white/10 bg-white/[0.045] px-4 py-3 text-sm leading-6 text-white outline-none transition-colors placeholder:text-white/25 focus:border-cyan-300/60 focus:bg-white/[0.07]"
                />
              </div>
              <div className="flex items-center justify-between gap-3 pt-1">
                <p className="text-[11px] text-white/30">Ctrl/Cmd + Enter para salvar</p>
                <button type="submit" disabled={isSaving || (!title.trim() && !content.trim())} className="inline-flex items-center gap-2 rounded-xl bg-cyan-300 px-4 py-2.5 text-sm font-semibold text-[#06101c] transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-100/80">
                  <Save className="h-4 w-4" />
                  {isSaving ? "Salvando..." : "Salvar nota"}
                </button>
              </div>
            </form>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
