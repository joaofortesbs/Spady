"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
  DragOverEvent,
  DragCancelEvent,
  TouchSensor,
  useDroppable,
  closestCenter,
  pointerWithin,
  rectIntersection,
  getFirstCollision,
  CollisionDetection,
  UniqueIdentifier,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  horizontalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Plus, MoreVertical, GripVertical, Trash2, X, Check, Pencil, Move, FolderKanban, Calendar, ChevronDown, Settings2, CheckCircle2, RotateCcw, ListOrdered, Loader2, Palette } from 'lucide-react';
import { KanbanColumn, KanbanCard, Priority, SubTask, KanbanProject, KanbanMutationResult, ColumnBehavior, KanbanColumnUpdates, KanbanProjectSaveData, KanbanProjectUpdates } from '@/lib/types/blindados';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent, DropdownMenuPortal } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ColumnEditorDialog, ColumnEditorMode } from '@/components/blindados/ColumnEditorDialog';
import { ProjectEditorPopover } from '@/components/blindados/ProjectEditorPopover';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import {
  getCardSurfaceStyle,
  getColumnEditorSubmenuSideOffset,
  hasMeaningfulCardDragPreview,
  insertVisibleCard,
  isHiddenCompletedCard,
  mergeKanbanStructure,
  reorderVisibleCardSlots,
  resolveCardDropTargetColumnId,
  resolveDragEndOverId,
  useLocalDayClock,
} from './kanbanBoard.helpers';

interface KanbanBoardProps {
  columns: KanbanColumn[];
  onColumnsChange: (columns: KanbanColumn[]) => void;
  onUpdateColumn: (columnId: string, updates: KanbanColumnUpdates) => Promise<boolean> | boolean | void;
  onAddColumn: (title: string, behavior?: ColumnBehavior, projectId?: string | null) => Promise<boolean> | void;
  onDeleteColumn: (columnId: string) => void;
  onAddCard: (columnId: string, card: Omit<KanbanCard, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onUpdateCard: (
    columnId: string,
    cardId: string,
    updates: Partial<KanbanCard>,
  ) => boolean | void | Promise<boolean | void>;
  onDeleteCard: (columnId: string, cardId: string) => void;
  onMoveCard: (
    cardId: string,
    sourceColumnId: string,
    targetColumnId: string,
    targetIndex: number,
    previousColumns?: KanbanColumn[],
  ) => void;
  onUpdateCardPositions: (columnId: string, cards: KanbanCard[], previousColumns?: KanbanColumn[]) => void;
  isLoaded?: boolean;
  projects?: KanbanProject[];
  onAddProject?: (name: string, color: string) => Promise<KanbanMutationResult<KanbanProject>>;
  onUpdateProject?: (projectId: string, updates: KanbanProjectUpdates) => Promise<KanbanMutationResult<KanbanProjectSaveData>>;
  onDeleteProject?: (projectId: string) => void;
  selectedProjectId?: string | null;
  onSelectProject?: (projectId: string | null) => void;
  selectedDate?: Date | null;
  onSelectDate?: (date: Date | null) => void;
}

const PROJECT_COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#84cc16', '#22c55e',
  '#14b8a6', '#06b6d4', '#0ea5e9', '#6366f1', '#a855f7',
  '#ec4899', '#f43f5e',
];

const priorityColors: Record<Priority, { bg: string; text: string; label: string }> = {
  alta: { bg: 'bg-red-500/20', text: 'text-red-400', label: 'PRIORIDADE ALTA' },
  media: { bg: 'bg-amber-500/20', text: 'text-amber-400', label: 'PRIORIDADE MÉDIA' },
  baixa: { bg: 'bg-green-500/20', text: 'text-green-400', label: 'PRIORIDADE BAIXA' },
};

function isNestedInteractiveTarget(target: EventTarget, currentTarget: HTMLElement): boolean {
  if (!(target instanceof Element)) return false;
  const interactiveTarget = target.closest(
    'button, a, input, select, textarea, [role="button"], [role="menuitem"], [contenteditable="true"], [data-no-dnd]',
  );
  return Boolean(interactiveTarget && interactiveTarget !== currentTarget);
}

function ColumnMenu({ 
  column, 
  onEdit,
  onDelete, 
  onChangeBehavior 
}: { 
  column: KanbanColumn;
  onEdit: (mode: ColumnEditorMode) => void;
  onDelete: () => void;
  onChangeBehavior: (behavior: ColumnBehavior) => void;
}) {
  const [submenuSideOffset, setSubmenuSideOffset] = useState(56);

  useEffect(() => {
    const updateViewport = () => setSubmenuSideOffset(getColumnEditorSubmenuSideOffset(window.innerWidth));
    updateViewport();
    window.addEventListener('resize', updateViewport);
    return () => window.removeEventListener('resize', updateViewport);
  }, []);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Abrir ações da coluna ${column.title}`}
          className="rounded p-1 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00f6ff] transition-colors"
        >
          <MoreVertical className="w-4 h-4 text-white/40" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        collisionPadding={12}
        className="!z-[9999] w-64 overflow-hidden rounded-xl border border-[#00f6ff]/20 bg-[#0a0f1f] p-0 text-white shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-white/5 px-4 py-2">
          <DropdownMenuLabel className="p-0 text-xs font-normal text-white/40">Comportamento da coluna</DropdownMenuLabel>
          <div className="flex items-center gap-1">
            <DropdownMenuSub>
              <DropdownMenuSubTrigger
                aria-label={`Editar coluna ${column.title}`}
                className="h-7 w-7 justify-center rounded-md p-0 text-white/50 focus:bg-[#00f6ff]/10 focus:text-[#00f6ff] data-[state=open]:bg-[#00f6ff]/10 data-[state=open]:text-[#00f6ff] [&>svg:last-child]:hidden"
              >
                <Pencil className="h-4 w-4" aria-hidden="true" />
                <span className="sr-only">Editar coluna</span>
              </DropdownMenuSubTrigger>
              <DropdownMenuPortal>
                <DropdownMenuSubContent
                  // The anchor is the pencil, not the whole menu. Account for
                  // the trash icon, gap and right padding so neither is covered.
                  sideOffset={submenuSideOffset}
                  collisionPadding={12}
                  className="!z-[10000] w-52 rounded-xl border border-[#00f6ff]/20 bg-[#0a0f1f] p-1 text-white shadow-xl"
                  style={{ maxWidth: 'min(13rem, var(--radix-dropdown-menu-content-available-width))' }}
                >
                  <DropdownMenuItem onSelect={() => onEdit('project')} className="gap-3 rounded-lg px-3 py-2.5 text-sm focus:bg-[#00f6ff]/10 focus:text-[#00f6ff]">
                    <FolderKanban className="h-4 w-4" aria-hidden="true" /> Alterar projeto
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => onEdit('rename')} className="gap-3 rounded-lg px-3 py-2.5 text-sm focus:bg-[#00f6ff]/10 focus:text-[#00f6ff]">
                    <Pencil className="h-4 w-4" aria-hidden="true" /> Renomear coluna
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => onEdit('color')} className="gap-3 rounded-lg px-3 py-2.5 text-sm focus:bg-[#00f6ff]/10 focus:text-[#00f6ff]">
                    <Palette className="h-4 w-4" aria-hidden="true" /> Cor da coluna
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuPortal>
            </DropdownMenuSub>
            <DropdownMenuItem
              onSelect={onDelete}
              aria-label={`Excluir coluna ${column.title}`}
              className="h-7 w-7 justify-center rounded-md p-0 text-white/50 transition-colors focus:bg-[#00f6ff]/10 focus:text-[#00f6ff]"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              <span className="sr-only">Excluir coluna</span>
            </DropdownMenuItem>
          </div>
        </div>
        <DropdownMenuItem
          onSelect={() => onChangeBehavior('active')}
          className={`h-auto w-full items-start gap-3 rounded-none px-4 py-3 text-sm focus:bg-[#00f6ff]/10 focus:text-[#00f6ff] ${
            column.behavior === 'active' ? 'bg-[#00f6ff]/10 text-[#00f6ff]' : 'text-white'
          }`}
        >
          <RotateCcw className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 text-left">
            <span className="block">Ativada</span>
            <span className="mt-0.5 block text-[10px] text-white/40">Tarefas continuam no dia seguinte</span>
          </span>
          {column.behavior === 'active' && <Check className="ml-auto mt-0.5 h-4 w-4 shrink-0" aria-label="Selecionada" />}
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => onChangeBehavior('completion')}
          className={`h-auto w-full items-start gap-3 rounded-none px-4 py-3 text-sm focus:bg-green-500/10 focus:text-green-400 ${
            column.behavior === 'completion' ? 'bg-green-500/10 text-green-400' : 'text-white'
          }`}
        >
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 text-left">
            <span className="block">Conclusão</span>
            <span className="mt-0.5 block text-[10px] text-white/40">Somente tarefas marcadas somem no dia seguinte</span>
          </span>
          {column.behavior === 'completion' && <Check className="ml-auto mt-0.5 h-4 w-4 shrink-0" aria-label="Selecionada" />}
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => onChangeBehavior('progressive')}
          className={`h-auto w-full items-start gap-3 rounded-none px-4 py-3 text-sm focus:bg-violet-500/10 focus:text-violet-300 ${
            column.behavior === 'progressive' ? 'bg-violet-500/10 text-violet-300' : 'text-white'
          }`}
        >
          <ListOrdered className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 text-left">
            <span className="block">Progressivo</span>
            <span className="mt-0.5 block text-[10px] text-white/40">Cards numerados na ordem de execução</span>
          </span>
          {column.behavior === 'progressive' && <Check className="ml-auto mt-0.5 h-4 w-4 shrink-0" aria-label="Selecionada" />}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function DroppableColumn({ 
  column, 
  children,
  isOver 
}: { 
  column: KanbanColumn; 
  children: React.ReactNode;
  isOver: boolean;
}) {
  const { setNodeRef } = useDroppable({
    id: column.id,
    data: { type: 'column', columnId: column.id }
  });

  return (
    <div
      ref={setNodeRef}
      className={`flex-1 overflow-y-auto space-y-2 min-h-[100px] p-1 rounded-lg transition-colors duration-200 ${
        isOver ? 'bg-[#00f6ff]/5 ring-2 ring-[#00f6ff]/30 ring-inset' : ''
      }`}
    >
      {children}
    </div>
  );
}

function SortableColumn({
  column,
  children,
  onEdit,
  onDelete,
  onChangeBehavior,
  isDraggingColumn,
  filteredCardCount,
  reducedMotion,
}: {
  column: KanbanColumn;
  children: React.ReactNode;
  onEdit: (mode: ColumnEditorMode) => void;
  onDelete: () => void;
  onChangeBehavior: (behavior: ColumnBehavior) => void;
  isDraggingColumn: boolean;
  filteredCardCount?: number;
  reducedMotion: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: `column-${column.id}`,
    data: { type: 'sortable-column', column },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: reducedMotion ? 'transform 0ms linear' : transition || 'transform 200ms ease',
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={{ ...style, transition: transition || 'transform 200ms ease' }}
    >
      <div
        className={`flex-shrink-0 w-72 rounded-xl border border-white/5 p-3 flex flex-col max-h-full transition-shadow duration-200 ${
          isDragging ? 'shadow-xl shadow-[#00f6ff]/20 border-[#00f6ff]/30' : ''
        }`}
        style={{ backgroundColor: column.backgroundColor ? `color-mix(in srgb, ${column.backgroundColor} 18%, #010516)` : 'rgb(1 5 22 / 50%)' }}
      >
        <div className="flex items-center justify-between mb-3">
          <div
            {...attributes}
            {...listeners}
            className="flex items-center gap-2 rounded p-1 cursor-grab active:cursor-grabbing hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00f6ff]"
            aria-label={`Arrastar coluna ${column.title}`}
          >
            <GripVertical className="w-4 h-4 text-white/30" aria-hidden="true" />
            <h3 className="text-xs font-semibold text-white/60 tracking-wider">{column.title}</h3>
            <div
              className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-white/5 border border-white/10"
              title={column.behavior === 'completion'
                ? 'Somente tarefas marcadas somem no dia seguinte'
                : column.behavior === 'progressive'
                  ? 'Cards numerados na ordem de execução'
                  : 'Tarefas continuam no dia seguinte'}
            >
              {column.behavior === 'completion'
                ? <CheckCircle2 className="w-3 h-3 text-white/60" />
                : column.behavior === 'progressive'
                  ? <ListOrdered className="w-3 h-3 text-white/60" />
                  : <RotateCcw className="w-3 h-3 text-white/60" />}
            </div>
          </div>
          <div className="flex items-center gap-1 relative">
            <span className="text-xs text-white/30">{filteredCardCount !== undefined ? filteredCardCount : column.cards.length}</span>
            <ColumnMenu
              column={column}
              onEdit={onEdit}
              onDelete={onDelete}
              onChangeBehavior={onChangeBehavior}
            />
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

function SortableCard({ 
  card, 
  columnId, 
  columnColor,
  isCompletionColumn,
  ordinal,
  ordinalTotal,
  onEdit, 
  isDraggingAny,
  isCompletionBusy,
  onToggleCompletion,
  suppressClickRef,
  clearClickSuppression,
  reducedMotion,
}: { 
  card: KanbanCard; 
  columnId: string; 
  columnColor?: string | null;
  isCompletionColumn: boolean;
  ordinal?: number;
  ordinalTotal?: number;
  onEdit: () => void; 
  isDraggingAny: boolean;
  isCompletionBusy: boolean;
  onToggleCompletion: () => void;
  suppressClickRef: React.MutableRefObject<boolean>;
  clearClickSuppression: () => void;
  reducedMotion: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ 
    id: card.id, 
    data: { type: 'card', columnId, card } 
  });

  const dragStyle = {
    transform: CSS.Transform.toString(transform),
    transition: reducedMotion ? 'transform 0ms linear' : transition || 'transform 200ms ease',
  };

  const completedSubtasks = card.subtasks.filter(s => s.completed).length;
  const surfaceStyle = getCardSurfaceStyle(columnColor);
  const positionLabel = ordinal
    ? `Arrastar ${card.title}, posição ${ordinal} de ${ordinalTotal ?? ordinal}`
    : `Arrastar ${card.title}`;

  return (
    <div
      ref={setNodeRef}
      style={{ ...dragStyle, opacity: isDragging ? 0 : 1, zIndex: isDragging ? 1000 : 1 }}
      {...attributes}
      {...listeners}
      aria-label={`${positionLabel}. Pressione Enter para editar.`}
      onMouseDownCapture={clearClickSuppression}
      onTouchStartCapture={clearClickSuppression}
      onMouseDown={(event) => {
        clearClickSuppression();
        if (isNestedInteractiveTarget(event.target, event.currentTarget)) {
          event.stopPropagation();
          return;
        }
        listeners?.onMouseDown?.(event);
      }}
      onKeyDown={(event) => {
        if (isNestedInteractiveTarget(event.target, event.currentTarget)) {
          event.stopPropagation();
          return;
        }
        listeners?.onKeyDown?.(event);
        if (event.defaultPrevented) return;
        if (event.key === 'Enter' && !isDraggingAny) {
          event.preventDefault();
          onEdit();
        }
      }}
      className="select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00f6ff] rounded-xl"
    >
      <motion.div
      initial={reducedMotion ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: isDragging ? 0 : 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: reducedMotion ? 0 : 0.2, ease: 'easeOut' }}
      onClick={(event) => {
        if (suppressClickRef.current && event.detail > 0) {
          clearClickSuppression();
          return;
        }
        if (!isDraggingAny) onEdit();
      }}
      style={{
        backgroundColor: surfaceStyle.backgroundColor,
        borderColor: isDragging ? 'rgba(0, 246, 255, 0.5)' : surfaceStyle.borderColor,
      }}
      className={`rounded-xl border p-3 group cursor-grab active:cursor-grabbing transition-[border-color,box-shadow] duration-200 ${
        isDragging ? 'shadow-lg shadow-[#00f6ff]/10' : 'hover:border-[#00f6ff]/30'
      }`}
      >
      <div className="flex items-start gap-2 mb-2">
        {isCompletionColumn && (
          <button
            type="button"
            aria-label={`${card.completedAt ? 'Desmarcar' : 'Marcar'} ${card.title} ${card.completedAt ? 'como pendente' : 'como concluída'}`}
            aria-pressed={Boolean(card.completedAt)}
            disabled={isCompletionBusy}
            onMouseDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            onTouchStart={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key === ' ' || event.key === 'Enter') event.stopPropagation();
            }}
            onClick={(event) => {
              event.stopPropagation();
              onToggleCompletion();
            }}
            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00f6ff] disabled:cursor-wait disabled:opacity-60 ${
              card.completedAt
                ? 'border-white/30 bg-white/15 text-white'
                : 'border-white/20 bg-white/5 text-white/40 hover:border-white/40'
            }`}
          >
            {isCompletionBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> :
              card.completedAt ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : null}
          </button>
        )}
        {ordinal !== undefined && (
          <span
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-white/15 bg-white/5 text-xs font-semibold tabular-nums text-white/70"
            aria-label={`Posição ${ordinal} de ${ordinalTotal ?? ordinal}`}
          >
            {ordinal}
          </span>
        )}
        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${priorityColors[card.priority].bg} ${priorityColors[card.priority].text}`}>
          {priorityColors[card.priority].label}
        </span>
        <span className="ml-auto rounded p-1 text-white/40" aria-hidden="true">
          <GripVertical className="w-3 h-3" />
        </span>
      </div>

      <p className="text-sm text-white mb-2 pointer-events-none">{card.title}</p>

      {card.subtasks.length > 0 && (
        <div className="flex items-center gap-1.5 text-white/40 text-xs pointer-events-none">
          <span>☰</span>
          <span>{completedSubtasks}/{card.subtasks.length}</span>
        </div>
      )}

      {card.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2 pointer-events-none">
          {card.tags.map((tag, index) => (
            <span 
              key={index}
              className="px-2 py-0.5 rounded-full text-[10px] bg-[#00f6ff]/10 text-[#00f6ff]"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
      </motion.div>
    </div>
  );
}

function CardOverlay({
  card,
  columnColor,
  isCompletionColumn,
  ordinal,
  ordinalTotal,
  reducedMotion,
}: { card: KanbanCard; columnColor?: string | null; isCompletionColumn: boolean; ordinal?: number; ordinalTotal?: number; reducedMotion: boolean }) {
  const surfaceStyle = getCardSurfaceStyle(columnColor);
  return (
    <motion.div 
      initial={reducedMotion ? false : { opacity: 0.96 }}
      animate={{ opacity: 1 }}
      transition={{ duration: reducedMotion ? 0 : 0.2 }}
      style={{ backgroundColor: surfaceStyle.backgroundColor, borderColor: surfaceStyle.borderColor }}
      className="rounded-xl border p-3 shadow-xl shadow-[#00f6ff]/15 cursor-grabbing w-[280px]"
    >
      <div className="flex items-start gap-2 mb-2">
        {isCompletionColumn && (
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-white/20 bg-white/10 text-white/80" aria-hidden="true">
            {card.completedAt && <Check className="h-3.5 w-3.5" />}
          </span>
        )}
        {ordinal !== undefined && (
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-white/15 bg-white/5 text-xs font-semibold tabular-nums text-white/70">
            {ordinal}
          </span>
        )}
        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${priorityColors[card.priority].bg} ${priorityColors[card.priority].text}`}>
          {priorityColors[card.priority].label}
        </span>
      </div>
      <p className="text-sm text-white">{card.title}</p>
    </motion.div>
  );
}

function ColumnOverlay({ column }: { column: KanbanColumn }) {
  const surfaceStyle = getCardSurfaceStyle(column.backgroundColor);
  return (
    <motion.div
      initial={false}
      animate={{ opacity: 1 }}
      className="w-72 rounded-xl border p-3 shadow-xl shadow-[#00f6ff]/15 cursor-grabbing"
      style={{ backgroundColor: column.backgroundColor ? `color-mix(in srgb, ${column.backgroundColor} 22%, #010516)` : 'rgb(1 5 22 / 90%)' }}
      >
      <div className="rounded-xl border p-3" style={{ backgroundColor: surfaceStyle.backgroundColor, borderColor: surfaceStyle.borderColor }}>
      <div className="flex items-center gap-2 mb-3">
        <GripVertical className="w-4 h-4 text-[#00f6ff]" />
        <h3 className="text-xs font-semibold text-white tracking-wider">{column.title}</h3>
        <span className="text-xs text-white/50 ml-auto">{column.cards.length}</span>
      </div>
      <div className="space-y-2 opacity-60">
        {column.cards.slice(0, 2).map(card => (
          <div key={card.id} className="rounded-lg p-2 border" style={{ backgroundColor: getCardSurfaceStyle(column.backgroundColor).backgroundColor, borderColor: getCardSurfaceStyle(column.backgroundColor).borderColor }}>
            <p className="text-xs text-white/60 truncate">{card.title}</p>
          </div>
        ))}
        {column.cards.length > 2 && (
          <p className="text-xs text-white/40 text-center">+{column.cards.length - 2} mais</p>
        )}
      </div>
      </div>
    </motion.div>
  );
}

export function KanbanBoard({
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
  isLoaded = true,
  projects = [],
  onAddProject,
  onUpdateProject,
  onDeleteProject,
  selectedProjectId = null,
  onSelectProject,
  selectedDate = null,
  onSelectDate,
}: KanbanBoardProps) {
  const hasTemporaryColumns = columns.some(c => c.id.startsWith('temp-'));
  const canDrag = isLoaded && !hasTemporaryColumns;
  const [activeCard, setActiveCard] = useState<KanbanCard | null>(null);
  const [dragPreviewColumns, setDragPreviewColumns] = useState<KanbanColumn[] | null>(null);
  const [activeColumn, setActiveColumn] = useState<KanbanColumn | null>(null);
  const [activeColumnId, setActiveColumnId] = useState<string | null>(null);
  const activeCardRef = useRef<KanbanCard | null>(null);
  const activeColumnRef = useRef<KanbanColumn | null>(null);
  const activeColumnIdRef = useRef<string | null>(null);
  const [overColumnId, setOverColumnId] = useState<string | null>(null);
  const [showAddColumn, setShowAddColumn] = useState(false);
  const [newColumnTitle, setNewColumnTitle] = useState('');
  const [newColumnBehavior, setNewColumnBehavior] = useState<ColumnBehavior>('active');
  const [isAddingColumn, setIsAddingColumn] = useState(false);
  const [editingCard, setEditingCard] = useState<{ card: KanbanCard; columnId: string } | null>(null);
  const [addingCardToColumn, setAddingCardToColumn] = useState<string | null>(null);
  const [newCardTitle, setNewCardTitle] = useState('');
  const [newCardPriority, setNewCardPriority] = useState<Priority>('media');
  const [newCardDueDate, setNewCardDueDate] = useState<string>('');
  const [columnEditor, setColumnEditor] = useState<{ column: KanbanColumn; mode: ColumnEditorMode } | null>(null);
  const [completionBusyIds, setCompletionBusyIds] = useState<Set<string>>(() => new Set());
  const [reducedMotion, setReducedMotion] = useState(false);
  const today = useLocalDayClock();
  const dragPreviewRef = useRef<KanbanColumn[] | null>(null);
  const suppressCardClickRef = useRef(false);
  const suppressClickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragActivationInputRef = useRef<'mouse' | 'touch' | 'keyboard' | null>(null);
  const clearClickSuppression = useCallback(() => {
    if (suppressClickTimerRef.current) clearTimeout(suppressClickTimerRef.current);
    suppressClickTimerRef.current = null;
    suppressCardClickRef.current = false;
  }, []);
  const armClickSuppression = useCallback((duration: number) => {
    clearClickSuppression();
    suppressCardClickRef.current = true;
    suppressClickTimerRef.current = setTimeout(clearClickSuppression, duration);
  }, [clearClickSuppression]);
  const effectiveColumns = dragPreviewColumns ?? columns;
  const visibleColumns = useMemo(
    () => selectedProjectId
      ? effectiveColumns.filter((column) => column.projectId === selectedProjectId)
      : effectiveColumns,
    [effectiveColumns, selectedProjectId],
  );
  const lastOverIdRef = useRef<UniqueIdentifier | null>(null);
  const originalCardPositionRef = useRef<{ cardId: string; columnId: string; index: number } | null>(null);
  const dragColumnsSnapshotRef = useRef<KanbanColumn[] | null>(null);
  const activeCardOrdinalRef = useRef<{ ordinal?: number; total?: number } | null>(null);

  useEffect(() => () => clearClickSuppression(), [clearClickSuppression]);
  
  const [showProjectDropdown, setShowProjectDropdown] = useState(false);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [showAddProjectModal, setShowAddProjectModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectColor, setNewProjectColor] = useState(PROJECT_COLORS[0]);
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [projectCreationError, setProjectCreationError] = useState<string | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const projectDropdownRef = useRef<HTMLDivElement>(null);
  const datePickerRef = useRef<HTMLDivElement>(null);
  const projectNameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const preference = typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)')
      : null;
    const restorePreference = () => {
      let savedPreference = false;
      try {
        savedPreference = window.localStorage.getItem('spady-reduced-motion') === 'true';
      } catch {
        // Storage can be unavailable in restricted browsing contexts.
      }
      setReducedMotion(savedPreference || Boolean(preference?.matches) || document.documentElement.dataset.reducedMotion === 'true');
    };
    restorePreference();
    preference?.addEventListener('change', restorePreference);
    window.addEventListener('storage', restorePreference);
    return () => {
      preference?.removeEventListener('change', restorePreference);
      window.removeEventListener('storage', restorePreference);
    };
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target;
      if (target instanceof Element && target.closest('[data-project-editor-portal]')) return;
      if (projectDropdownRef.current && !projectDropdownRef.current.contains(event.target as Node)) {
        setShowProjectDropdown(false);
        setEditingProjectId(null);
      }
      if (datePickerRef.current && !datePickerRef.current.contains(event.target as Node)) {
        setShowDatePicker(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (isLoaded && selectedProjectId && !projects.some(project => project.id === selectedProjectId)) {
      onSelectProject?.(null);
    }
  }, [isLoaded, onSelectProject, projects, selectedProjectId]);

  useEffect(() => {
    if (editingProjectId && (!showProjectDropdown || !projects.some((project) => project.id === editingProjectId))) {
      setEditingProjectId(null);
    }
  }, [editingProjectId, projects, showProjectDropdown]);

  useEffect(() => {
    if (!showProjectDropdown) return;
    const handleProjectEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || editingProjectId) return;
      setShowProjectDropdown(false);
    };
    document.addEventListener('keydown', handleProjectEscape);
    return () => document.removeEventListener('keydown', handleProjectEscape);
  }, [editingProjectId, showProjectDropdown]);

  useEffect(() => {
    if (!showDatePicker) return;
    const handleDateEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowDatePicker(false);
    };
    document.addEventListener('keydown', handleDateEscape);
    return () => document.removeEventListener('keydown', handleDateEscape);
  }, [showDatePicker]);

  const shouldShowCard = useCallback((card: KanbanCard, columnBehavior: ColumnBehavior) => {
    if (selectedDate) {
      const selectedDateStr = format(selectedDate, 'yyyy-MM-dd');
      
      if (columnBehavior === 'completion' && card.completedAt) {
        const completedDate = format(parseISO(card.completedAt), 'yyyy-MM-dd');
        if (completedDate < selectedDateStr) {
          return false;
        }
      }
      
      if (card.dueDate) {
        return card.dueDate <= selectedDateStr;
      }
      
      return true;
    }

    if (today && isHiddenCompletedCard(card, columnBehavior, today)) return false;
    return true;
  }, [selectedDate, today]);

  const getFilteredCards = useCallback((column: KanbanColumn) => {
    return column.cards.filter(card => shouldShowCard(card, column.behavior || 'active'));
  }, [shouldShowCard]);

  const handleAddProject = async () => {
    const name = newProjectName.trim();
    if (!name || !onAddProject || isCreatingProject) return;

    setProjectCreationError(null);
    setIsCreatingProject(true);

    try {
      const result = await onAddProject(name, newProjectColor);
      if (!result.success || !result.data) {
        setProjectCreationError(result.error || 'Não foi possível criar o projeto.');
        return;
      }

      // Select only the confirmed database ID, never the temporary optimistic ID.
      onSelectProject?.(result.data.id);
      setNewProjectName('');
      setNewProjectColor(PROJECT_COLORS[0]);
      setShowAddProjectModal(false);
    } catch (error) {
      setProjectCreationError(error instanceof Error ? error.message : 'Não foi possível criar o projeto.');
    } finally {
      setIsCreatingProject(false);
    }
  };

  const handleOpenAddProject = () => {
    setProjectCreationError(null);
    setShowProjectDropdown(false);
    setShowAddProjectModal(true);
  };

  const handleCloseAddProject = () => {
    if (isCreatingProject) return;
    setShowAddProjectModal(false);
    setNewProjectName('');
    setNewProjectColor(PROJECT_COLORS[0]);
    setProjectCreationError(null);
  };

  const selectedProject = projects.find(p => p.id === selectedProjectId);

  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: {
        distance: 6,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 225,
        tolerance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      keyboardCodes: {
        start: ['Space'],
        end: ['Space'],
        cancel: ['Escape'],
      },
    })
  );

  const collisionDetectionStrategy: CollisionDetection = useCallback((args) => {
    if (activeColumnRef.current) {
      const columnContainers = args.droppableContainers.filter(
        container => String(container.id).startsWith('column-')
      );
      const collisions = closestCenter({
        ...args,
        droppableContainers: columnContainers,
      });
      const overId = getFirstCollision(collisions, 'id');
      if (overId && overId !== args.active.id) lastOverIdRef.current = overId;
      return collisions;
    }

    const pointerCollisions = pointerWithin(args);
    
    if (pointerCollisions.length > 0) {
      let overId = getFirstCollision(pointerCollisions, 'id');
      
      if (overId) {
        const column = effectiveColumns.find(c => c.id === overId);
        if (column && getFilteredCards(column).length > 0) {
          const cardCollisions = rectIntersection({
            ...args,
            droppableContainers: args.droppableContainers.filter(
              container => container.id !== overId && 
              getFilteredCards(column).some(c => c.id === container.id)
            ),
          });
          
          if (cardCollisions.length > 0) {
            overId = cardCollisions[0].id;
          }
        }
        
        if (overId !== args.active.id) lastOverIdRef.current = overId;
        return [{ id: overId }];
      }
    }

    const rectCollisions = rectIntersection(args);
    if (rectCollisions.length > 0) {
      return rectCollisions;
    }

    if (lastOverIdRef.current) {
      return [{ id: lastOverIdRef.current }];
    }

    return [];
  }, [effectiveColumns, getFilteredCards]);

  const handleDragStart = (event: DragStartEvent) => {
    if (!canDrag) return;
    const { active } = event;
    const activeData = active.data.current;
    activeCardRef.current = null;
    activeColumnRef.current = null;
    activeColumnIdRef.current = null;
    dragActivationInputRef.current = event.activatorEvent.type === 'mousedown'
      ? 'mouse'
      : event.activatorEvent.type === 'touchstart'
        ? 'touch'
        : event.activatorEvent.type === 'keydown'
          ? 'keyboard'
          : null;
    lastOverIdRef.current = null;

    if (activeData?.type === 'card') {
      if (String(activeData.card.id).startsWith('temp-')) return;
      dragColumnsSnapshotRef.current = columns;
      dragPreviewRef.current = columns;
      setDragPreviewColumns(columns);
      setActiveCard(activeData.card);
      setActiveColumnId(activeData.columnId);
      const column = columns.find(c => c.id === activeData.columnId);
      const visibleCards = column ? getFilteredCards(column) : [];
      const cardIndex = visibleCards.findIndex(c => c.id === activeData.card.id);
      const globalIndex = column?.cards.findIndex(c => c.id === activeData.card.id) ?? -1;
      activeCardOrdinalRef.current = column?.behavior === 'progressive' && cardIndex >= 0
        ? { ordinal: cardIndex + 1, total: visibleCards.length }
        : null;
      originalCardPositionRef.current = {
        cardId: activeData.card.id,
        columnId: activeData.columnId,
        index: globalIndex,
      };
      activeCardRef.current = activeData.card;
      activeColumnIdRef.current = activeData.columnId;
    } else if (activeData?.type === 'sortable-column') {
      dragColumnsSnapshotRef.current = columns;
      dragPreviewRef.current = columns;
      setDragPreviewColumns(columns);
      const draggingColumn = { ...activeData.column, cards: getFilteredCards(activeData.column) };
      activeColumnRef.current = draggingColumn;
      setActiveColumn(draggingColumn);
    }
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;
    if (activeColumnRef.current) return;
    if (!activeCardRef.current) return;

    const activeData = active.data.current;
    const overData = over.data.current;
    if (activeData?.type !== 'card') return;

    const draft = dragPreviewRef.current ?? columns;
    const sourceColumnId = activeColumnIdRef.current ?? activeData.columnId;
    const fallbackColumnId = draft.find((column) => column.cards.some((card) => card.id === over.id))?.id
      ?? (over.id as string);
    const targetColumnId = resolveCardDropTargetColumnId({
      activeCardId: active.id as string,
      overId: over.id as string,
      overType: overData?.type,
      overColumnId: overData?.columnId,
      previewColumnId: activeColumnIdRef.current,
      fallbackColumnId,
    });

    setOverColumnId(targetColumnId);
    const sourceColumn = draft.find((column) => column.id === sourceColumnId);
    const targetColumn = draft.find((column) => column.id === targetColumnId);
    if (!sourceColumn || !targetColumn) return;
    const cardId = active.id as string;

    if (sourceColumnId === targetColumnId) {
      const visibleIds = getFilteredCards(sourceColumn).map((card) => card.id);
      const activeIndex = visibleIds.indexOf(cardId);
      const overIndex = overData?.type === 'card' ? visibleIds.indexOf(over.id as string) : visibleIds.length - 1;
      if (activeIndex < 0 || overIndex < 0 || activeIndex === overIndex) return;
      const orderedIds = arrayMove(visibleIds, activeIndex, overIndex);
      const nextColumns = draft.map((column) => column.id === sourceColumnId
        ? { ...column, cards: reorderVisibleCardSlots(column.cards, visibleIds, orderedIds) }
        : column);
      dragPreviewRef.current = nextColumns;
      setDragPreviewColumns(nextColumns);
      activeColumnIdRef.current = targetColumnId;
      return;
    }

    const activeCardData = sourceColumn.cards.find((card) => card.id === cardId);
    if (!activeCardData) return;
    const targetVisibleIds = getFilteredCards(targetColumn).map((card) => card.id);
    const overIndex = overData?.type === 'card'
      ? Math.max(0, targetVisibleIds.indexOf(over.id as string))
      : targetVisibleIds.length;
    const nextColumns = draft.map((column) => {
      if (column.id === sourceColumnId) {
        return { ...column, cards: column.cards.filter((card) => card.id !== cardId) };
      }
      if (column.id === targetColumnId) {
        return { ...column, cards: insertVisibleCard(column.cards, targetVisibleIds, activeCardData, overIndex) };
      }
      return column;
    });
    dragPreviewRef.current = nextColumns;
    setDragPreviewColumns(nextColumns);
    activeColumnIdRef.current = targetColumnId;
    setActiveColumnId(targetColumnId);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    const resolvedOverId = over
      ? resolveDragEndOverId(
          String(active.id),
          String(over.id),
          lastOverIdRef.current === null ? null : String(lastOverIdRef.current),
        )
      : null;
    const draggingCard = activeCardRef.current;
    const draggingColumn = activeColumnRef.current;
    const currentColumnId = activeColumnIdRef.current;
    const shouldSuppressPointerClick = draggingCard !== null
      && (dragActivationInputRef.current === 'mouse' || dragActivationInputRef.current === 'touch');
    const snapshot = dragColumnsSnapshotRef.current ?? columns;
    let finalDraft = dragPreviewRef.current ?? snapshot;

    if (draggingColumn && resolvedOverId !== null) {
      const activeId = active.id as string;
      const overId = resolvedOverId as string;
      const getColumnIndex = (id: string) => visibleColumns.findIndex((column) =>
        `column-${column.id}` === id || column.id === id);
      const oldIndex = getColumnIndex(activeId);
      const newIndex = getColumnIndex(overId);
      if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
        const reorderedVisible = arrayMove(visibleColumns, oldIndex, newIndex);
        let visibleIndex = 0;
        const visibleIds = new Set(visibleColumns.map((column) => column.id));
        finalDraft = effectiveColumns.map((column) => visibleIds.has(column.id)
          ? reorderedVisible[visibleIndex++]
          : column);
      }
      if (finalDraft !== snapshot) onColumnsChange(mergeKanbanStructure(columns, finalDraft));
    }

    if (draggingCard && originalCardPositionRef.current) {
      const original = originalCardPositionRef.current;
      const hasMeaningfulPreview = hasMeaningfulCardDragPreview(snapshot, finalDraft);
      if (over && currentColumnId && hasMeaningfulPreview) {
        const committed = mergeKanbanStructure(columns, finalDraft);
        const targetColumn = committed.find((column) => column.id === currentColumnId);
        if (original.columnId !== currentColumnId) {
          onColumnsChange(committed);
          const targetIndex = targetColumn?.cards.findIndex((card) => card.id === draggingCard.id) ?? 0;
          onMoveCard(draggingCard.id, original.columnId, currentColumnId, targetIndex, snapshot);
        } else if (targetColumn) {
          onColumnsChange(committed);
          onUpdateCardPositions(currentColumnId, targetColumn.cards, snapshot);
        }
      }
    }

    if (shouldSuppressPointerClick) armClickSuppression(350);
    else clearClickSuppression();
    dragActivationInputRef.current = null;
    activeCardRef.current = null;
    activeColumnRef.current = null;
    activeColumnIdRef.current = null;
    setActiveCard(null);
    setActiveColumn(null);
    setActiveColumnId(null);
    setOverColumnId(null);
    dragPreviewRef.current = null;
    setDragPreviewColumns(null);
    lastOverIdRef.current = null;
    originalCardPositionRef.current = null;
    dragColumnsSnapshotRef.current = null;
    activeCardOrdinalRef.current = null;
  };

  const handleDragCancel = (_event: DragCancelEvent) => {
    const shouldSuppressPointerClick = activeCardRef.current !== null
      && (dragActivationInputRef.current === 'mouse' || dragActivationInputRef.current === 'touch');
    if (shouldSuppressPointerClick) armClickSuppression(1000);
    else clearClickSuppression();
    dragActivationInputRef.current = null;
    activeCardRef.current = null;
    activeColumnRef.current = null;
    activeColumnIdRef.current = null;
    setActiveCard(null);
    setActiveColumn(null);
    setActiveColumnId(null);
    setOverColumnId(null);
    dragPreviewRef.current = null;
    setDragPreviewColumns(null);
    lastOverIdRef.current = null;
    originalCardPositionRef.current = null;
    dragColumnsSnapshotRef.current = null;
    activeCardOrdinalRef.current = null;
  };

  const handleToggleCompletion = async (columnId: string, card: KanbanCard) => {
    if (completionBusyIds.has(card.id)) return;
    const previousCompletedAt = card.completedAt ?? null;
    const completedAt = previousCompletedAt ? null : new Date().toISOString();
    setCompletionBusyIds((current) => new Set(current).add(card.id));
    try {
      const result = await onUpdateCard(columnId, card.id, { completedAt });
      if (result === false) return;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível atualizar a conclusão da tarefa.');
    } finally {
      setCompletionBusyIds((current) => {
        const next = new Set(current);
        next.delete(card.id);
        return next;
      });
    }
  };

  const handleAddColumn = async () => {
    const title = newColumnTitle.trim();
    if (!title || isAddingColumn) return;

    setIsAddingColumn(true);
    try {
      const result = await onAddColumn(title, newColumnBehavior, selectedProjectId);
      if (result === false) return;
      setNewColumnTitle('');
      setNewColumnBehavior('active');
      setShowAddColumn(false);
    } finally {
      setIsAddingColumn(false);
    }
  };

  const handleAddCard = (columnId: string) => {
    const title = newCardTitle.trim();
    if (!title) return;
    
    const priority = newCardPriority;
    const dueDate = newCardDueDate || undefined;
    const projectId = columns.find((column) => column.id === columnId)?.projectId ?? null;
    
    setNewCardTitle('');
    setNewCardPriority('media');
    setNewCardDueDate('');
    setAddingCardToColumn(null);
    
    onAddCard(columnId, {
      title,
      description: '',
      priority,
      tags: [],
      subtasks: [],
      dueDate,
      projectId,
    });
  };

  const columnIds = visibleColumns.map(c => `column-${c.id}`);

  return (
    <motion.div
      initial={reducedMotion ? false : { opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: reducedMotion ? 0 : 0.2, duration: reducedMotion ? 0 : 0.2 }}
      className="bg-[#0a0f1f] rounded-2xl border border-[#00f6ff]/10 p-4 sm:p-6 h-full w-full min-w-0 overflow-hidden"
    >
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <h2 className="mr-1 text-lg font-semibold text-white">Quadro de tarefas</h2>
          
          <div className="relative" ref={projectDropdownRef}>
            <button
              type="button"
              onClick={() => setShowProjectDropdown(!showProjectDropdown)}
              aria-expanded={showProjectDropdown}
              aria-controls="kanban-project-selector"
              className="min-h-11 max-w-[min(18rem,100%)] flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm transition-colors hover:border-[#00f6ff]/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00f6ff]"
            >
              {selectedProject ? (
                <>
                  <div 
                    className="w-3 h-3 rounded-full" 
                    style={{ backgroundColor: selectedProject.color }}
                  />
                  <span className="text-white">{selectedProject.name}</span>
                </>
              ) : (
                <>
                  <FolderKanban className="w-4 h-4 text-white/60" />
                  <span className="text-white/60">Todos</span>
                </>
              )}
              <ChevronDown className="w-4 h-4 text-white/40" />
            </button>
            
            <AnimatePresence>
              {showProjectDropdown && (
                <motion.div
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -5 }}
                  role="group"
                  aria-label="Projetos disponíveis"
                  id="kanban-project-selector"
                  className="absolute right-0 top-full z-50 mt-2 w-[min(18rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-[#00f6ff]/20 bg-[#0a0f1f] shadow-xl"
                >
                  <button
                    type="button"
                    onClick={() => { onSelectProject?.(null); setShowProjectDropdown(false); }}
                    className={`flex min-h-11 w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#00f6ff] ${
                      !selectedProjectId ? 'bg-[#00f6ff]/10 text-[#00f6ff]' : 'text-white hover:bg-white/5'
                    }`}
                  >
                    <FolderKanban className="w-4 h-4" />
                    <span>Todos os projetos</span>
                    {!selectedProjectId && <Check className="w-4 h-4 ml-auto" />}
                  </button>
                  
                  {!isLoaded ? (
                    <p className="border-t border-white/5 px-4 py-3 text-xs text-white/40">
                      Carregando projetos...
                    </p>
                  ) : projects.length > 0 ? (
                    <div className="border-t border-white/5">
                      {projects.map(project => (
                        <div key={project.id} className="flex min-h-11 items-center border-b border-white/[0.04] last:border-b-0">
                          <button
                            type="button"
                            aria-label={`Selecionar projeto ${project.name}`}
                            onClick={() => { onSelectProject?.(project.id); setShowProjectDropdown(false); }}
                            className={`flex min-h-11 min-w-0 flex-1 items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#00f6ff] ${
                              selectedProjectId === project.id ? 'bg-[#00f6ff]/10 text-[#00f6ff]' : 'text-white hover:bg-white/5'
                            }`}
                          >
                            <span className="h-3 w-3 flex-shrink-0 rounded-full" style={{ backgroundColor: project.color }} aria-hidden="true" />
                            <span className="truncate">{project.name}</span>
                            {selectedProjectId === project.id && <Check className="ml-auto h-4 w-4 flex-shrink-0" aria-hidden="true" />}
                          </button>
                          <ProjectEditorPopover
                            project={project}
                            columns={columns}
                            projects={projects}
                            palette={PROJECT_COLORS}
                            open={editingProjectId === project.id}
                            onOpenChange={(open) => setEditingProjectId(open ? project.id : null)}
                            onSave={onUpdateProject ?? (async () => ({ success: false, error: "A edição de projetos não está disponível." }))}
                          />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="border-t border-white/5 px-4 py-3 text-xs text-white/40">
                      Nenhum projeto criado ainda.
                    </p>
                  )}
                  
                  <div className="border-t border-white/5">
                    <button
                      type="button"
                      onClick={handleOpenAddProject}
                      className="flex min-h-11 w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-[#00f6ff] transition-colors hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#00f6ff]"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Novo projeto</span>
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="relative" ref={datePickerRef}>
            <button
              type="button"
              onClick={() => setShowDatePicker(!showDatePicker)}
              aria-expanded={showDatePicker}
              aria-haspopup="dialog"
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-colors text-sm ${
                selectedDate 
                  ? 'bg-[#00f6ff]/10 border-[#00f6ff]/30 text-[#00f6ff]' 
                  : 'bg-white/5 border-white/10 hover:border-[#00f6ff]/30 text-white/60'
              } min-h-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00f6ff]`}
            >
              <Calendar className="w-4 h-4" />
              {selectedDate ? (
                <span>{format(selectedDate, "dd 'de' MMM", { locale: ptBR })}</span>
              ) : (
                <span>Data</span>
              )}
            </button>
            
            <AnimatePresence>
              {showDatePicker && (
                <motion.div
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -5 }}
                  className="absolute top-full left-0 mt-2 w-64 bg-[#0a0f1f] border border-[#00f6ff]/20 rounded-xl shadow-xl z-50 p-4"
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm text-white/60">Filtrar por data</span>
                    {selectedDate && (
                      <button
                        type="button"
                        onClick={() => { onSelectDate?.(null); setShowDatePicker(false); }}
                        className="min-h-11 px-2 text-xs text-red-400 hover:text-red-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
                      >
                        Limpar
                      </button>
                    )}
                  </div>
                  <input
                    type="date"
                    value={selectedDate ? format(selectedDate, 'yyyy-MM-dd') : ''}
                    onChange={(e) => {
                      if (e.target.value) {
                        onSelectDate?.(parseISO(e.target.value));
                      }
                      setShowDatePicker(false);
                    }}
                    className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:border-[#00f6ff]/50 outline-none"
                  />
                  <div className="flex gap-2 mt-3">
                    <button
                      type="button"
                      onClick={() => { onSelectDate?.(new Date()); setShowDatePicker(false); }}
                      className="min-h-11 flex-1 rounded-lg border border-[#00f6ff]/30 bg-[#00f6ff]/10 px-3 py-1.5 text-xs text-[#00f6ff] transition-colors hover:bg-[#00f6ff]/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00f6ff]"
                    >
                      Hoje
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
        <div className="ml-auto w-full sm:w-auto">
          {showAddColumn ? (
            <form
              onSubmit={(event) => { event.preventDefault(); void handleAddColumn(); }}
              className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto"
              aria-label="Criar nova coluna"
            >
              <label htmlFor="new-column-title" className="sr-only">Nome da coluna</label>
              <input
                id="new-column-title"
                type="text"
                value={newColumnTitle}
                onChange={(event) => setNewColumnTitle(event.target.value)}
                placeholder="Nome da coluna..."
                maxLength={120}
                autoFocus
                disabled={isAddingColumn}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    setShowAddColumn(false);
                    setNewColumnTitle('');
                    setNewColumnBehavior('active');
                  }
                }}
                className="min-h-11 min-w-0 flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-[#00f6ff]/50 focus-visible:ring-2 focus-visible:ring-[#00f6ff]/50 sm:w-40 sm:flex-none"
              />
              <label htmlFor="new-column-behavior" className="sr-only">Comportamento da nova coluna</label>
              <select
                id="new-column-behavior"
                value={newColumnBehavior}
                onChange={(event) => setNewColumnBehavior(event.target.value as ColumnBehavior)}
                disabled={isAddingColumn}
                className="min-h-11 min-w-0 flex-1 rounded-xl border border-white/10 bg-[#0a0f1f] px-3 py-2 text-sm text-white outline-none focus:border-[#00f6ff]/50 focus-visible:ring-2 focus-visible:ring-[#00f6ff]/50 sm:w-36 sm:flex-none"
              >
                <option value="active">Ativada</option>
                <option value="completion">Conclusão</option>
                <option value="progressive">Progressivo</option>
              </select>
              <button
                type="submit"
                disabled={!newColumnTitle.trim() || isAddingColumn}
                className="min-h-11 rounded-xl bg-[#00f6ff] px-4 py-2 text-sm font-medium text-[#010516] transition-colors hover:bg-[#00f6ff]/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:cursor-wait disabled:opacity-50"
              >
                {isAddingColumn ? <Loader2 className="h-4 w-4 animate-spin" aria-label="Criando coluna" /> : 'Criar'}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (isAddingColumn) return;
                  setShowAddColumn(false);
                  setNewColumnTitle('');
                  setNewColumnBehavior('active');
                }}
                disabled={isAddingColumn}
                className="min-h-11 rounded-xl bg-white/5 px-3 py-2 text-sm text-white/70 transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00f6ff] disabled:cursor-wait disabled:opacity-50"
              >
                Cancelar
              </button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setShowAddColumn(true)}
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[#00f6ff]/30 px-4 text-sm text-[#00f6ff] transition-colors hover:bg-[#00f6ff]/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00f6ff] sm:w-auto"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Adicionar coluna
            </button>
          )}
        </div>
      </div>

      <Dialog
        open={showAddProjectModal}
        onOpenChange={(open) => {
          if (open) {
            setProjectCreationError(null);
            setShowAddProjectModal(true);
          } else {
            handleCloseAddProject();
          }
        }}
      >
        <DialogContent
          showCloseButton={!isCreatingProject}
          onEscapeKeyDown={(event) => {
            if (isCreatingProject) event.preventDefault();
          }}
          onPointerDownOutside={(event) => {
            if (isCreatingProject) event.preventDefault();
          }}
          className="max-h-[90vh] overflow-y-auto rounded-2xl border-[#00f6ff]/20 bg-[#0a0f1f] p-4 text-white shadow-2xl sm:p-6"
        >
          <DialogHeader className="text-left">
            <DialogTitle className="text-lg font-semibold text-white">Novo Projeto</DialogTitle>
            <DialogDescription className="text-white/50">
              Escolha um nome e uma cor para organizar seus cards.
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              void handleAddProject();
            }}
            className="space-y-4"
          >
            {projectCreationError && (
              <div role="alert" className="rounded-xl border border-red-400/30 bg-red-400/10 px-3 py-2 text-sm text-red-200">
                {projectCreationError}
              </div>
            )}

            <div>
              <label htmlFor="new-project-name" className="mb-2 block text-sm text-white/60">
                Nome do projeto
              </label>
              <input
                ref={projectNameInputRef}
                id="new-project-name"
                type="text"
                value={newProjectName}
                onChange={(event) => {
                  setNewProjectName(event.target.value);
                  if (projectCreationError) setProjectCreationError(null);
                }}
                placeholder="Ex: Trabalho, Pessoal, Estudos..."
                className="min-h-11 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition-colors placeholder:text-white/30 focus:border-[#00f6ff]/50 focus-visible:ring-2 focus-visible:ring-[#00f6ff]/50"
                autoFocus
                disabled={isCreatingProject}
                maxLength={80}
              />
            </div>

            <fieldset>
              <legend className="mb-2 block text-sm text-white/60">Cor do projeto</legend>
              <div className="flex flex-wrap gap-3">
                {PROJECT_COLORS.map((color, index) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setNewProjectColor(color)}
                    disabled={isCreatingProject}
                    aria-label={`Cor ${index + 1}: ${color}`}
                    aria-pressed={newProjectColor === color}
                    title={`Selecionar cor ${color}`}
                    className={`h-9 w-9 rounded-full transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0f1f] disabled:cursor-not-allowed disabled:opacity-60 ${
                      newProjectColor === color ? 'ring-2 ring-white ring-offset-2 ring-offset-[#0a0f1f]' : ''
                    }`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </fieldset>

            <DialogFooter className="flex-col-reverse gap-3 pt-2 sm:flex-row">
              <button
                type="button"
                onClick={handleCloseAddProject}
                disabled={isCreatingProject}
                className="min-h-11 flex-1 rounded-xl bg-white/5 px-4 py-2.5 text-white/70 transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00f6ff] disabled:cursor-wait disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={!newProjectName.trim() || isCreatingProject || !onAddProject}
                className="min-h-11 flex-1 rounded-xl bg-[#00f6ff] px-4 py-2.5 font-medium text-black transition-colors hover:bg-[#00f6ff]/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isCreatingProject ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    Criando...
                  </span>
                ) : (
                  'Criar projeto'
                )}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetectionStrategy}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <SortableContext items={columnIds} strategy={horizontalListSortingStrategy}>
          <div className="flex gap-4 overflow-x-auto pb-4 h-[calc(100%-4rem)]">
            {visibleColumns.map((column) => (
              <SortableColumn
                key={column.id}
                column={column}
                onEdit={(mode) => setColumnEditor({ column, mode })}
                onDelete={() => onDeleteColumn(column.id)}
                onChangeBehavior={(behavior) => onUpdateColumn(column.id, { behavior })}
                isDraggingColumn={activeColumn !== null}
                filteredCardCount={getFilteredCards(column).length}
                reducedMotion={reducedMotion}
              >
                <DroppableColumn 
                  column={column} 
                  isOver={overColumnId === column.id && activeCard !== null}
                >
                  <SortableContext
                    items={getFilteredCards(column).map(c => c.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    {getFilteredCards(column).map((card, visibleIndex, visibleCards) => (
                      <SortableCard
                          key={card.id}
                          card={card}
                          columnId={column.id}
                           columnColor={column.backgroundColor}
                           isCompletionColumn={column.behavior === 'completion'}
                            ordinal={column.behavior === 'progressive' ? visibleIndex + 1 : undefined}
                            ordinalTotal={column.behavior === 'progressive' ? visibleCards.length : undefined}
                          onEdit={() => setEditingCard({ card, columnId: column.id })}
                          isDraggingAny={activeCard !== null}
                           isCompletionBusy={completionBusyIds.has(card.id)}
                           onToggleCompletion={() => void handleToggleCompletion(column.id, card)}
                           suppressClickRef={suppressCardClickRef}
                            clearClickSuppression={clearClickSuppression}
                           reducedMotion={reducedMotion}
                      />
                    ))}
                  </SortableContext>
                  
                  {getFilteredCards(column).length === 0 && !activeCard && (
                    <div className="flex items-center justify-center h-20 text-white/20 text-xs">
                      Sem tarefas
                    </div>
                  )}
                </DroppableColumn>

                {addingCardToColumn === column.id ? (
                  <div className="mt-3 space-y-2">
                    <input
                      type="text"
                      value={newCardTitle}
                      onChange={(e) => setNewCardTitle(e.target.value)}
                      placeholder="Título da tarefa..."
                      className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 focus:border-[#00f6ff]/50 outline-none text-white text-sm"
                      autoFocus
                      onKeyDown={(e) => e.key === 'Enter' && handleAddCard(column.id)}
                    />
                    <select
                      value={newCardPriority}
                      onChange={(e) => setNewCardPriority(e.target.value as Priority)}
                      className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 focus:border-[#00f6ff]/50 outline-none text-white text-sm"
                    >
                      <option value="alta">Alta Prioridade</option>
                      <option value="media">Média Prioridade</option>
                      <option value="baixa">Baixa Prioridade</option>
                    </select>
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-white/40" />
                      <input
                        type="date"
                        value={newCardDueDate}
                        onChange={(e) => setNewCardDueDate(e.target.value)}
                        className="flex-1 px-3 py-2 rounded-xl bg-white/5 border border-white/10 focus:border-[#00f6ff]/50 outline-none text-white text-sm"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleAddCard(column.id)}
                        className="flex-1 py-2 rounded-xl bg-[#00f6ff] text-[#010516] text-sm font-medium hover:bg-[#00f6ff]/90 transition-colors"
                      >
                        Adicionar
                      </button>
                      <button
                        onClick={() => {
                          setAddingCardToColumn(null);
                          setNewCardTitle('');
                        }}
                        className="px-3 py-2 rounded-xl bg-white/5 text-white/60 text-sm hover:bg-white/10 transition-colors"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setAddingCardToColumn(column.id)}
                    className="mt-3 flex items-center gap-2 w-full px-3 py-2 rounded-xl border border-dashed border-[#00f6ff]/30 text-[#00f6ff] text-sm hover:bg-[#00f6ff]/5 transition-colors justify-center"
                  >
                    <Plus className="w-4 h-4" />
                    Adicionar um card
                  </button>
                )}
              </SortableColumn>
            ))}

          </div>
        </SortableContext>

        <DragOverlay dropAnimation={reducedMotion ? { duration: 0, easing: 'linear' } : {
          duration: 200,
          easing: 'cubic-bezier(0.2, 0, 0, 1)',
        }}>
          {activeCard && (
            <CardOverlay
              card={activeCard}
              columnColor={effectiveColumns.find((column) => column.id === activeColumnId)?.backgroundColor}
              isCompletionColumn={effectiveColumns.find((column) => column.id === activeColumnId)?.behavior === 'completion'}
              reducedMotion={reducedMotion}
              ordinal={activeColumnId
                ? (() => {
                    const column = effectiveColumns.find(c => c.id === activeColumnId);
                    if (!column || column.behavior !== 'progressive') return activeCardOrdinalRef.current?.ordinal;
                    const filtered = getFilteredCards(column);
                    const index = filtered.findIndex(c => c.id === activeCard.id);
                    return index >= 0 ? index + 1 : activeCardOrdinalRef.current?.ordinal;
                  })()
                : activeCardOrdinalRef.current?.ordinal}
              ordinalTotal={activeColumnId
                ? effectiveColumns.find(c => c.id === activeColumnId)?.behavior === 'progressive'
                  ? getFilteredCards(effectiveColumns.find(c => c.id === activeColumnId)!).length
                  : activeCardOrdinalRef.current?.total
                : activeCardOrdinalRef.current?.total}
            />
          )}
          {activeColumn && <ColumnOverlay column={activeColumn} />}
        </DragOverlay>
      </DndContext>

      <ColumnEditorDialog
        column={columnEditor?.column ?? null}
        mode={columnEditor?.mode ?? null}
        projects={projects}
        onUpdate={onUpdateColumn}
        onOpenChange={(open) => { if (!open) setColumnEditor(null); }}
      />

      <AnimatePresence>
        {editingCard && (
          <EditCardModal
            card={editingCard.card}
            columnId={editingCard.columnId}
            inheritedProjectLabel={(() => {
              const projectId = columns.find((column) => column.id === editingCard.columnId)?.projectId;
              return projectId
                ? projects.find((project) => project.id === projectId)?.name ?? "Projeto"
                : null;
            })()}
            onUpdate={(updates) => {
              onUpdateCard(editingCard.columnId, editingCard.card.id, updates);
              setEditingCard(null); // Explicitly close and clear
            }}
            onDelete={() => {
              if (window.confirm('Tem certeza que deseja excluir esta tarefa?')) {
                onDeleteCard(editingCard.columnId, editingCard.card.id);
                setEditingCard(null);
              }
            }}
            onClose={() => setEditingCard(null)}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function EditCardModal({
  card,
  columnId,
  inheritedProjectLabel,
  onUpdate,
  onDelete,
  onClose,
}: {
  card: KanbanCard;
  columnId: string;
  inheritedProjectLabel: string | null;
  onUpdate: (updates: Partial<KanbanCard>) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(card.title);
  const [description, setDescription] = useState(card.description);
  const [priority, setPriority] = useState<Priority>(card.priority);
  const [tags, setTags] = useState<string[]>(card.tags);
  const [subtasks, setSubtasks] = useState<SubTask[]>(card.subtasks);
  const [dueDate, setDueDate] = useState(card.dueDate || '');
  const [newTag, setNewTag] = useState('');
  const [newSubtask, setNewSubtask] = useState('');

  const handleSave = () => {
    const updates = {
      title: title.trim(),
      description: description?.trim() || '',
      priority,
      tags,
      subtasks,
      dueDate: dueDate || null,
    };
    console.log('[EditCardModal] Saving card:', card.id, 'Updates:', JSON.stringify(updates));
    console.log('[EditCardModal] Tags count:', tags.length, 'Subtasks count:', subtasks.length);
    onUpdate(updates);
  };

  const addTag = () => {
    if (newTag.trim() && !tags.includes(newTag.trim())) {
      setTags([...tags, newTag.trim()]);
      setNewTag('');
    }
  };

  const removeTag = (tagToRemove: string) => {
    setTags(tags.filter(t => t !== tagToRemove));
  };

  const addSubtask = () => {
    if (newSubtask.trim()) {
      setSubtasks([
        ...subtasks,
        { id: `subtask-${Date.now()}`, title: newSubtask.trim(), completed: false },
      ]);
      setNewSubtask('');
    }
  };

  const toggleSubtask = (subtaskId: string) => {
    setSubtasks(subtasks.map(s =>
      s.id === subtaskId ? { ...s, completed: !s.completed } : s
    ));
  };

  const removeSubtask = (subtaskId: string) => {
    setSubtasks(subtasks.filter(s => s.id !== subtaskId));
  };

  const completedCount = subtasks.filter(s => s.completed).length;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg bg-[#0a0f1f] border border-[#00f6ff]/20 rounded-2xl p-6 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white">Editar Tarefa</h2>
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={onClose}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5 text-white/60" />
          </motion.button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-sm text-white/60 mb-1 block">Título</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-white/5 border border-[#00f6ff]/30 focus:border-[#00f6ff]/50 outline-none text-[#00f6ff] text-sm"
            />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-white/60 mb-1 block">Prioridade</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as Priority)}
                className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 focus:border-[#00f6ff]/50 outline-none text-white text-sm"
              >
                <option value="alta">Alta</option>
                <option value="media">Média</option>
                <option value="baixa">Baixa</option>
              </select>
            </div>
            <div>
              <label className="text-sm text-white/60 mb-1 block">Data de Entrega</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 focus:border-[#00f6ff]/50 outline-none text-white text-sm"
              />
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
            <span className="block text-xs text-white/45">Projeto</span>
            <span className="mt-1 block text-sm text-white/80">
              {inheritedProjectLabel
                ? `${inheritedProjectLabel} — herdado da coluna`
                : 'Sem projeto — herdado da coluna'}
            </span>
          </div>

          <div>
            <label className="text-sm text-white/60 mb-1 block">Etiquetas</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {tags.map((tag, index) => (
                <span
                  key={index}
                  className="flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-[#00f6ff]/10 text-[#00f6ff]"
                >
                  {tag}
                  <button onClick={() => removeTag(tag)}>
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                placeholder="Nova etiqueta..."
                className="flex-1 px-3 py-2 rounded-xl bg-white/5 border border-dashed border-[#00f6ff]/30 focus:border-[#00f6ff]/50 outline-none text-[#00f6ff] text-sm placeholder:text-[#00f6ff]/40"
                onKeyDown={(e) => e.key === 'Enter' && addTag()}
              />
              <button
                onClick={addTag}
                className="px-3 py-2 rounded-xl bg-[#00f6ff]/10 text-[#00f6ff] text-sm hover:bg-[#00f6ff]/20 transition-colors"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div>
            <label className="text-sm text-white/60 mb-1 block">Descrição</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Insira uma descrição detalhada..."
              rows={4}
              className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 focus:border-[#00f6ff]/50 outline-none text-white text-sm resize-none"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm text-white/60">Checklist</label>
              <span className="text-xs text-white/40">{completedCount}/{subtasks.length}</span>
            </div>
            
            <div className="space-y-2 mb-3">
              {subtasks.map((subtask) => (
                <div key={subtask.id} className="flex items-center gap-2 group">
                  <button
                    onClick={() => toggleSubtask(subtask.id)}
                    className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${
                      subtask.completed 
                        ? 'bg-[#00f6ff] border-[#00f6ff]' 
                        : 'border-white/20 hover:border-[#00f6ff]/50'
                    }`}
                  >
                    {subtask.completed && <Check className="w-3 h-3 text-[#010516]" />}
                  </button>
                  <span className={`flex-1 text-sm ${subtask.completed ? 'text-white/40 line-through' : 'text-white'}`}>
                    {subtask.title}
                  </span>
                  <button
                    onClick={() => removeSubtask(subtask.id)}
                    className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-white/10 transition-all"
                  >
                    <X className="w-3 h-3 text-white/40" />
                  </button>
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={newSubtask}
                onChange={(e) => setNewSubtask(e.target.value)}
                placeholder="Nova subtarefa..."
                className="flex-1 px-3 py-2 rounded-xl bg-white/5 border border-dashed border-[#00f6ff]/30 focus:border-[#00f6ff]/50 outline-none text-white text-sm placeholder:text-white/40"
                onKeyDown={(e) => e.key === 'Enter' && addSubtask()}
              />
              <button
                onClick={addSubtask}
                className="px-3 py-2 rounded-xl bg-[#00f6ff]/10 text-[#00f6ff] text-sm hover:bg-[#00f6ff]/20 transition-colors"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-white/10">
            <button
              onClick={onDelete}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-500/20 text-red-400 text-sm hover:bg-red-500/30 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              Excluir tarefa
            </button>
            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-xl bg-white/5 text-white text-sm hover:bg-white/10 transition-colors"
              >
                Fechar
              </button>
              <button
                onClick={handleSave}
                className="px-4 py-2 rounded-xl bg-[#00f6ff] text-[#010516] text-sm font-medium hover:bg-[#00f6ff]/90 transition-colors"
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
