import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => {
  const selectBuilder = {
    select: vi.fn(),
    eq: vi.fn(),
    single: vi.fn(),
  };
  const deleteBuilder = {
    delete: vi.fn(),
    eq: vi.fn(),
    select: vi.fn(),
    maybeSingle: vi.fn(),
  };

  selectBuilder.select.mockReturnValue(selectBuilder);
  selectBuilder.eq.mockReturnValue(selectBuilder);
  deleteBuilder.delete.mockReturnValue(deleteBuilder);
  deleteBuilder.eq.mockReturnValue(deleteBuilder);
  deleteBuilder.select.mockReturnValue(deleteBuilder);

  return {
    getUser: vi.fn(),
    cookies: vi.fn(),
    serviceClient: {
      from: vi.fn((table: string) =>
        table === 'kanban_cards' && selectBuilder.single.mock.calls.length >= 0
          ? {
              select: selectBuilder.select,
              eq: selectBuilder.eq,
              single: selectBuilder.single,
              delete: deleteBuilder.delete,
            }
          : deleteBuilder,
      ),
    },
    selectBuilder,
    deleteBuilder,
  };
});

vi.mock('next/headers', () => ({
  cookies: mocks.cookies,
}));

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({
    auth: { getUser: mocks.getUser },
  })),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => mocks.serviceClient),
}));

import { DELETE } from './route';

function request(cardId = 'card-id') {
  return new NextRequest('http://localhost/api/kanban/delete-card', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cardId }),
  });
}

describe('/api/kanban/delete-card', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-key');
    mocks.cookies.mockResolvedValue({ getAll: vi.fn(), set: vi.fn() });
    mocks.getUser.mockResolvedValue({
      data: { user: { id: 'user-id' } },
      error: null,
    });
    mocks.selectBuilder.single.mockResolvedValue({
      data: { id: 'card-id', user_id: 'user-id' },
      error: null,
    });
    mocks.deleteBuilder.maybeSingle.mockResolvedValue({
      data: { id: 'card-id' },
      error: null,
    });
  });

  it('returns success only after a deleted row is confirmed', async () => {
    const response = await DELETE(request());

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toMatchObject({ success: true });
    expect(mocks.deleteBuilder.select).toHaveBeenCalledWith('id');
    expect(mocks.deleteBuilder.maybeSingle).toHaveBeenCalled();
  });

  it('rejects unauthenticated requests', async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'Not authenticated' },
    });

    const response = await DELETE(request());

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Unauthorized' });
  });

  it('rejects cards owned by another user', async () => {
    mocks.selectBuilder.single.mockResolvedValue({
      data: { id: 'card-id', user_id: 'other-user-id' },
      error: null,
    });

    const response = await DELETE(request());

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: expect.stringContaining('not owned') });
    expect(mocks.deleteBuilder.maybeSingle).not.toHaveBeenCalled();
  });

  it('returns not found when the card lookup has no row', async () => {
    mocks.selectBuilder.single.mockResolvedValue({
      data: null,
      error: { code: 'PGRST116', message: 'No rows' },
    });

    const response = await DELETE(request());

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Card not found' });
  });

  it('returns an infrastructure error when deletion fails', async () => {
    mocks.deleteBuilder.maybeSingle.mockResolvedValue({
      data: null,
      error: { code: 'PGRST500', message: 'database unavailable' },
    });

    const response = await DELETE(request());

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Unable to delete card' });
  });

  it('does not report success when the delete affects no row', async () => {
    mocks.deleteBuilder.maybeSingle.mockResolvedValue({ data: null, error: null });

    const response = await DELETE(request());

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Card was not deleted' });
  });
});