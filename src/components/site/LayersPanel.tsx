// The masses as layers (16 Nov, Sinnie: "transform this as a layer panel, similar to illustrator where you can turn on
// off layers or delete them, each mass should have sublayers, which are the floors (users can assign programming
// type)"). Each mass is a layer: the arrow opens its floors, the eye hides or shows it in the view (lib/hiddenTowers:
// hiding never changes a result), double-click renames, the bin deletes it (Undo brings it back). Its sublayers are the
// floors, top floor first, each with its use: pick a use on a floor, or click a floor and Shift-click another to pick
// a run of floors and set them all at once (Tower.floorUses, read by every check through engine/massing towerFloors).
import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Eye, EyeOff, Layers, Trash2 } from '../icons'
import { towerFloors } from '../../engine/massing'
import { USES, type Tower, type UseId } from '../../engine/types'
import { breakStep } from '../../lib/project/history'
import { useHiddenTowers } from '../../lib/hiddenTowers'
import { seenTower, useTowerAdds } from '../../lib/towerAdds'
import { useStore, useTowers } from '../../store'

const USE_IDS = Object.keys(USES) as UseId[]
const iconBtn = 'flex h-6 w-6 shrink-0 items-center justify-center rounded outline-none focus-visible:ring-2 focus-visible:ring-accent'

function setUses(t: Tower, levels: number[], use: UseId) {
  breakStep()
  const next = { ...(t.floorUses ?? {}) }
  for (const l of levels) next[l] = use
  useStore.getState().updateTower(t.id, { floorUses: next })
  breakStep()
}

export default function LayersPanel() {
  const towers = useTowers()
  const selected = useStore((s) => s.selectedTower)
  const hidden = useHiddenTowers((s) => s.hidden)
  const added = useTowerAdds((s) => s.added)
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [renaming, setRenaming] = useState<string | null>(null)
  return (
    <section aria-labelledby="layers-title" data-testid="site-towers" className="mx-3 mb-3 rounded-lg border border-line bg-white text-meta">
      <h3 id="layers-title" className="flex items-center gap-1.5 border-b border-line px-3 py-2 text-xs font-semibold text-ink">
        <Layers size={14} className="text-accent" aria-hidden />Layers<span className="font-normal text-muted">({towers.length})</span>
      </h3>
      {towers.length === 0 && <p data-testid="site-towers-empty" className="px-3 py-2 text-muted">No mass yet.</p>}
      <ul role="tree" aria-label="Masses and their floors" data-testid="layers-panel">
        {towers.map((t) => {
          const isOpen = !!open[t.id], off = !!hidden[t.id], isSel = t.id === selected
          return (
            <li key={t.id} role="treeitem" aria-expanded={isOpen} aria-selected={isSel} data-testid="site-tower" data-layer={t.id} className="border-b border-line last:border-b-0">
              <div className={`flex items-center gap-1 px-1.5 py-1 ${isSel ? 'bg-accent/[0.08]' : 'hover:bg-black/[0.03]'}`}>
                <button type="button" className={`${iconBtn} text-muted hover:text-ink`} aria-label={isOpen ? `Close the floors of ${t.name}` : `Open the floors of ${t.name}`} data-layer-open
                  onClick={() => setOpen((o) => ({ ...o, [t.id]: !o[t.id] }))}>{isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}</button>
                <button type="button" className={`${iconBtn} ${off ? 'text-muted' : 'text-ink'} hover:bg-black/5`} aria-pressed={!off} aria-label={off ? `Show ${t.name}` : `Hide ${t.name}`} title={off ? 'Show' : 'Hide'} data-layer-eye
                  onClick={() => useHiddenTowers.getState().toggle(t.id)}>{off ? <EyeOff size={13} /> : <Eye size={13} />}</button>
                <span aria-hidden className="h-3 w-3 shrink-0 rounded-sm border border-black/10" style={{ background: isSel ? '#1f5f8b' : '#c9d3dd' }} />
                {renaming === t.id ? (
                  <input autoFocus defaultValue={t.name} maxLength={60} aria-label="Layer name" className="min-w-0 flex-1 rounded border border-accent bg-panel px-1 py-0.5 text-xs text-ink outline-none"
                    onBlur={(e) => { const n = e.target.value.trim(); if (n && n !== t.name) useStore.getState().updateTower(t.id, { name: n }); setRenaming(null) }}
                    onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); else if (e.key === 'Escape') setRenaming(null) }} />
                ) : (
                  <button type="button" className={`min-w-0 flex-1 truncate text-left text-xs outline-none focus-visible:ring-2 focus-visible:ring-accent ${off ? 'text-muted' : 'text-ink'} ${isSel ? 'font-semibold' : ''}`}
                    title="Click to select · double-click to rename" onClick={() => { useStore.getState().selectTower(t.id); seenTower(t.id) }} onDoubleClick={() => setRenaming(t.id)}>
                    {t.name}{added[t.id] && <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] font-semibold text-amber-900">New</span>}
                  </button>
                )}
                <span className="shrink-0 tabular-nums text-muted">{Math.round(t.height)} m</span>
                <button type="button" className={`${iconBtn} text-muted hover:bg-red-50 hover:text-red-700`} aria-label={`Delete ${t.name}`} title="Delete (Undo brings it back)" data-layer-delete
                  onClick={() => { breakStep(); useStore.getState().removeTower(t.id); breakStep() }}><Trash2 size={13} /></button>
              </div>
              {isOpen && <FloorLayers t={t} />}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/** A mass's floors as sublayers, top floor first: each floor's use, and a run of floors set at once. */
function FloorLayers({ t }: { t: Tower }) {
  const floors = useMemo(() => [...towerFloors(t)].reverse(), [t])
  const [sel, setSel] = useState<number[]>([])
  const [anchor, setAnchor] = useState<number | null>(null)
  const pick = (level: number, shift: boolean) => {
    if (shift && anchor !== null) { const a = Math.min(anchor, level), b = Math.max(anchor, level); setSel(floors.map((f) => f.level).filter((l) => l >= a && l <= b)) }
    else { setSel((s) => (s.length === 1 && s[0] === level ? [] : [level])); setAnchor(level) }
  }
  return (
    <div role="group" aria-label={`Floors of ${t.name}`} data-testid="floor-layers" className="border-t border-line bg-black/[0.015]">
      {sel.length > 1 && (
        <div className="flex items-center gap-1.5 px-2 py-1 text-meta">
          <span className="text-muted">{sel.length} floors</span>
          <select aria-label="Use for the selected floors" data-floors-use className="ml-auto rounded border border-line bg-panel px-1 py-0.5 text-meta" value=""
            onChange={(e) => { if (e.target.value) { setUses(t, sel, e.target.value as UseId); setSel([]) } }}>
            <option value="">Set use…</option>
            {USE_IDS.map((u) => <option key={u} value={u}>{USES[u].label}</option>)}
          </select>
        </div>
      )}
      <ul className="max-h-72 overflow-y-auto">
        {floors.map((f) => {
          const on = sel.includes(f.level)
          return (
            <li key={f.level} data-floor={f.level} className={`flex items-center gap-1.5 py-0.5 pl-8 pr-1.5 ${on ? 'bg-accent/[0.12]' : 'hover:bg-black/[0.03]'}`}>
              <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: USES[f.use].color }} />
              <button type="button" onClick={(e) => pick(f.level, e.shiftKey)} aria-pressed={on} title="Click to pick · Shift-click for a run of floors"
                className="w-14 shrink-0 text-left tabular-nums text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent">Level {f.level}</button>
              <select aria-label={`Use of level ${f.level}`} value={f.use} disabled={!!f.skyLobby} title={f.skyLobby ? 'A sky lobby keeps its use' : undefined}
                onChange={(e) => setUses(t, on && sel.length > 1 ? sel : [f.level], e.target.value as UseId)}
                className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-0.5 py-0 text-meta text-ink hover:border-line focus:border-accent">
                {USE_IDS.map((u) => <option key={u} value={u}>{USES[u].label}</option>)}
              </select>
              <span className="shrink-0 tabular-nums text-muted">{Math.round(f.area).toLocaleString('en-CA')} m²</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
