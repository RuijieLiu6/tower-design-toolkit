// The workflow preview card (Sinnie, 12 Nov: "replace the workflow tab with what it looks like in the tower workspace"),
// after the Tower Workspace's node preview card: a header with how the checks stand (pass / near a limit / to look at)
// and an open icon, the whole workflow drawn small (one coloured square per phase on the left, every other tool as a dot
// in working order on its phase's lane, wires between them), the current phase and everything it feeds lit, then a row
// of phase dots and a one-line guide with Next. The phase's tool list and Add tool stay under it (PhasePanel).
import { useMemo } from 'react'
import { ExternalLink } from '../icons'
import { PHASE_COLOR } from '../../lib/design/tokens'
import type { PhaseId } from '../../lib/phases'
import { goToStep } from '../../lib/step'
import { returnEdges, edgeKey, type Board } from '../../lib/workflowGraph'
import { designNode, isDesignNode } from '../../lib/workflow/designNodes'
import { PHASE_IDS, PHASE_NAME, PHASE_STEP, designOf } from '../../lib/workflow/phaseTools'
import { openOverview, runOrder } from '../../lib/workflow/projectWorkflow'
import { useResults } from '../../hooks/useResults'
import { digestResults } from '../../lib/trace/digest'
import type { Info } from './WorkflowOverview'

const W = 240, H = 100, LANE = (i: number) => 12 + i * 19
const LIT = '#6f8576', CHECK = '#5f7f9c'

export default function WorkflowPreview({ board, phase, active, info, home, collapsed, onFold, onOpen }: {
  board: Board; phase: PhaseId; active: string; info: (id: string) => Info; home: (id: string) => PhaseId
  collapsed: boolean; onFold: () => void; onOpen: (id: string) => void
}) {
  const results = useResults()
  const counts = useMemo(() => {
    const lines = digestResults(results as unknown as Record<string, unknown>).lines
    return { pass: lines.filter((l) => l.state === 'pass').length, warn: lines.filter((l) => l.state === 'warn').length, fail: lines.filter((l) => l.state === 'fail').length }
  }, [results])
  const phaseOf = (id: string): PhaseId => designNode(id)?.phase ?? home(id)
  const gi = PHASE_IDS.indexOf(phase)

  const pic = useMemo(() => {
    const order = runOrder(board)
    const back = returnEdges(board.edges)
    const rest = order.filter((id) => !isDesignNode(id))
    const pos = new Map<string, [number, number]>()
    PHASE_IDS.forEach((p, i) => pos.set(designOf(p).id, [14, LANE(i)]))
    rest.forEach((id, i) => {
      const lane = PHASE_IDS.indexOf(phaseOf(id))
      pos.set(id, [44 + (rest.length > 1 ? i / (rest.length - 1) : 0.5) * (W - 58), LANE(lane) + (i % 2 ? 4 : -4)])
    })
    // the current phase and everything it feeds (forward wires only: a loop back does not light the earlier work)
    const lit = new Set(order.filter((id) => phaseOf(id) === phase))
    lit.add(designOf(phase).id)
    let grew = true
    while (grew) { grew = false; for (const e of board.edges) if (!back.has(edgeKey(e)) && lit.has(e.a) && !lit.has(e.b)) { lit.add(e.b); grew = true } }
    return { pos, rest, lit, back }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board, phase, home])

  const wire = (a: string, b: string, on: boolean, loop: boolean) => {
    const A = pic.pos.get(a), B = pic.pos.get(b)
    if (!A || !B) return null
    const mx = (A[0] + B[0]) / 2
    return <path key={`${a}>${b}`} d={`M${A[0]} ${A[1]}C${mx} ${A[1]} ${mx} ${B[1]} ${B[0]} ${B[1]}`} fill="none" stroke={on ? LIT : 'var(--color-line, #d9dee7)'} strokeWidth={on ? 1.3 : 1} strokeDasharray={loop ? '3 2' : undefined} />
  }
  const edgeOn = (a: string) => pic.lit.has(a)
  const next = PHASE_IDS[gi + 1]
  const d = designOf(phase)
  const here = pic.rest.filter((id) => phaseOf(id) === phase).length

  return (
    <div data-testid="workflow-preview" className="mx-3 mt-2 rounded-xl border border-line bg-panel p-2">
      <div className="flex items-center gap-2 px-0.5">
        <span className="flex items-center gap-2 text-meta text-muted" title="Rules that pass, are near a limit, or need a look, across the checks that ran">
          <span className="flex items-center gap-1"><i aria-hidden className="block h-2 w-2 rounded-full" style={{ background: '#2e8b57' }} />{counts.pass}<span className="sr-only"> pass</span></span>
          <span className="flex items-center gap-1"><i aria-hidden className="block h-2 w-2 rounded-full" style={{ background: '#d98b1c' }} />{counts.warn}<span className="sr-only"> near a limit</span></span>
          <span className="flex items-center gap-1"><i aria-hidden className="block h-2 w-2 rounded-full" style={{ background: '#d0453a' }} />{counts.fail}<span className="sr-only"> to look at</span></span>
        </span>
        <button type="button" onClick={() => openOverview('edit')} data-testid="phase-edit" title="Edit the workflow in the centre view: add tools from the shelf, drag, connect and loop them, then Confirm" aria-label="Edit the workflow"
          className="ml-auto flex h-6 w-6 items-center justify-center rounded-lg text-muted outline-none hover:bg-subtle hover:text-ink focus-visible:ring-2 focus-visible:ring-accent"><ExternalLink size={14} aria-hidden /></button>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="mt-1 block w-full cursor-pointer" role="img" data-testid="phase-map" onClick={() => openOverview('edit')}
        aria-label={`The workflow: ${pic.rest.length + PHASE_IDS.length} tools; ${PHASE_NAME[phase]} and what it feeds are lit. Click to edit the workflow.`}>
        {board.edges.filter((e) => !edgeOn(e.a)).map((e) => wire(e.a, e.b, false, pic.back.has(edgeKey(e))))}
        {board.edges.filter((e) => edgeOn(e.a)).map((e) => wire(e.a, e.b, true, pic.back.has(edgeKey(e))))}
        {pic.rest.map((id) => {
          const [x, y] = pic.pos.get(id)!, l = pic.lit.has(id), open = id === active
          return (
            <g key={id} data-map-node={id} data-here={phaseOf(id) === phase ? '' : undefined}
              onClick={(ev) => { ev.stopPropagation(); if (phaseOf(id) === phase) onOpen(id); else goToStep(PHASE_STEP[phaseOf(id)]) }}>
              {(l || open) && <circle cx={x} cy={y} r={open ? 7.2 : 6.4} fill="var(--color-panel, #fff)" stroke={open ? PHASE_COLOR[phase].ink : LIT} strokeWidth={1.2} />}
              <circle cx={x} cy={y} r={4} fill={id.startsWith('community.') ? '#c9a227' : CHECK} opacity={l ? 1 : 0.28}><title>{`${PHASE_NAME[phaseOf(id)]} / ${info(id).name}`}</title></circle>
            </g>
          )
        })}
        {PHASE_IDS.map((p, i) => {
          const on = p === phase, [x, y] = [14, LANE(i)]
          return (
            <g key={p} data-src={p} onClick={(ev) => { ev.stopPropagation(); goToStep(PHASE_STEP[p]) }}>
              {on && <rect x={x - 9.5} y={y - 9.5} width={19} height={19} rx={5} fill="var(--color-panel, #fff)" stroke={LIT} strokeWidth={1.4} />}
              <rect x={x - 5.5} y={y - 5.5} width={11} height={11} rx={2.5} fill={PHASE_COLOR[p].accent} opacity={on || pic.lit.has(designOf(p).id) ? 1 : 0.55}><title>{PHASE_NAME[p]}</title></rect>
            </g>
          )
        })}
      </svg>

      <div className="mt-1.5 flex items-center gap-1" role="group" aria-label="Phases">
        {PHASE_IDS.map((p, i) => (
          <button key={p} type="button" onClick={() => goToStep(PHASE_STEP[p])} aria-label={PHASE_NAME[p]} aria-current={i === gi ? 'step' : undefined} title={PHASE_NAME[p]}
            style={i === gi ? { background: 'var(--color-ink)', borderColor: 'var(--color-ink)' } : undefined}
            className={`flex h-6 w-6 items-center justify-center rounded-full border outline-none focus-visible:ring-2 focus-visible:ring-accent ${i === gi ? '' : 'border-line bg-panel hover:border-boundary'}`}>
            <i aria-hidden className="block h-2 w-2 rounded-full" style={{ background: i === gi ? '#fff' : PHASE_COLOR[p].accent, opacity: i < gi || i === gi ? 1 : 0.6 }} />
          </button>
        ))}
        <button type="button" onClick={onFold} data-testid="phase-collapse" aria-expanded={!collapsed} aria-label={collapsed ? 'Show the guide and the tools' : 'Fold the guide and the tools'}
          className="ml-auto flex h-6 w-6 items-center justify-center rounded-lg text-muted outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-accent">{collapsed ? '›' : '‹'}</button>
      </div>

      {!collapsed && (
        <>
          <p className="mt-1.5 px-0.5 text-meta leading-snug">
            <b className="text-ink">{gi + 1} · {PHASE_NAME[phase]}</b> <span className="text-muted">{d.about} {here} tool{here === 1 ? '' : 's'} here, of {pic.rest.length}.</span>
          </p>
          <div className="mt-1.5 flex items-center gap-1.5">
            <button type="button" onClick={() => openOverview('edit')} className="flex h-7 items-center rounded-lg bg-accent px-2.5 text-meta font-medium text-white outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2">Edit workflow</button>
            <button type="button" onClick={() => next && goToStep(PHASE_STEP[next])} disabled={!next} data-testid="workflow-next"
              className="flex h-7 items-center rounded-lg border border-line bg-panel px-2.5 text-meta text-ink outline-none hover:bg-subtle focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50">{next ? `Next: ${PHASE_NAME[next]} ›` : 'Last phase'}</button>
          </div>
        </>
      )}
    </div>
  )
}
