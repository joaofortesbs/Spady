import type { KanbanProjectSaveData, KanbanProjectUpdates } from './types/blindados';

const uuid = (value: unknown): value is string =>
  typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const association = (value: unknown) => value === null || uuid(value);

export function parseProjectUpdates(projectId: string, input: unknown): KanbanProjectUpdates | null {
  if (!uuid(projectId) || !input || typeof input !== 'object' || Array.isArray(input)) return null;
  const value = input as Record<string, unknown>;
  if (Object.keys(value).some(key => !['name', 'color', 'expected', 'columnChanges'].includes(key))) return null;
  const expected = value.expected as Record<string, unknown>;
  if (!expected || typeof expected !== 'object' || Array.isArray(expected)
    || Object.keys(expected).some(key => !['name', 'color'].includes(key))) return null;
  const updates: KanbanProjectUpdates = { expected: {}, columnChanges: [] };
  if (value.name !== undefined) {
    if (typeof value.name !== 'string' || !value.name.trim() || value.name.trim().length > 120
      || typeof expected.name !== 'string') return null;
    updates.name = value.name.trim();
    updates.expected.name = expected.name;
  }
  if (value.color !== undefined) {
    if (typeof value.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(value.color)
      || typeof expected.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(expected.color)) return null;
    updates.color = value.color.toLowerCase();
    updates.expected.color = expected.color;
  }
  if (!Array.isArray(value.columnChanges) || value.columnChanges.length > 500) return null;
  const ids = new Set<string>();
  for (const item of value.columnChanges) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
    const change = item as Record<string, unknown>;
    if (Object.keys(change).some(key => !['columnId', 'expectedProjectId', 'projectId'].includes(key))
      || !uuid(change.columnId) || !association(change.expectedProjectId)
      || (change.projectId !== null && change.projectId !== projectId) || ids.has(change.columnId)
      || change.projectId === change.expectedProjectId
      || (change.projectId === null && change.expectedProjectId !== projectId)) return null;
    ids.add(change.columnId);
    updates.columnChanges.push({
      columnId: change.columnId,
      expectedProjectId: change.expectedProjectId as string | null,
      projectId: change.projectId as string | null,
    });
  }
  if (updates.name === undefined && updates.color === undefined && !updates.columnChanges.length) return null;
  return updates;
}

export function isProjectSaveData(value: unknown): value is KanbanProjectSaveData {
  if (!value || typeof value !== 'object') return false;
  const data = value as KanbanProjectSaveData;
  const project = data.project;
  return Boolean(project && uuid(project.id) && typeof project.name === 'string'
    && typeof project.color === 'string' && /^#[0-9a-f]{6}$/i.test(project.color)
    && typeof project.createdAt === 'string' && Array.isArray(data.columns) && Array.isArray(data.cards)
    && data.columns.every(column => column && uuid(column.id) && association(column.projectId))
    && data.cards.every(card => card && uuid(card.id) && uuid(card.columnId) && association(card.projectId)));
}

export function confirmsProjectUpdates(
  data: KanbanProjectSaveData, projectId: string, updates: KanbanProjectUpdates,
): boolean {
  if (data.project.id !== projectId
    || (updates.name !== undefined && data.project.name !== updates.name)
    || (updates.color !== undefined && data.project.color.toLowerCase() !== updates.color.toLowerCase())
    || data.columns.length !== updates.columnChanges.length) return false;
  const bindings = new Map(updates.columnChanges.map(change => [change.columnId, change.projectId]));
  const columnIds = new Set(data.columns.map(column => column.id));
  const cardIds = new Set(data.cards.map(card => card.id));
  return columnIds.size === data.columns.length && cardIds.size === data.cards.length
    && data.columns.every(column => bindings.has(column.id) && bindings.get(column.id) === column.projectId)
    && data.cards.every(card => bindings.has(card.columnId) && bindings.get(card.columnId) === card.projectId);
}