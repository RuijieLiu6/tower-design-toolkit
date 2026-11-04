// Height suggestion for the selected tower (after Vista v37 view-height-suggestion-ui.js, Ruijie Liu): the tallest
// stack that clears every view-cone surface over each block (0.1 m clearance) and the zoning number, naming what
// controls it. Adjust scales every block together (one undo step); Dismiss keeps the design; Undo restores the blocks.
import { useState } from 'react'
import { blocksOf } from '../../engine/blocks'
import type { Block } from '../../engine/types'
import { breakStep } from '../../lib/project/history'
import { useStore, useTowers } from '../../store'
import { FlagChip } from '../ui'
import { U } from '../Units'
import { useTowerHeights } from '../useHeights'

const m = (v: number) => `${v.toFixed(1)} m`

export default function HeightTool() {
  const towers = useTowers()
  const sel = useStore((s) => s.selectedTower)
  const t = towers.find((k) => k.id === sel) ?? towers[0]
  const { heights, error, loading } = useTowerHeights(t)
  const [dismissed, setDismissed] = useState<string | null>(null)
  const [undo, setUndo] = useState<{ id: string; blocks: Block[]; from: number; to: number } | null>(null)
  if (!t) return <p className="text-[11px] text-muted">Add a tower to see its height suggestion.</p>
  if (error) return <p className="text-[11px] text-flag-unresolved">Height references did not load: {error}</p>
  if (loading || !heights) return <p className="text-[11px] text-muted">Loading the zoning references and cone surfaces…</p>
  const s = heights.stack
  const key = `${t.id}:${s?.maxHeightM?.toFixed(2)}:${s?.currentHeightM.toFixed(2)}`
  const details = () => useStore.getState().selectNode('built.heights')

  const adjust = () => {
    if (!s?.scale || s.scale >= 1) return
    const before = blocksOf(t)
    const after = before.map((b) => ({ ...b, height: b.height * (s.scale as number) }))
    breakStep(); useStore.getState().updateTower(t.id, { blocks: after }); breakStep()
    setUndo({ id: t.id, blocks: before, from: s.currentHeightM, to: s.maxHeightM as number })
  }
  const restore = () => {
    if (!undo) return
    breakStep(); useStore.getState().updateTower(undo.id, { blocks: undo.blocks }); breakStep()
    setUndo(null)
  }

  return (
    <div className="space-y-1.5 text-[11px] text-slate-600">
      {/* The banner goes once the app's own undo (Ctrl+Z) or an edit has moved the tower off the adjusted height. */}
      {undo && undo.id === t.id && s && Math.abs(s.currentHeightM - undo.to) < 0.01 && (
        <div className="flex items-center justify-between gap-2 rounded border border-line bg-slate-50 px-1.5 py-1">
          <span>Blocks scaled from <U>{m(undo.from)}</U> to <U>{m(undo.to)}</U>.</span>
          <button type="button" className="rounded border border-line bg-white px-1.5 py-0.5 text-ink hover:bg-slate-50" onClick={restore}>Undo</button>
        </div>
      )}
      {!s || s.status === 'none' ? (
        <p>{s?.notes[0] ?? 'No zoning number and no view cone over this tower: nothing to suggest.'}</p>
      ) : s.status === 'unsupported' || s.status === 'no_positive_height' ? (
        <p>{s.notes[0]}</p>
      ) : dismissed === key ? (
        <p className="flex items-center justify-between gap-2">Suggestion dismissed; your dimensions are kept.
          <button type="button" className="text-accent underline" onClick={() => setDismissed(null)}>Show</button></p>
      ) : (
        <div className="space-y-1 rounded border border-line px-1.5 py-1">
          <div className="flex items-baseline justify-between gap-2">
            <span>Tower <b className="text-ink"><U>{m(s.currentHeightM)}</U></b></span>
            <span>{s.status === 'partial' ? 'Cones allow' : 'Suggested'} up to <b className="text-ink"><U>{m(s.maxHeightM as number)}</U></b></span>
          </div>
          {s.controlling && (
            <div className="flex flex-wrap items-center gap-1">
              Set by {s.controlling.label}{s.controlPart && s.controlPart !== 'whole tower' ? ` over block ${s.controlPart}` : ''} <FlagChip flag={s.controlling.flag} />
            </div>
          )}
          {s.notes.map((n) => <div key={n} className={/assumption|no zoning/i.test(n) ? 'text-flag-unresolved' : 'text-slate-500'}>{n}</div>)}
          <div className="flex flex-wrap gap-1 pt-0.5">
            {s.intrusion ? (
              <button type="button" onClick={adjust} className="rounded border border-accent bg-accent/10 px-1.5 py-0.5 font-medium text-ink hover:bg-accent/20">Adjust to <U>{m(s.maxHeightM as number)}</U></button>
            ) : (
              <span className="rounded bg-slate-50 px-1.5 py-0.5">Clears by <U>{m((s.maxHeightM as number) - s.currentHeightM)}</U></span>
            )}
            <button type="button" onClick={() => setDismissed(key)} className="rounded border border-line bg-white px-1.5 py-0.5 text-ink hover:bg-slate-50">Dismiss</button>
            <button type="button" onClick={details} className="rounded border border-line bg-white px-1.5 py-0.5 text-ink hover:bg-slate-50">Details</button>
          </div>
        </div>
      )}
      <p className="text-[10px] text-slate-500">A study height after Vista (Ruijie Liu), not a City height entitlement. Zoning numbers are Vista's by-law transcriptions (unverified); study surfaces are assumptions.</p>
    </div>
  )
}
