import { useStore } from '../store'
import { renderCleanFrame } from './editorOverlay'
import { creditedDataUrl, sceneCredit } from './credit'

const stamp = (at: string) => at.slice(0, 19).replace(/[:T]/g, '-')

function download(href: string, name: string) {
  const a = document.createElement('a')
  a.href = href
  a.download = name
  a.click()
}

/** The board's floor plan drawing as standalone SVG text (sheet millimetres, so it prints at its stated scale). */
export function planSvgText(): string | null {
  const svg = document.querySelector('[data-plan-drawing]') as SVGSVGElement | null
  if (!svg) return null
  const clone = svg.cloneNode(true) as SVGSVGElement
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  clone.setAttribute('width', '594mm')
  clone.setAttribute('height', '420mm')
  clone.removeAttribute('class')
  return new XMLSerializer().serializeToString(clone)
}

/** Save the floor plan drawing as SVG (vector, A2 at its stated scale). */
export function downloadPlanSvg(): boolean {
  const text = planSvgText()
  if (!text) return false
  const s = useStore.getState()
  const url = URL.createObjectURL(new Blob([text], { type: 'image/svg+xml' }))
  download(url, `floor-plan-${s.project}-${stamp(new Date().toISOString())}.svg`)
  setTimeout(() => URL.revokeObjectURL(url), 2000)
  return true
}

/** Rasterise the floor plan drawing at about 100 dpi on A2 (2400 px wide), file it as a shot and optionally download it. */
async function capturePlan(downloadPng: boolean): Promise<string | null> {
  const text = planSvgText()
  if (!text) return null
  const img = new Image()
  const loaded = new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error('plan image failed')) })
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(text)}`
  await loaded
  const canvas = document.createElement('canvas')
  canvas.width = 2400
  canvas.height = Math.round((2400 * 420) / 594)
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  const dataUrl = canvas.toDataURL('image/png')
  const s = useStore.getState()
  const at = new Date().toISOString()
  s.addShot({ id: at, dataUrl, stage: s.phase, representation: 'plan', project: s.project, at })
  if (downloadPng) download(dataUrl, `floor-plan-${s.project}-${stamp(at)}.png`)
  return dataUrl
}

/**
 * Capture the board: the 3D view as a PNG, or in Present with the floor plan board, the drawing. Files it in the
 * shot list (with stage and representation) and optionally downloads it.
 */
export function captureShot(download_ = false): string | null {
  const s = useStore.getState()
  if (s.phase === 'present' && s.boardView === 'plan') { void capturePlan(download_); return null }
  const canvas = document.querySelector('[data-viewport] canvas') as HTMLCanvasElement | null
  if (!canvas) return null
  renderCleanFrame() // the tower gizmo and selection outline are never in a shot
  const dataUrl = creditedDataUrl(canvas, sceneCredit()) // OSM credit on Real Vancouver captures (ODbL)
  const at = new Date().toISOString()
  s.addShot({ id: at, dataUrl, stage: s.phase, representation: s.phase === 'basic' ? 'clay' : s.phase === 'advanced' ? 'xray' : s.presentRep, project: s.project, at })
  if (download_) download(dataUrl, `tower-studio-${s.project}-${stamp(at)}.png`)
  return dataUrl
}
