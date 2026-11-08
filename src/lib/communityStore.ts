// "My nodes": community node packages the user imported, kept in this browser only (localStorage). Nothing is uploaded.
import { create } from 'zustand'
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware'
import { useStore } from '../store'
import { useMemo } from 'react'
import { toNodeDef, type NodePackage } from './nodePackages'

export type BuilderTab = 'build' | 'make' | 'import' | 'icon'

interface CommunityState {
  packages: NodePackage[]
  /** Parameter values the user changed, by node id. */
  params: Record<string, Record<string, number>>
  /** Node builder dialog: which tab is open, and the library search that led there (a starting point for the prompt). */
  dialog: BuilderTab | null
  seed: string
  /** A package made in the "Make it here" form, waiting for the Import tab to check it (not persisted). */
  draft: string | null
  setDraft: (text: string | null) => void
  addPackage: (pkg: NodePackage) => void
  removePackage: (id: string) => void
  setParam: (nodeId: string, paramId: string, value: number | null) => void
  openDialog: (tab: BuilderTab, seed?: string) => void
  closeDialog: () => void
  /** The Icons tab's node (null: the first of My nodes). */
  iconFor: string | null
  editIcon: (nodeId: string) => void
}

/** localStorage can be missing or throw (private windows, blocked site data): fall back to memory. */
const memory = new Map<string, string>()
const storage: StateStorage = {
  getItem: (k) => { try { return window.localStorage.getItem(k) } catch { return memory.get(k) ?? null } },
  setItem: (k, v) => { try { window.localStorage.setItem(k, v) } catch { memory.set(k, v) } },
  removeItem: (k) => { try { window.localStorage.removeItem(k) } catch { memory.delete(k) } },
}

const looksLikePackage = (p: unknown): p is NodePackage =>
  !!p && typeof (p as NodePackage).id === 'string' && (p as NodePackage).id.startsWith('community.') && Array.isArray((p as NodePackage).metrics)

const switchOn = (ids: string[]) => useStore.setState((s) => ({ enabled: { ...s.enabled, ...Object.fromEntries(ids.map((id) => [id, true])) } }))

export const useCommunityStore = create<CommunityState>()(persist((set) => ({
  packages: [],
  params: {},
  dialog: null,
  seed: '',
  addPackage: (pkg) => {
    set((s) => {
      // A new version of the same node replaces the old one and keeps parameter edits that still apply.
      const ids = new Set((pkg.parameters ?? []).map((x) => x.id))
      const kept = Object.fromEntries(Object.entries(s.params[pkg.id] ?? {}).filter(([k]) => ids.has(k)))
      return { packages: [...s.packages.filter((p) => p.id !== pkg.id), pkg], params: { ...s.params, [pkg.id]: kept } }
    })
    switchOn([pkg.id])
    useStore.setState({ selectedNode: pkg.id, announce: `${pkg.name} added to My nodes` })
  },
  removePackage: (id) => {
    set((s) => {
      const { [id]: _drop, ...params } = s.params
      return { packages: s.packages.filter((p) => p.id !== id), params }
    })
    const app = useStore.getState()
    useStore.setState({ selectedNode: app.selectedNode === id ? null : app.selectedNode, announce: 'Node removed from My nodes' })
  },
  setParam: (nodeId, paramId, value) => set((s) => {
    const cur = { ...(s.params[nodeId] ?? {}) }
    if (value === null || !Number.isFinite(value)) delete cur[paramId]
    else cur[paramId] = value
    return { params: { ...s.params, [nodeId]: cur } }
  }),
  draft: null,
  setDraft: (draft) => set({ draft }),
  openDialog: (dialog, seed = '') => set({ dialog, seed }),
  closeDialog: () => set({ dialog: null }),
  iconFor: null,
  editIcon: (iconFor) => set({ dialog: 'icon', iconFor }),
}), {
  name: 'tower-studio.my-nodes',
  version: 1,
  storage: createJSONStorage(() => storage),
  partialize: (s) => ({ packages: s.packages, params: s.params }),
  merge: (persisted, current) => {
    const p = (persisted ?? {}) as Partial<CommunityState>
    const packages = Array.isArray(p.packages) ? p.packages.filter(looksLikePackage) : []
    return { ...current, packages, params: p.params && typeof p.params === 'object' ? p.params : {} }
  },
  // Imported nodes start switched on after a reload, like the built ones.
  onRehydrateStorage: () => (s) => { if (s?.packages.length) switchOn(s.packages.map((p) => p.id)) },
}))

/** Imported nodes as library entries (NodeDef, status 'community'). */
export function useCommunityNodeDefs() {
  const packages = useCommunityStore((s) => s.packages)
  return useMemo(() => packages.map(toNodeDef), [packages])
}
