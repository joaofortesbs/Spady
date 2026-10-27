import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { webcrypto } from 'node:crypto';
import { emptySnapshot, listsStorageKey, type ListsSnapshot } from './model';
import { hydrateSnapshot, RemoteListsRepository } from './remoteRepository';

const owner = '00000000-0000-4000-8000-000000000001';
const path = `${owner}/${'a'.repeat(64)}`;
const image = { id: 'image', name: 'capa.webp', objectPath: path, mimeType: 'image/webp', byteSize: 3 };
const localImage = { id: 'new-image', name: 'new.webp', dataUrl: 'data:image/webp;base64,YWJj' };
const wire = (revision='r1') => ({ ...emptySnapshot(owner), revision,
  lists: [{ id: 'list', name: 'Lista', description: 'Texto', items: [
    { id: 'item', title: 'Item', description: 'Detalhes', images: [image] },
  ] }],
});
const local = (): ListsSnapshot => ({ ...emptySnapshot(owner), revision: 'original-local',
  lists: [{ id: 'local-list', name: 'Local', description: '', items: [
    { id: 'local-item', title: 'Local item', description: '', images: [localImage] },
  ] }],
});

function harness() {
  const rpc = vi.fn().mockResolvedValue({ data: wire(), error: null });
  const upload = vi.fn().mockResolvedValue({ error: null });
  const remove = vi.fn().mockResolvedValue({ error: null });
  const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
  const eq = vi.fn().mockReturnThis();
  const client = {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: owner } }, error: null }) },
    rpc, from: vi.fn(() => ({ select: vi.fn(() => ({ eq, maybeSingle })) })),
    storage: { from: vi.fn(() => ({ upload, remove, list: vi.fn().mockResolvedValue({ data: [], error: null }) })) },
  };
  // eq chaining is deliberately explicit so the mock preserves the PostgREST builder contract.
  eq.mockReturnValue({ eq, maybeSingle });
  return { repo: new RemoteListsRepository(owner, client as unknown as SupabaseClient), client, rpc, upload, remove, maybeSingle };
}
beforeEach(() => {
  localStorage.clear();
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: webcrypto });
});

describe('remote lists repository', () => {
  it('hydrates private references, rejects another owner and malformed responses', () => {
    const snapshot = hydrateSnapshot(wire(), owner);
    expect(snapshot.lists[0].items[0].images[0].dataUrl).toBe(`/api/listas/images?path=${encodeURIComponent(path)}`);
    expect(() => hydrateSnapshot(wire(), 'other')).toThrow('conta');
    expect(() => hydrateSnapshot({ lists: [{}] }, owner)).toThrow();
  });

  it('loads through the authenticated session without service credentials', async () => {
    const { repo, rpc, client } = harness();
    await repo.load();
    expect(client.auth.getUser).toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith('listas_read_v1');
  });

  it('sends texts, canonical order, metadata and expected revision, never data URLs', async () => {
    const { repo, rpc } = harness();
    const previous = hydrateSnapshot(wire(), owner);
    await repo.commit(previous, snapshot => { snapshot.lists[0].items[0].title = 'Editado'; }, () => true);
    const args = rpc.mock.calls[0][1];
    expect(args.p_owner).toBe(owner);
    expect(args.p_revision).toBe('r1');
    expect(args.p_lists[0].items[0].title).toBe('Editado');
    expect(args.p_lists[0].items[0].images[0]).toEqual(image);
    expect(JSON.stringify(args)).not.toContain('dataUrl');
    expect(previous.lists[0].items[0].title).toBe('Item');
  });

  it('uploads first, then commits references, and preserves the local backup', async () => {
    const { repo, rpc, upload } = harness();
    const original = JSON.stringify(local());
    localStorage.setItem(listsStorageKey(owner), original);
    rpc.mockImplementation(async (_name, args) => ({ data: { ...emptySnapshot(owner), revision: 'remote', lists: args.p_lists }, error: null }));
    const saved = await repo.importLocal(emptySnapshot(owner), () => true);
    expect(upload).toHaveBeenCalledOnce();
    expect(upload.mock.invocationCallOrder[0]).toBeLessThan(rpc.mock.invocationCallOrder[0]);
    expect(rpc.mock.calls[0][1].p_import_key).toMatch(/^local-v1:[a-f0-9]{64}$/);
    expect(saved.lists[0].items[0].images[0]).toHaveProperty('objectPath');
    expect(localStorage.getItem(listsStorageKey(owner))).toBe(original);
  });

  it('does not re-upload an already imported snapshot or overwrite newer remote data', async () => {
    const { repo, rpc, upload, maybeSingle } = harness();
    localStorage.setItem(listsStorageKey(owner), JSON.stringify(local()));
    maybeSingle.mockResolvedValue({ data: { import_key: 'already' }, error: null });
    const remote = hydrateSnapshot(wire(), owner);
    expect(await repo.importLocal(remote, () => true)).toBe(remote);
    expect(upload).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('stops before metadata commit on upload failure and keeps original state', async () => {
    const { repo, upload, rpc } = harness();
    upload.mockResolvedValue({ error: { statusCode: '500' } });
    const original = local();
    await expect(repo.commit(original, () => {}, () => true)).rejects.toThrow('enviar');
    expect(rpc).not.toHaveBeenCalled();
    expect(original.lists[0].items[0].images[0]).toEqual(localImage);
  });

  it('handles deterministic duplicate uploads and cleans staged uploads on rejected commit', async () => {
    const { repo, upload, rpc, remove } = harness();
    upload.mockResolvedValue({ error: { statusCode: '409' } });
    rpc.mockResolvedValue({ data: null, error: { code: 'PT409' } });
    await expect(repo.commit(local(), () => {}, () => true)).rejects.toThrow('outra aba');
    expect(remove).toHaveBeenCalledWith([expect.stringMatching(new RegExp(`^${owner}/[a-f0-9]{64}$`))]);
  });

  it('does not write after account change or an inactive operation', async () => {
    const { repo, client, rpc } = harness();
    client.auth.getUser.mockResolvedValue({ data: { user: { id: 'other' } }, error: null });
    await expect(repo.commit(local(), () => {}, () => true)).rejects.toThrow('conta');
    expect(rpc).not.toHaveBeenCalled();
    client.auth.getUser.mockResolvedValue({ data: { user: { id: owner } }, error: null });
    await expect(repo.commit(local(), () => {}, () => false)).rejects.toThrow('cancelada');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('removes obsolete files only after a successful metadata commit', async () => {
    const { repo, rpc, remove } = harness();
    rpc.mockResolvedValue({ data: { ...wire('r2'), lists: [] }, error: null });
    await repo.commit(hydrateSnapshot(wire(), owner), snapshot => { snapshot.lists = []; }, () => true);
    expect(remove).toHaveBeenCalledWith([path]);
    expect(rpc.mock.invocationCallOrder[0]).toBeLessThan(remove.mock.invocationCallOrder[0]);
  });
});
