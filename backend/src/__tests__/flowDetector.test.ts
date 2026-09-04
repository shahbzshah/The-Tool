import { detectFlowState, computeFrustrationScore, DEFAULT_THRESHOLDS } from '../services/flowDetector';

describe('detectFlowState', () => {
  it('returns In Flow for consistent velocity and manageable load', () => {
    const result = detectFlowState({
      commitsLastHour: 4,
      avgIntervalMinutes: 15,
      intervalVarianceMinutes: 5,
      openIssues: 2,
      minutesSinceLastActivity: 3
    });
    expect(result.state).toBe('In Flow');
    expect(result.confidence).toBeGreaterThanOrEqual(70);
  });

  it('returns Stressed for high issue backlog plus context thrashing', () => {
    const result = detectFlowState({
      commitsLastHour: 20,
      avgIntervalMinutes: 8,
      intervalVarianceMinutes: 22,
      openIssues: 7,
      minutesSinceLastActivity: 2
    });
    expect(result.state).toBe('Stressed');
  });

  it('returns Idle after the idle timeout', () => {
    const result = detectFlowState({
      commitsLastHour: 3,
      avgIntervalMinutes: 15,
      intervalVarianceMinutes: 4,
      openIssues: 1,
      minutesSinceLastActivity: 25
    });
    expect(result.state).toBe('Idle');
  });

  it('returns Idle when there is no meaningful activity signal', () => {
    const result = detectFlowState({
      commitsLastHour: 0,
      avgIntervalMinutes: 999,
      intervalVarianceMinutes: 0,
      openIssues: 0,
      minutesSinceLastActivity: 5
    });
    expect(result.state).toBe('Idle');
  });

  it('honors custom thresholds', () => {
    const result = detectFlowState(
      { commitsLastHour: 1, avgIntervalMinutes: 10, intervalVarianceMinutes: 2, openIssues: 9, minutesSinceLastActivity: 2 },
      { ...DEFAULT_THRESHOLDS, frustrationThreshold: 20 }
    );
    expect(result.state).toBe('In Flow');
  });
});

describe('computeFrustrationScore', () => {
  it('stays within 0-10 bounds', () => {
    expect(computeFrustrationScore(50, 100, 1)).toBeLessThanOrEqual(10);
    expect(computeFrustrationScore(0, 0, 0)).toBe(0);
  });

  it('rises with open issues', () => {
    expect(computeFrustrationScore(5, 0, 0)).toBeGreaterThan(computeFrustrationScore(2, 0, 0));
  });
});
