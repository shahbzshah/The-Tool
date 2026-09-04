import CalendarWidget from '../components/focus/CalendarWidget';

export default function FocusScheduler() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Focus Time Scheduler</h1>
        <p className="mt-1 text-sm text-on-surface-variant">
          Suggested blocks based on your low-commit history. Google Calendar / Outlook sync coming with integrations.
        </p>
      </div>
      <CalendarWidget />
    </div>
  );
}
