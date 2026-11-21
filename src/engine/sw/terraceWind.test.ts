import { describe, expect, it } from 'vitest'
import type { ClimatePayload } from './types'
import climateJson from '../../data/climate/yvr-cwec2020.json'
import { withBlocks } from '../massing'
import type { ImportedStorey, Tower } from '../types'
import { DEFAULT_EXPOSURE, deckHours } from './deckWind'
import { deckFacing, deckUseOf, towerDecks } from './decks'
import { coverDepth, coverFactor, screenFactor, terraceWind, type TerraceOptions } from './terraceWind'
import { computeSw } from '../../lib/swRun'
import { SW_DEFAULTS } from '../../lib/swStudy'
import type { SwInputs } from '../../lib/swInputs'
import { skyRoomCheck, type SkyTerraceLine } from '../skyRoom'
import { liftCheck } from '../lifts'
import { egressCheck } from '../egress'
import { DEFAULT_SKY_ROOM } from '../../store'

const C = climateJson as unknown as ClimatePayload
const base = (patch: Partial<Tower> = {}): Tower => ({
  id: 't', name: 'T', x: 0, y: 0, rotation: 0, width: 50, depth: 50, height: 250, f2f: 4, podiumHeight: 0, podiumWidth: 60, podiumDepth: 60,
  podiumUse: 'retail', bands: [{ use: 'office', share: 1 }], coreShare: 0.2, plantEvery: 0, ...patch,
})
/** 50 m square to +171 m, then the north (+y) face steps back 6 m to +250 m. */
const setback = (patch: Partial<Tower> = {}) => withBlocks(base(patch), [
  { id: 'a', height: 171, width: 50, depth: 50, dx: 0, dy: 0, rotation: 0 },
  { id: 'b', height: 79, width: 50, depth: 44, dx: 0, dy: -3, rotation: 0 },
])
/** An imported 40 m square to +200 m whose storeys at +100 to +108 m keep only a 16 m core (an open garden). */
const openGarden = (): Tower => {
  const storeys: ImportedStorey[] = Array.from({ length: 50 }, (_, i) => {
    const z0 = i * 4, h = z0 >= 100 && z0 < 108 ? 8 : 20
    return { level: i + 1, z0, z1: z0 + 4, area: 4 * h * h, use: 'office', podium: false, hasFloor: true, loops: [[[-h, -h], [h, -h], [h, h], [-h, h]]] }
  })
  return { ...base({ width: 40, depth: 40, height: 200 }), imported: { storeys } as unknown as Tower['imported'] }
}
const opts = (o: Partial<TerraceOptions> = {}): TerraceOptions => ({ exposure: DEFAULT_EXPOSURE, profile: 'nbc', criteria: 'london2019', north: 0, ...o })

describe('decks from the storey outlines (R5 §1.1)', () => {
  it('a 6 m setback on one face at +171 m is one terrace, open to the north, with the face rising 79 m behind it', () => {
    const decks = towerDecks(setback(), 0)
    const terraces = decks.filter((d) => d.type === 'setback')
    expect(terraces).toHaveLength(1)
    const d = terraces[0]
    expect(d.z).toBeCloseTo(171, 6)
    expect(d.area).toBeCloseTo(300, 3)
    expect(d.cover).toBeNull()
    const long = d.edges.filter((e) => e.open).sort((a, b) => b.L - a.L)[0]
    expect(long.L).toBeCloseTo(50, 3)
    expect(long.az).toBeCloseTo(0, 3) // true north
    const wall = d.edges.find((e) => !e.open)!
    expect(wall.az).toBeCloseTo(180, 3); expect(wall.dH).toBeCloseTo(79, 3)
    expect(decks.filter((x) => x.type === 'roof').map((x) => x.z)).toEqual([250])
  })
  it('the facing follows project north: on the competition grid (north 45°) the same terrace faces true north-west', () => {
    const d = towerDecks(setback(), 45).find((x) => x.type === 'setback')!
    const long = d.edges.filter((e) => e.open).sort((a, b) => b.L - a.L)[0]
    expect(long.az).toBeCloseTo(315, 3)
  })
  it('an open storey whose plate is the core only is an all-round open deck under the slab above', () => {
    const decks = towerDecks(openGarden(), 0)
    const g = decks.find((d) => d.z === 100)!
    expect(g.type).toBe('openStorey')
    expect(g.allRound).toBe(true)
    expect(g.cover).toBeCloseTo(8, 6)
    expect(g.area).toBeCloseTo(40 * 40 - 16 * 16, 3)
    expect(g.level).toBe(26)
    expect(g.edges.filter((e) => !e.open)).toHaveLength(4) // the core's walls
    expect(decks.map((d) => d.z)).toEqual([100, 200])
  })
  it('a taper of under 1.5 m a storey leaves no terrace', () => {
    const storeys: ImportedStorey[] = Array.from({ length: 40 }, (_, i) => { const h = 25 - i * 0.3; return { level: i + 1, z0: i * 4, z1: i * 4 + 4, area: 4 * h * h, use: 'office', podium: false, hasFloor: true, loops: [[[-h, -h], [h, -h], [h, h], [-h, h]]] } })
    const t = { ...base(), imported: { storeys } as unknown as Tower['imported'] }
    expect(towerDecks(t, 0).map((d) => d.type)).toEqual(['roof'])
  })
})

describe('wind on each deck (R5 §1.3–§1.6)', () => {
  const north3 = deckHours(C, { dir: 0, speed: 3 })
  it('screen factors follow R5 §1.4', () => {
    expect(screenFactor(null, 1, 0).S).toBe(1)
    expect(screenFactor({ h: 1, porosity: 0.25 }, 1, 0).S).toBe(1) // under 1.2 m: no effect
    expect(screenFactor({ h: 2, porosity: 0.25 }, 5, 0).S).toBeCloseTo(0.4, 6)
    expect(screenFactor({ h: 2, porosity: 0.05 }, 5, 0)).toEqual({ S: 0.5, solid: true })
    expect(screenFactor({ h: 2, porosity: 0.05 }, 5, 70).S).toBeCloseTo(1.1, 6) // a solid screen met obliquely speeds the wind
    expect(screenFactor({ h: 2, porosity: 0.5 }, 13, 0).S).toBeCloseTo(0.8, 6) // half way back to 1 between 6 and 20 m
    expect(screenFactor({ h: 2, porosity: 0.5 }, 25, 0).S).toBe(1)
  })
  it('the north wind crosses the terrace edge; a south wind leaves it in the wake of the tower above', () => {
    const d = towerDecks(setback(), 0).filter((x) => x.type === 'setback')
    const n = terraceWind(d, north3, opts())[0], s = terraceWind(d, deckHours(C, { dir: 180, speed: 3 }), opts())[0]
    expect(n.governing.kCase === 'edge' || n.governing.kCase === 'corner' || n.governing.kCase === 'downwash').toBe(true)
    expect(s.governing.kCase).toBe('wake')
    expect(s.read.v).toBeLessThan(n.read.v)
  })
  it('a screen lowers the class', () => {
    const d = towerDecks(setback(), 0).filter((x) => x.type === 'setback')
    const bare = terraceWind(d, north3, opts())[0]
    const screened = terraceWind(d, north3, opts({ screen: { h: 1.5, porosity: 0.25 } }))[0]
    expect(screened.read.cls).toBeLessThan(bare.read.cls)
    expect(screened.screen).toMatchObject({ from: 'setting', h: 1.5 })
    // and on the hourly record the 5% speed falls too
    const H = deckHours(C)
    expect(terraceWind(d, H, opts({ screen: { h: 2, porosity: 0.25 } }))[0].read.v).toBeLessThan(terraceWind(d, H, opts())[0].read.v)
  })
  it('reports the smallest screen that reaches the target when one does', () => {
    const d = towerDecks(setback(), 0).filter((x) => x.type === 'setback')
    const w = terraceWind(d, north3, opts())[0]
    expect(w.read.cls).toBeGreaterThan(1)
    expect(w.need.sitting).toEqual({ h: 1.5, porosity: 0.5 })
  })
  it('a façade wind-screen zone screens the edges it covers', () => {
    const d = towerDecks(setback(), 0).filter((x) => x.type === 'setback')
    const w = terraceWind(d, north3, opts({ edgeScreen: (_, e) => (Math.abs(e.az) < 1 ? { h: 1.5, porosity: 0 } : null) }))[0]
    expect(w.screen).toMatchObject({ from: 'facade', edges: 1 })
    expect(w.read.v).toBeLessThan(terraceWind(d, north3, opts())[0].read.v)
  })
  it('a taller building upwind shelters the deck', () => {
    const d = towerDecks(setback(), 0).filter((x) => x.type === 'setback')
    const tall = { ring: [[-20, 120], [20, 120], [20, 160], [-20, 160]] as [number, number][], z1: 300 }
    expect(terraceWind(d, north3, opts({ neighbours: [tall] }))[0].read.v).toBeCloseTo(terraceWind(d, north3, opts())[0].read.v * 0.7, 2)
  })
  it('the open garden reads through-flow under the slab', () => {
    const d = towerDecks(openGarden(), 0).filter((x) => x.z === 100)
    const w = terraceWind(d, north3, opts())[0]
    expect(w.governing.kCase).toBe('through')
    expect(w.read.v).toBeCloseTo(3 * Math.sqrt(10 ** 0.28) * 1.14, 2)
  })
})

describe('the terraces in Wind on terraces and roofs, and the sky room', () => {
  const inp = (t: Tower): SwInputs => ({ project: 'city', towers: [t], north: 0, site: null, context: [], ctxBlocks: [], C })
  it('lists every deck as its own line and keeps the windiest as the headline', async () => {
    const out = await computeSw('built.sw-wind-height', inp(setback()), SW_DEFAULTS)
    const ids = out.rules.map((r) => r.id)
    expect(ids).toContain('sw-wind-deck')
    expect(ids).toContain('sw-terrace-t-L44')
    expect(ids.some((i) => i.startsWith('sw-terrace-t-L') && i !== 'sw-terrace-t-L44')).toBe(true) // the roof
    const terrace = out.rules.find((r) => r.id === 'sw-terrace-t-L44')!
    expect(terrace.label).toBe('Terrace at +171 m (L44)')
    expect(terrace.note).toMatch(/open to the N/)
    expect(terrace.note).toMatch(/Seasons: winter/)
    expect(terrace.note).toMatch(/Smallest screen/)
  })
  it('feeds the sky room terrace line from the deck at the room level', async () => {
    const t = setback({ skyLobbies: [44], skyRoom: { ...DEFAULT_SKY_ROOM, level: 44 } })
    const out = await computeSw('built.sw-wind-height', inp(t), SW_DEFAULTS)
    const line = (out.data as { skyTerraces: Record<string, SkyTerraceLine> }).skyTerraces.t
    expect(line.value).toMatch(/in (winter|spring|summer|fall)/)
    expect(out.rules.find((r) => r.id === 'sw-terrace-sky-room-t')?.value).toBe(line.value)
    const sky = skyRoomCheck(t, liftCheck(t), egressCheck(t), undefined, undefined, line).rules.find((r) => r.id === 'skyroom-wind-t')!
    expect(sky.value).toBe(line.value)
    expect(sky.flag).toBe('team_assumption')
    expect(skyRoomCheck(t, liftCheck(t), egressCheck(t)).rules.find((r) => r.id === 'skyroom-wind-t')!.value).toBe('Not assessed')
  })
  it('a sky room with no deck at its level says so', async () => {
    const t = setback({ skyLobbies: [20], skyRoom: { ...DEFAULT_SKY_ROOM, level: 20 } })
    const out = await computeSw('built.sw-wind-height', inp(t), SW_DEFAULTS)
    expect((out.data as { skyTerraces: Record<string, SkyTerraceLine> }).skyTerraces.t.value).toMatch(/No outdoor terrace/)
  })
})

// G24 (vtc-entry C21b, wind review R3-8): a deck under the storey above carried out over it, with no end walls, read as an
// "Open storey", so the terrace lines seemed to drop it; and the slab sheltered alike whatever its headroom and depth.
type Pt2 = [number, number]
const box = (x0: number, y0: number, x1: number, y1: number): Pt2[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]
/** A 50 m square to +60 m whose south side is a deck `depth` m deep under a roof `head` m above it (the storey above carried
 *  out over it), with 1.5 m end walls or open ends; the tower above the roof keeps the inset plate to +120 m. */
const roofed = (depth: number, head: number, walls: boolean): Tower => {
  const storeys: ImportedStorey[] = []
  for (let i = 0; i < 30; i++) {
    const z0 = i * 4, inset = box(-25, -25 + depth, 25, 25)
    const loops = z0 < 60 ? [box(-25, -25, 25, 25)]
      : z0 < 60 + head ? (walls ? [inset, box(-25, -25, -23.5, -25 + depth), box(23.5, -25, 25, -25 + depth)] : [inset])
        : z0 < 64 + head ? [box(-25, -25, 25, 25)] : [inset]
    storeys.push({ level: i + 1, z0, z1: z0 + 4, area: 0, use: 'office', podium: false, hasFloor: true, loops })
  }
  return { ...base({ height: 120 }), imported: { storeys } as unknown as Tower['imported'] }
}

describe('G24: every deck under a slab is a loggia, sheltered by its depth against its headroom', () => {
  const inp = (t: Tower): SwInputs => ({ project: 'city', towers: [t], north: 0, site: null, context: [], ctxBlocks: [], C })
  it('a deck under a roof with open sides is listed, as a loggia', async () => {
    const open = towerDecks(roofed(9, 8, false), 0).find((d) => d.z === 60)!
    expect(open.cover).toBeCloseTo(8, 6)
    expect(open.type).toBe('openStorey') // open at both ends as well as the south
    const lines = (await computeSw('built.sw-wind-height', inp(roofed(9, 8, false)), SW_DEFAULTS)).rules
    const line = lines.find((r) => r.id === 'sw-terrace-t-L16')!
    expect(line.label).toBe('Loggia (open storey) at +60 m (L16)')
    expect(line.note).toMatch(/slab 8\.0 m above\. Cover factor (0\.\d\d|1\.00): [\d.]+ m deep under 8\.0 m of headroom/)
    // with end walls it is a loggia open to the south only, as before
    const walled = (await computeSw('built.sw-wind-height', inp(roofed(9, 8, true)), SW_DEFAULTS)).rules.find((r) => r.id === 'sw-terrace-t-L16')!
    expect(walled.label).toBe('Loggia at +60 m (L16)')
  })
  it('the cover factor runs from an overhang (D up to h/4: open to the sky) to full shelter (D of h or more), linear between', () => {
    expect(coverFactor(1, 8)).toBe(0)
    expect(coverFactor(2, 8)).toBe(0)
    expect(coverFactor(5, 8)).toBeCloseTo(0.5, 6)
    expect(coverFactor(8, 8)).toBe(1)
    expect(coverFactor(20, 4)).toBe(1)
    // depth: twice the mean distance to the nearest open edge (a walled strip open on one side reads about its width)
    expect(coverDepth(towerDecks(roofed(12, 4, true), 0).find((d) => d.z === 60)!)).toBeCloseTo(12, 0)
  })
  it('a deeper, lower cover shelters more than a shallow, high one', () => {
    const south = deckHours(C, { dir: 180, speed: 3 }) // onto the open south edge
    const read = (depth: number, head: number) => terraceWind(towerDecks(roofed(depth, head, true), 0).filter((d) => d.z === 60), south, opts())[0]
    const deepLow = read(12, 4), shallowHigh = read(3, 8), deepHigh = read(6, 8), sameLow = read(6, 4)
    expect(deepLow.cover!.factor).toBe(1)
    expect(shallowHigh.cover!.factor).toBeLessThan(0.2)
    expect(deepLow.read.v).toBeLessThan(shallowHigh.read.v)
    // the end points are the table's own values: full cover reads the loggia K 0.6, no cover the open edge
    expect(deepLow.governing.k).toBeCloseTo(0.6, 6)
    expect(shallowHigh.governing.k).toBeGreaterThan(1)
    // the same 6 m depth shelters more under 4 m of headroom than under 8 m
    expect(sameLow.cover!.factor).toBeGreaterThan(deepHigh.cover!.factor)
    expect(sameLow.read.v).toBeLessThan(deepHigh.read.v)
  })
})

// G25 (vtc-entry C21a): planted roofs closed to people read as failing terraces; a deck-use input says what each deck is for.
describe('G25: deck use (occupied, planted, none)', () => {
  const inp = (t: Tower): SwInputs => ({ project: 'city', towers: [t], north: 0, site: null, context: [], ctxBlocks: [], C })
  const line = async (t: Tower, id = 'sw-terrace-t-L44') => (await computeSw('built.sw-wind-height', inp(t), SW_DEFAULTS)).rules.find((r) => r.id === id)
  it('the same deck reads Fail as occupied and not Fail as planted', async () => {
    const occupied = (await line(setback()))!
    expect(occupied.state).toBe('fail')
    const asked = (await line(setback({ deckUses: [{ level: 44, use: 'occupied' }] })))!
    expect(asked.state).toBe('fail') // the default, said out loud
    const planted = (await line(setback({ deckUses: [{ level: 44, use: 'planted' }] })))!
    expect(planted.state).not.toBe('fail')
    expect(['unknown', 'warn']).toContain(planted.state)
    expect(planted.label).toBe('Planted terrace at +171 m (L44)')
    expect(planted.value).toBe(`maintenance access: ${occupied.value}`) // the same wind class, reported
    expect(planted.threshold).toMatch(/no comfort target/)
    expect(planted.note).toMatch(/Deck use: planted/)
  })
  it('a deck no one uses is left out; the headline reads only the decks people use', async () => {
    const out = await computeSw('built.sw-wind-height', inp(setback({ deckUses: [{ level: 44, use: 'none' }] })), SW_DEFAULTS)
    expect(out.rules.some((r) => r.id === 'sw-terrace-t-L44')).toBe(false)
    const roof = out.rules.find((r) => r.id.startsWith('sw-terrace-t-L') && r.label.startsWith('Roof'))!
    expect(roof).toBeTruthy() // the roof stays
    const both = await computeSw('built.sw-wind-height', inp(setback({ deckUses: [{ level: 44, use: 'planted' }, { level: Number(roof.id.replace('sw-terrace-t-L', '')), use: 'planted' }] })), SW_DEFAULTS)
    expect(both.rules.some((r) => r.id === 'sw-wind-deck')).toBe(false) // no deck people use: no comfort headline
    expect(both.rules.filter((r) => r.id.startsWith('sw-terrace-t-L')).every((r) => r.state !== 'fail')).toBe(true)
  })
  it('a facing picks one deck at a level: the terrace faces north', async () => {
    const d = towerDecks(setback(), 0).find((x) => x.level === 44)!
    expect(deckFacing(d)).toBe('N')
    expect(deckUseOf({ deckUses: [{ level: 44, facing: 'N', use: 'planted' }] }, d)?.use).toBe('planted')
    expect(deckUseOf({ deckUses: [{ level: 44, facing: '10', use: 'planted' }] }, d)?.use).toBe('planted') // degrees, within 22.5°
    expect(deckUseOf({ deckUses: [{ level: 44, facing: 'S', use: 'planted' }] }, d)).toBeNull()
    expect(deckUseOf({ deckUses: [{ level: 43, use: 'planted' }] }, d)).toBeNull()
    expect((await line(setback({ deckUses: [{ level: 44, facing: 'S', use: 'planted' }] })))!.state).toBe('fail')
  })
})
