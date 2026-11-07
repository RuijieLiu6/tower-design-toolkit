// Wavefront OBJ reader: vertices and faces only, double precision, polygons fanned into triangles.
// OBJ stores no unit and no up axis (Library of Congress format description, research P14-S52). The Tower Design Toolkit
// links (SketchUp, AutoCAD: public/plugins/) add comment lines a plain OBJ reader skips: "# tdt units: m", "# tdt up: z",
// "# tdt doc: <name>", and "# tdt layer: <tag or layer>" before each group; other "# tdt key: value" lines become
// document text (tdt.key), as the Rhino link's settings do.

import type { RawImport, RawObject } from './types'

export function readObj(text: string, fileName: string): RawImport {
  const verts: number[] = []
  const groups = new Map<string, { positions: number[]; indices: number[]; map: Map<number, number> }>()
  let current = 'default'
  const meta: Record<string, string> = {}
  const layerOf = new Map<string, string>()
  let nextLayer: string | null = null
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
    if (!line) continue
    if (line[0] === '#') {
      const m = /^#\s*tdt\s+([a-z_]+):\s*(.*)$/i.exec(line)
      if (m) { if (m[1].toLowerCase() === 'layer') nextLayer = m[2].trim(); else meta[m[1].toLowerCase()] = m[2].trim() }
      continue
    }
    const parts = line.split(/\s+/)
    const tag = parts[0]
    if (tag === 'v') verts.push(Number(parts[1]), Number(parts[2]), Number(parts[3]))
    else if (tag === 'o' || tag === 'g') {
      current = parts.slice(1).join(' ') || 'default'
      if (nextLayer !== null) { layerOf.set(current, nextLayer); nextLayer = null }
    }
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
    objects.push({ name, layer: layerOf.get(name) ?? name, kind: 'mesh', meshSource: 'OBJ faces', mesh: { positions: new Float64Array(g.positions), indices: new Uint32Array(g.indices) } })
  }
  // Written by a Tower Design Toolkit link: its units and up axis are known, and its settings travel as document text.
  const link = meta.units === 'm' || meta.up === 'z'
  const docStrings = Object.fromEntries(Object.entries(meta).filter(([k]) => !['units', 'up', 'doc'].includes(k)).map(([k, v]) => [`tdt.${k}`, v]))
  if (link) notes.push(`Written by the Tower Design Toolkit link${meta.doc ? ` from ${meta.doc}` : ''}.`)
  return {
    format: 'obj', fileName, objects,
    skipped: badFaces ? [{ name: `${badFaces} faces`, layer: '', kind: 'face', reason: 'Points at a missing vertex or has fewer than 3 corners' }] : [],
    unit: meta.units === 'm' ? 'm' : null,
    unitNote: meta.units === 'm' ? 'Metres, as the Tower Design Toolkit link wrote them' : 'OBJ files store no unit: choose it (research P14-S52)',
    upAxis: meta.up === 'z' ? 'z' : meta.up === 'y' ? 'y' : null,
    upNote: meta.up ? `${meta.up.toUpperCase()} up, as the Tower Design Toolkit link wrote it` : 'OBJ does not say which axis is up; SketchUp and Rhino often export y-up',
    fileNorthDeg: null, northNote: 'OBJ files store no north',
    notes,
    ...(Object.keys(docStrings).length ? { docStrings } : {}),
  }
}
