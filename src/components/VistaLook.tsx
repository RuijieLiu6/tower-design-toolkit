// Real Vancouver's viewport in Vista's layout (Ruijie, 3 Nov: "Make the model viewport page looks exactly like this as the
// one shown in vista"): mode tabs and "Study scene" top left, compass, Focus site, + / − and Layers top right, the caption
// and legend bottom left, and Vista's place labels over the city. Tokens from lib/vistaLook.ts (Vista @ 917b28e).
// The tabs (Ruijie, 3 Nov: "make sure that it changes the view accordingly"): City flies back to the large Vancouver
// context; Observer puts the eye at a protected viewpoint (a cone picker, defaulting to the cone that controls the
// tower; View from here stays one button away); Inspect flies to a close near-parallel axonometric of the proposed
// tower, where clicking a building still gives its card; Plan looks straight down, north up, centred on the proposed
// tower; Viewcone is one toggle, all view cones on or all off (Ruijie, 3 Nov: "a single tab could turn on all and turn
// off all"), in step with the Layers dock (lib/coneVisibility.ts).
// VistaLookRig runs inside the canvas (model frame x east, y north, z up); the rest is DOM over the view.
import { ViewModeMenu } from './DisplayModeSwitch'
import { useViewToolOpen } from '../lib/workflow/phaseTools'
import { dataFetch } from '../lib/loadProgress'
import { useFrame, useThree } from '@react-three/fiber'
import { ChevronDown, ChevronUp, Crosshair, Layers, Minus, Plus, X } from './icons'
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import * as THREE from 'three'
import { pickAt } from '../engine/viewFrom'
import { CONES, pointInRing } from '../engine/viewCones'
import { useResults } from '../hooks/useResults'
import { BUILDING_USES, SWATCH_BORDER, useColor } from '../lib/buildingUse'
import { MODEL } from '../lib/design/tokens'
import { useShownMode } from '../lib/displayModeHooks'
import UiShow from './ui/UiShow'
import { AnalysisLegend, KeyGroup, KeyItem, MassingKey, SunChip, TowerUseKey } from './DisplayMode'
import { sampleTerrain, type Manifest } from '../lib/cityLayers'
import { fitPoints } from '../lib/fitView'
import { buildingLabel, buildingSource, isEstimate } from '../lib/vistaBuildings'
import { useViewFromStore } from '../lib/viewFromStore'
import { faceNorth, northView, orientReq, upNorthDeg } from '../lib/northView'
import { stepConeId } from '../lib/coneNav'
import { startPlanOrtho } from '../lib/planOrtho'
import { AXO_SHEAR, axoCamera, axoObliqueCamera, CHROME, CORNER_WORD, CORNERS, ELEVATION_CUT_M, ELEVATIONS, elevationCamera, isElevation, ISO_ELEVATION_DEG, MAP_MODES, MODE_GESTURES, MODE_HINT, VISTA, VISTA_OVERVIEW, planCamera, setPlaceNames, setVistaFog, useVistaLook, type Corner, type MapMode } from '../lib/vistaLook'
import { controllingCone, hasEstimate, showAllCones, useConeVisibility } from '../lib/coneVisibility'
import { CITY_ORIGIN, useStore, useTowers } from '../store'
import { useCityData, useCityObstacles } from './CityContext'
import { lookFromCone } from './VistaPanel'
import Label from './Label'
import { useDock } from './ViewportDock'
import { CONE_BLUE } from './VistaCones'
import { HigherBuildingsCard } from './HigherBuildings'
import { VISTA_INTRUSION } from './ConeVolumes'

/** Model frame (x, y, z-up) to three.js world (y-up). */
const toThree = (x: number, y: number, z: number) => new THREE.Vector3(x, z, -y)
type Ctl = { target: THREE.Vector3; enabled: boolean; enableRotate: boolean; minDistance: number; maxDistance: number; mouseButtons: Record<string, number | null>; touches: Record<string, number | null>; update: () => void }

/** What the DOM chrome and the canvas share without React renders per frame. */
const live = {
  compass: null as HTMLElement | null,
  labels: new Map<string, HTMLElement>(),
  /** Label order for the overlap rule: Vista's core labels first, then the extension's (file order). */
  labelOrder: [] as string[],
  ctl: null as Ctl | null,
  camera: null as THREE.PerspectiveCamera | null,
  invalidate: null as null | (() => void),
  /** The canvas, for the view's aspect. */
  el: null as HTMLElement | null,
}

// ---------- labels ----------
export interface PlaceLabel { text: string; x: number; y: number; z: number; ext: boolean }
let labelsCache: Promise<PlaceLabel[]> | null = null
function loadLabels(manifest: Manifest): Promise<PlaceLabel[]> {
  labelsCache ??= (async () => {
    const layer = manifest.layers.find((l) => l.id === 'vista_labels')
    if (!layer) return []
    const r = await dataFetch(layer.file, 'place names')
    if (!r.ok) throw new Error(`${layer.file}: HTTP ${r.status}`)
    const j = (await r.json()) as { version: number; origin: number[]; labels: PlaceLabel[] }
    if (j.version !== 1 || j.origin[0] !== 491300 || j.origin[1] !== 5458600) throw new Error('Vista labels: unsupported frame')
    return j.labels
  })()
  return labelsCache
}

function usePlaceLabels(): PlaceLabel[] {
  const { data } = useCityData()
  const [labels, setLabels] = useState<PlaceLabel[]>([])
  useEffect(() => {
    if (!data) return
    let on = true
    loadLabels(data.manifest).then((l) => on && setLabels(l), () => on && setLabels([]))
    return () => { on = false }
  }, [data])
  return labels
}

/** What a click on a place name does (components/site/PlaceNames.tsx): which names answer, when, and where they go. */
export interface PlacePick {
  /** Does this name answer a click? (Water names do not.) */
  can: (text: string) => boolean
  /** No map tool is taking clicks (placing a tower, drawing or picking a site…): the names answer only then. */
  idle: () => boolean
  go: (label: PlaceLabel) => void
}

/**
 * Vista's place labels as DOM boxes, positioned each frame by VistaLookRig (Vista's own overlap rule). `extra` names
 * join after Vista's (the City local areas Vista does not name); `active` is drawn as picked. With `pick`, a click on a
 * name flies there (Ruijie, 4 Nov: the map's names replace the Site step's neighbourhood list).
 */
export function PlaceLabels({ extra, pick, active = null }: { extra?: readonly PlaceLabel[]; pick?: PlacePick; active?: string | null }) {
  const vista = usePlaceLabels()
  const labels = useMemo(() => {
    if (!extra?.length) return vista
    const have = new Set(vista.map((l) => l.text))
    return [...vista, ...extra.filter((l) => !have.has(l.text))]
  }, [vista, extra])
  const on = useVistaLook((s) => s.labels)
  const mode = useActiveMode()
  const shown = on && mode !== 'observer' && mode !== 'viewcone'
  useEffect(() => { live.labelOrder = labels.map((l) => l.text); live.invalidate?.() }, [labels, on])
  usePlacePicks(shown ? pick : undefined, labels)
  if (!shown) return null
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {labels.map((l) => {
        const picked = l.text === active
        return (
          <div key={l.text} ref={(el) => { if (el) live.labels.set(l.text, el); else live.labels.delete(l.text) }}
            data-x={l.x} data-y={l.y} data-z={l.z} data-ext={l.ext ? 1 : 0} data-place={l.text} data-active={picked ? '' : undefined}
            className="absolute whitespace-nowrap rounded-[4px] border px-1.5 leading-[16px]"
            style={{ display: 'none', transform: 'translate(-50%, -100%)', letterSpacing: '0.15px', fontSize: 12, fontWeight: l.ext ? 400 : 500, boxShadow: '0 1px 3px rgba(43,60,48,0.125)',
              ...(picked ? { background: CHROME.active, color: CHROME.activeInk, borderColor: CHROME.active } : { background: l.ext ? CHROME.labelExtBg : CHROME.labelBg, color: l.ext ? CHROME.labelExtInk : CHROME.labelInk, borderColor: CHROME.labelBorder }) }}>
            {l.text}
          </div>
        )
      })}
    </div>
  )
}

/**
 * Clicks on the place names. The names stay click-through, so a drag or a scroll that starts on one still moves the view:
 * a press and release on the same name (within 6 px) is the click, taken before the map's own click handlers (the Site
 * step's menu, building cards, tower picking) see it. Hovering a name that answers shows a pointer and outlines it.
 */
function usePlacePicks(pick: PlacePick | undefined, labels: readonly PlaceLabel[]) {
  const ref = useRef(pick)
  ref.current = pick
  const byText = useRef(new Map<string, PlaceLabel>())
  byText.current = new Map(labels.map((l) => [l.text, l]))
  const enabled = !!pick
  useEffect(() => {
    if (!enabled) return
    let down: { x: number; y: number; text: string } | null = null
    let hover: string | null = null
    const hit = (x: number, y: number): string | null => {
      const p = ref.current
      if (!p || !p.idle()) return null
      for (const [text, el] of live.labels) {
        if (el.style.display === 'none' || !p.can(text)) continue
        const r = el.getBoundingClientRect()
        if (x >= r.left - 2 && x <= r.right + 2 && y >= r.top - 2 && y <= r.bottom + 2) return text
      }
      return null
    }
    const setHover = (text: string | null) => {
      if (text === hover) return
      if (hover) live.labels.get(hover)?.removeAttribute('data-hover')
      hover = text
      if (text) live.labels.get(text)?.setAttribute('data-hover', '')
      if (text) live.el?.setAttribute('data-place-hover', ''); else live.el?.removeAttribute('data-place-hover')
    }
    const onMove = (e: PointerEvent) => setHover(e.buttons === 0 && e.target === live.el ? hit(e.clientX, e.clientY) : null)
    const onDown = (e: PointerEvent) => {
      const text = e.button === 0 && e.target === live.el ? hit(e.clientX, e.clientY) : null
      down = text ? { x: e.clientX, y: e.clientY, text } : null
    }
    const onClick = (e: MouseEvent) => {
      const d = down
      down = null
      if (!d || e.target !== live.el || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6 || hit(e.clientX, e.clientY) !== d.text) return
      const l = byText.current.get(d.text), p = ref.current
      if (!l || !p) return
      // The name took the click: nothing under it (map menu, building card, tower) answers as well.
      e.stopPropagation(); e.preventDefault()
      setHover(null)
      p.go(l)
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('pointerdown', onDown, true)
    window.addEventListener('click', onClick, true)
    return () => {
      setHover(null)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('click', onClick, true)
    }
  }, [enabled])
}

// ---------- modes ----------
/**
 * Observer follows the eye-level view (a protected viewpoint, or View from here's street or roof); City, Inspect and
 * Plan are set by the tabs. Viewcone is not a view: it opens the cone show/hide panel (lib/coneVisibility.ts).
 */
export function useActiveMode(): MapMode {
  const mode = useVistaLook((s) => s.mode)
  const looking = useViewFromStore((s) => s.looking)
  const picking = useViewFromStore((s) => s.picking)
  if (looking || picking) return 'observer'
  return mode === 'observer' || mode === 'viewcone' ? 'city' : mode
}

// ---------- camera moves ----------
type CamReq = { position: [number, number, number]; target: [number, number, number]; fov: number }
/** A smooth camera move run by VistaLookRig (ease in-out, about 0.9 s); grabbing the view stops it. */
const flight = { from: null as CamReq | null, to: null as CamReq | null, start: 0, dur: 900 }
/** The Axo shear (lib/planOrtho.ts) on its way between views, on the flight's clock and easing. */
const shearTween = { from: 0, to: 0, now: 0, start: 0 }
const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2)
northView.stopFlight = () => { flight.to = null }
const toModel = (p: THREE.Vector3): [number, number, number] => [p.x, -p.z, p.y]
/** A camera request (a preset, "view from", a test) wins over a smooth move still on its way: the move stops. */
export const cancelFlight = () => { flight.to = null }

/** A smooth camera move is on its way (Esc or grabbing the view stops it). */
export const isFlying = () => !!flight.to
/** The orbit camera now, in the model frame (for a later "Back"); null before the view exists. */
export function currentView(): CamReq | null {
  const cam = live.camera, ctl = live.ctl
  return cam && ctl ? { position: toModel(cam.position), target: toModel(ctl.target), fov: cam.fov } : null
}
/**
 * Screen boxes other map labels claim before the place names are placed (the Higher Buildings label,
 * components/HigherBuildings.tsx), so a place name never covers them: [left, top, right, bottom] in pixels, or null.
 */
export const labelReservations = new Set<(cam: THREE.Camera, size: { width: number; height: number }) => [number, number, number, number] | null>()

/** Moves the orbit camera to `to`: smoothly, or at once under reduced motion. */
/**
 * A camera preset turned about its target by `deg` clockwise in plan (13 Nov: the presets put true north up; turned by
 * the chosen north, they keep true north or project north up as set in Your site, through 2D and 3D).
 */
export function turnReq(req: CamReq, deg: number): CamReq {
  if (!deg) return req
  const a = (deg * Math.PI) / 180, c = Math.cos(a), sn = Math.sin(a), [tx, ty] = req.target
  const x = req.position[0] - tx, y = req.position[1] - ty
  return { ...req, position: [tx + x * c + y * sn, ty - x * sn + y * c, req.position[2]] }
}

export function flyTo(to: CamReq) {
  const cam = live.camera, ctl = live.ctl
  if (useStore.getState().reducedMotion || !cam || !ctl) { flight.to = null; useStore.getState().set({ cameraRequest: to }); return }
  flight.from = { position: toModel(cam.position), target: toModel(ctl.target), fov: cam.fov }
  flight.to = to
  flight.start = performance.now()
  live.invalidate?.()
}

function studyCentre(): [number, number, number] {
  const s = useStore.getState(), list = s.towers[s.project], t = list.find((k) => k.id === s.selectedTower) ?? list[0]
  if (t) return [t.x, t.y, s.groundElevation]
  // The competition site sits at the origin.
  if (s.project === 'vtc') return [0, 0, s.groundElevation]
  // No tower yet: the site's centre (Massing starts on a cleared site), else the overview.
  const ring = s.citySite?.ring
  if (ring?.length) return [ring.reduce((a, p) => a + p[0], 0) / ring.length, ring.reduce((a, p) => a + p[1], 0) / ring.length, s.groundElevation]
  return [...VISTA_OVERVIEW.target]
}

/**
 * Inspect: a near-parallel axonometric of the proposed tower (Present's isometric direction, 6° lens), fitted closely
 * into the band of the view the overlays leave free (`insets`: fractions of the height covered at the top and bottom).
 */
export function towerAxo(aspect: number, insets: { top: number; bottom: number } = { top: 0, bottom: 0 }): CamReq | null {
  const s = useStore.getState(), t = s.towers.city.find((k) => k.id === s.selectedTower) ?? s.towers.city[0]
  if (!t) return null
  const fov = 6, half = Math.tan(THREE.MathUtils.degToRad(fov / 2))
  const free = Math.max(0.4, 1 - insets.top - insets.bottom)
  // Frame the height with a little air, or the plan diagonal where the view is narrow; then grow the frame so that
  // span fills only the free band.
  const span = Math.max(t.height * 1.18, (Math.hypot(t.width, t.depth) * 1.6) / Math.max(0.5, aspect)) / free
  const d = span / (2 * half), el = Math.atan(1 / Math.SQRT2)
  const iso = [Math.cos(el) / Math.SQRT2, -Math.cos(el) / Math.SQRT2, Math.sin(el)]
  // The band's middle sits (bottom − top) / 2 of the height above the view's middle: aim that much lower, along the
  // screen's up direction, so the tower lands in the band.
  const up = new THREE.Vector3(-iso[0] * iso[2], -iso[1] * iso[2], 1 - iso[2] * iso[2]).normalize()
  const shift = ((insets.bottom - insets.top) / 2) * span
  const c: [number, number, number] = [t.x - up.x * shift, t.y - up.y * shift, s.groundElevation + t.height / 2 - up.z * shift]
  return { position: [c[0] + iso[0] * d, c[1] + iso[1] * d, c[2] + iso[2] * d], target: c, fov }
}

/**
 * Fly to the view that fits `points` (an outline in the model frame, z = ground) into the part of the view the overlays
 * leave free, north up (Ruijie, 4 Nov: a picked neighbourhood fills the view). Plan stays a top view; Inspect and the
 * eye-level views go back to the City orbit first, since they hold their own cameras.
 */
export function flyToFit(points: [number, number, number][], minSpan = 300) {
  leaveEyeLevel()
  const mode = useVistaLook.getState().mode
  if (mode === 'inspect' || mode === 'observer') useVistaLook.setState({ mode: 'city', inspected: null, note: null })
  const insets = overlayInsets()
  // The chosen north up (Your site: true north or project north, lib/northView.ts).
  // The locked views keep their angle: the plan straight down, Axo / Iso their corner, an elevation its side.
  const corner = useVistaLook.getState().corner
  const elevationDeg = mode === 'plan' || mode === 'axo' ? 90 : mode === 'iso' ? ISO_ELEVATION_DEG : isElevation(mode) ? 1 : 60
  const azimuthDeg = (mode === 'axo' || mode === 'iso' ? CORNERS[corner] : isElevation(mode) ? ELEVATIONS[mode] : 180) + upNorthDeg()
  flyTo(fitPoints(points, { aspect: viewAspect(), insets: { ...insets, side: 0.03 }, elevationDeg, azimuthDeg, minSpan }))
}

/** Observer: the eye at a protected viewpoint (the City's Lv), looking along the cone's axis; the tower framed if inside. */
export function goToCone(id: string) {
  const cone = CONES.find((c) => c.id === id)
  if (!cone) return
  const s = useStore.getState(), t = s.towers.city.find((k) => k.id === s.selectedTower) ?? s.towers.city[0]
  const vis = useConeVisibility.getState()
  useConeVisibility.setState({ picked: id, hidden: vis.hidden[id] ? { ...vis.hidden, [id]: false } : vis.hidden })
  useVistaLook.setState({ mode: 'city', note: null, inspected: null })
  const inside = !!t && pointInRing([t.x + CITY_ORIGIN[0], t.y + CITY_ORIGIN[1]], cone.ring)
  lookFromCone(cone, t && inside ? { x: t.x, y: t.y, top: s.groundElevation + t.height } : null)
}

function leaveEyeLevel() {
  const v = useViewFromStore.getState()
  if (v.looking || v.picking) v.set({ looking: false, picking: false })
}

function chooseMode(m: MapMode, defaultCone: string | null) {
  const set = useVistaLook.setState
  if (m === 'viewcone') {
    // One toggle: all shown -> all hidden; anything else (all hidden, or some hidden in the Layers dock) -> all shown.
    showAllCones(Object.values(useConeVisibility.getState().hidden).some(Boolean))
    return
  }
  if (m === 'observer') {
    goToCone(useConeVisibility.getState().picked ?? defaultCone ?? CONES[0].id)
    return
  }
  leaveEyeLevel()
  set((s) => ({ mode: m, note: null, inspected: m === 'inspect' ? s.inspected : null }))
  // City: every press goes back to the large Vancouver context (Vista's overview camera). On the competition site
  // (19 Nov, 2D / 3D on both sites) 3D goes back to the view before Plan, which PlanRig restores.
  if (m === 'city' && useStore.getState().project === 'vtc') return
  if (m === 'city') flyTo(orientReq({ position: [...VISTA_OVERVIEW.position], target: [...VISTA_OVERVIEW.target], fov: VISTA_OVERVIEW.fov }))
  // Inspect: every press frames the proposed tower in axonometric, inside the part of the view the overlays leave free.
  if (m === 'inspect') { const axo = towerAxo(viewAspect(), overlayInsets()); if (axo) flyTo(orientReq(axo)) }
}

/**
 * How much of the view's height the overlays cover at the top (mode tabs, Study scene) and the bottom (caption,
 * legend), as fractions; measured from the DOM, else typical values (UI review, 3 Nov: the base sat under the legend).
 */
function overlayInsets(): { top: number; bottom: number } {
  const el = live.el
  if (!el) return { top: 0.1, bottom: 0.15 }
  const r = el.getBoundingClientRect(), h = Math.max(1, r.height)
  const edge = (sel: string, side: 'top' | 'bottom') => {
    const n = document.querySelector<HTMLElement>(sel)
    if (!n) return side === 'top' ? 0.1 : 0.15
    const b = n.getBoundingClientRect()
    return Math.min(0.4, Math.max(0, side === 'top' ? (b.bottom - r.top) / h : (r.bottom - b.top) / h))
  }
  return { top: edge('[data-vista-overlay="top"]', 'top'), bottom: edge('[data-vista-overlay="bottom"]', 'bottom') }
}

const viewAspect = () => (live.el ? live.el.clientWidth / Math.max(1, live.el.clientHeight) : 1.34)

/** The cone nearest the tower when none covers it (the Observer default must still be a cone). */
function nearestCone(x: number, y: number): string {
  let best = CONES[0], d = Infinity
  for (const c of CONES) { const e = Math.hypot(c.ring[0][0] - CITY_ORIGIN[0] - x, c.ring[0][1] - CITY_ORIGIN[1] - y); if (e < d) { d = e; best = c } }
  return best.id
}

const box: CSSProperties = { background: CHROME.box, border: `1px solid ${CHROME.border}`, color: CHROME.ink, boxShadow: CHROME.shadow, borderRadius: 2, letterSpacing: '0.15px' }
const focusRing = 'outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#426b61]'

/** The cone that controls the selected tower (the view-cone check's numbers), else the nearest one. */
function useDefaultCone(): string | null {
  const towers = useTowers()
  const sel = useStore((s) => s.selectedTower)
  const { cones } = useResults()
  const t = towers.find((k) => k.id === sel) ?? towers[0]
  if (!t) return null
  return controllingCone(cones.find((c) => c.tower.id === t.id)?.checks ?? []) ?? nearestCone(t.x, t.y)
}

/** The view angles (City, Observer, Inspect), drawn in the view bar (12 Nov); only while the view tool is open. */
function AngleButtons() {
  const active = useActiveMode()
  const defaultCone = useDefaultCone()
  return <>
    {MAP_MODES.filter((m) => m.id !== 'viewcone' && (m.id === 'city' || m.id === 'observer' || m.id === 'inspect')).map((m) => {
      const on = m.id === active
      return (
        <button key={m.id} type="button" aria-pressed={on} title={m.title} onClick={() => chooseMode(m.id, defaultCone)} data-angle={m.id}
          className={`flex h-8 items-center rounded-lg px-2.5 text-control outline-none focus-visible:ring-2 focus-visible:ring-accent ${on ? 'bg-subtle font-medium text-ink' : 'text-muted hover:bg-subtle hover:text-ink'}`}>{m.label}</button>
      )
    })}
  </>
}

/** The parallel-projection views: the 2D plan and elevations, and the 3D Axo and Iso options. */
export const isFlat = (m: MapMode) => m === 'plan' || m === 'axo' || m === 'iso' || isElevation(m)

const TWO_D = [['plan', 'Plan'], ['north', 'North'], ['south', 'South'], ['east', 'East'], ['west', 'West']] as const
const THREE_D = [['city', 'Perspective']] as const
const CORNER_IDS = ['nw', 'ne', 'sw', 'se'] as const
const PARALLEL = [['axo', 'Axo'], ['iso', 'Iso']] as const

/**
 * The 2D / 3D switch (12 Nov, Sinnie: "for plan, can you change it to a 2D/3D"), always in the view bar on both sites
 * (19 Nov, "wheres my 2d/3d view toggle"). Each is a drop-down (19 Nov, "i want the free axo iso to be like a drop down
 * from 3d; for 2d, plan, north, south, east, west"): 2D holds the plan and the four elevations, 3D holds Free (the
 * perspective orbit) and the four corners (NW, NE, SW, SE), each as Axo or Iso (19 Nov, "angle is the main button, and
 * then you can choose iso or axo"). The pressed one shows its option. Every view but
 * Perspective is locked (19 Nov, Sinnie: "users shouldn't be able to suddenly go back to a perspective view"): the
 * camera cannot be turned, and Frame, a picked neighbourhood and the view's own re-centre keep the angle.
 */
export function PlanSwitch() {
  const active = useActiveMode()
  const defaultCone = useDefaultCone()
  const twoD = active === 'plan' || isElevation(active)
  return (
    <div role="group" aria-label="2D or 3D" data-testid="view-2d3d" className="flex rounded-lg bg-subtle p-0.5">
      <ViewDrop id="2d" word="2D" on={twoD} options={TWO_D} active={active} pick={(m) => chooseMode(m, defaultCone)} />
      <ViewDrop id="3d" word="3D" on={!twoD} options={THREE_D} active={active} pick={(m) => chooseMode(m, defaultCone)} corners />
    </div>
  )
}

function ViewDrop({ id, word, on, options, active, pick, corners = false }: { id: '2d' | '3d'; word: string; on: boolean; options: readonly (readonly [MapMode, string])[]; active: MapMode; pick: (m: MapMode) => void; corners?: boolean }) {
  const [open, setOpen] = useState(false)
  const corner = useVistaLook((s) => s.corner)
  const parallel = useVistaLook((s) => s.parallel)
  const fromCorner = active === 'axo' || active === 'iso'
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('pointerdown', away, true); window.addEventListener('keydown', key)
    return () => { window.removeEventListener('pointerdown', away, true); window.removeEventListener('keydown', key) }
  }, [open])
  const cur = on ? options.find(([m]) => m === active) : undefined
  const word2 = cur && cur[0] !== 'city' ? cur[1] : on && fromCorner ? `${corner.toUpperCase()} ${active === 'iso' ? 'Iso' : 'Axo'}` : null
  return (
    <div ref={box} className="relative">
      <button type="button" aria-pressed={on} aria-haspopup="menu" aria-expanded={open} data-angle={id === '2d' ? 'plan' : '3d'} data-testid={`view-${id}`}
        title={id === '2d' ? 'The 2D views: the plan and the four elevations' : 'The 3D views: free, axonometric, isometric'} onClick={() => setOpen((v) => !v)}
        className={`flex h-7 items-center gap-1 rounded-md pl-2 pr-1 text-control outline-none focus-visible:ring-2 focus-visible:ring-accent ${on ? 'bg-panel font-medium text-ink shadow-sm' : 'text-muted hover:text-ink'}`}>
        {word}{word2 && <span className="font-normal text-muted">· {word2}</span>}
        <ChevronDown size={12} aria-hidden className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div role="menu" aria-label={`${word} views`} data-testid={`view-${id}-menu`} className="absolute left-0 top-full z-30 mt-1.5 grid w-max min-w-[7rem] gap-0.5 rounded-lg border border-line bg-panel p-1 shadow-float">
          {options.map(([m, label]) => {
            const checked = on && active === m
            return (
              <button key={m} type="button" role="menuitemradio" aria-checked={checked} data-view={m} title={MAP_MODES.find((k) => k.id === m)?.title}
                onClick={() => { setOpen(false); if (!checked) pick(m) }}
                className={`flex h-7 min-w-[5.5rem] items-center rounded-md px-2 text-left text-control outline-none focus-visible:ring-2 focus-visible:ring-accent ${checked ? 'bg-selected font-medium text-ink' : 'text-ink hover:bg-subtle'}`}>{label}</button>
            )
          })}
          {/* The corners (a compass: NW NE over SW SE): a corner enters the parallel view from there; one Axo | Iso toggle
              under them sets the projection (19 Nov, Sinnie: "just make axo/iso a toggle"), and switches a corner view
              in place. */}
          {corners && <span aria-hidden className="my-0.5 h-px bg-line" />}
          {corners && CORNER_IDS.map((c) => {
            const here = on && fromCorner && corner === c
            return (
              <button key={c} type="button" role="menuitemradio" aria-checked={here} data-corner={c} title={`A parallel view from the ${CORNER_WORD[c]} (${parallel === 'iso' ? 'isometric' : 'axonometric'})`}
                onClick={() => { setOpen(false); useVistaLook.setState({ corner: c }); if (!(here && active === parallel)) pick(parallel) }}
                className={`flex h-7 min-w-[5.5rem] items-center rounded-md px-2 text-left text-control uppercase outline-none focus-visible:ring-2 focus-visible:ring-accent ${here ? 'bg-selected font-medium text-ink' : 'text-ink hover:bg-subtle'}`}>{c}</button>
            )
          })}
          {corners && (
            <div role="group" aria-label="Parallel projection" data-testid="parallel-toggle" className="mt-0.5 flex rounded-md bg-subtle p-0.5">
              {PARALLEL.map(([p, pl]) => {
                const onP = parallel === p
                return (
                  <button key={p} type="button" aria-pressed={onP} data-view={p} title={MAP_MODES.find((k) => k.id === p)?.title}
                    onClick={() => { useVistaLook.setState({ parallel: p }); if (on && fromCorner && active !== p) pick(p) }}
                    className={`flex h-6 flex-1 items-center justify-center rounded text-meta outline-none focus-visible:ring-2 focus-visible:ring-accent ${onP ? 'bg-panel font-medium text-ink shadow-sm' : 'text-muted hover:text-ink'}`}>{pl}</button>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ModeTabs() {
  const active = useActiveMode()
  const hidden = useConeVisibility((s) => s.hidden)
  const someHidden = Object.values(hidden).some(Boolean), allHidden = CONES.every((c) => hidden[c.id])
  const conesOn: boolean | 'mixed' = !someHidden ? true : allHidden ? false : 'mixed'
  const defaultCone = useDefaultCone()
  const names = useVistaLook((s) => s.labels)
  // The Context toggle that sat here (Vista's textured style) is now the Materials display mode, in the switch over the
  // legend (components/DisplayMode.tsx), with the Layers dock and Present's picker in step.
  return (
    <div role="toolbar" aria-label="Map mode" className="flex gap-[2px] p-[3px]" style={box}>
      {MAP_MODES.flatMap((m) => {
        if (m.id === 'viewcone') {
          // A toggle, not a mode: its own on / off look (a lamp and the word), so it never reads as the active view.
          return [
            <button key={m.id} type="button" aria-pressed={conesOn} onClick={() => chooseMode(m.id, defaultCone)}
              title={conesOn === true ? 'View cones on: press to hide them all' : 'View cones off: press to show them all'}
              className={`flex h-[30px] items-center gap-1.5 rounded-lg px-2 text-control hover:bg-subtle ${focusRing}`} style={{ color: CHROME.tabInk }}>
              {/* The lamp: full when every cone shows, its left half when some do, empty when none (two halves, no gradient). */}
              <i aria-hidden className="inline-flex h-2.5 w-2.5 overflow-hidden rounded-full" style={{ border: `1.5px solid ${VISTA.cone}` }}>
                <i className="h-full w-1/2" style={{ background: conesOn === false ? 'transparent' : VISTA.cone }} />
                <i className="h-full w-1/2" style={{ background: conesOn === true ? VISTA.cone : 'transparent' }} />
              </i>
              {m.label}<span aria-hidden className="text-meta font-semibold" style={{ color: VISTA.cone }}>{conesOn === true ? 'on' : conesOn === 'mixed' ? 'some' : 'off'}</span>
            </button>,
          ]
        }
        // City, Observer, Inspect and Plan are view angles: they live in the view bar at the bottom (AngleButtons, 12 Nov).
        return []
      })}
      {/* Names: a toggle like Viewcone (Ruijie, 9 Nov: the neighbourhood names on and off from the view itself). */}
      <button type="button" aria-pressed={names} onClick={() => setPlaceNames(!names)} data-testid="names-toggle"
        title={names ? 'Neighbourhood names on: press to hide them' : 'Neighbourhood names off: press to show them'}
        className={`flex h-[30px] items-center gap-1.5 rounded-lg px-2 text-control hover:bg-subtle ${focusRing}`} style={{ color: CHROME.tabInk }}>
        <i aria-hidden className="inline-flex h-2.5 w-2.5 rounded-full" style={{ border: `1.5px solid ${CHROME.ink}`, background: names ? CHROME.ink : 'transparent' }} />
        Names<span aria-hidden className="text-meta font-semibold" style={{ color: CHROME.ink }}>{names ? 'on' : 'off'}</span>
      </button>
    </div>
  )
}

/** North on screen; turned each frame by VistaLookRig. A click turns the view to face north (Ruijie, 6 Nov). */
function Compass() {
  return (
    <button type="button" data-testid="north-arrow" onClick={() => { flight.to = null; faceNorth(upNorthDeg()) }}
      aria-label="Turn the view to face north. The arrow points to true north on screen." title="Face north: true north or project north, as chosen in Your site (grid north = true north here, UTM 10N)"
      className={`flex h-12 w-10 flex-col items-center justify-center rounded-[20px] text-meta font-semibold leading-[16px] hover:bg-subtle ${focusRing}`} style={box}>
      <span>N</span>
      <span ref={(el) => { live.compass = el }} className="text-[22px] font-normal leading-[20px]" style={{ transform: 'rotate(0deg)' }} aria-hidden>↑</span>
    </button>
  )
}

function utilityButton(label: ReactNode, title: string, onClick: () => void, extra: string, aria?: string, pressed?: boolean) {
  return (
    <button type="button" onClick={onClick} title={title} aria-label={aria} aria-pressed={pressed}
      className={`h-[30px] rounded-lg text-control hover:bg-subtle ${extra} ${focusRing}`} style={box}>{label}</button>
  )
}

/** Vista's zoomBy: the orbit distance (or, at eye level, the field of view) times e^±0.35. */
function zoom(f: number) {
  const v = useViewFromStore.getState()
  if (v.looking) { v.set({ hfov: Math.round(THREE.MathUtils.clamp(v.hfov * Math.exp(f), 20, 110) * 10) / 10 }); return }
  const ctl = live.ctl, cam = live.camera
  if (!ctl || !cam) return
  const off = cam.position.clone().sub(ctl.target)
  const d = THREE.MathUtils.clamp(off.length() * Math.exp(f), ctl.minDistance, ctl.maxDistance)
  cam.position.copy(ctl.target).addScaledVector(off.normalize(), d)
  ctl.update()
  live.invalidate?.()
}

function focusSite() {
  const s = useStore.getState()
  // A locked view (2D, Axo, Iso) re-centres on the study site at its own angle.
  const m = useVistaLook.getState().mode
  if (isFlat(m)) { flyTo(flatRequest(m, viewAspect(), useVistaLook.getState().corner).req); return }
  const t = s.towers.city.find((k) => k.id === s.selectedTower) ?? s.towers.city[0]
  const cam = live.camera, ctl = live.ctl
  // No tower yet (Massing starts on a cleared site): frame the site instead of doing nothing (16 Nov, Sinnie: "the zoom
  // button on the right is not working").
  if (!t) { void import('../lib/siteFit').then((m) => m.fitSite()); return }
  if (!cam || !ctl) return
  const target: [number, number, number] = [t.x, t.y, s.groundElevation + t.height / 2]
  const d = THREE.MathUtils.clamp(t.height * 3.2 + 250, 350, 3000)
  // Keep the bearing and the tilt of the current view.
  const off = cam.position.clone().sub(ctl.target).normalize()
  const dir = new THREE.Vector3(off.x, -off.z, off.y) // three -> model
  s.set({ cameraRequest: { position: [target[0] + dir.x * d, target[1] + dir.y * d, target[2] + Math.max(0.35, dir.z) * d], target, fov: 45 } })
}

const iconSq = 'flex h-[30px] w-[30px] items-center justify-center'
function Utilities() {
  const dockOpen = useDock((s) => s.menu)
  return (
    <div className="flex flex-col items-end gap-[5px]">
      <Compass />
      <div className="h-3" />
      {/* 12 Nov (Sinnie: "change this to icons instead of words"): icon buttons, the words on hover and for screen readers. */}
      {utilityButton(<Crosshair size={17} aria-hidden />, 'Focus site: frame the selected tower, or the site when there is none', focusSite, iconSq, 'Focus site')}
      {utilityButton(<Plus size={17} aria-hidden />, 'Zoom in', () => zoom(-0.35), iconSq, 'Zoom in')}
      {utilityButton(<Minus size={17} aria-hidden />, 'Zoom out', () => zoom(0.35), iconSq, 'Zoom out')}
      <button type="button" aria-expanded={dockOpen} aria-controls="vp-dock" aria-label="Layers" title="Layers" onClick={() => useDock.setState({ menu: !dockOpen })}
        className={`${iconSq} rounded-lg hover:bg-subtle ${dockOpen ? 'text-accent' : ''} ${focusRing}`} style={box}>
        <Layers size={17} aria-hidden />
      </button>
    </div>
  )
}

// ---------- legend ----------
function Legend() {
  const mode = useShownMode()
  const coneHidden = useConeVisibility((s) => s.hidden)
  const viewTool = useViewToolOpen()
  const conesShown = !CONES.every((c) => coneHidden[c.id])
  const sw = (color: string, extra: CSSProperties = {}) => <i aria-hidden className="inline-block h-3 w-3 shrink-0 rounded-[3px]" style={{ background: color, border: '1px solid rgb(32 38 48 / 0.18)', ...extra }} />
  return (
    <>
    {/* The View menu at the top of the view (12 Nov): mode, Pin view, the sun and the key of the shown mode. Only an
        Analysis scale stays down here, since the colours can't be read without it. */}
    {mode === 'analysis' && <div data-testid="city-legend" className="glass grid max-w-full gap-1.5 rounded-[8px] border border-line bg-panel/95 p-1.5 text-meta text-ink"><AnalysisLegend project="city" /></div>}
    <ViewModeMenu project="city" angles={<>{viewTool && <><AngleButtons /><span aria-hidden className="mx-0.5 h-5 w-px bg-line" /></>}<PlanSwitch /></>} onFrame={focusSite}>
      <div className="flex flex-wrap items-center gap-1.5"><SunChip /></div>
      {<>
        {mode === 'massing' && <MassingKey />}
        {mode === 'program' && <>
          <TowerUseKey />
          <KeyGroup label="Existing buildings">
            {BUILDING_USES.map((u) => (
              <KeyItem key={u.id} sw={sw(useColor(u.id), { borderColor: SWATCH_BORDER })}
                title={u.id === 'other' ? 'No use in OpenStreetMap: shown as unknown, never guessed from height or shape' : 'Each building’s own OpenStreetMap tag, else a point of interest inside it'}>
                {u.id === 'other' ? 'Unknown' : u.label.replace(/ \(.*\)$/, '').replace(/ \/ .*$/, '').replace(/ & .*$/, '')}
              </KeyItem>
            ))}
          </KeyGroup>
        </>}
        {mode === 'analysis' && <AnalysisLegend project="city" />}
        {mode === 'materials' && <>
          <MassingKey existing={false} />
          <p className="max-w-[30rem] text-muted">Vista’s Context textures: facades by building family, paving, asphalt, parks and water. Illustrative, never surveyed.</p>
        </>}
        {(conesShown || mode !== 'materials') && <KeyGroup label="Map">
          {conesShown && <>
            <KeyItem sw={sw(CONE_BLUE.edge)} title="Protected view cones (City ViewCone polygons), drawn as Vista draws them: a volume standing on each cone’s ceiling">View cone</KeyItem>
            <KeyItem sw={sw(CONE_BLUE.surface)} title="Each cone’s ceiling: the City-sourced estimate for 8 cones (solid edges), else Vista’s study surface, fainter with dashed edges (an assumption)">Ceiling</KeyItem>
            <KeyItem sw={sw(VISTA_INTRUSION)} title="Where a design tower rises above a City-sourced cone estimate">Above limit</KeyItem>
            <KeyItem sw={sw(VISTA.observer)} title="Where the eye stands (protected viewpoint or View from here) and the line to the tower">Observer</KeyItem>
            <KeyItem sw={sw(VISTA.wedge)} title="What the eye-level view takes in">View angle</KeyItem>
          </>}
          {mode !== 'materials' && <>
            <KeyItem sw={sw(VISTA.parks)}>Park</KeyItem>
            <KeyItem sw={sw(VISTA.water)}>Water</KeyItem>
            <KeyItem sw={sw(MODEL.ground)}>Ground</KeyItem>
          </>}
        </KeyGroup>}
      </>}
    </ViewModeMenu>
    </>
  )
}

// ---------- inspect ----------
function InspectCard() {
  const p = useVistaLook((s) => s.inspected)
  const { data } = useCityObstacles()
  if (!p || !data) return null
  const est = isEstimate(data, p.index)
  return (
    <div role="status" aria-live="polite" className="max-w-[26rem] px-2 py-1.5 text-meta leading-snug" style={box}>
      <div className="flex items-start gap-2">
        <b className="font-semibold">{buildingLabel(data, p.index)}</b>
        <button type="button" aria-label="Close the building details" title="Close" onClick={() => useVistaLook.setState({ inspected: null })} className={`ml-auto flex h-5 w-5 items-center justify-center rounded-lg hover:bg-subtle ${focusRing}`}><X size={13} aria-hidden /></button>
      </div>
      <div>Height <b className="tabular-nums">{(p.roof - p.ground).toFixed(1)} m</b> · roof {p.roof.toFixed(1)} m CGVD28 · base {p.ground.toFixed(1)} m</div>
      <div className="text-meta">{buildingSource(data, p.index)}{est ? ' · an estimate, not measured' : ''}</div>
    </div>
  )
}

// ---------- Observer: the cone picker ----------
/**
 * Protected views by number and name; the eye at the City's viewpoint elevation Lv, looking along the cone's axis.
 * Previous / Next step through them in order (Ruijie, 6 Nov, after Vista's "← Previous · Protected views 3 / 27 · Next →").
 */
// 12 Nov ("move the function where you can select view cone to the one on the bottom right"): drawn inside the
// location-map card (VistaInset), on top of the map, at the map's width.
export function ConePicker({ inline = false }: { inline?: boolean } = {}) {
  const vp = useViewFromStore((s) => s.viewpoint)
  const looking = useViewFromStore((s) => s.looking)
  const current = looking && vp?.kind === 'cone' ? vp.coneId ?? '' : ''
  const cone = CONES.find((c) => c.id === current)
  const at = CONES.findIndex((c) => c.id === current)
  const navBtn = `rounded-lg border px-2 py-0.5 text-meta hover:bg-subtle ${focusRing}`
  return (
    <div data-testid="cone-picker" className={`${inline ? 'w-full' : 'w-[196px]'} space-y-1 text-meta`} style={{ color: CHROME.ink }}>
      <label className="grid gap-0.5">
        <span className="font-semibold">View cone</span>
        <select aria-label="Protected view to look from" value={current} onChange={(e) => { if (e.target.value) goToCone(e.target.value) }}
          className={`w-full min-w-0 rounded-lg border bg-panel px-1 py-0.5 text-meta ${focusRing}`} style={{ borderColor: CHROME.border, color: CHROME.ink }}>
          {!current && <option value="">Choose a protected view…</option>}
          {CONES.map((c) => <option key={c.id} value={c.id}>{c.id} · {c.name}{hasEstimate(c.id) ? '' : ' (no City estimate)'}</option>)}
        </select>
      </label>
      <nav aria-label="Protected view navigation" data-testid="cone-nav" className="flex items-center gap-1.5">
        <button type="button" onClick={() => goToCone(stepConeId(current, -1))} aria-label="Previous protected view" aria-describedby="cone-position"
          className={navBtn} style={{ borderColor: CHROME.border, background: '#ffffff' }}>←</button>
        <span id="cone-position" role="status" aria-live="polite" aria-atomic="true" className="flex-1 text-center text-meta tabular-nums">
          {at < 0 ? `${CONES.length} views` : `${at + 1} / ${CONES.length}`}
        </span>
        <button type="button" onClick={() => goToCone(stepConeId(current, 1))} aria-label="Next protected view" aria-describedby="cone-position"
          className={navBtn} style={{ borderColor: CHROME.border, background: '#ffffff' }}>→</button>
      </nav>
      {cone && <p className="text-meta leading-snug" title="Eye at the City's viewpoint elevation Lv (ViewCone service), looking along the cone's axis. Esc or City to leave.">Eye at Lv {cone.Lv} m, along the cone's axis</p>}
      {!cone && looking && <p className="text-meta leading-snug">Looking from {vp?.label ?? 'a picked point'} (View from here).</p>}
      {!inline && <button type="button" onClick={() => useViewFromStore.getState().set({ picking: true, looking: false, note: null })}
        title="Or stand on a street or roof (View from here)"
        className={`w-full rounded-lg border px-2 py-0.5 text-meta hover:bg-subtle ${focusRing}`} style={{ borderColor: CHROME.border, background: '#ffffff' }}>
        Stand on a street or roof
      </button>}
    </div>
  )
}

// ---------- the overlay ----------
/** Everything Vista draws over its view, for Real Vancouver outside Present. */
export function VistaChrome() {
  const mode = useActiveMode()
  const note = useVistaLook((s) => s.note)
  const viewNote = useViewFromStore((s) => s.note)
  // At eye level the location map takes the bottom-right corner and, as in Vista, the legend steps aside.
  const looking = useViewFromStore((s) => s.looking || s.picking)
  // Schematic's title block takes the bottom right: the caption and legend wrap short of it.
  const schematic = useStore((s) => s.phase === 'advanced')
  // Esc leaves Inspect and Plan (View from here handles its own Esc).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (e.key !== 'Escape' || tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return
      const m = useVistaLook.getState().mode
      if (m === 'inspect' || isFlat(m)) useVistaLook.setState({ mode: 'city', inspected: null })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  return (
    <>
      <div data-vista-overlay="top" className="pointer-events-none absolute left-2.5 top-2.5 z-10 flex flex-col items-start gap-2 [&>*]:pointer-events-auto">
        {/* Viewcone and Names moved into Layers › Show (12 Nov); the view angles are in the view bar; the cone picker is in
            the bottom-right location-map card (VistaInset). */}
        <HigherBuildingsCard />
      </div>
      <div className="pointer-events-none absolute right-2.5 top-2.5 z-10 [&>*]:pointer-events-auto"><Utilities /></div>
      <div data-vista-overlay="bottom" className={`pointer-events-none absolute bottom-2.5 left-2.5 z-10 flex ${looking ? 'max-w-[calc(100%-15.5rem)]' : schematic ? 'max-w-[calc(100%-19rem)]' : 'max-w-[calc(100%-1.25rem)]'} flex-col items-start gap-1.5 [&>*]:pointer-events-auto`}>
        {mode === 'inspect' && <InspectCard />}
        {(note || viewNote) && <div role="status" className="max-w-[30rem] px-2 py-[3px] text-meta" style={{ ...box, background: '#f3e9dbee', color: '#684838' }}>{note ?? viewNote}</div>}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 px-2 py-[3px] text-meta leading-[1.45]" style={box} title={MODE_HINT[mode]} data-testid="mode-gestures">
          <b className="font-semibold">{MAP_MODES.find((m) => m.id === mode)?.label ?? mode}</b>
          {MODE_GESTURES[mode].map(([g, w]) => <span key={g} className="flex items-center gap-1"><kbd className="rounded border border-current/30 px-1 font-sans text-meta">{g}</kbd>{w}</span>)}
          <span className="sr-only">{MODE_HINT[mode]}</span>
        </div>
        <Legend />
      </div>
    </>
  )
}

// ---------- in the canvas ----------
const v3 = new THREE.Vector3(), n3 = new THREE.Vector3()

/**
 * Inside the canvas: shares the orbit controls with the chrome, keeps Vista's fog reach, turns the compass, places the
 * labels (Vista's overlap rule), picks buildings in Inspect and holds the north-up top view in Plan.
 */
/**
 * The camera moves (flyTo) and the Plan view, for both sites (19 Nov): north up from straight above the study site in a
 * parallel projection, left-drag pans; leaving it restores the view before. CityScene mounts it through VistaLookRig,
 * VtcScene on its own.
 */
/** The camera of a locked view, and for an elevation the plane that cuts the street in front of the building. */
function flatRequest(mode: MapMode, aspect: number, corner: Corner): { req: CamReq; plane: THREE.Plane | null } {
  const centre = studyCentre()
  if (isElevation(mode)) {
    // The study tower's size sets the frame and where the cut sits: its face plus the pavement and half the street.
    const s = useStore.getState(), list = s.towers[s.project], tw = list.find((k) => k.id === s.selectedTower) ?? list[0]
    const across = tw ? Math.max(tw.width, tw.depth) : 120, height = tw ? tw.height : 120
    const bearing = ELEVATIONS[mode] + upNorthDeg(), rad = THREE.MathUtils.degToRad(bearing)
    const req = elevationCamera([centre[0], centre[1], centre[2] + height / 2], aspect, bearing, { w: across * 2.4, h: height * 1.25 })
    const cut = [centre[0] + Math.sin(rad) * (across / 2 + ELEVATION_CUT_M), centre[1] + Math.cos(rad) * (across / 2 + ELEVATION_CUT_M), centre[2]] as const
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(new THREE.Vector3(-Math.sin(rad), 0, Math.cos(rad)).normalize(), toThree(cut[0], cut[1], cut[2]))
    return { req, plane }
  }
  if (mode === 'plan') return { req: orientReq(planCamera(centre, aspect)), plane: null }
  if (mode === 'axo') return { req: axoObliqueCamera(centre, aspect, CORNERS[corner] + upNorthDeg()), plane: null }
  return { req: axoCamera(centre, aspect, CORNERS[corner] + upNorthDeg(), ISO_ELEVATION_DEG), plane: null }
}

export function PlanRig() {
  const { camera, gl, scene, invalidate } = useThree()
  const controls = useThree((s) => s.controls) as unknown as Ctl | null
  const mode = useActiveMode()
  const corner = useVistaLook((s) => s.corner)
  const phase = useStore((s) => s.phase)
  const saved = useRef<{ position: [number, number, number]; target: [number, number, number]; fov: number } | null>(null)
  const savedUp = useRef(0)
  // Present has no map modes: back to the orbit (and out of Plan's pan-only controls).
  useEffect(() => { if (phase === 'present') useVistaLook.setState({ mode: 'city', inspected: null, note: null }) }, [phase])

  useEffect(() => {
    live.ctl = controls; live.camera = camera as THREE.PerspectiveCamera; live.invalidate = invalidate; live.el = gl.domElement
    return () => { live.ctl = null; live.camera = null; live.invalidate = null }
  }, [controls, camera, invalidate, gl])

  // Plan: north up from straight above the study site, 1 km across (zoom stays free), left-drag pans. Axo and Iso:
  // the parallel views from the south-east of the chosen north, same width, turn and pan free. Going between them keeps
  // the free 3D view saved; leaving them for Free (or Inspect) restores it (Vancouver's City flies to the overview).
  useEffect(() => {
    const ctl = controls, cam = camera as THREE.PerspectiveCamera
    if (!ctl || !isFlat(mode)) return
    if (!saved.current) { saved.current = { position: toModel(cam.position), target: toModel(ctl.target), fov: cam.fov }; savedUp.current = upNorthDeg() }
    const aspect = gl.domElement.clientWidth / Math.max(1, gl.domElement.clientHeight)
    // The plan with the chosen north up (true north or project north, Your site), Axo / Iso from their corner, an
    // elevation from its side with everything between the eye and the street in front of the building cut away.
    const { req, plane } = flatRequest(mode, aspect, corner)
    flyTo(req)
    gl.clippingPlanes = plane ? [plane] : []
    invalidate()
    // Locked: no turning in any of them (19 Nov, Sinnie), left-drag pans.
    const buttons = { ...ctl.mouseButtons }, touches = { ...ctl.touches }
    ctl.enableRotate = false
    ctl.mouseButtons = { ...ctl.mouseButtons, LEFT: THREE.MOUSE.PAN }
    ctl.touches = { ...ctl.touches, ONE: THREE.TOUCH.PAN }
    return () => {
      ctl.enableRotate = true; ctl.mouseButtons = buttons; ctl.touches = touches
      if (gl.clippingPlanes.length) { gl.clippingPlanes = []; invalidate() }
      const next = useVistaLook.getState().mode
      if (isFlat(next)) return
      const back = saved.current, st = useStore.getState()
      // Back in 3D as it was, turned by any change of north made meanwhile (Vancouver's City button flies to the
      // overview itself; the competition site's 3D always comes back here).
      if (back && !flight.to && st.phase !== 'present' && (st.project === 'vtc' || (st.project === 'city' && next === 'inspect'))) flyTo(turnReq(back, upNorthDeg() - savedUp.current))
      saved.current = null
    }
  }, [mode, corner, controls, camera, gl, invalidate])

  // 2D is a true plan, Axo and Iso true axonometrics: a parallel projection (lib/planOrtho.ts), so no building leans and the
  // axes stay to scale.
  useEffect(() => {
    if (!isFlat(mode) || !controls) return
    // The shear eases from where it is to Axo's (1) or none, on the flight's clock, so Axo <-> Iso is one smooth move.
    const to = mode === 'axo' ? AXO_SHEAR : 0
    if (useStore.getState().reducedMotion) shearTween.now = to
    shearTween.from = shearTween.now; shearTween.to = to; shearTween.start = performance.now()
    camera.userData.shear = shearTween.now
    return startPlanOrtho(camera, scene, controls as unknown as { target: THREE.Vector3 }, invalidate)
  }, [mode, controls, camera, scene, invalidate])

  // Grabbing the view stops a camera move.
  useEffect(() => {
    const ctl = controls as unknown as { addEventListener?: (t: string, f: () => void) => void; removeEventListener?: (t: string, f: () => void) => void } | null
    const stop = () => { flight.to = null }
    ctl?.addEventListener?.('start', stop)
    return () => ctl?.removeEventListener?.('start', stop)
  }, [controls])

  useFrame(() => {
    const ctl = controls, cam = camera as THREE.PerspectiveCamera
    if (!ctl) return
    if (shearTween.now !== shearTween.to && cam.userData.planOrtho) {
      const x = Math.min(1, (performance.now() - shearTween.start) / flight.dur)
      shearTween.now = x >= 1 ? shearTween.to : shearTween.from + (shearTween.to - shearTween.from) * easeInOut(x)
      cam.userData.shear = shearTween.now
      invalidate()
    }
    // A camera move in progress (flyTo): ease in-out on the clock, so a slow machine takes fewer, larger steps, not longer.
    if (flight.to && flight.from) {
      const x = Math.min(1, (performance.now() - flight.start) / flight.dur), e = x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2
      const lerp = (a: [number, number, number], b: [number, number, number]) => a.map((v, i) => v + (b[i] - v) * e) as [number, number, number]
      const p = lerp(flight.from.position, flight.to.position), t = lerp(flight.from.target, flight.to.target)
      cam.position.copy(toThree(...p)); ctl.target.copy(toThree(...t))
      cam.fov = flight.from.fov + (flight.to.fov - flight.from.fov) * e
      cam.near = Math.max(1, cam.position.distanceTo(ctl.target) / 300)
      cam.updateProjectionMatrix(); ctl.update()
      if (x >= 1) flight.to = null
      invalidate()
    }
  })
  return null
}

/** Vancouver's rig: the plan and flights (PlanRig), the fog, the compass, the place labels, Inspect's picking. */
export function VistaLookRig() {
  const { camera, gl, scene } = useThree()
  const controls = useThree((s) => s.controls) as unknown as Ctl | null
  const { data, idx, heights } = useCityObstacles()
  const mode = useActiveMode()

  // Inspect: a click (not a drag) on a building shows its height, type and sources.
  useEffect(() => {
    if (mode !== 'inspect' || !data || !idx) return
    const el = gl.domElement, ray = new THREE.Raycaster()
    let down: [number, number] | null = null
    const onDown = (e: PointerEvent) => { down = e.button === 0 ? [e.clientX, e.clientY] : null }
    const onUp = (e: PointerEvent) => {
      if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 4) return
      const r = el.getBoundingClientRect()
      ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera)
      const hit = ray.intersectObjects(scene.children, true).find((h) => (h.object as THREE.Mesh).isMesh && h.object.visible)
      if (!hit) return
      const x = hit.point.x, y = -hit.point.z
      const p = pickAt(idx, heights, x, y, 0)
      useVistaLook.setState(p.kind === 'roof'
        ? { inspected: { index: p.index, x, y, roof: p.roof, ground: p.ground }, note: null }
        : { inspected: null, note: p.kind === 'unknown' ? p.reason : 'No building there: click a building.' })
    }
    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointerup', onUp)
    el.style.cursor = 'help'
    return () => { el.removeEventListener('pointerdown', onDown); el.removeEventListener('pointerup', onUp); el.style.cursor = '' }
  }, [mode, data, idx, heights, gl, camera, scene])

  useFrame(({ size }) => {
    const ctl = controls, cam = camera as THREE.PerspectiveCamera
    if (!ctl) return
    setVistaFog(cam.position.distanceTo(ctl.target))
    // Compass: where north points on screen, from the target's screen position and a point 100 m north of it.
    if (live.compass) {
      const a = v3.copy(ctl.target).project(cam), b = n3.copy(ctl.target).add(new THREE.Vector3(0, 0, -100)).project(cam)
      const deg = THREE.MathUtils.radToDeg(Math.atan2((b.x - a.x) * size.width, (b.y - a.y) * size.height))
      live.compass.style.transform = `rotate(${deg.toFixed(1)}deg)`
    }
    // Labels: 40 m above the anchor (Vista's anchor height or the ground, the higher), hidden when behind the camera or off screen; a place
    // label that overlaps one already placed is hidden (Vista's rule, half width = 2.9 px per character + 8 px at 11 px type;
    // 3.3 px per character at the 12 px type floor), 22 px tall.
    if (!live.labels.size || !data) return
    const placed: [number, number, number, number][] = []
    // The design towers' name and over-limit labels (Viewport.tsx) come first: a place label never covers them.
    const st = useStore.getState(), planLabels = useVistaLook.getState().mode === 'plan'
    for (const t of st.towers.city) {
      const q = toThree(t.x, t.y, st.groundElevation + t.height + 10).project(cam)
      if (q.z > 1 || q.z < -1) continue
      const px = ((q.x + 1) / 2) * size.width, py = ((1 - q.y) / 2) * size.height
      // In Plan the tower's labels hang below their anchor (Viewport.tsx), elsewhere they stand above it.
      placed.push(planLabels ? [px - 125, py - 4, px + 125, py + 40] : [px - 125, py - 40, px + 125, py + 4])
    }
    for (const reserve of labelReservations) { const b = reserve(cam, size); if (b) placed.push(b) }
    for (const key of live.labelOrder) {
      const el = live.labels.get(key)
      if (!el) continue
      const x = Number(el.dataset.x), y = Number(el.dataset.y)
      const g = Math.max(0, Number(el.dataset.z) || 0, sampleTerrain(data.grids, x, y) ?? 0)
      const q = toThree(x, y, g + 40).project(cam)
      if (q.z > 1 || q.z < -1 || q.x < -1.05 || q.x > 1.05 || q.y < -1.05 || q.y > 1.05) { el.style.display = 'none'; continue }
      const px = ((q.x + 1) / 2) * size.width, py = ((1 - q.y) / 2) * size.height, half = (el.textContent?.length ?? 0) * 3.3 + 8
      // UI review (3 Nov): a label the view's edge would cut ("North Vanc…") is hidden rather than shown in part.
      if (px - half < 4 || px + half > size.width - 4 || py - 22 < 4 || py > size.height - 4) { el.style.display = 'none'; continue }
      if (placed.some((b) => px + half > b[0] && px - half < b[2] && py > b[1] && py - 22 < b[3])) { el.style.display = 'none'; continue }
      placed.push([px - half, py - 22, px + half, py + 3])
      el.style.display = ''
      el.style.left = `${px.toFixed(1)}px`
      el.style.top = `${py.toFixed(1)}px`
    }
  })
  const inspected = useVistaLook((s) => s.inspected)
  // The building picked in Inspect, marked above its roof (Vista colours its selection; one mesh here, so a marker).
  return <>
    <PlanRig />
    {mode === 'inspect' && inspected && <Label text="▼ inspected" position={[inspected.x, inspected.y, inspected.roof + 14]} size={0.016} color={CHROME.plateInk} background="rgba(66,107,97,0.92)" bold />}
  </>
}
