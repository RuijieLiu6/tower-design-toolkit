// The mesh of a drawn mass from its outline alone (Ruijie, 17 Nov; after Sinnie Choi's build). It is keyed by a hash
// of the outline, holes, base, storeys and floor-to-floor, so every shape a mass has had keeps its own mesh and Undo
// finds the old one again (one mesh per mass, overwritten by each edit, left the view and the .3dm / OBJ export
// showing the undone shape, and a reload kept it). The 3D view and the export rebuild it from `drawn` when the store
// has no copy (a reload with storage off), so nothing depends on the stored copy.
import * as THREE from 'three'
import type { DrawnMass } from '../../engine/types'
import type { MeshEntry } from '../import/store'
import { centroid, prismMesh, type Pt } from './geometry'

const r2 = (v: number) => Math.round(v * 100) / 100

/** The cap triangles of an outline with holes, as indices into [outline, ...holes] (three's ear clipping). */
function cap(pts: Pt[], holes: Pt[][]): number[] {
  const tri = THREE.ShapeUtils.triangulateShape(pts.map((p) => new THREE.Vector2(p[0], p[1])), holes.map((h) => h.map((p) => new THREE.Vector2(p[0], p[1]))))
  return tri.flat()
}

export const drawnTop = (d: DrawnMass) => r2(d.base + d.floors * d.f2f)

/** A short stable key of the shape (FNV-1a over its numbers): the same shape, the same key. */
export function drawnKey(d: DrawnMass): string {
  const s = JSON.stringify([d.pts, d.holes ?? [], d.base, d.floors, d.f2f])
  let h = 2166136261
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  return (h >>> 0).toString(36)
}
export const drawnMeshId = (d: DrawnMass) => `drawn:${drawnKey(d)}`

/** The outline and holes about the outline's centroid (the tower frame), and that centroid. */
export function drawnLocal(d: DrawnMass): { c: Pt; pts: Pt[]; holes: Pt[][] } {
  const c = centroid(d.pts)
  const local = (r: Pt[]): Pt[] => r.map((p) => [r2(p[0] - c[0]), r2(p[1] - c[1])])
  return { c, pts: local(d.pts), holes: (d.holes ?? []).map(local) }
}

/** The closed mesh of the mass in the tower frame (metres, z up), kept like an uploaded one. */
export function drawnMesh(d: DrawnMass): MeshEntry {
  const { pts, holes } = drawnLocal(d)
  const mesh = prismMesh(pts, holes, d.base, drawnTop(d), cap)
  return {
    positions: new Float32Array(mesh.positions), indices: new Uint32Array(mesh.indices), openSegments: new Float32Array(0), flippedTriangles: new Uint32Array(0), health: [],
    report: { objects: 1, triangles: mesh.indices.length / 3, sources: ['drawn in the Toolkit'], skipped: [], notes: [], unitNote: 'metres', northNote: 'project north' },
  }
}
