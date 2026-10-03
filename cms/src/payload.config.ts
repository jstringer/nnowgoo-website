import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import path from 'path'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

import { Users } from './collections/Users'
import { Media } from './collections/Media'
import { Work } from './collections/Work'
import { s3Storage } from '@payloadcms/storage-s3'

// On Windows, sharp's file cache keeps the temp upload file locked, so Payload's
// rewrite of it fails with "UNKNOWN: unknown error, open ...payload-client-upload-...".
sharp.cache(false)

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

// Each Neon branch has its own storage endpoint, so the dev and production
// databases automatically get separate files.
const neonEndpoint = process.env.AWS_ENDPOINT_URL_S3?.replace(/\/$/, '')
const neonBucket = process.env.S3_BUCKET

// Once `csrf` is set, cookie auth is only accepted from listed origins, so this
// must include the CMS's own origin (the admin UI) as well as the Astro site.
const allowedOrigins = [
  process.env.WEB_URL,
  process.env.CMS_URL,
  'http://localhost:4321',
  'http://localhost:3000',
].filter(
  (origin): origin is string => Boolean(origin),
)

export default buildConfig({
  admin: {
    user: Users.slug,
    importMap: {
      baseDir: path.resolve(dirname),
    },
  },
  collections: [Users, Media, Work],
  // Let the Astro site (local + deployed) call the API.
  cors: allowedOrigins,
  csrf: allowedOrigins,
  editor: lexicalEditor(),
  secret: process.env.PAYLOAD_SECRET || '',
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  // Dev pushes schema changes automatically. Production doesn't: create
  // migrations locally (`npm run payload migrate:create`) and run
  // `npm run payload migrate` as part of the production build.
  db: postgresAdapter({
    pool: {
      connectionString: process.env.DATABASE_URL || '',
    },
  }),
  sharp,
  // Payload's multipart parser rejects uploads over its default cap (~20MB).
  upload: {
    limits: {
      fileSize: 50 * 1024 * 1024, // 50MB
    },
  },
  plugins: [
    // Neon Object Storage (S3-compatible). Enabled only when configured, so
    // local dev can fall back to disk (cms/media/) by leaving the vars empty.
    s3Storage({
      enabled: Boolean(neonEndpoint && neonBucket),
      bucket: neonBucket || '',
      // The browser PUTs files straight to the bucket via a presigned URL
      // instead of streaming them through Payload, so large uploads aren't
      // subject to Vercel's ~4.5MB request body limit.
      clientUploads: true,
      collections: {
        media: {
          disablePayloadAccessControl: true,
          // Bucket is public_read: point media URLs straight at it instead of
          // proxying through Payload. Path-style URL, per Neon's docs.
          generateFileURL: ({ filename, prefix }) =>
            [neonEndpoint, neonBucket, prefix, filename].filter(Boolean).join('/'),
        },
      },
      config: {
        region: process.env.AWS_REGION,
        endpoint: neonEndpoint,
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
        },
        forcePathStyle: true, // required by Neon
        requestChecksumCalculation: 'WHEN_REQUIRED', // avoids rejected uploads
      },
    }),
  ],
})
