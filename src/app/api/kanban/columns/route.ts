import { NextRequest, NextResponse } from 'next/server';
import {
  apiError,
  COLUMN_BEHAVIORS,
  COLUMN_TITLE_MAX_LENGTH,
  databaseError,
  getKanbanServerContext,
  getOwnedRecord,
  isColumnBehavior,
  isUuid,
  publicColumn,
  relationError,
} from '@/lib/api/kanban';

// Keep PATCH compatible with installations created before project_id was
// introduced. Behavior changes do not need that optional relation to be
// confirmed, while POST includes it when a project is explicitly selected.
const COLUMN_FIELDS = 'id, title, position, behavior';

function isValidPosition(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 100_000;
}

function confirmedColumnResponse(
  column: {
    id: string;
    title: string;
    position: number;
    behavior?: string | null;
    project_id?: string | null;
  },
  expectedBehavior?: string,
) {
  if (expectedBehavior !== undefined && column.behavior !== expectedBehavior) {
    return apiError('Column behavior was not persisted', 409);
  }

  return NextResponse.json(
    { success: true, column: publicColumn(column) },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

function validateProjectId(value: unknown) {
  return value === undefined || value === null || isUuid(value);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const title = typeof body?.title === 'string' ? body.title.trim() : '';
    const position = body?.position;
    const behavior = body?.behavior ?? 'active';
    const projectId = body?.projectId ?? null;

    if (!title || title.length > COLUMN_TITLE_MAX_LENGTH) {
      return apiError('Column title is invalid', 400);
    }
    if (!isValidPosition(position)) return apiError('Column position is invalid', 400);
    if (!isColumnBehavior(behavior)) {
      return apiError(`Column behavior must be one of: ${COLUMN_BEHAVIORS.join(', ')}`, 400);
    }
    if (!validateProjectId(projectId)) return apiError('Project ID is invalid', 400);

    const result = await getKanbanServerContext();
    if ('response' in result) return result.response;
    const { user, supabase } = result.context;

    if (projectId) {
      const ownership = await getOwnedRecord(supabase, 'kanban_projects', projectId, user.id);
      if (ownership.kind !== 'owned') return relationError(ownership.kind, 'project');
    }

    const insertData: Record<string, unknown> = {
      user_id: user.id,
      title: title.toUpperCase(),
      position,
      behavior,
    };
    if (projectId) insertData.project_id = projectId;

    const insertQuery = supabase.from('kanban_columns').insert(insertData);
    const { data: column, error } = projectId
      ? await insertQuery.select('id, title, position, behavior, project_id').single()
      : await insertQuery.select(COLUMN_FIELDS).single();

    if (error) return databaseError('create column', error);
    if (!column) return apiError('Column was not created', 409);

    return confirmedColumnResponse(column, behavior);
  } catch (error) {
    console.error('[API columns] POST exception:', error);
    if (error instanceof SyntaxError) return apiError('Invalid JSON body', 400);
    return apiError('Internal server error', 500);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const columnId = body?.columnId;
    if (!isUuid(columnId)) return apiError('Column ID is invalid', 400);

    const updates: Record<string, unknown> = {};
    if (body?.title !== undefined) {
      if (typeof body.title !== 'string' || !body.title.trim() || body.title.trim().length > COLUMN_TITLE_MAX_LENGTH) {
        return apiError('Column title is invalid', 400);
      }
      updates.title = body.title.trim().toUpperCase();
    }
    if (body?.position !== undefined) {
      if (!isValidPosition(body.position)) return apiError('Column position is invalid', 400);
      updates.position = body.position;
    }
    if (body?.behavior !== undefined) {
      if (!isColumnBehavior(body.behavior)) {
        return apiError(`Column behavior must be one of: ${COLUMN_BEHAVIORS.join(', ')}`, 400);
      }
      updates.behavior = body.behavior;
    }
    if (Object.keys(updates).length === 0) return apiError('No column fields were supplied', 400);

    const result = await getKanbanServerContext();
    if ('response' in result) return result.response;
    const { user, supabase } = result.context;

    const ownership = await getOwnedRecord(supabase, 'kanban_columns', columnId, user.id);
    if (ownership.kind !== 'owned') return relationError(ownership.kind, 'column');

    const { data: column, error } = await supabase
      .from('kanban_columns')
      .update(updates)
      .eq('id', columnId)
      .eq('user_id', user.id)
      .select(COLUMN_FIELDS)
      .maybeSingle();

    if (error) return databaseError('update column', error);
    if (!column) return apiError('Column was not updated', 409);

    return confirmedColumnResponse(
      column,
      typeof updates.behavior === 'string' ? updates.behavior : undefined,
    );
  } catch (error) {
    console.error('[API columns] PATCH exception:', error);
    if (error instanceof SyntaxError) return apiError('Invalid JSON body', 400);
    return apiError('Internal server error', 500);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json();
    const columnId = body?.columnId;
    if (!isUuid(columnId)) return apiError('Column ID is invalid', 400);

    const result = await getKanbanServerContext();
    if ('response' in result) return result.response;
    const { user, supabase } = result.context;

    const ownership = await getOwnedRecord(supabase, 'kanban_columns', columnId, user.id);
    if (ownership.kind !== 'owned') return relationError(ownership.kind, 'column');

    const { data: deletedColumn, error } = await supabase
      .from('kanban_columns')
      .delete()
      .eq('id', columnId)
      .eq('user_id', user.id)
      .select('id')
      .maybeSingle();

    if (error) return databaseError('delete column', error);
    if (!deletedColumn) return apiError('Column was not deleted', 409);

    return NextResponse.json({ success: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('[API columns] DELETE exception:', error);
    if (error instanceof SyntaxError) return apiError('Invalid JSON body', 400);
    return apiError('Internal server error', 500);
  }
}