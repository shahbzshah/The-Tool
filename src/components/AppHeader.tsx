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
    <header className="sticky top-0 z-50 border-b border-border bg-background">
      <div className="mx-auto flex h-16 w-full max-w-[1200px] items-center justify-between px-4 md:px-8">
        <Link href="/" className="font-serif text-[1.35rem] font-medium text-foreground">
          Ideas App
        </Link>

        <nav className="relative hidden items-center lg:flex" aria-label="Pipeline">
          <div className="absolute left-6 right-6 top-1/2 -z-10 h-px -translate-y-1/2 bg-border" />
          {STEPS.map((step, i) => {
            const isActive = i === current;
            const isDone = i < current;
            const href = step.href ?? "/";
            return (
              <Link
                key={step.label}
                href={href}
                className={`flex items-center gap-2 bg-background px-3 py-1 text-sm transition-colors ${
                  isActive
                    ? "font-semibold text-primary"
                    : isDone
                      ? "text-foreground hover:text-primary"
                      : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <span
                  className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : isDone
                        ? "bg-score-high text-white"
                        : "border border-border bg-background text-muted-foreground"
                  }`}
                >
                  {isDone ? (
                    <span className="material-symbols text-[16px]">check</span>
                  ) : (
                    <span className="font-mono">{i + 1}</span>
                  )}
                </span>
                {step.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          <Link
            href="/settings"
            aria-label="Settings"
            className="flex h-9 w-9 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <span className="material-symbols text-[20px]">settings</span>
          </Link>
          <button
            onClick={toggleTheme}
            aria-label="Toggle dark mode"
            className="flex h-9 w-9 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <span className="material-symbols text-[20px]">
              {dark ? "light_mode" : "dark_mode"}
            </span>
          </button>
        </div>
      </div>
    </header>
  );
}
