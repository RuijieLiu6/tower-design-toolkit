// Data the board composer needs from the rest of the app: evidence sets from the built nodes, loaded images, and a
// measuring pass that finds text cut off by its frame.
import { useEffect, useMemo, useState } from 'react'
import { BOARD_W, type Board, type BoardImage } from '../../engine/boards'
import { useResults } from '../../hooks/useResults'
import { drawBoard, loadBoardImages, type EvidenceSet } from '../../lib/boardRender'
import { useBoardStore } from '../../lib/boardStore'
import { familyAvailable, resolveFamily, useFonts } from '../../lib/fonts/fontStore'
import { useTowers } from '../../store'

/** The board faces and the resolver that swaps a missing family for Inter; changes when a face loads, so drawings redraw. */
export function useBoardFonts() {
  const fonts = useBoardStore((s) => s.fonts)
  const user = useFonts((s) => s.user)
  const loaded = useFonts((s) => s.loaded)
  return useMemo(() => ({ fonts, resolve: (f: string) => resolveFamily(f, (x) => familyAvailable(x, user)), loaded }), [fonts, user, loaded])
}

/** Rule lists from the built evaluation nodes, by node id, for evidence frames. */
export function useEvidence(): Record<string, EvidenceSet> {
  const res = useResults()
  const towers = useTowers()
  return useMemo(() => {
    const many = towers.length > 1
    const per = <T extends { tower: { name: string }; rules: EvidenceSet['rules'] }>(list: T[]) => list.flatMap((l) => l.rules.map((r) => (many ? { ...r, label: `${l.tower.name}: ${r.label}` } : r)))
    const sets: EvidenceSet[] = [
      { id: 'built.vtc-rules', name: 'VTC hard rules', rules: res.rules },
      ...(res.streetwall ? [{ id: 'built.pr-streetwall', name: 'Streetwall and tower form', rules: res.streetwall.rules }] : []),
      ...(res.frontage ? [{ id: 'built.pr-frontage', name: 'Active frontage', rules: res.frontage.rules }] : []),
      ...(res.groundPlane ? [{ id: 'built.pr-ground', name: 'Open space and links', rules: res.groundPlane.rules }] : []),
      { id: 'built.core-lifts', name: 'Core and lifts', rules: per(res.lifts) },
      { id: 'built.egress', name: 'Egress and stairs', rules: per(res.egress) },
      { id: 'built.sky-room', name: 'Public sky room', rules: per(res.skyRooms) },
    ].filter((s) => s.rules.length > 0)
    return Object.fromEntries(sets.map((s) => [s.id, s]))
  }, [res, towers])
}

/**
 * Load every image placed on the boards; re-renders when they arrive. Keyed on the image ids, and the same Map is kept
 * when nothing changed: a caller passing a fresh `[board]` array each render used to restart the load every render,
 * which re-rendered the composer hundreds of times a second (found 17 Nov while adding the fonts).
 */
export function useLoadedImages(boards: Board[], images: Record<string, BoardImage>) {
  const [loaded, setLoaded] = useState<Map<string, HTMLImageElement>>(() => new Map())
  // Keyed by the images placed, not the boards array: callers pass a fresh [board] each render, which used to reload,
  // set state and render again without end (13 Nov: it kept the composer redrawing; with drawings it never settled).
  const key = boards.flatMap((b) => b.frames.flatMap((f) => (f.content.kind === 'image' ? [f.content.imageId] : []))).sort().join('|')
  useEffect(() => {
    let live = true
    void loadBoardImages(boards, images).then((m) => {
      if (!live) return
      setLoaded((prev) => (prev.size === m.size && [...m.keys()].every((k) => prev.get(k) === m.get(k)) ? prev : m))
    })
    return () => { live = false }
  }, [key, images]) // eslint-disable-line react-hooks/exhaustive-deps
  return loaded
}

let measureCanvas: HTMLCanvasElement | null = null
/** Frames whose text does not fit, per board (measured at 2 px/mm, without images). */
export function useOverflow(boards: Board[], images: Record<string, BoardImage>, evidence: Record<string, EvidenceSet>) {
  const { fonts, resolve, loaded } = useBoardFonts()
  return useMemo(() => {
    const out: Record<string, string[]> = {}
    if (typeof document === 'undefined') return out
    measureCanvas ??= document.createElement('canvas')
    const k = 2
    measureCanvas.width = BOARD_W * k; measureCanvas.height = 1
    const ctx = measureCanvas.getContext('2d')
    if (!ctx) return out
    boards.forEach((b, i) => { const r = drawBoard(ctx, b, { pxPerMm: k, images, loaded: new Map(), evidence, editing: false, index: i, total: boards.length, fonts, resolve }); if (r.overflow.length) out[b.id] = r.overflow })
    return out
  // `loaded`: measured again once a face arrives (the first pass may have used the fallback).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boards, images, evidence, fonts, resolve, loaded])
}

// ---- the design as the board drawings read it (lib/boardDrawings.ts) ----
import { VTC_NORTH_DEG, useVtcContext } from '../../context'
import { towerOccluders, vtcOccluders } from '../../engine/solarRules'
import { floorPlates } from '../../lib/floorPick'
import { coreSide } from '../../engine/massing'
import { coreCentre } from '../../engine/storeyWeight'
import type { Tower } from '../../engine/types'
import { setDrawData, type DrawData } from '../../lib/boardDrawings'
import { BRIEF_SITE } from '../../lib/vtcContextSource'
import { cityDataLoaded } from '../CityContext'
import { dataFetch } from '../../lib/loadProgress'
import { decodeTrees } from '../../lib/contextLayers'
import { decodeFootprints } from '../../lib/cityLayers'
import { useCityModel } from '../../lib/cityModel'
import { useStore } from '../../store'

type P2 = [number, number]
/** An imported model's core (or one placed by hand) for the drawings: where the structure checks place it, along the tower's axes. */
function placedCore(t: Tower): P2[] | null {
  const side = coreSide(t)
  if (!(side > 2)) return null
  const cc = coreCentre(t), a = (t.rotation * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a), h = side / 2
  return ([[-h, -h], [h, -h], [h, h], [-h, h]] as P2[]).map(([u, v]) => [t.x + (u + cc.x) * c - (v + cc.y) * s, t.y + (u + cc.x) * s + (v + cc.y) * c])
}
/** The indicative core for the drawings: a square of the core share, centred on the top plate, along its longest side. */
function coreRing(prisms: { ring: P2[]; z0: number; z1: number }[], side: number): P2[] | null {
  if (!prisms.length || !(side > 2)) return null
  const top = prisms.reduce((m, p) => (p.z1 > m.z1 ? p : m)).ring
  const c: P2 = [top.reduce((a, p) => a + p[0], 0) / top.length, top.reduce((a, p) => a + p[1], 0) / top.length]
  let u: P2 = [1, 0], L = 0
  top.forEach((p, i) => { const q = top[(i + 1) % top.length], l = Math.hypot(q[0] - p[0], q[1] - p[1]); if (l > L) { L = l; u = [(q[0] - p[0]) / l, (q[1] - p[1]) / l] } })
  const v: P2 = [-u[1], u[0]], h = side / 2
  return ([[-h, -h], [h, -h], [h, h], [-h, h]] as P2[]).map(([a, b]) => [c[0] + u[0] * a + v[0] * b, c[1] + u[1] * a + v[1] * b])
}
// Street trees and City lots for the presentation axonometric (17 Nov): loaded once, on first use, in Real Vancouver.
let groundLayers: Promise<{ trees: { x: number; y: number; h: number }[]; lots: P2[][] }> | null = null
function loadGroundLayers() {
  groundLayers ??= (async () => {
    const [tb, pb] = await Promise.all([dataFetch('trees.bin').then((r) => (r.ok ? r.arrayBuffer() : null)).catch(() => null), dataFetch('parcels.bin').then((r) => (r.ok ? r.arrayBuffer() : null)).catch(() => null)])
    const trees = tb ? decodeTrees(tb).map((t) => ({ x: t.x, y: t.y, h: t.feet != null ? t.feet * 0.3048 : 8 })) : []
    const lots = pb ? decodeFootprints(pb).map((f) => f.outer as P2[]) : []
    return { trees, lots }
  })()
  return groundLayers
}
const inside = (p: P2, r: P2[]) => { let o = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) o = !o } return o }
/** Keeps the drawing data current while the composer is open; returns it so the previews redraw when it changes. */
export function useDrawData(): DrawData {
  const towers = useTowers()
  const project = useStore((s) => s.project)
  const cityRing = useStore((s) => s.citySite?.ring ?? null) as P2[] | null
  const { ctx } = useVtcContext()
  // The city data the main view already loaded (no second load, no second demolition pass: buildings whose centre is
  // inside the study site or a tower are left out, as the main view hides them).
  const model = useCityModel((s) => s.model)
  const [data, setData] = useState<Awaited<ReturnType<typeof cityDataLoaded>> | null>(null)
  useEffect(() => { let live = true; void cityDataLoaded(model)?.then((d) => live && setData(d)); return () => { live = false } }, [model, project])
  const [ground, setGround] = useState<Awaited<ReturnType<typeof loadGroundLayers>> | null>(null)
  useEffect(() => { if (project !== 'city') return; let live = true; void loadGroundLayers().then((g) => live && setGround(g)); return () => { live = false } }, [project])
  const d = useMemo<DrawData>(() => {
    const site = project === 'city' ? cityRing : (((ctx?.site ?? BRIEF_SITE)?.outline as P2[] | undefined) ?? null)
    const ts = towers.map((t) => {
      const prisms = towerOccluders([t]).prisms as { ring: P2[]; z0: number; z1: number }[]
      return {
      id: t.id, name: t.name, prisms, core: t.imported || t.coreCentre ? placedCore(t) : coreRing(prisms, coreSide(t)),
      floors: floorPlates(t).map(({ f, rings }) => ({ level: f.level, z0: f.z0, z1: f.z1, use: f.use, area: f.area, rings })),
    } })
    const pts = [...(site ?? []), ...ts.flatMap((t) => t.prisms.flatMap((p) => p.ring))]
    const c: P2 = pts.length ? [pts.reduce((a, p) => a + p[0], 0) / pts.length, pts.reduce((a, p) => a + p[1], 0) / pts.length] : [0, 0]
    const near = (r: P2[]) => r.some(([x, y]) => Math.abs(x - c[0]) < 260 && Math.abs(y - c[1]) < 260)
    let context: DrawData['context'] = []
    if (project === 'city' && data?.heights) {
      const h = data.heights
      data.footprints.forEach((f, i) => {
        if (!near(f.outer as P2[])) return
        const q = f.outer.reduce<P2>((a, p) => [a[0] + p[0] / f.outer.length, a[1] + p[1] / f.outer.length], [0, 0])
        if ((site && inside(q, site)) || ts.some((t) => t.prisms.some((p) => inside(q, p.ring)))) return
        const z = h.roof[i] - h.ground[i]
        if (Number.isFinite(z) && z > 0) context.push({ ring: f.outer as P2[], z1: z })
      })
    } else if (project === 'vtc' && ctx) context = vtcOccluders(ctx).prisms.filter((p) => near(p.ring as P2[])).map((p) => ({ ring: p.ring as P2[], z1: p.z1 }))
    const near2 = (x: number, y: number) => Math.abs(x - c[0]) < 220 && Math.abs(y - c[1]) < 220
    const trees = project === 'city' && ground ? ground.trees.filter((t) => near2(t.x, t.y) && !ts.some((k) => k.prisms.some((p) => inside([t.x, t.y], p.ring)))) : []
    const lots = project === 'city' && ground ? ground.lots.filter((r) => r.length > 2 && r.some(([x, y]) => near2(x, y))) : []
    return { site, towers: ts, context, north: project === 'vtc' ? VTC_NORTH_DEG : 0, trees, lots }
  }, [towers, project, cityRing, ctx, data, ground])
  setDrawData(d)
  useEffect(() => () => setDrawData(null), [])
  return d
}
