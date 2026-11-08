// Node cards for the Customize canvas: icon, typed ports, live result with its evidence flags, and group frames.
import { Handle, NodeResizer, Position, type NodeProps } from '@xyflow/react'
import { CircleDashed, CircleHelp, FlaskConical, PlugZap } from '../icons'
import { createContext, memo, useContext } from 'react'
import type { Flag, RuleState } from '../../engine/types'
import { flagCounts, PORT_COLOR, portsFor, type NodeOutput } from '../../lib/workflowLogic'
import { FlagChip } from '../ui'
import { ResultBadge, RunBadge } from '../ResultState'
import type { RunStatus } from '../../lib/status'
import { findEntry, STATUS_LABEL } from './catalog'
import { useEditor, type WfNodeT } from './editorStore'

export const OutputsContext = createContext<Record<string, NodeOutput>>({})
export const CommunityContext = createContext<import('../../data/registry').NodeDef[]>([])

/**
 * An assessment result on the canvas (design system, 7 Nov): the circle symbol and word of lib/status.ts. "Info" is a
 * line reported, not judged. 'idle' (no result) never borrows a result's look: a dashed circle, "No result".
 */
export function StateWord({ state }: { state: RuleState | 'idle' }) {
  if (state === 'idle') return <span className="inline-flex shrink-0 items-center gap-1 rounded border border-line px-1.5 py-0.5 text-meta font-semibold leading-none text-pending"><CircleDashed size={11} aria-hidden />No result</span>
  return <ResultBadge state={state} word={state === 'unknown' ? 'Info' : undefined} />
}

/**
 * Execution status of a canvas node (research P15-M02; design system, 7 Nov): whether it ran, kept apart from what it
 * found. A node that ran is "Complete" (a solid square), whatever its result; "Pass" is only ever the result's word.
 */
export function runStatusOf(out: NodeOutput): RunStatus | null {
  if (out.run) return out.run.status === 'off' ? 'off' : out.run.status === 'blocked' ? 'blocked' : 'not-run'
  if (out.need) return out.need
  if (out.state === 'idle') return out.missing?.length ? 'waiting-input' : null
  return 'complete'
}

const FLAG_ORDER: Flag[] = ['false_assumption', 'unresolved', 'unverified', 'team_assumption', 'verified']

/** Evidence on a card: one chip per flag present (icon + word), false assumptions first. */
export function FlagSummary({ out, max = 3 }: { out: NodeOutput; max?: number }) {
  const c = flagCounts(out.items)
  const flags = FLAG_ORDER.filter((f) => c[f])
  if (!flags.length) return null
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1">
      {flags.slice(0, max).map((f) => <span key={f} className="inline-flex items-center gap-0.5"><FlagChip flag={f} />{c[f]! > 1 && <span className="text-meta tabular-nums text-muted">×{c[f]}</span>}</span>)}
      {flags.length > max && <span className="text-meta text-muted">+{flags.length - max}</span>}
    </div>
  )
}

/** Header height (3 px colour rule + 8 px padding + 32 px icon + 6 px padding); handles centre on the port label rows. */
const HEADER = 49
const ROW = 20

function WfCardImpl({ id, data, selected }: NodeProps<WfNodeT>) {
  const outs = useContext(OutputsContext)
  const community = useContext(CommunityContext)
  const out = outs[id]
  const entry = findEntry(data.ref, community)
  const missing = !entry && data.kind === 'eval'
  const researched = entry?.status === 'researched'
  const { inputs, outputs } = portsFor(data.kind, data.ref, data.category)
  const color = entry?.color ?? '#8a8f98'
  const Icon = entry?.icon ?? CircleHelp
  const rows = Math.max(inputs.length, outputs.length)
  const isSource = data.kind === 'source'

  return (
    <div data-run={out?.run?.status ?? undefined} className={`w-[232px] rounded-lg border bg-panel shadow-sm transition-shadow ${selected ? 'border-accent shadow-md ring-2 ring-accent/30' : researched || missing ? 'border-dashed border-slate-400' : 'border-line'} ${out?.run?.status === 'off' || out?.run?.status === 'blocked' ? 'opacity-60' : out?.run?.status === 'waiting' ? 'opacity-75' : ''}`}
      style={{ minHeight: HEADER + rows * ROW + 8 }}>
      <div className="flex items-center gap-2 rounded-t-lg px-2.5 pb-1.5 pt-2" style={{ borderTop: `3px solid ${color}` }}>
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${researched ? 'bg-slate-200 text-slate-600' : 'text-white'}`} style={researched ? undefined : { background: color }}>
          <Icon size={17} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-meta font-semibold leading-tight" title={data.label}>{data.label}</div>
          <div className="flex items-center gap-1 text-meta text-muted">
            {researched && <FlaskConical size={10} aria-hidden />}
            {missing ? 'Missing from this library' : entry ? STATUS_LABEL[entry.status] : ''}
            {data.category && !isSource && <span className="font-mono normal-case">· {data.category}</span>}
          </div>
        </div>
      </div>

      {/* Port labels; the handles sit on the card edge at the same heights. */}
      <div className="relative px-2.5" style={{ height: rows * ROW }}>
        {inputs.map((p, i) => (
          <span key={p.id} className="absolute left-2.5 flex items-center gap-1 text-meta text-muted" style={{ top: i * ROW + 3 }}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: PORT_COLOR[p.type] }} />{p.label}{p.multi ? ' (many)' : ''}
          </span>
        ))}
        {outputs.map((p, i) => (
          <span key={p.id} className="absolute right-2.5 flex items-center gap-1 text-meta text-muted" style={{ top: i * ROW + 3 }}>{p.label}<span className="h-1.5 w-1.5 rounded-full" style={{ background: PORT_COLOR[p.type] }} /></span>
        ))}
      </div>
      {inputs.map((p, i) => (
        <Handle key={p.id} id={p.id} type="target" position={Position.Left} title={`${p.label} input`}
          className="!h-3 !w-3 !border-2 !border-white" style={{ top: HEADER + i * ROW + 10, background: PORT_COLOR[p.type] }} />
      ))}
      {outputs.map((p, i) => (
        <Handle key={p.id} id={p.id} type="source" position={Position.Right} title={`${p.label} output`}
          className="!h-3 !w-3 !border-2 !border-white" style={{ top: HEADER + i * ROW + 10, background: PORT_COLOR[p.type] }} />
      ))}

      <div className="border-t border-line px-2.5 py-2">
        {out && !isSource && !researched && !missing && (() => {
          // Execution first (did it run?), then the result (what it found): two lines, two vocabularies.
          const run = runStatusOf(out)
          return run ? <div className="mb-1.5"><RunBadge status={run} detail={run === 'complete' && out.ms !== undefined ? `${out.ms < 1 ? '<1' : Math.round(out.ms)} ms` : undefined} /></div> : null
        })()}
        {researched ? (
          <div className="flex items-start gap-1.5 text-meta text-muted"><FlaskConical size={12} className="mt-0.5 shrink-0" aria-hidden />Researched, not runnable: a placeholder that passes "unknown" downstream.</div>
        ) : missing ? (
          <div className="flex items-start gap-1.5 text-meta text-pending"><PlugZap size={12} className="mt-0.5 shrink-0" aria-hidden />Import this node (My nodes) to run it.</div>
        ) : out ? (
          <>
            <div className="flex items-start gap-1.5">
              {!isSource && !out.run && out.state !== 'idle' && <StateWord state={out.state} />}
              {/* The run badge above already says "Needs model" / "Waiting for input": the line says what to do. */}
              <span className={`min-w-0 text-meta leading-snug ${out.state === 'idle' && (out.missing || out.need) ? 'text-pending' : 'text-ink'}`}>{out.need ? out.headline.replace(/^(Needs model|Waiting for input): /, '') : out.headline}</span>
            </div>
            {data.ref === 'logic.score' && Number.isFinite(out.score) && (
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-200" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(out.score!)} aria-label="Weighted score">
                <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(0, Math.min(100, out.score!))}%` }} />
              </div>
            )}
            {data.ref === 'logic.compare' && out.breakdown && (
              <div className="mt-1.5 space-y-1">
                {out.breakdown.map((b) => (
                  <div key={b.id} className="flex items-center gap-1.5 text-meta">
                    <span className="w-20 truncate" title={b.label}>{b.label}</span>
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200"><span className="block h-full bg-accent" style={{ width: `${Number.isFinite(b.score) ? b.score * 100 : 0}%` }} /></span>
                    <span className="w-8 text-right tabular-nums">{Number.isFinite(b.score) ? `${Math.round(b.score * 100)}%` : '–'}</span>
                  </div>
                ))}
              </div>
            )}
            <FlagSummary out={out} />
          </>
        ) : null}
      </div>
    </div>
  )
}
export const WfCard = memo(WfCardImpl)

function WfGroupImpl({ id, data, selected }: NodeProps<WfNodeT>) {
  const updateData = useEditor((s) => s.updateData)
  const color = data.color ?? '#1f5f8b'
  return (
    <div className="h-full w-full rounded-xl border-2 border-dashed" style={{ borderColor: color, background: `color-mix(in srgb, ${color} 7%, transparent)` }}>
      <NodeResizer isVisible={!!selected} minWidth={160} minHeight={100} color={color} />
      <input value={data.label} onChange={(e) => updateData(id, { label: e.target.value })} aria-label="Group name"
        className="nodrag m-1.5 w-48 rounded bg-transparent px-1.5 py-0.5 text-xs font-semibold outline-none focus:bg-panel focus:ring-1 focus:ring-accent" style={{ color }} />
    </div>
  )
}
export const WfGroup = memo(WfGroupImpl)

export const nodeTypes = { wf: WfCard, wfgroup: WfGroup }
