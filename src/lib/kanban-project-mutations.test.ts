import { describe, expect, it } from 'vitest';
import { confirmsProjectUpdates, isProjectSaveData, parseProjectUpdates } from './kanban-project-mutations';
const projectId = '11111111-1111-4111-8111-111111111111';
const columnId = '22222222-2222-4222-8222-222222222222';
const other = '33333333-3333-4333-8333-333333333333';
const rename = { name: ' Novo ', expected: { name: 'Anterior' }, columnChanges: [] };

describe('project mutation contracts', () => {
  it('trims names without introducing binding changes', () => {
    expect(parseProjectUpdates(projectId, rename)).toEqual({ ...rename, name: 'Novo' });
  });
  it('allows a transfer and an explicit clear', () => {
    for (const [expectedProjectId, target] of [[other, projectId], [projectId, null]]) {
      expect(parseProjectUpdates(projectId, {
        expected: {}, columnChanges: [{ columnId, expectedProjectId, projectId: target }],
      })).not.toBeNull();
    }
  });
  it.each([
    { expected: {}, columnChanges: [] },
    { name: 'Novo', expected: {}, columnChanges: [] },
    { expected: {}, columnChanges: [{ columnId, expectedProjectId: null, projectId: other }] },
    { expected: {}, columnChanges: [{ columnId, expectedProjectId: other, projectId: null }] },
    { expected: {}, columnChanges: [{ columnId, expectedProjectId: null, projectId }] .concat([{ columnId, expectedProjectId: null, projectId }]) },
  ])('rejects invalid or ambiguous changes', input => {
    expect(parseProjectUpdates(projectId, input)).toBeNull();
  });
  it('validates confirmation rather than accepting a bare success flag', () => {
    const updates = parseProjectUpdates(projectId, rename)!;
    const data = { project: { id: projectId, name: 'Novo', color: '#06b6d4', createdAt: '2026-10-02' }, columns: [], cards: [] };
    expect(isProjectSaveData(data)).toBe(true);
    expect(confirmsProjectUpdates(data, projectId, updates)).toBe(true);
    expect(confirmsProjectUpdates({ ...data, project: { ...data.project, name: 'Anterior' } }, projectId, updates)).toBe(false);
    expect(isProjectSaveData({ success: true })).toBe(false);
  });
});