// A small axonometric of generated blocks (cabinet projection), after Sinnie Choi's Gen.axon in the Downtown Massing
// Tool (src/gen.js): the site outline dashed, every block drawn back to front with a side, a front and a top. Colours are
// the Toolkit's program colours, so the preview reads like the 3D view.
import { USES } from '../../engine/types'
import type { GenBlock, GenUse } from '../../engine/dtmassGen'
import { USE_MAP } from '../../lib/generateTowers'

const shade = (hex: string, k: number) => {
  const n = parseInt(hex.slice(1), 16), c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.max(0, Math.min(255, Math.round(k >= 1 ? v + (255 - v) * (k - 1) : v * k))))
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`
}

/** `label` names the picture; without one it is decorative (inside a button that has its own name). */
export default function GenAxon({ blocks, site, width = 180, height = 140, label }: { blocks: GenBlock[]; site: { w: number; d: number }; width?: number; height?: number; label?: string }) {
  const kx = 0.5, ky = 0.28
  const P = (x: number, y: number, z: number): [number, number] => [x + y * kx, -z + y * ky]
  const shown = blocks.filter((b) => b.use !== 'parking' && b.z0 + b.floors * b.f2f > 0.01)
  const pts: [number, number][] = []
  for (const [x, y] of [[0, 0], [site.w, 0], [site.w, site.d], [0, site.d]]) pts.push(P(x, y, 0))
  for (const b of shown) {
    const top = b.z0 + b.floors * b.f2f
    for (const [x, y] of [[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.d], [b.x, b.y + b.d]]) { pts.push(P(x, y, Math.max(0, b.z0))); pts.push(P(x, y, top)) }
  }
  const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1])
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys)
  const k = Math.min((width - 12) / Math.max(1, x1 - x0), (height - 12) / Math.max(1, y1 - y0))
  const ox = 6 + (width - 12 - (x1 - x0) * k) / 2, oy = 6 + (height - 12 - (y1 - y0) * k) / 2
  const S = (q: [number, number]) => `${(ox + (q[0] - x0) * k).toFixed(1)},${(oy + (q[1] - y0) * k).toFixed(1)}`
  const order = [...shown].sort((a, b) => b.y + b.d - (a.y + a.d) || a.x - b.x || a.z0 - b.z0)
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}>
      <polygon points={[[0, 0], [site.w, 0], [site.w, site.d], [0, site.d]].map(([x, y]) => S(P(x, y, 0))).join(' ')} fill="#fff" stroke="#c0392b" strokeWidth={1} strokeDasharray="3 2" />
      {order.map((b, i) => {
        const z0 = Math.max(0, b.z0), z1 = b.z0 + b.floors * b.f2f
        const col = b.use === 'parking' ? '#cfd6db' : USES[USE_MAP[b.use as GenUse]].color
        const topF: [number, number, number][] = [[b.x, b.y, z1], [b.x + b.w, b.y, z1], [b.x + b.w, b.y + b.d, z1], [b.x, b.y + b.d, z1]]
        const front: [number, number, number][] = [[b.x, b.y, z0], [b.x + b.w, b.y, z0], [b.x + b.w, b.y, z1], [b.x, b.y, z1]]
        const side: [number, number, number][] = [[b.x + b.w, b.y, z0], [b.x + b.w, b.y + b.d, z0], [b.x + b.w, b.y + b.d, z1], [b.x + b.w, b.y, z1]]
        return (
          <g key={i}>
            {([[side, 0.82], [front, 1], [topF, 1.12]] as const).map(([face, kf], j) => (
              <polygon key={j} points={face.map(([x, y, z]) => S(P(x, y, z))).join(' ')} fill={shade(col, kf)} stroke={shade(col, 0.6)} strokeWidth={0.6} strokeLinejoin="round" />
            ))}
          </g>
        )
      })}
    </svg>
  )
}
