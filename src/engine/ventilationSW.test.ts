// The ventilation port against Sinnie Choi's own engine: src/engine/ventilation.fixtures.json is recorded by running her
// physics.js, study.js, core.js and climate.js at commit c24addb headless (tools/sunwind-ventilation-fixtures.cjs) on six
// cases: her default façade with cross ventilation, single-sided with the adaptive band in summer, a 70-floor stack case
// with a double skin to L25, a turned plate with two operable faces, an L plate with one operable face across the year
// end, and a sealed façade.
import { describe, expect, it } from 'vitest'
import fx from './ventilation.fixtures.json'
import hourly from '../data/sunWindHourly.json'
import { DEFAULT_ZONES, maskFloor, prep, type DlFloor, type Zone } from './daylightSW'
import { cpFace, siteWind, ventFlow, ventOpenings, ventStudy, ventTowerQuick, type VentMode, type VentSettings } from './ventilationSW'

/** Tolerance on every share, rate and speed: none. The port reproduces her numbers bit for bit (17 Nov 2026). */
const TOL = 0
const near = (a: number | null, b: number | null) => a === b || (a != null && b != null && Math.abs(a - b) <= TOL * Math.max(1, Math.abs(b)))

type Case = (typeof fx.cases)[number]
const P = prep(hourly as never)
const C = { temp: hourly.temp, months: hourly.months, days: hourly.days }

function floorsOf(c: Case): DlFloor[] {
  const t = c.tower as Case['tower'] & { cut?: number[] }
  return Array.from({ length: t.n }, (_, i) => {
    const cut = t.cut
    return maskFloor({ i, z: t.z0 + i * t.h, h: t.h, w: t.w, d: t.d, cx: t.cx, cy: t.cy, rot: t.rot, core: t.core },
      cut ? (lx, ly) => { const ix = Math.round(lx + t.w / 2 - 0.5), iy = Math.round(ly + t.d / 2 - 0.5); return !(ix >= cut[0] && ix < cut[1] && iy >= cut[2] && iy < cut[3]) } : undefined)
  })
}
const zonesOf = (c: Case) => (c.zones === 'default' ? DEFAULT_ZONES : (c.zones as Zone[]))

describe('Sun & Wind Studio ventilation port: her physics', () => {
  it('prep: hourly wind, rain, and the ASHRAE 55 prevailing mean outdoor temperature', () => {
    const sum = (a: Float32Array) => { let s = 0; for (let k = 0; k < a.length; k++) s += a[k]; return s }
    expect(sum(P.tpma)).toBe(fx.phys.tpma); expect(sum(P.daily)).toBe(fx.phys.daily)
    expect(sum(P.ws)).toBe(fx.phys.ws); expect(sum(P.wd)).toBe(fx.phys.wd); expect(sum(P.rain)).toBe(fx.phys.rain)
    expect([0, 1000, 4000, 8000].map((k) => P.tpma[k])).toEqual(fx.phys.tpmaAt)
  })
  it('wind pressure coefficients and the station wind carried to the site', () => {
    expect([[270, 270], [270, 90], [270, 0], [45, 300], [180, 0]].map(([w, f]) => cpFace(w, f))).toEqual(fx.phys.cp)
    expect([[3, 10], [4.5, 60], [6, 200]].map(([w, z]) => siteWind(w, z))).toEqual(fx.phys.site)
  })
})

describe('Sun & Wind Studio ventilation port: her six cases', () => {
  for (const c of fx.cases) {
    it(`${c.id}: ${c.note}`, () => {
      const floors = floorsOf(c), zones = zonesOf(c), V = c.vent as VentSettings, E = c.expected
      // openings and the airflow balance on one floor, in all three modes
      const f5 = floors[Math.min(floors.length - 1, 5)]
      const ops = ventOpenings(f5, zones, V.open)
      expect(ops).toEqual(E.ops)
      if (E.flow) (['cross', 'single', 'stack'] as VentMode[]).forEach((mode, mi) => [3, 7].forEach((U, ui) => expect(near(ventFlow(ops, U, 250, 18, 3, mode, f5.z + f5.h / 2, f5.h - 0.45), E.flow![mi][ui]), `${mode} at ${U} m/s`).toBe(true)))
      // the hourly study
      const R = ventStudy(P, C, floors, zones, V, c.period ?? { from: '01-01', to: '12-31' }, c.height)
      const X = E.vent
      for (const k of ['total', 'hoursTot', 'fW', 'Um', 'U10', 'operable', 'nF', 'limit', 'Utop', 'qTop', 'achMed', 'fresh', 'rainH', 'comfortH', 'reqACH'] as const) expect(near(R[k], X[k]), `${k}: ${R[k]} vs ${X[k]}`).toBe(true)
      expect(R.all).toBe(X.all); expect(R.adaptive).toBe(X.adaptive)
      R.rows.forEach((r, m) => { const x = X.rows[m]; for (const k of ['hours', 'fT', 'vent', 'comfort', 'tmin', 'tmax', 'T', 'days'] as const) expect(near(r[k], x[k]), `month ${m + 1} ${k}`).toBe(true) })
      expect(R.floors).toEqual(X.floors)
      let gs = 0, gn = 0; const at: number[] = []
      for (let k = 0; k < 8760; k++) { if (R.grid[k] >= 0) { gs += R.grid[k]; gn++ } if (k % 173 === 0) at.push(R.grid[k]) }
      expect(near(gs, X.grid.sum)).toBe(true); expect(gn).toBe(X.grid.n); expect(at).toEqual(X.grid.at)
      // ASHRAE 62.1 as her app reads it
      expect(ventTowerQuick(floors, zones, V.open, c.pos[0], c.pos[1])).toEqual(E.quick)
    }, 60_000)
  }
})
