import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { apiError, isUuid } from '@/lib/api/kanban';

export async function POST(req: NextRequest) {
  try {
    const { cardId, targetColumnId, position } = await req.json();
    
    if (!isUuid(cardId) || !isUuid(targetColumnId)) return apiError('Card or target column ID is invalid', 400);
    if (!Number.isInteger(position) || position < 0) return apiError('Card position is invalid', 400);
    
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
      console.error('[API move-card] Missing Supabase credentials');
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
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
            // Cookies can be read but not mutated in some server-only contexts.
          }
        },
      },
    });
    
    const { data: { user }, error: authError } = await authClient.auth.getUser();
    
    if (authError || !user) {
      console.error('[API move-card] Unauthorized:', authError);
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    console.log('[API move-card] User:', user.id, 'Calling RPC move_card:', { cardId, targetColumnId, position });
    
    const { data, error } = await supabase.rpc('move_card', {
      p_user_id: user.id,
      p_card_id: cardId,
      p_target_column_id: targetColumnId,
      p_new_position: position,
    });
    
    if (error) {
      console.error('[API move-card] RPC error:', { code: error.code, message: error.message });
      return apiError('Unable to move card', 500);
    }
    
    console.log('[API move-card] SUCCESS for user', user.id, ':', data);
    
    if (data && !data.success) {
      console.error('[API move-card] RPC returned failure:', data);
      return apiError('Unable to move card', 400);
    }
    
    return NextResponse.json(
      { success: true, data },
      { headers: { 'Cache-Control': 'no-store' } },
    );
    
  } catch (error) {
    console.error('[API move-card] Unexpected error:', error);
    return apiError('Internal server error', 500);
  }
}
