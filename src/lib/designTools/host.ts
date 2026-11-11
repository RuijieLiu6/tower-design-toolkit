// The host side of the tdt-design-tool@1 protocol (brief §11, plan §5): one open iframe per tool, pinned to the
// definition's origin both ways. The host sends an input snapshot only after the person consented and chose a target
// (store.consented, instance.targets); the tool answers with a proposal that is checked (validate.ts) and parked as
// pending (store.ts) for the Proposal tab to Apply or Discard. A message from any other window, origin or protocol, or
// for a run that is not the one in flight, is dropped (and logged) and never reaches the model.
//   requestSend(toolId)       snapshot → startRun → postMessage to the pinned origin (opens the workspace first when the
//                             frame is not open yet, and sends once the tool says tdt:ready)
//   cancelRun(toolId)         tells the tool, records the run as cancelled; a late proposal is then ignored
//   attachFrame(toolId, el)   the 'message' listener for one iframe; returns the detach function
// Nothing here touches the towers: apply.ts does, once, on Apply.
import { create } from 'zustand'
import { useStore } from '../../store'
import { modelRevision } from '../workflow/phasePackage'
import { PROTOCOL, type InputSnapshot, type Proposal, type ToolDefinition } from './contract'
import { makeSnapshot } from './snapshot'
import { appliedRuns, useDesignTools } from './store'
import { checkProposal } from './validate'

/** What the host needs of a window to listen on (injectable for tests; the browser passes `window`). */
export interface MessageTarget {
  addEventListener: (type: 'message', fn: (e: MessageEvent) => void) => void
  removeEventListener: (type: 'message', fn: (e: MessageEvent) => void) => void
}
/** What the host needs of an iframe: its content window, to compare the sender and to post to. */
export interface FrameLike { contentWindow: { postMessage: (msg: unknown, targetOrigin: string) => void } | null }

interface OpenFrame { frame: FrameLike; ready: boolean; queued: boolean }
/** The open iframe per tool id (not serialisable: a module registry, not store state). */
const frames = new Map<string, OpenFrame>()

interface FrameState { ready: Record<string, boolean>; error: Record<string, string | null>; set: (toolId: string, ready: boolean) => void; fail: (toolId: string, error: string) => void }
/** Which tools' frames have said tdt:ready (for the state words in the workspace and the phase panel). */
export const useFrameState = create<FrameState>((set) => ({ ready: {}, error: {}, set: (toolId, ready) => set((s) => ({ ready: { ...s.ready, [toolId]: ready }, error: ready ? { ...s.error, [toolId]: null } : s.error })), fail: (toolId, error) => set((s) => ({ error: { ...s.error, [toolId]: error } })) }))
/** How long a tool may take to say tdt:ready before the person is told it did not answer. */
export const READY_MS = 10_000
const readyTimers = new Map<string, ReturnType<typeof setTimeout>>()
export function watchReady(toolId: string) {
  clearTimeout(readyTimers.get(toolId))
  readyTimers.set(toolId, setTimeout(() => { if (!frames.get(toolId)?.ready) useFrameState.getState().fail(toolId, 'The tool did not answer. Is it running at its address?') }, READY_MS))
}

/** The iframe's address: the tool's url plus the host origin (the tool pins it) and this visit's session id. */
export function frameUrl(def: ToolDefinition, sessionId = useDesignTools.getState().sessionId, hostOrigin = typeof location !== 'undefined' ? location.origin : 'null'): string {
  const url = def.connection.url
  return `${url}${url.includes('?') ? '&' : '?'}host=${encodeURIComponent(hostOrigin)}&session=${encodeURIComponent(sessionId)}`
}

export const isFrameReady = (toolId: string) => frames.get(toolId)?.ready === true

export type SendResult = { ok: true; runId: string } | { ok: false; reason: string; queued?: boolean }

/** Why a send cannot happen yet, in the words the controls show; null when it can. */
export function sendBlocker(toolId: string): string | null {
  const s = useDesignTools.getState()
  if (!s.definitions[toolId]) return 'The tool is not installed.'
  if (!s.consented[toolId]) return 'Read what is sent and agree first.'
  const inst = s.instanceOf(toolId)
  const list = useStore.getState().towers[useStore.getState().project]
  if (!inst.targets.length || !inst.targets.some((id) => list.some((t) => t.id === id))) return 'Choose a tower to send.'
  return null
}

function send(toolId: string, open: OpenFrame): SendResult {
  const s = useDesignTools.getState()
  const def = s.definitions[toolId]
  const blocker = sendBlocker(toolId)
  if (!def || blocker) return { ok: false, reason: blocker ?? 'The tool is not installed.' }
  const win = open.frame.contentWindow
  if (!win) return { ok: false, reason: 'The tool window is not open.' }
  const st = useStore.getState()
  const snapshot: InputSnapshot = makeSnapshot(def, s.instanceOf(toolId), st.towers[st.project])
  if (!snapshot.targets.length) return { ok: false, reason: 'Choose a tower to send.' }
  open.queued = false
  s.startRun(snapshot)
  win.postMessage(snapshot, def.connection.origin)
  return { ok: true, runId: snapshot.runId }
}

/**
 * Send a fresh snapshot (a new run) to the tool. With the frame open and ready it goes at once; otherwise the workspace
 * opens and the snapshot goes when the tool says tdt:ready. Never sends without consent or a target.
 */
export function requestSend(toolId: string): SendResult {
  const blocker = sendBlocker(toolId)
  if (blocker) return { ok: false, reason: blocker }
  const open = frames.get(toolId)
  if (open?.ready) return send(toolId, open)
  if (open) open.queued = true
  else pendingOpen.add(toolId)
  useDesignTools.getState().setWorkspace(toolId)
  watchReady(toolId)
  return { ok: false, reason: 'Waiting for the tool to open.', queued: true }
}
/** Tools asked to send before their frame was attached (the workspace is opening). */
const pendingOpen = new Set<string>()

/** Cancel the run in flight: the tool is told, the run is recorded, a proposal arriving later is dropped. */
export function cancelRun(toolId: string) {
  const s = useDesignTools.getState()
  const run = s.run
  const open = frames.get(toolId)
  if (open) open.queued = false
  pendingOpen.delete(toolId)
  if (!run || run.toolId !== toolId) return
  const def = s.definitions[toolId]
  if (def && open?.frame.contentWindow) open.frame.contentWindow.postMessage({ protocol: PROTOCOL, type: 'tdt:cancel', runId: run.runId }, def.connection.origin)
  s.endRun('cancelled')
}

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/**
 * Listen for the tool in this iframe. Only a message from the frame's own window, from the definition's origin, in the
 * protocol, is read; anything else is ignored. Returns the function that stops listening.
 */
export function attachFrame(toolId: string, frame: FrameLike, win: MessageTarget = window): () => void {
  const open: OpenFrame = { frame, ready: false, queued: pendingOpen.delete(toolId) }
  frames.set(toolId, open)
  useFrameState.getState().set(toolId, false)
  const onMessage = (e: MessageEvent) => {
    const def = useDesignTools.getState().definitions[toolId]
    if (!def) return
    if (!frame.contentWindow || e.source !== frame.contentWindow || e.origin !== def.connection.origin) return
    const msg = e.data
    if (!isRecord(msg) || msg.protocol !== PROTOCOL) return
    switch (msg.type) {
      case 'tdt:ready': {
        open.ready = true
        useFrameState.getState().set(toolId, true)
        if (open.queued) send(toolId, open)
        return
      }
      case 'tdt:proposal': {
        const s = useDesignTools.getState()
        const run = s.run
        if (!run || run.toolId !== toolId || msg.runId !== run.runId) {
          console.warn(`[design tools] ${toolId}: a proposal for run ${String(msg.runId)} arrived but ${run ? `run ${run.runId} is in flight` : 'no run is waiting'}; ignored.`)
          return
        }
        const st = useStore.getState()
        const check = checkProposal(msg, {
          def,
          session: { sessionId: run.sessionId, runId: run.runId, projectId: run.projectId, baseRevision: run.baseRevision, targets: run.targets },
          currentRevision: modelRevision(st.towers[st.project]),
          applied: appliedRuns(toolId),
        })
        // the pending record keeps the checked proposal (or the raw message when it failed, for the problems list)
        s.setPending({ proposal: check.proposal ?? (msg as unknown as Proposal), check, receivedAt: new Date().toISOString() })
        s.endRun(check.ok ? (check.stale ? 'stale' : 'returned') : 'rejected', check.problems[0] ?? (check.stale ? 'The model changed since the inputs were sent.' : undefined))
        return
      }
      case 'tdt:cancel': {
        const s = useDesignTools.getState()
        if (s.run && s.run.toolId === toolId && s.run.runId === msg.runId) s.endRun('cancelled', 'Cancelled by the tool.')
        return
      }
      default:
        return
    }
  }
  win.addEventListener('message', onMessage)
  return () => {
    win.removeEventListener('message', onMessage)
    // a send still queued survives a re-attach (React runs effects twice in development)
    if (open.queued && !open.ready) pendingOpen.add(toolId)
    if (frames.get(toolId) === open) { frames.delete(toolId); useFrameState.getState().set(toolId, false) }
  }
}
