import { describe, expect, it } from 'vitest'
import { DEFAULT_ECON, economics } from './economics'
import { egressCheck, storeyLoads, DEFAULT_EGRESS_PRESETS } from './egress'
import { BEDROOMS, DEFAULT_INTERIOR, UNIT_TYPES, bands, floorCounts, homeFloor, hotelFloor, interiorCheck, officeFloor, splitCount } from './interior'
import { DEFAULT_LIFT_PRESETS, liftCheck } from './lifts'
import { coreSide, towerFloors } from './massing'
import type { Tower } from './types'

const vtc: Tower = {
  id: 't1', name: 'Tower 1', x: -20, y: 0, rotation: 0, width: 46, depth: 46, height: 285, f2f: 4.2,
  podiumHeight: 18, podiumWidth: 100, podiumDepth: 64, podiumUse: 'retail',
  bands: [{ use: 'office', share: 0.55 }, { use: 'hotel', share: 0.15 }, { use: 'amenity', share: 0.03 }, { use: 'residential', share: 0.27 }],
  coreShare: 0.21, plantEvery: 0, coreAuto: false,
}
const laid: Tower = { ...vtc, interior: DEFAULT_INTERIOR }
const li = { homeM2: DEFAULT_LIFT_PRESETS.homeM2, hotelM2PerKey: DEFAULT_LIFT_PRESETS.hotelM2PerKey }

describe('floor geometry', () => {
  it('splits the ring between corridor and facade into four bands that add up', () => {
    const b = bands(vtc, 1.8)
    const ring = vtc.width * vtc.depth - b.inner * b.inner
    expect(b.rects.reduce((s, r) => s + (r.x1 - r.x0) * (r.y1 - r.y0), 0)).toBeCloseTo(ring, 6)
    expect(b.depth).toBeCloseTo((46 - (coreSide(vtc) + 3.6)) / 2, 6)
  })

  it('splits counts by shares exactly (largest remainder)', () => {
    const c = splitCount(23, DEFAULT_INTERIOR.mix)
    expect(UNIT_TYPES.reduce((s, u) => s + c[u], 0)).toBe(23)
    expect(c.one).toBeGreaterThan(c.studio)
  })
})

describe('layouts by use', () => {
  it('fits homes of the chosen sizes into the band, none overlapping, and counts bedrooms', () => {
    const h = homeFloor(vtc, DEFAULT_INTERIOR)
    expect(h.homes).toBeGreaterThan(10)
    expect(h.used).toBeLessThanOrEqual(h.net + 1e-6)
    expect(h.bedrooms).toBe(UNIT_TYPES.reduce((s, u) => s + h.units[u] * BEDROOMS[u], 0))
    const units = h.rooms.filter((r) => r.kind !== 'leftover')
    expect(units).toHaveLength(h.homes)
    for (const r of units) for (const q of units) if (r !== q) {
      const overlap = r.rect.x0 < q.rect.x1 - 1e-6 && q.rect.x0 < r.rect.x1 - 1e-6 && r.rect.y0 < q.rect.y1 - 1e-6 && q.rect.y0 < r.rect.y1 - 1e-6
      expect(overlap).toBe(false)
    }
  })

  it('a bigger unit mix gives fewer homes', () => {
    const small = homeFloor(vtc, DEFAULT_INTERIOR).homes
    const big = homeFloor(vtc, { ...DEFAULT_INTERIOR, mix: { studio: 0, one: 0, two: 0.4, three: 0.6 } }).homes
    expect(big).toBeLessThan(small)
  })

  it('lays hotel keys along the facade at the module width', () => {
    const h = hotelFloor(vtc, DEFAULT_INTERIOR)
    const b = bands(vtc, DEFAULT_INTERIOR.corridor)
    const expected = b.rects.reduce((s, r) => s + Math.floor(Math.max(r.x1 - r.x0, r.y1 - r.y0) / DEFAULT_INTERIOR.keyWidth), 0)
    expect(h.keys).toBe(expected)
  })

  it('measures office lease depth from the facade to the core', () => {
    const f = towerFloors(vtc).find((x) => x.use === 'office' && !x.podium)!
    const o = officeFloor(vtc, f, DEFAULT_INTERIOR)
    expect(o.leaseDepth).toBeCloseTo(23 - coreSide(vtc) / 2, 6)
    expect(o.within6).toBeGreaterThan(0.3)
    expect(o.within6).toBeLessThan(1)
  })
})

describe('counts feed lifts, egress and economics', () => {
  it('without a layout, everything keeps its area proxy', () => {
    const f = towerFloors(vtc).find((x) => x.use === 'residential')!
    expect(floorCounts(vtc, f)).toBeNull()
    expect(interiorCheck(vtc, towerFloors(vtc)).rules.find((r) => r.id === 'in-feed')!.state).toBe('warn')
  })

  it('egress loads homes at 2 persons per bedroom of the layout, and hotels at 2 per key', () => {
    const loads = storeyLoads(laid, DEFAULT_EGRESS_PRESETS, li)
    const res = loads.find((s) => s.use === 'residential' && !s.skyLobby)!
    const f = towerFloors(laid).find((x) => x.level === res.level)!
    expect(res.load).toBe(floorCounts(laid, f)!.bedrooms! * 2)
    expect(res.basis).toContain('interior layout')
    const hotel = loads.find((s) => s.use === 'hotel')!
    expect(hotel.load).toBe(hotelFloor(laid, DEFAULT_INTERIOR).keys * 2)
    expect(egressCheck(laid).rules.length).toBeGreaterThan(0)
  })

  it('amenity floors take their egress load from the activity programme', () => {
    const loads = storeyLoads(laid, DEFAULT_EGRESS_PRESETS, li)
    const am = loads.find((s) => s.use === 'amenity' && !s.publicRoom)!
    expect(am.basis).toContain('activities')
  })

  it('the lift population uses the layout homes and keys', () => {
    const r = liftCheck(laid, DEFAULT_LIFT_PRESETS)
    const res = r.rises.find((x) => x.cls === 'residential')
    expect(res?.popBasis ?? '').toContain('from the interior layout')
  })

  it('economics prices hotel furniture per layout key', () => {
    const inp = { permitYear: 2027, landPrice: 0, siteArea: null, includeRegional: false, homeM2: 75, hotelM2PerKey: 40 }
    const a = economics([vtc], inp, DEFAULT_ECON), b = economics([laid], inp, DEFAULT_ECON)
    expect(a.hard).not.toBe(b.hard) // hotel furniture is in the hard cost
  })

  it('reports totals for the tower and keeps the housing mix rule unverified', () => {
    const r = interiorCheck(laid, towerFloors(laid))
    expect(r.on).toBe(true)
    expect(r.totals.homes).toBe(r.home!.homes * r.homeFloors)
    expect(r.rules.find((x) => x.id === 'in-family')!.flag).toBe('unverified')
    expect(r.rules.find((x) => x.id === 'in-people-res')!.flag).toBe('verified')
  })
})
