import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getCardSurfaceStyle,
  getColumnEditorSubmenuSideOffset,
  hasMeaningfulCardDragPreview,
  insertVisibleCard,
  isHiddenCompletedCard,
  localDayKey,
  mergeKanbanStructure,
  millisecondsUntilNextLocalMidnight,
  reorderVisibleCardSlots,
  resolveCardDropTargetColumnId,
  resolveDragEndOverId,
  useLocalDayClock,
} from './kanbanBoard.helpers';
import type { KanbanCard, KanbanColumn } from '@/lib/types/blindados';
import { cleanup, renderHook, act } from '@testing-library/react';

function card(id: string, completedAt: string | null = null, title = id): KanbanCard {
  return {
    id, title, description: '', priority: 'media', tags: [], subtasks: [],
    createdAt: '2026-09-08T12:00:00.000Z', updatedAt: '2026-09-08T12:00:00.000Z',
    projectId: null, dueDate: null, completedAt,
  };
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('Kanban board visual and drag helpers', () => {
  it('preserves the default card color and safely tints cards for valid custom hex colors', () => {
    expect(getCardSurfaceStyle()).toEqual({
      backgroundColor: '#0a0f1f',
      borderColor: 'rgba(255, 255, 255, 0.05)',
    });
    const bright = getCardSurfaceStyle('#ffffff');
    expect(bright.backgroundColor).not.toBe('#ffffff');
    expect(bright.borderColor).not.toBe('#ffffff');
    expect(getCardSurfaceStyle('url(javascript:alert(1))')).toEqual(getCardSurfaceStyle());
    expect(getCardSurfaceStyle('#0ff').backgroundColor).toMatch(/^#[\da-f]{6}$/i);

    const tinted = getCardSurfaceStyle('#ffffff').backgroundColor;
    const channels = tinted.slice(1).match(/.{2}/g)!.map((channel) => Number.parseInt(channel, 16) / 255);
    const luminance = channels
      .map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
      .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
    expect(1.05 / (luminance + 0.05)).toBeGreaterThan(4.5);
  });

  it('retains desktop pencil/trash spacing and reduces the submenu gap on narrow viewports', () => {
    expect(getColumnEditorSubmenuSideOffset(1440)).toBe(56);
    expect(getColumnEditorSubmenuSideOffset(390)).toBe(8);
    expect(getColumnEditorSubmenuSideOffset(320)).toBe(8);
  });

  it('keeps filtered-out rows in their original slots while visible rows reorder', () => {
    const rows = [card('visible-a'), card('hidden'), card('visible-b'), card('hidden-2')];
    const reordered = reorderVisibleCardSlots(rows, ['visible-a', 'visible-b'], ['visible-b', 'visible-a']);
    expect(reordered.map(({ id }) => id)).toEqual(['visible-b', 'hidden', 'visible-a', 'hidden-2']);
    expect(insertVisibleCard(reordered, ['visible-b', 'visible-a'], card('new'), 1).map(({ id }) => id))
      .toEqual(['visible-b', 'hidden', 'new', 'visible-a', 'hidden-2']);
  });

  it('keeps an active-card self collision on the cross-column preview destination at drop', () => {
    const active = card('active');
    const hidden = card('hidden');
    const target = card('target');
    const snapshot: KanbanColumn[] = [
      { id: 'source', title: 'Source', behavior: 'completion', cards: [active, hidden] },
      { id: 'destination', title: 'Destination', behavior: 'active', cards: [target] },
    ];
    const preview: KanbanColumn[] = [
      { ...snapshot[0], cards: [hidden] },
      { ...snapshot[1], cards: [active, target] },
    ];

    const dropColumnId = resolveCardDropTargetColumnId({
      activeCardId: active.id,
      overId: active.id,
      overType: 'card',
      overColumnId: 'source',
      previewColumnId: 'destination',
      fallbackColumnId: 'source',
    });
    expect(dropColumnId).toBe('destination');
    expect(hasMeaningfulCardDragPreview(snapshot, preview)).toBe(true);
    expect(mergeKanbanStructure(snapshot, preview).map((column) => column.cards.map(({ id }) => id)))
      .toEqual([['hidden'], ['active', 'target']]);
  });

  it('recognizes meaningful same-column reorder previews and leaves no-op drops unchanged', () => {
    const rows = [card('first'), card('hidden'), card('second')];
    const snapshot: KanbanColumn[] = [{
      id: 'source', title: 'Source', behavior: 'completion', cards: rows,
    }];
    const preview: KanbanColumn[] = [{
      ...snapshot[0],
      cards: reorderVisibleCardSlots(rows, ['first', 'second'], ['second', 'first']),
    }];

    expect(resolveCardDropTargetColumnId({
      activeCardId: 'first',
      overId: 'first',
      overType: 'card',
      overColumnId: 'source',
      previewColumnId: 'source',
      fallbackColumnId: 'source',
    })).toBe('source');
    expect(hasMeaningfulCardDragPreview(snapshot, preview)).toBe(true);
    expect(mergeKanbanStructure(snapshot, preview)[0].cards.map(({ id }) => id))
      .toEqual(['second', 'hidden', 'first']);
    expect(hasMeaningfulCardDragPreview(snapshot, snapshot)).toBe(false);
  });

  it('uses the last meaningful target only when a drag ends over its active item', () => {
    expect(resolveDragEndOverId('active', 'active', 'destination')).toBe('destination');
    expect(resolveDragEndOverId('active', 'active', 'active')).toBe('active');
    expect(resolveDragEndOverId('active', 'destination', 'previous')).toBe('destination');
  });

  it('merges the drag structure using current entity and column values', () => {
    const oldCard = card('a', null, 'old title');
    const latestCard = card('a', '2026-09-09T12:00:00.000Z', 'confirmed title');
    const snapshot: KanbanColumn[] = [{ id: 'column', title: 'Old', behavior: 'active', cards: [oldCard] }];
    const latest: KanbanColumn[] = [{ ...snapshot[0], title: 'Renamed', cards: [latestCard] }];
    expect(mergeKanbanStructure(latest, snapshot)).toEqual([{ ...latest[0], cards: [latestCard] }]);
  });
});

describe('local completion day clock', () => {
  it('compares completion timestamps by local civil date and keeps unchecked cards visible', () => {
    const originalTimezone = process.env.TZ;
    process.env.TZ = 'America/Sao_Paulo';
    try {
      const date = new Date('2026-09-09T02:30:00.000Z');
      expect(localDayKey(date)).toBe('2026-09-08');
      expect(isHiddenCompletedCard(card('checked', '2026-09-08T23:59:00-03:00'), 'completion', '2026-09-09')).toBe(true);
      expect(isHiddenCompletedCard(card('pending'), 'completion', '2026-09-09')).toBe(false);
      expect(isHiddenCompletedCard(card('checked', '2026-09-08T23:59:00-03:00'), 'active', '2026-09-09')).toBe(false);
    } finally {
      if (originalTimezone === undefined) delete process.env.TZ;
      else process.env.TZ = originalTimezone;
    }
  });

  it('schedules the next local midnight and refreshes after returning to a tab', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-08T23:59:59.000'));
    expect(millisecondsUntilNextLocalMidnight(new Date())).toBe(1000);
    const { result } = renderHook(() => useLocalDayClock());
    expect(result.current).toBe('2026-09-08');
    act(() => vi.advanceTimersByTime(1020));
    expect(result.current).toBe('2026-09-09');
    act(() => {
      vi.setSystemTime(new Date('2026-09-10T12:00:00.000'));
      window.dispatchEvent(new Event('pageshow'));
    });
    expect(result.current).toBe('2026-09-10');
  });
});