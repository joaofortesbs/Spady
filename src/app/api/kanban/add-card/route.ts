import { NextRequest, NextResponse } from 'next/server';
import {
  apiError,
  CARD_DESCRIPTION_MAX_LENGTH,
  CARD_TITLE_MAX_LENGTH,
  databaseError,
  getKanbanServerContext,
  getOwnedRecord,
  isDateOnly,
  isIsoDateTime,
  isUuid,
  publicCard,
  relationError,
} from '@/lib/api/kanban';

const PRIORITIES = new Set(['alta', 'media', 'baixa']);

function validateCardPayload(body: unknown) {
  if (!body || typeof body !== 'object') return 'Invalid request body';
  const input = body as Record<string, unknown>;
  if (!isUuid(input.columnId)) return 'Column ID is invalid';
  if (typeof input.title !== 'string' || !input.title.trim() || input.title.trim().length > CARD_TITLE_MAX_LENGTH) {
    return 'Card title is invalid';
  }
  if (input.description !== undefined && (typeof input.description !== 'string' || input.description.length > CARD_DESCRIPTION_MAX_LENGTH)) {
    return 'Card description is invalid';
  }
  if (input.priority !== undefined && (typeof input.priority !== 'string' || !PRIORITIES.has(input.priority))) {
    return 'Card priority is invalid';
  }
  if (input.tags !== undefined && (!Array.isArray(input.tags) || input.tags.some(tag => typeof tag !== 'string' || tag.length > 80))) {
    return 'Card tags are invalid';
  }
  if (input.subtasks !== undefined && !Array.isArray(input.subtasks)) return 'Card subtasks are invalid';
  if (input.position !== undefined && (!Number.isInteger(input.position) || (input.position as number) < 0)) {
    return 'Card position is invalid';
  }
  if (input.projectId !== undefined && input.projectId !== null && !isUuid(input.projectId)) {
    return 'Project ID is invalid';
  }
  if (input.dueDate !== undefined && input.dueDate !== null && !isDateOnly(input.dueDate)) {
    return 'Due date is invalid';
  }
  if (input.completedAt !== undefined && input.completedAt !== null && !isIsoDateTime(input.completedAt)) {
    return 'Completion date is invalid';
  }
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const validationError = validateCardPayload(body);
    if (validationError) return apiError(validationError, 400);

    const {
      columnId,
      title,
      description,
      priority,
      tags,
      subtasks,
      position,
      projectId,
      dueDate,
      completedAt,
    } = body as Record<string, any>;

    const result = await getKanbanServerContext();
    if ('response' in result) return result.response;
    const { user, supabase } = result.context;

    const columnOwnership = await getOwnedRecord(supabase, 'kanban_columns', columnId, user.id);
    if (columnOwnership.kind !== 'owned') return relationError(columnOwnership.kind, 'column');

    if (projectId) {
      const projectOwnership = await getOwnedRecord(supabase, 'kanban_projects', projectId, user.id);
      if (projectOwnership.kind !== 'owned') return relationError(projectOwnership.kind, 'project');
    }

    const cardData: Record<string, unknown> = {
      user_id: user.id,
      column_id: columnId,
      title: title.trim(),
      description: description?.trim() || '',
      priority: priority || 'media',
      tags: tags || [],
      subtasks: subtasks || [],
      position: position ?? 0,
    };
    
    if (projectId !== undefined) cardData.project_id = projectId;
    if (dueDate !== undefined) cardData.due_date = dueDate;
    if (completedAt !== undefined) cardData.completed_at = completedAt;
    
    const { data: newCard, error: insertError } = await supabase
      .from('kanban_cards')
      .insert(cardData)
      .select()
      .single();
    
    if (insertError) {
      return databaseError('create card', insertError);
    }
    
    if (!newCard) {
      return apiError('Card was not created', 500);
    }

    return NextResponse.json({ success: true, card: publicCard(newCard) });
  } catch (error) {
    console.error('[API add-card] Unexpected error:', error);
    if (error instanceof SyntaxError) return apiError('Invalid JSON body', 400);
    return apiError('Internal server error', 500);
  }
}
