// Import from several platforms (6 Nov): the links' OBJ header, the SketchUp-style server link, and every platform's
// script being served.
import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { readObj } from '../import/obj'
import { autoMapping } from './mapping'
import { PLATFORMS } from './platforms'
import { findServer, serverHandle } from './serverLink'

const SKETCHUP_OBJ = [
  '# Tower Design Toolkit link 1.0 (SketchUp 24.0)', '# tdt units: m', '# tdt up: z', '# tdt doc: Tower.skp',
  '# tdt layer: Tower massing', 'g Tower massing',
  'v 0 0 0', 'v 30 0 0', 'v 30 30 0', 'v 0 30 0', 'v 0 0 120', 'v 30 0 120', 'v 30 30 120', 'v 0 30 120',
  'f 1 3 2', 'f 1 4 3', 'f 5 6 7', 'f 5 7 8', 'f 1 2 6', 'f 1 6 5', 'f 2 3 7', 'f 2 7 6', 'f 3 4 8', 'f 3 8 7', 'f 4 1 5', 'f 4 5 8',
  '# tdt layer: Below grade', 'g Below grade',
  'v 0 0 -6.4', 'v 30 0 -6.4', 'v 30 30 -6.4',
  'f 9 10 11',
].join('\n')

describe('import from several platforms', () => {
  it('an OBJ from a Toolkit link brings its units, up axis and layer names, so the roles map by themselves', () => {
    const raw = readObj(SKETCHUP_OBJ, 'Tower.obj')
    expect(raw.unit).toBe('m')
    expect(raw.upAxis).toBe('z')
    expect(raw.objects.map((o) => o.layer)).toEqual(['Tower massing', 'Below grade'])
    expect(raw.notes.join(' ')).toMatch(/Tower Design Toolkit link from Tower\.skp/)
    const m = autoMapping(raw)
    expect(m.rules['Tower massing']).toMatchObject({ role: 'tower' })
    expect(m.rules['Below grade']).toMatchObject({ role: 'basement' })
  })

  it('a plain OBJ still asks for its unit', () => {
    expect(readObj('v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3', 'a.obj')).toMatchObject({ unit: null, upAxis: null })
  })

  it('the server link finds the app on its ports and downloads a copy only when it changed', async () => {
    let rev = 1, downloads = 0
    const f = (async (url: string) => {
      if (url.startsWith('http://127.0.0.1:8797/')) throw new Error('refused')
      if (url.endsWith('/tdt/rev')) return new Response(JSON.stringify({ rev, doc: 'Tower.skp', objects: 12, units: 'Meters', port: 8796, version: '1.0', instant: true }), { status: 200 })
      downloads++
      return new Response(SKETCHUP_OBJ, { status: 200, headers: { 'X-TDT-Rev': String(rev) } })
    }) as typeof fetch
    const spec = { app: 'SketchUp', ports: [8797, 8796], model: 'model.obj', linkName: 'SketchUp (live link)' }
    const found = await findServer(spec, f)
    expect(found?.port).toBe(8796)
    const h = serverHandle(spec, 8796, f)
    const a = await h.getFile()
    expect(a.name).toBe('Tower.obj')
    expect(await h.getFile()).toBe(a)
    rev = 2
    expect((await h.getFile()).lastModified).toBe(2)
    expect(downloads).toBe(2)
  })

  it('every platform with a link serves its script, and says whether it has run inside the app', () => {
    for (const p of PLATFORMS) {
      if (!p.link) continue
      expect(existsSync(new URL(`../../../public/${p.link.href}`, import.meta.url)), p.link.href).toBe(true)
      expect(p.link.steps.length || p.id === 'rhino').toBeTruthy()
      expect(p.tested.text.length).toBeGreaterThan(10)
    }
    expect(PLATFORMS.map((p) => p.id)).toEqual(['rhino', 'revit', 'archicad', 'autocad', 'sketchup', 'other'])
  })
})
