import type { ReactNode } from 'react'
import { FLAG_ICONS } from '../data/icons'
import { fieldUnit, useUnits } from '../lib/units'
import type { Flag, RuleState } from '../engine/types'
import type { ConeState } from '../engine/viewCones'

export const FLAG_META: Record<Flag, { label: string; className: string; title: string }> = {
  verified: { label: 'Verified', className: 'bg-flag-verified text-white', title: 'Backed by an opened, cited source' },
  team_assumption: { label: 'Team assumption', className: 'bg-flag-team text-white', title: 'Editable preset chosen by the team; not from a source' },
  unverified: { label: 'Unverified', className: 'hatch text-ink border border-flag-unverified', title: 'Source not opened or not confirmed' },
  unresolved: { label: 'Unresolved', className: 'bg-flag-unresolved text-white', title: 'Relationship not found yet' },
  false_assumption: { label: 'False assumption', className: 'bg-flag-false text-white', title: 'Found to be wrong; kept visible with its correction' },
}

export function FlagChip({ flag }: { flag: Flag | string }) {
  const f = (flag === 'false_assumption_corrected' ? 'false_assumption' : flag) as Flag
  const m = FLAG_META[f] ?? FLAG_META.unverified
  const Icon = FLAG_ICONS[f] ?? FLAG_ICONS.unverified
  return <span title={m.title} className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium leading-none ${m.className}`}><Icon size={11} />{m.label}</span>
}

const STATE_STYLE: Record<RuleState, string> = {
  pass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  fail: 'bg-red-50 text-red-800 border-red-200',
  warn: 'bg-amber-50 text-amber-800 border-amber-200',
  unknown: 'bg-slate-50 text-slate-700 border-slate-200',
}
const STATE_TEXT: Record<RuleState, string> = { pass: 'Pass', fail: 'Fail', warn: 'Check', unknown: 'Unknown' }

export function StateChip({ state }: { state: RuleState }) {
  return <span className={`inline-flex rounded border px-1.5 py-0.5 text-[11px] font-semibold ${STATE_STYLE[state]}`}>{STATE_TEXT[state]}</span>
}

export const CONE_STYLE: Record<ConeState, { chip: string; color: string }> = {
  above: { chip: 'bg-red-50 text-red-800 border-red-200', color: '#d0453a' },
  limit_unknown: { chip: 'bg-slate-100 text-slate-800 border-slate-300', color: '#8a8f98' },
  within_uncertainty: { chip: 'bg-amber-50 text-amber-800 border-amber-200', color: '#d98b1c' },
  near_edge: { chip: 'bg-sky-50 text-sky-800 border-sky-200', color: '#4a90c2' },
  clear: { chip: 'bg-emerald-50 text-emerald-800 border-emerald-200', color: '#2e8b57' },
  outside: { chip: 'bg-white text-slate-500 border-slate-200', color: '#c9ccd1' },
}

export function Section({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="border-b border-line px-4 py-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted">{title}</h3>
        {right}
      </div>
      {children}
    </section>
  )
}

export function NumberField({ label, value, onChange, step = 1, min, max, unit, hint }: {
  label: string; value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number; unit?: string; hint?: string
}) {
  // Fields stored in m, mm or m² show in the viewer's display unit (lib/units.ts); the value saved stays in its own unit.
  const f = fieldUnit(unit, useUnits((st) => st.unit))
  const shown = f ? f.toShown(value) : value
  const set = (v: number) => onChange(f ? f.fromShown(v) : v)
  const round = f ? 1000 : 100
  return (
    <label className="flex flex-col gap-1 text-xs" title={hint}>
      <span className="text-muted">{label}</span>
      <div className="flex items-center gap-2">
        {min !== undefined && max !== undefined && (
          <input type="range" min={f ? f.toShown(min) : min} max={f ? f.toShown(max) : max} step={f ? f.toShown(step) : step} value={shown} onChange={(e) => set(Number(e.target.value))} className="w-full accent-accent" aria-label={label} />
        )}
        <div className="flex items-center rounded border border-line bg-panel">
          <input type="number" step={f ? 'any' : step} value={Number.isFinite(shown) ? Math.round(shown * round) / round : 0} onChange={(e) => set(Number(e.target.value))}
            className="w-16 bg-transparent px-1.5 py-1 text-right tabular-nums outline-none" aria-label={`${label} value`} />
          {unit && <span className="pr-1.5 text-muted">{f ? f.label : unit}</span>}
        </div>
      </div>
    </label>
  )
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={onChange}
      className={`relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors ${checked ? 'bg-accent' : 'bg-slate-300'}`}>
      <span className={`inline-block h-3 w-3 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-3.5' : 'translate-x-0.5'}`} />
    </button>
  )
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-line bg-panel px-1 py-0.5 font-mono text-[10px] text-muted">{children}</kbd>
}
