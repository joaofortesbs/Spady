import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { KanbanService } from './kanbanService';

const USER_ID = 'user-a';
const PROJECT_ID = 'project-a';
const now = '2026-09-08T12:00:00.000Z';

function serviceWith(builder: Record<string, ReturnType<typeof vi.fn>>) {
  return new KanbanService({
    from: vi.fn().mockReturnValue(builder),
  } as unknown as SupabaseClient, USER_ID);
}

describe('KanbanService projects and relations', () => {
  it('maps the confirmed database project ID and scopes reads by user', async () => {
    const order = vi.fn().mockResolvedValue({
      data: [{
        id: PROJECT_ID,
        name: 'Projeto',
        color: '#06b6d4',
        created_at: now,
        updated_at: now,
        user_id: USER_ID,
      }],
      error: null,
    });
    const select = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ order }) });
    const builder = {
      select,
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: {
              id: PROJECT_ID,
              name: 'Projeto',
              color: '#06b6d4',
              created_at: now,
              updated_at: now,
            },
            error: null,
          }),
        }),
      }),
    };
    const service = serviceWith(builder);

    await expect(service.loadProjects()).resolves.toEqual([expect.objectContaining({
      id: PROJECT_ID,
      name: 'Projeto',
    })]);
    const project = await service.addProject('Projeto', '#06b6d4');

    expect(project?.id).toBe(PROJECT_ID);
    expect(builder.insert).toHaveBeenCalledWith({
      user_id: USER_ID,
      name: 'Projeto',
      color: '#06b6d4',
    });
  });

  it('returns null or false when project persistence is not confirmed', async () => {
    const single = vi.fn().mockResolvedValue({ data: null, error: null });
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const builder = {
      insert: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single }) }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({ maybeSingle }),
          }),
        }),
      }),
      delete: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({ maybeSingle }),
          }),
        }),
      }),
    };
    const service = serviceWith(builder);

    await expect(service.addProject('Projeto', '#06b6d4')).resolves.toBeNull();
    await expect(service.updateProject(PROJECT_ID, { name: 'Novo nome' })).resolves.toBe(false);
    await expect(service.deleteProject(PROJECT_ID)).resolves.toBe(false);
  });

  it('clears a project relation with null instead of omitting it', async () => {
    const select = vi.fn().mockResolvedValue({ data: [{ id: 'card-a' }], error: null });
    const builder = {
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({ select }),
        }),
      }),
    };
    const service = serviceWith(builder);

    await expect(service.updateCard('card-a', { projectId: null })).resolves.toBe(true);
    expect(builder.update).toHaveBeenCalledWith(expect.objectContaining({ project_id: null }));
  });

  it('does not retry project creation and reports database errors as failure', async () => {
    const single = vi.fn().mockResolvedValue({
      data: null,
      error: { message: 'database unavailable' },
    });
    const builder = {
      insert: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single }) }),
    };
    const service = serviceWith(builder);

    await expect(service.addProject('Projeto', '#06b6d4')).resolves.toBeNull();
    expect(builder.insert).toHaveBeenCalledTimes(1);
  });
});