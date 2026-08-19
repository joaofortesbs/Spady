type TimerDurationState = Pick<{
  isRunning: boolean;
  accumulatedSeconds: number;
  categoryId: string;
  totalDurationSeconds: number;
}, 'isRunning' | 'accumulatedSeconds' | 'categoryId' | 'totalDurationSeconds'>;

export function shouldApplyConfiguredDuration(
  state: TimerDurationState,
  categoryId: string,
  durationSeconds: number,
): boolean {
  return (
    !state.isRunning &&
    state.accumulatedSeconds === 0 &&
    (state.categoryId !== categoryId || state.totalDurationSeconds !== durationSeconds)
  );
}

export function calculateLiveProgressPercent(
  elapsedSeconds: number,
  durationMinutes: number,
): number {
  if (durationMinutes <= 0) return 0;
  return Math.min(100, Math.max(0, (elapsedSeconds / (durationMinutes * 60)) * 100));
}
