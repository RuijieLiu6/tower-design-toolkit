// Run modes for the workflow canvas (research P15-M02): Live recomputes on every change (as before); Run all keeps the
// last run's results until "Run all" is pressed again and says when the canvas has changed since; Step through walks
// the schedule (upstream first) one node at a time, selecting each so the details panel shows its inputs, parameters,
// thresholds and lines. A run record (canonical JSON + SHA-256, lib/runRecord.ts) can be downloaded in any mode.
import { ChevronLeft, ChevronRight, FileJson, Play, Radio, StepForward } from '../icons'
import type { RunMode } from '../../lib/runRecord'

const MODES: { id: RunMode; label: string; icon: typeof Play; title: string }[] = [
  { id: 'live', label: 'Live', icon: Radio, title: 'Results update on every change (as before)' },
  { id: 'manual', label: 'Run all', icon: Play, title: 'Results stay as they were until you press Run all: useful on a big workflow, or to compare before and after an edit' },
  { id: 'step', label: 'Step through', icon: StepForward, title: 'Run one node at a time, upstream first, and read each one in the details panel' },
]

export interface RunBarProps {
  mode: RunMode
  setMode: (m: RunMode) => void
  /** Run all: when the results were made, and whether the canvas or design changed since. */
  ranAt: string | null
  stale: boolean
  onRunAll: () => void
  /** Step through: position in the schedule and the current node's label. */
  step: number
  steps: number
  current: string | null
  onStep: (to: number) => void
  onRecord: () => void
  offCount: number
}

export default function RunBar(p: RunBarProps) {
  const seg = 'flex items-center gap-1 rounded px-2 py-1 text-meta outline-none focus-visible:ring-2 focus-visible:ring-accent'
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-panel px-2 py-1.5 text-meta text-ink shadow-sm" aria-label="Run">
      <div role="radiogroup" aria-label="Run mode" className="flex rounded-md bg-black/5 p-0.5">
        {MODES.map((m) => (
          <button key={m.id} role="radio" aria-checked={p.mode === m.id} title={m.title} onClick={() => p.setMode(m.id)}
            className={`${seg} ${p.mode === m.id ? 'bg-white font-semibold ring-1 ring-line' : 'text-muted hover:text-ink'}`}>
            <m.icon size={12} aria-hidden />{m.label}
          </button>
        ))}
      </div>
      {p.mode === 'manual' && (
        <>
          <button onClick={p.onRunAll} className="flex items-center gap-1 rounded-md bg-accent px-2.5 py-1 text-meta font-medium text-white outline-none hover:opacity-90 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1">
            <Play size={12} aria-hidden />Run all
          </button>
          <span role="status" className={p.stale ? 'font-medium text-amber-800' : 'text-muted'}>
            {!p.ranAt ? 'Not run yet' : p.stale ? 'Changed since the last run: press Run all' : `Ran at ${new Date(p.ranAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`}
          </span>
        </>
      )}
      {p.mode === 'step' && (
        <>
          <button onClick={() => p.onStep(p.step - 1)} disabled={p.step <= 0} aria-label="Previous step" title="Previous step"
            className="flex h-6 w-6 items-center justify-center rounded border border-line outline-none hover:border-accent disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-accent"><ChevronLeft size={13} aria-hidden /></button>
          <span role="status" className="min-w-0 max-w-[16rem] truncate">
            {p.steps ? <>Step <b className="tabular-nums">{p.step + 1}</b> of <span className="tabular-nums">{p.steps}</span>: <b>{p.current}</b></> : 'Nothing to run: add a node'}
          </span>
          <button onClick={() => p.onStep(p.step + 1)} disabled={p.step >= p.steps - 1} aria-label="Next step" title="Next step"
            className="flex h-6 w-6 items-center justify-center rounded border border-line outline-none hover:border-accent disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-accent"><ChevronRight size={13} aria-hidden /></button>
        </>
      )}
      {p.offCount > 0 && <span className="text-amber-800" title="Switched-off nodes block the checks after them; no verdict is computed on missing data">{p.offCount} off</span>}
      <button onClick={p.onRecord} title="Download a run record: the graph, the design and every node's result, with a SHA-256 fingerprint"
        className="ml-auto flex items-center gap-1 rounded px-1.5 py-1 text-meta text-muted outline-none hover:bg-black/5 hover:text-ink focus-visible:ring-2 focus-visible:ring-accent">
        <FileJson size={13} aria-hidden />Run record
      </button>
    </div>
  )
}
