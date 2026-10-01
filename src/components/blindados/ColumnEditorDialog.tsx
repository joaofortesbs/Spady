"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Loader2, RotateCcw } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { KanbanColumn, KanbanProject, KanbanColumnUpdates } from "@/lib/types/blindados";

export type ColumnEditorMode = "project" | "rename" | "color";

const COLUMN_COLORS = ["#0891b2", "#0e7490", "#2563eb", "#4f46e5", "#9333ea", "#c2410c", "#dc2626", "#16a34a"];
const HEX_COLOR = /^#[\da-f]{6}$/i;

export function ColumnEditorDialog({
  column,
  mode,
  projects,
  onOpenChange,
  onUpdate,
}: {
  column: KanbanColumn | null;
  mode: ColumnEditorMode | null;
  projects: KanbanProject[];
  onOpenChange: (open: boolean) => void;
  onUpdate: (columnId: string, updates: KanbanColumnUpdates) => Promise<boolean> | boolean | void;
}) {
  const [title, setTitle] = useState("");
  const [projectId, setProjectId] = useState<string>("");
  const [color, setColor] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setTitle(column?.title ?? "");
    setProjectId(column?.projectId ?? "");
    setColor(column?.backgroundColor ?? null);
    setError("");
  }, [column, mode]);

  const heading = useMemo(() => ({
    project: "Alterar projeto",
    rename: "Renomear coluna",
    color: "Cor da coluna",
  }[mode ?? "rename"]), [mode]);

  const save = async () => {
    if (!column || !mode || saving) return;
    setError("");
    setSaving(true);
    let updates: KanbanColumnUpdates;
    if (mode === "rename") {
      const cleanTitle = title.trim();
      if (!cleanTitle) {
        setError("Informe um nome para a coluna.");
        setSaving(false);
        return;
      }
      updates = { title: cleanTitle };
    } else if (mode === "project") {
      updates = { projectId: projectId || null };
    } else {
      if (color !== null && !HEX_COLOR.test(color)) {
        setError("Use uma cor hexadecimal válida, como #06b6d4.");
        setSaving(false);
        return;
      }
      updates = { backgroundColor: color };
    }
    try {
      const result = await onUpdate(column.id, updates);
      if (result === false) {
        setError("Não foi possível salvar as alterações. Tente novamente.");
        return;
      }
      onOpenChange(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível salvar as alterações.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={Boolean(column && mode)} onOpenChange={(open) => !saving && onOpenChange(open)}>
      <DialogContent className="max-w-md border border-[#00f6ff]/20 bg-[#0a0f1f] text-white shadow-2xl shadow-black/50">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">{heading}</DialogTitle>
          <DialogDescription className="text-white/45">
            {column ? `Personalize “${column.title}” sem alterar suas tarefas.` : ""}
          </DialogDescription>
        </DialogHeader>

        {mode === "rename" && (
          <label className="block space-y-2 text-sm text-white/65">
            Nome da coluna
            <input
              autoFocus
              maxLength={80}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter") void save(); }}
              className="min-h-11 w-full rounded-lg border border-white/10 bg-[#010516] px-3 text-sm text-white outline-none focus:border-[#00f6ff]/60 focus:ring-2 focus:ring-[#00f6ff]/15"
              aria-label="Nome da coluna"
            />
          </label>
        )}

        {mode === "project" && (
          <label className="block space-y-2 text-sm text-white/65">
            Projeto
            <select
              value={projectId}
              onChange={(event) => setProjectId(event.target.value)}
              className="min-h-11 w-full rounded-lg border border-white/10 bg-[#010516] px-3 text-sm text-white outline-none focus:border-[#00f6ff]/60"
              aria-label="Projeto da coluna"
            >
              <option value="">Sem projeto</option>
              {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
            </select>
            <span className="block text-xs leading-relaxed text-white/35">
              A coluna e todas as tarefas vinculadas serão movidas para o projeto escolhido.
            </span>
          </label>
        )}

        {mode === "color" && (
          <div className="space-y-4">
            <div className="grid grid-cols-4 gap-2">
              {COLUMN_COLORS.map((item) => (
                <button
                  type="button"
                  key={item}
                  onClick={() => setColor(item)}
                  aria-label={`Selecionar cor ${item}`}
                  aria-pressed={color?.toLowerCase() === item}
                  className={`flex h-11 items-center justify-center rounded-lg border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00f6ff] ${color?.toLowerCase() === item ? "border-[#00f6ff] ring-1 ring-[#00f6ff]/60" : "border-white/10 hover:border-white/30"}`}
                  style={{ backgroundColor: item }}
                >
                  {color?.toLowerCase() === item && <Check className="h-4 w-4 text-white" aria-hidden="true" />}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-3 rounded-lg border border-white/10 bg-[#010516]/70 px-3 py-2 text-sm text-white/60">
              Cor personalizada
              <input
                type="color"
                value={color && HEX_COLOR.test(color) ? color : "#0891b2"}
                onChange={(event) => setColor(event.target.value)}
                aria-label="Escolher cor personalizada"
                className="ml-auto h-8 w-10 cursor-pointer rounded border-0 bg-transparent"
              />
            </label>
            <label className="block space-y-2 text-xs text-white/45">
              Código hexadecimal
              <input
                type="text"
                inputMode="text"
                value={color ?? ""}
                onChange={(event) => setColor(event.target.value)}
                placeholder="#06b6d4"
                aria-label="Código hexadecimal da cor"
                className="min-h-10 w-full rounded-lg border border-white/10 bg-[#010516] px-3 font-mono text-sm text-white outline-none placeholder:text-white/20 focus:border-[#00f6ff]/60"
              />
            </label>
            <button
              type="button"
              onClick={() => setColor(null)}
              className={`flex min-h-10 w-full items-center gap-2 rounded-lg border px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00f6ff] ${color === null ? "border-[#00f6ff]/40 bg-[#00f6ff]/10 text-[#00f6ff]" : "border-white/10 text-white/60 hover:bg-white/5"}`}
            >
              <RotateCcw className="h-4 w-4" /> Fundo padrão
              {color === null && <Check className="ml-auto h-4 w-4" />}
            </button>
          </div>
        )}

        {error && <p role="alert" className="rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-200">{error}</p>}

        <DialogFooter className="gap-2 sm:gap-2">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={saving}
            className="min-h-10 rounded-lg border border-white/10 px-4 text-sm text-white/65 transition-colors hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || (mode === "rename" && !title.trim())}
            className="flex min-h-10 items-center justify-center gap-2 rounded-lg bg-[#00f6ff] px-4 text-sm font-semibold text-[#041119] transition-colors hover:bg-[#74fbff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00f6ff] disabled:cursor-wait disabled:opacity-55"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            Salvar
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}