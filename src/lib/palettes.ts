// Colour palette library for Stitch prompt generation.
//
// The AI used to pick the colour scheme itself and always landed on the
// same "deep slate dark mode" — slate reads as flat ash grey on screen, so
// every app came out the same colour. Now the app picks the palette: 16
// named palettes, every background chromatic (no slate, grey, or ash
// anywhere), matched to the app type by keyword and to dark/light by
// whether the idea asks for dark mode. Selection is deterministic — same
// project always gets the same palette, different projects get different
// ones — so no schema change or stored field is needed.

export type PaletteMode = "dark" | "light";

export type Palette = {
  id: string;
  name: string;
  mode: PaletteMode;
  background: string;
  surface: string;
  primary: string;
  secondary: string;
  accent: string;
  ink: string;
  // App-type keywords this palette fits (matched against title + pitch +
  // feature text, lowercased). Keep them single words or short phrases.
  fits: string[];
};

export const PALETTES: Palette[] = [
  // ---- Dark palettes ----
  {
    id: "midnight-emerald",
    name: "Midnight Emerald",
    mode: "dark",
    background: "#06231B",
    surface: "#0B3527",
    primary: "#10B981",
    secondary: "#F59E0B",
    accent: "#34D399",
    ink: "#E7F5EE",
    fits: ["finance", "trading", "money", "invest", "bank", "stock", "crypto", "journal", "budget"],
  },
  {
    id: "deep-ocean",
    name: "Deep Ocean",
    mode: "dark",
    background: "#0A1B33",
    surface: "#10294A",
    primary: "#38BDF8",
    secondary: "#F97316",
    accent: "#7DD3FC",
    ink: "#E8F1FA",
    fits: ["travel", "weather", "ocean", "sea", "fish", "logistic", "delivery", "transport", "booking"],
  },
  {
    id: "royal-plum",
    name: "Royal Plum",
    mode: "dark",
    background: "#241233",
    surface: "#33194A",
    primary: "#C084FC",
    secondary: "#F472B6",
    accent: "#E9D5FF",
    ink: "#F5EEFB",
    fits: ["music", "photo", "art", "fashion", "beauty", "creative", "social", "video"],
  },
  {
    id: "forest-teal",
    name: "Forest Teal",
    mode: "dark",
    background: "#04292B",
    surface: "#0A3A3D",
    primary: "#2DD4BF",
    secondary: "#FBBF24",
    accent: "#5EEAD4",
    ink: "#E6F7F4",
    fits: ["health", "fitness", "meditation", "wellness", "sleep", "habit", "workout", "mind"],
  },
  {
    id: "ember-night",
    name: "Ember Night",
    mode: "dark",
    background: "#2B1608",
    surface: "#3D2110",
    primary: "#FB923C",
    secondary: "#FACC15",
    accent: "#FDBA74",
    ink: "#FDF3E7",
    fits: ["food", "recipe", "cook", "restaurant", "coffee", "bakery", "meal"],
  },
  {
    id: "midnight-rose",
    name: "Midnight Rose",
    mode: "dark",
    background: "#2B0A14",
    surface: "#3D1220",
    primary: "#FB7185",
    secondary: "#FDA4AF",
    accent: "#FECDD3",
    ink: "#FDF0F2",
    fits: ["dating", "love", "romance", "wedding", "gift", "flower"],
  },
  {
    id: "electric-indigo",
    name: "Electric Indigo",
    mode: "dark",
    background: "#141233",
    surface: "#1E1B4B",
    primary: "#818CF8",
    secondary: "#22D3EE",
    accent: "#A5B4FC",
    ink: "#EEF0FE",
    fits: ["productivity", "note", "task", "calendar", "education", "study", "kid", "learn", "school"],
  },
  {
    id: "jungle-lime",
    name: "Jungle Lime",
    mode: "dark",
    background: "#16210A",
    surface: "#22330F",
    primary: "#A3E635",
    secondary: "#FDE047",
    accent: "#D9F99D",
    ink: "#F2F8E6",
    fits: ["farm", "garden", "nature", "environment", "sport", "outdoor", "pet", "animal"],
  },
  // ---- Light palettes ----
  {
    id: "warm-paper",
    name: "Warm Paper",
    mode: "light",
    background: "#FDF8F1",
    surface: "#FFFFFF",
    primary: "#C84528",
    secondary: "#2E7D32",
    accent: "#D97706",
    ink: "#1C1B19",
    fits: ["news", "read", "blog", "journal", "note", "productivity", "task"],
  },
  {
    id: "mint-fresh",
    name: "Mint Fresh",
    mode: "light",
    background: "#EFFAF3",
    surface: "#FFFFFF",
    primary: "#059669",
    secondary: "#0EA5E9",
    accent: "#34D399",
    ink: "#0F2A1E",
    fits: ["health", "fitness", "habit", "wellness", "meditation", "workout", "sleep"],
  },
  {
    id: "sky-day",
    name: "Sky Day",
    mode: "light",
    background: "#EFF6FF",
    surface: "#FFFFFF",
    primary: "#2563EB",
    secondary: "#F97316",
    accent: "#60A5FA",
    ink: "#0F2440",
    fits: ["travel", "weather", "booking", "transport", "logistic", "delivery"],
  },
  {
    id: "lavender-mist",
    name: "Lavender Mist",
    mode: "light",
    background: "#F5F0FD",
    surface: "#FFFFFF",
    primary: "#7C3AED",
    secondary: "#EC4899",
    accent: "#A78BFA",
    ink: "#241A3A",
    fits: ["music", "photo", "art", "beauty", "fashion", "creative", "social"],
  },
  {
    id: "peach-glow",
    name: "Peach Glow",
    mode: "light",
    background: "#FFF4EC",
    surface: "#FFFFFF",
    primary: "#EA580C",
    secondary: "#DB2777",
    accent: "#FB923C",
    ink: "#2B1A10",
    fits: ["food", "recipe", "cook", "restaurant", "shop", "market", "meal"],
  },
  {
    id: "butter-light",
    name: "Butter Light",
    mode: "light",
    background: "#FFFBEB",
    surface: "#FFFFFF",
    primary: "#B45309",
    secondary: "#059669",
    accent: "#FBBF24",
    ink: "#2B2110",
    fits: ["education", "kid", "learn", "study", "school", "finance", "money", "budget"],
  },
  {
    id: "rose-blush",
    name: "Rose Blush",
    mode: "light",
    background: "#FFF1F2",
    surface: "#FFFFFF",
    primary: "#E11D48",
    secondary: "#7C3AED",
    accent: "#FDA4AF",
    ink: "#2B1016",
    fits: ["dating", "love", "romance", "wedding", "gift", "social"],
  },
  {
    id: "aqua-breeze",
    name: "Aqua Breeze",
    mode: "light",
    background: "#ECFEFF",
    surface: "#FFFFFF",
    primary: "#0891B2",
    secondary: "#059669",
    accent: "#22D3EE",
    ink: "#0A2530",
    fits: ["sport", "outdoor", "pet", "nature", "farm", "environment", "water"],
  },
];

// Small deterministic hash (djb2) — only used to break ties and to spread
// no-keyword-match projects across the pool, never for anything security
// related.
function hashString(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  }
  return h;
}

export type PaletteInput = {
  projectId: string;
  title: string;
  pitch: string;
  features: string[];
};

// Pick the palette for a project. Dark mode comes from the idea itself
// (a "dark mode" feature or mention in the pitch); the palette inside that
// mode is scored by app-type keywords, with the project id breaking ties
// so two finance apps still don't land on the same palette every time.
export function pickPalette(input: PaletteInput): Palette {
  const text = `${input.title} ${input.pitch} ${input.features.join(" ")}`.toLowerCase();
  const wantsDark = /dark mode/i.test(text);
  const pool = PALETTES.filter((p) => p.mode === (wantsDark ? "dark" : "light"));
  const scored = pool.map((p) => ({
    palette: p,
    score: p.fits.reduce((n, kw) => (text.includes(kw) ? n + 1 : n), 0),
  }));
  const best = Math.max(...scored.map((s) => s.score));
  const winners = scored.filter((s) => s.score === best).map((s) => s.palette);
  // No keyword match (best === 0) or a tie: spread by project id hash so
  // the choice is stable per project but varied across projects.
  return winners[hashString(input.projectId) % winners.length];
}

// One-line description used as the stored colorScheme and in the prompt.
export function describePalette(p: Palette): string {
  return `${p.name} (${p.mode}) — background ${p.background}, surface ${p.surface}, primary ${p.primary}, secondary ${p.secondary}, accent ${p.accent}, text ${p.ink}`;
}
