import { Link } from 'react-router-dom';

export default function Navbar() {
  return (
    <header className="border-b border-outline-variant bg-surface-low">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <Link to="/" className="flex items-center gap-2" aria-label="CodeZen Flow home">
          <span aria-hidden="true" className="text-xl">🧘</span>
          <span className="font-semibold text-primary">CodeZen Flow</span>
        </Link>
        <span className="font-mono text-xs text-on-surface-variant">mindfulness meets momentum</span>
      </div>
    </header>
  );
}
