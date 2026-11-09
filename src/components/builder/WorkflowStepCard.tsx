// One activity in the workflow builder's sequence (Result A brief §4): a position marker, the approved architectural
// artwork, the tool's name, its one-line purpose, a concise truthful state, an optional real summary, Open tool and a
// contextual menu. Every word comes from the view model (lib/workflow/builderModel.ts), the store or the live digest:
// the card invents no number and no result. Selecting it changes nothing but the selection (brief §7). Moving,
// removing and return paths are asked of the sequence through callbacks, which commit them with Undo.
//   Keyboard on the card: Enter / Space select · ← → move the focus · Alt+← / Alt+→ move the tool before / after its
//   neighbour · Delete takes it off · Esc clears the selection.
import { useEffect, useRef, useState, type KeyboardEvent as RKeyboardEvent, type PointerEvent as RPointerEvent } from 'react'
import { ArrowLeft, ArrowRight, Move, MoreHorizontal, Trash2, X } from '../icons'
import { NodeTile } from '../NodeTile'
import { NodeArtwork } from '../nodeIcons/NodeArtwork'
import { PHASE_COLOR, STATUS, type StatusKind } from '../../lib/design/tokens'
import type { CardState, StepCard, ToolEntry } from '../../lib/workflow/builderModel'
import { PHASE_NAME } from '../../lib/workflow/phaseTools'
import type { Board } from '../../lib/workflowGraph'
import { ReturnChips, ReturnChooser } from './ReturnPathControl'

export const CARD_WIDTH = 208

/** The status family a card state belongs to (design system §3.3): Ready is pending-neutral, never a pass. */
export function statusOf(kind: CardState['kind']): StatusKind {
  switch (kind) {
    case 'needs-model': case 'waiting-input': case 'paused': return 'warning'
    case 'missing': case 'other-project': return 'error'
    default: return 'pending'
  }
}

export interface WorkflowStepCardProps {
  card: StepCard
  entry: ToolEntry
  state: CardState
  /** A real summary (a design step's holdings, or the live digest's line for a check); nothing when there is none. */
  summary?: string | null
  board: Board
  /** The run from Start, for Move before / after. */
  run: string[]
  name: (id: string) => string
  selected: boolean
  /** Being dragged by its handle: drawn faint, the ghost shows where it goes. */
  dragging: boolean
  reducedMotion: boolean
  /** The "Return to…" chooser is open on this card. */
  chooserOpen: boolean
  onSelect: () => void
  /** Esc with nothing open on the card: the selection is cleared. */
  onClear: () => void
  onOpen: () => void
  onMove: (where: 'before' | 'after') => void
  onRemove: () => void
  onReturnOpen: (open: boolean) => void
  onReturnTo: (to: string) => void
  onRemoveReturn: (to: string) => void
  onHandleDown: (e: RPointerEvent<HTMLButtonElement>) => void
  /** Move the keyboard focus to the previous (-1) or next (1) card. */
  onFocusMove: (dir: -1 | 1) => void
  cardRef?: (el: HTMLElement | null) => void
}

export function WorkflowStepCard(p: WorkflowStepCardProps) {
  const { card, entry, state, board, run, name, selected, dragging, reducedMotion, chooserOpen } = p
  const id = card.id
  const [menu, setMenu] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuBtn = useRef<HTMLButtonElement>(null)
  const idx = run.indexOf(id)
  const canBefore = idx > 0, canAfter = idx >= 0 && idx < run.length - 1
  const status = statusOf(state.kind)
  const phase = PHASE_COLOR[card.phase]
  const motion = reducedMotion ? '' : 'transition-[box-shadow,opacity] duration-150 ease-standard'

  // the menu: first item focused when it opens; closes on Esc, on a click elsewhere and after a pick
  useEffect(() => {
    if (!menu) return
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])')?.focus({ preventScroll: true })
    const away = (e: PointerEvent) => { if (!menuRef.current?.contains(e.target as Node) && !menuBtn.current?.contains(e.target as Node)) setMenu(false) }
    window.addEventListener('pointerdown', away, true)
    return () => window.removeEventListener('pointerdown', away, true)
  }, [menu])
  const closeMenu = (back = true) => { setMenu(false); if (back) menuBtn.current?.focus({ preventScroll: true }) }

  const onKey = (e: RKeyboardEvent<HTMLElement>) => {
    const t = e.target as HTMLElement
    // keys typed into the menu, the chooser, a chip's button or any control inside stay theirs; the card itself and its handle answer
    const own = t === e.currentTarget || t.dataset.cardHandle !== undefined
    if (e.key === 'Escape') { e.stopPropagation(); if (menu) { closeMenu(); return } if (chooserOpen) { p.onReturnOpen(false); return } p.onClear(); return }
    if (!own) return
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); p.onSelect(); return }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault()
      const dir = e.key === 'ArrowLeft' ? -1 : 1
      if (e.altKey) { if (dir < 0 ? canBefore : canAfter) p.onMove(dir < 0 ? 'before' : 'after') } else p.onFocusMove(dir)
      return
    }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); p.onRemove() }
  }

  const laneWord = card.lane === 'unwired' ? 'not connected' : card.lane === 'branch' ? 'on a branch' : `step ${card.index}`
  const menuItem = 'flex w-full items-center gap-1.5 rounded-lg px-2 py-1 text-left text-control text-ink outline-none hover:bg-subtle focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40 disabled:hover:bg-transparent'
  return (
    <article ref={p.cardRef} data-testid={`card-${id}`} data-card={id} data-lane={card.lane} data-phase={card.phase} data-state={state.kind}
      aria-current={selected ? 'true' : undefined} data-selected={selected ? '' : undefined} aria-label={`${entry.name}, ${PHASE_NAME[card.phase]}, ${laneWord}: ${state.word}`} tabIndex={0}
      // A click on the card selects it, unless it was on one of its own controls (the builder itself is a dialog, so
      // the control must be inside this card for the click to be skipped).
      onClick={(e) => { const hit = (e.target as HTMLElement).closest('button, select, input, a, [role="menu"]'); if (!hit || !e.currentTarget.contains(hit)) p.onSelect() }}
      onKeyDown={onKey}
      className={`group relative flex shrink-0 flex-col gap-2 rounded-xl border border-line bg-panel p-3 text-left shadow-sm outline-none ${motion} ${selected ? 'ring-2 ring-accent' : 'hover:shadow-tile'} focus-visible:ring-2 focus-visible:ring-accent ${dragging ? 'opacity-40' : ''} ${card.lane === 'unwired' ? 'border-dashed border-boundary' : ''}`}
      style={{ width: CARD_WIDTH }}>
      {/* the top: where it stands, which phase it belongs to, and the handle to move it */}
      <div className="flex items-center gap-1.5">
        <span data-testid={`card-index-${id}`} data-num className="flex h-5 min-w-5 items-center justify-center rounded-full bg-subtle px-1 text-meta font-semibold tabular-nums text-ink" aria-hidden>{card.index ?? '—'}</span>
        <span data-testid={`card-phase-${id}`} className="flex min-w-0 items-center gap-1 text-meta font-medium" style={{ color: phase.ink }} title={`${PHASE_NAME[card.phase]} phase`}>
          <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: phase.accent }} />
          <span className="truncate">{PHASE_NAME[card.phase]}</span>
        </span>
        <button type="button" data-testid={`card-handle-${id}`} data-card-handle="" onPointerDown={p.onHandleDown} onClick={(e) => e.stopPropagation()}
          aria-label={`Drag to move ${entry.name}`} title="Drag to a gap between cards; or Alt+← / Alt+→ on the card" aria-keyshortcuts="Alt+ArrowLeft Alt+ArrowRight"
          className="ml-auto flex h-6 w-6 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg text-muted outline-none hover:bg-subtle hover:text-ink focus-visible:ring-2 focus-visible:ring-accent active:cursor-grabbing"><Move size={14} aria-hidden /></button>
      </div>
      {/* the artwork: the approved illustration on one quiet area, the same for every card */}
      <div className="flex h-24 items-center justify-center rounded-lg bg-subtle">
        <NodeTile id={id} size={72} state={state.kind === 'missing' || state.kind === 'other-project' ? 'off' : 'on'} art={<NodeArtwork id={id} size={64} category={entry.category} muted={state.kind === 'missing'} />} />
      </div>
      <div className="min-h-0">
        <h3 data-testid={`card-name-${id}`} className="line-clamp-2 text-node font-semibold text-ink" title={entry.name}>{entry.name}</h3>
        <p className="line-clamp-2 text-meta text-muted" title={entry.purpose}>{entry.purpose}</p>
      </div>
      {/* the state, always a symbol and a word; the reason on hover (progressive disclosure) */}
      <p data-testid={`card-state-${id}`} data-state={state.kind} className="flex items-center gap-1.5 text-meta font-medium" style={{ color: STATUS[status].fg }} title={state.detail}>
        <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: STATUS[status].fg }} />{state.word}
        {entry.availability === 'preview' && <span className="ml-auto rounded-full bg-subtle px-1.5 text-meta font-normal text-muted">preview</span>}
      </p>
      {p.summary && <p data-testid={`card-summary-${id}`} className="truncate text-meta text-ink" title={p.summary}>{p.summary}</p>}
      {/* every wire shown: returns as chips (and arcs over the row), forward wires leaving the main path as "also →" */}
      <ReturnChips from={id} to={card.returnsTo} name={name} selected={selected} onRemove={p.onRemoveReturn} />
      {card.branchesTo.length > 0 && (
        <ul className="flex flex-wrap gap-1" aria-label="Also leads to">
          {card.branchesTo.map((b) => <li key={b} data-testid={`branch-chip-${id}-${b}`} className="max-w-full truncate rounded-lg bg-subtle px-1.5 py-0.5 text-meta text-ink" title={`A second route: ${entry.name} also leads to ${name(b)}`}>also → {name(b)}</li>)}
        </ul>
      )}
      {card.returnedFrom.length > 0 && <p className="text-meta text-muted" title={`${card.returnedFrom.map(name).join(', ')} return${card.returnedFrom.length > 1 ? '' : 's'} here`}>↩ {card.returnedFrom.length === 1 ? `${name(card.returnedFrom[0])} returns here` : `${card.returnedFrom.length} steps return here`}</p>}
      {/* the actions */}
      <div className="relative mt-auto flex items-center gap-1 pt-1">
        <button type="button" data-testid={`card-open-${id}`} onClick={p.onOpen} disabled={state.kind === 'missing'} title={state.kind === 'missing' ? 'Not installed: import its package first (see the inspector)' : `Open ${entry.name} in the workspace; the builder keeps your changes`}
          className="disabled:opacity-40 flex h-8 flex-1 items-center justify-center rounded-lg bg-accent px-2 text-control text-white outline-none hover:bg-accent-hover focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2">Open tool</button>
        <button ref={menuBtn} type="button" data-testid={`card-menu-${id}`} onClick={() => setMenu(!menu)} aria-haspopup="menu" aria-expanded={menu} aria-label={`More actions for ${entry.name}`}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-line bg-panel text-ink outline-none hover:border-boundary focus-visible:ring-2 focus-visible:ring-accent"><MoreHorizontal size={16} aria-hidden /></button>
        {menu && (
          <div ref={menuRef} role="menu" aria-label={`Actions for ${entry.name}`} onKeyDown={(e) => {
            if (e.key === 'Escape') { e.stopPropagation(); closeMenu() }
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault()
              const items = [...(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? [])]
              const i = items.indexOf(document.activeElement as HTMLElement)
              items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus()
            }
          }} className="absolute right-0 top-full z-30 mt-1 grid w-48 gap-0.5 rounded-xl border border-line bg-panel p-1.5 shadow-float">
            <button type="button" role="menuitem" data-testid="card-move-before" disabled={!canBefore} onClick={() => { closeMenu(); p.onMove('before') }} className={menuItem} title={canBefore ? `Before ${name(run[idx - 1])}` : card.lane === 'unwired' ? 'Not in the sequence: drag it into a gap' : 'Already first'}><ArrowLeft size={13} aria-hidden />Move before</button>
            <button type="button" role="menuitem" data-testid="card-move-after" disabled={!canAfter} onClick={() => { closeMenu(); p.onMove('after') }} className={menuItem} title={canAfter ? `After ${name(run[idx + 1])}` : card.lane === 'unwired' ? 'Not in the sequence: drag it into a gap' : 'Already last'}><ArrowRight size={13} aria-hidden />Move after</button>
            <button type="button" role="menuitem" data-testid="card-return" disabled={idx < 0} onClick={() => { closeMenu(false); p.onReturnOpen(true) }} className={menuItem} title="A route back to an earlier step, for revisiting work; nothing runs on its own"><span aria-hidden className="w-[13px] text-center">↻</span>Return to…</button>
            <button type="button" role="menuitem" data-testid="card-remove" onClick={() => { closeMenu(false); p.onRemove() }} className={`${menuItem} text-error`} title="Takes it off the workflow; its results and your model stay, and Undo brings it back"><Trash2 size={13} aria-hidden />Remove</button>
            <button type="button" role="menuitem" onClick={() => closeMenu()} className={`${menuItem} text-muted`}><X size={13} aria-hidden />Close</button>
          </div>
        )}
      </div>
      {chooserOpen && <ReturnChooser from={id} board={board} name={name} onPick={(to) => { p.onReturnOpen(false); p.onReturnTo(to) }} onClose={() => p.onReturnOpen(false)} />}
    </article>
  )
}
