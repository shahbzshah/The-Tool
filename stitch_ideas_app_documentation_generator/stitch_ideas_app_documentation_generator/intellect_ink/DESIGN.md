> **SUPERSEDED (Oct 10, 2026)** — This spec is for the old "Intellect & Ink" docs-generator mockups.
> The current design authority is the **Crafted Editorial** system (Newsreader / Plus Jakarta Sans / Space Mono),
> implemented Oct 12 from the Stitch redesign export. See commit cc94837.

---
name: Intellect & Ink
colors:
  surface: '#fbf9f6'
  surface-dim: '#dbdad7'
  surface-bright: '#fbf9f6'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f5f3f0'
  surface-container: '#efeeeb'
  surface-container-high: '#eae8e5'
  surface-container-highest: '#e4e2df'
  on-surface: '#1b1c1a'
  on-surface-variant: '#56423f'
  inverse-surface: '#30312f'
  inverse-on-surface: '#f2f0ed'
  outline: '#89726e'
  outline-variant: '#ddc0bc'
  surface-tint: '#a03e35'
  primary: '#7d241d'
  on-primary: '#ffffff'
  primary-container: '#9c3b32'
  on-primary-container: '#ffc6be'
  inverse-primary: '#ffb4aa'
  secondary: '#845400'
  on-secondary: '#ffffff'
  secondary-container: '#fcb654'
  on-secondary-container: '#714800'
  tertiary: '#004d46'
  on-tertiary: '#ffffff'
  tertiary-container: '#00675e'
  on-tertiary-container: '#93e2d6'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#ffdad5'
  primary-fixed-dim: '#ffb4aa'
  on-primary-fixed: '#410001'
  on-primary-fixed-variant: '#812720'
  secondary-fixed: '#ffddb5'
  secondary-fixed-dim: '#ffb958'
  on-secondary-fixed: '#2a1800'
  on-secondary-fixed-variant: '#643f00'
  tertiary-fixed: '#a1f1e5'
  tertiary-fixed-dim: '#85d5c9'
  on-tertiary-fixed: '#00201d'
  on-tertiary-fixed-variant: '#005049'
  background: '#fbf9f6'
  on-background: '#1b1c1a'
  surface-variant: '#e4e2df'
  background-warm: '#F7F5F2'
  background-dark: '#2D2421'
  surface-dark: '#3D322E'
  text-muted-dark: '#A69994'
  success-warm: '#9C3B32'
  danger-deep: '#7B231A'
typography:
  display-xl:
    fontFamily: Libre Caslon Text
    fontSize: 48px
    fontWeight: '400'
    lineHeight: 56px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Libre Caslon Text
    fontSize: 32px
    fontWeight: '400'
    lineHeight: 40px
  headline-lg-mobile:
    fontFamily: Libre Caslon Text
    fontSize: 24px
    fontWeight: '400'
    lineHeight: 32px
  body-lg:
    fontFamily: Poppins
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Poppins
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-sm:
    fontFamily: IBM Plex Mono
    fontSize: 13px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.05em
  code-block:
    fontFamily: IBM Plex Mono
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 22px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 8px
  gutter: 24px
  margin-mobile: 16px
  margin-desktop: 64px
  max-width: 1200px
---

## Brand & Style

The design system is built for a focused, creative environment where ideation meets structured documentation. The brand personality is **scholarly yet modern**, evoking the feeling of a premium physical notebook or a high-end editorial publication. It targets creators and architects of digital products who value clarity over noise.

The visual style is **Modern Editorial**. It leverages generous whitespace, a sophisticated serif/sans-serif pairing, and a "Flat Plus" aesthetic. While the layout is primarily flat and structural, it uses subtle tonal shifts and warmth to avoid the coldness of typical SaaS interfaces. The experience should feel calm, permanent, and thoughtful.

## Colors

This design system uses a palette rooted in earth tones. The **Primary Maroon** (#9C3B32) is used for critical actions and brand presence, while the **Secondary Amber** (#C98A2B) serves as a functional accent for highlights and active states. 

**Color Logic:**
- **Success:** Unlike traditional systems, success states are indicated by a shift toward the brand Maroon or Amber to maintain the editorial warmth. Avoid green.
- **Surface Tones:** Use the warm cream as the canvas. In the dark variant, transition to a deep chocolate brown (#2D2421) rather than true black to maintain the "warm ink" feel.
- **Contrast:** In dark mode, brighten the primary maroon slightly to ensure AA accessibility against the brown background.

## Typography

The typographic scale creates a hierarchy between "Editorial Inspiration" (Serif) and "Functional Utility" (Sans/Mono).

- **Libre Caslon Text** is reserved for high-level headings and marketing statements. It should never be used for UI labels or long-form body text.
- **Poppins** handles the heavy lifting of the UI, providing a geometric, modern balance to the serif headlines.
- **IBM Plex Mono** is used for "Work in Progress" content, such as AI prompts, documentation snippets, and technical labels, signaling an "active" or "draft" state.

## Layout & Spacing

The layout follows a **Fixed-Fluid hybrid model**. Content containers are capped at 1200px to maintain line-length readability for documentation. 

**Grid & Rhythm:**
- Use a 12-column grid for desktop with 24px gutters.
- Implement "Generous Negative Space": ensure vertical padding between sections is at least 80px on desktop to allow the editorial type to breathe.
- **The Pipeline Stepper:** The 4-step navigation should be centered within the sticky top bar, using a thin 1px line to connect steps, emphasizing a linear, thoughtful workflow.

## Elevation & Depth

This system avoids heavy shadows in favor of **Tonal Layering** and **Micro-Shadows**.

- **Level 0 (Base):** Warm cream background.
- **Level 1 (Cards/Inputs):** White (or slightly lighter cream) surface with a 1px solid border (#EAE4DD) and a very soft, warm-tinted shadow (Offset: 0, 2px; Blur: 4px; Color: rgba(45, 36, 33, 0.05)).
- **Interactive:** Upon hover, an element does not lift significantly but rather gains a slightly more defined border or a subtle amber glow. 
- **Dark Mode Depth:** Use "Surface-on-Surface" depth where the card is 5% lighter than the background brown.

## Shapes

The shape language is **Soft-Geometric**. A consistent 8px radius (`roundedness: 2`) is applied to buttons, cards, and input fields. This provides a approachable feel without the playfulness of fully rounded pill shapes, maintaining the professional editorial aesthetic.

## Components

- **Buttons:** 
  - *Primary:* Maroon fill, white text, no border. 
  - *Secondary:* Amber fill, white text. 
  - *Tertiary:* Outline style using the text color for the border.
- **Inputs & Textareas:** Use Poppins for user-entered text. Borders should be subtle; focus states should use a 2px Maroon left-border accent rather than a full glow.
- **Navigation Stepper:** Horizontal alignment. Active step is Maroon; completed steps are Amber with a checkmark; upcoming steps are muted grey-brown.
- **Badges:** Small, all-caps IBM Plex Mono text. Use Amber for "Idea" status and Maroon for "Documented" status.
- **Skeleton Loaders:** Instead of grey, use a pulse that transitions between two shades of warm cream/tan to minimize visual jarring during loads.
- **Cards:** No heavy borders. Use the subtle warm shadow and a 1px border that is only 5% darker than the card background.