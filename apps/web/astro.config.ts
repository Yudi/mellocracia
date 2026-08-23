import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import svelte from '@astrojs/svelte';

export default defineConfig({
  site: process.env.PUBLIC_SITE_URL ?? 'https://mellocracia.yudi.me',
  output: 'server',
  session: false,
  adapter: node({ mode: 'standalone' }),
  integrations: [svelte()],
  vite: {
    ssr: {
      noExternal: ['@mellocracia/contracts'],
    },
  },
});
