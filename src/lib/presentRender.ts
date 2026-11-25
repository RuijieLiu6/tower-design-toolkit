// Scripted presentation renders (board renders, 24 Nov): a line-drawing style close to the competition boards (white
// model, grey hairline edges, the context muted, the design towers outlined in ink, optional phase-colour highlights by
// use, no interface, a transparent or paper background) at print size, from the camera presets in lib/presentViews.ts.
// The renderer lives in components/PresentRender.tsx (inside the lazy Viewport chunk); this file holds the options, the
// outline post-process (pure, tested) and the economics readout, and, on a dev server only, the window hook a
// Playwright script drives (tools/present-render.cjs). Nothing here runs unless a script calls it.
import type { Shot } from './presentViews'
import type { UseId } from '../engine/types'
import { money, verdictText } from '../engine/economics'

/** Board colours (the toolkit's design tokens, as the boards' palette.json lists them). */
export const BOARD = {
  paper: '#f7f8fa', panel: '#ffffff', line: '#d9dee7', edge: '#66758a', control: '#778294', ink: '#202630', model: '#e8ecf1', context: '#c7cdd5',
  site: '#00a9d6', form: '#ff6b4a', program: '#f4c430', schematic: '#8b5cf6', presentation: '#e145c2',
} as const

export interface RenderStyle {
  /** 'transparent' (PNG alpha), 'paper' (#f7f8fa) or 'white'. */
  background: 'transparent' | 'paper' | 'white'
  /** Uses drawn in a colour (a pale tint of it), e.g. { civic: BOARD.presentation }; every other storey stays white. */
  highlight?: Partial<Record<UseId, string>>
  /** Ink outline of the design towers (px at the output size; 0: none). */
  outline?: number
  /** Scale figures (x, y in the model frame); outlined in ink like the boards' line figures. */
  people?: [number, number][]
  /** Hide the context buildings (keep ground and streets). */
  noContext?: boolean
  /** Return the label mask instead of the drawing (towers red, figures green): for checking occlusion. */
  debugMask?: boolean
  /**
   * Layers to render from the one camera, pixel-aligned (hero renders, 24 Nov). Default ['line'].
   *  - line: the board drawing above;
   *  - shaded: a calm clay render (sun with cast shadows, sky light, distance haze, water as a flat pale plane, sky left
   *    transparent), no lines;
   *  - edges: the line pass alone on transparent (crease edges, the design's ink outline, the figures), to lay over shaded;
   *  - mask: the design towers alone, white on black (where they are seen, after anything in front);
   *  - depth: distance from the eye, white near to black at `depthFar`, transparent where nothing is drawn.
   */
  passes?: RenderPass[]
  /** Shaded: unit vector toward the sun in the model frame (x east, y north, z up); see lib/presentViews.ts sunFor. */
  sun?: [number, number, number]
  /** Shaded: where cast shadows are computed (model frame) and how far around it (m). Default: the shot's target, 1200 m. */
  shadowAt?: [number, number, number]
  shadowRadius?: number
  /** Shaded: haze from `near` to fully hazed at `far` (m from the eye); colour default BOARD.paper. Omit for none. */
  haze?: { near: number; far: number; color?: string; max?: number }
  /** Depth: the distance (m) drawn black. Default: 3 × the distance to the target. */
  depthFar?: number
  /** Height of the ground the figures stand on (model frame z). Default: the scene's own (0 on the competition site). */
  peopleZ?: number
}

export type RenderPass = 'line' | 'shaded' | 'edges' | 'mask' | 'depth'
/** Clay colours of the shaded pass (greys of the board palette, water a pale blue-grey). */
export const CLAY = { tower: '#fbfbfa', context: '#eceae6', ground: '#dedcd6', water: '#e9eef1', sky: '#ffffff', bounce: '#cfccc4' } as const

export interface RenderRequest { shot: Shot; width: number; height: number; style: RenderStyle }
export interface RenderResult {
  dataUrl: string; width: number; height: number; /** Pixels of the design towers in the frame (0: not visible). */ towerPixels: number; ms: number
  /** Every requested pass as a PNG data URL (the first is also `dataUrl`). */
  layers?: Partial<Record<RenderPass, string>>
  /** Depth pass: the distance drawn black (m). */
  depthFar?: number
}

type Renderer = (r: RenderRequest) => RenderResult
let renderer: Renderer | null = null
export function setPresentRenderer(fn: Renderer | null) { renderer = fn }
/** The drawn ground under a model-frame point (terrain, streets, water; not buildings or the design), from the 3D view. */
let probe: ((x: number, y: number) => number | null) | null = null
type Bounds = { min: [number, number, number]; max: [number, number, number] }
let towerBounds: (() => Bounds | null) | null = null
export function setGroundProbe(fn: typeof probe, bounds: typeof towerBounds) { probe = fn; towerBounds = bounds }
/** Renders the current 3D view's scene from the shot, or null when no 3D view is mounted. */
export function presentRender(r: RenderRequest): RenderResult | null { return renderer ? renderer(r) : null }

/**
 * Ink outlines from a label mask (row-major, 0 = nothing, 1 = design tower, 2 = a figure): a pixel is on an outline when
 * it carries a label and a 4-neighbour carries none (a figure's edge against a tower counts for the figure only); each
 * outline pixel is stamped as a disc of the label's radius. Returns the alpha of the ink (0–255) per pixel.
 */
export function outlineAlpha(mask: Uint8Array, w: number, h: number, radius: Record<number, number>): Uint8Array {
  const out = new Uint8Array(w * h)
  const stamp = (cx: number, cy: number, r: number) => {
    if (r <= 0.5) { out[cy * w + cx] = 255; return }
    const ri = Math.ceil(r)
    for (let dy = -ri; dy <= ri; dy++) {
      const y = cy + dy
      if (y < 0 || y >= h) continue
      for (let dx = -ri; dx <= ri; dx++) {
        const x = cx + dx
        if (x < 0 || x >= w) continue
        const d = Math.hypot(dx, dy)
        if (d > r + 0.5) continue
        const a = d <= r - 0.5 ? 255 : Math.round(255 * (r + 0.5 - d))
        const i = y * w + x
        if (a > out[i]) out[i] = a
      }
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const m = mask[y * w + x]
      if (!m) continue
      const r = radius[m] ?? 0
      if (!r) continue
      const n = (xx: number, yy: number) => (xx < 0 || yy < 0 || xx >= w || yy >= h ? 0 : mask[yy * w + xx])
      const edge = m === 1 ? [n(x - 1, y), n(x + 1, y), n(x, y - 1), n(x, y + 1)].some((v) => v === 0)
        : [n(x - 1, y), n(x + 1, y), n(x, y - 1), n(x, y + 1)].some((v) => v !== m)
      if (edge) stamp(x, y, r)
    }
  }
  return out
}

/**
 * Closes small gaps in one label of a mask (dilate, then erode, by r px, square kernel): the 15 cm gaps between an
 * imported tower's storey slabs fall between pixels at a distance and would otherwise read as nicks in the outline.
 * Pixels of other labels are left as they are; a closed pixel takes the label only where it was empty.
 */
export function closeMask(mask: Uint8Array, w: number, h: number, label: number, r: number): Uint8Array {
  if (r < 1) return mask
  const pass = (src: Uint8Array, horizontal: boolean, want: 0 | 1): Uint8Array => {
    // want 1: dilate (any in window); want 0: erode (all in window)
    const out = new Uint8Array(w * h)
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let any = 0, all = 1
      for (let k = -r; k <= r; k++) {
        const xx = horizontal ? x + k : x, yy = horizontal ? y : y + k
        const v = xx < 0 || yy < 0 || xx >= w || yy >= h ? 0 : src[yy * w + xx]
        any |= v; all &= v
      }
      out[y * w + x] = want ? any : all
    }
    return out
  }
  let b: Uint8Array = new Uint8Array(w * h)
  for (let i = 0; i < w * h; i++) b[i] = mask[i] === label ? 1 : 0
  b = pass(pass(b, true, 1), false, 1)
  b = pass(pass(b, true, 0), false, 0)
  const out = mask.slice()
  for (let i = 0; i < w * h; i++) if (b[i] && !out[i]) out[i] = label
  return out
}

/** A colour mixed toward white (t = 0: the colour, 1: white), as #rrggbb. */
export function tint(hex: string, t: number): string {
  const v = parseInt(hex.replace('#', ''), 16)
  const ch = (s: number) => Math.round(((v >> s) & 255) * (1 - t) + 255 * t)
  return `#${[16, 8, 0].map((s) => ch(s).toString(16).padStart(2, '0')).join('')}`
}

/** The economics node's reading, compact, for a board readout (the panel's own numbers; indicative, not a feasibility study). */
export async function economicsReadout() {
  const { economicsNow } = await import('../hooks/useEconomics')
  const { site, result: r } = economicsNow()
  const byUse = Object.fromEntries(Object.entries(r.byUse).filter(([, v]) => v.gfa > 0).map(([k, v]) => [k, { gfa: Math.round(v.gfa), value: Math.round(v.value), cost: Math.round(v.cost) }]))
  const floors = r.floors.length
  const paying = r.floors.filter((f) => f.residual > 0).length
  return {
    note: 'Economics node (research P08, Program Value Visualizer method): indicative, not a feasibility study. Values with the node’s default settings in this browser unless edited; each row keeps its flag and source in the node’s ledger.',
    siteArea: site.area, siteBasis: site.basis,
    gfa: Math.round(r.gfa), value: Math.round(r.value), hard: Math.round(r.hard), soft: Math.round(r.soft), cityCharges: Math.round(r.cityCharges), regionalCharges: Math.round(r.regionalCharges),
    finance: Math.round(r.finance), cost: Math.round(r.cost), profit: Math.round(r.profit), cac: Math.round(r.cac),
    residualBeforeCac: Math.round(r.rlvBefore), residual: Math.round(r.rlvAfter), residualPerM2: Math.round(r.rlvPerM2), land: r.land == null ? null : Math.round(r.land),
    verdict: r.verdict, verdictText: verdictText(r), averagedFloors: r.averaged,
    withConcept: { cost: Math.round(r.concept.cost), residual: Math.round(r.concept.rlvAfter), verdict: r.concept.verdict },
    floors, floorsPaying: paying, byUse,
    words: { value: money(r.value), cost: money(r.cost), residual: money(r.rlvAfter), land: r.land == null ? null : money(r.land), conceptResidual: money(r.concept.rlvAfter) },
    readings: r.readings.map((x) => ({ id: x.id, state: x.state, label: (x as { label?: string }).label ?? '' })),
  }
}

// ---------------------------------------------------------------- the dev-server hook for scripts
if (import.meta.env.DEV && typeof window !== 'undefined') {
  const api = {
    render: (r: RenderRequest) => presentRender(r),
    mounted: () => renderer != null,
    economics: economicsReadout,
    async open(text: string, name: string) { const { openText } = await import('./project/session'); return openText(text, name) },
    /** Real Vancouver with the competition design on the default site (lib/defaultSite.ts), the grade read from the site. */
    async toCity() {
      const [{ DEFAULT_CITY_SITE, competitionToCity }, { useStore }, { DEFAULT_SITE_GROUND }] = await Promise.all([import('./defaultSite'), import('../store'), import('../engine/silhouetteViewpoint')])
      const s = useStore.getState()
      useStore.setState({ citySite: DEFAULT_CITY_SITE, towers: { ...s.towers, city: competitionToCity(s.towers.vtc, DEFAULT_CITY_SITE.ring as [number, number][]) }, groundMode: 'manual', groundElevation: DEFAULT_SITE_GROUND })
      useStore.getState().setProject('city')
      return { ground: DEFAULT_SITE_GROUND, towers: useStore.getState().towers.city.map((t) => ({ id: t.id, x: t.x, y: t.y, height: t.height })) }
    },
    /** Points the on-screen camera at a shot too, so the city's level-of-detail and chunk loading follow the render's view. */
    async aim(shot: { position: [number, number, number]; target: [number, number, number]; fov?: number }) {
      const { useStore } = await import('../store')
      useStore.setState({ cameraRequest: { position: shot.position, target: shot.target, fov: shot.fov } })
    },
    /** Height of the drawn ground at a model-frame point (null where nothing is drawn). */
    groundAt: (x: number, y: number) => (probe ? probe(x, y) : null),
    /** The drawn design towers' bounds (model frame), or null. */
    towerBox: () => (towerBounds ? towerBounds() : null),
    /** A competition-frame point placed as the design is placed on the default Real Vancouver site (lib/defaultSite.ts). */
    async cityPoint(p: [number, number]) {
      const { DEFAULT_CITY_SITE, competitionToCity } = await import('./defaultSite')
      const [t] = competitionToCity([{ x: p[0], y: p[1], rotation: 0 } as never], DEFAULT_CITY_SITE.ring as [number, number][])
      return [t.x, t.y]
    },
    /** Unit vector toward the sun at a UTC instant (ISO), in a frame whose north is `northDeg` clockwise from +y. */
    async sun(iso: string, northDeg = 0) {
      const { solarPosition, sunDirection } = await import('../engine/solar')
      const p = solarPosition(Date.parse(iso))
      return { dir: sunDirection(p, northDeg), altitude: p.altitude, azimuth: p.azimuth }
    },
    async toVtc() { const { useStore } = await import('../store'); useStore.getState().setProject('vtc') },
    async state() {
      const { useStore } = await import('../store')
      const s = useStore.getState()
      return { project: s.project, ground: s.groundElevation, towers: s.towers[s.project].map((t) => ({ id: t.id, name: t.name, x: t.x, y: t.y, rotation: t.rotation, height: t.height, imported: !!t.imported })) }
    },
    async views() { return import('./presentViews') },
  }
  ;(window as unknown as { __tdtRender: unknown }).__tdtRender = api
}
