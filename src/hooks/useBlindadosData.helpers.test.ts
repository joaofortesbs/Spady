import { describe, expect, it } from 'vitest';
import { KanbanCard, KanbanColumn } from '@/lib/types/blindados';
import {
  applyCardOrder,
  mergeDraftCardStructure,
  mergeRequestedCardFields,
  normalizeCardField,
  rebaseCardOrder,
  restoreCardStructure,
} from './useBlindadosData.helpers';

const card: KanbanCard = {
  id: 'card-1',
  title: 'Persisted title',
  description: '',
  priority: 'media',
  tags: [],
  subtasks: [],
  createdAt: '2026-09-08T12:00:00.000Z',
  updatedAt: '2026-09-08T12:00:00.000Z',
  completedAt: null,
};
const first: KanbanColumn = {
  id: 'column-1',
  title: 'First',
  behavior: 'active',
  backgroundColor: '#123456',
  cards: [card],
};
const second: KanbanColumn = {
  id: 'column-2',
  title: 'Second',
  behavior: 'completion',
  cards: [],
};

describe('useBlindadosData scoped Kanban helpers', () => {
  it('normalizes a confirmed null completion value to undefined', () => {
    expect(normalizeCardField('completedAt', null)).toBeUndefined();
    expect(mergeRequestedCardFields(card, { completedAt: null }, ['completedAt']).completedAt).toBeUndefined();
  });

  it('restores an explicitly undefined confirmed value rather than preserving an optimistic value', () => {
    const optimistic = { ...card, completedAt: '2026-09-09T12:00:00.000Z' };
    const confirmed = { ...card, completedAt: undefined };
    const restored = mergeRequestedCardFields(optimistic, {}, ['completedAt'], confirmed);

    expect(restored.completedAt).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(restored, 'completedAt')).toBe(true);
  });

  it('keeps omitted confirmed cards in their slots while rebasing a partial reorder', () => {
    expect(rebaseCardOrder(['X', 'Y', 'Z'], ['Z', 'Y'])).toEqual(['X', 'Z', 'Y']);
  });

  it('excludes confirmed cards owned by another column but retains genuinely new cards', () => {
    const confirmedOwners = new Map([['X', 'column-1'], ['Y', 'column-2'], ['Z', 'column-2']]);
    expect(rebaseCardOrder(['Y', 'Z'], ['Z', 'X', 'Y'], confirmedOwners)).toEqual(['Z', 'Y']);
    expect(rebaseCardOrder(['Y', 'Z'], ['Z', 'new-card', 'Y'], confirmedOwners))
      .toEqual(['Z', 'Y', 'new-card']);
  });

  it('does not add a globally foreign card to a column from an order-only update', () => {
    const columns = [
      { ...first, cards: [] },
      { ...second, cards: [{ ...card, id: 'card-2' }] },
    ];

    const reordered = applyCardOrder(columns, second.id, ['card-1', 'card-2']);

    expect(reordered[0].cards.map(item => item.id)).toEqual([]);
    expect(reordered[1].cards.map(item => item.id)).toEqual(['card-2']);
  });

  it('merges draft membership and order while preserving current card and column fields', () => {
    const latest = [{
      ...first,
      cards: [{ ...card, title: 'Newest title', completedAt: '2026-09-09T12:00:00.000Z' }],
    }, second];
    const staleDraft = [
      { ...first, backgroundColor: '#ffffff', cards: [{ ...card, title: 'Stale title' }] },
      second,
    ];

    const merged = mergeDraftCardStructure(latest, staleDraft);
    expect(merged[0].backgroundColor).toBe('#123456');
    expect(merged[0].cards[0].title).toBe('Newest title');
    expect(merged[0].cards[0].completedAt).toBe('2026-09-09T12:00:00.000Z');
  });

  it('restores only existing card membership/order and retains confirmed fields and metadata', () => {
    const movedLatest = [
      { ...first, cards: [] },
      { ...second, backgroundColor: '#abcdef', cards: [{ ...card, title: 'Newest', completedAt: '2026-09-09T12:00:00.000Z' }] },
    ];
    const restored = restoreCardStructure(movedLatest, [first, second], [first.id, second.id]);
    expect(restored[0].cards[0]).toMatchObject({
      id: card.id,
      title: 'Newest',
      completedAt: '2026-09-09T12:00:00.000Z',
    });
    expect(restored[1].cards).toEqual([]);
    expect(restored[1].backgroundColor).toBe('#abcdef');

    const deleted = restoreCardStructure([
      { ...first, cards: [] },
      second,
    ], [first, second], [first.id, second.id]);
    expect(deleted[0].cards).toEqual([]);
  });
});