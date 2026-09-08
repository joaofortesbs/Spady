import { describe, expect, it } from 'vitest';
import {
  isDateOnly,
  isHexColor,
  isIsoDateTime,
  isUuid,
  publicCard,
  publicProject,
} from './kanban';

describe('Kanban API validation and public DTOs', () => {
  it('accepts UUIDs and rejects malformed identifiers', () => {
    expect(isUuid('00000000-0000-0000-0000-000000000000')).toBe(true);
    expect(isUuid('not-a-uuid')).toBe(false);
    expect(isUuid(undefined)).toBe(false);
  });

  it('validates project colors and calendar values', () => {
    expect(isHexColor('#06b6d4')).toBe(true);
    expect(isHexColor('#fff')).toBe(false);
    expect(isDateOnly('2026-02-28')).toBe(true);
    expect(isDateOnly('2026-02-30')).toBe(false);
    expect(isIsoDateTime('2026-02-28T10:00:00.000Z')).toBe(true);
    expect(isIsoDateTime('not-a-date')).toBe(false);
  });

  it('returns only the public project and card fields', () => {
    expect(publicProject({
      id: 'project-id',
      name: 'Projeto',
      color: '#06b6d4',
      created_at: '2026-02-28T10:00:00.000Z',
      updated_at: '2026-02-28T10:01:00.000Z',
      user_id: 'private-user-id',
    } as never)).toEqual({
      id: 'project-id',
      name: 'Projeto',
      color: '#06b6d4',
      createdAt: '2026-02-28T10:00:00.000Z',
      updatedAt: '2026-02-28T10:01:00.000Z',
    });

    expect(publicCard({
      id: 'card-id',
      title: 'Card',
      description: null,
      priority: 'media',
      tags: [],
      subtasks: [],
      created_at: '2026-02-28T10:00:00.000Z',
      updated_at: '2026-02-28T10:01:00.000Z',
      project_id: null,
      due_date: null,
      completed_at: null,
      user_id: 'private-user-id',
    } as never)).not.toHaveProperty('user_id');
  });
});