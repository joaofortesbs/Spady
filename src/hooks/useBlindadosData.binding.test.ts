import { describe, expect, it } from 'vitest';
import { moveCardInColumns, restoreCardStructure } from './useBlindadosData.helpers';
import type { KanbanColumn } from '@/lib/types/blindados';

const card = {
  id: 'card', title: 'Preservar', description: 'Descrição', priority: 'alta' as const,
  tags: ['tag'], subtasks: [], createdAt: '2026-10-02T12:00:00Z',
  updatedAt: '2026-10-02T12:00:00Z', projectId: 'project-a', dueDate: '2026-10-20',
};
const columns: KanbanColumn[] = [
  { id: 'a', title: 'A', behavior: 'active', projectId: 'project-a', cards: [card] },
  { id: 'b', title: 'B', behavior: 'active', projectId: 'project-b', cards: [] },
  { id: 'none', title: 'Sem projeto', behavior: 'active', projectId: null, cards: [] },
];

describe('card project always follows its column', () => {
  it('inherits the destination project and preserves unrelated fields', () => {
    const moved = moveCardInColumns(columns, 'card', 'a', 'b', 0);
    expect(moved[1].cards[0]).toEqual({ ...card, projectId: 'project-b' });
  });
  it('clears the project on an unbound destination', () => {
    const moved = moveCardInColumns(columns, 'card', 'a', 'none', 0);
    expect(moved[2].cards[0]).toEqual({ ...card, projectId: null });
  });
  it('restores the source column association after a rejected move', () => {
    const moved = moveCardInColumns(columns, 'card', 'a', 'none', 0);
    const restored = restoreCardStructure(moved, columns, ['a', 'none']);
    expect(restored[0].cards[0]).toEqual(card);
  });
  it('does not remove a card when the destination is missing', () => {
    expect(moveCardInColumns(columns, 'card', 'a', 'missing', 0)).toEqual(columns);
  });
});