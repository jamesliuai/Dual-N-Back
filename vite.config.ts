import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { seoPlugin } from './build/seo';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'SITE_');
  return {
    appType: 'mpa',
    plugins: [react(), seoPlugin(env.SITE_URL)],
    base: './',
    build: {
      rollupOptions: {
        input: { main: 'index.html', guide: 'how-to-play/index.html' },
      },
    },
  };
});
