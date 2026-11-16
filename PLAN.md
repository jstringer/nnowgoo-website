# Launch plan: polish + deploy (Vercel + Neon + nnowgoo.com)

Goal: get the site live. Frontend (`web/`, Astro static) and CMS (`cms/`, Payload/Next) work locally against the Neon `dev` branch. Nothing is deployed yet. Target: two Vercel projects, separate dev/prod config, and `nnowgoo.com` (web) + `cms.nnowgoo.com` (CMS).

Key clarification: Payload migrations move **schema only**, never rows or files.

## Status (as of 2026-11-15)

### Done
- HeroCanvas is now a fixed full-viewport background on Home (`index.astro` wrapper, `main` is `position: relative; z-index: 1`). Orb removed from `SiteHeader`.
- Content spans the full width (removed the 1500px `--max-width` cap).
- Work grid is 5 columns (4 / 3 / 2 / 1 at narrower breakpoints) in `WorkGrid.astro`.
- Real contact links: `jack@nnowgoo.com`, `github.com/jstringer`, `linkedin.com/in/stringerjack/` (`SiteHeader.astro`, `about.astro`).
- `site` in `web/astro.config.mjs` is `https://nnowgoo.com`.
- `web/public/resume.pdf` exists.
- `web/public/og-default.png` exists (1200x630, name + tagline on black); `BaseLayout.astro` points at the `.png`.
- **None of the above is committed yet.** Commit when ready.

### Jack: content (in progress, blocks everything below)
1. Upload media for each Work entry (use `photo-web/`, not full-res `photo/`).
2. Write the Work overviews and copy.
3. Write the About bio (currently placeholder text in `about.astro`).
4. Buy the domain (`nnowgoo.com` assumed).
5. Check video playback on a `/work/[slug]` page (Pier 57 clips). Never viewed per CLAUDE.md.

### Held until content is finished (do NOT start before Jack says so)
Order matters: the migration must come after any schema change.
1. **Generate the initial migration:** `npm run payload migrate:create` in `cms/` against dev; commit `cms/src/migrations/`. None exists yet, and prod won't auto-push schema.
2. **Add `vercel-build`** to `cms/package.json`: `payload migrate && npm run build` (or set it as the Vercel Build Command).
3. **Cleanup:** delete the stray `web/src/{components,layouts,content` directory; drop the leftover `align-items: center` on `body` in `global.css`; rewrite root `README.md` and `cms/README.md`.
   - **Keep** `@react-three/fiber`, `@react-three/drei` and `gsap` in `web/package.json`. Jack plans to use them for future animations. Do not remove.
4. Update CLAUDE.md (Deployment, env, Known gaps) once live.
5. Deploy (sections 1-5 below).

### Nice-to-have, not blocking
- Unpublishing doesn't trigger a rebuild.
- Mobile layout was chosen without a styleframe; check it.
- Per-page OG image from the Work thumbnail in `[slug].astro`.
- `photo/`, `photo-web/` are gitignored; confirm any other source-media folders are too.

## 1. Environments / env files
- Keep local `cms/.env` and `web/.env` = dev (Neon `dev` branch, dev bucket). Already gitignored; `.env.example` files stay committed.
- **Do not create `.env.production` files.** Production values live in Vercel project settings, scoped by environment:
  - **Production scope** -> Neon `main` branch DB URL, `main` bucket endpoint/keys, prod secret, real domains.
  - **Preview scope** -> Neon `dev` branch values (so preview deploys / migrations never touch prod).
- Use a *different* `PAYLOAD_SECRET` in prod. Generate with `openssl rand -hex 32`.
- cms project (prod): `DATABASE_URL` (main pooled), `PAYLOAD_SECRET`, `WEB_URL=https://nnowgoo.com`, `CMS_URL=https://cms.nnowgoo.com`, `WEB_DEPLOY_HOOK_URL` (from web project), `AWS_*`/`S3_BUCKET` for the main branch's Object Storage (bucket `public_read`).
- web project (prod): `PAYLOAD_URL=https://cms.nnowgoo.com`.
- Neon note: run migrations over the *direct* (non-`-pooler`) connection if the pooled one misbehaves; try pooled first.
- `payload.config.ts` allowlist already reads `WEB_URL`/`CMS_URL`; redirect `www` -> apex in Vercel (no code change).

## 2. Content to prod
Recommended: **re-enter content in the prod admin**, re-uploading from `photo-web/`. With only a handful of Work entries this is faster and avoids the media-URL-rewrite risk. Only write a promotion script if there are many entries:
- Copy rows dev -> main via a Payload Local API script (`find` on dev -> `create` on prod), not `pg_dump`; copy files with `rclone`/`aws s3 sync` between the two Neon endpoints (path-style, `--endpoint-url` twice).
- Check whether `media.url` is persisted with the dev endpoint (the S3 plugin's `generateFileURL` builds it from `AWS_ENDPOINT_URL_S3`); rewrite if so.
- Never wire the script into the build.

## 3. Deployment workflow
One-time setup:
1. Push repo to GitHub (remote `origin` exists: `jstringer/nnowgoo-website`).
2. Vercel project **cms**: root dir `cms`, Next.js preset, build command `npm run payload migrate && npm run build`, env from section 1 (Production + Preview scopes).
3. Deploy **cms** first (web build needs it reachable). Create the first admin user at `https://<cms>.vercel.app/admin`.
4. Vercel project **web**: root dir `web`, Astro preset, env `PAYLOAD_URL`. Create a **Deploy Hook** (Settings -> Git) and paste it into cms `WEB_DEPLOY_HOOK_URL`; redeploy cms.
5. Enter content in the prod admin (section 2), then trigger a web deploy.
6. Keep Vercel's "skip deployments when nothing changed in root directory" on.

Ongoing:
- Code push to `main` -> both projects build; cms runs `payload migrate` against prod first.
- Schema change: edit collection -> `migrate:create` locally -> commit migration -> push.
- Content: edit + publish in prod admin -> `Work` hook POSTs the deploy hook -> web rebuilds.
- PRs/previews use Preview-scope env (dev DB). Web previews should set `PAYLOAD_URL` to the prod CMS or be ignored.

## 4. Custom domain
Layout: **`nnowgoo.com`** -> web; **`www.nnowgoo.com`** -> redirect to apex; **`cms.nnowgoo.com`** -> cms.
1. Simplest: point registrar nameservers to Vercel (`ns1.vercel-dns.com`, `ns2.vercel-dns.com`). Alternative: keep registrar DNS and add the records Vercel shows (apex `A`; `CNAME` for `cms` and `www`).
2. web project -> Domains: add `nnowgoo.com` (primary) and `www.nnowgoo.com` (redirect to apex).
3. cms project -> Domains: add `cms.nnowgoo.com`.
4. Update prod env: `WEB_URL`, `CMS_URL`, web `PAYLOAD_URL` to the custom domains (CSRF/CORS break on mismatch); redeploy both.
5. Neon storage URLs are unaffected by the domain.

## Verification
- Local: `DATABASE_URL=<main> npm run payload migrate` on the empty prod branch creates all tables; `npm run build` in `cms/` succeeds.
- Deployed cms: `https://cms.nnowgoo.com/admin` loads, login works (no 401s = CSRF list correct), upload an image and confirm it lands in the **main** bucket, not dev.
- `curl https://cms.nnowgoo.com/api/work` returns published docs; drafts hidden when anonymous.
- Web: build log shows it fetched from prod CMS; `https://nnowgoo.com` renders the grid with images served from `/_astro/`; `www` redirects to apex.
- Publish a test Work in prod admin -> a web deploy is triggered and the entry appears.
- Share the URL in Slack/iMessage (or opengraph.xyz) to confirm the OG card; previews are cached, so check after the first deploy.
- Confirm dev branch data is untouched by prod deploys (Preview env points at dev).
