import { describe, expect, it } from 'vitest'
import { evidenceGroups } from './evidence/engines'
import { defaultTower, useStore } from '../store'
import { fixFor, ruleKey } from './fixes'
import type { RuleResult } from '../engine/types'

// Node audit (7 Nov): every line that warns or fails, in every built node and on both projects, says what to do: no
// warning or failure falls back on the generic "Rule: … This design: …" text. Open items (unknown) may point to Details.
describe('every warning and failure has an instruction of its own', () => {
  const s = useStore.getState()
  for (const project of ['vtc', 'city'] as const) {
    it(`on the ${project === 'vtc' ? 'competition site' : 'Real Vancouver default site'}`, () => {
      const t = project === 'vtc' ? defaultTower('vtc') : { ...defaultTower('city', [240, 472]), height: 285 }
      const g = evidenceGroups({ project, towers: [t], fsrTier: 2, transitLink: false, liftPresets: s.liftPresets, egressPresets: s.egressPresets, publicRealm: s.publicRealm, cityInNature: s.cityInNature, windPresets: { tunnelDefaultHeight: 180, f1: null } })
      const generic: string[] = []
      let seen = 0
      for (const [node, v] of Object.entries(g)) {
        const lines = (Array.isArray(v) ? v.flat(3) : (v as { rules?: RuleResult[] })?.rules ?? []) as RuleResult[]
        for (const r of lines) {
          if (!r || typeof r !== 'object' || !('state' in r) || (r.state !== 'warn' && r.state !== 'fail')) continue
          seen++
          const f = fixFor(ruleKey(r.id, t.id), r.state, r.value, r.threshold, r.flag) ?? ''
          if (/^Rule: |See Details for the rule/.test(f)) generic.push(`${node} ${ruleKey(r.id, t.id)}`)
        }
      }
      expect(seen).toBeGreaterThan(20)
      expect(generic).toEqual([])
    })
  }
})
