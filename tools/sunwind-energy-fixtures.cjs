// Records outputs of Sinnie Choi's energy engine (Sun & Wind Studio, github.com/xubynii/sun-wind-studio: energy.js
// modelHourly, the ISO 13790 simple hourly 5R1C method with her schedules, profiles, plant efficiencies and indicative
// City of Vancouver targets; study.js zoneGlazing / zoneFor; core.js finishMask / cellsIn / toLocal for each floor's
// facade lengths and area; physics.js prep / face; climate.js as the page loads weather.json) as fixtures for the
// Toolkit's port (src/engine/energySW.ts). Her code is not copied into this repo: the script reads it from a local clone
// of hers at a pinned commit, slices the functions out by name and runs them in a vm. Engine 4 of 4.
//   node tools/sunwind-energy-fixtures.cjs ../sun-wind-studio src/engine/energy.fixtures.json
// Ruijie's message to Sinnie of 9 Nov (04 Tool Plan/permissions/DRAFT_MESSAGES.md §1c) asks for her OK on this reuse.
const fs = require('fs'), vm = require('vm'), { execFileSync } = require('child_process')
const [clone, out] = process.argv.slice(2)
const COMMIT = 'c24addb2e5b956d56077c74cffdb0847aa8e2b80' // her main, 16 Nov 2026 (still her main on 17 Nov)
const show = (f) => execFileSync('git', ['-C', clone, 'show', `${COMMIT}:${f}`], { encoding: 'utf8', maxBuffer: 64 << 20 })
const study = show('study.js'), core = show('core.js'), physics = show('physics.js'), climateJs = show('climate.js'), energy = show('energy.js')
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

const code = [
  // study.js: the façade zones and the glazing they give a floor face
  block(study, 'const STRATS='), line(study, /^const DEFAULT_ZONE=.*$/m), block(study, 'const DEFAULT_ZONES=', '[', ']'),
  'var SW=null; var sunResult=null; let tMap=null; var S=null;', fn(study, 'zoneFor'), fn(study, 'zoneGlazing'),
  // core.js: a floor's facade lengths by world orientation and its area
  fn(core, 'toLocal'), fn(core, 'cellsIn'), fn(core, 'finishMask'),
  // energy.js: the hourly 5R1C model
  block(energy, 'const OPS='), line(energy, /^const TARGETS=.*$/m), line(energy, /^const USES=.*$/m), line(energy, /^const ORI=.*$/m), 'let last=null;',
  line(energy, /^const MASS=.*$/m), line(energy, /^const SFP=.*$/m), fn(energy, 'peopleFor'), fn(energy, 'glazing'), fn(energy, 'occupied'), fn(energy, 'schedOf'),
  line(energy, /^const DAYLIT_PROG=.*$/m), line(energy, /^const H24=.*$/m), line(energy, /^const PROF=.*$/m), fn(energy, 'modelHourly'),
  'globalThis.__api={modelHourly,finishMask,DEFAULT_ZONES,OPS,TARGETS,PROF,set(v){S=v;LAB.S=v},get SW(){return SW},set SW(v){SW=v}};',
].join('\n')

async function main() {
  vm.runInContext(climateJs, ctx, { filename: 'climate.js' })
  LAB.climate.init()
  await new Promise((r) => setTimeout(r, 20))
  if (!LAB.CLIMATE.loaded || !LAB.CLIMATE.hourly) throw new Error('weather.json not applied')
  vm.runInContext(physics, ctx, { filename: 'physics.js' })
  vm.runInContext(code, ctx, { filename: 'sun-wind-studio' })
  const api = ctx.__api
  LAB.sim = { zoneGlazing: (fl, o) => vm.runInContext('zoneGlazing', ctx)(fl, o), daylightTowerCached: () => null }

  const E0 = { wwrN: 0.35, wwrE: 0.4, wwrS: 0.45, wwrW: 0.4, glazU: 1.4, wallU: 0.28, roofU: 0.18, shgc: 0.35, infil: 0.2, vent: 0.35, hr: 0.7, lpd: 6, equip: 8, heat: 'hp', cop: 3.5, setH: 21, setC: 25, shade: 0.85, mass: 'medium' } // core.js S.energy defaults
  const zone = (face, from, to, strat, wwr, shgc, depth) => ({ face, from, to, strat, wwr, shgc, depth, pv: 0, operable: false })
  const DSF_A = [0.35, 0.45, 0.55, 0.62, 0.68, 0.7, 0.72, 0.7, 0.62, 0.5, 0.38, 0.32]
  /** Floors stacked bottom-up from segments {n, w, d, h, prog, rot?, cut?}; roof and terrace as the exposed top of each floor. */
  function stack(segs, cx, cy) {
    const fl = []; let z = 0
    for (const s of segs) for (let k = 0; k < s.n; k++) { const nx = Math.ceil(s.w), ny = Math.ceil(s.d); const cells = new Uint8Array(nx * ny).fill(1); if (s.cut) { const [a, b, c, d] = s.cut; for (let iy = c; iy < d; iy++) for (let ix = a; ix < b; ix++) cells[iy * nx + ix] = 0 }
      fl.push({ i: fl.length, z, h: s.h, w: s.w, d: s.d, cx, cy, rot: s.rot || 0, core: s.core, prog: s.prog, mask: { nx, ny, x0: -s.w / 2, y0: -s.d / 2, cells } }); z += s.h }
    return fl
  }
  const CASES = [
    { id: 'office-hp', note: '20 office floors of 46 × 46 m, her default facade, heat pump, her default envelope and systems, no daylight dimming', segs: [{ n: 20, w: 46, d: 46, h: 4, prog: 'office', core: 16 }], zones: 'default', E: {}, dsf: null },
    { id: 'mixed-gas-daylit', note: 'a 60 × 50 m retail podium of 3 floors, 10 office and 15 residential floors of 40 × 30 m, gas plant, heavy mass, 50% heat recovery, daylight dimming',
      segs: [{ n: 3, w: 60, d: 50, h: 5, prog: 'retail', core: 14 }, { n: 10, w: 40, d: 30, h: 4, prog: 'office', core: 12 }, { n: 15, w: 40, d: 30, h: 3.2, prog: 'resi', core: 12 }], zones: 'default', E: { heat: 'gas', mass: 'heavy', hr: 0.5 }, dsf: 'A' },
    { id: 'hotel-resi-turned', note: 'a 36 × 28 m plate turned 30°, 12 hotel and 12 residential floors, electric resistance, light mass, 22/24 °C set points, U 2.0 glass, context lets 70% of the sun through, a double skin and fins by level',
      segs: [{ n: 12, w: 36, d: 28, h: 3.4, prog: 'hotel', core: 10, rot: Math.PI / 6 }, { n: 12, w: 36, d: 28, h: 3.2, prog: 'resi', core: 10, rot: Math.PI / 6 }],
      zones: [zone('all', 1, 12, 'doubleskin', 0.7, 0.3, 0.8), zone('E', 13, 999, 'fins', 0.45, 0.3, 0.6), zone('W', 13, 999, 'fins', 0.45, 0.3, 0.6), zone('N', 13, 999, 'curtain', 0.4, 0.35, 0), zone('S', 13, 999, 'overhang', 0.5, 0.3, 1.2)],
      E: { heat: 'res', mass: 'light', setH: 22, setC: 24, glazU: 2.0, shade: 0.7, cop: 4, lpd: 8, equip: 10 }, dsf: null },
    { id: 'open-floors', note: '8 residential floors, a sky garden with 60% of the plate open, an amenity floor and a plant floor on top (unconditioned zones), daylight dimming',
      segs: [{ n: 8, w: 40, d: 40, h: 3.2, prog: 'resi', core: 12 }, { n: 1, w: 40, d: 40, h: 6, prog: 'public', core: 12, cut: [0, 40, 0, 25] }, { n: 1, w: 40, d: 40, h: 4.5, prog: 'amenity', core: 12 }, { n: 1, w: 40, d: 40, h: 5, prog: 'mep', core: 12 }], zones: 'default', E: { infil: 0.4 }, dsf: 'A' },
  ]
  const cases = []
  for (const c of CASES) {
    const floors = stack(c.segs, 0, 0)
    api.set({ posX: 0, posY: 0, rotDeg: 0, energy: { ...E0, ...c.E } })
    vm.runInContext('tMap=null', ctx)
    const zones = c.zones === 'default' ? JSON.parse(JSON.stringify(api.DEFAULT_ZONES)) : c.zones
    api.SW = { zones, vent: { open: 0.1 }, glaz: { vt: 0.6 }, dl: { target: 300 } }
    for (const f of floors) api.finishMask(f)
    // exposed tops: what the floor above does not cover (her raster count reduces to this for stacked centred plates)
    floors.forEach((f, i) => { const up = floors[i + 1]; const exposed = up ? Math.max(0, f.area - up.area) : f.area; f.terrace = up ? exposed : 0; f.roof = up ? 0 : exposed; f.coveredVoid = 0 })
    const dsfRows = c.dsf ? floors.map((f) => ({ dsf: DSF_A.map((v) => v * (f.prog === 'retail' ? 0.6 : 1)) })) : null
    LAB.sim.daylightTowerCached = () => (dsfRows ? { rows: dsfRows } : null)
    const R = api.modelHourly(floors)
    let hs = 0, cs = 0; for (let k = 0; k < 8760; k++) { hs += R.hourly.heat[k]; cs += R.hourly.cool[k] }
    cases.push({ id: c.id, note: c.note, segs: c.segs, zones: c.zones === 'default' ? 'default' : zones, E: { ...E0, ...c.E }, dsf: dsfRows ? dsfRows.map((r) => r.dsf) : null,
      floors: floors.map((f) => ({ i: f.i, prog: f.prog, z: f.z, h: f.h, rot: f.rot, area: f.area, facade: f.facade, garden: f.garden, terrace: f.terrace, roof: f.roof, coveredVoid: f.coveredVoid })),
      expected: { rows: R.rows.map((r) => { const { ...x } = r; return x }), monthly: R.monthly, uses: R.uses, gfa: R.gfa, total: R.total, teui: R.teui, tedi: R.tedi, ghgi: R.ghgi, gas: R.gas, elec: R.elec, tgt: R.tgt, envelope: R.envelope, glz: R.glz, people: R.people,
        loss: R.loss, peakH: R.peakH, peakC: R.peakC, lightSave: R.lightSave, lightShare: R.lightShare, daylit: R.daylit, hourly: { heatSum: hs, coolSum: cs, heatAt: [100, 2000, 4500, 8000].map((k) => R.hourly.heat[k]), coolAt: [4500, 5000, 5200, 5500].map((k) => R.hourly.cool[k]) } } })
    console.error(c.id, 'ok', 'TEUI', R.teui.toFixed(1), 'TEDI', R.tedi.toFixed(1), 'GHGI', R.ghgi.toFixed(2), 'target', R.tgt.teui.toFixed(0))
  }
  fs.writeFileSync(out, JSON.stringify({ source: 'Sun & Wind Studio (Sinnie Choi), energy.js + study.js + core.js + physics.js + climate.js + weather.json at ' + COMMIT, recorded: new Date().toISOString().slice(0, 10), ops: api.OPS, targets: api.TARGETS, prof: api.PROF, cases }))
  console.error('wrote', out, cases.length, 'cases')
}
main().catch((e) => { console.error(e); process.exit(1) })
