import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';

function request(body: unknown) {
  return new NextRequest('http://localhost/api/kanban/move-card', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('/api/kanban/move-card validation', () => {
  it('rejects invalid IDs before authentication or database access', async () => {
    const response = await POST(request({
      cardId: 'not-a-uuid',
      targetColumnId: 'also-invalid',
      position: 0,
    }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Card or target column ID is invalid' });
  });

  it('rejects negative and fractional positions', async () => {
    const cardId = '22222222-2222-4222-8222-222222222222';
    const targetColumnId = '11111111-1111-4111-8111-111111111111';

    for (const position of [-1, 1.5]) {
      const response = await POST(request({ cardId, targetColumnId, position }));
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: 'Card position is invalid' });
    }
  });
});