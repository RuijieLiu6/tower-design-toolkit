// A workflow as a graph of nodes and wires, shared by the cover's string (components/landing/Intro.tsx) and the workflow
// assistant (lib/agent/workflowAssistant.ts). Pure functions: the board is the nodes put down plus the wires between
// them, from Start to Enter; the run is what Start reaches along the wires, in that order; a wire back to an earlier node
// (or to itself) is a loop.
import { PHASES } from './phases'

export type Edge = { a: string; b: string }
export interface Board { nodes: string[]; edges: Edge[] }

export const edgeKey = (e: Edge) => `${e.a}>${e.b}`
/** A node's phase position (Site 0 … Present 4). */
export const phaseIndex = (id: string) => Math.max(0, PHASES.findIndex((p) => p.nodes.includes(id)))
/** Nodes in phase order (stable within a phase). */
export const byPhase = (ids: string[]) => [...ids].sort((a, b) => phaseIndex(a) - phaseIndex(b))
/** Start → each node in turn → Enter. */
export const linear = (ids: string[]): Edge[] => { const seq = ['start', ...ids, 'enter']; return seq.slice(0, -1).map((a, k) => ({ a, b: seq[k + 1] })) }
/** The nodes Start reaches along the wires, in the order it reaches them. */
export function walk(edges: Edge[]): string[] {
  const out: string[] = [], seen = new Set(['start']), queue = ['start']
  while (queue.length) {
    const a = queue.shift()!
    for (const e of edges) if (e.a === a && !seen.has(e.b)) { seen.add(e.b); if (e.b !== 'enter') out.push(e.b); queue.push(e.b) }
  }
  return out
}
const rankIn = (run: string[]) => (id: string) => (id === 'start' ? -1 : id === 'enter' ? 1e9 : run.indexOf(id))
/** Is this wire a return connection (it closes a loop)? Decided from the wires alone (returnEdges below). */
export function isLoopIn(edges: Edge[], e: Edge): boolean {
  return returnEdges(edges).has(edgeKey(e))
}
const has = (es: Edge[], a: string, b: string) => es.some((e) => e.a === a && e.b === b)
/** Only wires between things on the board, once each, never a node to itself. */
export function clean(board: Board): Board {
  const ok = new Set([...board.nodes, 'start', 'enter']), seen = new Set<string>()
  return { nodes: board.nodes, edges: board.edges.filter((e) => e.a !== e.b && ok.has(e.a) && ok.has(e.b) && !seen.has(edgeKey(e)) && !!seen.add(edgeKey(e))) }
}

/** Put `id` on the wire a → b (or after a when there is no such wire). */
export function insertOn(board: Board, id: string, a: string, b: string): Board {
  const rest = board.edges.filter((e) => !(e.a === a && e.b === b))
  return clean({ nodes: board.nodes.includes(id) ? board.nodes : [...board.nodes, id], edges: [...rest, { a, b: id }, { a: id, b }] })
}
/** Put `id` into the run after `after` (the next node, or Enter, follows it). */
export function insertAfter(board: Board, id: string, after: string): Board {
  const run = walk(board.edges), q = after === 'start' ? run[0] ?? 'enter' : run[run.indexOf(after) + 1] ?? 'enter'
  return insertOn(board, id, after, has(board.edges, after, q) ? q : 'enter')
}
/** Put `id` into the run in phase order: after the last node of its phase or an earlier one. */
export function insertByPhase(board: Board, id: string): Board {
  const run = walk(board.edges)
  let p = 'start'
  run.forEach((x) => { if (phaseIndex(x) <= phaseIndex(id)) p = x })
  return insertAfter(board, id, p)
}
/** Take `id` off the board; the wires through it are joined up (loops through it are dropped). */
export function takeOff(board: Board, id: string): Board {
  const run = walk(board.edges), r = rankIn(run)
  const ins = board.edges.filter((e) => e.b === id && e.a !== id), outs = board.edges.filter((e) => e.a === id && e.b !== id)
  const rest = board.edges.filter((e) => e.a !== id && e.b !== id)
  for (const u of ins) for (const v of outs) if (r(u.a) < r(v.b) && !has(rest, u.a, v.b)) rest.push({ a: u.a, b: v.b })
  return clean({ nodes: board.nodes.filter((x) => x !== id), edges: rest })
}
/** A loop from `from` back to `to` (both on the run, `to` not after `from`). */
export function addLoop(board: Board, from: string, to: string): Board {
  return has(board.edges, from, to) ? board : clean({ nodes: board.nodes, edges: [...board.edges, { a: from, b: to }] })
}
/** The board without its loops. */
export function dropLoops(board: Board): Board {
  const back = returnEdges(board.edges)
  return { nodes: board.nodes, edges: board.edges.filter((e) => !back.has(edgeKey(e))) }
}

// ---------- loops, from the directed wires alone (Ruijie, 7 Nov: "Determine whether a connection closes a loop from
// the graph's directed connections, not from node positions or stage columns") ----------
const outs = (edges: Edge[]) => { const m = new Map<string, Edge[]>(); for (const e of edges) m.set(e.a, [...(m.get(e.a) ?? []), e]); return m }

/**
 * The return connections: the wires that close a loop. A depth-first walk from Start (then from any node it did not
 * reach, so loops away from Start and Enter count too) marks a wire as a return when it goes to a node still on the
 * walk's path. Several returns may exist; a wire from a node to itself is one.
 */
export function returnEdges(edges: Edge[]): Set<string> {
  const out = outs(edges), state = new Map<string, 1 | 2>(), back = new Set<string>()
  const roots = ['start', ...new Set(edges.flatMap((e) => [e.a, e.b]))]
  for (const root of roots) {
    if (state.has(root)) continue
    const stack: { id: string; i: number }[] = [{ id: root, i: 0 }]
    state.set(root, 1)
    while (stack.length) {
      const top = stack[stack.length - 1], list = out.get(top.id) ?? []
      if (top.i >= list.length) { state.set(top.id, 2); stack.pop(); continue }
      const e = list[top.i++], s = state.get(e.b)
      if (s === 1) back.add(edgeKey(e))
      else if (!s) { state.set(e.b, 1); stack.push({ id: e.b, i: 0 }) }
    }
  }
  return back
}
/** Every node reachable from `from` along the forward wires (not the returns). */
function reach(edges: Edge[], returns: Set<string>, from: string, reverse = false): Set<string> {
  const seen = new Set([from]), queue = [from]
  while (queue.length) {
    const x = queue.shift()!
    for (const e of edges) {
      if (returns.has(edgeKey(e))) continue
      const [p, q] = reverse ? [e.b, e.a] : [e.a, e.b]
      if (p === x && !seen.has(q)) { seen.add(q); queue.push(q) }
    }
  }
  return seen
}
/** Would a new wire a → b close a loop (does b already reach a along the wires)? */
export function closesLoop(edges: Edge[], a: string, b: string): boolean {
  if (a === b) return true
  const returns = new Set<string>()
  return reach(edges, returns, b).has(a)
}
/** The wires one return closes: itself and every forward wire on a path from its target back to its source. */
export function loopRing(edges: Edge[], ret: Edge, returns = returnEdges(edges)): Set<string> {
  const inside = new Set([...reach(edges, returns, ret.b)].filter((x) => reach(edges, returns, ret.a, true).has(x)))
  const ring = new Set([edgeKey(ret)])
  for (const e of edges) if (!returns.has(edgeKey(e)) && inside.has(e.a) && inside.has(e.b)) ring.add(edgeKey(e))
  return ring
}
