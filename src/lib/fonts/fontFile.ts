// A font file the viewer adds (Ruijie, 17 Nov: "users can also download and upload the font type they want"): what
// it is (TrueType, OpenType, WOFF, WOFF2 by its magic bytes, never by its name alone), its family name read from its
// own name table (TrueType, OpenType and WOFF; a WOFF2 is Brotli-packed, so the file's name stands in), a size guard,
// and a load probe through the FontFace API, which is what will draw it. Pure apart from the probe, which the test
// replaces. Plain words for every refusal.
export type FontFormat = 'ttf' | 'otf' | 'woff' | 'woff2'
export const FONT_MAX_BYTES = 8_000_000
export const FONT_EXT = /\.(ttf|otf|woff|woff2)$/i
export const FONT_ACCEPT = '.ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2'

export type FontCheck = { ok: true; family: string; format: FontFormat; bytes: ArrayBuffer } | { ok: false; error: string }

const tag = (v: DataView, at: number) => String.fromCharCode(v.getUint8(at), v.getUint8(at + 1), v.getUint8(at + 2), v.getUint8(at + 3))

/** The format by the file's first four bytes, or null when it is not a font. */
export function formatOf(buf: ArrayBuffer): FontFormat | null {
  if (buf.byteLength < 12) return null
  const v = new DataView(buf), t = tag(v, 0), n = v.getUint32(0)
  if (t === 'wOFF') return 'woff'
  if (t === 'wOF2') return 'woff2'
  if (t === 'OTTO') return 'otf'
  if (n === 0x00010000 || t === 'true') return 'ttf'
  return null
}

/** The family from an sfnt name table: the typographic family (16) when present, else the family (1); null when none. */
function familyFromNameTable(table: ArrayBuffer): string | null {
  const v = new DataView(table)
  if (table.byteLength < 6) return null
  const count = v.getUint16(2), strings = v.getUint16(4)
  let best: { score: number; text: string } | null = null
  for (let i = 0; i < count; i++) {
    const at = 6 + i * 12
    if (at + 12 > table.byteLength) break
    const platform = v.getUint16(at), encoding = v.getUint16(at + 2), lang = v.getUint16(at + 4), nameId = v.getUint16(at + 6), len = v.getUint16(at + 8), off = v.getUint16(at + 10)
    if (nameId !== 16 && nameId !== 1) continue
    const start = strings + off
    if (start + len > table.byteLength) continue
    const bytes = new Uint8Array(table, start, len)
    let text: string
    if (platform === 3 || (platform === 0)) { // Windows and Unicode platforms: UTF-16BE
      let s = ''
      for (let k = 0; k + 1 < bytes.length; k += 2) s += String.fromCharCode((bytes[k] << 8) | bytes[k + 1])
      text = s
    } else if (platform === 1) { // Macintosh Roman
      text = String.fromCharCode(...bytes)
    } else continue
    text = text.trim()
    if (!text) continue
    // Prefer the typographic family, then English, then Windows.
    const score = (nameId === 16 ? 4 : 0) + (lang === 0x409 || lang === 0 ? 2 : 0) + (platform === 3 ? 1 : 0) + (encoding === 1 ? 0.5 : 0)
    if (!best || score > best.score) best = { score, text }
  }
  return best?.text ?? null
}

/** The sfnt table directory (TrueType and OpenType): tag → bytes. */
function sfntTable(buf: ArrayBuffer, want: string): ArrayBuffer | null {
  const v = new DataView(buf), n = v.getUint16(4)
  for (let i = 0; i < n; i++) {
    const at = 12 + i * 16
    if (at + 16 > buf.byteLength) break
    if (tag(v, at) !== want) continue
    const off = v.getUint32(at + 8), len = v.getUint32(at + 12)
    return off + len <= buf.byteLength ? buf.slice(off, off + len) : null
  }
  return null
}

async function inflate(data: ArrayBuffer): Promise<ArrayBuffer> {
  if (typeof DecompressionStream === 'undefined') throw new Error('no inflate')
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate'))
  return new Response(stream).arrayBuffer()
}

/** A WOFF table: the directory starts at 44, 20 bytes per entry; a table shorter than its original is zlib-packed. */
async function woffTable(buf: ArrayBuffer, want: string): Promise<ArrayBuffer | null> {
  const v = new DataView(buf), n = v.getUint16(12)
  for (let i = 0; i < n; i++) {
    const at = 44 + i * 20
    if (at + 20 > buf.byteLength) break
    if (tag(v, at) !== want) continue
    const off = v.getUint32(at + 4), comp = v.getUint32(at + 8), orig = v.getUint32(at + 12)
    if (off + comp > buf.byteLength) return null
    const raw = buf.slice(off, off + comp)
    return comp < orig ? inflate(raw) : raw
  }
  return null
}

/** The family name inside the file, or null when it cannot be read (a WOFF2, or no name table). */
export async function familyNameOf(buf: ArrayBuffer): Promise<string | null> {
  const f = formatOf(buf)
  try {
    if (f === 'ttf' || f === 'otf') { const t = sfntTable(buf, 'name'); return t ? familyFromNameTable(t) : null }
    if (f === 'woff') { const t = await woffTable(buf, 'name'); return t ? familyFromNameTable(t) : null }
  } catch { return null }
  return null
}

/** A family from the file's name: "SpaceGrotesk-Regular.woff2" → "Space Grotesk". */
export function familyFromFileName(name: string): string {
  return name.replace(FONT_EXT, '').replace(/[-_]?(regular|normal|book|roman|latin|variable|vf|\d{3})\b/gi, '').replace(/[-_]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2').replace(/\s+/g, ' ').trim() || 'My font'
}

const mb = (n: number) => `${(n / 1e6).toFixed(1)} MB`
export type FontProbe = (family: string, bytes: ArrayBuffer) => Promise<unknown>
const defaultProbe: FontProbe = (family, bytes) => new FontFace(family, bytes).load()

/**
 * Check a font file before it joins "Your fonts": a font format by its bytes, within the size guard, a family name,
 * and a load through the FontFace API (what draws it). `probe` is replaced in tests.
 */
export async function checkFontFile(file: { name: string; size: number; arrayBuffer: () => Promise<ArrayBuffer> }, probe: FontProbe = defaultProbe): Promise<FontCheck> {
  if (!FONT_EXT.test(file.name)) return { ok: false, error: `${file.name} is not a font file: choose a .ttf, .otf, .woff or .woff2.` }
  if (file.size > FONT_MAX_BYTES) return { ok: false, error: `${file.name} is ${mb(file.size)}; a font here can be up to ${mb(FONT_MAX_BYTES)}. Try the Latin subset or a single weight.` }
  if (file.size === 0) return { ok: false, error: `${file.name} is empty.` }
  const bytes = await file.arrayBuffer()
  const format = formatOf(bytes)
  if (!format) return { ok: false, error: `${file.name} does not start like a font (TrueType, OpenType, WOFF or WOFF2): it may be another kind of file renamed.` }
  const family = (await familyNameOf(bytes)) ?? familyFromFileName(file.name)
  try { await probe(family, bytes) } catch { return { ok: false, error: `${file.name} could not be loaded as a font: the file may be damaged or use a feature this browser cannot read.` } }
  return { ok: true, family, format, bytes }
}
