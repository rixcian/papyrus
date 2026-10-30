# What is coss ui and how does it fit a Vite + React + Tailwind app?

Type: research
Status: resolved

## Question

Find out what coss.com's component library (coss ui) is: its underlying primitives (Base UI? Radix?), its distribution model (shadcn-style copy-in registry vs npm package), the Tailwind version it needs (v4?), how it installs into a Vite + React + TypeScript app, which components exist (dialog, menu, sheet/drawer, tabs, toast, combobox, slider, etc.) and what's missing for a library + reader UI, theming/dark-mode approach, licence, and maturity.

## Research

Findings: branch `research/coss-ui`, file `docs/research/coss-ui.md` (local only, never merged).

## Answer

Adopt coss ui for the app UI; the reader view stays separate (no UI kit covers it).

- Cal.com's design system (ex-Origin UI), `github.com/cosscom/ui`, MIT, actively maintained. Built on **Base UI** (`@base-ui/react`, stable since 1.0), not Radix.
- **Copy-in shadcn registry**, not an npm package: `pnpm dlx shadcn@latest init @coss/style`, then `shadcn add @coss/<component>`. No versioned releases: update by re-running `add` and reviewing the diff.
- Requires **Tailwind v4 (≥4.1.17) and React 19**.
- Docs are Next.js-only, but components have no Next imports: use shadcn's standard Vite setup (`@tailwindcss/vite`, `@/*` alias) in `apps/web`. Font setup (Inter, Geist Mono via fontsource) under Vite is unverified.
- 59 components cover dialog, menu, context menu, sheet, drawer, tabs, toast, combobox, slider, etc. Gaps for Papyrus: virtualised grid/list, file dropzone, resizable panels.
- Theming is shadcn-compatible CSS variables with a `.dark` class; reader themes like sepia can be added the same way.
- Suggested additions: `@tanstack/react-virtual` (library grid), `react-resizable-panels` (if split panes are wanted). Dropzone is still an open choice for the prototype.
