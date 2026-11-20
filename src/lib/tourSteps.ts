// The interactive tour's steps (lib/tour.ts runs them): eight, one round (Sinnie, 20 Nov: "combine the two rounds, and
// can you add a demo clips as you go through the main features"). Each step rings one part of the screen, says what it
// is, plays a short clip of the thing being done (public/tour/*.webm, recorded headless from this app with
// scratchpad tour-clips.mjs), and asks for it; the card watches the app's state until it is done, and "Show me" does it
// for the person. Sites → the left panel (place a tower) → the model and its tools (shape it) → results and evidence →
// 2D / 3D views → View modes → Schematic → Presentation and Export. This module reaches into the app's stores, so it
// is loaded only when the tour starts: the start page stays small.
import { useStore, type ProjectKind } from '../store'
import { useDisplayMode } from './displayMode'
import { enterToolkit } from './intro'
import { setMode } from './mode'
import { navigate, type Route } from './route'
import { goToStep, useStep, type StepId } from './step'
import { useVistaLook } from './vistaLook'

/** What the app looked like when a step opened: a step is done when the person has changed the thing it asked for. */
export interface Snap { project: ProjectKind; towers: number; shape: string; look: string; display: string; tab: string; step: StepId }
const q = (sel: string) => document.querySelector<HTMLElement>(sel)
const rightTab = () => q('[data-panel="right"] [role="tab"][aria-selected="true"]')?.id ?? ''
export const snapshot = (): Snap => {
  const s = useStore.getState(), t = s.towers[s.project][0]
  return { project: s.project, towers: s.towers[s.project].length, shape: t ? JSON.stringify([t.height, t.x, t.y, t.rotation, t.blocks, t.podiumHeight]) : '', look: useVistaLook.getState().mode, display: useDisplayMode.getState().mode, tab: rightTab(), step: useStep.getState().step }
}

export interface TourStep {
  id: string
  title: string
  /** One thing to do, in a line. */
  ask: string
  /** What this part of the screen is, in a few lines (behind the ask, smaller). */
  body: string
  route: Route
  project?: ProjectKind
  step?: StepId
  /** Element to point at (CSS selector; the first that exists); the card sits away from it. */
  target?: string
  /** The clip's name under public/tour (a webm and a png poster). */
  clip?: string
  /** True once the person has done it (polled); a step without one is read and passed with Next. */
  done?: (snap: Snap) => boolean
  /** Does it for the person ("Show me"). */
  doIt?: () => void
}

const towerCount = () => { const s = useStore.getState(); return s.towers[s.project].length }

export const TOUR: TourStep[] = [
  { id: 'site', route: 'guided', step: 'site', target: '[role="tablist"][aria-label="Project"]', clip: 'site',
    title: 'Two sites', ask: 'Switch the site: Competition site or Real Vancouver.',
    body: 'The top bar holds the project and its two sites, the Model / Presentation switch, Capture and More. The competition block comes with the brief\'s rules; Real Vancouver has the City\'s lots, terrain and the protected view cones. Everything else is the same model.',
    done: (snap) => useStore.getState().project !== snap.project,
    doIt: () => { const s = useStore.getState(); s.setProject(s.project === 'vtc' ? 'city' : 'vtc') } },
  { id: 'place', route: 'guided', project: 'vtc', step: 'volume', target: '[data-testid="phase-panel"]', clip: 'place',
    title: 'The left panel: phases and tools', ask: 'Start a tower: Case study on the left, or From scratch.',
    body: 'Five phases, Site, Form, Program, Schematic and Presentation, each with its tools in working order; the line at the top shows where you are (keys 1 to 5). The open tool\'s controls sit under the list. Massing offers four ways to start; the cases are real towers at true size.',
    done: (snap) => towerCount() > snap.towers,
    doIt: () => {
      const c = q('[data-case]'); if (c) { c.click(); return }
      const w = q('[data-start="case"]')
      if (w) { w.click(); setTimeout(() => { const c2 = q('[data-case]'); if (c2) c2.click(); else useStore.getState().addTower() }, 300) } else useStore.getState().addTower()
    } },
  { id: 'shape', route: 'guided', project: 'vtc', step: 'volume', target: '[data-testid="tower-card"], [data-testid="tower-rail"]', clip: 'shape',
    title: 'The model and its tools', ask: 'Change the tower: Scale, Move or Rotate it from its toolbar.',
    body: 'Drag to orbit, scroll to zoom, right-drag to pan. Click a tower to select it and its toolbar appears: Move, Rotate, Scale, Align, Snap, Basement. The rail beside the model draws masses and pushes, pulls and splits them. Every change runs the checks again.',
    done: (snap) => snapshot().shape !== snap.shape && towerCount() > 0,
    doIt: () => { const s = useStore.getState(), t = s.towers[s.project][0]; if (t) s.updateTower(t.id, { height: t.height + 20 }); else s.addTower() } },
  { id: 'evidence', route: 'guided', project: 'vtc', step: 'volume', target: '[data-panel="right"]', clip: 'evidence',
    title: 'Results and evidence', ask: 'Open the Results tab and read a result\'s source line.',
    body: 'The right panel\'s tabs: Your site (the lot, the rules, the context), Results (every check), Trace (how a result was reached); Properties while a tower is being placed; Present and Render in Presentation. Each result shows its value, the threshold, its source with page or clause, and a flag: verified, team assumption, unverified or unresolved.',
    done: (snap) => rightTab() === 'rp-tab-results' && snap.tab !== 'rp-tab-results',
    doIt: () => q('#rp-tab-results')?.click() },
  { id: 'views', route: 'guided', project: 'vtc', step: 'volume', target: '[data-testid="view-bar"]', clip: 'views',
    title: 'Plan, elevation, axo', ask: 'Open 2D for a plan or an elevation, or 3D for a corner in Axo or Iso.',
    body: 'The view bar under the model: Capture keeps the view for the sheets, Frame brings the site back, 2D holds the plan and the four elevations (cut into the street in front of the building), 3D the free orbit and the corners as true axonometric or isometric.',
    done: (snap) => useVistaLook.getState().mode !== snap.look,
    doIt: () => useVistaLook.setState({ mode: 'plan' }) },
  { id: 'modes', route: 'guided', project: 'vtc', step: 'volume', target: '[data-testid="view-menu-button"]', clip: 'modes',
    title: 'View modes', ask: 'Switch the View mode: Building use, Analysis, Materials or Façade.',
    body: 'Geometry is the neutral clay. Building use colours the floors by what they are. Analysis shows one measured quantity with its legend. Materials and Façade show the skin. Pin view keeps one while tools change; the sun sits in the same menu.',
    done: (snap) => useDisplayMode.getState().mode !== snap.display,
    doIt: () => useDisplayMode.getState().setMode(useDisplayMode.getState().mode === 'program' ? 'massing' : 'program') },
  { id: 'schematic', route: 'guided', project: 'vtc', step: 'program', target: '[data-testid="phase-next"]', clip: 'schematic',
    title: 'Schematic: can it be built?', ask: 'Go to the next phase, Schematic (or press 2).',
    body: 'The arrows at the foot of the workflow step through the phases. In Schematic the clay turns into an x-ray: floor plates, core, lifts, stairs and plant. The core sizes itself to the lift and egress checks.',
    done: () => useStep.getState().step === 'plates',
    doIt: () => goToStep('plates') },
  { id: 'present', route: 'guided', project: 'vtc', step: 'plates', target: '[data-testid="page-toggle"]', clip: 'present',
    title: 'Presentation and Export', ask: 'Switch to Presentation (top bar, or V), then open the Export tab.',
    body: 'The sheets: true-scale drawings from the model, captures and renders, four A2 boards or an architectural set, with the submission checks beside them. Export gives the sheets as JPEG, PNG or PDF, the model as Rhino .3dm, OBJ or glTF, and the project as a file that opens again here. That is the tour: the rest is yours.',
    done: () => !!q('aside[aria-label="Export"]'),
    doIt: () => { setMode('presentation'); setTimeout(() => q('[data-testid="panel-export"]')?.click(), 900) } },
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
