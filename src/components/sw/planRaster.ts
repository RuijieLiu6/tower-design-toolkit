// The result under a Studio-quality plan: a value grid coloured through a continuous ramp into a small canvas, blended
// between the sensors (bilinear, as study.js gridLayerSVG does for the hour layer) and handed to the SVG as an image.
// The plan clips it to the plate less the core, so the edges stay sharp. Ramps are the Studio's (rampLux in OKLab on a
// log scale; rampDA, rampDF, rampASE linear).
export type LayerId = 'lux' | 'da' | 'df' | 'ase'
export interface Raster { href: string; x0: number; y0: number; w: number; h: number; smooth: boolean }
export interface RampSpec { id: LayerId; name: string; unit: string; /** 0–1 along the key for a value */ pos: (v: number) => number; ticks: [number, string][]; lut: Uint8Array; css: string }

const NL = 256
const lin = (c: number) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
const gam = (c: number) => { c = Math.max(0, Math.min(1, c)); return 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055) }
const toOk = ([R, G, B]: number[]) => {
  const r = lin(R), g = lin(G), b = lin(B)
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b), m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b), s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s]
}
const fromOk = ([L, a, b]: number[]) => {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3, m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3, s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s].map(gam)
}
const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))

/** A lookup table of NL colours along stops at positions 0–1, blended in OKLab (no muddy middles). */
function lutOf(stops: [number, number[]][]): Uint8Array {
  const ok = stops.map(([t, c]) => [t, toOk(c)] as [number, number[]]), out = new Uint8Array(NL * 3)
  for (let i = 0; i < NL; i++) {
    const t = i / (NL - 1)
    let j = 1
    while (j < ok.length - 1 && t > ok[j][0]) j++
    const [t0, a] = ok[j - 1], [t1, b] = ok[j], u = Math.max(0, Math.min(1, (t - t0) / Math.max(1e-9, t1 - t0)))
    const c = fromOk([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u])
    out[i * 3] = Math.round(c[0]); out[i * 3 + 1] = Math.round(c[1]); out[i * 3 + 2] = Math.round(c[2])
  }
  return out
}
const cssOf = (lut: Uint8Array) => `linear-gradient(90deg,${Array.from({ length: 17 }, (_, i) => { const k = Math.round((i / 16) * (NL - 1)) * 3; return `rgb(${lut[k]},${lut[k + 1]},${lut[k + 2]})` }).join(',')})`
const L30 = Math.log10(30), LSPAN = Math.log10(10000) - L30
const ramp = (id: LayerId, name: string, unit: string, pos: (v: number) => number, ticks: [number, string][], stops: [number, number[]][]): RampSpec => { const lut = lutOf(stops); return { id, name, unit, pos, ticks, lut, css: cssOf(lut) } }
const clamp01 = (t: number) => Math.max(0, Math.min(1, t))
const luxPos = (v: number) => clamp01((Math.log10(Math.max(1, v)) - L30) / LSPAN)

export const STUDIO_RAMPS: Record<LayerId, RampSpec> = {
  lux: ramp('lux', 'Light at this hour', 'lux', luxPos, [[30, '30'], [100, '100'], [300, '300'], [1000, '1k'], [3000, '3k'], [10000, '10k+ lux']],
    ([[30, '#56647A'], [100, '#7A8698'], [300, '#A4ABB3'], [1000, '#CEC6B2'], [3000, '#F0D59A'], [10000, '#FFF1CC']] as [number, string][]).map(([v, c]) => [luxPos(v), hex(c)])),
  da: ramp('da', 'Daylight autonomy', 'of occupied hours at the target', clamp01, [[0, '0'], [0.25, '25'], [0.5, '50'], [0.75, '75'], [1, '100%']], [[0, [44, 62, 96]], [0.5, [150, 170, 190]], [1, [240, 196, 92]]]),
  df: ramp('df', 'Daylight factor', 'of the overcast sky', (v) => clamp01(v / 0.05), [[0, '0'], [0.01, '1'], [0.02, '2'], [0.03, '3'], [0.04, '4'], [0.05, '5%+']], [[0, [52, 76, 110]], [0.4, [222, 228, 236]], [1, [217, 144, 31]]]),
  ase: ramp('ase', 'Annual sun exposure', 'hours of direct sun a year', (v) => clamp01(v / 500), [[0, '0'], [125, '125'], [250, '250'], [375, '375'], [500, '500 h+']], [[0, [240, 224, 190]], [1, [184, 54, 43]]]),
}

export interface FieldGrid { x0: number; y0: number; h: number; nx: number; ny: number }

/** Values past the edge of the valid cells take their neighbours' mean, so blending at the plate edge has something to read. */
function spread(vals: Float32Array, on: Uint8Array, nx: number, ny: number, passes: number) {
  for (let p = 0; p < passes; p++) {
    const add: number[] = [], val: number[] = []
    for (let iy = 0; iy < ny; iy++) for (let ix = 0; ix < nx; ix++) {
      const k = iy * nx + ix
      if (on[k]) continue
      let s = 0, n = 0
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const jx = ix + dx, jy = iy + dy; if (jx < 0 || jy < 0 || jx >= nx || jy >= ny) continue; const q = jy * nx + jx; if (on[q]) { s += vals[q]; n++ } }
      if (n) { add.push(k); val.push(s / n) }
    }
    add.forEach((k, i) => { vals[k] = val[i]; on[k] = 1 })
  }
}

/**
 * The pixels as a data URL the SVG can carry (and a sheet export can embed). Written as an uncompressed 24-bit bitmap in
 * plain code rather than through a canvas: reading a canvas back (toDataURL) waits on the graphics process, which costs
 * from a few milliseconds to seconds while the 3D view is drawing, and that would be felt on every step of the hour slider.
 */
function toHref(W: number, H: number, paint: (D: Uint8ClampedArray) => void): string {
  const D = new Uint8ClampedArray(W * H * 4)
  paint(D)
  const row = (W * 3 + 3) & ~3, size = 54 + row * H, buf = new Uint8Array(size), dv = new DataView(buf.buffer)
  buf[0] = 0x42; buf[1] = 0x4d
  dv.setUint32(2, size, true); dv.setUint32(10, 54, true); dv.setUint32(14, 40, true); dv.setInt32(18, W, true); dv.setInt32(22, -H, true) // rows top-down
  dv.setUint16(26, 1, true); dv.setUint16(28, 24, true); dv.setUint32(34, row * H, true); dv.setInt32(38, 2835, true); dv.setInt32(42, 2835, true)
  for (let y = 0; y < H; y++) {
    let o = 54 + y * row, i = y * W * 4
    for (let x = 0; x < W; x++, i += 4) { if (D[i + 3]) { buf[o++] = D[i + 2]; buf[o++] = D[i + 1]; buf[o++] = D[i] } else { buf[o++] = 255; buf[o++] = 255; buf[o++] = 255 } }
  }
  let bin = ''
  for (let k = 0; k < size; k += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(k, Math.min(size, k + 0x8000)) as unknown as number[])
  return 'data:image/bmp;base64,' + btoa(bin)
}

/**
 * A sensor grid as a smooth image: values blended bilinearly between sensors, `px` pixels per cell (4 or more), coloured
 * per pixel. `valid` marks the cells that hold a sensor.
 */
export function fieldRaster(G: FieldGrid, values: ArrayLike<number>, valid: Uint8Array, R: RampSpec, px = 5): Raster | null {
  if (typeof btoa === 'undefined') return null
  const n = G.nx * G.ny, vals = new Float32Array(n), on = Uint8Array.from(valid)
  for (let k = 0; k < n; k++) vals[k] = on[k] ? values[k] : 0
  spread(vals, on, G.nx, G.ny, 3)
  const W = G.nx * px, H = G.ny * px, lut = R.lut
  const href = toHref(W, H, (D) => {
    for (let y = 0; y < H; y++) {
      const gy = (y + 0.5) / px - 0.5, j0 = Math.max(0, Math.min(G.ny - 1, Math.floor(gy))), j1 = Math.min(G.ny - 1, j0 + 1), ty = clamp01(gy - j0)
      for (let x = 0; x < W; x++) {
        const gx = (x + 0.5) / px - 0.5, i0 = Math.max(0, Math.min(G.nx - 1, Math.floor(gx))), i1 = Math.min(G.nx - 1, i0 + 1), tx = clamp01(gx - i0)
        const a = j0 * G.nx + i0, b = j0 * G.nx + i1, c = j1 * G.nx + i0, d = j1 * G.nx + i1
        const wa = (1 - tx) * (1 - ty) * on[a], wb = tx * (1 - ty) * on[b], wc = (1 - tx) * ty * on[c], wd = tx * ty * on[d], w = wa + wb + wc + wd
        const o = (y * W + x) * 4
        if (!(w > 0)) { D[o + 3] = 0; continue }
        const q = Math.round(R.pos((vals[a] * wa + vals[b] * wb + vals[c] * wc + vals[d] * wd) / w) * (NL - 1)) * 3
        D[o] = lut[q]; D[o + 1] = lut[q + 1]; D[o + 2] = lut[q + 2]; D[o + 3] = 255
      }
    }
  })
  return { href, x0: G.x0, y0: G.y0, w: G.nx * G.h, h: G.ny * G.h, smooth: true }
}

/** A fine grid one pixel per cell (the hour layer: the smooth field and the crisp sun patch are already in the values). */
export function fineRaster(G: FieldGrid, values: ArrayLike<number>, inside: Uint8Array, R: RampSpec, held?: Uint8Array | null): Raster | null {
  if (typeof btoa === 'undefined') return null
  const W = G.nx, H = G.ny, lut = R.lut, n = W * H
  const href = toHref(W, H, (D) => {
    for (let k = 0; k < n; k++) {
      if (!inside[k]) continue
      const q = Math.round(R.pos(values[k]) * (NL - 1)) * 3, o = k * 4
      if (held && held[k] && ((k % W) + ((k / W) | 0)) % 6 < 2) { D[o] = 232; D[o + 1] = 137; D[o + 2] = 43 } else { D[o] = lut[q]; D[o + 1] = lut[q + 1]; D[o + 2] = lut[q + 2] }
      D[o + 3] = 255
    }
    // carry the edge colours two cells out, so the image's own smoothing has no dark fringe under the clip line
    const on = Uint8Array.from(inside)
    for (let p = 0; p < 2; p++) {
      const add: number[] = []
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const k = y * W + x
        if (on[k]) continue
        let r = 0, g = 0, b = 0, c = 0
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const jx = x + dx, jy = y + dy; if (jx < 0 || jy < 0 || jx >= W || jy >= H) continue; const q = jy * W + jx; if (!on[q]) continue; r += D[q * 4]; g += D[q * 4 + 1]; b += D[q * 4 + 2]; c++ }
        if (c) { D[k * 4] = r / c; D[k * 4 + 1] = g / c; D[k * 4 + 2] = b / c; D[k * 4 + 3] = 255; add.push(k) }
      }
      for (const k of add) on[k] = 1
    }
  })
  return { href, x0: G.x0, y0: G.y0, w: G.nx * G.h, h: G.ny * G.h, smooth: true }
}
