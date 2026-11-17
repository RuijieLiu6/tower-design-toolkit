import { BUILTIN_FONTS } from './catalog'
import { describe, expect, it } from 'vitest'
import { checkFontFile, familyFromFileName, familyNameOf, formatOf, FONT_MAX_BYTES } from './fontFile'

/** A tiny TrueType-shaped file: an sfnt header with one `name` table holding the family names given (Windows, English). */
function sfnt(names: { id: number; text: string }[], magic = 0x00010000): ArrayBuffer {
  const enc = (t: string) => { const b = new Uint8Array(t.length * 2); for (let i = 0; i < t.length; i++) { b[i * 2] = t.charCodeAt(i) >> 8; b[i * 2 + 1] = t.charCodeAt(i) & 255 } return b }
  const strings = names.map((n) => enc(n.text))
  const stringsLen = strings.reduce((a, s) => a + s.length, 0)
  const nameLen = 6 + names.length * 12 + stringsLen
  const name = new Uint8Array(nameLen), nv = new DataView(name.buffer)
  nv.setUint16(0, 0); nv.setUint16(2, names.length); nv.setUint16(4, 6 + names.length * 12)
  let off = 0
  names.forEach((n, i) => {
    const at = 6 + i * 12
    nv.setUint16(at, 3); nv.setUint16(at + 2, 1); nv.setUint16(at + 4, 0x409); nv.setUint16(at + 6, n.id); nv.setUint16(at + 8, strings[i].length); nv.setUint16(at + 10, off)
    name.set(strings[i], 6 + names.length * 12 + off); off += strings[i].length
  })
  const head = 12 + 16, buf = new Uint8Array(head + nameLen), v = new DataView(buf.buffer)
  v.setUint32(0, magic); v.setUint16(4, 1)
  buf.set([0x6e, 0x61, 0x6d, 0x65], 12) // 'name'
  v.setUint32(20, head); v.setUint32(24, nameLen)
  buf.set(name, head)
  return buf.buffer
}
/** The same name table wrapped as an (uncompressed) WOFF. */
function woff(inner: ArrayBuffer): ArrayBuffer {
  const src = new Uint8Array(inner), sv = new DataView(inner)
  const tableOff = sv.getUint32(20), tableLen = sv.getUint32(24)
  const out = new Uint8Array(44 + 20 + tableLen), v = new DataView(out.buffer)
  out.set([0x77, 0x4f, 0x46, 0x46], 0) // 'wOFF'
  v.setUint16(12, 1)
  out.set([0x6e, 0x61, 0x6d, 0x65], 44)
  v.setUint32(48, 64); v.setUint32(52, tableLen); v.setUint32(56, tableLen)
  out.set(src.subarray(tableOff, tableOff + tableLen), 64)
  return out.buffer
}
const file = (name: string, bytes: ArrayBuffer | number) => ({ name, size: typeof bytes === 'number' ? bytes : bytes.byteLength, arrayBuffer: async () => (typeof bytes === 'number' ? new ArrayBuffer(0) : bytes) })
const okProbe = async () => undefined

// A font the viewer adds (Ruijie, 17 Nov) is judged by its bytes, named from its own name table, size-guarded and
// loaded through the FontFace API before it joins "Your fonts".
describe('a font file', () => {
  it('is known by its first bytes, not its name', () => {
    expect(formatOf(sfnt([]))).toBe('ttf')
    expect(formatOf(sfnt([], 0x4f54544f))).toBe('otf')
    expect(formatOf(woff(sfnt([])))).toBe('woff')
    expect(formatOf(new Uint8Array([0x77, 0x4f, 0x46, 0x32, 0, 0, 0, 0, 0, 0, 0, 0]).buffer)).toBe('woff2')
    expect(formatOf(new TextEncoder().encode('<svg></svg> not a font').buffer as ArrayBuffer)).toBeNull()
  })
  it('reads the family from the name table, preferring the typographic family', async () => {
    expect(await familyNameOf(sfnt([{ id: 1, text: 'Studio Sans Condensed' }, { id: 16, text: 'Studio Sans' }]))).toBe('Studio Sans')
    expect(await familyNameOf(sfnt([{ id: 1, text: 'Studio Sans' }]))).toBe('Studio Sans')
    expect(await familyNameOf(woff(sfnt([{ id: 1, text: 'Packed Serif' }])))).toBe('Packed Serif')
    expect(await familyNameOf(sfnt([]))).toBeNull()
  })
  it('falls back to a family made from the file name', () => {
    expect(familyFromFileName('SpaceGrotesk-Regular.woff2')).toBe('Space Grotesk')
    expect(familyFromFileName('my_board_font-700.ttf')).toBe('my board font')
  })
  it('refuses a file whose family is one of the built-in faces (two entries of one name would clash)', async () => {
    const r = await checkFontFile(file('inter.ttf', sfnt([{ id: 1, text: BUILTIN_FONTS[0].family }])), okProbe)
    expect(r).toMatchObject({ ok: false, error: expect.stringContaining('own faces') })
    expect(await checkFontFile(file('studio.ttf', sfnt([{ id: 1, text: 'Studio Sans' }])), okProbe)).toMatchObject({ ok: true, family: 'Studio Sans' })
  })
  it('refuses what is not a font, in plain words, and passes a good one with its name', async () => {
    expect(await checkFontFile(file('notes.txt', 10), okProbe)).toMatchObject({ ok: false, error: expect.stringContaining('not a font file') })
    expect(await checkFontFile(file('big.ttf', FONT_MAX_BYTES + 1), okProbe)).toMatchObject({ ok: false, error: expect.stringContaining('8.0 MB') })
    expect(await checkFontFile(file('fake.ttf', new TextEncoder().encode('hello there, I am text').buffer as ArrayBuffer), okProbe)).toMatchObject({ ok: false, error: expect.stringContaining('does not start like a font') })
    const good = await checkFontFile(file('studio.ttf', sfnt([{ id: 1, text: 'Studio Sans' }])), okProbe)
    expect(good).toMatchObject({ ok: true, family: 'Studio Sans', format: 'ttf' })
    const broken = await checkFontFile(file('studio.ttf', sfnt([{ id: 1, text: 'Studio Sans' }])), async () => { throw new Error('bad') })
    expect(broken).toMatchObject({ ok: false, error: expect.stringContaining('could not be loaded') })
  })
})
