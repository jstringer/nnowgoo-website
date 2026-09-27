import { defineConfig } from 'astro/config';
import react from '@astrojs/react';

export default defineConfig({
  integrations: [react()],
  site: 'https://jackportfolio.dev',
  image: {
    // Media images live on Neon Object Storage (a different host per branch)
    // in production, or on the local Payload dev server otherwise.
    remotePatterns: [
      { protocol: 'https', hostname: '**.neon.tech' },
      { protocol: 'http', hostname: 'localhost' },
    ],
  },
});
