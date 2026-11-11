// The phase panel's controls of a connected design tool (brief §6): which tower goes to it, the permission statement
// before the first send (what, to whom, why), then Open tool / Update preview / Apply / Discard, a status line in
// words, the last run's note and the parameters the tool last used. Opening the node sends nothing; a card never does
// (brief §5). Every state lives in the design-tools store (lib/designTools/store.ts), so the controls keep their inputs
// between visits (the panel is keyed by node id); the sending itself is the host's (lib/designTools/host.ts), the
// Apply and Discard are lib/designTools/apply.ts. The right panel's Proposal tab shows the same proposal in full.
import { useShallow } from 'zustand/react/shallow'
import { Ban, Check, CircleX, Hourglass, PanelsTopLeft, RotateCcw, SquareDashed, TriangleAlert, X } from '../icons'
import Fold from '../Fold'
import Help from '../Help'
import type { ToolDefinition, ToolInstance, ToolRun } from '../../lib/designTools/contract'
import { applyPending, discardPending } from '../../lib/designTools/apply'
import { cancelRun, requestSend, sendBlocker, useFrameState } from '../../lib/designTools/host'
import { permissionWords, targetOf } from '../../lib/designTools/snapshot'
import { useDesignTools, type ActiveRun, type Pending } from '../../lib/designTools/store'
import { KIND_CLASS } from '../../lib/status'
import type { StatusKind } from '../../lib/design/tokens'
import { useStore } from '../../store'

export type ControlsState = 'idle' | 'consent' | 'waiting' | 'returned' | 'stale' | 'applied' | 'error'

/** The one state the controls are in, from the store alone (pure, so the inspector's card can say the same). */
export function controlsState(id: string, s: { run: ActiveRun | null; pending: Pending | null; consented: Record<string, string>; inst: ToolInstance; installed: boolean }): ControlsState {
  if (!s.installed) return 'error'
  const pend = s.pending && s.pending.proposal.toolId === id ? s.pending : null
  if (pend) return !pend.check.ok ? 'error' : pend.check.stale ? 'stale' : 'returned'
  if (s.run && s.run.toolId === id) return 'waiting'
  if (!s.consented[id]) return 'consent'
  const last = s.inst.runs[s.inst.runs.length - 1]
  if (last?.status === 'applied') return 'applied'
  if (last?.status === 'rejected') return 'error'
  return 'idle'
}

/** The status line: a short word, the phrase, and the status family it is drawn in (always a symbol and a word). */
export function statusWords(state: ControlsState, o: { changes: number; problems: string[]; installed: boolean; targetName?: string | null }): { word: string; phrase: string; kind: StatusKind } {
  switch (state) {
    case 'idle': return { word: 'Idle', phrase: o.targetName ? 'idle: open the tool to send it' : 'idle: choose a tower, then open the tool', kind: 'pending' }
    case 'consent': return { word: 'Agree', phrase: 'consent needed: read what is sent, then send', kind: 'warning' }
    case 'waiting': return { word: 'Sent', phrase: 'waiting for the tool', kind: 'pending' }
    case 'returned': return { word: 'Returned', phrase: `proposal returned (${o.changes} change${o.changes === 1 ? '' : 's'})`, kind: 'success' }
    case 'stale': return { word: 'Older', phrase: 'based on an older model: the model changed since the inputs were sent; update the preview', kind: 'warning' }
    case 'applied': return { word: 'Applied', phrase: `applied${o.targetName ? ` to ${o.targetName}` : ''}; Ctrl+Z takes it back`, kind: 'success' }
    case 'error': return { word: 'Error', phrase: o.installed ? `error: ${o.problems.length ? o.problems.join(' ') : 'the tool returned something the Toolkit could not use'}` : 'error: this design tool is not installed in this browser; import its definition under My tools', kind: 'error' }
  }
}

const STATUS_ICON: Record<ControlsState, typeof Check> = { idle: SquareDashed, consent: TriangleAlert, waiting: Hourglass, returned: Check, stale: TriangleAlert, applied: Check, error: CircleX }
const RUN_WORD: Record<ToolRun['status'], string> = { sent: 'sent, no answer yet', returned: 'returned a proposal', applied: 'applied', discarded: 'discarded', cancelled: 'cancelled', stale: 'returned for an older model', rejected: 'rejected' }
const btn = 'flex h-8 items-center gap-1 rounded-lg px-2.5 text-control outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40'
const quiet = `${btn} bg-panel text-ink hover:border-boundary`
const primary = `${btn} bg-accent text-white focus-visible:ring-offset-2`
const when = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit' }) }
const announce = (text: string) => useStore.setState({ announce: text })

export default function DesignToolControls({ id }: { id: string }) {
  const { def, inst, run, pending, consented } = useDesignTools(useShallow((s) => ({ def: s.definitions[id] as ToolDefinition | undefined, inst: s.instances[id], run: s.run, pending: s.pending, consented: s.consented })))
  const workspace = useDesignTools((s) => s.workspace)
  const ready = useFrameState((s) => !!s.ready[id])
  const frameError = useFrameState((s) => s.error[id] ?? null)
  const towers = useStore((s) => s.towers[s.project])
  const instance = inst ?? useDesignTools.getState().instanceOf(id)
  const state = frameError && !pending ? 'error' : controlsState(id, { run, pending, consented, inst: instance, installed: !!def })
  const pend = pending && pending.proposal.toolId === id ? pending : null
  const target = towers.find((t) => instance.targets.includes(t.id)) ?? null
  const targets = target ? [targetOf(target)] : []
  const words = statusWords(state, { changes: pend?.proposal.operations.length ?? 0, problems: frameError && !pending ? [frameError] : pend?.check.problems ?? [], installed: !!def, targetName: target?.name ?? null })
  const Icon = STATUS_ICON[state]
  const last = instance.runs[instance.runs.length - 1]
  const agreed = !!consented[id]
  const blocker = def ? sendBlocker(id) : 'The tool is not installed.'
  const say = (r: ReturnType<typeof requestSend>, name: string) => announce(r.ok ? `Sent to ${name}; waiting for its proposal.` : r.queued ? `${name} is opening; the inputs go when it is ready.` : r.reason)

  const choose = (v: string) => useDesignTools.getState().setTargets(id, v ? [v] : [])
  const agree = () => { if (!def) return; useDesignTools.getState().consent(id); say(requestSend(id), def.name) }
  const open = () => {
    if (!def) return
    useDesignTools.getState().setWorkspace(id)
    // after consent, opening also sends: only when nothing is in flight or waiting for a decision (brief §9: explicit sync)
    if (agreed && !blocker && (state === 'idle' || state === 'applied')) say(requestSend(id), def.name)
  }
  const update = () => { if (def) say(requestSend(id), def.name) }
  const apply = () => {
    const r = applyPending()
    if (!r.ok) announce(r.reason)
  }
  const discard = () => { discardPending(); announce('Proposal discarded; nothing changed.') }

  return (
    <section aria-label={`${def?.name ?? id}: connected design tool`} data-testid="tool-controls" data-state={state} className="grid gap-3 px-3 pb-3">
      {def && (
        <p className="flex items-start gap-1.5 text-meta text-muted">
          <span className="min-w-0 flex-1">{def.purpose}</span>
          <Help label={`About ${def.name}`}>
            <p>{def.purpose}</p>
            <p>Version {def.version} by {def.author.name}, {def.licence}. Opens {def.connection.url} in the centre view; it may propose {def.operations.map((op) => op.replace(/-/g, ' ')).join(' and ')}. Geometry it returns is {def.editability === 'externally-generated' ? 'externally generated: the Massing sliders do not reshape it; run the tool again to change it' : 'native parameters you can keep editing here'}.</p>
            {def.limits.length > 0 && <p>Limits: {def.limits.join(' ')}</p>}
          </Help>
        </p>
      )}

      {/* the status line: symbol + word + phrase, live for screen readers */}
      <p role="status" aria-live="polite" data-testid="tool-status" data-state={state} className="flex items-start gap-1.5 text-meta">
        <Icon size={16} className={`mt-px shrink-0 ${KIND_CLASS[words.kind].fg}`} aria-hidden />
        <span className="min-w-0"><b className={`font-semibold ${KIND_CLASS[words.kind].fg}`}>{words.word}</b><span className="text-ink"> · {words.phrase}</span></span>
      </p>

      {def && (
        <>
          <label className="grid gap-1 text-meta">
            <span className="font-semibold text-muted">Tower to send</span>
            <select value={target?.id ?? ''} onChange={(e) => choose(e.target.value)} data-testid="tool-targets" disabled={state === 'waiting'}
              className="h-8 rounded-lg border border-line bg-panel px-2 text-control text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent">
              <option value="">Choose a tower</option>
              {towers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            {!towers.length && <span className="text-muted">No tower yet: place one in Form first.</span>}
          </label>

          {/* the permission statement: in full before the first send, then folded with the date agreed (brief §6, §11) */}
          {agreed
            ? <Fold summary={`What is sent (agreed ${new Date(consented[id]).toLocaleDateString('en-CA')})`} testId="tool-permission">{permissionWords(def, targets).map((w) => <span key={w}>{w}</span>)}</Fold>
            : (
              <div role="group" aria-label="Before anything is sent" data-testid="tool-permission" className="grid gap-1 rounded-lg border border-warning/30 bg-warning-surface px-2.5 py-2 text-meta text-ink">
                <span className="font-semibold">Before anything is sent</span>
                {permissionWords(def, targets).map((w) => <span key={w}>{w}</span>)}
                <span className="text-muted">Nothing goes until you press the button below; opening the tool alone sends nothing.</span>
                <button type="button" onClick={agree} disabled={!target} data-testid="tool-consent" title={target ? `Agree and send ${target.name} to ${def.name}` : 'Choose a tower first'} className={`${primary} mt-1 w-fit`}><Check size={14} aria-hidden />I understand, send</button>
              </div>
            )}

          <div className="flex flex-wrap gap-1.5">
            <button type="button" onClick={open} data-testid="tool-open" aria-pressed={workspace === id} title={workspace === id ? 'Its workspace is open in the centre view' : `Open ${def.name} in the centre view${agreed ? '; the chosen tower goes to it' : ''}`} className={workspace === id ? `${btn} bg-ink text-accent-hover` : quiet}><PanelsTopLeft size={14} aria-hidden />Open tool</button>
            {state === 'waiting'
              ? <button type="button" onClick={() => { cancelRun(id); announce('Run cancelled; a late answer is ignored.') }} data-testid="tool-cancel" className={quiet}><Ban size={14} aria-hidden />Cancel</button>
              : <button type="button" onClick={update} disabled={!!blocker} data-testid="tool-send" title={blocker ?? 'Send the tower as it is now: a new run; an earlier proposal is set aside'} className={quiet}><RotateCcw size={14} aria-hidden />Update preview</button>}
            {pend && (
              <>
                <button type="button" onClick={apply} disabled={!pend.check.ok || pend.check.stale} data-testid="tool-apply" title={pend.check.stale ? 'Based on an older model: update the preview first' : !pend.check.ok ? 'The proposal did not pass its checks' : 'One change, one Undo'} className={primary}><Check size={14} aria-hidden />Apply</button>
                <button type="button" onClick={discard} data-testid="tool-discard" title="Set the proposal aside; the model stays as it is" className={quiet}><X size={14} aria-hidden />Discard</button>
              </>
            )}
          </div>
          {workspace === id && <p className="text-meta text-muted" data-testid="tool-frame-state">{ready ? 'The tool is connected and listening.' : 'Opening the tool… If nothing appears, its page is not answering (connection required).'}</p>}

          {last && <p className="text-meta text-muted" data-testid="tool-last-run">Last run {when(last.sentAt)}: {RUN_WORD[last.status]}{last.note ? ` · ${last.note}` : ''}</p>}
          <Fold summary={instance.parameters ? 'Parameters the tool last used' : 'No parameters yet: the tool sends them with its first proposal'} testId="tool-parameters">
            {instance.parameters ? <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-subtle p-2 text-meta text-ink">{JSON.stringify(instance.parameters, null, 1)}</pre> : <span>They are kept with the tower when a proposal is applied, so the tool can regenerate it.</span>}
          </Fold>
        </>
      )}
    </section>
  )
}

/** The right panel's short card for a design tool (components/Inspector.tsx): name, purpose, the last run; no results. */
export function DesignToolCard({ id }: { id: string }) {
  const { def, inst, run, pending, consented } = useDesignTools(useShallow((s) => ({ def: s.definitions[id] as ToolDefinition | undefined, inst: s.instances[id], run: s.run, pending: s.pending, consented: s.consented })))
  const instance = inst ?? useDesignTools.getState().instanceOf(id)
  const state = controlsState(id, { run, pending, consented, inst: instance, installed: !!def })
  const pend = pending && pending.proposal.toolId === id ? pending : null
  const words = statusWords(state, { changes: pend?.proposal.operations.length ?? 0, problems: pend?.check.problems ?? [], installed: !!def })
  const Icon = STATUS_ICON[state]
  const last = instance.runs[instance.runs.length - 1]
  return (
    <div className="px-4 py-3" data-testid="tool-card" data-state={state}>
      <h2 className="flex items-center gap-1.5 text-section font-semibold text-ink">{def?.name ?? id.replace(/^tool\./, '')}{def && <Help label={`About ${def.name}`}>{def.purpose} Version {def.version} by {def.author.name}.</Help>}</h2>
      <p className="mt-1 text-control text-muted">{def ? def.purpose : 'A connected design tool that is not installed in this browser.'}</p>
      <p className="mt-2 flex items-start gap-1.5 text-meta"><Icon size={16} className={`mt-px shrink-0 ${KIND_CLASS[words.kind].fg}`} aria-hidden /><span><b className={`font-semibold ${KIND_CLASS[words.kind].fg}`}>{words.word}</b><span className="text-ink"> · {words.phrase}</span></span></p>
      {last && <p className="mt-1 text-meta text-muted">Last run {when(last.sentAt)}: {RUN_WORD[last.status]}{last.note ? ` · ${last.note}` : ''}</p>}
      <p className="mt-2 text-meta text-muted">A design tool has no results of its own: its controls are in the left panel, its proposal in the Proposal tab.</p>
    </div>
  )
}
