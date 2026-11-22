// Nodes split out of another node (21 Nov 2026, node placement: 04 Tool Plan/vtc-entry/research/books/NODE_PLACEMENT.md).
// The Higher Buildings area and ceiling left Relaxations & aviation, a part of Site limits (data/registry.ts MERGES), for
// a node of their own, built.hbp. Old projects and saved workflows keep working: a list saved before the split that
// switched the old host on switches the new node on too, right after its host, once. Every record saved since carries
// the splits it already has (a project file's `nodes.known`, a workflow's `splits`), so a node taken out afterwards stays
// out. Pure functions; the stores call them where they read their records.
import { insertAfter, walk, type Board } from './workflowGraph'

export interface Split {
  /** The node split out. */
  id: string
  /** The nodes that switched it on before the split: the old host and the merged tool it was a part of. */
  hosts: string[]
}

export const SPLITS: readonly Split[] = [{ id: 'built.hbp', hosts: ['built.relax-aviation', 'built.viewcones'] }]
/** What a record saved today already has: written into every saved workflow. */
export const SPLIT_IDS: readonly string[] = SPLITS.map((s) => s.id)

/** The splits a record saved with `done` still needs (`null` or missing: saved before any split). */
export const pendingSplits = (done?: readonly string[] | null): Split[] => SPLITS.filter((s) => !done?.includes(s.id))

/** A node list saved before the splits: each split-out node joins right after the first of its hosts, if one is there. */
export function upgradeIds(ids: readonly string[], done?: readonly string[] | null): string[] {
  let out = [...ids]
  for (const s of pendingSplits(done)) {
    if (out.includes(s.id)) continue
    const at = out.findIndex((x) => s.hosts.includes(x))
    if (at >= 0) out = [...out.slice(0, at + 1), s.id, ...out.slice(at + 1)]
  }
  return out
}

/** A board (nodes and wires) saved before the splits: the new node goes on the wire right after its host, or beside an unwired host. */
export function upgradeBoard<B extends Board>(b: B, done?: readonly string[] | null): B {
  let next: Board = { nodes: b.nodes, edges: b.edges }
  for (const s of pendingSplits(done)) {
    if (next.nodes.includes(s.id)) continue
    const host = next.nodes.find((x) => s.hosts.includes(x))
    if (!host) continue
    const nodes = upgradeIds(next.nodes, SPLIT_IDS.filter((id) => id !== s.id))
    next = walk(next.edges).includes(host) ? { ...insertAfter(next, s.id, host), nodes } : { nodes, edges: next.edges }
  }
  return next.nodes === b.nodes ? b : { ...b, nodes: next.nodes, edges: next.edges }
}

/**
 * A switched-on record (store.enabled) kept from before the splits, e.g. a decision-trace snapshot: the new node takes its
 * host's switch. A record that has the node's key at all (true or false) was made after the split and is left alone:
 * store.setEnabled and the project reader always write it (splitKeys).
 */
export function upgradeEnabled(rec: Record<string, boolean>): Record<string, boolean> {
  let out = rec
  for (const s of SPLITS) if (!(s.id in out)) out = { ...out, [s.id]: s.hosts.some((h) => !!rec[h]) }
  return out
}

/** The split-out nodes' keys for a record built from a list of ids: false where the list leaves them off. */
export const splitKeys = (on: readonly string[]): Record<string, boolean> => Object.fromEntries(SPLIT_IDS.filter((id) => !on.includes(id)).map((id) => [id, false]))
