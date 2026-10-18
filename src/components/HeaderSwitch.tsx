"use client";

import { usePathname } from "next/navigation";
import AppHeader from "./AppHeader";

/**
 * On the Hunter home page the compact mobile TopAppBar (in page.tsx) owns
 * small screens, so the full AppHeader only shows there on lg+. Everywhere
 * else AppHeader renders at all sizes as before.
 */
export default function HeaderSwitch() {
  const pathname = usePathname();
  // Public share pages render without auth and without the app chrome.
  if (pathname.startsWith("/share")) return null;
  return <AppHeader className={pathname === "/" ? "hidden lg:block" : ""} />;
}
