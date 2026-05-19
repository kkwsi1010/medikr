import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://medikr.kr',
  output: 'static',
  integrations: [
    sitemap({
      filter: (page) => !page.includes('/약/preview'),
    }),
  ],
  build: {
    inlineStylesheets: 'auto',
  },
  compressHTML: true,
  i18n: {
    defaultLocale: 'ko',
    locales: ['ko'],
  },
});
