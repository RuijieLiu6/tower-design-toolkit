// Which protected view cones are drawn in Real Vancouver (Ruijie, 3 Nov: the Viewcone tab turns them all on or all off; at first "allow the users to show and
// hide viewcone layers"). One store for the Viewcone tab's panel and the Layers dock, so the two never disagree; the
// cone drawing (components/VistaCones.tsx) and the cone overlays on buildings and towers read it. Display only: hiding a
// cone never changes a check, a limit or a result.
import { create } from 'zustand'
import { CONES, CONE_PARAMS, type ConeCheck } from '../engine/viewCones'

interface ConeVisibility {
  /** Per cone id; a cone missing here is shown. */
  hidden: Record<string, boolean>
  /** The cone picked in Observer (else the one controlling the study tower is featured). */
  picked: string | null
}

export const useConeVisibility = create<ConeVisibility>(() => ({ hidden: {}, picked: null }))

export const isConeShown = (hidden: Record<string, boolean>, id: string) => !hidden[id]

export function showAllCones(on: boolean) {
  useConeVisibility.setState({ hidden: on ? {} : Object.fromEntries(CONES.map((c) => [c.id, true])) })
}

/** Only the given cones (the ones over the study site), the rest hidden. */
export function showOnlyCones(ids: string[]) {
  const keep = new Set(ids)
  useConeVisibility.setState({ hidden: Object.fromEntries(CONES.filter((c) => !keep.has(c.id)).map((c) => [c.id, true])) })
}

export function toggleCone(id: string) {
  useConeVisibility.setState((s) => ({ hidden: { ...s.hidden, [id]: !s.hidden[id] } }))
}

/** The cones a tower's footprint touches (the view-cone check's own states: inside or within the near-edge band). */
export const conesOverSite = (checks: ConeCheck[]) => checks.filter((k) => k.state !== 'outside').map((k) => k.cone.id)

/**
 * The cone that controls a tower: among the cones over it with a City-sourced estimate, the lowest limit; else the
 * first cone over it (no estimate); else none. Same numbers as the view-cone check.
 */
export function controllingCone(checks: ConeCheck[]): string | null {
  const over = checks.filter((k) => k.state !== 'outside')
  const limited = over.filter((k) => k.limit !== null).sort((a, b) => a.limit! - b.limit!)
  return limited[0]?.cone.id ?? over[0]?.cone.id ?? null
}

/** Short summary for headers: "24 of 24 shown". */
export function shownSummary(hidden: Record<string, boolean>): string {
  const n = CONES.filter((c) => !hidden[c.id]).length
  return n === CONES.length ? `all ${n} shown` : n === 0 ? 'all hidden' : `${n} of ${CONES.length} shown`
}

/** Cones with a City-sourced estimate, for labels. */
export const hasEstimate = (id: string) => !!CONE_PARAMS[id]
