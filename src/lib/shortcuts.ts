"use client";

import { useEffect, useRef } from "react";

/** Global event names. */
export const ESCAPE_EVENT = "tt:escape";
export const ONBOARD_EVENT = "tt:show-onboarding";

/** True when the key event came from something the user is typing in. */
export function isTypingTarget(el: EventTarget | null): boolean {
  const t = el as HTMLElement | null;
  if (!t || typeof t.tagName !== "string") return false;
  const tag = t.tagName.toLowerCase();
  return (
    tag === "input" ||
    tag === "textarea" ||
    tag === "select" ||
    t.isContentEditable === true
  );
}

export type RouteIds = {
  projectId: string | null;
  ideaId: string | null;
};

/**
 * Context-aware ids parsed from the current URL:
 * - /refine/[projectId]?idea=[ideaId] and /stitch/[projectId]?idea=[ideaId]
 * - /docs/[ideaId] and /export/[ideaId]
 */
export function currentRouteIds(): RouteIds {
  const pathname = window.location.pathname;
  const search = new URLSearchParams(window.location.search);
  const step = pathname.match(/^\/(refine|stitch)\/([^/?#]+)/);
  const doc = pathname.match(/^\/(docs|export)\/([^/?#]+)/);
  return {
    projectId: step?.[2] ?? null,
    ideaId: search.get("idea") ?? doc?.[2] ?? null,
  };
}

export type ShortcutDef = { keys: string; label: string };

export const SHORTCUT_LIST: ShortcutDef[] = [
  { keys: "?", label: "Show this shortcut help" },
  { keys: "g then d", label: "Go to Docs for the current idea" },
  { keys: "g then e", label: "Go to Export for the current idea" },
  { keys: "g then h", label: "Go to History" },
  { keys: "g then r", label: "Go to Refine for the current project" },
  { keys: "Esc", label: "Close any open panel, dialog, or menu" },
  { keys: "Enter", label: "Send message (Refine chat) — Shift+Enter for a new line" },
];

/**
 * Run `cb` whenever the global Escape cascade fires. The shortcut provider
 * dispatches ESCAPE_EVENT on every Escape keypress so each page can close
 * its own drawers/sheets/dropdowns/modals without knowing about each other.
 */
export function useEscapeClose(cb: () => void): void {
  const ref = useRef(cb);
  ref.current = cb;
  useEffect(() => {
    const handler = () => ref.current();
    window.addEventListener(ESCAPE_EVENT, handler);
    return () => window.removeEventListener(ESCAPE_EVENT, handler);
  }, []);
}
