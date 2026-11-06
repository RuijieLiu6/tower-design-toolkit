// Place the model on the site, then confirm (Ruijie, 6 Nov: "once you click link rhino, instruct the user to posit the
// building on the specific location and confirm site"; and "once the model is brought into the tool figure out a way to
// define the basement level with the users"). After an upload or the first Rhino copy, a short guide in the Rhino import
// tool (components/import/PlaceModelGuide.tsx) walks through: the site, where the building stands (click the ground,
// centre it on the site, line it up with the lot, move and turn it), its basement, then Confirm.
//
// The model moves as one piece: moving or turning one of its towers carries the others with it (while the guide is
// open, and always while the Rhino link is on, since Rhino keeps their relative positions). Every move becomes the link's
// placement (a model point on a project point, plus a turn), so Rhino's next change keeps the building where it was put.
import { create } from 'zustand'
import { ringMetrics } from '../../engine/site'
import { towerFootprint } from '../../engine/massing'
import type { Tower } from '../../engine/types'
import { useStore } from '../../store'
import type { InterchangeModel } from '../interchange/model'
import { linkProject, setLinkPlacement } from '../interchange/live'
import { withoutHistory } from '../project/history'
import { VTC_SITE } from '../siteGeometry'
import { cancelProposal, confirmProposal, normalizeDeg, pickTower, poseOf, samePose, useTowerEdit, type Pose } from '../towerEdit'

type Project = 'vtc' | 'city'
type Pt = [number, number]

export type GuideStep = 'place' | 'basement'
interface GuideState {
  active: boolean
  project: Project | null
  modelId: string | null
  step: GuideStep
}
export const usePlaceGuide = create<GuideState>(() => ({ active: false, project: null, modelId: null, step: 'place' }))

/** The site the model is placed on: the competition block, or the study site chosen in the Site step. */
export interface GuideSite { label: string; ring: Pt[]; area: number }
export function guideSite(s = useStore.getState()): GuideSite | null {
  if (s.project === 'vtc') return { label: 'the competition block', ring: VTC_SITE.ring as Pt[], area: ringMetrics(VTC_SITE.ring as Pt[]).area }
  const c = s.citySite
  if (!c || c.ring.length < 3) return null
  return { label: c.label ?? 'your study site', ring: c.ring as Pt[], area: ringMetrics(c.ring as Pt[]).area }
}

export const modelTowers = (s: ReturnType<typeof useStore.getState>, project: Project, modelId: string | null) =>
  modelId ? s.towers[project].filter((t) => t.imported?.source?.modelId === modelId) : []

// ---------- geometry (pure) ----------

/** Where `p` goes when the model is moved rigidly so that `from` lands on `to` (turned about `from`). */
export function rigidFollow(from: Pose, to: Pose, p: Pose): Pose {
  const d = to.rotation - from.rotation, r = (d * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r)
  const dx = p.x - from.x, dy = p.y - from.y
  return { x: to.x + dx * c - dy * s, y: to.y + dx * s + dy * c, rotation: normalizeDeg(p.rotation + d) }
}

/** The placement as it was built: each tower's pose, where the file centre landed, and the turn on top of north. */
export interface PlacementBase { poses: Record<string, Pose>; placed: Pt; fileCentre: Pt; turn: number }

export function baseOf(model: InterchangeModel, towers: Tower[]): PlacementBase {
  const pl = model.frame.placement
  return {
    poses: Object.fromEntries(towers.map((t) => [t.id, poseOf(t)])),
    placed: [pl.x, pl.y], fileCentre: pl.fileCentre, turn: pl.anchor?.turn ?? pl.earth?.turn ?? 0,
  }
}

const r3 = (v: number) => Math.round(v * 1000) / 1000
/** The anchor that rebuilds the model where tower `id` now stands: the file centre on its new spot, the turn added. */
export function anchorFor(base: PlacementBase, id: string, now: Pose): { model: Pt; city: Pt; turn: number } | null {
  const was = base.poses[id]
  if (!was) return null
  const c = rigidFollow(was, now, { x: base.placed[0], y: base.placed[1], rotation: 0 })
  const turn = Math.round(normalizeDeg(base.turn + now.rotation - was.rotation) * 1000) / 1000
  return { model: base.fileCentre, city: [r3(c.x), r3(c.y)], turn }
}

const segDist = (p: Pt, a: Pt, b: Pt) => {
  const vx = b[0] - a[0], vy = b[1] - a[1], L = vx * vx + vy * vy
  const t = L ? Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / L)) : 0
  return Math.hypot(p[0] - a[0] - t * vx, p[1] - a[1] - t * vy)
}
const edgeDist = (p: Pt, ring: Pt[]) => Math.min(...ring.map((a, i) => segDist(p, a, ring[(i + 1) % ring.length])))
function inside(p: Pt, ring: Pt[]): boolean {
  let k = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j]
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) k = !k
  }
  return k
}

/** Whether the model's footprint at grade sits on the site: inside, past the edge by up to `past` m, or off it. */
export interface SiteFit { state: 'pass' | 'warn' | 'fail'; past: number; text: string }
export function siteFit(towers: Tower[], ring: Pt[]): SiteFit {
  const pts = towers.flatMap((t) => towerFootprint(t, true) as Pt[])
  if (!pts.length) return { state: 'warn', past: 0, text: 'No footprint to check' }
  const out = pts.filter((p) => !inside(p, ring))
  if (!out.length) return { state: 'pass', past: 0, text: 'The building stands inside the site' }
  const past = Math.max(...out.map((p) => edgeDist(p, ring)))
  if (out.length === pts.length && !towers.some((t) => inside([t.x, t.y], ring))) {
    const away = Math.min(...towers.map((t) => edgeDist([t.x, t.y], ring)))
    return { state: 'fail', past, text: `Off the site: ${Math.round(away)} m from its edge` }
  }
  return { state: 'warn', past, text: `Up to ${past < 10 ? past.toFixed(1) : Math.round(past)} m past the site edge` }
}

// ---------- the watcher: the model moves as one piece, and the link keeps where it was put ----------

let base: (PlacementBase & { model: InterchangeModel }) | null = null
let last: Record<string, Pose> = {}
let stopWatch: (() => void) | null = null
let queued = false

/** One pass, after a change to the store (run after the undo history has recorded the change, see watchPlacement). */
export function placementTick() {
  const s = useStore.getState(), g = usePlaceGuide.getState()
  const project = s.project, model = s.models[project]
  const guided = g.active && g.project === project && !!model && g.modelId === model.id
  if (!model || !(guided || linkProject() === project)) { base = null; return }
  const ts = modelTowers(s, project, model.id)
  if (!ts.length) { base = null; if (guided) endPlaceGuide(); return }
  if (!base || base.model !== model) {
    // A new build (upload, Rhino update, a confirmed placement): it is the reference from now on.
    base = { ...baseOf(model, ts), model }
    last = { ...base.poses }
    return
  }
  const moved = ts.filter((t) => !last[t.id] || !samePose(last[t.id], poseOf(t)))
  if (!moved.length) return
  let now = ts
  if (moved.length === 1 && ts.length > 1 && last[moved[0].id]) {
    // One tower moved on its own: the others follow, folded into the same undo step.
    const m = moved[0], from = last[m.id], to = poseOf(m)
    const next = new Map(ts.filter((t) => t !== m).map((t) => [t.id, rigidFollow(from, to, poseOf(t))]))
    withoutHistory(() => useStore.setState((st) => ({ towers: { ...st.towers, [project]: st.towers[project].map((t) => (next.has(t.id) ? { ...t, ...next.get(t.id)! } : t)) } })))
    now = modelTowers(useStore.getState(), project, model.id)
  }
  last = Object.fromEntries(now.map((t) => [t.id, poseOf(t)]))
  const lead = now.find((t) => base!.poses[t.id])
  const a = lead ? anchorFor(base, lead.id, poseOf(lead)) : null
  if (a) setLinkPlacement({ placement: 'anchor', anchor: a })
}

/** Starts the watcher once (the guide and the Rhino link call it). */
export function watchPlacement() {
  if (stopWatch) return
  stopWatch = useStore.subscribe(() => {
    if (queued) return
    queued = true
    // After the history has taken the change as a step, so the towers that follow fold into that same step.
    queueMicrotask(() => { queued = false; placementTick() })
  })
}

/** For tests: forget the reference and stop watching. */
export function resetPlacementWatch() { stopWatch?.(); stopWatch = null; base = null; last = {}; queued = false }

// ---------- the guide ----------

/** Opens the guide for the model just uploaded: its first tower picked, placing on (a click on the ground moves it). */
export function startPlaceGuide(project: Project, modelId: string) {
  watchPlacement()
  const s = useStore.getState()
  const ts = modelTowers(s, project, modelId)
  if (!ts.length || s.phase === 'present') return
  usePlaceGuide.setState({ active: true, project, modelId, step: 'place' })
  base = null
  placementTick()
  pickTower(ts[0].id)
  s.set({ placing: true })
}

export const setGuideStep = (step: GuideStep) => usePlaceGuide.setState({ step })

/** Closes the guide without confirming (the model stays where it is; the Import tool offers the guide again). */
export function endPlaceGuide() {
  if (useTowerEdit.getState().proposal) cancelProposal()
  const s = useStore.getState()
  if (s.placing) s.set({ placing: false })
  usePlaceGuide.setState({ active: false, step: 'place' })
}

/**
 * Confirm: a click still waiting in the toolbar is taken first; the placement is written to the model (as an anchor,
 * with the site and the time) and to the link, and the guide closes. Returns false when there is nothing to confirm.
 */
export function confirmPlacement(now = () => new Date()): boolean {
  const g = usePlaceGuide.getState()
  if (!g.active || !g.project) return false
  if (useTowerEdit.getState().proposal) confirmProposal()
  placementTick()
  const s = useStore.getState(), model = s.models[g.project]
  const ts = modelTowers(s, g.project, model?.id ?? null)
  if (!model || model.id !== g.modelId || !ts.length || !base) { endPlaceGuide(); return false }
  const lead = ts.find((t) => base!.poses[t.id]) ?? ts[0]
  const a = anchorFor(base, lead.id, poseOf(lead)) ?? { model: base.fileCentre, city: base.placed, turn: base.turn }
  const site = guideSite(s)
  const placement = { ...model.frame.placement, mode: 'anchor', x: a.city[0], y: a.city[1], anchor: a, confirmed: { at: now().toISOString(), site: site?.label ?? 'no site chosen' } }
  const fit = site ? siteFit(ts, site.ring) : null
  useStore.setState({
    models: { ...s.models, [g.project]: { ...model, frame: { ...model.frame, placement } } },
    announce: `${model.source.fileName} placed${site ? ` on ${site.label}` : ''} and confirmed${fit && fit.state !== 'pass' ? ` (${fit.text.toLowerCase()})` : ''}. ${linkProject() === g.project ? "Rhino's next changes keep this placement." : ''}`.trim(),
  })
  setLinkPlacement({ placement: 'anchor', anchor: a })
  endPlaceGuide()
  return true
}
