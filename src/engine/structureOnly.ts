// Parts that carry no floor area (tool cycle 12; R7b P5; the R7 Ridge Gate's bridge): a bridge, a crown frame, louvred
// plant screens declared so. They count for mass, silhouette, wind and weight, but not for floor area, homes, keys or
// FSR. Two routes carry the flag:
// - an imported (or free-form) storey lists their outlines in `ImportedStorey.structureOnly`; the outlines stay in
//   `loops`, so every reader of the storey outlines (masses, shadow, cones, silhouette, sky-through, wind prisms) keeps
//   them, while `area` is the floor area left and `hasFloor` is false when nothing is left (`withStructureOnly`);
// - a parametric block marked `Block.structureOnly` stays a mass (towerMasses, blockSpans) and gives no floors.
// The storey weights add each part as a hard deck of its plan area (slab, finish and the snow share, as a roof) and,
// where it is not on a floor, its facade (team assumption: a truss bridge's real weight is the engineer's).
import { MIN_FLOOR_AREA } from './imported'
import { blockSpans } from './blocks'
import type { ImportedStorey, Tower } from './types'

type P = [number, number]
const ringArea = (r: P[]) => Math.abs(r.reduce((s, [x, y], i) => { const [x2, y2] = r[(i + 1) % r.length]; return s + x * y2 - x2 * y }, 0) / 2)
const sameRing = (a: P[], b: P[]) => a.length === b.length && a.every((p, i) => Math.abs(p[0] - b[i][0]) < 1e-6 && Math.abs(p[1] - b[i][1]) < 1e-6)

/** Plan area (m²) of a storey's structure-only parts. */
export function structureOnlyArea(s: Pick<ImportedStorey, 'structureOnly'>): number {
  return (s.structureOnly ?? []).filter((r) => r.length >= 3).reduce((a, r) => a + ringArea(r as P[]), 0)
}

/** Is this ring one of the storey's structure-only outlines? */
export const isStructureOnlyRing = (s: Pick<ImportedStorey, 'structureOnly'>, r: P[]): boolean => (s.structureOnly ?? []).some((q) => sameRing(q as P[], r))

/**
 * An imported storey with these parts declared structure-only (the run harness calls it for every free-form part marked
 * `structureOnly: true`, with that part's outlines on the storey, tower frame, m). The outlines stay in (or join) `loops`
 * and are listed in `structureOnly`; `area` becomes the floor area, the plate less those parts, and `hasFloor` turns
 * false when what is left is under MIN_FLOOR_AREA. The plate is the storey's area plus any parts already declared, so a
 * second call does not take them out twice. A part lying over a floor part of the same storey takes that floor with it.
 */
export function withStructureOnly(s: ImportedStorey, rings: P[][]): ImportedStorey {
  const so = rings.filter((r) => r.length >= 3)
  if (!so.length) return s
  const plate = s.area + structureOnlyArea(s)
  const all = [...(s.structureOnly ?? []) as P[][], ...so.filter((r) => !isStructureOnlyRing(s, r))]
  const left = Math.max(0, plate - all.reduce((a, r) => a + ringArea(r), 0))
  const loops = [...s.loops, ...so.filter((r) => !s.loops.some((q) => sameRing(q as P[], r)))]
  return { ...s, loops, structureOnly: all, area: Math.round(left * 10) / 10, hasFloor: s.hasFloor && left >= MIN_FLOOR_AREA }
}

/** One structure-only part of a tower: its outline in the tower frame, its heights, and whether a floor shares its storey. */
export interface StructurePart { ring: P[]; z0: number; z1: number; onFloor: boolean; area: number; perim: number }

/** Every structure-only part of a tower (both routes), in the tower's own frame, bottom-up. */
export function structureParts(t: Tower): StructurePart[] {
  const out: StructurePart[] = []
  const perim = (r: P[]) => r.reduce((s, p, i) => { const q = r[(i + 1) % r.length]; return s + Math.hypot(q[0] - p[0], q[1] - p[1]) }, 0)
  if (t.imported) {
    for (const s of t.imported.storeys) for (const r of (s.structureOnly ?? []) as P[][]) {
      if (r.length >= 3) out.push({ ring: r, z0: s.z0, z1: s.z1, onFloor: s.hasFloor, area: ringArea(r), perim: perim(r) })
    }
    return out
  }
  if (!t.blocks?.some((b) => b.structureOnly)) return out
  const a = (-t.rotation * Math.PI) / 180, c = Math.cos(a), sn = Math.sin(a)
  for (const sp of blockSpans(t)) {
    if (!sp.block.structureOnly || !(sp.z1 > sp.z0)) continue
    const r = sp.ring.map(([x, y]) => { const dx = x - t.x, dy = y - t.y; return [dx * c - dy * sn, dx * sn + dy * c] as P })
    out.push({ ring: r, z0: sp.z0, z1: sp.z1, onFloor: false, area: ringArea(r), perim: perim(r) })
  }
  return out
}
