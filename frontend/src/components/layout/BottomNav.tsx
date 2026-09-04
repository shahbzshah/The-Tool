import { NavLink } from 'react-router-dom';

const ITEMS = [
  { to: '/', label: 'Home', icon: '🏠' },
  { to: '/flow-tracker', label: 'Flow', icon: '📈' },
  { to: '/meditations', label: 'Meditate', icon: '🧘' },
  { to: '/mood', label: 'Mood', icon: '💬' },
  { to: '/settings', label: 'Settings', icon: '⚙️' }
];

export default function BottomNav() {
  return (
    <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-40 border-t border-outline-variant bg-surface-low">
      <div className="mx-auto flex max-w-5xl items-stretch justify-around">
        {ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center gap-0.5 py-2 text-xs transition-colors ${
                isActive ? 'text-primary' : 'text-on-surface-variant hover:text-on-surface'
              }`
            }
          >
            <span aria-hidden="true" className="text-lg">{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
