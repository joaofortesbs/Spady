import { z } from 'zod';

export const MAX_IMAGES = 5;
export const TITLE_LIMIT = 240;
export const DESCRIPTION_LIMIT = 10_000;
const id = z.string().min(1).max(200);
export const localImageSchema = z.object({
  id,
  name: z.string().min(1).max(500),
  dataUrl: z.string().regex(/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/, 'Imagem local inválida.'),
});
export const remoteImageSchema = z.object({
  id,
  name: z.string().min(1).max(500),
  dataUrl: z.string().startsWith('/api/listas/images?path='),
  objectPath: z.string().regex(/^[0-9a-f-]{36}\/[0-9a-f]{64}$/),
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  byteSize: z.number().int().min(1).max(10 * 1024 * 1024),
});
export const imageSchema = z.union([remoteImageSchema, localImageSchema]);
export const itemDraftSchema = z.object({
  title: z.string().trim().min(1, 'Preencha o título do item.').max(TITLE_LIMIT),
  description: z.string().max(DESCRIPTION_LIMIT),
  images: z.array(imageSchema).max(MAX_IMAGES, 'Cada item pode ter até cinco imagens.'),
}).refine(value => new Set(value.images.map(image => image.id)).size === value.images.length, 'Imagens repetidas.');
export const itemSchema = itemDraftSchema.safeExtend({ id });
export const listDraftSchema = z.object({
  name: z.string().trim().min(1, 'Preencha o nome da lista.').max(TITLE_LIMIT),
  description: z.string().max(DESCRIPTION_LIMIT),
});
const listSchema = listDraftSchema.extend({ id, items: z.array(itemSchema) });
export const snapshotSchema = z.object({
  version: z.literal(1),
  owner: id,
  revision: id,
  lists: z.array(listSchema),
}).superRefine((snapshot, ctx) => {
  const ids = new Set<string>();
  for (const list of snapshot.lists) {
    for (const record of [list, ...list.items, ...list.items.flatMap(item => item.images)]) {
      if (ids.has(record.id)) ctx.addIssue({ code: 'custom', message: 'Identificadores locais duplicados.' });
      ids.add(record.id);
    }
  }
});
export type ListImage = z.infer<typeof imageSchema>;
export type ItemDraft = z.infer<typeof itemDraftSchema>;
export type ListItem = z.infer<typeof itemSchema>;
export type PersonalList = z.infer<typeof listSchema>;
export type ListsSnapshot = z.infer<typeof snapshotSchema>;

export const emptySnapshot = (owner: string): ListsSnapshot => ({ version: 1, owner, revision: '0', lists: [] });
export const listsStorageKey = (owner: string) => `spady_listas_v1:${encodeURIComponent(owner)}`;

export function errorMessage(error: unknown): string {
  if (error instanceof z.ZodError) return error.issues[0]?.message ?? 'Confira os campos preenchidos.';
  return error instanceof Error ? error.message : 'Não foi possível salvar. Tente novamente.';
}

export function reorderListItems(list: PersonalList, ids: string[]): void {
  if (ids.length !== list.items.length || new Set(ids).size !== ids.length) throw new Error('A ordem dos itens mudou. Recarregue a lista.');
  const byId = new Map(list.items.map(item => [item.id, item]));
  list.items = ids.map(itemId => {
    const item = byId.get(itemId);
    if (!item) throw new Error('A ordem dos itens mudou. Recarregue a lista.');
    return item;
  });
}
