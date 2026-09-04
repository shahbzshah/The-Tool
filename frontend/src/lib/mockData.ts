// Local mock data for demo mode (backend unreachable)
import type {
  IDashboard, IFlowTracker, IMeditation, IStreaks, IMoodCheckIn,
  ISentiments, IWeeklyScore, ISettings
} from './types';

export const mockDashboard: IDashboard = {
  flow_status: 'In Flow',
  flow_percentage: 88,
  mindfulness_score: 88,
  zen_streak: 5,
  last_meditation: new Date(Date.now() - 3 * 3600 * 1000).toISOString(),
  next_suggestion: 'Take a 2-minute breath break in 15 minutes'
};

const hours = 24;
export function mockFlowTracker(_range = '7days'): IFlowTracker {
  const data = Array.from({ length: hours }, (_, i) => {
    const t = new Date(Date.now() - (hours - 1 - i) * 3600 * 1000);
    const wave = Math.sin(i / 3) * 12 + 18;
    const velocity = Math.max(2, Math.round(wave + (i % 5) * 2));
    const frustration = Math.max(0, Math.round(Math.cos(i / 4) * 3 + 2));
    return {
      timestamp: t.toISOString(),
      velocity,
      frustration,
      commits: Math.round(velocity / 6),
      issues_opened: i % 7 === 0 ? 1 : 0,
      flow_state: velocity > 25 ? 'High Flow' : velocity > 12 ? 'In Flow' : frustration > 4 ? 'Stressed' : 'Idle'
    };
  });
  return {
    data,
    summary: {
      avg_velocity: data.reduce((s, p) => s + p.velocity, 0) / data.length,
      peak_frustration: Math.max(...data.map((p) => p.frustration)),
      total_commits: data.reduce((s, p) => s + p.commits, 0),
      optimal_blocks: data.filter((p) => p.flow_state === 'High Flow').length
    }
  };
}

export const mockMeditations: IMeditation[] = [
  { id: 'med_001', title: 'Build Break Zen', durationSeconds: 60, type: 'breathwork', description: 'A 60-second reset to clear friction between builds.', recommendedFor: ['friction', 'overload'] },
  { id: 'med_002', title: 'Quick Breathe', durationSeconds: 120, type: 'breathwork', description: 'Two minutes of guided box breathing to lower stress.', recommendedFor: ['stress', 'overload'] },
  { id: 'med_003', title: 'Deep Rhythm Reset', durationSeconds: 300, type: 'meditation', description: 'Five-minute body scan for drained, low-energy periods.', recommendedFor: ['drained', 'idle'] },
  { id: 'med_004', title: "Engineer's Contemplative Toolkit", durationSeconds: 120, type: 'meditation', description: 'Micro-reflection prompts between coding sessions.', recommendedFor: ['focus', 'planning'] }
];

export const mockStreaks: IStreaks = {
  current_streak: 5,
  longest_streak: 8,
  last_session_date: new Date().toISOString(),
  recent_sessions: Array.from({ length: 6 }, (_, i) => ({
    id: `s-${i}`,
    title: ['Quick Breathe', 'Build Break Zen', 'Deep Rhythm Reset'][i % 3],
    type: i % 3 === 2 ? 'meditation' : 'breathwork',
    duration_seconds: [120, 60, 300][i % 3],
    completion_status: i === 4 ? 'partial' : 'completed',
    started_at: new Date(Date.now() - (i + 1) * 20 * 3600 * 1000).toISOString()
  }))
};

export const mockCheckIns: IMoodCheckIn[] = ['Laser', 'Calm', 'Drained', 'Friction', 'Calm'].map((tag, i) => ({
  id: `c-${i}`,
  tag,
  source: 'manual',
  note: null,
  timestamp: new Date(Date.now() - i * 24 * 3600 * 1000).toISOString()
}));

export const mockSentiments: ISentiments = {
  commits: [
    { commit_hash: 'a1b2c3d', message: 'feat(dashboard): add flow status card', sentiment_tag: 'Positive', committed_at: new Date(Date.now() - 2 * 3600 * 1000).toISOString() },
    { commit_hash: 'e4f5a6b', message: 'ugh revert broken chart dependency', sentiment_tag: 'Stress Signals', committed_at: new Date(Date.now() - 5 * 3600 * 1000).toISOString() },
    { commit_hash: 'c7d8e9f', message: 'refactor(flow-detector): extract pure functions', sentiment_tag: 'Deep Focus', committed_at: new Date(Date.now() - 9 * 3600 * 1000).toISOString() },
    { commit_hash: '0a1b2c3', message: 'test(mood): add sentiment analyzer coverage', sentiment_tag: 'Deep Focus', committed_at: new Date(Date.now() - 26 * 3600 * 1000).toISOString() }
  ],
  summary: { Positive: 1, 'Stress Signals': 1, 'Deep Focus': 2, Neutral: 0 }
};

export const mockScores: IWeeklyScore[] = [
  { week_start_date: '2026-08-10', score: 62, velocity_ratio: 0.8 },
  { week_start_date: '2026-08-17', score: 71, velocity_ratio: 0.9 },
  { week_start_date: '2026-08-24', score: 80, velocity_ratio: 1.0 },
  { week_start_date: '2026-08-31', score: 89, velocity_ratio: 1.1 }
];

export const mockSettings: ISettings = {
  settings: { ide_sync_enabled: true, notifications_on: true, preferred_theme: 'dark', language: 'en' },
  integrations: [
    { provider: 'github', is_active: true },
    { provider: 'gitlab', is_active: false }
  ]
};
