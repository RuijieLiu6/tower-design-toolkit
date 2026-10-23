// Offline app (backlog item 30): which built files the service worker downloads up front, the cache version, and the
// GitHub Pages 404 fallback for hash routes. Pure functions: the build plugin (pwa.plugin.ts) uses them and
// precache.test.ts checks them.

/** Never cached and never published: the private competition model (public/local/) and the live evaluation run. */
export const NEVER_CACHE: RegExp[] = [/^local\//, /^eval\//]

/** Kept offline once used, not downloaded up front: the massing importers (IFC and Rhino readers, several MB). */
export const ON_DEMAND: RegExp[] = [/web-ifc/i, /rhino3dm/i, /\.wasm$/i]

/** Build files that are not part of the app itself. */
const SKIP: RegExp[] = [/\.map$/i, /^sw\.js$/, /^404\.html$/, /^\.nojekyll$/, /(^|\/)\.[^/]+$/]

/** Paths relative to the app root, with forward slashes and no leading "./" or "/". */
export const normalise = (f: string) => f.replace(/\\/g, '/').replace(/^\.?\//, '')

export const neverCached = (f: string) => NEVER_CACHE.some((r) => r.test(normalise(f)))

/** The files to download at install, sorted, starting with the page itself. */
export function precacheList(files: string[]): string[] {
  const keep = new Set<string>()
  for (const f of files.map(normalise)) {
    if (!f || NEVER_CACHE.some((r) => r.test(f)) || ON_DEMAND.some((r) => r.test(f)) || SKIP.some((r) => r.test(f))) continue
    keep.add(f)
  }
  const rest = [...keep].filter((f) => f !== 'index.html').sort()
  return keep.has('index.html') ? ['index.html', ...rest] : rest
}

/** FNV-1a, 32 bit, as 8 hex digits. */
export function fnv(text: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0 }
  return h.toString(16).padStart(8, '0')
}

/** Cache name for one build: changes whenever a cached file or its content changes, so an update replaces the old cache. */
export const cacheName = (entries: { file: string; hash: string }[]) =>
  `tower-studio-${fnv(entries.map((e) => `${normalise(e.file)}:${e.hash}`).sort().join('\n'))}`

/**
 * GitHub Pages serves 404.html for a path it doesn't know. The app routes by hash (#/guided), so a path like
 * /tower-studio/guided is sent to /tower-studio/#/guided. Kept free of outside names: the build inlines its source.
 */
export function hashRoute(pathname: string, base: string, search: string, hash: string): string {
  const b = base.endsWith('/') ? base : `${base}/`
  const rest = pathname.startsWith(b) ? pathname.slice(b.length) : pathname.replace(/^\/+/, '')
  const route = rest.replace(/^index\.html$/, '').replace(/\/+$/, '')
  if (hash) return `${b}${search}${hash}`
  return route ? `${b}${search}#/${route}` : `${b}${search}`
}
