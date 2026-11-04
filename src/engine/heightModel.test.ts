// The combined height model (after Vista v37): City-sourced estimates stay exactly the View-cone height check, the 16
// other cones get Vista's Imagine study surface (clearly an assumption), and the suggestion names what controls it.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { decodeTerrain, sampleTerrain, type Manifest } from '../lib/cityLayers'
import { heightGrid } from './heightGrid'
import { STUDY, VISTA_REFERENCE, coneSurfaces, combine, planeZ, stackSuggestion, studySurface, suggestAt, surfacesAt, surfacesOver, type StackPart } from './heightModel'
import { loadPolicy } from './heightPolicy'
import { blockSpans } from './massing'
import { CONES, CONE_PARAMS, limitAt } from './viewCones'
import { latLonToVista, vistaToCity, type Pt } from './vista'
import type { Tower } from './types'

const ORIGIN: Pt = [491300, 5458600]
const DIR = new URL('../../public/data/', import.meta.url)
const read = (f: string) => { const b = readFileSync(new URL(f, DIR)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer }
const manifest = JSON.parse(readFileSync(new URL('layers.json', DIR), 'utf8')) as Manifest
const layer = (id: string) => manifest.layers.find((l) => l.id === id)!
const grids = [decodeTerrain(read(layer('terrain_r1').file), layer('terrain_r1').grid!), decodeTerrain(read(layer('terrain_r2').file), layer('terrain_r2').grid!)]
const groundAt = (p: Pt) => sampleTerrain(grids, p[0] - ORIGIN[0], p[1] - ORIGIN[1])
const policy = loadPolicy(JSON.parse(readFileSync(new URL('vista/height_policy.json', DIR), 'utf8')), ORIGIN)
const surfaces = coneSurfaces(groundAt)
const cone = (id: string) => CONES.find((c) => c.id === id)!

describe('combined height model', { timeout: 30_000 }, () => {
  it("puts Vista's downtown reference at its model origin, converted through lat/lon", () => {
    const [x, y] = latLonToVista(49.2827, -123.1207)
    expect(Math.hypot(x, y)).toBeLessThan(1e-9)
    expect(VISTA_REFERENCE).toEqual(vistaToCity([0, 0]))
    expect(Math.hypot(VISTA_REFERENCE[0] - ORIGIN[0], VISTA_REFERENCE[1] - ORIGIN[1])).toBeLessThan(400) // downtown, near the app origin
  })
  it('keeps the 8 City-sourced estimates exactly; the 16 others get a study surface, flagged as an assumption', () => {
    expect(surfaces).toHaveLength(24)
    const est = surfaces.filter((s) => s.kind === 'estimate'), study = surfaces.filter((s) => s.kind === 'study')
    expect(est.map((s) => s.cone.id).sort()).toEqual(Object.keys(CONE_PARAMS).sort())
    expect(study).toHaveLength(16)
    for (const s of est) for (const q of [s.cone.ring[1], s.cone.ring[Math.floor(s.cone.ring.length / 2)]]) {
      expect(planeZ(s.plane, q)).toBeCloseTo(limitAt(s.cone, q) as number, 9)
      expect(s.flag).toBe(CONE_PARAMS[s.cone.id].flag)
    }
    for (const s of study) {
      expect(s.flag).toBe('team_assumption')
      expect(s.label).toMatch(/not a City ceiling/)
      expect(s.u95).toBeNull()
    }
  })
  it("builds Vista's Imagine default: the eye 1.6 m over the terrain at the origin, 120 m at the reference", () => {
    const c = cone('3.2.2'), O = c.ring[0], g = groundAt(O)!
    const s = studySurface(c, g)
    expect(s.eye).toBeCloseTo(g + STUDY.eyeHeightM, 9)
    expect(planeZ(s.plane, O)).toBeCloseTo(g + 1.6, 9)
    expect(planeZ(s.plane, VISTA_REFERENCE)).toBeCloseTo(120, 9)
    // QE Park: MRDEM-30 gives 118.2 m at the origin, so the modelled eye is 4.8 m under the City's Lv (124.6 m); the
    // Cambie Bridge viewpoint (E) is on the deck, 12.7 m over the modelled ground. Both are said in the source text.
    expect(s.eyeMinusLv).toBeCloseTo(-4.8, 0)
    expect(s.source).toMatch(/4\.8 m below the City's viewpoint elevation/)
    const e = surfaces.find((k) => k.cone.id === 'E')!
    expect(e.kind).toBe('study')
    expect(e.eyeMinusLv).toBeLessThan(-12)
    const flat = studySurface(c, null)
    expect(flat.plane).toMatchObject({ z0: 120, a: 0, b: 0 })
    expect(flat.label).toMatch(/flat 120 m/)
  })
  it('combines by source: the lowest controls, a zoning number is needed for a complete suggestion', () => {
    const hit = surfacesAt([491636, 5458756], surfaces)
    expect(hit.length).toBeGreaterThan(0)
    const ready = combine({ status: 'ready', heightM: 30, zones: [], ruleIds: ['C-2A'], controlling: 'C-2A', sources: [], notes: [], complexityLimited: false }, hit, 30, policy)
    expect(ready).toMatchObject({ status: 'ready', heightM: 30 })
    expect(ready.controlling?.kind).toBe('zoning')
    const low = combine({ status: 'ready', heightM: 500, zones: [], ruleIds: ['X'], controlling: 'X', sources: [], notes: [], complexityLimited: false }, hit, 30, policy)
    expect(low.controlling?.kind).toBe(hit[0].surface.kind)
    expect(low.heightM).toBeCloseTo(hit[0].z - 30 - 0.1, 9)
    const partial = combine({ status: 'unknown', heightM: null, zones: [], ruleIds: ['unresolved:DD'], controlling: null, sources: [], notes: [], complexityLimited: false }, hit, 30, policy)
    expect(partial.status).toBe('partial')
    expect(partial.notes.join(' ')).toMatch(/never a guessed height/)
    expect(combine(null, [], 30, policy).status).toBe('none')
  })
  it('QE Park: at the case 5 site the City-sourced 3.2.3 estimate controls; in 3.2.2 only, the study surface does (said)', () => {
    const p5: Pt = [491636, 5458756]
    const s5 = suggestAt(p5, { policy, surfaces, ground: groundAt(p5), origin: ORIGIN })
    expect(s5.controlling?.kind).toBe('estimate')
    expect(s5.controlling && 'surface' in s5.controlling && s5.controlling.surface.cone.id).toBe('3.2.3')
    const p3: Pt = [491272.2, 5458589.7]
    const s3 = suggestAt(p3, { policy, surfaces, ground: groundAt(p3), origin: ORIGIN })
    expect(s3.cones.map((h) => h.surface.cone.id)).toEqual(['3.2.2'])
    expect(s3.controlling?.kind).toBe('study')
    expect(s3.controlling?.flag).toBe('team_assumption')
    expect(s3.notes.join(' ')).toMatch(/study surface: a team assumption, not a City ceiling/)
  })
  it("Vista's stacked suggestion: scales the blocks together until each top clears the surface over its own footprint", () => {
    // A low wide podium inside 3.2.3 and a slim tower set back: the tower top controls.
    const t: Tower = { id: 't', name: 'T', x: 491636 - ORIGIN[0], y: 5458756 - ORIGIN[1], rotation: 0, width: 20, depth: 20, height: 200, f2f: 4, podiumHeight: 0, podiumWidth: 40, podiumDepth: 40, podiumUse: 'retail', bands: [{ use: 'office', share: 1 }], coreShare: 0.25, plantEvery: 0, coreAuto: false, skyLobbies: [],
      blocks: [{ id: 'p', height: 20, width: 40, depth: 40, dx: 0, dy: 0, rotation: 0, podium: true }, { id: 'u', height: 180, width: 20, depth: 20, dx: 0, dy: 0, rotation: 0 }] }
    const base = groundAt([491636, 5458756])!
    const parts: StackPart[] = blockSpans(t).map((s) => ({ ring: s.ring.map(([x, y]) => [x + ORIGIN[0], y + ORIGIN[1]] as Pt), z0: s.z0, z1: s.z1, label: s.block.id }))
    const r = stackSuggestion(parts, base, surfaces, null, policy)
    expect(r.status).toBe('partial') // no zoning given: cones only
    const over = surfacesOver(parts[1].ring, surfaces)[0]
    expect(r.maxHeightM).toBeCloseTo(over.z - base - 0.1, 6) // the top block's ratio is 1
    expect(r.controlPart).toBe('u')
    expect(r.intrusion).toBe(true)
    expect(r.scale).toBeCloseTo((r.maxHeightM as number) / 200, 12)
    // With a lower zoning number, zoning controls and the result is complete.
    const z = stackSuggestion(parts, base, surfaces, { status: 'ready', heightM: 23, zones: [], ruleIds: ['C-2A'], controlling: 'C-2A', sources: [], notes: [], complexityLimited: false }, policy)
    expect(z).toMatchObject({ status: 'ready', maxHeightM: 23, controlPart: 'whole tower' })
    expect(z.controlling?.kind).toBe('zoning')
    // Each block must stay at least 1 m tall; an uploaded model is never scaled.
    const thin = stackSuggestion([{ ring: parts[0].ring, z0: 0, z1: 0.5, label: 'sliver' }, { ring: parts[1].ring, z0: 0.5, z1: 5000, label: 'u' }], base, surfaces, null, policy)
    expect(thin.status).toBe('no_positive_height')
    expect(stackSuggestion(parts, base, surfaces, null, policy, { imported: true }).status).toBe('unsupported')
  })
  it('the map grid agrees with the point answer at its cell centres', () => {
    const box = { x0: 491200, y0: 5458500, x1: 491800, y1: 5458900 }
    const g = heightGrid(box, 20, surfaces, policy, ORIGIN, groundAt)
    let checked = 0
    for (let r = 0; r < g.rows; r += 5) for (let c = 0; c < g.cols; c += 5) {
      const k = r * g.cols + c, p: Pt = [box.x0 + (c + 0.5) * 20, box.y0 + (r + 0.5) * 20]
      const s = suggestAt(p, { policy, surfaces, ground: groundAt(p), origin: ORIGIN })
      const zoneHere = policy.zoneAt([p[0] - ORIGIN[0], p[1] - ORIGIN[1]])
      if (!zoneHere || s.zoning?.zones.length !== 1) continue // boundary cells: the point rule counts every touching zone
      checked++
      if (s.status === 'none') expect(g.sugState[k]).toBe(0)
      else { expect(g.sugState[k]).toBe(s.status === 'ready' ? 1 : 2); expect(g.suggestion[k]).toBeCloseTo(s.heightM as number, 3) }
    }
    expect(checked).toBeGreaterThan(20)
  })
})
