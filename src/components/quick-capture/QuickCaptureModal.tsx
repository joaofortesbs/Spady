"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Bold,
  Check,
  CheckSquare,
  ChevronLeft,
  Code2,
  FileText,
  Heading1,
  Heading2,
  Heading3,
  Highlighter,
  Italic,
  List,
  ListOrdered,
  Minus,
  Pin,
  PinOff,
  Plus,
  Quote,
  Save,
  Search,
  Sparkles,
  Strikethrough,
  X,
} from "lucide-react";
import { buildQuickCaptureNote } from "../../lib/utils/quickCapture";
import { MarkdownEditable, MarkdownEditableHandle, editableHtmlToMarkdown } from "../visoes/MarkdownEditable";
import { getMarkdownPreview } from "../visoes/MarkdownNoteContent";
import type { Note } from "../../lib/types/visoes";

interface QuickCaptureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (title: string, content: string) => Promise<void>;
  notes?: Note[];
  pinnedNoteIds?: string[];
  onToggleNotePinned?: (id: string) => void;
  onUpdateNote?: (id: string, updates: Partial<Note>) => Promise<void> | void;
}

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

export function QuickCaptureModal({
  isOpen,
  onClose,
  onSave,
  notes = [],
  pinnedNoteIds = [],
  onToggleNotePinned = () => undefined,
  onUpdateNote = async () => undefined,
}: QuickCaptureModalProps) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "ready" | "saved">("idle");
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [slashQuery, setSlashQuery] = useState("");
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const prefersReducedMotion = useReducedMotion();
  const titleRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<MarkdownEditableHandle>(null);

  const sortedNotes = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return [...notes]
      .filter((note) => !query || `${note.title} ${note.content}`.toLowerCase().includes(query))
      .sort((a, b) => {
        const pinnedDelta = Number(pinnedNoteIds.includes(b.id)) - Number(pinnedNoteIds.includes(a.id));
        if (pinnedDelta !== 0) return pinnedDelta;
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      });
  }, [notes, pinnedNoteIds, searchQuery]);

  const pinnedNotes = sortedNotes.filter((note) => pinnedNoteIds.includes(note.id));
  const recentNotes = sortedNotes.filter((note) => !pinnedNoteIds.includes(note.id));

  useEffect(() => {
    if (!isOpen) return;
    setActiveNoteId(null);
    setTitle("");
    setContent("");
    setSearchQuery("");
    setSaveState("idle");
    setShowSlashMenu(false);
    const timer = window.setTimeout(() => titleRef.current?.focus(), 180);
    return () => window.clearTimeout(timer);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const frame = window.requestAnimationFrame(() => editorRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [isOpen, activeNoteId]);

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
  }, [isOpen, onClose, showSlashMenu, title, content, activeNoteId]);

  const startNewNote = () => {
    setActiveNoteId(null);
    setTitle("");
    setContent("");
    setSaveState("idle");
    setShowSlashMenu(false);
    window.requestAnimationFrame(() => titleRef.current?.focus());
  };

  const selectNote = (note: Note) => {
    setActiveNoteId(note.id);
    setTitle(note.title);
    setContent(note.content);
    setSaveState("idle");
    setShowSlashMenu(false);
  };

  const handleDialogKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (isEscapeKey(event)) {
      event.preventDefault();
      if (showSlashMenu) setShowSlashMenu(false);
      else onClose();
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
      if (activeNoteId) await onUpdateNote(activeNoteId, { title: note.title, content: note.content });
      else await onSave(note.title, note.content);
      setSaveState("saved");
      window.setTimeout(onClose, 180);
    } finally {
      setIsSaving(false);
    }
  };

  const syncContentFromEditor = () => {
    const element = editorRef.current?.getElement();
    if (!element) return;
    const next = editableHtmlToMarkdown(element);
    setContent(next);
    setSaveState(next.trim() || title.trim() ? "ready" : "idle");
  };

  const runToolbarAction = (action: string) => {
    if (action === "checklist") {
      document.execCommand("insertUnorderedList");
      const selection = window.getSelection();
      const current = selection?.anchorNode instanceof HTMLElement ? selection.anchorNode : selection?.anchorNode?.parentElement;
      const item = current?.closest("li");
      const list = item?.parentElement;
      if (item && list) {
        list.setAttribute("data-checklist", "true");
        item.setAttribute("data-checked", "false");
        if (!item.querySelector("[data-checkbox]")) {
          const checkbox = document.createElement("span");
          checkbox.setAttribute("data-checkbox", "true");
          checkbox.textContent = "☐ ";
          item.prepend(checkbox);
        }
      }
      syncContentFromEditor();
      editorRef.current?.focus();
      return;
    }

    const commandMap: Record<string, [string, string?]> = {
      bold: ["bold"], italic: ["italic"], highlight: ["hiliteColor", "rgba(103, 232, 249, 0.25)"],
      strike: ["strikeThrough"], code: ["formatBlock", "<code>"],
      "heading-1": ["formatBlock", "<h1>"], "heading-2": ["formatBlock", "<h2>"], "heading-3": ["formatBlock", "<h3>"],
      bullet: ["insertUnorderedList"], ordered: ["insertOrderedList"], quote: ["formatBlock", "<blockquote>"], divider: ["insertHorizontalRule"],
    };
    const [command, value] = commandMap[action] || [];
    if (!command) return;
    document.execCommand(command, false, value);
    syncContentFromEditor();
    editorRef.current?.focus();
  };

  const handleEditorKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "/" && !event.metaKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault();
      setShowSlashMenu(true);
      return;
    }
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

  const filteredSlashOptions = slashOptions.filter((item) => item.label.toLowerCase().includes(slashQuery));

  const insertSlashOption = (prefix: string) => {
    setShowSlashMenu(false);
    const action = prefix === "# " ? "heading-1" : prefix === "## " ? "heading-2" : prefix === "- " ? "bullet" : prefix === "- [ ] " ? "checklist" : prefix === "> " ? "quote" : "paragraph";
    if (action !== "paragraph") runToolbarAction(action);
  };

  const renderNoteRow = (note: Note) => {
    const isPinned = pinnedNoteIds.includes(note.id);
    return (
      <div key={note.id} className={`group flex items-start gap-2 rounded-xl px-2 py-2 transition-colors ${activeNoteId === note.id ? "bg-cyan-300/12" : "hover:bg-white/[.06]"}`}>
        <button type="button" aria-label={note.title || "Sem título"} onClick={() => selectNote(note)} className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: note.color }} />
            <span className="truncate text-xs font-medium text-white/85">{note.title || "Sem título"}</span>
          </div>
          <p className="mt-1 line-clamp-2 pl-4 text-[11px] leading-4 text-white/38">{getMarkdownPreview(note.content) || "Nota vazia"}</p>
        </button>
        <button type="button" onClick={() => onToggleNotePinned(note.id)} className="mt-0.5 rounded-md p-1 text-white/25 opacity-0 transition hover:bg-white/10 hover:text-cyan-100 group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70" aria-label={isPinned ? `Desafixar ${note.title}` : `Fixar ${note.title}`}>
          {isPinned ? <Pin className="h-3.5 w-3.5 text-cyan-200" /> : <PinOff className="h-3.5 w-3.5" />}
        </button>
      </div>
    );
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-[70] bg-black/45 p-3 backdrop-blur-[3px] sm:p-6"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onKeyDownCapture={handleDialogKeyDown}
          onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
        >
          <motion.section
            role="dialog" tabIndex={-1} aria-modal="true" aria-labelledby="quick-capture-title"
            className="absolute left-1/2 top-1/2 flex max-h-[min(90vh,800px)] w-[min(96vw,1120px)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[22px] border border-cyan-200/20 bg-[#081020]/[.98] shadow-[0_28px_110px_rgba(0,0,0,.62)] backdrop-blur-2xl"
            initial={{ opacity: 0, scale: 0.97, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97, y: 12 }}
            transition={{ duration: prefersReducedMotion ? 0 : 0.2, ease: [0.23, 1, 0.32, 1] }}
          >
            <aside className={`${isSidebarOpen ? "w-[260px]" : "w-0"} hidden shrink-0 overflow-hidden border-r border-white/10 bg-[#07101e]/90 transition-[width] duration-200 sm:block`} aria-label="Navegação de notas">
              <div className="flex h-full min-w-[260px] flex-col">
                <div className="border-b border-white/10 px-4 py-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-white">Notas</p>
                      <p className="mt-0.5 text-[11px] text-white/35">{notes.length} {notes.length === 1 ? "nota" : "notas"}</p>
                    </div>
                    <button type="button" onClick={startNewNote} className="rounded-lg p-2 text-cyan-200/70 transition hover:bg-cyan-200/10 hover:text-cyan-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70" aria-label="Nova nota"><Plus className="h-4 w-4" /></button>
                  </div>
                  <label className="relative mt-3 block"><Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/30" /><input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Buscar notas" className="w-full rounded-lg border border-white/10 bg-white/[.04] py-2 pl-8 pr-2 text-xs text-white outline-none placeholder:text-white/28 focus:border-cyan-200/35" /></label>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
                  {pinnedNotes.length > 0 ? <><p className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-[.16em] text-white/30">Fixadas</p>{pinnedNotes.map(renderNoteRow)}</> : null}
                  {recentNotes.length > 0 ? <><p className="px-2 pb-1.5 pt-4 text-[10px] font-semibold uppercase tracking-[.16em] text-white/30">Recentes</p>{recentNotes.map(renderNoteRow)}</> : <div className="flex flex-col items-center px-5 py-16 text-center"><FileText className="h-7 w-7 text-cyan-200/30" /><p className="mt-3 text-xs text-white/40">Nenhuma nota encontrada</p></div>}
                </div>
                <button type="button" onClick={startNewNote} className="m-3 inline-flex items-center justify-center gap-2 rounded-xl border border-cyan-200/20 bg-cyan-300/10 px-3 py-2.5 text-xs font-semibold text-cyan-100 transition hover:bg-cyan-300/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70"><Plus className="h-3.5 w-3.5" />Nova nota</button>
              </div>
            </aside>

            <div className="flex min-w-0 flex-1 flex-col">
              <header className="flex items-center justify-between border-b border-white/10 bg-white/[.025] px-4 py-3 sm:px-5">
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => setIsSidebarOpen((open) => !open)} className="rounded-lg p-2 text-white/45 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70" aria-label={isSidebarOpen ? "Ocultar lista de notas" : "Mostrar lista de notas"}><ChevronLeft className={`h-4 w-4 transition-transform ${isSidebarOpen ? "" : "rotate-180"}`} /></button>
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-cyan-200/15 bg-cyan-300/10 text-cyan-200"><Sparkles className="h-4 w-4" /></span>
                  <span className="text-[10px] font-semibold uppercase tracking-[.18em] text-white/35">{activeNoteId ? "Nota" : "Nova nota"}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="hidden items-center gap-1.5 text-[10px] text-white/35 sm:flex">{saveState === "saved" ? <Check className="h-3.5 w-3.5 text-emerald-300" /> : null}{saveState === "ready" ? "Não salvo" : saveState === "saved" ? "Salvo" : "Rascunho"}</span>
                  <button type="button" onClick={onClose} className="rounded-lg p-2 text-white/40 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70" aria-label="Fechar captura rápida"><X className="h-4 w-4" /></button>
                </div>
              </header>

              <div className="flex flex-wrap items-center gap-1 border-b border-white/10 bg-[#0b1628]/90 px-3 py-2.5 sm:px-4">
                {toolbarGroups.map((group, groupIndex) => <React.Fragment key={groupIndex}>{groupIndex > 0 ? <span className="mx-1 h-5 w-px bg-white/10" aria-hidden="true" /> : null}{group.map(({ label, icon: Icon, action }) => <button key={action} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => runToolbarAction(action)} className="rounded-lg p-2 text-white/55 transition-[background,color,transform] duration-150 hover:bg-white/10 hover:text-cyan-100 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70" aria-label={label} title={label}><Icon className="h-4 w-4" /></button>)}</React.Fragment>)}
                <button type="submit" form="quick-capture-form" disabled={isSaving || (!title.trim() && !content.trim())} className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-cyan-300 px-3 py-2 text-xs font-semibold text-[#06101c] transition hover:bg-cyan-200 active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-100/80"><Save className="h-3.5 w-3.5" />{isSaving ? "Salvando…" : saveState === "saved" ? "Salvo" : "Salvar"}</button>
              </div>

              <form id="quick-capture-form" className="flex min-h-0 flex-1 flex-col" onSubmit={(event) => { event.preventDefault(); void handleSave(); }}>
                <div className="flex min-h-0 flex-1 flex-col px-5 pb-5 pt-5 sm:px-9 sm:pt-7">
                  <label htmlFor="quick-capture-title-input" className="sr-only">Título da nota</label>
                  <input ref={titleRef} id="quick-capture-title-input" value={title} onChange={(event) => { setTitle(event.target.value); setSaveState(event.target.value.trim() || content.trim() ? "ready" : "idle"); }} placeholder="Título da nota" className="mb-3 w-full border-0 bg-transparent text-2xl font-semibold tracking-[-.03em] text-white outline-none placeholder:text-white/25 sm:text-3xl" />
                  <label htmlFor="quick-capture-content" className="sr-only">Conteúdo da nota</label>
                  <div className="relative min-h-0 flex-1">
                    <MarkdownEditable ref={editorRef} id="quick-capture-content" value={content} onChange={(next) => { setContent(next); setSaveState(next.trim() || title.trim() ? "ready" : "idle"); setShowSlashMenu(false); }} onKeyDown={handleEditorKeyDown} ariaLabel="Conteúdo da nota" placeholder="Comece a escrever…" className="h-full" />
                    <AnimatePresence>{showSlashMenu && filteredSlashOptions.length > 0 ? <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 5 }} className="absolute bottom-4 left-0 z-10 w-[min(92vw,290px)] overflow-hidden rounded-xl border border-white/10 bg-[#111d31] p-1.5 shadow-2xl"><p className="px-2.5 pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-[.16em] text-white/35">Blocos</p>{filteredSlashOptions.map((item) => <button key={item.label} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => insertSlashOption(item.prefix)} className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-white/10 focus-visible:bg-white/10 focus-visible:outline-none"><span className="text-sm text-white/80">{item.label}</span><span className="text-[11px] text-white/35">{item.description}</span></button>)}</motion.div> : null}</AnimatePresence>
                  </div>
                </div>
              </form>
            </div>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
