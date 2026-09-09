import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { apiError, isUuid } from '@/lib/api/kanban';

export async function POST(req: NextRequest) {
  try {
    const { columnId, cardPositions } = await req.json();
    
    if (!isUuid(columnId) || !Array.isArray(cardPositions) || cardPositions.length === 0) {
      return apiError('Column or card positions are invalid', 400);
    }

    const normalizedPositions = cardPositions as Array<{ cardId?: unknown; position?: unknown }>;
    const cardIds = normalizedPositions.map(item => item.cardId);
    const positions = normalizedPositions.map(item => item.position);
    if (
      cardIds.some(cardId => !isUuid(cardId))
      || positions.some(position => !Number.isInteger(position) || (position as number) < 0)
      || new Set(cardIds).size !== cardIds.length
      || new Set(positions).size !== positions.length
      || positions.some((position, index) => position !== index)
    ) {
      return apiError('Card positions must be a complete ordered list', 400);
    }
    
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
      console.error('[API reorder-cards] Missing Supabase credentials');
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
      console.error('[API reorder-cards] Unauthorized:', authError);
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Format for RPC: array of { id, column_id, position }
    // The RPC function update_card_positions expects p_updates as JSONB array
    const formattedUpdates = cardPositions.map((p: { cardId: string; position: number }) => ({
      id: p.cardId,
      column_id: columnId,
      position: p.position,
    }));
    
    console.log('[API reorder-cards] User:', user.id, 'Calling RPC update_card_positions with p_updates:', formattedUpdates);
    
    const { data, error } = await supabase.rpc('update_card_positions', {
      p_user_id: user.id,
      p_updates: formattedUpdates,
    });
    
    if (error) {
      console.error('[API reorder-cards] RPC error:', { code: error.code, message: error.message });
      return apiError('Unable to reorder cards', 500);
    }
    
    console.log('[API reorder-cards] SUCCESS for user', user.id, ':', data);
    
    if (data && !data.success) {
      console.error('[API reorder-cards] RPC returned failure:', data);
      return apiError('Unable to reorder cards', 400);
    }
    
    return NextResponse.json(
      { success: true, data },
      { headers: { 'Cache-Control': 'no-store' } },
    );
    
  } catch (error) {
    console.error('[API reorder-cards] Unexpected error:', error);
    return apiError('Internal server error', 500);
  }
}
