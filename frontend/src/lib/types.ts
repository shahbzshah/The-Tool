// Shared API types (mirror backend responses / docs/API_SPEC.md)

export interface IDashboard {
  flow_status: 'In Flow' | 'Stressed' | 'Idle';
  flow_percentage: number;
  mindfulness_score: number | null;
  zen_streak: number;
  last_meditation: string | null;
  next_suggestion: string;
}

export interface IFlowPoint {
  timestamp: string;
  velocity: number;
  frustration: number;
  commits: number;
  issues_opened: number;
  flow_state: string;
}

export interface IFlowTracker {
  data: IFlowPoint[];
  summary: {
    avg_velocity: number;
    peak_frustration: number;
    total_commits: number;
    optimal_blocks: number;
  };
}

export interface IMeditation {
  id: string;
  title: string;
  durationSeconds: number;
  type: string;
  description: string;
  recommendedFor: string[];
}

export interface IStreaks {
  current_streak: number;
  longest_streak: number;
  last_session_date: string | null;
  recent_sessions: {
    id: string;
    title: string;
    type: string;
    duration_seconds: number;
    completion_status: string;
    started_at: string;
  }[];
}

export interface IMoodCheckIn {
  id: string;
  tag: string;
  source: string;
  note: string | null;
  timestamp: string;
}

export interface ISentiments {
  commits: { commit_hash: string; message: string; sentiment_tag: string; committed_at: string }[];
  summary: Record<string, number>;
}

export interface IWeeklyScore {
  week_start_date: string;
  score: number;
  velocity_ratio: number;
}

export interface ISettings {
  settings: {
    ide_sync_enabled: boolean;
    notifications_on: boolean;
    preferred_theme: string;
    language: string;
  };
  integrations: { provider: string; is_active: boolean }[];
}
