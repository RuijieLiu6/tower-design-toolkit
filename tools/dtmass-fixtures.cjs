// Records outputs of Sinnie Choi's own massing generator (Downtown Massing Tool, github.com/xubynii/dtmass: src/gen.js,
// brief.js, model.js) as fixtures for the Toolkit's port (src/engine/dtmassGen.ts, used with her permission, 6 Nov 2026).
// Her code is not copied into this repo: the script loads it from a local clone of hers.
//   git clone https://github.com/xubynii/dtmass ../dtmass
//   node tools/dtmass-fixtures.cjs ../dtmass/src src/engine/dtmassGen.fixtures.json
// No setback set, no CODES, no Form (the port leaves those to the Toolkit's own checks); cores are dropped from the
// expected blocks, and the ramp is not compared.
const fs = require('fs'), path = require('path'), vm = require('vm')
const [src, out] = process.argv.slice(2)
const ctx = { console, Math, Object, Array, Number, String, JSON, Map, Set, Error, document: { getElementById: () => null, addEventListener() {} }, requestAnimationFrame: () => 0, cancelAnimationFrame() {} }
ctx.window = ctx
vm.createContext(ctx)
for (const f of ['model.js', 'brief.js', 'gen.js']) vm.runInContext(fs.readFileSync(path.join(src, f), 'utf8'), ctx, { filename: f })
// density: gross floor area above grade over the site area (her Rules.density counts exclusions; none apply here)
ctx.Rules = { density: (p) => { const t = ctx.Model.totals(p), a = p.site.area || p.site.w * p.site.d; return { fsr: t.gfaAbove / a } } }
const Gen = ctx.Gen
// Sites cover both frontage axes (S/N along x, W/E along y), the competition block and a lot too small for a courtyard.
const SITES = {
  s75x60: { w: 75, d: 60, frontage: 'S', lane: 'N' },
  vtc: { w: 144.8, d: 79.2, frontage: 'S', lane: 'N', area: 11468 },
  w40x90: { w: 40, d: 90, frontage: 'W', lane: 'E' },
  n50x50: { w: 50, d: 50, frontage: 'N', lane: 'S' },
  small: { w: 30, d: 28, frontage: 'S', lane: 'N' },
}
// Her default brief, her README example (1189 Howe St), a supertall and a housing brief with a height target.
const BRIEFS = {
  def: {},
  readme: { gfa: 24000, plate: 620, parkingLevels: 2, mix: { residential: 55, hotel: 10, office: 15, retail: 8, restaurant: 4, amenity: 8 } },
  tall: { gfa: 120000, plate: 1800, heightTarget: 285, parkingLevels: 0, mix: { residential: 50, hotel: 15, office: 25, retail: 6, restaurant: 2, amenity: 2 } },
  homes: { gfa: 18000, plate: 600, heightTarget: 60, parkingLevels: 1, mix: { residential: 90, hotel: 0, office: 0, retail: 10, restaurant: 0, amenity: 0 } },
}
const PARAMS = { none: {}, moved: { along: 0.6, depth: -0.4, aspect: 1.6, podiumStoreys: 5, gap: 30, share: 60, barDepth: 12, corner: 'lane-right' } }
// Every brief with the default parameters; the default brief also with moved parameters and with a variation seed.
const RUNS = [...Object.keys(BRIEFS).map((b) => [b, 'none', 0]), ['def', 'moved', 0], ['def', 'none', 2]]
const cases = []
for (const [sk, site] of Object.entries(SITES)) for (const key of ['slender', 'podium', 'split', 'court']) for (const [bk, pk, seed] of RUNS) {
  const b = BRIEFS[bk], P = PARAMS[pk]
  const brief = Object.assign(ctx.Brief.DEF(), JSON.parse(JSON.stringify(b)))
  brief.f2f = Object.assign(ctx.Brief.DEF().f2f, b.f2f || {})
  const project = { site: { ...site, setbackSet: 'none' }, brief, blocks: [], ramps: [] }
  const r = Gen.generate(project, key, { ...P }, seed)
  const strip = (x) => ({ use: x.use, name: x.name, x: x.x, y: x.y, w: x.w, d: x.d, z0: x.z0, floors: x.floors, f2f: x.f2f })
  cases.push({
    id: `${sk}/${bk}/${key}/${pk}/${seed}`, site, brief: { gfa: brief.gfa, heightTarget: brief.heightTarget, plate: brief.plate, parkingLevels: brief.parkingLevels, f2f: brief.f2f, mix: brief.mix, order: brief.order }, key, P, seed,
    expect: { blocks: r.blocks.filter((x) => x.use !== 'core').map(strip), rows: r.rows, genTotal: r.genTotal, reqTotal: r.reqTotal, height: r.height, storeys: r.storeys, fsr: r.fsr, towers: r.towers, podiumStoreys: r.podiumStoreys, notes: r.notes, conflicts: r.conflicts, label: r.label },
  })
}
fs.writeFileSync(out, JSON.stringify({ source: 'Outputs of Sinnie Choi\'s Downtown Massing Tool generator (github.com/xubynii/dtmass src/gen.js, commit 2ef1d96), run in Node with no setback set; used with her permission to test the Toolkit port.', cases }, null, 0))
console.log(cases.length, 'cases written')
