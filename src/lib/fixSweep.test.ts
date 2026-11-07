import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import defaultSite from '../data/defaultSite.json'
import { DEFAULT_CITY_LINK, siteStreets, type StreetLineLike } from '../engine/siteStreets'
import { decodeFootprints } from './cityLayers'
import { evidenceGroups, type EvidenceInput } from './evidence/engines'
import { defaultTower, useStore } from '../store'
import { fixFor, ruleKey } from './fixes'
import type { RuleResult } from '../engine/types'

// Node audit (7 Nov): every line that warns or fails, in every built node and on both projects, says what to do: no
// warning or failure falls back on the generic "Rule: … This design: …" text. Open items (unknown) may point to Details.
// Real Vancouver with its streets typed (7 Nov): the default site's streets from the City layers, a driveway across the
// retail street, a narrow link through the podium and a station entrance, so the street lines warn and fail too.
const file = (f: string) => new URL(`../../public/data/${f}`, import.meta.url)
function typedStreets(): Pick<EvidenceInput, 'cityRing' | 'cityStreets'> {
  const lines = (JSON.parse(readFileSync(file('city_streets.json'), 'utf8')) as { lines: StreetLineLike[] }).lines
  const b = readFileSync(file('parcels.bin'))
  const ring = defaultSite.ring as [number, number][]
  const found = siteStreets(ring, lines, decodeFootprints(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer))
  return { cityRing: ring, cityStreets: { streets: found.streets, station: 'GRANVILLE ST', link: { ...DEFAULT_CITY_LINK, enabled: true, width: 6, srw: false, openToSky: false },
    settings: { 'GRANVILLE ST': { type: 'retail', active: 0.4, entrances: 2, canopy: 0.2, crossings: 1 }, 'HOWE ST': { type: 'arterial', active: 0.6 }, 'W PENDER ST': { type: 'local' }, 'DUNSMUIR ST': { type: 'local' } } } }
}

describe('every warning and failure has an instruction of its own', () => {
  const s = useStore.getState()
  for (const project of ['vtc', 'city', 'city-streets'] as const) {
    it(`on the ${project === 'vtc' ? 'competition site' : project === 'city' ? 'Real Vancouver default site' : 'Real Vancouver default site with its streets typed'}`, () => {
      const t = project === 'vtc' ? defaultTower('vtc') : { ...defaultTower('city', [254, 486]), height: 285, rotation: 45.2 }
      const g = evidenceGroups({ project: project === 'vtc' ? 'vtc' : 'city', towers: [t], fsrTier: 2, transitLink: false, liftPresets: s.liftPresets, egressPresets: s.egressPresets, publicRealm: s.publicRealm, cityInNature: s.cityInNature, windPresets: { tunnelDefaultHeight: 180, f1: null },
        ...(project === 'city-streets' ? typedStreets() : {}) })
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
