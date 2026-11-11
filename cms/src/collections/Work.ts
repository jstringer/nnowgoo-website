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
      admin: {
        description:
          'Legacy. Move this into Rows. If set, it still renders above the rows and is used as the page description.',
      },
    },
    {
      name: 'stack',
      type: 'array',
      labels: { singular: 'Tool', plural: 'Stack' },
      fields: [{ name: 'name', type: 'text', required: true }],
    },
    {
      name: 'rows',
      type: 'array',
      labels: { singular: 'Row', plural: 'Rows' },
      admin: {
        description:
          'The page body, top to bottom. A row can be text, media, or both. Text and media each take half the width; media-only rows split the full width between their items.',
      },
      fields: [
        { name: 'text', type: 'textarea', admin: { description: 'Line and paragraph breaks are kept.' } },
        {
          name: 'textSide',
          type: 'select',
          defaultValue: 'left',
          options: [
            { label: 'Left', value: 'left' },
            { label: 'Right', value: 'right' },
          ],
          admin: { description: 'Which half the text sits in. Media goes in the other half.' },
        },
        {
          name: 'media',
          type: 'upload',
          relationTo: 'media',
          hasMany: true,
          admin: { description: 'Images or videos, in display order.' },
        },
      ],
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
        description:
          'Legacy. Move this into Rows. If set, it still renders below the rows. Column items sit two per row; full width items get a row to themselves.',
      },
      fields: [
        // Holds either kind of media (name kept to avoid a DB migration).
        { name: 'image', type: 'upload', relationTo: 'media', required: true },
        {
          name: 'layout',
          type: 'select',
          required: true,
          defaultValue: 'column',
          options: [
            { label: 'Column (half width)', value: 'column' },
            { label: 'Full width', value: 'full' },
          ],
        },
      ],
    },
  ],
  hooks: {
    afterChange: [rebuildOnPublish],
    afterDelete: [rebuildOnDelete],
  },
}
