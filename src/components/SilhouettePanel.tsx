// Skyline silhouette (engine/silhouette.ts): each tower's outline from the four view pairs as small elevations drawn
// to one scale, the changes marked where they happen (green: legible from the chosen distance; grey: too small), the
// viewing distance as a choice, then the result lines. The distance lives in a small store so the checklist (the trace
// digest, components/TracePanel.tsx) and this panel read the same thing.
// R7 tool 1 (21 Nov): the view from the city's viewpoints (engine/silhouetteViewpoint.ts): a viewpoint and a contrast as
// choices, the tower drawn as seen from there, and the readings against the contrast's line.
import { useMemo } from 'react'
import { create } from 'zustand'
import { VTC_NORTH_DEG } from '../context'
import { ACUITY_ARCMIN, DEFAULT_VIEW_M, LEGIBLE_ARCMIN, LEGIBLE_NOTE, LEGIBLE_VIEWS, metresAt, silhouetteReading, SKY_ARCMIN2, SKY_NOTE, SKY_VIEWS, skyContext, type AxisReading, type SilhouetteReading } from '../engine/silhouette'
import { ALL_VIEWPOINTS, CONTRAST, CONTRAST_NOTE, VIEWPOINT_NOTE, viewpointOutline, viewpointReadings, viewpointRules, viewSite, type Contrast, type ViewpointAt, type ViewpointReading, type ViewSite } from '../engine/silhouetteViewpoint'
import { useSwStudy } from '../lib/swStudy'
import { useStore, useTowers } from '../store'
import { MethodFold, RuleRows, STATE_COL, Stat, Stats } from './ResultViz'
import SheetFrame from './SheetFrame'
import { Section } from './ui'

/**
 * The viewing distance the reading uses (m), shared by this panel and the trace digest, and the glass transmittance the
 * sky reading uses (0–1; null: glass blocks; gap G33). R7 tool 1: the viewpoint shown ('qe', a cone origin's id, a named
 * place, or 'own' for the place set by bearing and distance), that place, and the contrast that sets the pass line.
 */
export const useSilhouetteView = create<{ distance: number; glassT: number | null; viewpoint: string; own: ViewpointAt; contrast: Contrast }>(() => ({
  distance: DEFAULT_VIEW_M, glassT: null, viewpoint: 'qe', own: { name: 'Your viewpoint', bearing: 180, distance: 3000 }, contrast: 'clear',
}))
const DISTANCES = [500, 1000, 2000, 5000]
const km = (d: number) => (d >= 1000 ? `${d / 1000} km` : `${d} m`)

/** A tower's silhouette reading with its viewpoint readings (Queen Elizabeth Park and the others), their lines appended. */
export type PanelReading = SilhouetteReading & { vp: { qe: ViewpointReading | null; others: ViewpointReading[] }; site: ViewSite }

export function useSilhouettes(): PanelReading[] {
  const towers = useTowers()
  const project = useStore((s) => s.project)
  const north = project === 'vtc' ? VTC_NORTH_DEG : 0
  const ground = useStore((s) => s.groundElevation)
  const distance = useSilhouetteView((s) => s.distance)
  const glassT = useSilhouetteView((s) => s.glassT)
  const contrast = useSilhouetteView((s) => s.contrast)
  const own = useSilhouetteView((s) => (s.viewpoint === 'own' ? s.own : null))
  // the wind settings' deck screen (gap G33): its open share is the sky seen through it, reported apart and not judged
  const screenH = useSwStudy((s) => s.deckScreenH), screenOpen = useSwStudy((s) => s.deckScreenPorosity)
  return useMemo(() => {
    const screens = screenH != null && screenH > 0 ? { h: screenH, t: screenOpen, from: "the wind settings' deck screen" } : null
    const site = viewSite(project, ground)
    return towers.map((t) => {
      const context = skyContext(towers, t)
      const r = silhouetteReading(t, { northDeg: north, distance, context, glassT, screens })
      const vp = viewpointReadings(t, { site, contrast, context, viewpoints: own ? [own] : [] })
      return { ...r, rules: [...r.rules, ...viewpointRules(vp.qe, vp.others)], vp, site }
    })
  }, [towers, project, north, ground, distance, glassT, screenH, screenOpen, contrast, own])
}

/** One view pair's outline, centred on its base, to the shared scale `k` (px per m). */
function Elevation({ a, k, base, H, w }: { a: AxisReading; k: number; base: number; H: number; w: number }) {
  if (!a.edges.length) return null
  const c = (a.edges[0].l + a.edges[0].r) / 2
  const X = (s: number) => w / 2 + (s - c) * k, Y = (z: number) => 8 + (H - (z - base)) * k
  const right = a.edges.flatMap((e) => [`${X(e.r).toFixed(1)},${Y(e.z0).toFixed(1)}`, `${X(e.r).toFixed(1)},${Y(e.z1).toFixed(1)}`])
  const left = [...a.edges].reverse().flatMap((e) => [`${X(e.l).toFixed(1)},${Y(e.z1).toFixed(1)}`, `${X(e.l).toFixed(1)},${Y(e.z0).toFixed(1)}`])
  return (
    <g>
      <polygon points={[...right, ...left].join(' ')} fill="#d9dee4" stroke="#3a4250" strokeWidth={0.8} strokeLinejoin="miter" />
      {a.changes.map((ch, i) => {
        const legible = ch.arcmin >= LEGIBLE_ARCMIN - 1e-9, z = (ch.z0 + ch.z1) / 2
        return <line key={i} x1={2} x2={w - 2} y1={Y(z)} y2={Y(z)} stroke={legible ? STATE_COL.pass : STATE_COL.unknown} strokeWidth={legible ? 1.6 : 1} strokeDasharray={legible ? undefined : '2 2'}>
          <title>{`${ch.size.toFixed(1)} m at +${Math.round(z)} m, ${ch.arcmin < 9.95 ? ch.arcmin.toFixed(1) : Math.round(ch.arcmin)}′`}</title></line>
      })}
    </g>
  )
}

function Elevations({ r }: { r: SilhouetteReading }) {
  const H = Math.max(1, r.top - r.base)
  const half = Math.max(1, ...r.axes.flatMap((a) => { const c = a.edges.length ? (a.edges[0].l + a.edges[0].r) / 2 : 0; return a.edges.flatMap((e) => [Math.abs(e.l - c), Math.abs(e.r - c)]) }))
  const w = 64, h = 132, k = Math.min((w - 8) / (2 * half), (h - 16) / H)
  return (
    <SheetFrame title={`Skyline silhouette, ${r.tower.name}`}>
      <div className="grid grid-cols-4 gap-1" role="img" aria-label={`Outline of ${r.tower.name} from the four view pairs; marks where it changes, green when legible from ${km(r.distance)}`}>
        {r.axes.map((a) => (
          <figure key={a.pair} className="m-0 min-w-0 text-center">
            <svg viewBox={`0 0 ${w} ${h}`} className="w-full rounded-md bg-[#f7f8fa]"><Elevation a={a} k={k} base={r.base} H={H} w={w} /></svg>
            <figcaption className="mt-0.5 truncate text-meta tabular-nums" title={a.largest ? `Largest change ${a.largest.size.toFixed(1)} m` : 'No change'}>
              <b>{a.pair}</b> {a.largest ? `${a.largest.size.toFixed(1)} m` : '—'}
            </figcaption>
          </figure>
        ))}
      </div>
      <p className="mt-1 text-meta text-muted">Drawn to one scale, above the podium. Green: a change of {LEGIBLE_ARCMIN}′ or more from {km(r.distance)} ({metresAt(LEGIBLE_ARCMIN, r.distance).toFixed(1)} m). Grey dashes: smaller.</p>
    </SheetFrame>
  )
}

function DistancePick() {
  const distance = useSilhouetteView((s) => s.distance)
  return (
    <div role="radiogroup" aria-label="Viewing distance" className="flex flex-wrap items-center gap-1 text-meta">
      <span className="mr-1 text-muted">Seen from</span>
      {DISTANCES.map((d) => (
        <button key={d} type="button" role="radio" aria-checked={distance === d} onClick={() => useSilhouetteView.setState({ distance: d })}
          className={`rounded-full px-2.5 py-1 outline-none focus-visible:ring-2 focus-visible:ring-accent ${distance === d ? 'bg-selected font-semibold text-accent-hover' : 'bg-subtle text-muted hover:text-ink'}`}>{km(d)}</button>
      ))}
      <GlassPick />
    </div>
  )
}

/** Gap G33: the share of the sky seen through marked glass (blank: the glass blocks); set here, it counts in the sky judgement. */
function GlassPick() {
  const glassT = useSilhouetteView((s) => s.glassT)
  return (
    <label className="ml-auto flex items-center gap-1 text-muted" title="Share of the sky seen through the glass the model marks, along a line of sight. Blank: the glass blocks. Set here, the sky through glass counts in the judgement; the wind settings' deck screens are reported apart.">
      Glass lets through
      <input type="number" min={0} max={100} step={5} value={glassT == null ? '' : Math.round(glassT * 100)} aria-label="Glass transmittance for the sky reading (%)"
        onChange={(e) => { const v = e.target.value.trim(); useSilhouetteView.setState({ glassT: v === '' ? null : Math.min(1, Math.max(0, Number(v) / 100 || 0)) }) }}
        className="w-14 rounded border border-line bg-panel px-1.5 py-0.5 text-right text-meta" />%
    </label>
  )
}

/** The viewpoint and the contrast (R7 tool 1): Queen Elizabeth Park first, then the other cone origins, the named places, your own. */
function ViewpointPick() {
  const viewpoint = useSilhouetteView((s) => s.viewpoint)
  const own = useSilhouetteView((s) => s.own)
  const contrast = useSilhouetteView((s) => s.contrast)
  const num = (v: string, fallback: number) => { const n = Number(v); return v.trim() !== '' && Number.isFinite(n) ? n : fallback }
  return (
    <div className="grid gap-1 text-meta">
      <div className="flex flex-wrap items-center gap-1">
        <label className="flex min-w-0 items-center gap-1 text-muted">
          <span>Seen from</span>
          <select value={viewpoint} aria-label="Viewpoint" onChange={(e) => useSilhouetteView.setState({ viewpoint: e.target.value })}
            className="min-w-0 max-w-[13rem] rounded border border-line bg-panel px-1.5 py-0.5 text-meta text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent">
            {ALL_VIEWPOINTS.map((v) => <option key={v.id} value={v.id}>{v.name}{v.cones.length ? ` (${v.cones.length > 2 ? `${v.cones[0]}–${v.cones[v.cones.length - 1]}` : v.cones.join(', ')})` : ' (approx.)'}</option>)}
            <option value="own">Your own: bearing and distance</option>
          </select>
        </label>
        <div role="radiogroup" aria-label="Contrast against the sky" className="ml-auto flex items-center gap-1">
          {(Object.keys(CONTRAST) as Contrast[]).map((c) => (
            <button key={c} type="button" role="radio" aria-checked={contrast === c} onClick={() => useSilhouetteView.setState({ contrast: c })}
              title={`${CONTRAST[c].label}: a change of ${CONTRAST[c].arcmin}′ or ${CONTRAST[c].arcmin2} arcmin² of sky reads. ${CONTRAST_NOTE}`}
              className={`rounded-full px-2.5 py-1 outline-none focus-visible:ring-2 focus-visible:ring-accent ${contrast === c ? 'bg-selected font-semibold text-accent-hover' : 'bg-subtle text-muted hover:text-ink'}`}>
              {c === 'clear' ? 'Clear' : 'Overcast'} {CONTRAST[c].arcmin}′
            </button>
          ))}
        </div>
      </div>
      {viewpoint === 'own' && (
        <div className="flex flex-wrap items-center gap-1 text-muted">
          <label className="flex items-center gap-1" title="The viewer's bearing from the tower, degrees clockwise from north (grid north)">Bearing
            <input type="number" min={0} max={359} step={5} value={own.bearing} aria-label="Viewer's bearing from the tower (degrees)" onChange={(e) => useSilhouetteView.setState({ own: { ...own, bearing: num(e.target.value, own.bearing) } })}
              className="w-16 rounded border border-line bg-panel px-1.5 py-0.5 text-right text-meta" />°</label>
          <label className="flex items-center gap-1" title="Horizontal distance from the tower (m)">at
            <input type="number" min={100} step={100} value={own.distance} aria-label="Distance from the tower (m)" onChange={(e) => useSilhouetteView.setState({ own: { ...own, distance: Math.max(100, num(e.target.value, own.distance)) } })}
              className="w-20 rounded border border-line bg-panel px-1.5 py-0.5 text-right text-meta" />m</label>
        </div>
      )}
    </div>
  )
}

const arcText = (a: number) => `${a < 9.95 ? a.toFixed(1) : Math.round(a)}′`
const kmText = (d: number) => (d >= 1000 ? `${(d / 1000).toFixed(1)} km` : `${Math.round(d)} m`)

/** The tower drawn as seen from the viewpoint, in angles to one scale: outline, sky through it, the terrain line, the largest change and the pass line's size. */
function ViewFrom({ r, v }: { r: PanelReading; v: ViewpointReading }) {
  const contrast = useSilhouetteView((s) => s.contrast)
  const towers = useTowers()
  const o = useMemo(() => viewpointOutline(r.tower, v.viewpoint, { site: r.site, contrast, context: skyContext(towers, r.tower) }), [r.tower, towers, v.viewpoint, r.site, contrast])
  if (!o || !o.outline.length) return null
  const pts = o.outline.flatMap((p) => p.angles)
  const az0 = Math.min(...pts.map((p) => p[0])), az1 = Math.max(...pts.map((p) => p[0]))
  const el0 = Math.min(...pts.map((p) => p[1]), o.terrain?.deg ?? Infinity), el1 = Math.max(...pts.map((p) => p[1]), o.terrain?.deg ?? -Infinity)
  const lineDeg = o.line.arcmin / 60
  const w = 120, h = 200, pad = 10
  const k = Math.min((w - 2 * pad) / Math.max(az1 - az0, lineDeg * 1.5), (h - 2 * pad - 14) / Math.max(1e-6, el1 - el0))
  const mid = (az0 + az1) / 2
  const X = (a: number) => w / 2 + (a - mid) * k, Y = (e: number) => pad + (el1 - e) * k
  const poly = (ps: [number, number][]) => ps.map(([a, e]) => `${X(a).toFixed(1)},${Y(e).toFixed(1)}`).join(' ')
  const ch = v.largest, reads = !!ch && ch.arcmin >= o.line.arcmin - 1e-9
  // the change's height as an angle, as the outline is drawn (the elevations in the outline carry curvature and refraction)
  const zOf = (z: number) => { const ring = o.outline[0]; const i = ring.metres.findIndex((m) => Math.abs(m[1] - z) < 0.01); return i >= 0 ? ring.angles[i][1] : null }
  const chEl = ch ? zOf(ch.z0) : null
  return (
    <SheetFrame title={`View from ${o.viewpoint.name}, ${r.tower.name}`}>
      <figure className="m-0 grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-start gap-2">
        <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} className="rounded-md bg-[#f7f8fa]" role="img"
          aria-label={`${r.tower.name} as seen from ${o.viewpoint.name}, ${kmText(o.distance)} away; drawn in angles to one scale`}>
          {o.terrain && <g><line x1={0} x2={w} y1={Y(o.terrain.deg)} y2={Y(o.terrain.deg)} stroke="#7a8794" strokeWidth={0.8} strokeDasharray="4 2" /><title>{`Terrain line behind: ${o.terrain.deg.toFixed(2)}°, crossing the tower at +${o.terrain.z.toFixed(1)} m (R7d §2)`}</title></g>}
          {o.parts.map((p, i) => <polygon key={`p${i}`} points={poly(p.angles)} fill="#d9dee4" stroke="#d9dee4" strokeWidth={0.4} />)}
          {o.outline.map((p, i) => <polygon key={i} points={poly(p.angles)} fill="none" stroke="#3a4250" strokeWidth={0.8} strokeLinejoin="miter" />)}
          {o.openings.flatMap((op, i) => op.cells.map((c, j) => <polygon key={`o${i}-${j}`} points={poly(c.angles)} fill="#ffffff" stroke="#3a4250" strokeWidth={0.5}><title>{`Sky through the tower: ${Math.round(op.sky)} m², ${Math.round(op.arcmin2)} arcmin²`}</title></polygon>))}
          {ch && chEl != null && <g><line x1={2} x2={w - 2} y1={Y(chEl)} y2={Y(chEl)} stroke={reads ? STATE_COL.pass : STATE_COL.unknown} strokeWidth={reads ? 1.6 : 1} strokeDasharray={reads ? undefined : '2 2'} /><title>{`Largest change ${ch.size.toFixed(1)} m at +${Math.round(ch.z0)} m, ${arcText(ch.arcmin)}`}</title></g>}
          <g><line x1={X(mid - lineDeg / 2)} x2={X(mid + lineDeg / 2)} y1={h - 8} y2={h - 8} stroke="#3a4250" strokeWidth={2} /><title>{`${o.line.arcmin}′: the smallest change that reads, ${o.line.m.toFixed(1)} m at this distance`}</title></g>
        </svg>
        <figcaption className="grid min-w-0 gap-0.5 pt-7 text-meta text-muted">
          <span className="text-ink"><b>{o.viewpoint.name}</b></span>
          <span className="tabular-nums">{kmText(o.distance)} at {Math.round(o.bearing) % 360}°, eye {o.viewpoint.eye.toFixed(1)} m</span>
          <span className="tabular-nums" title="The bar under the drawing: the smallest change that reads at this contrast">Bar: {o.line.arcmin}′ = {o.line.m.toFixed(1)} m here</span>
          {o.terrain && <span className="tabular-nums" title="R7d §2: the North Shore ridge behind the default site, MRDEM-30 terrain, refraction k 0.13 (our arithmetic)">Dashes: ridge at +{Math.round(o.terrain.z)} m</span>}
        </figcaption>
      </figure>
    </SheetFrame>
  )
}

/** The viewpoint reading for one tower: the choices, four figures, the view drawn. */
function ViewpointBlock({ r }: { r: PanelReading }) {
  const viewpoint = useSilhouetteView((s) => s.viewpoint)
  const all = [...(r.vp.qe ? [r.vp.qe] : []), ...r.vp.others]
  const v = viewpoint === 'own' ? all.find((x) => x.viewpoint.kind === 'custom') : all.find((x) => x.viewpoint.id === viewpoint)
  return (
    <div className="grid gap-2" data-testid="silhouette-viewpoint">
      <ViewpointPick />
      {!v || !v.edges.length ? <p className="text-meta text-muted">No tower storeys to read from this viewpoint.</p> : (
        <>
          <Stats cols={2}>
            <Stat label="Largest change" value={v.largest ? v.largest.size.toFixed(1) : '0'} unit={v.largest ? `m · ${arcText(v.largest.arcmin)}` : 'm'} color={STATE_COL[v.reads.outline ? 'pass' : 'warn']}
              tip={v.largest ? `At +${Math.round(v.largest.z0)} m; reads at ${v.line.arcmin}′ (${v.line.m.toFixed(1)} m from ${kmText(v.distance)})` : 'The outline is straight from here'} />
            <Stat label="Sky through" value={v.sky.largest ? `${Math.round(v.sky.largest.skyArcmin2)}` : '0'} unit={`arcmin² · ${v.sky.largest ? Math.round(v.sky.largest.sky) : 0} m²`} color={STATE_COL[v.reads.sky ? 'pass' : 'warn']}
              tip={`Largest opening of sky through the tower from here; reads at ${v.line.arcmin2} arcmin² (${Math.round(v.line.m2)} m²)${v.terrain ? '; openings below the ridge line are seen against the mountainside and not counted' : ''}`} />
            <Stat label="Narrowest" value={v.narrowest ? v.narrowest.m.toFixed(1) : '—'} unit={v.narrowest ? `m · ${arcText(v.narrowest.arcmin)}` : ''} tip={v.narrowest ? `At +${Math.round(v.narrowest.z0)}–${Math.round(v.narrowest.z1)} m` : undefined} />
            <Stat label="Widest" value={v.widest ? v.widest.m.toFixed(1) : '—'} unit={v.widest ? `m · ${arcText(v.widest.arcmin)}` : ''} tip={v.widest ? `At +${Math.round(v.widest.z0)}–${Math.round(v.widest.z1)} m` : undefined} />
          </Stats>
          <ViewFrom r={r} v={v} />
        </>
      )}
    </div>
  )
}

export default function SilhouettePanel() {
  const readings = useSilhouettes()
  if (!readings.length) return <Section title="Skyline silhouette"><p className="text-meta text-muted">Place a tower to read its outline from across the city.</p></Section>
  return (
    <>
      {readings.map((r) => (
        <Section key={r.tower.id} title={`Results: ${r.tower.name}`}>
          <div className="grid gap-2">
            <DistancePick />
            <Stats>
              <Stat label="Legible views" value={`${r.legibleViews} / 8`} color={STATE_COL[r.state]} tip={`Views with a change of ${LEGIBLE_ARCMIN}′ or more from ${km(r.distance)}; ${LEGIBLE_VIEWS} or more reads as a pass`} />
              <Stat label="Largest change" value={r.largest ? r.largest.size.toFixed(1) : '0'} unit={r.largest ? `m · ${r.largest.arcmin < 9.95 ? r.largest.arcmin.toFixed(1) : Math.round(r.largest.arcmin)}′` : 'm'} tip={r.largest ? `Seen from ${r.largest.pair}, at +${Math.round(r.largest.z0)} m` : 'The outline is straight'} />
              <Stat label="Widest view turns" value={r.turn ? `${Math.round(Math.abs(r.turn.deg))}°` : '—'} tip="How far the direction the tower looks widest from turns between its base and its top" />
              <Stat label="Sky through" value={r.sky.read ? `${r.sky.legibleViews} / 8` : '—'} color={STATE_COL[r.sky.state]} tip={r.sky.read ? `Views with an opening of sky through the tower of ${SKY_ARCMIN2} arcmin² or more from ${km(r.distance)}; ${SKY_VIEWS} or more reads as a pass` : 'The storeys of this mass are not known'} />
            </Stats>
            <Elevations r={r} />
            <ViewpointBlock r={r} />
            <RuleRows rules={r.rules} />
          </div>
          <MethodFold>
            <p>The tower part above the podium is cut at every block or storey change and seen straight on from 8 compass views (true north applied); a view and its opposite see the same outline, mirrored. A change is how far the outline's two edges move where it steps, slides, tapers or twists; steps that keep moving it the same way with up to 10 m of straight outline between them count as one.</p>
            <p>{LEGIBLE_NOTE}</p>
            <p>{SKY_NOTE}</p>
            <p>{VIEWPOINT_NOTE}</p>
            <p>{CONTRAST_NOTE}</p>
            <p>Visual acuity sets the floor at {ACUITY_ARCMIN}′; the 8 compass views stay at clear contrast ({LEGIBLE_ARCMIN}′). The board cameras are not read.</p>
          </MethodFold>
        </Section>
      ))}
    </>
  )
}
