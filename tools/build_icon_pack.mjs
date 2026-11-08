// Builds the node icon style pack (public/style-pack/node-icons/v1/): the rules, tokens, reference artwork and an example
// node package that our assistant and outside AI agents follow when they make a design-node icon (Ruijie, 7 Nov: "Use
// the original artwork files, rather than screenshots … values must come from the icon family we maintain … Confirm
// this specification against our existing icons before adopting it").
//
// Everything is taken from the family itself, not typed in again:
//   - the drawings: src/components/icons/nodeArt.tsx, loaded with Vite's module runner (no dev server) and rendered
//     with react-dom/server to standalone SVG;
//   - the numbers (iso frame, plate, tones, strokes, colours): read from that file's source;
//   - phase hues: src/lib/phases.ts; the tile: src/index.css (.node-tile, --radius-ui) and src/components/NodeTile.tsx;
//   - occupancy, centre and margins: MEASURED on the 512 px PNG of every drawing (non-transparent pixels).
// The 512 px PNGs are rasterised by Playwright (system Edge, or the cached headless Chromium) with a transparent
// background. The hand-written NODE_ICON_STYLE.md gets its measured block refreshed between the markers.
//
// Usage: node tools/build_icon_pack.mjs        (from the tower-studio folder; writes public/style-pack/node-icons/)
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
const VERSION = '1'
const DATE = '2026-11-07'
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
  ['built.viewcones', 'Site', 'A sloping view plane passing over a tower: a spatial diagram on an object.'],
  ['built.sun', 'Form', 'A tower, its shadow on the ground, and the sun as the one supporting cue (upper right).'],
  ['built.wind-screen', 'Form', 'Wind brought down a tower face to the street, and the risk zone it makes there.'],
  ['built.pr-frontage', 'Program', 'A podium with shopfronts and accent canopies along the street.'],
  ['built.core-lifts', 'Schematic', 'Floor plates around an accent core that rises through them, lift shafts as thin lines.'],
  ['built.energy-carbon', 'Schematic', 'Solar panels on a roof, and a flat lightning bolt as the one cue.'],
  ['built.daylight-depth', 'Schematic', 'A window wall and the daylit floor beside it: the most detailed the family gets.'],
  ['built.provenance', 'Present', 'A record sheet with its entries and an accent stamp: a log, not a robot.'],
]

process.env.PLAYWRIGHT_BROWSERS_PATH ??= 'F:/UBC Master of Architecture/ARCH540 AI Studio/tools-cache/ms-playwright'
const require = createRequire(join(ROOT, 'package.json'))

const read = (p) => readFileSync(join(ROOT, p), 'utf8')
const must = (m, what) => { if (!m) throw new Error(`build_icon_pack: could not read ${what}; did the source change?`); return m }
const write = (p, data) => { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, data) }
const json = (v) => JSON.stringify(v, null, 2) + '\n'
const r = (v, d = 3) => Number(v.toFixed(d))
const median = (xs) => { const s = [...xs].sort((a, b) => a - b), k = s.length >> 1; return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2 }

// ---------- 1. the family's numbers, from its own source ----------
const artSrc = read('src/components/icons/nodeArt.tsx')
const isoM = must(/\[\s*24 \+ \(x - y\) \* ([\d.]+), ([\d.]+) \+ \(x \+ y\) \* ([\d.]+) - z \* ([\d.]+)\s*\]/.exec(artSrc), 'the iso() formula')
const ISO = { cx: 24, cy: Number(isoM[2]), kx: Number(isoM[1]), ky: Number(isoM[3]), kz: Number(isoM[4]) }
const toneRows = Object.fromEntries([...artSrc.matchAll(/case '(\w)': return \[([^\]]+)\]/g)].map((m) => [m[1], [...m[2].matchAll(/['`]([^'`]+)['`]/g)].map((x) => x[1])]))
for (const t of ['n', 'p', 'g', 'w', 'k', 'a']) must(toneRows[t]?.length === 3, `tone '${t}'`)
const plateM = must(/const plate = \(c: Ctx\) => box\(c, ([\d., ]+), 'p'\)/.exec(artSrc), 'the ground plate')
const [px0, py0, pz0, pw, pd, ph] = plateM[1].split(',').map(Number)
const INK = must(/const INK = '([^']+)'/.exec(artSrc), 'INK')[1]
const lineDefault = Number(must(/const line = \([^)]*w = ([\d.]+)/.exec(artSrc), 'line() default width')[1])
const artBody = artSrc.slice(artSrc.indexOf('const ART'), artSrc.indexOf('export const hasNodeArt'))
const IDS = [...artBody.matchAll(/^\s*'(built\.[a-z0-9-]+)': \(c\) =>/gm)].map((m) => m[1])
const strokeWidths = [...new Set([
  ...[...artBody.matchAll(/strokeWidth=\{([\d.]+)\}/g)].map((m) => Number(m[1])),
  ...[...artBody.matchAll(/line\([^;]*?, (?:A\(c, \d\)|'#fff'|tones\('\w', c\.h\)\[\d\]|INK), ([\d.]+)/g)].map((m) => Number(m[1])),
  lineDefault,
])].sort((a, b) => a - b)
const extraColours = [...new Set([...artBody.matchAll(/(#[0-9a-f]{3,6}\b|rgb\([^)]*\))/gi)].map((m) => m[1]))]

const phasesSrc = read('src/lib/phases.ts')
const cssSrc = read('src/index.css')
const tileBlock = must(/\.node-tile \{([^}]+)\}/.exec(cssSrc), '.node-tile CSS')[1]
const TILE = {
  background: must(/background: ([^;]+);/.exec(tileBlock), 'tile background')[1],
  radiusPx: Number(must(/--radius-ui: ([\d.]+)rem;/.exec(cssSrc), '--radius-ui')[1]) * 16,
  shadow: must(/box-shadow: ([^;]+);/.exec(tileBlock), 'tile shadow')[1],
  artScale: Number(must(/size \* ([\d.]+)\)/.exec(read('src/components/NodeTile.tsx')), 'NodeTile art scale')[1]),
}
const iconSizes = must(/export const ICON = \{ feature: (\d+), tool: (\d+) \}/.exec(read('src/components/GlassIcon.tsx')), 'ICON sizes')
const shelf = Number(must(/const SHELF_S = ([\d.]+)/.exec(read('src/components/landing/Intro.tsx')), 'SHELF_S')[1])

// ---------- 2. the drawings, rendered by the family's own code ----------
const { module: art } = await runnerImport(join(ROOT, 'src/components/icons/nodeArt.tsx'), { root: ROOT, configFile: false, logLevel: 'error' })
const { module: phases } = await runnerImport(join(ROOT, 'src/lib/phases.ts'), { root: ROOT, configFile: false, logLevel: 'error' })
const PHASE_HUE = phases.PHASE_HUE
must(IDS.length >= 31 && IDS.every((id) => art.hasNodeArt(id)), `the ${IDS.length} drawings`)
for (const [id] of REFERENCES) must(IDS.includes(id), `reference ${id}`)

/** A drawing as a standalone SVG file: the family's own markup with an xmlns, transparent, 512 px. */
const svgOf = (id) => renderToStaticMarkup(createElement(art.NodeArt, { id, size: S }))
  .replace(/^<svg [^>]*>/, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="${S}" height="${S}">`)

const hsl = (h, s, l) => { // CSS hsl() → #rrggbb
  s /= 100; l /= 100
  const k = (n) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l)
  const f = (n) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1))))).toString(16).padStart(2, '0')
  return `#${f(0)}${f(8)}${f(4)}`
}
const accentSpec = toneRows.a.map((t) => must(/hsl\(\$\{h\} (\d+)% (\d+)%\)/.exec(t), 'accent hsl')).map((m) => [Number(m[1]), Number(m[2])])
const accentOf = (h) => accentSpec.map(([s, l]) => `hsl(${h} ${s}% ${l}%)`)
const accentHexOf = (h) => accentSpec.map(([s, l]) => hsl(h, s, l))

// ---------- 3. an icon drawn by an "outside agent" from these tokens alone (the example package's image) ----------
// The worked example node (Tower width & proportion, CDDG) has no drawing in the family, so this is what an agent
// following the pack would draw: one tower on the plate (the object), its base width dimensioned (the one cue).
function exampleSvg(size) {
  const iso = (x, y, z = 0) => [ISO.cx + (x - y) * ISO.kx, ISO.cy + (x + y) * ISO.ky - z * ISO.kz]
  const P = (...ps) => ps.map((q) => iso(...q).map((v) => v.toFixed(2)).join(',')).join(' ')
  const h = PHASE_HUE.form, A = accentOf(h)
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

// The family palette for the similarity check: every tone of every material, the accents of all five phases, the
// other colours the drawings use (opaque ones), and white.
const opaqueHex = (c) => (/^#[0-9a-f]{6}$/i.test(c) ? c.toLowerCase() : /^#[0-9a-f]{3}$/i.test(c) ? `#${[...c.slice(1)].map((x) => x + x).join('')}`.toLowerCase() : null)
const PALETTE = [...new Set([
  ...['n', 'p', 'g', 'w', 'k'].flatMap((t) => toneRows[t]),
  ...Object.values(PHASE_HUE).flatMap((h) => accentHexOf(h)),
  ...extraColours.map(opaqueHex).filter(Boolean), '#ffffff',
])]

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
  measured.push({ id, ...frameOf(await measure(png, PALETTE)) })
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

// The export spec, from the measurement (the 75% proposal is checked against it in NODE_ICON_STYLE.md).
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
  safeMargin: { fraction: r(safe, 2), px: Math.round(safe * S), note: 'No artwork pixel closer to the edge than this (the family\'s smallest margin, rounded down; at least 2%).' },
  inPackage: { formats: ['png', 'webp'], recommendedPx: 256, recommendedMaxBytes: 61440, note: 'Inside a node package the icon travels as a data URL. Recommended: a 256 × 256 copy of the master (the size the platform displays), under 60 KB, so the package stays small. The platform accepts up to the upload limits.' },
  upload: { formats: ['png', 'jpeg', 'webp'], svg: false, minPx: 64, maxPx: 4096, maxBytes: 5 * 1024 * 1024, displayPx: 256, note: 'Limits as the platform applies them (src/lib/nodeIcons/image.ts). A non-square image is fitted into the square tile. JPEG has no transparency.' },
}

// What the platform checks on an image icon. "block": the icon is refused (the node keeps its standard drawing).
// "warn": the icon is shown with the warning in words. Block rules mirror the platform; warn thresholds are measured
// on the family, with the same definitions as the platform's checks.
const floor2 = (v) => Math.floor(v * 100) / 100, ceil2 = (v) => Math.ceil(v * 100) / 100
const VALIDATION = {
  note: 'Measured on the decoded image with the definitions in measured.method. An agent saying its icon follows the pack is not a check.',
  block: [
    { id: 'format', rule: 'The bytes are PNG, JPEG or WebP (read from the file\'s first bytes, not its name). SVG is refused in v1.' },
    { id: 'size', rule: `Not empty, at most ${EXPORT.upload.maxBytes / 1048576} MB.` },
    { id: 'renders', rule: 'The browser can decode it and draw it.' },
    { id: 'dimensions', rule: `${EXPORT.upload.minPx}-${EXPORT.upload.maxPx} px a side.` },
  ],
  warn: [
    { id: 'framing', rule: `Longest side of the artwork ${EXPORT.occupancy.accept[0]}-${EXPORT.occupancy.accept[1]} of the square (family ${occ.min}-${occ.max}); left to right within ${EXPORT.centre.x.maxOffset} of the centre; the lowest point ${EXPORT.centre.y.accept[0]}-${EXPORT.centre.y.accept[1]} above the bottom edge.`, occupancy: EXPORT.occupancy.accept, maxOffsetX: EXPORT.centre.x.maxOffset, bottomMargin: EXPORT.centre.y.accept },
    { id: 'clipping', rule: `Less than 4% of the outer 2 px ring is solid (family max ${STATS.edgeShare.max}); for an export, nothing within ${EXPORT.safeMargin.px} px of a 512 edge.`, maxEdgeShare: 0.04, safeMargin: EXPORT.safeMargin.fraction },
    { id: 'background', rule: `Transparent around the drawing: at most ${ceil2(STATS.inkShare.max + 0.05)} of the square is not transparent (family ${STATS.inkShare.min}-${STATS.inkShare.max}). A JPEG always has a background.`, maxInkShare: ceil2(STATS.inkShare.max + 0.05) },
    { id: 'legibility', rule: `At ${SMALL} px, at least ${floor2(STATS.darkAt30px.min * 0.9)} of the solid pixels are dark enough to show on the white tile (1 − luminance > 0.18; family ${STATS.darkAt30px.min}-${STATS.darkAt30px.max}), and at most ${ceil2(STATS.busyAt30px.max * 1.25)} sit on a hard tonal edge (family ${STATS.busyAt30px.min}-${STATS.busyAt30px.max}).`, minDark: floor2(STATS.darkAt30px.min * 0.9), maxBusy: ceil2(STATS.busyAt30px.max * 1.25) },
    { id: 'palette', rule: `At least ${floor2(Math.min(0.85, STATS.paletteShare.min))} of the solid pixels lie within RGB distance ${PALETTE_DIST} of the family palette (family ${STATS.paletteShare.min}-${STATS.paletteShare.max}).`, minPaletteShare: floor2(Math.min(0.85, STATS.paletteShare.min)), distance: PALETTE_DIST, palette: PALETTE },
  ],
  preview: 'Before the icon is used, the person sees it on its tile at 52, 40 and 30 px with every check in words, and keeps it or drops it. The original file is kept; the platform shows a 256 px copy.',
}

// ---------- 5. tokens ----------
const TOKENS = {
  version: VERSION,
  date: DATE,
  url: PACK_URL,
  source: 'src/components/icons/nodeArt.tsx (drawings and tones), src/lib/phases.ts (phase hues), src/index.css .node-tile and src/components/NodeTile.tsx (tile). Generated by tools/build_icon_pack.mjs; do not edit by hand.',
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
    a: { use: "the node's task, in its phase colour", tones: toneRows.a, formula: toneRows.a.map((t) => t.replace('${h}', 'h')) },
  },
  phases: Object.fromEntries(Object.entries(PHASE_HUE).map(([p, h]) => [p, { hue: h, accent: accentOf(h), accentHex: accentHexOf(h) }])),
  otherColours: { ink: INK, white: '#fff', usedInDrawings: extraColours, note: 'Shadows are rgb(58 66 80 / 0.28) on the ground; white is used for glazing bars and marks on accent shapes.' },
  strokes: { widthsUsed: strokeWidths, lineDefault, cap: 'round', join: 'round', rule: 'Thin lines only as detail inside or on a form (mullions, lift shafts, dimension and wind lines, a dashed reach): 0.5-1.3 units; symbol strokes up to 2.2. Never an outline around a form.', pxAt512: Object.fromEntries(strokeWidths.map((w) => [w, r((w * S) / 48, 1)])) },
  supportingCue: { zone: { x: [30, 46], y: [3, 22] }, note: 'The one optional cue (sun, bolt, shield, check, plane, drop) sits flat, unprojected, in the upper right of the 48 grid, about 7-12 units across, in the accent or a material tone.' },
  tile: { background: TILE.background, radiusPx: TILE.radiusPx, artScale: TILE.artScale, shadow: TILE.shadow, states: { soft: 'background rgb(255 255 255 / 0.86); art saturate(0.7)', off: 'background rgb(255 255 255 / 0.6); art saturate(0.12), opacity 0.7' } },
  displaySizes: { px: [30, 40, 52], where: { 52: `workflow board (GlassIcon ICON.feature; scales to 0.72 on narrow windows)`, 40: 'ribbon and tools (ICON.tool)', 30: `lane shelves (${iconSizes[1]} × ${shelf} ≈ ${Math.round(iconSizes[1] * shelf)} px)` } },
  export: EXPORT,
  validation: VALIDATION,
  measured: STATS,
  references: REFERENCES.map(([id, phase]) => ({ id, phase: phase.toLowerCase(), svg: `references/${id}.svg`, png: `references/${id}.png` })),
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
  '| Node | Phase colour | What it shows | Longest side |',
  '|---|---|---|---|',
  ...REFERENCES.map(([id, phase, what]) => `| \`${id}\` | ${phase} (hue ${PHASE_HUE[phase.toLowerCase()]}) | ${what} | ${measured.find((m) => m.id === id).longest} |`),
  '',
  `Longest side = the artwork's box as a fraction of the canvas (family median ${occ.median}). The previews in \`../previews/\` show all ${IDS.length} drawings on their tiles and these references at 52, 40 and 30 px.`,
  '',
].join('\n'))
write(join(OUT, 'icon-tokens.json'), json(TOKENS))

// Previews: the whole family on its tiles, and the references at the three display sizes.
const tileCss = `.t{display:inline-flex;align-items:center;justify-content:center;background:${TILE.background};border-radius:${TILE.radiusPx}px;box-shadow:${TILE.shadow};margin:6px}`
const tile = (svg, size) => `<span class="t" style="width:${size}px;height:${size}px">${svg.replace(/width="\d+" height="\d+"/, `width="${Math.round(size * TILE.artScale)}" height="${Math.round(size * TILE.artScale)}"`)}</span>`
const sheetPage = await browser.newPage({ viewport: { width: 900, height: 200 }, deviceScaleFactor: 2 })
async function sheet(html, file) {
  await sheetPage.setContent(`<!doctype html><html><head><style>html,body{margin:0;background:#eef2f0;font:12px system-ui,sans-serif;color:#3a4250}${tileCss}.row{display:flex;align-items:center;gap:4px;padding:4px 12px}.lab{width:76px}</style></head><body><div id="s" style="display:inline-block;padding:10px 0">${html}</div></body></html>`)
  write(file, await (await sheetPage.$('#s')).screenshot())
}
const byPhase = phases.PHASES.map((p) => `<div class="row"><span class="lab">${p.name}</span>${p.nodes.filter((id) => IDS.includes(id)).map((id) => tile(svgOf(id), 52)).join('')}</div>`).join('')
await sheet(byPhase, join(OUT, 'previews', 'family-52px.png'))
const sizes = [52, 40, 30].map((s) => `<div class="row"><span class="lab">${s} px</span>${REFERENCES.map(([id]) => tile(svgOf(id), s)).join('')}</div>`).join('')
await sheet(sizes, join(OUT, 'previews', 'size-check.png'))

// The example node package, both ways.
const example = JSON.parse(read('skills/tower-studio-node-builder/references/example-node.json'))
const brief = {
  styleVersion: VERSION,
  name: example.name,
  function: 'Compares each tower\'s widest plan side with the CDDG 29 m guideline, its height-to-width ratio with the 6:1 tip and its width with the site frontage; shows plate area for information. Says Check, never Fail, on tips.',
  category: example.category,
  phase: 'form',
  metaphor: { object: 'tower', cue: 'none' },
  notes: "Show the tower's width, e.g. a dimension along its base. No check mark or warning sign: the node compares with guidance and says Check, never Fail, on tips.",
}
const exSvg = exampleSvg(S)
const exPng = await rasterise(exSvg)
const exSmall = await rasterise(exampleSvg(256), 256)
const exCheck = frameOf(await measure(exPng, PALETTE))
const exNoteNode = { ...example, createdWith: `${example.createdWith}; icon brief per node icon style pack v${VERSION}` }
write(join(OUT, 'example-node', 'example-node.json'), json({ ...exNoteNode, icon: { kind: 'brief', brief } }))
write(join(OUT, 'example-node', 'example-node-with-image.json'), json({
  ...example, createdWith: `${example.createdWith}; icon drawn by an agent from node icon style pack v${VERSION}`,
  icon: { kind: 'image', dataUrl: `data:image/png;base64,${exSmall.toString('base64')}`, source: 'agent', styleVersion: VERSION },
}))
write(join(OUT, 'example-node', 'icon.png'), exPng)
write(join(OUT, 'example-node', 'icon.svg'), exSvg + '\n')
await browser.close()

// The brief schema is the app's own definition (node-package.schema.json $defs.iconBrief: the generator draws from a
// fixed set of objects and cues), published standalone with the pack's descriptions. Both must accept the examples.
const Ajv2020 = (await import('ajv/dist/2020.js')).default
const ajv = new Ajv2020({ allErrors: true, strict: true, strictTypes: false, strictRequired: false })
const nodeSchema = JSON.parse(read('skills/tower-studio-node-builder/references/node-package.schema.json'))
const briefPath = join(OUT, 'icon-brief.schema.json')
const ours = JSON.parse(readFileSync(briefPath, 'utf8'))
const appBrief = nodeSchema.$defs?.iconBrief
if (appBrief) {
  const withDesc = (app, mine) => {
    if (!app || typeof app !== 'object' || Array.isArray(app)) return app
    const out = { ...app }
    if (mine?.description) out.description = mine.description
    if (app.properties) out.properties = Object.fromEntries(Object.entries(app.properties).map(([k, v]) => [k, withDesc(v, mine?.properties?.[k])]))
    return out
  }
  const { description: _ignored, ...rest } = withDesc(appBrief, ours)
  write(briefPath, json({ $schema: ours.$schema, $id: ours.$id, title: ours.title, description: ours.description, ...rest }))
}
const validateBrief = ajv.compile(JSON.parse(readFileSync(briefPath, 'utf8')))
if (!validateBrief(brief)) throw new Error(`example brief fails icon-brief.schema.json: ${JSON.stringify(validateBrief.errors)}`)
const validateNode = ajv.compile(nodeSchema)
for (const f of ['example-node.json', 'example-node-with-image.json']) {
  const pkg = JSON.parse(readFileSync(join(OUT, 'example-node', f), 'utf8'))
  if (!nodeSchema.properties.icon) delete pkg.icon
  if (!validateNode(pkg)) throw new Error(`${f} fails node-package.schema.json: ${JSON.stringify(validateNode.errors.slice(0, 3))}`)
}
// The brief's words (objects, cues, the phase a category takes by default), from the app when it has them.
let words = null
try {
  const { module: b } = await runnerImport(join(ROOT, 'src/lib/nodeIcons/brief.ts'), { root: ROOT, configFile: false, logLevel: 'error' })
  if (b.OBJECTS && b.CUES) words = b
} catch { /* no brief module in the app: the guide lists the schema's words without descriptions */ }
const briefWords = () => {
  const sc = JSON.parse(readFileSync(briefPath, 'utf8'))
  return { objects: sc.properties.metaphor.properties.object.enum ?? [], cues: sc.properties.metaphor.properties.cue?.enum ?? [] }
}

// The measured block in the style guide.
const mdPath = join(OUT, 'NODE_ICON_STYLE.md')
if (existsSync(mdPath)) {
  const pct = (v) => `${(v * 100).toFixed(1)}%`
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
    `In every drawing the longest side is the width, set by the ground plate (${pw} plan units → ${pct(STATS.width.median)} of the canvas); only drawings with something beside the plate reach wider (max ${pct(occ.max)}, \`built.view-from\`'s mountains).`,
    '',
    `Adopted export target: longest side **${pct(EXPORT.occupancy.target)} ± ${pct(EXPORT.occupancy.tolerance)}** of the canvas (accept ${pct(EXPORT.occupancy.accept[0])}–${pct(EXPORT.occupancy.accept[1])}); centred left to right within ${pct(EXPORT.centre.x.maxOffset)}; the plate's lowest point ${pct(EXPORT.centre.y.bottomMargin)} above the bottom edge (accept ${pct(EXPORT.centre.y.accept[0])}–${pct(EXPORT.centre.y.accept[1])}); nothing closer than ${EXPORT.safeMargin.px} px (${pct(EXPORT.safeMargin.fraction)}) to any edge. On the tile that is ${pct(STATS.inTile.longestSide)} of the tile side. The worked example's agent-drawn icon measures ${pct(exCheck.longest)} wide, centre offset ${pct(exCheck.centreOffset[0])} / ${pct(exCheck.centreOffset[1])}, bottom margin ${pct(exCheck.margins.bottom)}.`,
    '<!-- measured:end -->',
  ].join('\n')
  const vw = briefWords()
  const code = (s) => '`' + s + '`'
  const vocab = [
    '<!-- vocabulary:start (written by tools/build_icon_pack.mjs from the brief schema) -->',
    `| ${code('metaphor.object')} | Shows |`, '|---|---|',
    ...vw.objects.map((o) => `| ${code(o)} | ${words?.OBJECT_WORDS?.[o] ?? ''} |`),
    '',
    `| ${code('metaphor.cue')} | Shows |`, '|---|---|',
    ...vw.cues.map((o) => `| ${code(o)} | ${words?.CUE_WORDS?.[o] ?? ''} |`),
    ...(words?.CATEGORY_PHASE ? ['', `Without ${code('phase')}, the accent follows the category: ${Object.entries(words.CATEGORY_PHASE).map(([c, ph]) => `${c} ${ph}`).join(', ')}.`] : []),
    '<!-- vocabulary:end -->',
  ].join('\n')
  const md = readFileSync(mdPath, 'utf8')
  writeFileSync(mdPath, md.replace(/<!-- measured:start[\s\S]*?<!-- measured:end -->/, block).replace(/<!-- vocabulary:start[\s\S]*?<!-- vocabulary:end -->/, vocab))
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
  files: listed.map((p) => { const b = readFileSync(p); return { path: rel(p), bytes: b.length, sha256: createHash('sha256').update(b).digest('hex') } }),
}
write(join(OUT, 'manifest.json'), json(MANIFEST))
const zipFiles = Object.fromEntries([...listed, join(OUT, 'manifest.json')].map((p) => [`node-icon-style-pack-v${VERSION}/${rel(p)}`, [readFileSync(p), { level: /\.png$/.test(p) ? 0 : 9 }]]))
const zip = zipSync(zipFiles, { mtime: new Date(`${DATE}T12:00:00Z`) })
write(join(OUT, ZIP_NAME), zip)
write(join(BASE, 'latest.json'), json({ version: VERSION, path: `v${VERSION}/`, zip: `v${VERSION}/${ZIP_NAME}`, date: DATE }))

// ---------- report ----------
const back = unzipSync(zip)
must(strFromU8(back[`node-icon-style-pack-v${VERSION}/manifest.json`]).includes(`"version": "${VERSION}"`), 'the zip round trip')
let total = 0; for (const p of files) total += statSync(p).size
console.log(`Node icon style pack v${VERSION}: ${IDS.length} drawings measured, ${REFERENCES.length} references, ${Object.keys(back).length} files in ${ZIP_NAME} (${(zip.length / 1024).toFixed(0)} KB); folder ${(total / 1024 / 1024).toFixed(2)} MB.`)
console.log(`Longest side: min ${occ.min}, median ${occ.median}, max ${occ.max}; centre offset median x ${STATS.centreOffset.x.median}, y ${STATS.centreOffset.y.median}; palette share median ${STATS.paletteShare.median}.`)
console.log(`Adopted: ${EXPORT.occupancy.target} ± ${EXPORT.occupancy.tolerance} (accept ${EXPORT.occupancy.accept.join('–')}); safe margin ${EXPORT.safeMargin.px} px. Example icon: longest ${exCheck.longest}, centre ${exCheck.centreOffset.join(', ')}, palette ${exCheck.paletteShare}; embedded ${exSmall.length} bytes.`)
for (const m of [...measured].sort((a, b) => a.longest - b.longest)) console.log(`  ${m.id.padEnd(24)} longest ${m.longest}  w ${m.width} h ${m.height}  centre ${m.centreOffset.join(', ')}  palette ${m.paletteShare}  dark30 ${m.darkAt30px}  busy30 ${m.busyAt30px}  ink ${m.inkShare}`)
