import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useBlindadosData } from './useBlindadosData';
import { KanbanColumnSaveError, KanbanService } from '@/lib/services/kanbanService';
import { getUserDataCacheKey } from '@/lib/utils/storage.constants';
import { toast } from 'sonner';

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
const secondColumn = {
  ...column,
  id: '77777777-7777-4777-8777-777777777777',
  title: 'EM PROGRESSO',
  cards: [],
};
const thirdColumn = {
  ...column,
  id: '99999999-9999-4999-8999-999999999999',
  title: 'CONCLUÍDO',
  cards: [],
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

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

const projectA = '33333333-3333-4333-8333-333333333333';
const projectB = '55555555-5555-4555-8555-555555555555';
const newCard = (projectId: string | null = projectA) => ({
  title: 'Criado durante transferência',
  description: 'Descrição preservada',
  priority: 'alta' as const,
  tags: ['importante'],
  subtasks: [{ id: 'subtask-hidden', title: 'Subtarefa preservada', completed: false }],
  projectId,
  dueDate: '2026-10-01',
  completedAt: '2026-09-09T12:00:00.000Z',
});

function persistedCard(projectId: string | null) {
  return {
    ...newCard(projectId),
    id: '66666666-6666-4666-8666-666666666666',
    createdAt: '2026-09-09T12:00:00.000Z',
    updatedAt: '2026-09-09T12:00:00.000Z',
  };
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

  it('saves project metadata without changing card associations or unrelated fields', async () => {
    const project = { id: projectA, name: 'Anterior', color: '#06b6d4', createdAt: '2026-10-02' };
    vi.mocked(KanbanService.prototype.loadProjects).mockResolvedValue([project]);
    vi.spyOn(KanbanService.prototype, 'saveProject').mockResolvedValue({
      success: true, data: { project: { ...project, name: 'Novo' }, columns: [], cards: [] },
    });
    const { result } = renderHook(() => useBlindadosData());
    await waitFor(() => expect(result.current.isLoaded).toBe(true));
    const before = result.current.data.kanban.columns;
    await act(async () => {
      expect((await result.current.updateProject(projectA, {
        name: 'Novo', expected: { name: 'Anterior' }, columnChanges: [],
      })).success).toBe(true);
    });
    expect(result.current.data.kanban.projects[0].name).toBe('Novo');
    expect(result.current.data.kanban.columns).toEqual(before);
    expect(JSON.parse(localStorage.getItem(getUserDataCacheKey('user-a'))!).kanban.projects[0].name).toBe('Novo');
  });

  it('keeps the entire board unchanged when atomic project saving is unavailable', async () => {
    const project = { id: projectA, name: 'Anterior', color: '#06b6d4', createdAt: '2026-10-02' };
    vi.mocked(KanbanService.prototype.loadProjects).mockResolvedValue([project]);
    vi.spyOn(KanbanService.prototype, 'saveProject').mockResolvedValue({ success: false, error: 'SQL indisponível' });
    const { result } = renderHook(() => useBlindadosData());
    await waitFor(() => expect(result.current.isLoaded).toBe(true));
    const before = result.current.data.kanban;
    await act(async () => {
      expect(await result.current.updateProject(projectA, {
        name: 'Novo', expected: { name: 'Anterior' },
        columnChanges: [{ columnId: column.id, expectedProjectId: null, projectId: projectA }],
      })).toEqual({ success: false, error: 'SQL indisponível' });
    });
    expect(result.current.data.kanban).toEqual(before);
  });

  it('keeps the destination project after a subsequent independent card edit fails', async () => {
    const destinationId = '77777777-7777-4777-8777-777777777777';
    vi.mocked(KanbanService.prototype.loadColumns).mockResolvedValue([
      { ...column, projectId: projectA },
      { ...column, id: destinationId, projectId: projectB, cards: [] },
    ]);
    vi.mocked(fetch).mockImplementation(input => {
      if (urlOf(input) === '/api/pomodoro/get-settings') return Promise.resolve(response(pomodoroData));
      if (urlOf(input) === '/api/kanban/move-card') return Promise.resolve(response({ success: true }));
      return Promise.resolve(response({ success: false, error: 'Rejected' }, 403));
    });
    const { result } = renderHook(() => useBlindadosData());
    await waitFor(() => expect(result.current.isLoaded).toBe(true));
    await act(async () => { await result.current.moveCard(column.cards[0].id, column.id, destinationId, 0); });
    await act(async () => {
      await result.current.updateKanbanCard(destinationId, column.cards[0].id, { projectId: null });
    });
    expect(result.current.data.kanban.columns[1].cards[0].projectId).toBe(projectB);
  });

  it('queues a create behind atomic project editing and inherits the confirmed destination', async () => {
    const project = { id: projectB, name: 'Destino', color: '#06b6d4', createdAt: '2026-10-02' };
    vi.mocked(KanbanService.prototype.loadProjects).mockResolvedValue([project]);
    vi.mocked(KanbanService.prototype.loadColumns).mockResolvedValue([{ ...column, projectId: projectA }]);
    const saved = { project, columns: [{ id: column.id, projectId: projectB }],
      cards: column.cards.map(card => ({ id: card.id, columnId: column.id, projectId: projectB })) };
    const save = deferred<{ success: boolean; data: typeof saved }>();
    const saveProject = vi.spyOn(KanbanService.prototype, 'saveProject').mockReturnValue(save.promise);
    vi.mocked(fetch).mockImplementation((input, options) => {
      if (urlOf(input) === '/api/pomodoro/get-settings') return Promise.resolve(response(pomodoroData));
      if (urlOf(input) === '/api/kanban/add-card') {
        const request = JSON.parse(options!.body as string);
        return Promise.resolve(response({ success: true, card: persistedCard(request.projectId) }));
      }
      return Promise.resolve(response({ success: false }, 500));
    });
    const { result } = renderHook(() => useBlindadosData());
    await waitFor(() => expect(result.current.isLoaded).toBe(true));
    let editing: ReturnType<typeof result.current.updateProject>;
    let creating: Promise<void>;
    act(() => {
      editing = result.current.updateProject(projectB, {
        expected: {}, columnChanges: [{ columnId: column.id, expectedProjectId: projectA, projectId: projectB }],
      });
    });
    await waitFor(() => expect(saveProject).toHaveBeenCalledTimes(1));
    act(() => { creating = result.current.addKanbanCard(column.id, newCard(projectA)); });
    expect(vi.mocked(fetch).mock.calls.some(([input]) => urlOf(input) === '/api/kanban/add-card')).toBe(false);
    await act(async () => {
      save.resolve({ success: true, data: saved });
      await editing;
      await creating;
    });
    expect(result.current.data.kanban.columns[0].projectId).toBe(projectB);
    expect(result.current.data.kanban.columns[0].cards.every(card => card.projectId === projectB)).toBe(true);
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

  it('replaces an optimistic column with the confirmed row and preserves project and behavior', async () => {
    const persistedColumn = {
      id: '77777777-7777-4777-8777-777777777777',
      title: 'REVISÃO',
      cards: [],
      behavior: 'progressive' as const,
      projectId: '33333333-3333-4333-8333-333333333333',
    };
    const addColumn = vi.spyOn(KanbanService.prototype, 'addColumn').mockResolvedValue(persistedColumn);
    const { result } = renderHook(() => useBlindadosData());
    await waitFor(() => expect(result.current.isLoaded).toBe(true));

    let success = false;
    await act(async () => {
      success = await result.current.addKanbanColumn(
        'Revisão',
        'progressive',
        persistedColumn.projectId,
      );
    });

    expect(success).toBe(true);
    expect(addColumn).toHaveBeenCalledWith('Revisão', 1, 'progressive', persistedColumn.projectId);
    expect(result.current.data.kanban.columns).toEqual([column, persistedColumn]);
    expect(localStorage.getItem(getUserDataCacheKey('user-a'))).toContain(persistedColumn.id);
  });

  it('keeps a confirmed progressive behavior in state and cache', async () => {
    const updateColumn = vi.spyOn(KanbanService.prototype, 'updateColumn').mockResolvedValue(true);
    const { result } = renderHook(() => useBlindadosData());
    await waitFor(() => expect(result.current.isLoaded).toBe(true));

    let success = false;
    await act(async () => {
      success = await result.current.updateKanbanColumn(column.id, { behavior: 'progressive' });
    });

    expect(success).toBe(true);
    expect(updateColumn).toHaveBeenCalledWith(column.id, { behavior: 'progressive' });
    expect(result.current.data.kanban.columns[0].behavior).toBe('progressive');
    expect(localStorage.getItem(getUserDataCacheKey('user-a'))).toContain('"behavior":"progressive"');
  });

  it('moves every loaded card and persists normalized name and color in the cache', async () => {
    vi.spyOn(KanbanService.prototype, 'updateColumn').mockResolvedValue(true);
    const { result } = renderHook(() => useBlindadosData());
    await waitFor(() => expect(result.current.isLoaded).toBe(true));
    await act(async () => {
      expect(await result.current.updateKanbanColumn(column.id, {
        projectId: null, title: '  revisao  ', backgroundColor: '#ABCDEF',
      })).toBe(true);
    });
    const edited = result.current.data.kanban.columns[0];
    expect(edited.title).toBe('REVISAO');
    expect(edited.backgroundColor).toBe('#abcdef');
    expect(edited.projectId).toBeNull();
    expect(edited.cards).toEqual(column.cards.map(card => ({ ...card, projectId: null })));
    const cached = JSON.parse(localStorage.getItem(getUserDataCacheKey('user-a'))!);
    expect(cached.kanban.columns[0].cards[0].projectId).toBeNull();
    expect(cached.kanban.columns[0].backgroundColor).toBe('#abcdef');
  });

  it('rolls back both the column project and every card project on a failed transfer', async () => {
    vi.spyOn(KanbanService.prototype, 'updateColumn').mockResolvedValue(false);
    const { result } = renderHook(() => useBlindadosData());
    await waitFor(() => expect(result.current.isLoaded).toBe(true));
    await act(async () => {
      expect(await result.current.updateKanbanColumn(column.id, { projectId: null })).toBe(false);
    });
    expect(result.current.data.kanban.columns[0].projectId).toBeUndefined();
    expect(result.current.data.kanban.columns[0].cards).toEqual(column.cards);
    expect(localStorage.getItem(getUserDataCacheKey('user-a'))).toContain(column.cards[0].projectId);
  });

  it('waits for the full create response before persisting a later transfer and keeps its optimistic project', async () => {
    vi.mocked(KanbanService.prototype.loadColumns).mockResolvedValue([{ ...column, projectId: projectA }]);
    const createResponse = deferred<Response>();
    const transferResponse = deferred<boolean>();
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation(input => {
      const url = urlOf(input);
      if (url === '/api/pomodoro/get-settings') return Promise.resolve(response(pomodoroData));
      if (url === '/api/kanban/add-card') return createResponse.promise;
      return Promise.resolve(response({ success: false, error: 'unexpected request' }, 500));
    });
    const updateColumn = vi.spyOn(KanbanService.prototype, 'updateColumn').mockReturnValue(transferResponse.promise);
    const { result } = renderHook(() => useBlindadosData());
    await waitFor(() => expect(result.current.isLoaded).toBe(true));

    let creation!: Promise<void>, transfer!: Promise<boolean>;
    act(() => { creation = result.current.addKanbanCard(column.id, newCard()); });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/kanban/add-card', expect.anything()));
    act(() => { transfer = result.current.updateKanbanColumn(column.id, { projectId: projectB }); });
    expect(updateColumn).not.toHaveBeenCalled();

    const request = JSON.parse((fetchMock.mock.calls.find(([input]) =>
      urlOf(input) === '/api/kanban/add-card')?.[1] as RequestInit).body as string);
    expect(request).toMatchObject({
      projectId: projectA,
      description: 'Descrição preservada',
      priority: 'alta',
      tags: ['importante'],
      subtasks: newCard().subtasks,
      dueDate: '2026-10-01',
      completedAt: '2026-09-09T12:00:00.000Z',
    });

    await act(async () => {
      createResponse.resolve(response({ success: true, card: persistedCard(projectA) }));
      await creation;
      await waitFor(() => expect(updateColumn).toHaveBeenCalledTimes(1));
    });
    expect(result.current.data.kanban.columns[0].cards.filter(card => card.id === persistedCard(projectA).id))
      .toEqual([expect.objectContaining({ id: persistedCard(projectA).id, projectId: projectB })]);
    expect(result.current.data.kanban.columns[0].cards.some(card => card.id.startsWith('temp-'))).toBe(false);

    await act(async () => {
      transferResponse.resolve(true);
      await expect(transfer).resolves.toBe(true);
    });
    const cached = JSON.parse(localStorage.getItem(getUserDataCacheKey('user-a'))!);
    expect(cached.kanban.columns[0].cards.filter((card: { id: string }) => card.id === persistedCard(projectA).id))
      .toHaveLength(1);
    expect(cached.kanban.columns[0].cards[1].projectId).toBe(projectB);

    vi.mocked(KanbanService.prototype.loadColumns).mockResolvedValue([{
      ...column,
      projectId: projectB,
      cards: [...column.cards, persistedCard(projectB)],
    }]);
    await act(async () => { await result.current.forceSync(); });
    expect(result.current.data.kanban.columns[0].cards.find(card => card.id === persistedCard(projectA).id)?.projectId)
      .toBe(projectB);
  });

  it.each([
    ['confirmed destination', projectB, true],
    ['explicitly cleared association', null, true],
    ['last confirmed project after failed transfer', projectA, false],
  ] as const)('resolves a queued create against the %s', async (_label, expectedProject, succeeds) => {
    const transferResponse = deferred<boolean>();
    const fetchMock = vi.mocked(fetch);
    const createResponse = deferred<Response>();
    vi.mocked(KanbanService.prototype.loadColumns).mockResolvedValue([{ ...column, projectId: projectA }]);
    fetchMock.mockImplementation(input => {
      const url = urlOf(input);
      if (url === '/api/pomodoro/get-settings') return Promise.resolve(response(pomodoroData));
      if (url === '/api/kanban/add-card') return createResponse.promise;
      return Promise.resolve(response({ success: false, error: 'unexpected request' }, 500));
    });
    vi.spyOn(KanbanService.prototype, 'updateColumn').mockReturnValue(transferResponse.promise);
    const { result } = renderHook(() => useBlindadosData());
    await waitFor(() => expect(result.current.isLoaded).toBe(true));

    let transfer!: Promise<boolean>, creation!: Promise<void>;
    act(() => {
      transfer = result.current.updateKanbanColumn(column.id, { projectId: succeeds ? expectedProject : projectB });
      creation = result.current.addKanbanCard(column.id, newCard());
    });
    expect(fetchMock).not.toHaveBeenCalledWith('/api/kanban/add-card', expect.anything());
    await act(async () => {
      transferResponse.resolve(succeeds);
      await expect(transfer).resolves.toBe(succeeds);
      await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/kanban/add-card', expect.anything()));
    });

    const request = JSON.parse((fetchMock.mock.calls.find(([input]) =>
      urlOf(input) === '/api/kanban/add-card')?.[1] as RequestInit).body as string);
    expect(request.projectId).toBe(expectedProject);
    const saved = persistedCard(expectedProject);
    await act(async () => {
      createResponse.resolve(response({ success: true, card: saved }));
      await creation;
    });
    const finalColumn = result.current.data.kanban.columns[0];
    expect(finalColumn.cards.filter(card => card.id === saved.id)).toHaveLength(1);
    expect(finalColumn.cards.some(card => card.id.startsWith('temp-'))).toBe(false);
    expect(finalColumn.cards.find(card => card.id === saved.id)?.projectId).toBe(expectedProject);
  });

  it('does not apply a pending create response or cache write after the owner changes', async () => {
    const createResponse = deferred<Response>();
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation(input => {
      const url = urlOf(input);
      if (url === '/api/pomodoro/get-settings') return Promise.resolve(response(pomodoroData));
      if (url === '/api/kanban/add-card') return createResponse.promise;
      return Promise.resolve(response({ success: false, error: 'unexpected request' }, 500));
    });
    const loadColumns = vi.mocked(KanbanService.prototype.loadColumns);
    const { result, rerender } = renderHook(() => useBlindadosData());
    await waitFor(() => expect(result.current.isLoaded).toBe(true));

    let creation!: Promise<void>;
    act(() => { creation = result.current.addKanbanCard(column.id, newCard()); });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/kanban/add-card', expect.anything()));
    auth.user = { id: 'user-b' };
    rerender();
    await waitFor(() => expect(loadColumns).toHaveBeenCalledTimes(2));
    await act(async () => {
      createResponse.resolve(response({ success: true, card: persistedCard(projectA) }));
      await creation;
    });

    expect(result.current.data.kanban.columns[0].cards.some(card => card.id === persistedCard(projectA).id)).toBe(false);
    const ownerBCache = localStorage.getItem(getUserDataCacheKey('user-b')) ?? '';
    expect(ownerBCache).not.toContain(persistedCard(projectA).id);
    expect(ownerBCache).not.toContain(newCard().title);
  });

  it('clears an intentional card project choice in a column without a project', async () => {
    const manualProject = '88888888-8888-4888-8888-888888888888';
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation(input => {
      const url = urlOf(input);
      if (url === '/api/pomodoro/get-settings') return Promise.resolve(response(pomodoroData));
      if (url === '/api/kanban/add-card') {
        return Promise.resolve(response({ success: true, card: persistedCard(null) }));
      }
      return Promise.resolve(response({ success: false, error: 'unexpected request' }, 500));
    });
    const { result } = renderHook(() => useBlindadosData());
    await waitFor(() => expect(result.current.isLoaded).toBe(true));

    await act(async () => {
      await result.current.addKanbanCard(column.id, newCard(manualProject));
    });
    const request = JSON.parse((fetchMock.mock.calls.find(([input]) =>
      urlOf(input) === '/api/kanban/add-card')?.[1] as RequestInit).body as string);
    expect(request.projectId).toBeNull();
    expect(result.current.data.kanban.columns[0].cards.find(card => card.id === persistedCard(null).id)?.projectId)
      .toBeNull();
  });

  it('does not retry an ambiguous failed create request and removes its temporary card', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation(input => {
      const url = urlOf(input);
      if (url === '/api/pomodoro/get-settings') return Promise.resolve(response(pomodoroData));
      if (url === '/api/kanban/add-card') return Promise.resolve(response({ success: false, error: 'Unknown outcome' }, 503));
      return Promise.resolve(response({ success: false, error: 'unexpected request' }, 500));
    });
    const { result } = renderHook(() => useBlindadosData());
    await waitFor(() => expect(result.current.isLoaded).toBe(true));

    await act(async () => { await result.current.addKanbanCard(column.id, newCard()); });
    expect(fetchMock.mock.calls.filter(([input]) => urlOf(input) === '/api/kanban/add-card')).toHaveLength(1);
    expect(result.current.data.kanban.columns[0].cards.some(card =>
      card.id.startsWith('temp-') || card.title === newCard().title)).toBe(false);
  });

  it('restores a newly created real card and its cache after the following transfer fails', async () => {
    const createResponse = deferred<Response>();
    const transferResponse = deferred<boolean>();
    vi.mocked(KanbanService.prototype.loadColumns).mockResolvedValue([{ ...column, projectId: projectA }]);
    vi.mocked(fetch).mockImplementation(input => urlOf(input) === '/api/kanban/add-card'
      ? createResponse.promise
      : Promise.resolve(response(pomodoroData)));
    const updateColumn = vi.spyOn(KanbanService.prototype, 'updateColumn').mockReturnValue(transferResponse.promise);
    const { result } = renderHook(() => useBlindadosData());
    await waitFor(() => expect(result.current.isLoaded).toBe(true));

    let creation!: Promise<void>, transfer!: Promise<boolean>;
    act(() => {
      creation = result.current.addKanbanCard(column.id, newCard());
      transfer = result.current.updateKanbanColumn(column.id, { projectId: projectB });
    });
    await act(async () => {
      createResponse.resolve(response({ success: true, card: persistedCard(projectA) }));
      await creation;
    });
    await waitFor(() => expect(updateColumn).toHaveBeenCalledTimes(1));
    await act(async () => {
      transferResponse.resolve(false);
      await expect(transfer).resolves.toBe(false);
    });

    const expectedCards = [...column.cards, persistedCard(projectA)];
    expect(result.current.data.kanban.columns[0].cards).toEqual(expectedCards);
    const cached = JSON.parse(localStorage.getItem(getUserDataCacheKey('user-a'))!);
    expect(cached.kanban.columns[0].cards).toEqual(expectedCards);
    const loadColumns = vi.mocked(KanbanService.prototype.loadColumns);
    loadColumns.mockClear();
    await act(async () => {
      const sync = result.current.forceSync();
      expect(loadColumns).toHaveBeenCalledTimes(1);
      await sync;
    });
  });

  it.each([true, false])('keeps the correct confirmed project through B/create/C (B succeeds=%s)', async bSucceeds => {
    const transferB = deferred<boolean>();
    const transferC = deferred<boolean>();
    const createResponse = deferred<Response>();
    const projectC = '88888888-8888-4888-8888-888888888888';
    vi.mocked(KanbanService.prototype.loadColumns).mockResolvedValue([{ ...column, projectId: projectA }]);
    const updateColumn = vi.spyOn(KanbanService.prototype, 'updateColumn')
      .mockReturnValueOnce(transferB.promise)
      .mockReturnValueOnce(transferC.promise);
    vi.mocked(fetch).mockImplementation(input => urlOf(input) === '/api/kanban/add-card'
      ? createResponse.promise
      : Promise.resolve(response(pomodoroData)));
    const { result } = renderHook(() => useBlindadosData());
    await waitFor(() => expect(result.current.isLoaded).toBe(true));

    let firstTransfer!: Promise<boolean>, secondTransfer!: Promise<boolean>, creation!: Promise<void>;
    act(() => {
      firstTransfer = result.current.updateKanbanColumn(column.id, { projectId: projectB });
      creation = result.current.addKanbanCard(column.id, newCard());
      secondTransfer = result.current.updateKanbanColumn(column.id, { projectId: projectC });
    });
    await act(async () => {
      transferB.resolve(bSucceeds);
      await expect(firstTransfer).resolves.toBe(bSucceeds);
    });
    await waitFor(() => expect(vi.mocked(fetch).mock.calls.some(([input]) =>
      urlOf(input) === '/api/kanban/add-card')).toBe(true));
    const createRequest = JSON.parse((vi.mocked(fetch).mock.calls.find(([input]) =>
      urlOf(input) === '/api/kanban/add-card')?.[1] as RequestInit).body as string);
    expect(createRequest.projectId).toBe(bSucceeds ? projectB : projectA);

    await act(async () => {
      createResponse.resolve(response({ success: true, card: persistedCard(createRequest.projectId) }));
      await creation;
    });
    await waitFor(() => expect(updateColumn).toHaveBeenCalledTimes(2));
    await act(async () => {
      transferC.resolve(!bSucceeds);
      await expect(secondTransfer).resolves.toBe(!bSucceeds);
    });

    expect(result.current.data.kanban.columns[0].cards
      .find(card => card.id === persistedCard(null).id)?.projectId)
      .toBe(bSucceeds ? projectB : projectC);
  });

  it('serializes simultaneous creates in one column and replaces both temporary IDs uniquely', async () => {
    const firstResponse = deferred<Response>();
    const secondCard = { ...persistedCard(null), id: '88888888-8888-4888-8888-888888888888' };
    const fetchMock = vi.mocked(fetch);
    let createCalls = 0;
    fetchMock.mockImplementation(input => {
      const url = urlOf(input);
      if (url === '/api/pomodoro/get-settings') return Promise.resolve(response(pomodoroData));
      if (url === '/api/kanban/add-card') {
        createCalls++;
        return createCalls === 1
          ? firstResponse.promise
          : Promise.resolve(response({ success: true, card: secondCard }));
      }
      return Promise.resolve(response({ success: false, error: 'unexpected request' }, 500));
    });
    const { result } = renderHook(() => useBlindadosData());
    await waitFor(() => expect(result.current.isLoaded).toBe(true));

    let first!: Promise<void>, second!: Promise<void>;
    act(() => {
      first = result.current.addKanbanCard(column.id, newCard());
      second = result.current.addKanbanCard(column.id, newCard(null));
    });
    await waitFor(() => expect(createCalls).toBe(1));
    expect(result.current.data.kanban.columns[0].cards).toHaveLength(3);
    await act(async () => {
      firstResponse.resolve(response({ success: true, card: persistedCard(projectA) }));
      await first;
      await second;
    });

    const cards = result.current.data.kanban.columns[0].cards;
    const ids = cards.map(card => card.id);
    expect(new Set(ids).size).toBe(3);
    expect(ids).toContain(persistedCard(projectA).id);
    expect(ids).toContain(secondCard.id);
    expect(ids.some(id => id.startsWith('temp-'))).toBe(false);
    const cached = JSON.parse(localStorage.getItem(getUserDataCacheKey('user-a'))!);
    expect(cached.kanban.columns[0].cards).toHaveLength(3);
  });

  it('ignores an old owner transfer response before resolving the new owner queued create', async () => {
    const staleTransfer = deferred<boolean>();
    const failedClear = deferred<boolean>();
    vi.mocked(KanbanService.prototype.loadColumns).mockResolvedValue([{ ...column, projectId: projectA }]);
    const updateColumn = vi.spyOn(KanbanService.prototype, 'updateColumn')
      .mockReturnValueOnce(staleTransfer.promise)
      .mockReturnValueOnce(failedClear.promise);
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation((input, init) => {
      const url = urlOf(input);
      if (url === '/api/pomodoro/get-settings') return Promise.resolve(response(pomodoroData));
      if (url === '/api/kanban/add-card') {
        const request = JSON.parse(init?.body as string);
        return Promise.resolve(response({ success: true, card: persistedCard(request.projectId) }));
      }
      return Promise.resolve(response({ success: false, error: 'unexpected request' }, 500));
    });
    const { result, rerender } = renderHook(() => useBlindadosData());
    await waitFor(() => expect(result.current.isLoaded).toBe(true));

    let oldTransfer!: Promise<boolean>;
    act(() => { oldTransfer = result.current.updateKanbanColumn(column.id, { projectId: projectB }); });
    await waitFor(() => expect(updateColumn).toHaveBeenCalledTimes(1));
    auth.user = { id: 'user-b' };
    rerender();
    await waitFor(() => expect(KanbanService.prototype.loadColumns).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.data.kanban.columns[0].projectId).toBe(projectA));
    await act(async () => {
      staleTransfer.resolve(true);
      await expect(oldTransfer).resolves.toBe(false);
    });

    let clear!: Promise<boolean>, creation!: Promise<void>;
    act(() => {
      clear = result.current.updateKanbanColumn(column.id, { projectId: null });
      creation = result.current.addKanbanCard(column.id, newCard());
    });
    await waitFor(() => expect(updateColumn).toHaveBeenCalledTimes(2));
    await act(async () => {
      failedClear.resolve(false);
      await expect(clear).resolves.toBe(false);
      await creation;
    });

    const request = JSON.parse((fetchMock.mock.calls.find(([input]) =>
      urlOf(input) === '/api/kanban/add-card')?.[1] as RequestInit).body as string);
    expect(request.projectId).toBe(projectA);
    expect(result.current.data.kanban.columns[0].cards
      .find(card => card.id === persistedCard(projectA).id)?.projectId)
      .toBe(projectA);
    const ownerBCache = JSON.parse(localStorage.getItem(getUserDataCacheKey('user-b'))!);
    expect(ownerBCache.kanban.columns[0].cards
      .find((card: { id: string }) => card.id === persistedCard(projectA).id)?.projectId)
      .toBe(projectA);
  });

  it('releases the column queue and pending-sync guard when creation rejects', async () => {
    let rejectCreate!: (reason: Error) => void;
    const createResponse = new Promise<Response>((_resolve, reject) => { rejectCreate = reject; });
    vi.mocked(fetch).mockImplementation(input => urlOf(input) === '/api/kanban/add-card'
      ? createResponse
      : Promise.resolve(response(pomodoroData)));
    const updateColumn = vi.spyOn(KanbanService.prototype, 'updateColumn').mockResolvedValue(true);
    const { result } = renderHook(() => useBlindadosData());
    await waitFor(() => expect(result.current.isLoaded).toBe(true));

    let creation!: Promise<void>, transfer!: Promise<boolean>;
    act(() => {
      creation = result.current.addKanbanCard(column.id, newCard());
      transfer = result.current.updateKanbanColumn(column.id, { projectId: null });
    });
    await waitFor(() => expect(vi.mocked(fetch).mock.calls.some(([input]) =>
      urlOf(input) === '/api/kanban/add-card')).toBe(true));
    await act(async () => {
      rejectCreate(new Error('ambiguous network failure'));
      await creation;
      await expect(transfer).resolves.toBe(true);
    });

    expect(result.current.data.kanban.columns[0].cards).toHaveLength(1);
    expect(updateColumn).toHaveBeenCalledTimes(1);
    expect(vi.mocked(fetch).mock.calls.filter(([input]) =>
      urlOf(input) === '/api/kanban/add-card')).toHaveLength(1);
    const loadColumns = vi.mocked(KanbanService.prototype.loadColumns);
    loadColumns.mockClear();
    await act(async () => {
      const sync = result.current.forceSync();
      expect(loadColumns).toHaveBeenCalledTimes(1);
      await sync;
    });
  });

  it('preserves unrelated live column fields after a late create and failed transfer', async () => {
    const createResponse = deferred<Response>();
    const transferResponse = deferred<boolean>();
    vi.mocked(KanbanService.prototype.loadColumns).mockResolvedValue([
      { ...column, projectId: projectA },
      secondColumn,
    ]);
    vi.spyOn(KanbanService.prototype, 'updateColumn').mockImplementation(id =>
      id === column.id ? transferResponse.promise : Promise.resolve(true));
    vi.mocked(fetch).mockImplementation(input => urlOf(input) === '/api/kanban/add-card'
      ? createResponse.promise
      : Promise.resolve(response(pomodoroData)));
    const { result } = renderHook(() => useBlindadosData());
    await waitFor(() => expect(result.current.isLoaded).toBe(true));

    let creation!: Promise<void>, transfer!: Promise<boolean>;
    act(() => {
      creation = result.current.addKanbanCard(column.id, newCard());
      transfer = result.current.updateKanbanColumn(column.id, { projectId: projectB });
    });
    await act(async () => {
      expect(await result.current.updateKanbanColumn(secondColumn.id, {
        title: 'unrelated', backgroundColor: '#abcdef',
      })).toBe(true);
    });
    await act(async () => {
      createResponse.resolve(response({ success: true, card: persistedCard(projectA) }));
      await creation;
      transferResponse.resolve(false);
      await expect(transfer).resolves.toBe(false);
    });

    expect(result.current.data.kanban.columns[1])
      .toMatchObject({ title: 'UNRELATED', backgroundColor: '#abcdef' });
    const cached = JSON.parse(localStorage.getItem(getUserDataCacheKey('user-a'))!);
    expect(cached.kanban.columns[1]).toMatchObject({ title: 'UNRELATED', backgroundColor: '#abcdef' });
  });

  it('restores an older failed field without overwriting a newer successful field', async () => {
    let rejectFirst!: (value: boolean) => void;
    const first = new Promise<boolean>(resolve => { rejectFirst = resolve; });
    const update = vi.spyOn(KanbanService.prototype, 'updateColumn')
      .mockReturnValueOnce(first).mockResolvedValueOnce(true);
    const { result } = renderHook(() => useBlindadosData());
    await waitFor(() => expect(result.current.isLoaded).toBe(true));
    let color!: Promise<boolean>, title!: Promise<boolean>;
    act(() => {
      color = result.current.updateKanbanColumn(column.id, { backgroundColor: '#abcdef' });
      title = result.current.updateKanbanColumn(column.id, { title: 'nova' });
    });
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    await act(async () => {
      rejectFirst(false);
      await expect(color).resolves.toBe(false);
      await expect(title).resolves.toBe(true);
    });
    expect(result.current.data.kanban.columns[0].title).toBe('NOVA');
    expect(result.current.data.kanban.columns[0].backgroundColor).toBeUndefined();
  });

  it('restores the last confirmed value when two queued edits of the same field fail', async () => {
    let finishFirst!: (value: boolean) => void;
    const first = new Promise<boolean>(resolve => { finishFirst = resolve; });
    vi.spyOn(KanbanService.prototype, 'updateColumn')
      .mockReturnValueOnce(first).mockResolvedValueOnce(false);
    const { result } = renderHook(() => useBlindadosData());
    await waitFor(() => expect(result.current.isLoaded).toBe(true));
    let one!: Promise<boolean>, two!: Promise<boolean>;
    act(() => {
      one = result.current.updateKanbanColumn(column.id, { title: 'primeira' });
      two = result.current.updateKanbanColumn(column.id, { title: 'segunda' });
    });
    await act(async () => {
      finishFirst(false);
      await expect(one).resolves.toBe(false);
      await expect(two).resolves.toBe(false);
    });
    expect(result.current.data.kanban.columns[0].title).toBe(column.title);
  });

  it.each([true, false])('coordinates a delayed card save with column transfer (confirmed=%s)', async (saved) => {
    let finishCard!: (value: Response) => void;
    const pendingCard = new Promise<Response>(resolve => { finishCard = resolve; });
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation(input => urlOf(input) === '/api/kanban/update-card'
      ? pendingCard : Promise.resolve(response(pomodoroData)));
    const updateColumn = vi.spyOn(KanbanService.prototype, 'updateColumn').mockResolvedValue(saved);
    const { result } = renderHook(() => useBlindadosData());
    await waitFor(() => expect(result.current.isLoaded).toBe(true));
    let cardSave!: Promise<boolean>, transfer!: Promise<boolean>;
    act(() => {
      cardSave = result.current.updateKanbanCard(column.id, column.cards[0].id, { title: 'Título novo' });
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/kanban/update-card', expect.anything()));
    const destination = '55555555-5555-4555-8555-555555555555';
    act(() => { transfer = result.current.updateKanbanColumn(column.id, { projectId: destination }); });
    expect(updateColumn).not.toHaveBeenCalled();
    await act(async () => {
      finishCard(response({ success: true, card: { ...column.cards[0], title: 'Título novo' } }));
      await cardSave;
      expect(await transfer).toBe(saved);
    });
    const edited = result.current.data.kanban.columns[0].cards[0];
    expect(edited.title).toBe('Título novo');
    expect(edited.projectId).toBe(saved ? destination : column.cards[0].projectId);
  });

  it('restores the true card project when a preceding card edit and transfer both fail', async () => {
    let finishCard!: (value: Response) => void;
    const pendingCard = new Promise<Response>(resolve => { finishCard = resolve; });
    vi.mocked(fetch).mockImplementation(input => urlOf(input) === '/api/kanban/update-card'
      ? pendingCard : Promise.resolve(response(pomodoroData)));
    vi.spyOn(KanbanService.prototype, 'updateColumn').mockResolvedValue(false);
    const { result } = renderHook(() => useBlindadosData());
    await waitFor(() => expect(result.current.isLoaded).toBe(true));
    let cardSave!: Promise<boolean>, transfer!: Promise<boolean>;
    act(() => {
      cardSave = result.current.updateKanbanCard(column.id, column.cards[0].id, { projectId: null });
    });
    act(() => {
      transfer = result.current.updateKanbanColumn(column.id, { projectId: '55555555-5555-4555-8555-555555555555' });
    });
    await act(async () => {
      finishCard(response({ error: 'Forbidden' }, 403));
      await cardSave;
      expect(await transfer).toBe(false);
    });
    expect(result.current.data.kanban.columns[0].cards[0].projectId).toBe(column.cards[0].projectId);
  });

  it('returns false and restores the persisted completion value after two failed toggles', async () => {
    vi.mocked(fetch).mockImplementation(input => urlOf(input) === '/api/kanban/update-card'
      ? Promise.resolve(response({ error: 'Forbidden' }, 403))
      : Promise.resolve(response(pomodoroData)));
    const { result } = renderHook(() => useBlindadosData());
    await waitFor(() => expect(result.current.isLoaded).toBe(true));
    let first!: Promise<boolean>, second!: Promise<boolean>;
    act(() => {
      first = result.current.updateKanbanCard(column.id, column.cards[0].id, { completedAt: '2026-09-09T12:00:00.000Z' });
      second = result.current.updateKanbanCard(column.id, column.cards[0].id, { completedAt: null });
    });

    await act(async () => {
      await expect(first).resolves.toBe(false);
      await expect(second).resolves.toBe(false);
    });
    expect(result.current.data.kanban.columns[0].cards[0].completedAt).toBeUndefined();
  });

  it('keeps the first confirmed completion when a newer completion toggle fails', async () => {
    const completedAt = '2026-09-09T12:00:00.000Z';
    let calls = 0;
    vi.mocked(fetch).mockImplementation(input => {
      if (urlOf(input) === '/api/kanban/update-card') {
        calls++;
        return Promise.resolve(calls === 1
          ? response({ success: true, card: { ...column.cards[0], completedAt } })
          : response({ error: 'Forbidden' }, 403));
      }
      return Promise.resolve(response(pomodoroData));
    });
    const { result } = renderHook(() => useBlindadosData());
    await waitFor(() => expect(result.current.isLoaded).toBe(true));
    let first!: Promise<boolean>, second!: Promise<boolean>;
    act(() => {
      first = result.current.updateKanbanCard(column.id, column.cards[0].id, { completedAt });
      second = result.current.updateKanbanCard(column.id, column.cards[0].id, { completedAt: null });
    });

    await act(async () => {
      await expect(first).resolves.toBe(true);
      await expect(second).resolves.toBe(false);
    });
    expect(result.current.data.kanban.columns[0].cards[0].completedAt).toBe(completedAt);
  });

  it('keeps an explicitly cleared completion after a later check fails', async () => {
    const completedAt = '2026-09-09T12:00:00.000Z';
    let calls = 0;
    vi.mocked(fetch).mockImplementation(input => {
      if (urlOf(input) === '/api/kanban/update-card') {
        calls++;
        return Promise.resolve(calls === 1
          ? response({ success: true, card: { ...column.cards[0], completedAt: null } })
          : response({ error: 'Check rejected' }, 403));
      }
      return Promise.resolve(response(pomodoroData));
    });
    const { result } = renderHook(() => useBlindadosData());
    await waitFor(() => expect(result.current.isLoaded).toBe(true));

    let uncheck!: Promise<boolean>, check!: Promise<boolean>;
    act(() => {
      uncheck = result.current.updateKanbanCard(column.id, column.cards[0].id, { completedAt: null });
      check = result.current.updateKanbanCard(column.id, column.cards[0].id, { completedAt });
    });
    await act(async () => {
      await expect(uncheck).resolves.toBe(true);
      await expect(check).resolves.toBe(false);
    });

    expect(result.current.data.kanban.columns[0].cards[0].completedAt).toBeUndefined();
    const cached = JSON.parse(localStorage.getItem(getUserDataCacheKey('user-a'))!);
    expect(cached.kanban.columns[0].cards[0]).not.toHaveProperty('completedAt');
  });

  it('does not roll back an unrelated card field when completion persistence fails', async () => {
    let calls = 0;
    vi.mocked(fetch).mockImplementation(input => {
      if (urlOf(input) === '/api/kanban/update-card') {
        calls++;
        return Promise.resolve(calls === 1
          ? response({ error: 'Title rejected' }, 403)
          : response({ success: true, card: { ...column.cards[0], completedAt: '2026-09-09T12:00:00.000Z' } }));
      }
      return Promise.resolve(response(pomodoroData));
    });
    const { result } = renderHook(() => useBlindadosData());
    await waitFor(() => expect(result.current.isLoaded).toBe(true));
    let title!: Promise<boolean>, completion!: Promise<boolean>;
    act(() => {
      title = result.current.updateKanbanCard(column.id, column.cards[0].id, { title: 'Rejected title' });
      completion = result.current.updateKanbanCard(column.id, column.cards[0].id, { completedAt: '2026-09-09T12:00:00.000Z' });
    });

    await act(async () => {
      await expect(title).resolves.toBe(false);
      await expect(completion).resolves.toBe(true);
    });
    expect(result.current.data.kanban.columns[0].cards[0].title).toBe('Card');
    expect(result.current.data.kanban.columns[0].cards[0].completedAt).toBe('2026-09-09T12:00:00.000Z');
  });

  it('does not let a load started before a completion save overwrite the confirmed result', async () => {
    let finishLoad!: (columns: (typeof column)[]) => void;
    const delayedLoad = new Promise<(typeof column)[]>(resolve => { finishLoad = resolve; });
    vi.spyOn(KanbanService.prototype, 'loadColumns')
      .mockResolvedValueOnce([column])
      .mockReturnValueOnce(delayedLoad);
    vi.mocked(fetch).mockImplementation(input => urlOf(input) === '/api/kanban/update-card'
      ? Promise.resolve(response({
          success: true,
          card: { ...column.cards[0], completedAt: '2026-09-09T12:00:00.000Z' },
        }))
      : Promise.resolve(response(pomodoroData)));
    const { result } = renderHook(() => useBlindadosData());
    await waitFor(() => expect(result.current.isLoaded).toBe(true));
    let loading!: Promise<void>;
    act(() => { loading = result.current.forceSync(); });
    await waitFor(() => expect(KanbanService.prototype.loadColumns).toHaveBeenCalledTimes(2));
    await act(async () => {
      expect(await result.current.updateKanbanCard(column.id, column.cards[0].id, {
        completedAt: '2026-09-09T12:00:00.000Z',
      })).toBe(true);
    });
    finishLoad([column]);
    await act(async () => { await loading; });
    expect(result.current.data.kanban.columns[0].cards[0].completedAt).toBe('2026-09-09T12:00:00.000Z');
  });

  it('does not let a load started before a drag overwrite the moved card', async () => {
    const loadedColumns = [column, secondColumn];
    let finishLoad!: (columns: typeof loadedColumns) => void;
    const delayedLoad = new Promise<typeof loadedColumns>(resolve => { finishLoad = resolve; });
    vi.spyOn(KanbanService.prototype, 'loadColumns')
      .mockResolvedValueOnce(loadedColumns)
      .mockReturnValueOnce(delayedLoad);
    vi.mocked(fetch).mockImplementation(input => urlOf(input) === '/api/kanban/move-card'
      ? Promise.resolve(response({ success: true }))
      : Promise.resolve(response(pomodoroData)));
    const { result } = renderHook(() => useBlindadosData());
    await waitFor(() => expect(result.current.isLoaded).toBe(true));
    let loading!: Promise<void>;
    act(() => { loading = result.current.forceSync(); });
    await waitFor(() => expect(KanbanService.prototype.loadColumns).toHaveBeenCalledTimes(2));
    const draft = [
      { ...column, cards: [] },
      { ...secondColumn, cards: column.cards },
    ];
    await act(async () => { await result.current.updateKanbanColumns(draft); });
    await act(async () => {
      expect(await result.current.moveCard(column.cards[0].id, column.id, secondColumn.id, 0, loadedColumns)).toBe(true);
    });
    finishLoad(loadedColumns);
    await act(async () => { await loading; });
    expect(result.current.data.kanban.columns[0].cards).toEqual([]);
    expect(result.current.data.kanban.columns[1].cards[0].id).toBe(column.cards[0].id);
  });

  it.each([true, false])('serializes a card move with column transfer without creating a cycle (moveFirst=%s)', async (moveFirst) => {
    const loadedColumns = [column, secondColumn];
    let finishMove!: (value: Response) => void;
    let finishTransfer!: (value: boolean) => void;
    const delayedMove = new Promise<Response>(resolve => { finishMove = resolve; });
    const delayedTransfer = new Promise<boolean>(resolve => { finishTransfer = resolve; });
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation(input => urlOf(input) === '/api/kanban/move-card'
      ? delayedMove
      : Promise.resolve(response(pomodoroData)));
    const updateColumn = vi.spyOn(KanbanService.prototype, 'updateColumn').mockReturnValue(delayedTransfer);
    vi.spyOn(KanbanService.prototype, 'loadColumns').mockResolvedValue(loadedColumns);
    const { result } = renderHook(() => useBlindadosData());
    await waitFor(() => expect(result.current.isLoaded).toBe(true));

    let move!: Promise<boolean>, transfer!: Promise<boolean>;
    if (moveFirst) {
      act(() => { move = result.current.moveCard(column.cards[0].id, column.id, secondColumn.id, 0, loadedColumns); });
      await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/kanban/move-card', expect.anything()));
      act(() => { transfer = result.current.updateKanbanColumn(column.id, { projectId: null }); });
      expect(updateColumn).not.toHaveBeenCalled();
      await act(async () => {
        finishMove(response({ success: true }));
        await expect(move).resolves.toBe(true);
        await waitFor(() => expect(updateColumn).toHaveBeenCalledTimes(1));
        finishTransfer(true);
        await expect(transfer).resolves.toBe(true);
      });
    } else {
      act(() => { transfer = result.current.updateKanbanColumn(column.id, { projectId: null }); });
      await waitFor(() => expect(updateColumn).toHaveBeenCalledTimes(1));
      act(() => { move = result.current.moveCard(column.cards[0].id, column.id, secondColumn.id, 0, loadedColumns); });
      expect(fetchMock).not.toHaveBeenCalledWith('/api/kanban/move-card', expect.anything());
      await act(async () => {
        finishTransfer(true);
        await expect(transfer).resolves.toBe(true);
        await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/kanban/move-card', expect.anything()));
        finishMove(response({ success: true }));
        await expect(move).resolves.toBe(true);
      });
    }
    expect(result.current.data.kanban.columns[1].cards[0].id).toBe(column.cards[0].id);
  });

  it('preserves the newest completion and column color when a card reorder fails', async () => {
    const secondCard = { ...column.cards[0], id: '88888888-8888-4888-8888-888888888888', title: 'Second' };
    const initialColumn = { ...column, cards: [...column.cards, secondCard] };
    vi.spyOn(KanbanService.prototype, 'loadColumns').mockResolvedValue([initialColumn]);
    vi.spyOn(KanbanService.prototype, 'updateColumn').mockResolvedValue(true);
    vi.mocked(fetch).mockImplementation(input => {
      if (urlOf(input) === '/api/kanban/reorder-cards') return Promise.resolve(response({ error: 'Unable to reorder' }, 403));
      if (urlOf(input) === '/api/kanban/update-card') {
        return Promise.resolve(response({
          success: true,
          card: { ...column.cards[0], completedAt: '2026-09-10T12:00:00.000Z' },
        }));
      }
      return Promise.resolve(response(pomodoroData));
    });
    const { result } = renderHook(() => useBlindadosData());
    await waitFor(() => expect(result.current.isLoaded).toBe(true));
    await act(async () => {
      expect(await result.current.updateKanbanColumn(column.id, { backgroundColor: '#abcdef' })).toBe(true);
      expect(await result.current.updateKanbanCard(column.id, column.cards[0].id, {
        completedAt: '2026-09-10T12:00:00.000Z',
      })).toBe(true);
    });
    await act(async () => {
      expect(await result.current.updateCardPositions(
        column.id,
        [...initialColumn.cards].reverse(),
        [initialColumn],
      )).toBe(false);
    });
    expect(result.current.data.kanban.columns[0].backgroundColor).toBe('#abcdef');
    expect(result.current.data.kanban.columns[0].cards[0].completedAt).toBe('2026-09-10T12:00:00.000Z');
    expect(result.current.data.kanban.columns[0].cards.map(card => card.id)).toEqual(initialColumn.cards.map(card => card.id));
  });

  it('restores the confirmed location when two queued moves both fail', async () => {
    const loadedColumns = [column, secondColumn, thirdColumn];
    let finishFirst!: (value: Response) => void;
    let finishSecond!: (value: Response) => void;
    const firstMove = new Promise<Response>(resolve => { finishFirst = resolve; });
    const secondMove = new Promise<Response>(resolve => { finishSecond = resolve; });
    let moveCalls = 0;
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation(input => {
      if (urlOf(input) === '/api/kanban/move-card') {
        moveCalls++;
        return moveCalls === 1 ? firstMove : secondMove;
      }
      return Promise.resolve(response(pomodoroData));
    });
    vi.spyOn(KanbanService.prototype, 'loadColumns').mockResolvedValue(loadedColumns);
    const { result } = renderHook(() => useBlindadosData());
    await waitFor(() => expect(result.current.isLoaded).toBe(true));

    let first!: Promise<boolean>, second!: Promise<boolean>;
    act(() => {
      first = result.current.moveCard(column.cards[0].id, column.id, secondColumn.id, 0, loadedColumns);
      second = result.current.moveCard(column.cards[0].id, secondColumn.id, thirdColumn.id, 0, loadedColumns);
    });
    await waitFor(() => expect(moveCalls).toBe(1));
    await act(async () => {
      finishFirst(response({ error: 'First move rejected' }, 403));
      await expect(first).resolves.toBe(false);
      await waitFor(() => expect(moveCalls).toBe(2));
      finishSecond(response({ error: 'Second move rejected' }, 403));
      await expect(second).resolves.toBe(false);
    });

    const columns = result.current.data.kanban.columns;
    expect(columns[0].cards.map(card => card.id)).toEqual([column.cards[0].id]);
    expect(columns[1].cards).toEqual([]);
    expect(columns[2].cards).toEqual([]);
    const cached = JSON.parse(localStorage.getItem(getUserDataCacheKey('user-a'))!);
    expect(cached.kanban.columns.map((item: typeof column) => item.cards.map(card => card.id))).toEqual([
      [column.cards[0].id], [], [],
    ]);
  });

  it('restores the confirmed card order when two queued reorders both fail', async () => {
    const secondCard = { ...column.cards[0], id: '88888888-8888-4888-8888-888888888888', title: 'Second' };
    const initialColumn = { ...column, cards: [...column.cards, secondCard] };
    vi.spyOn(KanbanService.prototype, 'loadColumns').mockResolvedValue([initialColumn]);
    let finishFirst!: (value: Response) => void;
    let finishSecond!: (value: Response) => void;
    const firstReorder = new Promise<Response>(resolve => { finishFirst = resolve; });
    const secondReorder = new Promise<Response>(resolve => { finishSecond = resolve; });
    let reorderCalls = 0;
    vi.mocked(fetch).mockImplementation(input => {
      if (urlOf(input) === '/api/kanban/reorder-cards') {
        reorderCalls++;
        return reorderCalls === 1 ? firstReorder : secondReorder;
      }
      return Promise.resolve(response(pomodoroData));
    });
    const { result } = renderHook(() => useBlindadosData());
    await waitFor(() => expect(result.current.isLoaded).toBe(true));

    let first!: Promise<boolean>, second!: Promise<boolean>;
    act(() => {
      first = result.current.updateCardPositions(column.id, [secondCard, column.cards[0]], [initialColumn]);
      second = result.current.updateCardPositions(column.id, [column.cards[0], secondCard], [initialColumn]);
    });
    await waitFor(() => expect(reorderCalls).toBe(1));
    await act(async () => {
      finishFirst(response({ error: 'First reorder rejected' }, 403));
      await expect(first).resolves.toBe(false);
      await waitFor(() => expect(reorderCalls).toBe(2));
      finishSecond(response({ error: 'Second reorder rejected' }, 403));
      await expect(second).resolves.toBe(false);
    });

    expect(result.current.data.kanban.columns[0].cards.map(card => card.id))
      .toEqual(initialColumn.cards.map(card => card.id));
    const cached = JSON.parse(localStorage.getItem(getUserDataCacheKey('user-a'))!);
    expect(cached.kanban.columns[0].cards.map((card: typeof column.cards[number]) => card.id))
      .toEqual(initialColumn.cards.map(card => card.id));
  });

  it('rebases a successful partial reorder after its preceding move fails', async () => {
    const cardY = { ...column.cards[0], id: '88888888-8888-4888-8888-888888888888', title: 'Y' };
    const cardZ = { ...column.cards[0], id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', title: 'Z' };
    const initialColumn = { ...column, cards: [column.cards[0], cardY, cardZ] };
    const loadedColumns = [initialColumn, secondColumn];
    vi.spyOn(KanbanService.prototype, 'loadColumns').mockResolvedValue(loadedColumns);
    let finishMove!: (value: Response) => void;
    const delayedMove = new Promise<Response>(resolve => { finishMove = resolve; });
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation((input) => {
      const url = urlOf(input);
      if (url === '/api/kanban/move-card') return delayedMove;
      if (url === '/api/kanban/reorder-cards') return Promise.resolve(response({ success: true }));
      return Promise.resolve(response(pomodoroData));
    });
    const { result } = renderHook(() => useBlindadosData());
    await waitFor(() => expect(result.current.isLoaded).toBe(true));

    let move!: Promise<boolean>, reorder!: Promise<boolean>;
    act(() => { move = result.current.moveCard(initialColumn.cards[0].id, column.id, secondColumn.id, 0); });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/kanban/move-card', expect.anything()));
    const afterOptimisticMove = result.current.data.kanban.columns;
    act(() => {
      reorder = result.current.updateCardPositions(
        column.id,
        [cardZ, cardY],
        afterOptimisticMove,
      );
    });

    await act(async () => {
      finishMove(response({ error: 'Move rejected' }, 403));
      await expect(move).resolves.toBe(false);
      await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/kanban/reorder-cards', expect.anything()));
      await expect(reorder).resolves.toBe(true);
    });

    const source = result.current.data.kanban.columns.find(item => item.id === column.id)!;
    const target = result.current.data.kanban.columns.find(item => item.id === secondColumn.id)!;
    expect(source.cards.map(card => card.id)).toEqual([
      initialColumn.cards[0].id,
      cardZ.id,
      cardY.id,
    ]);
    expect(target.cards).toEqual([]);
    const allIds = result.current.data.kanban.columns.flatMap(item => item.cards.map(card => card.id));
    expect(allIds).toHaveLength(3);
    expect(new Set(allIds).size).toBe(3);

    const reorderCall = fetchMock.mock.calls.find(([url]) => urlOf(url) === '/api/kanban/reorder-cards');
    const reorderBody = JSON.parse(reorderCall?.[1]?.body as string);
    expect(reorderBody.cardPositions).toEqual([
      { cardId: initialColumn.cards[0].id, position: 0 },
      { cardId: cardZ.id, position: 1 },
      { cardId: cardY.id, position: 2 },
    ]);
    const cached = JSON.parse(localStorage.getItem(getUserDataCacheKey('user-a'))!);
    expect(cached.kanban.columns.find((item: typeof column) => item.id === column.id).cards.map(
      (card: typeof column.cards[number]) => card.id,
    )).toEqual([initialColumn.cards[0].id, cardZ.id, cardY.id]);
    expect(cached.kanban.columns.flatMap((item: typeof column) => item.cards)).toHaveLength(3);
  });

  it('does not transfer a failed move from another column through a queued destination reorder', async () => {
    const cardY = { ...column.cards[0], id: '88888888-8888-4888-8888-888888888888', title: 'Y' };
    const cardZ = { ...column.cards[0], id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', title: 'Z' };
    const initialTargetColumn = { ...secondColumn, cards: [cardY, cardZ] };
    const loadedColumns = [column, initialTargetColumn];
    vi.spyOn(KanbanService.prototype, 'loadColumns').mockResolvedValue(loadedColumns);
    let finishMove!: (value: Response) => void;
    const delayedMove = new Promise<Response>(resolve => { finishMove = resolve; });
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation((input) => {
      const url = urlOf(input);
      if (url === '/api/kanban/move-card') return delayedMove;
      if (url === '/api/kanban/reorder-cards') return Promise.resolve(response({ success: true }));
      return Promise.resolve(response(pomodoroData));
    });
    const { result } = renderHook(() => useBlindadosData());
    await waitFor(() => expect(result.current.isLoaded).toBe(true));

    let move!: Promise<boolean>, reorder!: Promise<boolean>;
    act(() => { move = result.current.moveCard(column.cards[0].id, column.id, initialTargetColumn.id, 0); });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/kanban/move-card', expect.anything()));
    const afterOptimisticMove = result.current.data.kanban.columns;
    act(() => {
      reorder = result.current.updateCardPositions(
        initialTargetColumn.id,
        [cardZ, column.cards[0], cardY],
        afterOptimisticMove,
      );
    });

    await act(async () => {
      finishMove(response({ error: 'Move rejected' }, 403));
      await expect(move).resolves.toBe(false);
      await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/kanban/reorder-cards', expect.anything()));
      await expect(reorder).resolves.toBe(true);
    });

    const source = result.current.data.kanban.columns.find(item => item.id === column.id)!;
    const target = result.current.data.kanban.columns.find(item => item.id === initialTargetColumn.id)!;
    expect(source.cards.map(card => card.id)).toEqual([column.cards[0].id]);
    expect(target.cards.map(card => card.id)).toEqual([cardZ.id, cardY.id]);
    const allIds = result.current.data.kanban.columns.flatMap(item => item.cards.map(card => card.id));
    expect(allIds).toHaveLength(3);
    expect(new Set(allIds).size).toBe(3);

    const reorderCall = fetchMock.mock.calls.find(([url]) => urlOf(url) === '/api/kanban/reorder-cards');
    const reorderBody = JSON.parse(reorderCall?.[1]?.body as string);
    expect(reorderBody.cardPositions).toEqual([
      { cardId: cardZ.id, position: 0 },
      { cardId: cardY.id, position: 1 },
    ]);
    const cached = JSON.parse(localStorage.getItem(getUserDataCacheKey('user-a'))!);
    expect(cached.kanban.columns.find((item: typeof column) => item.id === column.id).cards.map(
      (card: typeof column.cards[number]) => card.id,
    )).toEqual([column.cards[0].id]);
    expect(cached.kanban.columns.find((item: typeof secondColumn) => item.id === initialTargetColumn.id).cards.map(
      (card: typeof column.cards[number]) => card.id,
    )).toEqual([cardZ.id, cardY.id]);
    expect(cached.kanban.columns.flatMap((item: typeof column) => item.cards)).toHaveLength(3);
  });

  it('restores the confirmed column order when two queued column reorders both fail', async () => {
    const loadedColumns = [column, secondColumn, thirdColumn];
    vi.spyOn(KanbanService.prototype, 'loadColumns').mockResolvedValue(loadedColumns);
    let finishFirst!: (value: boolean) => void;
    let finishSecond!: (value: boolean) => void;
    const firstReorder = new Promise<boolean>(resolve => { finishFirst = resolve; });
    const secondReorder = new Promise<boolean>(resolve => { finishSecond = resolve; });
    const persistOrder = vi.spyOn(KanbanService.prototype, 'updateColumnPositions')
      .mockReturnValueOnce(firstReorder)
      .mockReturnValueOnce(secondReorder);
    const { result } = renderHook(() => useBlindadosData());
    await waitFor(() => expect(result.current.isLoaded).toBe(true));

    let first!: Promise<void>, second!: Promise<void>;
    act(() => { first = result.current.updateKanbanColumns([secondColumn, column, thirdColumn]); });
    await waitFor(() => expect(persistOrder).toHaveBeenCalledTimes(1));
    act(() => { second = result.current.updateKanbanColumns([thirdColumn, secondColumn, column]); });
    await act(async () => {
      finishFirst(false);
      await first;
      await waitFor(() => expect(persistOrder).toHaveBeenCalledTimes(2));
      finishSecond(false);
      await second;
    });

    expect(result.current.data.kanban.columns.map(item => item.id)).toEqual(loadedColumns.map(item => item.id));
    const cached = JSON.parse(localStorage.getItem(getUserDataCacheKey('user-a'))!);
    expect(cached.kanban.columns.map((item: typeof column) => item.id)).toEqual(loadedColumns.map(item => item.id));
  });

  it('keeps a pending move rollback independent of column reorder tokens and preserves live fields', async () => {
    const loadedColumns = [column, secondColumn];
    const completion = '2026-09-12T12:00:00.000Z';
    vi.spyOn(KanbanService.prototype, 'loadColumns').mockResolvedValue(loadedColumns);
    vi.spyOn(KanbanService.prototype, 'updateColumn').mockResolvedValue(true);
    const updateOrder = vi.spyOn(KanbanService.prototype, 'updateColumnPositions');
    let finishMove!: (value: Response) => void;
    const delayedMove = new Promise<Response>(resolve => { finishMove = resolve; });
    let finishOrder!: (value: boolean) => void;
    const delayedOrder = new Promise<boolean>(resolve => { finishOrder = resolve; });
    updateOrder.mockReturnValue(delayedOrder);
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation(input => {
      const url = urlOf(input);
      if (url === '/api/kanban/move-card') return delayedMove;
      if (url === '/api/kanban/update-card') {
        return Promise.resolve(response({
          success: true,
          card: { ...column.cards[0], completedAt: completion },
        }));
      }
      return Promise.resolve(response(pomodoroData));
    });
    const { result } = renderHook(() => useBlindadosData());
    await waitFor(() => expect(result.current.isLoaded).toBe(true));
    await act(async () => {
      expect(await result.current.updateKanbanColumn(column.id, { backgroundColor: '#abcdef' })).toBe(true);
      expect(await result.current.updateKanbanCard(column.id, column.cards[0].id, { completedAt: completion })).toBe(true);
    });

    let move!: Promise<boolean>, reorder!: Promise<void>;
    act(() => { move = result.current.moveCard(column.cards[0].id, column.id, secondColumn.id, 0); });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/kanban/move-card', expect.anything()));
    const movedColumns = result.current.data.kanban.columns;
    act(() => { reorder = result.current.updateKanbanColumns([...movedColumns].reverse()); });
    expect(updateOrder).not.toHaveBeenCalled();

    await act(async () => {
      finishMove(response({ error: 'Move rejected' }, 403));
      await expect(move).resolves.toBe(false);
      await waitFor(() => expect(updateOrder).toHaveBeenCalledTimes(1));
      finishOrder(true);
      await reorder;
    });

    expect(result.current.data.kanban.columns.map(item => item.id)).toEqual([secondColumn.id, column.id]);
    const restored = result.current.data.kanban.columns.find(item => item.id === column.id)!;
    expect(restored.cards[0].completedAt).toBe(completion);
    expect(restored.backgroundColor).toBe('#abcdef');
    const cached = JSON.parse(localStorage.getItem(getUserDataCacheKey('user-a'))!);
    const cachedRestored = cached.kanban.columns.find((item: typeof column) => item.id === column.id);
    expect(cachedRestored.cards[0].completedAt).toBe(completion);
    expect(cachedRestored.backgroundColor).toBe('#abcdef');
  });

  it('preserves a confirmed completion and column color when a card move fails', async () => {
    vi.spyOn(KanbanService.prototype, 'loadColumns').mockResolvedValue([column, secondColumn]);
    vi.spyOn(KanbanService.prototype, 'updateColumn').mockResolvedValue(true);
    vi.mocked(fetch).mockImplementation(input => {
      if (urlOf(input) === '/api/kanban/move-card') return Promise.resolve(response({ error: 'Move rejected' }, 403));
      if (urlOf(input) === '/api/kanban/update-card') {
        return Promise.resolve(response({
          success: true,
          card: { ...column.cards[0], completedAt: '2026-09-11T12:00:00.000Z' },
        }));
      }
      return Promise.resolve(response(pomodoroData));
    });
    const { result } = renderHook(() => useBlindadosData());
    await waitFor(() => expect(result.current.isLoaded).toBe(true));
    await act(async () => {
      expect(await result.current.updateKanbanColumn(column.id, { backgroundColor: '#abcdef' })).toBe(true);
      expect(await result.current.updateKanbanCard(column.id, column.cards[0].id, {
        completedAt: '2026-09-11T12:00:00.000Z',
      })).toBe(true);
    });
    const previous = result.current.data.kanban.columns;
    await act(async () => {
      expect(await result.current.moveCard(
        column.cards[0].id,
        column.id,
        secondColumn.id,
        0,
        previous,
      )).toBe(false);
    });
    expect(result.current.data.kanban.columns[0].backgroundColor).toBe('#abcdef');
    expect(result.current.data.kanban.columns[0].cards[0].completedAt).toBe('2026-09-11T12:00:00.000Z');
    expect(result.current.data.kanban.columns[1].cards).toEqual([]);
  });

  it('does not commit a card response after the authenticated owner changes', async () => {
    let finishCard!: (value: Response) => void;
    const delayedCard = new Promise<Response>(resolve => { finishCard = resolve; });
    vi.mocked(fetch).mockImplementation(input => urlOf(input) === '/api/kanban/update-card'
      ? delayedCard
      : Promise.resolve(response(pomodoroData)));
    const { result, rerender } = renderHook(() => useBlindadosData());
    await waitFor(() => expect(result.current.isLoaded).toBe(true));
    let save!: Promise<boolean>;
    act(() => {
      save = result.current.updateKanbanCard(column.id, column.cards[0].id, {
        completedAt: '2026-09-09T12:00:00.000Z',
      });
    });
    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/kanban/update-card', expect.anything()));
    auth.user = { id: 'user-b' };
    await act(async () => rerender());
    await waitFor(() => expect(result.current.isLoaded).toBe(true));
    finishCard(response({
      success: true,
      card: { ...column.cards[0], completedAt: '2026-09-09T12:00:00.000Z' },
    }));
    await act(async () => { await expect(save).resolves.toBe(false); });
    expect(result.current.data.kanban.columns[0].cards[0].completedAt).toBeNull();
  });

  it('restores the confirmed project when a transfer and a newer card project edit both fail', async () => {
    let finishTransfer!: (value: boolean) => void;
    const pendingTransfer = new Promise<boolean>(resolve => { finishTransfer = resolve; });
    vi.spyOn(KanbanService.prototype, 'updateColumn').mockReturnValue(pendingTransfer);
    vi.mocked(fetch).mockImplementation(input => urlOf(input) === '/api/kanban/update-card'
      ? Promise.resolve(response({ error: 'Forbidden' }, 403))
      : Promise.resolve(response(pomodoroData)));
    const { result } = renderHook(() => useBlindadosData());
    await waitFor(() => expect(result.current.isLoaded).toBe(true));
    let cardSave!: Promise<boolean>, transfer!: Promise<boolean>;
    act(() => {
      transfer = result.current.updateKanbanColumn(column.id, { projectId: '55555555-5555-4555-8555-555555555555' });
    });
    act(() => {
      cardSave = result.current.updateKanbanCard(column.id, column.cards[0].id, {
        projectId: '66666666-6666-4666-8666-666666666666',
      });
    });
    await act(async () => {
      finishTransfer(false);
      expect(await transfer).toBe(false);
      await cardSave;
    });
    const edited = result.current.data.kanban.columns[0];
    expect(edited.projectId).toBeUndefined();
    expect(edited.cards[0].projectId).toBe(column.cards[0].projectId);
    const cached = JSON.parse(localStorage.getItem(getUserDataCacheKey('user-a'))!);
    expect(cached.kanban.columns[0].cards[0].projectId).toBe(column.cards[0].projectId);
  });

  it('keeps a new completion save and the original project after a transfer fails', async () => {
    let finishTransfer!: (value: boolean) => void;
    const delayedTransfer = new Promise<boolean>(resolve => { finishTransfer = resolve; });
    vi.spyOn(KanbanService.prototype, 'updateColumn').mockReturnValue(delayedTransfer);
    vi.mocked(fetch).mockImplementation(input => urlOf(input) === '/api/kanban/update-card'
      ? Promise.resolve(response({
          success: true,
          card: {
            ...column.cards[0],
            completedAt: '2026-09-09T12:00:00.000Z',
          },
        }))
      : Promise.resolve(response(pomodoroData)));
    const { result } = renderHook(() => useBlindadosData());
    await waitFor(() => expect(result.current.isLoaded).toBe(true));
    let transfer!: Promise<boolean>, completion!: Promise<boolean>;
    act(() => {
      transfer = result.current.updateKanbanColumn(column.id, {
        projectId: '55555555-5555-4555-8555-555555555555',
      });
      completion = result.current.updateKanbanCard(column.id, column.cards[0].id, {
        completedAt: '2026-09-09T12:00:00.000Z',
      });
    });
    await act(async () => {
      finishTransfer(false);
      await expect(transfer).resolves.toBe(false);
      await expect(completion).resolves.toBe(true);
    });
    const card = result.current.data.kanban.columns[0].cards[0];
    expect(card.completedAt).toBe('2026-09-09T12:00:00.000Z');
    expect(card.projectId).toBe(column.cards[0].projectId);
  });

  it('restores the prior behavior and cache when progressive persistence fails', async () => {
    vi.spyOn(KanbanService.prototype, 'updateColumn').mockResolvedValue(false);
    const { result } = renderHook(() => useBlindadosData());
    await waitFor(() => expect(result.current.isLoaded).toBe(true));

    let success = true;
    await act(async () => {
      success = await result.current.updateKanbanColumn(column.id, { behavior: 'progressive' });
    });

    expect(success).toBe(false);
    expect(result.current.data.kanban.columns[0].behavior).toBe('active');
    expect(localStorage.getItem(getUserDataCacheKey('user-a'))).toContain('"behavior":"active"');
  });

  it('shows the database explanation while restoring the prior behavior', async () => {
    const message = 'O banco ainda não aceita o comportamento Progressivo.';
    vi.spyOn(KanbanService.prototype, 'updateColumn')
      .mockRejectedValue(new KanbanColumnSaveError(message));
    const { result } = renderHook(() => useBlindadosData());
    await waitFor(() => expect(result.current.isLoaded).toBe(true));

    let success = true;
    await act(async () => {
      success = await result.current.updateKanbanColumn(column.id, { behavior: 'progressive' });
    });

    expect(success).toBe(false);
    expect(result.current.data.kanban.columns[0].behavior).toBe('active');
    expect(localStorage.getItem(getUserDataCacheKey('user-a'))).toContain('"behavior":"active"');
    expect(toast.error).toHaveBeenCalledWith(message);
  });

  it('does not let an older failed behavior update roll back a newer selection', async () => {
    let resolveFirst!: (value: boolean) => void;
    const firstUpdate = new Promise<boolean>(resolve => { resolveFirst = resolve; });
    const updateColumn = vi.spyOn(KanbanService.prototype, 'updateColumn')
      .mockReturnValueOnce(firstUpdate)
      .mockResolvedValueOnce(true);
    const { result } = renderHook(() => useBlindadosData());
    await waitFor(() => expect(result.current.isLoaded).toBe(true));

    let firstPromise!: Promise<boolean>;
    await act(async () => {
      firstPromise = result.current.updateKanbanColumn(column.id, { behavior: 'progressive' });
    });

    let secondPromise!: Promise<boolean>;
    await act(async () => {
      secondPromise = result.current.updateKanbanColumn(column.id, { behavior: 'completion' });
    });

    expect(updateColumn).toHaveBeenCalledTimes(1);
    expect(result.current.data.kanban.columns[0].behavior).toBe('completion');

    resolveFirst(false);
    let firstSuccess = true;
    await act(async () => {
      firstSuccess = await firstPromise;
    });
    let secondSuccess = false;
    await act(async () => {
      secondSuccess = await secondPromise;
    });

    expect(secondSuccess).toBe(true);
    expect(updateColumn).toHaveBeenCalledTimes(2);
    expect(firstSuccess).toBe(false);
    expect(result.current.data.kanban.columns[0].behavior).toBe('completion');
  });

  it('rolls back a column when the server does not confirm a row', async () => {
    vi.spyOn(KanbanService.prototype, 'addColumn').mockResolvedValue(null);
    const { result } = renderHook(() => useBlindadosData());
    await waitFor(() => expect(result.current.isLoaded).toBe(true));

    let success = true;
    await act(async () => {
      success = await result.current.addKanbanColumn('Coluna inválida');
    });

    expect(success).toBe(false);
    expect(result.current.data.kanban.columns).toEqual([column]);
    expect(localStorage.getItem(getUserDataCacheKey('user-a'))).not.toContain('Coluna inválida');
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