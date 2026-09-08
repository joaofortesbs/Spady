import { NextRequest, NextResponse } from 'next/server';
import {
  apiError,
  databaseError,
  getKanbanServerContext,
  getOwnedRecord,
  isHexColor,
  isUuid,
  PROJECT_NAME_MAX_LENGTH,
  publicProject,
  relationError,
} from '@/lib/api/kanban';

export async function GET() {
  try {
    const result = await getKanbanServerContext();
    if ('response' in result) return result.response;
    const { user, supabase } = result.context;

    const { data: projects, error } = await supabase
      .from('kanban_projects')
      // Keep the API compatible with projects created before the hardening
      // migration added the optional updated_at column.
      .select('id, name, color, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true });

    if (error) return databaseError('load projects', error);

    return NextResponse.json(
      { success: true, projects: (projects || []).map(publicProject) },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error('[API projects] GET exception:', error);
    return apiError('Internal server error', 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    const color = typeof body?.color === 'string' ? body.color.trim() : '';

    if (!name || name.length > PROJECT_NAME_MAX_LENGTH || !isHexColor(color)) {
      return apiError('Project name and color are invalid', 400);
    }

    const result = await getKanbanServerContext();
    if ('response' in result) return result.response;
    const { user, supabase } = result.context;

    const { data: project, error } = await supabase
      .from('kanban_projects')
      .insert({ user_id: user.id, name, color })
      .select('id, name, color, created_at')
      .single();

    if (error) return databaseError('create project', error);

    return NextResponse.json({
      success: true,
      project: publicProject(project),
    });
  } catch (error) {
    console.error('[API projects] POST exception:', error);
    if (error instanceof SyntaxError) return apiError('Invalid JSON body', 400);
    return apiError('Internal server error', 500);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json();
    const { projectId } = body || {};

    if (!isUuid(projectId)) return apiError('Project ID is invalid', 400);

    const result = await getKanbanServerContext();
    if ('response' in result) return result.response;
    const { user, supabase } = result.context;

    const ownership = await getOwnedRecord(supabase, 'kanban_projects', projectId, user.id);
    if (ownership.kind !== 'owned') return relationError(ownership.kind, 'project');

    const { data: deletedProject, error: deleteError } = await supabase
      .from('kanban_projects')
      .delete()
      .eq('id', projectId)
      .eq('user_id', user.id)
      .select('id');

    if (deleteError) return databaseError('delete project', deleteError);
    if (!deletedProject?.length) return apiError('Project was not deleted', 409);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[API projects] DELETE exception:', error);
    if (error instanceof SyntaxError) return apiError('Invalid JSON body', 400);
    return apiError('Internal server error', 500);
  }
}