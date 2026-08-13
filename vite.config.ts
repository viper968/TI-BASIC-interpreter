import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages serves a project site from /<repo-name>/, not /. Local dev,
  // build, and preview all stay at / — only the GitHub Actions deploy needs
  // the sub-path, and GITHUB_ACTIONS is set automatically by every runner.
  base: process.env.GITHUB_ACTIONS ? '/the-game/' : '/',
  plugins: [react()],
})
