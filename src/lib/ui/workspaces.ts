// Workspaces (Ruijie, 17 Nov: "like the presets for changing the page in Adobe Illustrator … Getting Started, Essential,
// Classic and Manage Workspace … so users set the tools they want to keep while working and where the tools sit"). A
// workspace is the arrangement of the interface, never the design: which parts show (the Interface drawer's registry,
// lib/ui/registry.ts), whether each side panel is open and how wide, the tool rail (showing, which side) and the view
// (3D, model + data graph, data graph). Three come built in; your own are made from the current arrangement, renamed,
// updated or removed. Switching applies at once; like Illustrator, the arrangement you then change stays yours until
// Reset puts the workspace back as saved. Kept in this browser (ts.workspaces), not in the project file.
import { create } from 'zustand'
import { setUiHidden, useUiVisibility } from './registry'
import { usePanelWidths, usePanels } from '../panels'
import { useToolRail, type RailSide } from '../toolRail'
import { useStore, type ViewMode } from '../../store'

export interface WorkspaceLayout {
  /** Hidden parts (registry ids). */
  hidden: string[]
  panels: { left: boolean; right: boolean }
  /** Panel widths of their own (px); absent = the default width. */
  widths: { left?: number; right?: number }
  rail: { hidden: boolean; side: RailSide }
  view: ViewMode
}
export interface Workspace { id: string; name: string; builtIn?: boolean; hint?: string; layout: WorkspaceLayout }

const open = { left: true, right: true }
const rail = (side: RailSide = 'left') => ({ hidden: false, side })

/** The built-in workspaces: a short start, everything, and the model beside the data graph. */
export const BUILT_IN: Workspace[] = [
  {
    id: 'getting-started', name: 'Getting Started', builtIn: true,
    hint: 'The fewest parts: the guided steps, the design tools, the results. Advanced edit modes, the view buttons, Auto-run, Trace and sync links are tucked away (the Interface drawer brings any back).',
    layout: {
      hidden: ['topbar.view-buttons', 'topbar.autorun', 'left.workflow.add', 'tools.modes.face', 'tools.modes.mass', 'viewport.edit-readout', 'viewport.working-view', 'right.tab.trace', 'addons.sync'],
      panels: open, widths: {}, rail: rail(), view: '3d',
    },
  },
  {
    id: 'essentials', name: 'Essentials', builtIn: true,
    hint: 'Everything shown, both panels at their default widths, the tool rail on the left of the model, the 3D view.',
    layout: { hidden: [], panels: open, widths: {}, rail: rail(), view: '3d' },
  },
  {
    id: 'classic', name: 'Classic', builtIn: true,
    hint: 'The model beside the data graph, like Rhino with Grasshopper: everything shown, a narrow phase panel, the tool rail on the right of the model, a wider results panel.',
    layout: { hidden: [], panels: open, widths: { left: 240, right: 360 }, rail: rail('right'), view: 'split' },
  },
]
export const DEFAULT_WORKSPACE = 'essentials'

// ---------------------------------------------------------------- the arrangement now, and applying one
export function currentLayout(): WorkspaceLayout {
  const p = usePanels.getState(), w = usePanelWidths.getState(), r = useToolRail.getState()
  return {
    hidden: Object.keys(useUiVisibility.getState().hidden).sort(),
    panels: { left: p.left, right: p.right },
    widths: { ...(w.left != null ? { left: w.left } : {}), ...(w.right != null ? { right: w.right } : {}) },
    rail: { hidden: r.hidden, side: r.side },
    view: useStore.getState().view,
  }
}
export function applyLayout(l: WorkspaceLayout) {
  setUiHidden(l.hidden)
  usePanels.setState({ left: l.panels.left, right: l.panels.right })
  usePanelWidths.setState({ ...l.widths }, true)
  useToolRail.setState({ hidden: l.rail.hidden, side: l.rail.side })
  useStore.getState().setView(l.view)
}
/** Same arrangement (hidden order does not matter). */
export function sameLayout(a: WorkspaceLayout, b: WorkspaceLayout): boolean {
  const ha = [...a.hidden].sort().join('|'), hb = [...b.hidden].sort().join('|')
  return ha === hb && a.panels.left === b.panels.left && a.panels.right === b.panels.right
    && (a.widths.left ?? null) === (b.widths.left ?? null) && (a.widths.right ?? null) === (b.widths.right ?? null)
    && a.rail.hidden === b.rail.hidden && a.rail.side === b.rail.side && a.view === b.view
}

// ---------------------------------------------------------------- the store, per browser
const KEY = 'ts.workspaces'
interface Saved { active: string; mine: Workspace[] }
const isLayout = (l: unknown): l is WorkspaceLayout => {
  const v = l as WorkspaceLayout
  return !!v && Array.isArray(v.hidden) && !!v.panels && !!v.rail && typeof v.view === 'string' && !!v.widths
}
function read(): Saved {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Saved> | null
    const mine = Array.isArray(v?.mine) ? v!.mine.filter((w) => w && typeof w.id === 'string' && typeof w.name === 'string' && isLayout(w.layout)).map((w) => ({ ...w, builtIn: false })) : []
    const active = typeof v?.active === 'string' && [...BUILT_IN, ...mine].some((w) => w.id === v.active) ? v.active : DEFAULT_WORKSPACE
    return { active, mine }
  } catch { return { active: DEFAULT_WORKSPACE, mine: [] } }
}
export const useWorkspaces = create<Saved>(() => (typeof window !== 'undefined' ? read() : { active: DEFAULT_WORKSPACE, mine: [] }))
useWorkspaces.subscribe((s) => { try { localStorage.setItem(KEY, JSON.stringify(s)) } catch { /* this visit only */ } })

export const allWorkspaces = (s: Saved = useWorkspaces.getState()) => [...BUILT_IN, ...s.mine]
export const workspaceById = (id: string, s: Saved = useWorkspaces.getState()) => allWorkspaces(s).find((w) => w.id === id)

/** Switch to a workspace: its arrangement applies at once. */
export function switchWorkspace(id: string) {
  const w = workspaceById(id)
  if (!w) return
  applyLayout(w.layout)
  useWorkspaces.setState({ active: id })
}
/** Put the active workspace back as it was saved. */
export const resetWorkspace = () => switchWorkspace(useWorkspaces.getState().active)

const cleanName = (name: string) => name.replace(/\s+/g, ' ').trim().slice(0, 40)
/** Why a name cannot be used, or null. */
export function nameProblem(name: string, except?: string): string | null {
  const n = cleanName(name)
  if (!n) return 'Give the workspace a name.'
  if (allWorkspaces().some((w) => w.id !== except && w.name.toLowerCase() === n.toLowerCase())) return `There is already a workspace called "${n}".`
  return null
}
/** A new workspace from the current arrangement; it becomes the active one. */
export function newWorkspace(name: string): Workspace | null {
  if (nameProblem(name)) return null
  const w: Workspace = { id: `mine-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, name: cleanName(name), layout: currentLayout() }
  useWorkspaces.setState((s) => ({ mine: [...s.mine, w], active: w.id }))
  return w
}
export function renameWorkspace(id: string, name: string): boolean {
  if (nameProblem(name, id)) return false
  useWorkspaces.setState((s) => ({ mine: s.mine.map((w) => (w.id === id ? { ...w, name: cleanName(name) } : w)) }))
  return true
}
/** Save the current arrangement into one of your workspaces. */
export function updateWorkspace(id: string) {
  const layout = currentLayout()
  useWorkspaces.setState((s) => ({ mine: s.mine.map((w) => (w.id === id ? { ...w, layout } : w)) }))
}
/** Remove one of your workspaces; if it was active, Essentials becomes active (the arrangement stays as it is). */
export function deleteWorkspace(id: string) {
  useWorkspaces.setState((s) => ({ mine: s.mine.filter((w) => w.id !== id), active: s.active === id ? DEFAULT_WORKSPACE : s.active }))
}

/** The active workspace and whether the arrangement has moved away from it (for "Reset" and the "changed" mark). */
export function useActiveWorkspace(): { workspace: Workspace; changed: boolean } {
  const s = useWorkspaces()
  // read every part of the arrangement, so the mark follows any change
  useUiVisibility((x) => x.hidden); usePanels(); usePanelWidths(); useToolRail(); useStore((x) => x.view)
  const workspace = workspaceById(s.active, s) ?? BUILT_IN[1]
  return { workspace, changed: !sameLayout(workspace.layout, currentLayout()) }
}
