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