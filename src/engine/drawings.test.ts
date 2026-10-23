import { describe, expect, it } from 'vitest'
import { LOD_NOTE, elevationDrawing, faces, labelLevels, mainFaces, sectionDrawing } from './drawings'
import { towerFloors } from './massing'
import type { Tower } from './types'

const vtc: Tower = {
  id: 't1', name: 'Tower 1', x: -20, y: 0, rotation: 0, width: 46, depth: 46, height: 285, f2f: 4.2,
  podiumHeight: 18, podiumWidth: 100, podiumDepth: 64, podiumUse: 'retail',
  bands: [{ use: 'office', share: 0.55 }, { use: 'hotel', share: 0.15 }, { use: 'amenity', share: 0.03 }, { use: 'residential', share: 0.27 }],
  coreShare: 0.21, plantEvery: 0,
}
const opts = { northDeg: 45, projectLabel: 'Competition site', mode: 'sheet' as const, date: '2026-10-22' }
const count = (svg: string, re: RegExp) => (svg.match(re) ?? []).length

describe('section A–A', () => {
  const d = sectionDrawing(vtc, opts)
  it('draws on the A2 sheet at the largest standard scale that fits a 285 m tower', () => {
    expect(d.svg).toContain('viewBox="0 0 594 420"')
    expect(d.svg).toContain('width="594mm"')
    expect(d.scale).toBe(1000)
    expect(d.svg).toContain('1:1000 at A2')
  })
  it('draws every level once, with use fills and labels on a subset', () => {
    const floors = towerFloors(vtc)
    expect(d.levels).toBe(floors.length)
    expect(count(d.svg, /data-level="/g)).toBe(floors.length)
    expect(count(d.svg, /data-use="office"/g)).toBe(floors.filter((f) => f.use === 'office').length)
    expect(d.labelled).toBeGreaterThan(4)
    expect(d.labelled).toBeLessThan(floors.length)
    expect(d.svg).toContain('Roof  +285.0')
    expect(d.svg).toContain('L1  +0.0')
  })
  it('cuts the core, and carries scale bar, north arrow and the LOD 100 note', () => {
    expect(d.svg).toContain('data-core="21.08"') // sqrt(0.21 × 46 × 46)
    expect(d.svg).toMatch(/data-scale-bar="50"/)
    expect(d.svg).toContain('data-north="45"')
    expect(d.svg).toContain('data-lod="100"')
    expect(d.svg).toContain('LOD 100')
  })
  it('names the view direction from true north', () => {
    expect(d.svg).toContain('Looking north-west') // local +y of an unrotated VTC tower, true north at 45°
  })
})

describe('elevations', () => {
  it('picks the face that looks most to the south and the next face round', () => {
    const f = faces(vtc, 45)
    expect(f).toHaveLength(4)
    const [a, b] = mainFaces(vtc, 45)
    expect([135, 225]).toContain(Math.round(a.bearing))
    expect(Math.abs(((a.bearing - b.bearing + 540) % 360) - 180)).toBe(90)
    expect(a.name).toMatch(/^South-(east|west) elevation$/)
    expect(b.name).toMatch(/^South-(east|west) elevation$/) // both faces look south of east-west on the VTC grid
  })
  it('projects the tower and the podium onto the face and stays on the sheet', () => {
    const [a] = mainFaces(vtc, 45)
    const d = elevationDrawing(vtc, a, opts)
    expect(d.scale).toBe(1000)
    expect(count(d.svg, /data-level="/g)).toBe(towerFloors(vtc).length)
    expect(d.svg).not.toContain('data-core=')
    expect(d.svg).toContain(a.name.toUpperCase())
    // Every floor rectangle sits inside the drawing area (x 16–424 mm) of the sheet.
    const rects = [...d.svg.matchAll(/data-use="\w+"><rect x="([\d.]+)" y="[^"]+" width="([\d.]+)"/g)].map((m) => [Number(m[1]), Number(m[2])])
    expect(rects.length).toBe(towerFloors(vtc).length)
    for (const [x, w] of rects) { expect(x).toBeGreaterThanOrEqual(16); expect(x + w).toBeLessThanOrEqual(424) }
  })
  it('a tight drawing for a board frame hugs the drawing and keeps scale bar and LOD note', () => {
    const d = elevationDrawing(vtc, mainFaces(vtc, 45)[0], { ...opts, mode: 'tight' })
    expect(d.widthMm).toBeLessThan(300)
    expect(d.heightMm).toBeGreaterThan(285) // 285 m at 1:1000 plus margins
    expect(d.svg).toContain(`viewBox="0 0 ${Math.round(d.widthMm * 100) / 100} ${Math.round(d.heightMm * 100) / 100}"`)
    expect(d.svg).toContain(LOD_NOTE.slice(0, 20))
    expect(d.svg).toMatch(/data-scale-bar=/)
  })
})

describe('level labels', () => {
  it('keeps labels at least 3.4 mm apart and always labels grade', () => {
    const floors = towerFloors(vtc)
    const lab = labelLevels(floors, 1) // 1 mm per m (1:1000)
    expect(lab[0].level).toBe(1)
    for (let i = 1; i < lab.length; i++) expect(lab[i].z0 - lab[i - 1].z0).toBeGreaterThanOrEqual(3.4)
  })
  it('labels a sky lobby when there is one', () => {
    const t: Tower = { ...vtc, skyLobbies: [40] }
    const lab = labelLevels(towerFloors(t), 1)
    expect(lab.some((f) => f.skyLobby)).toBe(true)
    expect(sectionDrawing(t, opts).svg).toContain('Sky lobby')
  })
})
