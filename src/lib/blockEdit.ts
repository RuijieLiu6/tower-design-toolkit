// Direct editing of a tower's stacked blocks in the 3D view, after Sinnie Choi's Downtown Massing Tool (scene3d.js,
// ported with her permission, 6 Nov 2026; Ruijie: "match the functions to the Massing tool … allow the user to directly
// toggle on the model to alter the massing and form"). Two modes, as hers:
//   Face  drag a side face to push or pull it (the opposite face stays put); drag the roof to change the block's height
//         in whole storeys (the blocks above ride on it, since blocks stack).
//   Mass  drag a block to move it on its own floor; the blocks resting on it go with it (Shift: this block alone).
// Snapping: 0.5 m steps and alignment with the other blocks' faces (Alt: free). A drag shows a preview and writes the
// tower once on release, so each drag is one undo step; Esc drops it. Pure maths here (testable); the view is
// components/MassingEdit3D.tsx. Frame: the project's (x east of the model grid, y north of it, z up, metres).
import { create } from 'zustand'
import { blocksOf, blockSpans, PODIUM_F2F, type BlockSpan } from '../engine/massing'
import type { Block, Tower } from '../engine/types'

export type V3 = [number, number, number]
export interface Ray3 { o: V3; d: V3 }
/** Side faces in the block's own frame (u along its width, v along its depth) and the roof. */
export type FaceKey = 'u+' | 'u-' | 'v+' | 'v-' | 'top'
export type EditMode = 'face' | 'mass'

export const STEP_M = 0.5
export const MIN_SIDE_M = 3
const DEG = Math.PI / 180

/** Where a ray first meets a block of the tower: the block, the face, the point and the distance. */
export interface BlockHit { index: number; face: FaceKey | 'bottom'; point: V3; dist: number }

/** The tower's blocks as boxes: centre, rotation (deg), size and vertical span, base at `baseZ`. */
export function boxes(t: Tower, baseZ: number): (BlockSpan & { w: number; d: number; zb: number; zt: number })[] {
  return blockSpans(t).map((s) => ({ ...s, w: s.block.width, d: s.block.depth, zb: baseZ + s.z0, zt: baseZ + s.z1 }))
}

/** The first block face the ray meets (slab test in each block's own frame), or null. */
export function hitBlocks(t: Tower, baseZ: number, ray: Ray3): BlockHit | null {
  let best: BlockHit | null = null
  for (const b of boxes(t, baseZ)) {
    if (b.zt - b.zb <= 0) continue
    const a = b.rotation * DEG, c = Math.cos(a), s = Math.sin(a)
    // Ray in the block frame: origin relative to the centre, turned by -rotation.
    const ox = ray.o[0] - b.cx, oy = ray.o[1] - b.cy
    const o = [ox * c + oy * s, -ox * s + oy * c, ray.o[2] - (b.zb + b.zt) / 2]
    const d = [ray.d[0] * c + ray.d[1] * s, -ray.d[0] * s + ray.d[1] * c, ray.d[2]]
    const half = [b.w / 2, b.d / 2, (b.zt - b.zb) / 2]
    let tmin = -Infinity, tmax = Infinity, axis = -1, sign = 0
    let miss = false
    for (let k = 0; k < 3; k++) {
      if (Math.abs(d[k]) < 1e-12) { if (Math.abs(o[k]) > half[k]) { miss = true; break } continue }
      let t1 = (-half[k] - o[k]) / d[k], t2 = (half[k] - o[k]) / d[k]
      let sg = -1
      if (t1 > t2) { [t1, t2] = [t2, t1]; sg = 1 }
      if (t1 > tmin) { tmin = t1; axis = k; sign = sg }
      if (t2 < tmax) tmax = t2
      if (tmin > tmax) { miss = true; break }
    }
    if (miss || tmax < 0 || axis < 0) continue
    const dist = tmin >= 0 ? tmin : tmax
    if (best && dist >= best.dist) continue
    const face: BlockHit['face'] = axis === 2 ? (sign > 0 ? 'top' : 'bottom') : axis === 0 ? (sign > 0 ? 'u+' : 'u-') : (sign > 0 ? 'v+' : 'v-')
    best = { index: b.index, face, point: [ray.o[0] + ray.d[0] * dist, ray.o[1] + ray.d[1] * dist, ray.o[2] + ray.d[2] * dist], dist }
  }
  return best
}

/** Parameter along the line O + s·N of the point nearest the ray (Sinnie's axisParam); null when they are parallel. */
export function axisParam(O: V3, N: V3, ray: Ray3): number | null {
  const w0 = [O[0] - ray.o[0], O[1] - ray.o[1], O[2] - ray.o[2]]
  const dot = (p: number[], q: number[]) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2]
  const b = dot(N, ray.d), c = dot(ray.d, ray.d), dN = dot(N, w0), e = dot(ray.d, w0), a = dot(N, N)
  const den = a * c - b * b
  if (Math.abs(den) < 1e-9) return null
  return (b * e - c * dN) / den
}

/** Where the ray meets the horizontal plane at height z. */
export function planeHit(ray: Ray3, z: number): [number, number] | null {
  if (Math.abs(ray.d[2]) < 1e-9) return null
  const k = (z - ray.o[2]) / ray.d[2]
  return k > 0 ? [ray.o[0] + ray.d[0] * k, ray.o[1] + ray.d[1] * k] : null
}

/** Centre of a face and its outward direction, project frame. */
export function faceFrame(t: Tower, baseZ: number, index: number, face: FaceKey): { O: V3; N: V3 } {
  const b = boxes(t, baseZ)[index]
  const a = b.rotation * DEG, u: [number, number] = [Math.cos(a), Math.sin(a)], v: [number, number] = [-Math.sin(a), Math.cos(a)]
  const zc = (b.zb + b.zt) / 2
  if (face === 'top') return { O: [b.cx, b.cy, b.zt], N: [0, 0, 1] }
  const dir = face === 'u+' ? u : face === 'u-' ? [-u[0], -u[1]] : face === 'v+' ? v : [-v[0], -v[1]]
  const off = face[0] === 'u' ? b.w / 2 : b.d / 2
  return { O: [b.cx + dir[0] * off, b.cy + dir[1] * off, zc], N: [dir[0], dir[1], 0] }
}

/** Storey height of a block's floors: its own, the podium's, or the tower's floor-to-floor. */
export function storeyOf(t: Tower, index: number): number {
  const spans = blockSpans(t), b = spans[index]
  if (!b) return t.f2f
  if (b.podium) return b.block.f2f && b.block.f2f > 0 ? b.block.f2f : PODIUM_F2F
  return t.f2f
}

const r2 = (x: number) => Math.round(x * 100) / 100
const fmt = (x: number, d = 1) => x.toLocaleString('en-CA', { maximumFractionDigits: d, minimumFractionDigits: d })
const name = (b: Block, i: number, podium: boolean) => b.name || (podium ? 'Podium' : `Block ${i + 1}`)

/** What a drag is doing, for the readout over the view. */
export interface EditInfo { title: string; value: string; delta: string; extra?: string; guide?: string }
export interface EditResult { blocks: Block[]; info: EditInfo }

/**
 * Faces of the other blocks along one of this block's axes, as offsets from its centre at the start (only blocks
 * square to it, 0/90/180/270° apart), for alignment.
 */
function faceCands(t: Tower, index: number, axis: 'u' | 'v'): { v: number; label: string }[] {
  const spans = blockSpans(t), me = spans[index]
  const a = me.rotation * DEG, ax = axis === 'u' ? [Math.cos(a), Math.sin(a)] : [-Math.sin(a), Math.cos(a)]
  const out: { v: number; label: string }[] = []
  spans.forEach((o, j) => {
    if (j === index) return
    const rel = ((((o.rotation - me.rotation) % 90) + 90) % 90)
    if (Math.min(rel, 90 - rel) > 0.5) return
    const q = ((((o.rotation - me.rotation) % 180) + 180) % 180)
    const along = Math.abs(q - 90) < 1 ? (axis === 'u' ? o.block.depth : o.block.width) : axis === 'u' ? o.block.width : o.block.depth
    const c = (o.cx - me.cx) * ax[0] + (o.cy - me.cy) * ax[1]
    const label = name(o.block, j, o.podium)
    out.push({ v: c - along / 2, label }, { v: c + along / 2, label })
  })
  return out
}
const nearest = (cands: { v: number; label: string }[], v: number, tol: number) => {
  let best: { v: number; label: string } | null = null, bd = tol
  for (const c of cands) { const d = Math.abs(c.v - v); if (d < bd) { bd = d; best = c } }
  return best
}

/**
 * Push or pull a face by `raw` metres along its outward normal. A side face changes width or depth with the opposite
 * face fixed; the roof changes the block's height in whole storeys (free: to 0.1 m).
 */
export function pushFace(t: Tower, index: number, face: FaceKey, raw: number, o: { free?: boolean; tol?: number } = {}): EditResult {
  const blocks = blocksOf(t).map((b) => ({ ...b }))
  const b = blocks[index], spans = blockSpans(t), sp = spans[index]
  const label = name(b, index, sp.podium)
  if (face === 'top') {
    const f = storeyOf(t, index), h0 = b.height
    let h = o.free ? Math.round((h0 + raw) * 10) / 10 : Math.round((h0 + raw) / f) * f
    h = Math.max(o.free ? MIN_SIDE_M : f, h)
    b.height = r2(h)
    const n = Math.round(b.height / f), top = spans[spans.length - 1].z1 - h0 + b.height
    return { blocks, info: { title: `${label} · roof`, value: `Height ${fmt(b.height)} m`, delta: `${b.height - h0 >= 0 ? '+' : ''}${fmt(b.height - h0)} m`, extra: `${n} storey${n === 1 ? '' : 's'} at ${fmt(f, 2)} m · tower top ${fmt(top)} m` } }
  }
  const axis = face[0] as 'u' | 'v', plus = face[1] === '+'
  const dim0 = axis === 'u' ? b.width : b.depth
  // The moving face's offset from the block centre (at the start), along the axis; the fixed face stays at -this.
  const face0 = (plus ? 1 : -1) * dim0 / 2
  const out = (off: number) => face0 + (plus ? off : -off)
  let pos = out(o.free ? raw : Math.round(raw / STEP_M) * STEP_M)
  let guide: string | undefined
  if (!o.free) {
    const g = nearest(faceCands(t, index, axis), out(raw), o.tol ?? 0.6)
    if (g) { pos = g.v; guide = `lined up with ${g.label}` }
  }
  const fixed = -face0
  const dim = Math.max(MIN_SIDE_M, plus ? pos - fixed : fixed - pos)
  const shift = (plus ? 1 : -1) * (dim - dim0) / 2
  // The block's own axis in the tower frame (offsets are in the tower frame).
  const a = b.rotation * DEG, ax = axis === 'u' ? [Math.cos(a), Math.sin(a)] : [-Math.sin(a), Math.cos(a)]
  b.dx = r2(b.dx + ax[0] * shift); b.dy = r2(b.dy + ax[1] * shift)
  if (axis === 'u') b.width = r2(dim); else b.depth = r2(dim)
  const what = axis === 'u' ? 'Width' : 'Depth'
  return { blocks, info: { title: `${label} · side face`, value: `${what} ${fmt(dim)} m`, delta: `${dim - dim0 >= 0 ? '+' : ''}${fmt(dim - dim0)} m`, extra: `plate ${Math.round(b.width * b.depth).toLocaleString('en-CA')} m²`, guide } }
}

/**
 * Move a block on its floor by (dx, dy) in the project frame. The blocks resting on it go with it unless `alone`.
 * Snapping: 0.5 m steps along the tower's axes, the tower's axis line, and the other blocks' faces (block not twisted).
 */
export function moveBlock(t: Tower, index: number, dx: number, dy: number, o: { free?: boolean; alone?: boolean; tol?: number } = {}): EditResult {
  const blocks = blocksOf(t).map((b) => ({ ...b }))
  const b = blocks[index], spans = blockSpans(t)
  const a = t.rotation * DEG, c = Math.cos(a), s = Math.sin(a)
  // Into the tower frame, where the offsets live.
  let du = dx * c + dy * s, dv = -dx * s + dy * c
  const guides: string[] = []
  if (!o.free) {
    du = Math.round(du / STEP_M) * STEP_M; dv = Math.round(dv / STEP_M) * STEP_M
    const tw = ((b.rotation % 90) + 90) % 90
    if (Math.min(tw, 90 - tw) < 0.5) {
      const q = ((b.rotation % 180) + 180) % 180, turned = Math.abs(q - 90) < 1
      const hu = (turned ? b.depth : b.width) / 2, hv = (turned ? b.width : b.depth) / 2
      const cands = (axis: 'u' | 'v') => {
        const out = [{ v: 0, label: 'the tower axis', centre: true }]
        blocksOf(t).forEach((x, j) => {
          if (j === index) return
          const xt = ((x.rotation % 90) + 90) % 90
          if (Math.min(xt, 90 - xt) > 0.5) return
          const xq = ((x.rotation % 180) + 180) % 180, xturned = Math.abs(xq - 90) < 1
          const half = (axis === 'u' ? (xturned ? x.depth : x.width) : (xturned ? x.width : x.depth)) / 2
          const cc = axis === 'u' ? x.dx : x.dy
          const label = name(x, j, spans[j]?.podium ?? false)
          out.push({ v: cc - half, label, centre: false }, { v: cc + half, label, centre: false })
        })
        return out
      }
      const snapAxis = (axis: 'u' | 'v', c0: number, d: number, half: number) => {
        let best: { off: number; label: string } | null = null, bd = o.tol ?? 0.6
        for (const k of cands(axis)) {
          for (const edge of k.centre ? [0] : [-half, half]) {
            const dist = Math.abs(c0 + d + edge - k.v)
            if (dist < bd) { bd = dist; best = { off: k.v - edge - c0, label: k.label } }
          }
        }
        return best
      }
      const gu = snapAxis('u', b.dx, du, hu), gv = snapAxis('v', b.dy, dv, hv)
      if (gu) { du = gu.off; guides.push(gu.label) }
      if (gv) { dv = gv.off; guides.push(gv.label) }
    }
  }
  const moved = o.alone ? [index] : blocks.map((_, j) => j).filter((j) => j >= index)
  for (const j of moved) { blocks[j].dx = r2(blocks[j].dx + du); blocks[j].dy = r2(blocks[j].dy + dv) }
  const carried = moved.length - 1
  return {
    blocks,
    info: {
      title: `${name(b, index, spans[index].podium)} · move`, value: `${fmt(Math.hypot(du, dv))} m`, delta: `${fmt(du)} m along, ${fmt(dv)} m across the tower`,
      extra: carried ? `carries the ${carried} block${carried === 1 ? '' : 's'} above (Shift: this block alone)` : undefined,
      guide: [...new Set(guides)].length ? `lined up with ${[...new Set(guides)].join(' and ')}` : undefined,
    },
  }
}

/**
 * A new block on top of block `index`, with its footprint, offset and twist, three storeys tall; the blocks above are
 * lifted by it. Inside the podium run it is podium (its storey height and use); on top of the podium it starts the tower.
 */
export function addBlockAbove(t: Tower, index: number, id: string): Block[] {
  const blocks = blocksOf(t).map((b) => ({ ...b }))
  const i = Math.max(0, Math.min(index, blocks.length - 1))
  const src = blocks[i]
  const podium = !!src.podium && !!blocks[i + 1]?.podium
  const f = podium ? (src.f2f && src.f2f > 0 ? src.f2f : PODIUM_F2F) : t.f2f
  const nb: Block = { id, name: 'New block', height: r2(3 * f), width: src.width, depth: src.depth, dx: src.dx, dy: src.dy, rotation: src.rotation, ...(podium ? { podium: true, ...(src.use ? { use: src.use } : {}), ...(src.f2f ? { f2f: src.f2f } : {}) } : {}) }
  return [...blocks.slice(0, i + 1), nb, ...blocks.slice(i + 1)]
}

/** The editing session the Massing tool runs in the view. */
interface BlockEditState {
  /** The Massing tool is open on the Form step (editing in the view is live). */
  on: boolean
  mode: EditMode
  /** The view stays framed on the tower: zoom and pan locked, orbit about it free. */
  locked: boolean
  /** The block picked in the view (its id), highlighted in the panel's block list. */
  block: string | null
  hover: { index: number; face: BlockHit['face'] } | null
  /** A drag in progress: the preview blocks and what it is doing. */
  op: { towerId: string; kind: 'push' | 'move'; index: number; face?: FaceKey; blocks: Block[]; info: EditInfo; x: number; y: number } | null
  /** Bumped to ask the view to frame the tower again. */
  frame: number
  set: (patch: Partial<Omit<BlockEditState, 'set'>>) => void
}

export const useBlockEdit = create<BlockEditState>((set) => ({
  on: false, mode: 'face', locked: true, block: null, hover: null, op: null, frame: 0,
  set: (patch) => set(patch),
}))
