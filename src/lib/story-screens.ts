/**
 * Derive the screens a design MUST contain from the project's user
 * stories. The Aether pack shipped without sign-up, login, or edit screens
 * because the design prompt only knew the feature list — features describe
 * capabilities, stories describe flows, and flows are what need screens.
 *
 * Pure functions: the stitch-prompt route feeds them the USER_STORIES
 * document content and gets back the required screen list.
 */

/** Extract story titles from a USER_STORIES document. */
export function parseStoryTitles(content: string): string[] {
  const titles: string[] = [];
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const m = trimmed.match(/^#{1,4}\s*(?:user\s+)?story\s*\d+\s*[:\-–—]?\s*(.+)$/i);
    if (m) {
      titles.push(m[1].replace(/[#*_`]/g, "").trim());
      continue;
    }
    const m2 = trimmed.match(/^(?:user\s+)?story\s*\d+\s*[:\-–—]\s*(.+)$/i);
    if (m2) titles.push(m2[1].replace(/[#*_`]/g, "").trim());
  }
  return titles.slice(0, 20);
}

type Rule = { re: RegExp; screen: (m: RegExpMatchArray) => string };

const OBJECT_WORDS = ["event", "task", "reminder", "schedule", "note", "goal", "habit"];

function objectOf(title: string): string | null {
  const lower = title.toLowerCase();
  for (const w of OBJECT_WORDS) {
    if (lower.includes(w)) return w[0].toUpperCase() + w.slice(1);
  }
  return null;
}

const RULES: Rule[] = [
  { re: /sign\s*up|register|create (an? )?account/i, screen: () => "Sign Up" },
  { re: /log\s*in|login|sign\s*in/i, screen: () => "Log In" },
  { re: /onboard|first run|get started|welcome/i, screen: () => "Onboarding" },
  {
    re: /create (an? )?(event|task|reminder|schedule|note|goal|habit)/i,
    screen: (m) => `Create ${m[2][0].toUpperCase() + m[2].slice(1)}`,
  },
  {
    re: /\bcreate\b/i,
    screen: (m) => {
      const obj = objectOf(m.input ?? "");
      return obj ? `Create ${obj}` : "Create";
    },
  },
  {
    re: /\bedit\b/i,
    screen: (m) => {
      const obj = objectOf(m.input ?? "");
      return obj ? `${obj} Details` : "Details";
    },
  },
  {
    re: /\bdelete\b|\bremove\b/i,
    screen: (m) => {
      const obj = objectOf(m.input ?? "");
      return obj ? `${obj} Details` : "Details";
    },
  },
  { re: /voice|assistant|speak|hands-free|dictat/i, screen: () => "Voice Assistant" },
  // Settings/sync flows before the noun rules: "customize notification
  // settings" is a Settings screen, not a Task List; "integrate with Google
  // Calendar" is a setup flow, not the Calendar itself.
  { re: /setting|customiz|preference/i, screen: () => "Settings" },
  { re: /integrat|sync|connect.*calendar|google calendar/i, screen: () => "Calendar Setup" },
  { re: /reminder/i, screen: () => "Reminders" },
  { re: /\btask/i, screen: () => "Task List" },
  { re: /calendar|schedule/i, screen: () => "Calendar" },
  { re: /dashboard|home screen|overview/i, screen: () => "Dashboard" },
  { re: /notification/i, screen: () => "Settings" },
  { re: /profile|account/i, screen: () => "Profile" },
  { re: /history|past|archive/i, screen: () => "History" },
  { re: /search|browse|discover/i, screen: () => "Search" },
];

/** Map story titles to the screens each one requires. Deduped, capped. */
export function requiredScreensFromStories(titles: string[]): string[] {
  const screens: string[] = [];
  for (const title of titles) {
    for (const rule of RULES) {
      const m = title.match(rule.re);
      if (m) {
        const screen = rule.screen(m);
        if (!screens.includes(screen)) screens.push(screen);
        break;
      }
    }
  }
  return screens.slice(0, 12);
}
