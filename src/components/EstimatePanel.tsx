// Your estimates against the engine (gap G81): the designer types the numbers of a hand study for this model (non-res
// FSR, homes, area, height, and the homes rule they used); each shows beside the engine's reading of the same model,
// with the difference, and for homes the split into counting and area when the rule is given. Edits apply at once
// (Ctrl+Z undoes them). The same lines are in the evidence of the brief node (lib/evidence/engines.ts).
import { estimateRows, type DesignEstimates } from '../engine/estimateCheck'
import type { Tower } from '../engine/types'
import { SITE } from '../engine/vtcRules'
import { useStore } from '../store'
import { Section } from './ui'

const FIELDS: { key: keyof DesignEstimates; label: string; step: number; tip: string; vtcOnly?: boolean }[] = [
  { key: 'nonResFsr', label: 'Non-res FSR', step: 0.1, tip: 'Office, retail and hotel over the site area (the brief’s tier 2)', vtcOnly: true },
  { key: 'homes', label: 'Homes', step: 1, tip: 'Homes your study counted' },
  { key: 'gfa', label: 'Area m²', step: 100, tip: 'Gross floor area your study counted' },
  { key: 'height', label: 'Height m', step: 1, tip: 'Height your study gave' },
  { key: 'homeM2', label: 'm² a home', step: 1, tip: 'Your homes rule: area per home (splits the homes gap into counting and area)' },
  { key: 'efficiency', label: 'Efficiency', step: 0.01, tip: 'Your homes rule: net-to-gross share, 0 to 1' },
]

const fmt = (id: string, v: number) => (id === 'estimate-fsr' ? v.toFixed(2) : Math.round(v).toLocaleString())

export default function EstimatePanel({ t }: { t: Tower }) {
  const vtc = useStore((s) => s.project) === 'vtc'
  const updateTower = useStore((s) => s.updateTower)
  const e = t.estimates ?? {}
  const set = (key: keyof DesignEstimates, raw: string) => {
    const next: DesignEstimates = { ...e }
    const v = Number(raw)
    if (raw === '' || !Number.isFinite(v)) delete next[key]; else (next as Record<string, number>)[key] = v
    updateTower(t.id, { estimates: Object.keys(next).length ? next : undefined })
  }
  const rows = estimateRows(t, e, vtc ? SITE.area : null)
  return (
    <Section title="Your estimates against the engine">
      <div className="grid grid-cols-3 gap-1.5 text-meta" data-testid="estimates">
        {FIELDS.filter((f) => vtc || !f.vtcOnly).map((f) => (
          <label key={f.key} className="grid gap-0.5 text-muted" title={f.tip}>{f.label}
            <input type="number" step={f.step} min={0} value={(e[f.key] as number | undefined) ?? ''} aria-label={`Estimate: ${f.label}`}
              onChange={(ev) => set(f.key, ev.target.value)} className="w-full rounded border border-line bg-panel px-1 py-0.5 text-right tabular-nums text-ink outline-none focus:border-accent" />
          </label>
        ))}
      </div>
      {rows.length > 0 && (
        <table className="mt-2 w-full text-meta tabular-nums" data-testid="estimate-rows">
          <thead><tr className="text-left text-muted"><th className="font-normal" /><th className="text-right font-normal">Yours</th><th className="text-right font-normal">Engine</th><th className="text-right font-normal">Gap</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-line/60" title={r.split ? `Your rule on the engine’s area: ${Math.round(r.split.ruleOnEngine)}. Counting storey by storey: ${r.split.counting >= 0 ? '+' : ''}${Math.round(r.split.counting)}. Different area: ${r.split.area >= 0 ? '+' : ''}${Math.round(r.split.area)}.` : undefined}>
                <td className="py-0.5 text-ink">{r.what}</td>
                <td className="text-right">{fmt(r.id, r.estimate)}</td>
                <td className="text-right font-semibold text-ink">{fmt(r.id, r.engine)}</td>
                <td className="text-right">{r.diff >= 0 ? '+' : '−'}{fmt(r.id, Math.abs(r.diff))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {rows.some((r) => r.split) && (() => {
        const h = rows.find((r) => r.split)!
        return <p className="mt-1 text-meta text-muted">Homes gap: counting storey by storey {h.split!.counting >= 0 ? '+' : '−'}{Math.abs(Math.round(h.split!.counting))}, different area {h.split!.area >= 0 ? '+' : '−'}{Math.abs(Math.round(h.split!.area))}.</p>
      })()}
    </Section>
  )
}
