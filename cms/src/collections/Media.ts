import type { CollectionConfig } from 'payload'

export const Media: CollectionConfig = {
  slug: 'media',
  access: {
    read: () => true,
  },
  fields: [
    {
      name: 'alt',
      type: 'text',
      required: true,
    },
  ],
  // TODO: images only (mimeTypes: ['image/*']); add imageSizes:
  //   { name: 'thumbnail', width: 600, height: 600, position: 'centre' } and
  //   { name: 'large', width: 1600 }. Storage moves to Vercel Blob via the
  //   storage plugin in payload.config.ts, since Vercel's disk is read-only.
  upload: true,
}
