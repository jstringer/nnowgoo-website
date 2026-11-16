import type { CollectionAfterChangeHook, CollectionAfterDeleteHook, CollectionConfig } from 'payload'

const slugify = (input: string): string =>
  input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

// Admin conditions for the row layout fields, so each only shows when it can
// have an effect. Hidden fields keep their saved values.
type RowSibling =
  | { text?: string | null; media?: unknown[] | null; textAlign?: string | null }
  | undefined
const mediaCount = (s: RowSibling) => (Array.isArray(s?.media) ? s.media.length : 0)
const hasText = (_: unknown, s: RowSibling) => Boolean(s?.text?.trim())
const hasMedia = (_: unknown, s: RowSibling) => mediaCount(s) > 0
const hasManyMedia = (_: unknown, s: RowSibling) => mediaCount(s) > 1
const hasTextAndMedia = (d: unknown, s: RowSibling) => hasText(d, s) && hasMedia(d, s)

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
          name: 'rowAlign',
          type: 'select',
          defaultValue: 'aligned',
          options: [
            { label: 'Aligned', value: 'aligned' },
            { label: 'Staggered', value: 'staggered' },
          ],
          admin: {
            description:
              'Aligned: text and media sit side by side, tops level. Staggered: diagonal, with the media one line below the text on the opposite side. Only affects rows with both text and media, on wider screens. Ignored when Overlap text or Full-bleed media is on.',
          },
        },
        {
          // Purely visual grouping: fields inside stay flat on the row.
          type: 'collapsible',
          label: 'More layout options',
          admin: { initCollapsed: true },
          fields: [
            {
              name: 'textAlign',
              type: 'select',
              defaultValue: 'left',
              options: [
                { label: 'Left', value: 'left' },
                { label: 'Center', value: 'center' },
                { label: 'Right', value: 'right' },
                { label: 'Fill column', value: 'fill' },
              ],
              admin: {
                description:
                  'How the lines of text are justified. Fill column: lines are left-aligned and the text spans its whole column instead of the usual readable width (Text position is then ignored).',
                condition: hasText,
              },
            },
            {
              name: 'textPosition',
              type: 'select',
              defaultValue: 'left',
              options: [
                { label: 'Left', value: 'left' },
                { label: 'Center', value: 'center' },
                { label: 'Right', value: 'right' },
              ],
              admin: {
                description: 'Where the text block sits horizontally inside its half. Wider screens only.',
                // Fill column stretches the block, so there is nothing to position.
                condition: (d, s) => hasText(d, s) && s?.textAlign !== 'fill',
              },
            },
            {
              name: 'textVAlign',
              type: 'select',
              defaultValue: 'top',
              options: [
                { label: 'Top', value: 'top' },
                { label: 'Center', value: 'center' },
                { label: 'Bottom', value: 'bottom' },
              ],
              admin: {
                description: 'Where the text sits vertically beside the media. Wider screens only.',
                condition: hasTextAndMedia,
              },
            },
            {
              name: 'mediaWidth',
              type: 'select',
              defaultValue: 'half',
              options: [
                { label: 'One third', value: 'third' },
                { label: 'Half', value: 'half' },
                { label: 'Two thirds', value: 'twoThirds' },
              ],
              admin: {
                description: 'How much of the row the media takes; text gets the rest.',
                condition: hasTextAndMedia,
              },
            },
            {
              name: 'textOverlap',
              type: 'checkbox',
              defaultValue: false,
              label: 'Overlap text',
              admin: {
                description:
                  'Text sits on top of the media in a bordered card, and the media spans the full row. Wider screens only.',
                condition: hasTextAndMedia,
              },
            },
            {
              name: 'fullBleed',
              type: 'checkbox',
              defaultValue: false,
              label: 'Full-bleed media',
              admin: {
                description:
                  'Media runs edge to edge, past the page margins. With text, the text drops below it (or overlaps it, if Overlap text is on).',
                condition: hasMedia,
              },
            },
            {
              name: 'mediaArrange',
              type: 'select',
              defaultValue: 'auto',
              options: [
                { label: 'Auto', value: 'auto' },
                { label: 'Side by side', value: 'side' },
                { label: 'Stacked', value: 'stack' },
                { label: 'Offset columns', value: 'offset' },
              ],
              admin: {
                description:
                  'How several media items sit together. Auto: side by side in media-only rows, stacked beside text. Offset: side by side with every other item dropped down.',
                condition: hasManyMedia,
              },
            },
            {
              name: 'mediaRatio',
              type: 'select',
              defaultValue: 'native',
              options: [
                { label: 'Native (no crop)', value: 'native' },
                { label: '16:9', value: '16/9' },
                { label: '4:3', value: '4/3' },
                { label: '1:1 (square)', value: '1/1' },
                { label: '4:5 (portrait)', value: '4/5' },
              ],
              admin: {
                description: 'Crop every item in this row to one shape (videos are cropped too).',
                condition: hasMedia,
              },
            },
            {
              name: 'spaceBefore',
              type: 'select',
              defaultValue: 'normal',
              options: [
                { label: 'Tight', value: 'tight' },
                { label: 'Normal', value: 'normal' },
                { label: 'Generous', value: 'generous' },
              ],
              admin: { description: 'Gap above this row.' },
            },
          ],
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
