// The workflow preview card (Sinnie, 12 Nov: "replace the workflow tab with what it looks like in the tower workspace"),
// after the Tower Workspace's node preview card: a header with how the checks stand (pass / near a limit / to look at)
// and an open icon, the whole workflow drawn small as the workflow editor draws it (a band per phase, the current one
// tinted, every tool in working order on its phase's band, right-angle wires, Start and Enter), then the guide: one dot per tool in working order (12 Nov: "node preview should go through every single tool, not just the phase"), the open tool's name and question, and Back / Next from tool to tool, across phases. The phase's tool list and Add tool stay under it (PhasePanel).
import { useMemo, type ReactNode } from 'react'
import { ExternalLink } from '../icons'
import { PHASE_COLOR, UI } from '../../lib/design/tokens'
import { dockLayout } from '../../lib/workflow/dockLayout'
import type { PhaseId } from '../../lib/phases'
import { goToStep } from '../../lib/step'
import type { Board } from '../../lib/workflowGraph'
import { designNode, isDesignNode } from '../../lib/workflow/designNodes'
import { PHASE_IDS, PHASE_NAME, PHASE_STEP, designOf, usePhaseTools } from '../../lib/workflow/phaseTools'
import { openOverview, runOrder } from '../../lib/workflow/projectWorkflow'
import { useResults } from '../../hooks/useResults'
import { digestResults } from '../../lib/trace/digest'
import type { Info } from './WorkflowOverview'
import { nodeById } from '../../data/registry'
import { useStore } from '../../store'

// All five phases, Present included (Sinnie, 12 Nov: "add present back to the node preview"); the phase row is gone, so
// the card is where you move between them.
const LANES: PhaseId[] = PHASE_IDS
const W = 240, TOP = 2, BAND = 19, H = TOP + LANES.length * BAND + 1, GUT = 12, TILE = 9

export default function WorkflowPreview({ board, phase, active, info, home, collapsed, onFold, onOpen, headerExtra, children }: {
  board: Board; phase: PhaseId; active: string; info: (id: string) => Info; home: (id: string) => PhaseId
  collapsed: boolean; onFold: () => void; onOpen: (id: string) => void; headerExtra?: ReactNode; children?: ReactNode
}) {
  const results = useResults()
  const counts = useMemo(() => {
    const lines = digestResults(results as unknown as Record<string, unknown>).lines
    return { pass: lines.filter((l) => l.state === 'pass').length, warn: lines.filter((l) => l.state === 'warn').length, fail: lines.filter((l) => l.state === 'fail').length }
  }, [results])
  const phaseOf = (id: string): PhaseId => designNode(id)?.phase ?? home(id)
  const gi = LANES.indexOf(phase), pi = PHASE_IDS.indexOf(phase)

  // The editor's own layout (lib/workflow/dockLayout.ts, as in WorkflowOverview), drawn small: one band per phase, every
  // tool in its column in working order on its phase's band, Start before the first and Enter after the last.
  const pic = useMemo(() => {
    const layout = dockLayout(board)
    const order = runOrder(board)
    const shown = (id: string) => id === 'start' || id === 'enter' || LANES.includes(phaseOf(id))
    const kept = order.filter(shown)
    const laneOf = (id: string): number => {
      if (id === 'start') return kept.length ? LANES.indexOf(phaseOf(kept[0])) : 0
      if (id === 'enter') return kept.length ? LANES.indexOf(phaseOf(kept[kept.length - 1])) : LANES.length - 1
      return LANES.indexOf(phaseOf(id))
    }
    // columns in the editor's order, without the Present tools
    const ids = [...layout.at.entries()].filter(([id]) => shown(id)).sort((x, y) => x[1].col - y[1].col).map(([id]) => id)
    const col = (W - GUT - 4) / Math.max(1, ids.length)
    const pos = new Map<string, [number, number]>()
    ids.forEach((id, c) => pos.set(id, [GUT + c * col + col / 2, TOP + laneOf(id) * BAND + BAND / 2]))
    const edges = layout.edges.filter((e) => shown(e.a) && shown(e.b))
    // the path that went on into Present now ends at Enter
    const last = kept[kept.length - 1]
    if (last && !edges.some((e) => e.b === 'enter')) edges.push({ key: `${last}>enter`, a: last, b: 'enter', kind: 'main', level: 0 })
    const rest = kept.filter((id) => !isDesignNode(id))
    return { pos, edges, nodes: ids.filter((id) => id !== 'start' && id !== 'enter'), rest, col }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board, phase, home])

  // The guide walks every tool of the workflow in working order; Back / Next and the dots open a tool (going to its phase).
  const tools = useMemo(() => runOrder(board), [board])
  const ti = tools.indexOf(active)
  const pIdx = (id: string) => PHASE_IDS.indexOf(phaseOf(id))
  const next = ti >= 0 ? tools[ti + 1] : tools.find((t) => pIdx(t) > pi)
  const prev = ti >= 0 ? tools[ti - 1] : [...tools].reverse().find((t) => pIdx(t) < pi)
  const goTool = (id: string) => {
    const ph = phaseOf(id)
    usePhaseTools.getState().setActive(ph, id)
    if (!isDesignNode(id)) useStore.getState().selectNode(id)
    if (ph !== phase) goToStep(PHASE_STEP[ph])
  }
  const curName = info(active).name
  const about = designNode(active)?.about ?? nodeById(active)?.question ?? designOf(phase).about
  void gi

  return (
    <div data-testid="workflow-preview" className="glass-edge shrink-0 rounded-2xl bg-panel p-3">
      <div className="flex items-center gap-2 px-0.5">
        <span className="flex items-center gap-2 text-meta text-muted" title="Rules that pass, are near a limit, or need a look, across the checks that ran">
          <span className="flex items-center gap-1"><i aria-hidden className="block h-2 w-2 rounded-full" style={{ background: '#2e8b57' }} />{counts.pass}<span className="sr-only"> pass</span></span>
          <span className="flex items-center gap-1"><i aria-hidden className="block h-2 w-2 rounded-full" style={{ background: '#d98b1c' }} />{counts.warn}<span className="sr-only"> near a limit</span></span>
          <span className="flex items-center gap-1"><i aria-hidden className="block h-2 w-2 rounded-full" style={{ background: '#d0453a' }} />{counts.fail}<span className="sr-only"> to look at</span></span>
        </span>
        <button type="button" onClick={() => openOverview('edit')} data-testid="phase-edit" title="Edit the workflow in the centre view: add tools from the shelf, drag, connect and loop them, then Confirm" aria-label="Edit the workflow"
          className="ml-auto flex h-6 w-6 items-center justify-center rounded-lg text-muted outline-none hover:bg-subtle hover:text-ink focus-visible:ring-2 focus-visible:ring-accent"><ExternalLink size={14} aria-hidden /></button>
        <button type="button" onClick={onFold} data-testid="phase-collapse" aria-expanded={!collapsed} aria-label={collapsed ? 'Show the guide and the tools' : 'Fold the guide and the tools'}
                  className="flex h-6 w-6 items-center justify-center rounded-lg text-muted outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-accent">{collapsed ? '›' : '‹'}</button>
        {headerExtra}
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="mt-1 block w-full cursor-pointer" role="img" data-testid="phase-map" onClick={() => openOverview('edit')}
        aria-label={`The workflow: ${pic.rest.length + LANES.length} tools; ${PHASE_NAME[phase]} and what it feeds are lit. Click to edit the workflow.`}>
        <defs><marker id="wp-arrow" viewBox="0 0 6 6" refX={5} refY={3} markerWidth={4} markerHeight={4} orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill={UI.edge} /></marker></defs>
        {LANES.map((p, i) => (
          <g key={p} data-lane={p}>
            <rect x={0} y={TOP + i * BAND + 0.5} width={W} height={BAND - 1} rx={4} fill={p === phase ? PHASE_COLOR[p].surface : i % 2 ? 'transparent' : UI.canvas} />
            <circle cx={6} cy={TOP + i * BAND + BAND / 2} r={2.6} fill={PHASE_COLOR[p].accent} onClick={(ev) => { ev.stopPropagation(); goToStep(PHASE_STEP[p]) }}><title>{PHASE_NAME[p]}</title></circle>
          </g>
        ))}
        {pic.edges.map((e) => {
          const A = pic.pos.get(e.a), B = pic.pos.get(e.b)
          if (!A || !B) return null
          const r = TILE / 2 + 1.5
          let d: string
          if (e.kind === 'return') { const y0 = Math.min(A[1], B[1]) - r - 2 - e.level * 3; d = `M${A[0]},${A[1] - r} C${A[0]},${y0} ${B[0]},${y0} ${B[0]},${B[1] - r}` }
          else if (A[1] === B[1]) d = `M${A[0] + r},${A[1]} L${B[0] - r},${B[1]}`
          else { const mx = A[0] + pic.col / 2; d = `M${A[0] + r},${A[1]} L${mx},${A[1]} L${mx},${B[1]} L${B[0] - r},${B[1]}` }
          return <path key={e.key} d={d} fill="none" stroke={UI.edge} strokeWidth={0.8} strokeDasharray={e.kind === 'return' ? '2 1.5' : undefined} markerEnd="url(#wp-arrow)" />
        })}
        {(() => { const S = pic.pos.get('start'); return S ? <path d={`M${S[0] - 2.5},${S[1] - 3.2} L${S[0] + 3},${S[1]} L${S[0] - 2.5},${S[1] + 3.2} Z`} fill="none" stroke={UI.control} strokeWidth={0.9}><title>Start</title></path> : null })()}
        {(() => { const E = pic.pos.get('enter'); return E ? <g><circle cx={E[0]} cy={E[1]} r={TILE / 2 + 0.5} fill={UI.accent} /><path d={`M${E[0] - 2.4},${E[1]} L${E[0] + 2.4},${E[1]} M${E[0] + 0.6},${E[1] - 1.8} L${E[0] + 2.4},${E[1]} L${E[0] + 0.6},${E[1] + 1.8}`} stroke="#fff" strokeWidth={0.9} fill="none" /><title>Enter</title></g> : null })()}
        {pic.nodes.map((id) => {
          const [x, y] = pic.pos.get(id)!, ph = phaseOf(id), open = id === active
          return (
            <g key={id} data-map-node={id} data-here={ph === phase ? '' : undefined}
              onClick={(ev) => { ev.stopPropagation(); if (ph === phase) onOpen(id); else goToStep(PHASE_STEP[ph]) }}>
              <rect x={x - TILE / 2} y={y - TILE / 2} width={TILE} height={TILE} rx={2.5} fill="#fff" stroke={open ? UI.accent : UI.line} strokeWidth={open ? 1.2 : 0.7} />
              <rect x={x - 2.2} y={y - 2.2} width={4.4} height={4.4} rx={1} fill={id.startsWith('community.') ? '#c9a227' : PHASE_COLOR[ph].accent}><title>{`${PHASE_NAME[ph]} / ${info(id).name}`}</title></rect>
            </g>
          )
        })}
      </svg>

      {/* the row of tool dots is gone (12 Nov: "remove this"); Back / Next and the mini graph move between tools */}

      {!collapsed && (
        <>
          {/* the same type as the rest of the app: a 14 px title over a 12 px description, 14 px buttons 32 px tall */}
          <div className="mt-2 px-0.5">
            <h3 className="text-control font-semibold text-ink" data-testid="guide-title">{ti >= 0 ? `${ti + 1} of ${tools.length} · ` : ''}{curName}</h3>
            <p className="text-meta text-muted"><span style={{ color: PHASE_COLOR[phase].ink }}>{PHASE_NAME[phase]}</span> · {about}</p>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <button type="button" onClick={() => openOverview('edit')} className="flex h-8 items-center rounded-lg bg-accent px-2.5 text-control font-medium text-white outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2">Edit workflow</button>
            {/* Back and Next step from tool to tool (12 Nov), into the next phase when a phase's tools end; the tool is on hover */}
            <span className="ml-auto flex items-center gap-1.5">
              <button type="button" onClick={() => prev && goTool(prev)} disabled={!prev} data-testid="workflow-back"
                aria-label={prev ? `Back to ${info(prev).name}` : 'Back: this is the first tool'} title={prev ? `Back to ${info(prev).name} (${PHASE_NAME[phaseOf(prev)]})` : 'This is the first tool'}
                className="flex h-8 items-center rounded-lg border border-line bg-panel px-2.5 text-control text-ink outline-none hover:bg-subtle focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50">‹ Back</button>
              <button type="button" onClick={() => next && goTool(next)} disabled={!next} data-testid="workflow-next"
                aria-label={next ? `Next: ${info(next).name}` : 'Next: this is the last tool'} title={next ? `Next: ${info(next).name} (${PHASE_NAME[phaseOf(next)]})` : 'This is the last tool'}
                className="flex h-8 items-center rounded-lg border border-line bg-panel px-2.5 text-control text-ink outline-none hover:bg-subtle focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50">Next ›</button>
            </span>
          </div>
        </>
      )}
      {children}
    </div>
  )
}
