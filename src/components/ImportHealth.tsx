// Health report list for imported massing (research P14-M05): severity chip, plain words, fix, evidence flag and source.
import type { HealthItem } from '../engine/meshHealth'
import { FlagChip } from './ui'

const SEV: Record<HealthItem['severity'], { label: string; cls: string }> = {
  pass: { label: 'OK', cls: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  warn: { label: 'Check', cls: 'bg-amber-50 text-amber-800 border-amber-200' },
  block: { label: 'Blocks import', cls: 'bg-red-50 text-red-800 border-red-200' },
}

export function HealthList({ items, compact = false }: { items: HealthItem[]; compact?: boolean }) {
  const order = { block: 0, warn: 1, pass: 2 }
  const sorted = [...items].sort((a, b) => order[a.severity] - order[b.severity])
  return (
    <section className={compact ? '' : 'rounded-lg border border-line bg-panel p-3'}>
      {!compact && <div className="mb-2 text-xs font-semibold">Geometry health</div>}
      <ul className="grid gap-1.5">
        {sorted.map((h) => (
          <li key={h.id} className="text-[11px]">
            <div className="flex items-start gap-1.5">
              <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-semibold ${SEV[h.severity].cls}`}>{SEV[h.severity].label}</span>
              <span className="min-w-0 flex-1"><b>{h.title}</b>{(!compact || h.severity !== 'pass') && <span className="text-muted"> — {h.detail}</span>}
                {h.fix && h.severity !== 'pass' && <span className="block text-ink">Fix: {h.fix}</span>}
              </span>
            </div>
            {(!compact || h.severity !== 'pass') && <div className="ml-[52px] mt-0.5 flex items-center gap-1"><FlagChip flag={h.flag} /><span className="text-[10px] text-muted">{h.source}</span></div>}
          </li>
        ))}
      </ul>
    </section>
  )
}
