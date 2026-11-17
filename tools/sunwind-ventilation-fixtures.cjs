// Records outputs of Sinnie Choi's natural-ventilation engine (Sun & Wind Studio, github.com/xubynii/sun-wind-studio:
// study.js ventStudy / ventFlow / ventOpenings / cpFace / siteWind / ventFloorQuick / ventTowerQuick / roseFor, with the
// daylight helpers they share (zoneFor, band, edgesOf, cardinalOf, periodInfo) and physics.js prep (hourly wind, rain,
// ASHRAE 55 prevailing mean outdoor temperature), core.js maskLoops / toLocal, climate.js as the page loads weather.json)
// as fixtures for the Toolkit's port (src/engine/ventilationSW.ts). Her code is not copied into this repo: the script
// reads it from a local clone of hers at a pinned commit, slices the functions out by name and runs them in a vm.
// Engine 3 of 4 (1: tools/sunwind-fixtures.cjs, wind comfort; 2: tools/sunwind-daylight-fixtures.cjs, daylight).
//   node tools/sunwind-ventilation-fixtures.cjs ../sun-wind-studio src/engine/ventilation.fixtures.json
// Ruijie's message to Sinnie of 9 Nov (04 Tool Plan/permissions/DRAFT_MESSAGES.md §1c) asks for her OK on this reuse.
const fs = require('fs'), path = require('path'), vm = require('vm'), { execFileSync } = require('child_process')
const [clone, out] = process.argv.slice(2)
const COMMIT = 'c24addb2e5b956d56077c74cffdb0847aa8e2b80' // her main, 16 Nov 2026 (still her main on 17 Nov)
const show = (f) => execFileSync('git', ['-C', clone, 'show', `${COMMIT}:${f}`], { encoding: 'utf8', maxBuffer: 64 << 20 })
const study = show('study.js'), core = show('core.js'), physics = show('physics.js'), climateJs = show('climate.js')
const weather = JSON.parse(show('weather.json'))

function block(src, start, open = '{', close = '}') {
  const i = src.indexOf(start)
  if (i < 0) throw new Error(`${start} not found`)
  let j = src.indexOf(open, i), depth = 0
  for (; j < src.length; j++) { const c = src[j]; if (c === open) depth++; else if (c === close && --depth === 0) return src.slice(i, j + 1) }
  throw new Error(`${start}: unbalanced`)
}
const fn = (src, name) => block(src, `function ${name}(`)
const line = (src, re) => { const m = src.match(re); if (!m) throw new Error(`line ${re} not found`); return m[0] }

const LAB = { $: () => ({}), fmtI: (v) => String(Math.round(v)), hooks: {}, CFG: {}, S: null, floors: null, site: null }
const ctx = { console, LAB, setTimeout, fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve(weather) }) }
ctx.window = ctx
vm.createContext(ctx)

const studyCode = [
  'const CLIMATE=LAB.CLIMATE;',
  line(study, /^const SEASON_ROSE=.*$/m), line(study, /^const SEASON_SPEED=.*$/m),
  line(study, /^const ORI=.*$/m), line(study, /^const FACE_AZ=.*$/m), line(study, /^const ALPHA=.*$/m), line(study, /^const GAP=.*$/m),
  block(study, 'const STRATS='), line(study, /^const DEFAULT_ZONE=.*$/m), block(study, 'const DEFAULT_ZONES=', '[', ']'), line(study, /^const fmtMD=.*$/m),
  line(study, /^const cpFace=.*$/m), line(study, /^const siteWind=.*$/m), 'let vtCache={key:null,res:null};', 'var SW=null;',
  ...['parseMD', 'doyOf', 'monthOf', 'periodInfo', 'roseFor', 'zoneFor', 'band', 'edgesOf', 'cardinalOf', 'ventOpenings', 'ventFlow', 'ventStudy', 'ventFloorQuick', 'ventTowerQuick'].map((n) => fn(study, n)),
  fn(core, 'toLocal'), fn(core, 'maskLoops'),
  'LAB.toLocal=toLocal; LAB.maskLoops=maskLoops;',
  'globalThis.__api={ventStudy,ventFlow,ventOpenings,ventTowerQuick,ventFloorQuick,cpFace,siteWind,DEFAULT_ZONES,reset(){ vtCache={key:null,res:null}; }, get SW(){return SW}, set SW(v){SW=v}};',
].join('\n')

async function main() {
  vm.runInContext(climateJs, ctx, { filename: 'climate.js' })
  LAB.climate.init()
  await new Promise((r) => setTimeout(r, 20))
  if (!LAB.CLIMATE.loaded || !LAB.CLIMATE.hourly) throw new Error('weather.json not applied')
  vm.runInContext(physics, ctx, { filename: 'physics.js' })
  vm.runInContext(studyCode, ctx, { filename: 'study.js' })
  const api = ctx.__api, C = LAB.CLIMATE
  const P = LAB.phys.prep()
  const sum = (a) => { let s = 0; for (let k = 0; k < a.length; k++) s += a[k]; return s }
  const physOut = { tpma: sum(P.tpma), daily: sum(P.daily), ws: sum(P.ws), wd: sum(P.wd), rain: sum(P.rain), tpmaAt: [0, 1000, 4000, 8000].map((k) => P.tpma[k]),
    cp: [[270, 270], [270, 90], [270, 0], [45, 300], [180, 0]].map(([w, f]) => api.cpFace(w, f)), site: [[3, 10], [4.5, 60], [6, 200]].map(([w, z]) => api.siteWind(w, z)) }

  function floorOf(spec, i) {
    const nx = Math.max(1, Math.ceil(spec.w)), ny = Math.max(1, Math.ceil(spec.d))
    const m = { nx, ny, x0: -spec.w / 2, y0: -spec.d / 2, cells: new Uint8Array(nx * ny).fill(1) }
    if (spec.cut) { const [ix0, ix1, iy0, iy1] = spec.cut; for (let iy = iy0; iy < iy1; iy++) for (let ix = ix0; ix < ix1; ix++) m.cells[iy * nx + ix] = 0 }
    let solid = 0, total = 0
    for (let iy = 0; iy < ny; iy++) { if (m.y0 + iy + 0.5 > spec.d / 2) continue; for (let ix = 0; ix < nx; ix++) { if (m.x0 + ix + 0.5 > spec.w / 2) continue; total++; if (m.cells[iy * nx + ix]) solid++ } }
    return { i, z: spec.z0 + i * spec.h, h: spec.h, w: spec.w, d: spec.d, cx: spec.cx, cy: spec.cy, rot: spec.rot, core: spec.core, mask: m, area: spec.w * spec.d * (total ? solid / total : 1) }
  }
  const zone = (face, from, to, strat, wwr, depth, operable) => ({ face, from, to, strat, wwr, shgc: 0.35, depth, pv: 0, operable })
  const VENT = { mode: 'cross', band: 'fixed', tmin: 12, tmax: 24, umax: 8, open: 0.1, dT: 3 }
  const CASES = [
    { id: 'cross-default', note: 'a 46 × 46 m tower of 30 floors, her default façade (all operable), cross ventilation, fixed 12–24 °C band', tower: { w: 46, d: 46, cx: 0, cy: 0, rot: 0, core: 16, h: 4.2, z0: 0, n: 30 }, pos: [0, 0], zones: 'default', vent: VENT, period: null },
    { id: 'single-adaptive', note: 'the same tower, single-sided, ASHRAE 55 adaptive band, summer only', tower: { w: 46, d: 46, cx: 0, cy: 0, rot: 0, core: 16, h: 4.2, z0: 0, n: 30 }, pos: [0, 0], zones: 'default', vent: { ...VENT, mode: 'single', band: 'adaptive' }, period: { from: '06-01', to: '08-31' } },
    { id: 'stack-doubleskin', note: 'a 70-floor tower: operable double skin to L25, sealed curtain wall above, stack mode, a 6 m/s gust limit', tower: { w: 46, d: 46, cx: 0, cy: 0, rot: 0, core: 16, h: 4, z0: 0, n: 70 }, pos: [0, 0],
      zones: [zone('all', 1, 25, 'doubleskin', 0.7, 0.8, true), zone('all', 26, 999, 'curtain', 0.6, 0, false)], vent: { ...VENT, mode: 'stack', umax: 6 }, period: null },
    { id: 'turned-two-faces', note: 'a 40 × 28 m plate turned 30°, only north and south operable, 15% openable, ΔT 2 K, April to September', tower: { w: 40, d: 28, cx: -30, cy: 10, rot: Math.PI / 6, core: 12, h: 4, z0: 0, n: 12 }, pos: [-30, 10],
      zones: [zone('all', 1, 999, 'curtain', 0.5, 0, false), zone('N', 1, 999, 'curtain', 0.45, 0, true), zone('S', 1, 999, 'overhang', 0.5, 0.9, true)], vent: { ...VENT, open: 0.15, dT: 2 }, period: { from: '04-01', to: '09-30' } },
    { id: 'one-face-l', note: 'an L-shaped plate, only the east face operable (one opening: wind turbulence added), adaptive band, Dec–Feb across the year end', tower: { w: 40, d: 40, cx: 5, cy: -3, rot: 0, core: 10, h: 3.6, z0: 0, n: 8, cut: [24, 40, 24, 40] }, pos: [-1, -9],
      zones: [zone('all', 1, 999, 'punched', 0.35, 0.4, false), zone('E', 1, 999, 'punched', 0.35, 0.4, true)], vent: { ...VENT, band: 'adaptive' }, period: { from: '12-01', to: '02-28' } },
    { id: 'sealed', note: 'a sealed curtain wall: no operable floor', tower: { w: 30, d: 20, cx: 0, cy: 0, rot: 0, core: 8, h: 4, z0: 0, n: 4 }, pos: [0, 0], zones: [zone('all', 1, 999, 'curtain', 0.6, 0, false)], vent: VENT, period: null },
  ]
  const cases = []
  const r = (v) => v
  for (const c of CASES) {
    api.reset()
    const floors = []; for (let i = 0; i < c.tower.n; i++) floors.push(floorOf(c.tower, i))
    const height = c.tower.z0 + c.tower.n * c.tower.h
    LAB.floors = floors
    LAB.S = { posX: c.pos[0], posY: c.pos[1], rotDeg: 0, height, energy: { vent: 0.35 }, site: { future: true }, impact: { period: c.period || { from: '01-01', to: '12-31' } } }
    const zones = c.zones === 'default' ? JSON.parse(JSON.stringify(api.DEFAULT_ZONES)) : c.zones
    api.SW = { zones, vent: { ...c.vent }, glaz: { vt: 0.6 }, dl: { target: 300 } }
    const V = api.ventStudy(), Q = api.ventTowerQuick()
    let gridSum = 0, gridN = 0; const gridAt = []
    for (let k = 0; k < 8760; k++) { if (V.grid[k] >= 0) { gridSum += V.grid[k]; gridN++ } if (k % 173 === 0) gridAt.push(V.grid[k]) }
    const ops = api.ventOpenings(floors[Math.min(floors.length - 1, 5)])
    cases.push({ id: c.id, note: c.note, tower: c.tower, pos: c.pos, height, zones: c.zones === 'default' ? 'default' : zones, vent: c.vent, period: c.period,
      expected: {
        vent: { total: V.total, hoursTot: V.hoursTot, fW: V.fW, Um: V.Um, U10: V.U10, operable: V.operable, nF: V.nF, limit: V.limit, all: V.all, Utop: V.Utop, qTop: V.qTop, adaptive: V.adaptive,
          achMed: V.achMed ?? null, fresh: V.fresh ?? null, rainH: V.rainH ?? null, comfortH: V.comfortH ?? null, reqACH: V.reqACH ?? null,
          rows: V.rows.map((x) => ({ hours: x.hours, fT: x.fT, vent: x.vent, comfort: x.comfort, tmin: x.tmin, tmax: x.tmax, T: x.T, days: x.days })),
          floors: V.floors, grid: { sum: gridSum, n: gridN, at: gridAt } },
        quick: Q,
        ops: ops.map((q) => ({ o: q.o, A: q.A, zb: q.zb, gh: q.gh, az: q.az })),
        flow: ops.length ? ['cross', 'single', 'stack'].map((mode) => [3, 7].map((U) => api.ventFlow(ops, U, 250, 18, 3, mode, floors[5].z + floors[5].h / 2, floors[5].h - 0.45))) : null,
      } })
    console.error(c.id, 'ok', 'open', (V.total / Math.max(1, V.hoursTot) * 100).toFixed(1) + '%', 'operable', V.operable, 'limit', V.limit, '62.1', Q.freePct.toFixed(2) + '%', (Q.within8 * 100).toFixed(1) + '%')
  }
  // the hourly wind, rain and monthly temperature the port adds to the daylight file
  const hourlyFile = path.join(path.dirname(out), '..', 'data', 'sunWindHourly.json')
  const H = JSON.parse(fs.readFileSync(hourlyFile, 'utf8'))
  Object.assign(H, { ws: C.hourly.ws, wd: C.hourly.wd, rain: C.hourly.rain, temp: C.temp, months: C.months })
  H.source = H.source.replace('(t, ghi, dni, dhi)', '')
  fs.writeFileSync(hourlyFile, JSON.stringify(H)) // the source line was updated by hand once to name the added fields
  fs.writeFileSync(out, JSON.stringify({ source: 'Sun & Wind Studio (Sinnie Choi), physics.js + study.js + core.js + climate.js + weather.json at ' + COMMIT, recorded: new Date().toISOString().slice(0, 10), phys: physOut, cases }))
  console.error('wrote', out, cases.length, 'cases;', hourlyFile)
}
main().catch((e) => { console.error(e); process.exit(1) })
