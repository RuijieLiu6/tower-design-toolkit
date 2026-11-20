// The interactive tour's steps (lib/tour.ts runs them). Two parts (Sinnie, 20 Nov: "it should first do a guide through
// of what is what in the interface"): first a walk round the screen, eight regions each named and explained (top bar,
// phases, left panel, model, view bar, tool rail, results, status line), read with Next; then eight things to do, each
// asking for one thing in the real app and watching the app's state until it is done; "Show me" does it for the
// person. Site → place a tower → shape it → results → 2D / 3D views → Schematic → Presentation → Export. This module reaches into the app's stores (the step,
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

export type TourPart = 'look' | 'do'
export const PART_NAME: Record<TourPart, string> = { look: 'Around the screen', do: 'Try it' }

export interface TourStep {
  id: string
  part: TourPart
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

const look = (id: string, target: string, title: string, ask: string, body: string): TourStep => ({ id, part: 'look', route: 'guided', step: 'volume', target, title, ask, body })

export const TOUR: TourStep[] = [
  look('ui-top', '[data-testid="top-bar"]', 'The top bar', 'Project, screen and page.',
    'Left: the project and its two sites. Middle: what fills the screen, the model, the data graph or both. Right: Capture, the Model / Presentation switch, and More for the check library, settings, this tour and the sources.'),
  look('ui-phases', '[data-testid="phase-line"]', 'The design process', 'Five phases: Site, Form, Program, Schematic, Presentation.',
    'Each phase holds its tools in working order; the tint shows where you are and the counts show its failing checks. Click a phase or press 1 to 5; the arrows at the foot of the panel step through them.'),
  look('ui-panel', '[data-testid="phase-panel"]', 'The left panel', 'This phase\'s workflow, then the open tool.',
    'The list at the top is the phase\'s tools; pick one and its controls open under it. Edit rearranges the workflow: add tools from the shelf, remove them, loop back.'),
  look('ui-model', '[data-model-region]', 'The model', 'The middle of the screen is the building and its site.',
    'Drag to orbit, scroll to zoom, right-drag to pan. Click a tower or a face to select it. Every change here runs the checks again.'),
  look('ui-viewbar', '[data-testid="view-bar"]', 'The view bar', 'Under the model: Capture, Frame, 2D or 3D, View mode.',
    '2D holds the plan and the four elevations; 3D the free orbit and the corners in Axo or Iso. View mode switches clay, program, x-ray and the analysis overlays, with the sun and the legend.'),
  look('ui-rail', '[data-testid="tower-rail"]', 'The tool rail', 'Select, move, rotate, push and pull.',
    'The modelling tools stand beside the model. Pick one and act on the tower in the view; typed values go in the panel.'),
  look('ui-results', '[data-panel="right"]', 'Results and evidence', 'The right panel: every check with its evidence.',
    'Each result shows its value, the threshold, its source with page or clause, and a flag: verified, team assumption, unverified or unresolved. In Presentation this panel holds the sheets\' tabs.'),
  look('ui-status', '[data-testid="status-bar"]', 'The status line', 'The evidence key, the data and its licences.',
    'The key explains the flags. The data line says where the site comes from. This is a study tool, not a compliance determination. Now try it: eight things to do.'),
  { id: 'site', part: 'do', route: 'guided', step: 'site', target: '[role="tablist"][aria-label="Project"]',
    title: 'Two sites', ask: 'Switch the site: Competition site or Real Vancouver.',
    body: 'The competition block comes with the brief\'s rules; Real Vancouver has the City\'s lots, terrain and the protected view cones. Everything else is the same model.',
    done: (snap) => useStore.getState().project !== snap.project,
    doIt: () => { const s = useStore.getState(); s.setProject(s.project === 'vtc' ? 'city' : 'vtc') } },
  { id: 'place', part: 'do', route: 'guided', project: 'vtc', step: 'volume', target: '[data-testid="phase-panel"]',
    title: 'Place a tower', ask: 'Start a tower: pick a case study on the left, or draw one from scratch.',
    body: 'A project opens empty. The cases are real Vancouver towers at true size; From scratch places a tower where you click.',
    done: (snap) => towerCount() > snap.towers,
    doIt: () => {
      const c = q('[data-case]'); if (c) { c.click(); return }
      const w = q('[data-start="case"]')
      if (w) { w.click(); setTimeout(() => { const c2 = q('[data-case]'); if (c2) c2.click(); else useStore.getState().addTower() }, 300) } else useStore.getState().addTower()
    } },
  { id: 'shape', part: 'do', route: 'guided', project: 'vtc', step: 'volume', target: '[data-testid="tower-rail"]',
    title: 'Shape it', ask: 'Change the tower: drag a face in the view, or edit its height in the panel.',
    body: 'The tools on the rail select, move, rotate, push and pull. Every check in the Workflow list runs again as the shape changes.',
    done: (snap) => snapshot().shape !== snap.shape && towerCount() > 0,
    doIt: () => { const s = useStore.getState(), t = s.towers[s.project][0]; if (t) s.updateTower(t.id, { height: t.height + 20 }); else s.addTower() } },
  { id: 'evidence', part: 'do', route: 'guided', project: 'vtc', step: 'volume', target: 'aside[aria-label="Results and evidence"]',
    title: 'Every result with its evidence', ask: 'Open a result on the right and read its source line.',
    body: 'Each line shows the value, the threshold, its source with page or clause, and a flag: verified, team assumption, unverified or unresolved. Nothing is hidden.' },
  { id: 'views', part: 'do', route: 'guided', project: 'vtc', step: 'volume', target: '[data-testid="view-2d3d"]',
    title: 'Plan, elevation, axo', ask: 'Open 2D for a plan or an elevation, or 3D for a corner in Axo or Iso.',
    body: 'The locked views at the bottom of the model: Plan, North, South, East and West cut into the street in front of the building; the corners are true axonometric or isometric.',
    done: (snap) => useVistaLook.getState().mode !== snap.look,
    doIt: () => useVistaLook.setState({ mode: 'plan' }) },
  { id: 'schematic', part: 'do', route: 'guided', project: 'vtc', step: 'program', target: '[data-testid="phase-next"]',
    title: 'Schematic: can it be built?', ask: 'Go to the next phase, Schematic (or press 2).',
    body: 'The clay turns into an x-ray: floor plates, core, lifts, stairs and plant. The core sizes itself to the lift and egress checks.',
    done: () => useStep.getState().step === 'plates',
    doIt: () => goToStep('plates') },
  { id: 'present', part: 'do', route: 'guided', project: 'vtc', step: 'plates', target: '[data-testid="page-toggle"]',
    title: 'Presentation', ask: 'Switch to Presentation in the top bar (or press V).',
    body: 'The sheets: true-scale drawings from the model, captures and renders, four A2 boards or an architectural set, with the submission checks beside them.',
    done: () => useStep.getState().step === 'frame',
    doIt: () => setMode('presentation') },
  { id: 'export', part: 'do', route: 'guided', project: 'vtc', step: 'frame', target: '[data-testid="panel-export"]',
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
