// The connected design tools of this browser (installed definitions) and of the open project (instances with their
// runs), plus the one run in flight and the one proposal waiting for Apply. Definitions and instances persist in this
// browser (localStorage); the run and the pending proposal are this visit's only. Nothing here touches the model:
// apply.ts does, once, on Apply.
import { create } from 'zustand'
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware'
import type { Check } from './validate'
import type { InputSnapshot, Proposal, ToolDefinition, ToolInstance, ToolRun } from './contract'

export interface ActiveRun { toolId: string; sessionId: string; runId: string; projectId: string; baseRevision: string; targets: string[]; sentAt: string }
export interface Pending { proposal: Proposal; check: Check & { stale: boolean }; receivedAt: string }

interface DesignToolsState {
  definitions: Record<string, ToolDefinition>
  instances: Record<string, ToolInstance>
  /** This visit's session id: proposals must carry it (brief §11). */
  sessionId: string
  run: ActiveRun | null
  pending: Pending | null
  /** The tool whose workspace covers the centre, if any. */
  workspace: string | null
  /** The person has read what is sent to this tool and agreed (per tool, this browser). */
  consented: Record<string, string>
  install: (def: ToolDefinition) => void
  uninstall: (toolId: string) => void
  instanceOf: (toolId: string) => ToolInstance
  setTargets: (toolId: string, targets: string[]) => void
  startRun: (snapshot: InputSnapshot) => void
  /** The run is over, one way or another; the record keeps why. */
  endRun: (status: ToolRun['status'], note?: string) => void
  setPending: (p: Pending | null) => void
  setWorkspace: (toolId: string | null) => void
  consent: (toolId: string) => void
}

const memory = new Map<string, string>()
const storage: StateStorage = {
  getItem: (k) => { try { return window.localStorage.getItem(k) } catch { return memory.get(k) ?? null } },
  setItem: (k, v) => { try { window.localStorage.setItem(k, v) } catch { memory.set(k, v) } },
  removeItem: (k) => { try { window.localStorage.removeItem(k) } catch { memory.delete(k) } },
}
export const newId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`)
const blank = (def: ToolDefinition): ToolInstance => ({ toolId: def.id, toolVersion: def.version, targets: [], parameters: null, runs: [], mappings: {} })

export const useDesignTools = create<DesignToolsState>()(persist((set, get) => ({
  definitions: {}, instances: {}, sessionId: newId(), run: null, pending: null, workspace: null, consented: {},
  install: (def) => set((s) => ({ definitions: { ...s.definitions, [def.id]: def }, instances: s.instances[def.id] ? { ...s.instances, [def.id]: { ...s.instances[def.id], toolVersion: def.version } } : { ...s.instances, [def.id]: blank(def) } })),
  // Uninstalling keeps the project's towers and the instance's run history (brief §10): only the definition goes.
  uninstall: (toolId) => set((s) => { const { [toolId]: _d, ...definitions } = s.definitions; const { [toolId]: _c, ...consented } = s.consented; return { definitions, consented, workspace: s.workspace === toolId ? null : s.workspace } }),
  // a tool named by a project but never installed here still has an instance record (never a crash)
  instanceOf: (toolId) => get().instances[toolId] ?? blank(get().definitions[toolId] ?? ({ id: toolId, version: '' } as ToolDefinition)),
  setTargets: (toolId, targets) => set((s) => ({ instances: { ...s.instances, [toolId]: { ...get().instanceOf(toolId), targets } } })),
  startRun: (snap) => set((s) => {
    const inst = get().instanceOf(snap.toolId)
    const run: ToolRun = { runId: snap.runId, sentAt: new Date().toISOString(), baseRevision: snap.baseRevision, status: 'sent' }
    return { run: { toolId: snap.toolId, sessionId: snap.sessionId, runId: snap.runId, projectId: snap.projectId, baseRevision: snap.baseRevision, targets: snap.targets.map((t) => t.id), sentAt: run.sentAt }, pending: null,
      instances: { ...s.instances, [snap.toolId]: { ...inst, runs: [...inst.runs.slice(-19), run] } } }
  }),
  endRun: (status, note) => set((s) => {
    const r = s.run
    if (!r) return {}
    const inst = get().instanceOf(r.toolId)
    return { run: null, instances: { ...s.instances, [r.toolId]: { ...inst, runs: inst.runs.map((x) => (x.runId === r.runId ? { ...x, status, note } : x)) } } }
  }),
  setPending: (pending) => set({ pending }),
  setWorkspace: (workspace) => set({ workspace }),
  consent: (toolId) => set((s) => ({ consented: { ...s.consented, [toolId]: new Date().toISOString() } })),
}), { name: 'tower-studio.design-tools', storage: createJSONStorage(() => storage), partialize: (s) => ({ definitions: s.definitions, instances: s.instances, consented: s.consented }) }))

/** Run ids applied in this project (a proposal is never applied twice). */
export const appliedRuns = (toolId: string) => new Set(useDesignTools.getState().instanceOf(toolId).runs.filter((r) => r.status === 'applied').map((r) => r.runId))
