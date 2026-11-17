// Types for the vendored polygon-clipping 0.15.7 (MIT): a minimal module declaration in place of its global one.
export type Pair = [number, number]
export type Ring = Pair[]
export type Polygon = Ring[]
export type MultiPolygon = Polygon[]
export type Geom = Polygon | MultiPolygon
declare const polygonClipping: {
  union: (geom: Geom, ...more: Geom[]) => MultiPolygon
  intersection: (geom: Geom, ...more: Geom[]) => MultiPolygon
  xor: (geom: Geom, ...more: Geom[]) => MultiPolygon
  difference: (subject: Geom, ...clips: Geom[]) => MultiPolygon
}
export default polygonClipping
