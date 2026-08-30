# Stitch Prompt — "Ideas App" UI Redesign

Copy everything below the line into Google Stitch, then export the result
(DESIGN.md + HTML + screenshots) and bring it back to the app.

---

Design a modern desktop web application called **Ideas App** — a tool that takes a
one-line app idea and turns it into a complete, ready-to-build package: AI-generated
app ideas → Google Stitch design prompts → full product documentation → export packs
for AI coding tools (Cursor, VS Code, Bolt, v0).

## Visual style (must follow exactly)

- Warm, editorial, sophisticated look. Light theme.
- Background: warm cream (near #F7F5F2). Cards: same cream with soft borders.
- Primary color: deep maroon/wine red (oklch 0.465 0.147 24.9 ≈ #9C3B32) for main
  buttons and active states. Primary button text: white.
- Secondary color: warm amber/ochre (≈ #C98A2B tones) for secondary buttons, badges,
  and highlights.
- Danger: deep red for errors. Success states use the maroon/amber family — no green.
- Typography: **Poppins** for everything (UI, headings). Optional serif accent
  (Libre Baskerville) for the marketing headline. Monospace (IBM Plex Mono) only for
  prompts and markdown document previews.
- Border radius: small (6–10px). Subtle warm shadows (1px offset, low opacity,
  brownish shadow color), never harsh drop shadows.
- Flat, calm, generous whitespace. No gradients, no glassmorphism, no neon.

## Layout & structure (the redesign focus)

- **Sticky top navigation bar**: left — a lightbulb logo mark + "Ideas App" wordmark;
  center — the 4-step pipeline as a horizontal stepper: 1 Ideas → 2 Design → 3 Docs
  → 4 Export, with the current step highlighted in maroon and completed steps shown
  with a small check; right — a dark-mode toggle (sun/moon icon button).
- Every page has a clear single-column content area (max-width ~1100px) with a page
  title, a short subtitle, then the page's main content. Breadcrumb back-links above
  the title ("← Back to ideas").

## Screen 1 — Home: Generate & Approve Ideas

- Hero section: large serif headline "Turn your idea into a buildable app", one-line
  subtext, and a small "powered by AI + live trends" badge.
- "Generate ideas" card: a category dropdown (SaaS, Mobile App, AI Tool, Developer
  Tool, Marketplace, Social, Productivity, Other), a preferences textarea with
  placeholder text, and one large maroon "Generate Idea ⚡" button spanning the card
  width.
- Below: a row of 3 idea cards in a grid. Each card: idea title, 3-line pitch, a
  "Key features" list with maroon bullet dots, small "Audience" and "Monetization"
  rows in muted text, and a status badge. Draft cards show a maroon "I Like This!"
  button; approved cards show a small amber "Approved ✓" badge and three equal
  buttons in a row: "Stitch Prompt 🎨" (maroon), "Docs 📄" (outline),
  "Export 🤖" (amber).
- While generating, show 3 skeleton cards with a shimmering pulse animation.

## Screen 2 — Stitch Prompt page

- Header: "🎨 Stitch Prompt Generator" centered, subtitle explaining the copy-paste
  flow into Google Stitch.
- Main prompt card: a header row with "Your Stitch prompt" label on the left and a
  maroon "Copy prompt 📋" button on the right; below it, a monospace prompt block on
  a slightly darker warm background with soft rounded corners.
- Action row: amber "Open Google Stitch ↗" button and an outline "Regenerate 🔄"
  button.
- Below: a 2-column grid of 6 small definition cards — App Type, Platform, Color
  Scheme, Style, Screens (numbered list), Components (bulleted list) — each with a
  small maroon uppercase label.

## Screen 3 — Documentation page

- Header: "📄 Documentation Generator" with the approved idea title shown in a
  chip/badge.
- Progress card at top: "3/11 documents generated" text on the left, a maroon
  "Generate all docs ⚡" button on the right, and a thin rounded progress bar that
  fills in maroon. While running, the button label shows the current file
  ("Generating PRD.md (2/11)…").
- Upload card: "2. Upload Stitch Exports" with a large dashed-border dropzone
  (drag & drop area with an upload icon, turns amber on hover/drag), accepted file
  types as small muted text (.md · .html · screenshots), and a list of uploaded
  files as rows with a file-type badge on the right.
- Documents section: 11 small tab/chip buttons in a wrapping row (PRD.md, BRD.md,
  TECHNICAL_SPEC.md, USER_STORIES.md, WORKFLOW.md, DATABASE_SCHEMA.md, API_SPEC.md,
  DESIGN_SYSTEM.md, FOLDER_STRUCTURE.md, RULES.md, MASTER_PROMPT.md). Generated
  chips have a cream background with a ✓; the active chip is maroon with white text;
  ungenerated chips are muted.
- Document viewer: a card with a header (file name + title, and a "Copy 📋" button
  that turns into "Copied! ✅") and a scrollable monospace markdown preview area
  with a max height.

## Screen 4 — Export page

- Header: "🤖 Export for AI Coding Tools".
- Grid of 8 tool cards (Cursor, Claude Code, VS Code, Copilot, Windsurf, Bolt.new,
  Lovable, v0): each card shows an emoji/icon, tool name, one-line description, and
  a selected state with a maroon border + soft maroon tint background.
- Under the selected card: a short "How to use" instruction panel.
- Action row: large maroon "Download pack 📦" button and an outline
  "Save to folder 📁" button side by side, with a small muted caption about browser
  support.

## Dark mode variant

Provide a dark variant of each screen: warm dark brown background (not pure black),
slightly lighter card surfaces, maroon primary brightened for contrast, amber
accents kept, muted text in warm grey.
