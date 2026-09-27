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
  // Storage moves to Neon Object Storage via the plugin in payload.config.ts.
  // Resizing happens on the frontend (astro:assets) at build time instead of
  // here, so only the original upload is stored.
  upload: {
    mimeTypes: ['image/*'],
  },
}
