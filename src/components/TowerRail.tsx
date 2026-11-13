// The tower rail (Sinnie, 12 Nov, after the Tower Workspace's tool rail beside its main panel): the tower edit tools as
// one column of icons on the right panel's inner edge, in the toolkit's IconTile look (icon + a key word, the full name
// and what it does on hover). They act on the picked tower (the first one when none is picked): Place a new tower (P),
// Move (M), Rotate (R), Align to the lot (L), Frame it, Delete it. Present locks the model, so there they are off.
// The floating toolbar over the view keeps the move proposal and its typed values (TowerToolbar.tsx).
import { LandPlot, Move, Plus, RotateCw, ScanLine, Trash2 } from './icons'
import { alignToLot, pickTower, toggleMode, useTowerEdit } from '../lib/towerEdit'
import { useTowerPosition } from '../lib/towerPosition'
import { useStore } from '../store'
import IconTile from './IconTile'

export default function TowerRail() {
  const towers = useStore((s) => s.towers[s.project])
  const selected = useStore((s) => s.selectedTower)
  const placing = useStore((s) => s.placing)
  const present = useStore((s) => s.phase === 'present')
  const { picked, move, rotate } = useTowerEdit()
  const id = picked ?? (towers.some((t) => t.id === selected) ? selected : towers[0]?.id) ?? null
  const name = towers.find((t) => t.id === id)?.name
  const none = !id || present
  const lockHint = present ? 'The model is locked in Present: go back to Form or Schematic.' : !id ? 'Place a tower first.' : undefined
  const mode = (m: 'move' | 'rotate') => { if (!id) return; pickTower(id); toggleMode(m) }
  return (
    <nav aria-label="Tower tools" data-testid="tower-rail" className="flex w-16 shrink-0 flex-col items-center gap-1 border-r border-line py-2">
      <IconTile size="sm" icon={Plus} word="Place" label="Place a tower" active={placing} aria-pressed={placing} aria-keyshortcuts="P" disabled={present}
        hint={present ? lockHint : 'Click on the site where the new tower should stand.'} onClick={() => useStore.getState().set({ placing: !placing })} />
      <span aria-hidden className="my-0.5 h-px w-8 bg-line" />
      <IconTile size="sm" icon={Move} word="Move" label={`Move ${name ?? 'the tower'}`} active={!!picked && move} aria-pressed={!!picked && move} aria-keyshortcuts="M" disabled={none} hint={lockHint ?? 'Drag it in the view, or type x and y.'} onClick={() => mode('move')} />
      <IconTile size="sm" icon={RotateCw} word="Rotate" label={`Rotate ${name ?? 'the tower'}`} active={!!picked && rotate} aria-pressed={!!picked && rotate} aria-keyshortcuts="R" disabled={none} hint={lockHint ?? 'Drag round it in the view, or type the turn.'} onClick={() => mode('rotate')} />
      <IconTile size="sm" icon={LandPlot} word="Align" label={`Align ${name ?? 'the tower'} to the lot`} aria-keyshortcuts="L" disabled={none} hint={lockHint ?? 'Turns it square to the lot it stands on.'} onClick={() => id && alignToLot(id)} />
      <span aria-hidden className="my-0.5 h-px w-8 bg-line" />
      <IconTile size="sm" icon={ScanLine} word="Frame" label="Frame the site and the tower" disabled={!id} onClick={() => { if (id) pickTower(id); useTowerPosition.setState((s) => ({ frame: s.frame + 1 })) }} hint="The view frames the site and the tower again." />
      <IconTile size="sm" icon={Trash2} word="Delete" label={`Delete ${name ?? 'the tower'}`} disabled={none} hint={lockHint ?? 'Removes it; Undo in the project bar brings it back.'} onClick={() => id && useStore.getState().removeTower(id)} />
    </nav>
  )
}
