import { useNavigate } from 'react-router-dom';
import { useMeditationStore } from '../../store/useMeditationStore';
import { mockMeditations } from '../../lib/mockData';

/** Floating action button - starts a 2-minute Quick Breathe from any screen (US-004). */
export default function FAB() {
  const start = useMeditationStore((s) => s.start);
  const navigate = useNavigate();

  const handleStart = () => {
    const quickBreathe = mockMeditations.find((m) => m.title === 'Quick Breathe') ?? mockMeditations[1];
    start(quickBreathe);
    navigate('/meditations');
  };

  return (
    <button
      type="button"
      onClick={handleStart}
      aria-label="Start 2 minute Quick Breathe session"
      className="fixed bottom-20 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-2xl text-on-primary shadow-lg transition-transform hover:scale-105 active:scale-95"
    >
      <span aria-hidden="true">🌬️</span>
    </button>
  );
}
