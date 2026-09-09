import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { KanbanWorkspace } from './KanbanWorkspace';

describe('KanbanWorkspace layout', () => {
  it('fills the available width so the board aligns with the section container', () => {
    const { container } = render(
      <KanbanWorkspace
        columns={[]}
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
        projects={[]}
        selectedProjectId={null}
        onSelectProject={vi.fn()}
        onAddProject={vi.fn()}
        selectedDate={null}
        onSelectDate={vi.fn()}
        loadError={false}
        isSyncing={false}
        onRetry={vi.fn()}
      />,
    );

    const workspace = container.firstElementChild;
    const board = workspace?.firstElementChild;

    expect(workspace?.className).toContain('w-full');
    expect(workspace?.className).toContain('min-w-0');
    expect(board?.className).toContain('w-full');
    expect(board?.className).toContain('min-w-0');
  });
});