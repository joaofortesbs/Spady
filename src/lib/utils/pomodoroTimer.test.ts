import { describe, expect, it } from 'vitest';
import {
  calculateLiveProgressPercent,
  shouldApplyConfiguredDuration,
} from './pomodoroTimer';

describe('pomodoro timer synchronization', () => {
  it('applies a changed duration when the selected timer is idle', () => {
    expect(
      shouldApplyConfiguredDuration(
        {
          isRunning: false,
          accumulatedSeconds: 0,
          categoryId: 'produtividade',
          totalDurationSeconds: 25 * 60,
        },
        'produtividade',
        57 * 60,
      ),
    ).toBe(true);
  });

  it('does not overwrite an active or paused session', () => {
    expect(
      shouldApplyConfiguredDuration(
        {
          isRunning: true,
          accumulatedSeconds: 0,
          categoryId: 'produtividade',
          totalDurationSeconds: 25 * 60,
        },
        'produtividade',
        57 * 60,
      ),
    ).toBe(false);

    expect(
      shouldApplyConfiguredDuration(
        {
          isRunning: false,
          accumulatedSeconds: 120,
          categoryId: 'produtividade',
          totalDurationSeconds: 25 * 60,
        },
        'produtividade',
        57 * 60,
      ),
    ).toBe(false);
  });

  it('clamps live progress to the visual range', () => {
    expect(calculateLiveProgressPercent(30 * 60, 60)).toBe(50);
    expect(calculateLiveProgressPercent(90 * 60, 60)).toBe(100);
    expect(calculateLiveProgressPercent(-10, 60)).toBe(0);
    expect(calculateLiveProgressPercent(60, 0)).toBe(0);
  });
});
