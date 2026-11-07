import { describe, expect, it } from 'vitest'
import { defaultTower } from '../store'
import { checkTowerCones } from '../engine/towerCones'
import { vtcRules } from '../engine/vtcRules'
import { aviationChecklist, relaxationChecklist } from '../engine/relaxAviation'
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
  it('every relaxation and aviation line that does not pass gets its own instruction (node audit, 7 Nov)', () => {
    // A 285 m tower at the default Real Vancouver site (under the Queen Elizabeth Park view, near the harbour aerodromes).
    const t = { ...defaultTower('city', [240, 472]), height: 285 }
    const lines = [...relaxationChecklist(t, [], 23.7, 11225, CITY_ORIGIN), ...aviationChecklist(t, [t.x + CITY_ORIGIN[0], t.y + CITY_ORIGIN[1]])]
    const open = lines.filter((r) => r.state !== 'pass')
    expect(open.length).toBeGreaterThan(5)
    for (const r of open) expect(fixFor(ruleKey(r.id, t.id), r.state, r.value, r.threshold, r.flag), r.id).not.toMatch(/^Needs |See Details|Not computed|a person has to decide/)
    expect(fixFor('relax-eds', 'fail', '5,000 m²')).toMatch(/8,000 m²/)
    expect(fixFor('relax-eds', 'unknown', '')).toMatch(/Site step/)
    // The ground plane's sun and wind lines: switch the node on, or read where it found the problem.
    expect(fixFor('pr-sun', 'unknown', 'Switch on Solar access & sun hours')).toMatch(/^Switch on/)
    expect(fixFor('pr-sun', 'fail', '1 pass, 1 fail of 2 solar lines')).toMatch(/^Open Solar access/)
    expect(fixFor('pr-wind', 'warn', '6 high and 0 medium risk zones at the ground')).toMatch(/^Open Pedestrian wind/)
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
