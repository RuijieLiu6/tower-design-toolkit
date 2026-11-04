// Left-panel cards of the Plan and Section design tools: a short summary and the button that opens the full-size editor
// over the 3D view (DesignToolHost). The editors themselves load lazily.
import { lazy, Suspense } from 'react'
import { coreSide, towerFloors } from '../../engine/massing'
import { typicalFloor } from '../../engine/plan'
import { useStore, useTowers } from '../../store'
import { DesignToolOverlay, useDesignTool, type DesignToolId } from './DesignToolHost'

const PlanTool = lazy(() => import('./PlanTool'))
const SectionTool = lazy(() => import('./SectionTool'))

function Card({ id, title, children }: { id: DesignToolId; title: string; children: React.ReactNode }) {
  const { open, set } = useDesignTool()
  const Editor = id === 'plan' ? PlanTool : SectionTool
  return (
    <div className="grid gap-1.5 px-4 pb-3 pt-1 text-[11px]">
      {children}
      <button type="button" data-testid={`open-${id}-tool`} aria-pressed={open === id} onClick={() => set(open === id ? null : id)}
        className={`rounded-md border px-2 py-1 text-xs font-medium ${open === id ? 'border-accent bg-accent text-white' : 'border-line hover:border-accent'}`}>
        {open === id ? `Close the ${title.toLowerCase()} editor` : `Open the ${title.toLowerCase()} editor`}
      </button>
      {open === id && (
        <DesignToolOverlay>
          <Suspense fallback={<div className="p-6 text-xs text-muted">Loading the {title.toLowerCase()} editor…</div>}>
            <Editor onClose={() => set(null)} />
          </Suspense>
        </DesignToolOverlay>
      )}
    </div>
  )
}

export function PlanCard() {
  const towers = useTowers()
  const selected = useStore((s) => s.selectedTower)
  const t = towers.find((x) => x.id === selected) ?? towers[0]
  const f = t ? typicalFloor(t) : null
  const c = t ? coreSide(t) : 0
  return (
    <Card id="plan" title="Plan">
      {t && f ? <p className="text-slate-700">{t.name}, typical floor L{f.level}: {Math.round(f.area).toLocaleString('en-CA')} m² plate, core {c.toFixed(1)} m ({Math.round((1 - (c * c) / f.area) * 100)}% net){t.coreAuto ? ', sized to the lifts' : ', set by hand'}.</p> : <p className="text-muted">No tower.</p>}
      <p className="text-muted">Drag facades, the plate, its turn and the core; lifts, stairs and checks update live.</p>
    </Card>
  )
}

export function SectionCard() {
  const towers = useTowers()
  const selected = useStore((s) => s.selectedTower)
  const t = towers.find((x) => x.id === selected) ?? towers[0]
  const fl = t ? towerFloors(t) : []
  return (
    <Card id="section" title="Section">
      {t ? <p className="text-slate-700">{t.name}: {fl.length} floors, {(fl[fl.length - 1]?.z1 ?? 0).toFixed(1)} m in {t.blocks?.length ?? 2} blocks; {t.skyLobbies?.length ?? 0} sky lobbies, {t.outriggerFloors?.length ?? 0} outrigger floors.</p> : <p className="text-muted">No tower.</p>}
      <p className="text-muted">Drag block tops and setbacks, set floor heights by band, place sky lobbies, plant and outriggers.</p>
    </Card>
  )
}
