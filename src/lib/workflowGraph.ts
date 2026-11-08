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
/** Is this wire a loop (back to an earlier node of the run, or to itself)? */
export function isLoopIn(run: string[], e: Edge): boolean {
  const r = rankIn(run)
  return r(e.a) >= 0 && r(e.b) >= -1 && r(e.b) <= r(e.a) && e.b !== 'enter'
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
  const run = walk(board.edges)
  return { nodes: board.nodes, edges: board.edges.filter((e) => !isLoopIn(run, e)) }
}
