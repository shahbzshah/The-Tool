"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const STEPS = [
  { label: "Hunter", href: "/" },
  { label: "Refine", href: null },
  { label: "Design", href: null },
  { label: "Docs", href: null },
  { label: "Export", href: null },
  { label: "History", href: "/history" },
];

function activeStep(pathname: string): number {
  if (pathname.startsWith("/refine")) return 1;
  if (pathname.startsWith("/stitch")) return 2;
  if (pathname.startsWith("/docs")) return 3;
  if (pathname.startsWith("/export")) return 4;
  if (pathname.startsWith("/history")) return 5;
  return 0;
}

export default function AppHeader() {
  const pathname = usePathname();
  const [dark, setDark] = useState(false);
  const current = activeStep(pathname);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggleTheme() {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {
      // ignore
    }
    setDark(next);
  }

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background shadow-sm transition-colors">
      <div className="mx-auto flex h-16 w-full max-w-[1200px] items-center justify-between px-4 md:px-16">
        <Link href="/" className="font-serif text-xl font-bold text-primary">
          Ideas App
        </Link>

        <nav className="relative hidden items-center space-x-8 md:flex">
          <div className="absolute left-0 right-0 top-1/2 -z-10 h-px -translate-y-1/2 bg-border" />
          {STEPS.map((step, i) => {
            const isActive = i === current;
            return (
              <Link
                key={step.label}
                href={step.href ?? "/"}
                className={`flex items-center gap-2 bg-background px-2 pb-1 transition-all duration-100 active:scale-95 ${
                  isActive
                    ? "border-b-2 border-primary font-bold text-primary"
                    : "border-b-2 border-transparent text-muted-foreground hover:text-primary"
                }`}
              >
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full font-mono text-xs ${
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {i + 1}
                </span>
                {step.label}
              </Link>
            );
          })}
        </nav>

        <button
          onClick={toggleTheme}
          aria-label="Toggle dark mode"
          className="p-2 text-primary transition-opacity hover:opacity-80 active:scale-95"
        >
          {dark ? "☀️" : "🌙"}
        </button>
      </div>
    </header>
  );
}
