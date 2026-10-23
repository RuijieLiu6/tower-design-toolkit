// Runs every evaluation case at the engine level. With EVAL_OUT set (the runner, tools/run_eval.mjs), the results are
// also written as JSON for the dated report; a failing case is recorded there, never skipped.
import { writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { CASES, runCase, type CaseResult } from './cases'

const OUT = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.EVAL_OUT
const OUT_URL = OUT ? new URL('engine.json', 'file:///' + OUT.split(String.fromCharCode(92)).join('/') + '/') : null
const results: CaseResult[] = []

describe('evaluation cases (engine level)', () => {
  for (const c of CASES) {
    it(`${c.id} · ${c.type} · ${c.title}`, () => {
      const r = runCase(c)
      results.push(r)
      if (OUT) writeFileSync(OUT_URL!, JSON.stringify(results, null, 1))
      expect(r.error ?? null).toBeNull()
      expect({ id: r.id, observed: r.observed, pass: r.pass }).toEqual({ id: r.id, observed: r.observed, pass: true })
    })
  }
  it('covers every case type and each new node with a typical and an out-of-scope case', () => {
    expect(new Set(CASES.map((c) => c.type))).toEqual(new Set(['typical', 'boundary', 'out-of-scope', 'repeated', 'definition']))
    for (const n of ['built.core-lifts', 'built.solar-access', 'built.wind-procedure', 'built.energy-carbon', 'built.mobility', 'built.view-from', 'built.vista']) {
      const types = CASES.filter((c) => c.node === n).map((c) => c.type)
      expect(types, n).toContain('typical'); expect(types, n).toContain('out-of-scope')
    }
  })
})
