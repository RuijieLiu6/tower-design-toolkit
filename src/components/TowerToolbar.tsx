// Floating toolbar for the tower picked in the 3D view (lib/towerEdit.ts, components/TowerGizmo.tsx): its name and
// height, the Move and Rotate toggles (M, R), typed x / y / rotation, and snapping. While a move is dragged or waits
// for Confirm, it shows what the new position would mean (site fit, view cones, base; lib/proposalCheck.ts) with
// Confirm and Cancel. Present locks the model, so there the toolbar only says why. Top left of the viewport, clear of
// the dock on the right and the placing hint in the middle.
import { Building2, Check, LockKeyhole, Magnet, Move, RotateCw, X, type LucideIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { Tower } from '../engine/types'
import { STATE_LABEL, type ConeCheck } from '../engine/viewCones'
import { useLivePose, useProposalReport } from '../hooks/useProposal'
import type { ProposalReport } from '../lib/proposalCheck'
import { MOVE_STEPS, ROTATE_STEPS, cancelProposal, clearPick, confirmProposal, poseOf, setPose, toggleMode, useTowerEdit, type Pose } from '../lib/towerEdit'
import { UNITS, convertText, fieldUnit, formatLength, useUnits } from '../lib/units'
import { useViewFromStore } from '../lib/viewFromStore'
import { useStore, useTowers } from '../store'
import { CONE_STYLE, FlagChip, Kbd, StateChip } from './ui'
import { useDock } from './ViewportDock'

const fmt = (v: number) => String(Math.round(v * 100) / 100)
const focusRing = 'outline-none focus-visible:ring-2 focus-visible:ring-accent'

export default function TowerToolbar() {
  const picked = useTowerEdit((s) => s.picked)
  const move = useTowerEdit((s) => s.move)
  const rotate = useTowerEdit((s) => s.rotate)
  const snap = useTowerEdit((s) => s.snap)
  const moveStep = useTowerEdit((s) => s.moveStep)
  const rotateStep = useTowerEdit((s) => s.rotateStep)
  const dragging = useTowerEdit((s) => !!s.drag)
  const proposal = useTowerEdit((s) => (s.proposal?.id === s.picked ? s.proposal : null))
  const live = useLivePose(picked)
  const towers = useTowers()
  const project = useStore((s) => s.project)
  const phase = useStore((s) => s.phase)
  const reduced = useStore((s) => s.reducedMotion)
  const hidden = useDock((s) => s.hidden)
  const dockOpen = useDock((s) => s.open)
  const orbiting = useDock((s) => s.orbiting)
  const viewing = useViewFromStore((s) => s.looking || s.picking)
  const unit = useUnits((s) => s.unit)
  const t = towers.find((x) => x.id === picked)
  if (!t || hidden || viewing) return null
  // Lengths follow the viewer's unit (m / ft / mm); the store and the snap steps stay in metres.
  const fu = fieldUnit('m', unit)
  const shown = (m: number) => (fu ? fu.toShown(m) : m)
  const stored = (v: number) => (fu ? fu.fromShown(v) : v)
  const locked = phase === 'present'
  const pose = live ?? t
  const frame = project === 'city'
    ? 'Metres east (x) and north (y) of the project origin on the UTM 10N grid (EPSG:26910 491300 E, 5458600 N)'
    : 'Metres along the competition model grid (true north is 45° from it)'
  // Clear of the dock (20 rem + gutter) when it shows, but never narrower than 17 rem (a narrow view overlaps the dock
  // instead); faded like the other overlays while the camera orbits, not while dragging.
  const width = !locked && dockOpen ? 'max-w-[max(17rem,calc(100%-22.5rem))]' : 'max-w-[calc(100%-1.5rem)]'
  const fade = orbiting && !dragging ? 'opacity-35' : 'opacity-100'
  const tools = move || rotate || !!live

  return (
    <div role="toolbar" aria-label={`Selected tower: ${t.name}`}
      className={`absolute left-3 top-3 z-10 flex ${width} flex-col gap-1 rounded-md border border-line/80 bg-white/90 p-1 text-xs text-ink shadow-sm backdrop-blur-md ${reduced ? '' : 'transition-opacity duration-200'} ${fade}`}>
      <div className="flex flex-wrap items-center gap-1">
        <span className="flex items-center gap-1.5 px-1.5 py-0.5">
          <Building2 size={14} aria-hidden className="text-accent" />
          <b className="font-semibold">{t.name}</b>
          <span className="tabular-nums text-slate-600">{formatLength(t.height, unit, 0)}{t.imported ? ' · imported' : ''}</span>
        </span>
        {locked ? (
          <span className="flex flex-wrap items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-slate-700">
            <LockKeyhole size={13} aria-hidden />Model locked in Present: move and rotate in Massing <Kbd>1</Kbd> or Schematic <Kbd>2</Kbd>
          </span>
        ) : (
          <>
            <ModeButton on={move} icon={Move} label="Move" keyHint="M" onClick={() => toggleMode('move')} />
            <ModeButton on={rotate} icon={RotateCw} label="Rotate" keyHint="R" onClick={() => toggleMode('rotate')} />
          </>
        )}
        <button type="button" onClick={clearPick} aria-label="Deselect the tower" aria-keyshortcuts="Escape" title="Deselect (Esc)"
          className={`ml-auto rounded p-1 text-slate-600 hover:bg-black/5 hover:text-ink ${focusRing}`}><X size={14} aria-hidden /></button>
      </div>
      {!locked && tools && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-line/70 px-1 pt-1">
          {(move || live) && (
            <>
              <PoseField label="x position" short="x" unit={UNITS[unit].symbol} unitName={UNITS[unit].name} value={shown(pose.x)} step={shown(snap ? moveStep : 0.1)} title={frame} onCommit={(x) => setPose(t.id, { x: stored(x) })} />
              <PoseField label="y position" short="y" unit={UNITS[unit].symbol} unitName={UNITS[unit].name} value={shown(pose.y)} step={shown(snap ? moveStep : 0.1)} title={frame} onCommit={(y) => setPose(t.id, { y: stored(y) })} />
            </>
          )}
          {(rotate || live) && (
            <PoseField label="Rotation" short="Rotation" unit="°" unitName="degrees" value={pose.rotation} step={snap ? rotateStep : 1}
              title="Counter-clockwise from the model axes, about the tower's own centre" onCommit={(rotation) => setPose(t.id, { rotation })} />
          )}
          <div className="flex flex-wrap items-center gap-1">
            <button type="button" aria-pressed={snap} onClick={() => useTowerEdit.setState({ snap: !snap })}
              title="Snap to site and parcel edges, then the grid and angle steps. Hold Shift while dragging for free values."
              className={`flex items-center gap-1 rounded px-1.5 py-0.5 ${snap ? 'bg-accent/10 text-accent' : 'text-slate-600 hover:bg-black/5'} ${focusRing}`}>
              <Magnet size={13} aria-hidden />Snap
            </button>
            {snap && move && <Steps label="Grid step" options={MOVE_STEPS} value={moveStep} unit=" m" onPick={(v) => useTowerEdit.setState({ moveStep: v })} />}
            {snap && rotate && <Steps label="Angle step" options={ROTATE_STEPS} value={rotateStep} unit="°" onPick={(v) => useTowerEdit.setState({ rotateStep: v })} />}
            <span className="text-[10px] text-slate-600">{snap ? 'edges, then grid · Shift: free' : 'Free'}</span>
          </div>
        </div>
      )}
      {!locked && live && <ProposalCard t={t} pose={live} start={proposal?.start ?? null} dragging={dragging} />}
    </div>
  )
}

const SNAP_TEXT: Record<string, string> = {
  'site:corner': 'Snapped to a site corner', 'site:edge': 'Snapped to the site edge', 'parcel:corner': 'Snapped to a parcel corner',
  'parcel:edge': 'Snapped to a parcel edge', 'site:parallel': 'Parallel to the site edge', 'parcel:parallel': 'Parallel to a parcel edge',
}

/**
 * The move in progress or waiting for Confirm: where to, what it snapped to, and the checks there (with the current
 * position's result alongside when it differs). Nothing is written until Confirm.
 */
function ProposalCard({ t, pose, start, dragging }: { t: Tower; pose: Pose; start: Pose | null; dragging: boolean }) {
  const project = useStore((s) => s.project)
  const unit = useUnits((s) => s.unit)
  const tx = (text: string) => convertText(text, unit)
  const hit = useTowerEdit((s) => (s.drag?.id === t.id ? s.drag.hit : s.proposal?.id === t.id ? s.proposal.hit : null))
  const from = useMemo(() => start ?? poseOf(t), [start, t])
  const report = useProposalReport(t, pose)
  const now = useProposalReport(t, from)
  if (!report) return null
  const dist = Math.hypot(pose.x - from.x, pose.y - from.y), turn = pose.rotation - from.rotation
  const snapped = hit && hit.kind !== 'grid' ? SNAP_TEXT[`${hit.kind}:${hit.how}`] : null
  return (
    <section aria-label="Proposed position" className="rounded border border-accent/40 bg-accent/5 px-1.5 py-1">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <b className="font-semibold">{dragging ? `Moving ${t.name}` : `Move ${t.name} here?`}</b>
        <span className="tabular-nums text-slate-600">{dist >= 0.005 ? formatLength(dist, unit) : ''}{dist >= 0.005 && Math.abs(turn) >= 0.005 ? ', ' : ''}{Math.abs(turn) >= 0.005 ? `turned ${turn > 0 ? '+' : ''}${fmt(turn)}°` : ''}</span>
        {snapped && <span className="flex items-center gap-1 rounded bg-[#fff3d6] px-1 text-[11px] text-[#6e4a00]"><Magnet size={11} aria-hidden />{snapped}</span>}
      </div>
      <ul className="mt-1 space-y-0.5">
        {report.fit.map((f) => {
          const was = now?.fit.find((x) => x.id === f.id)
          return (
            <li key={f.id} className="flex flex-wrap items-center gap-1.5" title={`Source: ${f.source}`}>
              <StateChip state={f.state} />
              <span>{tx(f.text)}</span>
              <FlagChip flag={f.flag} />
              {was && was.state !== f.state && <span className="text-[10px] text-slate-600">(now: {tx(was.text)})</span>}
            </li>
          )
        })}
        {project === 'city' && <ConeLines report={report} now={now} tx={tx} />}
        {project === 'city' && (
          <li className="text-[11px] text-slate-600">Base {formatLength(report.base, unit, 1)} · {tx(report.baseNote)}; top {formatLength(report.base + t.height, unit, 1)}</li>
        )}
      </ul>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <button type="button" disabled={dragging} onClick={() => confirmProposal()} aria-keyshortcuts="Enter"
          className={`flex items-center gap-1.5 rounded bg-accent px-2.5 py-1 font-medium text-white hover:opacity-90 disabled:opacity-50 ${focusRing}`}>
          <Check size={14} aria-hidden />Confirm<kbd aria-hidden className="rounded border border-white/50 px-1 font-mono text-[10px]">Enter</kbd>
        </button>
        <button type="button" disabled={dragging} onClick={() => cancelProposal()} aria-keyshortcuts="Escape"
          className={`flex items-center gap-1.5 rounded border border-line bg-white px-2.5 py-1 font-medium text-ink hover:bg-slate-50 disabled:opacity-50 ${focusRing}`}>
          <X size={14} aria-hidden />Cancel<kbd aria-hidden className="rounded border border-line px-1 font-mono text-[10px] text-slate-600">Esc</kbd>
        </button>
        <span className="text-[10px] text-slate-600">{dragging ? 'Release to review' : 'Nothing changes until you confirm (one undo step)'}</span>
      </div>
    </section>
  )
}

/** The cones the proposed footprint falls in, each with its state, the check's own number and its evidence flag. */
function ConeLines({ report, now, tx }: { report: ProposalReport; now: ProposalReport | null; tx: (text: string) => string }) {
  const covering = report.cones.filter((c) => c.state !== 'outside')
  const was = now?.overall ?? null
  const changed = was && report.overall && was !== report.overall ? ` (now: ${STATE_LABEL[was]})` : ''
  if (!covering.length) return <li className="text-[11px] text-slate-700">Outside every protected view cone{changed}</li>
  return (
    <>
      {covering.slice(0, 4).map((c) => <ConeLine key={c.cone.id} c={c} tx={tx} />)}
      {covering.length > 4 && <li className="text-[11px] text-slate-600">and {covering.length - 4} more cones (Results &amp; evidence after confirming)</li>}
      {changed && <li className="text-[10px] text-slate-600">View cones{changed}</li>}
    </>
  )
}

function ConeLine({ c, tx }: { c: ConeCheck; tx: (text: string) => string }) {
  const n = c.exceed !== null ? tx(`${c.exceed > 0 ? '+' : ''}${c.exceed.toFixed(1)} m against the estimate${c.param ? ` (±${c.param.u95} m)` : ''}`) : ''
  return (
    <li className="flex flex-wrap items-center gap-1.5" title={c.param ? `Source: ${c.param.source}` : 'No estimate for this cone: the City publishes no height'}>
      <span className={`inline-flex rounded border px-1.5 py-0.5 text-[11px] font-semibold ${CONE_STYLE[c.state].chip}`}>{STATE_LABEL[c.state]}</span>
      <span>{c.cone.id} · {c.cone.name}{n ? `: ${n}` : ''}</span>
      {c.param ? <FlagChip flag={c.param.flag} /> : <FlagChip flag="unresolved" />}
    </li>
  )
}

function ModeButton({ on, icon: Icon, label, keyHint, onClick }: { on: boolean; icon: LucideIcon; label: string; keyHint: string; onClick: () => void }) {
  return (
    <button type="button" aria-pressed={on} aria-keyshortcuts={keyHint} onClick={onClick} title={`${label} (${keyHint})`}
      className={`flex items-center gap-1.5 rounded px-2 py-1 font-medium ${on ? 'bg-accent text-white' : 'text-ink hover:bg-black/5'} ${focusRing}`}>
      <Icon size={14} aria-hidden />{label}
      <kbd aria-hidden className={`rounded border px-1 font-mono text-[10px] ${on ? 'border-white/50 text-white' : 'border-line text-slate-600'}`}>{keyHint}</kbd>
    </button>
  )
}

/** Typed value: commits on Enter or leaving the field, Esc puts the field back. Shows the live value while dragging. */
function PoseField({ label, short, unit, unitName, value, step, title, onCommit }: {
  label: string; short: string; unit: string; unitName: string; value: number; step: number; title: string; onCommit: (v: number) => void
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const commit = () => {
    if (draft === null) return
    const v = Number(draft)
    setDraft(null)
    if (draft.trim() !== '' && Number.isFinite(v)) onCommit(v)
  }
  return (
    <label className="flex items-center gap-1" title={title}>
      <span className="text-slate-600">{short}</span>
      <span className="flex items-center rounded border border-line bg-panel focus-within:border-accent">
        <input type="number" inputMode="decimal" step={step} value={draft ?? fmt(value)} aria-label={`${label} (${unitName.toLowerCase()})`}
          onChange={(e) => setDraft(e.target.value)} onBlur={commit}
          onKeyDown={(e) => { if (e.key === 'Enter') commit(); else if (e.key === 'Escape') setDraft(null) }}
          className="w-[4.5rem] bg-transparent px-1.5 py-0.5 text-right tabular-nums outline-none" />
        <span className="pr-1.5 text-slate-600">{unit}</span>
      </span>
    </label>
  )
}

function Steps({ label, options, value, unit, onPick }: { label: string; options: readonly number[]; value: number; unit: string; onPick: (v: number) => void }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex overflow-hidden rounded border border-line">
      {options.map((o) => (
        <button key={o} type="button" role="radio" aria-checked={o === value} onClick={() => onPick(o)}
          className={`px-1.5 py-0.5 tabular-nums ${o === value ? 'bg-accent text-white' : 'text-ink hover:bg-black/5'} ${focusRing}`}>{o}{unit}</button>
      ))}
    </div>
  )
}

