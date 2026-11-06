// Floating toolbar for the tower picked in the 3D view (lib/towerEdit.ts, components/TowerGizmo.tsx): its name and
// height, then the tools as icons with a key word, like the rest of the app (Ruijie, 6 Nov: "tools directly interacting
// with the view port, make them coherent with the rest of the tool"): Move (M), Rotate (R), Align (L) and Snap, each
// explained on hover (IconTile.tsx). Moving shows typed x / y / rotation. While a move is dragged or waits for Confirm,
// the proposal card lists what the new position would mean as status rows (✓ ✕ ! ?, StatusRow.tsx: site, land, view
// cones with their fixes, base), details behind "?", then Confirm and Cancel. Present locks the model, so there the
// toolbar only says so. Top left of the viewport, clear of the dock on the right and the placing hint in the middle.
import { Building2, Check, LandPlot, LockKeyhole, Magnet, Move, RotateCw, X } from './icons'
import { useMemo, useState } from 'react'
import type { Tower } from '../engine/types'
import { STATE_LABEL } from '../engine/viewCones'
import { useLivePose, useProposalReport } from '../hooks/useProposal'
import { byState, coneRows, STATE_WORD } from '../lib/fixes'
import { MOVE_STEPS, ROTATE_STEPS, alignToLot, cancelProposal, clearPick, confirmProposal, poseOf, setPose, toggleMode, useTowerEdit, type Pose } from '../lib/towerEdit'
import { UNITS, convertText, fieldUnit, formatLength, useUnits } from '../lib/units'
import { useViewFromStore } from '../lib/viewFromStore'
import { useStore, useTowers } from '../store'
import Help from './Help'
import IconTile from './IconTile'
import StatusRow from './StatusRow'
import { Kbd } from './ui'
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
  const placing = useStore((s) => s.placing)
  const project = useStore((s) => s.project)
  const phase = useStore((s) => s.phase)
  const reduced = useStore((s) => s.reducedMotion)
  const hidden = useDock((s) => s.hidden)
  const dockOpen = useDock((s) => (project === 'city' ? s.menu : s.open))
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
  // Real Vancouver's Vista layout (components/VistaLook.tsx): under the mode tabs and "Study scene", clear of both.
  const top = project === 'city' && !locked ? 'top-[5.5rem]' : 'top-3'
  const fade = orbiting && !dragging ? 'opacity-35' : 'opacity-100'
  const tools = move || rotate || !!live
  const snapHint = snap
    ? 'On: a move snaps to site and parcel edges, then to the grid step; a turn snaps to the angle step. Hold Shift while dragging for free values.'
    : 'Off: the tower moves and turns freely.'

  return (
    <div role="toolbar" aria-label={`Selected tower: ${t.name}`}
      className={`absolute left-3 ${top} z-10 flex ${width} flex-col gap-1 rounded-md border border-line bg-white/95 p-1 text-xs text-ink shadow-sm ${reduced ? '' : 'transition-opacity duration-200'} ${fade}`}>
      <div className="flex items-center gap-1.5 px-1.5 pt-0.5">
        <Building2 size={14} aria-hidden className="shrink-0 text-accent" />
        <b className="truncate font-semibold">{t.name}</b>
        <span className="shrink-0 tabular-nums text-slate-600">{formatLength(t.height, unit, 0)}{t.imported ? ' · imported' : ''}</span>
        <button type="button" onClick={clearPick} aria-label="Deselect the tower" aria-keyshortcuts="Escape" title="Deselect (Esc)"
          className={`ml-auto rounded p-1 text-slate-600 hover:bg-black/5 hover:text-ink ${focusRing}`}><X size={14} aria-hidden /></button>
      </div>
      {placing && !locked && <p data-testid="toolbar-placing" className="rounded bg-ink/85 px-1.5 py-0.5 text-[11px] text-white">Click the ground where it should stand · Esc keeps it where it is</p>}
      {locked ? (
        <p className="flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-slate-700">
          <LockKeyhole size={13} aria-hidden />Locked in Present
          <Help label="Why the model is locked">The board shows the model as captured. Move and rotate it in Massing <Kbd>1</Kbd> or Schematic <Kbd>2</Kbd>.</Help>
        </p>
      ) : (
        <div className="flex flex-wrap gap-0.5">
          <IconTile size="sm" icon={Move} word="Move" label="Move the tower" active={move} aria-pressed={move} aria-keyshortcuts="M" onClick={() => toggleMode('move')}
            hint="Drag the arrows or the square in the 3D view, or type x and y. A move is a proposal: Confirm or Cancel it. Key: M." />
          <IconTile size="sm" icon={RotateCw} word="Rotate" label="Rotate the tower" active={rotate} aria-pressed={rotate} aria-keyshortcuts="R" onClick={() => toggleMode('rotate')}
            hint="Drag the arc in the 3D view, or type the angle (counter-clockwise, about the tower's centre). Key: R." />
          <IconTile size="sm" icon={LandPlot} word="Align" label="Align to the lot" aria-keyshortcuts="L" onClick={() => alignToLot(t.id)}
            hint={`Turn and place the tower to ${project === 'city' ? 'the lot lines under it' : 'the competition block'}. A proposal to confirm. Key: L.`} />
          <IconTile size="sm" icon={Magnet} word="Snap" label="Snap to edges and steps" active={snap} aria-pressed={snap} onClick={() => useTowerEdit.setState({ snap: !snap })} hint={snapHint} />
        </div>
      )}
      {!locked && tools && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-line/70 px-1 pt-1">
          {(move || live) && (
            <>
              <PoseField label="x position" short="x" unit={UNITS[unit].symbol} unitName={UNITS[unit].name} value={shown(pose.x)} step={shown(snap ? moveStep : 0.1)} title={frame} onCommit={(x) => setPose(t.id, { x: stored(x) })} />
              <PoseField label="y position" short="y" unit={UNITS[unit].symbol} unitName={UNITS[unit].name} value={shown(pose.y)} step={shown(snap ? moveStep : 0.1)} title={frame} onCommit={(y) => setPose(t.id, { y: stored(y) })} />
            </>
          )}
          {(rotate || live) && (
            <PoseField label="Rotation" short="Turn" unit="°" unitName="degrees" value={pose.rotation} step={snap ? rotateStep : 1}
              title="Counter-clockwise from the model axes, about the tower's own centre" onCommit={(rotation) => setPose(t.id, { rotation })} />
          )}
          {snap && move && <Steps label="Grid step" options={MOVE_STEPS} value={moveStep} unit=" m" onPick={(v) => useTowerEdit.setState({ moveStep: v })} />}
          {snap && rotate && <Steps label="Angle step" options={ROTATE_STEPS} value={rotateStep} unit="°" onPick={(v) => useTowerEdit.setState({ rotateStep: v })} />}
        </div>
      )}
      {!locked && live && <ProposalCard t={t} pose={live} start={proposal?.start ?? null} dragging={dragging} />}
    </div>
  )
}

const SNAP_TEXT: Record<string, string> = {
  'site:corner': 'Site corner', 'site:edge': 'Site edge', 'parcel:corner': 'Parcel corner',
  'parcel:edge': 'Parcel edge', 'site:parallel': 'Parallel to the site', 'parcel:parallel': 'Parallel to a parcel',
}

/**
 * The move in progress or waiting for Confirm: where to, what it snapped to, and the checks there as status rows, with
 * the current position's result alongside when it differs. Nothing is written until Confirm.
 */
function ProposalCard({ t, pose, start, dragging }: { t: Tower; pose: Pose; start: Pose | null; dragging: boolean }) {
  const project = useStore((s) => s.project)
  const unit = useUnits((s) => s.unit)
  const tx = (text: string) => convertText(text, unit)
  const hit = useTowerEdit((s) => (s.drag?.id === t.id ? s.drag.hit : s.proposal?.id === t.id ? s.proposal.hit : null))
  const align = useTowerEdit((s) => (!s.drag && s.proposal?.id === t.id ? s.proposal.align ?? null : null))
  const from = useMemo(() => start ?? poseOf(t), [start, t])
  const report = useProposalReport(t, pose)
  const now = useProposalReport(t, from)
  if (!report) return null
  const dist = Math.hypot(pose.x - from.x, pose.y - from.y), turn = pose.rotation - from.rotation
  const snapped = !align && hit && hit.kind !== 'grid' ? SNAP_TEXT[`${hit.kind}:${hit.how}`] : null
  const top = report.base + t.height
  // The view cones as the results show them (lib/fixes.ts coneRows): a row per cone the tower would enter, with a fix.
  const cones = project === 'city' ? coneRows(t.id, t.name, report.cones, top) : null
  const coneList = cones ? [...cones.rows].sort(byState) : []
  const openCones = coneList.filter((r) => r.state !== 'pass').slice(0, 3)
  const clear = coneList.length - openCones.length
  const wasCones = now?.overall && report.overall && now.overall !== report.overall ? STATE_LABEL[now.overall] : null
  return (
    <section aria-label="Proposed position" className="rounded border border-accent/40 bg-accent/5 px-1.5 py-1">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <b className="font-semibold">{dragging ? `Moving ${t.name}` : `Move ${t.name} here?`}</b>
        <span className="tabular-nums text-slate-600">{dist >= 0.005 ? formatLength(dist, unit) : ''}{dist >= 0.005 && Math.abs(turn) >= 0.005 ? ' · ' : ''}{Math.abs(turn) >= 0.005 ? `${turn > 0 ? '+' : ''}${fmt(turn)}°` : ''}</span>
        {snapped && <span className="flex items-center gap-1 rounded bg-[#fff3d6] px-1 text-[11px] text-[#6e4a00]"><Magnet size={11} aria-hidden />{snapped}</span>}
      </div>
      {align && (
        // What the placement lined the tower up with (lib/lotAlign.ts); the lot lines it used are amber in 3D.
        <p className="mt-0.5 flex items-start gap-1 rounded bg-[#fff3d6] px-1 py-0.5 text-[11px] text-[#6e4a00]" data-testid="align-hint"
          title={align.how === 'lot' || align.how === 'nearby' ? 'City of Vancouver, Property parcel polygons (OGL-Vancouver, retrieved 2026-10-27)' : undefined}>
          <LandPlot size={12} aria-hidden className="mt-px shrink-0" /><span className="line-clamp-2">{tx(align.text)}</span>
        </p>
      )}
      <ul className="mt-0.5" aria-label="What this position means">
        {report.fit.map((f) => {
          const was = now?.fit.find((x) => x.id === f.id)
          const changed = was && was.state !== f.state ? ` (now ${STATE_WORD[was.state].toLowerCase()})` : ''
          return <StatusRow key={f.id} size="sm" state={f.state} title={f.title} value={tx(f.value) + changed} flag={f.flag}
            detail={<><span className="block">{tx(f.text)}</span><span className="block text-muted">Source: {f.source}</span></>} />
        })}
        {cones && coneList.length === 0 && <StatusRow size="sm" state="pass" title="View cones" value="outside every protected view" />}
        {openCones.map((r) => <StatusRow key={r.id} size="sm" state={r.state} title={r.title} value={tx(r.value)} fix={r.fix} flag={r.flag} />)}
        {cones && clear > 0 && <StatusRow size="sm" state="pass" title={openCones.length ? `${clear} more cone${clear === 1 ? '' : 's'}` : 'View cones'} value={openCones.length ? 'clear' : `clear in ${clear}`} />}
      </ul>
      {wasCones && <p className="pl-[1.6rem] text-[11px] text-slate-600">Where it stands now: {wasCones.toLowerCase()}</p>}
      {project === 'city' && (
        <p className="flex items-center gap-1 pl-[1.6rem] text-[11px] text-slate-600">
          Base {formatLength(report.base, unit, 1)} · top {formatLength(top, unit, 1)}
          <Help label="About the base">{tx(report.baseNote)}. Geodetic heights (CGVD28).</Help>
        </p>
      )}
      <div className="mt-1 flex flex-wrap items-center gap-1">
        <IconTile layout="inline" primary icon={Check} word="Confirm" label="Confirm the move" disabled={dragging} aria-keyshortcuts="Enter" onClick={() => confirmProposal()}
          hint="Apply the move as one undo step. Nothing changes until you confirm. Key: Enter." />
        <IconTile layout="inline" icon={X} word="Cancel" label="Cancel the move" disabled={dragging} aria-keyshortcuts="Escape" onClick={() => cancelProposal()} className="border border-line bg-white"
          hint="Keep the tower where it was. Key: Esc." />
        {dragging && <span className="text-[11px] text-slate-600">Release to review</span>}
      </div>
    </section>
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
