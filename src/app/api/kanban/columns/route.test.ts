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
    },
    updateBuilder,
  };
});

vi.mock('@/lib/api/kanban', () => ({
  apiError: (message: string, status: number) => Response.json({ error: message }, { status }),
  COLUMN_BEHAVIORS: ['active', 'completion', 'progressive'],
  COLUMN_TITLE_MAX_LENGTH: 120,
  databaseError: (operation: string) => Response.json({ error: `Unable to ${operation}` }, { status: 500 }),
  getKanbanServerContext: mocks.context,
  getOwnedRecord: mocks.ownership,
  isColumnBehavior: (value: unknown) => ['active', 'completion', 'progressive'].includes(String(value)),
  isUuid: (value: unknown) => typeof value === 'string' && /^[0-9a-f-]{36}$/i.test(value),
  publicColumn: (column: { id: string; title: string; position: number; behavior?: string }) => ({
    id: column.id,
    title: column.title,
    position: column.position,
    behavior: column.behavior || 'active',
    projectId: null,
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
});