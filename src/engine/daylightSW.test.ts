// The daylight port against Sinnie Choi's own engine: src/engine/daylight.fixtures.json is recorded by running her
// physics.js, study.js, core.js and climate.js at commit c24addb headless (tools/sunwind-daylight-fixtures.cjs) on nine
// cases: a plain tower, context with and without the future towers, every shading strategy with a lower WWR and VT, a deep
// and a shallow plate, two orientations, an L-shaped plate with the core off centre, and a winter ASE period.
import { describe, expect, it } from 'vitest'
import fx from './daylight.fixtures.json'
import hourly from '../data/sunWindHourly.json'
import { aseFloor, aseTower, DEFAULT_ZONES, DL_R, daylightFloor, daylightTower, edgesOf, face, faceOffset, maskFloor, newCache, obstructionAngles, prep, sdaPoints, type DlBuilding, type DlFloor, type DlSettings, type Zone } from './daylightSW'

/** Tolerance on every ratio, factor and share (sDA, ASE, DA, UDI, DF): none. The port reproduces her numbers bit for bit (17 Nov 2026). */
const TOL = 0
const near = (a: number, b: number, tol = TOL) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b))

type Case = (typeof fx.cases)[number]
const P = prep(hourly as never)
const days = hourly.days

function floorsOf(c: Case): DlFloor[] {
  const t = c.tower as Case['tower'] & { cut?: number[] }
  const out: DlFloor[] = []
  for (let i = 0; i < t.n; i++) {
    const base = { i, z: t.z0 + i * t.h, h: t.h, w: t.w, d: t.d, cx: t.cx, cy: t.cy, rot: t.rot, core: t.core }
    const cut = t.cut
    out.push(maskFloor(base, cut ? (lx, ly) => { const ix = Math.round(lx + t.w / 2 - 0.5), iy = Math.round(ly + t.d / 2 - 0.5); return !(ix >= cut[0] && ix < cut[1] && iy >= cut[2] && iy < cut[3]) } : undefined))
  }
  return out
}
function settingsOf(c: Case): DlSettings {
  const bld: DlBuilding[] = c.site ? (fx.bld as Record<string, number[][]>)[c.site].map(([x, y, top]) => ({ x, y, top })) : []
  return { zones: c.zones === 'default' ? DEFAULT_ZONES : (c.zones as Zone[]), vt: c.vt, target: c.target, posX: c.pos[0], posY: c.pos[1], bld, period: c.period ?? { from: '01-01', to: '12-31' } }
}
const sampleMatches = (a: Float32Array, s: { idx: number[]; vals: number[]; sum: number }) => {
  let sum = 0; for (let k = 0; k < a.length; k++) sum += a[k]
  return s.idx.every((k, j) => a[k] === s.vals[j]) && near(sum, s.sum)
}

describe('Sun & Wind Studio daylight port: her physics', () => {
  it('prep: occupied hours, sun and Perez sky state match her physics.js', () => {
    const ph = fx.phys
    expect(P.occ.length).toBe(ph.occ)
    for (const k of ['alt', 'az', 'F1', 'F2', 'effD', 'effB'] as const) expect(ph[k].every((v, j) => P[k][j * ph.step] === v), k).toBe(true)
    const sum = (a: Float32Array) => { let s = 0; for (let k = 0; k < a.length; k++) s += a[k]; return s }
    for (const k of ['alt', 'F1', 'F2', 'effD', 'effB', 'Ed', 'Eb'] as const) expect(near(sum(P[k]), ph.sums[k]), k).toBe(true)
  })
  it('face: Perez sky, ground and beam on six vertical faces', () => {
    const sum = (a: Float32Array) => { let s = 0; for (let k = 0; k < a.length; k++) s += a[k]; return s }
    for (const f of fx.phys.faces) {
      const F = face(P, f.az)
      for (const k of ['sky', 'gnd', 'beam', 'skyL', 'gndL', 'beamL'] as const) expect(near(sum(F[k]), f[k]), `${f.az} ${k}`).toBe(true)
      expect(F.skyL[1012]).toBe(f.skyL1000)
    }
    for (const [r, v] of fx.phys.faceOffset) expect(faceOffset(r) + 0).toBe(v)
  })
  it('her constants and default zones', () => {
    expect(DEFAULT_ZONES).toEqual(fx.defaultZones)
    expect(DL_R).toEqual(fx.dlR)
  })
})

describe('Sun & Wind Studio daylight port: her nine cases', () => {
  for (const c of fx.cases) {
    it(`${c.id}: ${c.note}`, () => {
      const floors = floorsOf(c), s = settingsOf(c)
      floors.forEach((f, i) => { expect(f.z).toBe(c.floors[i].z); expect(near(f.area, c.floors[i].area)).toBe(true) })
      const cache = newCache()
      const D = daylightTower(P, floors, s, cache), A = aseTower(P, floors, s, days, cache)
      const E = c.expected
      // the tower: sDA300/50%, mean DF, DA, UDI, area-weighted, and the floors her signature groups
      expect(D.unique).toBe(E.tower.unique)
      for (const k of ['sda', 'over', 'mean', 'da', 'udiS', 'udiU', 'udiE'] as const) expect(near(D[k], E.tower[k]), `tower ${k}: ${D[k]} vs ${E.tower[k]}`).toBe(true)
      E.tower.rows.forEach((r, i) => {
        const q = D.rows[i]
        for (const k of ['mean', 'pctLit', 'da', 'udiS', 'udiU', 'udiE'] as const) expect(near(q[k], r[k]), `L${i + 1} ${k}`).toBe(true)
        expect(q.dsf.every((v, m) => near(v, r.dsf[m])), `L${i + 1} dsf`).toBe(true)
      })
      // ASE1000/250h per floor and for the tower
      expect(near(A.pct, E.ase.pct), `ASE ${A.pct} vs ${E.ase.pct}`).toBe(true)
      expect(A.period).toBe(E.ase.period)
      expect(A.rows.map((r) => r.pct).every((v, i) => near(v, E.ase.rows[i]))).toBe(true)
      // one floor in detail: obstruction, façade edges, the cell fields
      const X = E.detail, f = floors[X.floor]
      const obs = obstructionAngles(f, s.bld)
      for (const o of ['N', 'E', 'S', 'W'] as const) expect(near(obs[o], (X.obs as Record<string, number>)[o]), `obs ${o}`).toBe(true)
      expect(edgesOf(f).map((e) => [+e.L.toFixed(6), e.o])).toEqual(X.edges)
      const dl = daylightFloor(P, f, 2, 2, s, cache)
      expect(dl.cells).toBe(X.dl.cells); expect(dl.hours).toBe(X.dl.hours)
      for (const k of ['mean', 'pctLit', 'daMean', 'irc'] as const) expect(near(dl[k], X.dl[k]), `detail ${k}`).toBe(true)
      expect(sampleMatches(dl.df, X.dl.df), 'df cells').toBe(true)
      expect(sampleMatches(dl.da, X.dl.da), 'da cells').toBe(true)
      const as = aseFloor(P, f, true, s, days, cache)
      expect(as.cells).toBe(X.ase.cells); expect(as.positions).toBe(X.ase.positions); expect(near(as.thr, X.ase.thr)).toBe(true); expect(near(as.pctOver, X.ase.pctOver)).toBe(true)
      expect(sampleMatches(as.hrs, X.ase.hrs), 'ASE hours per cell').toBe(true)
      // her full resolution once: every cell, every occupied hour
      const F = (E as { full?: typeof fx.cases[0]['expected']['full'] }).full
      if (F) {
        const dlF = daylightFloor(P, floors[0], 1, 1, s, cache), asF = aseFloor(P, floors[0], false, s, days, cache)
        expect(dlF.cells).toBe(F.dl.cells); expect(dlF.hours).toBe(F.dl.hours)
        for (const k of ['mean', 'pctLit', 'daMean', 'udiS', 'udiU', 'udiE'] as const) expect(near(dlF[k], F.dl[k]), `full ${k}`).toBe(true)
        expect(dlF.dsf.every((v, m) => near(v, F.dl.dsf[m]))).toBe(true)
        expect(sampleMatches(dlF.da, F.dl.da)).toBe(true)
        expect(asF.cells).toBe(F.ase.cells); expect(near(asF.pctOver, F.ase.pctOver)).toBe(true); expect(sampleMatches(asF.hrs, F.ase.hrs)).toBe(true)
      }
    }, 60_000)
  }
  it('LEED v4.1 EQ Daylight points as her app reads sDA', () => {
    expect([0.39, 0.4, 0.549, 0.55, 0.749, 0.75, 1].map(sdaPoints)).toEqual([0, 1, 1, 2, 2, 3, 3])
  })
})
