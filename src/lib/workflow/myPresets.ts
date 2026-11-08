// "Save as preset" (Ruijie, 7 Nov: "Changes to the project's workflow should preserve the original library preset.
// Provide a separate Save as preset action if users want to reuse their revised workflow"). A copy of the workflow kept in
// this browser under its own name; the library presets are never changed. The landing page lists them under "My presets".
import type { Edge } from '../workflowGraph'

export interface MyPreset { id: string; name: string; nodes: string[]; edges: Edge[]; savedAt: string }
const KEY = 'ts.myPresets'

export function listMyPresets(): MyPreset[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]') as MyPreset[]
    return Array.isArray(v) ? v.filter((p) => p && typeof p.id === 'string' && Array.isArray(p.nodes) && Array.isArray(p.edges)) : []
  } catch { return [] }
}

/** Saves a copy (a new id each time; the same name replaces the older copy). */
export function saveMyPreset(name: string, nodes: string[], edges: Edge[]): MyPreset {
  const p: MyPreset = { id: `my.${Date.now().toString(36)}`, name: name.trim() || 'My workflow', nodes: [...nodes], edges: edges.map((e) => ({ a: e.a, b: e.b })), savedAt: new Date().toISOString() }
  const rest = listMyPresets().filter((x) => x.name !== p.name)
  try { localStorage.setItem(KEY, JSON.stringify([p, ...rest].slice(0, 30))) } catch { /* this visit only */ }
  return p
}
