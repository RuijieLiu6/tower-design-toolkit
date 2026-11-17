// The program section (17 Nov 2026, Sinnie: "for the program AND program and FSR, the expandable window should be a
// perfect section view that looks and functions like the one in the sun wind studio"). The analysis view of the
// program checks (lib/analysisView.ts kind 'section') is a live building section, drawn the way the Studio's Section view
// draws one: the cut through every storey with the rooms coloured by use, a poché slab over each storey, poché end walls
// with the glazing, the core cut with its lift shafts crossed and the stair flights, grid bubbles with the bay
// dimensions, a level mark on each storey, the overall height, the city behind as grey silhouettes and the earth
// hatched. It works like the Studio's: a Program card (pick floors in the section, then a use; colour by program on or
// off), and a Section card with a key plan of the plate: the cut line drags across it, Flip turns the view round, E–W /
// N–S turn the cut. Wheel zooms, drag pans, double-click fits. It reads the same store as the model, so an edit there
// redraws the section at once, and a use set here is the model's (lib/floorPick.ts setPickedUse).
import { useEffect, useMemo, useRef, useState, type PointerEvent as RPE } from 'react'
import { USES, type UseId } from '../engine/types'
import { clearFloorPick, pickFloor, setPickedUse, useFloorPick } from '../lib/floorPick'
import { breakStep } from '../lib/project/history'
import { useDrawData } from './boards/useBoardData'
import { ArrowUpDown, ChevronDown } from './icons'

type Pt = [number, number]
type Dir = 'N' | 'S' | 'E' | 'W'
/** Looking direction → view vector and the screen's right-hand direction, in model metres (x east, y north). */
const VIEW: Record<Dir, { v: Pt; r: Pt; word: string }> = {
  N: { v: [0, 1], r: [1, 0], word: 'north' }, S: { v: [0, -1], r: [-1, 0], word: 'south' },
  W: { v: [-1, 0], r: [0, 1], word: 'west' }, E: { v: [1, 0], r: [0, -1], word: 'east' },
}
const dot = (a: Pt, b: Pt) => a[0] * b[0] + a[1] * b[1]
const USE_IDS = Object.keys(USES) as UseId[]
const ORANGE = '#e8622c'

/** Where a ring crosses the cut line, as runs along the screen's right-hand axis. */
function cutRuns(ring: Pt[], p0: Pt, v: Pt, r: Pt): [number, number][] {
  const xs: number[] = []
  ring.forEach((a, i) => {
    const b = ring[(i + 1) % ring.length], wa = dot([a[0] - p0[0], a[1] - p0[1]], v), wb = dot([b[0] - p0[0], b[1] - p0[1]], v)
    if ((wa < 0) !== (wb < 0)) { const s = wa / (wa - wb); xs.push(dot([a[0] + (b[0] - a[0]) * s - p0[0], a[1] + (b[1] - a[1]) * s - p0[1]], r)) }
  })
  xs.sort((a, b) => a - b)
  const out: [number, number][] = []
  for (let i = 0; i + 1 < xs.length; i += 2) if (xs[i + 1] - xs[i] > 0.05) out.push([xs[i], xs[i + 1]])
  return out
}
/** Column bays across a run: equal, about 8–9 m. */
function bays(a: number, b: number): number[] { const n = Math.max(1, Math.round((b - a) / 8.4)); return Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n) }

export default function ProgramSection() {
  const d = useDrawData()
  const pick = useFloorPick()
  const [dir, setDir] = useState<Dir>('N')
  const [off, setOff] = useState(0)
  const [colour, setColour] = useState(true)
  const [hover, setHover] = useState<string | null>(null)
  const [cardOpen, setCardOpen] = useState(true)
  const wrap = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 900, h: 700 })
  useEffect(() => {
    const el = wrap.current; if (!el) return
    const ro = new ResizeObserver(([e]) => setSize({ w: Math.max(200, e.contentRect.width), h: Math.max(200, e.contentRect.height) }))
    ro.observe(el); return () => ro.disconnect()
  }, [])

  const main = d.towers.length ? d.towers.reduce((m, t) => (Math.max(...t.prisms.map((p) => p.z1)) > Math.max(...m.prisms.map((p) => p.z1)) ? t : m), d.towers[0]) : null
  const all = main ? main.prisms.flatMap((p) => p.ring) : []
  const centre: Pt = all.length ? [all.reduce((a, p) => a + p[0], 0) / all.length, all.reduce((a, p) => a + p[1], 0) / all.length] : [0, 0]
  // Project axes: the tower's own grid (the longest side of its tallest part), so E–W runs along the tower, as the Studio's
  // section does; the key plan turns with it and its arrow shows true north.
  const theta = useMemo(() => {
    if (!main) return 0
    const ring = main.prisms.reduce((m, p) => (p.z1 - p.z0 > m.z1 - m.z0 ? p : m), main.prisms[0]).ring
    let best = 0, ang = 0
    ring.forEach((a, i) => { const b = ring[(i + 1) % ring.length], l = Math.hypot(b[0] - a[0], b[1] - a[1]); if (l > best) { best = l; ang = Math.atan2(b[1] - a[1], b[0] - a[0]) } })
    while (ang > Math.PI / 4) ang -= Math.PI / 2
    while (ang <= -Math.PI / 4) ang += Math.PI / 2
    return ang
  }, [main])
  const ax: Pt = [Math.cos(theta), Math.sin(theta)], bx: Pt = [-Math.sin(theta), Math.cos(theta)]
  const turn = (p: Pt): Pt => [p[0] * ax[0] + p[1] * bx[0], p[0] * ax[1] + p[1] * bx[1]]
  const base = VIEW[dir], v = turn(base.v), r = turn(base.r), word = base.word
  const normal: Pt = dir === 'N' || dir === 'S' ? bx : ax
  const p0: Pt = [centre[0] + normal[0] * off, centre[1] + normal[1] * off]
  const U = (p: Pt) => dot([p[0] - p0[0], p[1] - p0[1]], r), Wd = (p: Pt) => dot([p[0] - p0[0], p[1] - p0[1]], v)

  const g = useMemo(() => {
    if (!main) return null
    const top = Math.max(...d.towers.flatMap((t) => t.prisms.map((p) => p.z1)))
    const mu = main.prisms.flatMap((p) => p.ring.map(U))
    const ma = Math.min(...mu), mb = Math.max(...mu)
    // the cut through each storey of each tower
    const floors = d.towers.flatMap((t) => t.floors.map((fl) => ({ t, fl, runs: fl.rings.flatMap((ring) => cutRuns(ring, p0, v, r)) }))).filter((x) => x.runs.length)
    const cores = new Map(d.towers.map((t) => [t.id, t.core ? cutRuns(t.core, p0, v, r) : []]))
    // what is seen beyond the cut: the towers' parts and the city, nearest darkest
    const beyond = [
      ...d.context.map((o) => ({ ring: o.ring, z0: 0, z1: o.z1, own: false })),
      ...d.towers.flatMap((t) => t.prisms.map((p) => ({ ring: p.ring, z0: p.z0, z1: p.z1, own: true }))),
    ].map((o) => { const w = o.ring.map(Wd), uu = o.ring.map(U); return { ...o, w0: Math.max(0, Math.min(...w)), w1: Math.max(...w), a: Math.min(...uu), b: Math.max(...uu) } })
      .filter((o) => o.w1 > 0 && o.w0 < 420).sort((a, b) => b.w0 - a.w0)
    return { top, ma, mb, floors, cores, beyond }
  }, [d, main, dir, off, theta]) // eslint-disable-line react-hooks/exhaustive-deps

  // the camera: a viewBox in metres (x along the cut, y up as -z), fitted to the tower with room for the marks
  const fit = () => {
    if (!g) return { x: -100, y: -300, w: 200, h: 320 }
    // the drawing sits right of the cards when the view is wide enough for both
    const pad = size.w >= 760 ? 250 : 0, aw = size.w - pad
    const h = g.top + 40, wNeed = g.mb - g.ma + 150
    const mpp = Math.max(h / size.h, wNeed / aw)
    const w = size.w * mpp, hh = size.h * mpp
    return { x: (g.ma + g.mb) / 2 - (pad * mpp + aw * mpp / 2), y: -g.top - 22 - (hh - h) / 2, w, h: hh }
  }
  const [vb, setVb] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const fitKey = `${main?.id}:${dir}:${Math.round(g?.top ?? 0)}:${Math.round(size.w)}x${Math.round(size.h)}`
  useEffect(() => { setVb(null) }, [fitKey])
  const view = vb ?? fit()
  const k = view.w / size.w // metres per pixel
  const drag = useRef<{ x: number; y: number; vb: typeof view } | null>(null)
  const onWheel = (e: React.WheelEvent) => {
    const el = wrap.current; if (!el) return
    const b = el.getBoundingClientRect(), fx = (e.clientX - b.left) / b.width, fy = (e.clientY - b.top) / b.height
    const s = Math.exp(e.deltaY * 0.0012), w = view.w * s, h = view.h * s
    setVb({ x: view.x + (view.w - w) * fx, y: view.y + (view.h - h) * fy, w, h })
  }
  const onDown = (e: RPE) => { if (e.button !== 0 && e.button !== 1) return; drag.current = { x: e.clientX, y: e.clientY, vb: view } }
  const onMove = (e: RPE) => {
    const s = drag.current; if (!s) return
    const dx = e.clientX - s.x, dy = e.clientY - s.y
    if (Math.abs(dx) + Math.abs(dy) > 3) { (e.currentTarget as Element).setAttribute('data-panning', '1'); setVb({ ...s.vb, x: s.vb.x - dx * k, y: s.vb.y - dy * k }) }
  }
  const onUp = (e: RPE) => { drag.current = null; setTimeout(() => (e.currentTarget as Element | null)?.removeAttribute?.('data-panning'), 0) }

  if (!main || !g) return <p className="p-4 text-meta text-muted">Place a tower and its section appears here.</p>
  const Z = (z: number) => -z
  const px = (n: number) => n * k
  const picked = (tid: string, level: number) => pick.tower === tid && pick.levels.includes(level)
  const ink = '#1b1d21'
  const fs = px(10.5)
  // level marks: every storey that has room, always the ground, each change of use and the roof
  const lv = main.floors.map((fl) => ({ z: fl.z0, nm: `L${fl.level}`, key: fl.level === main.floors[0].level || main.floors.find((q) => q.z1 === fl.z0)?.use !== fl.use }))
  lv.push({ z: g.top, nm: 'Roof', key: true })
  let last = Infinity
  const shownLv = lv.filter((l) => { const y = l.z / k; if (!l.key && Math.abs(last - y) < 26) return false; last = y; return true })
  const gx = bays(g.ma, g.mb)
  const lx = g.mb + px(26)
  const over = g.top + 4.5
  const sel = pick.levels.length ? `${pick.levels.length > 1 ? `L${pick.levels[0]}–L${pick.levels[pick.levels.length - 1]}` : `L${pick.levels[0]}`} selected` : 'Click a floor in the section'
  const setUse = (u: UseId) => { if (!pick.levels.length) return; breakStep(); setPickedUse(u); breakStep() }

  return (
    <div ref={wrap} className="absolute inset-0 overflow-hidden bg-[#f4f5f7]" data-testid="program-section" onWheel={onWheel} onDoubleClick={() => setVb(null)}>
      <svg width={size.w} height={size.h} viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`} className="block cursor-grab touch-none select-none active:cursor-grabbing" data-testid="program-section-svg"
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={() => { drag.current = null; setHover(null) }} role="img" aria-label={`Section ${dir === 'N' || dir === 'S' ? 'A–A' : 'B–B'} through the tower, looking ${word}, rooms coloured by use`}>
        <defs>
          <pattern id="ps-earth" patternUnits="userSpaceOnUse" width={px(9)} height={px(9)} patternTransform="rotate(45)"><rect width={px(9)} height={px(9)} fill="#efe6d8" /><line x1={0} y1={0} x2={0} y2={px(9)} stroke="#b9a98f" strokeWidth={px(0.8)} /></pattern>
        </defs>
        {/* beyond the cut: the city and the towers' own parts, nearest darkest */}
        {g.beyond.map((o, i) => {
          const t = Math.min(1, o.w0 / 220)
          const fill = o.own ? '#dfe3ea' : `rgb(${Math.round(166 + 40 * t)},${Math.round(168 + 40 * t)},${Math.round(174 + 40 * t)})`
          return <rect key={i} x={o.a} y={Z(o.z1)} width={o.b - o.a} height={o.z1 - o.z0} fill={fill} fillOpacity={o.own ? 0.9 : 0.85} stroke={o.own ? '#aab1bc' : 'none'} strokeWidth={px(0.8)} />
        })}
        {/* the earth and the ground line */}
        <rect x={view.x - view.w} y={0} width={view.w * 3} height={view.h * 2} fill="url(#ps-earth)" />
        {/* the cut: rooms by use, partitions on the grid, slabs, end walls with glazing, the core */}
        {g.floors.map(({ t, fl, runs }) => {
          const id = `${t.id}:${fl.level}`, on = picked(t.id, fl.level), hv = hover === id
          const h = fl.z1 - fl.z0, sill = Math.min(0.9, h * 0.25), head = Math.min(0.6, h * 0.18)
          const core = g.cores.get(t.id) ?? []
          return (
            <g key={id} data-level={fl.level} onPointerEnter={() => setHover(id)} onPointerLeave={() => setHover((x) => (x === id ? null : x))}
              onClick={(e) => { if ((e.currentTarget.ownerSVGElement as Element | null)?.getAttribute('data-panning')) return; pickFloor(t.id, fl.level, e.shiftKey ? 'range' : e.ctrlKey || e.metaKey ? 'toggle' : 'one') }} className="cursor-pointer">
              {runs.map(([a, b], i) => (
                <g key={i}>
                  <rect x={a} y={Z(fl.z1)} width={b - a} height={h} fill={colour ? USES[fl.use].color : '#ffffff'} fillOpacity={colour ? (hv ? 0.55 : 0.32) : 1} />
                  {/* partitions on the column grid */}
                  {bays(a, b).slice(1, -1).map((x) => <line key={x} x1={x} x2={x} y1={Z(fl.z1)} y2={Z(fl.z0)} stroke="#6b7078" strokeWidth={0.7} vectorEffect="non-scaling-stroke" />)}
                  <rect x={a} y={Z(fl.z1) - 0.18} width={b - a} height={0.36} fill={ink} />
                  {([[a, 1], [b, -1]] as const).map(([x, s]) => (
                    <g key={s}>
                      <rect x={s > 0 ? x : x - 0.32} y={Z(fl.z0 + sill)} width={0.32} height={sill} fill={ink} />
                      <rect x={s > 0 ? x : x - 0.32} y={Z(fl.z1)} width={0.32} height={head} fill={ink} />
                      {[0.3, 0.7].map((o) => <line key={o} x1={x + s * 0.32 * o} x2={x + s * 0.32 * o} y1={Z(fl.z0 + sill)} y2={Z(fl.z1 - head)} stroke={ink} strokeWidth={0.6} vectorEffect="non-scaling-stroke" />)}
                    </g>
                  ))}
                </g>
              ))}
              {core.map(([c0, c1], i) => {
                const mid = (c0 + c1) / 2
                return (
                  <g key={`c${i}`}>
                    <rect x={c0} y={Z(fl.z1)} width={c1 - c0} height={h} fill={colour ? '#e9ebee' : '#f2f2f2'} />
                    <path d={`M${c0 + 0.35} ${Z(fl.z0)} L${mid - 0.2} ${Z(fl.z1)} M${mid - 0.2} ${Z(fl.z0)} L${c0 + 0.35} ${Z(fl.z1)} M${mid + 0.2} ${Z(fl.z0)} L${c1 - 0.35} ${Z(fl.z1 - h / 2)} L${mid + 0.2} ${Z(fl.z1)}`} fill="none" stroke="#6b7078" strokeWidth={0.7} vectorEffect="non-scaling-stroke" />
                    <rect x={c0} y={Z(fl.z1)} width={0.35} height={h} fill={ink} /><rect x={c1 - 0.35} y={Z(fl.z1)} width={0.35} height={h} fill={ink} /><rect x={mid - 0.2} y={Z(fl.z1)} width={0.4} height={h} fill={ink} />
                    <rect x={c0} y={Z(fl.z1) - 0.18} width={c1 - c0} height={0.36} fill={ink} />
                  </g>
                )
              })}
              {(on || hv) && runs.map(([a, b], i) => <rect key={`o${i}`} x={a} y={Z(fl.z1)} width={b - a} height={h} fill="none" stroke={on ? ORANGE : '#1f5f8b'} strokeWidth={on ? 2.2 : 1.4} vectorEffect="non-scaling-stroke" />)}
            </g>
          )
        })}
        {/* the core's overrun and the parapets on the main tower */}
        {(g.cores.get(main.id) ?? []).map(([c0, c1], i) => <g key={i}><rect x={c0} y={Z(over)} width={c1 - c0} height={over - g.top} fill="#e9ebee" stroke={ink} strokeWidth={1.4} vectorEffect="non-scaling-stroke" /></g>)}
        <line x1={view.x - view.w} x2={view.x + view.w * 2} y1={0} y2={0} stroke={ink} strokeWidth={2} vectorEffect="non-scaling-stroke" />
        {/* foundation */}
        <rect x={g.ma - 1.5} y={0} width={g.mb - g.ma + 3} height={1.4} fill={ink} />
        {/* grid lines, bubbles and bay dimensions */}
        <g stroke="#8a8f96" strokeWidth={0.7} vectorEffect="non-scaling-stroke">
          {gx.map((x) => <line key={x} x1={x} x2={x} y1={Z(-2)} y2={Z(over + 6) + px(4)} strokeDasharray={`${px(9)} ${px(3)} ${px(1.5)} ${px(3)}`} vectorEffect="non-scaling-stroke" />)}
        </g>
        {gx.map((x, i) => (
          <g key={x}>
            <circle cx={x} cy={Z(over + 6) - px(8)} r={px(9)} fill="#fff" stroke={ink} strokeWidth={1} vectorEffect="non-scaling-stroke" />
            <text x={x} y={Z(over + 6) - px(8) + px(3.6)} textAnchor="middle" fontSize={px(10)} fill={ink} fontFamily="ui-monospace, monospace">{dir === 'N' || dir === 'S' ? i + 1 : 'ABCDEFGHJKLMN'[i]}</text>
            {i > 0 && <g><line x1={gx[i - 1]} x2={x} y1={Z(over + 2.5)} y2={Z(over + 2.5)} stroke={ink} strokeWidth={0.8} vectorEffect="non-scaling-stroke" />
              <text x={(gx[i - 1] + x) / 2} y={Z(over + 2.5) - px(3)} textAnchor="middle" fontSize={px(8.5)} fill="#4b5058" fontFamily="ui-monospace, monospace">{(x - gx[i - 1]).toFixed(2)}</text></g>}
            <line x1={x - px(3)} x2={x + px(3)} y1={Z(over + 2.5) + px(3)} y2={Z(over + 2.5) - px(3)} stroke={ink} strokeWidth={1} vectorEffect="non-scaling-stroke" />
          </g>
        ))}
        {/* the overall height, outside on the left */}
        <g>
          <line x1={g.ma - px(30)} x2={g.ma - px(30)} y1={0} y2={Z(g.top)} stroke={ink} strokeWidth={0.8} vectorEffect="non-scaling-stroke" />
          {[0, g.top].map((z) => <line key={z} x1={g.ma - px(34)} x2={g.ma - px(26)} y1={Z(z) + px(4)} y2={Z(z) - px(4)} stroke={ink} strokeWidth={1} vectorEffect="non-scaling-stroke" />)}
          <text transform={`translate(${g.ma - px(36)} ${Z(g.top / 2)}) rotate(-90)`} textAnchor="middle" fontSize={fs} fill={ink} fontFamily="ui-monospace, monospace">{g.top.toFixed(2)} overall</text>
        </g>
        {/* level marks */}
        {shownLv.map((l) => (
          <g key={l.nm} fontFamily="ui-monospace, monospace">
            <line x1={g.mb + px(4)} x2={lx + px(78)} y1={Z(l.z)} y2={Z(l.z)} stroke="#6b7078" strokeWidth={0.6} strokeDasharray={`${px(2)} ${px(2)}`} vectorEffect="non-scaling-stroke" />
            <path d={`M${lx} ${Z(l.z)} l${-px(4.5)} ${-px(6)} h${px(9)} Z`} fill="none" stroke={ink} strokeWidth={0.9} vectorEffect="non-scaling-stroke" />
            <text x={lx + px(8)} y={Z(l.z) - px(2.5)} fontSize={px(9.5)} fill="#3b3f46">{l.nm} {l.z > 0.005 ? '+' : '±'}{l.z.toFixed(2)}</text>
          </g>
        ))}
        {/* scale bar */}
        <g transform={`translate(${lx} ${px(30)})`} fontFamily="ui-monospace, monospace">
          {[0, 1, 2, 3].map((i) => <rect key={i} x={i * 10} y={0} width={10} height={px(5)} fill={i % 2 ? '#fff' : ink} stroke={ink} strokeWidth={0.8} vectorEffect="non-scaling-stroke" />)}
          <text x={41} y={px(5)} dx={px(4)} fontSize={px(9)} fill={ink}>40 m</text>
        </g>
      </svg>

      {/* Program: pick floors in the section, then a use */}
      <div className="glass absolute left-3 top-3 w-52 rounded-xl bg-glass-1 p-3 text-meta shadow-float" data-testid="program-card">
        <div className="flex items-baseline justify-between gap-1">
          <button type="button" onClick={() => setCardOpen((o) => !o)} aria-expanded={cardOpen} className="flex items-center gap-1 text-control font-semibold text-ink"><ChevronDown size={13} aria-hidden className={cardOpen ? '' : '-rotate-90'} />Program</button>
          {pick.levels.length > 0 && <button type="button" onClick={clearFloorPick} className="text-control text-[#c2410c] hover:underline">Clear</button>}</div>
        <p className="text-muted" data-testid="program-selected">{sel}</p>
        {cardOpen && <>
        <ul className="mt-1.5 grid gap-0.5">
          {USE_IDS.map((u) => (
            <li key={u}><button type="button" disabled={!pick.levels.length} onClick={() => setUse(u)} data-use={u}
              className="flex w-full items-center gap-2 rounded-md px-1 py-1 text-left text-ink hover:bg-white/70 disabled:cursor-default disabled:hover:bg-transparent">
              <span className="h-3.5 w-3.5 shrink-0 rounded-sm" style={{ background: USES[u].color }} />{USES[u].label}</button></li>
          ))}
        </ul>
        <label className="mt-1.5 flex items-center gap-1.5 border-t border-line pt-1.5 text-ink"><input type="checkbox" checked={colour} onChange={(e) => setColour(e.target.checked)} className="accent-accent" />Colour the rooms by program</label>
        </>}
      </div>

      {/* Section: key plan with the cut line, Flip, E–W, N–S */}
      <SectionKey plate={main.prisms.reduce((m, p) => (p.z1 - p.z0 > m.z1 - m.z0 ? p : m), main.prisms[0]).ring} core={main.core ?? null} centre={centre} theta={theta}
        dir={dir} off={off} setOff={setOff} word={word} onFlip={() => setDir((x) => ({ N: 'S', S: 'N', E: 'W', W: 'E' } as const)[x])}
        onAxis={(a) => { setDir(a === 'EW' ? 'N' : 'W'); setOff(0) }} />
    </div>
  )
}

function SectionKey({ plate, core, centre, theta, dir, off, setOff, word, onFlip, onAxis }: { plate: Pt[]; core: Pt[] | null; centre: Pt; theta: number; dir: Dir; off: number; setOff: (n: number) => void; word: string; onFlip: () => void; onAxis: (a: 'EW' | 'NS') => void }) {
  const ew = dir === 'N' || dir === 'S'
  // the plate in project axes (the tower's grid up), true north by the arrow
  const cs = Math.cos(theta), sn = Math.sin(theta)
  const pj = (p: Pt): Pt => { const x = p[0] - centre[0], y = p[1] - centre[1]; return [x * cs + y * sn, -x * sn + y * cs] }
  const xs = plate.map((p) => pj(p)[0]), ys = plate.map((p) => pj(p)[1])
  const R = Math.max(...xs.map(Math.abs), ...ys.map(Math.abs)) * 1.45 || 20
  const S = 180, s = (S / 2 - 10) / R, X = (x: number) => S / 2 + x * s, Y = (y: number) => S / 2 - y * s
  const ring = (r: Pt[]) => r.map((p, i) => { const q = pj(p); return `${i ? 'L' : 'M'}${X(q[0]).toFixed(1)} ${Y(q[1]).toFixed(1)}` }).join(' ') + 'Z'
  const lim = Math.max(...(ew ? ys : xs).map(Math.abs))
  const svg = useRef<SVGSVGElement>(null)
  const dragging = useRef(false)
  const move = (e: RPE) => {
    if (!dragging.current || !svg.current) return
    const b = svg.current.getBoundingClientRect(), mx = ((e.clientX - b.left) / b.width) * S, my = ((e.clientY - b.top) / b.height) * S
    const v = ew ? -(my - S / 2) / s : (mx - S / 2) / s
    setOff(Math.round(Math.max(-lim, Math.min(lim, v)) * 2) / 2)
  }
  const at = ew ? Y(off) : X(off)
  const tag = ew ? 'A' : 'B'
  // the arrows point the way the section looks
  const look = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] }[dir]
  const ends: Pt[] = ew ? [[12, at], [S - 12, at]] : [[at, 12], [at, S - 12]]
  return (
    <div className="glass absolute bottom-3 left-3 w-60 rounded-xl bg-glass-1 p-3 text-meta shadow-float" data-testid="section-key">
      <div className="mb-1.5 flex items-baseline justify-between"><span className="text-control font-semibold text-ink">Section {tag}–{tag}</span><span className="text-muted">looking {word} · {off.toFixed(1)} m</span></div>
      <svg ref={svg} viewBox={`0 0 ${S} ${S}`} className="w-full touch-none rounded-md bg-white/70" onPointerMove={move} onPointerUp={() => { dragging.current = false }} onPointerLeave={() => { dragging.current = false }}>
        <line x1={8} x2={S - 8} y1={22} y2={22} stroke="#9aa0a6" strokeDasharray="3 3" /><line x1={8} x2={S - 8} y1={S - 22} y2={S - 22} stroke="#9aa0a6" strokeDasharray="3 3" />
        <g transform={`translate(${S - 16} 16) rotate(${(theta * 180) / Math.PI})`}><path d="M0 -8 L4 4 L0 1.5 L-4 4 Z" fill="#1b1d21" /><text y={13} textAnchor="middle" fontSize={7} fill="#1b1d21">N</text></g>
        <text x={8} y={14} fontSize={7} fill="#6b7078" fontFamily="ui-monospace, monospace">project north up</text>
        <path d={ring(plate)} fill="#5b616b" stroke="#2b2f36" />
        {core && <path d={ring(core)} fill="#c9ccd1" stroke="#2b2f36" />}
        {core && <text x={X(pj(core.reduce<Pt>((a, p) => [a[0] + p[0] / core.length, a[1] + p[1] / core.length], [0, 0]))[0])} y={Y(pj(core.reduce<Pt>((a, p) => [a[0] + p[0] / core.length, a[1] + p[1] / core.length], [0, 0]))[1]) + 3} textAnchor="middle" fontSize={8} fill="#4b5058" fontFamily="ui-monospace, monospace">core</text>}
        <line x1={ends[0][0]} y1={ends[0][1]} x2={ends[1][0]} y2={ends[1][1]} stroke={ORANGE} strokeWidth={1.6} strokeDasharray="7 3 2 3" />
        {/* a wide invisible handle to drag the cut */}
        <line x1={ends[0][0]} y1={ends[0][1]} x2={ends[1][0]} y2={ends[1][1]} stroke="transparent" strokeWidth={14} className={ew ? 'cursor-ns-resize' : 'cursor-ew-resize'} data-testid="section-cut-handle"
          onPointerDown={(e) => { dragging.current = true; (e.currentTarget as Element).setPointerCapture?.(e.pointerId) }} onPointerMove={move} onPointerUp={() => { dragging.current = false }} />
        {ends.map(([x, y], i) => (
          <g key={i}>
            <circle cx={x} cy={y} r={4.5} fill="#fff" stroke={ORANGE} strokeWidth={1.6} />
            <circle cx={x + look[0] * 9} cy={y + look[1] * 9} r={5.5} fill={ORANGE} />
            <text x={x + look[0] * 9} y={y + look[1] * 9 + 2.6} textAnchor="middle" fontSize={7} fontWeight={700} fill="#fff">{tag}</text>
          </g>
        ))}
      </svg>
      <div className="mt-2 flex gap-1.5">
        <button type="button" onClick={onFlip} data-testid="section-flip" className="flex h-7 flex-1 items-center justify-center gap-1 rounded-md bg-white/80 text-control text-ink hover:bg-white"><ArrowUpDown size={13} aria-hidden className="rotate-90" />Flip</button>
        <button type="button" onClick={() => onAxis('EW')} aria-pressed={ew} data-testid="section-ew" className={`h-7 rounded-md px-2 text-control ${ew ? 'bg-accent/15 text-accent' : 'bg-white/80 text-ink hover:bg-white'}`}>E–W</button>
        <button type="button" onClick={() => onAxis('NS')} aria-pressed={!ew} data-testid="section-ns" className={`h-7 rounded-md px-2 text-control ${!ew ? 'bg-accent/15 text-accent' : 'bg-white/80 text-ink hover:bg-white'}`}>N–S</button>
      </div>
    </div>
  )
}

/** The section as a canvas, for "Add to sheet". */
export async function sectionCanvas(): Promise<HTMLCanvasElement | null> {
  const svg = document.querySelector<SVGSVGElement>('[data-testid="program-section-svg"]')
  if (!svg) return null
  const w = svg.width.baseVal.value, h = svg.height.baseVal.value
  const src = new XMLSerializer().serializeToString(svg)
  const img = new Image()
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(src)}`
  await img.decode().catch(() => null)
  const c = document.createElement('canvas'); c.width = w * 2; c.height = h * 2
  const x = c.getContext('2d'); if (!x) return null
  x.fillStyle = '#f4f5f7'; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height)
  return c
}
