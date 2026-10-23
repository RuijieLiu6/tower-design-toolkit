// Relaxation masks in Real Vancouver (C01-M06): each protected view's plan, tinted by the route that could relax it.
// Teal: Higher Buildings Policy (QE view 3.2.x); violet: Exceptional Downtown Site (B1, B2, D); red outline: no relief
// (A, E, 9.x, J1, G, H); grey outline: no route found in the research. A route the user switched on fills its cones.
// Drawn flat, over the terrain (no depth test), inside CityScene's z-up group (local metres). Never a determination.
import { useMemo } from 'react'
import * as THREE from 'three'
import { coneRoute, type ConeRoute } from '../engine/relaxAviation'
import { CONES } from '../engine/viewCones'
import { useRelax } from '../lib/relaxStore'
import { CITY_ORIGIN, useStore } from '../store'

export const ROUTE_STYLE: Record<ConeRoute, { color: string; label: string }> = {
  hbp: { color: '#0f9488', label: 'Higher Buildings Policy may allow entry' },
  eds: { color: '#7c3aed', label: 'Exceptional Downtown Site may allow entry' },
  none: { color: '#dc2626', label: 'No relaxation route' },
  unlisted: { color: '#6b7280', label: 'No route found in the research' },
}

export default function RelaxationMasks() {
  const show = useRelax((s) => s.show)
  const on = useRelax((s) => s.on)
  const project = useStore((s) => s.project)
  const shapes = useMemo(() => CONES.map((c) => {
    const pts = c.ring.map(([x, y]) => new THREE.Vector2(x - CITY_ORIGIN[0], y - CITY_ORIGIN[1]))
    const fill = new THREE.ShapeGeometry(new THREE.Shape(pts))
    const line = new THREE.BufferGeometry().setFromPoints([...pts, pts[0]].map((p) => new THREE.Vector3(p.x, p.y, 0)))
    return { id: c.id, route: coneRoute(c.id), fill, line }
  }), [])
  if (!show || project !== 'city') return null
  return (
    <group position={[0, 0, 2]} renderOrder={5}>
      {shapes.map((s) => {
        const style = ROUTE_STYLE[s.route]
        const active = (s.route === 'hbp' || s.route === 'eds') && on.includes(s.route)
        return (
          <group key={s.id}>
            {(s.route === 'hbp' || s.route === 'eds') && (
              <mesh geometry={s.fill} renderOrder={5}>
                <meshBasicMaterial color={style.color} transparent opacity={active ? 0.38 : 0.12} depthTest={false} depthWrite={false} side={THREE.DoubleSide} />
              </mesh>
            )}
            <lineLoop geometry={s.line} renderOrder={6}>
              <lineBasicMaterial color={style.color} transparent opacity={0.9} depthTest={false} />
            </lineLoop>
          </group>
        )
      })}
    </group>
  )
}
