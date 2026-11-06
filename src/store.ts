import { create } from 'zustand'
import type { FsrTier } from './engine/vtcRules'
import type { Band, Tower } from './engine/types'
import { BUILT_NODES, DEFAULT_ON } from './data/registry'
import { DEFAULT_LIFT_PRESETS, withAutoCore, type LiftPresets } from './engine/lifts'
import { applyTowerPatch, migrateTower } from './engine/massing'
import { DEFAULT_EGRESS_PRESETS, type EgressPresets } from './engine/egress'
import { DEFAULT_PUBLIC_REALM, type PublicRealmInput } from './engine/publicRealm'
import { DEFAULT_NATURE, type NatureInput } from './engine/cityInNature'
import { DEFAULT_WIND_PRESETS, type WindPresets } from './engine/windStructure'
import { DEFAULT_SYSTEMS_PRESETS, type SystemsPresets } from './engine/lifeSafety'
import type { SkyRoom } from './engine/types'
import type { AiMeta } from './engine/renderPrompt'
import type { InterchangeModel } from './lib/interchange/model'
import type { StudySite } from './engine/site'

/** Defaults for a newly opened public sky room (all team assumptions, research P06-M07 and P11-M02). */
export const DEFAULT_SKY_ROOM: Omit<SkyRoom, 'level'> = { access: 'shared', free: true, hoursOpen: 12, visitorShare: 0.6, loadBasis: 'dining', visitMinutes: 60, postedLimit: null }

/** A sky room only exists on one of the tower's sky lobbies. */
const keepRoomValid = (t: Tower): Tower => (t.skyRoom && !(t.skyLobbies ?? []).includes(t.skyRoom.level) ? { ...t, skyRoom: null } : t)

/** Internal stage ids: basic = Massing, advanced = Schematic, present = Present. */
export type Phase = 'basic' | 'advanced' | 'present'
export type ViewMode = '3d' | 'canvas' | 'split'
export type ProjectKind = 'vtc' | 'city'
export type Representation = 'clay' | 'xray'
export type GroundMode = 'terrain' | 'manual'

/** Local origin of the "Real Vancouver" project, in EPSG:26910 (downtown peninsula). */
export const CITY_ORIGIN: [number, number] = [491300, 5458600]

const defaultBands: Band[] = [
  { use: 'office', share: 0.55 },
  { use: 'hotel', share: 0.15 },
  { use: 'amenity', share: 0.03 },
  { use: 'residential', share: 0.27 },
]

const vtcTower = (): Tower => ({
  id: 't1', name: 'Tower 1', x: -20, y: 0, rotation: 0, width: 46, depth: 46, height: 285, f2f: 4.2,
  podiumHeight: 18, podiumWidth: 100, podiumDepth: 64, podiumUse: 'retail', bands: defaultBands, coreShare: 0.25, plantEvery: 0,
  coreAuto: true, skyLobbies: [],
})

// City project: default tower inside view cone 3.2.3 (evaluation case 5), so the check has something to say.
const cityTower = (): Tower => ({
  id: 'c1', name: 'Study tower', x: 491636 - CITY_ORIGIN[0], y: 5458756 - CITY_ORIGIN[1], rotation: 0, width: 30, depth: 30,
  height: 120, f2f: 4, podiumHeight: 0, podiumWidth: 30, podiumDepth: 30, podiumUse: 'retail', bands: [{ use: 'office', share: 1 }], coreShare: 0.25, plantEvery: 0,
  coreAuto: true, skyLobbies: [],
})

export interface Shot { id: string; dataUrl: string; stage: Phase; representation: Representation | 'plan'; project: ProjectKind; at: string; /** AI render imported from the render workflow (always labelled AI-generated). */ ai?: AiMeta }

const prefersReduced = () => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches } catch { return false } }

interface State {
  project: ProjectKind
  phase: Phase
  /** Stage we came from, so transitions know their direction. */
  prevPhase: Phase
  view: ViewMode
  towers: Record<ProjectKind, Tower[]>
  /** Uploaded model per project (Layer 0 interchange, lib/interchange): elements by role with provenance; null = none. */
  models: Record<ProjectKind, InterchangeModel | null>
  /** Real Vancouver study site (engine/site.ts, Integrate Vista): drawn, from buildings or parcels, or GeoJSON; null = none. */
  citySite: StudySite | null
  selectedTower: string
  enabled: Record<string, boolean>
  selectedNode: string | null
  fsrTier: FsrTier
  transitLink: boolean
  groundElevation: number
  /** Real Vancouver base: follow the terrain under the selected tower (default) or a value set by hand. */
  groundMode: GroundMode
  sun: { month: number; day: number; hour: number }
  placing: boolean
  showOnboarding: boolean
  libraryQuery: string
  /** Camera request in the model frame (x, y, z-up); a new object each time so repeats re-apply. */
  cameraRequest: { position: [number, number, number]; target: [number, number, number]; fov?: number } | null
  // Schematic tools
  anatomy: { plates: boolean; core: boolean; plant: boolean; shell: boolean; lifts: boolean; stairs: boolean }
  /** Core & lift check presets (team assumptions, editable in Schematic). */
  liftPresets: LiftPresets
  /** Egress presets (stairs, riser and tread, bedrooms per home, office corridors). */
  egressPresets: EgressPresets
  /** Competition site: per-street frontage inputs, open space, mid-block link and station entrance (public realm checks). */
  publicRealm: PublicRealmInput
  /** City in Nature ledger inputs (entered by the designer until P05-M02..M08 compute them). */
  cityInNature: NatureInput
  /** Wind procedure presets: the engineer's model frequency and the tall-tower tunnel default (team assumption). */
  windPresets: WindPresets
  /** Code & life safety: plant, riser and emergency-power presets (all team assumptions, research P11-M03). */
  systemsPresets: SystemsPresets
  sectionOn: boolean
  sectionLevel: number
  explode: boolean
  // Present
  presentRep: Representation
  /** Present: the board shows the 3D view or a floor plan drawing. */
  boardView: '3d' | 'plan'
  /** Present: level of the floor plan drawing (null = the typical floor). */
  planLevel: number | null
  /** Present: show the indicative structural grid on the plan. */
  planGrid: boolean
  shots: Shot[]
  reducedMotion: boolean
  announce: string
  setProject: (p: ProjectKind) => void
  setPhase: (p: Phase) => void
  setView: (v: ViewMode) => void
  updateTower: (id: string, patch: Partial<Tower>) => void
  addTower: () => void
  removeTower: (id: string) => void
  selectTower: (id: string) => void
  toggleNode: (id: string) => void
  setEnabled: (ids: string[]) => void
  selectNode: (id: string | null) => void
  /** Counts the user's node picks (selectNode); the right panel shows Results on each. A project switch or a restore sets selectedNode without it. */
  resultsSeq: number
  addShot: (s: Shot) => void
  /** Change the lift presets and resize every core that follows its lifts. */
  setLiftPresets: (patch: Partial<LiftPresets>) => void
  /** Change the egress presets and resize every core that follows its lifts and stairs. */
  setEgressPresets: (patch: Partial<EgressPresets>) => void
  set: (patch: Partial<State>) => void
}

const STAGE_NAME: Record<Phase, string> = { basic: 'Massing', advanced: 'Schematic', present: 'Present' }

export const useStore = create<State>((set, get) => ({
  project: 'vtc',
  phase: 'basic',
  prevPhase: 'basic',
  view: '3d',
  towers: { vtc: [withAutoCore(migrateTower(vtcTower()))], city: [withAutoCore(migrateTower(cityTower()))] },
  models: { vtc: null, city: null },
  citySite: null,
  selectedTower: 't1',
  enabled: Object.fromEntries(DEFAULT_ON.map((id) => [id, true])),
  selectedNode: BUILT_NODES[0].id,
  fsrTier: 2,
  transitLink: false,
  // 15 m is only the placeholder until the terrain loads; in 'terrain' mode CityContext replaces it (decided by Ruijie, 27 Oct).
  groundElevation: 15,
  groundMode: 'terrain',
  sun: { month: 9, day: 22, hour: 12 },
  placing: false,
  showOnboarding: true,
  libraryQuery: '',
  cameraRequest: null,
  anatomy: { plates: true, core: true, plant: true, shell: true, lifts: true, stairs: true },
  liftPresets: DEFAULT_LIFT_PRESETS,
  egressPresets: DEFAULT_EGRESS_PRESETS,
  publicRealm: DEFAULT_PUBLIC_REALM,
  cityInNature: DEFAULT_NATURE,
  windPresets: DEFAULT_WIND_PRESETS,
  systemsPresets: DEFAULT_SYSTEMS_PRESETS,
  sectionOn: false,
  sectionLevel: 150,
  explode: false,
  presentRep: 'clay',
  boardView: '3d',
  planLevel: null,
  planGrid: true,
  shots: [],
  reducedMotion: prefersReduced(),
  announce: '',
  setProject: (project) => set({ project, selectedTower: get().towers[project][0]?.id ?? '', placing: false, selectedNode: project === 'city' ? 'built.viewcones' : 'built.vtc-rules' }),
  setPhase: (phase) => {
    const prev = get().phase
    if (prev === phase) return
    // Present opens with the representation last chosen there, Clay by default: the first capture is the board's massing
    // image, not Schematic's ghosted shell (run-through F5, 4 Nov). X-ray stays one click away.
    const presentRep: Representation = get().presentRep
    set({ phase, prevPhase: prev, placing: false, presentRep, announce: `${STAGE_NAME[phase]} stage` })
  },
  setView: (view) => set({ view }),
  updateTower: (id, patch) => set((s) => ({
    towers: {
      ...s.towers,
      [s.project]: s.towers[s.project].map((t) => {
        if (t.id !== id) return t
        // Setting the core share by hand switches the core to manual; otherwise an auto core follows its lifts.
        // Stacked blocks: edits of height, width, depth or the podium are mapped onto the blocks (engine/massing.ts).
        const merged: Tower = keepRoomValid(applyTowerPatch(t, { ...patch, ...('coreShare' in patch && patch.coreAuto === undefined ? { coreAuto: false } : {}) }))
        return withAutoCore(merged, s.liftPresets, s.egressPresets)
      }),
    },
  })),
  addTower: () => set((s) => {
    const list = s.towers[s.project]
    const base = list[list.length - 1] ?? migrateTower(vtcTower())
    const id = `t${Date.now().toString(36)}`
    // A copy without the podium, then 30 m lower (the height edit lands on the top block once the podium is gone).
    const bare: Tower = applyTowerPatch({ ...base, blocks: base.blocks?.map((b) => ({ ...b })) }, { id, name: `Tower ${list.length + 1}`, x: base.x + 50, podiumHeight: 0, bands: base.bands.map((b) => ({ ...b })), skyLobbies: [], skyRoom: null })
    const t = applyTowerPatch(bare, { height: Math.max(244, base.height - 30) })
    return { towers: { ...s.towers, [s.project]: [...list, withAutoCore(t, s.liftPresets, s.egressPresets)] }, selectedTower: id }
  }),
  removeTower: (id) => set((s) => {
    const list = s.towers[s.project].filter((t) => t.id !== id)
    return list.length ? { towers: { ...s.towers, [s.project]: list }, selectedTower: list[0].id } : {}
  }),
  selectTower: (selectedTower) => set({ selectedTower }),
  toggleNode: (id) => set((s) => ({ enabled: { ...s.enabled, [id]: !s.enabled[id] } })),
  setEnabled: (ids) => set({ enabled: Object.fromEntries(ids.map((id) => [id, true])) }),
  selectNode: (selectedNode) => set((s) => ({ selectedNode, resultsSeq: s.resultsSeq + 1 })),
  resultsSeq: 0,
  addShot: (shot) => set((s) => ({ shots: [shot, ...s.shots].slice(0, 12) })),
  setLiftPresets: (patch) => set((s) => {
    const liftPresets = { ...s.liftPresets, ...patch }
    const resize = (list: Tower[]) => list.map((t) => withAutoCore(t, liftPresets, s.egressPresets))
    return { liftPresets, towers: { vtc: resize(s.towers.vtc), city: resize(s.towers.city) } }
  }),
  setEgressPresets: (patch) => set((s) => {
    const egressPresets = { ...s.egressPresets, ...patch }
    const resize = (list: Tower[]) => list.map((t) => withAutoCore(t, s.liftPresets, egressPresets))
    return { egressPresets, towers: { vtc: resize(s.towers.vtc), city: resize(s.towers.city) } }
  }),
  set: (patch) => set(patch),
}))

export const useTowers = () => useStore((s) => s.towers[s.project])
export const STAGE_LABEL = STAGE_NAME
