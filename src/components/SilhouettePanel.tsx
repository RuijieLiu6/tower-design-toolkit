// Skyline silhouette (engine/silhouette.ts): each tower's outline from the four view pairs as small elevations drawn
// to one scale, the changes marked where they happen (green: legible from the chosen distance; grey: too small), the
// viewing distance as a choice, then the result lines. The distance lives in a small store so the checklist (the trace
// digest, components/TracePanel.tsx) and this panel read the same thing.
import { useMemo } from 'react'
import { create } from 'zustand'
import { VTC_NORTH_DEG } from '../context'
import { ACUITY_ARCMIN, DEFAULT_VIEW_M, LEGIBLE_ARCMIN, LEGIBLE_NOTE, LEGIBLE_VIEWS, metresAt, silhouetteReading, type AxisReading, type SilhouetteReading } from '../engine/silhouette'
import { useStore, useTowers } from '../store'
import { MethodFold, RuleRows, STATE_COL, Stat, Stats } from './ResultViz'
import SheetFrame from './SheetFrame'
import { Section } from './ui'

/** The viewing distance the reading uses (m), shared by this panel and the trace digest. */
export const useSilhouetteView = create<{ distance: number }>(() => ({ distance: DEFAULT_VIEW_M }))
const DISTANCES = [500, 1000, 2000, 5000]
const km = (d: number) => (d >= 1000 ? `${d / 1000} km` : `${d} m`)

export function useSilhouettes(): SilhouetteReading[] {
  const towers = useTowers()
  const north = useStore((s) => (s.project === 'vtc' ? VTC_NORTH_DEG : 0))
  const distance = useSilhouetteView((s) => s.distance)
  return useMemo(() => towers.map((t) => silhouetteReading(t, { northDeg: north, distance })), [towers, north, distance])
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
            </Stats>
            <Elevations r={r} />
            <RuleRows rules={r.rules} />
          </div>
          <MethodFold>
            <p>The tower part above the podium is cut at every block or storey change and seen straight on from 8 compass views (true north applied); a view and its opposite see the same outline, mirrored. A change is how far the outline's two edges move where it steps, slides, tapers or twists; steps that keep moving it the same way with up to 10 m of straight outline between them count as one.</p>
            <p>{LEGIBLE_NOTE}</p>
            <p>Visual acuity sets the floor at {ACUITY_ARCMIN}′; the toolkit does not yet read the outline from the view-cone origins or the board cameras, beside the future towers.</p>
          </MethodFold>
        </Section>
      ))}
    </>
  )
}
