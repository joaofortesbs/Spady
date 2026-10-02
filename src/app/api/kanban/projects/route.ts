import { NextRequest, NextResponse } from 'next/server';
import { confirmsProjectUpdates, isProjectSaveData, parseProjectUpdates } from '@/lib/kanban-project-mutations';
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

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const updates = parseProjectUpdates(body?.projectId, body?.updates);
    if (!updates) return apiError('Project changes are invalid', 400);
    const result = await getKanbanServerContext();
    if ('response' in result) return result.response;
    const { user, supabase } = result.context;
    const project = await getOwnedRecord(supabase, 'kanban_projects', body.projectId, user.id);
    if (project.kind !== 'owned') return relationError(project.kind, 'project');
    for (const change of updates.columnChanges) {
      const column = await getOwnedRecord(supabase, 'kanban_columns', change.columnId, user.id);
      if (column.kind !== 'owned') return relationError(column.kind, 'column');
    }
    const { data, error } = await supabase.rpc('edit_kanban_project_v1', {
      p_user_id: user.id,
      p_project_id: body.projectId,
      p_updates: Object.fromEntries(Object.entries({ name: updates.name, color: updates.color })
        .filter(([, value]) => value !== undefined)),
      p_expected: updates.expected,
      p_column_changes: updates.columnChanges,
    });
    if (error) {
      if (error.code === 'PGRST202' || error.code === '42883') {
        return apiError('A edição de projetos ainda não está instalada no banco. Nenhuma alteração foi salva.', 409);
      }
      if (error.code === '40001' || error.code === 'P0001') {
        return apiError('O projeto ou uma coluna mudou em outra sessão. Recarregue e tente novamente.', 409);
      }
      return databaseError('edit project', error);
    }
    if (!isProjectSaveData(data) || !confirmsProjectUpdates(data, body.projectId, updates)) {
      return apiError('The server did not confirm all project changes', 502);
    }
    return NextResponse.json({ success: true, data }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('[API projects] PATCH failed');
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

    return NextResponse.json({ success: true, deletedProjectId: projectId }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    console.error('[API projects] DELETE exception:', error);
    if (error instanceof SyntaxError) return apiError('Invalid JSON body', 400);
    return apiError('Internal server error', 500);
  }
}