import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useListasData } from './useListasData';
import { listsStorageKey } from '@/lib/listas/model';

beforeEach(() => {
  localStorage.clear();
  Object.defineProperty(navigator, 'locks', { configurable: true, value: {
    request: async (_key: string, _options: unknown, action: () => unknown) => action(),
  } });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); Reflect.deleteProperty(navigator, 'locks'); });

describe('useListasData', () => {
  it('restores after mounting, supports create/edit/reorder and preserves images on text edit', async () => {
    const { result, unmount } = renderHook(() => useListasData('user-a'));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    let listId = '';
    await act(async () => { listId = await result.current.createList('Lista', 'Descrição'); });
    const images = [{ id: 'image-a', name: 'a.webp', dataUrl: 'data:image/webp;base64,YWJj' }];
    await act(async () => { await result.current.saveItem(listId, { title: 'Primeiro', description: '', images }); });
    await act(async () => { await result.current.saveItem(listId, { title: 'Segundo', description: '', images: [] }); });
    const [first, second] = result.current.lists[0].items;
    await act(async () => { await result.current.saveItem(listId, { ...first, title: 'Editado' }, first.id); });
    expect(result.current.lists[0].items[0].images).toEqual(images);
    await act(async () => { await result.current.reorderItems(listId, [second.id, first.id]); });
    unmount();
    const restored = renderHook(() => useListasData('user-a'));
    await waitFor(() => expect(restored.result.current.loaded).toBe(true));
    expect(restored.result.current.lists[0].items.map(item => item.title)).toEqual(['Segundo', 'Editado']);
  });

  it('does not leak lists into another account or overwrite them during restoration', async () => {
    const { result, rerender } = renderHook(({ userId }) => useListasData(userId), { initialProps: { userId: 'a' } });
    await act(async () => { await result.current.createList('Somente A', ''); });
    rerender({ userId: 'b' });
    expect(result.current.lists).toEqual([]);
    await act(async () => { await result.current.createList('Somente B', ''); });
    rerender({ userId: 'a' });
    await waitFor(() => expect(result.current.lists[0]?.name).toBe('Somente A'));
  });

  it('reports malformed storage and does not replace its contents', async () => {
    localStorage.setItem(listsStorageKey('a'), 'malformed');
    const { result } = renderHook(() => useListasData('a'));
    await waitFor(() => expect(result.current.error).toContain('preservado'));
    expect(localStorage.getItem(listsStorageKey('a'))).toBe('malformed');
  });

  it('preserves confirmed state when a save fails', async () => {
    const { result } = renderHook(() => useListasData('a'));
    await act(async () => { await result.current.createList('Original', ''); });
    const before = result.current.lists;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('full', 'QuotaExceededError'); });
    await act(async () => { await expect(result.current.createList('Sem espaço', '')).rejects.toThrow('cheio'); });
    expect(result.current.lists).toEqual(before);
    expect(result.current.saving).toBe(false);
  });

  it('flags storage changes in another tab without silently accepting stale editor state', async () => {
    const { result } = renderHook(() => useListasData('a'));
    await act(async () => { await result.current.createList('Minha lista', ''); });
    act(() => window.dispatchEvent(new StorageEvent('storage', { key: listsStorageKey('a') })));
    expect(result.current.error).toContain('outra aba');
    act(() => result.current.reload());
    expect(result.current.error).toBe(null);
  });
});
