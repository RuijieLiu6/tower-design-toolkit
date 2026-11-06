import { describe, expect, it } from 'vitest'
import { defaultTower } from '../store'
import { checkTowerCones } from '../engine/towerCones'
import { vtcRules } from '../engine/vtcRules'
import { coneRows, fixFor, ruleKey } from './fixes'
import { CITY_ORIGIN } from '../store'

describe('pass or fail, with what to fix', () => {
  it('names the move and where it is made for the rules it knows; passes need no fix', () => {
    expect(fixFor('height', 'fail', '320 m')).toMatch(/244–305 m.*Massing/)
    expect(fixFor('stair-width', 'warn', '1,600 mm')).toMatch(/Exit stairs/)
    expect(fixFor('pr-entrances', 'fail', '20 m')).toMatch(/8–12 m/)
    expect(fixFor('height', 'pass', '285 m')).toBeNull()
    expect(fixFor('fsr-nonres', 'warn', '10.35')).toMatch(/strictest/)
    expect(fixFor('fsr-nonres', 'fail', '7.10')).toMatch(/until it reaches FSR 9.0/)
  })
  it('falls back on the rule\'s own threshold, and says when the sources leave it open', () => {
    expect(fixFor('something-new', 'fail', '12', '≤ 10')).toBe('Needs ≤ 10; now 12.')
    expect(fixFor('something-new', 'warn', 'n/a', undefined, 'unresolved')).toMatch(/person has to decide/)
  })
  it('strips the tower from a rule id', () => {
    expect(ruleKey('stair-width-t1', 't1')).toBe('stair-width')
    expect(ruleKey('rise-floors-gen1x-0', 'gen1x-0')).toBe('rise-floors')
    expect(ruleKey('containment', '')).toBe('containment')
  })
  it('every competition rule that can fail on the starting tower gets a specific instruction', () => {
    const t = { ...defaultTower('vtc'), height: 330 }
    for (const r of vtcRules([t], { fsrTier: 2, transitLink: false })) {
      const key = ruleKey(r.id, t.id)
      if (r.state !== 'pass') expect(fixFor(key, r.state, r.value, r.threshold, r.flag), r.id).not.toMatch(/^Needs |See Details/)
    }
  })
  it('view cones: one row per cone entered, with the metres to lose for the ones it rises above', () => {
    const t = defaultTower('city')
    const checks = checkTowerCones(t, 23.9, CITY_ORIGIN)
    const topZ = 23.9 + t.height
    const { rows, outside } = coneRows(t.id, t.name, checks, topZ)
    expect(rows.length + outside).toBe(checks.length)
    const above = rows.find((r) => r.state === 'fail')
    expect(above?.fix).toMatch(/Lower Study tower's top by [\d.]+ m \(to [\d.,]+ m geodetic\)/)
  })
})
