// Imported towers for the structure and wind tests, built straight from storey outlines (no file, no slicing), the way
// the import pipeline stores them (generated, never a competition model).
import { towerPatch } from './imported'
import type { ImportedMass, ImportedStorey, Tower, UseId } from './types'

export type P = [number, number]
export const rect = (w: number, d: number, cx = 0, cy = 0): P[] => [[cx - w / 2, cy - d / 2], [cx + w / 2, cy - d / 2], [cx + w / 2, cy + d / 2], [cx - w / 2, cy + d / 2]]
export const ringArea = (r: P[]) => Math.abs(r.reduce((s, [x, y], i) => { const [x2, y2] = r[(i + 1) % r.length]; return s + x * y2 - x2 * y }, 0) / 2)

/** Storeys bottom-up from runs of equal plates (tower frame, m). */
export function stack(runs: { n: number; f2f: number; ring: P[]; podium?: boolean; use?: UseId }[]): ImportedStorey[] {
  const out: ImportedStorey[] = []
  let z = 0
  for (const r of runs) for (let i = 0; i < r.n; i++) {
    out.push({ level: out.length + 1, z0: z, z1: z + r.f2f, area: Math.round(ringArea(r.ring) * 10) / 10, use: r.use ?? (r.podium ? 'retail' : 'residential'), podium: !!r.podium, hasFloor: true, loops: [r.ring] })
    z += r.f2f
  }
  return out
}

const base: Tower = { id: 'i', name: 'Imported', x: 0, y: 0, rotation: 0, width: 1, depth: 1, height: 1, f2f: 4, podiumHeight: 0, podiumWidth: 1, podiumDepth: 1, podiumUse: 'retail', bands: [], coreShare: 0.2, plantEvery: 0, coreAuto: false }

/** An imported tower from its storeys, with a square core of `coreSide` metres (as the harness sizes it). */
export function importedTower(storeys: ImportedStorey[], o: { podiumTop?: number; coreSide?: number } = {}): Tower {
  const top = storeys[storeys.length - 1].z1
  const pts = storeys.flatMap((s) => s.loops.flat())
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1])
  const hull: P[] = [[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)], [Math.min(...xs), Math.max(...ys)]]
  const mass: ImportedMass = {
    meshId: 'm', fileName: 'test.3dm', format: '3dm', unit: 'm', unitSource: 'confirmed', fileNorthDeg: 0, northSource: 'test', datumShift: 0, datumSource: 'test',
    f2f: 4, podiumTop: o.podiumTop ?? 0, podiumF2F: 4, storeys, hull, volume: null, top, health: { block: 0, warn: 0 },
  }
  const t = { ...base, ...towerPatch(mass) }
  const side = o.coreSide ?? 24
  return { ...t, coreShare: (side * side) / (t.width * t.depth) }
}
