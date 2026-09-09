"use client";

import { KanbanBoard } from "@/components/blindados/KanbanBoard";
import {
  ColumnBehavior,
  KanbanCard,
  KanbanColumn,
  KanbanMutationResult,
  KanbanProject,
} from "@/lib/types/blindados";

interface KanbanWorkspaceProps {
  columns: KanbanColumn[];
  onColumnsChange: (columns: KanbanColumn[]) => void;
  onUpdateColumn: (columnId: string, updates: { title?: string; behavior?: ColumnBehavior }) => void;
  onAddColumn: (title: string, behavior?: ColumnBehavior, projectId?: string | null) => Promise<boolean> | void;
  onDeleteColumn: (columnId: string) => void;
  onAddCard: (columnId: string, card: Omit<KanbanCard, "id" | "createdAt" | "updatedAt">) => void;
  onUpdateCard: (columnId: string, cardId: string, updates: Partial<KanbanCard>) => void;
  onDeleteCard: (columnId: string, cardId: string) => void;
  onMoveCard: (
    cardId: string,
    sourceColumnId: string,
    targetColumnId: string,
    targetIndex: number,
    previousColumns?: KanbanColumn[],
  ) => void;
  onUpdateCardPositions: (columnId: string, cards: KanbanCard[], previousColumns?: KanbanColumn[]) => void;
  isLoaded: boolean;
  projects: KanbanProject[];
  selectedProjectId: string | null;
  onSelectProject: (projectId: string | null) => void;
  onAddProject: (name: string, color: string) => Promise<KanbanMutationResult<KanbanProject>>;
  selectedDate: Date | null;
  onSelectDate: (date: Date | null) => void;
  loadError: boolean;
  isSyncing: boolean;
  onRetry: () => void;
  className?: string;
}

/**
 * The single visual/data contract for the Kanban entry points.
 * MainApp owns selection and data; this component only composes the shared board.
 */
export function KanbanWorkspace({
  columns,
  onColumnsChange,
  onUpdateColumn,
  onAddColumn,
  onDeleteColumn,
  onAddCard,
  onUpdateCard,
  onDeleteCard,
  onMoveCard,
  onUpdateCardPositions,
  isLoaded,
  projects,
  selectedProjectId,
  onSelectProject,
  onAddProject,
  selectedDate,
  onSelectDate,
  loadError,
  isSyncing,
  onRetry,
  className = "",
}: KanbanWorkspaceProps) {
  return (
    <div className={`flex min-h-0 h-full w-full min-w-0 flex-col ${className}`}>
      {loadError && (
        <div className="mb-3 flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">
          <span>Não foi possível atualizar os projetos e cards.</span>
          <button
            type="button"
            onClick={onRetry}
            disabled={isSyncing}
            className="min-h-11 rounded-lg border border-red-300/30 px-3 py-1.5 font-medium transition-colors hover:bg-red-300/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-200 disabled:cursor-wait disabled:opacity-50"
          >
            {isSyncing ? "Tentando..." : "Tentar novamente"}
          </button>
        </div>
      )}
      <KanbanBoard
        columns={columns}
        onColumnsChange={onColumnsChange}
        onUpdateColumn={onUpdateColumn}
        onAddColumn={onAddColumn}
        onDeleteColumn={onDeleteColumn}
        onAddCard={onAddCard}
        onUpdateCard={onUpdateCard}
        onDeleteCard={onDeleteCard}
        onMoveCard={onMoveCard}
        onUpdateCardPositions={onUpdateCardPositions}
        isLoaded={isLoaded}
        projects={projects}
        selectedProjectId={selectedProjectId}
        onSelectProject={onSelectProject}
        onAddProject={onAddProject}
        selectedDate={selectedDate}
        onSelectDate={onSelectDate}
      />
    </div>
  );
}