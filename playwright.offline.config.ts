// Offline app check (backlog item 30): builds the app into its own folder, serves it with `vite preview`, and runs
// e2e/*.offline.ts against it. Run: npm run test:offline. Separate from the dev-server e2e config (playwright.config.ts),
// because only a production build has a service worker.
import { defineConfig } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
// Browser binaries live on F: next to the project, not in the user profile on C: (low on space).
process.env.PLAYWRIGHT_BROWSERS_PATH ??= resolve(here, '..', 'tools-cache', 'ms-playwright')
const vite = `"${process.execPath}" node_modules/vite/bin/vite.js`
// Its own output folder, so the check never overwrites dist/ while someone else previews it.
const out = 'node_modules/.offline-e2e'

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.offline.ts',
  timeout: 120_000,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:4199', browserName: 'chromium', serviceWorkers: 'allow' },
  webServer: {
    command: `${vite} build --outDir ${out} --emptyOutDir && ${vite} preview --outDir ${out} --port 4199 --strictPort`,
    url: 'http://localhost:4199',
    reuseExistingServer: false,
    timeout: 180_000,
  },
})
