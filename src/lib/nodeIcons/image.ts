// Uploaded node icons (Ruijie, 7 Nov): PNG, JPEG and WebP only for now (SVG waits for a restricted sanitiser); the file's
// actual content, size, pixel dimensions and whether it renders are checked; it is normalised into one display asset
// (256 px, transparent, Fit by default, Crop on request); visual quality (framing, clipping, background, legibility at
// its real sizes, closeness to the toolkit palette) is checked separately and reported, never claimed. "Match toolkit
// style" makes a second, restyled copy; the original is kept. The pixel analysis is pure (RGBA arrays) so it is tested
// without a browser; the canvas work is a thin layer on top.

export const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const
export type AcceptedType = (typeof ACCEPTED_TYPES)[number]
export const TYPE_WORD: Record<AcceptedType, string> = { 'image/png': 'PNG', 'image/jpeg': 'JPEG', 'image/webp': 'WebP' }
export const MAX_BYTES = 5 * 1024 * 1024
export const MIN_PX = 64
export const MAX_PX = 4096
/** The display asset's size (square); tiles show it at 90% of their size, like the built illustrations. */
export const DISPLAY = 256

/** What the bytes are, from their first bytes (never the name or the browser's guess). */
export function sniff(b: Uint8Array): AcceptedType | 'image/svg+xml' | null {
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return 'image/png'
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg'
  if (b.length >= 12 && String.fromCharCode(...b.slice(0, 4)) === 'RIFF' && String.fromCharCode(...b.slice(8, 12)) === 'WEBP') return 'image/webp'
  const head = new TextDecoder().decode(b.slice(0, 512)).trimStart().toLowerCase()
  if (head.startsWith('<svg') || (head.startsWith('<?xml') && head.includes('<svg'))) return 'image/svg+xml'
  return null
}

export interface Upload { type: AcceptedType; width: number; height: number; bytes: Uint8Array; bitmap: ImageBitmap }
/** Reads an uploaded file: format by content, size, decoding (it must render), pixel dimensions. Problems in words. */
export async function readUpload(file: Blob): Promise<{ ok: true; upload: Upload } | { ok: false; problems: string[] }> {
  const problems: string[] = []
  if (file.size > MAX_BYTES) problems.push(`The file is ${(file.size / 1048576).toFixed(1)} MB; icons can be up to ${MAX_BYTES / 1048576} MB.`)
  if (file.size === 0) problems.push('The file is empty.')
  if (problems.length) return { ok: false, problems }
  const bytes = new Uint8Array(await file.arrayBuffer())
  const type = sniff(bytes)
  if (type === 'image/svg+xml') return { ok: false, problems: ['SVG icons are not accepted yet (they need a sanitiser first). Export the icon as a PNG, JPEG or WebP.'] }
  if (!type) return { ok: false, problems: ['This is not a PNG, JPEG or WebP image (checked from the file’s contents, not its name).'] }
  let bitmap: ImageBitmap
  try { bitmap = await createImageBitmap(new Blob([bytes], { type })) } catch { return { ok: false, problems: [`The ${TYPE_WORD[type]} could not be drawn: the file may be damaged.`] } }
  const { width, height } = bitmap
  if (width < MIN_PX || height < MIN_PX) problems.push(`The image is ${width} × ${height} px; it needs at least ${MIN_PX} px on each side to stay sharp in a tile.`)
  if (width > MAX_PX || height > MAX_PX) problems.push(`The image is ${width} × ${height} px; ${MAX_PX} px a side is the most an icon can be.`)
  if (problems.length) { bitmap.close?.(); return { ok: false, problems } }
  return { ok: true, upload: { type, width, height, bytes, bitmap } }
}

/** How the image sits in its tile: Fit keeps all of it (default); Crop fills the tile, zoomed and moved. */
export interface Adjust { mode: 'fit' | 'crop'; zoom: number; dx: number; dy: number }
export const FIT: Adjust = { mode: 'fit', zoom: 1, dx: 0, dy: 0 }

/** Where the image is drawn in a square of `size`: Fit (contain, centred) or Crop (cover × zoom, moved by dx, dy in -1..1). */
export function placement(w: number, h: number, a: Adjust, size = DISPLAY): { x: number; y: number; w: number; h: number } {
  const k = a.mode === 'fit' ? Math.min(size / w, size / h) : Math.max(size / w, size / h) * Math.max(1, a.zoom)
  const dw = w * k, dh = h * k
  const ox = a.mode === 'fit' ? 0 : ((dw - size) / 2) * Math.max(-1, Math.min(1, a.dx)), oy = a.mode === 'fit' ? 0 : ((dh - size) / 2) * Math.max(-1, Math.min(1, a.dy))
  return { x: (size - dw) / 2 - ox, y: (size - dh) / 2 - oy, w: dw, h: dh }
}

/** The display asset: the image drawn into a transparent square. */
export function renderDisplay(src: CanvasImageSource, w: number, h: number, a: Adjust, size = DISPLAY): HTMLCanvasElement {
  const cv = document.createElement('canvas')
  cv.width = cv.height = size
  const g = cv.getContext('2d')!
  g.imageSmoothingQuality = 'high'
  const p = placement(w, h, a, size)
  g.drawImage(src, p.x, p.y, p.w, p.h)
  return cv
}

// ---------------------------------------------------------------- the toolkit palette and checks (style pack 1)
// The same numbers as the published pack (public/style-pack/node-icons/v1/icon-tokens.json → validation), measured on
// the toolkit's own 31 icons by tools/build_icon_pack.mjs; nodeIcons.test.ts fails if the two drift apart.
const hex = (s: string): [number, number, number] => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)]
/** Every colour the family uses: the materials' three tones, the five phase accents in three tones, white and the warm daylight. */
export const PALETTE_HEX = [
  '#fbfbfa', '#e2e5ea', '#c3c9d2', '#eef1f3', '#d9dee4', '#c7cdd5', '#b7dd8f', '#86c06a', '#5f9a4f', '#bfe1f6', '#8cc4e8', '#5d9fcf',
  '#6c7686', '#4f5868', '#3a4250', '#90c8f4', '#58a5df', '#3281bd', '#f4a790', '#df7758', '#bd5332', '#f4e090', '#dfc458', '#bda232',
  '#be90f4', '#9758df', '#7332bd', '#f490f4', '#df58df', '#bd32bd', '#ffffff', '#fff0b3', '#fbf4da', '#cdd2da', '#f2c14e',
] as const
export const PALETTE: [number, number, number][] = PALETTE_HEX.map(hex)
/** Thresholds of the pack's warnings (icon-tokens.json → validation.warn). */
export const CHECKS = {
  occupancy: [0.81, 0.89] as [number, number], maxOffsetX: 0.03, bottomMargin: [0.06, 0.1] as [number, number],
  maxEdgeShare: 0.04, maxInkShare: 0.49, minDark: 0.09, maxBusy: 0.22, minPaletteShare: 0.85, paletteDistance: 48,
}
const dist2 = (r: number, g: number, b: number, p: [number, number, number]) => (r - p[0]) ** 2 + (g - p[1]) ** 2 + (b - p[2]) ** 2
const nearest = (r: number, g: number, b: number) => PALETTE.reduce((m, p) => (dist2(r, g, b, p) < dist2(r, g, b, m) ? p : m), PALETTE[0])
const lum = (r: number, g: number, b: number) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
const pct = (x: number) => `${Math.round(x * 100)}%`
const range = ([a, b]: [number, number]) => `${Math.round(a * 100)}–${pct(b)}`

// ---------------------------------------------------------------- visual quality (pure, on RGBA)
export interface QualityCheck { id: 'framing' | 'clipping' | 'background' | 'legibility' | 'palette'; label: string; state: 'pass' | 'warn'; detail: string }
/** The family's framing: the drawing's longest side (alpha >= 32) as a share of its square (family 0.852-0.883). */
export const OCCUPANCY = { min: CHECKS.occupancy[0], max: CHECKS.occupancy[1], target: 0.85 }
/** Legible at 30 px: the share of the drawing that is not near-white (the family's lightest icon measures 0.108). */
export const LEGIBLE_DARK = CHECKS.minDark

/** Checks an icon's pixels (a `size` × `size` RGBA square) for how it will read in a tile: the pack's five warnings. */
export function qualityChecks(rgba: Uint8ClampedArray, size: number, small?: Uint8ClampedArray, smallSize = 30): QualityCheck[] {
  const n = size * size, A = (i: number) => rgba[i * 4 + 3]
  let x0 = size, y0 = size, x1 = -1, y1 = -1, clear = 0, opaque = 0, inPalette = 0
  const d2 = CHECKS.paletteDistance ** 2
  for (let i = 0; i < n; i++) {
    const a = A(i)
    if (a >= 32) { const x = i % size, y = (i / size) | 0; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y) }
    if (a < 16) { clear++; continue }
    if (a >= 128) {
      opaque++
      const r = rgba[i * 4], g = rgba[i * 4 + 1], b = rgba[i * 4 + 2]
      if (dist2(r, g, b, nearest(r, g, b)) < d2) inPalette++
    }
  }
  const out: QualityCheck[] = []
  // clipping: drawing on the outer 2 px ring
  let edge = 0, ring = 0
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    if (x > 1 && y > 1 && x < size - 2 && y < size - 2) continue
    ring++
    if (A(y * size + x) >= 128) edge++
  }
  const clipped = edge / ring, ink = (n - clear) / n
  // a solid background: almost nothing transparent and the border all one colour
  const solid = clear / n < 0.04 && clipped > 0.9

  // framing: size, left-right centring and the plate's height above the bottom edge, against the family's
  if (x1 < 0) out.push({ id: 'framing', label: 'Framing', state: 'warn', detail: 'Nothing visible: the image is fully transparent.' })
  else if (solid) out.push({ id: 'framing', label: 'Framing', state: 'warn', detail: 'Not measured: the image has a solid background (see Background).' })
  else {
    const occ = Math.max(x1 - x0 + 1, y1 - y0 + 1) / size
    const offX = ((x0 + x1 + 1) / 2 - size / 2) / size
    const bottom = (size - 1 - y1) / size
    const notes: string[] = []
    if (occ < CHECKS.occupancy[0]) notes.push('it will look small: crop in, or export it with less margin')
    if (occ > CHECKS.occupancy[1]) notes.push('it is tight to the edges: Fit, or export it with a little margin')
    if (Math.abs(offX) > CHECKS.maxOffsetX) notes.push(`it sits ${pct(Math.abs(offX))} ${offX > 0 ? 'right' : 'left'} of centre (the family: within ${pct(CHECKS.maxOffsetX)})`)
    if (bottom < CHECKS.bottomMargin[0] || bottom > CHECKS.bottomMargin[1]) notes.push(`its lowest point is ${pct(bottom)} above the bottom edge (the family: ${range(CHECKS.bottomMargin)}, the ground plate’s near corner)`)
    out.push({ id: 'framing', label: 'Framing', state: notes.length ? 'warn' : 'pass',
      detail: `The drawing fills ${pct(occ)} of the tile (the toolkit’s icons fill ${range(CHECKS.occupancy)})${notes.length ? `: ${notes.join('; ')}.` : ', centred, on the same ground line.'}` })
  }
  out.push({ id: 'clipping', label: 'Clipping', state: clipped < CHECKS.maxEdgeShare || solid ? 'pass' : 'warn',
    detail: solid ? 'Not measured: the image has a solid background (see Background).' : clipped < CHECKS.maxEdgeShare ? 'Clear of the edges.' : `The drawing touches the tile’s edge along ${pct(clipped)} of it: part of it may be cut off.` })
  const bgWarn = solid || ink > CHECKS.maxInkShare
  out.push({ id: 'background', label: 'Background', state: bgWarn ? 'warn' : 'pass',
    detail: solid ? 'It has a solid background; the toolkit’s icons are drawn on a transparent one. Match toolkit style can remove it.'
      : ink > CHECKS.maxInkShare ? `It covers ${pct(ink)} of the square; the toolkit’s icons cover at most ${pct(CHECKS.maxInkShare)} and leave the rest transparent.` : 'Transparent around the drawing.' })
  // legibility at the smallest size it is shown (30 px): enough contrast against the white tile, not a blur of detail
  if (small) {
    const m = smallSize * smallSize
    let seen = 0, dark = 0, edges = 0
    for (let i = 0; i < m; i++) {
      if (small[i * 4 + 3] < 128) continue
      seen++
      const L = lum(small[i * 4], small[i * 4 + 1], small[i * 4 + 2])
      if (1 - L > 0.18) dark++
      const j = i + 1
      if ((i % smallSize) < smallSize - 1 && small[j * 4 + 3] >= 128 && Math.abs(L - lum(small[j * 4], small[j * 4 + 1], small[j * 4 + 2])) > 0.25) edges++
    }
    const contrast = seen ? dark / seen : 0, busy = seen ? edges / seen : 0
    out.push({ id: 'legibility', label: 'Legible at 30 px', state: contrast >= CHECKS.minDark && busy <= CHECKS.maxBusy ? 'pass' : 'warn',
      detail: contrast < CHECKS.minDark ? 'Mostly very light: at 30 px it fades into the white tile. Use deeper colours or a darker side.' : busy > CHECKS.maxBusy ? 'Very busy at 30 px: simplify to one object and at most one cue.' : 'Reads at the node bar’s size.' })
  }
  const share = opaque ? inPalette / opaque : 0
  out.push({ id: 'palette', label: 'Toolkit palette', state: share >= CHECKS.minPaletteShare ? 'pass' : 'warn',
    detail: `${pct(share)} of its colours are near the toolkit’s palette${share < CHECKS.minPaletteShare ? ` (the toolkit’s icons: at least ${pct(CHECKS.minPaletteShare)}): it will stand apart from the other icons. Match toolkit style can bring them in.` : '.'}` })
  return out
}

/**
 * Match toolkit style (a separate copy; the original is kept): the background joined to the border is cleared, and every
 * colour moves to the nearest colour of the toolkit's palette. In place on an RGBA square.
 */
export function matchStyle(rgba: Uint8ClampedArray, size: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(rgba)
  // the border's typical colour (when the border is opaque: a background)
  const border: number[] = []
  for (let i = 0; i < size; i++) for (const [x, y] of [[i, 0], [i, size - 1], [0, i], [size - 1, i]]) border.push(y * size + x)
  const opaqueBorder = border.filter((p) => out[p * 4 + 3] >= 200)
  if (opaqueBorder.length > border.length * 0.9) {
    const med = [0, 1, 2].map((k) => opaqueBorder.map((p) => out[p * 4 + k]).sort((a, b) => a - b)[opaqueBorder.length >> 1]) as [number, number, number]
    const seen = new Uint8Array(size * size), stack = [...border]
    while (stack.length) {
      const p = stack.pop()!
      if (seen[p]) continue
      seen[p] = 1
      if (dist2(out[p * 4], out[p * 4 + 1], out[p * 4 + 2], med) > 40 * 40) continue
      out[p * 4 + 3] = 0
      const x = p % size, y = (p / size) | 0
      if (x > 0) stack.push(p - 1); if (x < size - 1) stack.push(p + 1); if (y > 0) stack.push(p - size); if (y < size - 1) stack.push(p + size)
    }
  }
  for (let i = 0; i < size * size; i++) {
    if (out[i * 4 + 3] < 16) continue
    const q = nearest(out[i * 4], out[i * 4 + 1], out[i * 4 + 2])
    out[i * 4] = q[0]; out[i * 4 + 1] = q[1]; out[i * 4 + 2] = q[2]
  }
  return out
}

/** Pixels of a canvas, and of the same drawing at 30 px (for the legibility check). */
export function pixels(cv: HTMLCanvasElement, small = 30): { rgba: Uint8ClampedArray; small: Uint8ClampedArray } {
  const g = cv.getContext('2d')!
  const rgba = g.getImageData(0, 0, cv.width, cv.height).data
  const s = document.createElement('canvas')
  s.width = s.height = small
  const sg = s.getContext('2d')!
  sg.drawImage(cv, 0, 0, small, small)
  return { rgba, small: sg.getImageData(0, 0, small, small).data }
}
/** The restyled copy of a display canvas. */
export function restyledCanvas(cv: HTMLCanvasElement): HTMLCanvasElement {
  const g = cv.getContext('2d')!, img = g.getImageData(0, 0, cv.width, cv.height)
  const out = document.createElement('canvas')
  out.width = cv.width; out.height = cv.height
  out.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(matchStyle(img.data, cv.width)), cv.width, cv.height), 0, 0)
  return out
}
