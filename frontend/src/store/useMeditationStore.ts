import { create } from 'zustand';
import type { IMeditation } from '../lib/types';

interface IMeditationStore {
  active: IMeditation | null;
  elapsed: number; // seconds
  running: boolean;
  start: (m: IMeditation) => void;
  pause: () => void;
  resume: () => void;
  tick: () => void;
  stop: () => void;
}

export const useMeditationStore = create<IMeditationStore>((set) => ({
  active: null,
  elapsed: 0,
  running: false,
  start: (m) => set({ active: m, elapsed: 0, running: true }),
  pause: () => set({ running: false }),
  resume: () => set({ running: true }),
  tick: () =>
    set((s) => (s.running ? { elapsed: Math.min(s.elapsed + 1, s.active?.durationSeconds ?? 0) } : {})),
  stop: () => set({ active: null, elapsed: 0, running: false })
}));
