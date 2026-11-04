// ODbL asks that a produced work made from an OpenStreetMap-derived database say so: Real Vancouver captures that show
// Vista's buildings (lib/vistaBuildings.ts) carry the credit in their lower-right corner. Other captures are unchanged.
import { useStore } from '../store'
import { useCityModel } from './cityModel'
import { VISTA_ATTRIBUTION } from './vistaBuildings'

/** The credit a capture of the current scene must carry, or null. */
export function sceneCredit(): string | null {
  return useStore.getState().project === 'city' && useCityModel.getState().model === 'vista' ? VISTA_ATTRIBUTION : null
}

/** The canvas as a PNG data URL, with the credit drawn in its lower-right corner when there is one. */
export function creditedDataUrl(source: HTMLCanvasElement, credit: string | null): string {
  if (!credit) return source.toDataURL('image/png')
  const c = document.createElement('canvas')
  c.width = source.width
  c.height = source.height
  const g = c.getContext('2d')
  if (!g) return source.toDataURL('image/png')
  g.drawImage(source, 0, 0)
  const px = Math.max(11, Math.round(source.width / 150))
  g.font = `${px}px Inter, system-ui, sans-serif`
  const w = g.measureText(credit).width
  g.fillStyle = 'rgba(255, 255, 255, 0.8)'
  g.fillRect(c.width - w - px * 1.4, c.height - px * 1.9, w + px * 1.4, px * 1.9)
  g.fillStyle = '#3d434b'
  g.textAlign = 'right'
  g.textBaseline = 'middle'
  g.fillText(credit, c.width - px * 0.7, c.height - px * 0.95)
  return c.toDataURL('image/png')
}
