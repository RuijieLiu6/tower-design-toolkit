// Grouped cards in the workflow builder (Result A brief §7: "Preserve existing branches. Use a structured branch group
// … Do not show a misleading single line if the actual workflow has several paths"). A branch group sits under the
// column it hangs from: a thin connector in the column's phase colour, the word "Branch", the branch cards. The
// unwired group holds the cards Start cannot reach ("Not connected"), kept on the board, never dropped. Both only
// arrange cards the sequence gives them; the words are the view model's.
import type { ReactNode } from 'react'
import { PHASE_COLOR } from '../../lib/design/tokens'
import type { PhaseId } from '../../lib/phases'

export default function WorkflowBranchGroup({ col, phase, children }: { col: number; phase: PhaseId; children: ReactNode }) {
  return (
    <div data-testid={`branch-group-${col}`} role="group" aria-label="Branch" className="flex flex-col items-center">
      <span aria-hidden className="h-4 w-0.5 rounded-full" style={{ background: PHASE_COLOR[phase].accent }} />
      <span className="mb-1 flex items-center gap-1 text-meta font-medium" style={{ color: PHASE_COLOR[phase].ink }}>
        <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: PHASE_COLOR[phase].accent }} />Branch
      </span>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  )
}

/** Cards not reachable from Start: shown, labelled, with the way back into the sequence. */
export function UnwiredGroup({ children, count }: { children: ReactNode; count: number }) {
  if (!count) return null
  return (
    <section data-testid="unwired-group" aria-label="Not connected" className="mx-3 mb-2 rounded-xl border border-dashed border-boundary bg-canvas px-3 py-2">
      <p className="mb-2 flex flex-wrap items-baseline gap-x-2 text-control">
        <span className="font-semibold text-ink">Not connected</span>
        <span className="text-meta text-muted">{count === 1 ? 'This tool is' : `These ${count} tools are`} on the board but not in the sequence. Connect it from a card's menu or move it into the sequence.</span>
      </p>
      <div className="flex flex-wrap gap-3">{children}</div>
    </section>
  )
}
