// The boards as one PDF (Ruijie, 17 Nov: "export JPEG, PNG or PDF"): one A2 landscape page per board (1683.78 ×
// 1190.55 pt), each page the board's JPEG drawn edge to edge. A minimal PDF 1.4 written here: no Info dictionary, so no
// author, software or title travels with it (brief p.27 anonymity), and nothing is uploaded.
import { jpegSize } from './pdf/miniPdf'

/** A2 landscape in points (594 × 420 mm). */
export const A2_PT = { w: 1683.78, h: 1190.55 } as const

/** One page per board at `size` points (default A2 landscape; the composer passes the chosen size and orientation). */
export function boardsPdf(jpegs: Uint8Array[], size: { w: number; h: number } = A2_PT): Blob {
  if (!jpegs.length) throw new Error('No board to put in the PDF')
  const enc = new TextEncoder()
  const parts: Uint8Array[] = []
  const offsets: number[] = []
  let length = 0
  const push = (p: Uint8Array | string) => { const b = typeof p === 'string' ? enc.encode(p) : p; parts.push(b); length += b.length }
  const obj = (n: number, body: (string | Uint8Array)[]) => { offsets[n] = length; push(`${n} 0 obj\n`); body.forEach(push); push('\nendobj\n') }
  push('%PDF-1.4\n')
  push(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a])) // binary marker line
  // 1 catalog, 2 pages, then per board: page, content, image
  const n = jpegs.length, first = 3
  const pageIds = jpegs.map((_, i) => first + i * 3)
  obj(1, ['<< /Type /Catalog /Pages 2 0 R >>'])
  obj(2, [`<< /Type /Pages /Count ${n} /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] >>`])
  const f = (x: number) => x.toFixed(2)
  jpegs.forEach((bytes, i) => {
    const page = pageIds[i], content = page + 1, image = page + 2
    const { w, h } = jpegSize(bytes)
    if (!w || !h) throw new Error(`Board ${i + 1}: not a JPEG`)
    obj(page, [`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${f(size.w)} ${f(size.h)}] /Resources << /XObject << /Im0 ${image} 0 R >> >> /Contents ${content} 0 R >>`])
    const draw = `q ${f(size.w)} 0 0 ${f(size.h)} 0 0 cm /Im0 Do Q`
    obj(content, [`<< /Length ${draw.length} >>\nstream\n${draw}\nendstream`])
    obj(image, [`<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${bytes.length} >>\nstream\n`, bytes, '\nendstream'])
  })
  const xref = length, count = first + n * 3
  push(`xref\n0 ${count}\n0000000000 65535 f \n`)
  for (let k = 1; k < count; k++) push(`${String(offsets[k]).padStart(10, '0')} 00000 n \n`)
  push(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`)
  return new Blob(parts as BlobPart[], { type: 'application/pdf' })
}
