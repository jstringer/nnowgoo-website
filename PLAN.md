# Deployment plan: Vercel + Neon + nnowgoo.com

## Context
Frontend (`web/`, Astro static) and CMS (`cms/`, Payload/Next) work locally against the Neon `dev` branch. Nothing is deployed. Goal: two Vercel projects, separate dev/prod config, a repeatable deploy workflow (schema migrations on deploy, one-time content promotion dev -> prod), and `nnowgoo.com` (web) + `cms.nnowgoo.com` (CMS).

Key clarification: Payload migrations move **schema only**, never rows or files. Content promotion is therefore a separate, manual, one-time script.

## 1. Environments / env files
- Keep local `cms/.env` and `web/.env` = dev (Neon `dev` branch, dev bucket). Already gitignored; `.env.example` files stay committed.
- **Do not create `.env.production` files.** Production values live in Vercel project settings, scoped by environment:
  - **Production scope** -> Neon `main` branch DB URL, `main` bucket endpoint/keys, prod secret, real domains.
  - **Preview scope** -> Neon `dev` branch values (so preview deploys / migrations never touch prod).
- Use a *different* `PAYLOAD_SECRET` in prod. Generate with `openssl rand -hex 32`.
- Production values (cms project): `DATABASE_URL` (main pooled), `PAYLOAD_SECRET`, `WEB_URL=https://nnowgoo.com`, `CMS_URL=https://cms.nnowgoo.com`, `WEB_DEPLOY_HOOK_URL` (from web project), `AWS_*`/`S3_BUCKET` for the main branch's Object Storage (bucket `public_read`).
- Production values (web project): `PAYLOAD_URL=https://cms.nnowgoo.com`.
- Optionally add `cms/.env.production.example` / a table in CLAUDE.md documenting the prod values (no secrets).

## 2. Code/config changes (small)
- `cms/src/migrations/`: generate the initial migration (`npm run payload migrate:create` in `cms/`, against dev). None exist yet; prod won't auto-push schema. Commit it. Repeat whenever collections change.
- `cms/package.json`: add `"vercel-build": "payload migrate && npm run build"` (or set Vercel Build Command to `npm run payload migrate && npm run build` as CLAUDE.md already notes).
- `web/astro.config.mjs`: `site` is `https://jackportfolio.dev` -> change to `https://nnowgoo.com` (affects canonical/OG URLs in `BaseLayout.astro`).
- `cms/src/payload.config.ts`: allowlist already reads `WEB_URL`/`CMS_URL`; if you want `www.nnowgoo.com` to work, either redirect www -> apex in Vercel (recommended, no code change) or add it to `allowedOrigins`.
- Neon note: run migrations over the *direct* (non-`-pooler`) connection if the pooled one misbehaves; try pooled first.

## 3. Content promotion (one-time, manual) — `scripts/promote-to-prod` (new, not run by Vercel)
Run once, at launch, from your machine with both sets of credentials in a temp env file:
1. Ensure prod schema exists: `DATABASE_URL=<main> npm run payload migrate` in `cms/`.
2. Copy rows dev -> main, data-only, for `media`, `work` (+ `work_gallery`, `work_stack`, `work_rels`, `_work_v*` if drafts/versions should carry over), and `users` (or just create a fresh prod admin at `/admin` instead — simpler and avoids copying password hashes). Tool: `pg_dump --data-only --table=...` piped to `psql`, or a small Node script using Payload's Local API (`payload.find` on dev -> `payload.create` on prod), which handles relations/IDs more safely. Recommend the Local API script for correctness.
3. Copy files: `rclone`/`aws s3 sync` from the dev bucket endpoint to the prod bucket endpoint (each Neon branch has its own endpoint + keys; needs `--endpoint-url` twice, path-style).
4. **Verify how `media.url` is stored** — if the DB stores full URLs containing the dev endpoint, the script must rewrite them to the prod endpoint (the S3 plugin's `generateFileURL` in `payload.config.ts` builds them from `AWS_ENDPOINT_URL_S3`; check whether it's persisted or computed on read).
5. After launch, dev is a sandbox; prod content is edited in the prod admin. Script is never wired into the build, so it can't overwrite live edits.

## 4. Deployment workflow
One-time setup:
1. Push repo to GitHub (remote `origin` exists).
2. Vercel project **cms**: root dir `cms`, Next.js preset, build command `npm run payload migrate && npm run build`, env from §1 (Production + Preview scopes).
3. Deploy **cms** first (web build needs it reachable). Create first admin user at `https://<cms>.vercel.app/admin` (or via promotion).
4. Vercel project **web**: root dir `web`, Astro preset, env `PAYLOAD_URL`. Create a **Deploy Hook** (Settings -> Git) and paste into cms `WEB_DEPLOY_HOOK_URL`; redeploy cms.
5. Run the promotion script (§3), then trigger a web deploy.
6. Keep Vercel's "skip deployments when nothing changed in root directory" on so `web/`-only pushes don't rebuild cms and vice versa.

Ongoing:
- Code push to `main` -> both projects build; cms runs `payload migrate` against prod DB first.
- Schema change: edit collection -> `migrate:create` locally -> commit migration -> push (migration applies on deploy; commit before pushing or build fails/skips).
- Content: edit + publish in prod admin -> `Work` hook POSTs deploy hook -> web rebuilds (known gap: unpublish doesn't rebuild).
- PRs/preview deployments use Preview-scope env (dev DB). Web previews should set `PAYLOAD_URL` to the prod CMS (read-only published content) or be ignored.

## 5. Custom domain (nnowgoo.com)
Recommended layout: **`nnowgoo.com`** -> web project; **`www.nnowgoo.com`** -> redirect to apex; **`cms.nnowgoo.com`** -> cms project.
Steps:
1. Buy domain. Simplest: point registrar nameservers to Vercel (`ns1.vercel-dns.com`, `ns2.vercel-dns.com`) so Vercel manages DNS and auto-provisions SSL. Alternative: keep DNS at registrar and add the records Vercel shows per domain (apex `A` record; `CNAME` for `cms` and `www` -> value Vercel gives, e.g. `cname.vercel-dns.com`).
2. web project -> Settings -> Domains: add `nnowgoo.com` (primary) and `www.nnowgoo.com` (redirect to apex).
3. cms project -> Settings -> Domains: add `cms.nnowgoo.com`.
4. Update prod env: `WEB_URL`, `CMS_URL`, web `PAYLOAD_URL` to the custom domains (CSRF/CORS break if they mismatch); redeploy both.
5. Update `site` in `astro.config.mjs` (§2). Neon storage URLs are unaffected by the domain.

## 6. Also update after this is done
- `CLAUDE.md` Deployment + env sections (prod values, promotion script, new domains); todo.txt item.
- Remaining launch gaps from CLAUDE.md: `resume.pdf`, `/og-default.jpg`, real contact links.

## Verification
- Local: `DATABASE_URL=<main> npm run payload migrate` on the empty prod branch creates all tables; `npm run build` in `cms/` succeeds.
- Deployed cms: `https://cms.nnowgoo.com/admin` loads, login works (no 401s = CSRF list correct), upload an image and confirm it lands in the **main** bucket, not dev.
- `curl https://cms.nnowgoo.com/api/work` returns promoted published docs; drafts hidden when anonymous.
- Web: build log shows it fetched from prod CMS; `https://nnowgoo.com` renders grid with images served from `/_astro/`; `www` redirects to apex.
- Publish a test Work in prod admin -> a web deploy is triggered and the entry appears.
- Confirm dev branch data is untouched by prod deploys (check Preview env points at dev).
