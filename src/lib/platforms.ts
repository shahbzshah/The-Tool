/**
 * App platform: native mobile (Android + iOS) or web application.
 * Stored on Project.platform ("mobile" | "web" | null — null means the AI
 * decides, the historical default). The platform switch on the Design
 * page flips a project between the two; nothing is deleted by switching,
 * but the Stitch prompt and the docs were made for the old platform and
 * need regenerating for the new one.
 */

export type AppPlatform = "mobile" | "web";

export const PLATFORM_LABELS: Record<AppPlatform, string> = {
  mobile: "Android + iOS native",
  web: "Web application",
};

/**
 * Canonical stack-lock text per platform. Supabase stays the backend on
 * BOTH — only the client changes. (The "Next.js full-stack" preset in the
 * stack-lock panel is the Neon/NextAuth variant; the web switch uses this
 * Supabase variant so the lock agrees with the locked decisions instead
 * of fighting them.)
 */
export const PLATFORM_STACKS: Record<AppPlatform, string> = {
  mobile:
    "React Native + Expo (TypeScript) + Expo Router. Supabase (Postgres + Auth + Storage). Zustand for state. Tailwind via NativeWind. EAS Build for distribution.",
  web: "Next.js 14 (App Router) + TypeScript + Tailwind CSS. Supabase (Postgres + Auth + Storage). API via Next.js route handlers. State: React hooks (no Redux). Deployed on Vercel.",
};

/**
 * The locked decisions that are platform-determined. The switch only
 * touches these two keys — database, backend, auth, speech and sync stay
 * exactly as they are, so switching is reversible with no surprises.
 */
export const PLATFORM_DECISIONS: Record<
  AppPlatform,
  { frontend: string; hosting: string }
> = {
  mobile: { frontend: "React Native + Expo", hosting: "EAS" },
  web: { frontend: "Next.js", hosting: "Vercel" },
};
