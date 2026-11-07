// Accessibility checks (backlog item 16): axe-core on the landing page, the three guided stages and Customize.
// Run: node node_modules/playwright/cli.js test   (or npx playwright test). Separate from the vitest suite.
import { defineConfig } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
// Browser binaries live on F: next to the project, not in the user profile on C: (low on space).
process.env.PLAYWRIGHT_BROWSERS_PATH ??= resolve(here, '..', 'tools-cache', 'ms-playwright')

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  timeout: 90_000,
  // One worker, so a single report collects every screen.
  workers: 1,
  fullyParallel: false,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5199',
    browserName: 'chromium',
    viewport: { width: 1440, height: 900 },
    // WebGL in the headless shell comes from SwiftShader.
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
  },
  webServer: {
    // --mode e2e: no file watching (vite.config.ts), so edits made while the tests run cannot hot-reload the page.
    command: `"${process.execPath}" node_modules/vite/bin/vite.js --port 5199 --strictPort --mode e2e`,
    url: 'http://localhost:5199',
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
