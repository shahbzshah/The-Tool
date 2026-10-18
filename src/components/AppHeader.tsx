"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ONBOARD_EVENT } from "@/lib/shortcuts";

const STEPS = [
  { label: "Hunter", href: "/" },
  { label: "Refine", href: null },
  { label: "Design", href: null },
  { label: "Docs", href: null },
  { label: "Export", href: null },
];

function activeStep(pathname: string): number {
  if (pathname.startsWith("/refine")) return 1;
  if (pathname.startsWith("/stitch")) return 2;
  if (pathname.startsWith("/docs")) return 3;
  if (pathname.startsWith("/export")) return 4;
  if (pathname.startsWith("/history")) return 5;
  return 0;
}

export default function AppHeader({ className = "" }: { className?: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [dark, setDark] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  // Remember the last pipeline page so /settings keeps its highlight
  // instead of jumping back to Hunter.
  useEffect(() => {
    if (pathname !== "/settings") {
      try {
        sessionStorage.setItem("lastAppPath", pathname);
      } catch {
        /* ignore */
      }
    }
  }, [pathname]);
  const effectivePath =
    pathname === "/settings" && typeof window !== "undefined"
      ? sessionStorage.getItem("lastAppPath") || "/"
      : pathname;
  const current = activeStep(effectivePath);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
    (async () => {
      try {
        const res = await fetch("/api/auth/me");
        if (!res.ok) return;
        const data = await res.json();
        if (data.user?.email) setEmail(data.user.email);
      } catch {
        /* not signed in */
      }
    })();
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

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setEmail(null);
    router.push("/login");
    router.refresh();
  }

  return (
    <header className={`sticky top-0 z-40 border-b border-border bg-card-elevated ${className}`}>
      <div className="mx-auto flex w-full max-w-[1580px] items-center justify-between gap-4 px-4 py-2.5 md:px-6">
        <div className="flex min-w-0 items-center gap-8">
          {/* Wordmark */}
          <Link href="/" className="group flex shrink-0 items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded border border-primary bg-primary/10 font-serif text-lg font-bold text-primary">
              I
            </div>
            <div className="flex flex-col">
              <span className="font-serif text-lg font-semibold leading-none tracking-tight text-foreground transition-colors group-hover:text-primary">
                Ideas App
              </span>
              <span className="mt-0.5 font-mono text-[10px] uppercase leading-none tracking-wider text-muted-foreground">
                Telemetry OS
              </span>
            </div>
          </Link>

          {/* Pipeline stepper */}
          <nav className="hidden items-center gap-1.5 text-xs lg:flex" aria-label="Pipeline">
            {STEPS.map((step, i) => {
              const isActive = i === current;
              const isDone = i < current;
              return (
                <span key={step.label} className="flex items-center gap-1.5">
                  {i > 0 && (
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="text-muted-foreground/50"
                      aria-hidden="true"
                    >
                      <path d="m9 18 6-6-6-6" />
                    </svg>
                  )}
                  <span
                    className={`flex items-center gap-1.5 rounded px-2.5 py-1 font-medium ${
                      isActive
                        ? "border border-primary/30 bg-primary/10 font-semibold text-primary"
                        : isDone
                          ? "text-foreground"
                          : "text-muted-foreground"
                    }`}
                  >
                    <span
                      className={`flex h-4 w-4 items-center justify-center rounded-full font-mono text-[10px] ${
                        isActive
                          ? "bg-primary text-primary-foreground"
                          : isDone
                            ? "bg-score-high text-white"
                            : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {isDone ? (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M20 6 9 17l-5-5" />
                        </svg>
                      ) : (
                        i + 1
                      )}
                    </span>
                    {step.label}
                  </span>
                </span>
              );
            })}
            <span className="mx-1 h-4 w-px bg-border" />
            <Link
              href="/history"
              className={`flex items-center gap-1 rounded px-2 py-1 font-medium transition-colors ${
                current === 5 ? "text-primary" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
              </svg>
              <span>History</span>
            </Link>
          </nav>
        </div>

        {/* Right utility controls */}
        <div className="flex shrink-0 items-center gap-2 md:gap-3">
          <button
            onClick={() => window.dispatchEvent(new Event(ONBOARD_EVENT))}
            aria-label="Help and pipeline tour"
            title="Help — take the pipeline tour"
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md border border-transparent text-muted-foreground transition-colors hover:border-border hover:bg-muted hover:text-foreground md:h-9 md:min-h-0 md:w-9 md:min-w-0"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
              <path d="M12 17h.01" />
            </svg>
          </button>
          <button
            onClick={toggleTheme}
            aria-label="Toggle theme"
            title="Toggle theme"
            className="flex h-9 w-9 items-center justify-center rounded-md border border-transparent text-muted-foreground transition-colors hover:border-border hover:bg-muted hover:text-foreground"
          >
            {dark ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2" />
                <path d="M12 20v2" />
                <path d="m4.93 4.93 1.41 1.41" />
                <path d="m17.66 17.66 1.41 1.41" />
                <path d="M2 12h2" />
                <path d="M20 12h2" />
                <path d="m6.34 17.66-1.41 1.41" />
                <path d="m19.07 4.93-1.41 1.41" />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
              </svg>
            )}
          </button>
          <Link
            href="/settings"
            aria-label="Settings"
            title="Settings"
            className="flex h-9 w-9 items-center justify-center rounded-md border border-transparent text-muted-foreground transition-colors hover:border-border hover:bg-muted hover:text-foreground"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </Link>
          {email && (
            <>
              <span className="hidden h-4 w-px bg-border sm:inline" />
              <div className="flex items-center gap-2 text-xs">
                <span className="hidden max-w-[180px] truncate rounded border border-border bg-muted px-2 py-1 font-mono text-muted-foreground md:inline">
                  {email}
                </span>
                <button
                  onClick={logout}
                  className="ml-1 min-h-[44px] font-medium text-muted-foreground transition-colors hover:text-primary md:min-h-0"
                >
                  Sign out
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
