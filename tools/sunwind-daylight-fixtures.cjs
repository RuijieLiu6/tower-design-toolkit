// Records outputs of Sinnie Choi's daylight engine (Sun & Wind Studio, github.com/xubynii/sun-wind-studio: physics.js
// prep / face / faceOffset / inPeriod / sunAt, study.js daylightFloor / dlSky / obstructionAngles / dfFactor / aseHours /
// aseFloor / daylightTower / aseTower / floorSig / zoneFor / band / edgesOf / stratParts / cardinalOf / periodInfo /
// buildSiteRaster, core.js toLocal / maskLoops / polyBounds, climate.js as the page loads weather.json) as fixtures for the
// Toolkit's port (src/engine/daylightSW.ts). Her code is not copied into this repo: the script reads it from a local clone
// of hers at a pinned commit, slices the functions out of her files by name and runs them in a vm context with the few
// globals they touch (LAB, SW, siteRaster) stubbed. Engine 2 of 4 (engine 1: tools/sunwind-fixtures.cjs, wind comfort).
//   git clone https://github.com/xubynii/sun-wind-studio ../sun-wind-studio
//   node tools/sunwind-daylight-fixtures.cjs ../sun-wind-studio src/engine/daylight.fixtures.json
// Ruijie's message to Sinnie of 9 Nov (04 Tool Plan/permissions/DRAFT_MESSAGES.md §1c) asks for her OK on this reuse.
const fs = require('fs'), path = require('path'), vm = require('vm'), { execFileSync } = require('child_process')
const [clone, out] = process.argv.slice(2)
const COMMIT = 'c24addb2e5b956d56077c74cffdb0847aa8e2b80' // her main, 16 Nov 2026 (still her main on 17 Nov)
const show = (f) => execFileSync('git', ['-C', clone, 'show', `${COMMIT}:${f}`], { encoding: 'utf8', maxBuffer: 64 << 20 })
const study = show('study.js'), core = show('core.js'), physics = show('physics.js'), climateJs = show('climate.js')
const weather = JSON.parse(show('weather.json')), site = JSON.parse(show('site.json'))

/** The text from `start` through the bracket that closes the first `open` after it (none of these has one in a string). */
function block(src, start, open = '{', close = '}') {
  const i = src.indexOf(start)
  if (i < 0) throw new Error(`${start} not found`)
  let j = src.indexOf(open, i), depth = 0
  for (; j < src.length; j++) { const c = src[j]; if (c === open) depth++; else if (c === close && --depth === 0) return src.slice(i, j + 1) }
  throw new Error(`${start}: unbalanced`)
}
const fn = (src, name) => { const s = block(src, `function ${name}(`); return src.slice(Math.max(0, src.indexOf(s) - 6), src.indexOf(s)) === 'async ' ? 'async ' + s : s }
const line = (src, re) => { const m = src.match(re); if (!m) throw new Error(`line ${re} not found`); return m[0] }

// ---- the page's climate: climate.js defaults, then weather.json applied as its init() does (fetch stubbed) ----
const LAB = { $: () => ({}), fmtI: (v) => String(Math.round(v)), hooks: {}, CFG: {}, S: null, floors: null, site: null }
const ctx = { console, LAB, setTimeout, fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve(weather) }) }
ctx.window = ctx
vm.createContext(ctx)

const studyCode = [
  'const CLIMATE=LAB.CLIMATE;',
  line(study, /^const ORI=.*$/m), line(study, /^const FACE_AZ=.*$/m), line(study, /^const GAP=.*$/m),
  block(study, 'const STRATS='), line(study, /^const DEFAULT_ZONE=.*$/m), block(study, 'const DEFAULT_ZONES=', '[', ']'),
  line(study, /^const DOM=.*$/m), line(study, /^const fmtMD=.*$/m), line(study, /^const DL_E=.*$/m), line(study, /^const DL_R=.*$/m), line(study, /^const cieBand=.*$/m), line(study, /^const vertSkyAbove=.*$/m),
  'const dlSkyCache={};', 'let dlCache={key:null,rows:null}, aseTowerRes=null, aseBusy=false;', 'var SW=null; var siteRaster=null;',
  ...['parseMD', 'doyOf', 'monthOf', 'periodInfo', 'zoneFor', 'band', 'edgesOf', 'cardinalOf', 'stratParts', 'dfFactor', 'rasterTri', 'buildSiteRaster',
    'obstructionAngles', 'dlSky', 'daylightFloor', 'aseHours', 'aseFloor', 'dlKey', 'floorSig', 'daylightTower', 'aseTower'].map((n) => fn(study, n)),
  fn(core, 'polyBounds'), fn(core, 'toLocal'), fn(core, 'maskLoops'),
  'LAB.polyBounds=polyBounds; LAB.toLocal=toLocal; LAB.maskLoops=maskLoops;',
  'globalThis.__api={daylightFloor,aseFloor,daylightTower,aseTower,obstructionAngles,buildSiteRaster,edgesOf,periodInfo,DEFAULT_ZONES,STRATS,DL_R,' +
    'reset(){ for(const k in dlSkyCache) delete dlSkyCache[k]; dlCache={key:null,rows:null}; aseTowerRes=null; aseHours.c=null; siteRaster=null; },' +
    'get SW(){return SW}, set SW(v){SW=v}, get siteRaster(){return siteRaster}};',
].join('\n')

async function main() {
  vm.runInContext(climateJs, ctx, { filename: 'climate.js' })
  LAB.climate.init()
  await new Promise((r) => setTimeout(r, 20))
  if (!LAB.CLIMATE.loaded || !LAB.CLIMATE.hourly) throw new Error('weather.json not applied')
  vm.runInContext(physics, ctx, { filename: 'physics.js' })
  vm.runInContext(studyCode, ctx, { filename: 'study.js' })
  const api = ctx.__api, phys = LAB.phys, C = LAB.CLIMATE

  // ---- the physics, sampled: the port's prep / face must match before anything else ----
  const P = phys.prep()
  const pick = (a, step) => { const o = []; for (let k = 0; k < a.length; k += step) o.push(a[k]); return o }
  const sum = (a) => { let s = 0; for (let k = 0; k < a.length; k++) s += a[k]; return s }
  const physOut = { occ: P.occ.length, step: 37, alt: pick(P.alt, 37), az: pick(P.az, 37), F1: pick(P.F1, 37), F2: pick(P.F2, 37), effD: pick(P.effD, 37), effB: pick(P.effB, 37),
    sums: { alt: sum(P.alt), F1: sum(P.F1), F2: sum(P.F2), effD: sum(P.effD), effB: sum(P.effB), Ed: sum(P.Ed), Eb: sum(P.Eb) },
    faces: [0, 90, 180, 270, 30, 315].map((az) => { const F = phys.face(az); return { az, sky: sum(F.sky), gnd: sum(F.gnd), beam: sum(F.beam), skyL: sum(F.skyL), gndL: sum(F.gndL), beamL: sum(F.beamL), skyL1000: F.skyL[1000 + 12] } }),
    faceOffset: [0, 0.3, Math.PI / 6, Math.PI / 4, 2.0, -0.5].map((r) => [r, phys.faceOffset(r)]) }

  // ---- her floor records: a w × d grid of 1 m cells (core.js newMask), cells cut away, the area as finishMask counts it ----
  function floorOf(spec, i) {
    const nx = Math.max(1, Math.ceil(spec.w)), ny = Math.max(1, Math.ceil(spec.d))
    const m = { nx, ny, x0: -spec.w / 2, y0: -spec.d / 2, cells: new Uint8Array(nx * ny).fill(1) }
    if (spec.cut) { const [ix0, ix1, iy0, iy1] = spec.cut; for (let iy = iy0; iy < iy1; iy++) for (let ix = ix0; ix < ix1; ix++) m.cells[iy * nx + ix] = 0 }
    let solid = 0, total = 0
    for (let iy = 0; iy < ny; iy++) { if (m.y0 + iy + 0.5 > spec.d / 2) continue; for (let ix = 0; ix < nx; ix++) { if (m.x0 + ix + 0.5 > spec.w / 2) continue; total++; if (m.cells[iy * nx + ix]) solid++ } }
    return { i, z: spec.z0 + i * spec.h, h: spec.h, w: spec.w, d: spec.d, cx: spec.cx, cy: spec.cy, rot: spec.rot, core: spec.core, mask: m, area: spec.w * spec.d * (total ? solid / total : 1) }
  }
  const curtain = (wwr) => [{ face: 'all', from: 1, to: 999, strat: 'curtain', wwr, shgc: 0.4, depth: 0, pv: 0, operable: false }]
  const z = (face, from, to, strat, wwr, depth) => ({ face, from, to, strat, wwr, shgc: 0.35, depth, pv: 0, operable: false })
  const STRAT_ZONES = [z('all', 1, 4, 'curtain', 0.35, 0),
    z('N', 5, 8, 'eggcrate', 0.5, 0.4), z('E', 5, 8, 'punched', 0.35, 0.4), z('S', 5, 8, 'lightshelf', 0.6, 0.9), z('W', 5, 8, 'louvres', 0.55, 0.3),
    z('N', 9, 12, 'doubleskin', 0.7, 0.8), z('E', 9, 12, 'balcony', 0.55, 1.8), z('S', 9, 12, 'overhang', 0.5, 1.2), z('W', 9, 12, 'fins', 0.5, 0.6)]

  const CASES = [
    { id: 'plain', note: 'a 46 × 46 m curtain-wall tower, no context', tower: { w: 46, d: 46, cx: 0, cy: 0, rot: 0, core: 16, h: 4.2, z0: 0, n: 6 }, pos: [0, 0], site: null, zones: curtain(0.6), vt: 0.6, target: 300, detail: 0, full: true },
    { id: 'context', note: 'the same tower in her site model with the future towers, her default façade zones', tower: { w: 46, d: 46, cx: 0, cy: 0, rot: 0, core: 16, h: 4.2, z0: 0, n: 12 }, pos: [0, 0], site: 'future', zones: 'default', vt: 0.6, target: 300, detail: 2 },
    { id: 'strategies', note: 'context without the future towers, lower WWR and VT, every shading strategy by level', tower: { w: 46, d: 46, cx: 0, cy: 0, rot: 0, core: 16, h: 4.2, z0: 0, n: 12 }, pos: [0, 0], site: 'nofuture', zones: STRAT_ZONES, vt: 0.45, target: 300, detail: 6 },
    { id: 'deep', note: 'a deep 72 × 56 m plate, curtain wall 0.4', tower: { w: 72, d: 56, cx: 0, cy: 0, rot: 0, core: 16, h: 4, z0: 20, n: 3 }, pos: [0, 0], site: null, zones: curtain(0.4), vt: 0.6, target: 300, detail: 0 },
    { id: 'shallow', note: 'a shallow 30 × 17.5 m plate (part cells), 500 lux target', tower: { w: 30, d: 17.5, cx: 0, cy: 0, rot: 0, core: 6, h: 3.2, z0: 0, n: 3 }, pos: [0, 0], site: null, zones: curtain(0.45), vt: 0.6, target: 500, detail: 0 },
    { id: 'turned-30', note: 'a 40 × 28 m plate turned 30°, in context, her default zones', tower: { w: 40, d: 28, cx: -30, cy: 10, rot: Math.PI / 6, core: 12, h: 4, z0: 0, n: 8 }, pos: [-30, 10], site: 'future', zones: 'default', vt: 0.6, target: 300, detail: 1 },
    { id: 'turned-120', note: 'the same plate turned 120°, no context', tower: { w: 40, d: 28, cx: 0, cy: 0, rot: (2 * Math.PI) / 3, core: 12, h: 4, z0: 0, n: 2 }, pos: [0, 0], site: null, zones: 'default', vt: 0.6, target: 300, detail: 0 },
    { id: 'l-plate', note: 'a 40 × 40 m plate with a 16 × 16 m corner cut away, the core off centre', tower: { w: 40, d: 40, cx: 5, cy: -3, rot: 0, core: 10, h: 4, z0: 0, n: 2, cut: [24, 40, 24, 40] }, pos: [-1, -9], site: null, zones: curtain(0.55), vt: 0.6, target: 300, detail: 0 },
    { id: 'winter', note: 'the context case, ASE over 1 Dec – 28 Feb only', tower: { w: 46, d: 46, cx: 0, cy: 0, rot: 0, core: 16, h: 4.2, z0: 0, n: 4 }, pos: [0, 0], site: 'future', zones: 'default', vt: 0.6, target: 300, detail: 0, period: { from: '12-01', to: '02-28' } },
  ]

  const bldOut = {}
  const r6 = (v) => +(+v).toFixed(6)
  const cellSample = (a, step) => { const idx = [], vals = []; for (let k = 0; k < a.length; k += step) if (a[k]) { idx.push(k); vals.push(a[k]) } return { idx, vals, sum: sum(a) } }
  const cases = []
  for (const c of CASES) {
    api.reset()
    LAB.site = c.site ? site : null
    LAB.S = { posX: c.pos[0], posY: c.pos[1], rotDeg: 0, site: { future: c.site === 'future' }, impact: { period: c.period || { from: '01-01', to: '12-31' } } }
    const zones = c.zones === 'default' ? JSON.parse(JSON.stringify(api.DEFAULT_ZONES)) : c.zones
    api.SW = { glaz: { vt: c.vt }, dl: { target: c.target }, zones }
    const floors = []; for (let i = 0; i < c.tower.n; i++) floors.push(floorOf(c.tower, i))
    LAB.floors = floors
    api.buildSiteRaster()
    if (c.site && !bldOut[c.site]) bldOut[c.site] = api.siteRaster.bld.filter((b) => Math.hypot(b.x, b.y) <= 220).map((b) => [b.x, b.y, b.top])
    const D = api.daylightTower()
    const A = await api.aseTower(null)
    const fd = floors[c.detail]
    const obs = api.obstructionAngles(fd)
    const dl = api.daylightFloor(fd, 2, 2), as = api.aseFloor(fd, true)
    const rec = {
      id: c.id, note: c.note, tower: c.tower, pos: c.pos, site: c.site, zones: c.zones === 'default' ? 'default' : zones, vt: c.vt, target: c.target, period: c.period || null,
      floors: floors.map((f) => ({ i: f.i, z: f.z, area: f.area })),
      expected: {
        tower: { sda: D.sda, over: D.over, mean: D.mean, da: D.da, udiS: D.udiS, udiU: D.udiU, udiE: D.udiE, unique: D.unique, hourly: D.hourly,
          rows: D.rows.map((r) => ({ i: r.i, mean: r.mean, pctLit: r.pctLit, da: r.da, udiS: r.udiS, udiU: r.udiU, udiE: r.udiE, dsf: r.dsf })) },
        ase: { pct: A.pct, period: A.period, rows: A.rows.map((r) => r.pct) },
        detail: { floor: c.detail, obs, edges: api.edgesOf(fd).map((e) => [r6(e.L), e.o]),
          dl: { mean: dl.mean, pctLit: dl.pctLit, daMean: dl.daMean, cells: dl.cells, hours: dl.hours, irc: dl.irc, df: cellSample(dl.df, 3), da: cellSample(dl.da, 3) },
          ase: { pctOver: as.pctOver, cells: as.cells, positions: as.positions, thr: as.thr, hrs: cellSample(as.hrs, 3) } },
      },
    }
    if (c.full) { // her full resolution once: every cell, every occupied hour
      const f0 = floors[0], dlF = api.daylightFloor(f0, 1, 1), asF = api.aseFloor(f0, false)
      rec.expected.full = { dl: { mean: dlF.mean, pctLit: dlF.pctLit, daMean: dlF.daMean, udiS: dlF.udiS, udiU: dlF.udiU, udiE: dlF.udiE, cells: dlF.cells, hours: dlF.hours, dsf: dlF.dsf, da: cellSample(dlF.da, 11) },
        ase: { pctOver: asF.pctOver, cells: asF.cells, hrs: cellSample(asF.hrs, 11) } }
    }
    cases.push(rec)
    console.error(c.id, 'ok', 'sDA', (D.sda * 100).toFixed(1) + '%', 'ASE', (A.pct * 100).toFixed(1) + '%', 'DF', (D.mean * 100).toFixed(2) + '%', 'unique', D.unique)
  }

  // ---- the hourly climate the port runs on, as her page holds it (climate.js + weather.json) ----
  const hourlyFile = path.join(path.dirname(out), '..', 'data', 'sunWindHourly.json')
  fs.writeFileSync(hourlyFile, JSON.stringify({ source: 'Sun & Wind Studio (Sinnie Choi), weather.json at ' + COMMIT + ': hourly records of the CWEC2020 typical year for Vancouver Intl AP (WMO 718920), climate.onebuilding.org; tz by month and the 4 m elevation fallback as her page (climate.js) holds them',
    station: C.station, lat: C.lat, lon: C.lon, elev: C.elev ?? null, tz: C.tz, days: C.days, t: C.hourly.t, ghi: C.hourly.ghi, dni: C.hourly.dni, dhi: C.hourly.dhi }))
  fs.writeFileSync(out, JSON.stringify({ source: 'Sun & Wind Studio (Sinnie Choi), physics.js + study.js + core.js + climate.js + weather.json + site.json at ' + COMMIT, recorded: new Date().toISOString().slice(0, 10),
    defaultZones: api.DEFAULT_ZONES, dlR: api.DL_R, phys: physOut, bld: bldOut, cases }))
  console.error('wrote', out, cases.length, 'cases;', hourlyFile)
}
main().catch((e) => { console.error(e); process.exit(1) })
