// Copies Vista's Context textures (RuijieLiu6/vancouver-tall-view-tool @ 917b28e, explorer/textures) into
// public/textures/vista/, resized to at most 1024 px on the long side and re-encoded where the original is far bigger
// than needed (colour maps as JPEG; the water normal map stays a lossless PNG). Writes sources.json with each file's
// source, licence and both checksums. Uses the headless Chromium already installed for the tests (no image library).
//   node tools/prepare_vista_textures.mjs <raw textures dir>
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium } from 'playwright'

const raw = resolve(process.argv[2])
const out = resolve('public/textures/vista')
mkdirSync(out, { recursive: true })
const sha = (b) => createHash('sha256').update(b).digest('hex')
const POLY = { licence: 'CC0-1.0', url: 'https://polyhaven.com/license' }
const FILES = [
  { src: 'whitewashed_brick_diff_1k.jpg', dst: 'facade-white-brick.jpg', role: 'facade: white brick', ...POLY, author: 'Charlotte Baglioni (Poly Haven)', keep: true },
  { src: 'brick_wall_003_diffuse_1k.jpg', dst: 'facade-brick.jpg', role: 'facade: brick', ...POLY, author: 'Rob Tuytel, Dimitrios Savva (Poly Haven)', keep: true },
  { src: 'concrete_wall_001_diff_1k.jpg', dst: 'facade-concrete.jpg', role: 'facade: concrete / mineral', ...POLY, author: 'Dimitrios Savva, Rico Cilliers (Poly Haven)', keep: true },
  { src: 'ocean-normal-map-1k.png', dst: 'water-normal.png', role: 'water ripples (normal map)', licence: 'CC0-1.0', url: 'https://proctexture.com/textures/water/normal-maps/ocean-normal-map', author: 'ProcTexture', keep: true },
  { src: 'asphalt-user-v01.png', dst: 'asphalt.jpg', role: 'carriageway asphalt', licence: "Ruijie Liu's own image (user-supplied to Vista, 27 Oct 2026)", url: 'https://github.com/RuijieLiu6/vancouver-tall-view-tool', author: 'Ruijie Liu' },
  { src: 'paving-concrete-user-v01.png', dst: 'paving.jpg', role: 'sidewalks and building ground', licence: "Ruijie Liu's own image (user-supplied to Vista, 27 Oct 2026)", url: 'https://github.com/RuijieLiu6/vancouver-tall-view-tool', author: 'Ruijie Liu',
    note: "Vista samples inside the photo's grey border (UV inset 0.055, 0.025, scale 0.89, 0.95); the crop is applied here" , crop: [0.055, 0.025, 0.89, 0.95] },
  { src: 'grass-watercolour-v01.png', dst: 'grass.jpg', role: 'park ground (illustrative watercolour)', licence: "Generated for Vista from Ruijie Liu's reference (27 Oct 2026); no third-party licence", url: 'https://github.com/RuijieLiu6/vancouver-tall-view-tool', author: 'Ruijie Liu (reference), image-generation tool' },
]

const browser = await chromium.launch()
const page = await browser.newPage()
const records = []
for (const f of FILES) {
  const input = readFileSync(join(raw, f.src))
  let bytes = input
  let size = null
  if (!f.keep) {
    await page.goto(pathToFileURL(join(raw, f.src)).href)
    const dataUrl = await page.evaluate(async (crop) => {
      const img = document.querySelector('img')
      await img.decode()
      const [cx, cy, cw, ch] = crop ?? [0, 0, 1, 1]
      const sw = img.naturalWidth * cw, sh = img.naturalHeight * ch, k = Math.min(1, 1024 / Math.max(sw, sh))
      const c = document.createElement('canvas')
      c.width = Math.round(sw * k); c.height = Math.round(sh * k)
      c.getContext('2d').drawImage(img, img.naturalWidth * cx, img.naturalHeight * cy, sw, sh, 0, 0, c.width, c.height)
      return [c.toDataURL('image/jpeg', 0.86), c.width, c.height]
    }, f.crop ?? null)
    bytes = Buffer.from(dataUrl[0].split(',')[1], 'base64')
    size = [dataUrl[1], dataUrl[2]]
  }
  writeFileSync(join(out, f.dst), bytes)
  records.push({ file: f.dst, role: f.role, source: `explorer/textures/${f.src}`, sourceSha256: sha(input), sha256: sha(bytes), bytes: bytes.length,
    ...(size ? { resizedTo: size, encoding: 'JPEG q0.86' } : { unchanged: true }), licence: f.licence, url: f.url, author: f.author, ...(f.note ? { note: f.note } : {}) })
  console.log(f.dst, input.length, '->', bytes.length)
}
await browser.close()
writeFileSync(join(out, 'sources.json'), JSON.stringify({
  from: 'Vista (Ruijie Liu), github.com/RuijieLiu6/vancouver-tall-view-tool @ 917b28e, explorer/textures; provenance in FACADE_TEXTURES.json, PAVING_TEXTURES.json, GRASS_TEXTURE.txt, WATER_TEXTURE.txt there',
  retrieved: '2026-11-03', use: "Real Vancouver's Context style: illustrative surfaces, not surveyed materials", files: records,
}, null, 1) + '\n')
