// Offline app and GitHub Pages build (backlog item 30). On every build this writes sw.js: the files to download at
// install (src/lib/pwa/precache.ts) and a cache name for this build. In pages mode it also writes 404.html, which sends
// any unknown path back into the app as a hash route, and .nojekyll, and it removes public/local/ (the private
// competition model) from the output. Nothing here deploys anything.
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import type { Plugin, ResolvedConfig } from 'vite'
import { cacheName, hashRoute, NEVER_CACHE, normalise, precacheList } from './src/lib/pwa/precache.ts'
import { serviceWorker } from './src/lib/pwa/swSource.ts'

const hashOf = (data: string | Uint8Array) => createHash('sha256').update(data).digest('hex').slice(0, 16)

function walk(dir: string, root = dir): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? walk(p, root) : [normalise(relative(root, p))]
  })
}

/** GitHub Pages' fallback page: /<base>/guided → /<base>/#/guided (the routing rule is precache.ts hashRoute). */
const notFoundPage = (base: string) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Tower Design Toolkit</title>
<script>location.replace((${hashRoute.toString()})(location.pathname, ${JSON.stringify(base)}, location.search, location.hash))</script>
</head><body><p>Opening <a href="${base}">Tower Design Toolkit</a>…</p></body></html>
`

export function offlineApp({ pages }: { pages: boolean }): Plugin {
  let config: ResolvedConfig
  return {
    name: 'tower-studio-offline',
    apply: 'build',
    enforce: 'post',
    configResolved(c) { config = c },
    generateBundle(_options, bundle) {
      const files = Object.values(bundle).map((o) => ({ file: o.fileName, hash: hashOf(o.type === 'chunk' ? o.code : o.source) }))
      if (!files.some((f) => f.file === 'index.html')) files.push({ file: 'index.html', hash: hashOf(files.map((f) => f.hash).join()) })
      if (config.publicDir) for (const f of walk(config.publicDir)) files.push({ file: f, hash: hashOf(readFileSync(join(config.publicDir, f))) })
      const list = precacheList(files.map((f) => f.file))
      const keep = new Set(list)
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: serviceWorker(cacheName(files.filter((f) => keep.has(normalise(f.file)))), list, NEVER_CACHE) })
      if (pages) {
        this.emitFile({ type: 'asset', fileName: '404.html', source: notFoundPage(config.base) })
        this.emitFile({ type: 'asset', fileName: '.nojekyll', source: '' })
      }
    },
    closeBundle() {
      // The competition base model belongs to Buildner: never in a build meant for publishing.
      if (pages) rmSync(resolve(config.root, config.build.outDir, 'local'), { recursive: true, force: true })
    },
  }
}

/** Repository path for GitHub Pages ("/tower-design-toolkit/" unless PAGES_BASE says otherwise), always with both slashes. */
export function pagesBase(env?: string): string {
  const p = (env ?? 'tower-design-toolkit').replace(/^\/+|\/+$/g, '')
  return p ? `/${p}/` : '/'
}
