// Flow State Detection Engine - pure functions (unit tested)
// Detects: In Flow (optimal velocity), Stressed (high load + inconsistent velocity), Idle (low activity)

export interface IFlowInput {
  /** commits in the last hour */
  commitsLastHour: number;
  /** average minutes between commits in the observation window */
  avgIntervalMinutes: number;
  /** stddev of commit intervals (context thrashing indicator) */
  intervalVarianceMinutes: number;
  /** open issues assigned to the user */
  openIssues: number;
  /** minutes since last detected activity */
  minutesSinceLastActivity: number;
}

export interface IFlowThresholds {
  velocityThreshold: number;
  frustrationThreshold: number;
  idleTimeoutMinutes: number;
}

export interface IFlowResult {
  state: 'In Flow' | 'Stressed' | 'Idle';
  confidence: number; // 0-100
}

export const DEFAULT_THRESHOLDS: IFlowThresholds = {
  velocityThreshold: 8,
  frustrationThreshold: 5,
  idleTimeoutMinutes: 10
};

export function detectFlowState(input: IFlowInput, thresholds: IFlowThresholds = DEFAULT_THRESHOLDS): IFlowResult {
  const { commitsLastHour, avgIntervalMinutes, intervalVarianceMinutes, openIssues, minutesSinceLastActivity } = input;

  // Idle: long gap since last activity
  if (minutesSinceLastActivity >= thresholds.idleTimeoutMinutes) {
    return { state: 'Idle', confidence: Math.min(95, 60 + minutesSinceLastActivity) };
  }

  // Stress: high issue backlog + erratic velocity (frequent short bursts = context thrashing)
  const isThrashing = intervalVarianceMinutes > 15 && avgIntervalMinutes < 20;
  const isOverloaded = openIssues >= thresholds.frustrationThreshold;
  if (isOverloaded && (isThrashing || commitsLastHour > thresholds.velocityThreshold * 2)) {
    const confidence = Math.min(95, 55 + openIssues * 3 + intervalVarianceMinutes);
    return { state: 'Stressed', confidence: Math.round(confidence) };
  }

  // Flow: consistent commit velocity within optimal band, manageable issue load
  const consistentVelocity =
    commitsLastHour >= 1 &&
    avgIntervalMinutes >= 5 &&
    avgIntervalMinutes <= 45 &&
    intervalVarianceMinutes <= 15;
  if (consistentVelocity && !isOverloaded) {
    const confidence = Math.min(95, 70 + commitsLastHour * 2 - Math.round(intervalVarianceMinutes));
    return { state: 'In Flow', confidence: Math.max(70, Math.round(confidence)) };
  }

  // Default: mild activity, not enough signal -> treat as Idle/Recharge
  return { state: 'Idle', confidence: 55 };
}

export function computeFrustrationScore(openIssues: number, intervalVarianceMinutes: number, smallCommitRatio: number): number {
  const score = openIssues * 0.6 + intervalVarianceMinutes * 0.15 + smallCommitRatio * 10;
  return Math.round(Math.min(10, Math.max(0, score)) * 10) / 10;
}
