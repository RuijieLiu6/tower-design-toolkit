// Case studies to start a massing from (13 Nov, Sinnie: the Massing tool starts with "start from scratch, import, or
// start through case study"; 17 Nov: "the tower case study should be accurate to what it looks like"). Each is a known
// tower built as the toolkit's stacked blocks (engine/blocks.ts), so its form reads at a glance and every check, the
// Scale tool, the block editor and the Typology sliders work on it: Trump's 45° twist, the Gherkin's bulge, Vancouver
// House's plate growing out over the street, 432 Park's open mechanical floors, Aqua's wavy plates, the Leadenhall
// wedge on its open base. Heights and storey counts are the published figures (to check against the source before
// quoting); plate sizes, podiums, floor-to-floor and the profiles are team approximations read from drawings and
// photographs, not survey data. Round and elliptical plans are drawn as rectangles of the same floor area.
import type { Block, Flag, Tower, UseId } from '../engine/types'
import { formBlocks } from '../engine/towerForms'

export interface CaseBuild { blocks: Block[]; form?: Tower['form']; podiumUse?: UseId }
export interface CaseStudy {
  id: string
  name: string
  place: string
  architect: string
  year: number
  /** Published height to the roof, m. */
  height: number
  storeys: number
  /** Storey height of the shaft (m), from the published height and storeys. */
  f2f: number
  /** What the blocks leave out. */
  note: string
  flag: Flag
  /** The elevation the list's glyph draws: along x (widths) or y (depths, for forms that lean or taper one way). */
  glyph?: 'x' | 'y'
  build: () => CaseBuild
}

let n = 0
const blk = (name: string, w: number, d: number, h: number, dx = 0, dy = 0, rotation = 0): Block => ({ id: `c${n++}`, name, width: +w.toFixed(2), depth: +d.toFixed(2), height: +h.toFixed(3), dx: +dx.toFixed(2), dy: +dy.toFixed(2), rotation })
const podium = (w: number, d: number, storeys: number, f2f: number, use?: UseId): Block => ({ ...blk('Podium', w, d, storeys * f2f), podium: true, f2f, ...(use ? { use } : {}) })
/** Storeys bottom-up as blocks: `plate(t)` gives the plate at 0 ≤ t ≤ 1 (mid-height of each group of `per` storeys). */
function stack(name: string, storeys: number, f2f: number, per: number, plate: (t: number, i: number) => { w: number; d: number; dx?: number; dy?: number; rot?: number }): Block[] {
  const out: Block[] = []
  for (let i = 0; i < storeys; i += per) {
    const k = Math.min(per, storeys - i), p = plate((i + k / 2) / storeys, out.length)
    out.push(blk(`${name} ${out.length + 1}`, p.w, p.d, k * f2f, p.dx ?? 0, p.dy ?? 0, p.rot ?? 0))
  }
  return out
}
const SQ = Math.sqrt(Math.PI) / 2 // side of the square with a circle's area, per unit of diameter

export const CASE_STUDIES: CaseStudy[] = [
  { id: 'shangri-la-vancouver', name: 'Shangri-La Vancouver', place: 'Vancouver', architect: 'James K.M. Cheng', year: 2008, height: 201, storeys: 62, f2f: 3.19,
    note: 'A thin slab: 15 hotel storeys, then the residential floors stepping in a little on one side, over a four-storey retail and lobby base. Plates approximate.', flag: 'unverified',
    build: () => ({ podiumUse: 'retail', blocks: [podium(58, 42, 4, 4, 'retail'), blk('Hotel floors', 46, 24, 15 * 3.19), blk('Residential floors', 44, 24, 43 * 3.19, -1, 0)] }) },
  { id: 'trump-vancouver', name: 'Trump International Hotel & Tower', place: 'Vancouver', architect: 'Arthur Erickson', year: 2016, height: 188, storeys: 63, f2f: 2.88,
    note: 'The 45° twist over the height is modelled as a turning stack of plates (the Typology sliders adjust it); the rounded oval plan is drawn as a rectangle.', flag: 'unverified',
    build: () => { const base = { w: 36, d: 26, h: 59 * 2.88, f2f: 2.88 }, p = { twist: 45, twistTaper: 1 }
      return { podiumUse: 'retail', blocks: [podium(50, 40, 4, 4.5, 'retail'), ...formBlocks('twist', p, base)], form: { type: 'twist', p, base } } } },
  { id: 'st-mary-axe', name: '30 St Mary Axe', place: 'London', architect: 'Foster + Partners', year: 2004, height: 180, storeys: 41, f2f: 4.39,
    note: 'The bulge: 49 m across at the ground, widest (57 m) at the 16th floor, narrowing to the dome. The round plan is drawn as a square of the same area each storey.', flag: 'unverified',
    build: () => ({ blocks: stack('Floor', 41, 4.39, 1, (t) => { const d = t <= 0.39 ? 49.3 + 7.2 * Math.sin((Math.PI / 2) * (t / 0.39)) : 56.5 - 30.5 * (1 - Math.cos(Math.PI * ((t - 0.39) / 0.61))) / 2; return { w: d * SQ, d: d * SQ } }) }) },
  { id: 'vancouver-house', name: 'Vancouver House', place: 'Vancouver', architect: 'BIG', year: 2020, height: 156, storeys: 49, f2f: 3.1, glyph: 'y',
    note: 'The plate starts thin beside the bridge and grows out over the street until the full rectangle at about the 30th floor; one face stays plumb. The triangular lowest floors are drawn as thin rectangles.', flag: 'unverified',
    build: () => ({ podiumUse: 'retail', blocks: [podium(60, 40, 2, 5, 'retail'), ...stack('Floor', 47, 3.1, 2, (t) => { const d = t < 0.6 ? 11 + 13 * (t / 0.6) : 24; return { w: 42, d, dy: (24 - d) / 2 } })] }) },
  { id: 'one-wall-centre', name: 'One Wall Centre', place: 'Vancouver', architect: 'Busby + Associates', year: 2001, height: 150, storeys: 48, f2f: 3.09,
    note: 'A slim elliptical shaft (about 44 × 26 m) drawn as a rectangle of the same floor area, over a low base.', flag: 'unverified',
    build: () => ({ podiumUse: 'retail', blocks: [podium(55, 40, 2, 4, 'retail'), blk('Tower', 40, 22.5, 46 * 3.09)] }) },
  { id: '432-park', name: '432 Park Avenue', place: 'New York', architect: 'Rafael Viñoly', year: 2015, height: 426, storeys: 85, f2f: 5,
    note: 'A 28.5 m square tube with open double-storey mechanical floors every twelve storeys, drawn as the core alone (10 m square) so the gaps read.', flag: 'unverified',
    build: () => { const b: Block[] = []; for (let k = 0; k < 6; k++) { b.push(blk(`Floors ${k * 14 + 1}–${k * 14 + 12}`, 28.5, 28.5, 12 * 5)); if (k < 5) b.push(blk('Open mechanical floors', 10, 10, 2 * 5)) } b.push(blk('Top floors', 28.5, 28.5, 3 * 5)); return { blocks: b } } },
  { id: 'aqua-chicago', name: 'Aqua', place: 'Chicago', architect: 'Studio Gang', year: 2009, height: 262, storeys: 82, f2f: 3.12,
    note: 'A slab whose plates swell in and out from floor to floor (the balconies), over a three-storey base; the waves are drawn as a plate that changes size and shifts every two storeys.', flag: 'unverified',
    build: () => ({ podiumUse: 'retail', blocks: [podium(75, 55, 3, 5, 'retail'), ...stack('Floor', 79, 3.12, 2, (_t, i) => ({ w: 50 + 2.5 * Math.sin(i * 0.9) + 1.2 * Math.sin(i * 2.3), d: 28 + 2.5 * Math.cos(i * 0.7) + 1 * Math.sin(i * 1.9), dx: 1.2 * Math.sin(i * 0.5), dy: 1 * Math.cos(i * 0.6) }))] }) },
  { id: 'leadenhall', name: 'The Leadenhall Building', place: 'London', architect: 'Rogers Stirk Harbour + Partners', year: 2014, height: 225, storeys: 52, f2f: 4.33, glyph: 'y',
    note: 'The wedge: the south face leans back so the plate narrows from about 40 m deep to 14 m at the top while the north face stays plumb; the seven-storey open base is drawn as the north core alone.', flag: 'unverified',
    build: () => ({ blocks: [blk('Open base (core)', 50, 12, 7 * 4.33, 0, 16.5), ...stack('Floor', 45, 4.33, 1, (t) => { const d = 40 - 26 * t; return { w: 50, d, dy: 22.5 - d / 2 } })] }) },
  { id: 'vancouver-point-tower', name: 'Vancouver point tower', place: 'Downtown Vancouver (type)', architect: 'Typical residential', year: 2020, height: 110, storeys: 36, f2f: 2.97,
    note: 'A typical slim residential tower (about 625 m² plate) on a three-storey townhouse podium.', flag: 'unverified',
    build: () => ({ podiumUse: 'residential', blocks: [podium(40, 35, 3, 4, 'residential'), blk('Tower', 25, 25, 33 * 2.97)] }) },
]
