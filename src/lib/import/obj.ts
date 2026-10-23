// Wavefront OBJ reader: vertices and faces only, double precision, polygons fanned into triangles.
// OBJ stores no unit and no up axis (Library of Congress format description, research P14-S52).

import type { RawImport, RawObject } from './types'

export function readObj(text: string, fileName: string): RawImport {
  const verts: number[] = []
  const groups = new Map<string, { positions: number[]; indices: number[]; map: Map<number, number> }>()
  let current = 'default'
  const notes: string[] = []
  let badFaces = 0
  const group = (name: string) => {
    let g = groups.get(name)
    if (!g) { g = { positions: [], indices: [], map: new Map() }; groups.set(name, g) }
    return g
  }
  const lines = text.split(/\r?\n/)
  for (const raw of lines) {
    const line = raw.trim()
    if (!line || line[0] === '#') continue
    const parts = line.split(/\s+/)
    const tag = parts[0]
    if (tag === 'v') verts.push(Number(parts[1]), Number(parts[2]), Number(parts[3]))
    else if (tag === 'o' || tag === 'g') current = parts.slice(1).join(' ') || 'default'
    else if (tag === 'f') {
      const g = group(current)
      const nv = verts.length / 3
      const ids: number[] = []
      for (let k = 1; k < parts.length; k++) {
        let i = parseInt(parts[k].split('/')[0], 10)
        if (!Number.isFinite(i) || i === 0) { ids.length = 0; break }
        i = i < 0 ? nv + i : i - 1
        if (i < 0 || i >= nv) { ids.length = 0; break }
        let local = g.map.get(i)
        if (local === undefined) { local = g.positions.length / 3; g.map.set(i, local); g.positions.push(verts[3 * i], verts[3 * i + 1], verts[3 * i + 2]) }
        ids.push(local)
      }
      if (ids.length < 3) { badFaces++; continue }
      for (let k = 1; k < ids.length - 1; k++) g.indices.push(ids[0], ids[k], ids[k + 1])
    }
  }
  if (badFaces) notes.push(`${badFaces} faces skipped: they point at missing vertices or have fewer than 3 corners.`)
  const objects: RawObject[] = []
  for (const [name, g] of groups) {
    if (!g.indices.length) continue
    objects.push({ name, layer: name, kind: 'mesh', meshSource: 'OBJ faces', mesh: { positions: new Float64Array(g.positions), indices: new Uint32Array(g.indices) } })
  }
  return {
    format: 'obj', fileName, objects,
    skipped: badFaces ? [{ name: `${badFaces} faces`, layer: '', kind: 'face', reason: 'Points at a missing vertex or has fewer than 3 corners' }] : [],
    unit: null, unitNote: 'OBJ files store no unit: choose it (research P14-S52)',
    upAxis: null, upNote: 'OBJ does not say which axis is up; SketchUp and Rhino often export y-up',
    fileNorthDeg: null, northNote: 'OBJ files store no north',
    notes,
  }
}
