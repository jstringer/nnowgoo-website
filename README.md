# Portfolio

Personal portfolio for Jack Stringer: Creative Technologist, software engineer and live-event AV professional.

The repo is a monorepo with two independently deployed apps and no root `package.json`. Each app has its own dependencies and lockfile, so run commands inside the app's directory.

| App | What it is | Stack |
|---|---|---|
| [`web/`](web/) | The public site | Astro 6 (static output), one small React island (a WebGL orb built with Three.js) |
| [`cms/`](cms/) | The content backend and admin UI | Payload CMS 3 on Next.js, Postgres on Neon, media in Neon Object Storage |

## Architecture

```
                 publish                    deploy hook
   Editor ───────────────► Payload CMS ─────────────────────► Vercel (web build)
 (/admin UI)               (cms/, Next.js)                          │
      │                     │         │                             │ fetch JSON at build time
      │ presigned PUT       │         │ REST API                    ▼
      ▼                     ▼         └──────────────────────► Astro (web/)
 Neon Object Storage    Neon Postgres                               │
  (S3-compatible)                                                   │ astro:assets downloads,
      ▲                                                             │ resizes and bakes images
      └─────────────────────────────────────────────────────────────┘
                                                                    ▼
                                                          Static HTML + assets
```

Astro pulls published content from Payload's REST API **at build time** and renders static HTML. Publishing in the CMS triggers a Vercel Deploy Hook, which rebuilds `web/`. Visitors never hit the CMS.

### CMS (`cms/`)

- **Collections:** `Users` (admin auth), `Media` (images and mp4/webm video, required `alt`), and `Work` (portfolio projects, with drafts).
- **`Work` fields:** title, auto-generated unique slug, client, month-only date, overview, stack (list of names), thumbnail (image), and a gallery of images or videos.
- **Visibility:** anonymous reads only see published docs. Writes require login.
- **Rebuild hook:** publishing or deleting a `Work` doc POSTs to `WEB_DEPLOY_HOOK_URL`. Failures are logged and never block the save. Unpublishing doesn't trigger a rebuild yet.
- **Media storage:** `@payloadcms/storage-s3` pointed at Neon Object Storage, with client-side uploads. The browser PUTs files straight to the bucket using a presigned URL from Payload, which gets large files past Vercel's request body limit. Files are stored as originals; there's no server-side resizing.
- **Upload limit:** 50MB per file. Resize camera exports first with `cms/scripts/resize-photos.mjs`.
- **CORS and CSRF:** both use one allowlist built from `WEB_URL`, `CMS_URL` and the localhost dev origins. Update it if ports or domains change.

### Web (`web/`)

- **Routes:** `/` (all published work, newest first), `/work/[slug]` (project detail with gallery) and `/about`.
- **Data layer:** `web/src/lib/payload.ts` is the only place the site talks to the CMS. Its `Work` and `Media` types are defined locally, so `web/` doesn't import from `cms/`.
- **Images:** `astro:assets` fetches originals from Neon storage during `astro build`, then resizes them and bakes hashed static files into `dist/`. Videos skip this pipeline and play directly from storage.
- **Styling:** hand-built CSS in `web/src/styles/global.css`, using design tokens on `:root`. The design is pure black, Fira Code, 1px borders and underlined links, based on the styleframes in `styleframes/`.
- **Island:** `HeroCanvas.tsx` is the only React component. It renders a mouse-reactive point-grid orb in the home header, client-side only.

## Local development

Start the CMS first, because both `astro dev` and `astro build` fetch from it.

```sh
# cms/  (http://localhost:3000, admin at /admin)
npm install
npm run dev

# web/  (http://localhost:4321)
npm install
npm run dev
```

Each app has a committed `.env.example`. Copy it to `.env` and fill it in. Locally, use the Neon `dev` branch for `DATABASE_URL`. Leave the `AWS_*` and `S3_BUCKET` variables empty to store media on local disk. See [`CLAUDE.md`](CLAUDE.md) for the full variable reference.

Other useful commands, run in `cms/`:

```sh
npm run generate:types         # regenerate src/payload-types.ts
npm run payload migrate:create # create a DB migration
npm run payload migrate        # apply migrations (production)
```

## Deployment

Deployment is planned but **not yet done**. The intended setup is two Vercel projects from this repo:

1. **`cms`**: root directory `cms`, Next.js preset. Uses the Neon `main` branch's database and storage credentials. Build command: `npm run payload migrate && npm run build`. Production doesn't auto-push schema changes, so create migrations locally first.
2. **`web`**: root directory `web`, Astro preset, static output. Set `PAYLOAD_URL` to the deployed CMS URL.
3. Create a Deploy Hook on the `web` project and put its URL in the CMS's `WEB_DEPLOY_HOOK_URL`.

Production data starts empty, so recreate Work entries in the production admin.

## More detail

[`CLAUDE.md`](CLAUDE.md) is the working reference for how the site is built, why, and what's still unfinished.
