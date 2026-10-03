// Shrinks photos and videos for upload to the CMS. Originals are left untouched.
// Walks the input folder recursively and mirrors its tree into the output folder.
//
// Usage (from cms/):
//   node scripts/resize-photos.mjs [inputDir] [outputDir] [--dry-run] [--force]
//
//   --dry-run  print what would happen without writing anything
//   --force    redo files whose output already exists and is up to date
//
// Images are capped at MAX_IMAGE_EDGE (long edge) and videos at MAX_VIDEO_EDGE.
// Videos need ffmpeg/ffprobe on PATH.
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

// Windows keeps sharp's cached file handles open; see payload.config.ts.
sharp.cache(false)

const MAX_IMAGE_EDGE = 3840 // 4K
const JPEG_QUALITY = 85
const COPY_IMAGE_UNDER_BYTES = 5 * 1024 * 1024 // already-small files are copied as-is

const MAX_VIDEO_EDGE = 1920 // 1080p
const VIDEO_CRF = 23
const MAX_VIDEO_BITRATE = 10_000_000 // bits/s; faster-than-this sources are re-encoded

const args = process.argv.slice(2)
const flags = new Set(args.filter((a) => a.startsWith('--')))
const positional = args.filter((a) => !a.startsWith('--'))

const root = path.resolve(import.meta.dirname, '..', '..')
const inputDir = path.resolve(positional[0] ?? path.join(root, 'photo'))
const outputDir = path.resolve(positional[1] ?? path.join(root, 'photo-web'))
const dryRun = flags.has('--dry-run')
const force = flags.has('--force')

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.tif', '.tiff', '.webp'])
const VIDEO_EXT = new Set(['.mp4', '.mov', '.webm', '.m4v'])

// Extension that matches sharp's detected format, so name and content agree.
const FORMAT_EXT = { jpeg: '.jpg', png: '.png' }

const mb = (bytes) => `${(bytes / 1e6).toFixed(bytes < 1e7 ? 2 : 1)}MB`

async function* walk(dir) {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) yield* walk(full)
    else yield full
  }
}

// Two sources in one folder can map to the same output name (02.jpg + 02.png),
// so hand out a unique path per run.
const claimed = new Set()
function claim(destPath) {
  let candidate = destPath
  const { dir, name, ext } = path.parse(destPath)
  for (let n = 2; claimed.has(candidate.toLowerCase()); n++) {
    candidate = path.join(dir, `${name}-${n}${ext}`)
  }
  claimed.add(candidate.toLowerCase())
  return candidate
}

async function isUpToDate(src, dest) {
  if (force) return false
  try {
    const [s, d] = await Promise.all([fs.stat(src), fs.stat(dest)])
    return d.mtimeMs >= s.mtimeMs
  } catch {
    return false
  }
}

async function processImage(src, relDir) {
  const srcStat = await fs.stat(src)
  const meta = await sharp(src, { limitInputPixels: false }).metadata()
  const { name, ext } = path.parse(src)

  // EXIF orientations 5-8 are rotated 90 degrees when displayed.
  const rotated = meta.orientation >= 5
  const longEdge = Math.max(meta.width, meta.height)
  const realExt = FORMAT_EXT[meta.format]
  const extMatches = realExt !== undefined && ext.toLowerCase().replace('.jpeg', '.jpg') === realExt
  const needsEncode =
    longEdge > MAX_IMAGE_EDGE ||
    srcStat.size > COPY_IMAGE_UNDER_BYTES ||
    !extMatches ||
    (meta.orientation ?? 1) !== 1

  // Alpha stays PNG; everything else becomes JPEG.
  const outExt = needsEncode ? (meta.hasAlpha ? '.png' : '.jpg') : realExt
  const dest = claim(path.join(outputDir, relDir, `${name}${outExt}`))
  const label = path.join(relDir, path.basename(src))

  if (await isUpToDate(src, dest)) return { status: 'skipped', label, reason: 'up to date' }

  const note = !extMatches ? ` (really ${meta.format}, was named ${ext})` : ''
  const dims = `${meta.width}x${meta.height}${rotated ? ' rotated' : ''}`
  if (dryRun) {
    const action = needsEncode ? `re-encode -> ${path.basename(dest)}` : 'copy'
    console.log(`[dry-run] ${label}: ${dims}, ${mb(srcStat.size)}, ${action}${note}`)
    return { status: 'dry', before: srcStat.size, after: srcStat.size }
  }

  await fs.mkdir(path.dirname(dest), { recursive: true })
  if (!needsEncode) {
    await fs.copyFile(src, dest)
  } else {
    const pipeline = sharp(src, { limitInputPixels: false })
      .rotate() // apply EXIF orientation before metadata is stripped
      .resize({
        width: MAX_IMAGE_EDGE,
        height: MAX_IMAGE_EDGE,
        fit: 'inside',
        withoutEnlargement: true,
      })
    await (outExt === '.png'
      ? pipeline.png({ compressionLevel: 9 })
      : pipeline.jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
    ).toFile(dest)
  }

  const after = (await fs.stat(dest)).size
  console.log(
    `${label}: ${dims}, ${mb(srcStat.size)} -> ${mb(after)}${needsEncode ? '' : ' (copied)'}${note}`,
  )
  return { status: 'done', before: srcStat.size, after }
}

function run(cmd, cmdArgs, { capture = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, cmdArgs, { stdio: ['ignore', capture ? 'pipe' : 'inherit', 'inherit'] })
    let stdout = ''
    child.stdout?.on('data', (d) => (stdout += d))
    child.on('error', reject)
    child.on('close', (code) =>
      code === 0 ? resolve(stdout) : reject(new Error(`${cmd} exited with code ${code}`)),
    )
  })
}

async function probeVideo(src) {
  const out = await run(
    'ffprobe',
    ['-v', 'error', '-select_streams', 'v:0', '-show_streams', '-show_format', '-of', 'json', src],
    { capture: true },
  )
  const { streams, format } = JSON.parse(out)
  const video = streams[0]
  // Phone clips often store portrait video as landscape plus a rotation tag.
  const rotation = Math.abs(
    Number(video.tags?.rotate ?? video.side_data_list?.find((d) => d.rotation)?.rotation ?? 0),
  )
  const swapped = rotation === 90 || rotation === 270
  return {
    codec: video.codec_name,
    longEdge: Math.max(video.width, video.height),
    dims: swapped ? `${video.height}x${video.width}` : `${video.width}x${video.height}`,
    bitrate: Number(format.bit_rate ?? video.bit_rate ?? 0),
  }
}

async function processVideo(src, relDir) {
  const srcStat = await fs.stat(src)
  const { name, ext } = path.parse(src)
  const lowerExt = ext.toLowerCase()
  const info = await probeVideo(src)
  const label = path.join(relDir, path.basename(src))

  const webSafe =
    (lowerExt === '.mp4' && info.codec === 'h264') || (lowerExt === '.webm' && info.codec !== 'h264')
  const needsEncode =
    !webSafe || info.longEdge > MAX_VIDEO_EDGE || info.bitrate > MAX_VIDEO_BITRATE

  const dest = claim(path.join(outputDir, relDir, `${name}${needsEncode ? '.mp4' : lowerExt}`))
  const desc = `${info.dims} ${info.codec} ${(info.bitrate / 1e6).toFixed(1)}Mbps, ${mb(srcStat.size)}`

  if (await isUpToDate(src, dest)) return { status: 'skipped', label, reason: 'up to date' }

  if (dryRun) {
    console.log(`[dry-run] ${label}: ${desc}, ${needsEncode ? 're-encode' : 'copy'}`)
    return { status: 'dry', before: srcStat.size, after: srcStat.size }
  }

  await fs.mkdir(path.dirname(dest), { recursive: true })
  if (!needsEncode) {
    await fs.copyFile(src, dest)
    console.log(`${label}: ${desc} (copied)`)
    return { status: 'done', before: srcStat.size, after: srcStat.size }
  }

  console.log(`${label}: ${desc}, encoding (this can take a few minutes)...`)
  // Scale down to the cap on the long edge, never up. -2 keeps the other side even.
  const scale =
    `scale=w='if(gt(iw,ih),min(${MAX_VIDEO_EDGE},iw),-2)'` +
    `:h='if(gt(iw,ih),-2,min(${MAX_VIDEO_EDGE},ih))'`
  await run('ffmpeg', [
    '-y', '-hide_banner', '-loglevel', 'error', '-stats',
    '-i', src,
    '-vf', scale,
    '-c:v', 'libx264', '-crf', String(VIDEO_CRF), '-preset', 'slow',
    '-maxrate', '10M', '-bufsize', '20M',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '128k',
    '-movflags', '+faststart', // lets the browser start playing before the full download
    dest,
  ])

  let after = (await fs.stat(dest)).size
  if (after >= srcStat.size) {
    // Re-encoding made it bigger, so the source was already efficient.
    await fs.copyFile(src, dest)
    after = srcStat.size
    console.log(`  -> re-encode was not smaller, kept the original`)
  } else {
    console.log(`  -> ${mb(srcStat.size)} -> ${mb(after)}`)
  }
  return { status: 'done', before: srcStat.size, after }
}

console.log(`${dryRun ? '[dry-run] ' : ''}${inputDir} -> ${outputDir}`)

const totals = { before: 0, after: 0, done: 0, skipped: 0 }
const failures = []

for await (const file of walk(inputDir)) {
  const ext = path.extname(file).toLowerCase()
  const kind = IMAGE_EXT.has(ext) ? 'image' : VIDEO_EXT.has(ext) ? 'video' : null
  if (!kind) continue

  const relDir = path.relative(inputDir, path.dirname(file))
  try {
    const result = await (kind === 'image' ? processImage : processVideo)(file, relDir)
    if (result.status === 'skipped') {
      totals.skipped++
      continue
    }
    totals.done++
    totals.before += result.before
    totals.after += result.after
  } catch (err) {
    failures.push(`${path.relative(inputDir, file)}: ${err.message}`)
    console.error(`FAILED ${path.relative(inputDir, file)}: ${err.message}`)
  }
}

console.log(
  `\n${totals.done} processed, ${totals.skipped} up to date, ${failures.length} failed. ` +
    `${mb(totals.before)} -> ${mb(totals.after)}${dryRun ? ' (dry run: sizes unchanged)' : ''}`,
)
if (failures.length) {
  console.error(`\nFailures:\n${failures.map((f) => `  ${f}`).join('\n')}`)
  process.exitCode = 1
}
