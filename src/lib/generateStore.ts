// The Generate tool's inputs (Volume step): the brief per project, the typology and its parameters, the street side and
// the variation, kept for the browser session. Running and placing go through engine/dtmassGen.ts (Sinnie Choi's
// generator) and lib/generateTowers.ts.
import { useMemo } from 'react'
import { create } from 'zustand'
import { VTC_NORTH_DEG } from '../context'
import { defaultBrief, generate, genDefaults, type GenBrief, type GenKey, type GenParams, type GenResult, type Side } from '../engine/dtmassGen'
import { useStore, type ProjectKind } from '../store'
import { cityRect, placeGenerated, vtcSiteRect, type Placed, type SiteRect } from './generateTowers'
import { useImportStore } from './import/store'
import { breakStep } from './project/history'

/**
 * Starting briefs (team assumptions until the user enters theirs). Real Vancouver: Sinnie's own default brief, without
 * parking (the Toolkit counts area above grade). Competition: a supertall in the brief's 244–305 m band on its
 * 11,468 m² block (the default tower is 285 m), mixed use.
 */
export function startingBrief(project: ProjectKind): GenBrief {
  if (project === 'city') return { ...defaultBrief(), parkingLevels: 0 }
  return { ...defaultBrief(), gfa: 120000, plate: 1800, heightTarget: 285, parkingLevels: 0, mix: { residential: 50, hotel: 15, office: 25, retail: 6, restaurant: 2, amenity: 2 } }
}

interface GenState {
  key: GenKey
  params: Record<GenKey, GenParams>
  brief: Record<ProjectKind, GenBrief>
  frontage: Record<ProjectKind, Side>
  seed: number
  /** What the last placement said (towers placed, notes). */
  placed: { label: string; towers: number; notes: string[] } | null
  set: (patch: Partial<Omit<GenState, 'set'>>) => void
}

export const useGenerate = create<GenState>((set) => ({
  key: 'podium',
  params: { slender: genDefaults('slender'), podium: genDefaults('podium'), split: genDefaults('split'), court: genDefaults('court') },
  brief: { vtc: startingBrief('vtc'), city: startingBrief('city') },
  frontage: { vtc: 'S', city: 'S' },
  seed: 0,
  placed: null,
  set: (patch) => set(patch),
}))

/** The generator's site rectangle for the open project; null in Real Vancouver until a study site is set. */
export function useSiteRect(): SiteRect | null {
  const project = useStore((s) => s.project)
  const site = useStore((s) => s.citySite)
  return useMemo(() => (project === 'vtc' ? vtcSiteRect() : site?.ring.length ? cityRect(site.ring, site.label ?? 'Study site') : null), [project, site])
}

/** The generated result for the current inputs (null without a site). */
export function runGenerator(f: SiteRect, project: ProjectKind, s: Pick<GenState, 'key' | 'params' | 'brief' | 'frontage'>, seed: number): GenResult {
  return generate({ w: f.w, d: f.d, frontage: s.frontage[project], area: f.area }, s.brief[project], s.key, s.params[s.key], seed, { plateLimit: project === 'city' ? 605 : null })
}

/** Replaces the project's towers with the generated massing (one undo step); the courtyard's mesh goes to the import store. */
export function applyGenerated(r: GenResult, f: SiteRect): Placed {
  const s = useStore.getState()
  const placed = placeGenerated(r, f, { liftPresets: s.liftPresets, egressPresets: s.egressPresets }, `gen${Date.now().toString(36)}`, s.project === 'vtc' ? VTC_NORTH_DEG : 0)
  if (placed.mesh) useImportStore.getState().putMesh(placed.mesh.id, placed.mesh.entry)
  breakStep() // its own undo step, even right after another edit
  useStore.setState({ towers: { ...s.towers, [s.project]: placed.towers }, selectedTower: placed.towers[0]?.id ?? '', placing: false, announce: `Placed ${r.label}: ${placed.towers.length} tower${placed.towers.length === 1 ? '' : 's'}` })
  useGenerate.setState({ placed: { label: r.label, towers: placed.towers.length, notes: placed.notes } })
  return placed
}
