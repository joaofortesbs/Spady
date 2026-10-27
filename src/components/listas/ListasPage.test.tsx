import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ListasPage } from './ListasPage';
import { changeRemote, remoteFailure, remoteState, resetRemote } from '@/lib/listas/__tests__/memoryRemoteRepository';
import { prepareLocalImage } from '@/lib/listas/images';

vi.mock('@/lib/listas/images', () => ({
  prepareLocalImage: vi.fn(async (file: File) => ({ id: crypto.randomUUID(), name: file.name, dataUrl: 'data:image/webp;base64,YWJj' })),
}));
vi.mock('@/lib/listas/remoteRepository', async () => ({
  RemoteListsRepository: (await import('@/lib/listas/__tests__/memoryRemoteRepository')).MemoryRemoteRepository,
}));

beforeEach(() => {
  localStorage.clear();
  resetRemote();
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Live network is forbidden in unit tests'); }));
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })));
  Object.defineProperty(navigator, 'locks', { configurable: true, value: {
    request: async (_key: string, _options: unknown, action: () => unknown) => action(),
  } });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.mocked(prepareLocalImage).mockClear(); Reflect.deleteProperty(navigator, 'locks'); });

async function createFirstList() {
  render(<ListasPage userId="ui-account" />);
  await screen.findByLabelText('Nome da lista');
  fireEvent.change(screen.getByLabelText('Nome da lista'), { target: { value: 'Estante' } });
  fireEvent.change(screen.getByLabelText(/Descrição/), { target: { value: 'Leituras pessoais' } });
  fireEvent.click(screen.getByRole('button', { name: 'Criar lista' }));
  await screen.findByRole('heading', { name: 'Estante' });
  expect(screen.queryByText(/SEU ESPAÇO PESSOAL/)).toBe(null);
  expect(screen.queryByText(/Suas listas não sincronizam/)).toBe(null);
  expect(screen.queryByText('Somente neste navegador.')).toBe(null);
}

async function openNewItem(title: string) {
  fireEvent.click(screen.getByRole('button', { name: 'Adicionar item' }));
  const dialog = await screen.findByRole('dialog');
  expect(within(dialog).queryByText(/^(opcional|obrigatório)$/i)).toBe(null);
  expect(within(dialog).getByLabelText('Título').getAttribute('aria-required')).toBe('true');
  fireEvent.change(within(dialog).getByLabelText(/Título/), { target: { value: title } });
  return dialog;
}

async function saveItem(dialog: HTMLElement) {
  fireEvent.click(within(dialog).getByRole('button', { name: 'Salvar item' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBe(null));
}

describe('Listas UI with remote repository contract', () => {
  it('creates, inspects, edits, reorders and reloads items through the remote contract', async () => {
    await createFirstList();
    let dialog = await openNewItem('Primeiro livro');
    fireEvent.change(within(dialog).getByLabelText(/Descrição/), { target: { value: 'Descrição completa' } });
    const input = dialog.querySelector('input[type=file]')!;
    fireEvent.change(input, { target: { files: [new File(['png'], 'capa.png', { type: 'image/png' }), new File(['png'], 'verso.png', { type: 'image/png' })] } });
    await within(dialog).findByRole('button', { name: 'Selecionar imagem 2' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Selecionar imagem 2' }));
    expect(within(dialog).getByAltText('verso.png')).toBeTruthy();
    await saveItem(dialog);
    fireEvent.click(screen.getByRole('button', { name: /^Primeiro livro/ }));
    dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Descrição completa')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Ver imagem 2' }));
    expect(within(dialog).getByAltText('verso.png')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Editar item' }));
    dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/Título/), { target: { value: 'Livro revisado' } });
    await saveItem(dialog);
    dialog = await openNewItem('Segundo livro');
    await saveItem(dialog);
    expect(screen.queryByRole('button', { name: /^Mover .* para (cima|baixo)$/ })).toBe(null);
    expect(screen.queryByRole('button', { name: /^Reordenar / })).toBe(null);
    const secondItem = screen.getByRole('button', { name: /^Segundo livro/ });
    expect(secondItem.getAttribute('aria-keyshortcuts')).toContain('Alt+ArrowUp');
    fireEvent.keyDown(secondItem, { key: 'ArrowUp', code: 'ArrowUp', altKey: true });
    await waitFor(() => expect(screen.getAllByRole('listitem')[0].textContent).toContain('Segundo livro'));
    cleanup();
    render(<ListasPage userId="ui-account" />);
    await screen.findByRole('heading', { name: 'Estante' });
    expect(screen.getAllByRole('listitem').map(node => node.textContent)).toEqual([
      expect.stringContaining('Segundo livro'), expect.stringContaining('Livro revisado'),
    ]);
    const snapshot = remoteState('ui-account');
    expect(snapshot.lists[0].items[1].images).toHaveLength(2);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects more than five selected images and preserves confirmed data on discard', async () => {
    await createFirstList();
    const dialog = await openNewItem('Rascunho');
    fireEvent.change(dialog.querySelector('input[type=file]')!, { target: { files: Array.from({ length: 6 }, (_, n) => new File(['png'], `${n}.png`, { type: 'image/png' })) } });
    expect(await within(dialog).findByRole('alert')).toHaveProperty('textContent', expect.stringContaining('mais 5'));
    expect(prepareLocalImage).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    const confirmation = await screen.findByRole('alertdialog');
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Descartar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBe(null));
    expect(remoteState('ui-account').lists[0].items).toEqual([]);
  });

  it('keeps a failed item form recoverable when remote saving fails', async () => {
    await createFirstList();
    const dialog = await openNewItem('Não perder este título');
    remoteFailure.next = new Error('Não foi possível salvar no Supabase.');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Salvar item' }));
    await waitFor(() => expect(within(dialog).getByRole('alert').textContent).toContain('Supabase'));
    expect((within(dialog).getByLabelText(/Título/) as HTMLInputElement).value).toBe('Não perder este título');
    expect(remoteState('ui-account').lists[0].items).toEqual([]);
  });

  it('does not overwrite an item changed in another tab after refreshing while editing', async () => {
    await createFirstList();
    let dialog = await openNewItem('Versão inicial');
    await saveItem(dialog);
    fireEvent.click(screen.getByRole('button', { name: /^Versão inicial/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Editar item' }));
    dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/Título/), { target: { value: 'Rascunho anterior' } });
    act(() => changeRemote('ui-account', snapshot => { snapshot.lists[0].items[0].title = 'Confirmado na outra aba'; }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Salvar item' }));
    await within(dialog).findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: /Atualizar listas/ }));
    await waitFor(() => expect((within(dialog).getByRole('button', { name: 'Salvar item' }) as HTMLButtonElement).disabled).toBe(true));
    expect((within(dialog).getByLabelText(/Título/) as HTMLInputElement).value).toBe('Rascunho anterior');
    expect(remoteState('ui-account').lists[0].items[0].title).toBe('Confirmado na outra aba');
  });
});
