"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { LocalListsRepository } from '@/lib/listas/localRepository';
import {
  emptySnapshot, errorMessage, itemDraftSchema, listDraftSchema, reorderListItems,
  type ItemDraft, type ListsSnapshot,
} from '@/lib/listas/model';

export function useListasData(userId: string) {
  const [state, setState] = useState<{ owner: string; snapshot: ListsSnapshot; loaded: boolean; error: string | null }>({
    owner: userId, snapshot: emptySnapshot(userId), loaded: false, error: null,
  });
  const [saving, setSaving] = useState(false);
  const repoRef = useRef<LocalListsRepository | null>(null);
  const snapshotRef = useRef<ListsSnapshot>(emptySnapshot(userId));
  const busyRef = useRef(false);
  const mountedRef = useRef(false);

  const reload = useCallback(() => {
    const repo = repoRef.current;
    if (!repo || repo.owner !== userId) return;
    try {
      const snapshot = repo.load();
      snapshotRef.current = snapshot;
      setState({ owner: userId, snapshot, loaded: true, error: null });
    } catch (error) {
      setState(previous => ({ ...previous, owner: userId, loaded: true, error: errorMessage(error) }));
    }
  }, [userId]);

  useEffect(() => {
    mountedRef.current = true;
    const repo = userId ? new LocalListsRepository(userId) : null;
    repoRef.current = repo;
    snapshotRef.current = emptySnapshot(userId);
    setState({ owner: userId, snapshot: emptySnapshot(userId), loaded: false, error: null });
    reload();
    const onStorage = (event: StorageEvent) => {
      if (event.key === repo?.key || event.key === null) {
        // Do not refresh the expected revision underneath a possibly open editor.
        setState(previous => ({ ...previous, error: 'As listas mudaram em outra aba. Atualize as listas para continuar; alterações não salvas no formulário serão mantidas.' }));
      }
    };
    window.addEventListener('storage', onStorage);
    return () => {
      mountedRef.current = false;
      repoRef.current = null;
      window.removeEventListener('storage', onStorage);
    };
  }, [userId, reload]);

  const mutate = useCallback(async (change: (snapshot: ListsSnapshot) => void) => {
    const repo = repoRef.current;
    if (!repo || repo.owner !== userId) throw new Error('Entre na sua conta para salvar listas.');
    if (busyRef.current) throw new Error('Aguarde o salvamento em andamento.');
    busyRef.current = true;
    setSaving(true);
    try {
      const snapshot = await repo.commit(snapshotRef.current.revision, change, () => mountedRef.current && repoRef.current === repo);
      if (repoRef.current === repo && mountedRef.current) {
        snapshotRef.current = snapshot;
        setState({ owner: userId, snapshot, loaded: true, error: null });
      }
    } catch (error) {
      if (repoRef.current === repo && mountedRef.current) setState(previous => ({ ...previous, error: errorMessage(error) }));
      throw error;
    } finally {
      busyRef.current = false;
      if (mountedRef.current) setSaving(false);
    }
  }, [userId]);

  const createList = useCallback(async (name: string, description: string) => {
    const draft = listDraftSchema.parse({ name, description });
    const id = crypto.randomUUID();
    await mutate(snapshot => { snapshot.lists.push({ ...draft, id, items: [] }); });
    return id;
  }, [mutate]);

  const saveItem = useCallback(async (listId: string, draft: ItemDraft, itemId?: string) => {
    const validated = itemDraftSchema.parse(draft);
    await mutate(snapshot => {
      const list = snapshot.lists.find(value => value.id === listId);
      if (!list) throw new Error('Lista não encontrada. Atualize as listas.');
      if (itemId) {
        const index = list.items.findIndex(item => item.id === itemId);
        if (index < 0) throw new Error('Item não encontrado. Atualize as listas.');
        list.items[index] = { ...validated, id: itemId };
      } else list.items.push({ ...validated, id: crypto.randomUUID() });
    });
  }, [mutate]);

  const reorderItems = useCallback(async (listId: string, ids: string[]) => {
    await mutate(snapshot => {
      const list = snapshot.lists.find(value => value.id === listId);
      if (!list) throw new Error('Lista não encontrada. Atualize as listas.');
      reorderListItems(list, ids);
    });
  }, [mutate]);

  const current = state.owner === userId ? state : { snapshot: emptySnapshot(userId), loaded: false, error: null };
  return { lists: current.snapshot.lists, loaded: current.loaded, error: current.error, saving, createList, saveItem, reorderItems, reload };
}
