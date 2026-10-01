import { NextRequest, NextResponse } from 'next/server';
import {
  apiError,
  COLUMN_BEHAVIORS,
  COLUMN_TITLE_MAX_LENGTH,
  databaseError,
  getKanbanServerContext,
  getOwnedRecord,
  isColumnBehavior,
  isHexColor,
  isUuid,
  publicColumn,
  relationError,
} from '@/lib/api/kanban';

// Keep ordinary column edits compatible with installations created before
// project_id was introduced; the dedicated project transfer RPC requires the
// current project schema.
const COLUMN_FIELDS = 'id, title, position, behavior';

function isValidPosition(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 100_000;
}

type ColumnRow = {
  id: string;
  title: string;
  position: number;
  behavior?: string | null;
  project_id?: string | null;
  background_color?: string | null;
};

function confirmedColumnResponse(
  column: ColumnRow,
  expectedUpdates: Record<string, unknown> = {},
  transfer?: { cardsUpdatedCount: number },
) {
  const persistedFieldNames: Record<string, keyof ColumnRow> = {
    title: 'title',
    position: 'position',
    behavior: 'behavior',
    projectId: 'project_id',
    backgroundColor: 'background_color',
  };
  for (const [inputName, expectedValue] of Object.entries(expectedUpdates)) {
    const persistedField = persistedFieldNames[inputName];
    if (!persistedField || column[persistedField] !== expectedValue) {
      return apiError(`Column ${inputName} was not persisted`, 409);
    }
  }

  return NextResponse.json(
    {
      success: true,
      column: publicColumn(column),
      ...(transfer
        ? { cardsProjectUpdated: true, cardsUpdatedCount: transfer.cardsUpdatedCount }
        : {}),
    },
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

    return confirmedColumnResponse(column, { behavior });
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
    const expectedUpdates: Record<string, unknown> = {};
    if (body?.title !== undefined) {
      if (typeof body.title !== 'string' || !body.title.trim() || body.title.trim().length > COLUMN_TITLE_MAX_LENGTH) {
        return apiError('Column title is invalid', 400);
      }
      updates.title = body.title.trim().toUpperCase();
      expectedUpdates.title = updates.title;
    }
    if (body?.position !== undefined) {
      if (!isValidPosition(body.position)) return apiError('Column position is invalid', 400);
      updates.position = body.position;
      expectedUpdates.position = body.position;
    }
    if (body?.behavior !== undefined) {
      if (!isColumnBehavior(body.behavior)) {
        return apiError(`Column behavior must be one of: ${COLUMN_BEHAVIORS.join(', ')}`, 400);
      }
      updates.behavior = body.behavior;
      expectedUpdates.behavior = body.behavior;
    }
    if (body?.projectId !== undefined) {
      if (!validateProjectId(body.projectId)) return apiError('Project ID is invalid', 400);
      updates.projectId = body.projectId;
      expectedUpdates.projectId = body.projectId;
    }
    if (body?.backgroundColor !== undefined) {
      if (body.backgroundColor !== null && !isHexColor(body.backgroundColor)) {
        return apiError('Column background color must be a 6-digit hex color or null', 400);
      }
      updates.backgroundColor = body.backgroundColor?.toLowerCase() ?? null;
      expectedUpdates.backgroundColor = updates.backgroundColor;
    }
    if (Object.keys(updates).length === 0) return apiError('No column fields were supplied', 400);

    const result = await getKanbanServerContext();
    if ('response' in result) return result.response;
    const { user, supabase } = result.context;

    const ownership = await getOwnedRecord(supabase, 'kanban_columns', columnId, user.id);
    if (ownership.kind !== 'owned') return relationError(ownership.kind, 'column');

    if (Object.prototype.hasOwnProperty.call(updates, 'projectId') && updates.projectId !== null) {
      const projectOwnership = await getOwnedRecord(supabase, 'kanban_projects', updates.projectId as string, user.id);
      if (projectOwnership.kind !== 'owned') return relationError(projectOwnership.kind, 'project');
    }

    if (Object.prototype.hasOwnProperty.call(updates, 'projectId')) {
      const rpcUpdates: Record<string, unknown> = {};
      if (updates.title !== undefined) rpcUpdates.title = updates.title;
      if (updates.behavior !== undefined) rpcUpdates.behavior = updates.behavior;
      if (updates.position !== undefined) rpcUpdates.position = updates.position;
      rpcUpdates.project_id = updates.projectId;
      if (Object.prototype.hasOwnProperty.call(updates, 'backgroundColor')) {
        rpcUpdates.background_color = updates.backgroundColor;
      }

      const { data, error } = await supabase.rpc('edit_kanban_column_v1', {
        p_user_id: user.id,
        p_column_id: columnId,
        p_updates: rpcUpdates,
      });

      if (error) {
        if (error.code === 'P0001' && error.message?.includes('Column not found')) {
          return apiError('Column not found', 404);
        }
        if (error.code === 'P0001' && error.message?.includes('not owned by user')) {
          return apiError('You do not have access to this Kanban data', 403);
        }
        return databaseError('update column', error);
      }
      if (!data || typeof data !== 'object') {
        return apiError('Column transfer was not confirmed', 409);
      }
      const rpcResponse = data as {
        column?: ColumnRow;
        cards_project_updated?: unknown;
        cards_updated_count?: unknown;
      };
      if (
        !rpcResponse.column
        || rpcResponse.cards_project_updated !== true
        || !Number.isInteger(rpcResponse.cards_updated_count)
        || (rpcResponse.cards_updated_count as number) < 0
      ) {
        return apiError('Column transfer was not confirmed', 409);
      }

      return confirmedColumnResponse(rpcResponse.column, expectedUpdates, {
        cardsUpdatedCount: rpcResponse.cards_updated_count as number,
      });
    }

    const selectedFields = [
      COLUMN_FIELDS,
      Object.prototype.hasOwnProperty.call(updates, 'backgroundColor') ? 'background_color' : null,
    ].filter(Boolean).join(', ');
    const databaseUpdates: Record<string, unknown> = { ...updates };
    delete databaseUpdates.backgroundColor;
    if (Object.prototype.hasOwnProperty.call(updates, 'backgroundColor')) {
      databaseUpdates.background_color = updates.backgroundColor;
    }
    const { data: column, error } = await supabase
      .from('kanban_columns')
      .update(databaseUpdates)
      .eq('id', columnId)
      .eq('user_id', user.id)
      .select(selectedFields)
      .maybeSingle();

    if (error) return databaseError('update column', error);
    if (!column) return apiError('Column was not updated', 409);

    return confirmedColumnResponse(column as unknown as ColumnRow, expectedUpdates);
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