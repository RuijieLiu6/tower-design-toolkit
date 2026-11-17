// The energy port against Sinnie Choi's own engine: src/engine/energy.fixtures.json is recorded by running her energy.js
// modelHourly (with study.js zoneGlazing, core.js finishMask, physics.js and climate.js) at commit c24addb headless
// (tools/sunwind-energy-fixtures.cjs) on four cases: an office tower on a heat pump; a retail podium with office and
// homes above on gas with daylight dimming; a turned hotel and housing tower on electric resistance with a double skin and
// fins; and housing under a sky garden, an amenity floor and a plant floor (unconditioned zones).
import { describe, expect, it } from 'vitest'
import fx from './energy.fixtures.json'
import hourly from '../data/sunWindHourly.json'
import { DEFAULT_ZONES, prep, type Zone } from './daylightSW'
import { DEFAULT_ENERGY, energyHourly, finishPlate, OPS, PROF, TARGETS, zoneGlazing, type EnergyFloor, type EnergySettings, type Prog } from './energySW'

/** Tolerance on every energy, intensity and temperature: none. The port reproduces her numbers bit for bit (17 Nov 2026). */
const TOL = 0
const near = (a: number, b: number) => a === b || Math.abs(a - b) <= TOL * Math.max(1, Math.abs(b))
const P = prep(hourly as never)
const C = { tz: hourly.tz, days: hourly.days }
type Case = (typeof fx.cases)[number]

function floorsOf(c: Case): EnergyFloor[] {
  const zones = c.zones === 'default' ? DEFAULT_ZONES : (c.zones as Zone[])
  return c.floors.map((f) => ({ i: f.i, prog: f.prog as Prog, h: f.h, rot: f.rot, area: f.area, facade: f.facade, garden: f.garden, terrace: f.terrace, roof: f.roof, coveredVoid: f.coveredVoid,
    glazing: { N: zoneGlazing(zones, f.i + 1, 'N'), E: zoneGlazing(zones, f.i + 1, 'E'), S: zoneGlazing(zones, f.i + 1, 'S'), W: zoneGlazing(zones, f.i + 1, 'W') } }))
}

describe('Sun & Wind Studio energy port: her tables', () => {
  it('operation, targets and residential profiles match energy.js', () => {
    expect(OPS).toEqual(fx.ops); expect(TARGETS).toEqual(fx.targets); expect(PROF).toEqual(fx.prof)
    const { heat: _h, ...rest } = DEFAULT_ENERGY
    expect(fx.cases[0].E).toMatchObject({ ...rest, heat: 'hp' })
  })
})

describe('Sun & Wind Studio energy port: her four cases', () => {
  for (const c of fx.cases) {
    it(`${c.id}: ${c.note}`, () => {
      // each floor's facade lengths, area and sky-garden flag from her finishMask
      let i = 0
      for (const s of c.segs as { n: number; w: number; d: number; prog: string; core: number; rot?: number; cut?: number[] }[]) for (let k = 0; k < s.n; k++, i++) {
        const nx = Math.ceil(s.w), ny = Math.ceil(s.d); const cells = new Uint8Array(nx * ny).fill(1)
        if (s.cut) { const [a, b, cc, d] = s.cut; for (let iy = cc; iy < d; iy++) for (let ix = a; ix < b; ix++) cells[iy * nx + ix] = 0 }
        const fp = finishPlate({ w: s.w, d: s.d, cx: 0, cy: 0, rot: s.rot || 0, core: s.core, mask: { nx, ny, x0: -s.w / 2, y0: -s.d / 2, cells } }, 0, 0)
        expect(fp.facade).toEqual(c.floors[i].facade); expect(fp.area).toBe(c.floors[i].area); expect(fp.garden).toBe(c.floors[i].garden)
      }
      const R = energyHourly(P, C, floorsOf(c), c.E as EnergySettings, c.dsf)
      const X = c.expected
      for (const k of ['gfa', 'total', 'teui', 'tedi', 'ghgi', 'gas', 'elec', 'peakH', 'peakC', 'lightSave', 'lightShare'] as const) expect(near(R[k], X[k]), `${k}: ${R[k]} vs ${X[k]}`).toBe(true)
      expect(R.daylit).toBe(X.daylit)
      expect(R.tgt).toEqual(X.tgt); expect(R.envelope).toEqual(X.envelope); expect(R.glz).toEqual(X.glz); expect(R.people).toEqual(X.people)
      expect(R.uses).toEqual(X.uses); expect(R.monthly).toEqual(X.monthly); expect(R.loss).toEqual(X.loss)
      expect(R.rows).toEqual(X.rows)
      let hs = 0, cs = 0; for (let k = 0; k < 8760; k++) { hs += R.hourly.heat[k]; cs += R.hourly.cool[k] }
      expect(hs).toBe(X.hourly.heatSum); expect(cs).toBe(X.hourly.coolSum)
      expect([100, 2000, 4500, 8000].map((k) => R.hourly.heat[k])).toEqual(X.hourly.heatAt); expect([4500, 5000, 5200, 5500].map((k) => R.hourly.cool[k])).toEqual(X.hourly.coolAt)
    }, 60_000)
  }
})
