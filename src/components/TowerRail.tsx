// The tower rail (Sinnie, 12 Nov: "implement this tool bar like the tower design tool but update the icons to reflect the
// same style as the toolkit"): a slim column of icon buttons on the right panel's inner edge, laid out as the Tower
// Workspace's tool rail (one tool per square, the active one filled dark, groups split by a hairline, the name on hover)
// and drawn with the toolkit's own line icons (components/icons). Select, Place a new tower (P) | Move (M), Rotate (R),
// Align to the lot (L) | Frame | Delete. They act on the picked tower (the first one when none is picked). Present locks
// the model, so there the editing tools are off. The floating toolbar over the view keeps the move proposal and its
// typed values (TowerToolbar.tsx).
import type { ComponentType } from 'react'
import { LandPlot, MousePointer, Move, Plus, RotateCw, ScanLine, Trash2 } from './icons'
import { alignToLot, pickTower, toggleMode, useTowerEdit } from '../lib/towerEdit'
import { useTowerPosition } from '../lib/towerPosition'
import { useStore } from '../store'

type IconC = ComponentType<{ size?: number; 'aria-hidden'?: boolean }>
function RailButton({ icon: I, label, hint, keys, active = false, disabled = false, danger = false, onClick }: {
  icon: IconC; label: string; hint?: string; keys?: string; active?: boolean; disabled?: boolean; danger?: boolean; onClick: () => void
}) {
  const tip = `${label}${keys ? ` (${keys})` : ''}${hint ? `: ${hint}` : ''}`
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={label} aria-pressed={active} aria-keyshortcuts={keys} title={tip}
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-35 ${
        active ? 'bg-ink text-white' : danger ? 'text-ink hover:bg-error-surface hover:text-error' : 'text-ink hover:bg-subtle'}`}>
      <I size={18} aria-hidden />
    </button>
  )
}
const Sep = () => <span aria-hidden className="my-1 h-px w-7 shrink-0 bg-line" />

export default function TowerRail() {
  const towers = useStore((s) => s.towers[s.project])
  const selected = useStore((s) => s.selectedTower)
  const placing = useStore((s) => s.placing)
  const present = useStore((s) => s.phase === 'present')
  const { picked, move, rotate } = useTowerEdit()
  const id = picked ?? (towers.some((t) => t.id === selected) ? selected : towers[0]?.id) ?? null
  const name = towers.find((t) => t.id === id)?.name ?? 'the tower'
  const none = !id || present
  const lockHint = present ? 'the model is locked in Present; go back to Form or Schematic' : !id ? 'place a tower first' : undefined
  const moving = !!picked && move, turning = !!picked && rotate
  const mode = (m: 'move' | 'rotate') => { if (!id) return; useStore.getState().set({ placing: false }); pickTower(id); toggleMode(m) }
  const select = () => { useStore.getState().set({ placing: false }); if (moving) toggleMode('move'); if (turning) toggleMode('rotate') }
  return (
    <nav aria-label="Tower tools" data-testid="tower-rail" className="flex w-12 shrink-0 flex-col items-center gap-1 border-r border-line py-2">
      <RailButton icon={MousePointer} label="Select" hint="click a tower to pick it" active={!placing && !moving && !turning} onClick={select} />
      <RailButton icon={Plus} label="Place a tower" keys="P" hint={present ? lockHint : 'click on the site where it should stand'} active={placing} disabled={present}
        onClick={() => useStore.getState().set({ placing: !placing })} />
      <Sep />
      <RailButton icon={Move} label={`Move ${name}`} keys="M" hint={lockHint ?? 'drag it in the view, or type x and y'} active={moving} disabled={none} onClick={() => mode('move')} />
      <RailButton icon={RotateCw} label={`Rotate ${name}`} keys="R" hint={lockHint ?? 'drag round it in the view, or type the turn'} active={turning} disabled={none} onClick={() => mode('rotate')} />
      <RailButton icon={LandPlot} label={`Align ${name} to the lot`} keys="L" hint={lockHint ?? 'turns it square to the lot it stands on'} disabled={none} onClick={() => id && alignToLot(id)} />
      <Sep />
      <RailButton icon={ScanLine} label="Frame the site and the tower" hint="the view frames them again" disabled={!id} onClick={() => { if (id) pickTower(id); useTowerPosition.setState((s) => ({ frame: s.frame + 1 })) }} />
      <Sep />
      <RailButton icon={Trash2} label={`Delete ${name}`} hint={lockHint ?? 'Undo in the project bar brings it back'} danger disabled={none} onClick={() => id && useStore.getState().removeTower(id)} />
    </nav>
  )
}
