// Façade zones, drawn rather than listed (17 Nov 2026, Sinnie: "make this more visual"). A plan of the tower with its
// four faces: each face wears its strategy as a glyph and its glazing as a tint, and a click on a face opens its zone.
// Under it the unrolled elevation: one column per face, each zone a band from its first to its last level, later zones
// on top (they win where they overlap). The zone cards are compact: face · strategy (a picker of glyph tiles) · levels,
// then glass, SHGC and depth as three short sliders with their values, and the openable-windows switch as an icon.
import { useMemo, useState, type ReactNode } from 'react'
import { towerFloors } from '../../engine/massing'
import { DEFAULT_ZONES, FACE_NAME, ORI, STRATS, zonesOf, type Face, type FacadeZone, type StratId } from '../../engine/sw/plate'
import { useStore, useTowers } from '../../store'

const STRAT_IDS = Object.keys(STRATS) as StratId[]
const GLASS = (wwr: number) => `rgba(59, 127, 182, ${0.12 + 0.6 * Math.max(0, Math.min(1, wwr))})`
const INK = '#1f2328', DEV = '#0f766e', PV = '#1f3a5f', GREEN = '#3E8E7E'

/**
 * A strategy as a small drawing in a `w` × `h` box with the outside of the wall at the top: the glass as the tint,
 * the device as what it is (fins as uprights, an overhang or shelf as a bar, louvres as slats, balconies as a slab,
 * a double skin as a second line, PV and planting as a coloured spandrel, screens as a thin outer line).
 */
export function StratGlyph({ strat, wwr, w, h }: { strat: StratId; wwr: number; w: number; h: number }) {
  const s = Math.min(w, h), k = s / 24
  const items: ReactNode[] = [<rect key="g" x={0} y={0} width={w} height={h} fill={GLASS(wwr)} />]
  const bar = (y: number, t: number, c = DEV) => <rect key={`b${y}`} x={0} y={y} width={w} height={t} fill={c} />
  const uprights = (n: number) => Array.from({ length: n }, (_, i) => <rect key={`u${i}`} x={((i + 0.5) * w) / n - k} y={0} width={2 * k} height={h} fill={DEV} />)
  const slats = (n: number) => Array.from({ length: n }, (_, i) => <rect key={`s${i}`} x={0} y={((i + 0.5) * h) / n - k * 0.6} width={w} height={1.2 * k} fill={DEV} />)
  switch (strat) {
    case 'fins': items.push(...uprights(Math.max(2, Math.round(w / (8 * k))))); break
    case 'overhang': items.push(bar(0, 3.5 * k)); break
    case 'lightshelf': items.push(bar(h * 0.35, 2.5 * k)); break
    case 'louvres': items.push(...slats(Math.max(3, Math.round(h / (6 * k))))); break
    case 'eggcrate': items.push(...slats(Math.max(3, Math.round(h / (6 * k)))), ...uprights(Math.max(2, Math.round(w / (8 * k))))); break
    case 'balcony': items.push(bar(h - 4 * k, 4 * k, INK), <rect key="r" x={0} y={h - 9 * k} width={w} height={1.2 * k} fill={INK} />); break
    case 'punched': { const n = Math.max(2, Math.round(w / (8 * k))); items.length = 0; items.push(<rect key="w" x={0} y={0} width={w} height={h} fill="#cfd4da" />, ...Array.from({ length: n }, (_, i) => <rect key={`p${i}`} x={((i + 0.2) * w) / n} y={h * 0.25} width={(0.6 * w) / n} height={h * 0.5} fill={GLASS(0.9)} />)); break }
    case 'doubleskin': items.push(<rect key="d" x={1.5 * k} y={1.5 * k} width={w - 3 * k} height={h - 3 * k} fill="none" stroke={INK} strokeWidth={1.2 * k} />); break
    case 'pvspandrel': items.push(bar(h - 6 * k, 6 * k, PV)); break
    case 'greenwall': items.push(bar(h - 6 * k, 6 * k, GREEN)); break
    case 'windscreen': items.push(<rect key="s" x={0} y={0.5 * k} width={w} height={1.2 * k} fill="#1F8A8A" />); break
    default: break // curtain wall: the glass alone
  }
  return <>{items}</>
}

/** The plan: the plate with a band on each face; the face's winning zone (the last that covers it at mid-height) draws it. */
function PlanFaces({ zones, picked, onPick }: { zones: FacadeZone[]; picked: number | null; onPick: (i: number) => void }) {
  const S = 168, B = 22, P = 34, inner = S - 2 * P
  const winner = (f: Face) => { let w = -1; zones.forEach((z, i) => { if (z.face === 'all' || z.face === f) w = i }); return w }
  const face = (f: Face) => {
    const i = winner(f), z = i >= 0 ? zones[i] : null, on = i === picked
    // the band, drawn with the outside at the top, then turned to its side
    const rot = { N: 0, E: 90, S: 180, W: 270 }[f]
    return (
      <g key={f} transform={`rotate(${rot} ${S / 2} ${S / 2})`}>
        <g transform={`translate(${P} ${P - B})`} role="button" tabIndex={0} aria-label={`${FACE_NAME[f]} face${z ? `: ${STRATS[z.strat].name}` : ''}`} data-face={f} className="cursor-pointer outline-none"
          onClick={() => i >= 0 && onPick(i)} onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && i >= 0) { e.preventDefault(); onPick(i) } }}>
          {z ? <StratGlyph strat={z.strat} wwr={z.wwr} w={inner} h={B} /> : <rect width={inner} height={B} fill="#eef0f3" />}
          <rect width={inner} height={B} fill="none" stroke={on ? '#1f5f8b' : '#9aa3ad'} strokeWidth={on ? 2.5 : 1} />
        </g>
        <text x={S / 2} y={P - B - 5} textAnchor="middle" fontSize={10} fontWeight={600} fill={on ? '#1f5f8b' : '#5b6672'} transform={rot === 180 ? `rotate(180 ${S / 2} ${P - B - 8})` : rot === 90 || rot === 270 ? `rotate(${-rot} ${S / 2} ${P - B - 8})` : undefined}>{f}</text>
      </g>
    )
  }
  return (
    <svg viewBox={`0 0 ${S} ${S}`} className="mx-auto h-40 w-40" role="group" aria-label="The four faces of the tower: click one to open its zone">
      <rect x={P} y={P} width={inner} height={inner} fill="#ffffff" stroke={INK} strokeWidth={1.2} />
      <rect x={P + inner * 0.36} y={P + inner * 0.36} width={inner * 0.28} height={inner * 0.28} fill="#e5e9ee" />
      {ORI.map(face)}
    </svg>
  )
}

/** The unrolled elevation: four columns, levels bottom-up, each zone a band; later zones on top. */
function Elevations({ zones, levels, picked, onPick }: { zones: FacadeZone[]; levels: number; picked: number | null; onPick: (i: number) => void }) {
  const W = 240, H = 96, L = 18, colW = (W - L - 4) / 4, n = Math.max(1, levels)
  const y = (lv: number) => H - 12 - ((lv - 1) / n) * (H - 16)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="group" aria-label="Unrolled elevations: each zone's levels on each face">
      {ORI.map((f, c) => <g key={f}><rect x={L + c * colW + 2} y={y(n + 1)} width={colW - 4} height={y(1) - y(n + 1)} fill="#f3f4f6" stroke="#d5dbe1" strokeWidth={0.8} /><text x={L + c * colW + colW / 2} y={H - 2} textAnchor="middle" fontSize={8} fontWeight={600} fill="#5b6672">{f}</text></g>)}
      <text x={L - 3} y={y(1)} textAnchor="end" fontSize={7} fill="#6b7280">L1</text>
      <text x={L - 3} y={y(n + 1) + 6} textAnchor="end" fontSize={7} fill="#6b7280">L{n}</text>
      {zones.map((z, i) => ORI.filter((f) => z.face === 'all' || z.face === f).map((f) => {
        const c = ORI.indexOf(f), a = Math.max(1, Math.min(n, z.from)), b = Math.min(n, z.to >= 999 ? n : Math.max(a, z.to))
        const top = y(b + 1), bot = y(a), on = i === picked
        return (
          <g key={`${i}${f}`} transform={`translate(${L + c * colW + 2} ${top})`} role="button" tabIndex={0} aria-label={`Zone ${i + 1} on the ${FACE_NAME[f].toLowerCase()} face, levels ${a} to ${b}`} data-zone-band={i} className="cursor-pointer outline-none"
            onClick={() => onPick(i)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(i) } }}>
            <StratGlyph strat={z.strat} wwr={z.wwr} w={colW - 4} h={Math.max(2, bot - top)} />
            <rect width={colW - 4} height={Math.max(2, bot - top)} fill="none" stroke={on ? '#1f5f8b' : 'rgba(31,35,40,0.35)'} strokeWidth={on ? 2 : 0.8} />
          </g>
        )
      }))}
    </svg>
  )
}

function Mini({ name, value, min, max, step, fmt, onChange }: { name: string; value: number; min: number; max: number; step: number; fmt: (v: number) => string; onChange: (v: number) => void }) {
  return (
    <label className="grid min-w-0 gap-0.5">
      <span className="flex min-w-0 items-baseline justify-between gap-1 text-[10px] uppercase text-muted"><span className="min-w-0 truncate">{name}</span><b className="shrink-0 whitespace-nowrap font-mono text-[11px] normal-case tracking-normal text-ink">{fmt(value)}</b></span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} aria-label={name} className="w-full min-w-0 accent-accent" />
    </label>
  )
}

/** The strategy picker: a grid of glyph tiles. */
function StratPicker({ value, onPick }: { value: StratId; onPick: (s: StratId) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative min-w-0 flex-1">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-haspopup="listbox" aria-expanded={open} title={STRATS[value].blurb} data-strat-button
        className="flex h-8 w-full min-w-0 items-center gap-1.5 rounded-md border border-line bg-white px-1.5 text-control text-ink outline-none hover:border-accent focus-visible:ring-2 focus-visible:ring-accent">
        <svg viewBox="0 0 24 16" className="h-4 w-6 shrink-0 rounded-sm" aria-hidden><StratGlyph strat={value} wwr={STRATS[value].d.wwr} w={24} h={16} /></svg>
        <span className="min-w-0 flex-1 truncate text-left">{STRATS[value].name}</span>
        <span aria-hidden className="text-muted">▾</span>
      </button>
      {open && (
        <div role="listbox" aria-label="Façade strategy" className="absolute left-0 top-9 z-20 grid w-56 grid-cols-3 gap-1 rounded-lg border border-line bg-white p-1.5 shadow-lg">
          {STRAT_IDS.map((k) => (
            <button key={k} type="button" role="option" aria-selected={k === value} data-strat={k} title={`${STRATS[k].name}: ${STRATS[k].blurb}`} onClick={() => { onPick(k); setOpen(false) }}
              className={`grid justify-items-center gap-0.5 rounded-md border p-1 text-[10px] leading-tight text-ink outline-none hover:border-accent focus-visible:ring-2 focus-visible:ring-accent ${k === value ? 'border-accent bg-accent/10' : 'border-line'}`}>
              <svg viewBox="0 0 36 22" className="h-6 w-10 rounded-sm" aria-hidden><StratGlyph strat={k} wwr={STRATS[k].d.wwr} w={36} h={22} /></svg>
              <span className="w-full truncate text-center">{STRATS[k].name.replace('Horizontal ', '').replace('Vertical ', '').replace(' façade', '')}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function FacadeZonesTool() {
  const towers = useTowers()
  const selected = useStore((s) => s.selectedTower)
  const update = useStore((s) => s.updateTower)
  const t = towers.find((x) => x.id === selected) ?? towers[0]
  const [picked, setPicked] = useState<number | null>(null)
  const levels = useMemo(() => (t ? towerFloors(t).length : 0), [t])
  if (!t) return <p className="px-3 pb-3 text-meta text-muted">Place or draw a tower first.</p>
  const zones = zonesOf(t)
  const set = (z: FacadeZone[]) => update(t.id, { facadeZones: z })
  const patch = (i: number, p: Partial<FacadeZone>) => set(zones.map((z, k) => (k === i ? { ...z, ...p } : z)))
  const pick = (i: number) => { setPicked(i); document.querySelector<HTMLElement>(`[data-zone="${i}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }) }
  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2 px-3 pb-3" data-testid="facade-zones">
      <p className="text-meta text-muted">{t.name} · click a face or a band to open its zone; later zones win where they overlap.</p>
      <PlanFaces zones={zones} picked={picked} onPick={pick} />
      <Elevations zones={zones} levels={levels} picked={picked} onPick={pick} />
      {zones.map((z, i) => {
        const on = i === picked, dl = STRATS[z.strat].depthLabel
        return (
          <div key={i} role="group" aria-label={`Zone ${i + 1}`} data-zone={i} onFocus={() => setPicked(i)} className={`grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1.5 rounded-md border p-2 ${on ? 'border-accent ring-1 ring-accent/40' : 'border-line'}`}>
            <div className="flex items-center gap-1.5">
              <select value={z.face} onChange={(e) => patch(i, { face: e.target.value as FacadeZone['face'] })} className="h-8 w-[4.4rem] shrink-0 rounded-md border border-line bg-white px-1 text-control text-ink" aria-label="Face">
                <option value="all">All</option>{ORI.map((o) => <option key={o} value={o}>{FACE_NAME[o]}</option>)}
              </select>
              <StratPicker value={z.strat} onPick={(st) => patch(i, { strat: st, ...STRATS[st].d })} />
              <button type="button" onClick={() => { set(zones.filter((_, k) => k !== i)); setPicked(null) }} disabled={zones.length <= 1} className="h-8 w-6 shrink-0 rounded-md text-meta text-muted hover:bg-panel disabled:opacity-40" aria-label={`Remove zone ${i + 1}`}>×</button>
            </div>
            <div className="flex items-center gap-1.5 text-meta text-muted">
              <span>L</span><input type="number" min={1} value={z.from} onChange={(e) => patch(i, { from: Math.max(1, Number(e.target.value) || 1) })} className="h-7 w-12 rounded-md border border-line bg-white px-1 text-control text-ink" aria-label="From level" />
              <span>to</span><input type="number" min={1} value={z.to >= 999 ? '' : z.to} placeholder="top" onChange={(e) => patch(i, { to: e.target.value ? Math.max(1, Number(e.target.value)) : 999 })} className="h-7 w-12 rounded-md border border-line bg-white px-1 text-control text-ink" aria-label="To level" />
              <button type="button" role="switch" aria-checked={z.operable} aria-label="Windows open" title={z.operable ? 'Windows open: click to fix the glazing' : 'Fixed glazing: click to make the windows openable'} onClick={() => patch(i, { operable: !z.operable })}
                className={`ml-auto flex h-7 items-center gap-1 rounded-md border px-1.5 text-[11px] ${z.operable ? 'border-accent bg-accent/10 text-accent' : 'border-line text-muted'}`}>
                <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden><rect x="2" y="2" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.4" /><path d={z.operable ? 'M2 2 L10 5 L10 14 L2 11 Z' : 'M8 2 V14 M2 8 H14'} fill={z.operable ? 'currentColor' : 'none'} fillOpacity={0.35} stroke="currentColor" strokeWidth="1.2" /></svg>{z.operable ? 'open' : 'fixed'}
              </button>
            </div>
            <div className="grid gap-x-2 gap-y-1" style={{ gridTemplateColumns: `repeat(${z.strat === 'pvspandrel' ? 3 : dl ? 3 : 2}, minmax(0, 1fr))` }}>
              <Mini name="Glass" value={Math.round(z.wwr * 100)} min={10} max={95} step={1} fmt={(v) => `${v}%`} onChange={(v) => patch(i, { wwr: v / 100 })} />
              <Mini name="SHGC" value={z.shgc} min={0.15} max={0.7} step={0.05} fmt={(v) => v.toFixed(2)} onChange={(v) => patch(i, { shgc: v })} />
              {dl && <Mini name={dl.replace(' depth', '')} value={z.depth} min={0} max={3} step={0.1} fmt={(v) => `${v.toFixed(1)} m`} onChange={(v) => patch(i, { depth: v })} />}
              {z.strat === 'pvspandrel' && <Mini name="PV" value={Math.round(z.pv * 100)} min={0} max={100} step={5} fmt={(v) => `${v}%`} onChange={(v) => patch(i, { pv: v / 100 })} />}
            </div>
          </div>
        )
      })}
      <div className="flex gap-2">
        <button type="button" onClick={() => { set([...zones, { ...zones[zones.length - 1], face: 'all' }]); setPicked(zones.length) }} className="h-8 rounded-md border border-line px-2 text-control hover:border-accent" data-testid="zone-add">Add zone</button>
        <button type="button" onClick={() => { update(t.id, { facadeZones: undefined }); setPicked(null) }} className="h-8 rounded-md px-2 text-control text-muted hover:bg-panel" disabled={zones === DEFAULT_ZONES}>Studio defaults</button>
      </div>
    </div>
  )
}
