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
const UPDATE_FIELDS = new Set([
  'cardId',
  'title',
  'description',
  'priority',
  'tags',
  'subtasks',
  'projectId',
  'dueDate',
  'completedAt',
]);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body || typeof body !== 'object' || !isUuid((body as Record<string, unknown>).cardId)) {
      return apiError('Card ID is invalid', 400);
    }

    const input = body as Record<string, any>;
    const invalidField = Object.keys(input).find(key => !UPDATE_FIELDS.has(key));
    if (invalidField) return apiError('Request contains unsupported fields', 400);
    if (Object.keys(input).length === 1) return apiError('No card fields were supplied', 400);

    if (input.title !== undefined && (typeof input.title !== 'string' || !input.title.trim() || input.title.trim().length > CARD_TITLE_MAX_LENGTH)) {
      return apiError('Card title is invalid', 400);
    }
    if (input.description !== undefined && (typeof input.description !== 'string' || input.description.length > CARD_DESCRIPTION_MAX_LENGTH)) {
      return apiError('Card description is invalid', 400);
    }
    if (input.priority !== undefined && (typeof input.priority !== 'string' || !PRIORITIES.has(input.priority))) {
      return apiError('Card priority is invalid', 400);
    }
    if (input.tags !== undefined && (!Array.isArray(input.tags) || input.tags.some((tag: unknown) => typeof tag !== 'string' || tag.length > 80))) {
      return apiError('Card tags are invalid', 400);
    }
    if (input.subtasks !== undefined && !Array.isArray(input.subtasks)) return apiError('Card subtasks are invalid', 400);
    if (input.projectId !== undefined && input.projectId !== null && !isUuid(input.projectId)) {
      return apiError('Project ID is invalid', 400);
    }
    if (input.dueDate !== undefined && input.dueDate !== null && !isDateOnly(input.dueDate)) {
      return apiError('Due date is invalid', 400);
    }
    if (input.completedAt !== undefined && input.completedAt !== null && !isIsoDateTime(input.completedAt)) {
      return apiError('Completion date is invalid', 400);
    }

    const result = await getKanbanServerContext();
    if ('response' in result) return result.response;
    const { user, supabase } = result.context;

    const cardOwnership = await getOwnedRecord(supabase, 'kanban_cards', input.cardId, user.id);
    if (cardOwnership.kind !== 'owned') return relationError(cardOwnership.kind, 'card');
    
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    
    if (input.title !== undefined) updateData.title = input.title.trim();
    if (input.description !== undefined) updateData.description = input.description?.trim() || '';
    if (input.priority !== undefined) updateData.priority = input.priority;
    if (input.tags !== undefined) updateData.tags = input.tags;
    if (input.subtasks !== undefined) updateData.subtasks = input.subtasks;
    if (input.projectId !== undefined) {
      if (input.projectId !== null) {
        const projectOwnership = await getOwnedRecord(supabase, 'kanban_projects', input.projectId, user.id);
        if (projectOwnership.kind !== 'owned') return relationError(projectOwnership.kind, 'project');
      }
      updateData.project_id = input.projectId;
    }
    if (input.dueDate !== undefined) updateData.due_date = input.dueDate;
    if (input.completedAt !== undefined) updateData.completed_at = input.completedAt;
    
    const { data: updatedCard, error: updateError } = await supabase
      .from('kanban_cards')
      .update(updateData)
      .eq('id', input.cardId)
      .eq('user_id', user.id)
      .select('id, title, description, priority, tags, subtasks, created_at, updated_at, project_id, due_date, completed_at')
      .single();
    
    if (updateError) {
      return databaseError('update card', updateError);
    }
    
    if (!updatedCard) {
      return apiError('Card was not updated', 409);
    }

    return NextResponse.json({ success: true, card: publicCard(updatedCard) });
  } catch (error) {
    console.error('[API update-card] Unexpected error:', error);
    if (error instanceof SyntaxError) return apiError('Invalid JSON body', 400);
    return apiError('Internal server error', 500);
  }
}
