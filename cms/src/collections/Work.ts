import type { CollectionConfig } from 'payload'

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
    // TODO: public can read published docs only; writes require a logged-in user.
    //   read: ({ req }) => (req.user ? true : { _status: { equals: 'published' } }),
    read: () => true,
  },
  defaultSort: '-date',
  fields: [
    // TODO title: text, required
    // TODO slug: text, required, unique, indexed. Auto-generate from title in a
    //   beforeValidate field hook (lowercase, hyphenated); sidebar position
    // TODO client: text, required
    // TODO date: date, required; admin.date.pickerAppearance = 'monthOnly'
    //   (site shows "September 2025")
    // TODO overview: textarea, required
    // TODO stack: array of { name: text }, rendered as tag chips
    // TODO thumbnail: upload -> 'media', required (square card on Home)
    // TODO gallery: array of { image: upload -> 'media' (required) }.
    //   The site puts them 2-up and lets a lone last item span the full width,
    //   so no per-item layout field is needed.
  ],
  hooks: {
    afterChange: [
      // TODO: trigger the Vercel Deploy Hook for the web project so the static
      //   site rebuilds on publish. POST to process.env.WEB_DEPLOY_HOOK_URL,
      //   only when doc._status === 'published' (or when unpublishing).
    ],
    afterDelete: [
      // TODO: same deploy hook call
    ],
  },
}
