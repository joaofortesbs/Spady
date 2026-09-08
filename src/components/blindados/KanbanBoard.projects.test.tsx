import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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

const columns: KanbanColumn[] = [{
  id: '33333333-3333-4333-8333-333333333333',
  title: 'A FAZER',
  behavior: 'active',
  cards: [
    card('44444444-4444-4444-8444-444444444444', 'Card A', projectA.id),
    card('55555555-5555-4555-8555-555555555555', 'Card B', projectB.id),
  ],
}];

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
});

describe('KanbanBoard project entry point', () => {
  it('shows all cards by default and filters by the selected project', () => {
    renderBoard({ selectedProjectId: projectA.id });

    expect(Boolean(screen.getByText('Card A'))).toBe(true);
    expect(screen.queryByText('Card B')).toBeNull();
    expect(Boolean(screen.getByRole('button', { name: /Projeto A/ }))).toBe(true);
  });

  it('supports Todos, project selection, loading state, and Escape', () => {
    const { onSelectProject } = renderBoard();
    const picker = screen.getByRole('button', { name: /Todos/ });

    fireEvent.click(picker);
    expect(Boolean(screen.getByRole('menu'))).toBe(true);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Projeto B' }));
    expect(onSelectProject).toHaveBeenCalledWith(projectB.id);
    expect(picker.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(picker);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Todos os projetos' }));
    expect(onSelectProject).toHaveBeenLastCalledWith(null);

    fireEvent.click(picker);
    fireEvent.keyDown(document, { key: 'Escape' });
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
    fireEvent.click(screen.getByRole('menuitem', { name: 'Novo projeto' }));
    fireEvent.change(screen.getByLabelText('Nome do projeto'), { target: { value: persisted.name } });
    fireEvent.submit(screen.getByLabelText('Nome do projeto').closest('form')!);

    await waitFor(() => expect(onAddProject).toHaveBeenCalledWith(persisted.name, '#ef4444'));
    expect(onSelectProject).toHaveBeenCalledWith(persisted.id);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('keeps the prior selection and reports a project creation error', async () => {
    const { onSelectProject } = renderBoard({
      selectedProjectId: projectA.id,
      onAddProject: vi.fn().mockResolvedValue({ success: false, error: 'Não foi possível criar' }),
    });
    fireEvent.click(screen.getByRole('button', { name: /Projeto A/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Novo projeto' }));
    fireEvent.change(screen.getByLabelText('Nome do projeto'), { target: { value: 'Falha' } });
    fireEvent.submit(screen.getByLabelText('Nome do projeto').closest('form')!);

    expect((await screen.findByRole('alert')).textContent).toContain('Não foi possível criar');
    expect(onSelectProject).not.toHaveBeenCalled();
    expect(Boolean(screen.getByText('Card A'))).toBe(true);
    expect(screen.queryByText('Card B')).toBeNull();
  });

  it('opens card editing with the keyboard', () => {
    renderBoard();
    const cardElement = screen.getByLabelText('Editar tarefa Card A');

    fireEvent.keyDown(cardElement, { key: 'Enter' });
    expect(Boolean(screen.getByText('Editar Tarefa'))).toBe(true);
  });
});