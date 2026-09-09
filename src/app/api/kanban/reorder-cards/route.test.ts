import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';

function request(body: unknown) {
  return new NextRequest('http://localhost/api/kanban/reorder-cards', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const columnId = '11111111-1111-4111-8111-111111111111';

describe('/api/kanban/reorder-cards validation', () => {
  it('rejects duplicate cards and positions', async () => {
    const cardId = '22222222-2222-4222-8222-222222222222';
    const response = await POST(request({
      columnId,
      cardPositions: [
        { cardId, position: 0 },
        { cardId, position: 0 },
      ],
    }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Card positions must be a complete ordered list' });
  });

  it('rejects lists that do not start at position zero', async () => {
    const response = await POST(request({
      columnId,
      cardPositions: [
        { cardId: '22222222-2222-4222-8222-222222222222', position: 1 },
      ],
    }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Card positions must be a complete ordered list' });
  });
});