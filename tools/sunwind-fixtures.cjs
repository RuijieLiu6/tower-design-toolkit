// Records outputs of Sinnie Choi's pedestrian wind engine (Sun & Wind Studio, github.com/xubynii/sun-wind-studio:
// study.js runWind / summarise / runWindStudy's annual blend, core.js buildSiteRaster / towerRaster / plazaCellsAt /
// rasterTri / dilate / roseFor / periodInfo) as fixtures for the Toolkit's port (src/engine/windComfort.ts). Her code is
// not copied into this repo: the script reads it from a local clone of hers at a pinned commit, slices the functions out
// of her files by name and runs them in a vm context with the few globals they touch (LAB, DOM, CLIMATE, SW) stubbed.
//   git clone https://github.com/xubynii/sun-wind-studio ../sun-wind-studio
//   node tools/sunwind-fixtures.cjs ../sun-wind-studio src/engine/windComfort.fixtures.json
// Ruijie's message to Sinnie of 9 Nov (04 Tool Plan/permissions/DRAFT_MESSAGES.md §1c) asks for her OK on this reuse.
const fs = require('fs'), path = require('path'), vm = require('vm'), { execFileSync } = require('child_process')
const [clone, out] = process.argv.slice(2)
const COMMIT = 'c24addb2e5b956d56077c74cffdb0847aa8e2b80' // her main, 16 Nov 2026
const show = (f) => execFileSync('git', ['-C', clone, 'show', `${COMMIT}:${f}`], { encoding: 'utf8', maxBuffer: 64 << 20 })
const study = show('study.js'), core = show('core.js'), weather = JSON.parse(show('weather.json')), site = JSON.parse(show('site.json'))

/** The text of `function name(...) { ... }` in src, by brace counting (none of these functions has a brace in a string). */
function fn(src, name) {
  const i = src.indexOf(`function ${name}(`)
  if (i < 0) throw new Error(`function ${name} not found`)
  let j = src.indexOf('{', i), depth = 0
  for (; j < src.length; j++) { const c = src[j]; if (c === '{') depth++; else if (c === '}' && --depth === 0) return src.slice(i, j + 1) }
  throw new Error(`function ${name}: unbalanced`)
}
const line = (src, re) => { const m = src.match(re); if (!m) throw new Error(`line ${re} not found`); return m[0] }

// Her constants and helpers, verbatim from the pinned commit.
const code = [
  line(study, /^const ALPHA=.*$/m), line(study, /^const SEASON_ROSE=.*$/m), line(study, /^const SEASON_SPEED=.*$/m),
  line(study, /^const DOM=.*$/m), line(study, /^const clone=.*$/m), line(study, /^const fmtMD=.*$/m), line(study, /^const cls=.*$/m),
  'let siteRaster=null; let windResult=null;',
  ...['parseMD', 'doyOf', 'monthOf', 'periodInfo', 'roseFor', 'rasterTri', 'buildSiteRaster', 'towerRaster', 'dilate', 'plazaCellsAt', 'baseCorners', 'runWind', 'summarise'].map((n) => fn(study, n)),
  fn(core, 'polyBounds'), fn(core, 'toWorld'), fn(core, 'toLocal'),
].join('\n')

const CLIMATE = { ...weather, months: weather.months, days: weather.days }
const LAB = { CLIMATE, polyBounds: null, toWorld: null, toLocal: null, site: null, floors: null, S: { height: 0, site: { future: true }, impact: { period: { from: '01-01', to: '12-31' } } } }
const ctx = { console, Math, Object, Array, Number, String, JSON, Float32Array, Uint8Array, Error, LAB, CLIMATE, SW: { ws: null } }
vm.createContext(ctx)
vm.runInContext(code + '\nLAB.polyBounds=polyBounds; LAB.toWorld=toWorld; LAB.toLocal=toLocal; globalThis.__api={runWind,summarise,buildSiteRaster,plazaCellsAt,roseFor,periodInfo,DOM,get siteRaster(){return siteRaster},set siteRaster(v){siteRaster=v}};', ctx, { filename: 'sun-wind-studio' })
const api = ctx.__api

/** Her floor record for a box tower (core.js newMask: a w × d grid of 1 m cells, all solid). */
function floor(t) {
  const nx = Math.max(1, Math.ceil(t.w)), ny = Math.max(1, Math.ceil(t.d))
  return { w: t.w, d: t.d, cx: t.cx, cy: t.cy, rot: t.rot, mask: { nx, ny, x0: -t.w / 2, y0: -t.d / 2, cells: new Uint8Array(nx * ny).fill(1) } }
}
const sparse = (a) => { const o = []; for (let k = 0; k < a.length; k++) if (a[k]) o.push(k, +a[k].toFixed(2)); return o }
const sample = (a) => { const idx = [], vals = []; for (let k = 0; k < a.length; k += 97) { idx.push(k); vals.push(+a[k].toFixed(6)) } let sum = 0, max = 0; for (let k = 0; k < a.length; k++) { sum += a[k]; if (a[k] > max) max = a[k] } return { idx, vals, sum: +sum.toFixed(3), max: +max.toFixed(6) } }
const r3 = (v) => +(+v).toFixed(3)
const summary = (s) => ({ cats: s.cats, catsB: s.catsB, worse: s.worse, better: s.better, maxS: r3(s.maxS), plazaWorst: r3(s.plazaWorst), plazaMean: r3(s.plazaMean) })
const zoneOf = (z) => z && { depth: r3(z.depth), half: r3(z.half), amp: r3(z.amp), amp0: r3(z.amp0), hn: r3(z.hn), note: z.note }

function setup(tower, future) {
  LAB.site = site; LAB.S.site.future = future; LAB.S.height = tower.height; LAB.floors = [floor(tower)]; api.siteRaster = null
  api.buildSiteRaster()
  const sr = api.siteRaster
  return { sr, plaza: api.plazaCellsAt(sr.cs, sr.nx, sr.ny) }
}

const TOWERS = {
  vtc: { w: 46, d: 46, cx: 0, cy: 0, rot: 0, height: 285 },
  turned: { w: 40, d: 30, cx: -30, cy: 10, rot: Math.PI / 4, height: 150 },
  low: { w: 60, d: 40, cx: 20, cy: -5, rot: 0, height: 60 },
}
const STRAT = { podiumH: 20, podiumExt: 10, canopy: 4, corners: 'rounded', shelter: 0.5 }
const cases = [], rasters = {}
const rasterKey = (future, sr, plaza) => { const key = future ? 'future' : 'nofuture'; rasters[key] ??= { cs: sr.cs, nx: sr.nx, ny: sr.ny, H: sparse(sr.H), bld: sr.bld.map((x) => ({ x: r3(x.x), y: r3(x.y), top: r3(x.top), fp: r3(x.fp), layer: x.layer })), plaza: sparse(plaza) }; return key }
function oneCase(id, towerKey, future, dir, speed, strat) {
  const tower = TOWERS[towerKey]; const { sr, plaza } = setup(tower, future)
  const a = api.runWind(true, dir, strat, plaza), b = api.runWind(false, dir, null, plaza)
  const s = api.summarise(a, b, speed, plaza)
  const rec = { id, mode: 'one', tower, future, dir, speed, strat, raster: rasterKey(future, sr, plaza),
    expected: { ...summary(s), zone: zoneOf(a.zone), solidA: Array.from(a.solid).reduce((p, c) => p + c, 0), solidB: Array.from(b.solid).reduce((p, c) => p + c, 0), ratioA: sample(a.ratio), ratioB: sample(b.ratio) } }
  if (strat) { const a0 = api.runWind(true, dir, null, plaza); const vs = summary(api.summarise(a, a0, speed, plaza)); const vs0 = api.summarise(a0, b, speed, plaza); rec.expected.vsBase = { ...vs, plazaMean0: r3(vs0.plazaMean) } }
  cases.push(rec); console.error(id, 'ok', s.cats.map((c) => Math.round(c)).join('/'))
}
/** runWindStudy's annual branch (study.js), reproduced here because that function drives the page. */
function annualCase(id, towerKey, future, period, strat) {
  const tower = TOWERS[towerKey]; const { sr, plaza } = setup(tower, future)
  LAB.S.impact.period = period
  const PI = api.periodInfo(), rose = api.roseFor(PI), N = sr.nx * sr.ny
  const meanA = new Float32Array(N), meanB = new Float32Array(N), pOver6 = new Float32Array(N), pOver6B = new Float32Array(N), sectors = []
  let solidA = null, zone = null
  for (const r of rose) {
    const a = api.runWind(true, r.dir, strat, plaza), b = api.runWind(false, r.dir, null, plaza); solidA = a.solid; zone = a.zone || zone
    const s = api.summarise(a, b, r.s, plaza)
    for (let k = 0; k < N; k++) { if (a.solid[k]) continue; const sa = a.ratio[k] * r.s, sb = b.solid[k] ? sa : b.ratio[k] * r.s; meanA[k] += r.f * sa; meanB[k] += r.f * sb; if (sa * 1.8 > 6) pOver6[k] += r.f; if (sb * 1.8 > 6) pOver6B[k] += r.f }
    sectors.push({ dir: r.dir, name: r.name, f: r3(r.f), s: r3(r.s), ...summary(s) })
  }
  const a = { ratio: meanA, solid: solidA, nx: sr.nx, ny: sr.ny, cs: sr.cs, zone }, b = { ratio: meanB, solid: solidA, nx: a.nx, ny: a.ny, cs: a.cs }
  const s = api.summarise(a, b, 1, plaza); let gusty = 0, gustyB = 0
  for (let k = 0; k < N; k++) { if (solidA[k]) continue; if (pOver6[k] > 0.05) gusty += a.cs * a.cs; if (pOver6B[k] > 0.05) gustyB += a.cs * a.cs }
  cases.push({ id, mode: 'annual', tower, future, period, rose: rose.map((r) => ({ dir: r.dir, name: r.name, f: +r.f.toFixed(6), s: +r.s.toFixed(6) })), strat, raster: rasterKey(future, sr, plaza),
    expected: { ...summary(s), zone: zoneOf(zone), gusty, gustyB, sectors, meanA: sample(meanA), meanB: sample(meanB) } })
  console.error(id, 'ok', s.cats.map((c) => Math.round(c)).join('/'))
}

oneCase('vtc-w-plain', 'vtc', true, 270, 4.5, null)
oneCase('vtc-w-strat', 'vtc', true, 270, 4.5, STRAT)
oneCase('vtc-se-nofuture', 'vtc', false, 135, 5, null)
oneCase('turned-e', 'turned', true, 90, 4.5, null)
oneCase('low-nw', 'low', true, 315, 4, { podiumH: 12, podiumExt: 6, canopy: 0, corners: 'chamfered', shelter: 0 })
annualCase('vtc-year', 'vtc', true, { from: '01-01', to: '12-31' }, null)
annualCase('turned-winter', 'turned', true, { from: '12-01', to: '02-28' }, null)

const rose12 = weather.roseMonthly.map((m) => m.map((r) => ({ f: r.f, s: r.s })))
const roseFile = path.join(path.dirname(out), '..', 'data', 'sunWindRose.json')
fs.writeFileSync(roseFile, JSON.stringify({ source: 'Sun & Wind Studio (Sinnie Choi), weather.json at ' + COMMIT + ': monthly 8-sector wind rose distilled from the CWEC2020 typical year for Vancouver Intl AP (WMO 718920), climate.onebuilding.org', station: weather.station, lat: weather.lat, lon: weather.lon, names: weather.rose.map((r) => r.name), dirs: weather.rose.map((r) => r.dir), days: weather.days, months: weather.months, annual: weather.rose.map((r) => ({ f: r.f, s: r.s })), monthly: rose12, windMean: weather.windMean, stormSpeedP95: weather.stormSpeedP95 }, null, 1))
fs.writeFileSync(out, JSON.stringify({ source: 'Sun & Wind Studio (Sinnie Choi), study.js + core.js + weather.json + site.json at ' + COMMIT, recorded: new Date().toISOString().slice(0, 10), dom: api.DOM, roseNames: weather.rose.map((r) => r.name), roseDirs: weather.rose.map((r) => r.dir), days: weather.days, rasters, cases }))
console.error('wrote', out, cases.length, 'cases')
