// Programme stacking diagram (brief p.30 "Programme organization", run-through G1, 4 Nov): the tower's use zones from
// grade to the top as one labelled bar, each zone with its levels, floor count, gross floor area and share, in the
// programme colours, plus a key and the LOD 100 note. Pure SVG in millimetres, like engine/drawings.ts, so it exports
// as SVG or PNG and goes on a board. Areas are the massing's gross floor areas (towerFloors), not a measured scheme.
import { towerFloors } from './massing'
import { USES, type Floor, type Tower, type UseId } from './types'

export interface StackZone { use: UseId; podium: boolean; skyLobby: boolean; l0: number; l1: number; floors: number; z0: number; z1: number; area: number }

/** Consecutive floors of one use (and podium / sky-lobby status) form a zone, bottom to top. */
export function stackZones(floors: Floor[]): StackZone[] {
  const out: StackZone[] = []
  for (const f of floors) {
    const last = out[out.length - 1], sky = !!f.skyLobby
    if (last && last.use === f.use && last.podium === f.podium && last.skyLobby === sky && last.l1 === f.level - 1) {
      last.l1 = f.level; last.floors += 1; last.z1 = f.z1; last.area += f.area
    } else out.push({ use: f.use, podium: f.podium, skyLobby: sky, l0: f.level, l1: f.level, floors: 1, z0: f.z0, z1: f.z1, area: f.area })
  }
  return out
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const r2 = (v: number) => Math.round(v * 100) / 100
const fmtArea = (m2: number) => `${Math.round(m2).toLocaleString('en-CA')} m²`

export function stackingDiagram(t: Tower, o: { projectLabel: string; date?: string }): { svg: string; title: string; widthMm: number; heightMm: number; zones: StackZone[] } {
  const zones = stackZones(towerFloors(t))
  const W = 420, H = 297 // A3 landscape, so it scales cleanly onto an A2 board
  const top = 30, bottom = H - 34, barX = 40, barW = 46
  const total = zones.reduce((s, z) => s + z.area, 0) || 1
  const zMax = Math.max(t.height, ...zones.map((z) => z.z1)) || 1
  const y = (z: number) => r2(bottom - (z / zMax) * (bottom - top))
  const parts: string[] = []
  parts.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="#ffffff"/>`)
  parts.push(`<text x="20" y="16" font-size="6" font-weight="600" fill="#1f2328">${esc(`Programme stacking · ${t.name}`)}</text>`)
  parts.push(`<text x="20" y="23" font-size="3" fill="#62666d">${esc(`${o.projectLabel} · ${Math.round(t.height)} m · ${zones.reduce((s, z) => s + z.floors, 0)} floors · ${fmtArea(total)} gross${o.date ? ` · ${o.date}` : ''}`)}</text>`)
  // Ground line and height ticks every 50 m.
  parts.push(`<line x1="${barX - 12}" y1="${bottom}" x2="${barX + barW + 12}" y2="${bottom}" stroke="#1f2328" stroke-width="0.5"/>`)
  for (let h = 50; h < zMax; h += 50) parts.push(`<text x="${barX - 4}" y="${y(h) + 1}" font-size="2.4" text-anchor="end" fill="#62666d">${h} m</text><line x1="${barX - 2}" y1="${y(h)}" x2="${barX}" y2="${y(h)}" stroke="#62666d" stroke-width="0.3"/>`)
  let lastLabelY = Infinity
  zones.forEach((z) => {
    const y0 = y(z.z0), y1 = y(z.z1), mid = (y0 + y1) / 2
    parts.push(`<rect data-zone="${z.use}" x="${barX}" y="${y1}" width="${barW}" height="${r2(Math.max(0.4, y0 - y1))}" fill="${USES[z.use].color}" stroke="#ffffff" stroke-width="0.3"/>`)
    // Labels sit beside their zone, nudged down so they never overlap (thin zones share a leader line).
    const ly = Math.min(mid + 1.2, lastLabelY - 7.5)
    lastLabelY = ly
    const name = `${USES[z.use].label}${z.podium ? ' (podium)' : ''}${z.skyLobby ? ' · sky lobby' : ''}`
    const lv = z.l0 === z.l1 ? `L${z.l0}` : `L${z.l0}–L${z.l1}`
    parts.push(`<line x1="${barX + barW}" y1="${r2(mid)}" x2="${barX + barW + 8}" y2="${r2(ly - 1.2)}" stroke="#9aa0a6" stroke-width="0.25"/>`)
    parts.push(`<text x="${barX + barW + 10}" y="${r2(ly)}" font-size="3" fill="#1f2328"><tspan font-weight="600">${esc(name)}</tspan> · ${lv} · ${z.floors} floor${z.floors > 1 ? 's' : ''} · ${fmtArea(z.area)} (${Math.round((z.area / total) * 100)}%)</text>`)
  })
  // Key: each use once, with its share of the whole tower.
  const byUse = new Map<UseId, number>()
  for (const z of zones) byUse.set(z.use, (byUse.get(z.use) ?? 0) + z.area)
  let ky = 40
  parts.push(`<text x="290" y="${ky - 6}" font-size="3" font-weight="600" fill="#1f2328">Key · share of gross floor area</text>`)
  for (const [use, a] of byUse) {
    parts.push(`<rect x="290" y="${ky - 3}" width="5" height="4" fill="${USES[use].color}"/><text x="298" y="${ky}" font-size="3" fill="#1f2328">${esc(USES[use].label)} · ${fmtArea(a)} · ${Math.round((a / total) * 100)}%</text>`)
    ky += 6.5
  }
  parts.push(`<text x="20" y="${H - 14}" font-size="2.4" fill="#62666d">LOD 100: zones and areas come from the massing's programme bands (gross floor area per floor, core included); a schematic</text>`)
  parts.push(`<text x="20" y="${H - 10}" font-size="2.4" fill="#62666d">space reservation, not a measured scheme. Heights to scale; labels placed beside their zones.</text>`)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}" font-family="Inter, 'Segoe UI', system-ui, sans-serif">${parts.join('')}</svg>`
  return { svg, title: 'Programme stacking diagram', widthMm: W, heightMm: H, zones }
}
