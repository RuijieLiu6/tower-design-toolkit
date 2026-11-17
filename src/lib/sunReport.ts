// The Sun tab's PDF (Sun & Wind Studio's PDF button beside Run study): one A4 landscape page with the ground's new
// shadow (the study's grid, by how long it lasts), the settings it was run with and the key readings. Visual first, as
// Sinnie asked of the Studio's report; no method paragraphs.
import type { SunGround } from '../engine/sw/sun'
import type { Pt } from '../engine/shadow'
import { Doc, PT } from './pdf/miniPdf'
import type { SwOut } from './swRun'

const BANDS = ['#f2cd78', '#e09a2c', '#7a2e8e']

/** The ground grid as a JPEG: white open ground, the three bands of new shadow, buildings grey, the site dashed. */
function groundImage(g: SunGround, site: Pt[] | null): { url: string; w: number; h: number } | null {
  if (typeof document === 'undefined') return null
  const { nx, ny, x0, y0, cell } = g.grid, s = Math.max(1, Math.min(4, Math.floor(900 / Math.max(nx, ny))))
  const cv = document.createElement('canvas')
  cv.width = nx * s; cv.height = ny * s
  const c = cv.getContext('2d')
  if (!c) return null
  c.fillStyle = '#ffffff'; c.fillRect(0, 0, cv.width, cv.height)
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const v = g.newShadow[j * nx + i]
    const col = Number.isNaN(v) ? '#9aa3ad' : v >= g.th[2] ? BANDS[2] : v >= g.th[1] ? BANDS[1] : v >= g.th[0] ? BANDS[0] : null
    if (!col) continue
    c.fillStyle = col; c.fillRect(i * s, (ny - 1 - j) * s, s, s)
  }
  if (site && site.length > 2) {
    c.strokeStyle = '#1f5f8b'; c.lineWidth = 2; c.setLineDash([8, 5]); c.beginPath()
    site.forEach(([x, y], k) => { const px = ((x - x0) / cell) * s, py = (ny - (y - y0) / cell) * s; if (k) c.lineTo(px, py); else c.moveTo(px, py) })
    c.closePath(); c.stroke()
  }
  return { url: cv.toDataURL('image/jpeg', 0.9), w: cv.width, h: cv.height }
}

export interface SunReportInput { title: string; when: string; period: boolean; settings: string[]; out: SwOut; site: Pt[] | null }

export function sunReport(r: SunReportInput): Blob {
  const doc = new Doc({ title: `${r.title}: sun and shadow`, subject: 'Tower Design Toolkit', author: 'Tower Design Toolkit' })
  const p = doc.page(), M = 36
  doc.text(p, M, 44, 'Sun and shadow', 20, true, '#16202a')
  doc.text(p, M, 64, `${r.title} · ${r.when}`, 10, false, '#5b6672')
  const g = (r.out.data as { g?: SunGround }).g
  const boxW = 500, boxH = PT.h - 110 - M
  if (g) {
    const img = groundImage(g, r.site)
    if (img) {
      const k = Math.min(boxW / img.w, boxH / img.h), w = img.w * k, h = img.h * k
      doc.rect(p, M, 84, w, h, null, '#d5dbe1')
      doc.image(p, img.url, M, 84, w, h)
    }
    const unit = r.period ? 'h in the period' : 'h'
    let y = 84 + 8, lx = M + boxW + 24
    doc.text(p, lx, y, 'New shadow on the ground', 9, true, '#16202a'); y += 14
    g.th.forEach((t, i) => { doc.rect(p, lx, y - 8, 10, 10, BANDS[i]); doc.text(p, lx + 16, y, `${t} ${unit} or more`, 8.5, false, '#33404c'); y += 14 })
    doc.rect(p, lx, y - 8, 10, 10, '#9aa3ad'); doc.text(p, lx + 16, y, 'Buildings', 8.5, false, '#33404c'); y += 14
    if (r.site && r.site.length > 2) { doc.line(p, lx, y - 3, lx + 10, y - 3, '#1f5f8b', 1.5, { dash: [3, 2] }); doc.text(p, lx + 16, y, 'The site', 8.5, false, '#33404c') }
  }
  let y = 200
  const lx = M + boxW + 24, rw = PT.w - lx - M
  doc.text(p, lx, y, 'Key results', 9, true, '#16202a'); y += 16
  for (const k of r.out.keys ?? []) {
    doc.text(p, lx, y, k.label, 8.5, false, '#5b6672')
    doc.text(p, lx + rw, y, `${k.value}${k.unit ? ` ${k.unit}` : ''}`, 11, true, k.state === 'pass' ? '#15803d' : k.state === 'fail' ? '#b91c1c' : k.state === 'warn' ? '#b45309' : '#16202a', { align: 'right' })
    y += 18
  }
  y += 6
  doc.text(p, lx, y, 'Settings', 9, true, '#16202a'); y += 14
  for (const s of r.settings) { y = doc.paragraph(p, lx, y, s, 8.5, rw, { color: '#33404c' }) + 4 }
  return doc.build()
}
