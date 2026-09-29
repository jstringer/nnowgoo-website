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
      admin: {
        description: 'Defaults to the filename if left blank; edit for a real description.',
      },
      hooks: {
        // Runs after the file is processed (data.filename is set) but before
        // the `required` validation, so leaving this blank on upload still
        // saves instead of failing.
        beforeValidate: [
          ({ value, data }) => {
            if (value) return value
            if (!data?.filename) return value
            return data.filename.replace(/\.[^/.]+$/, '').replace(/[-_]+/g, ' ')
          },
        ],
      },
    },
  ],
  // Storage moves to Neon Object Storage via the plugin in payload.config.ts.
  // Resizing happens on the frontend (astro:assets) at build time instead of
  // here, so only the original upload is stored.
  upload: {
    mimeTypes: ['image/*'],
  },
}
