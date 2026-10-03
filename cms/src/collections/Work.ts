import type { CollectionAfterChangeHook, CollectionAfterDeleteHook, CollectionConfig } from 'payload'

const slugify = (input: string): string =>
  input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

// Ask Vercel to rebuild the static Astro site. A failed call must never block
// saving in the admin, so errors are logged and swallowed.
const triggerRebuild = async (req: { payload: { logger: { error: (msg: string) => void } } }) => {
  const url = process.env.WEB_DEPLOY_HOOK_URL
  if (!url) return
  try {
    const res = await fetch(url, { method: 'POST' })
    if (!res.ok) req.payload.logger.error(`Deploy hook responded ${res.status}`)
  } catch (err) {
    req.payload.logger.error(`Deploy hook failed: ${String(err)}`)
  }
}

// Only published content is visible on the site, so only rebuild for it.
const rebuildOnPublish: CollectionAfterChangeHook = async ({ doc, req }) => {
  if (doc._status === 'published') await triggerRebuild(req)
  return doc
}

const rebuildOnDelete: CollectionAfterDeleteHook = async ({ doc, req }) => {
  if (doc._status === 'published') await triggerRebuild(req)
  return doc
}

export const Work: CollectionConfig = {
  slug: 'work',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'client', 'date', '_status'],
  },
  // Drafts give each doc a `_status` (draft | published). The Astro site only
  // fetches published docs.
  versions: {
    drafts: true,
  },
  access: {
    create: ({ req }) => Boolean(req.user),
    update: ({ req }) => Boolean(req.user),
    delete: ({ req }) => Boolean(req.user),
    read: ({ req }) => (req.user ? true : { _status: { equals: 'published' } }),
  },
  defaultSort: '-date',
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
    },
    {
      name: 'slug',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      admin: {
        position: 'sidebar',
        description: 'URL segment, auto-generated from the title if left blank.',
      },
      hooks: {
        beforeValidate: [
          ({ value, data }) => {
            const source = typeof value === 'string' && value ? value : data?.title
            return typeof source === 'string' ? slugify(source) : value
          },
        ],
      },
    },
    {
      name: 'client',
      type: 'text',
      required: true,
    },
    {
      name: 'date',
      type: 'date',
      required: true,
      admin: {
        position: 'sidebar',
        date: {
          pickerAppearance: 'monthOnly',
          displayFormat: 'MMMM yyyy',
        },
      },
    },
    {
      name: 'overview',
      type: 'textarea',
      required: true,
    },
    {
      name: 'stack',
      type: 'array',
      labels: { singular: 'Tool', plural: 'Stack' },
      fields: [{ name: 'name', type: 'text', required: true }],
    },
    {
      name: 'thumbnail',
      type: 'upload',
      relationTo: 'media',
      required: true,
      // The site renders thumbnails with <Image>, so videos aren't allowed here.
      filterOptions: { mimeType: { contains: 'image/' } },
    },
    {
      name: 'gallery',
      type: 'array',
      admin: {
        description: 'Images or videos. Videos play inline with controls.',
      },
      // `image` holds either kind of media (name kept to avoid a DB migration).
      fields: [{ name: 'image', type: 'upload', relationTo: 'media', required: true }],
    },
  ],
  hooks: {
    afterChange: [rebuildOnPublish],
    afterDelete: [rebuildOnDelete],
  },
}
