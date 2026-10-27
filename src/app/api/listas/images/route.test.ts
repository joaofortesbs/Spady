// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';
const mock = vi.hoisted(() => ({
  user: '00000000-0000-4000-8000-000000000001',
  getUser: vi.fn(), maybeSingle: vi.fn(), download: vi.fn(),
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => {
    const query = { eq: () => query, limit: () => query, maybeSingle: mock.maybeSingle };
    return { auth: { getUser: mock.getUser }, from: () => ({ select: () => query }),
      storage: { from: () => ({ download: mock.download }) } };
  },
}));
const path = `${mock.user}/${'b'.repeat(64)}`;
const request = (value = path) => new NextRequest(`http://app.test/api/listas/images?path=${encodeURIComponent(value)}`);
beforeEach(() => {
  vi.clearAllMocks();
  mock.getUser.mockResolvedValue({data:{user:{id:mock.user}},error:null});
  mock.maybeSingle.mockResolvedValue({data:{object_path:path},error:null});
  mock.download.mockResolvedValue({data:new Blob(['png'],{type:'image/png'}),error:null});
});
describe('private image delivery', () => {
  it('requires an authenticated account', async () => {
    mock.getUser.mockResolvedValue({data:{user:null},error:null});
    expect((await GET(request())).status).toBe(401);
    expect(mock.download).not.toHaveBeenCalled();
  });
  it('rejects traversal and another account before requesting storage', async () => {
    expect((await GET(request('../secret'))).status).toBe(404);
    expect((await GET(request(`00000000-0000-4000-8000-000000000002/${'a'.repeat(64)}`))).status).toBe(404);
    expect(mock.download).not.toHaveBeenCalled();
  });
  it('does not deliver uncommitted uploads', async () => {
    mock.maybeSingle.mockResolvedValue({data:null,error:null});
    expect((await GET(request())).status).toBe(404);
    expect(mock.download).not.toHaveBeenCalled();
  });
  it('delivers a confirmed image without shared caching', async () => {
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(response.headers.get('Content-Type')).toBe('image/png');
  });
  it('surfaces database and download failures instead of returning broken success', async () => {
    mock.download.mockResolvedValue({data:null,error:{code:'network'}});
    expect((await GET(request())).status).toBe(503);
    mock.maybeSingle.mockResolvedValue({data:null,error:{code:'database'}});
    expect((await GET(request())).status).toBe(503);
  });
});
