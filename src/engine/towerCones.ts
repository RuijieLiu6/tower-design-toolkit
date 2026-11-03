// View-cone check of a whole tower: every stacked block is checked at its own top, and each cone keeps the worst result
// (a setback upper block is judged on its own outline, a wide podium on its low top). Imported towers: one hull prism.
import { towerMasses } from './massing'
import type { Tower } from './types'
import { CONES, checkFootprint, type ConeCheck } from './viewCones'

const RANK: Record<ConeCheck['state'], number> = { above: 0, limit_unknown: 1, within_uncertainty: 2, near_edge: 3, clear: 4, outside: 5 }

/** Worse of two checks of the same cone: the worse state, then the larger exceedance. */
function worse(a: ConeCheck, b: ConeCheck): ConeCheck {
  if (RANK[b.state] !== RANK[a.state]) return RANK[b.state] < RANK[a.state] ? b : a
  return (b.exceed ?? -Infinity) > (a.exceed ?? -Infinity) ? b : a
}

/** Cone checks for a tower whose base sits at `ground` (geodetic m); `origin` turns the project frame into EPSG:26910. */
export function checkTowerCones(t: Tower, ground: number, origin: [number, number]): ConeCheck[] {
  const per = towerMasses(t).map((m) => checkFootprint(m.ring.map(([x, y]) => [x + origin[0], y + origin[1]] as [number, number]), ground + m.z1))
  if (!per.length) return checkFootprint([], ground)
  return CONES.map((_, i) => per.map((p) => p[i]).reduce(worse))
}
