import type { Metadata } from "next";
import { Newsreader, Plus_Jakarta_Sans, Space_Mono } from "next/font/google";
import HeaderSwitch from "@/components/HeaderSwitch";
import Onboarding from "@/components/Onboarding";
import ShortcutProvider from "@/components/ShortcutProvider";
import "./globals.css";

const noFlashScript = `(function(){try{if(localStorage.getItem('theme')==='dark'){document.documentElement.classList.add('dark')}}catch(e){}})()`;

const display = Newsreader({
  weight: ["400", "500", "600"],
  subsets: ["latin"],
  variable: "--font-serif",
  display: "swap",
});

const sans = Plus_Jakarta_Sans({
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const mono = Space_Mono({
  weight: ["400", "700"],
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Ideas App — Idea to App Pipeline",
  description:
    "Generate app ideas with AI + trends, create Stitch prompts, and export full documentation for AI coding tools.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${sans.variable} ${display.variable} ${mono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: noFlashScript }} />
      </head>
      <body>
        <HeaderSwitch />
        {children}
        <Onboarding />
        <ShortcutProvider />
      </body>
    </html>
  );
}
