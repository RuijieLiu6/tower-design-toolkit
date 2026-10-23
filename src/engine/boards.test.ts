import { describe, expect, it } from 'vitest'
import {
  A2_RATIO, BOARD_H, BOARD_W, DEADLINE_UTC, DELIVERABLES, applyTemplate, boardChecks, coverage, deadlineInfo, effectivePpi, findTerms,
  imagePlacement, needsGlyphCheck, newBoard, parseJpeg, printedCaption, pxForDpi, searchQuality, submissionChecks, templateRects,
  tzOffsetMinutes, validateJpeg, type Board, type BoardImage, type TemplateId,
} from './boards'

/** A minimal JPEG header: SOI, optional APP segments, a SOF with three components, SOS, EOI. */
function jpeg(o: { w: number; h: number; sof?: number; y?: number; exif?: string; comment?: string; pad?: number }): Uint8Array {
  const seg = (m: number, payload: number[]) => [0xff, m, ((payload.length + 2) >> 8) & 255, (payload.length + 2) & 255, ...payload]
  const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0))
  const bytes: number[] = [0xff, 0xd8]
  bytes.push(...seg(0xe0, [...ascii('JFIF'), 0, 1, 2, 1, 0, 150, 0, 150, 0, 0]))
  if (o.exif) bytes.push(...seg(0xe1, [...ascii('Exif'), 0, 0, ...ascii(`MM\0*Artist\0${o.exif}\0`)]))
  if (o.comment) bytes.push(...seg(0xfe, ascii(o.comment)))
  bytes.push(...seg(o.sof ?? 0xc0, [8, o.h >> 8, o.h & 255, o.w >> 8, o.w & 255, 3, 1, o.y ?? 0x11, 0, 2, 0x11, 1, 3, 0x11, 1]))
  bytes.push(...seg(0xda, [3, 1, 0, 2, 0x11, 3, 0x11, 0, 63, 0]))
  for (let i = 0; i < (o.pad ?? 16); i++) bytes.push(i % 200)
  bytes.push(0xff, 0xd9)
  return new Uint8Array(bytes)
}

const img = (id: string, w: number, h: number, source: BoardImage['source'] = 'capture'): BoardImage => ({ id, dataUrl: '', w, h, source, label: id })

describe('board layout (A2 landscape)', () => {
  it('uses A2 at 1.414 and 150 dpi gives 3508 × 2480 px', () => {
    expect(A2_RATIO).toBeCloseTo(Math.SQRT2, 2)
    expect(pxForDpi(150)).toEqual({ w: 3508, h: 2480 })
  })

  it('keeps every template inside the sheet margins with no overlapping frames', () => {
    for (const t of ['hero', 'grid', 'plans', 'story'] as TemplateId[]) {
      const r = templateRects(t)
      expect(r[0].role).toBe('title')
      for (const a of r) {
        expect(a.x).toBeGreaterThanOrEqual(12 - 1e-9); expect(a.y).toBeGreaterThanOrEqual(12 - 1e-9)
        expect(a.x + a.w).toBeLessThanOrEqual(BOARD_W - 12 + 1e-6); expect(a.y + a.h).toBeLessThanOrEqual(BOARD_H - 12 + 1e-6)
        for (const b of r) if (a !== b) {
          const overlap = a.x < b.x + b.w - 1e-6 && b.x < a.x + a.w - 1e-6 && a.y < b.y + b.h - 1e-6 && b.y < a.y + a.h - 1e-6
          expect(overlap).toBe(false)
        }
      }
    }
  })

  it('moves contents in order when the template changes, and returns what no longer fits', () => {
    const b = newBoard(0, 'hero')
    b.frames[0].content = { kind: 'text', text: 'Tower on the high street', sizeMm: 9, bold: true }
    b.frames.slice(1).forEach((f, i) => { f.content = { kind: 'image', imageId: `i${i}`, fit: 'cover' }; f.tag = 'street' })
    const { board, dropped } = applyTemplate(b, 'story')
    expect(board.frames[0].content).toEqual(b.frames[0].content)
    expect(board.frames.slice(1).map((f) => f.content.kind === 'image' && f.content.imageId)).toEqual(['i0', 'i1', 'i2'])
    expect(board.frames[1].tag).toBe('street')
    expect(dropped.map((f) => f.content.kind === 'image' && f.content.imageId)).toEqual(['i3'])
  })

  it('computes the printed resolution of a placed image (cover crops to the frame)', () => {
    const frame = { id: 'f', x: 12, y: 38, w: 361, h: 370, role: 'body' as const, content: { kind: 'empty' as const } }
    const p = imagePlacement(frame, { w: 1600, h: 1131 }, 'cover', false)
    // Cover: the taller ratio wins, so the image is scaled to 370 mm high.
    expect(p.h).toBeCloseTo(370, 6)
    expect(effectivePpi(p.mmPerPx)).toBeCloseTo((25.4 * 1131) / 370, 6)
    const c = imagePlacement(frame, { w: 1600, h: 1131 }, 'contain', true)
    expect(c.w).toBeCloseTo(361, 6)
    expect(c.clip.h).toBe(363)
  })

  it('always prints the AI disclosure under an AI image', () => {
    const f = { id: 'f', x: 0, y: 0, w: 10, h: 10, role: 'body' as const, content: { kind: 'image' as const, imageId: 'a', fit: 'cover' as const }, caption: 'Retail high street at dusk' }
    expect(printedCaption(f, img('a', 10, 10, 'ai'))).toBe('AI-generated image · Retail high street at dusk')
    expect(printedCaption({ ...f, caption: '' }, img('a', 10, 10, 'ai'))).toBe('AI-generated image')
    expect(printedCaption(f, img('a', 10, 10, 'own'))).toBe('Retail high street at dusk')
  })
})

describe('anonymity and text checks', () => {
  it('finds listed words whole-word, case-insensitive and across spacing or underscores', () => {
    const terms = ['UBC', 'ARCH 540', 'Tower Design Toolkit']
    expect(findTerms('Studio review, ubc 2026', terms)).toEqual(['UBC'])
    expect(findTerms('arch540 final', terms)).toEqual(['ARCH 540'])
    expect(findTerms('ubc_board-1.jpg', terms)).toEqual(['UBC'])
    expect(findTerms('Kubco tower; a studio of towers', terms)).toEqual([])
    expect(findTerms('Made with TOWER  DESIGN  toolkit', terms)).toEqual(['Tower Design Toolkit'])
  })

  it('flags Nation names that need glyph checks', () => {
    expect(needsGlyphCheck('xʷməθkʷəy̓əm (Musqueam)')).toBe(true)
    expect(needsGlyphCheck('Sḵwx̱wú7mesh')).toBe(true)
    expect(needsGlyphCheck('Squamish')).toBe(false)
  })

  it('fails a board whose text names the school, and passes resolution for a large capture', () => {
    const b: Board = newBoard(0, 'hero')
    b.frames[0].content = { kind: 'text', text: 'UBC SALA studio tower', sizeMm: 9, bold: true }
    b.frames[1].content = { kind: 'image', imageId: 'big', fit: 'cover' }
    const images = { big: img('big', 3000, 3100) }
    const r = boardChecks(b, 1, { boards: [b], images, denyList: ['UBC', 'SALA'] })
    const anon = r.find((x) => x.id === 'b1-anon')!
    expect(anon.state).toBe('fail')
    expect(anon.value).toContain('UBC')
    expect(r.find((x) => x.id === 'b1-ppi')!.state).toBe('pass')
  })

  it('warns on a screen-sized capture blown up to a hero frame and on small type', () => {
    const b: Board = newBoard(0, 'hero')
    b.frames[1].content = { kind: 'image', imageId: 's', fit: 'cover' }
    b.frames[4].content = { kind: 'text', text: 'Notes', sizeMm: 3 }
    const r = boardChecks(b, 1, { boards: [b], images: { s: img('s', 1300, 900) }, denyList: [] })
    expect(r.find((x) => x.id === 'b1-ppi')!.state).toBe('fail') // 900 px over 370 mm ≈ 62 px/inch
    expect(r.find((x) => x.id === 'b1-type')!.state).toBe('warn')
  })

  it('counts deliverables by frame tag and asks about fewer than four boards', () => {
    const boards = [0, 1, 2, 3].map((i) => newBoard(i))
    boards[0].frames[1].content = { kind: 'image', imageId: 'x', fit: 'cover' }; boards[0].frames[1].tag = 'street'
    boards[1].frames[1].content = { kind: 'image', imageId: 'y', fit: 'cover' }; boards[1].frames[1].tag = 'street'
    boards[1].frames[2].tag = 'site' // empty frame: does not count
    const c = coverage(boards)
    expect(c.street).toBe(2)
    expect(c.site).toBe(0)
    const s = submissionChecks(boards)
    expect(s.find((x) => x.id === 'sub-count')!.state).toBe('warn')
    expect(s.find((x) => x.id === 'sub-count')!.flag).toBe('unresolved')
    expect(s.find((x) => x.id === 'sub-coverage')!.value).toBe(`0 of ${DELIVERABLES.length}`)
  })
})

describe('JPEG validator', () => {
  it('reads size, baseline/progressive and chroma subsampling from the frame header', () => {
    expect(parseJpeg(jpeg({ w: 3508, h: 2480 }))).toMatchObject({ isJpeg: true, width: 3508, height: 2480, sof: 'baseline', subsampling: '4:4:4', jfifDpi: 150 })
    expect(parseJpeg(jpeg({ w: 3508, h: 2480, sof: 0xc2, y: 0x22 }))).toMatchObject({ sof: 'progressive', subsampling: '4:2:0' })
    expect(parseJpeg(jpeg({ w: 100, h: 100, y: 0x21 })).subsampling).toBe('4:2:2')
    expect(parseJpeg(new Uint8Array([0x89, 0x50, 0x4e, 0x47])).isJpeg).toBe(false)
  })

  it('passes a clean A2 board at 150 dpi', () => {
    const { rules } = validateJpeg('board-1.jpg', jpeg({ w: 3508, h: 2480 }), { denyList: ['UBC'], profile: 'board' })
    const state = Object.fromEntries(rules.map((r) => [r.id, r.state]))
    expect(state).toMatchObject({ 'jpg-format': 'pass', 'jpg-size': 'pass', 'jpg-ratio': 'pass', 'jpg-pixels': 'pass', 'jpg-encoding': 'pass', 'jpg-metadata': 'pass', 'jpg-name': 'pass', 'jpg-visual': 'unknown' })
  })

  it('fails portrait boards, names in metadata and in the file name, and warns on 4:2:0', () => {
    const { rules } = validateJpeg('UBC_final.jpg', jpeg({ w: 2480, h: 3508, y: 0x22, exif: 'Ruijie Liu' }), { denyList: ['UBC', 'Ruijie Liu'], profile: 'board' })
    const by = Object.fromEntries(rules.map((r) => [r.id, r]))
    expect(by['jpg-ratio'].state).toBe('fail')
    expect(by['jpg-metadata'].state).toBe('fail')
    expect(by['jpg-metadata'].value).toContain('Ruijie Liu')
    expect(by['jpg-name'].state).toBe('fail')
    expect(by['jpg-encoding'].state).toBe('warn')
  })

  it('applies the 10 MB limit as 10,000,000 bytes, with an amber team margin', () => {
    const big = new Uint8Array(10_000_001); big.set(jpeg({ w: 3508, h: 2480 }))
    expect(validateJpeg('b.jpg', big, { denyList: [], profile: 'board' }).rules.find((r) => r.id === 'jpg-size')!.state).toBe('fail')
    const near = new Uint8Array(9_800_000); near.set(jpeg({ w: 3508, h: 2480 }))
    expect(validateJpeg('b.jpg', near, { denyList: [], profile: 'board' }).rules.find((r) => r.id === 'jpg-size')!.state).toBe('warn')
  })

  it('checks a cover image against p.28 (2000 × 1680 px, horizontal)', () => {
    const ok = validateJpeg('cover.jpg', jpeg({ w: 2400, h: 1700 }), { denyList: [], profile: 'cover' })
    expect(ok.rules.find((r) => r.id === 'jpg-cover')!.state).toBe('pass')
    const small = validateJpeg('cover.jpg', jpeg({ w: 1920, h: 1080 }), { denyList: [], profile: 'cover' })
    expect(small.rules.find((r) => r.id === 'jpg-cover')!.state).toBe('fail')
  })
})

describe('export quality search and deadline', () => {
  it('finds the highest quality under the byte target', async () => {
    const r = await searchQuality(async (q) => q * 10_000_000, 8_000_000)
    expect(r.fits).toBe(true)
    expect(r.q).toBeLessThanOrEqual(0.8)
    expect(r.q).toBeGreaterThan(0.79)
    expect((await searchQuality(async () => 1, 10)).q).toBe(0.95)
    expect((await searchQuality(async () => 2e7, 1e7)).fits).toBe(false)
  })

  it('closes at 23:59 London on 30 Nov 2026 and counts down', () => {
    expect(new Date(DEADLINE_UTC).toISOString()).toBe('2026-11-30T23:59:00.000Z')
    expect(tzOffsetMinutes(DEADLINE_UTC, 'Europe/London')).toBe(0)
    expect([-420, -480]).toContain(tzOffsetMinutes(DEADLINE_UTC, 'America/Vancouver'))
    const d = deadlineInfo(Date.UTC(2026, 9, 22, 7, 0))
    expect(Math.floor(d.days)).toBe(39)
    expect(d.closed).toBe(false)
  })
})
