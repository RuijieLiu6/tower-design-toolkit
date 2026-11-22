// Green and shared levels up the tower (book node #18, built.sky-villages): planted and shared levels sorted grade to roof,
// the largest, bottom and top gaps in storeys, homes per shared level; precedent about 10 storeys, about 25 at most
// (Ecocity pp.49, 70–71, 151, 157), Check above 25.
import { describe, expect, it } from 'vitest'
import { defaultTower, useStore } from '../store'
import { evidenceGroups } from '../lib/evidence/engines'
import { fixFor } from '../lib/fixes'
import { DEFAULT_INTERIOR } from './interior'
import { towerFloors } from './massing'
import { GAP_MAX, plantedLevels, sharedLevels, skyVillages } from './skyVillages'
import type { FacadeZone } from './sw/plate'
import { importedTower, rect, stack } from './testStoreys'
import type { SkyRoom, Tower } from './types'

const sq = (s: number) => rect(s, s)
const ROOM: SkyRoom = { level: 25, access: 'dedicated', free: true, hoursOpen: 16, visitorShare: 0.9, loadBasis: 'dining', visitMinutes: 60 }
// An A35n-like tower: a 4-storey civic podium, offices to L26 with a garden deck at L25 (+98 m, a smaller plate over
// L25–26), homes to L80 with a ring storey at L72 (+286 m). Sky lobbies L25–26 (the sky room at L25), a public stop
// at L72 on the sky room's lifts, a civic floor at L6, the L72 deck declared none.
function towerA(patch: Partial<Tower> = {}): Tower {
  const st = stack([
    { n: 4, f2f: 4.5, ring: sq(60), podium: true, use: 'civic' },
    { n: 20, f2f: 4, ring: sq(40), use: 'office' },
    { n: 2, f2f: 4, ring: sq(30), use: 'office' },
    { n: 45, f2f: 4, ring: sq(40), use: 'residential' },
    { n: 1, f2f: 4, ring: sq(30), use: 'residential' },
    { n: 8, f2f: 4, ring: sq(40), use: 'residential' },
  ])
  return { ...importedTower(st, { podiumTop: 18, coreSide: 16 }), name: 'A', skyLobbies: [25, 26], skyRoom: ROOM, publicStops: [{ level: 72, visitorShare: 1, label: 'restaurant' }],
    floorUses: { 6: 'civic' }, deckUses: [{ level: 72, use: 'none' }], ...patch }
}
const run = (t: Tower) => skyVillages(t, towerFloors(t), { north: 0 })
const line = (t: Tower, id: string) => run(t).rules.find((x) => x.id === id)!
const green = (from: number, to: number): FacadeZone => ({ face: 'all', from, to, strat: 'greenwall', wwr: 0.3, shgc: 0.4, depth: 0, pv: 0, operable: false })

describe('green and shared levels up the tower (book node #18)', () => {
  it('reads A35n’s 46-storey shared gap (L26 → L72) and Checks it, with the bottom and top gaps', () => {
    const l = line(towerA(), 'sv-shared')
    expect(l.value).toBe('podium to L4, L6 civic, L25 sky room, L26 sky lobby, L72 public stop: largest gap 46 storeys (L26 → L72, 184 m); bottom 2, top 9 storeys')
    expect(l).toMatchObject({ state: 'warn', flag: 'unverified' })
    expect(l.source.page).toBe('pp.49, 70–71, 151, 157')
    expect(l.threshold).toBe(`≤ ${GAP_MAX} storeys between levels (precedent: about every 10, about 25 at most)`)
    expect(l.note).toMatch(/precedent, not a rule/i)
    expect(l.note).toMatch(/Al-Kodmany p\.139/)
  })

  it('sees no planted level in A35n and names the garden at L25 and the ring at L72 among the decks to declare', () => {
    const l = line(towerA(), 'sv-planted')
    expect(l.value).toBe('no planted level above grade: grade → roof, 80 storeys (322 m)')
    expect(l.state).toBe('warn')
    // shared-level decks first: the typed garden and the ring, then the podium roof
    expect(l.note).toContain('Decks in that gap not declared planted: L25 +98 m 700 m², a shared level (no deck use: occupied), L72 +286 m 700 m², a shared level (declared none), L5 +18 m 2,000 m²')
  })

  it('counts declared planted decks and winter gardens, and passes when no gap exceeds 25 storeys (C35n-like)', () => {
    const base = towerA({ deckUses: [{ level: 25, use: 'planted', soilMm: 450 }, { level: 72, use: 'planted' }] })
    const st = base.imported!.storeys.map((s) => (s.level === 50 ? { ...s, useAreas: [{ use: 'none' as const, area: 300 }] } : s))
    const t = { ...base, imported: { ...base.imported!, storeys: st } }
    const l = line(t, 'sv-planted')
    expect(l.value).toBe('grade, L25 deck, L50 winter garden, L72 deck: largest gap 25 storeys (L25 → L50, 100 m); bottom 24, top 9 storeys')
    expect(l.state).toBe('pass')
    // 26 storeys between planted levels: Check
    const far = { ...t, deckUses: [{ level: 25, use: 'planted' as const }, { level: 72, use: 'none' as const }] }
    expect(line(far, 'sv-planted')).toMatchObject({ state: 'warn' })
    expect(line(far, 'sv-planted').value).toContain('largest gap 31 storeys (L50 → roof, 124 m)')
  })

  it('counts an open garden storey of an imported tower unless a deck use for the level says otherwise', () => {
    const base = towerA()
    const st = base.imported!.storeys.map((s) => (s.level === 40 ? { ...s, area: 256, loops: [sq(16)] } : s))
    const t = { ...base, imported: { ...base.imported!, storeys: st } }
    expect(plantedLevels(t, towerFloors(t), 0).list.marks.map((m) => [m.level, m.what])).toEqual([[40, ['open garden storey']]])
    const occupied = { ...t, deckUses: [{ level: 40, use: 'occupied' as const }] }
    expect(plantedLevels(occupied, towerFloors(occupied), 0).list.marks).toEqual([])
  })

  it('counts declared planters and greenwall bands on every storey they cover', () => {
    const ring = line(towerA({ planters: [{ level: 5, to: 80, length: 160, width: 0.6, label: 'ring planter' }] }), 'sv-planted')
    expect(ring.value).toBe('grade, L5–80 planter: largest gap 4 storeys (grade → L5, 18 m) (about the precedent’s 10); bottom 4, top 1 storeys')
    expect(ring.state).toBe('pass')
    const wall = run(towerA({ facadeZones: [green(30, 60)] })).planted
    expect(wall.marks.map((m) => m.level)).toEqual(Array.from({ length: 31 }, (_, i) => 30 + i))
    expect(wall.largest).toMatchObject({ storeys: 29, from: { what: ['grade'] } })
  })

  it('counts sky lobbies only with shared rooms, the sky room always', () => {
    const bare = towerA({ interior: { ...DEFAULT_INTERIOR, amenity: [] } })
    const s = sharedLevels(bare, towerFloors(bare))
    expect(s.marks.map((m) => m.level)).toEqual([6, 25, 72])
    expect(s.largest).toMatchObject({ storeys: 47 })
    expect(line(bare, 'sv-shared').note).toMatch(/none set, so plain sky lobbies do not count/)
  })

  it('reports homes per shared level beside SkyVille, and Checks homes with no shared level above the base', () => {
    const h = line(towerA(), 'sv-homes')
    expect(h.value).toMatch(/^about [\d,]+ homes over 4 shared levels above the base: about \d+ per level$/)
    expect(h).toMatchObject({ state: 'pass', flag: 'unverified' })
    expect(h.source.page).toBe('pp.139, 219')
    const none = towerA({ skyLobbies: [], skyRoom: null, publicStops: [], floorUses: {} })
    expect(line(none, 'sv-homes').state).toBe('warn')
    expect(line(none, 'sv-shared').value).toBe('podium to L4: largest gap 77 storeys (podium top L4 → roof, 309 m); no shared level above the base')
  })

  it('marks Needs specialist past the precedent schemes’ 100 storeys, never changing the state', () => {
    const tall = importedTower(stack([{ n: 2, f2f: 4.5, ring: sq(50), podium: true }, { n: 100, f2f: 3.2, ring: sq(36) }]), { podiumTop: 9, coreSide: 14 })
    const r = run(tall)
    expect(r.rules.every((x) => /taller than the precedent schemes/.test(x.specialist ?? ''))).toBe(true)
    expect(r.rules.find((x) => x.id === 'sv-planted')!.state).toBe('warn')
    expect(run(towerA()).rules.some((x) => x.specialist)).toBe(false)
  })

  it('runs on the default towers of both projects, through the evidence hub, with a fix for every Check', () => {
    const s = useStore.getState()
    for (const project of ['vtc', 'city'] as const) {
      const t = defaultTower(project, project === 'city' ? [254, 486] : undefined)
      const g = evidenceGroups({ project, towers: [t], fsrTier: 2, transitLink: false, liftPresets: s.liftPresets, egressPresets: s.egressPresets, publicRealm: s.publicRealm, cityInNature: s.cityInNature, windPresets: { tunnelDefaultHeight: 180, f1: null } })
      const lines = (g['built.sky-villages'] as { id: string }[][]).flat()
      expect(lines.map((l) => l.id)).toEqual(expect.arrayContaining(['sv-planted', 'sv-shared']))
    }
    for (const id of ['sv-planted', 'sv-shared', 'sv-homes']) expect(fixFor(id, 'warn', '', '', 'unverified')).not.toMatch(/^Rule: |See Details for the rule/)
  })
})
