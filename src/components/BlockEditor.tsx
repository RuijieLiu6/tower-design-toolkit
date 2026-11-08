// Stacked-block massing editor (after Vista's proposal parts, Ruijie Liu): add, reorder, edit and delete the blocks of
// a parametric tower. Blocks stack bottom-up; offsets and twist are relative to the tower, which the gumball moves and
// turns as a whole. Every edit writes the block list, so an old two-field tower becomes explicit blocks on first edit.
import { ArrowDown, ArrowUp, Copy, Layers, Plus, Trash2 } from './icons'
import { blocksOf, blockSpans, towerFloors } from '../engine/massing'
import type { Block, Tower } from '../engine/types'
import { useStore } from '../store'
import { NumberField } from './ui'
import Fold from './Fold'
import { useEffect } from 'react'
import { useBlockEdit } from '../lib/blockEdit'

const newId = () => `b${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`

export default function BlockEditor({ t }: { t: Tower }) {
  const updateTower = useStore((s) => s.updateTower)
  const blocks = blocksOf(t)
  const spans = blockSpans(t)
  const floors = towerFloors(t)
  // The block picked on the model (Massing's Face / Mass editing) is highlighted here and scrolled into view.
  const picked = useBlockEdit((s) => s.block)
  useEffect(() => { if (picked) document.querySelector(`[data-block="${CSS.escape(picked)}"]`)?.scrollIntoView({ block: 'nearest' }) }, [picked])
  const set = (next: Block[]) => updateTower(t.id, { blocks: next })
  const edit = (i: number, patch: Partial<Block>) => set(blocks.map((b, k) => (k === i ? { ...b, ...patch } : b)))
  const move = (i: number, by: number) => { const j = i + by; if (j < 0 || j >= blocks.length) return; const next = [...blocks];[next[i], next[j]] = [next[j], next[i]]; set(next) }
  const remove = (i: number) => blocks.length > 1 && set(blocks.filter((_, k) => k !== i))
  const top = blocks[blocks.length - 1]
  // Setback, shift and twist split the top third of the block (in whole floors) into a new block, so the height stays
  // (the competition's height band is narrow); duplicate stacks a full copy on top of it.
  const add = (kind: 'setback' | 'shift' | 'twist' | 'copy', at = blocks.length - 1) => {
    const src = blocks[at] ?? top
    if (kind === 'copy') { set([...blocks.slice(0, at + 1), { ...src, id: newId(), podium: false, name: src.name ? `${src.name} copy` : undefined }, ...blocks.slice(at + 1)]); return }
    const h = Math.min(src.height - 3, Math.max(t.f2f, Math.round(src.height / 3 / t.f2f) * t.f2f))
    if (!(h > 0)) return
    const base: Block = { ...src, id: newId(), podium: false, name: undefined, height: h }
    const b: Block = kind === 'setback' ? { ...base, width: Math.max(8, src.width * 0.8), depth: Math.max(8, src.depth * 0.8), name: 'Setback' }
      : kind === 'shift' ? { ...base, dx: src.dx + src.width * 0.15, name: 'Shifted' }
      : { ...base, rotation: src.rotation + 15, name: 'Twisted' }
    set([...blocks.slice(0, at), { ...src, height: src.height - h }, b, ...blocks.slice(at + 1)])
  }
  const floorsIn = (i: number) => floors.filter((f) => { const m = (f.z0 + f.z1) / 2; return m >= spans[i].z0 && m < spans[i].z1 }).length
  const run = (() => { let n = 0; while (n < blocks.length && blocks[n].podium) n++; return n })()
  const btn = 'rounded p-0.5 text-muted hover:bg-black/5 hover:text-ink disabled:opacity-30'
  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 text-xs font-semibold"><Layers size={13} />Blocks <span className="font-normal text-muted">· bottom-up, offsets relative to the tower</span></div>
      </div>
      <div className="flex flex-wrap gap-1">
        {(['setback', 'shift', 'twist'] as const).map((k) => (
          <button key={k} type="button" onClick={() => add(k)} title="Splits the top third of the top block into a new block; the height stays" className="flex items-center gap-1 rounded-md border border-line px-2 py-0.5 text-meta hover:border-accent"><Plus size={11} />{k === 'setback' ? 'Set back the top' : k === 'shift' ? 'Shift the top' : 'Twist the top'}</button>
        ))}
      </div>
      {[...blocks.keys()].reverse().map((i) => {
        const b = blocks[i], s = spans[i], n = floorsIn(i)
        const podiumIgnored = !!b.podium && i >= run
        return (
          <div key={b.id} data-block={b.id} aria-current={picked === b.id || undefined} onPointerDown={() => useBlockEdit.setState({ block: b.id })}
            className={`rounded-md border p-2 ${picked === b.id ? 'border-accent ring-2 ring-accent/40' : b.podium && !podiumIgnored ? 'border-orange-200 bg-orange-50/40' : 'border-line'}`}>
            <div className="flex items-center gap-1">
              <input aria-label="Block name" value={b.name ?? ''} placeholder={b.podium ? 'Podium' : `Block ${i + 1}`} onChange={(e) => edit(i, { name: e.target.value || undefined })}
                className="w-24 min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 text-xs font-semibold hover:border-line focus:border-accent focus:outline-none" />
              <span className="whitespace-nowrap text-meta text-muted">+{s.z0.toFixed(0)}–{s.z1.toFixed(0)} m · {n} fl · {(b.width * b.depth).toFixed(0)} m²</span>
              <button type="button" className={btn} onClick={() => move(i, 1)} disabled={i === blocks.length - 1} title="Move up" aria-label="Move block up"><ArrowUp size={12} /></button>
              <button type="button" className={btn} onClick={() => move(i, -1)} disabled={i === 0} title="Move down" aria-label="Move block down"><ArrowDown size={12} /></button>
              <button type="button" className={btn} onClick={() => add('copy', i)} title="Duplicate above" aria-label="Duplicate block"><Copy size={12} /></button>
              <button type="button" className={btn} onClick={() => remove(i)} disabled={blocks.length < 2} title="Delete" aria-label="Delete block"><Trash2 size={12} /></button>
            </div>
            <div className="mt-1 grid grid-cols-3 gap-1.5">
              <NumberField label="Height" value={b.height} unit="m" step={t.f2f} onChange={(v) => edit(i, { height: Math.max(3, v) })} />
              <NumberField label="Width" value={b.width} unit="m" onChange={(v) => edit(i, { width: Math.max(3, v) })} />
              <NumberField label="Depth" value={b.depth} unit="m" onChange={(v) => edit(i, { depth: Math.max(3, v) })} />
              <NumberField label="Offset x" value={b.dx} unit="m" onChange={(v) => edit(i, { dx: v })} />
              <NumberField label="Offset y" value={b.dy} unit="m" onChange={(v) => edit(i, { dy: v })} />
              <NumberField label="Twist" value={b.rotation} unit="°" onChange={(v) => edit(i, { rotation: v })} />
            </div>
            <label className="mt-1 flex items-center gap-1.5 text-meta text-muted">
              <input type="checkbox" checked={!!b.podium} onChange={(e) => edit(i, { podium: e.target.checked })} />Podium block (podium floor-to-floor and use)
              {podiumIgnored && <span className="text-amber-800">· only blocks at the bottom count as podium</span>}
            </label>
          </div>
        )
      })}
      <Fold summary="How floors meet the blocks">Floors run at the tower floor-to-floor above the podium and take the block at their mid-height, so a block height that isn’t a multiple of {t.f2f} m shares a floor with its neighbour. Every check reads the plate of the block at each level.</Fold>
    </div>
  )
}
