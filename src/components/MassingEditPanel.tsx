// The Massing tool's part of Sinnie Choi's Downtown Massing Tool (ported with her permission, 6 Nov 2026; Ruijie:
// "incorporate Sinnie's developed tool … match the functions to the Massing tool"): editing on the model (Face / Mass,
// the locked view, adding blocks; components/MassingEdit3D.tsx does the 3D side) and her generator, folded below.
import { lazy, Suspense, useEffect, useState } from 'react'
import { Crosshair, Lock, Move, Plus, Sparkles, Unlock } from './icons'
import { addBlockAbove, useBlockEdit, type EditMode } from '../lib/blockEdit'
import { blocksOf } from '../engine/massing'
import type { Tower } from '../engine/types'
import { useGenerate } from '../lib/generateStore'
import { useStore } from '../store'
import Help from './Help'

const GenerateTool = lazy(() => import('./generate/GenerateTool'))
const newId = () => `b${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`
const seg = 'flex flex-1 items-center justify-center gap-1 rounded px-2 py-1 text-xs outline-none focus-visible:ring-2 focus-visible:ring-accent'
const btn = 'flex items-center gap-1 rounded-md border border-line px-2 py-1 text-[11px] text-ink outline-none hover:border-accent focus-visible:ring-2 focus-visible:ring-accent'

/** While the Massing tool is open, the view edits the selected tower (Form step only; the 3D side checks the rest). */
export function useMassingEditSession() {
  useEffect(() => {
    useBlockEdit.setState({ on: true })
    return () => useBlockEdit.setState({ on: false, op: null, hover: null })
  }, [])
}

const MODES: { id: EditMode; label: string; hint: string }[] = [
  { id: 'face', label: 'Face', hint: 'Drag a side face to push or pull it (the opposite face stays put), or the roof to add or take away whole storeys; the blocks above ride on it.' },
  { id: 'mass', label: 'Mass', hint: 'Drag a block to move it on its floor; the blocks resting on it go with it (hold Shift to move it alone).' },
]

/** Face / Mass, the locked view and Add block, for a box tower. */
export function MassingEditCard({ t }: { t: Tower }) {
  const phase = useStore((s) => s.phase)
  const mode = useBlockEdit((s) => s.mode)
  const locked = useBlockEdit((s) => s.locked)
  const picked = useBlockEdit((s) => s.block)
  const blocks = blocksOf(t)
  const at = Math.max(0, blocks.findIndex((b) => b.id === picked))
  const pickedBlock = blocks.find((b) => b.id === picked)
  const label = (i: number) => blocks[i]?.name || (blocks[i]?.podium ? 'Podium' : `Block ${i + 1}`)
  const add = () => {
    const id = newId()
    const i = pickedBlock ? at : blocks.length - 1
    useStore.getState().updateTower(t.id, { blocks: addBlockAbove(t, i, id) })
    useBlockEdit.setState({ block: id })
  }
  if (phase !== 'basic') return null
  const m = MODES.find((x) => x.id === mode)!
  return (
    <section aria-labelledby="massing-edit-head" data-testid="massing-edit" className="grid gap-2 rounded-md border border-accent/30 bg-accent/[0.04] p-2">
      <h4 id="massing-edit-head" className="flex items-center gap-1.5 text-[11px] font-semibold text-ink">
        Edit on the model
        <Help label="About editing on the model">
          After Sinnie Choi's Downtown Massing Tool. The view stays framed on the tower at one scale (zoom and pan locked;
          drag empty space to orbit around it). Face: drag a face to push or pull it, the roof in whole storeys. Mass: drag a
          block to move it on its floor. Steps of 0.5 m that line up with the other blocks' faces; hold Alt for none. Each
          drag is one undo step, Esc cancels it, and the numbers below stay editable. F switches Face and Mass.
        </Help>
      </h4>
      <div role="radiogroup" aria-label="What a drag on the model does" className="flex gap-0.5 rounded-md border border-line bg-panel p-0.5">
        {MODES.map((x) => (
          <button key={x.id} type="button" role="radio" aria-checked={mode === x.id} onClick={() => useBlockEdit.setState({ mode: x.id, hover: null })}
            title={`${x.hint} (F)`} className={`${seg} ${mode === x.id ? 'bg-accent font-semibold text-white' : 'text-muted hover:text-ink'}`}>
            {x.id === 'face' ? <Crosshair size={12} aria-hidden /> : <Move size={12} aria-hidden />}{x.label}
          </button>
        ))}
      </div>
      <p className="text-[11px] text-muted" data-testid="massing-edit-hint">{m.hint}</p>
      <div className="flex flex-wrap gap-1">
        <button type="button" onClick={() => useBlockEdit.setState({ locked: !locked })} aria-pressed={locked} data-testid="massing-lock"
          title={locked ? 'The view is framed on the tower; zoom and pan are locked. Unlock to move freely.' : 'Frame the view on the tower and lock its scale'} className={btn}>
          {locked ? <Lock size={12} aria-hidden /> : <Unlock size={12} aria-hidden />}{locked ? 'View locked' : 'View free'}
        </button>
        <button type="button" onClick={() => useBlockEdit.setState((s) => ({ locked: true, frame: s.frame + 1 }))} className={btn} title="Frame the view on the tower again">
          <Crosshair size={12} aria-hidden />Frame the tower
        </button>
        <button type="button" onClick={add} className={btn} data-testid="massing-add-block" title="A new block, three storeys, on top of the picked block with its footprint; the blocks above are lifted">
          <Plus size={12} aria-hidden />Add block{pickedBlock ? ` on ${label(at)}` : ''}
        </button>
      </div>
      <p className="text-[11px] text-muted">{pickedBlock ? <>Picked: <b className="text-ink">{label(at)}</b> (highlighted below)</> : 'Click a block on the model to pick it.'}</p>
    </section>
  )
}

/** Sinnie Choi's generator inside Massing (opened by a placement, so its result stays in view; then it stays as the user leaves it). */
export function GenerateFold() {
  const placed = useGenerate((s) => !!s.placed)
  const [open, setOpen] = useState(placed)
  useEffect(() => { if (placed) setOpen(true) }, [placed])
  return (
    <details open={open} onToggle={(e) => setOpen(e.currentTarget.open)} className="group border-b border-line px-4 py-3 last:border-b-0" data-testid="massing-generate">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[11px] font-semibold text-muted outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-accent [&::-webkit-details-marker]:hidden">
        <Sparkles size={13} aria-hidden className="text-accent" />Generate a massing from a brief
        <span className="font-normal">· Sinnie Choi's Downtown Massing Tool</span>
      </summary>
      <Suspense fallback={<p className="py-2 text-[11px] text-muted">Loading the generator…</p>}>
        <div className="-mx-3"><GenerateTool /></div>
      </Suspense>
    </details>
  )
}
