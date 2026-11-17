// Typology: tower-form presets for a parametric tower (Sinnie Choi's Toolkit build, artifact 1794900977-6d89,
// `TowerForms`; ported 17 Nov 2026 at Ruijie's request; source of the design: her build and
// github.com/xubynii/towerdesigntool). Plain box, tapered shaft, twisting tower, set-back tiers, shifted stack: each
// is the tower's blocks rebuilt from its typical plate (engine/blocks.ts, engine/massing.ts withBlocks), the podium
// blocks kept, with one to three sliders. A drawn or imported mass keeps its own shape (the drawing tools shape it).
import { useId } from 'react'
import { blocksOf } from '../../engine/blocks'
import { withBlocks } from '../../engine/massing'
import type { Block, Tower } from '../../engine/types'
import { breakStep } from '../../lib/project/history'
import { useStore, useTowers } from '../../store'
import { placeFirstTower } from '../tools/NoTower'

export type FormType = 'none' | 'taper' | 'twist' | 'tiered' | 'stacked'
interface Param { key: string; label: string; min: number; max: number; step: number; def: number; fmt: (v: number) => string }
const pct = (v: number) => `${Math.round(v * 100)}%`
const PARAMS: Record<string, Param> = {
  taper: { key: 'taper', label: 'Top plate scale', min: 0.3, max: 0.98, step: 0.01, def: 0.6, fmt: pct },
  profile: { key: 'profile', label: 'Taper profile', min: 0.5, max: 2.5, step: 0.05, def: 1.2, fmt: (v) => (Math.abs(v - 1) < 0.03 ? 'linear' : v < 1 ? `concave ${v.toFixed(2)}` : `convex ${v.toFixed(2)}`) },
  twist: { key: 'twist', label: 'Total twist', min: 0, max: 180, step: 5, def: 60, fmt: (v) => `${v}°` },
  twistTaper: { key: 'twistTaper', label: 'Top plate scale', min: 0.6, max: 1, step: 0.01, def: 0.9, fmt: pct },
  tiers: { key: 'tiers', label: 'Tiers', min: 2, max: 6, step: 1, def: 3, fmt: String },
  setback: { key: 'setback', label: 'Setback per tier', min: 0.05, max: 0.3, step: 0.01, def: 0.15, fmt: pct },
  align: { key: 'align', label: 'Setback alignment', min: 0, max: 1, step: 0.05, def: 0.5, fmt: (v) => (v < 0.03 ? 'centred' : v > 0.97 ? 'flush to one corner' : `${pct(v)} toward corner`) },
  blocks: { key: 'blocks', label: 'Blocks', min: 2, max: 6, step: 1, def: 3, fmt: String },
  shift: { key: 'shift', label: 'Block shift', min: 0, max: 0.5, step: 0.01, def: 0.15, fmt: (v) => `${pct(v)} of plate` },
  blockTaper: { key: 'blockTaper', label: 'Block shrink toward top', min: 0, max: 0.35, step: 0.01, def: 0.1, fmt: pct },
}
export const FORMS: Record<FormType, { name: string; blurb: string; params: string[] }> = {
  none: { name: 'Plain box', blurb: 'A straight extrusion of the plate.', params: [] },
  taper: { name: 'Tapered shaft', blurb: 'The plate shrinks with height toward the top plate scale.', params: ['taper', 'profile'] },
  twist: { name: 'Twisting tower', blurb: 'Each plate rotates about the centre as the tower rises.', params: ['twist', 'twistTaper'] },
  tiered: { name: 'Set-back tiers', blurb: 'Stepped volumes on a broad base; each tier steps in.', params: ['tiers', 'setback', 'align'] },
  stacked: { name: 'Shifted stack', blurb: 'Blocks slide off one another; the shifts leave terraces.', params: ['blocks', 'shift', 'blockTaper'] },
}
const GLYPH: Record<FormType, string> = {
  none: '<rect x="7" y="2" width="12" height="34"/>',
  taper: '<polygon points="4,36 22,36 17,2 9,2"/>',
  twist: '<polygon points="6,36 20,36 18,2 8,2"/><path d="M8,2 C15,12 6,22 12,36" style="fill:none"/>',
  tiered: '<polygon points="3,36 23,36 23,24 20,24 20,14 17,14 17,5 11,5 11,14 8,14 8,24 3,24"/>',
  stacked: '<rect x="4" y="27" width="14" height="9"/><rect x="9" y="18" width="14" height="9"/><rect x="4" y="9" width="14" height="9"/><rect x="9" y="1" width="14" height="8"/>',
}
export const FORM_TYPES = Object.keys(FORMS) as FormType[]
const defaults = (f: FormType) => Object.fromEntries(FORMS[f].params.map((k) => [k, PARAMS[k].def]))
const MAX_BLOCKS = 48

/** The typical plate the form starts from: the first tower block above the podium, the tower height above it. */
function baseOf(t: Tower): { w: number; d: number; h: number; f2f: number } {
  if (t.form?.base) return t.form.base
  const bl = blocksOf(t), tower = bl.filter((b) => !b.podium), first = tower[0] ?? bl[bl.length - 1]
  const h = tower.reduce((s, b) => s + b.height, 0) || Math.max(t.f2f, t.height - t.podiumHeight)
  return { w: first?.width ?? t.width, d: first?.depth ?? t.depth, h, f2f: t.f2f }
}

/** The tower blocks of a form: a plate per storey (grouped while alike), from the base plate up. Pure. */
export function formBlocks(form: FormType, p: Record<string, number>, base: { w: number; d: number; h: number; f2f: number }): Block[] {
  const { w, d, f2f } = base
  const n = Math.max(1, Math.round(base.h / f2f)), H = n * f2f
  const c = { ...defaults(form), ...p }
  const tierTops: number[] = []
  if (form === 'tiered') { const shares: number[] = []; let tot = 0; for (let i = 0; i < c.tiers; i++) { const s = 1 - 0.12 * i; shares.push(s); tot += s } let acc = 0; for (const s of shares) { acc += s / tot; tierTops.push(acc) } }
  const plate = (t: number) => {
    let pw = w, pd = d, cx = 0, cy = 0, rot = 0
    if (form === 'taper') { const k = 1 - (1 - c.taper) * t ** c.profile; pw = w * k; pd = d * k }
    else if (form === 'twist') { const k = 1 - (1 - c.twistTaper) * t; pw = w * k; pd = d * k; rot = c.twist * t }
    else if (form === 'tiered') { let i = 0; while (i < tierTops.length - 1 && t > tierTops[i]) i++; const k = (1 - c.setback) ** i; pw = w * k; pd = d * k; cx = (c.align * (w - pw)) / 2; cy = (c.align * (d - pd)) / 2 }
    else if (form === 'stacked') { const i = Math.min(c.blocks - 1, Math.floor(t * c.blocks)), k = 1 - c.blockTaper * (i / Math.max(1, c.blocks - 1)); pw = w * k; pd = d * k; if (i > 0) { const dir = [[1, 0], [0, 1], [-1, 0], [0, -1]][(i - 1) % 4]; cx = dir[0] * c.shift * w; cy = dir[1] * c.shift * d } }
    return { w: pw, d: pd, cx, cy, rot }
  }
  const per = Math.max(1, Math.ceil(n / MAX_BLOCKS)), out: Block[] = []
  for (let s = 0; s < n; s += per) {
    const k = Math.min(per, n - s), r = plate((s * f2f + (k * f2f) / 2) / H), last = out[out.length - 1]
    if (last && Math.abs(last.width - r.w) < 1e-6 && Math.abs(last.depth - r.d) < 1e-6 && Math.abs(last.dx - r.cx) < 1e-6 && Math.abs(last.dy - r.cy) < 1e-6 && Math.abs(last.rotation - r.rot) < 1e-6) last.height += k * f2f
    else out.push({ id: `f${out.length}`, name: form === 'none' ? 'Tower' : `${FORMS[form].name} ${out.length + 1}`, width: r.w, depth: r.d, height: k * f2f, dx: r.cx, dy: r.cy, rotation: r.rot })
  }
  return out
}

/** Give the tower a form: its podium blocks stay, the tower blocks are rebuilt. A slider drag is one undo step (the step breaks when a slider is taken). Not for drawn or imported masses. */
export function applyForm(id: string, form: FormType, p: Record<string, number>): boolean {
  const s = useStore.getState(), t = s.towers[s.project].find((x) => x.id === id)
  if (!t || t.imported || t.drawn) return false
  const base = baseOf(t), bl = blocksOf(t), podium: Block[] = []
  for (const b of bl) { if (b.podium) podium.push(b); else break }
  const next = withBlocks(t, [...podium, ...formBlocks(form, p, base)])
  s.updateTower(id, { blocks: next.blocks, boxFromBlocks: next.boxFromBlocks, height: next.height, width: next.width, depth: next.depth, podiumHeight: next.podiumHeight, podiumWidth: next.podiumWidth, podiumDepth: next.podiumDepth, form: form === 'none' ? undefined : { type: form, p, base } })
  return true
}

/** The presets as tiles with a glyph each and the chosen one's sliders; with no tower, picking one places the starting tower in that form. */
export default function TowerForms() {
  const towers = useTowers()
  const selected = useStore((s) => s.selectedTower)
  const t = towers.find((x) => x.id === selected) ?? towers[0] ?? null
  const shapeable = !t || (!t.drawn && !t.imported)
  const form: FormType = (t?.form?.type as FormType) ?? 'none'
  const p = { ...defaults(form), ...(t?.form?.p ?? {}) }
  const head = useId()
  const pick = (f: FormType) => {
    if (!t) placeFirstTower()
    const id = useStore.getState().selectedTower
    applyForm(id, f, defaults(f))
  }
  return (
    <section data-testid="tower-forms" aria-labelledby={head} className="px-3 py-2">
      <h4 id={head} className="text-control font-semibold text-ink">Tower form{t && <span className="font-normal text-muted"> · {t.name}</span>}</h4>
      <div role="radiogroup" aria-label="Tower form" className="mt-1.5 grid grid-cols-5 gap-1">
        {FORM_TYPES.map((f) => (
          <button key={f} type="button" role="radio" aria-checked={form === f} data-form={f} disabled={!shapeable} title={`${FORMS[f].name}: ${FORMS[f].blurb}`} onClick={() => pick(f)}
            className={`flex flex-col items-center gap-0.5 rounded-md border px-0.5 py-1 outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40 ${form === f ? 'border-accent bg-accent/[0.08]' : 'border-line bg-panel hover:border-accent'}`}>
            <svg viewBox="0 0 26 38" className="h-8 w-6" aria-hidden fill={form === f ? '#1f5f8b' : '#9aa3ad'} stroke={form === f ? '#1f5f8b' : '#7d8792'} strokeWidth="0.8" dangerouslySetInnerHTML={{ __html: GLYPH[f] }} />
            <span className={`text-center text-meta leading-tight ${form === f ? 'font-semibold text-ink' : 'text-muted'}`}>{FORMS[f].name}</span>
          </button>
        ))}
      </div>
      {!shapeable && <p className="mt-1 text-meta text-muted">A drawn or imported mass keeps its own shape: shape it with the drawing tools.</p>}
      {shapeable && t && FORMS[form].params.map((k) => {
        const q = PARAMS[k]
        return (
          <label key={k} className="mt-1.5 block text-meta">
            <span className="flex justify-between text-muted"><span>{q.label}</span><output className="tabular-nums text-ink">{q.fmt(p[k])}</output></span>
            <input type="range" min={q.min} max={q.max} step={q.step} value={p[k]} aria-label={q.label} data-param={k} className="w-full" onPointerDown={breakStep} onFocus={breakStep} onChange={(e) => applyForm(t.id, form, { ...p, [k]: Number(e.target.value) })} />
          </label>
        )
      })}
    </section>
  )
}
