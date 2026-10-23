// 3D overlay for the public realm checks on the competition block (research P06). Shown while one of the three
// public realm nodes is selected: streets coloured by the selected check, the POPS rectangle and transit plaza,
// the mid-block link corridor, and separation lines to the context's future towers.
import { Line } from '@react-three/drei'
import { useMemo } from 'react'
import * as THREE from 'three'
import { STATION_CORNER, VTC_EDGES, VTC_SITE, polyDistance, type EdgeId } from '../engine/publicRealm'
import { towerFootprint } from '../engine/massing'
import type { RuleState } from '../engine/types'
import { useResults } from '../hooks/useResults'
import { useVtcNeighbours } from '../lib/vtcNeighbours'
import { useStore, useTowers } from '../store'
import Label from './Label'

const STATE_COLOR: Record<RuleState, string> = { pass: '#2e8b57', warn: '#d98b1c', fail: '#d0453a', unknown: '#8a8f98' }
type P3 = [number, number, number]

/** A street edge drawn 2 m outside the property line. */
function edgeLine(id: EdgeId, off = 2): P3[] {
  const { xMin, xMax, yMin, yMax } = VTC_SITE
  if (id === 'south') return [[xMin, yMin - off, 0.4], [xMax, yMin - off, 0.4]]
  if (id === 'north') return [[xMin, yMax + off, 0.4], [xMax, yMax + off, 0.4]]
  if (id === 'west') return [[xMin - off, yMin, 0.4], [xMin - off, yMax, 0.4]]
  return [[xMax + off, yMin, 0.4], [xMax + off, yMax, 0.4]]
}
const mid = (l: P3[]): P3 => [(l[0][0] + l[1][0]) / 2, (l[0][1] + l[1][1]) / 2, 3]

function Rect({ x0, x1, y0, y1, color, opacity = 0.35, z = 0.25 }: { x0: number; x1: number; y0: number; y1: number; color: string; opacity?: number; z?: number }) {
  return (
    <mesh position={[(x0 + x1) / 2, (y0 + y1) / 2, z]}>
      <planeGeometry args={[Math.max(0.01, x1 - x0), Math.max(0.01, y1 - y0)]} />
      <meshBasicMaterial color={color} transparent opacity={opacity} depthWrite={false} side={THREE.DoubleSide} />
    </mesh>
  )
}

export default function PublicRealmOverlay() {
  const selected = useStore((s) => s.selectedNode)
  const enabled = useStore((s) => s.enabled)
  const input = useStore((s) => s.publicRealm)
  const towers = useTowers()
  const { streetwall, frontage, groundPlane } = useResults()
  const which = selected === 'built.pr-streetwall' || selected === 'built.pr-frontage' || selected === 'built.pr-ground' ? selected : null
  const neighbours = useVtcNeighbours(which === 'built.pr-streetwall')
  const sepLines = useMemo(() => {
    if (which !== 'built.pr-streetwall') return []
    const out: { a: P3; b: P3; d: number }[] = []
    for (const t of towers) {
      const A = towerFootprint(t)
      for (const nb of neighbours) {
        // Closest pair of vertices as a readable stand-in for the closest points.
        let best: { a: P3; b: P3; d: number } | null = null
        for (const p of A) for (const q of nb.footprint) {
          const d = Math.hypot(p[0] - q[0], p[1] - q[1])
          if (!best || d < best.d) best = { a: [p[0], p[1], 30], b: [q[0], q[1], 30], d }
        }
        if (best) out.push({ ...best, d: polyDistance(A, nb.footprint) })
      }
    }
    return out
  }, [which, towers, neighbours])
  if (!which || !enabled[which]) return null

  if (which === 'built.pr-streetwall' && streetwall) {
    return (
      <group>
        {streetwall.edges.map((w) => {
          const l = edgeLine(w.edge.id)
          return (
            <group key={w.edge.id}>
              <Line points={l} color={STATE_COLOR[w.state]} lineWidth={6} />
              <Label text={`${w.edge.street} · ${w.edge.row.toFixed(1)} m · wall ${w.wallHeight.toFixed(1)} / ${w.max.toFixed(1)} m`} position={mid(l)} size={0.016} color="#ffffff" background={w.state === 'pass' ? 'rgba(46,139,87,0.92)' : 'rgba(208,69,58,0.92)'} />
            </group>
          )
        })}
        {sepLines.map((s, i) => (
          <group key={i}>
            <Line points={[s.a, s.b]} color="#5b6672" lineWidth={1.5} dashed dashSize={4} gapSize={3} />
            <Label text={`${s.d.toFixed(1)} m`} position={[(s.a[0] + s.b[0]) / 2, (s.a[1] + s.b[1]) / 2, 34]} size={0.014} />
          </group>
        ))}
      </group>
    )
  }

  if (which === 'built.pr-frontage' && frontage) {
    return (
      <group>
        {frontage.edges.map((x) => {
          const l = edgeLine(x.edge.id)
          const f = input.frontage[x.edge.id]
          return (
            <group key={x.edge.id}>
              <Line points={l} color={STATE_COLOR[x.state]} lineWidth={6} />
              <Label text={`${x.edge.street}: ${Math.round(f.active * 100)}% active · ${x.spacing === null ? 'no entrances' : `entrance every ${x.spacing.toFixed(0)} m`}${f.crossings ? ` · ${f.crossings} driveway${f.crossings > 1 ? 's' : ''}` : ''}`}
                position={mid(l)} size={0.016} color="#ffffff" background={x.state === 'pass' ? 'rgba(46,139,87,0.92)' : x.state === 'warn' ? 'rgba(217,139,28,0.94)' : 'rgba(208,69,58,0.92)'} />
            </group>
          )
        })}
      </group>
    )
  }

  if (which === 'built.pr-ground' && groundPlane) {
    const os = groundPlane.open
    const L = groundPlane.link
    return (
      <group>
        {os.largest && (
          <group>
            <Rect {...os.largest} color="#3c8d5a" opacity={0.3} />
            <Label text={`Largest open space ${Math.round(os.largest.area).toLocaleString()} m²`} position={[(os.largest.x0 + os.largest.x1) / 2, (os.largest.y0 + os.largest.y1) / 2, 4]} size={0.016} color="#ffffff" background="rgba(60,141,90,0.92)" />
          </group>
        )}
        <Rect x0={STATION_CORNER[0]} x1={STATION_CORNER[0] + 6.1} y0={STATION_CORNER[1]} y1={STATION_CORNER[1] + 6.1} color={os.transitPlaza ? '#2a8f86' : '#d0453a'} opacity={0.6} z={0.35} />
        <Label text={os.transitPlaza ? 'Transit plaza room (6.1 m)' : 'No transit plaza room'} position={[STATION_CORNER[0] - 6, STATION_CORNER[1] - 8, 4]} size={0.014} />
        {L && (
          <group>
            <Rect x0={L.x0} x1={L.x1} y0={L.y0} y1={L.y1} color={L.through === 'tower' ? '#d0453a' : L.through === 'podium' ? '#d98b1c' : '#1d5fa8'} opacity={0.3} z={0.3} />
            <Line points={[[L.x0, L.y0, 0.45], [L.x1, L.y0, 0.45], [L.x1, L.y1, 0.45], [L.x0, L.y1, 0.45], [L.x0, L.y0, 0.45]]} color="#1d5fa8" lineWidth={2} dashed dashSize={3} gapSize={2} />
            <Label text={`Mid-block link ${input.link.width.toFixed(1)} m${L.through === 'clear' ? '' : L.through === 'podium' ? ' (through the podium)' : ' (through the tower)'}`} position={[(L.x0 + L.x1) / 2, (L.y0 + L.y1) / 2, 6]} size={0.016} color="#ffffff" background="rgba(29,95,168,0.92)" />
          </group>
        )}
        {VTC_EDGES.map((e) => <Line key={e.id} points={edgeLine(e.id, 1)} color="#9aa3ad" lineWidth={1.2} />)}
      </group>
    )
  }
  return null
}
