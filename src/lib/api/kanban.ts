import { createClient, SupabaseClient, User } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const PROJECT_NAME_MAX_LENGTH = 120;
export const CARD_TITLE_MAX_LENGTH = 240;
export const CARD_DESCRIPTION_MAX_LENGTH = 10_000;

export type KanbanServerContext = {
  user: User;
  supabase: SupabaseClient;
};

export function apiError(error: string, status: number) {
  return NextResponse.json(
    { error },
    {
      status,
      headers: { 'Cache-Control': 'no-store' },
    },
  );
}

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

export function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
}

export function isDateOnly(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function isIsoDateTime(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 64) return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp);
}

export function publicProject(project: {
  id: string;
  name: string;
  color: string;
  created_at: string;
  updated_at?: string | null;
}) {
  return {
    id: project.id,
    name: project.name,
    color: project.color,
    createdAt: project.created_at,
    updatedAt: project.updated_at ?? project.created_at,
  };
}

export function publicCard(card: {
  id: string;
  title: string;
  description?: string | null;
  priority: string;
  tags?: unknown;
  subtasks?: unknown;
  created_at: string;
  updated_at: string;
  project_id?: string | null;
  due_date?: string | null;
  completed_at?: string | null;
}) {
  return {
    id: card.id,
    title: card.title,
    description: card.description || '',
    priority: card.priority,
    tags: card.tags || [],
    subtasks: card.subtasks || [],
    createdAt: card.created_at,
    updatedAt: card.updated_at,
    projectId: card.project_id ?? null,
    dueDate: card.due_date ?? null,
    completedAt: card.completed_at ?? null,
  };
}

export async function getKanbanServerContext(): Promise<
  { context: KanbanServerContext; response?: never } | { context?: never; response: NextResponse }
> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
    console.error('[Kanban API] Missing Supabase server configuration');
    return { response: apiError('Server configuration error', 500) };
  }

  const cookieStore = await cookies();
  const authClient = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Route handlers can read cookies even when response mutation is unavailable.
        }
      },
    },
  });

  const {
    data: { user },
    error: authError,
  } = await authClient.auth.getUser();

  if (authError || !user) {
    if (authError) console.error('[Kanban API] Authentication lookup failed:', authError.message);
    return { response: apiError('Unauthorized', 401) };
  }

  return {
    context: {
      user,
      supabase: createClient(supabaseUrl, supabaseServiceKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      }),
    },
  };
}

export async function getOwnedRecord(
  supabase: SupabaseClient,
  table: 'kanban_columns' | 'kanban_cards' | 'kanban_projects',
  id: string,
  userId: string,
) {
  const { data, error } = await supabase
    .from(table)
    .select('id, user_id')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    console.error(`[Kanban API] ${table} ownership lookup failed:`, {
      code: error.code,
      message: error.message,
    });
    return { kind: 'error' as const };
  }

  if (!data) return { kind: 'not_found' as const };
  if (data.user_id !== userId) return { kind: 'forbidden' as const };
  return { kind: 'owned' as const, data };
}

export function relationError(kind: 'error' | 'not_found' | 'forbidden', resource: string) {
  if (kind === 'error') return apiError(`Unable to verify ${resource}`, 500);
  if (kind === 'forbidden') return apiError(`You do not have access to this ${resource}`, 403);
  return apiError(`${resource[0].toUpperCase()}${resource.slice(1)} not found`, 404);
}

export function databaseError(operation: string, error: { code?: string; message?: string }) {
  console.error(`[Kanban API] ${operation} failed:`, {
    code: error.code,
    message: error.message,
  });

  if (error.code === '23505') return apiError('Resource already exists', 409);
  if (error.code === '23503' || error.code === '23514') {
    return apiError('The submitted relationships are not valid', 400);
  }
  return apiError(`Unable to ${operation}`, 500);
}