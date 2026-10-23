// Offline app in the browser (backlog item 30): register the service worker of a production build (sw.js, written by
// pwa.plugin.ts) and keep the browser's install offer, so the landing page and the guide can show "Install app".
import { create } from 'zustand'

interface InstallPrompt extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }

interface OfflineState {
  /** The browser's install offer (Chrome, Edge), when it has made one. */
  offer: InstallPrompt | null
  /** Running as an installed app (its own window). */
  installed: boolean
  /** The service worker is active: after the first visit the app opens without a network. */
  offlineReady: boolean
}

const standalone = () => {
  try { return window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true } catch { return false }
}

export const useOffline = create<OfflineState>(() => ({ offer: null, installed: typeof window !== 'undefined' && standalone(), offlineReady: false }))

let started = false
/** Call once at start-up. Development builds get no service worker, so a dev server never serves stale files. */
export function startOffline() {
  if (started || typeof window === 'undefined') return
  started = true
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); useOffline.setState({ offer: e as InstallPrompt }) })
  window.addEventListener('appinstalled', () => useOffline.setState({ offer: null, installed: true }))
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
  const register = () => navigator.serviceWorker.register('./sw.js').then(() => navigator.serviceWorker.ready).then(() => useOffline.setState({ offlineReady: true }), () => { /* offline mode is a bonus */ })
  if (document.readyState === 'complete') register()
  else window.addEventListener('load', register, { once: true })
}

/** Show the browser's install dialog. Returns false when the browser made no offer (use its menu instead). */
export async function installApp(): Promise<boolean> {
  const offer = useOffline.getState().offer
  if (!offer) return false
  await offer.prompt()
  const { outcome } = await offer.userChoice
  useOffline.setState({ offer: null, installed: outcome === 'accepted' })
  return outcome === 'accepted'
}

/** Where to find "Install" when the browser makes no offer (Safari, Firefox, or an offer already dismissed). */
export function installHint(ua = typeof navigator === 'undefined' ? '' : navigator.userAgent): string {
  if (/iPhone|iPad|iPod/.test(ua)) return 'In Safari: Share → Add to Home Screen.'
  if (/Edg\//.test(ua)) return 'In Edge: ⋯ menu → Apps → Install this site as an app.'
  if (/Chrome\//.test(ua)) return 'In Chrome: ⋮ menu → Cast, save and share → Install page as app (or the install icon in the address bar).'
  if (/Safari\//.test(ua) && /Macintosh/.test(ua)) return 'In Safari (macOS 14+): File → Add to Dock.'
  if (/Firefox\//.test(ua)) return 'Firefox does not install web apps: open it in Chrome, Edge or Safari, or keep this tab; it still works offline after the first visit.'
  return "Use your browser's menu to install this page as an app."
}
