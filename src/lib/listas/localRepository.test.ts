import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalListsRepository, type ExclusiveLock } from './localRepository';
import { emptySnapshot, itemDraftSchema, listsStorageKey, reorderListItems, type ListsSnapshot } from './model';
import { safeStorage } from '@/lib/utils/safeStorage';

const lock: ExclusiveLock = async (_key, action) => action();
const repository = (owner = 'local-user-a') => new LocalListsRepository(owner, () => localStorage, lock);
const addList = (snapshot: ListsSnapshot) => {
  snapshot.lists.push({ id: 'list-1', name: 'Referências', description: 'Uma coleção pessoal', items: [] });
};
const image = (id: string) => ({ id, name: 'Imagem.webp', dataUrl: 'data:image/webp;base64,YWJj' });

describe('Listas: localStorage-only repository', () => {
  beforeEach(() => { localStorage.clear(); vi.restoreAllMocks(); });

  it('does not write during initial restoration, and reloads confirmed records with images', async () => {
    const repo = repository();
    const write = vi.spyOn(Storage.prototype, 'setItem');
    expect(repo.load()).toEqual(emptySnapshot(repo.owner));
    expect(write).not.toHaveBeenCalled();
    const saved = await repo.commit('0', snapshot => {
      addList(snapshot);
      snapshot.lists[0].items.push({ id: 'item-1', title: 'Livro', description: 'Descrição', images: [image('image-1')] });
    });
    expect(repository().load()).toEqual(saved);
    expect(repository().load().lists[0].items[0].images[0].dataUrl).toBe(image('image-1').dataUrl);
  });

  it('separates accounts without removing saved data', async () => {
    await repository().commit('0', addList);
    expect(repository('local-user-b').load().lists).toEqual([]);
    expect(repository().load().lists).toHaveLength(1);
    expect(() => repository('')).toThrow('Entre');
  });

  it('keeps personal lists in this browser after the existing sign-out cache cleanup', async () => {
    await repository().commit('0', addList);
    safeStorage.clearAppData();
    expect(repository().load().lists[0].name).toBe('Referências');
  });

  it.each(['{invalid', JSON.stringify({ version: 2 }), JSON.stringify({ ...emptySnapshot('another-user') })])(
    'preserves incompatible, corrupted and cross-account data: %s', async raw => {
      localStorage.setItem(listsStorageKey('local-user-a'), raw);
      expect(() => repository().load()).toThrow('preservado');
      await expect(repository().commit('0', addList)).rejects.toThrow();
      expect(localStorage.getItem(listsStorageKey('local-user-a'))).toBe(raw);
    },
  );

  it('preserves original snapshot on quota failure', async () => {
    const saved = await repository().commit('0', addList);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('full', 'QuotaExceededError'); });
    await expect(repository().commit(saved.revision, snapshot => { snapshot.lists[0].name = 'Mudança'; })).rejects.toThrow('cheio');
    expect(repository().load()).toEqual(saved);
  });

  it('reports blocked reads and writes without an in-memory fallback', async () => {
    const blocked = new LocalListsRepository('a', () => { throw new Error('blocked'); }, lock);
    expect(() => blocked.load()).toThrow('bloqueado');
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('denied', 'SecurityError'); });
    await expect(repository().commit('0', addList)).rejects.toThrow('Nada foi alterado');
    expect(repository().load().lists).toEqual([]);
  });

  it('rejects stale tab revisions without overwriting the winning write', async () => {
    const saved = await repository().commit('0', addList);
    await expect(repository().commit('0', addList)).rejects.toThrow('outra aba');
    expect(repository().load()).toEqual(saved);
  });

  it('cancels a queued write after the section/account unmounts', async () => {
    const repo = repository();
    await expect(repo.commit('0', addList, () => false)).rejects.toThrow('cancelada');
    expect(repo.load().lists).toEqual([]);
  });

  it('validates title, image count, durable image data and duplicate IDs before writing', async () => {
    expect(itemDraftSchema.safeParse({ title: ' ', description: '', images: [] }).success).toBe(false);
    expect(itemDraftSchema.safeParse({ title: 'a', description: '', images: Array.from({ length: 6 }, (_, n) => image(`i${n}`)) }).success).toBe(false);
    expect(itemDraftSchema.safeParse({ title: 'a', description: '', images: [{ ...image('i'), dataUrl: 'blob:temporary' }] }).success).toBe(false);
    expect(itemDraftSchema.safeParse({ title: 'a', description: '', images: [image('i'), image('i')] }).success).toBe(false);
    await expect(repository().commit('0', snapshot => { addList(snapshot); addList(snapshot); })).rejects.toThrow();
    expect(repository().load().lists).toEqual([]);
  });

  it('persists reordering and rejects incomplete or repeated orders atomically', async () => {
    const initial = await repository().commit('0', snapshot => {
      addList(snapshot);
      snapshot.lists[0].items = ['a', 'b', 'c'].map(id => ({ id, title: id, description: '', images: [] }));
    });
    const reordered = await repository().commit(initial.revision, snapshot => { reorderListItems(snapshot.lists[0], ['c', 'a', 'b']); });
    expect(repository().load().lists[0].items.map(item => item.id)).toEqual(['c', 'a', 'b']);
    await expect(repository().commit(reordered.revision, snapshot => { reorderListItems(snapshot.lists[0], ['a', 'a', 'b']); })).rejects.toThrow();
    expect(repository().load()).toEqual(reordered);
  });

  it('uses an exclusive Web Lock in the browser and blocks unsafe writes if unavailable', async () => {
    const descriptor = Object.getOwnPropertyDescriptor(navigator, 'locks');
    try {
      const request = vi.fn(async (_key: string, _options: unknown, action: () => unknown) => action());
      Object.defineProperty(navigator, 'locks', { configurable: true, value: { request } });
      await new LocalListsRepository('locked').commit('0', addList);
      expect(request).toHaveBeenCalledWith(listsStorageKey('locked'), { mode: 'exclusive' }, expect.any(Function));
      Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined });
      await expect(new LocalListsRepository('unsupported').commit('0', addList)).rejects.toThrow('navegador');
    } finally {
      if (descriptor) Object.defineProperty(navigator, 'locks', descriptor);
      else Reflect.deleteProperty(navigator, 'locks');
    }
  });

  it('makes no network requests for load/create/edit/reorder', async () => {
    const fetch = vi.fn(() => { throw new Error('Network forbidden'); });
    vi.stubGlobal('fetch', fetch);
    try {
      const repo = repository();
      const created = await repo.commit('0', addList);
      await repo.commit(created.revision, snapshot => { snapshot.lists[0].description = 'Local'; reorderListItems(snapshot.lists[0], []); });
      repo.load();
      expect(fetch).not.toHaveBeenCalled();
    } finally { vi.unstubAllGlobals(); }
  });
});
