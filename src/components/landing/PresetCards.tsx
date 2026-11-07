// A user type's starting workflows (lib/userTypes.ts) as cards: what it is for, where it opens, the analysis nodes it
// switches on (with their category's colour and icon), and two ways in: start it in the guided app, or see it as a node
// graph in Customize. Pointing at a card lights its nodes in the orbit above.
import { useState } from 'react'
import { Loader2, Workflow } from '../icons'
import { CATEGORY_ICONS } from '../../data/icons'
import { BUILT_NODES, CATEGORIES } from '../../data/registry'
import { PROCESS } from '../../data/stages'
import { openPresetInCustomize, startPreset } from '../../lib/startPreset'
import { aType, type Preset, type UserTypeId } from '../../lib/userTypes'

export default function PresetCards({ type, presets, onActive }: { type: UserTypeId; presets: Preset[]; onActive: (p: Preset | null) => void }) {
  const [going, setGoing] = useState<string | null>(null)
  return (
    <section aria-labelledby="presets-title" data-testid="landing-presets" className="grid gap-3">
      <h2 id="presets-title" className="text-[15px] font-semibold text-ink">Starting workflows for {aType(type)}</h2>
      <ul className={`grid gap-3 md:grid-cols-2 ${presets.length >= 4 ? 'xl:grid-cols-4' : 'lg:grid-cols-3'}`} onMouseLeave={() => onActive(null)}>
        {presets.map((p, i) => (
          <li key={p.id} data-preset={p.id} onMouseEnter={() => onActive(p)} onFocus={() => onActive(p)}
            className={`flex flex-col rounded-xl border bg-panel p-4 ${i === 0 ? 'border-accent/50' : 'border-line'}`}>
            <h3 className="text-pretty text-[15px] font-semibold leading-snug text-ink">{p.name}</h3>
            <p className="mt-1 text-[13px] leading-relaxed text-muted">{p.goal}</p>
            <p className="mt-2 text-[12px] text-muted">{p.project === 'vtc' ? 'Competition site' : 'Real Vancouver'}, opens on {PROCESS.find((s) => s.id === p.step)?.label ?? p.step}</p>
            <ul className="mt-2.5 flex flex-wrap gap-1" aria-label={`${p.nodes.length} analysis nodes`}>
              {p.nodes.map((id) => {
                const n = BUILT_NODES.find((x) => x.id === id)
                if (!n) return null
                const Icon = CATEGORY_ICONS[n.category]
                return (
                  <li key={id} title={`${CATEGORIES[n.category].label}: ${n.name}`} className="flex items-center gap-1 rounded-md border border-line px-1.5 py-0.5 text-[11.5px] text-ink">
                    <Icon size={12} color={CATEGORIES[n.category].color} aria-hidden />{n.name.replace(/ \(.*\)$/, '')}
                  </li>
                )
              })}
            </ul>
            <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
              <button type="button" disabled={!!going} data-testid={`start-${p.id}`} onClick={() => { setGoing(p.id); void startPreset(p).catch(() => setGoing(null)) }}
                className="rounded-lg bg-accent px-3.5 py-1.5 text-[13px] font-semibold text-white outline-none hover:bg-accent/90 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:opacity-50">
                {going === p.id ? <Loader2 size={13} className="mr-1 inline animate-spin" aria-hidden /> : null}Start
              </button>
              <button type="button" disabled={!!going} onClick={() => { setGoing(p.id); void openPresetInCustomize(p).catch(() => setGoing(null)) }}
                className="flex items-center gap-1 rounded-lg border border-line px-3 py-1.5 text-[13px] text-ink outline-none hover:border-accent focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50">
                <Workflow size={13} aria-hidden />See it as a graph
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
