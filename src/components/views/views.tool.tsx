// Choose a view (17 Nov 2026, Sinnie: "for the view tool, learn from the vista tool. I want to see these 4 options on the
// left panel … right should only be data or key results"). Vista's four ways in, as cards: a protected view cone, from a
// building, from the street, drag and view; under them what that way needs (a cone list, rooftops that see the tower or
// a design floor, a click on the street, a drag on the map) and the look settings. The right panel keeps the viewpoint,
// the skyline and the results (ViewFromPanel, VistaPanel). Opened with the view tool (lib/workflow/phaseTools.ts).
import { Building2, Cone, Eye, MousePointerClick, Move } from '../icons'
import type { DesignTool } from '../tools/registry'
import { useViewFromStore, type ViewHow } from '../../lib/viewFromStore'
import { useStore } from '../../store'
import { LookControls, TowerStand } from '../ViewFromPanel'
import { ViewChoices } from '../VistaPanel'

const CARDS: { id: ViewHow; label: string; Icon: typeof Eye }[] = [
  { id: 'cone', label: 'Protected view cone', Icon: Cone },
  { id: 'building', label: 'From a building', Icon: Building2 },
  { id: 'street', label: 'From the street', Icon: Eye },
  { id: 'drag', label: 'Drag and view', Icon: Move },
]

function ChooseView() {
  const project = useStore((s) => s.project)
  const v = useViewFromStore()
  if (project !== 'city') return <p className="px-3 pb-3 text-meta text-muted">Views run in the Real Vancouver project, where the City cones, roofs and terrain are loaded.</p>
  const choose = (how: ViewHow) => v.set({ how, picking: how === 'street' || how === 'drag', pickKind: how === 'street' ? 'street' : how === 'drag' ? 'drag' : 'roof', note: null, looking: false })
  const pickBtn = (word: string, kind: 'roof' | 'street') => (
    <button type="button" onClick={() => v.set({ picking: !v.picking, pickKind: kind, note: null, looking: false })} aria-pressed={v.picking}
      className={`flex w-full items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 text-xs ${v.picking ? 'border-accent bg-accent text-white' : 'border-line bg-white hover:border-accent'}`}>
      <MousePointerClick size={13} aria-hidden />{v.picking ? 'Click in the 3D view…' : word}
    </button>
  )
  return (
    <div className="grid gap-3 px-3 pb-3" data-testid="choose-view">
      <div role="radiogroup" aria-label="Choose a view" className="grid grid-cols-2 gap-1.5">
        {CARDS.map(({ id, label, Icon }) => {
          const on = v.how === id
          return (
            <button key={id} type="button" role="radio" aria-checked={on} data-view-how={id} onClick={() => choose(id)}
              className={`flex min-h-[4.5rem] flex-col items-center justify-center gap-1.5 rounded-md border px-2 py-2 text-center text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-accent ${on ? 'border-accent bg-accent/[0.08] text-ink' : 'border-line bg-white text-ink hover:border-accent'}`}>
              <Icon size={18} aria-hidden className={on ? 'text-accent' : 'text-muted'} />{label}
            </button>
          )
        })}
      </div>
      {v.how === 'cone' && <ViewChoices how="cone" />}
      {v.how === 'building' && <div className="grid gap-1.5">{pickBtn('Click a roof', 'roof')}<TowerStand /><ViewChoices how="building" /></div>}
      {v.how === 'street' && pickBtn('Click a street point', 'street')}
      {v.how === 'drag' && <div className="grid gap-1.5">
        <button type="button" onClick={() => v.set({ picking: !v.picking, pickKind: 'drag', note: null, looking: false })} aria-pressed={v.picking}
          className={`flex w-full items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 text-xs ${v.picking ? 'border-accent bg-accent text-white' : 'border-line bg-white hover:border-accent'}`}><Move size={13} aria-hidden />{v.picking ? 'Press where you stand, drag to look…' : 'Drag on the map'}</button>
        <p className="text-meta text-muted">Press where you stand and drag toward what you want to see; letting go looks that way at eye height.</p>
      </div>}
      {v.note && <p role="status" className="rounded bg-amber-50 px-2 py-1 text-meta text-amber-900">{v.note}</p>}
      {v.viewpoint && <div className="border-t border-line pt-2"><p className="mb-1.5 truncate text-meta font-semibold text-ink" title={v.viewpoint.label}>{v.viewpoint.label}</p><LookControls /></div>}
    </div>
  )
}

const tools: DesignTool[] = [
  { id: 'view-choose', label: 'Choose a view', short: 'View', icon: Eye, stages: ['basic', 'advanced'], order: 200, hint: 'A protected view cone, a building, the street, or drag and view', component: ChooseView, when: () => false },
]
export default tools
