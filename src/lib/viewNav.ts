// Viewport navigation (Milestone 1, Ruijie, 9 Nov: "I currently find it difficult to locate myself in the Vancouver model
// and move reliably between city scale, site scale, and building scale"). One set of camera commands for both projects,
// each framing real geometry rather than a fixed distance (after Rhino's Zoom Selected / Extents, Blender's Frame
// Selected / Frame All, Revit's Home view and MapLibre's fit-to-bounds with padding for the overlays):
//   Frame site        the study boundary (and any tower standing on it) with the streets around it; works with no tower
//   Frame selection   the inspected building, the buildings picked on the map, the picked tower, or the address marker
//   Frame tower       the selected proposed tower; unavailable, with the reason, when there is none
//   Neighbourhood     about 900 m around the site (or the selection), to read streets and blocks
//   City overview     the wide Vancouver view (Vista's overview); on the competition site, the context overview
//   Plan view / 3D    north up from straight above the site or selection; and back to an oblique view of the same place
//   Home              the project's working view: a view the user set as Home for this site, else the site from the south
// Framing keeps the current bearing and a readable tilt, fits the subject into the part of the view the overlays leave
// free (`viewInsets`), and leaves about 15% of breathing room on each side (`FILL`). Moves are smooth (0.7 s, ease
// in-out) and stop as soon as the user grabs the view; under reduced motion they are instant. Nothing here moves the
// camera on its own: a command, or a tool the user opens, does. Model frame: x east, y north, z up (metres).
import * as THREE from 'three'
import { create } from 'zustand'
import { fitPoints, type V3 } from './fitView'
import { useStore } from '../store'
import { sceneGround } from './cameraClamp'
import { VTC_SITE } from './siteGeometry'
import { towerFootprint } from '../engine/massing'
import type { Tower } from '../engine/types'
import { VISTA_OVERVIEW, useVistaLook } from './vistaLook'
import { useSiteStore } from './siteStore'
import { useTowerEdit } from './towerEdit'
import { useViewFromStore } from './viewFromStore'

export interface Pose { position: V3; target: V3; fov: number }
interface Ctl {
  target: THREE.Vector3; update: () => void; enabled: boolean; minDistance: number; maxDistance: number
  addEventListener?: (t: string, f: () => void) => void; removeEventListener?: (t: string, f: () => void) => void
  listenToKeyEvents?: (el: HTMLElement) => void; stopListenToKeyEvents?: () => void; keyPanSpeed?: number
}

/** The live canvas, registered by NavRig (components/NavRig.tsx) for whichever project is open. */
export const nav = {
  camera: null as THREE.PerspectiveCamera | null,
  ctl: null as Ctl | null,
  el: null as HTMLCanvasElement | null,
  invalidate: null as (() => void) | null,
  /** A city building's outline (local frame) and its ground and roof (CGVD28 m), registered by the city rig. */
  building: null as ((index: number) => { ring: [number, number][]; ground: number; roof: number } | null) | null,
  /** When the user last moved the view or chose a view (performance.now()): delayed automatic framing never overrides it. */
  userAt: 0,
}
export const toThree = (x: number, y: number, z: number) => new THREE.Vector3(x, z, -y)
export const toModel = (p: THREE.Vector3): V3 => [p.x, -p.z, p.y]

// ---------- flights ----------
/** A smooth camera move, stepped by NavRig each frame (ease in-out on the clock); grabbing the view stops it. */
export const flight = { from: null as Pose | null, to: null as Pose | null, start: 0, dur: 700 }
export const cancelFlight = () => { flight.to = null }
export function currentPose(): Pose | null {
  const cam = nav.camera, ctl = nav.ctl
  return cam && ctl ? { position: toModel(cam.position), target: toModel(ctl.target), fov: cam.fov } : null
}
/** Moves the orbit camera to `to`: smoothly, or at once under reduced motion (or before the view is ready). */
export function flyTo(to: Pose, dur = 700) {
  const from = currentPose()
  if (useStore.getState().reducedMotion || !from) { flight.to = null; useStore.getState().set({ cameraRequest: to }); return }
  flight.from = from; flight.to = to; flight.dur = dur; flight.start = performance.now()
  nav.invalidate?.()
}
/** One step of the flight in progress; true while one is running. */
export function stepFlight(): boolean {
  const cam = nav.camera, ctl = nav.ctl
  if (!flight.to || !flight.from || !cam || !ctl) return false
  const x = Math.min(1, (performance.now() - flight.start) / flight.dur), e = x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2
  const lerp = (a: V3, b: V3) => a.map((v, i) => v + (b[i] - v) * e) as V3
  const p = lerp(flight.from.position, flight.to.position), t = lerp(flight.from.target, flight.to.target)
  cam.position.copy(toThree(...p)); ctl.target.copy(toThree(...t))
  cam.fov = flight.from.fov + (flight.to.fov - flight.from.fov) * e
  cam.near = Math.max(1, cam.position.distanceTo(ctl.target) / 300)
  cam.updateProjectionMatrix(); ctl.update()
  if (x >= 1) flight.to = null
  nav.invalidate?.()
  return true
}
/** The user moved the view (orbit, pan, zoom, keys) or chose one: stop any move and remember when. */
export function userMoved() { flight.to = null; nav.userAt = performance.now() }

/** Zoom by e^f about the orbit target (or, at eye level, the field of view); stops a move in progress. */
export function zoomBy(f: number) {
  userMoved()
  const v = useViewFromStore.getState()
  if (v.looking) { v.set({ hfov: Math.round(THREE.MathUtils.clamp(v.hfov * Math.exp(f), 20, 110) * 10) / 10 }); return }
  const ctl = nav.ctl, cam = nav.camera
  if (!ctl || !cam) return
  const off = cam.position.clone().sub(ctl.target)
  const d = THREE.MathUtils.clamp(off.length() * Math.exp(f), ctl.minDistance, ctl.maxDistance)
  cam.position.copy(ctl.target).addScaledVector(off.normalize(), d)
  ctl.update()
  nav.invalidate?.()
}

// ---------- the free part of the view ----------
/**
 * How much of the canvas the overlays cover on each side, as fractions (MapLibre's fit padding): every element marked
 * `data-nav-occlude="top|bottom|left|right"` over the canvas counts. A side column counts only when it is tall (over 40%
 * of the height), like an open Layers dock; a short corner column is cleared by the breathing room instead.
 */
export function viewInsets(): { top: number; bottom: number; left: number; right: number } {
  const el = nav.el
  if (!el) return { top: 0.1, bottom: 0.15, left: 0, right: 0 }
  const r = el.getBoundingClientRect()
  const w = Math.max(1, r.width), h = Math.max(1, r.height)
  const ins = { top: 0, bottom: 0, left: 0, right: 0 }
  for (const n of document.querySelectorAll<HTMLElement>('[data-nav-occlude]')) {
    const b = n.getBoundingClientRect()
    if (!b.width || !b.height || b.right < r.left || b.left > r.right || b.bottom < r.top || b.top > r.bottom) continue
    const side = n.dataset.navOcclude
    if (side === 'top') ins.top = Math.max(ins.top, (b.bottom - r.top) / h)
    else if (side === 'bottom') ins.bottom = Math.max(ins.bottom, (r.bottom - b.top) / h)
    else if (side === 'right' && b.height > 0.4 * h) ins.right = Math.max(ins.right, (r.right - b.left) / w)
    else if (side === 'left' && b.height > 0.4 * h) ins.left = Math.max(ins.left, (b.right - r.left) / w)
  }
  const c = (v: number) => Math.min(0.42, Math.max(0, v))
  return { top: c(ins.top), bottom: c(ins.bottom), left: c(ins.left), right: c(ins.right) }
}
export const viewAspect = () => (nav.el ? nav.el.clientWidth / Math.max(1, nav.el.clientHeight) : 1.34)

// ---------- what can be framed ----------
/** Share of the free view the subject fills in its tighter direction: about 15% of breathing room on each side. */
export const FILL = 0.7
type Pts = V3[]
const project = () => useStore.getState().project
const towersOf = (): Tower[] => { const s = useStore.getState(); return s.towers[s.project] ?? [] }
const baseZ = () => (project() === 'city' ? useStore.getState().groundElevation : 0)
const groundAt = (x: number, y: number) => { const g = sceneGround.at(x, y); return Number.isFinite(g) ? g : baseZ() }

export function siteRing(): [number, number][] | null {
  const s = useStore.getState()
  if (s.project === 'city') return s.citySite?.ring?.length ? (s.citySite.ring as [number, number][]) : null
  return VTC_SITE.ring as [number, number][]
}
const centreOf = (pts: readonly (readonly number[])[]): [number, number] => [pts.reduce((a, p) => a + p[0], 0) / pts.length, pts.reduce((a, p) => a + p[1], 0) / pts.length]
export function siteCentre(): [number, number] | null { const r = siteRing(); return r ? centreOf(r) : null }

const inBox = (x: number, y: number, ring: [number, number][], pad = 0) => {
  const xs = ring.map((p) => p[0]), ys = ring.map((p) => p[1])
  return x >= Math.min(...xs) - pad && x <= Math.max(...xs) + pad && y >= Math.min(...ys) - pad && y <= Math.max(...ys) + pad
}
function towerPts(t: Tower): Pts {
  const z0 = baseZ(), z1 = z0 + t.height
  return towerFootprint(t, true).flatMap(([x, y]) => [[x, y, z0], [x, y, z1]] as Pts)
}
/** The tower the Frame tower command means: the selected one, else the only one. */
export function selectedTower(): Tower | null {
  const s = useStore.getState(), list = towersOf()
  return list.find((t) => t.id === s.selectedTower) ?? (list.length === 1 ? list[0] : null)
}
/** The site's outline on the ground, and the tops of any towers standing on it (so a tall one is never cut off). */
export function sitePoints(): Pts | null {
  const ring = siteRing()
  if (!ring) return null
  const pts: Pts = ring.map(([x, y]) => [x, y, groundAt(x, y)])
  for (const t of towersOf()) if (inBox(t.x, t.y, ring, 30)) pts.push(...towerPts(t).filter((_, i) => i % 2 === 1))
  return pts
}
const square = (x: number, y: number, half: number, z: number): Pts => [[x - half, y - half, z], [x + half, y - half, z], [x + half, y + half, z], [x - half, y + half, z]]

export interface Subject { pts: Pts; label: string }
/** What is selected, most specific first: the building inspected, the buildings picked, the tower picked, the address. */
export function selection(): Subject | null {
  const city = project() === 'city'
  const insp = city ? useVistaLook.getState().inspected : null
  if (insp && nav.building) {
    const b = nav.building(insp.index)
    if (b) return { pts: b.ring.flatMap(([x, y]) => [[x, y, b.ground], [x, y, b.roof]] as Pts), label: 'the inspected building' }
  }
  const picked = city ? useSiteStore.getState().picked : []
  if (picked.length && nav.building) {
    const pts = picked.flatMap((i) => { const b = nav.building!(i); return b ? b.ring.flatMap(([x, y]) => [[x, y, b.ground], [x, y, b.roof]] as Pts) : [] })
    if (pts.length) return { pts, label: picked.length === 1 ? 'the picked building' : `the ${picked.length} picked buildings` }
  }
  const tp = useTowerEdit.getState().picked
  const t = tp ? towersOf().find((k) => k.id === tp) : null
  if (t) return { pts: towerPts(t), label: t.name }
  const m = city ? useSiteStore.getState().marker : null
  if (m) return { pts: square(m.at[0], m.at[1], 40, groundAt(m.at[0], m.at[1])), label: m.label }
  return null
}

export type NavCommand = 'site' | 'selection' | 'tower' | 'neighbourhood' | 'city' | 'plan' | '3d' | 'home'
export interface Availability { ok: boolean; reason?: string }
/** Which commands can run now, and why not (shown under the command, not only on hover). */
export function availability(): Record<NavCommand, Availability> {
  const site = !!siteRing(), sel = !!selection(), tower = !!selectedTower(), many = towersOf().length > 1
  const city = project() === 'city'
  return {
    site: site ? { ok: true } : { ok: false, reason: 'No site yet: choose one in Site (address, map or default site).' },
    selection: sel ? { ok: true } : { ok: false, reason: city ? 'Nothing selected: click a building in Inspect, pick buildings, select a tower or find an address.' : 'Nothing selected: click a tower to pick it.' },
    tower: tower ? { ok: true } : { ok: false, reason: towersOf().length ? (many ? 'Several towers: select one first.' : 'No tower selected.') : 'No tower yet: place one in Form.' },
    neighbourhood: { ok: true },
    city: { ok: true },
    plan: { ok: true },
    '3d': { ok: true },
    home: { ok: true },
  }
}

// ---------- framing ----------
/** The current view direction: bearing from the target to the camera (degrees clockwise from north) and tilt. */
export function viewAngles(): { azimuth: number; elevation: number } {
  const p = currentPose()
  if (!p) return { azimuth: 180, elevation: 45 }
  const d = [p.position[0] - p.target[0], p.position[1] - p.target[1], p.position[2] - p.target[2]]
  const len = Math.hypot(d[0], d[1], d[2]) || 1, flat = Math.hypot(d[0], d[1])
  return { azimuth: flat < 1e-6 ? 180 : ((Math.atan2(d[0], d[1]) * 180) / Math.PI + 360) % 360, elevation: (Math.asin(Math.max(-1, Math.min(1, d[2] / len))) * 180) / Math.PI }
}
interface FrameOpts { minSpan?: number; plan?: boolean; azimuth?: number; elevation?: number; fov?: number; fill?: number }
/** The camera that fits `pts` into the free part of the view (pure: no move). */
export function framePose(pts: Pts, o: FrameOpts = {}): Pose {
  const now = viewAngles()
  const plan = !!o.plan
  // A readable tilt: the current one, kept between 35° and 72° (a top view becomes an oblique one; a low view rises, so tall
  // neighbours in a dense block do not hide the subject).
  const elevation = plan ? 90 : Math.min(72, Math.max(35, o.elevation ?? now.elevation))
  const azimuth = plan ? 180 : (o.azimuth ?? now.azimuth)
  const fov = o.fov ?? (plan ? 20 : 35)
  const fit = fitPoints(pts, { aspect: viewAspect(), insets: viewInsets(), fov, elevationDeg: elevation, azimuthDeg: azimuth, fill: o.fill ?? FILL, minSpan: o.minSpan ?? 120 })
  // Plan: exactly above the target (north up), so the view is straight down.
  if (plan) { const h = Math.hypot(fit.position[0] - fit.target[0], fit.position[1] - fit.target[1], fit.position[2] - fit.target[2]); fit.position = [fit.target[0], fit.target[1] - 0.01, fit.target[2] + h] }
  return fit
}

/** The competition site's overview (the camera it opens with). */
const VTC_OVERVIEW: Pose = { position: [520, -640, 430], target: [0, 0, 60], fov: 38 }
const homeKey = () => `ts.nav.home.${project()}`

function leaveEyeLevel() {
  const v = useViewFromStore.getState()
  if (v.looking || v.picking) v.set({ looking: false, picking: false })
}
/** Out of Observer and Plan (they hold their own camera rules) into the orbit, for a 3D command. Inspect stays: it is a
 *  way of picking buildings, and its pick (the building framed by Frame selection) stays highlighted. */
function toOrbit() {
  leaveEyeLevel()
  useNav.setState({ plan: false })
  if (project() !== 'city') return
  const m = useVistaLook.getState().mode
  if (m === 'plan' || m === 'observer') useVistaLook.setState({ mode: 'city', note: null })
}
/** The place a Plan or 3D view is about: the selection, else the site, else the tower. */
function placeSubject(): Pts | null { return selection()?.pts ?? sitePoints() ?? (selectedTower() ? towerPts(selectedTower()!) : null) }

/** The command's last result, for the menu's status line and screen readers. */
export interface NavState { scale: Scale; widthM: number; offscreen: { x: number; y: number; angle: number } | null; status: string | null; plan: boolean }
export type Scale = 'city' | 'neighbourhood' | 'site' | 'tower' | 'close' | 'plan' | 'viewpoint'
export const useNav = create<NavState>(() => ({ scale: 'city', widthM: 0, offscreen: null, status: null, plan: false }))
const say = (status: string) => useNav.setState({ status })

/** Runs a view command; returns false (and says why) when it can't. */
export function runNav(cmd: NavCommand): boolean {
  const av = availability()[cmd]
  if (!av.ok) { say(av.reason ?? 'Not available'); return false }
  nav.userAt = performance.now()
  const city = project() === 'city'
  switch (cmd) {
    case 'site': {
      toOrbit()
      // At least about 260 m across, so the streets around a single block stay in view.
      flyTo(framePose(sitePoints()!, { minSpan: 260 })); say('Framed the site'); return true
    }
    case 'selection': {
      const s = selection()!
      toOrbit()
      flyTo(framePose(s.pts, { minSpan: 90 })); say(`Framed ${s.label}`); return true
    }
    case 'tower': {
      const t = selectedTower()!
      toOrbit()
      flyTo(framePose(towerPts(t), { minSpan: 60 })); say(`Framed ${t.name}`); return true
    }
    case 'neighbourhood': {
      const c = selection() ? centreOf(selection()!.pts) : siteCentre() ?? (selectedTower() ? [selectedTower()!.x, selectedTower()!.y] as [number, number] : null)
      toOrbit()
      if (!c) { const p = currentPose(); if (!p) return false; flyTo(framePose(square(p.target[0], p.target[1], 450, p.target[2]), { minSpan: 900, elevation: 45 })); say('Neighbourhood around the view centre'); return true }
      const pts = [...square(c[0], c[1], 450, groundAt(c[0], c[1])), ...(sitePoints() ?? [])]
      flyTo(framePose(pts, { minSpan: 900, elevation: 45 }), 800); say('Neighbourhood around your site'); return true
    }
    case 'city': {
      toOrbit()
      flyTo(city ? { position: [...VISTA_OVERVIEW.position], target: [...VISTA_OVERVIEW.target], fov: VISTA_OVERVIEW.fov } : VTC_OVERVIEW, 900)
      say(city ? 'City overview' : 'Context overview'); return true
    }
    case 'plan': {
      leaveEyeLevel()
      const pts = placeSubject()
      const pose = pts ? framePose(pts, { plan: true, minSpan: 400 }) : (() => { const p = currentPose(); return p ? framePose(square(p.target[0], p.target[1], 500, p.target[2]), { plan: true, minSpan: 1000 }) : null })()
      if (!pose) return false
      if (city && useVistaLook.getState().mode !== 'plan') useVistaLook.setState({ mode: 'plan', note: null, inspected: null })
      useNav.setState({ plan: true })
      flyTo(pose); say('Plan view, north up'); return true
    }
    case '3d': {
      const pts = placeSubject()
      toOrbit()
      useNav.setState({ plan: false })
      const p = currentPose()
      const pose = pts ? framePose(pts, { azimuth: 180, elevation: 50, minSpan: 260 }) : p ? framePose(square(p.target[0], p.target[1], 300, p.target[2]), { azimuth: 180, elevation: 50 }) : null
      if (!pose) return false
      flyTo(pose); say('3D view'); return true
    }
    case 'home': {
      toOrbit()
      useNav.setState({ plan: false })
      const saved = readHome()
      if (saved) { flyTo(saved, 800); say('Home (your saved view)'); return true }
      const pts = sitePoints() ?? (selectedTower() ? towerPts(selectedTower()!) : null)
      if (!pts) { runNav('city'); say(city ? 'Home: no site yet, so the city overview' : 'Home'); return true }
      flyTo(framePose(pts, { azimuth: 180, elevation: 40, minSpan: 500 }), 800); say('Home: your site from the south'); return true
    }
  }
}

// ---------- Home (Revit's "Set current view as Home"), per project and site ----------
interface SavedHome { pose: Pose; site: [number, number] | null }
export function setHome(): boolean {
  const p = currentPose()
  if (!p) return false
  try { localStorage.setItem(homeKey(), JSON.stringify({ pose: p, site: siteCentre() } satisfies SavedHome)) } catch { /* this session only */ }
  say('This view is now Home'); return true
}
export function clearHome() { try { localStorage.removeItem(homeKey()) } catch { /* */ } say('Home is back to the site from the south') }
/** The saved Home, unless it belonged to another site (more than 300 m away). */
export function readHome(): Pose | null {
  try {
    const raw = localStorage.getItem(homeKey())
    if (!raw) return null
    const h = JSON.parse(raw) as SavedHome
    const c = siteCentre()
    if (h.site && c && Math.hypot(h.site[0] - c[0], h.site[1] - c[1]) > 300) return null
    return h.pose
  } catch { return null }
}
export const hasSavedHome = () => !!readHome()

// ---------- where am I looking ----------
export const SCALE_LABEL: Record<Scale, string> = { city: 'City', neighbourhood: 'Neighbourhood', site: 'Site', tower: 'Tower', close: 'Close-up', plan: 'Plan', viewpoint: 'Viewpoint' }
/**
 * The scale of the current view, from the ground width seen at the orbit target (a 3D view) and what is near the target:
 * the whole city, a neighbourhood, the site, the proposed tower, a close-up elsewhere; or a top view, or a viewpoint.
 */
export function classify(widthM: number, o: { vtc: boolean; looking: boolean; plan: boolean; nearSite: boolean; nearTower: number | null }): Scale {
  if (o.looking) return 'viewpoint'
  if (o.plan) return 'plan'
  // The competition context is a few blocks (its overview is about 700 m across); the city is about 9 km.
  if (widthM > (o.vtc ? 600 : 3500)) return 'city'
  if (widthM > (o.vtc ? 350 : 650)) return 'neighbourhood'
  if (o.nearTower !== null && widthM < Math.max(250, 2.2 * o.nearTower)) return 'tower'
  return o.nearSite ? 'site' : 'close'
}
/** A sentence for the menu and for screen readers: what the view shows, and about how wide. */
export function describe(scale: Scale, widthM: number, vtc: boolean): string {
  const w = widthM >= 1000 ? `${(widthM / 1000).toFixed(widthM >= 10000 ? 0 : 1)} km` : `${Math.round(widthM / 10) * 10} m`
  switch (scale) {
    case 'city': return vtc ? `The competition context as a whole, about ${w} across` : `Vancouver as a whole, about ${w} across`
    case 'neighbourhood': return `The neighbourhood around the view centre, about ${w} across`
    case 'site': return `Your site and its streets, about ${w} across`
    case 'tower': return `Your proposed tower, about ${w} across`
    case 'close': return `A close-up away from your site, about ${w} across`
    case 'plan': return `A plan from above, north up, about ${w} across`
    case 'viewpoint': return 'A view from a protected viewpoint or a chosen eye point'
  }
}
