import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { KanbanBoard } from './KanbanBoard';
import type { KanbanCard, KanbanColumn, KanbanProject } from '@/lib/types/blindados';

const projectA: KanbanProject = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Projeto A',
  color: '#06b6d4',
  createdAt: '2026-09-08T12:00:00.000Z',
};
const projectB: KanbanProject = {
  id: '22222222-2222-4222-8222-222222222222',
  name: 'Projeto B',
  color: '#ef4444',
  createdAt: '2026-09-08T12:00:00.000Z',
};

function card(id: string, title: string, projectId: string | null): KanbanCard {
  return {
    id,
    title,
    description: '',
    priority: 'media',
    tags: [],
    subtasks: [],
    createdAt: '2026-09-08T12:00:00.000Z',
    updatedAt: '2026-09-08T12:00:00.000Z',
    projectId,
    dueDate: null,
    completedAt: null,
  };
}

function completionCard(id: string, title: string, completedAt: string | null): KanbanCard {
  return { ...card(id, title, null), completedAt };
}

const columns: KanbanColumn[] = [{
  id: '33333333-3333-4333-8333-333333333333',
  title: 'A FAZER',
  behavior: 'active',
  projectId: projectA.id,
  cards: [
    card('44444444-4444-4444-8444-444444444444', 'Card A', projectA.id),
    card('55555555-5555-4555-8555-555555555555', 'Card B', projectB.id),
  ],
}];
const reassignedAndLegacyColumns: KanbanColumn[] = [
  {
    id: '66666666-6666-4666-8666-666666666666',
    title: 'Projeto B — transferida',
    behavior: 'active',
    projectId: projectB.id,
    cards: [card('77777777-7777-4777-8777-777777777777', 'Card transferido', projectB.id)],
  },
  {
    id: '88888888-8888-4888-8888-888888888888',
    title: 'Etapa legada compartilhada',
    behavior: 'active',
    projectId: null,
    cards: [
      card('99999999-9999-4999-8999-999999999999', 'Card legado A', projectA.id),
      card('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Card legado B', projectB.id),
    ],
  },
];

function renderBoard(overrides: Partial<React.ComponentProps<typeof KanbanBoard>> = {}) {
  const onSelectProject = vi.fn();
  const onAddProject = vi.fn();
  render(
    <KanbanBoard
      columns={columns}
      onColumnsChange={vi.fn()}
      onUpdateColumn={vi.fn()}
      onAddColumn={vi.fn()}
      onDeleteColumn={vi.fn()}
      onAddCard={vi.fn()}
      onUpdateCard={vi.fn()}
      onDeleteCard={vi.fn()}
      onMoveCard={vi.fn()}
      onUpdateCardPositions={vi.fn()}
      isLoaded
      projects={[projectA, projectB]}
      selectedProjectId={null}
      onSelectProject={onSelectProject}
      onAddProject={onAddProject}
      selectedDate={null}
      onSelectDate={vi.fn()}
      {...overrides}
    />,
  );
  return {
    onSelectProject,
    onAddProject: overrides.onAddProject ?? onAddProject,
  };
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('KanbanBoard project entry point', () => {
  it('places the column creation controls in the header and sends behavior/project', async () => {
    const onAddColumn = vi.fn().mockResolvedValue(true);
    renderBoard({ selectedProjectId: projectA.id, onAddColumn });

    fireEvent.click(screen.getByRole('button', { name: 'Adicionar coluna' }));
    fireEvent.change(screen.getByLabelText('Nome da coluna'), { target: { value: 'Revisão' } });
    fireEvent.change(screen.getByLabelText('Comportamento da nova coluna'), { target: { value: 'progressive' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar' }));

    await waitFor(() => expect(onAddColumn).toHaveBeenCalledWith(
      'Revisão',
      'progressive',
      projectA.id,
    ));
    expect(screen.getByText('Quadro de tarefas')).toBeTruthy();
  });

  it.each(['active', 'completion'] as const)(
    'sends progressive when selected from an existing %s column menu',
    async (initialBehavior) => {
      const onUpdateColumn = vi.fn();
      renderBoard({
        columns: [{ ...columns[0], behavior: initialBehavior }],
        onUpdateColumn,
      });

      const actionsButton = screen.getByRole('button', { name: 'Abrir ações da coluna A FAZER' });
      fireEvent.pointerDown(actionsButton);
      fireEvent.click(actionsButton);
      fireEvent.click(await screen.findByRole('menuitem', { name: /Progressivo/ }));

      await waitFor(() => expect(onUpdateColumn).toHaveBeenCalledWith(
        columns[0].id,
        { behavior: 'progressive' },
      ));
    },
  );

  it('opens the column editor submenu and applies a project change', async () => {
    const onUpdateColumn = vi.fn().mockResolvedValue(true);
    renderBoard({ onUpdateColumn });

    const actionsButton = screen.getByRole('button', { name: 'Abrir ações da coluna A FAZER' });
    fireEvent.pointerDown(actionsButton);
    fireEvent.click(actionsButton);
    expect(screen.getByText('Somente tarefas marcadas somem no dia seguinte')).toBeTruthy();
    fireEvent.click(await screen.findByRole('menuitem', { name: /Editar coluna/ }));
    const alterProject = await screen.findByRole('menuitem', { name: 'Alterar projeto' });
    const projectSubmenu = alterProject.closest('[role="menu"]') as HTMLElement;
    expect(projectSubmenu.style.maxWidth).toBe('min(13rem, var(--radix-dropdown-menu-content-available-width))');
    expect(projectSubmenu.querySelectorAll('[role="menuitem"]')).toHaveLength(3);
    fireEvent.click(alterProject);

    fireEvent.change(await screen.findByLabelText('Projeto da coluna'), { target: { value: projectB.id } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(onUpdateColumn).toHaveBeenCalledWith(
      columns[0].id,
      { projectId: projectB.id },
    ));
  });

  it.each([320, 390])('constrains the editor submenu while keeping all actions reachable at %ipx', async (width) => {
    const originalWidth = window.innerWidth;
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
    try {
      renderBoard();
      const trigger = screen.getByRole('button', { name: 'Abrir ações da coluna A FAZER' });
      fireEvent.pointerDown(trigger);
      fireEvent.click(trigger);
      fireEvent.click(await screen.findByRole('menuitem', { name: /Editar coluna/ }));
      const projectOption = await screen.findByRole('menuitem', { name: 'Alterar projeto' });
      const submenu = projectOption.closest('[role="menu"]') as HTMLElement;

      expect(submenu.style.maxWidth).toBe('min(13rem, var(--radix-dropdown-menu-content-available-width))');
      expect(submenu.querySelectorAll('[role="menuitem"]')).toHaveLength(3);
      expect(submenu.querySelector('[role="menuitem"]:focus')).toBeNull();
      expect(projectOption).toBeTruthy();
    } finally {
      cleanup();
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalWidth });
    }
  });

  it.each([
    ['active', /Ativada/, 'bg-[#00f6ff]/10 text-[#00f6ff]'],
    ['completion', /Conclusão/, 'bg-green-500/10 text-green-400'],
    ['progressive', /Progressivo/, 'bg-violet-500/10 text-violet-300'],
  ] as const)('preserves the selected %s menu accent', (behavior, itemName, accentClass) => {
    renderBoard({ columns: [{ ...columns[0], behavior }] });
    const trigger = screen.getByRole('button', { name: 'Abrir ações da coluna A FAZER' });
    fireEvent.pointerDown(trigger);
    fireEvent.click(trigger);
    expect(screen.getByRole('menuitem', { name: itemName }).className).toContain(accentClass);
  });

  it.each([
    ['projeto de origem', projectA.id, []],
    ['projeto de destino', projectB.id, ['Projeto B — transferida']],
    ['Todos', null, ['Projeto B — transferida', 'Etapa legada compartilhada']],
  ] as const)(
    'shows only columns bound to the selected project in %s',
    (_label, selectedProjectId, visibleTitles) => {
      renderBoard({ columns: reassignedAndLegacyColumns, selectedProjectId });

      visibleTitles.forEach((title) => expect(screen.getByRole('heading', { name: title })).toBeTruthy());
      expect(Boolean(screen.queryByRole('heading', { name: 'Projeto B — transferida' }))).toBe(
        selectedProjectId === projectB.id || selectedProjectId === null,
      );
      expect(Boolean(screen.queryByRole('heading', { name: 'Etapa legada compartilhada' }))).toBe(selectedProjectId === null);
    },
  );

  it('uses the selected project column association rather than individual card project values', () => {
    renderBoard({ selectedProjectId: projectA.id });

    expect(Boolean(screen.getByText('Card A'))).toBe(true);
    expect(Boolean(screen.getByText('Card B'))).toBe(true);
    expect(Boolean(screen.getByRole('button', { name: /Projeto A/ }))).toBe(true);
  });

  it('supports Todos, project selection, loading state, and Escape', () => {
    const { onSelectProject } = renderBoard();
    const picker = screen.getByRole('button', { name: /Todos/ });

    fireEvent.click(picker);
    expect(Boolean(screen.getByRole('group', { name: 'Projetos disponíveis' }))).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Selecionar projeto Projeto B' }));
    expect(onSelectProject).toHaveBeenCalledWith(projectB.id);
    expect(picker.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(picker);
    fireEvent.click(screen.getByRole('button', { name: 'Todos os projetos' }));
    expect(onSelectProject).toHaveBeenLastCalledWith(null);

    fireEvent.click(picker);
    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });
    expect(picker.getAttribute('aria-expanded')).toBe('false');

    cleanup();
    renderBoard({ isLoaded: false });
    fireEvent.click(screen.getByRole('button', { name: /Todos/ }));
    expect(Boolean(screen.getByText('Carregando projetos...'))).toBe(true);
  });

  it('creates a project and selects only the confirmed ID', async () => {
    const persisted = { ...projectB, id: '66666666-6666-4666-8666-666666666666', name: 'Novo projeto' };
    const { onSelectProject, onAddProject } = renderBoard({
      onAddProject: vi.fn().mockResolvedValue({ success: true, data: persisted }),
    });
    fireEvent.click(screen.getByRole('button', { name: /Todos/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Novo projeto' }));
    fireEvent.change(screen.getByLabelText('Nome do projeto'), { target: { value: persisted.name } });
    fireEvent.submit(screen.getByLabelText('Nome do projeto').closest('form')!);

    await waitFor(() => expect(onAddProject).toHaveBeenCalledWith(persisted.name, '#ef4444'));
    expect(onSelectProject).toHaveBeenCalledWith(persisted.id);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('opens a sibling project editor without changing the selected project', async () => {
    const onSelectProject = vi.fn();
    const onUpdateProject = vi.fn().mockResolvedValue({ success: true });
    renderBoard({ onSelectProject, onUpdateProject });

    fireEvent.click(screen.getByRole('button', { name: /Todos/ }));
    fireEvent.click(screen.getByRole('button', { name: `Editar projeto ${projectA.name}` }));
    fireEvent.change(await screen.findByLabelText('Nome'), { target: { value: 'Projeto atualizado' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(onUpdateProject).toHaveBeenCalledWith(projectA.id, {
      name: 'Projeto atualizado',
      expected: { name: projectA.name },
      columnChanges: [],
    }));
    expect(onSelectProject).not.toHaveBeenCalled();
    expect(screen.getByRole('group', { name: 'Projetos disponíveis' })).toBeTruthy();
  });

  it('closes the editor before its project selector on Escape', async () => {
    renderBoard();
    fireEvent.click(screen.getByRole('button', { name: /Todos/ }));
    fireEvent.click(screen.getByRole('button', { name: `Editar projeto ${projectA.name}` }));
    expect(await screen.findByRole('dialog', { name: `Editar projeto ${projectA.name}` })).toBeTruthy();

    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: `Editar projeto ${projectA.name}` })).toBeNull());
    expect(screen.getByRole('group', { name: 'Projetos disponíveis' })).toBeTruthy();
  });

  it('creates a card with the target column project instead of the project filter', () => {
    const targetColumn: KanbanColumn = {
      id: 'project-b-column',
      title: 'Coluna B',
      behavior: 'active',
      projectId: projectB.id,
      cards: [],
    };
    const onAddCard = vi.fn();
    renderBoard({ columns: [targetColumn], onAddCard, selectedProjectId: null });

    fireEvent.click(screen.getByRole('button', { name: 'Adicionar um card' }));
    fireEvent.change(screen.getByPlaceholderText('Título da tarefa...'), { target: { value: 'Tarefa B' } });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }));

    expect(onAddCard).toHaveBeenCalledWith(targetColumn.id, expect.objectContaining({
      title: 'Tarefa B',
      projectId: projectB.id,
    }));
  });

  it('keeps the prior selection and reports a project creation error', async () => {
    const { onSelectProject } = renderBoard({
      selectedProjectId: projectA.id,
      onAddProject: vi.fn().mockResolvedValue({ success: false, error: 'Não foi possível criar' }),
    });
    fireEvent.click(screen.getByRole('button', { name: /Projeto A/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Novo projeto' }));
    fireEvent.change(screen.getByLabelText('Nome do projeto'), { target: { value: 'Falha' } });
    fireEvent.submit(screen.getByLabelText('Nome do projeto').closest('form')!);

    expect((await screen.findByRole('alert')).textContent).toContain('Não foi possível criar');
    expect(onSelectProject).not.toHaveBeenCalled();
    expect(Boolean(screen.getByText('Card A'))).toBe(true);
    expect(Boolean(screen.getByText('Card B'))).toBe(true);
  });

  it('opens card editing with the keyboard', () => {
    renderBoard();
    const cardElement = screen.getByLabelText(/Arrastar Card A/);

    fireEvent.keyDown(cardElement, { key: 'Enter' });
    expect(Boolean(screen.getByText('Editar Tarefa'))).toBe(true);
    expect(screen.getByText('Projeto A — herdado da coluna')).toBeTruthy();
  });

  it('opens card editing on a mouse click', () => {
    renderBoard();
    const surface = screen.getByText('Card A').closest('.rounded-xl.border') as HTMLElement;
    fireEvent.click(surface, { detail: 1 });
    expect(screen.getByText('Editar Tarefa')).toBeTruthy();
  });

  it('uses the shared column tint and neutral progressive ordinal on regular cards and the drag overlay', () => {
    const tintedColumn = {
      ...columns[0],
      backgroundColor: '#ff0000',
      behavior: 'progressive' as const,
      cards: [columns[0].cards[0]],
    };
    renderBoard({ columns: [tintedColumn] });
    const surface = screen.getByText('Card A').closest('.rounded-xl.border') as HTMLElement;
    expect(surface.style.backgroundColor).not.toBe('#0a0f1f');
    expect(surface.style.backgroundColor).not.toBe('rgb(255, 0, 0)');
    expect(surface.style.borderColor).toMatch(/^rgb/);
    expect(screen.getByLabelText('Posição 1 de 1').className).not.toContain('violet');
    const progressiveBadge = screen.getByTitle('Cards numerados na ordem de execução');
    expect(progressiveBadge.className).toContain('bg-white/5');
    expect(progressiveBadge.className).not.toContain('violet');
    expect(progressiveBadge.querySelector('svg')?.getAttribute('class')).toContain('text-white/60');
    const priority = screen.getByText('PRIORIDADE MÉDIA');
    expect(priority.className).toContain('bg-amber-500/20');
    expect(priority.className).toContain('text-amber-400');

    act(() => fireEvent.keyDown(screen.getByLabelText(/Arrastar Card A/), { key: ' ', code: 'Space' }));
    const overlayCard = screen.getAllByText('Card A').at(-1)?.closest('.rounded-xl.border') as HTMLElement;
    expect(overlayCard.style.backgroundColor).toBe(surface.style.backgroundColor);
    expect(screen.getAllByText('1').some((element) => element.className.includes('violet'))).toBe(false);
    act(() => fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' }));
  });

  it.each([
    ['active', 'Tarefas continuam no dia seguinte'],
    ['completion', 'Somente tarefas marcadas somem no dia seguinte'],
    ['progressive', 'Cards numerados na ordem de execução'],
  ] as const)('uses the same neutral header behavior badge for %s columns', (behavior, title) => {
    renderBoard({ columns: [{ ...columns[0], behavior }] });
    const badge = screen.getByTitle(title);
    expect(badge.className).toContain('bg-white/5');
    expect(badge.className).toContain('border-white/10');
    expect(badge.className).not.toMatch(/green|violet|#00f6ff/);
    expect(badge.querySelector('svg')?.getAttribute('class')).toContain('text-white/60');
  });

  it('toggles completion using an ISO timestamp and null without opening the editor', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-10T12:34:56.000Z'));
    const onUpdateCard = vi.fn().mockResolvedValue(true);
    const completionColumn: KanbanColumn = {
      ...columns[0],
      behavior: 'completion',
      cards: [completionCard('checked-card', 'Concluída', '2026-09-10T10:00:00.000Z'), completionCard('pending-card', 'Pendente', null)],
    };
    renderBoard({ columns: [completionColumn], onUpdateCard });

    fireEvent.click(screen.getByRole('button', { name: 'Marcar Pendente como concluída' }));
    await act(async () => { await Promise.resolve(); });
    expect(onUpdateCard).toHaveBeenCalledWith(
      completionColumn.id, 'pending-card', { completedAt: '2026-09-10T12:34:56.000Z' },
    );
    expect(screen.queryByText('Editar Tarefa')).toBeNull();
    expect(screen.getAllByText('Pendente')).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Desmarcar Concluída como pendente' }));
    await act(async () => { await Promise.resolve(); });
    expect(onUpdateCard).toHaveBeenCalledWith(completionColumn.id, 'checked-card', { completedAt: null });
    expect(screen.queryByText('Editar Tarefa')).toBeNull();
  });

  it('does not start card dragging from completion controls during a mouse threshold move', () => {
    const completionColumn: KanbanColumn = {
      ...columns[0],
      behavior: 'completion',
      cards: [completionCard('pending-card', 'Pendente', null)],
    };
    renderBoard({ columns: [completionColumn] });
    const checkbox = screen.getByRole('button', { name: 'Marcar Pendente como concluída' });

    act(() => {
      fireEvent.mouseDown(checkbox, { button: 0, clientX: 10, clientY: 10 });
      fireEvent.mouseMove(document, { buttons: 1, clientX: 28, clientY: 10 });
      fireEvent.mouseUp(document, { button: 0, clientX: 28, clientY: 10 });
    });
    expect(screen.getAllByText('Pendente')).toHaveLength(1);
    expect(screen.queryByText('Editar Tarefa')).toBeNull();

    fireEvent.keyDown(checkbox, { key: ' ', code: 'Space' });
    expect(screen.getAllByText('Pendente')).toHaveLength(1);
  });

  it('does not start column dragging from its menu during a mouse threshold move', async () => {
    renderBoard();
    const menuButton = screen.getByRole('button', { name: 'Abrir ações da coluna A FAZER' });

    act(() => {
      fireEvent.mouseDown(menuButton, { button: 0, clientX: 10, clientY: 10 });
      fireEvent.mouseMove(document, { buttons: 1, clientX: 28, clientY: 10 });
      fireEvent.mouseUp(document, { button: 0, clientX: 28, clientY: 10 });
    });
    expect(screen.getAllByRole('heading', { name: 'A FAZER' })).toHaveLength(1);

    fireEvent.pointerDown(menuButton);
    fireEvent.click(menuButton);
    expect(await screen.findByRole('menu')).toBeTruthy();
  });

  it('keeps a completion checkbox busy through a failed callback and leaves rollback to the mutation hook', async () => {
    let resolveUpdate!: (value: boolean) => void;
    const onUpdateCard = vi.fn()
      .mockImplementationOnce(() => new Promise<boolean>((resolve) => { resolveUpdate = resolve; }))
      .mockResolvedValue(true);
    const completionColumn: KanbanColumn = {
      ...columns[0],
      behavior: 'completion',
      cards: [completionCard('pending-card', 'Pendente', null)],
    };
    renderBoard({ columns: [completionColumn], onUpdateCard });
    const checkbox = screen.getByRole('button', { name: 'Marcar Pendente como concluída' });
    fireEvent.click(checkbox);
    expect(checkbox.hasAttribute('disabled')).toBe(true);
    await act(async () => {
      resolveUpdate(false);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(onUpdateCard).toHaveBeenCalledTimes(1);
    expect(onUpdateCard).toHaveBeenCalledWith(completionColumn.id, 'pending-card', { completedAt: expect.any(String) });
    expect(screen.getByRole('button', { name: 'Marcar Pendente como concluída' }).hasAttribute('disabled')).toBe(false);
  });

  it('hides only previously checked completion cards in the default view and keeps explicit dates historical', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-10T12:00:00.000Z'));
    const completionColumn: KanbanColumn = {
      ...columns[0],
      behavior: 'completion',
      cards: [
        completionCard('older', 'Concluída em outro dia anterior', '2026-09-08T10:00:00.000Z'),
        completionCard('yesterday', 'Concluída ontem', '2026-09-09T10:00:00.000Z'),
        completionCard('today', 'Concluída hoje', '2026-09-10T10:00:00.000Z'),
        completionCard('pending', 'Ainda pendente', null),
      ],
    };
    const { unmount } = render(
      <KanbanBoard
        columns={[completionColumn]}
        onColumnsChange={vi.fn()}
        onUpdateColumn={vi.fn()}
        onAddColumn={vi.fn()}
        onDeleteColumn={vi.fn()}
        onAddCard={vi.fn()}
        onUpdateCard={vi.fn()}
        onDeleteCard={vi.fn()}
        onMoveCard={vi.fn()}
        onUpdateCardPositions={vi.fn()}
        isLoaded
      />,
    );
    expect(screen.getByText('2')).toBeTruthy();
    act(() => { vi.advanceTimersByTime(250); });
    expect(screen.queryByText('Concluída em outro dia anterior')).toBeNull();
    expect(screen.queryByText('Concluída ontem')).toBeNull();
    expect(screen.getByText('Concluída hoje')).toBeTruthy();
    expect(screen.getByText('Ainda pendente')).toBeTruthy();

    unmount();
    renderBoard({ columns: [completionColumn], selectedDate: new Date('2026-09-09T12:00:00.000Z') });
    expect(screen.queryByText('Concluída em outro dia anterior')).toBeNull();
    expect(screen.getByText('Concluída ontem')).toBeTruthy();
    expect(screen.getByText('Concluída hoje')).toBeTruthy();
    expect(screen.getByText('Ainda pendente')).toBeTruthy();
  });

  it('starts keyboard dragging with Space and cancels locally with Escape', async () => {
    const onColumnsChange = vi.fn();
    renderBoard({ onColumnsChange });
    const cardActivator = screen.getByLabelText(/Arrastar Card A/);
    act(() => fireEvent.keyDown(cardActivator, { key: ' ', code: 'Space' }));
    expect(screen.getAllByText('Card A').length).toBeGreaterThan(1);
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    act(() => fireEvent.keyDown(cardActivator, { key: 'Escape', code: 'Escape' }));
    expect(onColumnsChange).not.toHaveBeenCalled();
    const cardTitle = screen.getAllByText('Card A')[0];
    act(() => {
      fireEvent.mouseDown(cardTitle, { button: 0, clientX: 10, clientY: 10 });
      fireEvent.mouseUp(cardTitle, { button: 0, clientX: 10, clientY: 10 });
    });
    fireEvent.click(cardTitle, { detail: 1 });
    expect(screen.getByText('Editar Tarefa')).toBeTruthy();
  });

  it('renders all cards from a project-bound column in its drag overlay', () => {
    renderBoard({
      columns: [{ ...reassignedAndLegacyColumns[1], projectId: projectA.id }],
      selectedProjectId: projectA.id,
    });
    act(() => fireEvent.keyDown(
      screen.getByLabelText('Arrastar coluna Etapa legada compartilhada'),
      { key: ' ', code: 'Space' },
    ));
    expect(screen.getAllByText('Card legado A')).toHaveLength(2);
    expect(screen.getAllByText('Card legado B')).toHaveLength(2);
    act(() => fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' }));
  });
});