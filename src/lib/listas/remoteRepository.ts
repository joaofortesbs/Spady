import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/client';
import { LocalListsRepository } from './localRepository';
import { remoteImageSchema, snapshotSchema, type ListsSnapshot } from './model';
import { cleanupInterruptedUploads, imagePaths, removeUnusedImages, uploadImage } from './remoteImages';

function remoteError(code?: string): Error {
  if (code === 'PT409' || code === '40001') return new Error('As listas mudaram em outra aba ou dispositivo. Atualize as listas antes de salvar novamente; seu formulário foi mantido.');
  if (code === '42501' || code === 'PGRST301') return new Error('Sua sessão expirou. Entre novamente para acessar suas listas.');
  return new Error('Não foi possível salvar ou carregar as listas no Supabase. Verifique a conexão e tente novamente; seus dados e formulário foram preservados.');
}

const wireSchema = z.object({
  lists: z.array(z.object({
    items: z.array(z.object({
      images: z.array(remoteImageSchema.omit({ dataUrl: true })),
    }).passthrough()),
  }).passthrough()),
}).passthrough();

export function hydrateSnapshot(value: unknown, owner: string): ListsSnapshot {
  // Hydrate only known fields, then validate the entire response (including IDs/order/limits).
  const wire = wireSchema.parse(value);
  const hydrated = {
    ...wire,
    lists: wire.lists.map(list => ({ ...list, items: list.items.map(item =>
      ({ ...item, images: item.images.map(image => ({ ...image,
        dataUrl: `/api/listas/images?path=${encodeURIComponent(String(image.objectPath))}` })) })) })),
  };
  const snapshot = snapshotSchema.parse(hydrated);
  if (snapshot.owner !== owner || snapshot.lists.some(list => list.items.some(item =>
    item.images.some(image => !('objectPath' in image) || !image.objectPath.startsWith(`${owner}/`))))) {
    throw new Error('A resposta das listas não corresponde à conta atual.');
  }
  return snapshot;
}

export class RemoteListsRepository {
  constructor(readonly owner: string, private readonly client: SupabaseClient = createClient()) {}

  private async authenticate() {
    const { data, error } = await this.client.auth.getUser();
    if (error || data.user?.id !== this.owner) throw new Error('A conta mudou ou a sessão expirou. Entre novamente antes de salvar.');
  }

  async load(): Promise<ListsSnapshot> {
    await this.authenticate();
    const { data, error } = await this.client.rpc('listas_read_v1');
    if (error) throw remoteError(error.code);
    return hydrateSnapshot(data, this.owner);
  }

  async importLocal(remote: ListsSnapshot, isActive: () => boolean): Promise<ListsSnapshot> {
    const local = new LocalListsRepository(this.owner).load();
    if (!local.lists.length) return remote;
    // The revision is part of the original validated snapshot; never write a local "success" marker.
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(local.revision))))
      .map(byte => byte.toString(16).padStart(2, '0')).join('');
    const key = `local-v1:${hash}`;
    const { data, error } = await this.client.from('listas_imports').select('import_key')
      .eq('user_id', this.owner).eq('import_key', key).maybeSingle();
    if (error) throw remoteError(error.code);
    if (data) return remote;
    return this.write(local, isActive, key);
  }

  async commit(previous: ListsSnapshot, change: (snapshot: ListsSnapshot) => void, isActive: () => boolean): Promise<ListsSnapshot> {
    const next: ListsSnapshot = JSON.parse(JSON.stringify(previous));
    change(next);
    return this.write(snapshotSchema.parse(next), isActive, null, previous);
  }

  private async write(
    snapshot: ListsSnapshot, isActive: () => boolean, importKey: string | null,
    previous?: ListsSnapshot,
  ): Promise<ListsSnapshot> {
    await this.authenticate();
    const next = snapshotSchema.parse(JSON.parse(JSON.stringify(snapshot)));
    if (next.owner !== this.owner) throw new Error('Conta inválida.');
    const staged: string[] = [];
    try {
      for (const list of next.lists) {
        for (const item of list.items) {
          for (let index = 0; index < item.images.length; index++) {
            if (!isActive()) throw new Error('A conta ou a seção mudou. Operação cancelada.');
            const original = item.images[index];
            const remote = await uploadImage(this.client, this.owner, original);
            item.images[index] = remote;
            if (!('objectPath' in original)) staged.push(remote.objectPath);
          }
        }
      }
      if (!isActive()) throw new Error('A conta ou a seção mudou. Operação cancelada.');
      const payload = next.lists.map(list => ({ ...list, items: list.items.map(item => ({
        ...item, images: item.images.map(image => {
          if (!('objectPath' in image)) throw new Error('Envio de imagem incompleto.');
          const { id, name, objectPath, mimeType, byteSize } = image;
          return { id, name, objectPath, mimeType, byteSize };
        }),
      })) }));
      const { data, error } = await this.client.rpc('listas_commit_v1', {
        p_owner: this.owner, p_revision: next.revision, p_lists: payload, p_import_key: importKey,
      });
      if (error) throw remoteError(error.code);
      const saved = hydrateSnapshot(data, this.owner);
      if (previous) {
        const current = imagePaths(saved);
        await removeUnusedImages(this.client, [...imagePaths(previous)].filter(path => !current.has(path)));
      }
      return saved;
    } catch (error) {
      // Includes an ambiguous network failure: RLS protects a commit whose response was lost.
      await removeUnusedImages(this.client, staged);
      throw error;
    }
  }

  async cleanup(snapshot: ListsSnapshot) {
    try { await cleanupInterruptedUploads(this.client, this.owner, snapshot); }
    catch { console.warn('[Listas] Limpeza temporária indisponível; nenhuma lista foi descartada.'); }
  }
}
