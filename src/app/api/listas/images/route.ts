import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };
  try {
    const client = await createClient();
    const { data: { user }, error: authError } = await client.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Entre na sua conta.' }, { status: 401, headers });
    const path = request.nextUrl.searchParams.get('path') ?? '';
    if (!/^[0-9a-f-]{36}\/[0-9a-f]{64}$/.test(path) || !path.startsWith(`${user.id}/`)) {
      return NextResponse.json({ error: 'Imagem não encontrada.' }, { status: 404, headers });
    }
    const { data: reference, error } = await client.from('listas_images').select('object_path')
      .eq('user_id', user.id).eq('object_path', path).limit(1).maybeSingle();
    if (error) return NextResponse.json({ error: 'Não foi possível carregar a imagem.' }, { status: 503, headers });
    if (!reference) return NextResponse.json({ error: 'Imagem não encontrada.' }, { status: 404, headers });
    const { data: image, error: downloadError } = await client.storage.from('listas-images').download(path);
    if (downloadError || !image) return NextResponse.json({ error: 'Não foi possível carregar a imagem.' }, { status: 503, headers });
    return new NextResponse(image, { headers: { ...headers, 'Content-Type': image.type } });
  } catch {
    return NextResponse.json({ error: 'Não foi possível carregar a imagem.' }, { status: 503, headers });
  }
}
