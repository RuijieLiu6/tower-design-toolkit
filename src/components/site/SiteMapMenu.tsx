// The Site step on the map (Real Vancouver, inside CityScene via VistaRig; model frame x east, y north, z up):
// a click opens a small menu at the click — build the massing here, replace this building, select several buildings to
// replace, use / add / remove this lot, draw a box over lots — and each action says what it did, with Undo
// (lib/siteActions.ts). Clicks are taken only in the Site step, outside the other map tools (site drawing and picking,
// placing, Inspect, eye-level views, the height-surface area): a click on a design tower still picks the tower.
import { Html, Line } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { Box, Building2, Check, Combine, Hammer, MousePointerClick, Square, SquareMinus, SquarePlus, Undo2, X } from 'lucide-react'
import { useEffect, useMemo, useRef, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import * as THREE from 'three'
import { footprintAt } from '../../engine/viewFrom'
import { pointInRing, type Pt } from '../../engine/site'
import { sampleTerrain } from '../../lib/cityLayers'
import { lotsOfSite, lotsTouching, replaceBuildings, siteFromLots, tell, undoLast, useSiteStep, type LotLayer, type SiteMenu } from '../../lib/siteActions'
import { useLocalAreas } from '../../lib/localAreas'
import { loadParcelLayer, parcelLabel, useParcelLayer, useSiteAnalysis, type ParcelLayer } from '../../lib/siteParcels'
import { useSiteStore } from '../../lib/siteStore'
import { useStep } from '../../lib/step'
import { proposePlace, useTowerEdit } from '../../lib/towerEdit'
import { buildingLabel, buildingSource } from '../../lib/vistaBuildings'
import { useVistaLook } from '../../lib/vistaLook'
import { useViewFromStore } from '../../lib/viewFromStore'
import { useStore } from '../../store'
import { useCityData, useCityObstacles } from '../CityContext'
import { useHeightSurface } from '../HeightSurface'

/** A press that moved more than this before release was an orbit, not a click (pixels). */
const CLICK_SLOP = 6
const COLORS = { box: '#ea580c', area: '#7c3aed' }
const card = 'rounded-lg border border-line bg-white/95 text-ink shadow-lg backdrop-blur'

type CityData = NonNullable<ReturnType<typeof useCityData>['data']>

/** City lot under a plan point (outer ring, not in a courtyard), or null. */
export function lotAtPoint(layer: Pick<ParcelLayer, 'polys'>, p: Pt): number | null {
  for (let i = 0; i < layer.polys.length; i++) {
    const f = layer.polys[i], o = f.outer as Pt[]
    if (!o.length) continue
    if (pointInRing(p, o) && !f.holes.some((h) => pointInRing(p, h as Pt[]))) return i
  }
  return null
}
const lotLayerOf = (layer: ParcelLayer): LotLayer => ({ polys: layer.polys, sha: layer.sha, label: (i) => parcelLabel(layer, i) })

/** Is the Site step's map menu live? (Real Vancouver, Massing, Site step, no other map tool taking clicks.) */
function menuLive(): boolean {
  const st = useStore.getState(), vf = useViewFromStore.getState(), mode = useVistaLook.getState().mode
  return st.project === 'city' && st.phase === 'basic' && useStep.getState().step === 'site' && !st.placing && !vf.picking && !vf.looking
    && mode !== 'inspect' && !useHeightSurface.getState().drawing && !useSiteStore.getState().tool
}

export default function SiteMapMenu() {
  const { data } = useCityData()
  const { idx, heights } = useCityObstacles()
  const { gl, camera, scene, invalidate } = useThree()
  const step = useStep((s) => s.step)
  const project = useStore((s) => s.project)
  const phase = useStore((s) => s.phase)
  const live = step === 'site' && project === 'city' && phase === 'basic'
  const { box, multi } = useSiteStep()
  const tool = useSiteStore((s) => s.tool)
  const down = useRef<{ x: number; y: number; live: boolean; picked: string | null; proposal: boolean; box: boolean } | null>(null)

  // Leaving the Site step (or Real Vancouver) closes the menu and ends box and multi-select.
  useEffect(() => {
    if (live) return
    useSiteStep.setState({ menu: null, box: false, boxDraft: null, multi: false })
  }, [live])
  // The multi-select uses SiteRig's pick tool; Esc there (or Use as site in the panel) ends it here too.
  useEffect(() => { if (multi && tool !== 'pick') useSiteStep.setState({ multi: false }) }, [multi, tool])
  useEffect(() => useSiteStep.subscribe(() => invalidate()), [invalidate])

  useEffect(() => {
    if (!live || !data || !idx) return
    const el = gl.domElement, ray = new THREE.Raycaster()
    const ndc = (e: MouseEvent) => { const r = el.getBoundingClientRect(); return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1) }
    /** Plan point under the cursor: the first visible mesh (roof, ground), else the base plane. */
    const planAt = (e: MouseEvent, precise = true): Pt | null => {
      ray.setFromCamera(ndc(e), camera)
      if (precise) {
        const hit = ray.intersectObjects(scene.children, true).find((h) => (h.object as THREE.Mesh).isMesh && h.object.visible && !h.object.userData.siteOverlay)
        if (hit) return [hit.point.x, -hit.point.z]
      }
      const p = new THREE.Vector3(), g = useStore.getState().groundElevation
      return ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -g), p) ? [p.x, -p.z] : null
    }
    const groundAt = (p: Pt) => sampleTerrain(data.grids, p[0], p[1]) ?? useStore.getState().groundElevation

    const onDown = (e: PointerEvent) => {
      if (e.target !== el || e.button !== 0) { down.current = null; return }
      const s = useSiteStep.getState()
      // Box over lots: the drag draws the box (the orbit does not move meanwhile).
      if (s.box) {
        const p = planAt(e, false)
        if (p) { e.stopPropagation(); e.preventDefault(); useSiteStep.setState({ boxDraft: [p, p] }) }
        down.current = { x: e.clientX, y: e.clientY, live: false, picked: null, proposal: false, box: true }
        return
      }
      const te = useTowerEdit.getState()
      down.current = { x: e.clientX, y: e.clientY, live: menuLive(), picked: te.picked, proposal: !!te.proposal, box: false }
    }
    const onMove = (e: PointerEvent) => {
      const d = useSiteStep.getState().boxDraft
      if (!d || !down.current?.box) return
      const p = planAt(e, false)
      if (p) useSiteStep.setState({ boxDraft: [d[0], p] })
    }
    const onUp = async (e: PointerEvent) => {
      const d = useSiteStep.getState().boxDraft
      if (!d || !down.current?.box) return
      down.current = null
      useSiteStep.setState({ boxDraft: null, box: false })
      const [a, b] = d
      if (Math.abs(a[0] - b[0]) < 2 || Math.abs(a[1] - b[1]) < 2) { tell('Box too small: drag across the lots you want.', { kind: 'error', at: a, z: groundAt(a) }); return }
      e.stopPropagation()
      let layer: ParcelLayer
      try { layer = await loadParcelLayer() } catch (err) { tell(`The City parcel layer did not load (${(err as Error).message}).`, { kind: 'error' }); return }
      const lots = lotsTouching([a[0], a[1], b[0], b[1]], layer.polys)
      const c: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
      if (!lots.length) { tell('The box touches no City lot (streets, water, or outside the parcel layer, which covers downtown).', { kind: 'error', at: c, z: groundAt(c) }); return }
      const ring: Pt[] = [[Math.min(a[0], b[0]), Math.min(a[1], b[1])], [Math.max(a[0], b[0]), Math.min(a[1], b[1])], [Math.max(a[0], b[0]), Math.max(a[1], b[1])], [Math.min(a[0], b[0]), Math.max(a[1], b[1])]]
      siteFromLots(lots, lotLayerOf(layer), data.footprints, 'box', { at: c, z: groundAt(c) }, ring)
    }
    const onClick = (e: MouseEvent) => {
      const start = down.current
      down.current = null
      if (e.target !== el || !start || start.box || !start.live || Math.hypot(e.clientX - start.x, e.clientY - start.y) > CLICK_SLOP) return
      const p = planAt(e)
      if (!p) return
      const shift = e.shiftKey
      // Let the tower gizmo take its click first: a click on a design tower picks the tower, and no menu opens.
      setTimeout(async () => {
        const te = useTowerEdit.getState()
        if (!start.proposal && te.picked && !useTowerEdit.getState().proposal) return
        const i = footprintAt(idx, p[0], p[1])
        // Shift-click on a building: straight into "select several to replace".
        if (shift && i !== null) {
          useSiteStore.getState().set({ tool: 'pick', picked: [i], draft: [], message: null })
          useSiteStep.setState({ multi: true, menu: null })
          return
        }
        const z = groundAt(p)
        // Open towards the room left in the view: up in its lower half, left near its right edge.
        const r = el.getBoundingClientRect(), y = e.clientY - r.top, x = e.clientX - r.left
        const up = y > r.height / 2
        const place = { up, left: x > r.width - 310, maxH: Math.max(160, Math.round(up ? y - 16 : r.height - y - 16)) }
        const menu: SiteMenu = { at: p, z, building: i, buildingLabel: i !== null ? describe(data, heights, i) : null, lot: null, lotLabel: null, place }
        useSiteStep.setState({ menu })
        try {
          const layer = await loadParcelLayer()
          const lot = lotAtPoint(layer, p)
          if (useSiteStep.getState().menu === menu) useSiteStep.setState({ menu: { ...menu, lot, lotLabel: lot !== null ? parcelLabel(layer, lot) : null } })
        } catch { /* the lot items say the layer is missing */ }
      }, 0)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      const s = useSiteStep.getState()
      if (s.box) { useSiteStep.setState({ box: false, boxDraft: null }); tell('Box cancelled; the site is unchanged.') }
      else if (s.menu) useSiteStep.setState({ menu: null })
    }
    window.addEventListener('pointerdown', onDown, true)
    window.addEventListener('pointermove', onMove, true)
    window.addEventListener('pointerup', onUp, true)
    window.addEventListener('click', onClick)
    window.addEventListener('keydown', onKey)
    // The menu answers clicks now (city buildings and their index loaded): a mark the end-to-end test waits for.
    el.dataset.siteMap = data.detailStatus === 'loading' ? 'loading' : 'ready'
    return () => {
      delete el.dataset.siteMap
      window.removeEventListener('pointerdown', onDown, true); window.removeEventListener('pointermove', onMove, true); window.removeEventListener('pointerup', onUp, true)
      window.removeEventListener('click', onClick); window.removeEventListener('keydown', onKey)
    }
  }, [live, data, idx, heights, gl, camera, scene])

  useEffect(() => { gl.domElement.style.cursor = live && box ? 'crosshair' : '' }, [live, box, gl])

  if (!data || !live) return null
  return (
    <>
      <MenuAt data={data} />
      <MultiBar data={data} />
      <BoxDraft data={data} />
      <AreaOutline data={data} />
      <ToastAt />
    </>
  )
}

function describe(data: CityData, heights: ReturnType<typeof useCityObstacles>['heights'], i: number): string {
  const h = heights && Number.isFinite(heights.roof[i]) && Number.isFinite(heights.ground[i]) ? heights.roof[i] - heights.ground[i] : null
  return `${buildingLabel(data, i)}${h !== null && h > 0 ? `, ${Math.round(h)} m` : ''} · ${buildingSource(data, i)}`
}

// ---------------------------------------------------------------- the menu at the click
function MenuAt({ data }: { data: CityData }) {
  const menu = useSiteStep((s) => s.menu)
  const { site, match } = useSiteAnalysis()
  const { layer, error: layerError } = useParcelLayer(!!menu)
  const sel = useStore((s) => s.selectedTower)
  const towers = useStore((s) => s.towers.city)
  const first = useRef<HTMLButtonElement>(null)
  useEffect(() => { if (menu) requestAnimationFrame(() => first.current?.focus()) }, [menu?.at[0], menu?.at[1]]) // eslint-disable-line react-hooks/exhaustive-deps
  const siteLots = useMemo(() => lotsOfSite(site, match?.included), [site, match])
  if (!menu) return null
  const t = towers.find((k) => k.id === sel) ?? towers[0]
  const where = { at: menu.at, z: menu.z, place: menu.place }
  const close = () => useSiteStep.setState({ menu: null })
  const lotIn = menu.lot !== null && siteLots.includes(menu.lot)
  const withLayer = (fn: (l: ParcelLayer) => void) => () => { close(); if (layer) fn(layer); else loadParcelLayer().then(fn, (e: Error) => tell(`The City parcel layer did not load (${e.message}).`, { kind: 'error', ...where })) }
  type Item = { key: string; icon: typeof Box; label: string; hint: string; run: () => void; disabled?: boolean }
  const items: Item[] = []
  items.push({ key: 'build', icon: Building2, label: 'Build the massing here', hint: t ? `${t.name}, lined up with the lot; confirm in the toolbar (Enter)` : 'No design tower', disabled: !t,
    run: () => { close(); if (t && proposePlace(t.id, menu.at[0], menu.at[1])) tell(`${t.name} proposed here, lined up with the lot under the click. Confirm (Enter) or Cancel (Esc) in the toolbar; Confirm is one undo step.`, where) } })
  if (menu.building !== null) {
    items.push({ key: 'replace', icon: Hammer, label: 'Replace this building', hint: 'Shown as demolished; Undo brings it back', run: () => { close(); replaceBuildings([menu.building!], data.footprints, where, 'this building') } })
    items.push({ key: 'multi', icon: MousePointerClick, label: 'Select several buildings to replace', hint: 'Click more buildings (or Shift-click), then Done', run: () => {
      close()
      useSiteStore.getState().set({ tool: 'pick', picked: [menu.building!], draft: [], message: null })
      useSiteStep.setState({ multi: true })
    } })
  }
  if (menu.lot !== null) {
    const lot = menu.lot
    if (siteLots.length && !lotIn) items.push({ key: 'add', icon: SquarePlus, label: 'Add this lot to the site', hint: `Combine with the ${siteLots.length} lot${siteLots.length === 1 ? '' : 's'} of the site (shared lot lines only)`, run: withLayer((l) => siteFromLots([...siteLots, lot], lotLayerOf(l), data.footprints, 'add', where)) })
    if (lotIn && siteLots.length > 1) items.push({ key: 'remove', icon: SquareMinus, label: 'Remove this lot from the site', hint: 'The other lots stay combined', run: withLayer((l) => siteFromLots(siteLots.filter((k) => k !== lot), lotLayerOf(l), data.footprints, 'remove', where)) })
    if (!lotIn || siteLots.length > 1) items.push({ key: 'use', icon: Square, label: site ? 'Use this lot alone as the site' : 'Use this lot as the site', hint: site ? 'Replaces the current site' : 'The City parcel; buildings on it shown as demolished', run: withLayer((l) => siteFromLots([lot], lotLayerOf(l), data.footprints, 'use', where)) })
  }
  items.push({ key: 'box', icon: Combine, label: 'Draw a box over lots…', hint: 'Every lot the box touches, combined into one site (one block)', run: () => { close(); useSiteStep.setState({ box: true, boxDraft: null }); tell('Drag a box across the lots to combine (the view holds still while you drag). Esc cancels.', where) } })

  const onKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const btns = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('[role=menuitem]:not([disabled])')]
    const k = btns.indexOf(document.activeElement as HTMLButtonElement)
    if (e.key === 'ArrowDown') { e.preventDefault(); btns[(k + 1) % btns.length]?.focus() }
    else if (e.key === 'ArrowUp') { e.preventDefault(); btns[(k - 1 + btns.length) % btns.length]?.focus() }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close() }
  }
  return (
    <Html position={[menu.at[0], menu.at[1], menu.z + 2]} zIndexRange={[40, 30]} style={{ pointerEvents: 'auto' }}>
      <div data-testid="site-map-menu" onKeyDown={onKey} onPointerDown={(e) => e.stopPropagation()} onWheel={(e) => e.stopPropagation()}
        style={{ transform: `translate(${menu.place?.left ? 'calc(-100% - 8px)' : '8px'}, ${menu.place?.up ? 'calc(-100% - 8px)' : '8px'})`, maxHeight: menu.place?.maxH }}
        className={`${card} w-72 overflow-y-auto p-1 text-[12px]`}>
        <div className="flex items-start gap-1 px-2 pb-1 pt-1.5">
          <div className="min-w-0 flex-1 text-[11px] leading-snug text-muted">
            <div className="truncate" title={menu.buildingLabel ?? undefined}>{menu.buildingLabel ?? 'No building here'}</div>
            <div className="truncate" title={menu.lotLabel ?? undefined}>{menu.lot !== null ? `Lot at ${menu.lotLabel}` : layer ? 'No City lot here (street, water, or outside the parcel layer, which covers downtown)' : layerError ? `City lots did not load: ${layerError}` : 'Loading the City lots…'}</div>
          </div>
          <button type="button" aria-label="Close the menu" onClick={close} className="rounded p-0.5 text-muted hover:bg-black/5 hover:text-ink"><X size={14} /></button>
        </div>
        <div role="menu" aria-label="Site actions here">
        {items.map((it, k) => (
          <button key={it.key} ref={k === 0 ? first : undefined} type="button" role="menuitem" disabled={it.disabled} onClick={it.run} data-action={it.key}
            className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left outline-none hover:bg-accent/10 focus-visible:bg-accent/10 focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50">
            <it.icon size={15} className="mt-0.5 shrink-0 text-accent" aria-hidden />
            <span className="min-w-0"><span className="block font-medium">{it.label}</span><span className="block text-[11px] text-muted">{it.hint}</span></span>
          </button>
        ))}
        </div>
      </div>
    </Html>
  )
}

// ---------------------------------------------------------------- select several buildings: count and Done
const topCentre = (_el: THREE.Object3D, _cam: THREE.Camera, size: { width: number; height: number }) => [size.width / 2, 64]

function MultiBar({ data }: { data: CityData }) {
  const multi = useSiteStep((s) => s.multi)
  const picked = useSiteStore((s) => s.picked)
  const tool = useSiteStore((s) => s.tool)
  if (!multi || tool !== 'pick') return null
  const ids = new Set(picked.map((i) => data.footprints[i]?.id))
  const done = () => {
    const list = [...picked]
    useSiteStore.getState().set({ tool: null, picked: [] })
    useSiteStep.setState({ multi: false })
    if (list.length) replaceBuildings(list, data.footprints, undefined, `${ids.size} building${ids.size === 1 ? '' : 's'}`)
  }
  const cancel = () => { useSiteStore.getState().set({ tool: null, picked: [] }); useSiteStep.setState({ multi: false }); tell('Selection cancelled; nothing replaced.') }
  return (
    <Html calculatePosition={topCentre} zIndexRange={[40, 30]} style={{ pointerEvents: 'auto', transform: 'translateX(-50%)' }}>
      <div role="toolbar" aria-label="Select buildings to replace" data-testid="site-multi-bar" className={`${card} flex items-center gap-2 whitespace-nowrap px-3 py-1.5 text-[12px]`} onPointerDown={(e) => e.stopPropagation()}>
        <MousePointerClick size={14} className="text-accent" aria-hidden />
        <span role="status"><b>{ids.size}</b> building{ids.size === 1 ? '' : 's'} selected · click (or Shift-click) more to add or drop</span>
        <button type="button" onClick={done} disabled={!picked.length} className="flex items-center gap-1 rounded-md bg-accent px-2 py-0.5 font-medium text-white disabled:opacity-50"><Check size={13} />Done: replace</button>
        <button type="button" onClick={cancel} className="rounded-md border border-line px-2 py-0.5">Cancel</button>
      </div>
    </Html>
  )
}

// ---------------------------------------------------------------- the box being drawn, and the box-mode hint
function BoxDraft({ data }: { data: CityData }) {
  const box = useSiteStep((s) => s.box)
  const d = useSiteStep((s) => s.boxDraft)
  if (!box && !d) return null
  const pts = d ? (() => {
    const [a, b] = d, z = Math.max(sampleTerrain(data.grids, a[0], a[1]) ?? 0, sampleTerrain(data.grids, b[0], b[1]) ?? 0) + 3
    return [[a[0], a[1], z], [b[0], a[1], z], [b[0], b[1], z], [a[0], b[1], z], [a[0], a[1], z]] as [number, number, number][]
  })() : null
  return (
    <>
      {pts && <Line points={pts} color={COLORS.box} lineWidth={2.5} dashed dashSize={4} gapSize={2} depthTest={false} renderOrder={22} userData={{ siteOverlay: true }} />}
      <Html calculatePosition={topCentre} zIndexRange={[40, 30]} style={{ pointerEvents: 'auto', transform: 'translateX(-50%)' }}>
        <div data-testid="site-box-hint" className={`${card} flex items-center gap-2 whitespace-nowrap px-3 py-1.5 text-[12px]`} onPointerDown={(e) => e.stopPropagation()}>
          <Combine size={14} className="text-accent" aria-hidden />Drag a box across the lots to combine · Esc cancels
          <button type="button" onClick={() => useSiteStep.setState({ box: false, boxDraft: null })} className="rounded-md border border-line px-2 py-0.5">Cancel</button>
        </div>
      </Html>
    </>
  )
}

// ---------------------------------------------------------------- the neighbourhood picked from the list
function AreaOutline({ data }: { data: CityData }) {
  const area = useSiteStep((s) => s.area)
  const rings = useAreaRings(area)
  if (!rings) return null
  return <>{rings.map((r, k) => {
    const pts = [...r, r[0]].map(([x, y]) => [x, y, (sampleTerrain(data.grids, x, y) ?? 0) + 4] as [number, number, number])
    return <Line key={k} points={pts} color={COLORS.area} lineWidth={2} dashed dashSize={12} gapSize={6} depthTest={false} renderOrder={19} transparent opacity={0.85} userData={{ siteOverlay: true }} />
  })}</>
}

function useAreaRings(name: string | null): Pt[][] | null {
  const areas = useLocalAreas()
  return useMemo(() => (name && areas ? areas.find((a) => a.name === name)?.rings ?? null : null), [name, areas])
}

// ---------------------------------------------------------------- what the last action did, with Undo
function ToastAt() {
  const toast = useSiteStep((s) => s.toast)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => {
    clearTimeout(timer.current)
    if (toast) timer.current = setTimeout(() => { if (useSiteStep.getState().toast?.id === toast.id) useSiteStep.setState({ toast: null }) }, toast.undoable ? 12000 : 7000)
    return () => clearTimeout(timer.current)
  }, [toast])
  if (!toast) return null
  const body = (
    <div data-testid="site-toast" onPointerDown={(e) => e.stopPropagation()}
      className={`${card} flex w-80 items-start gap-2 px-3 py-2 text-[12px] ${toast.kind === 'error' ? 'border-red-300 text-red-900' : ''}`}>
      <span className="min-w-0 flex-1 leading-snug">{toast.text}</span>
      {toast.undoable && <button type="button" onClick={() => { useSiteStep.setState({ toast: null }); undoLast() }} className="flex shrink-0 items-center gap-1 rounded-md border border-line px-1.5 py-0.5 hover:border-accent"><Undo2 size={12} />Undo</button>}
      <button type="button" aria-label="Dismiss" onClick={() => useSiteStep.setState({ toast: null })} className="shrink-0 rounded p-0.5 text-muted hover:text-ink"><X size={13} /></button>
    </div>
  )
  const pl = toast.place
  // Each note mounts afresh (key): a note anchored at one spot never lingers there, over the map, as the next one.
  return toast.at
    ? <Html key={toast.id} position={[toast.at[0], toast.at[1], toast.z + 2]} zIndexRange={[39, 29]} style={{ pointerEvents: 'auto', transform: `translate(${pl?.left ? 'calc(-100% - 8px)' : '8px'}, ${pl?.up ? 'calc(-100% - 8px)' : '8px'})` }}>{body}</Html>
    : <Html key={toast.id} calculatePosition={topCentre} zIndexRange={[39, 29]} style={{ pointerEvents: 'auto', transform: 'translateX(-50%)' }}>{body}</Html>
}
