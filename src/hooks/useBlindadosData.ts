"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { BlindadosData, DEFAULT_DATA, KanbanColumn, KanbanCard, KanbanProject, KanbanMutationResult, PomodoroSession, PomodoroSettings, DEFAULT_POMODORO_SETTINGS, ColumnBehavior, KanbanColumnUpdates } from '@/lib/types/blindados';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/contexts/AuthContext';
import { KanbanColumnSaveError, KanbanService } from '@/lib/services/kanbanService';
import { PomodoroService } from '@/lib/services/pomodoroService';
import { safeStorage } from '@/lib/utils/safeStorage';
import { getUserDataCacheKey, STORAGE_KEYS } from '@/lib/utils/storage.constants';
import { toast } from 'sonner';
import type { KanbanProjectSaveData, KanbanProjectUpdates } from '@/lib/types/blindados';
import { parseProjectUpdates } from '@/lib/kanban-project-mutations';
import {
  applyCardOrder,
  inheritColumnProjects,
  moveCardInColumns,
  mergeDraftCardStructure,
  mergeRequestedCardFields,
  rebaseCardOrder,
  reorderConfirmedCards,
  removeCardFromStructure,
  removeColumnFromStructure,
  replaceCardInStructure,
  restoreColumnOrderByIds,
  restoreCardStructure,
  sameCardStructure,
} from './useBlindadosData.helpers';

function isValidUUID(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

function isKanbanProject(value: unknown): value is KanbanProject {
  if (!value || typeof value !== 'object') return false;
  const project = value as Partial<KanbanProject>;
  return isValidUUID(project.id || '') &&
    typeof project.name === 'string' &&
    typeof project.color === 'string' &&
    typeof project.createdAt === 'string';
}

function isValidCachedData(value: unknown): value is BlindadosData {
  if (!value || typeof value !== 'object') return false;
  const data = value as Partial<BlindadosData>;
  if (!data.kanban || !Array.isArray(data.kanban.columns) || !Array.isArray(data.kanban.projects)) {
    return false;
  }

  const hasValidProjects = data.kanban.projects.every(project =>
    Boolean(project) &&
    isValidUUID(project.id) &&
    typeof project.name === 'string' &&
    typeof project.color === 'string' &&
    typeof project.createdAt === 'string',
  );
  const hasValidColumns = data.kanban.columns.every(column =>
    Boolean(column) &&
    isValidUUID(column.id) &&
    typeof column.title === 'string' &&
    ['active', 'completion', 'progressive'].includes(column.behavior) &&
    (column.projectId == null || isValidUUID(column.projectId)) &&
    (column.backgroundColor == null || /^#[0-9a-f]{6}$/i.test(column.backgroundColor)) &&
    Array.isArray(column.cards) &&
    column.cards.every(card =>
      Boolean(card) &&
      isValidUUID(card.id) &&
      typeof card.title === 'string' &&
      typeof card.description === 'string' &&
        ['alta', 'media', 'baixa'].includes(card.priority) &&
      Array.isArray(card.tags) &&
        card.tags.every(tag => typeof tag === 'string') &&
        Array.isArray(card.subtasks) &&
        card.subtasks.every(subtask =>
          Boolean(subtask) &&
          typeof subtask.id === 'string' &&
          typeof subtask.title === 'string' &&
          typeof subtask.completed === 'boolean',
        ) &&
      typeof card.createdAt === 'string' &&
      typeof card.updatedAt === 'string' &&
      (card.projectId == null || isValidUUID(card.projectId)) &&
      (card.dueDate == null || typeof card.dueDate === 'string') &&
      (card.completedAt == null || typeof card.completedAt === 'string'),
    ),
  );

  return hasValidProjects && hasValidColumns;
}

function getCache(userId: string): BlindadosData | null {
  const cacheKey = getUserDataCacheKey(userId);
  const data = safeStorage.get<BlindadosData>(cacheKey);
  if (!isValidCachedData(data)) {
    if (data) safeStorage.remove(cacheKey);
    return null;
  }
  return data;
}

let activeCacheUserId: string | null = null;

function setCache(data: BlindadosData) {
  if (activeCacheUserId) safeStorage.set(getUserDataCacheKey(activeCacheUserId), data);
}

function copyCardStructure(columns: KanbanColumn[]): KanbanColumn[] {
  return columns.map(column => ({
    ...column,
    cards: column.cards.map(card => ({ ...card })),
  }));
}

export function useBlindadosData() {
  const [data, setData] = useState<BlindadosData>(DEFAULT_DATA);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { user } = useAuth();
  
  const supabase = useMemo(() => createClient(), []);
  
  const dataRef = useRef(data);
  const loadingRef = useRef(false);
  const loadGenerationRef = useRef(0);
  const dataMutationVersionRef = useRef(0);
  const columnMutationQueueRef = useRef(new Map<string, Promise<boolean>>());
  const projectMutationQueueRef = useRef(new Map<string, Promise<boolean>>());
  const confirmedColumnsRef = useRef(new Map<string, KanbanColumn>());
  const columnFieldVersionsRef = useRef(new Map<string, Partial<Record<keyof KanbanColumnUpdates, number>>>());
  const columnProjectEpochRef = useRef(new Map<string, number>());
  const columnConfirmedProjectEpochRef = useRef(new Map<string, number>());
  const confirmedColumnProjectsRef = useRef(new Map<string, string | null | undefined>());
  const confirmedCardProjectsRef = useRef(new Map<string, string | null | undefined>());
  const confirmedCardsRef = useRef(new Map<string, KanbanCard>());
  const cardFieldVersionsRef = useRef(new Map<string, Partial<Record<keyof KanbanCard, number>>>());
  const cardMutationQueueRef = useRef(new Map<string, Promise<boolean>>());
  const cardMutationVersionRef = useRef(new Map<string, number>());
  const columnStructuralQueueRef = useRef(new Map<string, Promise<boolean>>());
  const cardStructureVersionRef = useRef(new Map<string, number>());
  const cardStructureOperationIdRef = useRef(0);
  const cardStructureQueueScopesRef = useRef(new WeakMap<Promise<boolean>, string[]>());
  const dirtyCardStructureScopesRef = useRef(new Map<string, string[]>());
  const columnOrderVersionRef = useRef(0);
  const confirmedCardStructureRef = useRef<KanbanColumn[]>([]);
  const confirmedColumnOrderRef = useRef<string[]>([]);
  const pendingOperationsRef = useRef(0);
  const lastSyncTimeRef = useRef(0);
  const dataOwnerRef = useRef<string | null>(null);
  const userIdRef = useRef<string | null>(null);
  const projectCreationRef = useRef(false);
  const servicesRef = useRef<{ kanban: KanbanService | null; pomodoro: PomodoroService | null }>({
    kanban: null,
    pomodoro: null,
  });

  userIdRef.current = user?.id ?? null;
  activeCacheUserId = userIdRef.current;

  const writeCache = useCallback((value: BlindadosData) => {
    if (userIdRef.current) {
      safeStorage.set(getUserDataCacheKey(userIdRef.current), value);
    }
  }, []);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    if (user) {
      servicesRef.current.kanban = new KanbanService(supabase, user.id);
      servicesRef.current.pomodoro = new PomodoroService(supabase, user.id);
    } else {
      servicesRef.current.kanban = null;
      servicesRef.current.pomodoro = null;
    }
  }, [user, supabase]);

  const loadData = useCallback(async (force: boolean = false) => {
    if (!user || loadingRef.current) return;
    
    if (pendingOperationsRef.current > 0) {
      console.log('[useBlindadosData] loadData: Skipping - pending operations:', pendingOperationsRef.current);
      return;
    }
    
    const now = Date.now();
    if (!force && now - lastSyncTimeRef.current < 5000) {
      console.log('[useBlindadosData] loadData: Skipping - too soon since last sync');
      return;
    }
    
    const kanbanService = servicesRef.current.kanban;
    const pomodoroService = servicesRef.current.pomodoro;
    
    if (!kanbanService || !pomodoroService) return;
    
    loadingRef.current = true;
    setIsSyncing(true);
    setLoadError(null);
    const loadingUserId = user.id;
    const loadingGeneration = ++loadGenerationRef.current;
    const loadingMutationVersion = dataMutationVersionRef.current;

    try {
      console.log('[useBlindadosData] loadData: Loading from database via API routes...');
      
      const [columns, projects, pomodoroSettingsRes] = await Promise.all([
        kanbanService.loadColumns(),
        kanbanService.loadProjects(),
        fetch('/api/pomodoro/get-settings', { credentials: 'include' }).then(res => {
          console.log('[useBlindadosData] loadData: API response status:', res.status);
          return res.json();
        }),
      ]);
      
      console.log('[useBlindadosData] loadData: Pomodoro settings response:', JSON.stringify(pomodoroSettingsRes));
      
      let pomodoroSettings = DEFAULT_POMODORO_SETTINGS;
      let pomodoroSessions: PomodoroSession[] = [];
      
      if (pomodoroSettingsRes.success && pomodoroSettingsRes.settings) {
        pomodoroSettings = pomodoroSettingsRes.settings;
        pomodoroSessions = pomodoroSettingsRes.sessions || [];
        console.log('[useBlindadosData] loadData: USING SETTINGS FROM DATABASE:', JSON.stringify({
          categoriesCount: pomodoroSettings.categories?.length,
          categories: pomodoroSettings.categories?.map((c: any) => ({ id: c.id, name: c.name, duration: c.duration })),
          sessionsCount: pomodoroSessions.length,
        }));
        
      } else {
        console.warn('[useBlindadosData] loadData: API failed, error:', pomodoroSettingsRes.error, '- trying client-side load...');
        
        const clientData = await pomodoroService.loadData();
        if (clientData.settings.categories.length > 0) {
          pomodoroSettings = clientData.settings;
          pomodoroSessions = clientData.sessions || [];
          console.log('[useBlindadosData] loadData: Using client-side loaded settings:', JSON.stringify({
            categoriesCount: pomodoroSettings.categories?.length,
            categories: pomodoroSettings.categories?.map((c: any) => ({ id: c.id, name: c.name, duration: c.duration })),
            sessionsCount: pomodoroSessions.length,
          }));
        }
      }
      
      const pomodoroData = {
        sessions: pomodoroSessions,
        settings: pomodoroSettings,
      };

      const newData: BlindadosData = {
        pomodoro: pomodoroData,
        kanban: { columns, projects: projects || [] },
        lastUpdated: new Date().toISOString(),
      };

      if (
        userIdRef.current !== loadingUserId
        || loadingGeneration !== loadGenerationRef.current
        || loadingMutationVersion !== dataMutationVersionRef.current
        || pendingOperationsRef.current > 0
      ) return;
      dataOwnerRef.current = loadingUserId;
      confirmedCardProjectsRef.current.clear();
      confirmedCardsRef.current.clear();
      columnConfirmedProjectEpochRef.current.clear();
      confirmedColumnProjectsRef.current.clear();
      confirmedCardStructureRef.current = copyCardStructure(columns);
      confirmedColumnOrderRef.current = columns.map(column => column.id);
      dirtyCardStructureScopesRef.current.clear();
      columns.forEach(column => {
        confirmedColumnProjectsRef.current.set(column.id, column.projectId);
        columnConfirmedProjectEpochRef.current.set(column.id, columnProjectEpochRef.current.get(column.id) ?? 0);
        column.cards.forEach(card => {
          confirmedCardProjectsRef.current.set(card.id, card.projectId);
          confirmedCardsRef.current.set(card.id, { ...card });
        });
      });
      dataRef.current = newData;
      setData(newData);
      writeCache(newData);
      lastSyncTimeRef.current = Date.now();
      console.log('[useBlindadosData] loadData: SUCCESS - loaded', columns.length, 'columns,', pomodoroSettings.categories?.length, 'categories with durations:', pomodoroSettings.categories?.map((c: any) => c.duration));
    } catch (e) {
      console.error('[useBlindadosData] loadData error:', e);
      if (userIdRef.current === loadingUserId && loadingGeneration === loadGenerationRef.current) {
        const message = e instanceof Error ? e.message : 'Erro desconhecido ao carregar os dados.';
        setLoadError(message);
        toast.error('Não foi possível carregar seus projetos e cards. Tente novamente.');
      }
    } finally {
      if (loadingGeneration === loadGenerationRef.current) {
        setIsLoaded(true);
        setIsSyncing(false);
        loadingRef.current = false;
      }
    }
  }, [user, writeCache]);

  useEffect(() => {
    pendingOperationsRef.current = 0;
    columnMutationQueueRef.current.clear();
    projectMutationQueueRef.current.clear();
    cardMutationQueueRef.current.clear();
    cardMutationVersionRef.current.clear();
    cardFieldVersionsRef.current.clear();
    columnStructuralQueueRef.current.clear();
    cardStructureVersionRef.current.clear();
    cardStructureOperationIdRef.current = 0;
    cardStructureQueueScopesRef.current = new WeakMap();
    dirtyCardStructureScopesRef.current.clear();
    columnOrderVersionRef.current = 0;
    confirmedCardStructureRef.current = [];
    confirmedColumnOrderRef.current = [];
    confirmedColumnsRef.current.clear();
    columnFieldVersionsRef.current.clear();
    columnProjectEpochRef.current.clear();
    columnConfirmedProjectEpochRef.current.clear();
    confirmedColumnProjectsRef.current.clear();
    confirmedCardProjectsRef.current.clear();
    confirmedCardsRef.current.clear();
    lastSyncTimeRef.current = 0;
    loadGenerationRef.current++;
    loadingRef.current = false;
    setLoadError(null);

    if (!user) {
      dataOwnerRef.current = null;
      dataRef.current = DEFAULT_DATA;
      setData(DEFAULT_DATA);
      setIsLoaded(true);
      // Never reuse the unscoped cache; it could belong to a previous account.
      safeStorage.remove(STORAGE_KEYS.DATA_CACHE);
      return;
    }

    const cached = getCache(user.id);
    dataOwnerRef.current = user.id;
    dataRef.current = cached || DEFAULT_DATA;
    confirmedCardStructureRef.current = copyCardStructure(cached?.kanban.columns ?? []);
    confirmedColumnOrderRef.current = (cached?.kanban.columns ?? []).map(column => column.id);
    cached?.kanban.columns.forEach(column => {
      confirmedColumnProjectsRef.current.set(column.id, column.projectId);
      columnConfirmedProjectEpochRef.current.set(column.id, 0);
    });
    setData(cached || DEFAULT_DATA);
    setIsLoaded(Boolean(cached));

    console.log('[useBlindadosData] User logged in, scheduling loadData...');
    const timer = setTimeout(() => loadData(true), 100);
    return () => clearTimeout(timer);
  }, [user, loadData]);

  useEffect(() => {
    if (!user) return;
    const interval = setInterval(() => {
      if (pendingOperationsRef.current === 0) {
        loadData(false);
      }
    }, 60000);
    return () => clearInterval(interval);
  }, [user, loadData]);

  const addKanbanColumn = useCallback(async (
    title: string,
    behavior: ColumnBehavior = 'active',
    projectId: string | null = null,
  ): Promise<boolean> => {
    const kanbanService = servicesRef.current.kanban;
    if (!kanbanService) {
      console.error('[useBlindadosData] addKanbanColumn: service not available');
      return false;
    }
    const owner = userIdRef.current;
    
    const position = dataRef.current.kanban.columns.length;
    const tempId = `temp-col-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const optimisticColumn: KanbanColumn = {
      id: tempId,
      title: title.toUpperCase(),
      cards: [],
      behavior,
      projectId,
    };
    
    pendingOperationsRef.current++;
    dataMutationVersionRef.current++;
    console.log('[useBlindadosData] addKanbanColumn: Starting - pending ops:', pendingOperationsRef.current);
    
    setData(prev => {
      const updated = {
        ...prev,
        kanban: { columns: [...prev.kanban.columns, optimisticColumn], projects: prev.kanban.projects || [] },
        lastUpdated: new Date().toISOString(),
      };
      dataRef.current = updated;
      setCache(updated);
      return updated;
    });
    
    try {
      const newColumn = await kanbanService.addColumn(title, position, behavior, projectId);
      
      if (newColumn) {
        if (userIdRef.current === owner) {
          confirmedCardStructureRef.current = [
            ...confirmedCardStructureRef.current.filter(column => column.id !== newColumn.id),
            { ...newColumn, cards: [] },
          ];
          confirmedColumnOrderRef.current = [
            ...confirmedColumnOrderRef.current.filter(id => id !== newColumn.id),
            newColumn.id,
          ];
        }
        console.log('[useBlindadosData] addKanbanColumn: SUCCESS - replacing temp ID with:', newColumn.id);
        setData(prev => {
          const updated = {
            ...prev,
            kanban: { 
              columns: prev.kanban.columns.map(c => 
                c.id === tempId ? newColumn : c
              ),
              projects: prev.kanban.projects || [],
            },
            lastUpdated: new Date().toISOString(),
          };
          dataRef.current = updated;
          setCache(updated);
          return updated;
        });
        return true;
      } else {
        console.error('[useBlindadosData] addKanbanColumn: FAILED - removing optimistic column');
        setData(prev => {
          const updated = {
            ...prev,
            kanban: { columns: prev.kanban.columns.filter(c => c.id !== tempId), projects: prev.kanban.projects || [] },
            lastUpdated: new Date().toISOString(),
          };
          dataRef.current = updated;
          setCache(updated);
          return updated;
        });
        toast.error('Não foi possível criar a coluna. Tente novamente.');
        return false;
      }
    } catch (e) {
      console.error('[useBlindadosData] addKanbanColumn error:', e);
      setData(prev => {
        const updated = {
          ...prev,
          kanban: { columns: prev.kanban.columns.filter(c => c.id !== tempId), projects: prev.kanban.projects || [] },
          lastUpdated: new Date().toISOString(),
        };
        dataRef.current = updated;
        setCache(updated);
        return updated;
      });
      toast.error('Não foi possível criar a coluna. Tente novamente.');
      return false;
    } finally {
      pendingOperationsRef.current--;
      console.log('[useBlindadosData] addKanbanColumn: Done - pending ops:', pendingOperationsRef.current);
    }
  }, []);

  const deleteKanbanColumn = useCallback(async (columnId: string) => {
    const kanbanService = servicesRef.current.kanban;
    if (!kanbanService) return;

    const owner = userIdRef.current;
    const initialColumn = dataRef.current.kanban.columns.find(column => column.id === columnId);
    if (!owner || !initialColumn) return;
    const priorColumnMutation = columnMutationQueueRef.current.get(columnId);
    const priorStructuralMutation = columnStructuralQueueRef.current.get(columnId);
    const priorCardMutations = initialColumn.cards
      .map(card => cardMutationQueueRef.current.get(card.id))
      .filter((promise): promise is Promise<boolean> => Boolean(promise));
    const structureToken = (cardStructureVersionRef.current.get(columnId) ?? 0) + 1;
    cardStructureVersionRef.current.set(columnId, structureToken);
    const orderToken = ++columnOrderVersionRef.current;
    dataMutationVersionRef.current++;
    pendingOperationsRef.current++;

    const queuedDelete = Promise.allSettled([
      priorColumnMutation ?? Promise.resolve(true),
      priorStructuralMutation ?? Promise.resolve(true),
      ...priorCardMutations,
    ]).then(async () => {
      if (userIdRef.current !== owner) return false;
      const previousColumns = dataRef.current.kanban.columns;
      const deletingColumn = previousColumns.find(column => column.id === columnId);
      if (!deletingColumn) return false;
      setData(prev => {
        const updated = {
          ...prev,
          kanban: { ...prev.kanban, columns: prev.kanban.columns.filter(column => column.id !== columnId) },
          lastUpdated: new Date().toISOString(),
        };
        dataRef.current = updated;
        setCache(updated);
        return updated;
      });

      const restoreColumn = () => {
        if (userIdRef.current !== owner
          || cardStructureVersionRef.current.get(columnId) !== structureToken
          || columnOrderVersionRef.current !== orderToken) return;
        setData(prev => {
          const latestCards = new Map(prev.kanban.columns.flatMap(column => column.cards.map(card => [card.id, card] as const)));
          const cards = deletingColumn.cards.map(card =>
            confirmedCardsRef.current.get(card.id) ?? latestCards.get(card.id) ?? card);
          const restoredColumn = {
            ...(confirmedColumnsRef.current.get(columnId) ?? deletingColumn),
            cards,
          };
          const columns = [...prev.kanban.columns];
          const oldIndex = previousColumns.findIndex(column => column.id === columnId);
          columns.splice(Math.max(0, Math.min(oldIndex, columns.length)), 0, restoredColumn);
          const updated = {
            ...prev,
            kanban: { ...prev.kanban, columns },
            lastUpdated: new Date().toISOString(),
          };
          dataRef.current = updated;
          setCache(updated);
          return updated;
        });
      };

      try {
        const success = await kanbanService.deleteColumn(columnId);
        if (userIdRef.current !== owner) return false;
        if (!success) {
          console.error('[useBlindadosData] deleteKanbanColumn: FAILED - restoring column');
          restoreColumn();
        } else {
          confirmedCardStructureRef.current = removeColumnFromStructure(confirmedCardStructureRef.current, columnId);
          confirmedColumnOrderRef.current = confirmedColumnOrderRef.current.filter(id => id !== columnId);
          confirmedColumnProjectsRef.current.delete(columnId);
          columnConfirmedProjectEpochRef.current.delete(columnId);
          columnProjectEpochRef.current.delete(columnId);
          deletingColumn.cards.forEach(card => {
            confirmedCardsRef.current.delete(card.id);
            confirmedCardProjectsRef.current.delete(card.id);
            cardFieldVersionsRef.current.delete(card.id);
            cardMutationVersionRef.current.delete(card.id);
          });
          console.log('[useBlindadosData] deleteKanbanColumn: SUCCESS');
        }
        return success;
      } catch (e) {
        console.error('[useBlindadosData] deleteKanbanColumn error:', e);
        restoreColumn();
        return false;
      }
    }).finally(() => {
      if (userIdRef.current === owner) pendingOperationsRef.current = Math.max(0, pendingOperationsRef.current - 1);
      if (columnStructuralQueueRef.current.get(columnId) === queuedDelete) {
        columnStructuralQueueRef.current.delete(columnId);
      }
    });
    columnStructuralQueueRef.current.set(columnId, queuedDelete);
    await queuedDelete;
  }, []);

  const addKanbanCard = useCallback(async (columnId: string, card: Omit<KanbanCard, 'id' | 'createdAt' | 'updatedAt'>): Promise<void> => {
    console.log('[useBlindadosData] addKanbanCard: Starting', { columnId, title: card.title });
    
    if (columnId.startsWith('temp-')) {
      console.error('[useBlindadosData] addKanbanCard: Cannot add card to temporary column');
      return;
    }
    
    const column = dataRef.current.kanban.columns.find(c => c.id === columnId);
    if (!column) {
      console.error('[useBlindadosData] addKanbanCard: column not found:', columnId);
      return;
    }
    
    const now = new Date().toISOString();
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const optimisticCard: KanbanCard = {
      id: tempId,
      title: card.title,
      description: card.description || '',
      priority: card.priority || 'media',
      tags: card.tags || [],
      subtasks: card.subtasks || [],
      createdAt: now,
      updatedAt: now,
      projectId: column.projectId ?? null,
      dueDate: card.dueDate ?? null,
      completedAt: card.completedAt ?? null,
    };
    const owner = userIdRef.current;
    const projectEpochAtStart = columnProjectEpochRef.current.get(columnId) ?? 0;
    const projectTransferAhead = projectEpochAtStart
      !== (columnConfirmedProjectEpochRef.current.get(columnId) ?? 0);
    const priorColumnMutation = columnMutationQueueRef.current.get(columnId);
    const priorStructuralMutation = columnStructuralQueueRef.current.get(columnId);
    
    pendingOperationsRef.current++;
    dataMutationVersionRef.current++;
    console.log('[useBlindadosData] addKanbanCard: Pending ops:', pendingOperationsRef.current);
    
    const optimisticData = {
      ...dataRef.current,
      kanban: {
        columns: dataRef.current.kanban.columns.map(c =>
          c.id === columnId ? { ...c, cards: [...c.cards, optimisticCard] } : c
        ),
        projects: dataRef.current.kanban.projects || [],
      },
      lastUpdated: now,
    };
    dataRef.current = optimisticData;
    setCache(optimisticData);
    setData(prev => {
      const updated = {
        ...prev,
        kanban: {
          columns: prev.kanban.columns.map(c =>
            c.id === columnId ? { ...c, cards: [...c.cards, optimisticCard] } : c
          ),
          projects: prev.kanban.projects || [],
        },
        lastUpdated: now,
      };
      setCache(updated);
      return updated;
    });
    
    const removeOptimisticCard = () => {
      if (userIdRef.current !== owner) return;
      const latest = dataRef.current;
      const cleaned = {
        ...latest,
        kanban: {
          ...latest.kanban,
          columns: latest.kanban.columns.map(currentColumn => ({
            ...currentColumn,
            cards: currentColumn.cards.filter(existingCard => existingCard.id !== tempId),
          })),
        },
        lastUpdated: new Date().toISOString(),
      };
      dataRef.current = cleaned;
      writeCache(cleaned);
      setData(prev => {
        const updated = {
          ...prev,
          kanban: {
            ...prev.kanban,
            columns: prev.kanban.columns.map(currentColumn => ({
              ...currentColumn,
              cards: currentColumn.cards.filter(existingCard => existingCard.id !== tempId),
            })),
          },
          lastUpdated: new Date().toISOString(),
        };
        return updated;
      });
    };

    const persistCreate = async (): Promise<boolean> => {
      if (userIdRef.current !== owner) return false;
      const currentColumn = dataRef.current.kanban.columns.find(current => current.id === columnId);
      if (!currentColumn) {
        removeOptimisticCard();
        return false;
      }

      // A card always inherits the confirmed column, including an explicit clear.
      const resolvedProjectId = confirmedColumnProjectsRef.current.has(columnId)
          ? confirmedColumnProjectsRef.current.get(columnId)
          : currentColumn.projectId;
      if (projectTransferAhead) {
        const latest = dataRef.current;
        const updated = {
          ...latest,
          kanban: {
            ...latest.kanban,
            columns: latest.kanban.columns.map(current => current.id === columnId
              ? { ...current, cards: current.cards.map(existingCard =>
                  existingCard.id === tempId
                    ? { ...existingCard, projectId: resolvedProjectId ?? null }
                    : existingCard) }
              : current),
          },
          lastUpdated: new Date().toISOString(),
        };
        dataRef.current = updated;
        writeCache(updated);
        setData(prev => {
          const stateUpdated = {
            ...prev,
            kanban: {
              ...prev.kanban,
              columns: prev.kanban.columns.map(current => current.id === columnId
                ? { ...current, cards: current.cards.map(existingCard =>
                    existingCard.id === tempId
                      ? { ...existingCard, projectId: resolvedProjectId ?? null }
                      : existingCard) }
                : current),
            },
            lastUpdated: new Date().toISOString(),
          };
          writeCache(stateUpdated);
          return stateUpdated;
        });
      }

      const position = currentColumn.cards.filter(existingCard => !existingCard.id.startsWith('temp-')).length;
      let lastError: Error | null = null;
      try {
        console.log('[useBlindadosData] addKanbanCard: Persisting card through API route...');
        const res = await fetch('/api/kanban/add-card', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            columnId,
            title: card.title,
            description: card.description || '',
            priority: card.priority || 'media',
            tags: card.tags || [],
            subtasks: card.subtasks || [],
            position,
            projectId: resolvedProjectId ?? null,
            dueDate: card.dueDate ?? undefined,
            completedAt: card.completedAt ?? undefined,
          }),
        });
        
        const result = await res.json().catch(() => ({ success: false, error: 'Invalid JSON response' }));
        
        if (res.ok && result.success && result.card) {
          console.log('[useBlindadosData] addKanbanCard: SUCCESS - Card ID:', result.card.id);
          if (userIdRef.current !== owner) return false;
          const confirmedCard = { ...result.card } as KanbanCard;
          confirmedCardStructureRef.current = replaceCardInStructure(
            confirmedCardStructureRef.current,
            columnId,
            confirmedCard.id,
            confirmedCard,
          );
          confirmedCardsRef.current.set(confirmedCard.id, confirmedCard);
          confirmedCardProjectsRef.current.set(confirmedCard.id, confirmedCard.projectId);
          confirmedCardsRef.current.delete(tempId);
          confirmedCardProjectsRef.current.delete(tempId);

          const latestColumn = dataRef.current.kanban.columns.find(current => current.id === columnId);
          const laterProjectTransfer = (columnProjectEpochRef.current.get(columnId) ?? 0) > projectEpochAtStart;
          const visibleCard = laterProjectTransfer && latestColumn
            ? { ...confirmedCard, projectId: latestColumn.projectId }
            : confirmedCard;
          const replaceOptimisticCard = (columns: KanbanColumn[]) => columns.map(current => {
            if (current.id !== columnId) return current;
            let replacedTemp = false;
            const cards = current.cards.flatMap(existingCard => {
              if (existingCard.id === tempId) {
                replacedTemp = true;
                return [visibleCard];
              }
              return existingCard.id === confirmedCard.id ? [] : [existingCard];
            });
            return {
              ...current,
              cards: replacedTemp || current.cards.some(existingCard => existingCard.id === confirmedCard.id)
                ? cards
                : [...cards, visibleCard],
            };
          });
          const updatedFromRef = {
            ...dataRef.current,
            kanban: {
              ...dataRef.current.kanban,
              columns: replaceOptimisticCard(dataRef.current.kanban.columns),
            },
            lastUpdated: new Date().toISOString(),
          };
          dataRef.current = updatedFromRef;
          setCache(updatedFromRef);
          setData(prev => {
            const updated = {
              ...prev,
              kanban: {
                columns: prev.kanban.columns.map(c =>
                  c.id === columnId ? replaceOptimisticCard([c])[0] : c
                ),
                projects: prev.kanban.projects || [],
              },
              lastUpdated: new Date().toISOString(),
            };
            setCache(updated);
            return updated;
          });
          return true;
        }

        lastError = new Error(`HTTP ${res.status}: ${result.error || 'Unknown error'}`);
      } catch (e) {
        lastError = e as Error;
      }

      console.error('[useBlindadosData] addKanbanCard: Creation failed; not retrying to avoid duplicate inserts:', lastError);
      removeOptimisticCard();
      if (userIdRef.current === owner) {
        toast.error('Não foi possível criar o card. Tente novamente.');
        setTimeout(() => loadData(true), 1000);
      }
      return false;
    };

    const queuedCreate = Promise.allSettled([
      ...(priorColumnMutation ? [priorColumnMutation] : []),
      ...(priorStructuralMutation ? [priorStructuralMutation] : []),
    ]).then(persistCreate).finally(() => {
      if (userIdRef.current === owner) {
        pendingOperationsRef.current = Math.max(0, pendingOperationsRef.current - 1);
        console.log('[useBlindadosData] addKanbanCard: Completed - Pending ops:', pendingOperationsRef.current);
      }
      if (columnMutationQueueRef.current.get(columnId) === queuedCreate) {
        columnMutationQueueRef.current.delete(columnId);
      }
    });
    columnMutationQueueRef.current.set(columnId, queuedCreate);
    await queuedCreate;
  }, [loadData, writeCache]);

  const updateKanbanCard = useCallback(async (
    columnId: string,
    cardId: string,
    updates: Partial<KanbanCard>,
  ): Promise<boolean> => {
    if (!user) {
      console.error('[useBlindadosData] updateKanbanCard: No user');
      return false;
    }
    
    if (cardId.startsWith('temp-')) {
      console.log('[useBlindadosData] updateKanbanCard: Skipping temp card');
      return false;
    }
    
    console.log('[useBlindadosData] updateKanbanCard: Starting update for card', cardId, 'with updates:', updates);
    
    const currentColumn = dataRef.current.kanban.columns.find(column =>
      column.cards.some(card => card.id === cardId));
    const previousCard = currentColumn?.cards.find(card => card.id === cardId);
    if (!previousCard) {
      console.error('[useBlindadosData] updateKanbanCard: card not found:', cardId);
      return false;
    }
    const persistedUpdates = Object.fromEntries(
      Object.entries(updates).filter(([, value]) => value !== undefined),
    ) as Partial<KanbanCard>;
    // Project choice is never independent from the card's current column.
    if (persistedUpdates.projectId !== undefined) {
      persistedUpdates.projectId = currentColumn?.projectId ?? null;
    }
    const requestedKeys = Object.keys(persistedUpdates) as (keyof KanbanCard)[];
    if (requestedKeys.length === 0) return false;
    const effectiveColumnId = currentColumn?.id ?? columnId;
    const projectEpoch = columnProjectEpochRef.current.get(effectiveColumnId) ?? 0;
    const owner = user.id;
    const previousColumnMutation = columnMutationQueueRef.current.get(effectiveColumnId);
    const previousStructuralMutation = columnStructuralQueueRef.current.get(effectiveColumnId);
    // A transfer waits for older card requests. Their confirmed project must
    // remain available for rollback, without replacing the transfer's UI state.
    const mutationVersion = (cardMutationVersionRef.current.get(cardId) ?? 0) + 1;
    cardMutationVersionRef.current.set(cardId, mutationVersion);
    const fieldVersions = cardFieldVersionsRef.current.get(cardId) ?? {};
    requestedKeys.forEach(key => { fieldVersions[key] = mutationVersion; });
    cardFieldVersionsRef.current.set(cardId, fieldVersions);
    const confirmedCard = confirmedCardsRef.current.get(cardId) ?? { ...previousCard };
    confirmedCardsRef.current.set(cardId, confirmedCard);
    if (!confirmedCardProjectsRef.current.has(cardId)) {
      confirmedCardProjectsRef.current.set(cardId, confirmedCard.projectId);
    }
    dataMutationVersionRef.current++;
    pendingOperationsRef.current++;
    
    setData(prev => {
      const updated = {
        ...prev,
        kanban: {
          columns: prev.kanban.columns.map(c =>
            c.cards.some(card => card.id === cardId)
              ? { 
                  ...c, 
                  cards: c.cards.map(card => 
                    card.id === cardId ? { ...card, ...persistedUpdates, updatedAt: new Date().toISOString() } : card
                  ) 
                }
              : c
          ),
          projects: prev.kanban.projects || [],
        },
        lastUpdated: new Date().toISOString(),
      };
      dataRef.current = updated;
      setCache(updated);
      return updated;
    });
    
    const previousMutation = cardMutationQueueRef.current.get(cardId) ?? Promise.resolve();
    const queuedMutation = previousMutation.catch(() => undefined).then(async () => {
      await Promise.allSettled([
        previousColumnMutation ?? Promise.resolve(true),
        previousStructuralMutation ?? Promise.resolve(true),
      ]);
      if (userIdRef.current !== owner) return false;
      if (!dataRef.current.kanban.columns.some(column => column.cards.some(card => card.id === cardId))) {
        return false;
      }
      const maxRetries = 3;
      const retryDelays = [500, 1000, 2000];
      let success = false;
      let lastError: string | null = null;
      let savedCard: Partial<KanbanCard> | null = null;

      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          console.log('[useBlindadosData] updateKanbanCard: API call attempt', attempt + 1);

          const response = await fetch('/api/kanban/update-card', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cardId, ...persistedUpdates }),
          });

          const result = await response.json().catch(() => ({}));

          if (response.ok && result.success === true) {
            console.log('[useBlindadosData] updateKanbanCard: SUCCESS on attempt', attempt + 1, result);
            if (result.card && typeof result.card === 'object') {
              savedCard = result.card as Partial<KanbanCard>;
              success = true;
              break;
            }
            lastError = 'The server did not confirm the saved card.';
            console.error('[useBlindadosData] updateKanbanCard: Missing confirmed card in response');
          }

          lastError = lastError || result.error || 'Unknown error';
          console.error('[useBlindadosData] updateKanbanCard: API error on attempt', attempt + 1, lastError);

          if (response.status === 401 || response.status === 403 || response.status === 404) {
            console.error('[useBlindadosData] updateKanbanCard: Non-retryable error, stopping');
            break;
          }
        } catch (e) {
          lastError = String(e);
          console.error('[useBlindadosData] updateKanbanCard: Exception on attempt', attempt + 1, e);
        }

        if (attempt < maxRetries - 1) {
          console.log('[useBlindadosData] updateKanbanCard: Waiting', retryDelays[attempt], 'ms before retry');
          await new Promise(resolve => setTimeout(resolve, retryDelays[attempt]));
        }
      }

      if (userIdRef.current !== owner) return false;
      if (success && savedCard) {
        const projectEpochChanged = (columnProjectEpochRef.current.get(effectiveColumnId) ?? 0) !== projectEpoch;
        const safeSavedCard = { ...savedCard };
        const uiFallback = { ...persistedUpdates };
        if (projectEpochChanged) {
          delete safeSavedCard.projectId;
          delete uiFallback.projectId;
        }
        const confirmed = mergeRequestedCardFields(
          confirmedCardsRef.current.get(cardId) ?? previousCard,
          safeSavedCard,
          requestedKeys,
          persistedUpdates,
        );
        confirmedCardsRef.current.set(cardId, confirmed);
        if (persistedUpdates.projectId !== undefined) {
          const savedProject = savedCard.projectId === undefined
            ? persistedUpdates.projectId
            : savedCard.projectId;
          confirmedCardProjectsRef.current.set(cardId, savedProject);
          if (projectEpochChanged) {
            confirmedCardsRef.current.set(cardId, { ...confirmed, projectId: savedProject });
            const confirmedColumn = confirmedColumnsRef.current.get(effectiveColumnId);
            if (confirmedColumn) confirmedColumn.cards = confirmedColumn.cards.map(card =>
              card.id === cardId ? { ...card, projectId: savedProject } : card);
          }
        }

        setData(prev => {
          const updated = {
            ...prev,
            kanban: {
              ...prev.kanban,
              columns: prev.kanban.columns.map(column => ({
                ...column,
                cards: column.cards.map(card => {
                  if (card.id !== cardId) return card;
                  let merged = { ...card };
                  for (const key of requestedKeys) {
                    if (cardFieldVersionsRef.current.get(cardId)?.[key] !== mutationVersion) continue;
                    merged = mergeRequestedCardFields(merged, safeSavedCard, [key], uiFallback);
                  }
                  if (requestedKeys.every(key => cardFieldVersionsRef.current.get(cardId)?.[key] === mutationVersion)
                    && safeSavedCard.updatedAt) merged.updatedAt = safeSavedCard.updatedAt;
                  return merged;
                }),
              })),
            },
            lastUpdated: new Date().toISOString(),
          };
          dataRef.current = updated;
          setCache(updated);
          return updated;
        });
        return true;
      }

      console.error('[useBlindadosData] updateKanbanCard: FAILED after all retries - restoring requested fields. Last error:', lastError);
      if (userIdRef.current === owner && dataRef.current.kanban.columns.some(column =>
        column.cards.some(card => card.id === cardId))) {
        const baseline = confirmedCardsRef.current.get(cardId) ?? previousCard;
        const failedKeys = requestedKeys.filter(key =>
          cardFieldVersionsRef.current.get(cardId)?.[key] === mutationVersion);
        if (failedKeys.length > 0) {
          setData(prev => {
            const updated = {
              ...prev,
              kanban: {
                ...prev.kanban,
                columns: prev.kanban.columns.map(column => ({
                  ...column,
                  cards: column.cards.map(card => card.id === cardId
                    ? mergeRequestedCardFields(card, baseline, failedKeys, baseline)
                    : card),
                })),
              },
              lastUpdated: new Date().toISOString(),
            };
            dataRef.current = updated;
            setCache(updated);
            return updated;
          });
          toast.error(`Não foi possível salvar o card. ${lastError || 'Tente novamente.'}`);
        }
      }
      return false;
    });

    cardMutationQueueRef.current.set(cardId, queuedMutation);
    try {
      return await queuedMutation;
    } finally {
      if (cardMutationQueueRef.current.get(cardId) === queuedMutation) {
        cardMutationQueueRef.current.delete(cardId);
      }
      if (userIdRef.current === owner) pendingOperationsRef.current--;
    }
  }, [user]);

  const deleteKanbanCard = useCallback(async (columnId: string, cardId: string) => {
    const kanbanService = servicesRef.current.kanban;
    if (!kanbanService) return;
    
    if (cardId.startsWith('temp-')) {
      setData(prev => {
        const updated = {
          ...prev,
          kanban: {
            columns: prev.kanban.columns.map(c =>
              c.id === columnId ? { ...c, cards: c.cards.filter(card => card.id !== cardId) } : c
            ),
            projects: prev.kanban.projects || [],
          },
          lastUpdated: new Date().toISOString(),
        };
        setCache(updated);
        return updated;
      });
      return;
    }

    const owner = userIdRef.current;
    const currentColumn = dataRef.current.kanban.columns.find(column =>
      column.cards.some(card => card.id === cardId));
    if (!owner || !currentColumn) return;
    const effectiveColumnId = currentColumn.id;
    const previousColumns = dataRef.current.kanban.columns;
    const previousCardMutation = cardMutationQueueRef.current.get(cardId);
    const previousColumnMutation = columnMutationQueueRef.current.get(effectiveColumnId);
    const previousStructuralMutation = columnStructuralQueueRef.current.get(effectiveColumnId);
    const token = (cardStructureVersionRef.current.get(effectiveColumnId) ?? 0) + 1;
    cardStructureVersionRef.current.set(effectiveColumnId, token);
    dataMutationVersionRef.current++;
    pendingOperationsRef.current++;
    setData(prev => {
      const updated = {
        ...prev,
        kanban: {
          ...prev.kanban,
          columns: prev.kanban.columns.map(column => column.id === effectiveColumnId
            ? { ...column, cards: column.cards.filter(card => card.id !== cardId) }
            : column),
        },
        lastUpdated: new Date().toISOString(),
      };
      dataRef.current = updated;
      setCache(updated);
      return updated;
    });

    const queuedDelete = Promise.allSettled([
      previousCardMutation ?? Promise.resolve(true),
      previousColumnMutation ?? Promise.resolve(true),
      previousStructuralMutation ?? Promise.resolve(true),
    ]).then(async () => {
      if (userIdRef.current !== owner) return false;
      try {
        const success = await kanbanService.deleteCard(cardId);
        if (!success) {
          console.error('[useBlindadosData] deleteKanbanCard: FAILED - restoring card membership');
          if (cardStructureVersionRef.current.get(effectiveColumnId) === token
            && userIdRef.current === owner) {
            setData(prev => {
              const updated = {
                ...prev,
                kanban: {
                  ...prev.kanban,
                  columns: restoreCardStructure(prev.kanban.columns, previousColumns, [effectiveColumnId]),
                },
                lastUpdated: new Date().toISOString(),
              };
              dataRef.current = updated;
              setCache(updated);
              return updated;
            });
          }
          return false;
        }
        if (userIdRef.current !== owner) return false;
        confirmedCardStructureRef.current = removeCardFromStructure(confirmedCardStructureRef.current, cardId);
        confirmedCardsRef.current.delete(cardId);
        confirmedCardProjectsRef.current.delete(cardId);
        cardFieldVersionsRef.current.delete(cardId);
        cardMutationVersionRef.current.delete(cardId);
        console.log('[useBlindadosData] deleteKanbanCard: SUCCESS');
        safeStorage.remove(STORAGE_KEYS.DATA_CACHE);
        lastSyncTimeRef.current = 0;
        return true;
      } catch (e) {
        console.error('[useBlindadosData] deleteKanbanCard error:', e);
        if (cardStructureVersionRef.current.get(effectiveColumnId) === token
          && userIdRef.current === owner) {
          setData(prev => {
            const updated = {
              ...prev,
              kanban: {
                ...prev.kanban,
                columns: restoreCardStructure(prev.kanban.columns, previousColumns, [effectiveColumnId]),
              },
              lastUpdated: new Date().toISOString(),
            };
            dataRef.current = updated;
            setCache(updated);
            return updated;
          });
        }
        return false;
      }
    }).finally(() => {
      if (userIdRef.current === owner) pendingOperationsRef.current = Math.max(0, pendingOperationsRef.current - 1);
      if (columnStructuralQueueRef.current.get(effectiveColumnId) === queuedDelete) {
        columnStructuralQueueRef.current.delete(effectiveColumnId);
      }
    });
    columnStructuralQueueRef.current.set(effectiveColumnId, queuedDelete);

    const success = await queuedDelete;
    if (success && userIdRef.current === owner) await loadData(true);
  }, []);

  const moveCard = useCallback(async (
    cardId: string,
    sourceColId: string,
    targetColId: string,
    targetIdx: number,
    _previousColumns?: KanbanColumn[],
  ) => {
    console.log('[useBlindadosData] moveCard called:', { cardId, sourceColId, targetColId, targetIdx });
    if (targetColId.startsWith('temp-')) {
      console.error('[useBlindadosData] moveCard: Cannot move to temporary column');
      return false;
    }
    if (cardId.startsWith('temp-')) {
      console.error('[useBlindadosData] moveCard: Cannot move temporary card');
      return false;
    }

    const owner = userIdRef.current;
    const currentColumns = dataRef.current.kanban.columns;
    const currentSource = currentColumns.find(column => column.cards.some(card => card.id === cardId));
    const confirmedSource = confirmedCardStructureRef.current.find(column =>
      column.cards.some(card => card.id === cardId));
    if (!owner || !currentColumns.some(column => column.id === targetColId) || !currentSource) {
      return false;
    }
    const affectedColumnIds = [...new Set([
      sourceColId,
      currentSource.id,
      confirmedSource?.id,
      targetColId,
    ].filter((id): id is string => Boolean(id)))];
    const dirtyScopeKey = `card-structure-${++cardStructureOperationIdRef.current}`;

    // Capture predecessors before publishing this operation into either queue.
    const priorOperations = [
      ...affectedColumnIds.map(id => columnMutationQueueRef.current.get(id)),
      ...affectedColumnIds.map(id => columnStructuralQueueRef.current.get(id)),
      cardMutationQueueRef.current.get(cardId),
    ].filter((promise): promise is Promise<boolean> => Boolean(promise));
    const versions = new Map(affectedColumnIds.map(id => {
      const version = (cardStructureVersionRef.current.get(id) ?? 0) + 1;
      cardStructureVersionRef.current.set(id, version);
      return [id, version] as const;
    }));
    const isLatestStructure = () => affectedColumnIds.every(id =>
      cardStructureVersionRef.current.get(id) === versions.get(id));

    dataMutationVersionRef.current++;
    pendingOperationsRef.current++;
    console.log('[useBlindadosData] moveCard: Starting - pending ops:', pendingOperationsRef.current);
    setData(prev => {
      const updated = {
        ...prev,
        kanban: {
          ...prev.kanban,
          columns: moveCardInColumns(prev.kanban.columns, cardId, sourceColId, targetColId, targetIdx),
        },
        lastUpdated: new Date().toISOString(),
      };
      dataRef.current = updated;
      setCache(updated);
      return updated;
    });

    const queuedMove = Promise.allSettled(priorOperations).then(async () => {
      if (userIdRef.current !== owner
        || !dataRef.current.kanban.columns.some(column => column.cards.some(card => card.id === cardId))) return false;

      console.log('[useBlindadosData] moveCard: Using API route for atomic persistence...');
      const MAX_RETRIES = 3;
      let lastError: Error | null = null;
      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          const res = await fetch('/api/kanban/move-card', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cardId, targetColumnId: targetColId, position: targetIdx }),
          });
          const result = await res.json().catch(() => ({}));
          if (res.ok && result.success === true) {
            console.log('[useBlindadosData] moveCard: SUCCESS on attempt', attempt, result);
            if (userIdRef.current === owner) {
              confirmedCardStructureRef.current = moveCardInColumns(
                confirmedCardStructureRef.current,
                cardId,
                sourceColId,
                targetColId,
                targetIdx,
              );
              const confirmedMovedCard = confirmedCardStructureRef.current
                .find(column => column.id === targetColId)?.cards.find(card => card.id === cardId);
              if (confirmedMovedCard) {
                confirmedCardProjectsRef.current.set(cardId, confirmedMovedCard.projectId);
                const baseline = confirmedCardsRef.current.get(cardId);
                if (baseline) confirmedCardsRef.current.set(cardId, {
                  ...baseline, projectId: confirmedMovedCard.projectId,
                });
              }
            }
            if (userIdRef.current === owner && isLatestStructure()) {
              for (const [key, scope] of dirtyCardStructureScopesRef.current) {
                if (scope.every(id => affectedColumnIds.includes(id))) dirtyCardStructureScopesRef.current.delete(key);
              }
              setData(prev => {
                const updated = {
                  ...prev,
                  kanban: {
                    ...prev.kanban,
                    columns: moveCardInColumns(prev.kanban.columns, cardId, sourceColId, targetColId, targetIdx),
                  },
                  lastUpdated: new Date().toISOString(),
                };
                dataRef.current = updated;
                setCache(updated);
                return updated;
              });
            }
            return true;
          }
          lastError = new Error(`HTTP ${res.status}: ${result.error || 'Unable to move card'}`);
          console.warn('[useBlindadosData] moveCard: Attempt', attempt, 'failed:', lastError.message);
          if (res.status === 401 || res.status === 403 || res.status === 404) break;
        } catch (e) {
          lastError = e as Error;
          console.warn('[useBlindadosData] moveCard: Attempt', attempt, 'error:', e);
        }
        if (attempt < MAX_RETRIES) {
          const delay = 500 * Math.pow(2, attempt - 1);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
      if (userIdRef.current === owner) {
        if (isLatestStructure()) {
          console.error('[useBlindadosData] moveCard: All retries failed:', lastError);
          for (const [key, scope] of dirtyCardStructureScopesRef.current) {
            if (scope.every(id => affectedColumnIds.includes(id))) dirtyCardStructureScopesRef.current.delete(key);
          }
          setData(prev => {
            const updated = {
              ...prev,
              kanban: {
                ...prev.kanban,
                columns: restoreCardStructure(
                  prev.kanban.columns,
                  confirmedCardStructureRef.current,
                  affectedColumnIds,
                ),
              },
              lastUpdated: new Date().toISOString(),
            };
            dataRef.current = updated;
            setCache(updated);
            return updated;
          });
          toast.error('Não foi possível mover o card. A ordem anterior foi restaurada.');
        } else {
          dirtyCardStructureScopesRef.current.set(dirtyScopeKey, affectedColumnIds);
        }
      }
      return false;
    }).finally(() => {
      if (userIdRef.current === owner) pendingOperationsRef.current = Math.max(0, pendingOperationsRef.current - 1);
      affectedColumnIds.forEach(id => {
        if (columnStructuralQueueRef.current.get(id) === queuedMove) columnStructuralQueueRef.current.delete(id);
      });
    });
    cardStructureQueueScopesRef.current.set(queuedMove, affectedColumnIds);
    affectedColumnIds.forEach(id => columnStructuralQueueRef.current.set(id, queuedMove));
    return queuedMove;
  }, []);

  const updateKanbanColumn = useCallback(async (columnId: string, updates: KanbanColumnUpdates): Promise<boolean> => {
    const kanbanService = servicesRef.current.kanban;
    if (!kanbanService) {
      console.error('[useBlindadosData] updateKanbanColumn: service not available');
      return false;
    }
    
    if (columnId.startsWith('temp-')) {
      console.log('[useBlindadosData] updateKanbanColumn: Skipping temp column');
      return false;
    }
    
    const currentColumn = dataRef.current.kanban.columns.find(c => c.id === columnId);
    if (!currentColumn) return false;
    const owner = userIdRef.current;
    const ownerGeneration = loadGenerationRef.current;
    const isCurrentOwner = () =>
      userIdRef.current === owner && loadGenerationRef.current === ownerGeneration;
    const normalized: KanbanColumnUpdates = Object.fromEntries(
      Object.entries(updates).filter(([, value]) => value !== undefined),
    );
    if (updates.title !== undefined) normalized.title = updates.title.trim().toUpperCase();
    if (updates.backgroundColor !== undefined) normalized.backgroundColor = updates.backgroundColor?.toLowerCase() ?? null;
    const keys = (Object.keys(normalized) as (keyof KanbanColumnUpdates)[]).filter(key => normalized[key] !== undefined);
    if (keys.length === 0) return false;
    const confirmed = confirmedColumnsRef.current.get(columnId) ?? {
      ...currentColumn, cards: currentColumn.cards.map(card => ({ ...card })),
    };
    currentColumn.cards.forEach(card => {
      if (!confirmedCardProjectsRef.current.has(card.id)) confirmedCardProjectsRef.current.set(card.id, card.projectId);
    });
    confirmedColumnsRef.current.set(columnId, confirmed);
    if (!confirmedColumnProjectsRef.current.has(columnId)) {
      confirmedColumnProjectsRef.current.set(columnId, confirmed.projectId);
    }
    if (!columnConfirmedProjectEpochRef.current.has(columnId)) {
      columnConfirmedProjectEpochRef.current.set(columnId, columnProjectEpochRef.current.get(columnId) ?? 0);
    }
    const mutationVersion = ++dataMutationVersionRef.current;
    const versions = columnFieldVersionsRef.current.get(columnId) ?? {};
    keys.forEach(key => { versions[key] = mutationVersion; });
    columnFieldVersionsRef.current.set(columnId, versions);
    const priorCardMutations = normalized.projectId === undefined ? [] : currentColumn.cards
      .map(card => cardMutationQueueRef.current.get(card.id))
      .filter((promise): promise is Promise<boolean> => Boolean(promise));
    const priorStructuralMutation = columnStructuralQueueRef.current.get(columnId);
    if (normalized.projectId !== undefined) columnProjectEpochRef.current.set(columnId, mutationVersion);
    
    pendingOperationsRef.current++;
    
    const applyOptimisticUpdate = (source: BlindadosData): BlindadosData => {
      const updated = {
        ...source,
        kanban: {
          columns: source.kanban.columns.map(c =>
            c.id === columnId ? { 
              ...c, 
              ...normalized,
              cards: normalized.projectId !== undefined
                ? c.cards.map(card => ({ ...card, projectId: normalized.projectId }))
                : c.cards,
            } : c
          ),
          projects: source.kanban.projects || [],
        },
        lastUpdated: new Date().toISOString(),
      };
      return updated;
    };
    const optimisticData = applyOptimisticUpdate(dataRef.current);
    dataRef.current = optimisticData;
    writeCache(optimisticData);
    setData(prev => {
      const updated = applyOptimisticUpdate(prev);
      writeCache(updated);
      return updated;
    });

    const rollback = () => {
      if (!isCurrentOwner()) return;
      const applyRollback = (source: BlindadosData): BlindadosData => {
        const updated = {
          ...source,
          kanban: {
            ...source.kanban,
            columns: source.kanban.columns.map(column => {
              if (column.id !== columnId) return column;
              const restored = { ...column };
              for (const key of keys) {
                if (versions[key] !== mutationVersion) continue;
                Object.assign(restored, { [key]: confirmed[key] });
                if (key === 'projectId') {
                  restored.cards = column.cards.map(card => confirmedCardProjectsRef.current.has(card.id) && card.projectId === normalized.projectId
                    ? { ...card, projectId: confirmedCardProjectsRef.current.get(card.id) } : card);
                }
              }
              return restored;
            }),
          },
          lastUpdated: new Date().toISOString(),
        };
        return updated;
      };
      const restoredData = applyRollback(dataRef.current);
      dataRef.current = restoredData;
      writeCache(restoredData);
      setData(prev => {
        const updated = applyRollback(prev);
        writeCache(updated);
        return updated;
      });
    };
    const persistMutation = async (): Promise<boolean> => {
      try {
        await Promise.allSettled([
          ...priorCardMutations,
          ...(priorStructuralMutation ? [priorStructuralMutation] : []),
        ]);
        if (!isCurrentOwner()) return false;
        const success = await kanbanService.updateColumn(columnId, updates);
        if (!isCurrentOwner()) return false;
        if (!success) {
          rollback();
          if (isCurrentOwner()) toast.error('Não foi possível salvar a edição da coluna.');
          return false;
        }
        Object.assign(confirmed, normalized);
        if (normalized.projectId !== undefined) {
          confirmedColumnProjectsRef.current.set(columnId, normalized.projectId);
          confirmedCardStructureRef.current = inheritColumnProjects(
            confirmedCardStructureRef.current.map(column => column.id === columnId
              ? { ...column, projectId: normalized.projectId } : column), [columnId],
          );
          confirmedCardStructureRef.current.find(column => column.id === columnId)?.cards.forEach(card => {
            confirmedCardProjectsRef.current.set(card.id, normalized.projectId);
            const confirmedCard = confirmedCardsRef.current.get(card.id);
            if (confirmedCard) confirmedCardsRef.current.set(card.id, { ...confirmedCard, projectId: normalized.projectId });
          });
          confirmed.cards = confirmed.cards.map(card => ({ ...card, projectId: normalized.projectId }));
        }
        return true;
      } catch (e) {
        rollback();
        if (isCurrentOwner()) toast.error(e instanceof KanbanColumnSaveError
          ? e.message
          : 'Não foi possível salvar a edição da coluna.');
        return false;
      } finally {
        if (isCurrentOwner()) {
          if (normalized.projectId !== undefined) {
            columnConfirmedProjectEpochRef.current.set(columnId, mutationVersion);
          }
          pendingOperationsRef.current--;
        }
      }
    };

    const previousMutation = columnMutationQueueRef.current.get(columnId) ?? Promise.resolve(true);
    const queuedMutation = previousMutation.catch(() => false).then(persistMutation);
    columnMutationQueueRef.current.set(columnId, queuedMutation);
    try {
      return await queuedMutation;
    } finally {
      if (columnMutationQueueRef.current.get(columnId) === queuedMutation) {
        columnMutationQueueRef.current.delete(columnId);
        confirmedColumnsRef.current.delete(columnId);
        columnFieldVersionsRef.current.delete(columnId);
      }
    }
  }, [writeCache]);

  const updateKanbanColumns = useCallback(async (columns: KanbanColumn[]) => {
    console.log('[useBlindadosData] updateKanbanColumns called with', columns.length, 'columns');
    
    const kanbanService = servicesRef.current.kanban;
    if (!kanbanService) {
      console.error('[useBlindadosData] updateKanbanColumns: service not available');
      return;
    }
    
    const hasTemporaryColumns = columns.some(c => c.id.startsWith('temp-'));
    const previousColumns = dataRef.current.kanban.columns;
    const mergedColumns = mergeDraftCardStructure(previousColumns, columns);
    const columnOrderChanged =
      columns.length !== previousColumns.length
      || columns.some((column, index) => column.id !== previousColumns[index]?.id);
    const cardStructureChanged = !sameCardStructure(previousColumns, mergedColumns);

    if (hasTemporaryColumns) {
      console.log('[useBlindadosData] updateKanbanColumns: Has temporary columns, only updating UI');
      if (cardStructureChanged || columnOrderChanged) dataMutationVersionRef.current++;
      if (cardStructureChanged) {
        [...new Set([...previousColumns, ...mergedColumns].map(column => column.id))].forEach(id => {
          cardStructureVersionRef.current.set(id, (cardStructureVersionRef.current.get(id) ?? 0) + 1);
        });
      }
      setData(prev => {
        const updated = {
          ...prev,
          kanban: { columns: mergedColumns, projects: prev.kanban.projects || [] },
          lastUpdated: new Date().toISOString(),
        };
        dataRef.current = updated;
        setCache(updated);
        return updated;
      });
      return;
    }

    if (!columnOrderChanged) {
      if (!cardStructureChanged) return;
      dataMutationVersionRef.current++;
      [...new Set([...previousColumns, ...mergedColumns].map(column => column.id))].forEach(id => {
        cardStructureVersionRef.current.set(id, (cardStructureVersionRef.current.get(id) ?? 0) + 1);
      });
      setData(prev => {
        const updated = {
          ...prev,
          kanban: { ...prev.kanban, columns: mergeDraftCardStructure(prev.kanban.columns, columns), projects: prev.kanban.projects || [] },
          lastUpdated: new Date().toISOString(),
        };
        dataRef.current = updated;
        setCache(updated);
        return updated;
      });
      return;
    }

    const owner = userIdRef.current;
    if (!owner) return;
    const validColumns = mergedColumns.filter(c => !c.id.startsWith('temp-'));
    const affectedColumnIds = [...new Set([
      ...previousColumns.map(column => column.id),
      ...validColumns.map(column => column.id),
    ])];
    const priorOperations = [
      ...affectedColumnIds.map(id => columnMutationQueueRef.current.get(id)),
      ...affectedColumnIds.map(id => columnStructuralQueueRef.current.get(id)),
      ...previousColumns.flatMap(column => column.cards.map(card => cardMutationQueueRef.current.get(card.id))),
    ].filter((promise): promise is Promise<boolean> => Boolean(promise));
    const orderVersion = ++columnOrderVersionRef.current;
    const isLatestOrder = () => columnOrderVersionRef.current === orderVersion;
    if (cardStructureChanged || columnOrderChanged) dataMutationVersionRef.current++;
    pendingOperationsRef.current++;
    console.log('[useBlindadosData] updateKanbanColumns: Starting - pending ops:', pendingOperationsRef.current);
    
    setData(prev => {
      const updated = {
        ...prev,
        kanban: { columns: mergeDraftCardStructure(prev.kanban.columns, columns), projects: prev.kanban.projects || [] },
        lastUpdated: new Date().toISOString(),
      };
      dataRef.current = updated;
      setCache(updated);
      return updated;
    });

    console.log('[useBlindadosData] updateKanbanColumns: Persisting', validColumns.length, 'columns');

    const queuedReorder = Promise.allSettled(priorOperations).then(async () => {
      if (userIdRef.current !== owner) return false;
      const currentIds = new Set(dataRef.current.kanban.columns.map(column => column.id));
      const positions = validColumns
        .filter(column => currentIds.has(column.id))
        .map(column => ({ id: column.id, position: validColumns.findIndex(candidate => candidate.id === column.id) }));
      const success = await kanbanService.updateColumnPositions(positions);
      if (userIdRef.current !== owner) return false;
      console.log('[useBlindadosData] updateKanbanColumns: Persistence result:', success);
      if (success) {
        const persistedIds = positions.map(position => position.id);
        const persistedIdSet = new Set(persistedIds);
        const latestColumnIds = new Set(dataRef.current.kanban.columns.map(column => column.id));
        confirmedColumnOrderRef.current = [
          ...persistedIds,
          ...confirmedColumnOrderRef.current.filter(id => !persistedIdSet.has(id) && latestColumnIds.has(id)),
        ];
      }
      if (!success && isLatestOrder()) {
        console.error('[useBlindadosData] updateKanbanColumns: FAILED - restoring column order');
        setData(prev => {
          const updated = {
            ...prev,
            kanban: {
              ...prev.kanban,
              columns: restoreColumnOrderByIds(prev.kanban.columns, confirmedColumnOrderRef.current),
            },
            lastUpdated: new Date().toISOString(),
          };
          dataRef.current = updated;
          setCache(updated);
          return updated;
        });
      } else if (success) {
        console.log('[useBlindadosData] updateKanbanColumns: SUCCESS');
      }
      return success;
    }).catch(e => {
      console.error('[useBlindadosData] updateKanbanColumns error:', e);
      if (userIdRef.current === owner && isLatestOrder()) {
        setData(prev => {
          const updated = {
            ...prev,
            kanban: {
              ...prev.kanban,
              columns: restoreColumnOrderByIds(prev.kanban.columns, confirmedColumnOrderRef.current),
            },
            lastUpdated: new Date().toISOString(),
          };
          dataRef.current = updated;
          setCache(updated);
          return updated;
        });
      }
      return false;
    }).finally(() => {
      if (userIdRef.current === owner) {
        pendingOperationsRef.current = Math.max(0, pendingOperationsRef.current - 1);
        console.log('[useBlindadosData] updateKanbanColumns: Done - pending ops:', pendingOperationsRef.current);
      }
      affectedColumnIds.forEach(id => {
        if (columnStructuralQueueRef.current.get(id) === queuedReorder) columnStructuralQueueRef.current.delete(id);
      });
    });
    affectedColumnIds.forEach(id => columnStructuralQueueRef.current.set(id, queuedReorder));
    await queuedReorder;
  }, []);

  const updateCardPositions = useCallback(async (
    columnId: string,
    cards: KanbanCard[],
    _previousColumns?: KanbanColumn[],
  ) => {
    if (columnId.startsWith('temp-')) {
      console.log('[useBlindadosData] updateCardPositions: Skipping - column is temporary');
      return false;
    }
    
    const owner = userIdRef.current;
    const currentColumn = dataRef.current.kanban.columns.find(column => column.id === columnId);
    if (!owner || !currentColumn) return false;
    const requestedOrder = cards.filter(card => !card.id.startsWith('temp-')).map(card => card.id);
    const knownIds = new Set(currentColumn.cards.filter(card => !card.id.startsWith('temp-')).map(card => card.id));
    const orderedIds = [
      ...requestedOrder.filter(id => knownIds.has(id)),
      ...currentColumn.cards.filter(card => !card.id.startsWith('temp-') && !requestedOrder.includes(card.id)).map(card => card.id),
    ];
    if (orderedIds.length === 0) {
      console.log('[useBlindadosData] updateCardPositions: No persistable cards');
      return false;
    }

    const relevantCardIds = [...new Set([...knownIds, ...requestedOrder])];
    const cardOwnerIds = relevantCardIds.flatMap(id => {
      const currentOwner = dataRef.current.kanban.columns.find(column =>
        column.cards.some(card => card.id === id));
      const baselineColumn = confirmedCardStructureRef.current.find(column =>
        column.cards.some(card => card.id === id));
      return [
        ...(currentOwner ? [currentOwner.id] : []),
        ...(baselineColumn ? [baselineColumn.id] : []),
      ];
    });
    const baseAffectedColumnIds = [...new Set([columnId, ...cardOwnerIds])];
    const predecessorCardScopes = baseAffectedColumnIds.flatMap(id => {
      const operation = columnStructuralQueueRef.current.get(id);
      return operation ? cardStructureQueueScopesRef.current.get(operation) ?? [] : [];
    });
    const affectedColumnIds = [...new Set([...baseAffectedColumnIds, ...predecessorCardScopes])];
    const priorOperations = [
      ...affectedColumnIds.map(id => columnMutationQueueRef.current.get(id)),
      ...affectedColumnIds.map(id => columnStructuralQueueRef.current.get(id)),
      ...relevantCardIds.map(id => cardMutationQueueRef.current.get(id)),
    ]
      .filter((promise): promise is Promise<boolean> => Boolean(promise));
    const dirtyScopeKey = `card-structure-${++cardStructureOperationIdRef.current}`;
    const versions = new Map(affectedColumnIds.map(id => {
      const version = (cardStructureVersionRef.current.get(id) ?? 0) + 1;
      cardStructureVersionRef.current.set(id, version);
      return [id, version] as const;
    }));
    const isLatestStructure = () => affectedColumnIds.every(id =>
      cardStructureVersionRef.current.get(id) === versions.get(id));
    dataMutationVersionRef.current++;
    pendingOperationsRef.current++;
    console.log('[useBlindadosData] updateCardPositions: Starting - pending ops:', pendingOperationsRef.current);
    setData(prev => {
      const updated = {
        ...prev,
        kanban: {
          ...prev.kanban,
          columns: applyCardOrder(prev.kanban.columns, columnId, orderedIds),
        },
        lastUpdated: new Date().toISOString(),
      };
      dataRef.current = updated;
      setCache(updated);
      return updated;
    });

    const queuedReorder = Promise.allSettled(priorOperations).then(async () => {
      if (userIdRef.current !== owner) return false;
      if (!dataRef.current.kanban.columns.some(column => column.id === columnId)) return false;
      let persistedOrderIds = orderedIds;
      let rollbackScope = affectedColumnIds;
      const intersectingDirtyScopes = [...dirtyCardStructureScopesRef.current.entries()]
        .filter(([, scope]) => scope.some(id => affectedColumnIds.includes(id)));
      if (intersectingDirtyScopes.length > 0) {
        rollbackScope = [...new Set([
          ...affectedColumnIds,
          ...intersectingDirtyScopes.flatMap(([, scope]) => scope),
        ])];
        const confirmedColumn = confirmedCardStructureRef.current.find(column => column.id === columnId);
        if (confirmedColumn) {
          const allConfirmedCardOwners = new Map(
            confirmedCardStructureRef.current.flatMap(column =>
              column.cards.map(card => [card.id, column.id] as const)),
          );
          persistedOrderIds = rebaseCardOrder(
            confirmedColumn.cards.map(card => card.id),
            orderedIds,
            allConfirmedCardOwners,
          );
        }
        if (isLatestStructure()) {
          setData(prev => {
            const restored = restoreCardStructure(
              prev.kanban.columns,
              confirmedCardStructureRef.current,
              rollbackScope,
            );
            const updated = {
              ...prev,
              kanban: {
                ...prev.kanban,
                columns: applyCardOrder(restored, columnId, persistedOrderIds),
              },
              lastUpdated: new Date().toISOString(),
            };
            dataRef.current = updated;
            setCache(updated);
            return updated;
          });
        }
      }
      console.log('[useBlindadosData] updateCardPositions: Using API route for atomic persistence...');
      const MAX_RETRIES = 3;
      let lastError: Error | null = null;
      const cardPositions = persistedOrderIds.map((id, position) => ({ cardId: id, position }));
      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          const res = await fetch('/api/kanban/reorder-cards', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ columnId, cardPositions }),
          });
          const result = await res.json().catch(() => ({}));
          if (res.ok && result.success === true) {
            console.log('[useBlindadosData] updateCardPositions: SUCCESS on attempt', attempt, result);
            if (userIdRef.current === owner) {
              confirmedCardStructureRef.current = reorderConfirmedCards(
                confirmedCardStructureRef.current,
                columnId,
                persistedOrderIds,
              );
            }
            if (userIdRef.current === owner && isLatestStructure()) {
              for (const [key, scope] of dirtyCardStructureScopesRef.current) {
                if (scope.every(id => rollbackScope.includes(id))) dirtyCardStructureScopesRef.current.delete(key);
              }
              setData(prev => {
                const updated = {
                  ...prev,
                  kanban: {
                    ...prev.kanban,
                    columns: applyCardOrder(prev.kanban.columns, columnId, persistedOrderIds),
                  },
                  lastUpdated: new Date().toISOString(),
                };
                dataRef.current = updated;
                setCache(updated);
                return updated;
              });
            }
            return true;
          }
          lastError = new Error(`HTTP ${res.status}: ${result.error || 'Unable to reorder cards'}`);
          console.warn('[useBlindadosData] updateCardPositions: Attempt', attempt, 'failed:', lastError.message);
          if (res.status === 401 || res.status === 403 || res.status === 404) break;
        } catch (e) {
          lastError = e as Error;
          console.warn('[useBlindadosData] updateCardPositions: Attempt', attempt, 'error:', e);
        }
        if (attempt < MAX_RETRIES) {
          const delay = 500 * Math.pow(2, attempt - 1);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
      if (userIdRef.current === owner) {
        if (isLatestStructure()) {
          console.error('[useBlindadosData] updateCardPositions: All retries failed:', lastError);
          for (const [key, scope] of dirtyCardStructureScopesRef.current) {
            if (scope.every(id => rollbackScope.includes(id))) dirtyCardStructureScopesRef.current.delete(key);
          }
          setData(prev => {
            const updated = {
              ...prev,
              kanban: {
                ...prev.kanban,
                columns: restoreCardStructure(
                  prev.kanban.columns,
                  confirmedCardStructureRef.current,
                  rollbackScope,
                ),
              },
              lastUpdated: new Date().toISOString(),
            };
            dataRef.current = updated;
            setCache(updated);
            return updated;
          });
          toast.error('Não foi possível salvar a ordem dos cards. A ordem anterior foi restaurada.');
        } else {
          dirtyCardStructureScopesRef.current.set(dirtyScopeKey, rollbackScope);
        }
      }
      return false;
    }).finally(() => {
      if (userIdRef.current === owner) pendingOperationsRef.current = Math.max(0, pendingOperationsRef.current - 1);
      affectedColumnIds.forEach(id => {
        if (columnStructuralQueueRef.current.get(id) === queuedReorder) {
          columnStructuralQueueRef.current.delete(id);
        }
      });
    });
    cardStructureQueueScopesRef.current.set(queuedReorder, affectedColumnIds);
    affectedColumnIds.forEach(id => columnStructuralQueueRef.current.set(id, queuedReorder));
    return queuedReorder;
  }, []);

  const addPomodoroSession = useCallback(async (session: Omit<PomodoroSession, 'id'>) => {
    console.log('[useBlindadosData] addPomodoroSession: Starting', { categoryId: session.categoryId, duration: session.duration });
    
    const category = dataRef.current.pomodoro.settings.categories.find(c => c.id === session.categoryId);
    const categoryName = category?.name || '';
    
    const tempId = `temp-${Date.now()}`;
    const optimisticSession: PomodoroSession = {
      id: tempId,
      categoryId: session.categoryId,
      duration: session.duration,
      completedAt: session.completedAt,
      date: session.date,
    };
    
    setData(prev => {
      const updated = {
        ...prev,
        pomodoro: { ...prev.pomodoro, sessions: [optimisticSession, ...prev.pomodoro.sessions] },
        lastUpdated: new Date().toISOString(),
      };
      setCache(updated);
      return updated;
    });
    
    console.log('[useBlindadosData] addPomodoroSession: Using API route for robust persistence...');
    
    const MAX_RETRIES = 3;
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        console.log('[useBlindadosData] addPomodoroSession: Attempt', attempt, 'of', MAX_RETRIES);
        
        const res = await fetch('/api/pomodoro/add-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            categoryId: session.categoryId,
            categoryName,
            durationMinutes: session.duration,
            sessionDate: session.date,
            completedAt: session.completedAt,
          }),
        });
        
        const result = await res.json().catch(() => ({ success: false, error: 'Invalid JSON response' }));
        
        if (res.ok && result.success && result.session) {
          console.log('[useBlindadosData] addPomodoroSession: SUCCESS on attempt', attempt, '- Session ID:', result.session.id);
          
          setData(prev => {
            const updated = {
              ...prev,
              pomodoro: {
                ...prev.pomodoro,
                sessions: prev.pomodoro.sessions.map(s =>
                  s.id === tempId ? result.session : s
                ),
              },
              lastUpdated: new Date().toISOString(),
            };
            setCache(updated);
            return updated;
          });
          
          return;
        }
        
        lastError = new Error(`HTTP ${res.status}: ${result.error || 'Unknown error'}`);
        console.warn('[useBlindadosData] addPomodoroSession: Attempt', attempt, 'failed:', lastError.message);
        
      } catch (e) {
        lastError = e as Error;
        console.warn('[useBlindadosData] addPomodoroSession: Attempt', attempt, 'error:', e);
      }
      
      if (attempt < MAX_RETRIES) {
        const delay = 500 * Math.pow(2, attempt - 1);
        console.log('[useBlindadosData] addPomodoroSession: Waiting', delay, 'ms before retry...');
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    console.error('[useBlindadosData] addPomodoroSession: All retries failed:', lastError);
    
    setData(prev => {
      const updated = {
        ...prev,
        pomodoro: {
          ...prev.pomodoro,
          sessions: prev.pomodoro.sessions.filter(s => s.id !== tempId),
        },
        lastUpdated: new Date().toISOString(),
      };
      setCache(updated);
      return updated;
    });
    
    console.log('[useBlindadosData] addPomodoroSession: Triggering re-sync from database...');
    setTimeout(() => loadData(true), 1000);
  }, [loadData]);

  const updatePomodoroSettings = useCallback(async (settings: PomodoroSettings) => {
    console.log('[useBlindadosData] updatePomodoroSettings: Starting', { 
      categoriesCount: settings.categories?.length,
      intervals: settings.intervals 
    });
    
    setData(prev => {
      const updated = { ...prev, pomodoro: { ...prev.pomodoro, settings }, kanban: { ...prev.kanban, projects: prev.kanban.projects || [] }, lastUpdated: new Date().toISOString() };
      setCache(updated);
      return updated;
    });
    
    console.log('[useBlindadosData] updatePomodoroSettings: Using API route for robust persistence...');
    
    const MAX_RETRIES = 3;
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        console.log('[useBlindadosData] updatePomodoroSettings: Attempt', attempt, 'of', MAX_RETRIES);
        
        const res = await fetch('/api/pomodoro/update-settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            categories: settings.categories.map(c => ({
              id: c.id,
              name: c.name,
              color: c.color,
              duration: c.duration,
            })),
            intervals: settings.intervals,
          }),
        });
        
        const result = await res.json().catch(() => ({ success: false, error: 'Invalid JSON response' }));
        
        if (res.ok && result.success) {
          console.log('[useBlindadosData] updatePomodoroSettings: SUCCESS on attempt', attempt);
          return;
        }
        
        lastError = new Error(`HTTP ${res.status}: ${result.error || 'Unknown error'}`);
        console.warn('[useBlindadosData] updatePomodoroSettings: Attempt', attempt, 'failed:', lastError.message);
        
      } catch (e) {
        lastError = e as Error;
        console.warn('[useBlindadosData] updatePomodoroSettings: Attempt', attempt, 'error:', e);
      }
      
      if (attempt < MAX_RETRIES) {
        const delay = 500 * Math.pow(2, attempt - 1);
        console.log('[useBlindadosData] updatePomodoroSettings: Waiting', delay, 'ms before retry...');
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    console.error('[useBlindadosData] updatePomodoroSettings: All retries failed:', lastError);
    console.log('[useBlindadosData] updatePomodoroSettings: Triggering re-sync from database...');
    setTimeout(() => loadData(true), 1000);
  }, [loadData]);

  const visibleData = dataOwnerRef.current === user?.id ? data : DEFAULT_DATA;
  const safeData: BlindadosData = {
    ...visibleData,
    pomodoro: {
      ...visibleData.pomodoro,
      settings: {
        categories: visibleData.pomodoro?.settings?.categories || DEFAULT_POMODORO_SETTINGS.categories,
        intervals: {
          shortBreak: visibleData.pomodoro?.settings?.intervals?.shortBreak ?? DEFAULT_POMODORO_SETTINGS.intervals.shortBreak,
          longBreak: visibleData.pomodoro?.settings?.intervals?.longBreak ?? DEFAULT_POMODORO_SETTINGS.intervals.longBreak,
          cyclesUntilLongBreak: visibleData.pomodoro?.settings?.intervals?.cyclesUntilLongBreak ?? DEFAULT_POMODORO_SETTINGS.intervals.cyclesUntilLongBreak,
        },
      },
      sessions: visibleData.pomodoro?.sessions || [],
    },
    kanban: { columns: visibleData.kanban?.columns || [], projects: visibleData.kanban?.projects || [] },
  };

  const addProject = useCallback(async (
    name: string,
    color: string,
  ): Promise<KanbanMutationResult<KanbanProject>> => {
    if (!user || projectCreationRef.current) {
      return { success: false, error: 'A criação do projeto já está em andamento.' };
    }

    projectCreationRef.current = true;
    pendingOperationsRef.current++;
    dataMutationVersionRef.current++;
    const operationUserId = user.id;
    const tempProject: KanbanProject = {
      id: `temp-${crypto.randomUUID()}`,
      name,
      color,
      createdAt: new Date().toISOString(),
    };
    
    setData(prev => {
      const updated = {
        ...prev,
        kanban: {
          ...prev.kanban,
          projects: [...(prev.kanban.projects || []), tempProject],
        },
        lastUpdated: new Date().toISOString(),
      };
      setCache(updated);
      return updated;
    });
    
    console.log('[useBlindadosData] addProject: Optimistically added project:', tempProject);
    
    try {
      const response = await fetch('/api/kanban/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name, color }),
      });
      
      const result = await response.json().catch(() => ({}));
      
      if (!response.ok || !result.success || !isKanbanProject(result.project)) {
        const error = result.error || `HTTP ${response.status}: não foi possível criar o projeto`;
        throw new Error(error);
      }

      const persistedProject = result.project as KanbanProject;
      if (userIdRef.current !== operationUserId) {
        return { success: false, error: 'A sessão mudou antes da confirmação do projeto.' };
      }

      setData(prev => {
        const updated = {
          ...prev,
          kanban: {
            ...prev.kanban,
            projects: prev.kanban.projects.map(project =>
              project.id === tempProject.id ? persistedProject : project,
            ),
          },
          lastUpdated: new Date().toISOString(),
        };
        setCache(updated);
        return updated;
      });
      console.log('[useBlindadosData] addProject: SUCCESS - saved to database:', persistedProject);
      return { success: true, data: persistedProject };
    } catch (e) {
      console.error('[useBlindadosData] addProject: Exception:', e);
      const error = e instanceof Error ? e.message : 'Não foi possível criar o projeto.';
      if (userIdRef.current === operationUserId) {
        setData(prev => {
          const updated = {
            ...prev,
            kanban: {
              ...prev.kanban,
              projects: prev.kanban.projects.filter(project => project.id !== tempProject.id),
            },
            lastUpdated: new Date().toISOString(),
          };
          setCache(updated);
          return updated;
        });
        toast.error(`Projeto não criado: ${error}`);
      }
      return { success: false, error };
    } finally {
      pendingOperationsRef.current = Math.max(0, pendingOperationsRef.current - 1);
      projectCreationRef.current = false;
    }
  }, [user]);

  const updateProject = useCallback(async (
    projectId: string, input: KanbanProjectUpdates,
  ): Promise<KanbanMutationResult<KanbanProjectSaveData>> => {
    const owner = userIdRef.current;
    const generation = loadGenerationRef.current;
    const updates = parseProjectUpdates(projectId, input);
    const service = servicesRef.current.kanban;
    if (!owner || !service || !updates
      || !dataRef.current.kanban.projects.some(project => project.id === projectId)) {
      return { success: false, error: 'Projeto ou alterações inválidas.' };
    }
    const isCurrent = () => userIdRef.current === owner && loadGenerationRef.current === generation;
    const columnIds = updates.columnChanges.map(change => change.columnId);
    const predecessors = [
      projectMutationQueueRef.current.get(projectId),
      ...columnIds.flatMap(id => [
        columnMutationQueueRef.current.get(id), columnStructuralQueueRef.current.get(id),
        ...dataRef.current.kanban.columns.find(column => column.id === id)?.cards.map(card =>
          cardMutationQueueRef.current.get(card.id)) ?? [],
      ]),
    ].filter((operation): operation is Promise<boolean> => Boolean(operation));
    const version = ++dataMutationVersionRef.current;
    columnIds.forEach(id => {
      columnProjectEpochRef.current.set(id, version);
      const fields = columnFieldVersionsRef.current.get(id) ?? {};
      fields.projectId = version;
      columnFieldVersionsRef.current.set(id, fields);
    });
    pendingOperationsRef.current++;
    let result: KanbanMutationResult<KanbanProjectSaveData> = { success: false };
    const operation = Promise.allSettled(predecessors).then(async () => {
      if (!isCurrent()) return false;
      result = await service.saveProject(projectId, updates);
      if (!isCurrent()) {
        result = { success: false, error: 'A sessão mudou antes da confirmação.' };
        return false;
      }
      if (!result.success || !result.data) return false;
      const saved = result.data;
      for (const column of saved.columns) {
        confirmedColumnProjectsRef.current.set(column.id, column.projectId);
        const baseline = confirmedColumnsRef.current.get(column.id);
        if (baseline) {
          baseline.projectId = column.projectId;
          baseline.cards = baseline.cards.map(card => ({ ...card, projectId: column.projectId }));
        }
      }
      for (const card of saved.cards) {
        confirmedCardProjectsRef.current.set(card.id, card.projectId);
        const baseline = confirmedCardsRef.current.get(card.id);
        if (baseline) confirmedCardsRef.current.set(card.id, { ...baseline, projectId: card.projectId });
      }
      confirmedCardStructureRef.current = inheritColumnProjects(
        confirmedCardStructureRef.current.map(column => {
          const binding = saved.columns.find(changed => changed.id === column.id);
          return binding ? { ...column, projectId: binding.projectId } : column;
        }), columnIds,
      );
      const apply = (current: BlindadosData): BlindadosData => ({
        ...current,
        kanban: {
          projects: current.kanban.projects.map(project => project.id === projectId ? saved.project : project),
          columns: current.kanban.columns.map(column => {
            const binding = saved.columns.find(changed => changed.id === column.id);
            return binding && columnFieldVersionsRef.current.get(column.id)?.projectId === version
              ? { ...column, projectId: binding.projectId,
                cards: column.cards.map(card => ({ ...card, projectId: binding.projectId })) } : column;
          }),
        },
        lastUpdated: new Date().toISOString(),
      });
      dataRef.current = apply(dataRef.current);
      writeCache(dataRef.current);
      setData(current => {
        const updated = apply(current);
        writeCache(updated);
        return updated;
      });
      return true;
    }).catch(() => {
      result = { success: false, error: 'Não foi possível confirmar a edição do projeto.' };
      return false;
    }).finally(() => {
      if (isCurrent()) {
        pendingOperationsRef.current = Math.max(0, pendingOperationsRef.current - 1);
        columnIds.forEach(id => columnConfirmedProjectEpochRef.current.set(id, version));
      }
      if (projectMutationQueueRef.current.get(projectId) === operation) projectMutationQueueRef.current.delete(projectId);
      columnIds.forEach(id => {
        if (columnMutationQueueRef.current.get(id) === operation) columnMutationQueueRef.current.delete(id);
      });
    });
    projectMutationQueueRef.current.set(projectId, operation);
    columnIds.forEach(id => columnMutationQueueRef.current.set(id, operation));
    await operation;
    return result;
  }, [writeCache]);

  return {
    data: safeData,
    isLoaded,
    isSyncing,
    updateKanbanColumns,
    updateKanbanColumn,
    addKanbanColumn,
    deleteKanbanColumn,
    addKanbanCard,
    updateKanbanCard,
    deleteKanbanCard,
    moveCard,
    updateCardPositions,
    addPomodoroSession,
    updatePomodoroSettings,
    addProject,
    updateProject,
    loadError,
    forceSync: () => loadData(true),
  };
}
