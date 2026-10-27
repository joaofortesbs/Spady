"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { RemoteListsRepository } from '@/lib/listas/remoteRepository';
import {
  emptySnapshot, errorMessage, itemDraftSchema, listDraftSchema, reorderListItems,
  type ItemDraft, type ListsSnapshot,
} from '@/lib/listas/model';

export function useListasData(userId: string) {
  const [state, setState] = useState<{ owner: string; snapshot: ListsSnapshot; loaded: boolean; error: string | null }>({
    owner: userId, snapshot: emptySnapshot(userId), loaded: false, error: null,
  });
  const [saving, setSaving] = useState(false);
  const repoRef = useRef<RemoteListsRepository | null>(null);
  const snapshotRef = useRef<ListsSnapshot>(emptySnapshot(userId));
  const busyRef = useRef<RemoteListsRepository | null>(null);
  const mountedRef = useRef(false);

  const reload = useCallback(async () => {
    const repo = repoRef.current;
    if (!repo || repo.owner !== userId || busyRef.current === repo) return;
    const isActive = () => mountedRef.current && repoRef.current === repo;
    busyRef.current = repo;
    setSaving(true);
    let snapshot: ListsSnapshot | null = null;
    try {
      snapshot = await repo.load();
      if (!isActive()) return;
      snapshot = await repo.importLocal(snapshot, isActive);
      if (!isActive()) return;
      snapshotRef.current = snapshot;
      setState({ owner: userId, snapshot, loaded: true, error: null });
      void repo.cleanup(snapshot);
    } catch (error) {
      if (!isActive()) return;
      if (snapshot) snapshotRef.current = snapshot;
      setState(previous => ({ ...previous, snapshot: snapshot ?? previous.snapshot,
        owner: userId, loaded: true, error: errorMessage(error) }));
    } finally {
      if (busyRef.current === repo) busyRef.current = null;
      if (isActive()) setSaving(false);
    }
  }, [userId]);

  useEffect(() => {
    mountedRef.current = true;
    const repo = userId ? new RemoteListsRepository(userId) : null;
    repoRef.current = repo;
    snapshotRef.current = emptySnapshot(userId);
    setState({ owner: userId, snapshot: emptySnapshot(userId), loaded: false, error: null });
    setSaving(false);
    void reload();
    return () => {
      mountedRef.current = false;
      repoRef.current = null;
    };
  }, [userId, reload]);

  const mutate = useCallback(async (change: (snapshot: ListsSnapshot) => void) => {
    const repo = repoRef.current;
    if (!repo || repo.owner !== userId) throw new Error('Entre na sua conta para salvar listas.');
    if (busyRef.current === repo) throw new Error('Aguarde o salvamento em andamento.');
    if (!state.loaded || state.owner !== userId) throw new Error('Aguarde o carregamento das listas.');
    busyRef.current = repo;
    setSaving(true);
    try {
      const snapshot = await repo.commit(snapshotRef.current, change, () => mountedRef.current && repoRef.current === repo);
      if (repoRef.current === repo && mountedRef.current) {
        snapshotRef.current = snapshot;
        setState({ owner: userId, snapshot, loaded: true, error: null });
      }
    } catch (error) {
      if (repoRef.current === repo && mountedRef.current) setState(previous => ({ ...previous, error: errorMessage(error) }));
      throw error;
    } finally {
      if (busyRef.current === repo) busyRef.current = null;
      if (mountedRef.current && repoRef.current === repo) setSaving(false);
    }
  }, [userId, state.loaded, state.owner]);

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
