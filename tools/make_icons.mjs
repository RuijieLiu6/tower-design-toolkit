// App icons for the installable app (backlog item 30): a tower on its podium, with a sky-room band, on the app's
// accent blue. Drawn with plain rectangles and written as PNG with Node's zlib only (no packages, no downloads).
// Usage: node tools/make_icons.mjs [outDir=public/icons]
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { deflateSync } from 'node:zlib'

const out = process.argv[2] ?? 'public/icons'
const ACCENT = [0x1f, 0x5f, 0x8b], PAPER = [0xf6, 0xf5, 0xf2], PODIUM = [0xc9, 0xd8, 0xe4], SKY = [0xed, 0xa1, 0x00]

/** Shapes in a 100 × 100 box, painted in order; `inset` shrinks the drawing towards the centre (maskable safe zone). */
const SHAPES = [
  { x0: 27, y0: 72, x1: 73, y1: 82, c: PODIUM },
  { x0: 40, y0: 14, x1: 60, y1: 72, c: PAPER },
  { x0: 40, y0: 41, x1: 60, y1: 45, c: SKY },
]

const CRC = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0 })
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}

/** Rounded square (radius in box units, 0 = full bleed); 4 × 4 samples per pixel for smooth edges. */
function icon(size, { radius, inset }) {
  const S = 4, raw = Buffer.alloc(size * (size * 4 + 1))
  const inRounded = (x, y) => {
    if (!radius) return true
    const cx = Math.min(Math.max(x, radius), 100 - radius), cy = Math.min(Math.max(y, radius), 100 - radius)
    return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2
  }
  for (let py = 0; py < size; py++) {
    raw[py * (size * 4 + 1)] = 0 // filter: none
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0
      for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) {
        const x = ((px + (sx + 0.5) / S) / size) * 100, y = ((py + (sy + 0.5) / S) / size) * 100
        if (!inRounded(x, y)) continue
        const ux = 50 + (x - 50) / (1 - inset), uy = 50 + (y - 50) / (1 - inset)
        let c = ACCENT
        for (const s of SHAPES) if (ux >= s.x0 && ux < s.x1 && uy >= s.y0 && uy < s.y1) c = s.c
        r += c[0]; g += c[1]; b += c[2]; a += 255
      }
      const n = S * S, o = py * (size * 4 + 1) + 1 + px * 4
      const cov = a / n / 255
      raw[o] = cov ? Math.round(r / n / cov) : 0; raw[o + 1] = cov ? Math.round(g / n / cov) : 0; raw[o + 2] = cov ? Math.round(b / n / cov) : 0; raw[o + 3] = Math.round(a / n)
    }
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6 // 8-bit RGBA
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))])
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="22" fill="#1f5f8b"/>${SHAPES.map((s) => `<rect x="${s.x0}" y="${s.y0}" width="${s.x1 - s.x0}" height="${s.y1 - s.y0}" fill="rgb(${s.c.join(',')})"/>`).join('')}</svg>\n`

mkdirSync(out, { recursive: true })
writeFileSync(join(out, 'icon-192.png'), icon(192, { radius: 22, inset: 0 }))
writeFileSync(join(out, 'icon-512.png'), icon(512, { radius: 22, inset: 0 }))
writeFileSync(join(out, 'icon-maskable-512.png'), icon(512, { radius: 0, inset: 0.2 }))
writeFileSync(join(out, 'apple-touch-icon.png'), icon(180, { radius: 0, inset: 0.08 }))
writeFileSync(join(out, 'icon.svg'), svg)
console.log(`icons written to ${out}`)
