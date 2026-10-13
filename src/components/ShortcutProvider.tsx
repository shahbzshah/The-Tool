"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ESCAPE_EVENT,
  SHORTCUT_LIST,
  currentRouteIds,
  isTypingTarget,
  useEscapeClose,
} from "@/lib/shortcuts";

const G_CHORD_WINDOW_MS = 900;

function ShortcutHelp({ onClose }: { onClose: () => void }) {
  useEscapeClose(onClose);
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
    >
      <div
        className="card-elevated w-full max-w-sm p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-serif text-xl font-medium">Keyboard shortcuts</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground"
          >
            <span className="material-symbols text-[20px]">close</span>
          </button>
        </div>
        <ul className="space-y-2.5">
          {SHORTCUT_LIST.map((s) => (
            <li key={s.keys} className="flex items-center justify-between gap-3">
              <span className="text-sm text-muted-foreground">{s.label}</span>
              <kbd className="shrink-0 rounded border border-border bg-background px-2 py-1 font-mono text-xs text-foreground">
                {s.keys}
              </kbd>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-muted-foreground">
          Shortcuts are ignored while typing in an input or text area.
        </p>
      </div>
    </div>
  );
}

/**
 * Global keyboard shortcuts for the pipeline. Mounted once in the root
 * layout. `?` opens the help overlay; `g` chords jump between stages using
 * the project/idea ids from the current URL where available; Esc closes the
 * help overlay and dispatches ESCAPE_EVENT so each page can close its own
 * drawers/sheets/dropdowns/modals.
 */
export default function ShortcutProvider() {
  const router = useRouter();
  const [helpOpen, setHelpOpen] = useState(false);
  const pendingG = useRef(0);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setHelpOpen(false);
        window.dispatchEvent(new Event(ESCAPE_EVENT));
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;

      if (e.key === "?") {
        e.preventDefault();
        setHelpOpen(true);
        return;
      }
      if (e.key === "g") {
        pendingG.current = Date.now();
        return;
      }
      if (Date.now() - pendingG.current < G_CHORD_WINDOW_MS) {
        pendingG.current = 0;
        const { projectId, ideaId } = currentRouteIds();
        if (e.key === "d" && ideaId) router.push(`/docs/${ideaId}`);
        else if (e.key === "e" && ideaId) router.push(`/export/${ideaId}`);
        else if (e.key === "h") router.push("/history");
        else if (e.key === "r" && projectId && ideaId)
          router.push(`/refine/${projectId}?idea=${ideaId}`);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  return helpOpen ? <ShortcutHelp onClose={() => setHelpOpen(false)} /> : null;
}
