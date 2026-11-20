// The interactive tour's steps (lib/tour.ts runs them): eight, each asks for one thing to do in the real app and
// watches the app's state until it is done; "Show me" does it for the person. Site → place a tower → shape it →
// results → 2D / 3D views → Schematic → Presentation → Export. This module reaches into the app's stores (the step,
// the view look), so it is loaded only when the tour starts: the start page stays small.
import { useStore, type ProjectKind } from '../store'
import { enterToolkit } from './intro'
import { setMode } from './mode'
import { navigate, type Route } from './route'
import { goToStep, useStep, type StepId } from './step'
import { useVistaLook } from './vistaLook'

/** What the app looked like when a step opened: a step is done when the person has changed the thing it asked for. */
export interface Snap { project: ProjectKind; towers: number; shape: string; look: string; step: StepId }
export const snapshot = (): Snap => {
  const s = useStore.getState(), t = s.towers[s.project][0]
  return { project: s.project, towers: s.towers[s.project].length, shape: t ? JSON.stringify([t.height, t.x, t.y, t.rotation, t.blocks, t.podiumHeight]) : '', look: useVistaLook.getState().mode, step: useStep.getState().step }
}

export interface TourStep {
  id: string
  title: string
  /** One thing to do, in a line. */
  ask: string
  /** Why, in a line (behind the ask, smaller). */
  body: string
  route: Route
  project?: ProjectKind
  step?: StepId
  /** Element to point at (CSS selector); the card sits away from it. */
  target?: string
  /** True once the person has done it (polled); a step without one is read and passed with Next. */
  done?: (snap: Snap) => boolean
  /** Does it for the person ("Show me"). */
  doIt?: () => void
}

const towerCount = () => { const s = useStore.getState(); return s.towers[s.project].length }
const q = (sel: string) => document.querySelector<HTMLElement>(sel)

export const TOUR: TourStep[] = [
  { id: 'site', route: 'guided', step: 'site', target: '[role="tablist"][aria-label="Project"]',
    title: 'Two sites', ask: 'Switch the site: Competition site or Real Vancouver.',
    body: 'The competition block comes with the brief\'s rules; Real Vancouver has the City\'s lots, terrain and the protected view cones. Everything else is the same model.',
    done: (snap) => useStore.getState().project !== snap.project,
    doIt: () => { const s = useStore.getState(); s.setProject(s.project === 'vtc' ? 'city' : 'vtc') } },
  { id: 'place', route: 'guided', project: 'vtc', step: 'volume', target: '[data-testid="phase-panel"]',
    title: 'Place a tower', ask: 'Start a tower: pick a case study on the left, or draw one from scratch.',
    body: 'A project opens empty. The cases are real Vancouver towers at true size; From scratch places a tower where you click.',
    done: (snap) => towerCount() > snap.towers,
    doIt: () => {
      const c = q('[data-case]'); if (c) { c.click(); return }
      const w = q('[data-start="case"]')
      if (w) { w.click(); setTimeout(() => { const c2 = q('[data-case]'); if (c2) c2.click(); else useStore.getState().addTower() }, 300) } else useStore.getState().addTower()
    } },
  { id: 'shape', route: 'guided', project: 'vtc', step: 'volume', target: '[data-testid="tower-rail"]',
    title: 'Shape it', ask: 'Change the tower: drag a face in the view, or edit its height in the panel.',
    body: 'The tools on the rail select, move, rotate, push and pull. Every check in the Workflow list runs again as the shape changes.',
    done: (snap) => snapshot().shape !== snap.shape && towerCount() > 0,
    doIt: () => { const s = useStore.getState(), t = s.towers[s.project][0]; if (t) s.updateTower(t.id, { height: t.height + 20 }); else s.addTower() } },
  { id: 'evidence', route: 'guided', project: 'vtc', step: 'volume', target: 'aside[aria-label="Results and evidence"]',
    title: 'Every result with its evidence', ask: 'Open a result on the right and read its source line.',
    body: 'Each line shows the value, the threshold, its source with page or clause, and a flag: verified, team assumption, unverified or unresolved. Nothing is hidden.' },
  { id: 'views', route: 'guided', project: 'vtc', step: 'volume', target: '[data-testid="view-2d3d"]',
    title: 'Plan, elevation, axo', ask: 'Open 2D for a plan or an elevation, or 3D for a corner in Axo or Iso.',
    body: 'The locked views at the bottom of the model: Plan, North, South, East and West cut into the street in front of the building; the corners are true axonometric or isometric.',
    done: (snap) => useVistaLook.getState().mode !== snap.look,
    doIt: () => useVistaLook.setState({ mode: 'plan' }) },
  { id: 'schematic', route: 'guided', project: 'vtc', step: 'program', target: '[data-testid="phase-next"]',
    title: 'Schematic: can it be built?', ask: 'Go to the next phase, Schematic (or press 2).',
    body: 'The clay turns into an x-ray: floor plates, core, lifts, stairs and plant. The core sizes itself to the lift and egress checks.',
    done: () => useStep.getState().step === 'plates',
    doIt: () => goToStep('plates') },
  { id: 'present', route: 'guided', project: 'vtc', step: 'plates', target: '[data-testid="page-toggle"]',
    title: 'Presentation', ask: 'Switch to Presentation in the top bar (or press V).',
    body: 'The sheets: true-scale drawings from the model, captures and renders, four A2 boards or an architectural set, with the submission checks beside them.',
    done: () => useStep.getState().step === 'frame',
    doIt: () => setMode('presentation') },
  { id: 'export', route: 'guided', project: 'vtc', step: 'frame', target: '[data-testid="panel-export"]',
    title: 'Export', ask: 'Open the Export tab.',
    body: 'Sheets as JPEG, PNG or PDF; the model as Rhino .3dm, OBJ or glTF; the project as a file that opens again here. That is the tour: the rest is yours.',
    done: () => !!q('aside[aria-label="Export"]'),
    doIt: () => q('[data-testid="panel-export"]')?.click() },
]

/** Move the app to where a step is about: its project, route and design step; the cover and the welcome put away. */
export function apply(s: TourStep) {
  const st = useStore.getState()
  if (s.project && st.project !== s.project) st.setProject(s.project)
  useStore.setState({ showOnboarding: false })
  enterToolkit()
  navigate(s.route)
  if (s.step && useStep.getState().step !== s.step) goToStep(s.step)
}
