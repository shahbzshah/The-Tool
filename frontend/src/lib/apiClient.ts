// API client for the CodeZen Flow backend.
// Falls back to local mock data when the backend is unreachable (dev/demo mode).
import type {
  IDashboard, IFlowTracker, IMeditation, IStreaks, IMoodCheckIn,
  ISentiments, IWeeklyScore, ISettings
} from './types';
import {
  mockDashboard, mockFlowTracker, mockMeditations, mockStreaks,
  mockCheckIns, mockSentiments, mockScores, mockSettings
} from './mockData';

const BASE = (import.meta.env.VITE_API_URL as string | undefined) || '/api/v1';

function getToken(): string | null {
  return localStorage.getItem('cz_token');
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(init?.headers as object) };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error?.message || `Request failed: ${res.status}`);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

/** Runs the live call; on network failure falls back to demo data. */
async function withFallback<T>(live: () => Promise<T>, mock: T | (() => T)): Promise<T> {
  try {
    return await live();
  } catch (err) {
    if (err instanceof TypeError) {
      console.warn('[CodeZen Flow] Backend unreachable - using mock data (demo mode).');
      return typeof mock === 'function' ? (mock as () => T)() : mock;
    }
    throw err;
  }
}

// Demo-mode JWT (works with the backend's mock OAuth endpoint)
export async function login(): Promise<void> {
  try {
    const res = await request<{ access_token: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ provider: 'github', code: 'demo-code' })
    });
    localStorage.setItem('cz_token', res.access_token);
  } catch {
    localStorage.setItem('cz_token', 'demo-mode');
  }
}

export const api = {
  dashboard: () => withFallback(() => request<IDashboard>('/dashboard'), mockDashboard),
  flowTracker: (range = '7days') => withFallback(() => request<IFlowTracker>(`/flow/tracker?range=${range}`), () => mockFlowTracker(range)),
  meditations: () => withFallback(() => request<{ sessions: IMeditation[] }>('/meditations'), () => ({ sessions: mockMeditations })),
  startMeditation: (id: string) => request(`/meditations/${id}/start`, { method: 'POST' }),
  streaks: () => withFallback(() => request<IStreaks>('/streaks'), mockStreaks),
  checkIns: () => withFallback(() => request<{ check_ins: IMoodCheckIn[] }>('/mood/checkins'), () => ({ check_ins: mockCheckIns })),
  addCheckIn: (tag: string) =>
    withFallback(
      () => request('/mood/checkins', { method: 'POST', body: JSON.stringify({ tag }) }),
      () => ({ check_in: { id: `local-${Date.now()}`, tag, timestamp: new Date().toISOString() } })
    ),
  sentiments: () => withFallback(() => request<ISentiments>('/mood/sentiments'), mockSentiments),
  weeklyScores: () => withFallback(() => request<{ scores: IWeeklyScore[] }>('/score/weekly'), () => ({ scores: mockScores })),
  settings: () => withFallback(() => request<ISettings>('/settings'), mockSettings),
  updateSettings: (patch: Record<string, unknown>) =>
    request('/settings', { method: 'PATCH', body: JSON.stringify(patch) })
};
