import { describe, expect, it } from 'vitest'
import { dotRoute } from './coverRun'
import { edgeKey, type Edge } from './workflowGraph'

const E = (a: string, b: string): Edge => ({ a, b })
const keys = (es: Edge[]) => es.map(edgeKey)

describe('the travelling dots’ route', () => {
  it('runs a workflow without loops once, in order', () => {
    const es = [E('start', 'm'), E('m', 's'), E('s', 'p'), E('p', 'enter')]
    expect(dotRoute(es, new Set())).toEqual(keys(es))
  })
  it('goes round a loop twice before moving to the next step', () => {
    // massing → sunlight study → return to massing, then on to program
    const fwd = [E('start', 'm'), E('m', 's'), E('s', 'p'), E('p', 'enter')], back = E('s', 'm')
    const route = dotRoute([...fwd, back], new Set([edgeKey(back)]))
    expect(route).toEqual(['start>m', 'm>s', 's>m', 'm>s', 's>m', 'm>s', 's>p', 'p>enter'])
    expect(route.filter((k) => k === 's>m')).toHaveLength(2)
  })
  it('takes a longer loop’s every step on each lap, and handles two loops', () => {
    const fwd = [E('start', 'a'), E('a', 'b'), E('b', 'c'), E('c', 'd'), E('d', 'enter')]
    const r1 = E('c', 'a'), r2 = E('d', 'c')
    const route = dotRoute([...fwd, r1, r2], new Set([edgeKey(r1), edgeKey(r2)]))
    expect(route).toEqual([
      'start>a', 'a>b', 'b>c',
      'c>a', 'a>b', 'b>c', 'c>a', 'a>b', 'b>c', // round a → b → c twice
      'c>d',
      'd>c', 'c>d', 'd>c', 'c>d', // round c → d twice
      'd>enter',
    ])
  })
})
