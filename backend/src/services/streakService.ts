// Zen streak calculation - pure functions (unit tested)

/**
 * Counts the current zen streak from a list of focused-session day flags,
 * ordered most recent first (per RULES.md example).
 */
export function calculateZenStreak(sessionDays: boolean[]): number {
  let streak = 0;
  for (const active of sessionDays) {
    if (!active) break;
    streak += 1;
  }
  return streak;
}

/** Longest run of consecutive active days in chronological order. */
export function calculateLongestStreak(sessionDays: boolean[]): number {
  let longest = 0;
  let current = 0;
  for (const active of sessionDays) {
    if (active) {
      current += 1;
      longest = Math.max(longest, current);
    } else {
      current = 0;
    }
  }
  return longest;
}

export function updateStreakCounters(
  current: { currentStreak: number; longestStreak: number },
  completedSessionToday: boolean
): { currentStreak: number; longestStreak: number } {
  if (!completedSessionToday) return current;
  const currentStreak = current.currentStreak + 1;
  return { currentStreak, longestStreak: Math.max(current.longestStreak, currentStreak) };
}
