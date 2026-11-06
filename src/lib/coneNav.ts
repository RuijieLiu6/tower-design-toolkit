// Previous / Next through the protected views in Observer (Ruijie, 6 Nov: "build a next and previous button … refer to
// how Vista build this function"; Vista explorer.js stepViewpoint): the picker's order, wrapping at both ends.
import { CONES } from '../engine/viewCones'

/** The protected view one step before or after `current`; from no protected view, the first (next) or the last (previous). */
export function stepConeId(current: string, direction: 1 | -1, list: readonly { id: string }[] = CONES): string {
  const n = list.length, i = list.findIndex((c) => c.id === current)
  return list[i < 0 ? (direction > 0 ? 0 : n - 1) : (i + direction + n) % n].id
}
