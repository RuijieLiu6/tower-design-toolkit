// A connected design tool's workspace (brief §6, plan §4): the tool's own page in an iframe over the centre view, as
// the workflow editor covers it (workflow/WorkflowOverview.tsx): the phase panel and the results stay beside it and the
// viewport stays mounted underneath, camera and all. Nothing goes to the tool before the person has read the permission
// statement and agreed: until then the frame is not even created. The header says the state in words, Update preview
// sends a fresh snapshot (a new run), Close hides the workspace and keeps the proposal. The footer compares Current and
// Proposed while a proposal waits (storeys, height, plate).
import { useEffect, useMemo, useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'
import type { Tower } from '../../engine/types'
import { attachFrame, frameUrl, requestSend, useFrameState } from '../../lib/designTools/host'
import { proposedTowers } from '../../lib/designTools/apply'
import { permissionWords, targetOf } from '../../lib/designTools/snapshot'
import { useDesignTools } from '../../lib/designTools/store'
import { useStore, useTowers } from '../../store'
import { RefreshCw, X } from '../icons'

/** The three numbers the footer compares: storeys with a floor, top of the mass, the typical tower plate (m²). */
export function massFacts(t: Tower): { storeys: number; height: number; plate: number } {
  if (t.imported) {
    const floors = t.imported.storeys.filter((s) => s.hasFloor)
    const tower = floors.filter((s) => !s.podium)
    const plate = tower.length ? Math.max(...tower.map((s) => s.area)) : floors.length ? Math.max(...floors.map((s) => s.area)) : 0
    return { storeys: floors.length, height: t.imported.top, plate }
  }
  const g = targetOf(t)
  return { storeys: g.storeys, height: g.height, plate: t.width * t.depth }
}

const n0 = (v: number) => Math.round(v).toLocaleString()

export default function ToolWorkspace() {
  const { toolId, def, consented, run, pending } = useDesignTools(useShallow((s) => ({
    toolId: s.workspace, def: s.workspace ? s.definitions[s.workspace] : undefined, consented: !!(s.workspace && s.consented[s.workspace]), run: s.run, pending: s.pending,
  })))
  const ready = useFrameState((s) => (toolId ? !!s.ready[toolId] : false))
  const inst = useDesignTools((s) => (toolId ? s.instances[toolId] : undefined))
  const towers = useTowers()
  const sessionId = useDesignTools((s) => s.sessionId)
  const box = useRef<HTMLElement>(null)
  const frame = useRef<HTMLIFrameElement>(null)
  const opener = useRef<HTMLElement | null>(null)
  const shown = !!toolId && !!def

  // focus moves to the close control when the workspace opens, and back to what opened it when it closes
  useEffect(() => {
    if (shown) {
      opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
      box.current?.querySelector<HTMLElement>('[data-testid="tool-workspace-close"]')?.focus()
    } else if (opener.current && document.activeElement === document.body) { opener.current.focus(); opener.current = null }
  }, [shown])

  // the frame listens only while it is mounted (after consent); the detach clears the registry
  const frameOn = shown && consented
  useEffect(() => {
    if (!frameOn || !toolId || !frame.current) return
    return attachFrame(toolId, frame.current)
  }, [frameOn, toolId])

  const targets = useMemo(() => (inst?.targets ?? []).map((id) => towers.find((t) => t.id === id)).filter((t): t is Tower => !!t), [inst?.targets, towers])
  const compare = useMemo(() => {
    if (!pending || !def || !pending.check.ok || pending.proposal.toolId !== def.id) return null
    try {
      const next = proposedTowers(towers, pending.proposal, def).towers
      return towers.map((t, i) => ({ id: t.id, name: t.name, before: massFacts(t), after: massFacts(next[i]) })).filter((_, i) => next[i] !== towers[i])
    } catch { return null }
  }, [pending, def, towers])

  if (!shown || !def || !toolId) return null
  const url = frameUrl(def, sessionId)
  const close = () => useDesignTools.getState().setWorkspace(null)
  const state = run ? 'Waiting for the tool' : pending?.proposal.toolId === def.id ? (pending.check.stale ? 'Proposal based on an older model' : pending.check.ok ? 'Proposal returned' : 'Proposal rejected') : !consented ? 'Permission needed' : ready ? 'Connected' : 'Connecting'
  const sendWords = (r: ReturnType<typeof requestSend>) => useStore.setState({ announce: r.ok ? `Inputs sent to ${def.name}.` : r.reason })

  return (
    <section ref={box} role="dialog" aria-modal="false" aria-labelledby="tool-workspace-title" data-testid="tool-workspace" data-tool={toolId} data-state={run ? 'waiting' : consented ? (ready ? 'ready' : 'opening') : 'consent'}
      className="absolute inset-0 z-40 flex flex-col overflow-hidden rounded-2xl border border-line bg-panel shadow-float"
      onKeyDown={(e) => { if (e.key !== 'Escape') return; e.stopPropagation(); close() }}>
      <header className="flex items-center gap-2 border-b border-line px-3 py-2">
        <h2 id="tool-workspace-title" className="min-w-0 flex-1 truncate text-control font-semibold text-ink">
          {def.name} <span className="font-normal text-muted">{def.version}</span>
          <span className="sr-only">: </span><span className="ml-2 text-meta font-medium text-muted" data-testid="tool-workspace-state">{state}</span>
        </h2>
        {consented && (
          <button type="button" onClick={() => sendWords(requestSend(toolId))} disabled={!ready || !!run} data-testid="tool-workspace-send"
            className="inline-flex h-8 items-center gap-1 rounded-lg border border-line bg-panel px-2.5 text-control font-medium text-ink hover:border-[#778294] disabled:opacity-50 outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2">
            <RefreshCw size={14} aria-hidden /> Update preview
          </button>
        )}
        <button type="button" onClick={close} data-testid="tool-workspace-close" aria-label="Close the tool workspace"
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-panel text-ink hover:border-[#778294] outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2">
          <X size={16} aria-hidden />
        </button>
      </header>
      {consented ? (
        <iframe ref={frame} src={url} title={`${def.name} ${def.version}`} data-testid="tool-frame" sandbox="allow-scripts allow-same-origin allow-forms" referrerPolicy="no-referrer"
          className="min-h-0 w-full flex-1 border-0 bg-canvas" />
      ) : (
        <Permission toolId={toolId} words={permissionWords(def, targets.map(targetOf))} hasTarget={targets.length > 0} />
      )}
      {compare && compare.length > 0 && (
        <footer className="border-t border-line bg-subtle px-3 py-1.5" data-testid="tool-compare" aria-label="Current and proposed">
          <ul className="m-0 list-none p-0">
            {compare.map((c) => (
              <li key={c.id} className="grid grid-cols-[auto_1fr] gap-x-3 text-meta leading-snug">
                <span className="font-semibold text-ink">{c.name}</span>
                <span className="tabular-nums text-muted">
                  <span className="text-ink">Current</span> {c.before.storeys} storeys · {n0(c.before.height)} m · {n0(c.before.plate)} m² plate
                  <span className="mx-2 text-line" aria-hidden>|</span>
                  <span className="text-ink">Proposed</span> {c.after.storeys} storeys · {n0(c.after.height)} m · {n0(c.after.plate)} m² plate
                </span>
              </li>
            ))}
          </ul>
        </footer>
      )}
    </section>
  )
}

/** The permission statement (brief §6): what is sent, to whom, why; nothing goes out before "I understand, send". */
function Permission({ toolId, words, hasTarget }: { toolId: string; words: string[]; hasTarget: boolean }) {
  const def = useDesignTools((s) => s.definitions[toolId])
  const agree = () => {
    useDesignTools.getState().consent(toolId)
    const r = requestSend(toolId)
    useStore.setState({ announce: r.ok || r.queued ? `${def?.name ?? 'The tool'} opens; the inputs go when it is ready.` : r.reason })
  }
  return (
    <div className="flex min-h-0 flex-1 items-start justify-center overflow-y-auto p-6" data-testid="tool-permission">
      <div className="w-full max-w-lg rounded-xl border border-line bg-panel p-5">
        <h3 className="text-section font-semibold text-ink">Before anything is sent</h3>
        <ul className="mt-3 space-y-2 text-body text-ink">
          {words.map((w) => <li key={w}>{w}</li>)}
        </ul>
        {!hasTarget && <p className="mt-3 text-control text-warning"><b>Needs input</b>: choose the tower to send in the phase panel first.</p>}
        <div className="mt-4 flex items-center gap-2">
          <button type="button" onClick={agree} disabled={!hasTarget} data-testid="tool-workspace-consent"
            className="h-9 rounded-lg bg-accent px-3 text-control font-semibold text-white hover:bg-[#1D4ED8] disabled:opacity-50 outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2">I understand, send</button>
          <button type="button" onClick={() => useDesignTools.getState().setWorkspace(null)}
            className="h-9 rounded-lg border border-line bg-panel px-3 text-control font-medium text-ink hover:border-[#778294] outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2">Not now</button>
        </div>
      </div>
    </div>
  )
}
