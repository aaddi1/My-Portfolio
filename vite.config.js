import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  root: './',
  server: {
    port: 5173,
    open: false,
    host: true,
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
});
