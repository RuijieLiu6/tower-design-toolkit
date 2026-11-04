// A raster of the combined height model for the map layer (components/HeightSurface.tsx): per cell, the lowest cone
// surface and its kind (City-sourced estimate or Vista study surface), the zoning height reference, the ground, and
// the suggestion (lowest of zoning and cones, m above ground). Same rules as engine/heightModel.ts `combine`, at
// cell centres. Zones are filled by scanline (even-odd, so holes such as CD-1 sites inside DD stay out).
import { pointInRing } from './viewCones'
import { STUDY, planeZ, type ConeSurface } from './heightModel'
import type { HeightPolicy } from './heightPolicy'
import type { Pt } from './vista'

export interface HeightGrid {
  /** EPSG:26910 of the south-west corner; cell centres at x0 + (c + 0.5)·step; rows run south to north. */
  x0: number; y0: number; step: number; cols: number; rows: number
  /** Lowest cone surface elevation (geodetic m), NaN where no cone covers. */
  coneZ: Float32Array
  /** 0 no cone, 1 City-sourced estimate controls, 2 study surface controls. */
  coneKind: Uint8Array
  /** Index into the surfaces array of the lowest one, -1 none. */
  coneIdx: Int16Array
  /** Zoning basic height (m above grade), NaN without a number. */
  zoningH: Float32Array
  /** 0 no mapped zone, 1 a number, 2 a zone without a number (DD, CD-1, not transcribed). */
  zoningState: Uint8Array
  /** Index into policy.zones, -1 none. */
  zoneIdx: Int32Array
  /** Ground (m), NaN where unknown. */
  ground: Float32Array
  /** Suggestion (m above ground), NaN where none. */
  suggestion: Float32Array
  /** 0 none, 1 ready (zoning number), 2 partial (cones only; zoning has no number). */
  sugState: Uint8Array
  /** What controls the suggestion: 0 none, 1 zoning, 2 estimate, 3 study surface. */
  sugControl: Uint8Array
}

/**
 * Compute the grid over a box (EPSG:26910). `origin` turns EPSG:26910 into the policy's local frame; `groundAt` takes
 * EPSG:26910 and returns null where there is no terrain.
 */
export function heightGrid(box: { x0: number; y0: number; x1: number; y1: number }, step: number, surfaces: ConeSurface[], policy: HeightPolicy | null, origin: Pt, groundAt: (p: Pt) => number | null): HeightGrid {
  const cols = Math.max(1, Math.ceil((box.x1 - box.x0) / step)), rows = Math.max(1, Math.ceil((box.y1 - box.y0) / step)), n = cols * rows
  const coneZ = new Float32Array(n).fill(NaN), coneKind = new Uint8Array(n), coneIdx = new Int16Array(n).fill(-1)
  const zoningH = new Float32Array(n).fill(NaN), zoningState = new Uint8Array(n), zoneIdx = new Int32Array(n).fill(-1)
  const ground = new Float32Array(n).fill(NaN), suggestion = new Float32Array(n).fill(NaN), sugState = new Uint8Array(n), sugControl = new Uint8Array(n)
  const cx = (c: number) => box.x0 + (c + 0.5) * step, cy = (r: number) => box.y0 + (r + 0.5) * step

  surfaces.forEach((s, i) => {
    const xs = s.cone.ring.map((p) => p[0]), ys = s.cone.ring.map((p) => p[1])
    const c0 = Math.max(0, Math.floor((Math.min(...xs) - box.x0) / step)), c1 = Math.min(cols - 1, Math.ceil((Math.max(...xs) - box.x0) / step))
    const r0 = Math.max(0, Math.floor((Math.min(...ys) - box.y0) / step)), r1 = Math.min(rows - 1, Math.ceil((Math.max(...ys) - box.y0) / step))
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      const p: Pt = [cx(c), cy(r)]
      if (!pointInRing(p, s.cone.ring)) continue
      const k = r * cols + c, z = planeZ(s.plane, p)
      if (Number.isNaN(coneZ[k]) || z < coneZ[k]) { coneZ[k] = z; coneKind[k] = s.kind === 'estimate' ? 1 : 2; coneIdx[k] = i }
    }
  })

  if (policy) {
    policy.zones.forEach((z, zi) => {
      if (!z.valid || !z.bounds) return
      const [bx0, by0, bx1, by1] = [z.bounds[0] + origin[0], z.bounds[1] + origin[1], z.bounds[2] + origin[0], z.bounds[3] + origin[1]]
      if (bx1 < box.x0 || bx0 > box.x1 || by1 < box.y0 || by0 > box.y1) return
      const rule = policy.rules[z.ruleId], h = rule && typeof rule.basicHeightM === 'number' && /^https?:\/\//.test(rule.sourceUrl) ? rule.basicHeightM : null
      const r0 = Math.max(0, Math.floor((by0 - box.y0) / step)), r1 = Math.min(rows - 1, Math.ceil((by1 - box.y0) / step))
      for (const poly of z.polygons) {
        for (let r = r0; r <= r1; r++) {
          const y = cy(r) - origin[1], xsx: number[] = []
          for (const ring of poly) for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
            const a = ring[j], b = ring[i]
            if ((a[1] > y) !== (b[1] > y)) xsx.push(a[0] + ((y - a[1]) * (b[0] - a[0])) / (b[1] - a[1]))
          }
          xsx.sort((a, b) => a - b)
          for (let i = 0; i + 1 < xsx.length; i += 2) {
            const c0 = Math.max(0, Math.ceil((xsx[i] + origin[0] - box.x0) / step - 0.5)), c1 = Math.min(cols - 1, Math.floor((xsx[i + 1] + origin[0] - box.x0) / step - 0.5))
            for (let c = c0; c <= c1; c++) { const k = r * cols + c; zoneIdx[k] = zi; zoningState[k] = h === null ? 2 : 1; zoningH[k] = h ?? NaN }
          }
        }
      }
    })
  }

  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const k = r * cols + c
    const g = groundAt([cx(c), cy(r)])
    if (g !== null && Number.isFinite(g)) ground[k] = g
    const cone = !Number.isNaN(coneZ[k]) && !Number.isNaN(ground[k]) ? coneZ[k] - ground[k] - STUDY.clearanceM : NaN
    if (zoningState[k] === 1) {
      sugState[k] = 1
      if (!Number.isNaN(cone) && cone < zoningH[k]) { suggestion[k] = Math.max(0, cone); sugControl[k] = coneKind[k] === 1 ? 2 : 3 }
      else { suggestion[k] = zoningH[k]; sugControl[k] = 1 }
    } else if (!Number.isNaN(cone)) {
      sugState[k] = 2; suggestion[k] = Math.max(0, cone); sugControl[k] = coneKind[k] === 1 ? 2 : 3
    }
  }
  return { x0: box.x0, y0: box.y0, step, cols, rows, coneZ, coneKind, coneIdx, zoningH, zoningState, zoneIdx, ground, suggestion, sugState, sugControl }
}
