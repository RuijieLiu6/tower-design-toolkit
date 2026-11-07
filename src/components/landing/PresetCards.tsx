// A user type's starting workflows (lib/userTypes.ts) as cards, icons first (Ruijie, 7 Nov: "create them with icons or
// visual information instead of list of data, avoid long written words, hide it through hover … always show the icon
// nice and big"). Each card: a big icon for the workflow, its name, where it opens as two icon chips, and its analysis
// nodes as big category tiles with a count; the node names and the workflow's goal show on hover or focus. Start opens
// it in the guided app; Graph opens it as a node graph in Customize. Pointing at a card lights its nodes in the orbit.
import { useState } from 'react'
import { ArrowUpDown, Building, Camera, Columns3, Cuboid, FileCheck2, House, Layers, Layers2, Leaf, Loader2, MapPin, Mountain, Pencil, PenTool, Scale, Sun, TrainFront, Trophy, Users, Workflow, type LucideIcon } from '../icons'
import { CATEGORY_ICONS, PRESET_ICONS, STEP_ICONS } from '../../data/icons'
import { BUILT_NODES, CATEGORIES, type Category } from '../../data/registry'
import { PROCESS } from '../../data/stages'
import type { StepId } from '../../lib/step'
import { openPresetInCustomize, startPreset } from '../../lib/startPreset'
import { aType, type Preset, type UserTypeId } from '../../lib/userTypes'
import Help from '../Help'
import GlassIcon, { CATEGORY_HUE, HUES, ICON, nodeHue } from '../GlassIcon'

const STEP_ICON: Record<StepId, LucideIcon> = STEP_ICONS

/** The workflow's nodes by category: one tile per category, in the order the workflow lists them. */
function groups(p: Preset): { cat: Category; names: string[] }[] {
  const out: { cat: Category; names: string[] }[] = []
  for (const id of p.nodes) {
    const n = BUILT_NODES.find((x) => x.id === id)
    if (!n) continue
    const g = out.find((x) => x.cat === n.category)
    if (g) g.names.push(n.name); else out.push({ cat: n.category, names: [n.name] })
  }
  return out
}

export default function PresetCards({ title, presets, onActive, onEdit }: { title: string; presets: Preset[]; onActive: (p: Preset | null) => void; onEdit: (p: Preset) => void }) {
  const [going, setGoing] = useState<string | null>(null)
  return (
    <section aria-labelledby="presets-title" data-testid="landing-presets" className="grid gap-3">
      <h2 id="presets-title" className="scroll-mt-6 text-[22px] font-semibold tracking-[-0.01em] text-ink">{title}</h2>
      <ul className={`grid gap-3 sm:grid-cols-2 ${presets.length >= 4 ? 'xl:grid-cols-4' : 'lg:grid-cols-3'}`} onMouseLeave={() => onActive(null)}>
        {presets.map((p, i) => {
          const Icon = PRESET_ICONS[p.id] ?? Workflow, Step = STEP_ICON[p.step]
          const first = BUILT_NODES.find((n) => n.id === p.nodes[0]), hue = first ? nodeHue(first.id, first.category) : HUES.sky
          const step = PROCESS.find((s) => s.id === p.step)?.label ?? p.step
          return (
            <li key={p.id} data-preset={p.id} onMouseEnter={() => onActive(p)} onFocus={() => onActive(p)}
              className={`glass-edge flex flex-col gap-3 rounded-3xl p-4 ${i === 0 ? 'bg-glass-1' : 'bg-glass-2'}`}>
              <div className="flex items-start justify-between gap-2">
                <GlassIcon icon={Icon} hue={hue} size={ICON.feature} />
                <Help label={`About ${p.name}`}>{p.goal}</Help>
              </div>
              <h3 className="text-pretty text-[15px] font-semibold leading-snug text-ink">{p.name}</h3>
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-ink" aria-label="Where it opens">
                <span className="flex items-center gap-1 py-0.5" title={p.project === 'vtc' ? 'The competition block' : 'A real Vancouver site'}>
                  {p.project === 'vtc' ? <Trophy size={14} className="text-accent" aria-hidden /> : <MapPin size={14} className="text-accent" aria-hidden />}{p.project === 'vtc' ? 'Competition' : 'Vancouver'}
                </span>
                <span className="flex items-center gap-1 py-0.5" title={`Opens on the ${step} step`}><Step size={14} className="text-accent" aria-hidden />{step}</span>
              </div>
              <ul className="flex flex-wrap gap-2" aria-label={`${p.nodes.length} analysis nodes`}>
                {groups(p).map((g) => <NodeTile key={g.cat} cat={g.cat} names={g.names} />)}
              </ul>
              <div className="mt-auto flex items-center gap-2 pt-1">
                <button type="button" disabled={!!going} data-testid={`start-${p.id}`} onClick={() => { setGoing(p.id); void startPreset(p).catch(() => setGoing(null)) }}
                  className="flex-1 rounded-full bg-accent px-3.5 py-2 text-[14px] font-semibold text-white outline-none hover:bg-accent/90 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:opacity-50">
                  {going === p.id ? <Loader2 size={14} className="mr-1 inline animate-spin" aria-hidden /> : null}Start
                </button>
                <button type="button" onClick={() => onEdit(p)} title="Change its nodes on the phase board below" aria-label={`Change ${p.name} on the phase board`} data-testid={`edit-${p.id}`}
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-white/70 bg-white/35 text-ink outline-none hover:bg-white/70 hover:text-accent focus-visible:ring-2 focus-visible:ring-accent">
                  <Pencil size={20} aria-hidden />
                </button>
                <button type="button" disabled={!!going} onClick={() => { setGoing(p.id); void openPresetInCustomize(p).catch(() => setGoing(null)) }}
                  title="Open it as a node graph in Customize" aria-label={`See ${p.name} as a node graph`}
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-white/70 bg-white/35 text-ink outline-none hover:bg-white/70 hover:text-accent focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50">
                  <Workflow size={20} aria-hidden />
                </button>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/** One category of the workflow: a big tile in its colour, the count when it holds several; the names on hover or focus. */
function NodeTile({ cat, names }: { cat: Category; names: string[] }) {
  const Icon = CATEGORY_ICONS[cat], c = CATEGORIES[cat]
  return (
    <li className="group relative">
      <span tabIndex={0} role="img" aria-label={`${c.label}: ${names.join(', ')}`} className="flex rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-accent">
        <GlassIcon icon={Icon} hue={CATEGORY_HUE[cat]} size={ICON.feature} />
      </span>
      {names.length > 1 && <span aria-hidden className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-ink px-1 text-[10.5px] font-semibold text-white">{names.length}</span>}
      <span role="tooltip" className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 hidden w-max max-w-[15rem] -translate-x-1/2 rounded-lg bg-ink px-2.5 py-1.5 text-[12px] leading-snug text-white shadow-lg group-focus-within:block group-hover:block">
        <b className="block font-semibold">{c.label}</b>
        {names.map((n) => <span key={n} className="block opacity-90">{n}</span>)}
      </span>
    </li>
  )
}
