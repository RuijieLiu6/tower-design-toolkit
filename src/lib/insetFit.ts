// Plan framing for the observer's corner map, ported from Vista (RuijieLiu6/vancouver-tall-view-tool,
// explorer/inset-camera.js, read 6 Nov 2026). Ruijie (6 Nov): "on the bottom always show where is the proposed tower
// and the observer, refer to how Vista build this function". The frame holds every point inside the padding, at least
// `minHalf` metres from its centre to its edge, and stays inside the model's coverage when it can; when coverage cannot
// hold the frame it keeps the points (never crops one) and reports `extentExceeded`, so the map can outline the edge.

export interface InsetFrame {
  center: [number, number]
  /** Half the frame's height in metres (half its width is half × aspect). */
  half: number
  aspect: number
  /** [xmin, ymin, xmax, ymax] of the frame, model metres. */
  rect: [number, number, number, number]
  extentExceeded: boolean
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

export function fitInset({ points, width, height, bounds, paddingPx = 12, minHalf = 120 }: {
  points: [number, number][]
  width: number
  height: number
  /** Coverage [xmin, ymin, xmax, ymax], model metres. */
  bounds: [number, number, number, number]
  paddingPx?: number
  minHalf?: number
}): InsetFrame {
  if (!points.length || points.some((p) => !Number.isFinite(p[0]) || !Number.isFinite(p[1]))) throw new Error('Inset framing needs at least one finite XY point.')
  if (![width, height, paddingPx, minHalf].every(Number.isFinite) || width <= 0 || height <= 0 || paddingPx < 0 || paddingPx * 2 >= Math.min(width, height) || minHalf <= 0) {
    throw new Error('Inset dimensions and marker padding must be positive and finite.')
  }
  if (!bounds.every(Number.isFinite) || bounds[2] <= bounds[0] || bounds[3] <= bounds[1]) throw new Error('Inset coverage bounds must be [xmin, ymin, xmax, ymax].')
  const xs = points.map((p) => p[0]), ys = points.map((p) => p[1])
  const loX = Math.min(...xs), hiX = Math.max(...xs), loY = Math.min(...ys), hiY = Math.max(...ys)
  const aspect = width / height
  const usableX = 1 - (2 * paddingPx) / width, usableY = 1 - (2 * paddingPx) / height
  const half = Math.max(minHalf, (hiX - loX) / (2 * aspect * usableX), (hiY - loY) / (2 * usableY))
  const halfX = half * aspect
  const centreFor = (lowPoint: number, highPoint: number, lowBound: number, highBound: number, halfSpan: number, usable: number) => {
    const pointLow = highPoint - halfSpan * usable, pointHigh = lowPoint + halfSpan * usable
    const coverLow = lowBound + halfSpan, coverHigh = highBound - halfSpan
    const mid = (lowPoint + highPoint) / 2
    const jointLow = Math.max(pointLow, coverLow), jointHigh = Math.min(pointHigh, coverHigh)
    if (jointLow <= jointHigh) return clamp(mid, jointLow, jointHigh)
    // Coverage cannot hold this frame: keep the points padded and leave as little uncovered as possible.
    const nearest = coverLow <= coverHigh ? clamp(mid, coverLow, coverHigh) : (lowBound + highBound) / 2
    return clamp(nearest, pointLow, pointHigh)
  }
  const cx = centreFor(loX, hiX, bounds[0], bounds[2], halfX, usableX)
  const cy = centreFor(loY, hiY, bounds[1], bounds[3], half, usableY)
  const rect: [number, number, number, number] = [cx - halfX, cy - half, cx + halfX, cy + half]
  const eps = 1e-8 * Math.max(1, ...bounds.map(Math.abs))
  const extentExceeded = rect[0] < bounds[0] - eps || rect[1] < bounds[1] - eps || rect[2] > bounds[2] + eps || rect[3] > bounds[3] + eps
  return { center: [cx, cy], half, aspect, rect, extentExceeded }
}
