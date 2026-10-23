// Test meshes for the import tests (generated, never a competition model).

import type { MeshData } from './importGeom'

/** Closed box with outward normals. */
export function box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): MeshData {
  const positions = [x0, y0, z0, x1, y0, z0, x1, y1, z0, x0, y1, z0, x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1]
  const q = (a: number, b: number, c: number, d: number) => [a, b, c, a, c, d]
  const indices = [...q(0, 3, 2, 1), ...q(4, 5, 6, 7), ...q(0, 1, 5, 4), ...q(1, 2, 6, 5), ...q(2, 3, 7, 6), ...q(3, 0, 4, 7)]
  return { positions: new Float64Array(positions), indices: new Uint32Array(indices) }
}
