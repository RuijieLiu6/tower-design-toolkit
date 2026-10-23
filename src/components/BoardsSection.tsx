// Present panel summary of the four boards, and the door into the board composer (research P13-M01 / M06).
import { LayoutGrid } from 'lucide-react'
import { DELIVERABLES, boardChecks, coverage, deadlineInfo, isBoardUsed } from '../engine/boards'
import { useBoardStore } from '../lib/boardStore'
import BoardComposer from './boards/BoardComposer'
import { FlagChip, Section } from './ui'

export default function BoardsSection() {
  const { boards, images, denyList, exports, setOpen } = useBoardStore()
  const used = boards.filter(isBoardUsed).length
  const cov = coverage(boards)
  const met = DELIVERABLES.filter((d) => cov[d.id] >= d.min).length
  const fails = boards.reduce((n, b, i) => n + boardChecks(b, i + 1, { boards, images, denyList }).filter((r) => r.state === 'fail').length, 0)
  const exported = boards.filter((b) => exports[b.id]).length
  const d = deadlineInfo(Date.now())
  return (
    <Section title="Boards (VTC submission)">
      <button type="button" onClick={() => setOpen(true)} className="flex w-full items-center justify-center gap-1.5 rounded-md bg-accent px-3 py-2 text-xs font-medium text-white hover:opacity-90"><LayoutGrid size={14} />Open the board composer</button>
      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
        <dt className="text-muted">Boards with content</dt><dd className="text-right tabular-nums">{used} / 4</dd>
        <dt className="text-muted">Suggested items placed</dt><dd className="text-right tabular-nums">{met} / {DELIVERABLES.length}</dd>
        <dt className="text-muted">Checks failing</dt><dd className={`text-right tabular-nums ${fails ? 'text-red-700' : ''}`}>{fails}</dd>
        <dt className="text-muted">JPEGs exported</dt><dd className="text-right tabular-nums">{exported} / {used}</dd>
        <dt className="text-muted">Upload closes</dt><dd className="text-right tabular-nums">{d.closed ? 'closed' : `${Math.floor(d.days)} days`}</dd>
      </dl>
      <div className="mt-2 flex flex-wrap items-center gap-1"><FlagChip flag="verified" /><span className="text-[10px] text-muted">Four A2 landscape boards, ≤ 10 MB each, English, no identity (brief p.27); 30 Nov, 11:59 PM London (p.25)</span></div>
      <BoardComposer />
    </Section>
  )
}
