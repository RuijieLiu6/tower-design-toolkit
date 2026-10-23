// The Vista-style PDF: valid structure, one page per view plus cover, key plan and sources, and the false assumptions
// printed. Renders are optional (null shot → a placeholder box).
import { describe, expect, it } from 'vitest'
import { CONES } from '../engine/viewCones'
import { coneCamera, exactCones, studySentence, vistaFrameSpread, coneFitHfov, type Pt } from '../engine/vista'
import { jpegSize, latin1, wrap } from './pdf/miniPdf'
import { buildVistaReport } from './vistaReport'

const fp: Pt[] = [[491621, 5458741], [491651, 5458741], [491651, 5458771], [491621, 5458771]]

describe('Vista view-study PDF', () => {
  it('writes a PDF with cover, key plan, one page per view and sources', async () => {
    const exact = exactCones(fp, 135)
    const views = ['3.2.3', '28'].map((id) => {
      const c = CONES.find((k) => k.id === id)!, cam = coneCamera(c), vs = vistaFrameSpread(c)
      return { cone: c, shot: null, eye: c.Lv, vistaEye: 122.7, hfov: cam.hfov, vistaHfov: coneFitHfov(vs), spread: cam.spread, vistaSpread: vs, bearing: cam.bearing, pitch: 2, aspect: 2.1 }
    })
    const blob = buildVistaReport({ towerName: 'Test tower', height: 120, ground: 15, groundBasis: 'project base', footprint: fp, sentence: studySentence('Test tower', 120, exact), exact, whatIf: null, views, terrain: () => 30, date: '2026-10-22' })
    const bytes = new Uint8Array(await blob.arrayBuffer())
    const text = Array.from(bytes, (b) => String.fromCharCode(b)).join('')
    expect(text.startsWith('%PDF-1.4')).toBe(true)
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true)
    expect((text.match(/\/Type \/Page\b/g) ?? []).length).toBe(2 + views.length + 1)
    expect(text).toContain('(False assumption)')
    expect(text).toContain('No render')
    // xref offsets point at their objects
    const start = Number(text.match(/startxref\n(\d+)/)![1])
    expect(text.slice(start, start + 4)).toBe('xref')
    const offsets = text.slice(start).split('\n').slice(3).filter((l) => /^\d{10} 00000 n/.test(l)).map((l) => Number(l.slice(0, 10)))
    offsets.forEach((o, i) => expect(text.slice(o, o + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`))
  })
  it('folds characters outside WinAnsi instead of dropping text', () => {
    expect(latin1('m² · 25.6° · −1.9 m – ok')).toBe('m\xB2 \xB7 25.6\xB0 \xB7 -1.9 m \x96 ok')
    expect(latin1('Δ')).toBe('?')
    expect(wrap('one two three four', 10, 40).length).toBeGreaterThan(1)
  })
  it('reads JPEG dimensions from the SOF marker', () => {
    const b = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x02, 0x3b, 0x04, 0xb0])
    expect(jpegSize(b)).toEqual({ w: 1200, h: 571 })
  })
})
