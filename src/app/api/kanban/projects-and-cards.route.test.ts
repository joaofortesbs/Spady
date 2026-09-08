import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => {
  const builder = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    single: vi.fn(),
    maybeSingle: vi.fn(),
  };

  for (const method of ['select', 'eq', 'order', 'insert', 'update']) {
    builder[method as keyof typeof builder].mockReturnValue(builder);
  }

  return {
    builder,
    from: vi.fn(() => builder),
    getContext: vi.fn(),
    getOwnedRecord: vi.fn(),
  };
});

vi.mock('@/lib/api/kanban', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api/kanban')>('@/lib/api/kanban');
  return {
    ...actual,
    getKanbanServerContext: mocks.getContext,
    getOwnedRecord: mocks.getOwnedRecord,
  };
});

import { GET, POST as PROJECTS_POST, DELETE as PROJECTS_DELETE } from './projects/route';
import { POST as ADD_CARD } from './add-card/route';
import { POST as UPDATE_CARD } from './update-card/route';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_USER_ID = '22222222-2222-4222-8222-222222222222';
const PROJECT_ID = '33333333-3333-4333-8333-333333333333';
const COLUMN_ID = '44444444-4444-4444-8444-444444444444';
const CARD_ID = '55555555-5555-4555-8555-555555555555';
const OTHER_PROJECT_ID = '66666666-6666-4666-8666-666666666666';
const now = '2026-09-08T12:00:00.000Z';

function request(method: string, path: string, body?: unknown) {
  return new NextRequest(`http://localhost/api/kanban/${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function setContext(userId = USER_ID) {
  mocks.getContext.mockResolvedValue({
    context: {
      user: { id: userId },
      supabase: { from: mocks.from },
    },
  });
}

const projectRow = {
  id: PROJECT_ID,
  name: 'Projeto E2E',
  color: '#06b6d4',
  created_at: now,
  updated_at: now,
  user_id: USER_ID,
};

const cardRow = {
  id: CARD_ID,
  title: 'Card E2E',
  description: 'Descrição',
  priority: 'media',
  tags: ['e2e'],
  subtasks: [],
  created_at: now,
  updated_at: now,
  project_id: PROJECT_ID,
  due_date: null,
  completed_at: null,
  user_id: USER_ID,
};

function required(response: NextResponse | undefined) {
  if (!response) throw new Error('Route did not return a response');
  return response;
}

describe('Kanban project and card route contracts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setContext();
    mocks.getOwnedRecord.mockResolvedValue({ kind: 'owned', data: { id: PROJECT_ID, user_id: USER_ID } });
    mocks.builder.order.mockResolvedValue({ data: [projectRow], error: null });
    mocks.builder.single.mockResolvedValue({ data: projectRow, error: null });
    mocks.builder.maybeSingle.mockResolvedValue({ data: [projectRow], error: null });
  });

  it('requires authentication and does not return a cacheable response', async () => {
    mocks.getContext.mockResolvedValue({
      response: NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: { 'Cache-Control': 'no-store' } },
      ),
    });

    const response = required(await GET());

    expect(response.status).toBe(401);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ error: 'Unauthorized' });
  });

  it('rejects invalid project payloads before touching the database', async () => {
    const response = required(await PROJECTS_POST(request('POST', 'projects', {
      name: '',
      color: '#fff',
    })));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Project name and color are invalid' });
    expect(mocks.getContext).not.toHaveBeenCalled();
  });

  it('creates and lists only public, same-user project data', async () => {
    const createResponse = required(await PROJECTS_POST(request('POST', 'projects', {
      name: '  Projeto E2E  ',
      color: '#06b6d4',
    })));
    const listResponse = required(await GET());

    expect(createResponse.status).toBe(200);
    expect(await createResponse.json()).toEqual({
      success: true,
      project: {
        id: PROJECT_ID,
        name: 'Projeto E2E',
        color: '#06b6d4',
        createdAt: now,
        updatedAt: now,
      },
    });
    expect(mocks.builder.insert).toHaveBeenCalledWith({
      user_id: USER_ID,
      name: 'Projeto E2E',
      color: '#06b6d4',
    });
    expect(listResponse.status).toBe(200);
    expect((await listResponse.json()).projects[0]).not.toHaveProperty('user_id');
    expect(mocks.builder.eq).toHaveBeenCalledWith('user_id', USER_ID);
  });

  it('creates a project on the legacy schema without updated_at', async () => {
    const legacyProject = {
      id: PROJECT_ID,
      name: 'Projeto legado',
      color: '#06b6d4',
      created_at: now,
    };
    mocks.builder.single.mockResolvedValue({ data: legacyProject, error: null });

    const response = required(await PROJECTS_POST(request('POST', 'projects', {
      name: legacyProject.name,
      color: legacyProject.color,
    })));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      project: {
        id: PROJECT_ID,
        name: 'Projeto legado',
        color: '#06b6d4',
        createdAt: now,
        updatedAt: now,
      },
    });
    expect(mocks.builder.select).toHaveBeenCalledWith('id, name, color, created_at');
  });

  it('maps project database failures to a safe error', async () => {
    mocks.builder.single.mockResolvedValue({
      data: null,
      error: { code: 'PGRST500', message: 'secret database detail' },
    });

    const response = required(await PROJECTS_POST(request('POST', 'projects', {
      name: 'Projeto',
      color: '#06b6d4',
    })));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Unable to create project' });
  });

  it('blocks deletion of a project owned by another user', async () => {
    mocks.getOwnedRecord.mockResolvedValue({ kind: 'forbidden' });

    const response = required(await PROJECTS_DELETE(request('DELETE', 'projects', { projectId: OTHER_PROJECT_ID })));

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'You do not have access to this project' });
    expect(mocks.builder.update).not.toHaveBeenCalled();
  });

  it('rejects invalid cards and cross-user project references', async () => {
    const invalidResponse = required(await ADD_CARD(request('POST', 'add-card', {
      columnId: 'not-a-uuid',
      title: 'Card',
    })));
    expect(invalidResponse.status).toBe(400);

    mocks.getOwnedRecord
      .mockResolvedValueOnce({ kind: 'owned', data: { id: COLUMN_ID, user_id: USER_ID } })
      .mockResolvedValueOnce({ kind: 'forbidden' });
    const crossUserResponse = required(await ADD_CARD(request('POST', 'add-card', {
      columnId: COLUMN_ID,
      title: 'Card',
      projectId: OTHER_PROJECT_ID,
    })));

    expect(crossUserResponse.status).toBe(403);
    expect(await crossUserResponse.json()).toEqual({ error: 'You do not have access to this project' });
    expect(mocks.builder.insert).not.toHaveBeenCalled();
  });

  it('creates a same-user card with the real project relation and public DTO', async () => {
    mocks.getOwnedRecord
      .mockResolvedValueOnce({ kind: 'owned', data: { id: COLUMN_ID, user_id: USER_ID } })
      .mockResolvedValueOnce({ kind: 'owned', data: { id: PROJECT_ID, user_id: USER_ID } });
    mocks.builder.single.mockResolvedValue({ data: cardRow, error: null });

    const response = required(await ADD_CARD(request('POST', 'add-card', {
      columnId: COLUMN_ID,
      title: ' Card E2E ',
      projectId: PROJECT_ID,
      position: 0,
    })));

    expect(response.status).toBe(200);
    expect((await response.json()).card).toEqual(expect.objectContaining({
      id: CARD_ID,
      title: 'Card E2E',
      projectId: PROJECT_ID,
    }));
    expect(mocks.builder.insert).toHaveBeenCalledWith(expect.objectContaining({
      user_id: USER_ID,
      column_id: COLUMN_ID,
      project_id: PROJECT_ID,
    }));
  });

  it('clears a card project explicitly and validates a new project ownership', async () => {
    mocks.getOwnedRecord
      .mockResolvedValueOnce({ kind: 'owned', data: { id: CARD_ID, user_id: USER_ID } });
    mocks.builder.single.mockResolvedValue({ data: { ...cardRow, project_id: null }, error: null });

    const clearResponse = required(await UPDATE_CARD(request('POST', 'update-card', {
      cardId: CARD_ID,
      projectId: null,
    })));

    expect(clearResponse.status).toBe(200);
    expect(mocks.builder.update).toHaveBeenCalledWith(expect.objectContaining({ project_id: null }));

    mocks.getOwnedRecord
      .mockResolvedValueOnce({ kind: 'owned', data: { id: CARD_ID, user_id: USER_ID } })
      .mockResolvedValueOnce({ kind: 'forbidden' });
    const crossUserResponse = required(await UPDATE_CARD(request('POST', 'update-card', {
      cardId: CARD_ID,
      projectId: OTHER_PROJECT_ID,
    })));

    expect(crossUserResponse.status).toBe(403);
    expect(await crossUserResponse.json()).toEqual({ error: 'You do not have access to this project' });
  });

  it('does not leak database details from card persistence failures', async () => {
    mocks.getOwnedRecord.mockResolvedValue({ kind: 'owned', data: { id: COLUMN_ID, user_id: USER_ID } });
    mocks.builder.single.mockResolvedValue({
      data: null,
      error: { code: 'PGRST500', message: 'secret card database detail' },
    });

    const response = required(await ADD_CARD(request('POST', 'add-card', {
      columnId: COLUMN_ID,
      title: 'Card',
    })));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Unable to create card' });
  });
});