import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const work = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/work' }),
  schema: z.object({
    title: z.string(),
    client: z.string(),
    year: z.number(),
    tags: z.array(z.string()),
    role: z.string(),
    summary: z.string(),
    featured: z.boolean().default(false),
    media: z.array(z.object({
      type: z.enum(['image', 'video', 'vimeo', 'youtube']),
      src: z.string(),
      alt: z.string().optional(),
      poster: z.string().optional(),
    })),
    links: z.array(z.object({
      label: z.string(),
      url: z.string(),
    })).optional(),
    color: z.string().optional(),
  }),
});

export const collections = { work };
