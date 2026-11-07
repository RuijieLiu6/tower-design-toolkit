// A short guided tour for the mid review: landing → Massing → Schematic → Present → Real Vancouver → Customize →
// Build status. Each step moves the app (route, project, stage) and points at one element. Skippable at every step.
import { create } from 'zustand'
import { useStore, type Phase, type ProjectKind } from '../store'
import { DEMO_FILE, DEMO_NAME } from './demo'
import { navigate, type Route } from './route'

export interface TourStep {
  id: string
  title: string
  body: string
  route: Route
  project?: ProjectKind
  stage?: Phase
  /** Element to point at (CSS selector); the card sits away from it. */
  target?: string
}

export const TOUR: TourStep[] = [
  { id: 'start', route: 'start', title: 'Start from who you are', body: 'Tell the agent who you are and what you are designing; it offers starting workflows of analysis nodes around one shared model. The guided process and Customize run the same nodes, and every result cites its source.' },
  { id: 'massing', route: 'guided', project: 'vtc', stage: 'basic', target: 'aside[aria-label="Design tools"]', title: 'Massing: shape the volume', body: 'The demo has two towers on the competition block. The design tools on the left shape them; the checks are the icons in the bar at the bottom, and they run live as you change the design.' },
  { id: 'evidence', route: 'guided', project: 'vtc', stage: 'basic', target: 'aside[aria-label="Results and evidence"]', title: 'Read every result with its evidence', body: 'Each line shows a value, the threshold, its source with page or clause, and a flag in icon and word: verified, team assumption, unverified, unresolved. False assumptions stay visible in magenta.' },
  { id: 'schematic', route: 'guided', project: 'vtc', stage: 'advanced', target: '[data-viewport]', title: 'Schematic: can it be built?', body: 'The clay turns into an x-ray axonometric: floor plates, core, lifts, stairs and plant. The core sizes itself to the lift and egress checks; the sky lobby in Tower 1 opens a free public room.' },
  { id: 'present', route: 'guided', project: 'vtc', stage: 'present', target: '[data-viewport]', title: 'Present: compose the boards', body: 'The model locks and an A2 frame shows exactly what a capture will hold. Captures carry their evidence labels onto the boards.' },
  { id: 'city', route: 'guided', project: 'city', stage: 'basic', target: '[data-viewport]', title: 'Real Vancouver', body: 'The same tower placed downtown, with City footprints, terrain and the 24 protected view cones. Switch on "Solar access & sun hours" to run the Downtown shadow test on the real Table-1 parks.' },
  { id: 'customize', route: 'customize', target: '[role="tablist"][aria-label="Node categories"]', title: 'Customize: your own workflow', body: 'Every node as an icon, by category. Drag them onto the canvas, wire them, add logic (all pass, weighted score, compare options), and run the workflow in the guided app. Community has shared nodes to install.' },
  { id: 'status', route: 'status', title: 'What is built, what is next', body: 'Build status counts built and researched nodes by category, stage and milestone, straight from the registry. That is the end of the tour.' },
]

interface TourState {
  active: boolean
  step: number
  /** True while the demo project is being opened at the start. */
  loading: boolean
  start: (opts?: { demo?: boolean }) => Promise<void>
  go: (step: number) => void
  stop: () => void
}

function apply(s: TourStep) {
  const st = useStore.getState()
  if (s.project && st.project !== s.project) st.setProject(s.project)
  if (s.stage && useStore.getState().phase !== s.stage) useStore.getState().setPhase(s.stage)
  useStore.setState({ showOnboarding: false })
  navigate(s.route)
}

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

export const useTour = create<TourState>((set, get) => ({
  active: false,
  step: 0,
  loading: false,
  start: async (opts = {}) => {
    if (opts.demo) {
      set({ loading: true })
      try {
        await loadDemo()
      } catch { /* the tour still runs on the current design */ }
      set({ loading: false })
    }
    set({ active: true, step: 0 })
    apply(TOUR[0])
  },
  go: (step) => {
    if (step < 0 || step >= TOUR.length) { get().stop(); return }
    set({ step })
    apply(TOUR[step])
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
