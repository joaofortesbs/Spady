import { useEffect, useState } from 'react';
import { format, parseISO } from 'date-fns';
import type { KanbanCard, KanbanColumn } from '@/lib/types/blindados';

const DEFAULT_CARD_BACKGROUND = '#0a0f1f';

function parseHexColor(color?: string | null): [number, number, number] | null {
  if (!color || !/^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(color)) return null;
  const value = color.slice(1);
  const full = value.length === 3 ? [...value].map((part) => part + part).join('') : value;
  return [
    Number.parseInt(full.slice(0, 2), 16),
    Number.parseInt(full.slice(2, 4), 16),
    Number.parseInt(full.slice(4, 6), 16),
  ];
}

function mixColor(foreground: [number, number, number], background: [number, number, number], amount: number) {
  return `#${foreground.map((channel, index) =>
    Math.round(channel * amount + background[index] * (1 - amount))
      .toString(16)
      .padStart(2, '0'),
  ).join('')}`;
}

/** A restrained, white-text-safe tint shared by regular cards and drag previews. */
export function getCardSurfaceStyle(columnColor?: string | null): { backgroundColor: string; borderColor: string } {
  const tint = parseHexColor(columnColor);
  if (!tint) return { backgroundColor: DEFAULT_CARD_BACKGROUND, borderColor: 'rgba(255, 255, 255, 0.05)' };
  const darkSurface: [number, number, number] = [10, 15, 31];
  return {
    backgroundColor: mixColor(tint, darkSurface, 0.12),
    borderColor: mixColor(tint, darkSurface, 0.38),
  };
}

export function getColumnEditorSubmenuSideOffset(viewportWidth: number): number {
  return viewportWidth <= 639 ? 8 : 56;
}

export function localDayKey(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

export function isHiddenCompletedCard(card: KanbanCard, behavior: KanbanColumn['behavior'], today: string): boolean {
  if (behavior !== 'completion' || !card.completedAt) return false;
  const completedDay = localDayKey(parseISO(card.completedAt));
  return completedDay < today;
}

export function millisecondsUntilNextLocalMidnight(now: Date): number {
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  return Math.max(1, midnight.getTime() - now.getTime());
}

/**
 * Starts with a deterministic SSR value and reads the local clock only after mount.
 * A single timer is re-armed at local midnight and refreshed after tab/page resume.
 */
export function useLocalDayClock(): string | null {
  const [today, setToday] = useState<string | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let disposed = false;
    const refresh = () => {
      if (disposed) return;
      const now = new Date();
      setToday(localDayKey(now));
      clearTimeout(timer);
      timer = setTimeout(refresh, millisecondsUntilNextLocalMidnight(now) + 20);
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') refresh();
    };

    refresh();
    window.addEventListener('focus', refresh);
    window.addEventListener('pageshow', refresh);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      disposed = true;
      clearTimeout(timer);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('pageshow', refresh);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  return today;
}

/** Replace only visible card slots, leaving filtered-out rows in their original slots. */
export function reorderVisibleCardSlots(
  cards: KanbanCard[],
  visibleIds: string[],
  orderedVisibleIds: string[],
): KanbanCard[] {
  const visibleSet = new Set(visibleIds);
  const visibleCards = new Map(cards.filter((card) => visibleSet.has(card.id)).map((card) => [card.id, card]));
  let orderIndex = 0;
  return cards.map((card) => {
    if (!visibleSet.has(card.id)) return card;
    const nextId = orderedVisibleIds[orderIndex++];
    return visibleCards.get(nextId) ?? card;
  });
}

/** Keep a cross-column preview's destination when the dragged card is hit again. */
export function resolveCardDropTargetColumnId({
  activeCardId,
  overId,
  overType,
  overColumnId,
  previewColumnId,
  fallbackColumnId,
}: {
  activeCardId: string;
  overId: string;
  overType?: string;
  overColumnId?: string;
  previewColumnId?: string | null;
  fallbackColumnId: string;
}): string {
  if (activeCardId === overId && previewColumnId) return previewColumnId;
  if (overType === 'card' && overColumnId) return overColumnId;
  if (overType === 'column') return overId;
  return fallbackColumnId;
}

export function resolveDragEndOverId(activeId: string, overId: string, lastMeaningfulOverId: string | null): string {
  return overId === activeId && lastMeaningfulOverId && lastMeaningfulOverId !== activeId
    ? lastMeaningfulOverId
    : overId;
}

/** Compare only card membership and order, ignoring immutable-field updates. */
export function hasMeaningfulCardDragPreview(snapshot: KanbanColumn[], draft: KanbanColumn[]): boolean {
  return snapshot.some((column) => {
    const draftColumn = draft.find((candidate) => candidate.id === column.id);
    return !draftColumn
      || column.cards.length !== draftColumn.cards.length
      || column.cards.some((card, index) => card.id !== draftColumn.cards[index]?.id);
  });
}

export function insertVisibleCard(
  cards: KanbanCard[],
  visibleIds: string[],
  card: KanbanCard,
  visibleIndex: number,
): KanbanCard[] {
  const visibleCards = cards.filter((item) => visibleIds.includes(item.id));
  const index = Math.max(0, Math.min(visibleIndex, visibleCards.length));
  const beforeId = visibleCards[index]?.id;
  if (beforeId) {
    const physicalIndex = cards.findIndex((item) => item.id === beforeId);
    return [...cards.slice(0, physicalIndex), card, ...cards.slice(physicalIndex)];
  }
  const lastVisibleId = visibleCards.at(-1)?.id;
  if (!lastVisibleId) return [...cards, card];
  const physicalIndex = cards.findIndex((item) => item.id === lastVisibleId);
  return [...cards.slice(0, physicalIndex + 1), card, ...cards.slice(physicalIndex + 1)];
}

/**
 * Applies only the local drag's membership/order to current server-backed entities.
 * Latest card and column fields always win over the drag-start snapshot.
 */
export function mergeKanbanStructure(latest: KanbanColumn[], draft: KanbanColumn[]): KanbanColumn[] {
  const latestColumns = new Map(latest.map((column) => [column.id, column]));
  const latestCards = new Map(latest.flatMap((column) => column.cards.map((card) => [card.id, card] as const)));
  const draftCardIds = new Set(draft.flatMap((column) => column.cards.map((card) => card.id)));
  const order = [...draft.map((column) => column.id), ...latest.map((column) => column.id)]
    .filter((id, index, all) => all.indexOf(id) === index && latestColumns.has(id));

  return order.map((id) => {
    const current = latestColumns.get(id)!;
    const draftColumn = draft.find((column) => column.id === id);
    const orderedCards = (draftColumn?.cards ?? [])
      .map((card) => latestCards.get(card.id))
      .filter((card): card is KanbanCard => Boolean(card));
    const newlyAddedCards = current.cards.filter((card) => !draftCardIds.has(card.id));
    return { ...current, cards: [...orderedCards, ...newlyAddedCards] };
  });
}