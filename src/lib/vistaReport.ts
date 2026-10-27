// Vista-style PDF view study, rebuilt for Tower Design Toolkit (Vista v09 report.js idea: cover sentence, key plan, one page
// per protected view with the eye-level render and a section, then sources). Every number carries its evidence flag
// (glyph + word; false assumptions in magenta). Renders come from the Real Vancouver scene: real buildings and the
// MRDEM-30 North Shore terrain, not Vista's SRTM backdrop.
import type { Flag } from '../engine/types'
import { CONE_PARAMS, STATE_LABEL, type Cone, type ConeState } from '../engine/viewCones'
import { VISTA_FALSE_ASSUMPTIONS, frameDistances, frameScaleError, type CeilingResult, type ExactCone, type PlaneEntry, type Pt } from '../engine/vista'
import { Doc, PT, wrap } from './pdf/miniPdf'

const INK = '#1f2328', MUTED = '#62666d', LINE = '#d9d6cf', ACCENT = '#1f5f8b', PAPER = '#f7f5f0'
const FLAG: Record<Flag, { label: string; color: string }> = {
  verified: { label: 'Verified', color: '#1f6b42' },
  team_assumption: { label: 'Team assumption', color: '#8a5a00' },
  unverified: { label: 'Unverified', color: '#6b6f76' },
  unresolved: { label: 'Unresolved', color: '#6e5800' },
  false_assumption: { label: 'False assumption', color: '#b8137a' },
}
const STATE_COLOR: Record<ConeState, string> = { above: '#d0453a', limit_unknown: '#8a8f98', within_uncertainty: '#d98b1c', near_edge: '#4a90c2', clear: '#2e8b57', outside: '#c9ccd1' }

export interface ReportView {
  cone: Cone
  shot: string | null
  /** Eye elevation used (City Lv) and Vista's reconstructed eye. */
  eye: number
  vistaEye: number | null
  hfov: number
  vistaHfov: number
  spread: number
  vistaSpread: number
  bearing: number
  pitch: number
  aspect: number
}
export interface ReportInput {
  towerName: string
  height: number
  ground: number
  groundBasis: string
  /** EPSG:26910 corners. */
  footprint: Pt[]
  sentence: string
  exact: ExactCone[]
  whatIf: { result: CeilingResult; entries: Record<string, PlaneEntry> } | null
  views: ReportView[]
  /** Terrain (CGVD28 m) at an EPSG:26910 point, or null. */
  terrain: (x: number, y: number) => number | null
  date: string
}

const fmt = (v: number | null | undefined, d = 1) => (v == null || !Number.isFinite(v) ? '–' : v.toLocaleString('en-CA', { minimumFractionDigits: d, maximumFractionDigits: d }))
const M = 36

type D = Doc
type P = ReturnType<Doc['page']>

/** Evidence chip: a glyph and the word, in the app's flag colours. */
function chip(doc: D, p: P, x: number, y: number, flag: Flag): number {
  const f = FLAG[flag], w = 14 + f.label.length * 4.3
  doc.roundRect(p, x, y - 7.5, w, 10.5, 2.5, { fill: f.color })
  const gx = x + 5.5, gy = y - 2.3
  if (flag === 'verified') doc.poly(p, [[gx - 2.6, gy], [gx - 0.8, gy + 1.9], [gx + 2.6, gy - 2]], { stroke: '#ffffff', width: 1.1, close: false })
  else if (flag === 'false_assumption') { doc.line(p, gx - 2.2, gy - 2.2, gx + 2.2, gy + 2.2, '#ffffff', 1.1); doc.line(p, gx - 2.2, gy + 2.2, gx + 2.2, gy - 2.2, '#ffffff', 1.1) }
  else if (flag === 'team_assumption') { doc.circle(p, gx - 1.3, gy, 1.5, { fill: '#ffffff' }); doc.circle(p, gx + 1.7, gy, 1.5, { fill: '#ffffff' }) }
  else if (flag === 'unresolved') doc.circle(p, gx, gy, 2.6, { stroke: '#ffffff', width: 0.9, dash: [1.2, 1] })
  else doc.text(p, gx, gy + 2.6, '?', 7.5, true, '#ffffff', { align: 'center' })
  doc.text(p, x + 10.5, y, f.label, 6.6, true, '#ffffff')
  return w
}

function header(doc: D, p: P, title: string, sub: string, page: number) {
  doc.rect(p, 0, 0, PT.w, PT.h, PAPER)
  doc.text(p, M, 26, 'TOWER STUDIO · REAL VANCOUVER · VISTA VIEW STUDY', 6.8, true, MUTED, { spacing: 0.6 })
  doc.text(p, PT.w - M, 26, `p. ${page}`, 6.8, false, MUTED, { align: 'right' })
  doc.text(p, M, 48, title, 15, true, INK)
  if (sub) doc.text(p, M, 62, sub, 8, false, MUTED)
  doc.line(p, M, 70, PT.w - M, 70, LINE, 0.6)
  doc.text(p, M, PT.h - 16, 'Estimates for design study only. The City of Vancouver View Cone Assessment governs. Tower Design Toolkit (MIT); view-study kernels after Vista by Ruijie Liu (ARCH 540).', 6.2, false, MUTED)
}

function relation(e: ExactCone) {
  return e.overlapM2 > 0 ? `${fmt(e.overlapM2, 0)} m² inside` : `${fmt(e.gapM, 1)} m outside`
}

/** Cover: the study sentence and every cone at or near the footprint. */
function cover(doc: D, inp: ReportInput) {
  const p = doc.page()
  header(doc, p, `${inp.towerName}: protected views`, `${inp.date} · top ${fmt(inp.ground + inp.height)} m CGVD28 = base ${fmt(inp.ground)} m (${inp.groundBasis}) + height ${fmt(inp.height)} m`, 1)
  let y = doc.paragraph(p, M, 92, inp.sentence, 10.5, PT.w - 2 * M - 220, { color: INK, leading: 1.35 }) + 10
  // legend
  const lx = PT.w - M - 196
  doc.roundRect(p, lx, 80, 196, 118, 5, { fill: '#ffffff', stroke: LINE, width: 0.6 })
  doc.text(p, lx + 10, 96, 'Evidence flags', 8, true, INK)
  ;(['verified', 'team_assumption', 'unverified', 'unresolved', 'false_assumption'] as Flag[]).forEach((f, i) => {
    chip(doc, p, lx + 10, 114 + i * 17, f)
    doc.text(p, lx + 98, 114 + i * 17, ['opened, cited source', 'team preset, editable', 'source not opened', 'relationship not found', 'found wrong, kept with fix'][i], 6.4, false, MUTED)
  })
  y = Math.max(y, 222)
  doc.text(p, M, y, 'Protected views at this footprint (City ViewCone layer, plan polygons)', 9, true, INK)
  y += 14
  const cols = ['View', 'Plan relation (exact)', 'State', 'Limit, sampled', 'Limit, exact', 'Top − limit', 'Evidence for the limit']
  const xs = [M, M + 150, M + 265, M + 380, M + 460, M + 540, M + 620]
  cols.forEach((c, i) => doc.text(p, xs[i], y, c, 7, true, MUTED))
  y += 5; doc.line(p, M, y, PT.w - M, y, LINE, 0.6); y += 12
  const rows = inp.exact.filter((e) => e.overlapM2 > 0 || (e.gapM ?? Infinity) <= 60)
  if (!rows.length) { doc.text(p, M, y, 'No protected view within 60 m of the footprint. Outside the mapped cones does not mean unlimited height.', 8, false, INK); y += 14 }
  for (const e of rows.slice(0, 18)) {
    const prm = CONE_PARAMS[e.cone.id]
    const top = inp.ground + inp.height
    doc.text(p, xs[0], y, `${e.cone.id} · ${e.cone.name}`.slice(0, 34), 7.6, true, INK)
    doc.text(p, xs[1], y, relation(e), 7.6, false, INK)
    doc.circle(p, xs[2] + 3, y - 2.6, 3, { fill: STATE_COLOR[e.state] })
    doc.text(p, xs[2] + 9, y, STATE_LABEL[e.state], 7.6, false, INK)
    doc.text(p, xs[3], y, e.sampledLimit == null ? '–' : `${fmt(e.sampledLimit, 2)} m`, 7.6, false, INK)
    doc.text(p, xs[4], y, e.exactLimit == null ? (e.overlapM2 > 0 && !prm ? 'no estimate' : '–') : `${fmt(e.exactLimit, 2)} m`, 7.6, false, INK)
    doc.text(p, xs[5], y, e.exactLimit == null ? '–' : `${top - e.exactLimit >= 0 ? '+' : ''}${fmt(top - e.exactLimit, 1)} m`, 7.6, false, e.exactLimit != null && top - e.exactLimit > 0 ? '#b3261e' : INK)
    if (e.overlapM2 > 0) chip(doc, p, xs[6], y, prm ? prm.flag : 'unresolved')
    y += 15
  }
  y += 4
  doc.paragraph(p, M, y, 'Sampled: Tower Design Toolkit\'s View-cone height check (2 m along edges, 5 m grid inside). Exact: Vista\'s clipping kernel on the same planar estimate Z = Lv + k·D, evaluated at the vertices of the clipped overlap, where a plane takes its lowest value. The exact limit can only be equal or lower; a difference shows how much the sampling missed. Cones with no estimate stay "no estimate": no number is invented.', 7, PT.w - 2 * M, { color: MUTED })
  if (inp.whatIf && inp.whatIf.result.status !== 'outside') {
    const r = inp.whatIf.result
    y = doc.paragraph(p, M, y + 44, `Your what-if study planes (Vista v10): ${r.status === 'ready' || r.status === 'partial' ? `lowest plane ${fmt(r.ceilingElevationM, 2)} m CGVD28 (view ${r.limitingView}), ${fmt(r.maxHeightM, 1)} m above the base, clearance ${fmt(r.clearanceM, 1)} m${r.missingViews.length ? `; no plane entered for ${r.missingViews.join(', ')}` : ''}` : `no plane entered for ${r.missingViews.join(', ')}`}. These are the team's own planes, not City limits.`, 8, PT.w - 2 * M - 110, { color: INK })
    chip(doc, p, PT.w - M - 95, y - 8, 'team_assumption')
  }
}

/** Key plan: the cones in play, the footprint, the origins; north up, scale bar. */
function keyPlan(doc: D, inp: ReportInput, page: number) {
  const p = doc.page()
  header(doc, p, 'Key plan', 'North up · EPSG:26910 (UTM 10N) grid · City ViewCone polygons (OGL-Vancouver) · origins are the City apexes', page)
  const shown = inp.exact.filter((e) => e.overlapM2 > 0 || (e.gapM ?? Infinity) <= 60).map((e) => e.cone)
  const views = inp.views.map((v) => v.cone)
  const cones = [...new Map([...shown, ...views].map((c) => [c.id, c])).values()]
  const pts: Pt[] = [...inp.footprint, ...cones.flatMap((c) => c.ring)]
  const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1])
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys)
  const box = { x: M, y: 84, w: 470, h: 470 }
  const s = Math.min(box.w / Math.max(1, x1 - x0), box.h / Math.max(1, y1 - y0)) * 0.92
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2
  const X = (x: number) => box.x + box.w / 2 + (x - cx) * s, Y = (y: number) => box.y + box.h / 2 - (y - cy) * s
  doc.rect(p, box.x, box.y, box.w, box.h, '#ffffff', LINE)
  doc.clip(p, box.x, box.y, box.w, box.h, () => {
    for (const c of cones) {
      const prm = CONE_PARAMS[c.id]
      const e = inp.exact.find((k) => k.cone.id === c.id)
      const color = e && e.state !== 'outside' ? STATE_COLOR[e.state] : prm ? '#4f7fae' : '#7d838c'
      doc.poly(p, c.ring.map(([x, y]) => [X(x), Y(y)]), { fill: color, alpha: 0.12, stroke: color, width: 0.8, dash: prm ? undefined : [4, 3] })
      const [ox, oy] = c.ring[0]
      doc.circle(p, X(ox), Y(oy), 2.6, { fill: color })
    }
    doc.poly(p, inp.footprint.map(([x, y]) => [X(x), Y(y)]), { fill: INK, stroke: INK, width: 0.6 })
  })
  const labelled = new Set<string>()
  for (const c of cones) {
    const key = `${Math.round(c.ring[0][0])},${Math.round(c.ring[0][1])}`
    const ids = cones.filter((k) => `${Math.round(k.ring[0][0])},${Math.round(k.ring[0][1])}` === key).map((k) => k.id)
    if (labelled.has(key)) continue
    labelled.add(key)
    const lx = X(c.ring[0][0]), ly = Y(c.ring[0][1])
    if (lx > box.x && lx < box.x + box.w && ly > box.y && ly < box.y + box.h) doc.text(p, lx + 5, ly + 3, `${ids.join(', ')} origin`, 6.5, true, INK)
  }
  // north arrow and scale bar
  doc.poly(p, [[box.x + box.w - 22, box.y + 34], [box.x + box.w - 16, box.y + 16], [box.x + box.w - 10, box.y + 34], [box.x + box.w - 16, box.y + 29]], { fill: INK })
  doc.text(p, box.x + box.w - 16, box.y + 44, 'N', 7, true, INK, { align: 'center' })
  const nice = [100, 200, 250, 500, 1000, 2000]
  const len = nice.reduce((b, v) => (v * s <= 140 ? v : b), 100)
  doc.rect(p, box.x + 14, box.y + box.h - 22, len * s, 4, INK)
  doc.text(p, box.x + 14, box.y + box.h - 26, `${len.toLocaleString('en-CA')} m`, 6.5, false, INK)
  // right column: frame rule and eyes
  const rx = box.x + box.w + 22, rw = PT.w - M - rx
  let y = 92
  const fe = frameScaleError()
  const c0 = inp.footprint.reduce<[number, number]>((a, q) => [a[0] + q[0] / inp.footprint.length, a[1] + q[1] / inp.footprint.length], [0, 0])
  const frameText = `Vista's legacy frame used the equator's degree lengths: at 49.28 N it reads north–south distances ${fmt(-fe.northSouth * 100, 2)}% short and east–west ${fmt(-fe.eastWest * 100, 2)}% short. Corrected: every Vista coordinate is converted through latitude/longitude into EPSG:26910; nothing here is measured in the legacy frame.`
  const distLines = inp.views.slice(0, 3).map((v) => { const d = frameDistances(v.cone.ring[0], c0); return `${v.cone.id} origin to tower: ${fmt(d.grid, 1)} m (grid) vs ${fmt(d.vista, 1)} m (Vista frame)` })
  // Size the box to its text before drawing it, so nothing below can run into it.
  const boxH = 30 + wrap(frameText, 7.2, rw - 16).length * 7.2 * 1.32 + distLines.reduce((s, l) => s + wrap(l, 7, rw - 16).length * 7 * 1.32, 0) + 6
  doc.roundRect(p, rx, y - 10, rw, boxH, 4, { fill: '#fdf0f7', stroke: FLAG.false_assumption.color, width: 0.8 })
  chip(doc, p, rx + 8, y + 4, 'false_assumption')
  y = doc.paragraph(p, rx + 8, y + 18, frameText, 7.2, rw - 16, { color: INK }) + 2
  for (const l of distLines) y = doc.paragraph(p, rx + 8, y, l, 7, rw - 16, { color: MUTED })
  y = 92 - 10 + boxH + 20
  doc.text(p, rx, y, 'Eye at each origin: Tower Design Toolkit vs Vista', 8.5, true, INK)
  y += 14
  for (const v of inp.views.slice(0, 12)) {
    doc.text(p, rx, y, `${v.cone.id}`, 7.4, true, INK)
    doc.text(p, rx + 34, y, `Lv ${fmt(v.eye, 2)} m`, 7.4, false, INK)
    doc.text(p, rx + 100, y, `Vista ${fmt(v.vistaEye, 1)} m`, 7.4, false, MUTED)
    doc.text(p, rx + 170, y, v.vistaEye == null ? '' : `Vista - Lv ${v.vistaEye - v.eye >= 0 ? '+' : ''}${fmt(v.vistaEye - v.eye, 1)} m`, 7.4, false, MUTED)
    y += 12
  }
  y += 4
  chip(doc, p, rx, y, 'verified'); doc.text(p, rx + 50, y, 'Lv: City ViewCone service (C04 r3)', 6.6, false, MUTED); y += 14
  chip(doc, p, rx, y, 'unverified'); doc.text(p, rx + 58, y, 'Vista: SRTM 60 m (EGM96) + 1.6 m, reconstructed', 6.6, false, MUTED)
}

/** Section along the cone axis: terrain profile, the estimated lower boundary, any what-if plane, the tower. */
function section(doc: D, p: P, inp: ReportInput, v: ReportView, box: { x: number; y: number; w: number; h: number }) {
  const O = v.cone.ring[0], a = (v.bearing * Math.PI) / 180, u: Pt = [Math.sin(a), Math.cos(a)]
  const c0 = inp.footprint.reduce<[number, number]>((acc, q) => [acc[0] + q[0] / inp.footprint.length, acc[1] + q[1] / inp.footprint.length], [0, 0])
  const along = (q: Pt) => (q[0] - O[0]) * u[0] + (q[1] - O[1]) * u[1]
  const ds = inp.footprint.map(along), dMin = Math.min(...ds), dMax = Math.max(...ds)
  const L = Math.max(dMax * 1.15, 500)
  const prof: [number, number][] = []
  for (let i = 0; i <= 160; i++) { const d = (L * i) / 160, z = inp.terrain(O[0] + u[0] * d, O[1] + u[1] * d); if (z != null) prof.push([d, z]) }
  const top = inp.ground + inp.height
  const prm = CONE_PARAMS[v.cone.id]
  const limitAt = (d: number) => (prm ? v.cone.Lv + prm.k * d : null)
  const zs = [top, v.eye, ...prof.map((q) => q[1]), ...(prm ? [limitAt(L)!] : [])]
  const zMin = Math.min(0, ...zs), zMax = Math.max(...zs) * 1.08 + 5
  const sx = box.w / L, sz = box.h / (zMax - zMin)
  const ex = sz / sx
  const X = (d: number) => box.x + d * sx, Z = (z: number) => box.y + box.h - (z - zMin) * sz
  doc.rect(p, box.x, box.y, box.w, box.h, '#ffffff', LINE)
  if (prof.length > 1) doc.poly(p, [[X(prof[0][0]), Z(zMin)], ...prof.map(([d, z]) => [X(d), Z(z)] as [number, number]), [X(prof[prof.length - 1][0]), Z(zMin)]], { fill: '#d8d3c8', stroke: '#9a948a', width: 0.5 })
  if (prm) doc.line(p, X(0), Z(v.cone.Lv), X(L), Z(limitAt(L)!), ACCENT, 1.1)
  const wi = inp.whatIf?.entries[v.cone.id]
  if (wi && wi.elevation != null && wi.pitch != null) {
    const b = ((wi.bearing ?? v.bearing) - v.bearing) * (Math.PI / 180)
    const k = Math.tan((wi.pitch * Math.PI) / 180) * Math.cos(b)
    doc.line(p, X(0), Z(wi.elevation), X(L), Z(wi.elevation + k * L), '#c2410c', 1, { dash: [4, 3] })
  }
  doc.rect(p, X(dMin), Z(top), Math.max(1.5, X(dMax) - X(dMin)), Z(inp.ground) - Z(top), INK)
  doc.circle(p, X(0), Z(v.eye), 2.4, { fill: '#d97706' })
  doc.text(p, box.x + 4, box.y + 10, `Section along the ${v.cone.id} axis · vertical ×${fmt(ex, 0)} · ${fmt(L / 1000, 2)} km`, 6.6, true, INK)
  doc.text(p, box.x + 4, box.y + 20, prm ? `Blue: estimated lower boundary Z = Lv + k·D (k ${prm.k})` : 'No estimated lower boundary for this view', 6.4, false, prm ? ACCENT : MUTED)
  if (wi && wi.elevation != null && wi.pitch != null) doc.text(p, box.x + 4, box.y + 29, 'Orange dashed: your what-if plane (team assumption)', 6.4, false, '#c2410c')
  doc.text(p, box.x + box.w - 4, box.y + box.h - 4, 'Ground: City LiDAR 1 m / MRDEM 30 m, CGVD28', 6, false, MUTED, { align: 'right' })
  return { dCentre: along(c0) }
}

function viewPage(doc: D, inp: ReportInput, v: ReportView, page: number) {
  const p = doc.page()
  const e = inp.exact.find((k) => k.cone.id === v.cone.id)
  header(doc, p, `View ${v.cone.id} · ${v.cone.name}`, `Subject: ${v.cone.subject} · from the City origin, looking ${fmt(v.bearing, 1)}° along the cone axis`, page)
  const iw = PT.w - 2 * M, ih = Math.min(250, iw / v.aspect)
  if (v.shot) doc.image(p, v.shot, M, 80, iw, ih)
  else { doc.rect(p, M, 80, iw, ih, '#ebe8e1', LINE); doc.text(p, PT.w / 2, 80 + ih / 2, 'No render: open the Real Vancouver 3D view before exporting to include eye-level renders.', 8, false, MUTED, { align: 'center' }) }
  doc.paragraph(p, M, 80 + ih + 11, `Eye ${fmt(v.eye, 2)} m CGVD28 (the City's Lv at this origin) · horizontal field ${fmt(v.hfov, 1)}° (Vista's cone-fit rule) · pitch ${fmt(v.pitch, 1)}° · real ground and buildings: City LiDAR 2022 roofs in the core and the City's 2009 heights around it (older survey), MRDEM-30 terrain (NRCan) to the North Shore mountains, converted to CGVD28; no haze. Buildings without a LiDAR height are not drawn, so the view is optimistic.`, 6.8, iw, { color: MUTED })
  const top = 80 + ih + 34
  const secBox = { x: M, y: top, w: 430, h: PT.h - top - 30 }
  const { dCentre } = section(doc, p, inp, v, secBox)
  // numbers
  const rx = M + 448, rw = PT.w - M - rx
  let y = top + 8
  const prm = CONE_PARAMS[v.cone.id]
  const row = (label: string, value: string, flag: Flag, note?: string) => {
    doc.text(p, rx, y, label, 7, true, INK)
    doc.text(p, rx + 112, y, value, 7, false, flag === 'false_assumption' ? FLAG.false_assumption.color : INK)
    chip(doc, p, rx + rw - 86, y, flag)
    y += 10
    if (note) y = doc.paragraph(p, rx, y, note, 6.2, rw - 4, { color: MUTED }) + 2
    y += 3
  }
  row('Eye, Tower Design Toolkit', `${fmt(v.eye, 2)} m (City Lv)`, 'verified')
  row('Eye, Vista', v.vistaEye == null ? '–' : `${fmt(v.vistaEye, 1)} m (${v.vistaEye - v.eye >= 0 ? '+' : ''}${fmt(v.vistaEye - v.eye, 1)} m)`, 'unverified', 'SRTM 60 m ground (EGM96) at the apex + 1.6 m, reconstructed; Lv is the City\'s eye elevation.')
  row('Field of view', `${fmt(v.hfov, 1)}° (Vista frame ${fmt(v.vistaHfov, 1)}°)`, 'team_assumption', `clamp(1.5 × spread + 8, 24, 100); spread ${fmt(v.spread, 2)}° in the grid, ${fmt(v.vistaSpread, 2)}° as Vista measured it.`)
  const d = frameDistances(v.cone.ring[0], inp.footprint.reduce<[number, number]>((acc, q) => [acc[0] + q[0] / inp.footprint.length, acc[1] + q[1] / inp.footprint.length], [0, 0]))
  row('Origin to tower', `${fmt(d.grid, 1)} m grid · ${fmt(d.vista, 1)} m Vista`, 'false_assumption', `Vista's frame is short by ${fmt(d.grid - d.vista, 1)} m here; the grid value is used. Along the axis: ${fmt(dCentre, 0)} m.`)
  if (e && e.overlapM2 > 0) {
    if (prm) {
      row('Limit at the footprint', `${fmt(e.exactLimit, 2)} m exact · ${fmt(e.sampledLimit, 2)} m sampled`, prm.flag, `${prm.source}. ±${prm.u95} m (95%). Exact is Vista's clipped-vertex minimum; sampled is the View-cone check.`)
      row('Top minus limit', `${(inp.ground + inp.height - (e.exactLimit ?? 0)) >= 0 ? '+' : ''}${fmt(inp.ground + inp.height - (e.exactLimit ?? 0), 1)} m (${STATE_LABEL[e.state]})`, prm.flag)
    } else row('Limit at the footprint', 'No estimate', 'unresolved', 'No City reference or Council report gives this view\'s slope yet: no number is invented (City Request 0).')
    row('Plan overlap', `${fmt(e.overlapM2, 0)} m² grid · ${fmt(e.vistaFrameM2, 0)} m² Vista`, 'verified', 'Exact polygon clip of the footprint and the City polygon.')
  } else if (e) row('Plan relation', `${fmt(e.gapM, 1)} m outside the cone`, 'verified')
  const wi = inp.whatIf?.entries[v.cone.id]
  if (wi && wi.elevation != null && wi.pitch != null) row('Your what-if plane', `${fmt(wi.elevation, 2)} m at origin, ${fmt(wi.pitch, 2)}°`, 'team_assumption', wi.note ? `Source given: ${wi.note}` : 'No source given.')
}

function sources(doc: D, inp: ReportInput, page: number) {
  const p = doc.page()
  header(doc, p, 'Sources, frame and limits', '', page)
  let y = 92
  const src: [Flag, string][] = [
    ['verified', 'City of Vancouver ViewCone layer (24 plan polygons, origins and viewpoint elevations Lv), Open Government Licence - Vancouver, retrieved 2026-10-21.'],
    ['verified', 'City of Vancouver, Public Views Guidelines, approved 2024-07-10, amended 2026-02-04 (the team copy in Vista matches SHA-256 597f0da2…b0ca, the Feb 2026 copy in research C01).'],
    ['verified', 'Planar slopes k for A and 3.2.3 (City site sheet, 3 Oct 2024), 28, 27.1, 27.2 (Council reports); 3.2.4, H, J2 endorsed values are team assumptions (research C01).'],
    ['unverified', 'Terrain: NRCan MRDEM-30 (Open Government Licence - Canada), CGVD2013 converted to CGVD28 with NRCan grids; City LiDAR 2022 1 m ground and roof parts in the core, City Building footprints 2009 heights around it (OGL-Vancouver).'],
    ['team_assumption', 'Vista cone-fit camera rule (hfov = clamp(1.5 × spread + 8, 24, 100), pitch rule) and eye height 1.6 m where no Lv exists.'],
    ['unverified', 'Vista v10.1 (Ruijie Liu, ARCH 540, handoff 22 Oct 2026): exact cone clip, study planes, report layout and examples, ported into Tower Design Toolkit (MIT). Vista was read, not run.'],
  ]
  doc.text(p, M, y, 'Sources', 9, true, INK); y += 14
  for (const [f, s] of src) { chip(doc, p, M, y, f); y = doc.paragraph(p, M + 98, y, s, 7.4, PT.w - 2 * M - 100, { color: INK }) + 5 }
  y += 6
  doc.text(p, M, y, 'False assumptions, corrected', 9, true, FLAG.false_assumption.color); y += 14
  for (const f of VISTA_FALSE_ASSUMPTIONS) {
    chip(doc, p, M, y, 'false_assumption')
    y = doc.paragraph(p, M + 98, y, `${f.claim}. Correction: ${f.correction}`, 7.2, PT.w - 2 * M - 100, { color: INK }) + 5
  }
  y += 6
  doc.text(p, M, y, 'Limits', 9, true, INK); y += 14
  const limits = 'Only 8 of 24 views have a slope estimate; the others read "no estimate". The planar form Z = Lv + k·D and whether each lower boundary is sloped or horizontal are unresolved per view (research C04). Buildings without a LiDAR height (most of downtown outside the processed tile) are not drawn or tested, so renders and sightlines are optimistic. Imported or parametric massing is tested by its outline; what-if planes are the team\'s own and never a City limit. Plan coordinates EPSG:26910; heights CGVD28.'
  for (const ln of wrap(limits, 7.4, PT.w - 2 * M)) { doc.text(p, M, y, ln, 7.4, false, INK); y += 10 }
  doc.text(p, M, PT.h - 30, `Generated ${inp.date} by Tower Design Toolkit in the browser; nothing was uploaded.`, 6.6, false, MUTED)
}

export function buildVistaReport(inp: ReportInput): Blob {
  const doc = new Doc({ title: `${inp.towerName}: protected views (Vista view study)`, subject: 'Tower Design Toolkit · Real Vancouver', author: 'Tower Design Toolkit' })
  cover(doc, inp)
  keyPlan(doc, inp, 2)
  inp.views.forEach((v, i) => viewPage(doc, inp, v, 3 + i))
  sources(doc, inp, 3 + inp.views.length)
  return doc.build()
}
