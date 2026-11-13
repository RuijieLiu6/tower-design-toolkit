// Analysis drawings at the top of a climate check's results (Sinnie, 13 Nov: "results panel should change as users
// open the corresponding analysis tool. it should include analysis drawings. for sun wind rain energy related stuff,
// extract from the sun wind studio"). The drawings are Sun & Wind Studio's (viz.js rose, compass and bars; study.js sun
// path; rain.js rain rose and month dials), and their numbers come from the Studio's engines as ported to TypeScript
// (engine/sw, from the local-climate-nodes branch) over the same CWEC 2020 typical year for Vancouver Intl AP.
//   Sun & shadow, Solar access → sun path with the hour shown, sun on each face of the towers
//   Wind screen, Wind study    → wind roses for the year and each season
//   City in Nature (rainwater) → rain rose, rain by month, driving rain on each face, roof water
//   Energy & carbon            → TEUI / TEDI / GHGI against the Vancouver targets, energy by end use
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import SheetButton from './SheetButton'
import { svgImage } from '../lib/sheetAdd'
import { useShallow } from 'zustand/react/shallow'
import { VTC_NORTH_DEG } from '../context'
import { towerOccluders } from '../engine/solarRules'
import { sunPosition, vancouverTime } from '../engine/sun'
import { ENERGY_DEFAULTS, energyModel, type EnergyFloor, type EnergyResult } from '../engine/sw/energy'
import { facadeRain, hourlyRain, keepFor, monthOfHour, rainBySector, roofCollect, wdrBins, type RainTower } from '../engine/sw/rain'
import { facadeIrradiance } from '../engine/sw/sun'
import type { ClimatePayload, Prism } from '../engine/sw/types'
import { SEASONS, windRose, type Season } from '../engine/sw/wind'
import type { Tower } from '../engine/types'
import { floorPlates } from '../lib/floorPick'
import { useStore, useTowers } from '../store'

type Kind = 'sun' | 'wind' | 'rain' | 'energy'
const KIND: Record<string, Kind> = {
  'built.sun': 'sun', 'built.solar-access': 'sun', 'built.wind-screen': 'wind', 'built.wind-study': 'wind',
  'built.city-in-nature': 'rain', 'built.energy-carbon': 'energy',
  // Sun & Wind Studio tools (13 Nov) show the same drawings under their key results.
  'built.sw-shadow': 'sun', 'built.sw-sun-faces': 'sun', 'built.sw-wind-comfort': 'wind', 'built.sw-wind-height': 'wind',
  'built.sw-rain-faces': 'rain', 'built.sw-rain-water': 'rain', 'built.sw-energy': 'energy',
}
export const climateKind = (node: string | null) => (node ? KIND[node] ?? null : null)

// ------------------------------------------------------------------ the climate file (loaded once, on demand)
let climate: Promise<ClimatePayload> | null = null
function useClimate(): ClimatePayload | null {
  const [c, setC] = useState<ClimatePayload | null>(null)
  useEffect(() => {
    let live = true
    climate ??= import('../data/climate/yvr-cwec2020.json').then((m) => (m.default ?? m) as unknown as ClimatePayload)
    climate.then((v) => live && setC(v), () => { climate = null })
    return () => { live = false }
  }, [])
  return c
}

// ------------------------------------------------------------------ Sun & Wind Studio's figure kit (viz.js), in React
const INK = '#1f2328', MUTED = '#6b7280', LINE = '#e5e7eb', GRID = '#eef0f3'
const SUN = '#e0a23a', WIND = '#3b7fb6', RAIN = '#2F6FA8'
const T = ({ x, y, children, anchor = 'start', k = false, size = 9 }: { x: number; y: number; children: ReactNode; anchor?: 'start' | 'middle' | 'end'; k?: boolean; size?: number }) =>
  <text x={x} y={y} textAnchor={anchor} fontSize={size} fill={k ? INK : MUTED} fontFamily="ui-monospace, monospace">{children}</text>

/** Polar rose: petal length = share, depth of colour = mean speed (viz.js rose). */
function Rose({ sectors, color, size = 200, label, sUnit = 'm/s' }: { sectors: { name: string; dir: number; f: number; s?: number; text?: string }[]; color: string; size?: number; label: string; sUnit?: string }) {
  const cx = size / 2, cy = size / 2, R = size / 2 - 22
  const maxf = Math.max(1e-9, ...sectors.map((r) => r.f)), sMax = Math.max(1e-9, ...sectors.map((r) => r.s ?? 0))
  const half = ((360 / sectors.length / 2) * Math.PI) / 180 * 0.85
  return (
    <svg viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label} className="w-full">
      {[0.25, 0.5, 0.75, 1].map((t) => <circle key={t} cx={cx} cy={cy} r={R * t} fill="none" stroke={LINE} />)}
      {sectors.map((r) => {
        const L = (R * r.f) / maxf, a = (r.dir * Math.PI) / 180
        const p = (d: number) => `${(cx + L * Math.sin(a + d)).toFixed(1)},${(cy - L * Math.cos(a + d)).toFixed(1)}`
        const op = r.s != null ? 0.35 + 0.6 * Math.min(1, r.s / sMax) : 0.8
        const lx = cx + (R + 11) * Math.sin(a), ly = cy - (R + 11) * Math.cos(a)
        return (
          <g key={r.dir}>
            <path d={`M${cx},${cy}L${p(-half)}A${L.toFixed(1)},${L.toFixed(1)} 0 0 1 ${p(half)}Z`} fill={color} fillOpacity={op}>
              <title>{`${r.name}: ${r.text ?? `${Math.round(r.f * 100)}%`}${r.s != null ? `, ${r.s.toFixed(1)} ${sUnit}` : ''}`}</title>
            </path>
            {r.name && <T x={lx} y={ly + 3} anchor="middle">{r.name}</T>}
          </g>
        )
      })}
      <T x={cx + 3} y={cy - R * 0.5 + 9} size={8}>{Math.round(maxf * 50)}%</T>
    </svg>
  )
}

/** Four bars from a centre, N E S W (viz.js compass). */
function Compass({ faces, label, size = 200 }: { faces: Partial<Record<'N' | 'E' | 'S' | 'W', { v: number; color: string; text: string }>>; label: string; size?: number }) {
  const cx = size / 2, cy = size / 2, R = size / 2 - 40, bw = 22
  const max = Math.max(1e-9, ...Object.values(faces).map((f) => f!.v))
  const dirs = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] } as const
  return (
    <svg viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label} className="w-full">
      {[0.5, 1].map((t) => <circle key={t} cx={cx} cy={cy} r={R * t} fill="none" stroke={LINE} />)}
      {(['N', 'E', 'S', 'W'] as const).map((k) => {
        const f = faces[k]; if (!f) return null
        const [dx, dy] = dirs[k], L = R * Math.min(1, f.v / max), px = (-dy * bw) / 2, py = (dx * bw) / 2
        const pts = [[cx + px, cy + py], [cx - px, cy - py], [cx - px + dx * L, cy - py + dy * L], [cx + px + dx * L, cy + py + dy * L]]
        return (
          <g key={k}>
            <path d={`M${pts.map((q) => q.map((v) => v.toFixed(1)).join(',')).join('L')}Z`} fill={f.color} fillOpacity={0.9}><title>{`${k}: ${f.text}`}</title></path>
            <T x={cx + dx * (R + 14)} y={cy + dy * (R + 14) + (dy < 0 ? 0 : dy > 0 ? 7 : 3) - (dy ? 0 : 6)} anchor="middle" k size={10}>{k}</T>
            <T x={cx + dx * (R + 14)} y={cy + dy * (R + 14) + (dy < 0 ? -11 : dy > 0 ? 18 : 3) + (dy ? 0 : 6)} anchor="middle" size={9}>{f.text}</T>
          </g>
        )
      })}
    </svg>
  )
}

/** Horizontal bars with a target tick (viz.js hbars). */
function HBars({ rows, label, unit }: { rows: { label: string; v: number; mark?: number; color: string; text: string }[]; label: string; unit?: string }) {
  const W = 260, L = 40, Rr = 92, rh = 24, H = rows.length * rh + 6, pw = W - L - Rr
  const max = Math.max(1e-9, ...rows.map((r) => Math.max(r.v, r.mark ?? 0))) * 1.08
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="w-full">
      {rows.map((r, i) => {
        const y = i * rh, w = (pw * r.v) / max
        return (
          <g key={r.label}>
            <T x={L - 6} y={y + rh / 2 + 3} anchor="end" k>{r.label}</T>
            <rect x={L} y={y + 4} width={pw} height={rh - 8} rx={2} fill={GRID} />
            <rect x={L} y={y + 4} width={Math.max(0, w)} height={rh - 8} rx={2} fill={r.color}><title>{`${r.label}: ${r.text}${unit ? ` ${unit}` : ''}`}</title></rect>
            {r.mark != null && <line x1={L + (pw * r.mark) / max} x2={L + (pw * r.mark) / max} y1={y + 1} y2={y + rh - 1} stroke={INK} strokeWidth={1.5} />}
            <T x={L + pw + 6} y={y + rh / 2 + 3}>{r.text}</T>
          </g>
        )
      })}
    </svg>
  )
}

/** One 100 % bar split into parts, with a key under it (viz.js stack). */
function Stack({ parts, label }: { parts: { name: string; v: number; color: string }[]; label: string }) {
  const tot = parts.reduce((s, p) => s + p.v, 0) || 1
  return (
    <div className="grid gap-1.5">
      <div role="img" aria-label={label} className="flex h-5 w-full overflow-hidden rounded">
        {parts.filter((p) => p.v > 0).map((p) => (
          <div key={p.name} title={`${p.name}: ${Math.round((p.v / tot) * 100)}%`} className="flex items-center justify-center text-[10px] font-medium text-white" style={{ width: `${(p.v / tot) * 100}%`, background: p.color }}>
            {p.v / tot > 0.08 ? `${Math.round((p.v / tot) * 100)}%` : ''}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-meta text-muted">
        {parts.map((p) => <span key={p.name} className="flex items-center gap-1"><i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: p.color }} />{p.name}</span>)}
      </div>
    </div>
  )
}

/** Sun paths at the solstices and equinox, altitude inward, with the sun at the date and hour shown (study.js sunPathSVG). */
function SunPath({ month, day, hour }: { month: number; day: number; hour: number }) {
  const R = 84, cx = 100, cy = 100
  const pt = (alt: number, az: number) => { const r = R * (1 - alt / 90), a = (az * Math.PI) / 180; return [cx + r * Math.sin(a), cy - r * Math.cos(a)] }
  const path = (m: number, d: number) => {
    const out: string[] = []
    for (let h = 3; h <= 22; h += 0.25) { const p = sunPosition(vancouverTime(m, d, h)); if (p.altitude > 0) out.push(pt(p.altitude, p.azimuth).map((v) => v.toFixed(1)).join(',')) }
    return out.length ? `M${out.join('L')}` : ''
  }
  const now = sunPosition(vancouverTime(month, day, hour))
  const q = now.altitude > 0 ? pt(now.altitude, now.azimuth) : null
  return (
    <svg viewBox="0 0 200 200" role="img" aria-label="Sun paths over the year with the sun at the hour shown" className="w-full">
      {[0, 30, 60].map((a) => <circle key={a} cx={cx} cy={cy} r={R * (1 - a / 90)} fill="none" stroke={LINE} />)}
      <line x1={cx - R} x2={cx + R} y1={cy} y2={cy} stroke={LINE} /><line x1={cx} x2={cx} y1={cy - R} y2={cy + R} stroke={LINE} />
      <T x={cx} y={cy - R - 4} anchor="middle" k>N</T><T x={cx + R + 4} y={cy + 3}>E</T><T x={cx} y={cy + R + 10} anchor="middle">S</T><T x={cx - R - 4} y={cy + 3} anchor="end">W</T>
      <T x={cx + 2} y={cy - R * (1 - 30 / 90) - 2} size={7.5}>30°</T><T x={cx + 2} y={cy - R * (1 - 60 / 90) - 2} size={7.5}>60°</T>
      {[[6, 21, 'Jun 21'], [3, 20, 'Mar / Sep'], [12, 21, 'Dec 21']].map(([m, d]) => <path key={String(m)} d={path(m as number, d as number)} fill="none" stroke={MUTED} strokeOpacity={0.6} />)}
      <path d={path(month, day)} fill="none" stroke={SUN} strokeWidth={1.8} />
      {[6, 8, 10, 12, 14, 16, 18, 20].map((h) => { const p = sunPosition(vancouverTime(month, day, h)); if (p.altitude <= 0) return null; const [x, y] = pt(p.altitude, p.azimuth); return <T key={h} x={x} y={y - 4} anchor="middle" size={7.5}>{h}</T> })}
      {q && <circle cx={q[0]} cy={q[1]} r={4.5} fill={SUN} stroke="#fff" strokeWidth={1.5} />}
    </svg>
  )
}

/** Twelve dials: where most of each month's rain comes from, and the month's rain under it (rain.js monthsSVG). */
function RainMonths({ months }: { months: { n: string; mm: number; top: { name: string; dir: number; f: number } | null }[] }) {
  const W = 290, cw = W / 12, r = 9, cy = 25, bar0 = cy + r + 16, bh = 30, H = bar0 + bh + 12
  const max = Math.max(1, ...months.map((m) => m.mm))
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Rain direction and amount by month" className="w-full">
      {months.map((m, k) => {
        const cx = cw * k + cw / 2, h = (bh * m.mm) / max
        let arrow: ReactNode = null
        if (m.top) {
          const a = (m.top.dir * Math.PI) / 180, ux = -Math.sin(a), uy = Math.cos(a), px = Math.cos(a), py = Math.sin(a)
          const x0 = cx - r * ux, y0 = cy - r * uy, tx = cx + 5 * ux, ty = cy + 5 * uy, bx = tx - 5 * ux, by = ty - 5 * uy
          arrow = <><line x1={x0} y1={y0} x2={bx} y2={by} stroke={RAIN} strokeWidth={2} /><path d={`M${tx},${ty}L${bx + 3 * px},${by + 3 * py}L${bx - 3 * px},${by - 3 * py}Z`} fill={RAIN} /><T x={cx} y={cy + r + 10} anchor="middle" k size={7.5}>{m.top.name}</T></>
        }
        return (
          <g key={k}>
            <title>{`${m.n} · ${Math.round(m.mm)} mm${m.top ? ` · mostly ${m.top.name} (${Math.round(m.top.f * 100)}%)` : ''}`}</title>
            <T x={cx} y={9} anchor="middle" size={7.5}>{m.n}</T>
            <circle cx={cx} cy={cy} r={r} fill="none" stroke={LINE} />{arrow}
            <rect x={cx - cw * 0.3} y={bar0 + bh - h} width={cw * 0.6} height={h} rx={1.5} fill={RAIN} fillOpacity={0.35} />
            <T x={cx} y={H - 1} anchor="middle" size={7}>{Math.round(m.mm)}</T>
          </g>
        )
      })}
    </svg>
  )
}

// ------------------------------------------------------------------ helpers over the design
const ORI = ['N', 'E', 'S', 'W'] as const
const oriOf = (az: number) => ORI[Math.round((((az % 360) + 360) % 360) / 90) % 4]
/** Area-weighted mean of a value per compass face. */
function byFace(faces: { az: number; area: number; value: number }[]) {
  const acc: Record<string, { a: number; v: number }> = {}
  for (const f of faces) { const o = oriOf(f.az); (acc[o] ??= { a: 0, v: 0 }); acc[o].a += f.area; acc[o].v += f.area * f.value }
  return Object.fromEntries(Object.entries(acc).map(([o, x]) => [o, x.a ? x.v / x.a : 0])) as Partial<Record<(typeof ORI)[number], number>>
}
const prismsOf = (t: Tower) => towerOccluders([t]).prisms as Prism[]
const ramp = (stops: string[], t: number) => stops[Math.max(0, Math.min(stops.length - 1, Math.round(t * (stops.length - 1))))]

function Fig({ title, caption, children, sheet = true }: { title: string; caption: string; children: ReactNode; sheet?: boolean }) {
  const ref = useRef<HTMLElement>(null)
  return (
    <figure ref={ref} className="m-0 grid gap-1">
      <figcaption className="flex items-center justify-between gap-2 text-meta font-semibold text-ink">{title}
        {sheet && <SheetButton compact label={title} make={async () => {
          const svgs = Array.from(ref.current?.querySelectorAll('svg') ?? []).filter((s) => s.viewBox.baseVal?.width && !s.closest('button')) as SVGSVGElement[]
          return svgs.length ? svgImage(svgs, title, caption) : null
        }} />}
      </figcaption>
      {children}
      <p className="text-meta leading-snug text-muted">{caption}</p>
    </figure>
  )
}

// ------------------------------------------------------------------ the four studies
function SunDrawings({ C, towers, north }: { C: ClimatePayload; towers: Tower[]; north: number }) {
  const sun = useStore((s) => s.sun)
  const [faces, setFaces] = useState<ReturnType<typeof byFace> | null>(null)
  useEffect(() => {
    setFaces(null)
    const id = setTimeout(() => {
      const blocks = towers.flatMap((t) => prismsOf(t).map((p) => ({ towerId: t.id, ring: p.ring, z0: p.z0, z1: p.z1 })))
      setFaces(blocks.length ? byFace(facadeIrradiance(blocks, [], C, north)) : {})
    }, 30)
    return () => clearTimeout(id)
  }, [towers, C, north])
  const now = sunPosition(vancouverTime(sun.month, sun.day, sun.hour))
  const STOPS = ['#d9e2ec', '#f1dca7', '#e9b562', '#c9822b']
  return (
    <>
      <Fig title="Sun path" caption={`Paths at the solstices and equinox (grey), the day shown in amber, altitude inward. At ${Math.floor(sun.hour)}:${String(Math.round((sun.hour % 1) * 60)).padStart(2, '0')} the sun is ${now.altitude > 0 ? `${now.altitude.toFixed(0)}° high, ${now.azimuth.toFixed(0)}° from north` : 'below the horizon'}.`}>
        <div className="mx-auto w-full max-w-[15rem]"><SunPath month={sun.month} day={sun.day} hour={sun.hour} /></div>
      </Fig>
      {towers.length > 0 && (
        <Fig title="Sun on each face · kWh/m² a year" caption="Annual sun on the towers' faces (Perez sky, beam shaded by the towers' own blocks; neighbours not counted). Bar length and colour: the area-weighted mean of each compass face.">
          {faces ? <div className="mx-auto w-full max-w-[15rem]"><Compass label="Annual sun on each face" faces={Object.fromEntries(Object.entries(faces).map(([o, v]) => [o, { v: v!, color: ramp(STOPS, (v! - 200) / 600), text: `${Math.round(v!)}` }]))} /></div> : <p className="text-meta text-muted">Working…</p>}
        </Fig>
      )}
    </>
  )
}

function WindDrawings({ C }: { C: ClimatePayload }) {
  const seasons: Season[] = ['winter', 'spring', 'summer', 'fall']
  const year = useMemo(() => windRose(C, 'year'), [C])
  const each = useMemo(() => seasons.map((s) => ({ s, r: windRose(C, s) })), [C]) // eslint-disable-line react-hooks/exhaustive-deps
  const top = [...year.sectors].sort((a, b) => b.f - a.f).slice(0, 2)
  return (
    <>
      <Fig title="Wind rose · the year" caption={`Petal length: share of the hours from each direction; depth of colour: mean speed at 10 m. Mostly ${top.map((r) => `${r.name} ${Math.round(r.f * 100)}%`).join(', ')}; ${Math.round((year.calm / Math.max(1, year.hours)) * 100)}% calm.`}>
        <div className="mx-auto w-full max-w-[15rem]"><Rose label="Wind rose for the year" color={WIND} sectors={year.sectors.map((r) => ({ name: r.name, dir: r.dir, f: r.f, s: r.s }))} /></div>
      </Fig>
      <Fig title="By season" caption="The same rose for each season (CWEC 2020, Vancouver Intl AP).">
        <div className="grid grid-cols-2 gap-1">
          {each.map(({ s, r }) => (
            <div key={s} className="text-center"><Rose size={150} label={`Wind rose, ${SEASONS[s].label}`} color={WIND} sectors={r.sectors.map((x) => ({ name: x.name, dir: x.dir, f: x.f, s: x.s }))} /><span className="text-meta text-muted">{SEASONS[s].label}</span></div>
          ))}
        </div>
      </Fig>
    </>
  )
}

function RainDrawings({ C, towers, north }: { C: ClimatePayload; towers: Tower[]; north: number }) {
  const A = useMemo(() => rainBySector(C, keepFor(C, 'year')), [C])
  const months = useMemo(() => {
    const mo = monthOfHour(C.days)
    return C.months.map((n, m) => { const x = rainBySector(C, (i) => mo[i] === m); return { n: n.slice(0, 1), mm: x?.tot ?? 0, top: x?.ranked[0] ?? null } })
  }, [C])
  const rt: RainTower[] = useMemo(() => towers.map((t) => ({ id: t.id, name: t.name, height: Math.max(...prismsOf(t).map((p) => p.z1), 0), blocks: prismsOf(t) })), [towers])
  const faces = useMemo(() => (rt.length ? byFace(facadeRain(rt, north, wdrBins(C, keepFor(C, 'year')))) : {}), [rt, north, C])
  const roof = useMemo(() => (rt.length ? roofCollect(rt, hourlyRain(C).reduce((a, b) => a + b, 0), 0.8) : null), [rt, C])
  if (!A) return <p className="text-meta text-muted">The climate file has no hourly rain.</p>
  const [a, b] = A.ranked
  const BAND = ['#dfe9f1', '#a9c6dc', '#6f9cc0', '#3f6f98']
  return (
    <>
      <Fig title="Where the rain comes from" caption={`Petal length: share of the year's rain arriving on winds from each direction; colour: mean wind while it rains. Mostly ${a.name} ${Math.round(a.f * 100)}%, then ${b.name} ${Math.round(b.f * 100)}%. ${Math.round(A.tot)} mm a year.`}>
        <div className="mx-auto w-full max-w-[15rem]"><Rose label="Rain by wind direction" color={RAIN} sectors={A.sec.map((x) => ({ name: x.dir % 45 ? '' : x.name, dir: x.dir, f: x.f, s: x.s, text: `${x.name} · ${Math.round(x.f * 100)}% of the rain (${Math.round(x.mm)} mm)` }))} /></div>
      </Fig>
      <Fig title="By month" caption="Arrow: where most of each month's rain comes from. Bar: the month's rain in mm.">
        <RainMonths months={months} />
      </Fig>
      {towers.length > 0 && (
        <Fig title="Driving rain on each face · airfield index" caption="Annual wind-driven rain index of each compass face (BS 8104 bands: sheltered, moderate, severe, very severe), area-weighted.">
          <div className="mx-auto w-full max-w-[15rem]"><Compass label="Driving rain by face" faces={Object.fromEntries(Object.entries(faces).map(([o, v]) => [o, { v: v!, color: BAND[Math.min(3, Math.floor(v! / 4 / 33))] ?? BAND[0], text: `${Math.round(v!)}` }]))} /></div>
        </Fig>
      )}
      {roof && roof.area > 0 && (
        <Fig sheet={false} title="Roof water" caption="Collected = roof and terrace area × the year's rain × 80% run-off (Sun & Wind Studio's rule).">
          <p className="text-control text-ink"><b>{Math.round(roof.annual).toLocaleString()} m³</b> a year from {Math.round(roof.area).toLocaleString()} m² of roof and terraces</p>
        </Fig>
      )}
    </>
  )
}

function EnergyDrawings({ C, towers, north }: { C: ClimatePayload; towers: Tower[]; north: number }) {
  const [r, setR] = useState<EnergyResult | null>(null)
  useEffect(() => {
    setR(null)
    const id = setTimeout(() => {
      const floors: EnergyFloor[] = towers.flatMap((t) => floorPlates(t).map(({ f, rings }) => ({ z0: f.z0, z1: f.z1, area: f.area, use: f.use, ring: rings[0] })))
      try { setR(floors.length ? energyModel(floors, C, ENERGY_DEFAULTS, { northDeg: north }) : null) } catch { setR(null) }
    }, 30)
    return () => clearTimeout(id)
  }, [towers, C, north])
  if (!towers.length) return null
  if (!r) return <p className="text-meta text-muted">Working…</p>
  const ok = (v: number, t: number) => (v <= t ? '#2f855a' : v <= t * 1.15 ? '#c27c0e' : '#c53030')
  const sum = (k: 'heat' | 'cool' | 'light' | 'equip' | 'dhw' | 'aux') => r.zones.reduce((s, z) => s + z[k], 0)
  return (
    <>
      <Fig title="Against the Vancouver targets" caption="The ISO 13790 hourly model of Sun & Wind Studio (5R1C per zone, its default envelope and systems: a team assumption). Tick: the program-weighted target.">
        <HBars label="TEUI, TEDI and GHGI against targets" rows={[
          { label: 'TEUI', v: r.teui, mark: r.tgt.teui, color: ok(r.teui, r.tgt.teui), text: `${Math.round(r.teui)} / ${Math.round(r.tgt.teui)} kWh/m²` },
          { label: 'TEDI', v: r.tedi, mark: r.tgt.tedi, color: ok(r.tedi, r.tgt.tedi), text: `${Math.round(r.tedi)} / ${Math.round(r.tgt.tedi)} kWh/m²` },
          { label: 'GHGI', v: r.ghgi, mark: r.tgt.ghgi, color: ok(r.ghgi, r.tgt.ghgi), text: `${r.ghgi.toFixed(1)} / ${r.tgt.ghgi.toFixed(1)} kg/m²` },
        ]} />
      </Fig>
      <Fig sheet={false} title="Where the energy goes" caption={`${Math.round(r.total / 1000).toLocaleString()} MWh a year over ${Math.round(r.gfa).toLocaleString()} m²; peaks ${Math.round(r.peakH)} W/m² heating, ${Math.round(r.peakC)} W/m² cooling.`}>
        <Stack label="Energy by end use" parts={[
          { name: 'Heating', v: sum('heat'), color: '#c2410c' }, { name: 'Cooling', v: sum('cool'), color: '#2563eb' }, { name: 'Lighting', v: sum('light'), color: '#eab308' },
          { name: 'Equipment', v: sum('equip'), color: '#64748b' }, { name: 'Hot water', v: sum('dhw'), color: '#db2777' }, { name: 'Fans, pumps', v: sum('aux'), color: '#0d9488' },
        ]} />
      </Fig>
    </>
  )
}

/** The drawings for the check picked in the results (none for other checks). */
export default function ClimateDrawings() {
  const node = useStore((s) => s.selectedNode)
  const kind = climateKind(node)
  const C = useClimate()
  const towers = useTowers()
  const { project } = useStore(useShallow((s) => ({ project: s.project })))
  const north = project === 'vtc' ? VTC_NORTH_DEG : 0
  if (!kind) return null
  return (
    <section aria-label="Analysis drawings" data-testid="climate-drawings" data-kind={kind} className="grid gap-3 border-b border-line px-4 py-3">
      <h3 className="text-control font-semibold text-ink">Analysis drawings <span className="font-normal text-muted">· Sun &amp; Wind Studio</span></h3>
      {!C ? <p className="text-meta text-muted">Loading the climate file…</p>
        : kind === 'sun' ? <SunDrawings C={C} towers={towers} north={north} />
          : kind === 'wind' ? <WindDrawings C={C} />
            : kind === 'rain' ? <RainDrawings C={C} towers={towers} north={north} />
              : <EnergyDrawings C={C} towers={towers} north={north} />}
      <p className="text-meta text-muted">Climate: CWEC 2020 typical year, Vancouver Intl AP.</p>
    </section>
  )
}
