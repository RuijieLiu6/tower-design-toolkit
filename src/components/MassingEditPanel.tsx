// The Massing tool's part of Sinnie Choi's Downtown Massing Tool (ported with her permission, 6 Nov 2026; Ruijie:
// "incorporate Sinnie's developed tool … match the functions to the Massing tool"): editing on the model (Face / Mass,
// the locked view, adding blocks; components/MassingEdit3D.tsx does the 3D side) and her generator, folded below.
import { lazy, Suspense, useEffect, useState } from 'react'
import { Crosshair, Lock, Move, Plus, ScanLine, Sparkles, Unlock } from './icons'
import { addBlockAbove, useBlockEdit, type EditMode } from '../lib/blockEdit'
import { blockSpans } from '../engine/blocks'
import { blocksOf } from '../engine/massing'
import type { Tower } from '../engine/types'
import { useGenerate } from '../lib/generateStore'
import { useStore } from '../store'
import Help from './Help'
import IconTile from './IconTile'

const GenerateTool = lazy(() => import('./generate/GenerateTool'))
const newId = () => `b${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`

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

/**
 * Face / Mass, the locked view and Add block, for a box tower: icon tiles with a word (what each does on hover), and the
 * tower's blocks as a small elevation to pick from (Ruijie, 6 Nov: information as graphics and icons, not sentences).
 */
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
  return (
    <section aria-labelledby="massing-edit-head" data-testid="massing-edit" className="grid gap-1.5 rounded-md border border-accent/30 bg-accent/[0.04] p-2">
      <h4 id="massing-edit-head" className="flex items-center gap-1.5 text-[11px] font-semibold text-ink">
        Edit on the model
        <Help label="About editing on the model">
          After Sinnie Choi's Downtown Massing Tool. The view stays framed on the tower at one scale (zoom and pan locked;
          drag empty space to orbit around it). Face: drag a face to push or pull it, the roof in whole storeys. Mass: drag a
          block to move it on its floor. Steps of 0.5 m that line up with the other blocks' faces; hold Alt for none. Each
          drag is one undo step, Esc cancels it, and the numbers below stay editable. F switches Face and Mass.
        </Help>
      </h4>
      <div className="flex flex-wrap items-start gap-0.5">
        <div role="radiogroup" aria-label="What a drag on the model does" className="flex gap-0.5">
          {MODES.map((x) => (
            <IconTile key={x.id} size="sm" role="radio" aria-checked={mode === x.id} active={mode === x.id} icon={x.id === 'face' ? Crosshair : Move}
              word={x.label} label={`${x.label}: ${x.id === 'face' ? 'push or pull a face' : 'move a block'}`} hint={`${x.hint} Key: F.`}
              onClick={() => useBlockEdit.setState({ mode: x.id, hover: null })} />
          ))}
        </div>
        <span aria-hidden className="mx-0.5 self-stretch border-l border-line" />
        <IconTile size="sm" icon={locked ? Lock : Unlock} word={locked ? 'Locked' : 'Free'} label={locked ? 'Unlock the view' : 'Lock the view on the tower'} active={locked} aria-pressed={locked} data-testid="massing-lock"
          hint={locked ? 'The view is framed on the tower at one scale; zoom and pan are off. Click to move freely.' : 'Frame the view on the tower and lock its scale.'}
          onClick={() => useBlockEdit.setState({ locked: !locked })} />
        <IconTile size="sm" icon={ScanLine} word="Frame" label="Frame the tower again" hint="The view frames the tower again, at the fixed scale."
          onClick={() => useBlockEdit.setState((s) => ({ locked: true, frame: s.frame + 1 }))} />
        <IconTile size="sm" icon={Plus} word="Add" label={`Add a block${pickedBlock ? ` on ${label(at)}` : ''}`} data-testid="massing-add-block"
          hint="A new block, three storeys, on top of the picked block with its footprint; the blocks above are lifted." onClick={add} />
      </div>
      <BlockStack t={t} picked={picked} label={label} />
    </section>
  )
}

/** The tower's blocks as a small elevation (widths and heights to scale): the picked one lit; a click picks a block. */
function BlockStack({ t, picked, label }: { t: Tower; picked: string | null; label: (i: number) => string }) {
  const spans = blockSpans(t)
  if (!spans.length) return null
  const top = Math.max(...spans.map((s) => s.z1)), H = 84, W = 220
  const half = Math.max(...spans.map((s) => Math.abs(s.block.dx) + s.block.width / 2))
  const k = Math.min((H - 6) / Math.max(1, top), (W / 2 - 4) / Math.max(1, half))
  return (
    <figure className="m-0 flex items-end gap-2" aria-label="Blocks, picked one lit">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-[84px] w-[220px] shrink-0" role="group" aria-label="The tower's blocks: pick one">
        <line x1={0} x2={W} y1={H - 2} y2={H - 2} stroke="currentColor" className="text-line" />
        {spans.map((s, i) => {
          const on = s.block.id === picked
          const x = W / 2 + (s.block.dx - s.block.width / 2) * k, y = H - 2 - s.z1 * k
          return (
            <rect key={s.block.id} x={x} y={y} width={Math.max(1, s.block.width * k)} height={Math.max(1, (s.z1 - s.z0) * k)} rx={0.5}
              role="button" tabIndex={0} aria-label={`${label(i)}, ${Math.round(s.z1 - s.z0)} m`} aria-pressed={on}
              onClick={() => useBlockEdit.setState({ block: s.block.id })} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); useBlockEdit.setState({ block: s.block.id }) } }}
              className={`cursor-pointer outline-none focus-visible:stroke-[2] ${on ? 'fill-accent stroke-accent' : s.podium ? 'fill-slate-300 stroke-slate-500 hover:fill-accent/40' : 'fill-slate-200 stroke-slate-500 hover:fill-accent/40'}`} strokeWidth={0.75}>
              <title>{`${label(i)}: ${Math.round(s.block.width)} × ${Math.round(s.block.depth)} m, ${Math.round(s.z1 - s.z0)} m tall`}</title>
            </rect>
          )
        })}
      </svg>
      <figcaption className="text-[11px] text-muted">{picked && spans.some((s) => s.block.id === picked) ? <><b className="text-ink">{label(spans.findIndex((s) => s.block.id === picked))}</b> picked</> : 'Click a block, here or on the model'}</figcaption>
    </figure>
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
