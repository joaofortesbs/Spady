import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => {
  const builder = {
    update: vi.fn(),
    eq: vi.fn(),
    select: vi.fn(),
    single: vi.fn(),
  };
  for (const method of ['update', 'eq', 'select']) {
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

import { POST } from './route';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const CARD_ID = '22222222-2222-4222-8222-222222222222';
const completedAt = '2026-09-08T12:00:00.000Z';

function request(payload: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/kanban/update-card', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

function required(response: NextResponse | undefined) {
  if (!response) throw new Error('Update-card route did not return a response');
  return response;
}

describe('update-card completion persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getContext.mockResolvedValue({
      context: {
        user: { id: USER_ID },
        supabase: { from: mocks.from },
      },
    });
    mocks.getOwnedRecord.mockResolvedValue({ kind: 'owned', data: { id: CARD_ID, user_id: USER_ID } });
  });

  it('sets and clears completed_at only for an owned card', async () => {
    const row = {
      id: CARD_ID,
      title: 'Card',
      description: '',
      priority: 'media',
      tags: [],
      subtasks: [],
      created_at: completedAt,
      updated_at: completedAt,
      project_id: null,
      due_date: null,
      completed_at: completedAt,
    };
    mocks.builder.single.mockResolvedValueOnce({ data: row, error: null });
    const setResponse = required(await POST(request({ cardId: CARD_ID, completedAt })));
    expect(setResponse.status).toBe(200);
    expect(mocks.getOwnedRecord).toHaveBeenCalledWith(expect.anything(), 'kanban_cards', CARD_ID, USER_ID);
    expect(mocks.builder.update).toHaveBeenCalledWith(expect.objectContaining({ completed_at: completedAt }));
    expect((await setResponse.json()).card.completedAt).toBe(completedAt);

    mocks.builder.single.mockResolvedValueOnce({ data: { ...row, completed_at: null }, error: null });
    const clearResponse = required(await POST(request({ cardId: CARD_ID, completedAt: null })));
    expect(clearResponse.status).toBe(200);
    expect(mocks.builder.update).toHaveBeenLastCalledWith(expect.objectContaining({ completed_at: null }));
    expect((await clearResponse.json()).card.completedAt).toBeNull();
  });
});