"use client";

import React, { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Bold,
  Check,
  CheckSquare,
  Code2,
  GripVertical,
  Heading1,
  Heading2,
  Heading3,
  Highlighter,
  Italic,
  List,
  ListOrdered,
  Minus,
  Quote,
  Save,
  Sparkles,
  Strikethrough,
  X,
} from "lucide-react";
import { buildQuickCaptureNote } from "../../lib/utils/quickCapture";
import { getDraggedModalPosition } from "../../lib/utils/modalDrag";
import { applyInlineCommand, applyLinePrefixCommand, insertSlashCommand } from "../../lib/utils/editorCommands";

interface QuickCaptureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (title: string, content: string) => Promise<void>;
}

type DragState = {
  active: boolean;
  pointerId: number | null;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
};

const toolbarGroups = [
  [
    { label: "Título grande", icon: Heading1, action: "heading-1" },
    { label: "Título médio", icon: Heading2, action: "heading-2" },
    { label: "Título pequeno", icon: Heading3, action: "heading-3" },
  ],
  [
    { label: "Negrito", icon: Bold, action: "bold" },
    { label: "Itálico", icon: Italic, action: "italic" },
    { label: "Destaque", icon: Highlighter, action: "highlight" },
    { label: "Tachado", icon: Strikethrough, action: "strike" },
    { label: "Código inline", icon: Code2, action: "code" },
  ],
  [
    { label: "Lista com marcadores", icon: List, action: "bullet" },
    { label: "Lista numerada", icon: ListOrdered, action: "ordered" },
    { label: "Checklist", icon: CheckSquare, action: "checklist" },
    { label: "Citação", icon: Quote, action: "quote" },
    { label: "Divisor", icon: Minus, action: "divider" },
  ],
] as const;

const slashOptions = [
  { label: "Texto", description: "Parágrafo simples", prefix: "" },
  { label: "Título 1", description: "Título principal", prefix: "# " },
  { label: "Título 2", description: "Seção intermediária", prefix: "## " },
  { label: "Lista", description: "Itens com marcadores", prefix: "- " },
  { label: "Checklist", description: "Próximas ações", prefix: "- [ ] " },
  { label: "Citação", description: "Dar destaque a uma ideia", prefix: "> " },
];

function isEscapeKey(event: KeyboardEvent | React.KeyboardEvent) {
  return event.key === "Escape" || event.key === "Esc" || event.code === "Escape";
}

function getCurrentLine(value: string, cursor: number) {
  const beforeCursor = value.slice(0, cursor);
  return beforeCursor.slice(beforeCursor.lastIndexOf("\n") + 1);
}

export function QuickCaptureModal({ isOpen, onClose, onSave }: QuickCaptureModalProps) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "ready" | "saved">("idle");
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [slashQuery, setSlashQuery] = useState("");
  const prefersReducedMotion = useReducedMotion();
  const titleRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const modalRef = useRef<HTMLElement>(null);
  const dragRef = useRef<DragState>({
    active: false,
    pointerId: null,
    startX: 0,
    startY: 0,
    originX: 0,
    originY: 0,
  });

  useEffect(() => {
    if (!isOpen) return;
    setTitle("");
    setContent("");
    setPosition({ x: 0, y: 0 });
    setSaveState("idle");
    setShowSlashMenu(false);
    const timer = window.setTimeout(() => titleRef.current?.focus(), 180);
    return () => window.clearTimeout(timer);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEscapeKey(event)) {
        if (showSlashMenu) {
          setShowSlashMenu(false);
          return;
        }
        onClose();
      }
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        void handleSave();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose, showSlashMenu]);

  const handleDialogKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (isEscapeKey(event)) {
      event.preventDefault();
      if (showSlashMenu) {
        setShowSlashMenu(false);
      } else {
        onClose();
      }
    }
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      void handleSave();
    }
  };

  const handleSave = async () => {
    const note = buildQuickCaptureNote(title, content);
    if (!note) return;
    setIsSaving(true);
    setSaveState("idle");
    try {
      await onSave(note.title, note.content);
      setSaveState("saved");
      window.setTimeout(onClose, 180);
    } finally {
      setIsSaving(false);
    }
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest("button") || target.closest("input") || target.closest("textarea")) return;
    dragRef.current = {
      active: true,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: position.x,
      originY: position.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.style.cursor = "grabbing";
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.active || dragRef.current.pointerId !== event.pointerId) return;
    setPosition(getDraggedModalPosition(
      { x: dragRef.current.originX, y: dragRef.current.originY },
      { x: dragRef.current.startX, y: dragRef.current.startY },
      { x: event.clientX, y: event.clientY },
      window.innerWidth,
      window.innerHeight,
    ));
  };

  const stopDragging = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current.pointerId !== event.pointerId) return;
    dragRef.current.active = false;
    dragRef.current.pointerId = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    event.currentTarget.style.cursor = "grab";
  };

  const replaceSelection = (replacement: string, selectionStart: number, selectionEnd: number) => {
    const editor = editorRef.current;
    if (!editor) return;
    const next = content.slice(0, selectionStart) + replacement + content.slice(selectionEnd);
    setContent(next);
    setSaveState("ready");
    window.requestAnimationFrame(() => {
      editor.focus();
      const cursor = selectionStart + replacement.length;
      editor.setSelectionRange(cursor, cursor);
    });
  };

  const applyInline = (prefix: string, suffix = prefix) => {
    const editor = editorRef.current;
    if (!editor) return;
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const result = applyInlineCommand(content, start, end, prefix, suffix);
    replaceSelection(result.content.slice(start, result.cursor), start, end);
    window.requestAnimationFrame(() => editor.setSelectionRange(result.cursor, result.cursor));
  };

  const applyLinePrefix = (prefix: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    const result = applyLinePrefixCommand(content, editor.selectionStart, prefix);
    setContent(result.content);
    setSaveState("ready");
    window.requestAnimationFrame(() => {
      editor.focus();
      editor.setSelectionRange(result.cursor, result.cursor);
    });
  };

  const runToolbarAction = (action: string) => {
    if (action === "bold") return applyInline("**");
    if (action === "italic") return applyInline("*");
    if (action === "highlight") return applyInline("==");
    if (action === "strike") return applyInline("~~");
    if (action === "code") return applyInline("`");
    if (action === "heading-1") return applyLinePrefix("# ");
    if (action === "heading-2") return applyLinePrefix("## ");
    if (action === "heading-3") return applyLinePrefix("### ");
    if (action === "bullet") return applyLinePrefix("- ");
    if (action === "ordered") return applyLinePrefix("1. ");
    if (action === "checklist") return applyLinePrefix("- [ ] ");
    if (action === "quote") return applyLinePrefix("> ");
    if (action === "divider") return applyLinePrefix("---\n");
  };

  const handleEditorKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const modifier = event.metaKey || event.ctrlKey;
    if (!modifier) return;
    if (event.key.toLowerCase() === "b") {
      event.preventDefault();
      runToolbarAction("bold");
    } else if (event.key.toLowerCase() === "i") {
      event.preventDefault();
      runToolbarAction("italic");
    } else if (event.key.toLowerCase() === "h" && event.shiftKey) {
      event.preventDefault();
      runToolbarAction("highlight");
    } else if (event.key === "8" && event.shiftKey) {
      event.preventDefault();
      runToolbarAction("checklist");
    }
  };

  const handleEditorChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const next = event.target.value;
    setContent(next);
    setSaveState(next.trim() || title.trim() ? "ready" : "idle");
    const cursor = event.target.selectionStart;
    const line = getCurrentLine(next, cursor);
    if (line.startsWith("/")) {
      setSlashQuery(line.slice(1).toLowerCase());
      setShowSlashMenu(true);
    } else {
      setShowSlashMenu(false);
    }
  };

  const insertSlashOption = (prefix: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    const cursor = editor.selectionStart;
    const result = insertSlashCommand(content, cursor, prefix);
    if (!result) return;
    setContent(result.content);
    setSaveState("ready");
    setShowSlashMenu(false);
    setSlashQuery("");
    window.requestAnimationFrame(() => {
      editor.focus();
      editor.setSelectionRange(result.cursor, result.cursor);
    });
  };

  const filteredSlashOptions = slashOptions.filter((item) => item.label.toLowerCase().includes(slashQuery));

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-[70] bg-black/45 backdrop-blur-[3px]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onKeyDownCapture={handleDialogKeyDown}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) onClose();
          }}
        >
          <motion.section
            ref={modalRef}
            role="dialog"
            tabIndex={-1}
            onKeyDown={handleDialogKeyDown}
            onKeyUp={handleDialogKeyDown}
            aria-modal="true"
            aria-labelledby="quick-capture-title"
            className="absolute left-1/2 top-1/2 flex max-h-[min(86vh,760px)] w-[min(94vw,820px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[22px] border border-cyan-200/20 bg-[#081020]/[.98] shadow-[0_28px_110px_rgba(0,0,0,.62)] backdrop-blur-2xl"
            style={{ transform: `translate3d(calc(-50% + ${position.x}px), calc(-50% + ${position.y}px), 0)` }}
            initial={{ opacity: 0, scale: 0.97, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 12 }}
            transition={{ duration: prefersReducedMotion ? 0 : 0.2, ease: [0.23, 1, 0.32, 1] }}
          >
            <div
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={stopDragging}
              onPointerCancel={stopDragging}
              className="flex touch-none select-none items-center justify-between border-b border-white/10 bg-white/[.025] px-5 py-3.5"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-cyan-200/15 bg-cyan-300/10 text-cyan-200">
                  <Sparkles className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 id="quick-capture-title" className="truncate text-sm font-semibold text-white">Nova nota</h2>
                    <span className="rounded-full border border-white/10 px-2 py-0.5 text-[9px] uppercase tracking-[.18em] text-white/35">Captura rápida</span>
                  </div>
                  <p className="text-xs text-white/40">Escreva livremente. Organize quando estiver pronto.</p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="hidden items-center gap-1.5 text-[10px] text-white/35 sm:flex">
                  {saveState === "saved" ? <Check className="h-3.5 w-3.5 text-emerald-300" /> : null}
                  {saveState === "ready" ? "Não salvo" : saveState === "saved" ? "Salvo" : "Rascunho"}
                </span>
                <GripVertical className="h-4 w-4 text-white/25" aria-hidden="true" />
                <button type="button" onClick={onClose} className="rounded-lg p-2 text-white/40 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70" aria-label="Fechar captura rápida">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1 border-b border-white/10 bg-[#0b1628]/90 px-4 py-2.5">
              {toolbarGroups.map((group, groupIndex) => (
                <React.Fragment key={groupIndex}>
                  {groupIndex > 0 ? <span className="mx-1 h-5 w-px bg-white/10" aria-hidden="true" /> : null}
                  {group.map(({ label, icon: Icon, action }) => (
                    <button key={action} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => runToolbarAction(action)} className="rounded-lg p-2 text-white/55 transition-[background,color,transform] duration-150 hover:bg-white/10 hover:text-cyan-100 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70" aria-label={label} title={label}>
                      <Icon className="h-4 w-4" />
                    </button>
                  ))}
                </React.Fragment>
              ))}
            </div>

            <form className="flex min-h-0 flex-1 flex-col" onSubmit={(event) => { event.preventDefault(); void handleSave(); }}>
              <div className="flex min-h-0 flex-1 flex-col px-6 pb-4 pt-5 sm:px-9 sm:pt-7">
                <label htmlFor="quick-capture-title-input" className="sr-only">Título da nota</label>
                <input
                  ref={titleRef}
                  id="quick-capture-title-input"
                  value={title}
                  onChange={(event) => { setTitle(event.target.value); setSaveState(event.target.value.trim() ? "ready" : content.trim() ? "ready" : "idle"); }}
                  placeholder="Título da nota"
                  className="mb-3 w-full border-0 bg-transparent text-2xl font-semibold tracking-[-.03em] text-white outline-none placeholder:text-white/25 sm:text-3xl"
                />
                <label htmlFor="quick-capture-content" className="sr-only">Conteúdo da nota</label>
                <div className="relative min-h-0 flex-1">
                  <textarea
                    ref={editorRef}
                    id="quick-capture-content"
                    value={content}
                    onChange={handleEditorChange}
                    onKeyDown={handleEditorKeyDown}
                    placeholder="Comece a escrever… Use / para inserir um bloco, ou os atalhos da barra acima."
                    className="h-full min-h-[300px] w-full resize-none border-0 bg-transparent text-[15px] leading-7 text-white/80 outline-none placeholder:text-white/25 sm:min-h-[360px]"
                    spellCheck
                  />
                  <AnimatePresence>
                    {showSlashMenu && filteredSlashOptions.length > 0 ? (
                      <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 5 }} className="absolute bottom-4 left-0 z-10 w-[min(92vw,290px)] overflow-hidden rounded-xl border border-white/10 bg-[#111d31] p-1.5 shadow-2xl">
                        <p className="px-2.5 pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-[.16em] text-white/35">Blocos</p>
                        {filteredSlashOptions.map((item) => (
                          <button key={item.label} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => insertSlashOption(item.prefix)} className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-white/10 focus-visible:bg-white/10 focus-visible:outline-none">
                            <span className="text-sm text-white/80">{item.label}</span>
                            <span className="text-[11px] text-white/35">{item.description}</span>
                          </button>
                        ))}
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 bg-white/[.02] px-5 py-3.5 sm:px-7">
                <div className="flex items-center gap-3 text-[11px] text-white/35">
                  <span>Markdown e blocos rápidos</span>
                  <span className="hidden text-white/20 sm:inline">•</span>
                  <span className="hidden sm:inline">Ctrl/Cmd + Enter salva</span>
                </div>
                <button type="submit" disabled={isSaving || (!title.trim() && !content.trim())} className="inline-flex items-center gap-2 rounded-xl bg-cyan-300 px-4 py-2.5 text-sm font-semibold text-[#06101c] transition-[background,transform,box-shadow] duration-150 hover:bg-cyan-200 hover:shadow-[0_8px_28px_rgba(103,232,249,.18)] active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-100/80">
                  <Save className="h-4 w-4" />
                  {isSaving ? "Salvando…" : saveState === "saved" ? "Salvo" : "Salvar nota"}
                </button>
              </div>
            </form>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
