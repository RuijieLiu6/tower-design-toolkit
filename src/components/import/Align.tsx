// Aligning an uploaded model to the map (Rhino item 11, after Vista v34 georeference.js and georeference-ui.js, Ruijie
// Liu): an anchor point on the model and on the map plus a turn, or the file's own Earth anchor; a plan preview on the
// real City footprints; the buildings under the model shown as demolished, with a "keep them" checkbox. The person
// confirms with the dialog's Use button. Coordinates: project frame (EPSG:26910 minus the Real Vancouver origin).
import { Crosshair, MapPinned } from '../icons'
import { useEffect, useMemo, useState } from 'react'
import { towerFootprint } from '../../engine/massing'
import type { Tower } from '../../engine/types'
import { toUtm10 } from '../../engine/relaxAviation'
import { footprintsUnder, REMOVAL_CAVEAT, REMOVAL_FLAG } from '../../lib/cityRemoval'
import { earthPoint, type AnchorOptions, type ImportOptions, type ProjectFrame } from '../../lib/import/pipeline'
import type { LoadedImport } from '../../lib/import/load'
import type { BuildResult } from '../../lib/interchange/build'
import { ROLE_COLOR } from '../../lib/interchange/model'
import { useCityData } from '../CityContext'
import { FlagChip } from '../ui'
import Help from '../Help'

type Pt = [number, number]

/** Named points of the model a person can anchor (file plan, metres): massing centre and corners, lot-line corners. */
export function modelPoints(raw: LoadedImport, built: BuildResult | null, opts: ImportOptions): { label: string; p: Pt }[] {
  const b = built?.massing?.bounds
  const out: { label: string; p: Pt }[] = []
  if (b) {
    out.push({ label: 'Massing centre', p: [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2] })
    out.push({ label: 'Massing south-west corner', p: [b.min[0], b.min[1]] }, { label: 'Massing south-east corner', p: [b.max[0], b.min[1]] }, { label: 'Massing north-east corner', p: [b.max[0], b.max[1]] }, { label: 'Massing north-west corner', p: [b.min[0], b.max[1]] })
  }
  const s = raw.unitScaleOverride ?? { m: 1, mm: 0.001, cm: 0.01, ft: 0.3048, in: 0.0254 }[opts.unit]
  for (const c of raw.curves ?? []) {
    if (!c.closed || !/site|lot|boundary|parcel|property/i.test(`${c.layer} ${c.name}`)) continue
    c.points.slice(0, 8).forEach((q, i) => out.push({ label: `${c.name || 'Lot line'}, corner ${i + 1}`, p: opts.upAxis === 'y' ? [q[0] * s, -q[2] * s] : [q[0] * s, q[1] * s] }))
  }
  return out
}

export function AlignBlock({ raw, opts, up, frame, built, picking, setPicking }: { raw: LoadedImport; opts: ImportOptions; up: (p: Partial<ImportOptions>) => void; frame: ProjectFrame; built: BuildResult | null; picking: boolean; setPicking: (v: boolean) => void }) {
  const a: AnchorOptions = opts.anchor ?? { model: [0, 0], city: frame.siteCentre, turn: 0 }
  const set = (patch: Partial<AnchorOptions>) => up({ anchor: { ...a, ...patch } })
  const points = useMemo(() => modelPoints(raw, built, opts), [raw, built, opts])
  const u = frame.utmOrigin
  const [geo, setGeo] = useState<'utm' | 'latlon'>('utm')
  const [ll, setLl] = useState<[string, string]>(['', ''])
  const ea = earthPoint(raw, opts, frame)
  const num = (v: string) => (v.trim() === '' || !Number.isFinite(Number(v)) ? null : Number(v))
  if (opts.placement !== 'anchor' && opts.placement !== 'earth') return null
  return (
    <section className="rounded-lg border border-line bg-panel p-3 text-xs" aria-label="Align to the map">
      <div className="mb-2 flex items-center gap-2 font-semibold"><MapPinned size={14} className="text-accent" />Align to the map<span className="ml-auto"><FlagChip flag={opts.placement === 'earth' ? 'unverified' : 'team_assumption'} /></span></div>
      {opts.placement === 'earth' ? (
        ea ? <p className="text-meta text-muted">The file's Earth anchor puts its base point ({raw.earthAnchor!.lat.toFixed(5)}, {raw.earthAnchor!.lon.toFixed(5)}) at E {ea.utm[0].toFixed(1)}, N {ea.utm[1].toFixed(1)} (EPSG:26910, Krüger series; NAD83 and WGS84 taken as equal, about 1 m). Check it on the preview; turn it below if the file's north is off.</p>
          : <p className="text-meta text-red-800">The file has no Earth anchor location{u ? '' : ', and this project has no map frame'}. Choose another placement.</p>
      ) : (
        <div className="grid gap-2">
          <label className="grid gap-1"><span className="text-muted">Point on the model</span>
            <select value={points.findIndex((q) => Math.abs(q.p[0] - a.model[0]) < 1e-6 && Math.abs(q.p[1] - a.model[1]) < 1e-6)} onChange={(e) => { const q = points[Number(e.target.value)]; if (q) set({ model: q.p }) }} className="rounded border border-line bg-panel px-1 py-0.5">
              <option value={-1}>Custom: {a.model[0].toFixed(2)}, {a.model[1].toFixed(2)} m in the file</option>
              {points.map((q, i) => <option key={i} value={i}>{q.label} ({q.p[0].toFixed(1)}, {q.p[1].toFixed(1)} m)</option>)}
            </select>
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted">Point on the map</span>
            {u && (
              <span role="radiogroup" aria-label="Map coordinates" className="flex overflow-hidden rounded border border-line text-[10.5px]">
                {(['utm', 'latlon'] as const).map((g) => <button key={g} role="radio" aria-checked={geo === g} onClick={() => setGeo(g)} className={`px-1.5 py-0.5 ${geo === g ? 'bg-accent text-white' : ''}`}>{g === 'utm' ? 'UTM 10N' : 'Lat, lon'}</button>)}
              </span>
            )}
            <button onClick={() => setPicking(!picking)} aria-pressed={picking} className={`ml-auto flex items-center gap-1 rounded border px-1.5 py-0.5 text-meta ${picking ? 'border-accent bg-accent/10 text-accent' : 'border-line hover:border-accent'}`}><Crosshair size={12} />{picking ? 'Click the preview…' : 'Pick on the preview'}</button>
          </div>
          {u && geo === 'latlon' ? (
            <div className="flex items-center gap-1.5">
              {(['Latitude', 'Longitude'] as const).map((k, i) => <input key={k} aria-label={k} placeholder={i ? '-123.1207' : '49.2827'} value={ll[i]} onChange={(e) => setLl(i ? [ll[0], e.target.value] : [e.target.value, ll[1]])} className="w-28 rounded border border-line px-1 py-0.5 tabular-nums" />)}
              <button onClick={() => { const lat = num(ll[0]), lon = num(ll[1]); if (lat == null || lon == null || lat < 0 || lat > 84 || lon < -126 || lon > -120) return; const [E, N] = toUtm10(lat, lon); set({ city: [E - u[0], N - u[1]] }) }} className="rounded border border-line px-1.5 py-0.5 text-meta hover:border-accent">Use</button>
              <span className="text-meta text-muted">degrees, UTM zone 10 only</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              {([0, 1] as const).map((i) => (
                <label key={i} className="flex items-center gap-1 text-meta text-muted">{u ? (i ? 'N' : 'E') : i ? 'y' : 'x'}
                  <input type="number" step={0.5} value={Number(((a.city[i] + (u ? u[i] : 0))).toFixed(2))} onChange={(e) => { const v = num(e.target.value); if (v == null) return; const c: Pt = [...a.city] as Pt; c[i] = v - (u ? u[i] : 0); set({ city: c }) }} className="w-28 rounded border border-line px-1 py-0.5 text-right tabular-nums text-ink" />
                </label>
              ))}
              <span className="text-meta text-muted">{u ? 'EPSG:26910 m' : 'm on the site'}</span>
            </div>
          )}
        </div>
      )}
      <label className="mt-2 flex items-center gap-2"><span className="text-muted">Turn</span>
        <input type="range" min={-180} max={180} step={0.5} value={a.turn} onChange={(e) => set({ turn: Number(e.target.value) })} className="flex-1 accent-accent" aria-label="Turn in degrees" />
        <input type="number" step={0.5} value={a.turn} onChange={(e) => { const v = num(e.target.value); if (v != null) set({ turn: Math.max(-180, Math.min(180, v)) }) }} className="w-16 rounded border border-line px-1 py-0.5 text-right tabular-nums" aria-label="Turn, degrees counter-clockwise" />°
        <Help label="About the turn">Counter-clockwise, on top of the north rotation above. After Vista's georeference tool (Ruijie Liu, Vista v34): coordinates are never guessed; you pick or type them.</Help>
      </label>
    </section>
  )
}

/** Plan of the placed model on the City footprints; footprints under it are demolished unless kept. */
export function AlignPreview({ built, onPick, picking, keep, setKeep, demolish }: { built: BuildResult | null; onPick: (p: Pt) => void; picking: boolean; keep: boolean; setKeep: (v: boolean) => void; demolish: { count: number; indices: number[] } }) {
  const { data, error } = useCityData()
  const towers: Tower[] = useMemo(() => built?.towers.map((t) => t.tower) ?? [], [built])
  const outlines = useMemo(() => towers.map((t) => towerFootprint(t)), [towers])
  const site = useMemo(() => built?.model.elements.flatMap((e) => (e.role === 'site' && e.geometry.kind === 'polygon' ? e.geometry.rings : [])) ?? [], [built])
  const ctx = useMemo(() => built?.model.elements.flatMap((e) => (e.role === 'context' && e.geometry.kind === 'prism' ? e.geometry.rings : [])) ?? [], [built])
  const all = [...outlines.flat(), ...site.flat()]
  if (!all.length) return null
  const xs = all.map((p) => p[0]), ys = all.map((p) => p[1])
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2
  const half = Math.max(120, 0.8 * Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)))
  const W = 360, k = W / (2 * half)
  const sx = (x: number) => (x - cx + half) * k, sy = (y: number) => (cy + half - y) * k
  const path = (r: Pt[]) => r.map(([x, y], i) => `${i ? 'L' : 'M'}${sx(x).toFixed(1)} ${sy(y).toFixed(1)}`).join('') + 'Z'
  const gone = new Set(demolish.indices)
  const nearIdx = data ? data.footprints.map((f, i) => [f, i] as const).filter(([f]) => { const p = f.outer[0]; return p && Math.abs(p[0] - cx) < half + 60 && Math.abs(p[1] - cy) < half + 60 }) : []
  const click = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!picking) return
    const r = e.currentTarget.getBoundingClientRect()
    const x = ((e.clientX - r.left) / r.width) * W, y = ((e.clientY - r.top) / r.height) * W
    onPick([x / k + cx - half, cy + half - y / k])
  }
  return (
    <section className="rounded-lg border border-line bg-panel p-3 text-xs">
      <div className="mb-1 flex items-center font-semibold">Preview on the City footprints<span className="ml-auto text-meta font-normal text-muted">{(2 * half).toFixed(0)} m across · north up</span></div>
      {error && <p className="text-meta text-red-800">The City layers could not be loaded: {error}</p>}
      {!data && !error && <p className="text-meta text-muted">Loading the City footprints…</p>}
      <svg viewBox={`0 0 ${W} ${W}`} className={`w-full rounded border border-line bg-[#f1efea] ${picking ? 'cursor-crosshair' : ''}`} onClick={click} role="img" aria-label={`Plan: the uploaded model on the City footprints; ${demolish.count} existing footprints under it ${keep ? 'kept' : 'shown as demolished'}`}>
        <defs><pattern id="demolish" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="#fde2e0" /><line x1="0" y1="0" x2="0" y2="6" stroke="#c0392b" strokeWidth="1.4" /></pattern></defs>
        {nearIdx.map(([f, i]) => <path key={i} d={path(f.outer)} fill={gone.has(i) ? (keep ? '#cfcac0' : 'url(#demolish)') : '#d9d5cc'} stroke={gone.has(i) ? '#c0392b' : '#b9b4aa'} strokeWidth={gone.has(i) ? 1 : 0.5} strokeDasharray={gone.has(i) && !keep ? '3 2' : undefined} />)}
        {ctx.map((r, i) => <path key={`c${i}`} d={path(r)} fill={ROLE_COLOR.context} fillOpacity={0.55} stroke="#6f6a61" strokeWidth={0.6} />)}
        {site.map((r, i) => <path key={`s${i}`} d={path(r)} fill="none" stroke={ROLE_COLOR.site} strokeWidth={1.6} strokeDasharray="6 3" />)}
        {outlines.map((r, i) => <path key={`t${i}`} d={path(r)} fill={ROLE_COLOR.tower} fillOpacity={0.55} stroke="#ffffff" strokeWidth={1} />)}
        <g transform={`translate(${W - 18} 22)`}><path d="M0 -12 L5 4 L0 0 L-5 4 Z" fill="#1f2328" /><text y={14} fontSize={9} textAnchor="middle" fill="#1f2328">N</text></g>
        <g transform={`translate(10 ${W - 12})`}><line x1={0} x2={50 * k} y1={0} y2={0} stroke="#1f2328" strokeWidth={1.5} /><text x={50 * k + 4} y={3} fontSize={9} fill="#1f2328">50 m</text></g>
      </svg>
      {nearIdx.length === 0 && data && <p className="mt-1 text-meta text-muted">No City footprints here: the model may be outside the downtown data. Check the anchor.</p>}
      <label className="mt-2 flex items-start gap-2">
        <input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} className="mt-0.5 accent-accent" disabled={!demolish.count} />
        <span><b>Keep the {demolish.count} existing building{demolish.count === 1 ? '' : 's'} under the model</b>{demolish.count ? ' (otherwise they are shown as demolished and leave the views, shadows and roofs)' : ' (none under it)'}.</span>
        <span className="ml-auto"><FlagChip flag={REMOVAL_FLAG} /></span>
      </label>
      <p className="mt-1 text-meta text-muted">{REMOVAL_CAVEAT} Hatched red: demolished. Blue: your towers; dashed teal: your lot line; dark grey: your context.</p>
    </section>
  )
}

/** Indices of the City footprints under the built towers (cityRemoval, shrunk 0.5 m so neighbours that touch stay). */
export function useDemolition(built: BuildResult | null): { count: number; indices: number[] } {
  const { data } = useCityData()
  return useMemo(() => {
    if (!data || !built?.towers.length) return { count: 0, indices: [] }
    const idx = [...new Set(footprintsUnder(data.footprints, built.towers.map((t) => towerFootprint(t.tower))).flat())].sort((a, b) => a - b)
    return { count: idx.length, indices: idx }
  }, [data, built])
}

/** Real Vancouver only (it loads the City layers): the preview, and the demolition count reported to the dialog. */
export function CityAlign({ built, onPick, picking, keep, setKeep, onCount }: { built: BuildResult | null; onPick: (p: Pt) => void; picking: boolean; keep: boolean; setKeep: (v: boolean) => void; onCount: (n: number) => void }) {
  const demolish = useDemolition(built)
  useEffect(() => { onCount(demolish.count) }, [demolish.count, onCount])
  return <AlignPreview built={built} onPick={onPick} picking={picking} keep={keep} setKeep={setKeep} demolish={demolish} />
}
