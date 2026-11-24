// A declared diagrid (gap G79, engine/diagrid.ts) drawn on the model: its members as lines over the storey outlines, in
// the structure red of the outrigger bands. Drawn in the tower frame (the tower group's origin and turn), z up from the
// tower's base, whenever a diagrid is declared and the stack is not exploded.
import { useMemo } from 'react'
import * as THREE from 'three'
import { diagridGeometry } from '../engine/diagrid'
import { towerFloors } from '../engine/massing'
import type { Floor, Tower } from '../engine/types'

const COLOR = '#c0392b'

/** The members in the tower's own frame (project frame less the tower's position and turn). */
export function diagridLocalSegments(t: Tower, floors: Floor[]): number[] {
  const g = diagridGeometry(t, floors)
  if (!g) return []
  const a = (-t.rotation * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a)
  const loc = (x: number, y: number) => { const u = x - t.x, v = y - t.y; return [u * c - v * s, u * s + v * c] }
  const out: number[] = []
  for (const [p, q] of g.members) { const [x0, y0] = loc(p[0], p[1]), [x1, y1] = loc(q[0], q[1]); out.push(x0, y0, p[2], x1, y1, q[2]) }
  return out
}

export default function DiagridLines({ t, floors, visible, clip }: { t: Tower; floors?: Floor[]; visible: boolean; clip: THREE.Plane[] | null }) {
  const geo = useMemo(() => {
    if (!t.diagrid) return null
    const p = diagridLocalSegments(t, floors ?? towerFloors(t))
    if (!p.length) return null
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3))
    return g
  }, [t, floors])
  if (!visible || !geo) return null
  return <lineSegments geometry={geo} raycast={() => null}><lineBasicMaterial color={COLOR} clippingPlanes={clip} /></lineSegments>
}
