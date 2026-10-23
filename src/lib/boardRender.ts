// Draws an A2 board on a 2D canvas (the same code for the on-screen preview and the exported JPEG, so what you see is
// what is uploaded) and encodes it as JPEG under the size limit (research P13-M06b, browser route).
import { BOARD_H, BOARD_W, CAPTION_BAND, CAPTION_MM, TARGET_BYTES, imagePlacement, printedCaption, pxForDpi, searchQuality, type Board, type BoardImage, type Frame } from '../engine/boards'
import type { Flag, RuleResult, RuleState } from '../engine/types'

const FONT = '"Inter", "Segoe UI", system-ui, -apple-system, sans-serif'
const INK = '#1f2328', MUTED = '#6b7280'
const STATE_DOT: Record<RuleState, string> = { pass: '#2e8b57', warn: '#d98b1c', fail: '#d0453a', unknown: '#8a8f98' }
const FLAG_TEXT: Record<Flag, string> = { verified: 'verified source', team_assumption: 'team assumption', unverified: 'unverified', unresolved: 'unresolved', false_assumption: 'FALSE ASSUMPTION' }

export interface EvidenceSet { id: string; name: string; rules: RuleResult[] }

const cache = new Map<string, Promise<HTMLImageElement>>()
/** Load (once) an image from a data URL. */
export function loadImg(src: string): Promise<HTMLImageElement> {
  let p = cache.get(src)
  if (!p) {
    p = new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('image failed to load')); i.src = src })
    cache.set(src, p)
    p.catch(() => cache.delete(src))
  }
  return p
}

/** Natural size of an image data URL. */
export async function imageSize(src: string) { const i = await loadImg(src); return { w: i.naturalWidth || 1, h: i.naturalHeight || 1 } }

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const lines: string[] = []
  for (const para of text.normalize('NFC').split('\n')) {
    if (!para.trim()) { lines.push(''); continue }
    let line = ''
    for (const word of para.split(/\s+/)) {
      const tryLine = line ? `${line} ${word}` : word
      if (ctx.measureText(tryLine).width <= maxW) { line = tryLine; continue }
      if (line) lines.push(line)
      // A word longer than the frame is broken by characters.
      let w = word
      while (ctx.measureText(w).width > maxW && w.length > 1) {
        let k = w.length - 1
        while (k > 1 && ctx.measureText(w.slice(0, k)).width > maxW) k--
        lines.push(w.slice(0, k)); w = w.slice(k)
      }
      line = w
    }
    lines.push(line)
  }
  return lines
}

/** Text lines in a box (mm); returns false when the text does not fit. */
function textBox(ctx: CanvasRenderingContext2D, k: number, text: string, box: { x: number; y: number; w: number; h: number }, sizeMm: number, o: { bold?: boolean; color?: string; align?: 'left' | 'right'; lineHeight?: number } = {}) {
  ctx.font = `${o.bold ? 600 : 400} ${sizeMm * k}px ${FONT}`
  ctx.fillStyle = o.color ?? INK
  ctx.textBaseline = 'top'
  ctx.textAlign = o.align ?? 'left'
  const lh = sizeMm * (o.lineHeight ?? 1.3)
  const lines = wrap(ctx, text, box.w * k)
  let y = box.y
  for (const l of lines) {
    if (y + sizeMm > box.y + box.h + 0.01) return false
    ctx.fillText(l, (o.align === 'right' ? box.x + box.w : box.x) * k, y * k)
    y += lh
  }
  return true
}

function evidenceBox(ctx: CanvasRenderingContext2D, k: number, f: Frame, set: EvidenceSet | undefined) {
  const pad = 3
  ctx.fillStyle = '#f5f6f7'
  ctx.fillRect(f.x * k, f.y * k, f.w * k, f.h * k)
  const box = { x: f.x + pad, y: f.y + pad, w: f.w - 2 * pad, h: f.h - 2 * pad }
  if (!set) { textBox(ctx, k, 'Evidence: choose a check in the panel', box, 4, { color: MUTED }); return }
  textBox(ctx, k, set.name, { ...box, h: 7 }, 5, { bold: true })
  let y = box.y + 8
  const order: RuleState[] = ['fail', 'warn', 'unknown', 'pass']
  const rules = [...set.rules].sort((a, b) => order.indexOf(a.state) - order.indexOf(b.state))
  const size = CAPTION_MM
  for (let i = 0; i < rules.length; i++) {
    const r = rules[i]
    ctx.font = `600 ${size * k}px ${FONT}`
    const head = `${r.label}: ${r.value}`
    const tail = `needs ${r.threshold} · ${FLAG_TEXT[r.flag]} · ${r.source.label}${r.source.page ? ` ${r.source.page}` : ''}`
    const hl = wrap(ctx, head, (box.w - 4) * k).length
    ctx.font = `400 ${size * k}px ${FONT}`
    const tl = wrap(ctx, tail, (box.w - 4) * k).length
    const need = (hl + tl) * size * 1.3 + 1.5
    if (y + need > box.y + box.h - size * 1.4 && i < rules.length - 1) {
      textBox(ctx, k, `+ ${rules.length - i} more in the evidence report`, { x: box.x, y, w: box.w, h: size * 1.4 }, size, { color: MUTED })
      return
    }
    ctx.fillStyle = STATE_DOT[r.state]
    ctx.beginPath(); ctx.arc((box.x + 1.2) * k, (y + size * 0.55) * k, 1.1 * k, 0, Math.PI * 2); ctx.fill()
    textBox(ctx, k, head, { x: box.x + 4, y, w: box.w - 4, h: hl * size * 1.3 }, size, { bold: true })
    y += hl * size * 1.3
    textBox(ctx, k, tail, { x: box.x + 4, y, w: box.w - 4, h: tl * size * 1.3 }, size, { color: r.flag === 'false_assumption' ? '#d4148c' : MUTED })
    y += tl * size * 1.3 + 1.5
  }
}

export interface DrawOptions { pxPerMm: number; images: Record<string, BoardImage>; loaded: Map<string, HTMLImageElement>; evidence: Record<string, EvidenceSet>; editing: boolean; index: number; total: number }

/** Draw one board; returns the ids of frames whose text was cut off. */
export function drawBoard(ctx: CanvasRenderingContext2D, board: Board, o: DrawOptions): { overflow: string[] } {
  const k = o.pxPerMm
  const overflow: string[] = []
  ctx.save()
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, BOARD_W * k, BOARD_H * k)
  for (const f of board.frames) {
    const c = f.content
    if (c.kind === 'image') {
      const meta = o.images[c.imageId], el = meta && o.loaded.get(meta.id)
      if (!meta || !el) { if (o.editing) placeholder(ctx, k, f, meta ? 'Loading image…' : 'Image missing'); continue }
      const cap = printedCaption(f, meta)
      const p = imagePlacement(f, meta, c.fit, !!cap)
      ctx.save()
      ctx.beginPath(); ctx.rect(p.clip.x * k, p.clip.y * k, p.clip.w * k, p.clip.h * k); ctx.clip()
      ctx.drawImage(el, p.x * k, p.y * k, p.w * k, p.h * k)
      ctx.restore()
      if (cap) textBox(ctx, k, cap, { x: f.x, y: f.y + f.h - CAPTION_BAND + 1.5, w: f.w, h: CAPTION_BAND - 1.5 }, CAPTION_MM, { color: meta.source === 'ai' ? INK : MUTED, bold: meta.source === 'ai' && cap === 'AI-generated image' })
    } else if (c.kind === 'text') {
      if (!c.text.trim()) { if (o.editing) placeholder(ctx, k, f, f.role === 'title' ? 'Board title' : 'Text: type it in the panel'); continue }
      const box = f.role === 'title' ? { x: f.x, y: f.y + (f.h - c.sizeMm * 1.3) / 2, w: f.w - 30, h: c.sizeMm * 1.35 } : f
      if (!textBox(ctx, k, c.text, box, c.sizeMm, { bold: c.bold })) overflow.push(f.id)
    } else if (c.kind === 'evidence') {
      evidenceBox(ctx, k, f, o.evidence[c.nodeId])
    } else if (o.editing) placeholder(ctx, k, f, 'Drop a shot here, or select and pick one')
    if (f.role === 'title') {
      // Board number (not an identifier), and a hairline under the title band.
      textBox(ctx, k, `${o.index + 1} / ${o.total}`, { x: f.x + f.w - 28, y: f.y + (f.h - 6.5) / 2, w: 28, h: 7 }, 5, { color: MUTED, align: 'right' })
      ctx.fillStyle = '#c9ced4'
      ctx.fillRect(f.x * k, (f.y + f.h + 2.5) * k, f.w * k, Math.max(1, 0.25 * k))
    }
  }
  ctx.restore()
  return { overflow }
}

function placeholder(ctx: CanvasRenderingContext2D, k: number, f: Frame, text: string) {
  ctx.save()
  ctx.strokeStyle = '#b8bec6'
  ctx.lineWidth = Math.max(1, 0.35 * k)
  ctx.setLineDash([2 * k, 1.5 * k])
  ctx.strokeRect(f.x * k, f.y * k, f.w * k, f.h * k)
  ctx.restore()
  const size = f.role === 'title' ? 6 : 4
  textBox(ctx, k, text, { x: f.x + 4, y: f.y + Math.max(2, (f.h - size) / 2 - (f.role === 'title' ? 0 : 0)), w: f.w - 8, h: size * 2.8 }, size, { color: '#9aa1aa' })
}

/** Images a board needs, loaded. */
export async function loadBoardImages(boards: Board[], images: Record<string, BoardImage>): Promise<Map<string, HTMLImageElement>> {
  const ids = new Set(boards.flatMap((b) => b.frames.flatMap((f) => (f.content.kind === 'image' ? [f.content.imageId] : []))))
  const out = new Map<string, HTMLImageElement>()
  await Promise.all([...ids].map(async (id) => { const m = images[id]; if (m) try { out.set(id, await loadImg(m.dataUrl)) } catch { /* missing */ } }))
  return out
}

const toBlob = (c: HTMLCanvasElement, q: number) => new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('JPEG encoding failed'))), 'image/jpeg', q))

/**
 * Render a board at the export resolution and encode the best JPEG under the team target (9.5 MB). The browser's
 * encoder writes no EXIF/XMP; if even quality 0.7 is too big, the pixel size steps down 10% at a time.
 */
export async function exportBoardJpeg(board: Board, o: Omit<DrawOptions, 'pxPerMm' | 'loaded' | 'editing'>, dpi: number, target = TARGET_BYTES) {
  const loaded = await loadBoardImages([board], o.images)
  let scale = 1
  for (let tries = 0; tries < 6; tries++) {
    const { w, h } = pxForDpi(dpi * scale)
    const canvas = document.createElement('canvas')
    canvas.width = w; canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas is not available')
    drawBoard(ctx, board, { ...o, pxPerMm: w / BOARD_W, loaded, editing: false })
    const blobs = new Map<number, Blob>()
    // Quality 1 first: Chrome's encoder only keeps full colour resolution (4:4:4) there; below it, it subsamples 4:2:0.
    const r = await searchQuality(async (q) => { const b = await toBlob(canvas, q); blobs.set(q, b); return b.size }, target, 0.7, 1)
    if (r.fits) {
      const blob = blobs.get(r.q) ?? (await toBlob(canvas, r.q))
      return { blob, bytes: new Uint8Array(await blob.arrayBuffer()), quality: r.q, dpi: Math.round(dpi * scale) }
    }
    scale *= 0.9
  }
  throw new Error('Could not get the board under the size limit')
}
