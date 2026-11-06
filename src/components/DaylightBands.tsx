// Daylight bands on a plan (backlog item 36, engine/daylightDepth.ts): daylit up to 1 × window head height from the
// glass, marginal up to k × head, deep beyond; the core (or the corridor ring on home and hotel floors) is not counted.
// Drawn in plan metres through the caller's X / Y / mm, so the same layer sits on the board plan and in the node panel.
import { screenUse, SCREENED, type DaylightBand, type UseScreen } from '../engine/daylightDepth'
import type { Floor, Tower } from '../engine/types'
import { useStore } from '../store'
import { U } from './Units'
import { nodeOn } from '../lib/analysis'

/** Sequential, light to dark as daylight falls off; every band is also named in text, never colour alone. */
export const BAND_STYLE: Record<DaylightBand, { fill: string; opacity: number; label: string }> = {
  daylit: { fill: '#f2c94c', opacity: 0.4, label: 'Daylit (≤ 1 × head)' },
  marginal: { fill: '#e08e2b', opacity: 0.32, label: 'Marginal' },
  deep: { fill: '#45566b', opacity: 0.32, label: 'Deep' },
}

type Map2 = { X: (x: number) => number; Y: (y: number) => number; mm: (m: number) => number }

/** Rectangle inset by d from a W × D plate centred on the origin, as an SVG path ("" when nothing is left). */
const inset = ({ X, Y }: Map2, W: number, D: number, d: number) => {
  const w = W / 2 - d, h = D / 2 - d
  return w > 0 && h > 0 ? `M${X(-w)} ${Y(h)}H${X(w)}V${Y(-h)}H${X(-w)}Z` : ''
}

export function BandLayer({ u, m, labels = true, fontSize = 2.3 }: { u: UseScreen; m: Map2; labels?: boolean; fontSize?: number }) {
  const { W, D, hole } = u.plate
  const ring = (a: number, b: number) => `${inset(m, W, D, a)}${inset(m, W, D, b)}`
  const s = hole / 2
  return (
    <g data-daylight={u.use}>
      <path d={ring(0, u.d1)} fillRule="evenodd" fill={BAND_STYLE.daylit.fill} fillOpacity={BAND_STYLE.daylit.opacity} />
      <path d={ring(u.d1, u.d2)} fillRule="evenodd" fill={BAND_STYLE.marginal.fill} fillOpacity={BAND_STYLE.marginal.opacity} />
      {inset(m, W, D, u.d2) && <path d={inset(m, W, D, u.d2)} fill={BAND_STYLE.deep.fill} fillOpacity={BAND_STYLE.deep.opacity} />}
      {/* Not counted: the core, or the core and its corridor ring. */}
      {hole > 0 && <rect x={m.X(-s)} y={m.Y(s)} width={m.mm(hole)} height={m.mm(hole)} fill="#ffffff" fillOpacity={0.85} stroke="#1f2328" strokeWidth={0.2} strokeDasharray="1 0.8" />}
      {labels && (
        <g fontSize={fontSize} fill="#1f2328" stroke="#ffffff" strokeWidth={fontSize * 0.25} paintOrder="stroke">
          <text x={m.X(-W / 2) + 1} y={m.Y(D / 2) + fontSize + 0.8}>daylit {Math.round(u.shares.daylit * 100)}%</text>
          {u.d1 < Math.min(W, D) / 2 && <text x={m.X(-W / 2 + u.d1) + 1} y={m.Y(D / 2 - u.d1) + fontSize + 0.8}>marginal {Math.round(u.shares.marginal * 100)}%</text>}
          {u.shares.deep > 0.005 && <text x={m.X(-W / 2 + u.d2) + 1} y={m.Y(D / 2 - u.d2) + fontSize + 0.8}>deep {Math.round(u.shares.deep * 100)}%</text>}
        </g>
      )}
    </g>
  )
}

/** The board plan's daylight layer (PlanDrawing): the plan's own floor, when the node is on and the use is screened. */
export function DaylightPlanOverlay({ t, f, X, Y, mm }: { t: Tower; f: Floor } & Map2) {
  const on = useStore((s) => nodeOn(s, 'built.daylight-depth'))
  if (!on || f.podium || f.skyLobby || !(SCREENED as readonly string[]).includes(f.use)) return null
  const u = screenUse(t, f.use as UseScreen['use'], [f])
  if (!u) return null
  return (
    <g data-daylight-overlay="">
      <BandLayer u={u} m={{ X, Y, mm }} />
      <text x={X(-t.width / 2)} y={Y(-t.depth / 2) + 5} fontSize="2.3" fill="#1f2328"><U>{`Daylight screen (proxy): head ${u.head.toFixed(1)} m · daylit ≤ ${u.d1.toFixed(1)} m · marginal ≤ ${u.d2.toFixed(1)} m · ${Math.round(u.withinReach * 100)}% within reach`}</U></text>
    </g>
  )
}
