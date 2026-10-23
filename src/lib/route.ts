// Hash routes: #/start (landing), #/guided (the staged app), #/customize (workflow builder), #/status (build status),
// #/options (design options compared), #/sources (sources & assumptions hub), #/guide (user guide).
// Hash routing keeps links and the back button working on a static host with no server rewrites.
import { useSyncExternalStore } from 'react'

export type Route = 'start' | 'guided' | 'customize' | 'status' | 'options' | 'sources' | 'guide'
const ROUTES: Route[] = ['start', 'guided', 'customize', 'status', 'options', 'sources', 'guide']
const SKIP_KEY = 'ts.landing.skip'

export function parseHash(hash: string): Route | null {
  const r = hash.replace(/^#\/?/, '').split(/[/?]/)[0]
  return (ROUTES as string[]).includes(r) ? (r as Route) : null
}

/** The path to open directly next time, if the user asked to skip the landing page. */
export function skipTarget(): Exclude<Route, 'start'> | null {
  try {
    const v = window.localStorage.getItem(SKIP_KEY)
    return v === 'guided' || v === 'customize' ? v : null
  } catch { return null }
}
export function setSkipTarget(r: Exclude<Route, 'start'> | null) {
  try { if (r) window.localStorage.setItem(SKIP_KEY, r); else window.localStorage.removeItem(SKIP_KEY) } catch { /* private mode: the landing page simply shows again */ }
}

/** Resolve an empty or unknown hash once at start-up, without adding a history entry. */
export function resolveInitialRoute() {
  if (parseHash(window.location.hash)) return
  const target = skipTarget() ?? 'start'
  window.history.replaceState(null, '', `#/${target}`)
}

export function navigate(r: Route) {
  if (parseHash(window.location.hash) !== r) window.location.hash = `/${r}`
}

const subscribe = (cb: () => void) => { window.addEventListener('hashchange', cb); return () => window.removeEventListener('hashchange', cb) }
export const useRoute = (): Route => useSyncExternalStore(subscribe, () => parseHash(window.location.hash) ?? 'start', () => 'start')
