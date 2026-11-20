// The interactive tour (Sinnie, 20 Nov: "an interactive demo tour to the site for new users landing on the site"):
// eight steps (lib/tourSteps.ts), each asks for one thing to do in the real app and moves on when it is done. New
// visitors are offered it once on the cover (components/TourInvite.tsx); it is always one click away in the top bar's
// More menu and on the start page under Other ways in. This module stays light: the steps, which reach into the
// app's stores, load when the tour starts.
import { create } from 'zustand'
import { useStore } from '../store'
import { DEMO_FILE, DEMO_NAME } from './demo'
import { navigate } from './route'
import type { TourStep } from './tourSteps'

interface TourState {
  active: boolean
  step: number
  /** True while the demo project is being opened at the start. */
  loading: boolean
  start: (opts?: { demo?: boolean }) => Promise<void>
  go: (step: number) => void
  stop: () => void
}

let steps: { TOUR: TourStep[]; apply: (s: TourStep) => void } | null = null
const loadSteps = async () => (steps ??= await import('./tourSteps'))

/**
 * Open the demo file as one undoable step. From the landing page the guided app hasn't restored the last autosave or
 * started recording undo yet: restore first (else the restore would replace the demo), and record this one step so
 * Ctrl+Z brings the user's own design back.
 */
async function loadDemo(): Promise<boolean> {
  const [{ openText, whenRestored }, { startHistory }, text] = await Promise.all([import('./project/session'), import('./project/history'), fetch(DEMO_FILE).then((r) => (r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`))))])
  await whenRestored()
  const stop = startHistory()
  try { return await openText(text, DEMO_NAME) } finally { stop() }
}

/** Once offered (taken or declined), the cover does not offer the tour again in this browser. */
const OFFERED = 'ts.tour.offered'
export const tourOffered = () => { try { return window.localStorage.getItem(OFFERED) === '1' } catch { return true } }
export const markTourOffered = () => { try { window.localStorage.setItem(OFFERED, '1') } catch { /* private mode: offered again next visit */ } }

export const useTour = create<TourState>((set, get) => ({
  active: false,
  step: 0,
  loading: false,
  start: async (opts = {}) => {
    markTourOffered()
    set({ loading: true })
    const [m] = await Promise.all([loadSteps(), opts.demo ? loadDemo().catch(() => false) : Promise.resolve(true)])
    m.apply(m.TOUR[0])
    set({ loading: false, active: true, step: 0 })
  },
  go: (step) => {
    if (!steps || step < 0 || step >= steps.TOUR.length) { get().stop(); return }
    set({ step })
    steps.apply(steps.TOUR[step])
  },
  stop: () => set({ active: false, step: 0 }),
}))

/** Open the demo project without the tour, then go to the guided process. */
export async function openDemo(): Promise<boolean> {
  try {
    const ok = await loadDemo()
    if (ok) { useStore.setState({ showOnboarding: false }); navigate('guided') }
    return ok
  } catch { return false }
}
