import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { KanbanService } from './kanbanService';

describe('KanbanService.deleteCard', () => {
  it('uses the authenticated server endpoint and requires confirmed success', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const service = new KanbanService({} as SupabaseClient, 'user-id');

    await expect(service.deleteCard('card-id')).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/kanban/delete-card',
      expect.objectContaining({
        method: 'DELETE',
        credentials: 'include',
        body: JSON.stringify({ cardId: 'card-id' }),
      }),
    );
  });

  it('returns false when the server does not confirm the deletion', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: 'Card not found' }), { status: 404 }),
      ),
    );

    const service = new KanbanService({} as SupabaseClient, 'user-id');

    await expect(service.deleteCard('card-id')).resolves.toBe(false);
  });
});

describe('KanbanService.updateColumn', () => {
  it('creates a column through the authenticated endpoint and maps its confirmation', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        success: true,
        column: {
          id: 'column-id',
          title: 'NOVA COLUNA',
          position: 4,
          behavior: 'completion',
          projectId: '11111111-1111-4111-8111-111111111111',
        },
      }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const service = new KanbanService({} as SupabaseClient, 'user-id');

    await expect(service.addColumn(
      'Nova coluna',
      4,
      'completion',
      '11111111-1111-4111-8111-111111111111',
    )).resolves.toEqual({
      id: 'column-id',
      title: 'NOVA COLUNA',
      cards: [],
      behavior: 'completion',
      projectId: '11111111-1111-4111-8111-111111111111',
    });
    expect(fetchMock).toHaveBeenCalledWith('/api/kanban/columns', expect.objectContaining({
      method: 'POST',
      credentials: 'include',
      body: JSON.stringify({
        title: 'Nova coluna',
        position: 4,
        behavior: 'completion',
        projectId: '11111111-1111-4111-8111-111111111111',
      }),
    }));
  });

  it('does not treat a response without a confirmed row as a successful creation', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true }), { status: 200 }),
    ));
    const service = new KanbanService({} as SupabaseClient, 'user-id');

    await expect(service.addColumn('Fantasma', 4)).resolves.toBeNull();
  });

  it('does not treat a progressive creation as successful when the response confirms active', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        success: true,
        column: { id: 'column-id', title: 'PROGRESSIVA', position: 4, behavior: 'active' },
      }), { status: 200 }),
    ));
    const service = new KanbanService({} as SupabaseClient, 'user-id');

    await expect(service.addColumn('Progressiva', 4, 'progressive')).resolves.toBeNull();
  });

  it('persists the progressive behavior and confirms the updated column', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        success: true,
        column: { id: 'column-id', behavior: 'progressive' },
      }), { status: 200 }),
    ));
    const supabase = {} as SupabaseClient;

    const service = new KanbanService(supabase, 'user-id');

    await expect(service.updateColumn('column-id', { behavior: 'progressive' })).resolves.toBe(true);
    expect(fetch).toHaveBeenCalledWith('/api/kanban/columns', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ columnId: 'column-id', behavior: 'progressive' }),
    }));
  });

  it('fails when the update response confirms a different behavior', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        success: true,
        column: { id: 'column-id', behavior: 'active' },
      }), { status: 200 }),
    ));
    const service = new KanbanService({} as SupabaseClient, 'user-id');

    await expect(service.updateColumn('column-id', { behavior: 'progressive' })).resolves.toBe(false);
  });

  it('fails when Supabase does not confirm an updated column', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: false }), { status: 409 }),
    ));
    const supabase = {} as SupabaseClient;

    const service = new KanbanService(supabase, 'user-id');

    await expect(service.updateColumn('column-id', { behavior: 'progressive' })).resolves.toBe(false);
  });
});