import {fileURLToPath, URL} from 'node:url';
import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [react(), tailwindcss()],
  resolve: {alias: {'@': fileURLToPath(new URL('./src', import.meta.url))}},
  build: {outDir: '../dist/ui', emptyOutDir: true},
  server: {proxy: {'/data': 'http://127.0.0.1:3000', '/save': 'http://127.0.0.1:3000', '/close': 'http://127.0.0.1:3000', '/delete': 'http://127.0.0.1:3000', '/reorder': 'http://127.0.0.1:3000'}}
});
