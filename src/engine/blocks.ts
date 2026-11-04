// Stacked-block geometry without dependencies (after Vista's proposal parts, Ruijie Liu), so the solar worker can use
// it without the import pipeline. engine/massing.ts re-exports all of it.
import type { Block, Tower } from './types'

/** Footprint corners of a rectangle centred at (x, y), rotated by deg. */
export function rectCorners(x: number, y: number, w: number, d: number, deg: number): [number, number][] {
  const a = (deg * Math.PI) / 180
  const c = Math.cos(a), s = Math.sin(a)
  return ([[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]] as [number, number][]).map(([u, v]) => [x + u * c - v * s, y + u * s + v * c])
}

/** The two blocks an old tower stands for: podium (when it has one) and tower. */
export function legacyBlocks(t: Tower): Block[] {
  const out: Block[] = []
  if (t.podiumHeight > 0) out.push({ id: 'podium', name: 'Podium', height: t.podiumHeight, width: t.podiumWidth, depth: t.podiumDepth, dx: 0, dy: 0, rotation: 0, podium: true })
  out.push({ id: 'tower', name: 'Tower', height: Math.max(0, t.height - Math.max(0, t.podiumHeight)), width: t.width, depth: t.depth, dx: 0, dy: 0, rotation: 0 })
  return out
}

/** The old box fields a tower exposes; with blocks they are derived from them (see `summarize`). */
export type BoxFields = Pick<Tower, 'height' | 'width' | 'depth' | 'podiumHeight' | 'podiumWidth' | 'podiumDepth'>
const BOX: (keyof BoxFields)[] = ['height', 'width', 'depth', 'podiumHeight', 'podiumWidth', 'podiumDepth']

/**
 * The tower's blocks. The blocks win, unless a box field changed after they were last set (`boxFromBlocks` is the
 * snapshot `withBlocks` takes): then someone set that field directly (an edit, or a what-if copy such as
 * `{ ...t, height: 150 }`), and the change is fitted onto the blocks (`fitBlocks`), so every reader agrees.
 */
export function blocksOf(t: Tower): Block[] {
  if (!t.blocks?.length) return legacyBlocks(t)
  const snap = t.boxFromBlocks
  if (!snap || BOX.every((k) => Math.abs(snap[k] - t[k]) < 1e-6)) return t.blocks
  return fitBlocks(t.blocks, snap, t)
}

/**
 * Map a change of the box fields onto the blocks: width and depth scale the blocks above the podium, podium width and
 * depth scale the podium blocks, podium height resizes the podium run (or adds or removes it) keeping the total height,
 * and height moves the top of the top block.
 */
export function fitBlocks(blocks: Block[], from: BoxFields, to: BoxFields): Block[] {
  let out = blocks.map((x) => ({ ...x }))
  const run = podiumRun(out)
  const scale = (a: number, b: number, list: Block[], key: 'width' | 'depth') => {
    if (!(a > 0) || Math.abs(b - a) < 1e-9) return
    for (const x of list) x[key] = Math.max(1, x[key] * (b / a))
  }
  scale(from.width, to.width, out.slice(run), 'width')
  scale(from.depth, to.depth, out.slice(run), 'depth')
  scale(from.podiumWidth, to.podiumWidth, out.slice(0, run), 'width')
  scale(from.podiumDepth, to.podiumDepth, out.slice(0, run), 'depth')
  if (Math.abs(to.podiumHeight - from.podiumHeight) > 1e-9) {
    const target = Math.max(0, to.podiumHeight)
    const total = out.reduce((s, x) => s + x.height, 0)
    if (target === 0) out = out.slice(run)
    else if (run === 0) out = [{ id: 'podium', name: 'Podium', height: target, width: to.podiumWidth || to.width * 2, depth: to.podiumDepth || to.depth * 1.4, dx: 0, dy: 0, rotation: 0, podium: true }, ...out]
    else { const had = from.podiumHeight || 1; for (let i = 0; i < run; i++) out[i].height *= target / had }
    // Keep the architectural top: the first block above the podium takes the difference.
    const first = out[podiumRun(out)]
    if (first) first.height = Math.max(3, first.height + total - out.reduce((s, x) => s + x.height, 0))
  }
  const total = out.reduce((s, x) => s + x.height, 0)
  const top = out[out.length - 1]
  if (top && Math.abs(to.height - total) > 1e-9) top.height = Math.max(3, top.height + to.height - total)
  return out
}

/** Number of leading podium blocks. */
export const podiumRun = (blocks: Block[]) => { let n = 0; while (n < blocks.length && blocks[n].podium) n++; return n }

/** Index of the block that sets the typical tower plate: the tallest above the podium (the first on a tie), else the top one. */
export function typicalIndex(blocks: Block[]): number {
  const run = podiumRun(blocks)
  const from = run < blocks.length ? run : 0
  let best = -1
  for (let i = from; i < blocks.length; i++) if (best < 0 || blocks[i].height > blocks[best].height + 1e-9) best = i
  return best
}
export function typicalBlock(blocks: Block[]): Block | null {
  const i = typicalIndex(blocks)
  return i >= 0 ? blocks[i] : null
}

/** Height, plate and podium fields derived from the blocks (what older readers of a tower see). */
export function summarize(blocks: Block[], prev?: Pick<Tower, 'podiumWidth' | 'podiumDepth' | 'width' | 'depth'>) {
  const run = blocks.slice(0, podiumRun(blocks))
  const typ = typicalBlock(blocks)
  const widest = run.reduce<Block | null>((a, b) => (!a || b.width * b.depth > a.width * a.depth ? b : a), null)
  return {
    height: blocks.reduce((s, b) => s + Math.max(0, b.height), 0),
    podiumHeight: run.reduce((s, b) => s + Math.max(0, b.height), 0),
    podiumWidth: widest?.width ?? prev?.podiumWidth ?? 0,
    podiumDepth: widest?.depth ?? prev?.podiumDepth ?? 0,
    width: typ?.width ?? prev?.width ?? 0,
    depth: typ?.depth ?? prev?.depth ?? 0,
  }
}

export interface BlockSpan { block: Block; index: number; z0: number; z1: number; podium: boolean; cx: number; cy: number; rotation: number; ring: [number, number][] }

/** Each block placed in the project frame: its vertical span, centre, rotation and plan rectangle. */
export function blockSpans(t: Tower): BlockSpan[] {
  const blocks = blocksOf(t)
  const run = podiumRun(blocks)
  const a = (t.rotation * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a)
  let z = 0
  return blocks.map((b, index) => {
    const z0 = z
    z += Math.max(0, b.height)
    const cx = t.x + b.dx * c - b.dy * s, cy = t.y + b.dx * s + b.dy * c, rotation = t.rotation + b.rotation
    return { block: b, index, z0, z1: z, podium: index < run, cx, cy, rotation, ring: rectCorners(cx, cy, b.width, b.depth, rotation) }
  })
}

/** The block span holding height z (the top block above the stack, the bottom one below it). */
export function spanAt(spans: BlockSpan[], z: number): BlockSpan | null {
  if (!spans.length) return null
  return spans.find((s) => z >= s.z0 - 1e-9 && z < s.z1 - 1e-9) ?? (z < spans[0].z0 ? spans[0] : spans[spans.length - 1])
}


/** Floor-to-floor of each band's floors: its own, or the tower's. */
export const bandF2f = (t: Pick<Tower, 'bands' | 'f2f'>) => t.bands.map((x) => (x.f2f && x.f2f > 0 ? x.f2f : t.f2f))

/**
 * Floors per program band above the podium in `height` metres. Bands share the floors by their shares (largest
 * remainder). When every band uses the tower's floor-to-floor this is the old allocation exactly; with a band's own
 * floor-to-floor (Section tool) the floor count is the one whose total height fits, then remainders are added while
 * they still fit.
 */
export function bandCounts(t: Pick<Tower, 'bands' | 'f2f'>, height: number): number[] {
  const total = t.bands.reduce((s, x) => s + Math.max(0, x.share), 0) || 1
  const share = t.bands.map((x) => Math.max(0, x.share) / total)
  const f = bandF2f(t)
  if (f.every((v) => v === t.f2f)) {
    // A floor that fits exactly counts (214.2 m / 4.2 m is 50.999… in floating point).
    const n = Math.max(0, Math.floor(height / t.f2f + 1e-6))
    const raw = share.map((s) => s * n)
    const counts = raw.map(Math.floor)
    let left = n - counts.reduce((a, c) => a + c, 0)
    raw.map((v, i) => [v - Math.floor(v), i] as const).sort((a, c) => c[0] - a[0]).forEach(([, i]) => { if (left > 0) { counts[i]++; left-- } })
    return counts
  }
  const mean = share.reduce((s, x, i) => s + x * f[i], 0) || t.f2f
  const n = Math.max(0, height / mean + 1e-6)
  const raw = share.map((s) => s * n)
  const counts = raw.map(Math.floor)
  let used = counts.reduce((s, c, i) => s + c * f[i], 0)
  for (const [, i] of raw.map((v, k) => [v - Math.floor(v), k] as const).sort((a, c) => c[0] - a[0])) {
    if (used + f[i] <= height + 1e-6) { counts[i]++; used += f[i] }
  }
  return counts
}
