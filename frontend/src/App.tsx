import { useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';
import Navbar from './components/layout/Navbar';
import BottomNav from './components/layout/BottomNav';
import FAB from './components/meditations/FAB';
import BreathingGuide from './components/meditations/BreathingGuide';
import Dashboard from './pages/Dashboard';
import FlowTracker from './pages/FlowTracker';
import Meditations from './pages/Meditations';
import Streaks from './pages/Streaks';
import MoodCheckin from './pages/MoodCheckin';
import FocusScheduler from './pages/FocusScheduler';
import Score from './pages/Score';
import Settings from './pages/Settings';
import { login } from './lib/apiClient';
import { useMeditationStore } from './store/useMeditationStore';

export default function App() {
  const active = useMeditationStore((s) => s.active);
  const tick = useMeditationStore((s) => s.tick);

  useEffect(() => {
    void login();
  }, []);

  useEffect(() => {
    if (!active) return;
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [active, tick]);

  return (
    <div className="min-h-screen pb-24">
      <Navbar />
      <main className="mx-auto max-w-5xl px-4 py-6">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/flow-tracker" element={<FlowTracker />} />
          <Route path="/meditations" element={<Meditations />} />
          <Route path="/streaks" element={<Streaks />} />
          <Route path="/mood" element={<MoodCheckin />} />
          <Route path="/focus" element={<FocusScheduler />} />
          <Route path="/score" element={<Score />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
      <FAB />
      <BottomNav />
      {active && <BreathingGuide />}
    </div>
  );
}
