import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const headers = {
  'Cache-Control': 'no-store, no-cache, must-revalidate',
};

export async function GET() {
  return NextResponse.json(
    {
      status: 'ok',
      timestamp: new Date().toISOString(),
    },
    {
      status: 200,
      headers,
    },
  );
}

export async function HEAD() {
  return new NextResponse(null, {
    status: 200,
    headers,
  });
}