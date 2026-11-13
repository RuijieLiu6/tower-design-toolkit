// Add an analysis drawing to the presentation boards (Sinnie, 13 Nov: "add a button that allows users to add an analysis
// drawing to the final presentation sheet"). The drawing becomes a board image (a tool capture, lib/boardStore.ts) with
// a title band, and fills the first empty picture frame on the boards; with none free it waits in the boards' image
// library for the Present step's composer.
import { useStore } from '../store'
import { useBoardStore } from './boardStore'

export interface SheetPlace { board: number; frame: string | null }

function titled(src: CanvasImageSource, w: number, h: number, title: string, caption: string): { dataUrl: string; w: number; h: number } {
  const pad = Math.round(w * 0.03), band = Math.round(Math.max(56, w * 0.07))
  const c = document.createElement('canvas')
  c.width = w + pad * 2; c.height = h + band + pad
  const g = c.getContext('2d')!
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, c.width, c.height)
  g.fillStyle = '#1f2328'; g.font = `600 ${Math.round(band * 0.36)}px system-ui, sans-serif`; g.textBaseline = 'top'
  g.fillText(title, pad, Math.round(band * 0.14))
  g.fillStyle = '#6b7280'; g.font = `${Math.round(band * 0.24)}px system-ui, sans-serif`
  g.fillText(caption.length > 140 ? `${caption.slice(0, 137)}…` : caption, pad, Math.round(band * 0.58))
  g.drawImage(src, pad, band, w, h)
  return { dataUrl: c.toDataURL('image/png'), w: c.width, h: c.height }
}

async function svgToImage(svg: SVGSVGElement, width: number): Promise<{ img: HTMLImageElement; h: number }> {
  const vb = svg.viewBox.baseVal
  const vw = vb && vb.width ? vb.width : svg.clientWidth || 300, vh = vb && vb.height ? vb.height : svg.clientHeight || 300
  const h = Math.round((width * vh) / vw)
  const clone = svg.cloneNode(true) as SVGSVGElement
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  clone.setAttribute('width', String(width)); clone.setAttribute('height', String(h))
  const img = new Image()
  await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error('drawing')); img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(clone))}` })
  return { img, h }
}

/** A drawing from the SVG figures of a Results drawing (several, e.g. the seasonal roses, as a two-column grid). */
export async function svgImage(svgs: SVGSVGElement[], title: string, caption: string, width = 1400) {
  if (svgs.length === 1) { const { img, h } = await svgToImage(svgs[0], width); return titled(img, width, h, title, caption) }
  const cols = 2, cw = Math.floor(width / cols)
  const parts = await Promise.all(svgs.map((s) => svgToImage(s, cw)))
  const rowH = Math.max(...parts.map((p) => p.h))
  const c = document.createElement('canvas'); c.width = width; c.height = rowH * Math.ceil(parts.length / cols)
  const g = c.getContext('2d')!
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, c.width, c.height)
  parts.forEach((p, i) => g.drawImage(p.img, (i % cols) * cw, Math.floor(i / cols) * rowH, cw, p.h))
  return titled(c, c.width, c.height, title, caption)
}

/** A drawing from a WebGL canvas (the analysis view; it keeps its drawing buffer). */
export function canvasImage(canvas: HTMLCanvasElement, title: string, caption: string) {
  return titled(canvas, canvas.width, canvas.height, title, caption)
}

/** Puts the image on the first empty picture frame of the boards (or keeps it in the boards' library). */
export function addToSheet(img: { dataUrl: string; w: number; h: number }, label: string): SheetPlace {
  const b = useBoardStore.getState()
  const id = `analysis-${Date.now().toString(36)}`
  b.addImage({ id, dataUrl: img.dataUrl, w: img.w, h: img.h, source: 'capture', label })
  for (let i = 0; i < b.boards.length; i++) {
    const f = b.boards[i].frames.find((x) => x.role === 'body' && x.content.kind === 'empty')
    if (f) {
      b.updateFrame(i, f.id, { content: { kind: 'image', imageId: id, fit: 'contain' }, caption: label })
      useStore.setState({ announce: `${label} added to board ${i + 1}.` })
      return { board: i, frame: f.id }
    }
  }
  useStore.setState({ announce: `${label} added to the boards' images: every frame is full, so place it in Present.` })
  return { board: -1, frame: null }
}

export const placeText = (p: SheetPlace) => (p.board >= 0 ? `On board ${p.board + 1}` : 'In the board images')
