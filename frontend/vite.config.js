import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// I file GeoJSON sono serviti da public/data (symlink a ../data/processed).
// In build il base diventa '/ticino-app/' per GitHub Pages (project site);
// in dev resta '/'.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/ticino-app/' : '/',
  plugins: [react()],
  server: { fs: { allow: ['..', '../..'] } },
}))
