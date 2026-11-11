// Wipes every Media doc from the CMS (which also deletes the files from storage)
// and re-uploads everything under photo-web/ through the REST API.
//
// Usage (from cms/):
//   node scripts/reset-media.mjs [inputDir] [--dry-run] [--yes] [--no-delete]
//
//   --dry-run    print what would happen without changing anything
//   --yes        required to actually delete; without it the script stops before deleting
//   --no-delete  skip the wipe and only upload (use this to resume a failed run)
//
// Re-running is safe: files whose name already exists in the CMS are skipped.
//
// Config (env vars, or cms/.env):
//   CMS_URL             CMS origin; defaults to http://localhost:3000
//   CMS_ADMIN_EMAIL     login of a Payload user
//   CMS_ADMIN_PASSWORD
//
// Files are posted as normal multipart requests, so against a deployed CMS they
// are subject to the host's request body limit (~4.5MB on Vercel). Point this at
// a local CMS (which can still be wired to the Neon dev branch) for big files.
import fs from 'node:fs/promises'
import path from 'node:path'

try {
  process.loadEnvFile(path.resolve(import.meta.dirname, '..', '.env'))
} catch {
  // no .env; rely on the real environment
}

const args = process.argv.slice(2)
const flags = new Set(args.filter((a) => a.startsWith('--')))
const positional = args.filter((a) => !a.startsWith('--'))

const root = path.resolve(import.meta.dirname, '..', '..')
const inputDir = path.resolve(positional[0] ?? path.join(root, 'photo-web'))
const dryRun = flags.has('--dry-run')
const confirmed = flags.has('--yes')
const skipDelete = flags.has('--no-delete')

const baseUrl = (process.env.CMS_URL || 'http://localhost:3000').replace(/\/$/, '')
const email = process.env.CMS_ADMIN_EMAIL
const password = process.env.CMS_ADMIN_PASSWORD

const UPLOAD_CONCURRENCY = 3
const MAX_BYTES = 50 * 1024 * 1024 // payload.config.ts upload.limits.fileSize

// Must stay within Media's `mimeTypes` (image/*, video/mp4, video/webm).
const MIME = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.tif': 'image/tiff',
  '.tiff': 'image/tiff',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
}

const mb = (bytes) => `${(bytes / 1e6).toFixed(bytes < 1e7 ? 2 : 1)}MB`

async function* walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  entries.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) yield* walk(full)
    else yield full
  }
}

const slugify = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

// photo-web/pier57/01.jpg -> upload name "pier57-01.jpg", alt "pier57 01".
// Prefixing the folder keeps names unique and recognisable in the admin.
function describe(file) {
  const rel = path.relative(inputDir, file)
  const { dir, name, ext } = path.parse(rel)
  const parts = [...dir.split(path.sep).filter(Boolean), name]
  return {
    rel,
    ext: ext.toLowerCase(),
    uploadName: `${parts.map(slugify).filter(Boolean).join('-')}${ext.toLowerCase()}`,
    alt: parts.join(' ').replace(/[-_]+/g, ' '),
  }
}

async function api(method, pathname, { token, body, headers } = {}) {
  const res = await fetch(`${baseUrl}/api${pathname}`, {
    method,
    headers: {
      ...(token ? { Authorization: `JWT ${token}` } : {}),
      ...(body && typeof body === 'string' ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body,
  })
  const text = await res.text()
  let json
  try {
    json = JSON.parse(text)
  } catch {
    json = { raw: text }
  }
  if (!res.ok) {
    throw new Error(`${method} ${pathname} -> ${res.status}: ${JSON.stringify(json).slice(0, 500)}`)
  }
  return json
}

async function login() {
  if (!email || !password) {
    throw new Error('Set CMS_ADMIN_EMAIL and CMS_ADMIN_PASSWORD (env vars or cms/.env).')
  }
  const { token } = await api('POST', '/users/login', { body: JSON.stringify({ email, password }) })
  if (!token) throw new Error('Login succeeded but returned no token.')
  return token
}

async function collectFiles() {
  const files = []
  for await (const file of walk(inputDir)) {
    const info = describe(file)
    const size = (await fs.stat(file)).size
    if (!MIME[info.ext]) {
      console.log(`skip (unsupported type)  ${info.rel}`)
    } else if (size > MAX_BYTES) {
      console.log(`skip (over 50MB)         ${info.rel}  ${mb(size)}`)
    } else {
      files.push({ ...info, file, size })
    }
  }
  const seen = new Map()
  for (const f of files) {
    const key = f.uploadName.toLowerCase()
    if (seen.has(key)) throw new Error(`Name clash: ${f.rel} and ${seen.get(key)} -> ${f.uploadName}`)
    seen.set(key, f.rel)
  }
  return files
}

async function wipeMedia(token) {
  const { totalDocs } = await api('GET', '/media?limit=1&depth=0', { token })
  console.log(`CMS has ${totalDocs} media doc(s).`)
  if (totalDocs === 0) return
  if (dryRun) {
    console.log(`(dry run) would delete ${totalDocs} media doc(s) and their stored files.`)
    return
  }
  if (!confirmed) {
    throw new Error(`Refusing to delete ${totalDocs} media doc(s) at ${baseUrl} without --yes.`)
  }
  console.log('Deleting...')
  const result = await api('DELETE', '/media?where[id][exists]=true', { token })
  console.log(`Deleted ${result.docs?.length ?? 0}.`)
  if (result.errors?.length) {
    console.error('Some deletes failed:', JSON.stringify(result.errors, null, 2))
    throw new Error('Delete incomplete; fix the errors above and re-run.')
  }
}

async function existingFilenames(token) {
  const res = await api('GET', '/media?limit=0&depth=0&select[filename]=true', { token })
  return new Set(res.docs.map((d) => String(d.filename).toLowerCase()))
}

async function uploadOne(token, f) {
  const form = new FormData()
  form.append('_payload', JSON.stringify({ alt: f.alt }))
  form.append('file', new Blob([await fs.readFile(f.file)], { type: MIME[f.ext] }), f.uploadName)
  await api('POST', '/media', { token, body: form })
}

async function main() {
  console.log(`CMS:    ${baseUrl}`)
  console.log(`Source: ${inputDir}${dryRun ? '  (dry run)' : ''}\n`)

  const files = await collectFiles()
  console.log(`\n${files.length} file(s) to upload, ${mb(files.reduce((n, f) => n + f.size, 0))} total.\n`)

  const token = await login()

  if (!skipDelete) await wipeMedia(token)

  const have = dryRun && !skipDelete ? new Set() : await existingFilenames(token)
  const todo = files.filter((f) => !have.has(f.uploadName.toLowerCase()))
  if (todo.length < files.length) console.log(`${files.length - todo.length} already in the CMS, skipping.`)

  if (dryRun) {
    for (const f of todo) console.log(`(dry run) would upload ${f.rel} -> ${f.uploadName}  ${mb(f.size)}`)
    return
  }

  let done = 0
  const failed = []
  const queue = [...todo]
  async function worker() {
    for (let f = queue.shift(); f; f = queue.shift()) {
      try {
        await uploadOne(token, f)
        console.log(`[${++done}/${todo.length}] ${f.uploadName}  ${mb(f.size)}`)
      } catch (err) {
        failed.push(f.rel)
        console.error(`FAILED ${f.rel}: ${err.message}`)
      }
    }
  }
  await Promise.all(Array.from({ length: UPLOAD_CONCURRENCY }, worker))

  console.log(`\nUploaded ${done}/${todo.length}.`)
  if (failed.length) {
    console.error(`${failed.length} failed; re-run with --no-delete to retry only those:`)
    for (const rel of failed) console.error(`  ${rel}`)
    process.exitCode = 1
  }
}

main().catch((err) => {
  console.error(`\n${err.message}`)
  process.exit(1)
})
