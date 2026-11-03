// Present drawings (plan §1 "drawings", research P13-M02): a building section and elevations of the massing, drawn as
// SVG at a standard scale on the A2 sheet (sheet millimetres) or tight around the drawing for a board frame. Level
// labels with heights, program fills in the USES colours, core, plant floors and sky lobbies, scale bar, north arrow
// on a key plan, and the LOD 100 note. Pure string builders, so they can be tested and exported as they are.
import { coreSide, towerFloors, towerFootprint, blockSpans, towerMasses } from './massing'
import { fitScale } from './plan'
import { USES, type Floor, type Tower, type UseId } from './types'
import { convertText, type LengthUnit } from '../lib/units'

export const SHEET = { w: 594, h: 420 }
const AREA = { x: 16, y: 16, w: 408, h: 362 }
const COL = { x: 436, w: 142 }
const FONT = 'Inter, Segoe UI, Arial, sans-serif'
const INK = '#1f2328', MUTED = '#6b6f76'
export const LOD_NOTE = 'LOD 100: schematic space reservation from the massing model, not a design or construction drawing.'

/** `unit`: display unit for labels and the scale bar (lib/units.ts); the geometry is always drawn from metres. */
export interface DrawOpts { northDeg: number; projectLabel: string; mode: 'sheet' | 'tight'; date?: string; unit?: LengthUnit }
export interface Drawing { svg: string; title: string; scale: number; levels: number; labelled: number; widthMm: number; heightMm: number }

// ---------------------------------------------------------------- tiny SVG writer
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const n = (v: number) => (Math.round(v * 100) / 100).toString()
function el(tag: string, attrs: Record<string, string | number | undefined>, inner = ''): string {
  const a = Object.entries(attrs).filter(([, v]) => v !== undefined).map(([k, v]) => ` ${k}="${typeof v === 'number' ? n(v) : esc(String(v))}"`).join('')
  return inner ? `<${tag}${a}>${inner}</${tag}>` : `<${tag}${a}/>`
}
const text = (x: number, y: number, s: string, a: Record<string, string | number | undefined> = {}) => el('text', { x, y, 'font-size': 2.6, fill: INK, ...a }, esc(s))

const DIRS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west']
const dirName = (bearing: number) => DIRS[Math.round((((bearing % 360) + 360) % 360) / 45) % 8]
/** True bearing of a model-frame direction (true north at northDeg clockwise from +y). */
const bearing = (dx: number, dy: number, northDeg: number) => ((Math.atan2(dx, dy) * 180) / Math.PI - northDeg + 720) % 360
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

// ---------------------------------------------------------------- shared parts
/** Levels to label: grade, podium top, each use change, sky lobbies, every 10th level and the roof, kept ≥ 3.4 mm apart. */
export function labelLevels(floors: Floor[], mmPerM: number): Floor[] {
  const pri = (f: Floor, i: number) => (i === 0 ? 0 : f.skyLobby ? 1 : i > 0 && floors[i - 1].podium && !f.podium ? 1 : i > 0 && floors[i - 1].use !== f.use ? 2 : f.level % 10 === 0 ? 3 : 9)
  const cands = floors.map((f, i) => ({ f, p: pri(f, i) })).filter((c) => c.p < 9).sort((a, b) => a.p - b.p || a.f.z0 - b.f.z0)
  const out: Floor[] = []
  for (const c of cands) if (out.every((o) => Math.abs(o.z0 - c.f.z0) * mmPerM >= 3.4)) out.push(c.f)
  return out.sort((a, b) => a.z0 - b.z0)
}

function defs() {
  return el('defs', {},
    el('pattern', { id: 'plant', width: 1.6, height: 1.6, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, el('line', { x1: 0, y1: 0, x2: 0, y2: 1.6, stroke: '#7d838b', 'stroke-width': 0.25 }))
    + el('pattern', { id: 'earth', width: 2.4, height: 2.4, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(-45)' }, el('line', { x1: 0, y1: 0, x2: 0, y2: 2.4, stroke: '#9aa1a9', 'stroke-width': 0.2 }))
    + el('pattern', { id: 'core', width: 1.2, height: 1.2, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, el('line', { x1: 0, y1: 0, x2: 0, y2: 1.2, stroke: '#2b2f36', 'stroke-width': 0.35 })))
}

/** Scale bar in metres, or in feet with round foot steps when the viewer shows feet. */
function scaleBar(x: number, y: number, scale: number, unit: LengthUnit = 'm'): string {
  const ft = unit === 'ft'
  const mm = (v: number) => ((ft ? v * 0.3048 : v) * 1000) / scale
  const steps = (ft ? [0, 25, 50, 100, 200, 300] : [0, 10, 20, 50, 100]).filter((v) => mm(v) <= 70)
  let s = ''
  for (let i = 0; i + 1 < steps.length; i++) s += el('rect', { x: x + mm(steps[i]), y, width: mm(steps[i + 1] - steps[i]), height: 1.4, fill: i % 2 ? '#fff' : INK, stroke: INK, 'stroke-width': 0.2 })
  s += steps.map((v) => text(x + mm(v), y + 4.4, String(v), { 'font-size': 2.2, 'text-anchor': 'middle' })).join('')
  s += text(x + mm(steps[steps.length - 1]) + 3, y + 1.6, ft ? 'ft' : 'm', { 'font-size': 2.2 })
  return el('g', { 'data-scale-bar': steps[steps.length - 1] }, s)
}

/** Key plan: podium and tower footprints, a north arrow, and the cut line or the elevated face. */
function keyPlan(t: Tower, x: number, y: number, size: number, northDeg: number, mark: { kind: 'cut'; a: [number, number]; b: [number, number]; look: [number, number] } | { kind: 'face'; a: [number, number]; b: [number, number]; normal: [number, number] }): string {
  const fp = towerFootprint(t), pf = t.podiumHeight > 0 ? towerFootprint(t, true) : fp
  // Stacked blocks: every block's outline (podium blocks tinted), drawn bottom-up.
  const extra = t.imported || !t.blocks?.length ? [] : towerMasses(t)
  const all = [...fp, ...pf, ...extra.flatMap((m) => m.ring)]
  const minX = Math.min(...all.map((p) => p[0])), maxX = Math.max(...all.map((p) => p[0])), minY = Math.min(...all.map((p) => p[1])), maxY = Math.max(...all.map((p) => p[1]))
  const k = (size - 14) / Math.max(maxX - minX, maxY - minY, 1)
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2
  const X = (v: number) => x + size / 2 + (v - cx) * k, Y = (v: number) => y + size / 2 - (v - cy) * k
  const poly = (p: [number, number][], fill: string) => el('polygon', { points: p.map(([a, b]) => `${n(X(a))},${n(Y(b))}`).join(' '), fill, stroke: INK, 'stroke-width': 0.25 })
  let s = el('rect', { x, y, width: size, height: size, fill: 'none', stroke: '#c9ced4', 'stroke-width': 0.2 })
  if (extra.length) for (const m of extra) s += poly(m.ring, m.podium ? '#f1e1d5' : '#dfe6ee')
  else {
    if (pf !== fp) s += poly(pf, '#f1e1d5')
    s += poly(fp, '#dfe6ee')
  }
  if (mark.kind === 'cut') {
    const ext = 6 / k
    const [ax, ay] = mark.a, [bx, by] = mark.b, ux = (bx - ax), uy = (by - ay), L = Math.hypot(ux, uy) || 1
    const pa: [number, number] = [ax - (ux / L) * ext, ay - (uy / L) * ext], pb: [number, number] = [bx + (ux / L) * ext, by + (uy / L) * ext]
    s += el('line', { x1: X(pa[0]), y1: Y(pa[1]), x2: X(pb[0]), y2: Y(pb[1]), stroke: '#c0392b', 'stroke-width': 0.4, 'stroke-dasharray': '2 1 0.5 1' })
    for (const [p, lab] of [[pa, 'A'], [pb, 'A']] as const) {
      const tx = X(p[0]) + mark.look[0] * 3, ty = Y(p[1]) - mark.look[1] * 3
      s += el('line', { x1: X(p[0]), y1: Y(p[1]), x2: tx, y2: ty, stroke: '#c0392b', 'stroke-width': 0.4 }) + text(tx + mark.look[0] * 1.5, ty - mark.look[1] * 1.5 + 1, lab, { 'font-size': 2.6, 'font-weight': 700, fill: '#c0392b', 'text-anchor': 'middle' })
    }
  } else {
    s += el('line', { x1: X(mark.a[0]), y1: Y(mark.a[1]), x2: X(mark.b[0]), y2: Y(mark.b[1]), stroke: '#c0392b', 'stroke-width': 0.9 })
    const mx = (mark.a[0] + mark.b[0]) / 2, my = (mark.a[1] + mark.b[1]) / 2
    const ox = X(mx) + mark.normal[0] * 8, oy = Y(my) - mark.normal[1] * 8
    s += el('line', { x1: ox, y1: oy, x2: X(mx) + mark.normal[0] * 2, y2: Y(my) - mark.normal[1] * 2, stroke: '#c0392b', 'stroke-width': 0.4, 'marker-end': 'url(#arrow)' })
  }
  // North arrow, rotated to true north.
  s += el('g', { transform: `translate(${n(x + size - 6)} ${n(y + 8)}) rotate(${n(northDeg)})`, 'data-north': n(northDeg) },
    el('path', { d: 'M0 -5 L2 3 L0 1.4 L-2 3 Z', fill: INK }) + text(0, -6.5, 'N', { 'font-size': 2.4, 'font-weight': 700, 'text-anchor': 'middle' }))
  return el('g', {}, el('defs', {}, el('marker', { id: 'arrow', viewBox: '0 0 6 6', refX: 5, refY: 3, markerWidth: 4, markerHeight: 4, orient: 'auto' }, el('path', { d: 'M0 0 L6 3 L0 6 Z', fill: '#c0392b' }))) + s)
}

function legend(x: number, y: number, uses: UseId[], hasPlant: boolean, hasSky: boolean, showCore: boolean): string {
  let s = text(0, 0, 'LEGEND', { 'font-weight': 700 }), i = 0
  const row = (fill: string, label: string, extra = '') => { const yy = 3 + i * 4.6; i++; return el('rect', { x: 0, y: yy, width: 6, height: 3.2, fill, 'fill-opacity': fill.startsWith('url') ? 1 : 0.55, stroke: INK, 'stroke-width': 0.2 }) + extra + text(9, yy + 2.7, label, { 'font-size': 2.4 }) }
  for (const u of uses) s += row(USES[u].color, USES[u].label)
  if (hasSky) s += row('#6cc0b8', 'Sky lobby (public amenity)')
  if (hasPlant) s += row('url(#plant)', 'Plant floor')
  if (showCore) s += row('url(#core)', 'Core walls (cut, indicative 400 mm)')
  return el('g', { transform: `translate(${n(x)} ${n(y)})` }, s)
}

function titleBlock(title: string, scale: number, o: DrawOpts): string {
  const rows: [string, string][] = [['Drawing', title], ['Scale', `1:${scale} at A2`], ['Project', o.projectLabel], ['Stage', 'Schematic · LOD 100'], ['Date', o.date ?? new Date().toISOString().slice(0, 10)]]
  let s = el('rect', { x: -2, y: -4, width: COL.w + 4, height: 52, fill: 'none', stroke: INK, 'stroke-width': 0.3 })
  rows.forEach(([k, v], i) => { s += text(0, 1 + i * 5.2, k, { 'font-size': 2.4, fill: MUTED }) + text(20, 1 + i * 5.2, v, { 'font-size': 2.4 }) })
  s += text(0, 29, 'LOD 100: schematic space reservation from', { 'font-size': 2.1, fill: MUTED, 'data-lod': '100' })
  s += text(0, 32.1, 'the massing model, not a design or', { 'font-size': 2.1, fill: MUTED })
  s += text(0, 35.2, 'construction drawing. Floors, core and plant', { 'font-size': 2.1, fill: MUTED })
  s += text(0, 38.3, 'come from team presets.', { 'font-size': 2.1, fill: MUTED })
  return el('g', { transform: `translate(${COL.x} ${SHEET.h - 64})` }, s)
}

// ---------------------------------------------------------------- elevation faces
export interface Face { index: number; a: [number, number]; b: [number, number]; normal: [number, number]; bearing: number; name: string }

/** The tower's faces with their outward normals and the true direction each faces. */
export function faces(t: Tower, northDeg: number): Face[] {
  const fp = towerFootprint(t)
  const ccw = fp.reduce((s, [x, y], i) => { const [x2, y2] = fp[(i + 1) % fp.length]; return s + x * y2 - x2 * y }, 0) > 0
  return fp.map((a, i) => {
    const b = fp[(i + 1) % fp.length]
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1
    let nx = (b[1] - a[1]) / L, ny = -(b[0] - a[0]) / L
    if (!ccw) { nx = -nx; ny = -ny }
    const br = bearing(nx, ny, northDeg)
    return { index: i, a, b, normal: [nx, ny] as [number, number], bearing: br, name: `${cap(dirName(br))} elevation` }
  }).filter((f) => Math.hypot(f.b[0] - f.a[0], f.b[1] - f.a[1]) > 1)
}

/** Two elevations: the face that looks most to the south, and the neighbouring face (at right angles for a box) that also looks more to the south. */
export function mainFaces(t: Tower, northDeg: number): Face[] {
  const fs = faces(t, northDeg)
  if (fs.length < 2) return fs
  const off = (f: Face) => Math.abs(((f.bearing - 180 + 540) % 360) - 180)
  const first = [...fs].sort((x, y) => off(x) - off(y))[0]
  const k = fs.indexOf(first)
  const prev = fs[(k - 1 + fs.length) % fs.length], next = fs[(k + 1) % fs.length]
  return [first, off(prev) < off(next) ? prev : next]
}

// ---------------------------------------------------------------- section and elevation
type Span = { u0: number; u1: number }

interface Body {
  title: string
  subtitle: string
  tower: Span
  podium: Span | null
  core: Span | null
  key: Parameters<typeof keyPlan>[5]
  /** Stacked blocks: each block's horizontal extent in this view and its height span (bottom-up). */
  blocks?: { span: Span; z0: number; z1: number; podium: boolean }[]
}

/** Labels in the viewer's unit (lib/units.ts convertText); paper sizes (data-keep-units) stay in millimetres. */
function localize(svg: string, unit: LengthUnit | undefined): string {
  if (!unit || unit === 'm') return svg
  return svg.replace(/<text([^>]*)>([^<]*)<\/text>/g, (all, attrs: string, body: string) => (attrs.includes('data-keep-units') ? all : `<text${attrs}>${convertText(body, unit)}</text>`))
}

function draw(t: Tower, body: Body, o: DrawOpts): Drawing {
  const floors = towerFloors(t)
  const H = Math.max(t.height, ...floors.map((f) => f.z1))
  const spans = body.blocks?.length ? body.blocks.map((b) => b.span) : [body.tower, ...(body.podium ? [body.podium] : [])]
  // The extent a floor is drawn at: the block at its mid-height, else the podium or tower span.
  const spanFor = (f: { z0: number; z1: number; podium: boolean }): Span => {
    const m = (f.z0 + f.z1) / 2, b = body.blocks?.find((x) => m >= x.z0 && m < x.z1) ?? body.blocks?.[body.blocks.length - 1]
    return b ? b.span : f.podium && body.podium ? body.podium : body.tower
  }
  const u0 = Math.min(...spans.map((s) => s.u0)) - 12, u1 = Math.max(...spans.map((s) => s.u1)) + 12
  const sheet = o.mode === 'sheet'
  const labelCol = 30, dimCol = 16
  const scale = fitScale(u1 - u0, H + 14, AREA.w - labelCol - dimCol, AREA.h - 18)
  const k = 1000 / scale // mm per m
  const dw = (u1 - u0) * k, dh = (H + 10) * k
  // Origin: drawings sit on the ground line; in tight mode the view box hugs them.
  const ox = sheet ? AREA.x + dimCol + (AREA.w - labelCol - dimCol - dw) / 2 : dimCol
  const ground = sheet ? AREA.y + 8 + Math.min(AREA.h - 26, dh) + (AREA.h - 26 - Math.min(AREA.h - 26, dh)) / 2 : 10 + dh
  const X = (u: number) => ox + (u - u0) * k, Y = (z: number) => ground - z * k
  let g = ''
  // Ground and earth.
  g += el('rect', { x: X(u0), y: Y(0), width: dw, height: 4 * k, fill: 'url(#earth)' })
  g += el('line', { x1: X(u0), y1: Y(0), x2: X(u1), y2: Y(0), stroke: INK, 'stroke-width': 0.5 })
  const isSection = body.core !== null
  for (const f of floors) {
    const s = spanFor(f)
    const fill = f.use === 'mechanical' ? 'url(#plant)' : f.skyLobby ? '#6cc0b8' : USES[f.use].color
    g += el('g', { 'data-level': f.level, 'data-use': f.use },
      el('rect', { x: X(s.u0), y: Y(f.z1), width: (s.u1 - s.u0) * k, height: (f.z1 - f.z0) * k, fill, 'fill-opacity': f.use === 'mechanical' ? 1 : f.skyLobby ? 0.7 : 0.5 })
      + el('line', { x1: X(s.u0), y1: Y(f.z0), x2: X(s.u1), y2: Y(f.z0), stroke: INK, 'stroke-width': isSection ? 0.35 : 0.12 }))
  }
  // Outline and roof.
  const outline = (s: Span, top: number) => el('rect', { x: X(s.u0), y: Y(top), width: (s.u1 - s.u0) * k, height: top * k, fill: 'none', stroke: INK, 'stroke-width': isSection ? 0.5 : 0.35 })
  if (body.blocks?.length) {
    for (const b of body.blocks) g += el('rect', { x: X(b.span.u0), y: Y(b.z1), width: (b.span.u1 - b.span.u0) * k, height: (b.z1 - b.z0) * k, fill: 'none', stroke: INK, 'stroke-width': isSection ? 0.5 : 0.35, 'data-block': '' })
  } else {
    if (body.podium && t.podiumHeight > 0) g += outline(body.podium, t.podiumHeight)
    g += el('rect', { x: X(body.tower.u0), y: Y(t.height), width: (body.tower.u1 - body.tower.u0) * k, height: (t.height - (t.podiumHeight > 0 ? t.podiumHeight : 0)) * k, fill: 'none', stroke: INK, 'stroke-width': isSection ? 0.5 : 0.35 })
  }
  // Section: the core walls (cut) and the core interior, rising 4 m above the roof for the lift overrun (team).
  if (body.core) {
    const c = body.core, wall = Math.max(0.4 * k, 0.6), top = t.height + 4
    g += el('rect', { x: X(c.u0), y: Y(top), width: (c.u1 - c.u0) * k, height: top * k, fill: '#ffffff', 'fill-opacity': 0.8, stroke: 'none', 'data-core': n(c.u1 - c.u0) })
    g += el('rect', { x: X(c.u0), y: Y(top), width: wall, height: top * k, fill: 'url(#core)', stroke: INK, 'stroke-width': 0.2 })
    g += el('rect', { x: X(c.u1) - wall, y: Y(top), width: wall, height: top * k, fill: 'url(#core)', stroke: INK, 'stroke-width': 0.2 })
    g += el('line', { x1: X(c.u0), y1: Y(top), x2: X(c.u1), y2: Y(top), stroke: INK, 'stroke-width': 0.4 })
    g += text((X(c.u0) + X(c.u1)) / 2, Y(top) - 1.2, 'core', { 'font-size': 2.1, fill: MUTED, 'text-anchor': 'middle' })
  }
  // Sky lobby labels inside the tower.
  for (const f of floors.filter((x) => x.skyLobby)) g += text(X(spanFor(f).u0) + 1.2, Y(f.z1) + 2.2, t.skyRoom?.level === f.level ? 'Public sky room' : 'Sky lobby', { 'font-size': 2, fill: '#0f5a53', 'font-weight': 700 })
  // Height dimension on the left.
  const dx = X(Math.min(...spans.map((s) => s.u0))) - 8
  g += el('line', { x1: dx, y1: Y(0), x2: dx, y2: Y(t.height), stroke: INK, 'stroke-width': 0.2 })
  for (const z of [0, t.height]) g += el('line', { x1: dx - 1.2, y1: Y(z) + 1.2, x2: dx + 1.2, y2: Y(z) - 1.2, stroke: INK, 'stroke-width': 0.3 })
  if (t.podiumHeight > 0) g += el('line', { x1: dx - 1.2, y1: Y(t.podiumHeight) + 1.2, x2: dx + 1.2, y2: Y(t.podiumHeight) - 1.2, stroke: INK, 'stroke-width': 0.3 })
  g += text(dx - 1.6, Y(t.height / 2), `${t.height.toFixed(1)} m`, { 'font-size': 2.6, 'text-anchor': 'middle', transform: `rotate(-90 ${n(dx - 1.6)} ${n(Y(t.height / 2))})` })
  // Level labels on the right.
  const lab = labelLevels(floors, k)
  const lx = X(Math.max(...spans.map((s) => s.u1))) + 3
  for (const f of lab) g += el('line', { x1: lx - 2.4, y1: Y(f.z0), x2: lx, y2: Y(f.z0), stroke: MUTED, 'stroke-width': 0.15 }) + text(lx + 0.6, Y(f.z0) - 0.5, `L${f.level}  +${f.z0.toFixed(1)}`, { 'font-size': 2.2 })
  g += el('line', { x1: lx - 2.4, y1: Y(t.height), x2: lx, y2: Y(t.height), stroke: MUTED, 'stroke-width': 0.15 }) + text(lx + 0.6, Y(t.height) - 0.5, `Roof  +${t.height.toFixed(1)}`, { 'font-size': 2.2, 'font-weight': 700 })
  const uses = [...new Set(floors.filter((f) => f.use !== 'mechanical' && !f.skyLobby).map((f) => f.use))]
  const hasPlant = floors.some((f) => f.use === 'mechanical'), hasSky = floors.some((f) => f.skyLobby)
  const bottom = Y(0) + 4 * k

  if (!sheet) {
    // Tight: drawing, labels, scale bar, a one-line title and the LOD note; the view box hugs them.
    const w = lx + 26, h = bottom + 16
    const head = text(dimCol, 6, `${body.title.toUpperCase()} · ${body.subtitle}`, { 'font-size': 3, 'font-weight': 700 })
    const foot = scaleBar(dimCol, bottom + 3, scale, o.unit) + text(dimCol, bottom + 12, `Scale bar in ${o.unit === 'ft' ? 'feet' : 'metres'} (drawn at 1:${scale}). ${LOD_NOTE}`, { 'font-size': 2, fill: MUTED, 'data-lod': '100' })
    const svg = el('svg', { xmlns: 'http://www.w3.org/2000/svg', viewBox: `0 0 ${n(w)} ${n(h)}`, width: `${n(w)}mm`, height: `${n(h)}mm`, 'font-family': FONT, 'data-drawing': body.title, 'data-scale': scale },
      defs() + el('rect', { x: 0, y: 0, width: w, height: h, fill: '#ffffff' }) + head + g + foot)
    return { svg: localize(svg, o.unit), title: body.title, scale, levels: floors.length, labelled: lab.length, widthMm: w, heightMm: h }
  }
  let side = text(COL.x, 24, body.title.toUpperCase(), { 'font-size': 6, 'font-weight': 700 }) + text(COL.x, 31, body.subtitle, { 'font-size': 3.2 })
  side += text(COL.x, 37, `${t.name} · ${t.height.toFixed(1)} m · ${floors.length} levels`, { 'font-size': 2.6, fill: MUTED })
  side += keyPlan(t, COL.x, 44, 60, o.northDeg, body.key)
  side += text(COL.x, 110, o.northDeg ? `True north ${o.northDeg}° from the model grid` : 'Grid north', { 'font-size': 2.3, fill: MUTED })
  side += legend(COL.x, 120, uses, hasPlant, hasSky, isSection)
  side += titleBlock(body.title, scale, o)
  const below = el('g', { transform: `translate(${n(AREA.x + dimCol)} ${n(SHEET.h - 30)})` }, scaleBar(0, 0, scale, o.unit) + text(0, 10, `1:${scale} at A2 (594 × 420 mm)`, { 'data-keep-units': 'paper', 'font-size': 2.8, 'font-weight': 700 }))
  const svg = el('svg', { xmlns: 'http://www.w3.org/2000/svg', viewBox: `0 0 ${SHEET.w} ${SHEET.h}`, width: '594mm', height: '420mm', 'font-family': FONT, 'data-drawing': body.title, 'data-scale': scale },
    defs() + el('rect', { x: 0, y: 0, width: SHEET.w, height: SHEET.h, fill: '#ffffff' }) + el('rect', { x: 8, y: 8, width: SHEET.w - 16, height: SHEET.h - 16, fill: 'none', stroke: INK, 'stroke-width': 0.5 }) + g + below + side)
  return { svg: localize(svg, o.unit), title: body.title, scale, levels: floors.length, labelled: lab.length, widthMm: SHEET.w, heightMm: SHEET.h }
}

/** Where a line through `o` along unit `u` crosses a convex ring, as distances along u; the ring's projection if it misses. */
function chord(ring: [number, number][], o: [number, number], u: [number, number]): Span {
  const n: [number, number] = [-u[1], u[0]]
  const ts: number[] = []
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length]
    const da = (a[0] - o[0]) * n[0] + (a[1] - o[1]) * n[1], db = (b[0] - o[0]) * n[0] + (b[1] - o[1]) * n[1]
    if ((da <= 0 && db >= 0) || (da >= 0 && db <= 0)) {
      const k = da === db ? 0 : da / (da - db)
      const x = a[0] + k * (b[0] - a[0]), y = a[1] + k * (b[1] - a[1])
      ts.push((x - o[0]) * u[0] + (y - o[1]) * u[1])
    }
  }
  const v = ts.length >= 2 ? ts : ring.map((p) => (p[0] - o[0]) * u[0] + (p[1] - o[1]) * u[1])
  return { u0: Math.min(...v), u1: Math.max(...v) }
}

/** Section A–A: a cut through the tower centre along its width, looking across its depth. */
export function sectionDrawing(t: Tower, o: DrawOpts): Drawing {
  const r = (t.rotation * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r)
  const along: [number, number] = [c, s], look: [number, number] = [-s, c]
  const half = t.width / 2, ph = t.podiumHeight > 0 ? t.podiumWidth / 2 : 0, cs = coreSide(t) / 2
  // Stacked blocks: where the cut line (through the tower centre, along its width) crosses each block's plate.
  const blocks = t.imported || !t.blocks?.length ? undefined : blockSpans(t).map((b) => ({ span: chord(b.ring, [t.x, t.y], along), z0: b.z0, z1: b.z1, podium: b.podium }))
  return draw(t, {
    title: 'Section A–A', subtitle: `Looking ${dirName(bearing(look[0], look[1], o.northDeg))}, through the core`,
    tower: { u0: -half, u1: half }, podium: ph ? { u0: -ph, u1: ph } : null, core: { u0: -cs, u1: cs }, blocks,
    key: { kind: 'cut', a: [t.x - along[0] * half, t.y - along[1] * half], b: [t.x + along[0] * half, t.y + along[1] * half], look },
  }, o)
}

/** Elevation of one face, seen from outside: everything projected onto the face's direction. */
export function elevationDrawing(t: Tower, face: Face, o: DrawOpts): Drawing {
  const ux = face.b[0] - face.a[0], uy = face.b[1] - face.a[1], L = Math.hypot(ux, uy) || 1
  const proj = (p: [number, number]) => ((p[0] - face.a[0]) * ux + (p[1] - face.a[1]) * uy) / L
  const span = (poly: [number, number][]): Span => { const v = poly.map(proj); return { u0: Math.min(...v), u1: Math.max(...v) } }
  return draw(t, {
    title: face.name, subtitle: `Face looking ${dirName(face.bearing)}, seen from outside`,
    tower: span(towerFootprint(t)), podium: t.podiumHeight > 0 ? span(towerFootprint(t, true)) : null, core: null,
    blocks: t.imported || !t.blocks?.length ? undefined : blockSpans(t).map((b) => ({ span: span(b.ring), z0: b.z0, z1: b.z1, podium: b.podium })),
    key: { kind: 'face', a: face.a, b: face.b, normal: face.normal },
  }, o)
}
