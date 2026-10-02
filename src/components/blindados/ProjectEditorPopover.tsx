"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import { Check, Loader2, Pencil } from "lucide-react";
import { KanbanColumn, KanbanMutationResult, KanbanProject, KanbanProjectSaveData, KanbanProjectUpdates } from "@/lib/types/blindados";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface ProjectEditorPopoverProps {
  project: KanbanProject;
  columns: KanbanColumn[];
  projects: KanbanProject[];
  palette: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (projectId: string, updates: KanbanProjectUpdates) => Promise<KanbanMutationResult<KanbanProjectSaveData>>;
}

export function ProjectEditorPopover({
  project,
  columns,
  projects,
  palette,
  open,
  onOpenChange,
  onSave,
}: ProjectEditorPopoverProps) {
  const [name, setName] = useState(project.name);
  const [color, setColor] = useState(project.color);
  const [selectedColumnIds, setSelectedColumnIds] = useState<Set<string>>(() => new Set());
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const wasOpenRef = useRef(false);
  const openingDataRef = useRef({ projectName: project.name, projectColor: project.color, projectId: project.id, columns });
  openingDataRef.current = { projectName: project.name, projectColor: project.color, projectId: project.id, columns };

  useEffect(() => {
    if (!open) {
      wasOpenRef.current = false;
      return;
    }
    if (wasOpenRef.current) return;
    wasOpenRef.current = true;
    const openingData = openingDataRef.current;
    setName(openingData.projectName);
    setColor(openingData.projectColor);
    setSelectedColumnIds(new Set(openingData.columns
      .filter((column) => column.projectId === openingData.projectId)
      .map((column) => column.id)));
    setError(null);
    requestAnimationFrame(() => nameInputRef.current?.focus());
  }, [open]);

  const toggleColumn = (columnId: string) => {
    setSelectedColumnIds((current) => {
      const next = new Set(current);
      if (next.has(columnId)) next.delete(columnId);
      else next.add(columnId);
      return next;
    });
    setError(null);
  };

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSaving) return;

    const cleanName = name.trim();
    if (!cleanName || cleanName.length > 80) {
      setError("Informe um nome com até 80 caracteres.");
      return;
    }

    const updates: KanbanProjectUpdates = {
      expected: {},
      columnChanges: columns.flatMap((column) => {
        const wasBound = column.projectId === project.id;
        const shouldBeBound = selectedColumnIds.has(column.id);
        if (wasBound === shouldBeBound) return [];
        return [{
          columnId: column.id,
          expectedProjectId: column.projectId ?? null,
          projectId: shouldBeBound ? project.id : null,
        }];
      }),
    };
    if (cleanName !== project.name) {
      updates.name = cleanName;
      updates.expected.name = project.name;
    }
    if (color !== project.color) {
      updates.color = color;
      updates.expected.color = project.color;
    }

    if (!updates.name && !updates.color && updates.columnChanges.length === 0) {
      onOpenChange(false);
      return;
    }

    const transfers = updates.columnChanges
      .filter((change) => change.projectId === project.id && change.expectedProjectId !== null)
      .map((change) => columns.find((column) => column.id === change.columnId)?.title)
      .filter((title): title is string => Boolean(title));
    if (transfers.length > 0) {
      const confirmed = window.confirm(
        `Transferir ${transfers.length === 1 ? `a coluna “${transfers[0]}”` : `${transfers.length} colunas`} e todas as tarefas para “${cleanName}”?`,
      );
      if (!confirmed) return;
    }

    setIsSaving(true);
    setError(null);
    try {
      const result = await onSave(project.id, updates);
      if (!result.success) {
        setError(result.error || "Não foi possível salvar o projeto.");
        return;
      }
      onOpenChange(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Não foi possível salvar o projeto.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={(nextOpen) => {
      if (!isSaving) onOpenChange(nextOpen);
    }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Editar projeto ${project.name}`}
          aria-haspopup="dialog"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white/45 transition-colors hover:bg-[#00f6ff]/10 hover:text-[#00f6ff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00f6ff]"
        >
          <Pencil className="h-4 w-4" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        data-project-editor-portal=""
        role="dialog"
        aria-label={`Editar projeto ${project.name}`}
        side="right"
        align="start"
        sideOffset={8}
        collisionPadding={12}
        onEscapeKeyDown={(event) => {
          event.stopPropagation();
          onOpenChange(false);
        }}
        onInteractOutside={(event) => {
          const target = event.target;
          if (target instanceof Element && target.closest("[data-project-editor-portal]")) {
            event.preventDefault();
          }
        }}
        className="!z-[10001] max-h-[min(42rem,calc(100dvh-1.5rem))] w-[min(22rem,calc(100vw-1.5rem))] overflow-y-auto rounded-2xl border border-[#00f6ff]/20 bg-[#0a0f1f] p-4 text-white shadow-2xl sm:p-5"
      >
        <form onSubmit={(event) => void handleSave(event)} className="space-y-4">
          <header>
            <h2 className="text-base font-semibold">Editar projeto</h2>
            <p className="mt-1 text-xs leading-relaxed text-white/45">Atualize o nome, a cor e as colunas vinculadas.</p>
          </header>

          {error && <p role="alert" className="rounded-lg border border-red-300/25 bg-red-400/10 px-3 py-2 text-xs text-red-200">{error}</p>}

          <div>
            <label htmlFor={`project-name-${project.id}`} className="mb-1.5 block text-xs font-medium text-white/60">Nome</label>
            <input
              ref={nameInputRef}
              id={`project-name-${project.id}`}
              value={name}
              maxLength={80}
              disabled={isSaving}
              onChange={(event) => { setName(event.target.value); setError(null); }}
              className="min-h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-[#00f6ff]/50 focus:ring-2 focus:ring-[#00f6ff]/20"
            />
          </div>

          <fieldset>
            <legend className="mb-2 text-xs font-medium text-white/60">Cor do projeto</legend>
            <div className="flex flex-wrap gap-2">
              {palette.map((swatch, index) => (
                <button
                  key={swatch}
                  type="button"
                  aria-label={`Cor ${index + 1}: ${swatch}`}
                  aria-pressed={color === swatch}
                  disabled={isSaving}
                  onClick={() => { setColor(swatch); setError(null); }}
                  className={`h-7 w-7 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0f1f] ${color === swatch ? "ring-2 ring-white ring-offset-2 ring-offset-[#0a0f1f]" : ""}`}
                  style={{ backgroundColor: swatch }}
                />
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="mb-1.5 text-xs font-medium text-white/60">Colunas deste projeto</legend>
            <p className="mb-2 text-[11px] leading-relaxed text-white/40">Desvincular uma coluna também limpa o vínculo das tarefas, sem apagá-las.</p>
            <div className="max-h-48 space-y-1 overflow-y-auto rounded-xl border border-white/8 bg-black/10 p-1.5">
              {columns.length ? columns.map((column) => {
                const currentProject = projects.find((item) => item.id === column.projectId);
                const checked = selectedColumnIds.has(column.id);
                return (
                  <label key={column.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 hover:bg-white/5">
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={isSaving}
                      onChange={() => toggleColumn(column.id)}
                      className="h-4 w-4 accent-[#00f6ff]"
                    />
                    <span className="min-w-0 flex-1 truncate text-xs text-white/85">{column.title}</span>
                    <span className="shrink-0 text-[10px] text-white/35">
                      {column.projectId === project.id ? "Este projeto" : currentProject?.name ?? "Sem projeto"}
                    </span>
                    {checked && <Check className="h-3.5 w-3.5 shrink-0 text-[#00f6ff]" aria-label="Selecionada" />}
                  </label>
                );
              }) : <p className="px-2.5 py-3 text-xs text-white/35">Nenhuma coluna disponível.</p>}
            </div>
          </fieldset>

          <div className="flex gap-2 pt-1">
            <button type="button" disabled={isSaving} onClick={() => onOpenChange(false)} className="min-h-10 flex-1 rounded-lg border border-white/10 px-3 text-xs text-white/65 hover:bg-white/5 disabled:opacity-50">
              Cancelar
            </button>
            <button type="submit" disabled={isSaving} className="flex min-h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-[#00f6ff] px-3 text-xs font-semibold text-[#061019] hover:bg-[#72faff] disabled:cursor-wait disabled:opacity-60">
              {isSaving && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
              {isSaving ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}