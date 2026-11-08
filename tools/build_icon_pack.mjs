// Builds a version of the node icon style pack (public/style-pack/node-icons/v<N>/): the rules, tokens, reference
// artwork, interface tokens, shared component names and an example node package that our assistant and outside AI
// agents follow when they make a design-node icon (Ruijie, 7 Nov: "Use the original artwork files, rather than
// screenshots … values must come from the icon family we maintain … Confirm this specification against our existing
// icons before adopting it"; design system §8: approved tokens and component names, icon references and construction
// rules, asset dimensions, safe area and background, examples of normal / selected / focused / error states, and the
// rules separating artwork colours from interface-state colours).
//
// Everything is taken from the app itself, not typed in again:
//   - the drawings: src/components/icons/nodeArt.tsx, loaded with Vite's module runner (no dev server) and rendered
//     with react-dom/server to standalone SVG; the numbers (iso frame, plate, material tones, strokes) from its source;
//   - phase colours and interface tokens: src/lib/design/tokens.ts and the @theme block of src/index.css;
//   - the tile and its states: the .node-tile / .node-hit rules of src/index.css and src/components/NodeTile.tsx;
//   - occupancy, centre, margins, legibility and palette: MEASURED on the 512 px PNG of every drawing, with the same
//     definitions as the app's image checks (src/lib/nodeIcons/image.ts).
// PNGs are rasterised by Playwright (system Edge, or the cached headless Chromium) with a transparent background. The
// hand-written NODE_ICON_STYLE.md gets its generated blocks refreshed between their markers.
//
// Published versions are frozen: a version listed in FROZEN is never rebuilt (its drawings' colours have moved on), and
// every run checks that each frozen folder still matches its manifest byte for byte.
//
// Usage: node tools/build_icon_pack.mjs [version]     (default: the current version; from the tower-studio folder)
import { runnerImport } from 'vite'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { strFromU8, unzipSync, zipSync } from 'fflate'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const CURRENT = '2'
/** Published versions that are never rebuilt. v1 drew the accent from the old phase hues (hsl tones); the drawings now
 *  use the design system's phase tones, so v1 can't be reproduced from today's source and stays exactly as published. */
const FROZEN = { 1: '2026-11-07' }
/** Buildable versions: their date and what changed since the one before. */
const PACKS = {
  2: { date: '2026-11-07', changes: 'Phase accents are the design system\'s fixed phase tones (lib/design/tokens.ts PHASE_COLOR) instead of hsl tones from a hue; adds the interface tokens (ui-tokens.json), the shared component names and states (COMPONENTS.md), the tile states preview and the rule separating artwork colours from interface colours.' },
}
const VERSION = String(process.argv[2] ?? CURRENT)
if (FROZEN[VERSION]) { console.error(`Style pack v${VERSION} is frozen (published ${FROZEN[VERSION]}); it is not rebuilt.`); process.exit(1) }
if (!PACKS[VERSION]) { console.error(`No recipe for style pack v${VERSION}. Buildable: ${Object.keys(PACKS).join(', ')}.`); process.exit(1) }
const DATE = PACKS[VERSION].date
const PACK_URL = `https://ruijieliu6.github.io/tower-design-toolkit/style-pack/node-icons/v${VERSION}/`
const BASE = join(ROOT, 'public/style-pack/node-icons')
const OUT = join(BASE, `v${VERSION}`)
const ZIP_NAME = `node-icon-style-pack-v${VERSION}.zip`
const S = 512 // master size, px
// The measures use the same definitions as the app's image checks (src/lib/nodeIcons/image.ts), so the numbers compare:
const ALPHA_MIN = 32 // the artwork's box: pixels from this alpha up (of 255), so faint anti-aliasing is ignored
const ALPHA_CLEAR = 16 // below this a pixel counts as transparent
const SOLID = 128 // pixels from this alpha up count for colour, palette and legibility
const PALETTE_DIST = 48 // RGB distance within which a colour counts as the family's
const SMALL = 30 // legibility is judged at the smallest tile size

/** The approved masters: a varied set, every phase colour present, each one idea with at most one cue. */
const REFERENCES = [
  ['built.viewcones', 'site', 'A sloping view plane passing over a tower: a spatial diagram on an object.'],
  ['built.sun', 'form', 'A tower, its shadow on the ground, and the sun as the one supporting cue (upper right).'],
  ['built.wind-screen', 'form', 'Wind brought down a tower face to the street, and the risk zone it makes there.'],
  ['built.pr-frontage', 'program', 'A podium with shopfronts and accent canopies along the street.'],
  ['built.core-lifts', 'schematic', 'Floor plates around an accent core that rises through them, lift shafts as thin lines.'],
  ['built.energy-carbon', 'schematic', 'Solar panels on a roof, and a flat lightning bolt as the one cue.'],
  ['built.daylight-depth', 'schematic', 'A window wall and the daylit floor beside it: the most detailed the family gets.'],
  ['built.provenance', 'present', 'A record sheet with its entries and an accent stamp: a log, not a robot.'],
]

process.env.PLAYWRIGHT_BROWSERS_PATH ??= 'F:/UBC Master of Architecture/ARCH540 AI Studio/tools-cache/ms-playwright'
const require = createRequire(join(ROOT, 'package.json'))

const read = (p) => readFileSync(join(ROOT, p), 'utf8')
const must = (m, what) => { if (!m) throw new Error(`build_icon_pack: could not read ${what}; did the source change?`); return m }
const write = (p, data) => { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, data) }
const json = (v) => JSON.stringify(v, null, 2) + '\n'
const r = (v, d = 3) => Number(v.toFixed(d))
const median = (xs) => { const s = [...xs].sort((a, b) => a - b), k = s.length >> 1; return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2 }
const cap = (s) => s[0].toUpperCase() + s.slice(1)
const sha256 = (b) => createHash('sha256').update(b).digest('hex')
const load = async (p) => (await runnerImport(join(ROOT, p), { root: ROOT, configFile: false, logLevel: 'error' })).module

// ---------- 0. frozen versions stay byte-identical ----------
function checkFrozen() {
  const out = []
  for (const v of Object.keys(FROZEN)) {
    const dir = join(BASE, `v${v}`)
    if (!existsSync(join(dir, 'manifest.json'))) { out.push(`v${v}: no manifest`); continue }
    const m = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'))
    const bad = m.files.filter((f) => { const p = join(dir, f.path); if (!existsSync(p)) return true; const b = readFileSync(p); return b.length !== f.bytes || sha256(b) !== f.sha256 })
    out.push(`v${v}: ${m.files.length - bad.length}/${m.files.length} files match its manifest${bad.length ? ` (changed: ${bad.map((f) => f.path).join(', ')})` : ''}`)
    if (bad.length) throw new Error(`Frozen style pack v${v} has changed: ${bad.map((f) => f.path).join(', ')}`)
  }
  return out
}
const frozenBefore = checkFrozen()

// ---------- 1. the family's numbers, from its own source ----------
const artSrc = read('src/components/icons/nodeArt.tsx')
const isoM = must(/\[\s*24 \+ \(x - y\) \* ([\d.]+), ([\d.]+) \+ \(x \+ y\) \* ([\d.]+) - z \* ([\d.]+)\s*\]/.exec(artSrc), 'the iso() formula')
const ISO = { cx: 24, cy: Number(isoM[2]), kx: Number(isoM[1]), ky: Number(isoM[3]), kz: Number(isoM[4]) }
const toneRows = Object.fromEntries([...artSrc.matchAll(/case '(\w)': return \[([^\]]+)\]/g)].map((m) => [m[1], [...m[2].matchAll(/['`]([^'`]+)['`]/g)].map((x) => x[1])]))
for (const t of ['n', 'p', 'g', 'w', 'k']) must(toneRows[t]?.length === 3, `tone '${t}'`)
const plateM = must(/const plate = \(c: Ctx\) => box\(c, ([\d., ]+), 'p'\)/.exec(artSrc), 'the ground plate')
const [px0, py0, pz0, pw, pd, ph] = plateM[1].split(',').map(Number)
const INK = must(/const INK = '([^']+)'/.exec(artSrc), 'INK')[1]
const lineDefault = Number(must(/const line = \([^)]*w = ([\d.]+)/.exec(artSrc), 'line() default width')[1])
const artBody = artSrc.slice(artSrc.indexOf('const ART'), artSrc.indexOf('export const hasNodeArt'))
const IDS = [...artBody.matchAll(/^\s*'(built\.[a-z0-9-]+)': \(c\) =>/gm)].map((m) => m[1])
const strokeWidths = [...new Set([
  ...[...artBody.matchAll(/strokeWidth=\{([\d.]+)\}/g)].map((m) => Number(m[1])),
  ...[...artBody.matchAll(/line\([^;]*?, (?:A\(c, \d\)|'#fff'|tones\('\w', c\.h(?:, c\.a)?\)\[\d\]|INK), ([\d.]+)/g)].map((m) => Number(m[1])),
  lineDefault,
])].sort((a, b) => a - b)
const extraColours = [...new Set([...artBody.matchAll(/(#[0-9a-f]{3,6}\b|rgb\([^)]*\))/gi)].map((m) => m[1]))]

// The interface: CSS variables of the @theme block (resolved), the tile rules, the sizes.
const cssSrc = read('src/index.css')
const themeBlock = must(/@theme \{([\s\S]*?)\n\}/.exec(cssSrc), '@theme')[1].replace(/\/\*[\s\S]*?\*\//g, '')
const CSS_VARS = Object.fromEntries([...themeBlock.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]))
const resolve = (v, depth = 0) => (depth > 8 ? v : v.replace(/var\((--[\w-]+)\)/g, (_, n) => resolve(CSS_VARS[n] ?? `var(${n})`, depth + 1)))
const NODE_RULES = [...cssSrc.matchAll(/(^|\n)((?:\.node-(?:tile|hit))[^{\n]*)\{([^}]*)\}/g)].map((m) => ({ selector: m[2].trim(), body: m[3].replace(/\s+/g, ' ').trim() }))
must(NODE_RULES.length >= 8, 'the .node-tile / .node-hit rules')
const rule = (sel) => must(NODE_RULES.find((x) => x.selector === sel), `CSS rule ${sel}`).body
const prop = (body, name) => must(new RegExp(`(?:^|;\\s*)${name}:\\s*([^;]+)`).exec(body), `${name}`)[1].trim()
const TILE = {
  background: prop(rule('.node-tile'), 'background'),
  radius: prop(rule('.node-tile'), 'border-radius'),
  radiusPx: Number(must(/^(\d+)px$/.exec(resolve(prop(rule('.node-tile'), 'border-radius'))), 'tile radius px')[1]),
  shadow: resolve(prop(rule('.node-tile'), 'box-shadow')),
  artScale: Number(must(/size \* ([\d.]+)\)/.exec(read('src/components/NodeTile.tsx')), 'NodeTile art scale')[1]),
  states: {
    soft: `${rule('.node-tile[data-state="soft"]')} art: ${rule('.node-tile[data-state="soft"] svg')}`,
    off: `${rule('.node-tile[data-state="off"]')} art: ${rule('.node-tile[data-state="off"] svg')}`,
    hover: resolve(rule('.node-hit:hover .node-tile')),
    focus: resolve(rule('.node-hit:focus-visible .node-tile')),
    selected: resolve(rule('.node-hit[data-selected] .node-tile')),
  },
}
const iconSizes = must(/export const ICON = \{ feature: (\d+), tool: (\d+) \}/.exec(read('src/components/GlassIcon.tsx')), 'ICON sizes')
const shelf = Number(must(/const SHELF_S = ([\d.]+)/.exec(read('src/components/landing/Intro.tsx')), 'SHELF_S')[1])

// ---------- 2. the drawings, rendered by the family's own code ----------
const art = await load('src/components/icons/nodeArt.tsx')
const phases = await load('src/lib/phases.ts')
const design = await load('src/lib/design/tokens.ts')
const PHASE_IDS = phases.PHASES.map((p) => p.id)
const PHASE_COLOR = design.PHASE_COLOR
const accentOf = (phase) => must(PHASE_COLOR[phase]?.tones?.length === 3 && PHASE_COLOR[phase].tones, `PHASE_COLOR.${phase}.tones`)
must(IDS.length >= 31 && IDS.every((id) => art.hasNodeArt(id)), `the ${IDS.length} drawings`)
for (const [id] of REFERENCES) must(IDS.includes(id), `reference ${id}`)

/** A drawing as a standalone SVG file: the family's own markup with an xmlns, transparent, 512 px. */
const svgOf = (id) => renderToStaticMarkup(createElement(art.NodeArt, { id, size: S }))
  .replace(/^<svg [^>]*>/, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="${S}" height="${S}">`)
// The drawings must wear this version's phase tones (a guard against building v2 from a v1-coloured source).
for (const [id, phase] of REFERENCES) must(svgOf(id).includes(accentOf(phase)[1]) || svgOf(id).includes(accentOf(phase)[0]) || svgOf(id).includes(accentOf(phase)[2]), `${id} drawn in the ${phase} tones`)

// ---------- 3. an icon drawn by an "outside agent" from these tokens alone (the example package's image) ----------
// The worked example node (Tower width & proportion, CDDG) has no drawing in the family, so this is what an agent
// following the pack would draw: one tower on the plate (the object), its base width dimensioned (the one cue).
const EXAMPLE_PHASE = 'form'
function exampleSvg(size) {
  const iso = (x, y, z = 0) => [ISO.cx + (x - y) * ISO.kx, ISO.cy + (x + y) * ISO.ky - z * ISO.kz]
  const P = (...ps) => ps.map((q) => iso(...q).map((v) => v.toFixed(2)).join(',')).join(' ')
  const A = accentOf(EXAMPLE_PHASE)
  const tone = { n: toneRows.n, p: toneRows.p, a: A }
  const box = (x, y, z, w, d, hh, t) => {
    const [top, left, right] = tone[t]
    return `<g><polygon points="${P([x, y + d, z], [x + w, y + d, z], [x + w, y + d, z + hh], [x, y + d, z + hh])}" fill="${left}"/>`
      + `<polygon points="${P([x + w, y, z], [x + w, y + d, z], [x + w, y + d, z + hh], [x + w, y, z + hh])}" fill="${right}"/>`
      + `<polygon points="${P([x, y, z + hh], [x + w, y, z + hh], [x + w, y + d, z + hh], [x, y + d, z + hh])}" fill="${top}"/></g>`
  }
  const ln = (a, b, w) => { const [x1, y1] = iso(...a), [x2, y2] = iso(...b); return `<line x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" stroke="${A[2]}" stroke-width="${w}" stroke-linecap="round"/>` }
  const z = 0.95, y = 12.5
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="${size}" height="${size}">`
    + box(px0, py0, pz0, pw, pd, ph, 'p')
    + `<polygon points="${P([6, 11.5, z], [10.5, 11.5, z], [10.5, 13.5, z], [6, 13.5, z])}" fill="${A[0]}"/>`
    + box(6, 6, 0.9, 4.5, 4.5, 14, 'n')
    + ln([6, y, z], [10.5, y, z], 1.1) + ln([6, y - 0.8, z], [6, y + 0.8, z], 1.1) + ln([10.5, y - 0.8, z], [10.5, y + 0.8, z], 1.1)
    + '</svg>'
}

// ---------- 4. rasterise and measure ----------
const { chromium } = require('playwright')
let browser
try { browser = await chromium.launch({ channel: 'msedge' }) } catch { browser = await chromium.launch() }
const page = await browser.newPage({ viewport: { width: S, height: S }, deviceScaleFactor: 1 })

async function rasterise(svg, size = S) {
  await page.setViewportSize({ width: size, height: size })
  await page.setContent(`<!doctype html><html><head><style>html,body{margin:0;background:transparent}svg{display:block}</style></head><body>${svg}</body></html>`)
  return page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } })
}

/**
 * Where a PNG's artwork sits and how it reads: the box of pixels with alpha ≥ ALPHA_MIN; how much is not transparent;
 * the share of solid pixels near the family palette; what touches the outer 2 px ring; and, drawn at 30 px, the share
 * of solid pixels dark enough to show on the white tile (1 − luminance > 0.18) and the share that sit on a hard tonal
 * edge (luminance step > 0.25 to the next pixel: "busy").
 */
async function measure(png, palette) {
  return page.evaluate(async ({ b64, alphaMin, alphaClear, solidA, dist, palette, small }) => {
    const img = new Image(); img.src = `data:image/png;base64,${b64}`; await img.decode()
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height
    const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0)
    const n = c.width, d = g.getImageData(0, 0, n, n).data
    const pal = palette.map((hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)))
    let x0 = n, y0 = n, x1 = -1, y1 = -1, ink = 0, solid = 0, near = 0, ring = 0, edge = 0
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const i = (y * n + x) * 4, a = d[i + 3]
      if (x < 2 || y < 2 || x >= n - 2 || y >= n - 2) { ring++; if (a >= solidA) edge++ }
      if (a >= alphaClear) ink++
      if (a >= alphaMin) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y }
      if (a >= solidA) {
        solid++
        let best = Infinity
        for (const [pr, pg, pb] of pal) best = Math.min(best, (d[i] - pr) ** 2 + (d[i + 1] - pg) ** 2 + (d[i + 2] - pb) ** 2)
        if (best < dist * dist) near++
      }
    }
    const sm = document.createElement('canvas'); sm.width = sm.height = small
    const sg = sm.getContext('2d', { willReadFrequently: true }); sg.imageSmoothingQuality = 'high'; sg.drawImage(img, 0, 0, small, small)
    const sd = sg.getImageData(0, 0, small, small).data
    const lum = (i) => (0.2126 * sd[i * 4] + 0.7152 * sd[i * 4 + 1] + 0.0722 * sd[i * 4 + 2]) / 255
    let seen = 0, dark = 0, busy = 0
    for (let i = 0; i < small * small; i++) {
      if (sd[i * 4 + 3] < solidA) continue
      seen++
      if (1 - lum(i) > 0.18) dark++
      if (i % small < small - 1 && sd[(i + 1) * 4 + 3] >= solidA && Math.abs(lum(i) - lum(i + 1)) > 0.25) busy++
    }
    return { size: n, x0, y0, x1, y1, ink, paletteShare: solid ? near / solid : 0, edgeShare: edge / ring, darkShare: seen ? dark / seen : 0, busyShare: seen ? busy / seen : 0 }
  }, { b64: png.toString('base64'), alphaMin: ALPHA_MIN, alphaClear: ALPHA_CLEAR, solidA: SOLID, dist: PALETTE_DIST, palette, small: SMALL })
}

// The family palette for the similarity check: every tone of every material, this version's phase tones, the other
// colours the drawings use (opaque ones), and white.
const opaqueHex = (c) => (/^#[0-9a-f]{6}$/i.test(c) ? c.toLowerCase() : /^#[0-9a-f]{3}$/i.test(c) ? `#${[...c.slice(1)].map((x) => x + x).join('')}`.toLowerCase() : null)
const PALETTE = [...new Set([
  ...['n', 'p', 'g', 'w', 'k'].flatMap((t) => toneRows[t]),
  ...PHASE_IDS.flatMap((p) => accentOf(p)),
  ...extraColours.map(opaqueHex).filter(Boolean), '#ffffff',
].map((c) => c.toLowerCase()))]
// The app checks uploads against its own copy of this palette; they must be the same set.
let appPaletteNote = 'not compared (src/lib/nodeIcons/image.ts not loadable)'
try {
  const img = await load('src/lib/nodeIcons/image.ts')
  if (img.PALETTE_HEX) {
    const a = [...new Set(img.PALETTE_HEX.map((c) => c.toLowerCase()))].sort(), b = [...PALETTE].sort()
    appPaletteNote = JSON.stringify(a) === JSON.stringify(b) ? 'same set as image.ts PALETTE_HEX' : `DIFFERS from image.ts PALETTE_HEX (app only: ${a.filter((c) => !b.includes(c)).join(' ') || '-'}; pack only: ${b.filter((c) => !a.includes(c)).join(' ') || '-'})`
  }
} catch { /* the app's module is not loadable outside the browser: leave the note */ }

const frameOf = (m) => {
  const w = m.x1 - m.x0 + 1, h = m.y1 - m.y0 + 1, n = m.size
  return {
    box: [m.x0, m.y0, m.x1, m.y1], width: r(w / n), height: r(h / n), longest: r(Math.max(w, h) / n),
    centreOffset: [r(((m.x0 + m.x1 + 1) / 2 - n / 2) / n), r(((m.y0 + m.y1 + 1) / 2 - n / 2) / n)],
    margins: { left: r(m.x0 / n), top: r(m.y0 / n), right: r((n - 1 - m.x1) / n), bottom: r((n - 1 - m.y1) / n) },
    inkShare: r(m.ink / (n * n)), paletteShare: r(m.paletteShare), edgeShare: r(m.edgeShare),
    darkAt30px: r(m.darkShare), busyAt30px: r(m.busyShare),
  }
}

const measured = []
const pngs = new Map()
for (const id of IDS) {
  const png = await rasterise(svgOf(id))
  pngs.set(id, png)
  measured.push({ id, phase: phases.phaseOfNode(id)?.id ?? 'site', ...frameOf(await measure(png, PALETTE)) })
}
const stat = (k) => { const xs = measured.map(k); return { min: r(Math.min(...xs)), median: r(median(xs)), max: r(Math.max(...xs)) } }
const occ = stat((m) => m.longest)
const STATS = {
  method: `Every drawing in src/components/icons/nodeArt.tsx (${IDS.length}) rendered at ${S} × ${S} px with a transparent background. Box: pixels with alpha ≥ ${ALPHA_MIN}/255; ink: alpha ≥ ${ALPHA_CLEAR}; colour, palette and legibility: alpha ≥ ${SOLID}; palette: RGB distance < ${PALETTE_DIST} to a family colour; legibility: the drawing scaled to ${SMALL} px. Box fractions are of the canvas side; shares are of the counted pixels. Same definitions as src/lib/nodeIcons/image.ts.`,
  count: IDS.length,
  longestSide: occ,
  width: stat((m) => m.width),
  height: stat((m) => m.height),
  centreOffset: { x: stat((m) => m.centreOffset[0]), y: stat((m) => m.centreOffset[1]) },
  margin: { left: stat((m) => m.margins.left), top: stat((m) => m.margins.top), right: stat((m) => m.margins.right), bottom: stat((m) => m.margins.bottom) },
  inkShare: stat((m) => m.inkShare),
  edgeShare: stat((m) => m.edgeShare),
  paletteShare: stat((m) => m.paletteShare),
  darkAt30px: stat((m) => m.darkAt30px),
  busyAt30px: stat((m) => m.busyAt30px),
  inTile: { note: `The tile draws the artwork at ${TILE.artScale} of its side, so the median drawing fills ${r(occ.median * TILE.artScale)} of the tile's side.`, longestSide: r(occ.median * TILE.artScale) },
  perIcon: measured,
}

// The export spec, from the measurement.
const lo = Math.floor(occ.min * 100) / 100, hi = Math.ceil(occ.max * 100) / 100
const tol = Math.ceil(Math.max(occ.median - lo, hi - occ.median) * 100) / 100
const minMargin = Math.min(...measured.flatMap((m) => Object.values(m.margins)))
const safe = Math.max(0.02, Math.floor(minMargin * 100) / 100)
const EXPORT = {
  format: 'png', width: S, height: S, background: 'transparent', colourSpace: 'sRGB',
  occupancy: {
    measure: `longest side of the artwork box (alpha ≥ ${ALPHA_MIN}/255) as a fraction of the canvas side`,
    target: r(occ.median, 2), tolerance: tol, accept: [r(occ.median - tol, 2), r(occ.median + tol, 2)],
    proposal: { value: 0.75, verdict: `Not what our icons do: the family measures ${occ.min}–${occ.max} (median ${occ.median}) of the canvas. 0.75 is close to what the tile shows (${STATS.inTile.longestSide} of the tile side, after the ${TILE.artScale} art scale), so a 512 master drawn at 0.75 would look about ${Math.round((1 - 0.75 / occ.median) * 100)}% smaller than its neighbours. Adopted: the measured target.` },
  },
  centre: {
    x: { target: 0.5, maxOffset: 0.03, note: 'Centred left to right (the plate is symmetric about x = 24 of 48).' },
    y: { anchor: 'plate', bottomMargin: STATS.margin.bottom.median, accept: [r(STATS.margin.bottom.median - 0.02, 2), r(STATS.margin.bottom.median + 0.02, 2)], note: `Not centred top to bottom: the plate's near corner sits ${(STATS.margin.bottom.median * 100).toFixed(1)}% above the bottom edge and the subject rises from it, so low subjects sit low (box centre ${STATS.centreOffset.y.min} to ${STATS.centreOffset.y.max} of the side below the canvas centre, median ${STATS.centreOffset.y.median}).` },
    measuredMedian: [STATS.centreOffset.x.median, STATS.centreOffset.y.median],
  },
  safeMargin: { fraction: r(safe, 2), px: Math.round(safe * S), note: 'The safe area: no artwork pixel closer to the edge than this (the family\'s smallest margin, rounded down; at least 2%).' },
  inPackage: { formats: ['png', 'webp'], recommendedPx: 256, recommendedMaxBytes: 61440, note: 'Inside a node package the icon travels as a data URL. Recommended: a 256 × 256 copy of the master (the size the platform displays), under 60 KB, so the package stays small. The platform accepts up to the upload limits.' },
  upload: { formats: ['png', 'jpeg', 'webp'], svg: false, minPx: 64, maxPx: 4096, maxBytes: 5 * 1024 * 1024, displayPx: 256, note: 'Limits as the platform applies them (src/lib/nodeIcons/image.ts). A non-square image is fitted into the square tile. JPEG has no transparency.' },
}

// What the platform checks on an image icon. "block": the icon is refused (the node keeps its standard drawing).
// "warn": the icon is shown with the warning in words. Block rules mirror the platform; warn thresholds are measured
// on the family, with the same definitions as the platform's checks.
const floor2 = (v) => Math.floor(v * 100) / 100, ceil2 = (v) => Math.ceil(v * 100) / 100
// Thresholds stay as the last published version had them while the family still passes them (so the app's checks
// don't move for nothing); one is re-derived from the measurement only when the family would fail it.
const derived = {
  occupancy: EXPORT.occupancy.accept, maxOffsetX: EXPORT.centre.x.maxOffset, bottomMargin: EXPORT.centre.y.accept, maxEdgeShare: 0.04,
  maxInkShare: ceil2(STATS.inkShare.max + 0.05), minDark: floor2(STATS.darkAt30px.min * 0.9), maxBusy: ceil2(STATS.busyAt30px.max * 1.25),
  minPaletteShare: floor2(Math.min(0.85, STATS.paletteShare.min)),
}
const familyPasses = {
  occupancy: (t) => occ.min >= t[0] && occ.max <= t[1],
  maxOffsetX: (t) => Math.max(...measured.map((m) => Math.abs(m.centreOffset[0]))) <= t,
  bottomMargin: (t) => STATS.margin.bottom.min >= t[0] && STATS.margin.bottom.max <= t[1],
  maxEdgeShare: (t) => STATS.edgeShare.max < t, maxInkShare: (t) => STATS.inkShare.max <= t,
  minDark: (t) => STATS.darkAt30px.min >= t, maxBusy: (t) => STATS.busyAt30px.max <= t, minPaletteShare: (t) => STATS.paletteShare.min >= t,
}
const previous = (() => {
  for (const v of Object.keys(FROZEN).filter((x) => Number(x) < Number(VERSION)).sort((a, b) => Number(b) - Number(a))) {
    const p = join(BASE, `v${v}`, 'icon-tokens.json')
    if (!existsSync(p)) continue
    const w = Object.fromEntries(JSON.parse(readFileSync(p, 'utf8')).validation.warn.map((x) => [x.id, x]))
    return { v, t: { occupancy: w.framing?.occupancy, maxOffsetX: w.framing?.maxOffsetX, bottomMargin: w.framing?.bottomMargin, maxEdgeShare: w.clipping?.maxEdgeShare, maxInkShare: w.background?.maxInkShare, minDark: w.legibility?.minDark, maxBusy: w.legibility?.maxBusy, minPaletteShare: w.palette?.minPaletteShare } }
  }
  return null
})()
const T = {}, BASIS = {}
for (const k of Object.keys(derived)) {
  const old = previous?.t[k]
  if (old !== undefined && familyPasses[k](old)) { T[k] = old; BASIS[k] = `as v${previous.v} (the family still passes it; measured value would be ${JSON.stringify(derived[k])})` }
  else { T[k] = derived[k]; BASIS[k] = old !== undefined ? `re-derived from the measurement: the family fails v${previous.v}'s ${JSON.stringify(old)}` : 'derived from the measurement' }
}
const VALIDATION = {
  note: 'Measured on the decoded image with the definitions in measured.method. An agent saying its icon follows the pack is not a check.',
  thresholdBasis: BASIS,
  block: [
    { id: 'format', rule: `The bytes are PNG, JPEG or WebP (read from the file's first bytes, not its name). SVG is refused in v${VERSION}.` },
    { id: 'size', rule: `Not empty, at most ${EXPORT.upload.maxBytes / 1048576} MB.` },
    { id: 'renders', rule: 'The browser can decode it and draw it.' },
    { id: 'dimensions', rule: `${EXPORT.upload.minPx}-${EXPORT.upload.maxPx} px a side.` },
  ],
  warn: [
    { id: 'framing', rule: `Longest side of the artwork ${T.occupancy[0]}-${T.occupancy[1]} of the square (family ${occ.min}-${occ.max}); left to right within ${T.maxOffsetX} of the centre; the lowest point ${T.bottomMargin[0]}-${T.bottomMargin[1]} above the bottom edge.`, occupancy: T.occupancy, maxOffsetX: T.maxOffsetX, bottomMargin: T.bottomMargin },
    { id: 'clipping', rule: `Less than ${T.maxEdgeShare * 100}% of the outer 2 px ring is solid (family max ${STATS.edgeShare.max}); for an export, nothing within ${EXPORT.safeMargin.px} px of a 512 edge.`, maxEdgeShare: T.maxEdgeShare, safeMargin: EXPORT.safeMargin.fraction },
    { id: 'background', rule: `Transparent around the drawing: at most ${T.maxInkShare} of the square is not transparent (family ${STATS.inkShare.min}-${STATS.inkShare.max}). A JPEG always has a background.`, maxInkShare: T.maxInkShare },
    { id: 'legibility', rule: `At ${SMALL} px, at least ${T.minDark} of the solid pixels are dark enough to show on the white tile (1 − luminance > 0.18; family ${STATS.darkAt30px.min}-${STATS.darkAt30px.max}), and at most ${T.maxBusy} sit on a hard tonal edge (family ${STATS.busyAt30px.min}-${STATS.busyAt30px.max}).`, minDark: T.minDark, maxBusy: T.maxBusy },
    { id: 'palette', rule: `At least ${T.minPaletteShare} of the solid pixels lie within RGB distance ${PALETTE_DIST} of the family palette (family ${STATS.paletteShare.min}-${STATS.paletteShare.max}).`, minPaletteShare: T.minPaletteShare, distance: PALETTE_DIST, palette: PALETTE },
  ],
  preview: 'Before the icon is used, the person sees it on its tile at 52, 40 and 30 px with every check in words, and keeps it or drops it. The original file is kept; the platform shows a 256 px copy.',
}

// ---------- 5. tokens ----------
const TOKENS = {
  version: VERSION,
  date: DATE,
  url: PACK_URL,
  changes: PACKS[VERSION].changes,
  source: 'src/components/icons/nodeArt.tsx (drawings and material tones), src/lib/design/tokens.ts (phase tones), src/index.css .node-tile / .node-hit and src/components/NodeTile.tsx (tile and states). Generated by tools/build_icon_pack.mjs; do not edit by hand.',
  viewBox: [0, 0, 48, 48],
  projection: {
    name: 'isometric, 30°',
    formula: `iso(x, y, z) = [${ISO.cx} + (x - y) * ${ISO.kx}, ${ISO.cy} + (x + y) * ${ISO.ky} - z * ${ISO.kz}]`,
    origin: [ISO.cx, ISO.cy], kx: ISO.kx, ky: ISO.ky, kz: ISO.kz,
    planAxisAngleDeg: r((Math.atan(ISO.ky / ISO.kx) * 180) / Math.PI, 2),
    unitLength: { plan: r(Math.hypot(ISO.kx, ISO.ky), 3), vertical: ISO.kz },
    note: 'Plan units x, y run 0..16 on the plate, z is up. +x runs to the lower right, +y to the lower left, +z straight up. The camera looks down from the front (the plate\'s near corner points at the viewer).',
  },
  grid: { planUnits: 16, groundZ: pz0 + ph, flatLiftZ: [0.95, 0.97], note: 'Objects stand on the plate top (z 0.9); things lying flat on the ground sit at z 0.95-0.97 so they draw over the plate.' },
  plate: { box: { x: px0, y: py0, z: pz0, w: pw, d: pd, h: ph }, tone: 'p', note: 'The same plate under every subject; never scaled, moved or recoloured.' },
  light: { from: 'upper left', faces: { top: 'lightest (tone 0)', left: 'middle (tone 1): the face toward the lower left (+y side)', right: 'darkest (tone 2): the face toward the lower right (+x side)' }, drawOrder: ['left face', 'right face', 'top'] },
  materials: {
    n: { use: 'massing (neutral building forms)', tones: toneRows.n },
    p: { use: 'ground plate', tones: toneRows.p },
    g: { use: 'planting', tones: toneRows.g },
    w: { use: 'water and sky glass', tones: toneRows.w },
    k: { use: 'dark detail (trunks, furniture, wheels)', tones: toneRows.k },
    a: { use: "the node's task, in its phase's three artwork tones (phases.<phase>.tones)", tones: 'phase' },
  },
  phases: Object.fromEntries(PHASE_IDS.map((p) => [p, { tones: accentOf(p), accent: PHASE_COLOR[p].accent, surface: PHASE_COLOR[p].surface, ink: PHASE_COLOR[p].ink, hue: phases.PHASE_HUE[p], cssVar: `--color-${p}`, note: 'tones = artwork (top, left face, right face); accent / surface / ink are interface uses of the same colour and do not go in artwork except the accent, which equals tone 1' }])),
  otherColours: { ink: INK, white: '#fff', usedInDrawings: extraColours, note: 'Shadows are rgb(58 66 80 / 0.28) on the ground; white is used for glazing bars and marks on accent shapes; the warm yellows only in sun and daylight drawings.' },
  notArtwork: { interaction: design.UI.accent, focus: design.UI.focus, selected: design.UI.selected, status: Object.fromEntries(Object.entries(design.STATUS).map(([k, v]) => [k, v.fg])), rule: 'Interface colours: blue is reserved for interaction, selection and focus; status colours belong to the platform\'s badges. Neither appears in artwork.' },
  strokes: { widthsUsed: strokeWidths, lineDefault, cap: 'round', join: 'round', rule: 'Thin lines only as detail inside or on a form (mullions, lift shafts, dimension and wind lines, a dashed reach): 0.5-1.3 units; symbol strokes up to 2.2. Never an outline around a form.', pxAt512: Object.fromEntries(strokeWidths.map((w) => [w, r((w * S) / 48, 1)])) },
  supportingCue: { zone: { x: [30, 46], y: [3, 22] }, note: 'The one optional cue (sun, bolt, shield, check, plane, drop) sits flat, unprojected, in the upper right of the 48 grid, about 7-12 units across, in the accent or a material tone.' },
  tile: { background: TILE.background, radius: TILE.radius, radiusPx: TILE.radiusPx, artScale: TILE.artScale, shadow: TILE.shadow, states: TILE.states, css: NODE_RULES, note: 'Drawn by the platform around every icon (components/NodeTile.tsx). The states live on the clickable element around the tile (.node-hit), never in the artwork.' },
  displaySizes: { px: [30, 40, 52], where: { 52: 'workflow board (GlassIcon ICON.feature; scales to 0.72 on narrow windows)', 40: 'ribbon and tools (ICON.tool)', 30: `lane shelves (${iconSizes[1]} × ${shelf} ≈ ${Math.round(iconSizes[1] * shelf)} px)` } },
  export: EXPORT,
  validation: VALIDATION,
  measured: STATS,
  references: REFERENCES.map(([id, phase]) => ({ id, phase, svg: `references/${id}.svg`, png: `references/${id}.png` })),
}

// The interface tokens (design system §3-§4, §9): the JS mirror and the CSS variables, so an agent building UI around a
// node reuses them instead of inventing colours.
const groupVars = (prefix) => Object.fromEntries(Object.entries(CSS_VARS).filter(([k]) => k.startsWith(prefix)).map(([k, v]) => [k, resolve(v)]))
const UI_TOKENS = {
  version: VERSION,
  date: DATE,
  source: 'src/lib/design/tokens.ts (JS) and the @theme block of src/index.css (CSS variables; Tailwind classes such as bg-accent, text-muted and rounded-panel read them). Generated by tools/build_icon_pack.mjs; do not edit by hand.',
  roles: {
    UI: 'interface surfaces, text, action and selection; blue (accent, focus) only for interaction, selection and focus',
    PHASE_COLOR: 'workflow phases: tones are node artwork; accent, surface and ink are phase markers, library groups and bounded highlights',
    STATUS: 'execution status and assessment results, always with a symbol and a word; never in artwork',
    MODEL: 'the 3D building and site (neutral matte model)',
    DATA: 'analytical colour scales: sequential, diverging, categorical, missing',
  },
  UI: design.UI, PHASE_COLOR, STATUS: design.STATUS, MODEL: design.MODEL, DATA: design.DATA,
  RADIUS: design.RADIUS, SPACE: design.SPACE, MOTION: design.MOTION,
  css: {
    color: groupVars('--color-'), radius: groupVars('--radius'), shadow: groupVars('--shadow-'), ease: groupVars('--ease-'),
    text: groupVars('--text-'), font: groupVars('--font-'),
  },
}

// ---------- 6. write the pack ----------
mkdirSync(join(OUT, 'references'), { recursive: true })
for (const f of readdirSync(join(OUT, 'references'))) if (/\.(svg|png)$/.test(f) && !REFERENCES.some(([id]) => f.startsWith(`${id}.`))) rmSync(join(OUT, 'references', f))
for (const [id] of REFERENCES) {
  write(join(OUT, 'references', `${id}.svg`), svgOf(id) + '\n')
  write(join(OUT, 'references', `${id}.png`), pngs.get(id))
}
write(join(OUT, 'references', 'README.md'), [
  `# Reference artwork (style pack v${VERSION})`,
  '',
  `The approved masters. Each is the original drawing from the icon family (\`src/components/icons/nodeArt.tsx\`), exported two ways: \`<id>.svg\` (the drawing itself, 48-unit viewBox, transparent) and \`<id>.png\` (${S} × ${S}, transparent). Give an image model the PNGs; give a code-drawing agent the SVGs.`,
  '',
  '| Node | Phase tones | What it shows | Longest side |',
  '|---|---|---|---|',
  ...REFERENCES.map(([id, phase, what]) => `| \`${id}\` | ${cap(phase)} (${accentOf(phase).join(', ')}) | ${what} | ${measured.find((m) => m.id === id).longest} |`),
  '',
  `Longest side = the artwork's box as a fraction of the canvas (family median ${occ.median}). The previews in \`../previews/\` show all ${IDS.length} drawings on their tiles, these references at 52, 40 and 30 px, and the tile's interface states.`,
  '',
].join('\n'))
write(join(OUT, 'icon-tokens.json'), json(TOKENS))
write(join(OUT, 'ui-tokens.json'), json(UI_TOKENS))

// Previews, in the app's font and with the app's own tile rules.
const font = readFileSync(join(ROOT, 'node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2')).toString('base64')
const rootVars = `:root{${Object.entries(CSS_VARS).map(([k, v]) => `${k}:${v}`).join(';')}}`
const nodeCss = NODE_RULES.map((x) => `${x.selector}{${x.body}}`).join('\n')
const sheetCss = `@font-face{font-family:Inter;src:url(data:font/woff2;base64,${font}) format("woff2");font-weight:100 900}${rootVars}
html,body{margin:0;background:var(--color-canvas);font:12px/16px Inter,sans-serif;color:var(--color-muted)}
:focus-visible{outline:2px solid var(--color-focus);outline-offset:2px}
${nodeCss}
button.node-hit{border:0;padding:0;background:none;border-radius:12px;font:inherit;cursor:pointer}
.row{display:flex;align-items:center;gap:16px;padding:6px 16px}.lab{width:76px;color:var(--color-ink);font-weight:500;font-size:14px}
.cell{display:flex;flex-direction:column;align-items:center;gap:8px;width:96px}.cap{text-align:center}
.badge{position:absolute;bottom:-8px;right:-14px;display:inline-flex;align-items:center;gap:3px;padding:1px 6px 1px 3px;border-radius:999px;font:600 12px/16px Inter,sans-serif;color:var(--color-error);background:var(--color-error-surface);box-shadow:inset 0 0 0 1px var(--color-error)}
.badge svg{display:block}`
const sheetPage = await browser.newPage({ viewport: { width: 960, height: 200 }, deviceScaleFactor: 2 })
async function sheet(html, file, prepare) {
  await sheetPage.setContent(`<!doctype html><html><head><style>${sheetCss}</style></head><body><div id="s" style="display:inline-block;padding:14px 0">${html}</div></body></html>`)
  await sheetPage.evaluate(() => document.fonts.ready)
  if (prepare) await prepare(sheetPage)
  write(file, await (await sheetPage.$('#s')).screenshot())
}
const fit = (svg, size) => svg.replace(/width="\d+" height="\d+"/, `width="${Math.round(size * TILE.artScale)}" height="${Math.round(size * TILE.artScale)}"`)
const tile = (svg, size, state = 'on') => `<span class="node-tile" data-state="${state}" style="--nt:${size}px">${fit(svg, size)}</span>`
const byPhase = phases.PHASES.map((p) => `<div class="row"><span class="lab">${p.name}</span>${p.nodes.filter((id) => IDS.includes(id)).map((id) => tile(svgOf(id), 52)).join('')}</div>`).join('')
await sheet(byPhase, join(OUT, 'previews', 'family-52px.png'))
const sizes = [52, 40, 30].map((s) => `<div class="row"><span class="lab">${s} px</span>${REFERENCES.map(([id]) => tile(svgOf(id), s)).join('')}</div>`).join('')
await sheet(sizes, join(OUT, 'previews', 'size-check.png'))
// The tile's interface states: the real .node-tile / .node-hit rules; hover by the mouse, focus by the keyboard.
const STATE_ID = 'built.sun'
const circleX = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6M9 9l6 6"/></svg>`
const cells = [
  ['normal', 'Normal', ''], ['hover', 'Hover', ''], ['selected', 'Selected', 'data-selected=""'], ['focus', 'Keyboard focus', ''],
  ['error', 'Error status', '', `<span class="badge">${circleX}Fail</span>`], ['soft', 'Soft (available)', '', '', 'soft'], ['off', 'Off (not used)', '', '', 'off'],
]
const statesHtml = `<div class="row">${cells.map(([key, label, attr, extra = '', state = 'on']) => `<div class="cell"><button type="button" class="node-hit" id="st-${key}" ${key === 'focus' ? '' : 'tabindex="-1"'} ${attr} aria-label="${label}">${tile(svgOf(STATE_ID), 52, state).replace('</span>', `${extra}</span>`)}</button><span class="cap">${label}</span></div>`).join('')}</div>`
await sheet(statesHtml, join(OUT, 'previews', 'states.png'), async (p) => {
  await p.keyboard.press('Tab')
  await p.hover('#st-hover')
  await p.waitForTimeout(400)
  must(await p.evaluate(() => document.activeElement?.id === 'st-focus' && document.activeElement.matches(':focus-visible')), 'keyboard focus on the focus tile')
})

// The example node package, both ways.
const example = JSON.parse(read('skills/tower-studio-node-builder/references/example-node.json'))
const brief = {
  styleVersion: VERSION,
  name: example.name,
  function: 'Compares each tower\'s widest plan side with the CDDG 29 m guideline, its height-to-width ratio with the 6:1 tip and its width with the site frontage; shows plate area for information. Says Check, never Fail, on tips.',
  category: example.category,
  phase: EXAMPLE_PHASE,
  metaphor: { object: 'tower', cue: 'none' },
  notes: "Show the tower's width, e.g. a dimension along its base. No check mark or warning sign: the node compares with guidance and says Check, never Fail, on tips.",
}
const exSvg = exampleSvg(S)
const exPng = await rasterise(exSvg)
const exSmall = await rasterise(exampleSvg(256), 256)
const exCheck = frameOf(await measure(exPng, PALETTE))
write(join(OUT, 'example-node', 'example-node.json'), json({ ...example, createdWith: `${example.createdWith}; icon brief per node icon style pack v${VERSION}`, icon: { kind: 'brief', brief } }))
write(join(OUT, 'example-node', 'example-node-with-image.json'), json({
  ...example, createdWith: `${example.createdWith}; icon drawn by an agent from node icon style pack v${VERSION}`,
  icon: { kind: 'image', dataUrl: `data:image/png;base64,${exSmall.toString('base64')}`, source: 'agent', styleVersion: VERSION },
}))
write(join(OUT, 'example-node', 'icon.png'), exPng)
write(join(OUT, 'example-node', 'icon.svg'), exSvg + '\n')
await browser.close()

// The brief schema is the app's own definition (node-package.schema.json $defs.iconBrief: the generator draws from a
// fixed set of objects and cues), published standalone with the pack's descriptions and this version's styleVersion.
const Ajv2020 = (await import('ajv/dist/2020.js')).default
const ajv = new Ajv2020({ allErrors: true, strict: true, strictTypes: false, strictRequired: false })
const nodeSchema = JSON.parse(read('skills/tower-studio-node-builder/references/node-package.schema.json'))
const briefPath = join(OUT, 'icon-brief.schema.json')
const ours = JSON.parse(readFileSync(existsSync(briefPath) ? briefPath : join(BASE, 'v1', 'icon-brief.schema.json'), 'utf8'))
const appBrief = must(nodeSchema.$defs?.iconBrief, 'node-package.schema.json $defs.iconBrief')
must(appBrief.properties.styleVersion.enum.includes(VERSION), `styleVersion "${VERSION}" in node-package.schema.json`)
const withDesc = (app, mine) => {
  if (!app || typeof app !== 'object' || Array.isArray(app)) return app
  const out = { ...app }
  if (mine?.description) out.description = mine.description
  if (app.properties) out.properties = Object.fromEntries(Object.entries(app.properties).map(([k, v]) => [k, withDesc(v, mine?.properties?.[k])]))
  return out
}
const { description: _ignored, ...rest } = withDesc(appBrief, ours)
rest.properties = { ...rest.properties, styleVersion: { enum: [VERSION], description: `The style pack version the icon follows: "${VERSION}" for this pack. (The platform still draws briefs saved under earlier versions in their own style.)` } }
write(briefPath, json({ $schema: ours.$schema, $id: `${PACK_URL}icon-brief.schema.json`, title: `Node icon brief (node icon style pack v${VERSION})`, description: ours.description, ...rest }))
const validateBrief = ajv.compile(JSON.parse(readFileSync(briefPath, 'utf8')))
if (!validateBrief(brief)) throw new Error(`example brief fails icon-brief.schema.json: ${JSON.stringify(validateBrief.errors)}`)
const validateNode = ajv.compile(nodeSchema)
for (const f of ['example-node.json', 'example-node-with-image.json']) {
  const pkg = JSON.parse(readFileSync(join(OUT, 'example-node', f), 'utf8'))
  if (!validateNode(pkg)) throw new Error(`${f} fails node-package.schema.json: ${JSON.stringify(validateNode.errors.slice(0, 3))}`)
}
// The brief's words (objects, cues, the phase a category takes by default), from the app when it has them.
let words = null
try { const b = await load('src/lib/nodeIcons/brief.ts'); if (b.OBJECTS && b.CUES) words = b } catch { /* no brief module: words without descriptions */ }
const briefWords = () => {
  const sc = JSON.parse(readFileSync(briefPath, 'utf8'))
  return { objects: sc.properties.metaphor.properties.object.enum ?? [], cues: sc.properties.metaphor.properties.cue?.enum ?? [] }
}

// The generated blocks in the style guide.
const mdPath = join(OUT, 'NODE_ICON_STYLE.md')
if (existsSync(mdPath)) {
  const pct = (v) => `${(v * 100).toFixed(1)}%`
  const code = (s) => '`' + s + '`'
  const block = [
    '<!-- measured:start (written by tools/build_icon_pack.mjs) -->',
    `| Measure (${IDS.length} drawings at ${S} px; definitions in icon-tokens.json, measured.method) | Min | Median | Max |`,
    '|---|---|---|---|',
    `| Longest side of the artwork | ${pct(occ.min)} | ${pct(occ.median)} | ${pct(occ.max)} |`,
    `| Width | ${pct(STATS.width.min)} | ${pct(STATS.width.median)} | ${pct(STATS.width.max)} |`,
    `| Height | ${pct(STATS.height.min)} | ${pct(STATS.height.median)} | ${pct(STATS.height.max)} |`,
    `| Centre offset, x (+ right) | ${pct(STATS.centreOffset.x.min)} | ${pct(STATS.centreOffset.x.median)} | ${pct(STATS.centreOffset.x.max)} |`,
    `| Centre offset, y (+ down) | ${pct(STATS.centreOffset.y.min)} | ${pct(STATS.centreOffset.y.median)} | ${pct(STATS.centreOffset.y.max)} |`,
    `| Margin left / right | ${pct(STATS.margin.left.min)} / ${pct(STATS.margin.right.min)} | ${pct(STATS.margin.left.median)} / ${pct(STATS.margin.right.median)} | ${pct(STATS.margin.left.max)} / ${pct(STATS.margin.right.max)} |`,
    `| Margin top / bottom | ${pct(STATS.margin.top.min)} / ${pct(STATS.margin.bottom.min)} | ${pct(STATS.margin.top.median)} / ${pct(STATS.margin.bottom.median)} | ${pct(STATS.margin.top.max)} / ${pct(STATS.margin.bottom.max)} |`,
    `| Canvas covered by artwork | ${pct(STATS.inkShare.min)} | ${pct(STATS.inkShare.median)} | ${pct(STATS.inkShare.max)} |`,
    `| Outer 2 px ring that is solid (clipping) | ${pct(STATS.edgeShare.min)} | ${pct(STATS.edgeShare.median)} | ${pct(STATS.edgeShare.max)} |`,
    `| Solid pixels near the family palette | ${pct(STATS.paletteShare.min)} | ${pct(STATS.paletteShare.median)} | ${pct(STATS.paletteShare.max)} |`,
    `| At 30 px: solid pixels dark enough to show on white | ${pct(STATS.darkAt30px.min)} | ${pct(STATS.darkAt30px.median)} | ${pct(STATS.darkAt30px.max)} |`,
    `| At 30 px: solid pixels on a hard tonal edge (busy) | ${pct(STATS.busyAt30px.min)} | ${pct(STATS.busyAt30px.median)} | ${pct(STATS.busyAt30px.max)} |`,
    '',
    `In every drawing the longest side is the width, set by the ground plate (${pw} plan units → ${pct(STATS.width.median)} of the canvas); only drawings with something beside the plate reach wider (max ${pct(occ.max)}, ${code('built.view-from')}'s mountains).`,
    '',
    `Adopted export target: longest side **${pct(EXPORT.occupancy.target)} ± ${pct(EXPORT.occupancy.tolerance)}** of the canvas (accept ${pct(EXPORT.occupancy.accept[0])}–${pct(EXPORT.occupancy.accept[1])}); centred left to right within ${pct(EXPORT.centre.x.maxOffset)}; the plate's lowest point ${pct(EXPORT.centre.y.bottomMargin)} above the bottom edge (accept ${pct(EXPORT.centre.y.accept[0])}–${pct(EXPORT.centre.y.accept[1])}); safe area: nothing closer than ${EXPORT.safeMargin.px} px (${pct(EXPORT.safeMargin.fraction)}) to any edge. On the tile that is ${pct(STATS.inTile.longestSide)} of the tile side. The worked example's agent-drawn icon measures ${pct(exCheck.longest)} wide, centre offset ${pct(exCheck.centreOffset[0])} / ${pct(exCheck.centreOffset[1])}, bottom margin ${pct(exCheck.margins.bottom)}.`,
    '<!-- measured:end -->',
  ].join('\n')
  const vw = briefWords()
  const vocab = [
    '<!-- vocabulary:start (written by tools/build_icon_pack.mjs from the brief schema) -->',
    `| ${code('metaphor.object')} | Shows |`, '|---|---|',
    ...vw.objects.map((o) => `| ${code(o)} | ${words?.OBJECT_WORDS?.[o] ?? ''} |`),
    '',
    `| ${code('metaphor.cue')} | Shows |`, '|---|---|',
    ...vw.cues.map((o) => `| ${code(o)} | ${words?.CUE_WORDS?.[o] ?? ''} |`),
    ...(words?.CATEGORY_PHASE ? ['', `Without ${code('phase')}, the accent follows the category: ${Object.entries(words.CATEGORY_PHASE).map(([c, p]) => `${c} ${p}`).join(', ')}.`] : []),
    '<!-- vocabulary:end -->',
  ].join('\n')
  const phaseTable = [
    '<!-- phases:start (written by tools/build_icon_pack.mjs from lib/design/tokens.ts) -->',
    '| Phase | Top | Left face | Right face |', '|---|---|---|---|',
    ...PHASE_IDS.map((p) => `| ${cap(p)} | ${accentOf(p).map(code).join(' | ')} |`),
    '<!-- phases:end -->',
  ].join('\n')
  const md = readFileSync(mdPath, 'utf8')
  writeFileSync(mdPath, md
    .replace(/<!-- measured:start[\s\S]*?<!-- measured:end -->/, block)
    .replace(/<!-- vocabulary:start[\s\S]*?<!-- vocabulary:end -->/, vocab)
    .replace(/<!-- phases:start[\s\S]*?<!-- phases:end -->/, phaseTable))
}

// ---------- 7. manifest, zip, latest ----------
const files = []
const walk = (dir) => { for (const f of readdirSync(dir)) { const p = join(dir, f); statSync(p).isDirectory() ? walk(p) : files.push(p) } }
walk(OUT)
const listed = files.filter((p) => !p.endsWith(ZIP_NAME) && !p.endsWith('manifest.json')).sort()
const rel = (p) => relative(OUT, p).replace(/\\/g, '/')
const MANIFEST = {
  name: 'Tower Design Toolkit node icon style pack',
  version: VERSION,
  date: DATE,
  url: PACK_URL,
  zip: ZIP_NAME,
  note: 'sha256 and bytes of every file in the pack; the zip holds all of them plus this manifest.',
  files: listed.map((p) => { const b = readFileSync(p); return { path: rel(p), bytes: b.length, sha256: sha256(b) } }),
}
write(join(OUT, 'manifest.json'), json(MANIFEST))
const zipFiles = Object.fromEntries([...listed, join(OUT, 'manifest.json')].map((p) => [`node-icon-style-pack-v${VERSION}/${rel(p)}`, [readFileSync(p), { level: /\.png$/.test(p) ? 0 : 9 }]]))
const zip = zipSync(zipFiles, { mtime: new Date(`${DATE}T12:00:00Z`) })
write(join(OUT, ZIP_NAME), zip)
if (VERSION === CURRENT) write(join(BASE, 'latest.json'), json({ version: VERSION, path: `v${VERSION}/`, zip: `v${VERSION}/${ZIP_NAME}`, date: DATE, versions: [...Object.keys(FROZEN), ...Object.keys(PACKS)].sort() }))

// ---------- report ----------
const back = unzipSync(zip)
must(strFromU8(back[`node-icon-style-pack-v${VERSION}/manifest.json`]).includes(`"version": "${VERSION}"`), 'the zip round trip')
const frozenAfter = checkFrozen()
let total = 0; for (const p of files) total += statSync(p).size
console.log(`Node icon style pack v${VERSION}: ${IDS.length} drawings measured, ${REFERENCES.length} references, ${Object.keys(back).length} files in ${ZIP_NAME} (${(zip.length / 1024).toFixed(0)} KB); folder ${(total / 1024 / 1024).toFixed(2)} MB.`)
console.log(`Frozen packs before: ${frozenBefore.join('; ')}. After: ${frozenAfter.join('; ')}.`)
console.log(`Palette: ${PALETTE.length} colours, ${appPaletteNote}.`)
console.log(`Longest side: min ${occ.min}, median ${occ.median}, max ${occ.max}; centre offset median x ${STATS.centreOffset.x.median}, y ${STATS.centreOffset.y.median}; palette share min ${STATS.paletteShare.min}; dark@30 min ${STATS.darkAt30px.min}; busy@30 max ${STATS.busyAt30px.max}; ink max ${STATS.inkShare.max}.`)
console.log(`Thresholds: ${JSON.stringify(T)}`)
for (const [k, b] of Object.entries(BASIS)) console.log(`  ${k}: ${b}`)
console.log(`Adopted: ${EXPORT.occupancy.target} ± ${EXPORT.occupancy.tolerance} (accept ${EXPORT.occupancy.accept.join('–')}); safe margin ${EXPORT.safeMargin.px} px. Example icon: longest ${exCheck.longest}, centre ${exCheck.centreOffset.join(', ')}, palette ${exCheck.paletteShare}, dark30 ${exCheck.darkAt30px}; embedded ${exSmall.length} bytes.`)
for (const m of [...measured].sort((a, b) => a.darkAt30px - b.darkAt30px)) console.log(`  ${m.id.padEnd(24)} ${m.phase.padEnd(9)} longest ${m.longest}  h ${m.height}  palette ${m.paletteShare}  dark30 ${m.darkAt30px}  busy30 ${m.busyAt30px}  ink ${m.inkShare}`)
