// The cover's travelling dots: the route they take through the workflow (Ruijie, 7 Nov: "the travelling dots will go in
// the loop two times before moving to the next step"). Forward wires run in the workflow's order; when the run reaches
// the node a loop returns from, the dots go back along the return connection and through the loop's steps again, twice,
// and only then move on. Pure, so it is tested without a screen (coverRun.test.ts).
import { edgeKey, walk, type Edge } from './workflowGraph'

/** How many times the dots go round a loop before moving on. */
export const LAPS = 2

/** Wire keys in the order the dots travel them; a wire inside a loop appears once per pass. */
export function dotRoute(edges: Edge[], returns: Set<string>, laps = LAPS): string[] {
  const order = walk(edges)
  const rank = (id: string) => (id === 'start' ? -1 : id === 'enter' ? Number.MAX_SAFE_INTEGER : Math.max(0, order.indexOf(id)))
  const forward = edges.filter((e) => !returns.has(edgeKey(e))).sort((x, y) => rank(x.a) - rank(y.a) || rank(x.b) - rank(y.b))
  const backs = edges.filter((e) => returns.has(edgeKey(e)))
  const done = new Set<string>()
  const out: string[] = []
  for (const f of forward) {
    out.push(edgeKey(f))
    // arriving at f.b: a loop that returns from here runs now, `laps` times (back along the return, then its steps)
    for (const r of backs) {
      const k = edgeKey(r)
      if (r.a !== f.b || done.has(k)) continue
      done.add(k)
      const body = forward.filter((e) => rank(e.a) >= rank(r.b) && rank(e.a) < rank(r.a) && rank(e.b) <= rank(r.a))
      for (let lap = 0; lap < laps; lap++) out.push(k, ...body.map(edgeKey))
    }
  }
  return out
}
