import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ context: vi.fn(), owned: vi.fn(), rpc: vi.fn() }));
vi.mock('@/lib/api/kanban', async () => ({
  ...await vi.importActual<typeof import('@/lib/api/kanban')>('@/lib/api/kanban'),
  getKanbanServerContext: mocks.context, getOwnedRecord: mocks.owned,
}));
import { PATCH } from './route';

const id = '11111111-1111-4111-8111-111111111111';
const columnId = '22222222-2222-4222-8222-222222222222';
const cardId = '33333333-3333-4333-8333-333333333333';
const userId = '44444444-4444-4444-8444-444444444444';
const project = { id, name: 'Novo', color: '#06b6d4', createdAt: '2026-10-02' };
const updates = { name: 'Novo', expected: { name: 'Anterior' }, columnChanges: [] };
const request = (changes: unknown = updates) => new NextRequest('http://localhost/api/kanban/projects', {
  method: 'PATCH', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ projectId: id, updates: changes }),
});

describe('atomic project editing API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.context.mockResolvedValue({ context: { user: { id: userId }, supabase: { rpc: mocks.rpc } } });
    mocks.owned.mockResolvedValue({ kind: 'owned', data: { id, user_id: userId } });
    mocks.rpc.mockResolvedValue({ data: { project, columns: [], cards: [] }, error: null });
  });
  it('saves metadata in one RPC without binding writes', async () => {
    expect((await PATCH(request()))!.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith('edit_kanban_project_v1', {
      p_user_id: userId, p_project_id: id, p_updates: { name: 'Novo' },
      p_expected: { name: 'Anterior' }, p_column_changes: [],
    });
  });
  it('confirms null bindings including hidden cards', async () => {
    mocks.rpc.mockResolvedValue({ data: {
      project, columns: [{ id: columnId, projectId: null }],
      cards: [{ id: cardId, columnId, projectId: null }],
    }, error: null });
    const response = (await PATCH(request({
      expected: {}, columnChanges: [{ columnId, expectedProjectId: id, projectId: null }],
    })))!;
    expect(response.status).toBe(200);
    expect((await response.json()).data.cards[0].projectId).toBeNull();
  });
  it('rejects foreign-owned columns before calling the write RPC', async () => {
    mocks.owned.mockResolvedValueOnce({ kind: 'owned', data: { id, user_id: userId } })
      .mockResolvedValueOnce({ kind: 'forbidden' });
    expect((await PATCH(request({
      expected: {}, columnChanges: [{ columnId, expectedProjectId: null, projectId: id }],
    })))!.status).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it.each(['40001', 'PGRST202'])('reports conflict or unavailable SQL without partial fallback (%s)', async code => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code } });
    expect((await PATCH(request()))!.status).toBe(409);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
  it('does not accept incomplete success as a confirmed save', async () => {
    mocks.rpc.mockResolvedValue({ data: { success: true }, error: null });
    expect((await PATCH(request()))!.status).toBe(502);
  });
  it('rejects unsupported destinations', async () => {
    expect((await PATCH(request({
      expected: {}, columnChanges: [{ columnId, expectedProjectId: null, projectId: cardId }],
    })))!.status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});