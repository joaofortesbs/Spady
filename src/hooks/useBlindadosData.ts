"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { BlindadosData, DEFAULT_DATA, KanbanColumn, KanbanCard, KanbanProject, KanbanMutationResult, PomodoroSession, PomodoroSettings, DEFAULT_POMODORO_SETTINGS, ColumnBehavior } from '@/lib/types/blindados';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/contexts/AuthContext';
import { KanbanService } from '@/lib/services/kanbanService';
import { PomodoroService } from '@/lib/services/pomodoroService';
import { safeStorage } from '@/lib/utils/safeStorage';
import { getUserDataCacheKey, STORAGE_KEYS } from '@/lib/utils/storage.constants';
import { toast } from 'sonner';

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
    Array.isArray(column.cards) &&
    column.cards.every(card =>
      Boolean(card) &&
      isValidUUID(card.id) &&
      typeof card.title === 'string' &&
      typeof card.description === 'string' &&
      Array.isArray(card.tags) &&
      Array.isArray(card.subtasks) &&
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

      if (userIdRef.current !== loadingUserId || loadingGeneration !== loadGenerationRef.current) return;
      dataOwnerRef.current = loadingUserId;
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

  const addKanbanColumn = useCallback(async (title: string) => {
    const kanbanService = servicesRef.current.kanban;
    if (!kanbanService) {
      console.error('[useBlindadosData] addKanbanColumn: service not available');
      return;
    }
    
    const position = dataRef.current.kanban.columns.length;
    const tempId = `temp-col-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const optimisticColumn: KanbanColumn = {
      id: tempId,
      title: title.toUpperCase(),
      cards: [],
      behavior: 'active',
    };
    
    pendingOperationsRef.current++;
    console.log('[useBlindadosData] addKanbanColumn: Starting - pending ops:', pendingOperationsRef.current);
    
    setData(prev => {
      const updated = {
        ...prev,
        kanban: { columns: [...prev.kanban.columns, optimisticColumn], projects: prev.kanban.projects || [] },
        lastUpdated: new Date().toISOString(),
      };
      setCache(updated);
      return updated;
    });
    
    try {
      const newColumn = await kanbanService.addColumn(title, position);
      
      if (newColumn) {
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
          setCache(updated);
          return updated;
        });
      } else {
        console.error('[useBlindadosData] addKanbanColumn: FAILED - removing optimistic column');
        setData(prev => {
          const updated = {
            ...prev,
            kanban: { columns: prev.kanban.columns.filter(c => c.id !== tempId), projects: prev.kanban.projects || [] },
            lastUpdated: new Date().toISOString(),
          };
          setCache(updated);
          return updated;
        });
      }
    } catch (e) {
      console.error('[useBlindadosData] addKanbanColumn error:', e);
      setData(prev => {
        const updated = {
          ...prev,
          kanban: { columns: prev.kanban.columns.filter(c => c.id !== tempId), projects: prev.kanban.projects || [] },
          lastUpdated: new Date().toISOString(),
        };
        setCache(updated);
        return updated;
      });
    } finally {
      pendingOperationsRef.current--;
      console.log('[useBlindadosData] addKanbanColumn: Done - pending ops:', pendingOperationsRef.current);
    }
  }, []);

  const deleteKanbanColumn = useCallback(async (columnId: string) => {
    const kanbanService = servicesRef.current.kanban;
    if (!kanbanService) return;
    
    const previousColumns = dataRef.current.kanban.columns;
    
    pendingOperationsRef.current++;
    
    setData(prev => {
      const updated = {
        ...prev,
        kanban: { columns: prev.kanban.columns.filter(c => c.id !== columnId), projects: prev.kanban.projects || [] },
        lastUpdated: new Date().toISOString(),
      };
      setCache(updated);
      return updated;
    });
    
    try {
      const success = await kanbanService.deleteColumn(columnId);
      if (!success) {
        console.error('[useBlindadosData] deleteKanbanColumn: FAILED - restoring column');
        setData(prev => {
          const updated = { ...prev, kanban: { columns: previousColumns, projects: prev.kanban.projects || [] }, lastUpdated: new Date().toISOString() };
          setCache(updated);
          return updated;
        });
      } else {
        console.log('[useBlindadosData] deleteKanbanColumn: SUCCESS');
      }
    } catch (e) {
      console.error('[useBlindadosData] deleteKanbanColumn error:', e);
      setData(prev => {
        const updated = { ...prev, kanban: { columns: previousColumns, projects: prev.kanban.projects || [] }, lastUpdated: new Date().toISOString() };
        setCache(updated);
        return updated;
      });
    } finally {
      pendingOperationsRef.current--;
    }
  }, []);

  const addKanbanCard = useCallback(async (columnId: string, card: Omit<KanbanCard, 'id' | 'createdAt' | 'updatedAt'>) => {
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
    
    const position = column.cards.length;
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
      projectId: card.projectId ?? null,
      dueDate: card.dueDate ?? null,
      completedAt: card.completedAt ?? null,
    };
    
    pendingOperationsRef.current++;
    console.log('[useBlindadosData] addKanbanCard: Pending ops:', pendingOperationsRef.current);
    
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
    
    console.log('[useBlindadosData] addKanbanCard: Using API route for robust persistence...');
    
    const MAX_RETRIES = 3;
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        console.log('[useBlindadosData] addKanbanCard: Attempt', attempt, 'of', MAX_RETRIES);
        
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
            projectId: card.projectId ?? undefined,
            dueDate: card.dueDate ?? undefined,
            completedAt: card.completedAt ?? undefined,
          }),
        });
        
        const result = await res.json().catch(() => ({ success: false, error: 'Invalid JSON response' }));
        
        if (res.ok && result.success && result.card) {
          console.log('[useBlindadosData] addKanbanCard: SUCCESS on attempt', attempt, '- Card ID:', result.card.id);
          
          setData(prev => {
            const updated = {
              ...prev,
              kanban: {
                columns: prev.kanban.columns.map(c =>
                  c.id === columnId 
                    ? { ...c, cards: c.cards.map(existingCard => 
                        existingCard.id === tempId ? result.card : existingCard
                      )}
                    : c
                ),
                projects: prev.kanban.projects || [],
              },
              lastUpdated: new Date().toISOString(),
            };
            setCache(updated);
            return updated;
          });
          
          pendingOperationsRef.current--;
          console.log('[useBlindadosData] addKanbanCard: Completed - Pending ops:', pendingOperationsRef.current);
          return;
        }
        
        lastError = new Error(`HTTP ${res.status}: ${result.error || 'Unknown error'}`);
        console.warn('[useBlindadosData] addKanbanCard: Attempt', attempt, 'failed:', lastError.message);
        
      } catch (e) {
        lastError = e as Error;
        console.warn('[useBlindadosData] addKanbanCard: Attempt', attempt, 'error:', e);
      }
      
      if (attempt < MAX_RETRIES) {
        const delay = 500 * Math.pow(2, attempt - 1);
        console.log('[useBlindadosData] addKanbanCard: Waiting', delay, 'ms before retry...');
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    console.error('[useBlindadosData] addKanbanCard: All retries failed:', lastError);
    
    setData(prev => {
      const updated = {
        ...prev,
        kanban: {
          columns: prev.kanban.columns.map(c =>
            c.id === columnId 
              ? { ...c, cards: c.cards.filter(existingCard => existingCard.id !== tempId) }
              : c
          ),
          projects: prev.kanban.projects || [],
        },
        lastUpdated: new Date().toISOString(),
      };
      setCache(updated);
      return updated;
    });
    
    pendingOperationsRef.current--;
    console.log('[useBlindadosData] addKanbanCard: Failed - Pending ops:', pendingOperationsRef.current);
    toast.error('Não foi possível criar o card. Tente novamente.');
    
    console.log('[useBlindadosData] addKanbanCard: Triggering re-sync from database...');
    setTimeout(() => loadData(true), 1000);
  }, [loadData]);

  const updateKanbanCard = useCallback(async (columnId: string, cardId: string, updates: Partial<KanbanCard>) => {
    if (!user) {
      console.error('[useBlindadosData] updateKanbanCard: No user');
      return;
    }
    
    if (cardId.startsWith('temp-')) {
      console.log('[useBlindadosData] updateKanbanCard: Skipping temp card');
      return;
    }
    
    console.log('[useBlindadosData] updateKanbanCard: Starting update for card', cardId, 'with updates:', updates);
    
    const previousCard = dataRef.current.kanban.columns
      .find(column => column.id === columnId)
      ?.cards.find(card => card.id === cardId);
    if (!previousCard) {
      console.error('[useBlindadosData] updateKanbanCard: card not found:', cardId);
      return;
    }
    const persistedUpdates = Object.fromEntries(
      Object.entries(updates).filter(([, value]) => value !== undefined),
    ) as Partial<KanbanCard>;
    
    pendingOperationsRef.current++;
    
    setData(prev => {
      const updated = {
        ...prev,
        kanban: {
          columns: prev.kanban.columns.map(c =>
            c.id === columnId
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
      setCache(updated);
      return updated;
    });
    
    const maxRetries = 3;
    const retryDelays = [500, 1000, 2000];
    let success = false;
    let lastError: string | null = null;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        console.log('[useBlindadosData] updateKanbanCard: API call attempt', attempt + 1);
        
        const response = await fetch('/api/kanban/update-card', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cardId, ...persistedUpdates }),
        });
        
        const result = await response.json();
        
        if (response.ok && result.success) {
          console.log('[useBlindadosData] updateKanbanCard: SUCCESS on attempt', attempt + 1, result);
          if (result.card) {
            setData(prev => {
              const updated = {
                ...prev,
                kanban: {
                  ...prev.kanban,
                  columns: prev.kanban.columns.map(column =>
                    column.id === columnId
                      ? {
                          ...column,
                          cards: column.cards.map(card => card.id === cardId ? result.card : card),
                        }
                      : column,
                  ),
                },
                lastUpdated: new Date().toISOString(),
              };
              setCache(updated);
              return updated;
            });
          }
          success = true;
          break;
        } else {
          lastError = result.error || 'Unknown error';
          console.error('[useBlindadosData] updateKanbanCard: API error on attempt', attempt + 1, lastError);
          
          if (response.status === 401 || response.status === 403 || response.status === 404) {
            console.error('[useBlindadosData] updateKanbanCard: Non-retryable error, stopping');
            break;
          }
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
    
    if (!success) {
      console.error('[useBlindadosData] updateKanbanCard: FAILED after all retries - restoring previous state. Last error:', lastError);
      setData(prev => {
        const updated = {
          ...prev,
          kanban: {
            ...prev.kanban,
            columns: prev.kanban.columns.map(column =>
              column.id === columnId
                ? {
                    ...column,
                    cards: column.cards.map(card => card.id === cardId ? previousCard : card),
                  }
                : column,
            ),
          },
          lastUpdated: new Date().toISOString(),
        };
        setCache(updated);
        return updated;
      });
      toast.error(`Não foi possível salvar o card. ${lastError || 'Tente novamente.'}`);
    }
    
    pendingOperationsRef.current--;
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
    
    const previousColumns = dataRef.current.kanban.columns;
    
    pendingOperationsRef.current++;
    
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
      return updated;
    });
    
    let success = false;
    try {
      success = await kanbanService.deleteCard(cardId);
      if (!success) {
        console.error('[useBlindadosData] deleteKanbanCard: FAILED - restoring card');
        setData(prev => {
          const updated = { ...prev, kanban: { columns: previousColumns, projects: prev.kanban.projects || [] }, lastUpdated: new Date().toISOString() };
          setCache(updated);
          return updated;
        });
      } else {
        console.log('[useBlindadosData] deleteKanbanCard: SUCCESS');
        // Do not let a stale local snapshot win over the confirmed database state.
        safeStorage.remove(STORAGE_KEYS.DATA_CACHE);
        lastSyncTimeRef.current = 0;
      }
    } catch (e) {
      console.error('[useBlindadosData] deleteKanbanCard error:', e);
      setData(prev => {
        const updated = { ...prev, kanban: { columns: previousColumns, projects: prev.kanban.projects || [] }, lastUpdated: new Date().toISOString() };
        setCache(updated);
        return updated;
      });
    } finally {
      pendingOperationsRef.current--;
    }

    if (success) {
      await loadData(true);
    }
  }, [loadData]);

  const moveCard = useCallback(async (
    cardId: string,
    sourceColId: string,
    targetColId: string,
    targetIdx: number,
    previousColumns?: KanbanColumn[],
  ) => {
    console.log('[useBlindadosData] moveCard called:', { cardId, sourceColId, targetColId, targetIdx });
    
    if (targetColId.startsWith('temp-')) {
      console.error('[useBlindadosData] moveCard: Cannot move to temporary column');
      return;
    }
    
    if (cardId.startsWith('temp-')) {
      console.error('[useBlindadosData] moveCard: Cannot move temporary card');
      return;
    }
    
    pendingOperationsRef.current++;
    console.log('[useBlindadosData] moveCard: Starting - pending ops:', pendingOperationsRef.current);

    setData(prev => {
      setCache(prev);
      return prev;
    });

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
        
        if (res.ok) {
          const result = await res.json();
          console.log('[useBlindadosData] moveCard: SUCCESS on attempt', attempt, result);
          pendingOperationsRef.current--;
          return;
        }
        
        const errorData = await res.json().catch(() => ({}));
        lastError = new Error(`HTTP ${res.status}: ${errorData.error || 'Unknown error'}`);
        console.warn('[useBlindadosData] moveCard: Attempt', attempt, 'failed:', lastError.message);
        
      } catch (e) {
        lastError = e as Error;
        console.warn('[useBlindadosData] moveCard: Attempt', attempt, 'error:', e);
      }
      
      if (attempt < MAX_RETRIES) {
        const delay = 500 * Math.pow(2, attempt - 1);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    console.error('[useBlindadosData] moveCard: All retries failed:', lastError);
    if (previousColumns) {
      setData(prev => {
        const updated = {
          ...prev,
          kanban: { columns: previousColumns, projects: prev.kanban.projects || [] },
          lastUpdated: new Date().toISOString(),
        };
        setCache(updated);
        return updated;
      });
    } else {
      await loadData(true);
    }
    toast.error('Não foi possível mover o card. A ordem anterior foi restaurada.');
    pendingOperationsRef.current--;
  }, [loadData]);

  const updateKanbanColumn = useCallback(async (columnId: string, updates: { title?: string; behavior?: ColumnBehavior }) => {
    const kanbanService = servicesRef.current.kanban;
    if (!kanbanService) {
      console.error('[useBlindadosData] updateKanbanColumn: service not available');
      return;
    }
    
    if (columnId.startsWith('temp-')) {
      console.log('[useBlindadosData] updateKanbanColumn: Skipping temp column');
      return;
    }
    
    const previousColumns = dataRef.current.kanban.columns;
    
    pendingOperationsRef.current++;
    
    setData(prev => {
      const updated = {
        ...prev,
        kanban: {
          columns: prev.kanban.columns.map(c =>
            c.id === columnId ? { 
              ...c, 
              title: updates.title?.toUpperCase() ?? c.title,
              behavior: updates.behavior ?? c.behavior,
            } : c
          ),
          projects: prev.kanban.projects || [],
        },
        lastUpdated: new Date().toISOString(),
      };
      setCache(updated);
      return updated;
    });

    try {
      const success = await kanbanService.updateColumn(columnId, updates);
      if (!success) {
        console.error('[useBlindadosData] updateKanbanColumn: FAILED - restoring previous state');
        setData(prev => {
          const updated = { ...prev, kanban: { columns: previousColumns, projects: prev.kanban.projects || [] }, lastUpdated: new Date().toISOString() };
          setCache(updated);
          return updated;
        });
        toast.error('Não foi possível salvar o comportamento da coluna.');
      } else {
        console.log('[useBlindadosData] updateKanbanColumn: SUCCESS');
      }
    } catch (e) {
      console.error('[useBlindadosData] updateKanbanColumn error:', e);
      setData(prev => {
        const updated = { ...prev, kanban: { columns: previousColumns, projects: prev.kanban.projects || [] }, lastUpdated: new Date().toISOString() };
        setCache(updated);
        return updated;
      });
      toast.error('Não foi possível salvar o comportamento da coluna.');
    } finally {
      pendingOperationsRef.current--;
    }
  }, []);

  const updateKanbanColumns = useCallback(async (columns: KanbanColumn[]) => {
    console.log('[useBlindadosData] updateKanbanColumns called with', columns.length, 'columns');
    
    const kanbanService = servicesRef.current.kanban;
    if (!kanbanService) {
      console.error('[useBlindadosData] updateKanbanColumns: service not available');
      return;
    }
    
    const validColumns = columns.filter(c => !c.id.startsWith('temp-'));
    const hasTemporaryColumns = columns.some(c => c.id.startsWith('temp-'));
    
    if (hasTemporaryColumns) {
      console.log('[useBlindadosData] updateKanbanColumns: Has temporary columns, only updating UI');
      setData(prev => {
        const updated = { ...prev, kanban: { columns, projects: prev.kanban.projects || [] }, lastUpdated: new Date().toISOString() };
        setCache(updated);
        return updated;
      });
      return;
    }
    
    const previousColumns = dataRef.current.kanban.columns;
    
    pendingOperationsRef.current++;
    console.log('[useBlindadosData] updateKanbanColumns: Starting - pending ops:', pendingOperationsRef.current);
    
    setData(prev => {
      const updated = { ...prev, kanban: { columns, projects: prev.kanban.projects || [] }, lastUpdated: new Date().toISOString() };
      setCache(updated);
      return updated;
    });

    console.log('[useBlindadosData] updateKanbanColumns: Persisting', validColumns.length, 'columns');
    
    try {
      const success = await kanbanService.updateColumnPositions(validColumns.map((c, i) => ({ id: c.id, position: i })));
      console.log('[useBlindadosData] updateKanbanColumns: Persistence result:', success);
      
      if (!success) {
        console.error('[useBlindadosData] updateKanbanColumns: FAILED - restoring previous state');
        setData(prev => {
          const updated = { ...prev, kanban: { columns: previousColumns, projects: prev.kanban.projects || [] }, lastUpdated: new Date().toISOString() };
          setCache(updated);
          return updated;
        });
      } else {
        console.log('[useBlindadosData] updateKanbanColumns: SUCCESS');
      }
    } catch (e) {
      console.error('[useBlindadosData] updateKanbanColumns error:', e);
      setData(prev => {
        const updated = { ...prev, kanban: { columns: previousColumns, projects: prev.kanban.projects || [] }, lastUpdated: new Date().toISOString() };
        setCache(updated);
        return updated;
      });
    } finally {
      pendingOperationsRef.current--;
      console.log('[useBlindadosData] updateKanbanColumns: Done - pending ops:', pendingOperationsRef.current);
    }
  }, []);

  const updateCardPositions = useCallback(async (
    columnId: string,
    cards: KanbanCard[],
    previousColumns?: KanbanColumn[],
  ) => {
    if (columnId.startsWith('temp-')) {
      console.log('[useBlindadosData] updateCardPositions: Skipping - column is temporary');
      return;
    }
    
    const persistableCards = cards.filter(c => !c.id.startsWith('temp-'));
    if (persistableCards.length === 0) {
      console.log('[useBlindadosData] updateCardPositions: No persistable cards');
      return;
    }
    
    pendingOperationsRef.current++;
    console.log('[useBlindadosData] updateCardPositions: Starting - pending ops:', pendingOperationsRef.current);

    setData(prev => {
      setCache(prev);
      return prev;
    });

    console.log('[useBlindadosData] updateCardPositions: Using API route for atomic persistence...');

    const MAX_RETRIES = 3;
    let lastError: Error | null = null;
    const cardPositions = persistableCards.map((c, i) => ({ cardId: c.id, position: i }));
    
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const res = await fetch('/api/kanban/reorder-cards', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ columnId, cardPositions }),
        });
        
        if (res.ok) {
          const result = await res.json();
          console.log('[useBlindadosData] updateCardPositions: SUCCESS on attempt', attempt, result);
          pendingOperationsRef.current--;
          return;
        }
        
        const errorData = await res.json().catch(() => ({}));
        lastError = new Error(`HTTP ${res.status}: ${errorData.error || 'Unknown error'}`);
        console.warn('[useBlindadosData] updateCardPositions: Attempt', attempt, 'failed:', lastError.message);
        
      } catch (e) {
        lastError = e as Error;
        console.warn('[useBlindadosData] updateCardPositions: Attempt', attempt, 'error:', e);
      }
      
      if (attempt < MAX_RETRIES) {
        const delay = 500 * Math.pow(2, attempt - 1);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    console.error('[useBlindadosData] updateCardPositions: All retries failed:', lastError);
    if (previousColumns) {
      setData(prev => {
        const updated = {
          ...prev,
          kanban: { columns: previousColumns, projects: prev.kanban.projects || [] },
          lastUpdated: new Date().toISOString(),
        };
        setCache(updated);
        return updated;
      });
    } else {
      await loadData(true);
    }
    toast.error('Não foi possível salvar a ordem dos cards. A ordem anterior foi restaurada.');
    pendingOperationsRef.current--;
  }, [loadData]);

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
    loadError,
    forceSync: () => loadData(true),
  };
}
