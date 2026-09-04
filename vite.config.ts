import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron/simple';
import { notBundle } from 'vite-plugin-electron/plugin';
import { fileURLToPath, URL } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

const alias = { '@shared': r('./shared'), '@': r('./src') };

export default defineConfig({
  resolve: { alias },
  plugins: [
    react(),
    electron({
      main: {
        entry: 'electron/main.ts',
        vite: {
          resolve: { alias },
          // notBundle keeps everything in package.json "dependencies" external,
          // which is what the native uiohook-napi binary needs: it has to be
          // require()d from node_modules at runtime, not inlined.
          plugins: [notBundle()],
          build: { outDir: 'dist-electron' },
        },
      },
      preload: {
        input: 'electron/preload.ts',
        vite: {
          resolve: { alias },
          build: { outDir: 'dist-electron' },
        },
      },
    }),
  ],
  build: { outDir: 'dist', emptyOutDir: true },
});
