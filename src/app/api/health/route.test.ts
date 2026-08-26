import { describe, expect, it } from 'vitest';

import { GET, HEAD } from './route';

describe('/api/health', () => {
  it('returns a small dependency-free liveness response', async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('no-store');

    const body = await response.json();
    expect(body.status).toBe('ok');
    expect(typeof body.timestamp).toBe('string');
    expect(body).not.toHaveProperty('checks');
    expect(body).not.toHaveProperty('autoFixes');
  });

  it('supports lightweight HEAD probes', async () => {
    const response = await HEAD();

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(await response.text()).toBe('');
  });
});