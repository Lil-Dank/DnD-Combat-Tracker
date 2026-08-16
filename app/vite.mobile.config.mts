// The player companion web app served by the in-app LAN server
// (src/main/playerServer.ts) from out/mobile. Built alongside the Electron
// bundles by `npm run build`; watch it during development with
// `npm run dev:mobile`.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  root: resolve(__dirname, 'src/mobile'),
  base: './',
  plugins: [react()],
  build: {
    outDir: resolve(__dirname, 'out/mobile'),
    emptyOutDir: true,
  },
});
