import { analyzeCommitSentiment } from '../services/moodAnalyzer';
import { calculateZenStreak, calculateLongestStreak, updateStreakCounters } from '../services/streakService';

describe('analyzeCommitSentiment', () => {
  it('tags frustrated messages as Stress Signals', () => {
    expect(analyzeCommitSentiment('ugh revert broken hack, fix the failing test again')).toBe('Stress Signals');
  });

  it('tags refactoring as Deep Focus', () => {
    expect(analyzeCommitSentiment('refactor: extract service module for architecture clarity')).toBe('Deep Focus');
  });

  it('tags feature work as Positive', () => {
    expect(analyzeCommitSentiment('feat: add polish to dashboard and ship release')).toBe('Positive');
  });

  it('falls back to Neutral for unknown content', () => {
    expect(analyzeCommitSentiment('zzz qqq')).toBe('Neutral');
    expect(analyzeCommitSentiment('')).toBe('Neutral');
  });
});

describe('calculateZenStreak', () => {
  it('returns correct streak count per RULES.md example', () => {
    expect(calculateZenStreak([true, false, true])).toBe(1);
  });

  it('counts consecutive recent days', () => {
    expect(calculateZenStreak([true, true, true])).toBe(3);
    expect(calculateZenStreak([false, true, true])).toBe(0);
    expect(calculateZenStreak([])).toBe(0);
  });
});

describe('calculateLongestStreak', () => {
  it('finds the longest run chronologically', () => {
    expect(calculateLongestStreak([true, true, false, true, true, true])).toBe(3);
    expect(calculateLongestStreak([false, false])).toBe(0);
  });
});

describe('updateStreakCounters', () => {
  it('increments and tracks longest streak', () => {
    const next = updateStreakCounters({ currentStreak: 4, longestStreak: 6 }, true);
    expect(next.currentStreak).toBe(5);
    expect(next.longestStreak).toBe(6);

    const record = updateStreakCounters({ currentStreak: 6, longestStreak: 6 }, true);
    expect(record.longestStreak).toBe(7);
  });

  it('does not change counters without a completed session', () => {
    expect(updateStreakCounters({ currentStreak: 3, longestStreak: 5 }, false)).toEqual({ currentStreak: 3, longestStreak: 5 });
  });
});
