// Book node #17 (21 Nov, built.base-edges → "Square: seen, crossed, edged, level"): the square as a fifth frontage on the
// competition block, its sight lines from the sidewalks, the station's desire line across it, a glazed lobby edge, the
// sunken rules, a type label and the L1–L6 base (engine/squareEdges.ts).
import { describe, expect, it } from 'vitest'
import { evidenceGroups } from '../lib/evidence/engines'
import { fixFor } from '../lib/fixes'
import { defaultTower, useStore } from '../store'
import { DEFAULT_PUBLIC_REALM, type PublicRealmInput } from './publicRealm'
import { REGULAR_MIN, squareEdges } from './squareEdges'
import type { RuleResult, Tower } from './types'

const block = (over: Partial<Tower>): Tower => ({
  id: 't1', name: 'Tower 1', x: 0, y: 0, rotation: 0, width: 40, depth: 40, height: 285, f2f: 4.2,
  podiumHeight: 0, podiumWidth: 0, podiumDepth: 0, podiumUse: 'retail',
  bands: [{ use: 'office', share: 0.55 }, { use: 'hotel', share: 0.15 }, { use: 'residential', share: 0.3 }],
  coreShare: 0.21, plantEvery: 0, skyLobbies: [], skyRoom: null, ...over,
})
/** A podium over the east of the block, full depth: the square is the west part, on the station corner. */
const westSquare = block({ x: 32.39, podiumHeight: 18, podiumWidth: 80, podiumDepth: 79.25 })
/** The mirror: podium over the west, the square at the east end, away from the station. */
const eastSquare = block({ x: -32.39, podiumHeight: 18, podiumWidth: 80, podiumDepth: 79.25 })
const run = (towers: Tower[], square?: PublicRealmInput['square']) => squareEdges(towers, { ...DEFAULT_PUBLIC_REALM, square })
const line = (rules: RuleResult[], id: string) => rules.find((r) => r.id === id)!
const pctOf = (v: string, word: string) => Number(new RegExp(`(\\d+)% ${word}`).exec(v)?.[1])

describe('the square as a fifth frontage (book node #17)', () => {
  it('splits the edge into street, building face and blank, reads the face active from the ground use, and cites its pages', () => {
    const { rules, reading } = run([westSquare])
    const e = line(rules, 'pr-square-edge')
    expect(reading.square!.x0).toBeCloseTo(-72.39, 1)
    // Three sides on streets (west, north, south), the east side the podium face.
    expect(pctOf(e.value, 'street')).toBeGreaterThan(65)
    expect(pctOf(e.value, 'building face')).toBeGreaterThan(20)
    expect(pctOf(e.value, 'blank')).toBe(0)
    expect(e).toMatchObject({ state: 'pass', flag: 'team_assumption', source: { page: expect.stringContaining('pp.10, 50, 82') } })
    expect(e.value).toMatch(/100% of the face active/)
    expect(e.note).toMatch(/ground storey's use \(retail\)/)
    expect(e.specialist).toBeUndefined()
    expect(line(rules, 'pr-square-type').value).toMatch(/^corner \(cf\. 155 N Wacker, pp\.189–190\)/)
  })
  it('a typed active share under half warns; a glazed lobby counts active, clipped to the face on its side', () => {
    const low = line(run([westSquare], { active: 0.3 }).rules, 'pr-square-edge')
    expect(low.state).toBe('warn')
    expect(fixFor('pr-square-edge', 'warn', low.value, low.threshold, low.flag)).toMatch(/glazed public lobby/)
    const withLobby = run([westSquare], { active: 0.3, lobby: { side: 'east', length: 60 } })
    expect(withLobby.reading.lobby).toBeGreaterThan(50)
    expect(line(withLobby.rules, 'pr-square-edge').state).toBe('pass')
    expect(line(withLobby.rules, 'pr-square-lobby')).toMatchObject({ state: 'pass', source: { page: 'pp.192, 213–214' } })
    expect(line(withLobby.rules, 'pr-square-type').value).toMatch(/flanking/)
    // The west side opens to the arterial: no face there for a lobby.
    expect(line(run([westSquare], { lobby: { side: 'west', length: 20 } }).rules, 'pr-square-lobby')).toMatchObject({ state: 'warn', value: expect.stringMatching(/no building face/) })
    expect(line(run([westSquare]).rules, 'pr-square-lobby')).toMatchObject({ state: 'unknown', value: 'None declared' })
  })
  it('seen from the sidewalks; a sunken square loses sight lines and needs two step-free entries', () => {
    const grade = run([westSquare])
    expect(line(grade.rules, 'pr-square-seen')).toMatchObject({ state: 'pass', source: { page: 'pp.173, 199' } })
    expect(line(grade.rules, 'pr-square-level')).toMatchObject({ state: 'pass', value: 'At grade (+0.0 m)', source: { page: 'p.172' } })
    const sunk = run([westSquare], { level: -3, stepFree: 1 })
    expect(sunk.reading.seen!.points).toBeLessThan(grade.reading.seen!.points)
    expect(line(sunk.rules, 'pr-square-seen').value).toMatch(/if it were at grade/)
    const lv = line(sunk.rules, 'pr-square-level')
    expect(lv).toMatchObject({ state: 'warn', value: expect.stringMatching(/^3\.0 m below the sidewalk: 1 step-free entry/) })
    expect(fixFor('pr-square-level', 'warn', lv.value, lv.threshold, lv.flag)).toMatch(/two step-free entries/)
    expect(line(run([westSquare], { level: -3, stepFree: 2 }).rules, 'pr-square-level').state).toBe('pass')
    expect(line(sunk.rules, 'pr-square-type').value).toMatch(/^sunken \(p\.172\)/)
  })
  it('the desire line: straight from the station across a square on its corner; a detour when the podium stands between', () => {
    const near = run([westSquare]).reading.desire[0]
    expect(near.label).toMatch(/^station → across the square/)
    expect(near.detour).toBeLessThan(1.05)
    const far = run([eastSquare])
    expect(far.reading.desire[0].detour).toBeGreaterThan(near.detour)
    const d = line(far.rules, 'pr-square-desire')
    expect(d.source).toMatchObject({ page: 'pp.190, 195' })
    expect(d.value).toMatch(/detour \d\.\d\d/)
    // The link's far end is walked to the square too.
    expect(far.reading.desire.some((x) => /end of the link/.test(x.label))).toBe(true)
  })
  it('a courtyard: building faces on three sides', () => {
    const bars = [block({ id: 'n', y: 30, width: 100, depth: 19, height: 20 }), block({ id: 's', y: -30, width: 100, depth: 19, height: 20 }), block({ id: 'e', x: 55, width: 30, depth: 79.25, height: 20 })]
    expect(line(run(bars).rules, 'pr-square-type').value).toMatch(/courtyard \(cf\. Trinity Place, pp\.185–186\)/)
  })
  it('an irregular square (its rectangle under half the open ground round it) carries the specialist marker', () => {
    const lone = block({ width: 30, depth: 30 })
    const r = run([lone])
    expect(r.reading.regular).toBeLessThan(REGULAR_MIN)
    for (const id of ['pr-square-edge', 'pr-square-seen', 'pr-square-desire', 'pr-square-type']) expect(line(r.rules, id).specialist, id).toMatch(/irregular/)
    // Its east side meets a 30 m tower face and 49 m of open ground: more blank than face warns, however active the face.
    const e = line(r.rules, 'pr-square-edge')
    expect(pctOf(e.value, 'blank')).toBeGreaterThan(pctOf(e.value, 'building face'))
    expect(e.state).toBe('warn')
    expect(fixFor('pr-square-edge', 'warn', e.value, e.threshold, e.flag)).toMatch(/blank sides/)
  })
  it('L1–L6: the street-facing storeys, L1 from the street inputs, above it active only for retail, civic or amenity', () => {
    const shops = line(run([westSquare]).rules, 'pr-base-six')
    expect(shops).toMatchObject({ flag: 'team_assumption', source: { page: 'p.75' } })
    const hotel = line(run([{ ...westSquare, floorUses: { 3: 'hotel', 4: 'hotel', 5: 'hotel', 6: 'hotel' } }]).rules, 'pr-base-six')
    expect(hotel.value).toMatch(/L3–L6 hotel/)
    expect(pctOf(hotel.value, 'of')).toBeLessThan(pctOf(shops.value, 'of'))
    expect(hotel.state).toBe('warn')
    expect(fixFor('pr-base-six', 'warn', hotel.value, hotel.threshold, hotel.flag)).toMatch(/L2–L6/)
  })
  it('wired into the evidence: competition lines under Active frontage; Real Vancouver says plainly why they wait', () => {
    const s = useStore.getState()
    const base = { towers: [defaultTower('vtc')], fsrTier: 2 as const, transitLink: false, liftPresets: s.liftPresets, egressPresets: s.egressPresets, publicRealm: s.publicRealm, cityInNature: s.cityInNature, windPresets: { tunnelDefaultHeight: 180, f1: null } }
    const vtc = (evidenceGroups({ ...base, project: 'vtc' })['built.pr-frontage'] as RuleResult[]).map((r) => r.id)
    for (const id of ['pr-square-edge', 'pr-square-seen', 'pr-square-desire', 'pr-square-lobby', 'pr-square-level', 'pr-square-type', 'pr-base-six']) expect(vtc).toContain(id)
    const city = evidenceGroups({ ...base, project: 'city', towers: [defaultTower('city', [254, 486])] })['built.pr-frontage'] as RuleResult[]
    const c = line(city, 'pr-square-edge')
    expect(c).toMatchObject({ state: 'unknown', flag: 'unresolved' })
    expect(c.specialist).toMatch(/Real Vancouver/)
  })
})
