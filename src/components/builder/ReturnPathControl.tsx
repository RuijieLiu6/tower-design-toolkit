// Return paths in the workflow builder (Result A brief §7: "Provide a contextual action such as 'Return to…'. Let the
// user select a destination activity. Display a restrained return arrow or labeled relationship"). A return path is a
// route for revisiting work, never an instruction to run anything again. Three pieces, all drawn from the saved board:
//   ReturnChooser  the popover under a card's "Return to…": the earlier cards in the run (lib/workflow/projectWorkflow.ts
//                  wouldLoop), one button each; the pick is committed by the sequence as connect(from, to).
//   ReturnChips    "↻ Return to <name>" on the source card, with a remove button (disconnect by the wire's key).
//   arcPath        the dashed arc over the row, one per return (WorkflowSequence draws them, by ReturnPath.level).
// Every button is a real <button>; Esc closes the chooser; nothing here commits a change itself.
import { useEffect, useRef } from 'react'
import { X } from '../icons'
import { edgeKey, walk, type Board } from '../../lib/workflowGraph'
import { wouldLoop } from '../../lib/workflow/projectWorkflow'

/** The cards a return path from `from` may go to: earlier in the run (or the first card), not itself, not already linked. */
export function returnTargets(b: Board, from: string): string[] {
  return walk(b.edges).filter((id) => id !== from && wouldLoop(b, from, id) && !b.edges.some((e) => e.a === from && e.b === id))
}

/** The key of the return wire from → to (what disconnect takes). */
export const returnKey = (from: string, to: string) => edgeKey({ a: from, b: to })

/**
 * A dashed arc above the row from the source card's top (x1, y1) to the target's (x2, y2): `level` (1 = the lowest)
 * lifts overlapping loops apart. The cubic's peak sits about three quarters of the lift above the higher top.
 */
export function arcPath(x1: number, y1: number, x2: number, y2: number, level: number): string {
  const lift = arcLift(level), top = Math.min(y1, y2) - lift
  return `M${x1},${y1} C${x1},${top} ${x2},${top} ${x2},${y2}`
}
export const arcLift = (level: number) => 24 + Math.max(0, level - 1) * 14
/** The space the arcs need above the row, for `levels` stacked returns (0 when there is no return path). */
export const arcSpace = (levels: number) => (levels ? Math.ceil(arcLift(levels) * 0.75) + 10 : 0)

/** The chooser: earlier cards as destinations, newest step first (the one just before the source is the likeliest). */
export function ReturnChooser({ from, board, name, onPick, onClose }: {
  from: string; board: Board; name: (id: string) => string; onPick: (to: string) => void; onClose: () => void
}) {
  const box = useRef<HTMLDivElement>(null)
  const close = useRef(onClose)
  close.current = onClose
  const targets = returnTargets(board, from).reverse()
  // the first destination takes the focus once, when the chooser opens; a click elsewhere closes it
  useEffect(() => {
    box.current?.querySelector<HTMLElement>('[data-testid^="return-to-"]')?.focus({ preventScroll: true })
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) close.current() }
    window.addEventListener('pointerdown', away, true)
    return () => window.removeEventListener('pointerdown', away, true)
  }, [])
  return (
    <div ref={box} role="dialog" aria-label={`Return from ${name(from)} to an earlier step`} data-testid="return-chooser"
      onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }}
      className="absolute left-2 right-2 top-full z-30 mt-1 grid gap-0.5 rounded-xl border border-line bg-panel p-1.5 shadow-float">
      <div className="flex items-center gap-1 px-1 pb-1">
        <span className="text-meta font-semibold text-ink">Return to…</span>
        <span className="text-meta text-muted">an earlier step</span>
        <button type="button" onClick={onClose} aria-label="Close" className="ml-auto rounded-lg p-0.5 text-muted outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-accent"><X size={12} aria-hidden /></button>
      </div>
      {targets.map((id) => (
        <button key={id} type="button" data-testid={`return-to-${id}`} onClick={() => onPick(id)}
          className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-left text-control text-ink outline-none hover:bg-subtle focus-visible:ring-2 focus-visible:ring-accent">
          <span aria-hidden className="text-muted">↻</span><span className="min-w-0 truncate">{name(id)}</span>
        </button>
      ))}
      {!targets.length && <p className="px-2 py-1 text-meta text-muted">No earlier step to return to.</p>}
    </div>
  )
}

/** "↻ Return to <name>" chips on the source card, each with its remove button. */
export function ReturnChips({ from, to, name, selected, onRemove }: {
  from: string; to: string[]; name: (id: string) => string; selected: boolean; onRemove: (to: string) => void
}) {
  if (!to.length) return null
  return (
    <ul className="flex flex-wrap gap-1" aria-label="Return paths">
      {to.map((t) => (
        <li key={t} data-testid={`return-chip-${from}-${t}`} className={`flex max-w-full items-center gap-0.5 rounded-lg py-0.5 pl-1.5 pr-0.5 text-meta ${selected ? 'bg-selected text-accent-hover' : 'bg-subtle text-ink'}`}>
          <span aria-hidden>↻</span><span className="min-w-0 truncate">Return to {name(t)}</span>
          <button type="button" data-testid={`return-remove-${from}-${t}`} onClick={() => onRemove(t)} aria-label={`Remove the return from ${name(from)} to ${name(t)}`} title="Remove this return path"
            className="rounded p-0.5 text-muted outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-accent"><X size={11} aria-hidden /></button>
        </li>
      ))}
    </ul>
  )
}
