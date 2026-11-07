import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { offlineApp, pagesBase } from './pwa.plugin.ts'
import { renderHelper } from './render.plugin.ts'

export default defineConfig(({ mode }) => ({
  // offlineApp writes the service worker (works offline after the first visit) and, for GitHub Pages, the 404 page.
  // renderHelper lets the Render tab run the user's Codex CLI, in `vite` and `vite preview` on this computer only.
  plugins: [react(), tailwindcss(), offlineApp({ pages: mode === 'pages' }), renderHelper()],
  // './' keeps every URL relative, so a local build runs from any folder. `npm run build:pages` (mode "pages") uses the
  // repository path instead (PAGES_BASE, default /tower-design-toolkit/), so GitHub Pages' 404 page works at any depth.
  base: mode === 'pages' ? pagesBase(process.env.PAGES_BASE) : './',
  // Only the lazy node builder dialog uses these; pre-bundle them so its first open doesn't reload the dev page.
  // rhino3dm and web-ifc (massing import) are served as-is: they find their .wasm through ?url imports.
  optimizeDeps: { include: ['ajv/dist/2020', 'fflate', 'react-dom'], exclude: ['rhino3dm', 'web-ifc'] },
  // The browser tests' server (`vite --mode e2e`, started by playwright.config.ts) does not watch the source: a save
  // during a run used to push hundreds of hot updates into the open page, reset the store and fail whichever test was
  // running (heights, align-lot, 7 Nov). A run now tests the code as it was when its server started.
  ...(mode === 'e2e' ? { server: { watch: null } } : {}),
  build: {
    rolldownOptions: {
      output: {
        // Large libraries and data in their own chunks, so the first screen does not wait for the 3D engine and no
        // chunk mixes app code with a big library (backlog item 24, mid-review readiness).
        codeSplitting: {
          groups: [
            // zustand is a dependency of R3F too: without its own group the r3f group captures it, and every page (the
            // landing page included) would then import the r3f chunk and, through it, three.js.
            { name: 'zustand', test: /node_modules[\\/](zustand|use-sync-external-store)[\\/]/, priority: 32 },
            { name: 'three', test: /node_modules[\\/]three[\\/]/, priority: 31 },
            { name: 'r3f', test: /node_modules[\\/](@react-three|three-stdlib|troika-[^\\/]+|maath|meshline|camera-controls|@monogrid|stats-gl|suspend-react|its-fine)[\\/]/, priority: 30 },
            { name: 'icons', test: /node_modules[\\/]lucide-react[\\/]/, priority: 12 },
            { name: 'research', test: /src[\\/]data[\\/]research_registry\.json/, priority: 25 },
            // Above the 3D groups for the same reason: R3F also imports React's JSX runtime.
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/, priority: 33 },
            { name: 'xyflow', test: /node_modules[\\/](@xyflow|d3-[^\\/]+|classcat)[\\/]/, priority: 15 },
          ],
        },
      },
    },
  },
  // Tests run with the starting tower placed in each project (src/test/startingTowers.ts); the app itself opens empty.
  test: { environment: 'node', setupFiles: ['src/test/startingTowers.ts'] },
}))
