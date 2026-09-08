import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useBlindadosData } from './useBlindadosData';
import { KanbanService } from '@/lib/services/kanbanService';
import { getUserDataCacheKey } from '@/lib/utils/storage.constants';

const auth = { user: null as { id: string } | null };
const pomodoroData = {
  success: true,
  settings: {
    categories: [],
    intervals: { shortBreak: 5, longBreak: 15, cyclesUntilLongBreak: 4 },
  },
  sessions: [],
};

vi.mock('@/lib/contexts/AuthContext', () => ({
  useAuth: () => ({ user: auth.user }),
}));

vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(() => ({})),
}));

vi.mock('@/lib/services/pomodoroService', () => ({
  PomodoroService: vi.fn().mockImplementation(() => ({
    loadData: vi.fn().mockResolvedValue({
      settings: pomodoroData.settings,
      sessions: [],
    }),
  })),
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn() },
}));

const column = {
  id: '11111111-1111-4111-8111-111111111111',
  title: 'A FAZER',
  behavior: 'active' as const,
  cards: [{
    id: '22222222-2222-4222-8222-222222222222',
    title: 'Card',
    description: '',
    priority: 'media' as const,
    tags: [],
    subtasks: [],
    createdAt: '2026-09-08T12:00:00.000Z',
    updatedAt: '2026-09-08T12:00:00.000Z',
    projectId: '33333333-3333-4333-8333-333333333333',
    dueDate: null,
    completedAt: null,
  }],
};

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function urlOf(input: RequestInfo | URL) {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

describe('useBlindadosData project synchronization', () => {
  beforeEach(() => {
    cleanup();
    localStorage.clear();
    auth.user = { id: 'user-a' };
    vi.spyOn(KanbanService.prototype, 'loadColumns').mockResolvedValue([column]);
    vi.spyOn(KanbanService.prototype, 'loadProjects').mockResolvedValue([]);
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      const url = urlOf(input);
      if (url === '/api/pomodoro/get-settings') return Promise.resolve(response(pomodoroData));
      return Promise.resolve(response({ success: false, error: 'unexpected request' }, 500));
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    auth.user = null;
  });

  it('replaces the optimistic project with the confirmed database ID', async () => {
    const persisted = {
      id: '44444444-4444-4444-8444-444444444444',
      name: 'Projeto confirmado',
      color: '#06b6d4',
      createdAt: '2026-09-08T12:00:00.000Z',
    };
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation((input) => {
      const url = urlOf(input);
      if (url === '/api/pomodoro/get-settings') return Promise.resolve(response(pomodoroData));
      return Promise.resolve(response({ success: true, project: persisted }));
    });
    const { result } = renderHook(() => useBlindadosData());

    await waitFor(() => expect(result.current.isLoaded).toBe(true));
    let mutation;
    await act(async () => {
      mutation = await result.current.addProject('Projeto confirmado', '#06b6d4');
    });

    expect(mutation).toEqual({ success: true, data: persisted });
    expect(result.current.data.kanban.projects).toEqual([persisted]);
    expect(result.current.data.kanban.projects[0].id).toBe(persisted.id);
    expect(fetchMock).toHaveBeenCalledWith('/api/kanban/projects', expect.objectContaining({
      method: 'POST',
      credentials: 'include',
    }));
  });

  it('rolls back an optimistic project after a failed request', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation((input) => {
      const url = urlOf(input);
      if (url === '/api/pomodoro/get-settings') return Promise.resolve(response(pomodoroData));
      return Promise.resolve(response({ success: false, error: 'Projeto duplicado' }, 409));
    });
    const { result } = renderHook(() => useBlindadosData());

    await waitFor(() => expect(result.current.isLoaded).toBe(true));
    await act(async () => {
      const mutation = await result.current.addProject('Projeto inválido', '#06b6d4');
      expect(mutation.success).toBe(false);
    });

    expect(result.current.data.kanban.projects).toEqual([]);
    expect(fetchMock.mock.calls.filter(([url]) => url === '/api/kanban/projects')).toHaveLength(1);
  });

  it('blocks duplicate project submissions while the first operation is pending', async () => {
    let resolveProject!: (value: Response) => void;
    const pendingResponse = new Promise<Response>(resolve => { resolveProject = resolve; });
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation((input) => {
      const url = urlOf(input);
      if (url === '/api/pomodoro/get-settings') return Promise.resolve(response(pomodoroData));
      return pendingResponse;
    });
    const { result } = renderHook(() => useBlindadosData());
    await waitFor(() => expect(result.current.isLoaded).toBe(true));

    let first!: Promise<unknown>;
    await act(async () => {
      first = result.current.addProject('Primeiro', '#06b6d4');
      const second = await result.current.addProject('Segundo', '#ef4444');
      expect(second).toEqual(expect.objectContaining({ success: false }));
    });
    expect(fetchMock.mock.calls.filter(([url]) => url === '/api/kanban/projects')).toHaveLength(1);

    resolveProject(response({
      success: true,
      project: {
        id: '55555555-5555-4555-8555-555555555555',
        name: 'Primeiro',
        color: '#06b6d4',
        createdAt: '2026-09-08T12:00:00.000Z',
      },
    }));
    await act(async () => { await first; });
  });

  it('keeps caches isolated per user and clears a card project explicitly', async () => {
    const projectA = {
      id: '66666666-6666-4666-8666-666666666666',
      name: 'Projeto A',
      color: '#06b6d4',
      createdAt: '2026-09-08T12:00:00.000Z',
    };
    localStorage.setItem(getUserDataCacheKey('user-a'), JSON.stringify({
      kanban: { columns: [column], projects: [projectA] },
      pomodoro: pomodoroData,
      lastUpdated: '2026-09-08T12:00:00.000Z',
    }));
    const { result, rerender } = renderHook(() => useBlindadosData());

    expect(result.current.data.kanban.projects).toEqual([projectA]);
    auth.user = { id: 'user-b' };
    await act(async () => rerender());

    await waitFor(() => {
      expect(result.current.data.kanban.projects).toEqual([]);
      expect(result.current.data.kanban.columns).toEqual([column]);
    });
    expect(localStorage.getItem(getUserDataCacheKey('user-a'))).toContain(projectA.id);
    expect(localStorage.getItem(getUserDataCacheKey('user-b'))).toBeTruthy();
  });
});