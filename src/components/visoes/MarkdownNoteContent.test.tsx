import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MarkdownNoteContent, getMarkdownPreview, parseMarkdownBlocks, toggleChecklistItem } from './MarkdownNoteContent';

describe('MarkdownNoteContent', () => {
  it('separa títulos, parágrafos, listas, checklist, citação, código e divisor', () => {
    const blocks = parseMarkdownBlocks('# Título\n\nTexto **forte**.\n\n- item\n- [x] concluído\n\n> ideia\n\n---\n\n```ts\nconst value = 1;\n```');
    expect(blocks.map((block) => block.type)).toEqual(['heading', 'paragraph', 'unordered-list', 'checklist', 'quote', 'divider', 'code']);
    expect(blocks[0]).toMatchObject({ level: 1, content: 'Título' });
    expect(blocks[3]).toMatchObject({ items: [{ checked: true, content: 'concluído' }] });
  });

  it('renderiza formatação inline sem interpretar HTML bruto', () => {
    render(<MarkdownNoteContent content={'**forte** *itálico* ==marcado== ~~riscado~~ `código`'} />);
    expect(screen.getByText('forte')).toBeTruthy();
    expect(screen.getByText('itálico')).toBeTruthy();
    expect(screen.getByText('marcado')).toBeTruthy();
    expect(screen.getByText('riscado')).toBeTruthy();
    expect(screen.getByText('código')).toBeTruthy();
    expect(document.querySelector('strong')).toBeTruthy();
    expect(document.querySelector('mark')).toBeTruthy();
  });

  it('renderiza e alterna checklist através do callback', () => {
    const onToggle = vi.fn();
    render(<MarkdownNoteContent content={'## Ações\n\n- [ ] Primeiro passo\n- [x] Segundo passo'} onToggleChecklist={onToggle} />);
    const checkbox = screen.getByRole('checkbox', { name: 'Marcar item 1' });
    expect((checkbox as HTMLInputElement).checked).toBe(false);
    fireEvent.click(checkbox);
    expect(onToggle).toHaveBeenCalledWith(1, 0, true);
  });

  it('altera a marcação do item sem quebrar títulos e parágrafos', () => {
    const source = '# Plano\n\n- [ ] Executar\n\nTexto final';
    const updated = toggleChecklistItem(source, 1, 0, true);
    expect(updated).toContain('- [x] Executar');
    expect(updated).toContain('# Plano');
    expect(updated).toContain('Texto final');
  });

  it('gera um resumo limpo para a lista lateral', () => {
    expect(getMarkdownPreview('# Plano\n\n**Executar**\n- [ ] tarefa')).toBe('Plano Executar tarefa');
  });
});
