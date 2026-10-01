import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => {
  const updateBuilder = {
    update: vi.fn(),
    eq: vi.fn(),
    select: vi.fn(),
    maybeSingle: vi.fn(),
  };
  updateBuilder.update.mockReturnValue(updateBuilder);
  updateBuilder.eq.mockReturnValue(updateBuilder);
  updateBuilder.select.mockReturnValue(updateBuilder);

  return {
    context: vi.fn(),
    ownership: vi.fn(),
    supabase: {
      from: vi.fn(() => updateBuilder),
      rpc: vi.fn(),
    },
    updateBuilder,
  };
});

vi.mock('@/lib/api/kanban', () => ({
  apiError: (message: string, status: number) => Response.json({ error: message }, { status }),
  COLUMN_BEHAVIORS: ['active', 'completion', 'progressive'],
  COLUMN_TITLE_MAX_LENGTH: 120,
  databaseError: (operation: string, error?: { code?: string; message?: string }) => (
    (error?.code === 'PGRST202' || error?.code === '42883')
      && error.message?.toLowerCase().includes('edit_kanban_column_v1')
      ? Response.json({
        error: 'Column editing is not available in the database yet. Apply supabase/migrations/005_kanban_column_editing.sql, then retry.',
      }, { status: 409 })
      : Response.json({ error: `Unable to ${operation}` }, { status: 500 })
  ),
  getKanbanServerContext: mocks.context,
  getOwnedRecord: mocks.ownership,
  isColumnBehavior: (value: unknown) => ['active', 'completion', 'progressive'].includes(String(value)),
  isHexColor: (value: unknown) => typeof value === 'string' && value.length === 7 && /^#[0-9a-f]{6}$/i.test(value),
  isUuid: (value: unknown) => typeof value === 'string' && /^[0-9a-f-]{36}$/i.test(value),
  publicColumn: (column: {
    id: string;
    title: string;
    position: number;
    behavior?: string;
    project_id?: string | null;
    background_color?: string | null;
  }) => ({
    id: column.id,
    title: column.title,
    position: column.position,
    behavior: column.behavior || 'active',
    projectId: column.project_id ?? null,
    backgroundColor: column.background_color ?? null,
  }),
  relationError: () => Response.json({ error: 'relation error' }, { status: 403 }),
}));

import { PATCH } from './route';

const columnId = '11111111-1111-4111-8111-111111111111';

function request(body: unknown) {
  return new NextRequest('http://localhost/api/kanban/columns', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('/api/kanban/columns PATCH', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.context.mockResolvedValue({
      context: {
        user: { id: 'user-id' },
        supabase: mocks.supabase,
      },
    });
    mocks.ownership.mockResolvedValue({ kind: 'owned' });
    mocks.supabase.rpc.mockResolvedValue({
      data: {
        column: {
          id: columnId,
          title: 'DIRECIONAIS MOATS',
          position: 0,
          behavior: 'progressive',
          project_id: null,
          background_color: null,
        },
        cards_project_updated: true,
        cards_updated_count: 3,
      },
      error: null,
    });
    mocks.updateBuilder.maybeSingle.mockResolvedValue({
      data: {
        id: columnId,
        title: 'DIRECIONAIS MOATS',
        position: 0,
        behavior: 'progressive',
      },
      error: null,
    });
  });

  it('confirms a behavior change without selecting optional project_id', async () => {
    const response = await PATCH(request({ columnId, behavior: 'progressive' }));
    if (!response) throw new Error('PATCH did not return a response');

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      success: true,
      column: { id: columnId, behavior: 'progressive' },
    });
    expect(mocks.updateBuilder.update).toHaveBeenCalledWith({ behavior: 'progressive' });
    expect(mocks.updateBuilder.select).toHaveBeenCalledWith('id, title, position, behavior');
  });

  it('rejects unsupported behavior before touching the database', async () => {
    const response = await PATCH(request({ columnId, behavior: 'unknown' }));
    if (!response) throw new Error('PATCH did not return a response');

    expect(response.status).toBe(400);
    expect(mocks.context).not.toHaveBeenCalled();
    expect(mocks.updateBuilder.update).not.toHaveBeenCalled();
  });

  it('rejects a successful database response that does not confirm progressive', async () => {
    mocks.updateBuilder.maybeSingle.mockResolvedValue({
      data: {
        id: columnId,
        title: 'DIRECIONAIS MOATS',
        position: 0,
        behavior: 'active',
      },
      error: null,
    });

    const response = await PATCH(request({ columnId, behavior: 'progressive' }));
    if (!response) throw new Error('PATCH did not return a response');

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'Column behavior was not persisted' });
  });

  it.each(['#fff', 'blue', 123, '##112233', '#aabbcc\n'])('rejects invalid background color %s before touching the database', async (backgroundColor) => {
    const response = await PATCH(request({ columnId, backgroundColor }));
    if (!response) throw new Error('PATCH did not return a response');

    expect(response.status).toBe(400);
    expect(mocks.context).not.toHaveBeenCalled();
    expect(mocks.updateBuilder.update).not.toHaveBeenCalled();
    expect(mocks.supabase.rpc).not.toHaveBeenCalled();
  });

  it('accepts null to restore the column default and confirms the persisted color', async () => {
    mocks.updateBuilder.maybeSingle.mockResolvedValue({
      data: {
        id: columnId,
        title: 'DIRECIONAIS MOATS',
        position: 0,
        behavior: 'progressive',
        background_color: null,
      },
      error: null,
    });

    const response = await PATCH(request({ columnId, backgroundColor: null }));
    if (!response) throw new Error('PATCH did not return a response');

    expect(response.status).toBe(200);
    expect(mocks.updateBuilder.update).toHaveBeenCalledWith({ background_color: null });
    expect(mocks.updateBuilder.select).toHaveBeenCalledWith('id, title, position, behavior, background_color');
    expect(await response.json()).toMatchObject({
      success: true,
      column: { backgroundColor: null },
    });
  });

  it('rejects an invalid project ID before touching ownership or persistence', async () => {
    const response = await PATCH(request({ columnId, projectId: 'not-a-project' }));
    if (!response) throw new Error('PATCH did not return a response');

    expect(response.status).toBe(400);
    expect(mocks.context).not.toHaveBeenCalled();
    expect(mocks.ownership).not.toHaveBeenCalled();
  });

  it('rejects editing a column the authenticated user does not own', async () => {
    mocks.ownership.mockResolvedValue({ kind: 'forbidden' });

    const response = await PATCH(request({ columnId, title: 'changed' }));
    if (!response) throw new Error('PATCH did not return a response');

    expect(response.status).toBe(403);
    expect(mocks.updateBuilder.update).not.toHaveBeenCalled();
    expect(mocks.supabase.rpc).not.toHaveBeenCalled();
  });

  it('rejects a project the authenticated user does not own', async () => {
    const projectId = '22222222-2222-4222-8222-222222222222';
    mocks.ownership.mockImplementation(async (_supabase: unknown, table: string) => (
      table === 'kanban_projects' ? { kind: 'forbidden' } : { kind: 'owned' }
    ));

    const response = await PATCH(request({ columnId, projectId }));
    if (!response) throw new Error('PATCH did not return a response');

    expect(response.status).toBe(403);
    expect(mocks.supabase.rpc).not.toHaveBeenCalled();
  });

  it('transfers project and applies combined edits through the atomic RPC', async () => {
    const projectId = '22222222-2222-4222-8222-222222222222';
    const updates = {
      title: 'RENAMED',
      behavior: 'active',
      position: 4,
      project_id: projectId,
      background_color: '#aabbcc',
    };
    mocks.supabase.rpc.mockResolvedValue({
      data: {
        column: {
          id: columnId,
          title: 'RENAMED',
          behavior: 'active',
          position: 4,
          project_id: projectId,
          background_color: '#aabbcc',
        },
        cards_project_updated: true,
        cards_updated_count: 3,
      },
      error: null,
    });

    const response = await PATCH(request({
      columnId,
      title: ' renamed ',
      behavior: 'active',
      position: 4,
      projectId,
      backgroundColor: '#aabbcc',
    }));
    if (!response) throw new Error('PATCH did not return a response');

    expect(response.status).toBe(200);
    expect(mocks.supabase.rpc).toHaveBeenCalledWith('edit_kanban_column_v1', {
      p_user_id: 'user-id',
      p_column_id: columnId,
      p_updates: updates,
    });
    expect(mocks.updateBuilder.update).not.toHaveBeenCalled();
    expect(await response.json()).toMatchObject({
      cardsProjectUpdated: true,
      cardsUpdatedCount: 3,
      column: {
        title: 'RENAMED',
        projectId,
        backgroundColor: '#aabbcc',
      },
    });
  });

  it('maps an unavailable editing RPC to an actionable migration conflict', async () => {
    mocks.supabase.rpc.mockResolvedValue({
      data: null,
      error: {
        code: 'PGRST202',
        message: 'Could not find the function public.edit_kanban_column_v1 in the schema cache',
      },
    });

    const response = await PATCH(request({
      columnId,
      projectId: null,
    }));
    if (!response) throw new Error('PATCH did not return a response');

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: 'Column editing is not available in the database yet. Apply supabase/migrations/005_kanban_column_editing.sql, then retry.',
    });
  });

  it('maps an unexpected RPC failure without reporting a successful edit', async () => {
    mocks.supabase.rpc.mockResolvedValue({
      data: null,
      error: { code: 'XX000', message: 'database operation failed' },
    });

    const response = await PATCH(request({ columnId, projectId: null }));
    if (!response) throw new Error('PATCH did not return a response');

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Unable to update column' });
  });

  it('maps an RPC-detected card ownership conflict to a forbidden response', async () => {
    mocks.supabase.rpc.mockResolvedValue({
      data: null,
      error: { code: 'P0001', message: 'Column card is not owned by user' },
    });

    const response = await PATCH(request({ columnId, projectId: null }));
    if (!response) throw new Error('PATCH did not return a response');

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: 'You do not have access to this Kanban data',
    });
  });

  it('rejects an RPC response that does not confirm all cards were transferred', async () => {
    mocks.supabase.rpc.mockResolvedValue({
      data: {
        column: {
          id: columnId,
          title: 'DIRECIONAIS MOATS',
          position: 0,
          behavior: 'progressive',
          project_id: null,
          background_color: null,
        },
        cards_project_updated: false,
        cards_updated_count: 0,
      },
      error: null,
    });

    const response = await PATCH(request({ columnId, projectId: null }));
    if (!response) throw new Error('PATCH did not return a response');

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'Column transfer was not confirmed' });
  });
});