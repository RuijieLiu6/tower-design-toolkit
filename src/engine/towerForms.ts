// Tower forms from Sinnie Choi's Downtown Massing Tool (github.com/xubynii/dtmass, src/form.js, after the Supertall
// Massing Lab): Tapered shaft, Twisting tower, Set-back tiers and Shifted stack, with her parameters, defaults and the
// same per-storey rules (16 Nov, Sinnie: the Typology tab should "include the typologies like stepping, twisting, etc.
// that were from the massing tool"). Here a form becomes the tower's stacked blocks above its podium: one block per
// storey run that shares a plate (tiers and stacks), or per storey for tapers and twists (grouped when a tower has more
// than MAX_BLOCKS storeys), so floors, area, checks, Scale and the block editor keep working on it. The podium blocks are
// kept as they are; the base plate and shaft height the form starts from are kept on the tower (`form.base`), so
// changing a slider re-shapes from the same base instead of compounding.
import type { Block } from './types'
import { scaleAt, swellLaw } from './scaleLaw'

export type FormType = 'none' | 'taper' | 'swell' | 'twist' | 'tiered' | 'stacked'
export interface FormParam { key: string; label: string; min: number; max: number; step: number; def: number; fmt: (v: number) => string }
const pct = (v: number) => `${Math.round(v * 100)}%`

export const FORM_PARAMS: Record<string, FormParam> = {
  taper: { key: 'taper', label: 'Top plate scale', min: 0.3, max: 0.98, step: 0.01, def: 0.6, fmt: pct },
  profile: { key: 'profile', label: 'Taper profile', min: 0.5, max: 2.5, step: 0.05, def: 1.2, fmt: (v) => (Math.abs(v - 1) < 0.03 ? 'linear' : v < 1 ? `concave ${v.toFixed(2)}` : `convex ${v.toFixed(2)}`) },
  twist: { key: 'twist', label: 'Total twist', min: 0, max: 180, step: 5, def: 60, fmt: (v) => `${v}°` },
  twistTaper: { key: 'twistTaper', label: 'Top plate scale', min: 0.6, max: 1, step: 0.01, def: 0.9, fmt: pct },
  tiers: { key: 'tiers', label: 'Tiers', min: 2, max: 6, step: 1, def: 3, fmt: (v) => String(v) },
  setback: { key: 'setback', label: 'Setback per tier', min: 0.05, max: 0.3, step: 0.01, def: 0.15, fmt: pct },
  align: { key: 'align', label: 'Setback alignment', min: 0, max: 1, step: 0.05, def: 0.5, fmt: (v) => (v < 0.03 ? 'centred' : v > 0.97 ? 'flush to one corner' : `${pct(v)} toward corner`) },
  blocks: { key: 'blocks', label: 'Blocks', min: 2, max: 6, step: 1, def: 3, fmt: (v) => String(v) },
  shift: { key: 'shift', label: 'Block shift', min: 0, max: 0.5, step: 0.01, def: 0.15, fmt: (v) => `${pct(v)} of plate` },
  blockTaper: { key: 'blockTaper', label: 'Block shrink toward top', min: 0, max: 0.35, step: 0.01, def: 0.1, fmt: pct },
  // Swelling shaft (gap G78, Study 4 C): the plate widens to a peak and narrows again, one smooth curve (engine/scaleLaw.ts).
  swellAt: { key: 'swellAt', label: 'Widest at', min: 0.2, max: 0.8, step: 0.05, def: 0.5, fmt: (v) => `${pct(v)} of the shaft` },
  swellScale: { key: 'swellScale', label: 'Widest plate scale', min: 1, max: 1.5, step: 0.01, def: 1.15, fmt: pct },
  swellTop: { key: 'swellTop', label: 'Top plate scale', min: 0.5, max: 1.2, step: 0.01, def: 0.9, fmt: pct },
  swellTwist: { key: 'swellTwist', label: 'Total twist', min: 0, max: 180, step: 5, def: 0, fmt: (v) => `${v}°` },
}

export const FORM_TYPES: Record<FormType, { name: string; blurb: string; params: string[] }> = {
  none: { name: 'Plain box', blurb: 'A straight extrusion of the plate.', params: [] },
  taper: { name: 'Tapered shaft', blurb: 'The plate shrinks with height toward the top plate scale.', params: ['taper', 'profile'] },
  swell: { name: 'Swelling shaft', blurb: 'The plate widens to a peak part-way up and narrows again: one smooth curve, base to top.', params: ['swellAt', 'swellScale', 'swellTop', 'swellTwist'] },
  twist: { name: 'Twisting tower', blurb: 'Each plate rotates about the centre as the tower rises.', params: ['twist', 'twistTaper'] },
  tiered: { name: 'Set-back tiers', blurb: 'Stepped volumes on a broad base; each tier steps in.', params: ['tiers', 'setback', 'align'] },
  stacked: { name: 'Shifted stack', blurb: 'Blocks slide off one another; the shifts leave terraces.', params: ['blocks', 'shift', 'blockTaper'] },
}

/** Her tile silhouettes (26 × 38). */
export const FORM_ICON: Record<FormType, string> = {
  none: '<rect x="7" y="2" width="12" height="34"/>',
  taper: '<polygon points="4,36 22,36 17,2 9,2"/>',
  swell: '<path d="M7,36 C1,24 1,14 9,2 L17,2 C25,14 25,24 19,36 Z"/>',
  twist: '<polygon points="6,36 20,36 18,2 8,2"/><path d="M8,2 C15,12 6,22 12,36" style="fill:none"/>',
  tiered: '<polygon points="3,36 23,36 23,24 20,24 20,14 17,14 17,5 11,5 11,14 8,14 8,24 3,24"/>',
  stacked: '<rect x="4" y="27" width="14" height="9"/><rect x="9" y="18" width="14" height="9"/><rect x="4" y="9" width="14" height="9"/><rect x="9" y="1" width="14" height="8"/>',
}

export const formDefaults = (type: FormType): Record<string, number> => Object.fromEntries(FORM_TYPES[type].params.map((k) => [k, FORM_PARAMS[k].def]))

export interface FormBase { w: number; d: number; h: number; f2f: number }
const MAX_BLOCKS = 48

/** The shaft's blocks, bottom-up, for a form on a base plate `w` × `d`, `h` tall in storeys of `f2f`. */
export function formBlocks(type: FormType, p: Record<string, number>, base: FormBase): Block[] {
  const { w: W, d: D, f2f } = base
  const N = Math.max(1, Math.round(base.h / f2f)), H = N * f2f
  const q = { ...formDefaults(type), ...p }
  const tierB: number[] = []
  if (type === 'tiered') { const ws: number[] = []; let sum = 0; for (let k = 0; k < q.tiers; k++) { const w = 1 - 0.12 * k; ws.push(w); sum += w } let acc = 0; for (const w of ws) { acc += w / sum; tierB.push(acc) } }
  const plate = (t: number) => {
    let w = W, d = D, cx = 0, cy = 0, rot = 0
    if (type === 'taper') { const s = 1 - (1 - q.taper) * Math.pow(t, q.profile); w = W * s; d = D * s }
    else if (type === 'swell') { const s = scaleAt(swellLaw(q.swellAt, q.swellScale, q.swellTop), t); w = W * s; d = D * s; rot = q.swellTwist * t }
    else if (type === 'twist') { const s = 1 - (1 - q.twistTaper) * t; w = W * s; d = D * s; rot = q.twist * t }
    else if (type === 'tiered') { let k = 0; while (k < tierB.length - 1 && t > tierB[k]) k++; const s = Math.pow(1 - q.setback, k); w = W * s; d = D * s; cx = q.align * (W - w) / 2; cy = q.align * (D - d) / 2 }
    else if (type === 'stacked') {
      const k = Math.min(q.blocks - 1, Math.floor(t * q.blocks)), s = 1 - q.blockTaper * (k / Math.max(1, q.blocks - 1)); w = W * s; d = D * s
      if (k > 0) { const dir = [[1, 0], [0, 1], [-1, 0], [0, -1]][(k - 1) % 4]; cx = dir[0] * q.shift * W; cy = dir[1] * q.shift * D }
    }
    return { w, d, cx, cy, rot }
  }
  // Storeys grouped so a tall taper or twist stays at most MAX_BLOCKS blocks; runs with the same plate merge.
  const g = Math.max(1, Math.ceil(N / MAX_BLOCKS))
  const out: Block[] = []
  for (let i = 0; i < N; i += g) {
    const n = Math.min(g, N - i), t = (i * f2f + (n * f2f) / 2) / H, pl = plate(t)
    const last = out[out.length - 1]
    const same = last && Math.abs(last.width - pl.w) < 1e-6 && Math.abs(last.depth - pl.d) < 1e-6 && Math.abs(last.dx - pl.cx) < 1e-6 && Math.abs(last.dy - pl.cy) < 1e-6 && Math.abs(last.rotation - pl.rot) < 1e-6
    if (same) { last.height += n * f2f; continue }
    out.push({ id: `f${out.length}`, name: type === 'none' ? 'Tower' : `${FORM_TYPES[type].name} ${out.length + 1}`, width: pl.w, depth: pl.d, height: n * f2f, dx: pl.cx, dy: pl.cy, rotation: pl.rot })
  }
  return out
}
