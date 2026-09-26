# CLAUDE.md

Reference doc for working in this repo. It describes how the site is built and why, so changes (especially the upcoming UI/design refactor) stay consistent with existing architecture and conventions.

## Overview

Personal portfolio for Jack — Creative Technologist, software engineer, and live-event AV professional. Built as a static [Astro 6](https://astro.build) site with a single [React 19](https://react.dev) island for a WebGL hero animation. Content (work/blog) is authored as Markdown via Astro Content Collections. No CSS framework — a small hand-built design system driven by CSS custom properties.

## Stack & commands

- **Astro 6** (`astro: ^6.4.4`), static output (no adapter configured → `astro build` produces a plain `dist/`).
- **React 19** via `@astrojs/react`, used for exactly one component (see below).
- **TypeScript**, `astro/tsconfigs/strict`. No path aliases — all imports are relative.
- No CSS framework, no lint/format/test tooling configured.

```
npm run dev       # start dev server
npm run build     # build to dist/
npm run preview   # preview the production build
```

**Installed but unused:** `@react-three/fiber` and `@react-three/drei` are dependencies but `HeroCanvas` uses raw `three` directly, not R3F. `gsap` is also a dependency with no usages in `src`. Don't assume these are wired up — check before building on them.

**Deployment:** no adapter, no `netlify.toml`/`vercel.json`/CI workflow committed. Output is a portable static `dist/` deployable to any static host; hosting target isn't currently codified in the repo.

## Routing (`src/pages/`)

All pages are `.astro`; React is only used as an island within a page, never as a page itself.

| Route | File | Notes |
|---|---|---|
| `/` | `index.astro` | Hero (`HeroCanvas` React island, `client:only="react"`), "Selected Work" (top 3 featured `work` entries by year), "Writing" (3 most recent non-draft posts), static "Capabilities" grid. |
| `/about` | `about.astro` | Bio, contact links, résumé link (`/resume.pdf` — not currently present in `public/`), "Stack" skills grid. Content is hardcoded inline, not a collection. |
| `/blog` | `blog/index.astro` | Lists non-draft posts, date desc. Tag filtering is vanilla `<script>` (toggles `display: none`) — progressive enhancement, no framework involved. |
| `/blog/[slug]` | `blog/[slug].astro` | `getStaticPaths()` from the `blog` collection; renders Markdown `Content` with prose styling. |
| `/work` | `work/index.astro` | Lists all `work` entries, year desc. Same vanilla-JS tag-filter pattern as `/blog`. |
| `/work/[slug]` | `work/[slug].astro` | `getStaticPaths()` from the `work` collection; hero image (first `image`-type media item), metadata sidebar, rendered Markdown, media gallery for remaining items. |

The only React in the entire site is `HeroCanvas` on `/`. Everything else is server-rendered Astro + vanilla `<script>` where needed.

## Content collections

Defined via the Astro 5/6 loader API in **`src/content.config.ts`** (the active config) using `glob({ pattern: '**/*.md', base: './src/content/{work,blog}' })`.

> ⚠️ **`src/content/config.ts` also exists** using the older `defineCollection({ type: 'content', schema })` API with matching schemas. This looks like a leftover from before migrating to the loader API. Treat `src/content.config.ts` as the source of truth; the duplicate should probably be deleted, but confirm before removing since it hasn't been touched yet.

**`work`** (`src/content/work/*.md`): `title`, `client`, `year: number`, `tags: string[]`, `role`, `summary`, `featured: boolean` (default `false`), `media: { type: 'image'|'video'|'vimeo'|'youtube', src, alt?, poster? }[]`, `links?: { label, url }[]`, `color?` (optional per-project accent hex, e.g. `#FF4D1C`).

**`blog`** (`src/content/blog/*.md`): `title`, `date: Date`, `tags: string[]`, `summary`, `draft: boolean` (default `false`), `readingTime?: number` (minutes).

Current content (3 work entries, 2 blog entries) is all live-AV/TouchDesigner-themed work for client "VTPro Design" — LED wall pipeline, LiDAR performer tracking, a CueSwitcher/Companion OSC integration, plus matching blog write-ups.

## Components (`src/components/`) & layout (`src/layouts/`)

- **`BlogCard.astro`** — post card (date, reading time, title, summary, tags). Used on `/` and `/blog`.
- **`WorkCard.astro`** — project card (thumbnail image or autoplay muted video, client, year, title, summary, tags). Has a `featured` prop that switches to a full-width side-by-side layout. Used on `/` and `/work`.
- **`HeroCanvas.tsx`** — the only React component. Raw Three.js (not R3F): an 80×80 point-grid particle shader with custom GLSL, mouse-attraction wave effect, cleans up its own scene/renderer in a `useEffect`. Colors (`--accent` / `--accent-cool`) are hardcoded into the shader rather than read from CSS — keep that in sync manually if the palette changes.
- **`BaseLayout.astro`** (`src/layouts/`) — shared shell used by every page: `<head>` with meta/OG/canonical/favicon, fixed top nav (active-link underline via `Astro.url.pathname`), `<main class="page-enter">` (fade-up entrance animation, see global.css), footer with GitHub/LinkedIn/email links. Only imports `src/styles/global.css` — this is the single entry point for all global styling.

## Styling & design system (`src/styles/global.css`)

No framework — plain CSS with custom properties at `:root`, plus Astro's per-file scoped `<style>` blocks in each `.astro` component/page. `global.css` is imported exactly once, in `BaseLayout.astro`.

Documented aesthetic (per a comment at the top of the file): **"industrial signal chain / control surface — dark, technical, precise, with moments of heat."**

**Design tokens:**
- Color: `--bg: #0A0A09`, `--bg-raised: #111110`, `--bg-border: #1E1E1C`, `--surface: #161614`, `--text: #E8E6E0`, `--text-muted: #6B6960`, `--text-dim: #3A3935`.
- Accents: `--accent: #FF4D1C` (hot signal orange, primary), `--accent-cool: #00FFB2` (readout green), `--accent-dim: #FF4D1C33`.
- Fonts (Google Fonts): `--font-display: 'Syne'` (headings, 400–800), `--font-mono: 'DM Mono'` (labels/nav/buttons/metadata), `--font-body: 'Newsreader'` (serif body copy, 300).
- Spacing scale `--gap-xs` (0.25rem) → `--gap-2xl` (8rem); `--max-width: 1200px`; `--nav-height: 60px`.

**These tokens are the single source of truth for the visual system** — a UI refactor should extend/adjust them here rather than hardcoding new values in component-level `<style>` blocks.

**Recurring patterns:**
- `.tag` pill styling (tags on work/blog cards and detail pages), `.mono` utility class for monospace metadata.
- `.page-enter` fade-up keyframe, applied globally via `BaseLayout`.
- Per-project accent color threaded through via inline `style="--card-accent: ..."` on cards/hero, sourced from the `color` field in work frontmatter.
- Heavy use of `color-mix(in srgb, ...)` for hover-state blending, plus `backdrop-filter` and `dvh` units — relies on modern CSS support.
- Thin 1px borders (`--bg-border`) used in place of box-shadows throughout.
- Subtle SVG fractal-noise grain overlay on `body` (opacity 0.03) for texture.

## Known gaps

Non-blocking, but worth knowing before refactoring around them:

- **Duplicate content config**: `src/content/config.ts` (legacy API) vs `src/content.config.ts` (active, loader API) — same schemas, only one is used.
- **Missing referenced assets**: `public/resume.pdf` (linked from `/about`), a default OG image (referenced in `BaseLayout.astro`), and `public/media/*` files referenced in work-entry frontmatter (e.g. `/media/led-wall-full.jpg`) — none exist in `public/` yet.
- **Placeholder links**: footer/about links to GitHub, LinkedIn, and `mailto:hello@example.com` are still placeholders, not real profile URLs.
- **README.md** is still the unedited default Astro starter template — hasn't been customized for this project.
- No lint, formatter, or test tooling is set up.
