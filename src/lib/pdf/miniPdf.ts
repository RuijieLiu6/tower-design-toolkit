// Minimal PDF writer with no dependencies, ported from Vista's pdf.js (Ruijie Liu, ARCH 540, v09): A4 landscape
// pages, Helvetica text (WinAnsi; other characters fold to their base letter or '?'), JPEG images and vector drawing.
// Coordinates are points with the origin at the top left. Produces a Blob.

export const PT = { w: 841.89, h: 595.28 }
type Color = string | [number, number, number] | null | undefined
export interface PaintOpts { fill?: Color; stroke?: Color; width?: number; dash?: number[]; close?: boolean; alpha?: number; strokeAlpha?: number; join?: number; cap?: number }
export interface TextOpts { align?: 'left' | 'right' | 'center'; italic?: boolean; spacing?: number; alpha?: number; leading?: number; bold?: boolean; color?: Color }
interface Page { ops: string[]; imgs: number[] }

const CP1252: Record<string, string> = { '–': '\x96', '—': '\x97', '‘': '\x91', '’': '\x92', '“': '\x93', '”': '\x94', '…': '\x85', '•': '\x95', '›': '\x9B', '‹': '\x8B', '→': '\x9B', '€': '\x80' }
const fold = (ch: string) => { const base = ch.normalize('NFD').replace(/[̀-ͯ]/g, ''); return /^[\x20-\x7E\xA0-\xFF]+$/.test(base) ? base : '?' }
export function latin1(s: unknown): string {
  return String(s ?? '').normalize('NFC').replace(/[̀-ͯ]/g, '')
    .replace(/[–—‘’“”…•›‹→€]/g, (c) => CP1252[c])
    .replace(/[−]/g, '-').replace(/[²]/g, '\xB2').replace(/[°]/g, '\xB0')
    .replace(/[^\x20-\x7E\x80-\x97\x9B\x8B\xA0-\xFF]/g, fold)
}
const escapePdf = (s: unknown) => latin1(s).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')

// Helvetica advance widths (1/1000 em), approximate, for wrapping and alignment.
const W: Record<string, number> = {}
'abcdefghijklmnopqrstuvwxyz'.split('').forEach((c) => { W[c] = 520 })
'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').forEach((c) => { W[c] = 680 })
'0123456789'.split('').forEach((c) => { W[c] = 556 })
Object.assign(W, { '\x96': 556, '\x97': 1000, '\x91': 222, '\x92': 222, '\x93': 333, '\x94': 333, '\x85': 1000, '\x95': 350, '\x9B': 333, '\xB7': 278, '\xD7': 584, ' ': 278, '.': 278, ',': 278, ':': 278, ';': 278, '-': 333, i: 222, l: 222, j: 222, t: 278, f: 278, r: 333, m: 833, w: 722, I: 278, M: 833, W: 944, '(': 333, ')': 333, '/': 278, "'": 191, '"': 355 })
export function textWidth(s: unknown, size: number, bold?: boolean): number { let w = 0; for (const ch of latin1(s)) w += W[ch] || 560; return (w / 1000) * size * (bold ? 1.06 : 1) }
export function wrap(text: unknown, size: number, maxWidth: number, bold?: boolean): string[] {
  const out: string[] = []
  for (const para of String(text ?? '').split('\n')) {
    const words = para.split(/\s+/).filter(Boolean)
    let line = ''
    for (const wd of words) { const cand = line ? `${line} ${wd}` : wd; if (textWidth(cand, size, bold) <= maxWidth || !line) line = cand; else { out.push(line); line = wd } }
    out.push(line)
  }
  return out
}
export function col(c: Color): string | null {
  if (!c) return null
  if (Array.isArray(c)) return c.map((v) => (+v).toFixed(3)).join(' ')
  const m = /^#?([0-9a-f]{6})$/i.exec(c)
  if (m) { const n = parseInt(m[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => (v / 255).toFixed(3)).join(' ') }
  return c
}
const f2 = (v: number) => (+v).toFixed(2)
const K = 0.5523

function latin1Bytes(str: string) { const out = new Uint8Array(str.length); for (let i = 0; i < str.length; i++) { const c = str.charCodeAt(i); out[i] = c < 256 ? c : 63 } return out }
/** Width and height from a JPEG's SOF marker. */
export function jpegSize(b: Uint8Array): { w: number; h: number } {
  let i = 2
  while (i < b.length) {
    if (b[i] !== 0xff) { i++; continue }
    const marker = b[i + 1]
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) return { h: (b[i + 5] << 8) | b[i + 6], w: (b[i + 7] << 8) | b[i + 8] }
    i += 2 + ((b[i + 2] << 8) | b[i + 3])
  }
  return { w: 1, h: 1 }
}

export class Doc {
  pages: Page[] = []
  images: string[] = []
  alphas = new Set<number>()
  info: { title?: string; author?: string; subject?: string }
  constructor(info: { title?: string; author?: string; subject?: string } = {}) { this.info = info }
  page(): Page { const p: Page = { ops: [], imgs: [] }; this.pages.push(p); return p }
  gs(alpha: number) { const a = Math.round(Math.max(0, Math.min(1, alpha)) * 100); this.alphas.add(a); return `/GA${a} gs` }
  text(p: Page, x: number, y: number, s: unknown, size: number, bold?: boolean, color?: Color, o: TextOpts = {}): number {
    const font = o.italic ? 'F3' : bold ? 'F2' : 'F1'
    const w = textWidth(s, size, bold)
    const tx = o.align === 'right' ? x - w : o.align === 'center' ? x - w / 2 : x
    p.ops.push(`q ${o.alpha != null ? `${this.gs(o.alpha)} ` : ''}BT /${font} ${size} Tf ${o.spacing ? `${o.spacing} Tc ` : ''}${col(color) || '0 0 0'} rg ${f2(tx)} ${f2(PT.h - y)} Td (${escapePdf(s)}) Tj ET Q`)
    return w
  }
  paragraph(p: Page, x: number, y: number, text: unknown, size: number, maxWidth: number, o: TextOpts = {}): number {
    const lines = wrap(text, size, maxWidth, o.bold)
    const lh = size * (o.leading || 1.32)
    lines.forEach((ln, i) => this.text(p, x, y + i * lh, ln, size, o.bold, o.color, o))
    return y + lines.length * lh
  }
  rect(p: Page, x: number, y: number, w: number, h: number, fill?: Color, stroke?: Color) {
    p.ops.push(`${fill ? `${col(fill)} rg ` : ''}${stroke ? `${col(stroke)} RG 0.6 w ` : ''}${f2(x)} ${f2(PT.h - y - h)} ${f2(w)} ${f2(h)} re ${fill && stroke ? 'B' : fill ? 'f' : 'S'}`)
  }
  line(p: Page, x1: number, y1: number, x2: number, y2: number, stroke?: Color, width?: number, o: { dash?: number[]; cap?: number; alpha?: number } = {}) {
    p.ops.push(`q ${o.alpha != null ? `${this.gs(o.alpha)} ` : ''}${o.dash ? `[${o.dash.join(' ')}] 0 d ` : ''}${o.cap != null ? `${o.cap} J ` : ''}${col(stroke) || '0.8 0.8 0.8'} RG ${width || 0.6} w ${f2(x1)} ${f2(PT.h - y1)} m ${f2(x2)} ${f2(PT.h - y2)} l S Q`)
  }
  poly(p: Page, pts: [number, number][], opts: PaintOpts = {}) {
    if (!pts || pts.length < 2) return
    const o = { close: true, width: 0.8, ...opts }
    let d = `${f2(pts[0][0])} ${f2(PT.h - pts[0][1])} m`
    for (let i = 1; i < pts.length; i++) d += ` ${f2(pts[i][0])} ${f2(PT.h - pts[i][1])} l`
    if (o.close) d += ' h'
    this.paint(p, d, o)
  }
  circle(p: Page, cx: number, cy: number, r: number, opts: PaintOpts = {}) {
    const y = PT.h - cy, k = r * K
    const d = `${f2(cx + r)} ${f2(y)} m ${f2(cx + r)} ${f2(y + k)} ${f2(cx + k)} ${f2(y + r)} ${f2(cx)} ${f2(y + r)} c ${f2(cx - k)} ${f2(y + r)} ${f2(cx - r)} ${f2(y + k)} ${f2(cx - r)} ${f2(y)} c ${f2(cx - r)} ${f2(y - k)} ${f2(cx - k)} ${f2(y - r)} ${f2(cx)} ${f2(y - r)} c ${f2(cx + k)} ${f2(y - r)} ${f2(cx + r)} ${f2(y - k)} ${f2(cx + r)} ${f2(y)} c h`
    this.paint(p, d, { close: true, ...opts })
  }
  roundRect(p: Page, x: number, y: number, w: number, h: number, r: number, opts: PaintOpts = {}) {
    r = Math.min(r, w / 2, h / 2)
    const t = PT.h - y, b = PT.h - y - h, k = r * (1 - K)
    const d = `${f2(x + r)} ${f2(t)} m ${f2(x + w - r)} ${f2(t)} l ${f2(x + w - k)} ${f2(t)} ${f2(x + w)} ${f2(t - k)} ${f2(x + w)} ${f2(t - r)} c ${f2(x + w)} ${f2(b + r)} l ${f2(x + w)} ${f2(b + k)} ${f2(x + w - k)} ${f2(b)} ${f2(x + w - r)} ${f2(b)} c ${f2(x + r)} ${f2(b)} l ${f2(x + k)} ${f2(b)} ${f2(x)} ${f2(b + k)} ${f2(x)} ${f2(b + r)} c ${f2(x)} ${f2(t - r)} l ${f2(x)} ${f2(t - k)} ${f2(x + k)} ${f2(t)} ${f2(x + r)} ${f2(t)} c h`
    this.paint(p, d, { close: true, ...opts })
  }
  paint(p: Page, d: string, o: PaintOpts) {
    const fill = col(o.fill), stroke = col(o.stroke)
    if (!fill && !stroke) return
    const ops = ['q']
    if (o.dash) ops.push(`[${o.dash.join(' ')}] 0 d`)
    ops.push(`${o.join ?? 1} j ${o.cap ?? 1} J`)
    if (fill) { ops.push(`${fill} rg`); if (o.alpha != null) ops.push(this.gs(o.alpha)); ops.push(d, 'f') }
    if (stroke) {
      if (fill) ops.push('Q q', o.dash ? `[${o.dash.join(' ')}] 0 d` : '', `${o.join ?? 1} j ${o.cap ?? 1} J`)
      ops.push(`${stroke} RG ${o.width ?? 0.8} w`)
      if (o.strokeAlpha != null) ops.push(this.gs(o.strokeAlpha))
      ops.push(d, 'S')
    }
    ops.push('Q')
    p.ops.push(ops.filter(Boolean).join(' '))
  }
  clip(p: Page, x: number, y: number, w: number, h: number, draw: () => void) { p.ops.push(`q ${f2(x)} ${f2(PT.h - y - h)} ${f2(w)} ${f2(h)} re W n`); draw(); p.ops.push('Q') }
  image(p: Page, jpegDataUrl: string, x: number, y: number, w: number, h: number) {
    const idx = this.images.length
    this.images.push(jpegDataUrl); p.imgs.push(idx)
    p.ops.push(`q ${f2(w)} 0 0 ${f2(h)} ${f2(x)} ${f2(PT.h - y - h)} cm /Im${idx} Do Q`)
  }
  build(): Blob {
    const objs: (string | { head: string; stream: Uint8Array })[] = []
    const add = (s: string | { head: string; stream: Uint8Array }) => { objs.push(s); return objs.length }
    add('<< /Type /Catalog /Pages 2 0 R /PageMode /UseNone /ViewerPreferences << /DisplayDocTitle true >> >>'); add('PAGES')
    add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>')
    add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>')
    add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique /Encoding /WinAnsiEncoding >>')
    add(`<< ${[...this.alphas].map((a) => `/GA${a} << /Type /ExtGState /ca ${(a / 100).toFixed(2)} /CA ${(a / 100).toFixed(2)} >>`).join(' ')} >>`)
    const str = (s: unknown) => `(${escapePdf(String(s ?? ''))})`
    const i = this.info
    add(`<< ${i.title ? `/Title ${str(i.title)} ` : ''}${i.author ? `/Author ${str(i.author)} ` : ''}${i.subject ? `/Subject ${str(i.subject)} ` : ''}/Creator (Tower Design Toolkit - Vista view study) /Producer (MiniPdf, after Vista) >>`)
    const imgObj: number[] = []
    for (const dataUrl of this.images) {
      const m = /^data:image\/jpeg;base64,(.*)$/.exec(dataUrl)
      const bin = atob(m ? m[1] : '')
      const bytes = new Uint8Array(bin.length)
      for (let k = 0; k < bin.length; k++) bytes[k] = bin.charCodeAt(k)
      const dims = jpegSize(bytes)
      imgObj.push(add({ head: `<< /Type /XObject /Subtype /Image /Width ${dims.w} /Height ${dims.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${bytes.length} >>`, stream: bytes }))
    }
    const pageIds: number[] = []
    for (const p of this.pages) {
      const content = latin1Bytes(p.ops.join('\n'))
      const cid = add({ head: `<< /Length ${content.length} >>`, stream: content })
      const xobj = p.imgs.map((k) => `/Im${k} ${imgObj[k]} 0 R`).join(' ')
      pageIds.push(add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PT.w} ${PT.h}] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >> /ExtGState 6 0 R /XObject << ${xobj} >> >> /Contents ${cid} 0 R >>`))
    }
    objs[1] = `<< /Type /Pages /Kids [${pageIds.map((k) => `${k} 0 R`).join(' ')}] /Count ${pageIds.length} >>`
    const enc = new TextEncoder()
    const parts: Uint8Array[] = [latin1Bytes('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n')]
    let offset = parts[0].length
    const xref: number[] = []
    objs.forEach((o, k) => {
      xref.push(offset)
      const head = enc.encode(`${k + 1} 0 obj\n`); parts.push(head); offset += head.length
      if (typeof o === 'string') { const b = latin1Bytes(`${o}\nendobj\n`); parts.push(b); offset += b.length }
      else { const h = enc.encode(`${o.head}\nstream\n`); parts.push(h); offset += h.length; parts.push(o.stream); offset += o.stream.length; const t = enc.encode('\nendstream\nendobj\n'); parts.push(t); offset += t.length }
    })
    const xrefStart = offset
    let xs = `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`
    for (const off of xref) xs += `${String(off).padStart(10, '0')} 00000 n \n`
    xs += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R /Info 7 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`
    parts.push(enc.encode(xs))
    return new Blob(parts as BlobPart[], { type: 'application/pdf' })
  }
}
