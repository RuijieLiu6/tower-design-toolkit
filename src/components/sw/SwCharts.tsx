// The figure kit of the Sun & Wind Studio tools, after the Studio's viz.js and study.js: year maps (day × hour), bars by
// floor, 100% stacks, bars with a target tick, monthly charts, a line chart, a gauge, a radar and a face × floor map.
// Every figure is one SVG with a label for screen readers and hover text on its marks; words stay in the hover text.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Section } from '../ui'

export const INK = '#1f2328', MUTED = '#6b7280', GRID = '#eef0f3', LINE = '#e5e7eb'
export const FACE_C = { N: '#5B7FA6', E: '#D9A441', S: '#D06A4B', W: '#8C5B90' } as const
export const SUN_C = '#E09A2C', WIND_C = '#1F8A8A', RAIN_C = '#2F6FA8', PV_C = '#1F3A5F', OK_C = '#1F7A4D', BAD_C = '#B3362B', WARN_C = '#c27c0e'
export const MONTH_L = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']
export const MONTH_N = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
const FONT = 'inherit'
export const fmtI = (v: number) => Math.round(v).toLocaleString()
const clamp01 = (v: number) => Math.max(0, Math.min(1, v))

export function Tx({ x, y, children, anchor = 'start', k = false, size = 9.5, fill }: { x: number; y: number; children: ReactNode; anchor?: 'start' | 'middle' | 'end'; k?: boolean; size?: number; fill?: string }) {
  return <text x={x} y={y} textAnchor={anchor} fontSize={size} fill={fill ?? (k ? INK : MUTED)} fontFamily={FONT}>{children}</text>
}

/** Colour ramps: stops of [value, [r, g, b]]. */
export type RGB = [number, number, number]
export const ramp = (stops: [number, RGB][]) => (v: number): RGB => {
  if (!(v > stops[0][0])) return stops[0][1]
  for (let i = 1; i < stops.length; i++) if (v <= stops[i][0]) { const t = (v - stops[i - 1][0]) / (stops[i][0] - stops[i - 1][0]); return stops[i - 1][1].map((a, j) => Math.round(a + (stops[i][1][j] - a) * t)) as RGB }
  return stops[stops.length - 1][1]
}
const css = (c: RGB) => `rgb(${c[0]},${c[1]},${c[2]})`
/** The Studio's ramps: daylight autonomy, direct sun, blinds, windows open, indoor temperature, heating and cooling load, sun hours. */
export const RAMP = {
  da: ramp([[0, [44, 62, 96]], [0.5, [150, 170, 190]], [1, [240, 196, 92]]]),
  sun: ramp([[0, [253, 246, 228]], [0.3, [200, 55, 45]]]),
  grey: ramp([[0, [238, 240, 243]], [1, [52, 62, 74]]]),
  open: ramp([[0, [243, 244, 246]], [0.02, [215, 232, 234]], [1, [46, 140, 150]]]),
  temp: ramp([[14, [62, 111, 176]], [18, [156, 195, 228]], [22, [134, 190, 126]], [26, [240, 179, 87]], [30, [210, 73, 58]]]),
  heat: ramp([[0, [246, 243, 240]], [1, [194, 65, 12]]]),
  cool: ramp([[0, [240, 244, 248]], [1, [37, 99, 235]]]),
  hours: ramp([[0, [236, 239, 243]], [0.33, [242, 205, 120]], [0.66, [224, 154, 44]], [1, [122, 46, 142]]]),
  kwh: ramp([[0, [244, 240, 232]], [1, [208, 139, 44]]]),
}

/** Children only once the folded section they sit in has been opened (heavy figures stay off the first paint). */
export function WhenOpen({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const d = ref.current?.closest('details')
    if (!d) { setOpen(true); return }
    const on = () => { if (d.open) setOpen(true) }
    on(); d.addEventListener('toggle', on)
    return () => d.removeEventListener('toggle', on)
  }, [])
  return <div ref={ref} className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3">{open ? children : null}</div>
}

/** A folded section inside the results panel: secondary figures the reader opens when wanted. */
export function Fold({ title, children }: { title: string; children: ReactNode }) {
  return <div className="-mx-4 border-t border-line last:-mb-3 [&+&]:-mt-3 [&>details]:border-b-0" data-testid="sw-fold"><Section title={title} folded><WhenOpen>{children}</WhenOpen></Section></div>
}

/** A key of colour chips under a figure. */
export function Chips({ items }: { items: { name: string; color: string }[] }) {
  return <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-meta text-muted">{items.map((p) => <span key={p.name} className="flex items-center gap-1"><i className="inline-block h-2 w-2 rounded-sm" style={{ background: p.color }} />{p.name}</span>)}</div>
}

/**
 * A map of values on a grid drawn as one image (the Studio's temporal maps and carpets): `values` row by row, NaN for
 * no reading. With 365 columns the months are lettered under it. The reading under the pointer shows at the top right.
 */
export function HeatMap({ cols, rows, values, color, label, title, rowTicks, colTicks, cell, legend, read, height = 56, months = cols === 365, left = 22 }: {
  cols: number; rows: number; values: ArrayLike<number>; color: (v: number) => RGB; label: string; title?: string
  rowTicks: [number, string][]; colTicks?: [number, string][]; cell?: (c: number, r: number) => string; legend: [number, string][]; read: (v: number) => string; height?: number; months?: boolean; left?: number
}) {
  const W = 300, L = left, R = 46, T = 12, B = months || colTicks ? 11 : 2, mw = W - L - R, H = T + height + B
  const url = useMemo(() => {
    if (typeof document === 'undefined') return ''
    const cv = document.createElement('canvas'); cv.width = cols; cv.height = rows
    const ctx = cv.getContext('2d'); if (!ctx) return ''
    const img = ctx.createImageData(cols, rows), D = img.data
    for (let i = 0; i < cols * rows; i++) { const v = values[i]; if (v !== v) continue; const c = color(v); D[i * 4] = c[0]; D[i * 4 + 1] = c[1]; D[i * 4 + 2] = c[2]; D[i * 4 + 3] = 255 }
    ctx.putImageData(img, 0, 0)
    return cv.toDataURL('image/png')
  }, [cols, rows, values, color])
  const [at, setAt] = useState<string>('')
  const lo = legend[0][0], hi = legend[legend.length - 1][0]
  const when = (c: number, r: number) => {
    if (cell) return cell(c, r)
    if (cols === 365) { let m = 0, d = c; while (m < 11 && d >= DAYS[m]) { d -= DAYS[m]; m++ } return `${d + 1} ${MONTH_N[m]}` + (rows === 24 ? ` ${r}h` : rows === 10 ? ` ${r + 8}h` : '') }
    return ''
  }
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={label}>
      {title && <Tx x={L} y={8} k>{title}</Tx>}
      <Tx x={W - R} y={8} anchor="end" k>{at}</Tx>
      <rect x={L} y={T} width={mw} height={height} fill="#f3f4f6" />
      {url && <image href={url} x={L} y={T} width={mw} height={height} preserveAspectRatio="none" style={{ imageRendering: 'pixelated' }} />}
      <rect x={L} y={T} width={mw} height={height} fill="transparent"
        onMouseMove={(e) => { const b = e.currentTarget.getBoundingClientRect(); const c = Math.min(cols - 1, Math.max(0, Math.floor(((e.clientX - b.left) / b.width) * cols))), r = Math.min(rows - 1, Math.max(0, Math.floor(((e.clientY - b.top) / b.height) * rows))); const v = values[r * cols + c]; setAt(v === v ? `${when(c, r)} · ${read(v)}` : '') }}
        onMouseLeave={() => setAt('')}><title>{label}</title></rect>
      {rowTicks.map(([r, t]) => <Tx key={t} x={L - 3} y={T + ((r + 0.5) / rows) * height + 3} anchor="end" size={8.5}>{t}</Tx>)}
      {(colTicks ?? []).map(([c, t], i) => <Tx key={i} x={L + ((c + 0.5) / cols) * mw} y={H - 2} anchor="middle" size={8.5}>{t}</Tx>)}
      {months && MONTH_L.map((m, i) => <Tx key={i} x={L + (DAYS.slice(0, i).reduce((a, b) => a + b, 0) / 365) * mw + 1} y={H - 2} size={8.5}>{m}</Tx>)}
      {Array.from({ length: 16 }, (_, q) => <rect key={q} x={W - R + 6} y={T + (q * height) / 16} width={6} height={height / 16 + 0.2} fill={css(color(hi - ((hi - lo) * q) / 15))} />)}
      {legend.map(([v, t]) => <Tx key={t} x={W - R + 15} y={T + height * (1 - (v - lo) / (hi - lo || 1)) + (v === hi ? 6 : v === lo ? 0 : 3)} size={8.5}>{t}</Tx>)}
    </svg>
  )
}
/** A year of hourly values as a day × hour map (rows 0–23 h). */
export function YearMap({ hourly, scale = 1, ...p }: { hourly: ArrayLike<number>; /** multiplies each value; negative values read as no data */ scale?: number } & Omit<Parameters<typeof HeatMap>[0], 'cols' | 'rows' | 'values' | 'rowTicks'>) {
  const values = useMemo(() => { const v = new Float32Array(365 * 24); for (let d = 0; d < 365; d++) for (let h = 0; h < 24; h++) { const x = hourly[d * 24 + h]; v[h * 365 + d] = x < 0 ? NaN : x * scale } return v }, [hourly, scale])
  return <HeatMap cols={365} rows={24} values={values} rowTicks={[[0, '0h'], [6, '6h'], [12, '12h'], [18, '18h']]} height={72} {...p} />
}

/** Vertical bars by floor, each split into parts (study.js floorStack). */
export function FloorStack({ rows, colors, names, label }: { rows: { level: number; parts: number[] }[]; colors: string[]; names: string[]; label: string }) {
  const W = 300, H = 84, L = 26, B = 12, T = 4, n = Math.max(1, rows.length), bw = (W - L - 4) / n, ph = H - T - B
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={label}>
      {[0, 0.5, 1].map((t) => <g key={t}><line x1={L} x2={W - 4} y1={T + ph * (1 - t)} y2={T + ph * (1 - t)} stroke={GRID} /><Tx x={L - 3} y={T + ph * (1 - t) + 3} anchor="end" size={8.5}>{Math.round(t * 100)}%</Tx></g>)}
      {rows.map((r, i) => { let acc = 0; return r.parts.map((p, j) => { const v = Math.max(0, p), y = T + ph - (acc + v) * ph; acc += v; return <rect key={`${i}-${j}`} x={L + i * bw} y={y} width={Math.max(0.6, bw - 0.6)} height={Math.max(0, v * ph)} fill={colors[j]}><title>{`L${r.level} · ${names[j]}: ${Math.round(v * 100)}%`}</title></rect> }) })}
      <Tx x={L} y={H - 2} size={8.5}>L{rows[0]?.level ?? 1}</Tx><Tx x={W - 4} y={H - 2} anchor="end" size={8.5}>L{rows[rows.length - 1]?.level ?? 1}</Tx>
    </svg>
  )
}

/** Rows of 100% bars split into the same parts (viz.js stack). */
export function StackRows({ rows, colors, names, label, labelW = 84 }: { rows: { label: string; parts: number[]; text?: string }[]; colors: string[]; names: string[]; label: string; labelW?: number }) {
  const W = 300, rh = 17, L = labelW, pw = W - L - 4
  return (
    <svg viewBox={`0 0 ${W} ${rows.length * rh + 2}`} width="100%" role="img" aria-label={label}>
      {rows.map((r, i) => {
        const tot = r.parts.reduce((a, b) => a + Math.max(0, b), 0) || 1
        let acc = 0
        return (
          <g key={i} transform={`translate(0 ${i * rh + 2})`}>
            <Tx x={L - 4} y={10} anchor="end" k>{r.label}</Tx>
            {r.parts.map((p, j) => { const w = (Math.max(0, p) / tot) * pw, x = L + acc; acc += w; return w > 0 ? <g key={j}><rect x={x} y={1} width={w} height={12} fill={colors[j]}><title>{`${r.label} · ${names[j]}: ${Math.round((p / tot) * 100)}%${r.text ? ` · ${r.text}` : ''}`}</title></rect>{w > 20 && <text x={x + w / 2} y={10} textAnchor="middle" fontSize={8.5} fill="#fff" fontFamily={FONT} pointerEvents="none">{Math.round((p / tot) * 100)}%</text>}</g> : null })}
          </g>
        )
      })}
    </svg>
  )
}

/** Horizontal bars: a value, optionally a target tick (`mark`) or the same thing without (`v2`, dashed). */
export function BarRows({ rows, label, labelW = 86, textW = 70, max }: { rows: { label: string; v: number; v2?: number; mark?: number; color: string; text: string; tip?: string }[]; label: string; labelW?: number; textW?: number; max?: number }) {
  const W = 300, rh = 16, L = labelW, pw = W - L - textW - 6
  const mx = max ?? Math.max(1e-9, ...rows.map((r) => Math.max(r.v, r.v2 ?? 0, r.mark ?? 0))) * 1.05
  return (
    <svg viewBox={`0 0 ${W} ${rows.length * rh + 2}`} width="100%" role="img" aria-label={label}>
      {rows.map((r, i) => (
        <g key={i} transform={`translate(0 ${i * rh + 1})`}>
          <title>{r.tip ?? `${r.label}: ${r.text}`}</title>
          <Tx x={L - 4} y={10.5} anchor="end" k>{r.label}</Tx>
          <rect x={L} y={3} width={pw} height={9} rx={1.5} fill={GRID} />
          {r.v2 != null && <rect x={L} y={3} width={pw * clamp01(r.v2 / mx)} height={9} fill="none" stroke={r.color} strokeDasharray="2 1.5" strokeWidth={0.8} />}
          <rect x={L} y={3} width={pw * clamp01(r.v / mx)} height={9} rx={1.5} fill={r.color} />
          {r.mark != null && <line x1={L + pw * clamp01(r.mark / mx)} x2={L + pw * clamp01(r.mark / mx)} y1={1} y2={14} stroke={INK} strokeWidth={1.4} />}
          <Tx x={W - 2} y={10.5} anchor="end">{r.text}</Tx>
        </g>
      ))}
    </svg>
  )
}

/** Twelve months: stacked series, with an optional need marked as a tick on each month (rain.js rainChart, energy chartSVG). */
export function MonthStack({ series, need, label, unit, fmt = fmtI }: { series: { name: string; color: string; values: number[] }[]; need?: { name: string; color: string; values: number[] }; label: string; unit: string; fmt?: (v: number) => string }) {
  const W = 300, H = 98, L = 30, B = 12, T = 15, ph = H - T - B, bw = (W - L - 4) / 12
  const tot = Array.from({ length: 12 }, (_, m) => series.reduce((a, s) => a + Math.max(0, s.values[m]), 0))
  const raw = Math.max(1e-9, ...tot, ...(need?.values ?? []))
  const p10 = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p10, step = (f <= 1 ? 0.25 : f <= 2 ? 0.5 : f <= 5 ? 1 : 2.5) * p10, max = Math.ceil(raw / step) * step
  const y = (v: number) => T + ph * (1 - v / max)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={label}>
      <Tx x={L - 3} y={8} anchor="end" size={8.5}>{unit}</Tx>
      {Array.from({ length: Math.round(max / step) + 1 }, (_, i) => i * step).map((v) => <g key={v}><line x1={L} x2={W - 4} y1={y(v)} y2={y(v)} stroke={GRID} /><Tx x={L - 3} y={y(v) + 3} anchor="end" size={8.5}>{fmt(v)}</Tx></g>)}
      {Array.from({ length: 12 }, (_, m) => {
        let acc = 0
        return (
          <g key={m}>
            {series.map((s) => { const v = Math.max(0, s.values[m]), y1 = y(acc + v); acc += v; return <rect key={s.name} x={L + m * bw + 1.5} y={y1} width={bw - 3} height={Math.max(0, (v / max) * ph)} fill={s.color}><title>{`${MONTH_N[m]} · ${s.name}: ${fmt(v)} ${unit}`}</title></rect> })}
            {need && <line x1={L + m * bw + 0.5} x2={L + (m + 1) * bw - 0.5} y1={y(need.values[m])} y2={y(need.values[m])} stroke={need.color} strokeWidth={1.6}><title>{`${MONTH_N[m]} · ${need.name}: ${fmt(need.values[m])} ${unit}`}</title></line>}
            <Tx x={L + m * bw + bw / 2} y={H - 2} anchor="middle" size={8.5}>{MONTH_L[m]}</Tx>
          </g>
        )
      })}
    </svg>
  )
}

/** Monthly lowest, mean and highest of one thing (a bar from low to high, a dot at the mean) against a shaded band. */
export function MonthRange({ min, mean, max, band, label, unit, color = '#64748b' }: { min: number[]; mean: number[]; max: number[]; band?: [number, number]; label: string; unit: string; color?: string }) {
  const W = 300, H = 70, L = 24, B = 11, T = 4, ph = H - T - B, bw = (W - L - 4) / 12
  const lo = Math.floor(Math.min(...min, band?.[0] ?? Infinity) / 2) * 2, hi = Math.ceil(Math.max(...max, band?.[1] ?? -Infinity) / 2) * 2
  const y = (v: number) => T + ph * (1 - (v - lo) / (hi - lo || 1))
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={label}>
      {band && <rect x={L} y={y(band[1])} width={W - L - 4} height={y(band[0]) - y(band[1])} fill={OK_C} opacity={0.12}><title>{`${band[0]}–${band[1]} ${unit}`}</title></rect>}
      {[lo, (lo + hi) / 2, hi].map((v) => <g key={v}><line x1={L} x2={W - 4} y1={y(v)} y2={y(v)} stroke={GRID} /><Tx x={L - 3} y={y(v) + 3} anchor="end" size={8.5}>{Math.round(v)}°</Tx></g>)}
      {mean.map((v, m) => (
        <g key={m}>
          <title>{`${MONTH_N[m]}: ${min[m].toFixed(0)}–${max[m].toFixed(0)} ${unit}, mean ${v.toFixed(1)}`}</title>
          <rect x={L + m * bw + bw / 2 - 2.5} y={y(max[m])} width={5} height={Math.max(1, y(min[m]) - y(max[m]))} rx={2.5} fill={color} opacity={0.45} />
          <circle cx={L + m * bw + bw / 2} cy={y(v)} r={2.4} fill={INK} />
          <Tx x={L + m * bw + bw / 2} y={H - 2} anchor="middle" size={8.5}>{MONTH_L[m]}</Tx>
        </g>
      ))}
    </svg>
  )
}

/** Lines over two axes; `flip` puts the first value on x and the second on y (a height profile). */
export function LineChart({ series, xLabel, yLabel, label, marks, height = 120 }: { series: { name: string; color: string; dash?: boolean; pts: [number, number][]; read: (x: number, y: number) => string }[]; xLabel: string; yLabel: string; label: string; marks?: { y: number; label: string }[]; height?: number }) {
  const W = 300, H = height, L = 30, B = 20, T = 6, R = 8, pw = W - L - R, ph = H - T - B
  const xm = Math.max(1e-9, ...series.flatMap((s) => s.pts.map((p) => p[0]))) * 1.08, ym = Math.max(1e-9, ...series.flatMap((s) => s.pts.map((p) => p[1])))
  const X = (v: number) => L + (v / xm) * pw, Y = (v: number) => T + ph * (1 - v / ym)
  const step = (m: number) => { const p = Math.pow(10, Math.floor(Math.log10(m))), f = m / p; return (f <= 2 ? 0.5 : f <= 5 ? 1 : 2) * p }
  const xs = step(xm), ys = step(ym)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={label}>
      {Array.from({ length: Math.floor(ym / ys) + 1 }, (_, i) => i * ys).map((v) => <g key={v}><line x1={L} x2={W - R} y1={Y(v)} y2={Y(v)} stroke={GRID} /><Tx x={L - 3} y={Y(v) + 3} anchor="end" size={8.5}>{fmtI(v)}</Tx></g>)}
      {Array.from({ length: Math.floor(xm / xs) + 1 }, (_, i) => i * xs).map((v) => <Tx key={v} x={X(v)} y={H - B + 9} anchor="middle" size={8.5}>{fmtI(v)}</Tx>)}
      <Tx x={W - R} y={H - 2} anchor="end" size={8.5}>{xLabel}</Tx><Tx x={2} y={H - 2} size={8.5}>{yLabel}</Tx>
      {(marks ?? []).filter((m) => m.y < ym).map((m) => <g key={m.label}><line x1={L} x2={W - R} y1={Y(m.y)} y2={Y(m.y)} stroke={WARN_C} strokeDasharray="3 2" /><Tx x={W - R - 2} y={Y(m.y) - 2} anchor="end" size={8.5}>{m.label}</Tx></g>)}
      {series.map((s) => (
        <g key={s.name}>
          <path d={`M${s.pts.map((p) => `${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join('L')}`} fill="none" stroke={s.color} strokeWidth={1.6} strokeDasharray={s.dash ? '4 3' : undefined} />
          {s.pts.map((p, i) => <circle key={i} cx={X(p[0])} cy={Y(p[1])} r={s.dash ? 1.6 : 2.4} fill={s.color}><title>{`${s.name} · ${s.read(p[0], p[1])}`}</title></circle>)}
        </g>
      ))}
    </svg>
  )
}

/** A reading on a 0–1 scale with marked thresholds (viz.js gauge). */
export function Gauge({ v, marks, good, label, read }: { v: number; marks: { v: number; label: string }[]; good: 'high' | 'low'; label: string; read: string }) {
  const W = 300, L = 6, pw = W - 12, first = marks[0]?.v ?? 0.5
  const ok = good === 'high' ? v >= first : v <= first
  return (
    <svg viewBox={`0 0 ${W} 34`} width="100%" role="img" aria-label={label}>
      <rect x={L} y={6} width={pw} height={9} rx={2} fill={GRID} />
      <rect x={good === 'high' ? L + pw * first : L} y={6} width={good === 'high' ? pw * (1 - first) : pw * first} height={9} fill={OK_C} opacity={0.14} />
      <rect x={L} y={6} width={pw * clamp01(v)} height={9} rx={2} fill={ok ? OK_C : good === 'low' ? WARN_C : BAD_C}><title>{read}</title></rect>
      {marks.map((m) => <g key={m.label}><line x1={L + pw * m.v} x2={L + pw * m.v} y1={3} y2={18} stroke={INK} strokeWidth={1.2} /><Tx x={L + pw * m.v} y={28} anchor={m.v > 0.85 ? 'end' : m.v < 0.12 ? 'start' : 'middle'} size={8.5}>{m.label}</Tx></g>)}
    </svg>
  )
}

/** Radar of ratings (viz.js radar): the rim is the best rating. */
export function Radar({ items, color, label }: { items: { label: string; t: number; color: string; text: string }[]; color: string; label: string }) {
  const W = 300, H = 190, cx = W / 2, cy = H / 2 + 2, R = 62, n = items.length
  const pt = (i: number, t: number): [number, number] => { const a = (i / n) * 2 * Math.PI; return [cx + R * t * Math.sin(a), cy - R * t * Math.cos(a)] }
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={label}>
      {[0.25, 0.5, 0.75, 1].map((t) => <path key={t} d={`M${items.map((_, i) => pt(i, t).map((v) => v.toFixed(1)).join(',')).join('L')}Z`} fill="none" stroke={LINE} />)}
      {items.map((_, i) => { const [x, y] = pt(i, 1); return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke={LINE} /> })}
      <path d={`M${items.map((m, i) => pt(i, Math.max(0.06, m.t)).map((v) => v.toFixed(1)).join(',')).join('L')}Z`} fill={color} fillOpacity={0.22} stroke={color} strokeWidth={1.6} />
      {items.map((m, i) => { const [x, y] = pt(i, Math.max(0.06, m.t)), [lx, ly] = pt(i, 1.16); const s = Math.sin((i / n) * 2 * Math.PI); return <g key={i}><circle cx={x} cy={y} r={3} fill={m.color}><title>{`${m.label}: ${m.text}`}</title></circle><Tx x={lx} y={ly + 3} anchor={Math.abs(s) < 0.2 ? 'middle' : s > 0 ? 'start' : 'end'} size={8.5}>{m.label}</Tx></g> })}
    </svg>
  )
}

/** A value for each floor (rows, top floor first) and each column (viz.js facadeMap: unrolled elevations). */
export function FloorMatrix({ cols, levels, at, color, legend, read, label }: { cols: { key: string; label: string }[]; levels: number[]; at: (i: number, key: string) => number | null; color: (v: number) => RGB; legend: [number, string][]; read: (v: number) => string; label: string }) {
  const W = 300, L = 26, R = 42, T = 12, n = levels.length, rh = Math.max(1.4, Math.min(5, 150 / Math.max(1, n))), ph = n * rh, cw = (W - L - R) / cols.length
  const lo = legend[0][0], hi = legend[legend.length - 1][0]
  return (
    <svg viewBox={`0 0 ${W} ${T + ph + 4}`} width="100%" role="img" aria-label={label}>
      {cols.map((c, j) => <Tx key={c.key} x={L + j * cw + cw / 2} y={8} anchor="middle" k>{c.label}</Tx>)}
      {levels.map((lv, i) => cols.map((c, j) => { const v = at(i, c.key); return <rect key={`${i}-${j}`} x={L + j * cw + 1} y={T + (n - 1 - i) * rh} width={cw - 2} height={rh + 0.1} fill={v == null ? '#fafafa' : css(color(v))}><title>{`L${lv} · ${c.label}: ${v == null ? 'no face' : read(v)}`}</title></rect> }))}
      <Tx x={L - 3} y={T + 7} anchor="end" size={8.5}>L{levels[n - 1]}</Tx><Tx x={L - 3} y={T + ph} anchor="end" size={8.5}>L{levels[0]}</Tx>
      {Array.from({ length: 16 }, (_, q) => <rect key={q} x={W - R + 6} y={T + (q * Math.min(ph, 80)) / 16} width={6} height={Math.min(ph, 80) / 16 + 0.2} fill={css(color(hi - ((hi - lo) * q) / 15))} />)}
      {legend.map(([v, t]) => <Tx key={t} x={W - R + 15} y={T + Math.min(ph, 80) * (1 - (v - lo) / (hi - lo || 1)) + (v === hi ? 6 : v === lo ? 0 : 3)} size={8.5}>{t}</Tx>)}
    </svg>
  )
}

/** Small panels side by side, each with its own short name under it (one layer per drawing). */
export function Multiples({ children, cols = 2 }: { children: ReactNode; cols?: 2 | 3 | 4 }) {
  return <div className={`grid gap-1 ${cols === 4 ? 'grid-cols-4' : cols === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>{children}</div>
}
export function Panel({ name, children }: { name: string; children: ReactNode }) {
  return <div className="min-w-0 text-center">{children}<span className="block truncate text-meta text-muted">{name}</span></div>
}
export const cssRGB = css
