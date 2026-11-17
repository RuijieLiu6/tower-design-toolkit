// A Boolean cut between two drawn masses, pure (Ruijie, 17 Nov; after Sinnie Choi's build): Subtract takes the second
// mass out of the first, Intersect keeps what they share. The pieces too small to be a mass are dropped, and the
// change in the first mass's floor area is measured: when it is under the smallest mass, nothing is cut (the second
// mass used to be deleted anyway, since the tiny change was skipped but the deletion was not).
import { asPoly, clip, netArea, type Pt } from './geometry'

/** The smallest outline that counts as a mass, in m² (lib/draw/mass.ts uses the same). */
export const MIN_MASS_AREA = 4

export interface Outline { pts: Pt[]; holes?: Pt[][] }

export function cutPieces(mode: 'subtract' | 'intersect', a: Outline, b: Outline): { pieces: { pts: Pt[]; holes: Pt[][] }[]; change: number } {
  const pieces = clip(mode === 'subtract' ? 'difference' : 'intersection', asPoly(a.pts, a.holes ?? []), asPoly(b.pts, b.holes ?? [])).filter((pg) => netArea(pg.pts, pg.holes) >= MIN_MASS_AREA)
  const before = netArea(a.pts, a.holes ?? []), after = pieces.reduce((s, pg) => s + netArea(pg.pts, pg.holes), 0)
  return { pieces, change: Math.abs(before - after) }
}

/** Too little would change for a cut to mean anything: the masses stay as they are. */
export const tooSmallACut = (change: number) => change < MIN_MASS_AREA
