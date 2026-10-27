import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Sidebar } from '@/components/blindados/Sidebar';
import { isSection, SECTIONS } from './navigation';

afterEach(cleanup);
describe('Shared section contract and sidebar', () => {
  it('restores all sections including Listas and rejects unknown preferences', () => {
    for (const section of SECTIONS) expect(isSection(section)).toBe(true);
    expect(isSection('unknown')).toBe(false);
    expect(isSection('')).toBe(false);
  });
  it.each([true, false])('Listas remains accessible with collapsed=%s', collapsed => {
    const change = vi.fn();
    render(<Sidebar activeSection="listas" onSectionChange={change} collapsed={collapsed} onCollapsedChange={vi.fn()} onExport={vi.fn()} />);
    const button = screen.getByRole('button', { name: 'Listas' });
    expect(button.getAttribute('aria-current')).toBe('page');
    fireEvent.click(button);
    expect(change).toHaveBeenCalledWith('listas');
    expect(screen.getByRole('button', { name: 'Flows' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Visões' })).toBeTruthy();
  });
});
