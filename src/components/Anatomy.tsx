import { ArrowUpDown, Building2, Eye, EyeOff, Fan, FlaskConical, Footprints, Ghost, Layers2, PanelsTopLeft, Square } from 'lucide-react'
import { useStore } from '../store'
import { FlagChip } from './ui'
import { useShallow } from 'zustand/react/shallow'

/** Schematic: the tower's anatomy, with development (LOD) tags. Rows exist only for what a parameter or module produces. */
export default function Anatomy({ embedded = false }: { embedded?: boolean }) {
  const { anatomy, set } = useStore(useShallow((s) => ({ anatomy: s.anatomy, set: s.set })))
  const rows = [
    { key: 'shell' as const, label: 'Shell (ghosted)', icon: Ghost, lod: null },
    { key: 'plates' as const, label: 'Floor plates', icon: Layers2, lod: 100 },
    { key: 'core' as const, label: 'Core', icon: Square, lod: 100 },
    { key: 'plant' as const, label: 'Plant floors', icon: Fan, lod: 100 },
    { key: 'lifts' as const, label: 'Lift shafts', icon: ArrowUpDown, lod: 100 },
    { key: 'stairs' as const, label: 'Exit stairs', icon: Footprints, lod: 100 },
  ]
  const roadmap = [
    { label: 'Structure (outriggers)', icon: Building2, node: 'P10-M01' },
    { label: 'Facade', icon: PanelsTopLeft, node: 'P12-M06' },
  ]
  return (
    <div className={embedded ? 'px-2 py-2' : 'border-b border-line p-2'}>
      {!embedded && <h3 className="px-2 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wider text-muted">Tower anatomy</h3>}
      {rows.map(({ key, label, icon: Icon, lod }) => (
        <div key={key} className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-black/5">
          <Icon size={14} className="text-accent" />
          <span className="flex-1 text-xs">{label}</span>
          {lod && <span className="flex items-center gap-1 rounded border border-line px-1 text-[9px] text-muted" title="Level of development: a space reservation, approximate">LOD {lod}<span className="flex gap-px"><i className="h-2 w-0.5 bg-muted" /></span></span>}
          <button aria-label={`${anatomy[key] ? 'Hide' : 'Show'} ${label}`} onClick={() => set({ anatomy: { ...anatomy, [key]: !anatomy[key] } })} className="text-muted hover:text-ink">
            {anatomy[key] ? <Eye size={14} /> : <EyeOff size={14} />}
          </button>
        </div>
      ))}
      <div className="mt-1 flex items-center gap-1 px-2"><FlagChip flag="team_assumption" /><span className="text-[10px] text-muted">Core, plant, lift and egress presets are editable.</span></div>
      {roadmap.map(({ label, icon: Icon, node }) => (
        <div key={label} className="flex items-center gap-2 px-2 py-1 text-muted" title={`Appears when ${node} is built`}>
          <Icon size={14} /><span className="flex-1 text-xs">{label}</span><FlaskConical size={12} /><span className="text-[9px]">roadmap</span>
        </div>
      ))}
    </div>
  )
}
