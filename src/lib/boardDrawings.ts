// Architectural drawings and sheet styles for the boards, from the Tower Workspace's Presentation page (Sinnie, 13 Nov:
// "import the presentation page and merge it with the current one from the design tool to toolkit"; source:
// tower-workspace/index.html [PRESENTATION] STYLE, drawDrawing, caption, makeSet). Ported to the toolkit's boards
// (A2, mm frames) and its own model: the towers' blocks and floors (engine/solarRules towerOccluders, lib/floorPick
// floorPlates), the study site and the buildings around it. Vector, true scale: site plan, floor plan at any level,
// elevation from any side, section; scale bar, north arrow, level marks, numbered captions.
import { USES, type UseId } from '../engine/types'
import { ARCH_KINDS, drawArch } from './archDrawings'

type Pt = [number, number]
export type StyleId = 'architectural' | 'competition' | 'technical' | 'concept' | 'blueprint'
export interface BoardStyle { name: string; paper: string; ink: string; soft: string; mass: string; cut: string; ctx: string; mono: boolean; shadow?: boolean; dims?: boolean; w: number; /** Plans and sections in black poché (lib/archDrawings.ts). */ poche?: boolean }
/** The Workspace's four architectural styles ('use' = the use's colour, 'hatch' = a diagonal hatch). */
export const BOARD_STYLES: Record<StyleId, BoardStyle> = {
  // 17 Nov (Sinnie): simple black and white, black poché walls in plans and sections.
  architectural: { name: 'Architectural, black and white', paper: '#ffffff', ink: '#111111', soft: '#8c8c8c', mass: '#ffffff', cut: '#111111', ctx: '#f1f1f1', mono: false, w: 1, poche: true },
  competition: { name: 'Competition board', paper: '#ffffff', ink: '#2b2b2e', soft: '#b4b4ba', mass: '#ffffff', cut: '#dcdce0', ctx: '#f2f2f0', mono: false, shadow: true, w: 1 },
  technical: { name: 'Technical set', paper: '#ffffff', ink: '#000000', soft: '#8a8a8a', mass: '#ffffff', cut: 'hatch', ctx: '#ffffff', mono: true, dims: true, w: 1 },
  concept: { name: 'Concept diagram', paper: '#fbfaf6', ink: '#3a3a3f', soft: '#cfcbc0', mass: 'use', cut: 'use', ctx: '#f0eee7', mono: false, w: 1.7 },
  blueprint: { name: 'Blueprint', paper: '#1f4e8c', ink: '#ffffff', soft: '#8fb0d9', mass: '#1f4e8c', cut: '#2c5fa3', ctx: '#1f4e8c', mono: true, w: 1 },
}
export const styleFont = (st: BoardStyle) => (st.mono ? '"DM Mono", ui-monospace, "Cascadia Mono", monospace' : '"Inter", "Segoe UI", system-ui, sans-serif')
export const SCALES = [100, 200, 250, 500, 750, 1000, 1250, 2000, 2500, 5000]

export type DrawingKind = 'site' | 'plan' | 'elev' | 'section' | 'context' | 'roof' | 'axo' | 'program'
export type Side = 'N' | 'E' | 'S' | 'W'
export interface DrawingSpec { kind: 'drawing'; vt: DrawingKind; level?: number; dir?: Side; scale?: number; /** Section: along the tower (A–A) or across it (B–B). */ axis?: 'long' | 'cross'; /** Plan title word: 'Typical mid-level plan'. */ label?: string }

/** The model as the drawings read it (heights from the ground of the design). */
export interface DrawData {
  site: Pt[] | null
  towers: { id: string; name: string; /** Indicative core ring (a square of the core share, centred on the plate). */ core?: Pt[] | null; prisms: { ring: Pt[]; z0: number; z1: number }[]; floors: { level: number; z0: number; z1: number; use: UseId; area: number; rings: Pt[][] }[] }[]
  context: { ring: Pt[]; z1: number }[]
  /** True north, degrees clockwise from the frame's +y. */
  north: number
}
let current: DrawData | null = null
/** The composer keeps this up to date (components/boards/useBoardData.ts useDrawData); the renderer reads it. */
export const setDrawData = (d: DrawData | null) => { current = d }
export const drawData = () => current

const DIR: Record<Side, Pt> = { N: [0, 1], E: [1, 0], S: [0, -1], W: [-1, 0] }
const SIDE_WORD: Record<Side, string> = { N: 'North', E: 'East', S: 'South', W: 'West' }

function hatch(c: CanvasRenderingContext2D, st: BoardStyle) {
  const p = document.createElement('canvas'); p.width = p.height = 8
  const x = p.getContext('2d')!
  x.strokeStyle = st.ink; x.lineWidth = 0.8; x.beginPath(); x.moveTo(-2, 10); x.lineTo(10, -2); x.moveTo(-2, 2); x.lineTo(2, -2); x.moveTo(6, 10); x.lineTo(10, 6); x.stroke()
  return c.createPattern(p, 'repeat') ?? st.ink
}
const centroid = (r: Pt[]): Pt => r.reduce<Pt>((a, p) => [a[0] + p[0] / r.length, a[1] + p[1] / r.length], [0, 0])
const ringArea = (r: Pt[]) => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]); return Math.abs(a / 2) }

/** The numbered caption under a drawing (the Workspace's `caption`). */
export function drawCaption(c: CanvasRenderingContext2D, k: number, f: { x: number; y: number; w: number; h: number }, st: BoardStyle, no: number, title: string, scale: string) {
  const mm = (v: number) => v * k, y = f.y + f.h - 4.5, x = f.x + 5, font = (sz: number, b?: boolean) => `${b ? '600 ' : ''}${mm(sz)}px ${styleFont(st)}`
  c.fillStyle = st.ink; c.strokeStyle = st.ink; c.lineWidth = mm(0.25); c.textBaseline = 'alphabetic'
  c.beginPath(); c.arc(mm(x), mm(y), mm(3), 0, 7); c.stroke()
  c.textAlign = 'center'; c.font = font(2.8, true); c.fillText(String(no), mm(x), mm(y + 1))
  c.textAlign = 'left'; c.font = font(3, true); c.fillText(title.toUpperCase(), mm(x + 5), mm(y - 0.2))
  c.font = font(2.2); c.fillStyle = st.soft; c.fillText(scale, mm(x + 5), mm(y + 3))
  c.beginPath(); c.moveTo(mm(x + 4), mm(y + 0.6)); c.lineTo(mm(x + 5 + Math.max(30, title.length * 2.2)), mm(y + 0.6)); c.stroke()
}

/** One drawing in a frame (mm rect), at true scale (or the largest listed scale that fits). */
export function drawDrawing(c: CanvasRenderingContext2D, k: number, f: { x: number; y: number; w: number; h: number }, spec: DrawingSpec, d: DrawData | null, st: BoardStyle, no: number) {
  const mm = (v: number) => v * k
  const font = (sz: number, b?: boolean) => `${b ? '600 ' : ''}${mm(sz)}px ${styleFont(st)}`
  const W = st.w, lw = (v: number) => { c.lineWidth = mm(v * W) }
  if (d && d.towers.length && (ARCH_KINDS.has(spec.vt) || (st.poche && spec.vt !== 'elev'))) { drawArch(c, k, f, spec, d, st, no); return }
  c.save(); c.beginPath(); c.rect(mm(f.x), mm(f.y), mm(f.w), mm(f.h)); c.clip()
  c.textBaseline = 'alphabetic'; c.lineJoin = 'round'
  if (!d || !d.towers.length) {
    c.fillStyle = st.soft; c.font = font(4); c.textAlign = 'center'
    c.fillText(d ? 'No tower yet: place one in the model' : 'Open the composer to draw this', mm(f.x + f.w / 2), mm(f.y + f.h / 2)); c.restore(); return
  }
  const prisms = d.towers.flatMap((t) => t.prisms)
  const pts: Pt[] = [...(d.site ?? []), ...prisms.flatMap((p) => p.ring)]
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1])
  const B = { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) }
  const bcx = (B.x0 + B.x1) / 2, bcy = (B.y0 + B.y1) / 2
  const top = Math.max(...prisms.map((p) => p.z1))
  const bw = f.w - 8, bh = f.h - 16
  const el = spec.vt === 'elev' || spec.vt === 'section'
  const dir: Side = spec.vt === 'section' ? 'E' : spec.dir ?? 'N'
  const v = DIR[dir], right: Pt = [-v[1], v[0]]
  const U = (p: Pt) => p[0] * right[0] + p[1] * right[1], Dp = (p: Pt) => -(p[0] * v[0] + p[1] * v[1])
  const pad = spec.vt === 'site' ? 40 : 14
  let exW: number, exH: number
  if (el) { const us = pts.map(U); exW = Math.max(...us) - Math.min(...us) + 60; exH = top + 22 } else { exW = B.x1 - B.x0 + pad * 2; exH = B.y1 - B.y0 + pad * 2 }
  const sc = spec.scale || SCALES.find((n) => (exW * 1000) / n <= bw && (exH * 1000) / n <= bh) || 5000
  const kp = mm(1000 / sc) // px per metre
  const cx = mm(f.x + f.w / 2), cy = mm(f.y + (f.h - 10) / 2)
  const fillOf = (use: UseId, cut?: boolean): string | CanvasPattern => { const fl = cut ? st.cut : st.mass; return fl === 'use' ? USES[use].color : fl === 'hatch' ? hatch(c, st) : fl }
  let title = ''
  if (!el) {
    const X = (x: number) => cx + (x - bcx) * kp, Y = (y: number) => cy - (y - bcy) * kp
    const poly = (r: Pt[]) => { c.beginPath(); r.forEach((q, i) => (i ? c.lineTo(X(q[0]), Y(q[1])) : c.moveTo(X(q[0]), Y(q[1])))); c.closePath() }
    const site = spec.vt === 'site', level = Math.max(1, spec.level ?? 1)
    if (site || level === 1) for (const o of d.context) { poly(o.ring); c.fillStyle = st.ctx; c.fill(); lw(0.13); c.strokeStyle = st.soft; c.stroke() }
    if (d.site) { c.strokeStyle = st.ink; lw(0.35); c.setLineDash([mm(4), mm(1.2), mm(0.8), mm(1.2)]); poly(d.site); c.stroke(); c.setLineDash([]) }
    if (site) {
      const ms = [...prisms].sort((a, b) => a.z1 - b.z1)
      if (st.shadow) for (const p of ms) { const o = Math.min(26, p.z1 * 0.16); c.save(); c.translate(o * kp, o * kp * 0.7); poly(p.ring); c.fillStyle = 'rgba(0,0,0,.09)'; c.fill(); c.restore() }
      for (const t of d.towers) {
        const tp = [...t.prisms].sort((a, b) => a.z1 - b.z1)
        for (const p of tp) { const use = t.floors.find((fl) => fl.z0 <= p.z1 - 0.5 && fl.z1 >= p.z1 - 0.5)?.use ?? 'office'; poly(p.ring); c.fillStyle = fillOf(use); c.fill(); lw(0.5); c.strokeStyle = st.ink; c.stroke() }
        const tallest = tp[tp.length - 1]
        if (tallest) { const q = centroid(tallest.ring); c.fillStyle = st.ink; c.textAlign = 'center'; c.font = font(2.2, true); c.fillText(`${t.floors.length}F`, X(q[0]), Y(q[1]) + mm(0.8)) }
      }
      title = 'Site plan'
    } else {
      let label = 0
      for (const t of d.towers) {
        const fl = t.floors.find((x) => x.level === level) ?? t.floors[Math.min(level, t.floors.length) - 1]
        if (!fl) continue
        const zc = (fl.z0 + fl.z1) / 2
        label = fl.z0
        for (const p of t.prisms) { poly(p.ring); if (p.z1 <= zc) { lw(0.18); c.strokeStyle = st.ink; c.stroke() } else if (p.z0 > zc) { lw(0.18); c.strokeStyle = st.ink; c.setLineDash([mm(1.5), mm(1)]); c.stroke(); c.setLineDash([]) } }
        for (const r of fl.rings) {
          poly(r); c.fillStyle = st.paper; c.fill()
          lw(1.4); c.strokeStyle = st.cut === 'use' ? USES[fl.use].color : st.ink; c.stroke(); c.strokeStyle = st.ink; lw(0.5); c.stroke()
          const q = centroid(r); c.fillStyle = st.ink; c.textAlign = 'center'; c.font = font(2.3, true); c.fillText(t.name.toUpperCase(), X(q[0]), Y(q[1]) - mm(1.2))
          c.font = font(2); c.fillStyle = st.soft; c.fillText(`${USES[fl.use].label.replace(/ \/.*$/, '')} · ${Math.round(ringArea(r)).toLocaleString()} m²`, X(q[0]), Y(q[1]) + mm(2.2))
        }
      }
      title = level === 1 ? 'Ground floor plan' : `Level ${level} plan, +${label.toFixed(1)} m`
    }
    if (st.dims) {
      const y = Y(B.y1) - mm(6), x = X(B.x0) - mm(6)
      lw(0.13); c.strokeStyle = c.fillStyle = st.ink; c.beginPath(); c.moveTo(X(B.x0), y); c.lineTo(X(B.x1), y); c.moveTo(x, Y(B.y0)); c.lineTo(x, Y(B.y1))
      for (const q of [[X(B.x0), y], [X(B.x1), y], [x, Y(B.y0)], [x, Y(B.y1)]]) { c.moveTo(q[0] - mm(1), q[1] + mm(1)); c.lineTo(q[0] + mm(1), q[1] - mm(1)) }
      c.stroke(); c.font = font(2.2); c.textAlign = 'center'; c.fillText(Math.round((B.x1 - B.x0) * 1000).toLocaleString(), X(bcx), y - mm(1))
      c.save(); c.translate(x - mm(1), Y(bcy)); c.rotate(-Math.PI / 2); c.fillText(Math.round((B.y1 - B.y0) * 1000).toLocaleString(), 0, 0); c.restore()
    }
    // North arrow, turned to true north.
    const nx = mm(f.x + f.w - 9), ny = mm(f.y + 10)
    c.strokeStyle = c.fillStyle = st.ink; lw(0.25); c.beginPath(); c.arc(nx, ny, mm(4), 0, 7); c.stroke()
    c.save(); c.translate(nx, ny); c.rotate((d.north * Math.PI) / 180)
    c.beginPath(); c.moveTo(0, -mm(4)); c.lineTo(mm(1.6), mm(2.4)); c.lineTo(0, mm(1)); c.lineTo(-mm(1.6), mm(2.4)); c.closePath(); c.fill()
    c.font = font(2.4, true); c.textAlign = 'center'; c.fillText('N', 0, -mm(5)); c.restore()
  } else {
    const us = pts.map(U), uc = (Math.max(...us) + Math.min(...us)) / 2
    const gy = cy + ((top + 22) / 2) * kp - 10 * kp
    const X = (u: number) => cx + (u - uc) * kp, Y = (h: number) => gy - h * kp
    type Solid = { ring: Pt[]; z0: number; z1: number; ctx?: boolean; floors?: DrawData['towers'][number]['floors']; use?: UseId }
    const solids: Solid[] = [
      ...d.context.map((o) => ({ ring: o.ring, z0: 0, z1: o.z1, ctx: true })),
      ...d.towers.flatMap((t) => t.prisms.map((p) => ({ ...p, floors: t.floors, use: t.floors.find((fl) => fl.z0 <= p.z1 - 0.5 && fl.z1 >= p.z1 - 0.5)?.use ?? ('office' as UseId) }))),
    ]
    const sec = spec.vt === 'section', cutX = bcx
    solids.map((o) => ({ o, dd: Math.max(...o.ring.map(Dp)) })).sort((a, b) => b.dd - a.dd).forEach(({ o }) => {
      if (sec) { if (Math.min(...o.ring.map((p) => p[0])) >= cutX) return; if (Math.max(...o.ring.map((p) => p[0])) > cutX && !o.ctx) return }
      const uu = o.ring.map(U), u0 = Math.min(...uu), u1 = Math.max(...uu)
      if (o.ctx && (u1 < uc - exW / 2 || u0 > uc + exW / 2)) return
      c.beginPath(); c.rect(X(u0), Y(o.z1), (u1 - u0) * kp, (o.z1 - o.z0) * kp)
      c.fillStyle = o.ctx ? st.ctx : fillOf(o.use ?? 'office'); c.fill(); lw(o.ctx ? 0.13 : 0.35); c.strokeStyle = o.ctx ? st.soft : st.ink; c.stroke()
      if (o.floors) { lw(0.1); c.strokeStyle = st.soft; c.beginPath(); for (const fl of o.floors) if (fl.z0 > o.z0 + 0.1 && fl.z0 < o.z1 - 0.1) { c.moveTo(X(u0), Y(fl.z0)); c.lineTo(X(u1), Y(fl.z0)) } c.stroke() }
    })
    if (sec) for (const t of d.towers) for (const p of t.prisms) {
      const zs: number[] = []
      p.ring.forEach((a, i) => { const b = p.ring[(i + 1) % p.ring.length]; if ((a[0] < cutX) !== (b[0] < cutX)) zs.push(a[1] + ((cutX - a[0]) / (b[0] - a[0])) * (b[1] - a[1])) })
      zs.sort((a, b) => a - b)
      for (let i = 0; i + 1 < zs.length; i += 2) {
        const u0 = U([cutX, zs[i]]), u1 = U([cutX, zs[i + 1]]), lo = Math.min(u0, u1), hi = Math.max(u0, u1)
        c.beginPath(); c.rect(X(lo), Y(p.z1), (hi - lo) * kp, (p.z1 - p.z0) * kp); c.fillStyle = st.paper; c.fill()
        c.fillStyle = st.cut === 'hatch' ? st.ink : (fillOf(t.floors[0]?.use ?? 'office', true) as string)
        for (const fl of t.floors) if (fl.z0 >= p.z0 - 0.01 && fl.z0 <= p.z1 + 0.01) c.fillRect(X(lo), Y(fl.z0) - mm(0.3), (hi - lo) * kp, mm(0.6))
        c.strokeStyle = st.ink; lw(0.7); c.stroke()
        c.fillStyle = st.ink; c.font = font(2.2, true); c.textAlign = 'center'; c.fillText(t.name.toUpperCase(), X((lo + hi) / 2), Y(p.z1) - mm(1.5))
      }
    }
    c.strokeStyle = st.ink; lw(0.7); c.beginPath(); c.moveTo(mm(f.x + 3), gy); c.lineTo(mm(f.x + f.w - 3), gy); c.stroke()
    if (sec) { c.fillStyle = hatch(c, st); c.fillRect(mm(f.x + 3), gy, mm(f.w - 6), mm(3)) }
    // Level marks.
    const lx = mm(f.x + f.w - 22)
    c.fillStyle = st.ink; c.font = font(2.2); c.textAlign = 'left'; lw(0.13); c.strokeStyle = st.ink
    for (const [h, t] of [[0, '±0.000'], [top, `+${top.toFixed(3)}`]] as [number, string][]) {
      c.beginPath(); c.moveTo(lx - mm(8), Y(h)); c.lineTo(lx + mm(1), Y(h)); c.stroke()
      c.beginPath(); c.moveTo(lx - mm(1.5), Y(h) - mm(2)); c.lineTo(lx + mm(1.5), Y(h) - mm(2)); c.lineTo(lx, Y(h)); c.closePath(); c.stroke()
      c.fillText(t, lx + mm(2.5), Y(h) - mm(0.6))
    }
    title = sec ? 'Section A' : `${SIDE_WORD[dir]} elevation`
  }
  // Scale bar.
  const want = (30 * sc) / 1000, bar = [5, 10, 20, 25, 50, 100, 200, 250, 500].reduce((a, b) => (Math.abs(b - want) < Math.abs(a - want) ? b : a))
  const bx = mm(f.x + f.w - 8) - bar * kp, by = mm(f.y + f.h - 6)
  c.strokeStyle = c.fillStyle = st.ink; lw(0.18); c.strokeRect(bx, by, bar * kp, mm(1.2)); c.fillRect(bx, by, (bar * kp) / 2, mm(1.2))
  c.font = font(2); c.textAlign = 'center'; c.fillText('0', bx, by - mm(1)); c.fillText(String(bar / 2), bx + (bar * kp) / 2, by - mm(1)); c.fillText(`${bar} m`, bx + bar * kp, by - mm(1))
  c.restore()
  drawCaption(c, k, f, st, no, title, `Scale 1:${sc} at A2`)
}

/** The Workspace's results table: one line per check, its reading and PASS / CHECK / NEAR. */
export function drawTable(c: CanvasRenderingContext2D, k: number, f: { x: number; y: number; w: number; h: number }, rows: [string, string, 'pass' | 'fail' | 'warn' | 'unknown'][], st: BoardStyle) {
  const mm = (v: number) => v * k, font = (sz: number, b?: boolean) => `${b ? '600 ' : ''}${mm(sz)}px ${styleFont(st)}`
  const clip = (t: string, w: number) => { if (c.measureText(t).width <= w) return t; while (t.length > 3 && c.measureText(`${t}…`).width > w) t = t.slice(0, -1); return `${t}…` }
  c.save(); c.beginPath(); c.rect(mm(f.x), mm(f.y), mm(f.w), mm(f.h)); c.clip(); c.textBaseline = 'alphabetic'
  c.textAlign = 'left'; c.fillStyle = st.ink; c.font = font(3.6, true); c.fillText('ANALYSIS SUMMARY', mm(f.x + 2), mm(f.y + 6))
  c.font = font(2.1); c.fillStyle = st.soft; c.fillText('Screening results from the toolkit checks', mm(f.x + 2), mm(f.y + 10))
  let y = f.y + 17
  const rh = Math.min(6, (f.h - 22) / Math.max(1, rows.length))
  c.lineWidth = mm(0.13); c.strokeStyle = st.soft
  for (const r of rows) {
    c.fillStyle = st.ink; c.font = font(Math.min(2.5, rh * 0.48)); c.textAlign = 'left'; c.fillText(clip(r[0], mm(f.w * 0.44)), mm(f.x + 2), mm(y))
    c.fillStyle = st.soft; c.fillText(clip(r[1], mm(f.w * 0.36)), mm(f.x + f.w * 0.47), mm(y))
    c.textAlign = 'right'; c.fillStyle = r[2] === 'fail' ? (st.paper === '#1f4e8c' ? '#ffd0c8' : '#a36262') : st.ink; c.font = font(Math.min(2.5, rh * 0.48), true)
    c.fillText(r[2] === 'pass' ? 'PASS' : r[2] === 'fail' ? 'CHECK' : r[2] === 'warn' ? 'NEAR' : '—', mm(f.x + f.w - 2), mm(y))
    c.beginPath(); c.moveTo(mm(f.x + 2), mm(y + rh * 0.3)); c.lineTo(mm(f.x + f.w - 2), mm(y + rh * 0.3)); c.stroke()
    y += rh
  }
  if (!rows.length) { c.fillStyle = st.soft; c.font = font(2.6); c.fillText('No results yet: switch checks on in the workflow.', mm(f.x + 2), mm(y)) }
  c.restore()
}

/** The Workspace's sheet border and title block, in the board's bottom margin. */
export function drawTitleBlock(c: CanvasRenderingContext2D, k: number, W: number, H: number, st: BoardStyle, cells: [string, string][], no: string) {
  const mm = (v: number) => v * k, font = (sz: number, b?: boolean) => `${b ? '600 ' : ''}${mm(sz)}px ${styleFont(st)}`
  c.save(); c.strokeStyle = st.ink; c.lineWidth = mm(0.35); c.strokeRect(mm(5), mm(5), mm(W - 10), mm(H - 10))
  const ty = H - 11, xs = [5, W * 0.36, W * 0.62, W * 0.78, W - 40]
  c.lineWidth = mm(0.25); c.beginPath(); c.moveTo(mm(5), mm(ty)); c.lineTo(mm(W - 5), mm(ty)); for (const x of xs.slice(1)) { c.moveTo(mm(x), mm(ty)); c.lineTo(mm(x), mm(H - 5)) } c.stroke()
  c.textBaseline = 'alphabetic'; c.textAlign = 'left'
  ;[...cells, ['No.', no] as [string, string]].forEach(([lab, val], i) => {
    const x = xs[i] ?? xs[xs.length - 1]
    c.fillStyle = st.soft; c.font = font(1.8); c.fillText(lab.toUpperCase(), mm(x + 2.5), mm(ty + 2.6))
    c.fillStyle = st.ink; c.font = font(i === 4 ? 3.2 : 2.6, true); c.fillText(val, mm(x + 2.5), mm(ty + 5.4))
  })
  c.restore()
}
