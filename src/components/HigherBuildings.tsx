// Higher Buildings on the map (Milestone A, 9 Nov 2026): one Planning item, kept apart from the place names.
//   - Discover: Layers > Planning (both projects) and the address search ("higher", "tall", "policy").
//   - Highlight: hover or keyboard focus on the item or its map label previews the outline and the label.
//   - Inspect: selecting the item or its label opens a compact card (status, source, dates, geometry basis, your site's
//     geographic relationship, open source); explanations sit behind a fold, the status stays visible.
//   - Frame: fits the whole area (all 14 parts) with a margin; smooth unless reduced motion; Esc or grabbing the view stops
//     it. Back returns to the view before framing (or to the site).
//   - Pin keeps the layer on while designing; its label is a separate setting.
// Display only: a translucent fill and an outline draped just above the terrain, no depth writes, no picking, no height,
// no extrusion. Selecting it never changes the site, towers, camera, calculations, north or datum.
// Data and rules: lib/higherBuildings.ts, engine/policyArea.ts.
import { Line } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, type CSSProperties, type ReactNode } from 'react'
import * as THREE from 'three'
import { earTriangles, ringMetrics, validateRing, type Pt } from '../engine/site'
import { RELATION_HINT, RELATION_METHOD, RELATION_WORD, type SiteRelation } from '../engine/policyArea'
import { sampleTerrain, type HeightGrid } from '../lib/cityLayers'
import { HB, HB_DASHED, HB_LABEL_SPOTS, HB_LAYER, HB_PARTS, HB_TOLERANCE, closeHb, hbRelation, hbVisible, longDate, pinLayer, previewHb, selectHb, showLabels, useHigherBuildings } from '../lib/higherBuildings'
import { openCity } from '../lib/openCity'
import { useViewFromStore } from '../lib/viewFromStore'
import { useStore } from '../store'
import { useCityData } from './CityContext'
import Fold from './Fold'
import Help from './Help'
import { ChevronDown, Expand, ExternalLink, Landmark, Pin, Tags, Undo2, X } from './icons'
import { idle as mapIdle } from './site/PlaceNames'
import { cancelFlight, currentView, flyTo, flyToFit, isFlying, labelReservations, useActiveMode } from './VistaLook'
import { useDock } from './ViewportDock'

/** The City legend's orange for the policy area (the source map's own colour, so the two compare at a glance). */
export const HB_COLOR = { line: '#B05400', fill: '#F68D1E', ink: '#7A3B00', surface: '#FFF3E6' }
const LIFT_FILL = 1.2, LIFT_LINE = 1.8

// ---------------------------------------------------------------- geometry (model frame, x east, y north, z up)
type Ground = (x: number, y: number) => number
const groundOf = (grids: HeightGrid[] | undefined): Ground => {
  const g0 = useStore.getState().groundElevation
  return (x, y) => Math.max(0, (grids ? sampleTerrain(grids, x, y) : null) ?? g0)
}

/** A ring densified every `step` m and set `lift` m above the ground (an outline that follows the terrain). */
export function drapeRing(ring: Pt[], ground: Ground, lift: number, step = 4): [number, number, number][] {
  const out: [number, number, number][] = []
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step))
    for (let k = 0; k < n; k++) { const x = a[0] + ((b[0] - a[0]) * k) / n, y = a[1] + ((b[1] - a[1]) * k) / n; out.push([x, y, ground(x, y) + lift]) }
  }
  out.push(out[0])
  return out
}

/** The parts' triangles split until no edge is longer than `edge` m, each corner on the ground plus `lift`. */
export function drapeFill(parts: readonly { ring: Pt[] }[], ground: Ground, lift: number, edge = 8): Float32Array {
  const pos: number[] = []
  const split = (a: Pt, b: Pt, c: Pt, depth: number) => {
    const ab = Math.hypot(b[0] - a[0], b[1] - a[1]), bc = Math.hypot(c[0] - b[0], c[1] - b[1]), ca = Math.hypot(a[0] - c[0], a[1] - c[1])
    const m = Math.max(ab, bc, ca)
    if (m <= edge || depth > 14) { for (const p of [a, b, c]) pos.push(p[0], p[1], ground(p[0], p[1]) + lift); return }
    // halve the longest edge
    if (m === ab) { const d: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; split(a, d, c, depth + 1); split(d, b, c, depth + 1) }
    else if (m === bc) { const d: Pt = [(b[0] + c[0]) / 2, (b[1] + c[1]) / 2]; split(a, b, d, depth + 1); split(a, d, c, depth + 1) }
    else { const d: Pt = [(c[0] + a[0]) / 2, (c[1] + a[1]) / 2]; split(a, b, d, depth + 1); split(d, b, c, depth + 1) }
  }
  for (const p of parts) for (const [a, b, c] of earTriangles(p.ring)) split(a, b, c, 0)
  return new Float32Array(pos)
}

const NO_PICK = () => null

// ---------------------------------------------------------------- the label (DOM over the view), positioned by the layer
const live = { label: null as HTMLElement | null }

type Size = { width: number; height: number }
/** Screen position of a model point, or null when behind the camera or off screen. */
function onScreen(cam: THREE.Camera, size: Size, x: number, y: number, z: number): [number, number] | null {
  const q = new THREE.Vector3(x, z, -y).project(cam)
  if (q.z > 1 || q.z < -1 || q.x < -1 || q.x > 1 || q.y < -1 || q.y > 1) return null
  return [((q.x + 1) / 2) * size.width, ((1 - q.y) / 2) * size.height]
}
type Box = [number, number, number, number]
const overlaps = (a: Box, b: Box) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1]

/**
 * Where the label goes this frame: the first spot inside the core (nearest its pole) whose box keeps clear of the study
 * site's own label (SiteRig: at the site centroid, 18 m up); when none does (a far view), the pole's spot lifted just
 * above the site label. Null when the core is off screen.
 */
function placeLabel(cam: THREE.Camera, size: Size, spots: { x: number; y: number; z: number }[], site: { x: number; y: number; z: number } | null, w: number, h: number): [number, number] | null {
  const s = site ? onScreen(cam, size, site.x, site.y, site.z) : null
  const siteBox: Box | null = s ? [s[0] - 135, s[1] - 30, s[0] + 135, s[1] + 8] : null
  let first: [number, number] | null = null
  for (const p of spots) {
    const at = onScreen(cam, size, p.x, p.y, p.z)
    if (!at) continue
    first ??= at
    if (!siteBox || !overlaps([at[0] - w / 2, at[1] - h / 2, at[0] + w / 2, at[1] + h / 2], siteBox)) return at
  }
  return first && siteBox ? [first[0], siteBox[1] - h / 2 - 6] : first
}

/** The overlay in the canvas (Real Vancouver): fill, outline, and the label's placement each frame. */
export function HigherBuildingsLayer() {
  const vis = useHigherBuildings(hbVisible)
  const labels = useHigherBuildings((s) => s.labels)
  const strong = useHigherBuildings((s) => s.selected || s.hover || s.preview)
  const { data } = useCityData()
  const mode = useActiveMode()
  const plan = mode === 'plan'
  const { controls } = useThree()
  const grids = data?.grids
  const siteRing = useStore((s) => s.citySite?.ring)
  const geom = useMemo(() => {
    if (!vis) return null
    const ground = groundOf(grids)
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(drapeFill(HB_PARTS, ground, LIFT_FILL), 3))
    g.computeBoundingSphere()
    return { fill: g, rings: HB_PARTS.map((p) => drapeRing(p.ring, ground, LIFT_LINE)), spots: HB_LABEL_SPOTS.map(([x, y]) => ({ x, y, z: ground(x, y) + 30 })) }
  }, [vis, grids])
  const site = useMemo(() => {
    if (!siteRing || siteRing.length < 3 || validateRing(siteRing as Pt[])) return null
    const [x, y] = ringMetrics(siteRing as Pt[]).centre
    return { x, y, z: groundOf(grids)(x, y) + 18 }
  }, [siteRing, grids])
  useEffect(() => () => geom?.fill.dispose(), [geom])
  // The label claims its box before the place names are placed (VistaLookRig), so no place name covers it.
  const show = vis && labels && mode !== 'observer'
  useEffect(() => {
    if (!show || !geom) return
    const reserve = (cam: THREE.Camera, size: Size) => {
      const el = live.label
      if (!el) return null
      const w = el.offsetWidth || 150, h = el.offsetHeight || 22, at = placeLabel(cam, size, geom.spots, site, w, h)
      return at ? [at[0] - w / 2 - 4, at[1] - h / 2 - 2, at[0] + w / 2 + 4, at[1] + h / 2 + 2] as Box : null
    }
    labelReservations.add(reserve)
    return () => { labelReservations.delete(reserve) }
  }, [show, geom, site])
  useFrame(({ camera, size }) => {
    const el = live.label
    if (!el) return
    const at = show && geom ? placeLabel(camera, size, geom.spots, site, el.offsetWidth || 150, el.offsetHeight || 22) : null
    if (!at) { if (el.style.display !== 'none') el.style.display = 'none'; return }
    el.style.display = ''
    el.style.left = `${at[0].toFixed(1)}px`
    el.style.top = `${at[1].toFixed(1)}px`
    // Reduced prominence at close range: within about 900 m of the view's target the label quietens.
    const t = (controls as unknown as { target?: THREE.Vector3 } | null)?.target
    const near = !!t && camera.position.distanceTo(t) < 900
    if ((el.dataset.near === '1') !== near) el.dataset.near = near ? '1' : '0'
  })
  if (!geom) return null
  const lineProps = { color: HB_COLOR.line, dashed: HB_DASHED, dashSize: 10, gapSize: 6, raycast: NO_PICK, userData: { siteOverlay: true, policyOverlay: 'higher-buildings' } }
  return (
    <group name="higher-buildings" userData={{ siteOverlay: true }}>
      <mesh name="higher-buildings:fill" geometry={geom.fill} raycast={NO_PICK} renderOrder={2} userData={{ siteOverlay: true, policyOverlay: 'higher-buildings' }}>
        {/* Plan reads like a map (the tint over roofs too); oblique views tint only the ground they can see. */}
        <meshBasicMaterial color={HB_COLOR.fill} transparent opacity={strong ? 0.26 : 0.15} depthWrite={false} depthTest={!plan} side={THREE.DoubleSide} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
      </mesh>
      {/* Under the scene's labels (sprites at render order 10), so the site's own label stays readable over the edge. */}
      {geom.rings.map((pts, k) => (
        <group key={HB_PARTS[k].id}>
          <Line name={`higher-buildings:edge:${HB_PARTS[k].id}`} points={pts} lineWidth={strong ? 3.5 : 2.5} transparent opacity={0.95} depthWrite={false} renderOrder={8} {...lineProps} />
          {/* The same edge through buildings, faint, so the boundary reads in 3D without a wall or a volume. */}
          <Line name={`higher-buildings:xray:${HB_PARTS[k].id}`} points={pts} lineWidth={1.5} transparent opacity={strong ? 0.6 : 0.32} depthTest={false} depthWrite={false} renderOrder={9} {...lineProps} />
        </group>
      ))}
    </group>
  )
}

/**
 * The one map label. Click-through like the place names (a drag that starts on it still moves the view): a press and
 * release on it (within 6 px) selects the item; hovering it highlights the outline. Keyboard: Tab reaches it, focus
 * previews, Enter or Space selects.
 */
export function HigherBuildingsLabel() {
  const vis = useHigherBuildings(hbVisible)
  const labels = useHigherBuildings((s) => s.labels)
  const selected = useHigherBuildings((s) => s.selected)
  const hover = useHigherBuildings((s) => s.hover)
  const looking = useViewFromStore((s) => s.looking || s.picking)
  const on = vis && labels && !looking
  useEffect(() => {
    if (!on) return
    let down: { x: number; y: number } | null = null
    const canvas = () => live.label?.parentElement?.parentElement?.querySelector('canvas') ?? null
    const hit = (x: number, y: number) => {
      const el = live.label
      if (!el || el.style.display === 'none' || !mapIdle()) return false
      const r = el.getBoundingClientRect()
      return x >= r.left - 2 && x <= r.right + 2 && y >= r.top - 2 && y <= r.bottom + 2
    }
    const onMove = (e: PointerEvent) => {
      const h = e.buttons === 0 && e.target === canvas() && hit(e.clientX, e.clientY)
      if (h !== useHigherBuildings.getState().hover) useHigherBuildings.setState({ hover: h })
      const c = canvas()
      if (c) { if (h) c.setAttribute('data-hb-hover', ''); else c.removeAttribute('data-hb-hover') }
    }
    const onDown = (e: PointerEvent) => { down = e.button === 0 && e.target === canvas() && hit(e.clientX, e.clientY) ? { x: e.clientX, y: e.clientY } : null }
    const onClick = (e: MouseEvent) => {
      const d = down
      down = null
      if (!d || e.target !== canvas() || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6 || !hit(e.clientX, e.clientY)) return
      // The label took the click: nothing under it (site menu, building card, tower) answers as well.
      e.stopPropagation(); e.preventDefault()
      useHigherBuildings.setState({ hover: false })
      selectHb()
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('pointerdown', onDown, true)
    window.addEventListener('click', onClick, true)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('click', onClick, true)
      useHigherBuildings.setState({ hover: false })
    }
  }, [on])
  if (!on) return null
  const lit = selected || hover
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <button ref={(el) => { live.label = el }} type="button" data-testid="hb-label" data-near="0"
        aria-label={`Higher Buildings: ${HB_LAYER.title.toLowerCase()} (Planning). Enter opens its details.`}
        onFocus={() => previewHb(true)} onBlur={() => previewHb(false)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectHb() } }}
        className="hb-label pointer-events-none absolute flex items-center gap-1.5 whitespace-nowrap rounded-[6px] border px-1.5 text-meta leading-[20px] outline-none focus-visible:ring-2 focus-visible:ring-accent"
        style={{ display: 'none', transform: 'translate(-50%, -50%)', background: lit ? HB_COLOR.surface : 'rgba(255,255,255,0.92)', borderColor: HB_COLOR.line, color: HB_COLOR.ink, boxShadow: '0 1px 3px rgba(43,60,48,0.15)' }}>
        <Swatch />
        <b className="font-semibold">Higher Buildings</b>
        <span className="hb-label-sub">· policy area</span>
      </button>
    </div>
  )
}

/** The legend mark: translucent orange with the line style the map uses (solid: published policy). */
function Swatch({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" aria-hidden className="shrink-0">
      <rect x="1" y="1" width="10" height="10" rx="1.5" fill={HB_COLOR.fill} fillOpacity={0.35} stroke={HB_COLOR.line} strokeWidth="1.5" strokeDasharray={HB_DASHED ? '3 2' : undefined} />
    </svg>
  )
}

// ---------------------------------------------------------------- frame and back
const allPoints = (): Pt[] => HB_PARTS.flatMap((p) => p.ring)

/**
 * Fit the whole area (every part) into the free part of the view; the view before is kept for Back. The card folds to
 * one line and the Layers panel closes first, so the fit measures the view they leave clear (two frames later).
 */
export function frameHb(grids: HeightGrid[] | undefined) {
  if (!useHigherBuildings.getState().previous) useHigherBuildings.setState({ previous: currentView() })
  useHigherBuildings.setState({ selected: true, compact: true, preview: false })
  useDock.setState({ menu: false })
  const ground = groundOf(grids)
  const go = () => flyToFit(allPoints().map(([x, y]) => [x, y, ground(x, y)] as [number, number, number]), 300)
  if (typeof requestAnimationFrame === 'undefined') { go(); return }
  requestAnimationFrame(() => requestAnimationFrame(go))
}

/** Back to the view before Frame area (else to the site); the card unfolds. */
export function backHb(grids: HeightGrid[] | undefined) {
  const prev = useHigherBuildings.getState().previous
  useHigherBuildings.setState({ compact: false })
  if (prev) { useHigherBuildings.setState({ previous: null }); flyTo(prev); return }
  const ring = useStore.getState().citySite?.ring
  if (ring?.length) { const ground = groundOf(grids); flyToFit(ring.map(([x, y]) => [x, y, ground(x, y)] as [number, number, number]), 300) }
}

/** Esc stops a camera move first; otherwise it closes the card. Neither then reaches the map's own Esc. */
function useEscape() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return
      if (isFlying()) { cancelFlight(); e.stopPropagation(); e.preventDefault(); return }
      if (useHigherBuildings.getState().selected) { closeHb(); e.stopPropagation() }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])
}

// ---------------------------------------------------------------- the site relationship
/** A small geographic glyph per relationship (no pass/fail symbols, no status colours: membership is not approval). */
function RelationGlyph({ r }: { r: SiteRelation }) {
  const site = { within: [4, 4], outside: [13, 4], overlapping: [8.5, 4], uncertain: [10, 4] }[r]
  return (
    <svg width="22" height="16" viewBox="0 0 22 16" aria-hidden className="shrink-0">
      <rect x="1" y="1" width="12" height="14" rx="1" fill={HB_COLOR.fill} fillOpacity={0.3} stroke={HB_COLOR.line} strokeWidth="1.2" />
      {r === 'uncertain' && <rect x="10" y="1" width="6" height="14" fill="none" stroke={HB_COLOR.line} strokeWidth="0.8" strokeDasharray="1.5 1.5" />}
      <rect x={site[0]} y={site[1]} width="7" height="8" rx="0.8" fill="#202630" fillOpacity={0.12} stroke="#202630" strokeWidth="1.3" />
    </svg>
  )
}

const m = (v: number) => `${Math.round(v).toLocaleString('en-CA')} m`

function SiteRelationRow() {
  const ring = useStore((s) => s.citySite?.ring)
  const r = useMemo(() => hbRelation(ring as Pt[] | undefined), [ring])
  if (!r) return <Row k="Your site"><span className="text-muted">No study site yet: choose one in the Site step to see where it sits.</span></Row>
  const detail = r.relation === 'outside' ? `${m(r.nearest?.distanceM ?? 0)} from the area`
    : r.relation === 'within' ? 'all of it inside'
      : `${Math.round(r.share * 100)}% inside${r.relation === 'uncertain' ? ' · near the approximate edge' : ''}`
  return (
    <Row k="Your site">
      <span className="flex flex-wrap items-center gap-1" data-testid="hb-relation" data-relation={r.relation}>
        <RelationGlyph r={r.relation} />
        <b className="font-semibold text-ink">{RELATION_WORD[r.relation]}</b>
        <span className="tabular-nums text-muted">· {detail}</span>
        <Help label="How the relationship is found">
          <span className="block">{RELATION_HINT[r.relation]}</span>
          <span className="block">{RELATION_METHOD}</span>
          <span className="block">Each part has a tolerance band from {HB_TOLERANCE.min} to {HB_TOLERANCE.max} m wide (the drawing's measured accuracy); a site inside a band is Uncertain.</span>
        </Help>
      </span>
    </Row>
  )
}

function Row({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[4.75rem_1fr] items-start gap-x-2 py-0.5">
      <span className="text-muted">{k}</span>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

const act = 'inline-flex h-7 items-center gap-1 rounded-lg border border-line bg-panel px-2 text-control text-ink hover:border-[#778294] outline-none focus-visible:ring-2 focus-visible:ring-accent aria-pressed:border-accent aria-pressed:bg-selected aria-pressed:text-accent'

// ---------------------------------------------------------------- the inspector card (Real Vancouver, over the view)
export function HigherBuildingsCard() {
  useEscape()
  const selected = useHigherBuildings((s) => s.selected)
  const compact = useHigherBuildings((s) => s.compact)
  const shown = useHigherBuildings((s) => s.shown)
  const labels = useHigherBuildings((s) => s.labels)
  const previous = useHigherBuildings((s) => s.previous)
  const ring = useStore((s) => s.citySite?.ring)
  const rel = useMemo(() => hbRelation(ring as Pt[] | undefined), [ring])
  const { data } = useCityData()
  if (!selected) return null
  const src = HB_LAYER.source
  const close = <button type="button" onClick={closeHb} aria-label="Close the Higher Buildings details" title="Close (Esc)" className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg hover:bg-subtle outline-none focus-visible:ring-2 focus-visible:ring-accent"><X size={14} aria-hidden /></button>
  const back = <button type="button" className={act} onClick={() => backHb(data?.grids)} disabled={!previous && !ring?.length} title={previous ? 'Back to the view before Frame' : 'Back to your site'} data-testid="hb-back"><Undo2 size={14} aria-hidden />{previous ? 'Back' : 'Site'}</button>
  // Folded while framing: one line, so the whole area shows; Back or the chevron opens it again.
  if (compact) {
    return (
      <section aria-label="Higher Buildings details" data-testid="hb-card" data-compact="" className="flex max-w-[calc(100vw-2rem)] items-center gap-1.5 rounded-[8px] border border-line bg-panel py-1 pl-2 pr-1 text-meta text-ink shadow-[0_2px_8px_rgba(32,38,48,0.12)]">
        <Landmark size={16} aria-hidden className="shrink-0" style={{ color: HB_COLOR.line }} />
        <b className="font-semibold">Higher Buildings</b>
        {rel && <span className="flex items-center gap-1 text-muted"><RelationGlyph r={rel.relation} />{RELATION_WORD[rel.relation]}</span>}
        {back}
        <button type="button" className={act} onClick={() => useHigherBuildings.setState({ compact: false })} aria-label="Show the Higher Buildings details" title="Show the details"><ChevronDown size={14} aria-hidden /></button>
        {close}
      </section>
    )
  }
  return (
    <section aria-label="Higher Buildings details" data-testid="hb-card" className="w-[24rem] max-w-[calc(100vw-2rem)] rounded-[8px] border border-line bg-panel px-2.5 py-2 text-meta text-ink shadow-[0_2px_8px_rgba(32,38,48,0.12)]">
      <header className="flex items-center gap-2">
        <Landmark size={18} aria-hidden className="shrink-0" style={{ color: HB_COLOR.line }} />
        <h3 className="text-control font-semibold leading-tight">Higher Buildings</h3>
        <span className="flex min-w-0 items-center gap-1 truncate text-muted"><Swatch />{HB_LAYER.title}</span>
        <span className="ml-auto" />
        {close}
      </header>
      <div className="mt-1 border-t border-line pt-1">
        <Row k="Status">
          <span className="inline-flex rounded-full px-1.5 font-semibold" data-testid="hb-status" style={{ background: HB_COLOR.surface, color: HB_COLOR.ink }}>Policy in force · under review</span>{' '}
          <span className="text-muted" title={`Review: ${HB.review.phase}, ${HB.review.window}`}>adopted {HB.policy.adopted}</span>
        </Row>
        <Row k="Source"><span className="block truncate" title={`${src.publisher}, ${src.title}, p.${src.page}`}>City review exhibit, p.{src.page}</span></Row>
        <Row k="Map date"><span data-testid="hb-map-date">{longDate(src.documentDate)}</span> <span className="text-muted">(file date)</span></Row>
        <Row k="Retrieved"><span data-testid="hb-retrieved">{longDate(src.retrieved)}</span></Row>
        <Row k="Geometry"><span>Digitized from the map · ±{HB_TOLERANCE.min}–{HB_TOLERANCE.max} m</span></Row>
        <SiteRelationRow />
        <p className="mt-0.5 font-semibold text-ink" data-testid="hb-not-approval">Membership is not approval: no height, form or outcome follows.</p>
      </div>
      <div className="mt-1.5 flex flex-nowrap gap-1">
        <button type="button" className={act} onClick={() => frameHb(data?.grids)} title="Fit the whole area in the view (Esc or a drag stops the move)" data-testid="hb-frame"><Expand size={14} aria-hidden />Frame</button>
        {back}
        <a className={act} href={src.url} target="_blank" rel="noreferrer" title={`Open the City's PDF (p.${src.page})`} data-testid="hb-source"><ExternalLink size={14} aria-hidden />Source</a>
        <button type="button" className={act} aria-pressed={shown} onClick={() => pinLayer(!shown)} title={shown ? 'Pinned: stays on the map while you design. Press to unpin.' : 'Pin: keep the layer on the map while you design'} data-testid="hb-pin"><Pin size={14} aria-hidden />Pin</button>
        <button type="button" className={act} aria-pressed={labels} onClick={() => showLabels(!labels)} title={labels ? 'Label on the map: press to hide it (the layer stays)' : 'Label hidden: press to show it'} data-testid="hb-labels"><Tags size={14} aria-hidden />Label</button>
      </div>
      <Fold className="mt-1.5" summary={<>About this layer: <b className="text-ink">no height is drawn</b>; heights differ by part and site.</>} testId="hb-more">
        <p>Source: {src.publisher}, {src.title}, p.{src.page} ({src.figure}).</p>
        <p>{HB_LAYER.geometryBasis}</p>
        <p>{HB_LAYER.accuracy.text}</p>
        <p>The adopted policy document ({HB.policy.pdf.title}) could not be opened: {HB.policy.pdf.reason}. Its amendment date ({HB.policy.pdf.amendment}) is recorded but unchecked.</p>
        <p>Amendments shown on the exhibit timeline: {HB.policy.amendments.map((a) => `${a.year} ${a.text.replace(/ \(exhibit p\.11 timeline\)\.$/, '')}`).join('; ')}.</p>
        {HB.conflicts.map((c) => <p key={c}>{c}</p>)}
        <p>Review: {HB.review.phase}, {HB.review.window}; next {HB.review.next}. ShapeYourCity page updated {longDate(HB.review.pageUpdated)}, read {longDate(HB.review.retrieved)}. <a className="underline" href={HB.review.url} target="_blank" rel="noreferrer">Review page</a> · <a className="underline" href={HB.review.faq} target="_blank" rel="noreferrer">FAQ</a></p>
        {HB.reviewReferences.map((r) => <p key={r.id}><b className="text-ink">Not drawn:</b> “{r.title}” ({r.source}). {r.why}</p>)}
        <p className="font-semibold text-ink">{HB_PARTS.length} parts, kept as drawn:</p>
        <ul className="grid gap-0.5" data-testid="hb-parts">
          {HB_PARTS.map((p) => <li key={p.id} className="tabular-nums"><code className="text-meta">{p.id}</code> {p.label} · {p.areaM2.toLocaleString('en-CA')} m² · ±{p.toleranceM} m</li>)}
        </ul>
        {HB.notes.map((n) => <p key={n}>{n}</p>)}
      </Fold>
    </section>
  )
}

// ---------------------------------------------------------------- Layers > Planning (Real Vancouver)
/** Hover or keyboard focus previews; leaving ends the preview. */
const previewProps = { onMouseEnter: () => previewHb(true), onMouseLeave: () => previewHb(false), onFocus: () => previewHb(true), onBlur: () => previewHb(false) }

export function HigherBuildingsDockItem() {
  const shown = useHigherBuildings((s) => s.shown)
  const labels = useHigherBuildings((s) => s.labels)
  const selected = useHigherBuildings((s) => s.selected)
  const { data } = useCityData()
  return (
    <div className="space-y-1.5" data-testid="hb-dock">
      <button type="button" {...previewProps} onClick={() => (selected ? closeHb() : selectHb())} aria-pressed={selected} data-testid="hb-item"
        className="flex w-full items-center gap-2 rounded-lg border border-line bg-panel px-2 py-1.5 text-left hover:border-[#778294] outline-none focus-visible:ring-2 focus-visible:ring-accent aria-pressed:border-accent aria-pressed:bg-selected">
        <Landmark size={16} aria-hidden className="shrink-0" style={{ color: HB_COLOR.line }} />
        <span className="min-w-0 flex-1">
          <b className="block text-control font-semibold text-ink">Higher Buildings</b>
          <span className="flex items-center gap-1 text-muted"><Swatch />{HB_LAYER.title} · in force, digitized</span>
        </span>
        <span className="text-meta text-muted">{selected ? 'Close' : 'Inspect'}</span>
      </button>
      <div className="flex flex-wrap items-center gap-1">
        <button type="button" className={act} aria-pressed={shown} onClick={() => pinLayer(!shown)} title="Keep the layer on the map while you design" data-testid="hb-dock-pin"><Pin size={14} aria-hidden />Pin layer</button>
        <button type="button" className={act} aria-pressed={labels} onClick={() => showLabels(!labels)} title="Show or hide its label (separate from the layer)" data-testid="hb-dock-labels"><Tags size={14} aria-hidden />Label</button>
        <button type="button" className={act} {...previewProps} onClick={() => frameHb(data?.grids)} title="Fit the whole area in the view" data-testid="hb-dock-frame"><Expand size={14} aria-hidden />Frame</button>
        <Help label="About the Planning layers">
          <span className="block">Policy geography, kept apart from place names. Higher Buildings is the City's current policy area as drawn on its May 2026 review exhibit, digitized here; the adopted PDF could not be opened.</span>
          <span className="block">Review reference areas: none drawn. The exhibit's “Areas downtown outside Public Views” map is a different concept and has no verified geometry.</span>
          <span className="block">Showing or hiding this layer changes nothing else: not your site, towers, camera, results, north or datum.</span>
        </Help>
      </div>
    </div>
  )
}

/** The dock section's one-line state. */
export function HigherBuildingsSummary() {
  const shown = useHigherBuildings((s) => s.shown)
  return <>{shown ? 'Higher Buildings · pinned' : 'Higher Buildings'}</>
}

// ---------------------------------------------------------------- Layers > Planning (competition site)
export function HigherBuildingsVtcItem() {
  const style: CSSProperties = { background: HB_COLOR.surface, color: HB_COLOR.ink }
  return (
    <div className="space-y-1.5" data-testid="hb-vtc">
      <div className="flex items-start gap-2">
        <Landmark size={16} aria-hidden className="mt-px shrink-0" style={{ color: HB_COLOR.line }} />
        <div className="min-w-0 flex-1">
          <b className="block text-control font-semibold text-ink">Higher Buildings</b>
          <span className="inline-flex rounded-full px-1.5 text-meta font-semibold" style={style}>Policy in force · under review</span>
        </div>
      </div>
      <p className="text-meta">Not drawn here: the competition block has no real-world position in this model, so it cannot be placed against the City's policy area. The area is drawn in Real Vancouver.</p>
      <div className="flex flex-wrap items-center gap-1">
        <button type="button" className={act} onClick={() => { openCity(); selectHb() }} title="Switch to Real Vancouver (as the top bar's tab does) and open Higher Buildings there" data-testid="hb-vtc-open"><Landmark size={14} aria-hidden />Open in Real Vancouver</button>
        <a className={act} href={HB_LAYER.source.url} target="_blank" rel="noreferrer" title={`The City's map, p.${HB_LAYER.source.page}`}><ExternalLink size={14} aria-hidden />Source</a>
        <Help label="About Higher Buildings">
          <span className="block">Source: {HB_LAYER.source.publisher}, {HB_LAYER.source.title}, p.{HB_LAYER.source.page}; map dated {longDate(HB_LAYER.source.documentDate)}, retrieved {longDate(HB_LAYER.source.retrieved)}. Policy adopted {HB.policy.adopted}.</span>
          <span className="block">The competition site, the policy area, the review's reference maps and any site-specific rezoning are different things; none stands in for another.</span>
        </Help>
      </div>
    </div>
  )
}
