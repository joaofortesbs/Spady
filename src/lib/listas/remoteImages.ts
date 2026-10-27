import type { SupabaseClient } from '@supabase/supabase-js';
import { remoteImageSchema, type ListImage, type ListsSnapshot } from './model';

export const LISTAS_BUCKET = 'listas-images';
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export type RemoteImage = ReturnType<typeof remoteImageSchema.parse>;
export const imagePaths = (snapshot: ListsSnapshot) => new Set(snapshot.lists.flatMap(list =>
  list.items.flatMap(item => item.images.flatMap(image => 'objectPath' in image ? [image.objectPath] : []))));

export async function uploadImage(client: SupabaseClient, owner: string, image: ListImage): Promise<RemoteImage> {
  if ('objectPath' in image) {
    if (!image.objectPath.startsWith(`${owner}/`)) throw new Error('A imagem pertence a outra conta.');
    return remoteImageSchema.parse(image);
  }
  const match = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(image.dataUrl);
  if (!match) throw new Error('Imagem inválida.');
  const bytes = Uint8Array.from(atob(match[2]), char => char.charCodeAt(0));
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) throw new Error('Cada imagem deve ter até 10 MB.');
  // Include the image identity and bytes; retries are immutable/idempotent.
  const identity = new TextEncoder().encode(image.id);
  const content = new Uint8Array(identity.length + 1 + bytes.length);
  content.set(identity); content.set(bytes, identity.length + 1);
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', content)))
    .map(byte => byte.toString(16).padStart(2, '0')).join('');
  const objectPath = `${owner}/${hash}`;
  const { error } = await client.storage.from(LISTAS_BUCKET).upload(objectPath, bytes, { contentType: match[1], cacheControl: '0', upsert: false });
  // A deterministic immutable object can already exist after a lost response.
  if (error && !('statusCode' in error && String(error.statusCode) === '409')) {
    throw new Error('Não foi possível enviar a imagem ao Supabase. Seu formulário foi mantido; tente novamente.');
  }
  return remoteImageSchema.parse({ id: image.id, name: image.name, objectPath,
    dataUrl: `/api/listas/images?path=${encodeURIComponent(objectPath)}`, mimeType: match[1], byteSize: bytes.length });
}

export async function removeUnusedImages(client: SupabaseClient, paths: string[]): Promise<void> {
  if (!paths.length) return;
  // RLS refuses deletion of any object still referenced by a confirmed item.
  for (let offset = 0; offset < paths.length; offset += 100) {
    try {
      const { error } = await client.storage.from(LISTAS_BUCKET).remove(paths.slice(offset, offset + 100));
      if (error) throw new Error('cleanup');
    } catch {
      console.warn('[Listas] Não foi possível limpar imagens sem referência; os dados confirmados foram preservados.');
    }
  }
}

/** Opportunistic cleanup of uploads interrupted before metadata commit, never recent drafts. */
export async function cleanupInterruptedUploads(client: SupabaseClient, owner: string, snapshot: ListsSnapshot): Promise<void> {
  const referenced = imagePaths(snapshot);
  const stale: string[] = [];
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await client.storage.from(LISTAS_BUCKET).list(owner, {
      limit: 100, offset, sortBy: { column: 'name', order: 'asc' },
    });
    if (error) {
      console.warn('[Listas] Limpeza de uploads interrompidos indisponível.');
      return;
    }
    for (const object of data ?? []) {
      const path = `${owner}/${object.name}`;
      if (/^[a-f0-9]{64}$/.test(object.name) && !referenced.has(path) &&
        object.created_at && new Date(object.created_at).getTime() < cutoff) stale.push(path);
    }
    if (!data || data.length < 100) break;
  }
  await removeUnusedImages(client, stale);
}
