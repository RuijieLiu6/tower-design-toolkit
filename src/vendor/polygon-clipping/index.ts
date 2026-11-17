// Polygon booleans for the drawing tools (lib/draw): union, difference and intersection of rings with holes, the same
// library Sinnie Choi's Tower Workspace uses (polygon-clipping, MIT; see LICENSE-polygon-clipping.md beside it).
// Vendored as ESM source with its two small dependencies so the offline app needs no network and node_modules is unchanged.
import polygonClipping from './polygon-clipping.esm.js'

export type Ring = [number, number][]
/** A polygon: the outer ring first, then its holes. Rings are closed by the library (the first point repeated at the end). */
export type Poly = Ring[]
export type MultiPoly = Poly[]
export const pc = polygonClipping as unknown as {
  union: (a: Poly | MultiPoly, b: Poly | MultiPoly) => MultiPoly
  difference: (a: Poly | MultiPoly, b: Poly | MultiPoly) => MultiPoly
  intersection: (a: Poly | MultiPoly, b: Poly | MultiPoly) => MultiPoly
}
