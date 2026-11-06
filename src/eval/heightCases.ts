// Evaluation cases for "Height references & suggestion" (built.heights, after Vista v37, Ruijie Liu), on the real data:
// zoning lookups at known parcels, a DD site with no number, the controlling source of the combined limit at Queen
// Elizabeth Park cone points, the frame conversion onto the City's own zoning layer, and Vista's stacked-block rule.
// Data is read from public/ (Node: the file system; browser: the app's own ./data), loaded once.
import type { EvalCase } from './cases'
import { stackSuggestion, suggestAt, surfacesOver, coneSurfaces, type ConeSurface } from '../engine/heightModel'
import { loadPolicy, readRule, type HeightPolicy } from '../engine/heightPolicy'
import { blockSpans } from '../engine/massing'
import type { Tower } from '../engine/types'
import type { Pt } from '../engine/vista'
import { decodeFootprints, decodeTerrain, sampleTerrain, type Footprint, type Manifest } from '../lib/cityLayers'
import { dmPoints, parcelRow, type ParcelAttrs, type ZoningData } from '../lib/contextLayers'

const ORIGIN: Pt = [491300, 5458600]

async function publicFile(path: string): Promise<ArrayBuffer> {
  if (typeof window === 'undefined') {
    const fsName = 'node:fs' // a variable, so the browser bundle never tries to resolve it
    const { readFileSync } = (await import(/* @vite-ignore */ fsName)) as { readFileSync: (u: URL) => { buffer: ArrayBuffer; byteOffset: number; byteLength: number } }
    const b = readFileSync(new URL(`../../public/${path}`, import.meta.url))
    return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)
  }
  const r = await fetch(`./${path}`)
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`)
  return r.arrayBuffer()
}
const json = async <T>(path: string) => JSON.parse(new TextDecoder().decode(await publicFile(path))) as T

interface Data { policy: HeightPolicy; parcels: Footprint[]; attrs: ParcelAttrs; surfaces: ConeSurface[]; groundAt: (p: Pt) => number | null }
let data: Promise<Data> | null = null
function load(): Promise<Data> {
  data ??= (async () => {
    const [raw, pb, attrs, manifest] = await Promise.all([json<unknown>('data/vista/height_policy.json'), publicFile('data/parcels.bin'), json<ParcelAttrs>('data/parcels.json'), json<Manifest>('data/layers.json')])
    const layer = (id: string) => manifest.layers.find((l) => l.id === id)!
    const grids = [decodeTerrain(await publicFile(`data/${layer('terrain_r1').file}`), layer('terrain_r1').grid!), decodeTerrain(await publicFile(`data/${layer('terrain_r2').file}`), layer('terrain_r2').grid!)]
    const groundAt = (p: Pt) => sampleTerrain(grids, p[0] - ORIGIN[0], p[1] - ORIGIN[1])
    return { policy: loadPolicy(raw, ORIGIN), parcels: decodeFootprints(pb), attrs, surfaces: coneSurfaces(groundAt), groundAt }
  })()
  return data
}
const lot = (d: Data, address: string) => d.parcels.find((_, i) => parcelRow(d.attrs, i).address === address)?.outer as Pt[] | undefined

export const HEIGHT_CASES: EvalCase[] = [
  {
    id: 'HGT-T', node: 'built.heights', type: 'typical', title: 'Zoning height at known parcels: the district the tax report names, at its basic height',
    input: '1265 Beach Av (RM-5A), 1935 Cornwall Av (C-2A), 2424 Maple St (R5-3), 1551 Cypress St (RM-4): the lot outline',
    expected: 'ready: 18.3 m RM-5A; 23 m C-2A; 84 m R5-3; 10.7 m RM-4 (Vista transcriptions, unverified)',
    basis: "Vista v37 height_policy.json (by-law sections per district); the City property tax report's zoning on the same lots", basisFlag: 'unverified',
    run: async () => {
      const d = await load()
      const want: [string, string, number][] = [['1265 Beach Av', 'RM-5A', 18.3], ['1935 Cornwall Av', 'C-2A', 23], ['2424 Maple St', 'R5-3', 84], ['1551 Cypress St', 'RM-4', 10.7]]
      const got = want.map(([a]) => { const r = d.policy.zoning([lot(d, a) ?? null]); return `${a}: ${r.status} ${r.heightM ?? '—'} ${r.controlling ?? r.ruleIds.join('+')}` })
      const pass = want.every(([a, z, h]) => { const r = d.policy.zoning([lot(d, a) ?? null]); return r.status === 'ready' && r.heightM === h && r.controlling === z })
      return { observed: got.join('; '), pass, flag: 'unverified' }
    },
  },
  {
    id: 'HGT-DD', node: 'built.heights', type: 'out-of-scope', title: 'A DD site has no zoning number and is never given a guessed height',
    input: '1475 Burrard St (tax report: DD): the lot outline and its centre point',
    expected: 'unknown, no number, "no zoning number (DD)" unresolved; the suggestion is partial (cones only) or none, never complete',
    basis: 'Today: DD, CD-1 and unknown zones show "no zoning number" (unresolved), never a guessed height; Vista height_policy.json rule unresolved:DD', basisFlag: 'team_assumption',
    run: async () => {
      const d = await load()
      const ring = lot(d, '1475 Burrard St')!
      const r = d.policy.zoning([ring])
      const c = ring.reduce((s, p) => [s[0] + p[0] / ring.length, s[1] + p[1] / ring.length], [0, 0]) as Pt
      const read = readRule(d.policy, 'unresolved:DD', 'DD')
      const s = suggestAt([c[0] + ORIGIN[0], c[1] + ORIGIN[1]], { policy: d.policy, surfaces: d.surfaces, ground: d.groundAt([c[0] + ORIGIN[0], c[1] + ORIGIN[1]]), origin: ORIGIN })
      const pass = r.status === 'unknown' && r.heightM === null && r.ruleIds.includes('unresolved:DD') && read.label === 'no zoning number (DD)' && read.flag === 'unresolved' && s.status !== 'ready'
      return { observed: `${r.status}, height ${r.heightM ?? 'none'}, rules ${r.ruleIds.join(', ')}; "${read.label}" ${read.flag}; suggestion ${s.status}`, pass, flag: 'unresolved' }
    },
  },
  {
    id: 'HGT-QE', node: 'built.heights', type: 'definition', title: 'Queen Elizabeth Park cones: the combined limit names its controlling source and kind',
    input: 'Case 5 site (491636, 5458756), inside 3.2.3; case 3 site (491272.2, 5458589.7), inside 3.2.2 only; real terrain',
    expected: 'Case 5: 3.2.3, City-sourced estimate (its CONE_PARAMS flag). Case 3: 3.2.2, study surface, team assumption, with "not a City ceiling"',
    basis: 'Ruijie, 3 Nov: the 8 CONE_PARAMS cones keep the City-sourced estimate, the other 16 use Vista\'s study surface labelled as an assumption; the lowest controls', basisFlag: 'team_assumption',
    run: async () => {
      const d = await load()
      const at = (p: Pt) => suggestAt(p, { policy: d.policy, surfaces: d.surfaces, ground: d.groundAt(p), origin: ORIGIN })
      const a = at([491636, 5458756]), b = at([491272.2, 5458589.7])
      const id = (s: typeof a) => (s.controlling && 'surface' in s.controlling ? `${s.controlling.surface.cone.id} ${s.controlling.kind} (${s.controlling.flag})` : s.controlling?.kind ?? 'none')
      const pass = id(a).startsWith('3.2.3 estimate') && id(b) === '3.2.2 study (team_assumption)' && b.notes.some((n) => /not a City ceiling/.test(n))
      return { observed: `case 5: ${id(a)}, ${a.heightM?.toFixed(1)} m ${a.status}; case 3: ${id(b)}, ${b.heightM?.toFixed(1)} m ${b.status}`, pass, flag: 'team_assumption' }
    },
  },
  {
    id: 'HGT-F', node: 'built.heights', type: 'repeated', title: "Vista's zones land on the City's own zoning layer after the frame conversion",
    input: "Every Vista zone vertex in the downtown box vs the same district's edges in zoning.json (City, same day, 0.5 m simplification)",
    expected: 'median under 6 cm, max under 0.56 m',
    basis: 'C04 frame rule: Vista frame → lat/lon → EPSG:26910 with no datum shift; zoning.json build (simplify 0.5 m, decimetres)', basisFlag: 'verified',
    run: async () => {
      const d = await load(), ours = await json<ZoningData>('data/zoning.json')
      const edges = new Map<string, [Pt, Pt][]>()
      for (const [k, flat] of ours.polys) { const r = dmPoints(flat), z = ours.districts[k]; edges.set(z, [...(edges.get(z) ?? []), ...r.map((p, i) => [p, r[(i + 1) % r.length]] as [Pt, Pt])]) }
      const seg = (p: Pt, a: Pt, b: Pt) => { const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy, t = L ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L)) : 0; return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy) }
      const res: number[] = []
      for (const z of d.policy.zones) { const mine = edges.get(z.zone); if (!mine) continue; for (const p of z.polygons.flat(2)) { if (p[0] < -2300 || p[0] > 2400 || p[1] < -1900 || p[1] > 1900) continue; const v = Math.min(...mine.map(([a, b]) => seg(p, a, b))); if (v < 5) res.push(v) } }
      res.sort((a, b) => a - b)
      const med = res[Math.floor(res.length / 2)], max = res[res.length - 1]
      return { observed: `${res.length} vertices, median ${(med * 100).toFixed(1)} cm, max ${max.toFixed(2)} m`, pass: res.length > 8000 && med < 0.06 && max < 0.56, flag: 'verified' }
    },
  },
  {
    id: 'HGT-S', node: 'built.heights', type: 'boundary', title: "Vista's stacked-block suggestion: the top block clears the lowest surface over it by 0.1 m",
    input: 'Podium 40 × 40 × 20 m and tower 20 × 20 × 180 m at the case 5 site, no zoning number given',
    expected: 'partial (cones only); max height = lowest surface over the top block − base − 0.1 m; Adjust scale = max / 200',
    basis: 'Vista v37 view-height-suggestion.js (CLEARANCE_M 0.1, uniform scale of every block, MIN_PART_HEIGHT_M 1)', basisFlag: 'verified',
    run: async () => {
      const d = await load()
      const t: Tower = { id: 's', name: 'S', x: 491636 - ORIGIN[0], y: 5458756 - ORIGIN[1], rotation: 0, width: 20, depth: 20, height: 200, f2f: 4, podiumHeight: 0, podiumWidth: 40, podiumDepth: 40, podiumUse: 'retail', bands: [{ use: 'office', share: 1 }], coreShare: 0.25, plantEvery: 0, coreAuto: false, skyLobbies: [],
        blocks: [{ id: 'p', height: 20, width: 40, depth: 40, dx: 0, dy: 0, rotation: 0, podium: true }, { id: 'u', height: 180, width: 20, depth: 20, dx: 0, dy: 0, rotation: 0 }] }
      const base = d.groundAt([491636, 5458756]) as number
      const parts = blockSpans(t).map((s) => ({ ring: s.ring.map(([x, y]) => [x + ORIGIN[0], y + ORIGIN[1]] as Pt), z0: s.z0, z1: s.z1, label: s.block.id }))
      const r = stackSuggestion(parts, base, d.surfaces, null, d.policy)
      const want = surfacesOver(parts[1].ring, d.surfaces)[0].z - base - 0.1
      const pass = r.status === 'partial' && Math.abs((r.maxHeightM as number) - want) < 1e-6 && Math.abs((r.scale as number) - want / 200) < 1e-12 && r.controlPart === 'u'
      return { observed: `${r.status}, max ${r.maxHeightM?.toFixed(3)} m (expected ${want.toFixed(3)}), scale ${r.scale?.toFixed(4)}, block ${r.controlPart}`, pass, flag: 'verified' }
    },
  },
  {
    id: 'HGT-I', node: 'built.heights', type: 'typical', title: "Imagine Vancouver: every Vista building joins Vista's table, and every lowered part clears the surfaces over it",
    input: "All 62,000 parts of Vista's own buildings (public/data/vista_buildings, less the OpenStreetMap fill beyond Vista's model), seated on the Real Vancouver ground; With view cones",
    expected: "no part missing from Vista's table; 44,402 buildings with a zoning number; every lowered part's roof ≤ lowest surface − 0.1 m (or zero height); both kinds of surface cut somewhere",
    basis: 'Vista v37 imagine-city-engine.js (0.1 m clearance, one scale per connected assembly); Ruijie: never a guessed height', basisFlag: 'verified',
    run: async () => {
      const d = await load()
      const [{ loadVistaBuildings, seatVista }, { prepareImagine, imagine }] = await Promise.all([import('../lib/vistaBuildings'), import('../engine/imagine')])
      const manifest = await json<Manifest>('data/layers.json')
      const vb = await loadVistaBuildings(manifest, (f) => publicFile(`data/${f}`))
      if (!vb) return { observed: 'no Vista buildings layer', pass: false }
      const layer = (id: string) => manifest.layers.find((l) => l.id === id)!
      const grids = [decodeTerrain(await publicFile(`data/${layer('terrain_r1').file}`), layer('terrain_r1').grid!), decodeTerrain(await publicFile(`data/${layer('terrain_r2').file}`), layer('terrain_r2').grid!)]
      const seated = seatVista(vb.footprints, vb.vista, grids)
      const table = await json<import('../engine/imagine').ImagineTable>('data/vista/imagine_zoning.json')
      const prep = prepareImagine(table, { footprints: vb.footprints, ground: seated.ground, roof: seated.roof }, d.surfaces, ORIGIN)
      const v = imagine(prep, 'views')
      // Only Vista's own parts are in Vista's table; the OpenStreetMap fill beyond Vista's model (4 Nov) has no zoning row and stays as it is.
      const fill = vb.vista.fill, own = vb.footprints.length - (fill < 0 ? 0 : vb.vista.asset.filter((a) => a === fill).length)
      const missing = [...prep.partRow].filter((r, p) => r < 0 && vb.vista.asset[p] !== fill).length
      let bad = 0
      prep.hits.forEach((h, p) => { const g = v.groups[prep.partGroup[p]]; if (h.length && g.changed && g.scale > 0 && v.roof[p] > h[0].z - 0.1 + 1e-4) bad++ })
      const pass = missing === 0 && table.status.filter((s) => s === 0).length === 44402 && bad === 0 && v.stats.byEstimate > 0 && v.stats.byStudy > 0
      return { observed: `${own} of Vista's parts (${vb.footprints.length} with the fill), ${missing} missing; ${v.stats.changed} changed (${v.stats.reduced} lower), cut by estimate ${v.stats.byEstimate}, by study surface ${v.stats.byStudy}, zero height ${v.stats.noPositiveHeight}; ${bad} parts above a surface`, pass, flag: 'verified' }
    },
  },
]
