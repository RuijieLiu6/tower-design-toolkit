// Shadow map cache (Ruijie, 4 Nov: "can the cones be lighter so the view runs faster"). Measured on the team laptop's
// Intel UHD at 1070 x 799: re-rendering the sun's 4096 x 4096 shadow map every frame cost 10-11 ms of a 44 ms frame. The
// map depends on the light and on what casts shadows, not on the camera, so it is re-rendered only when one of those
// changes: the sun (direction, on/off), a shadow caster's geometry, its drawn parts (the hidden-buildings index), its
// place in the world, or whether it casts at all. Orbiting, zooming and panning reuse the map.
import * as THREE from 'three'

/** Numbers that change whenever the shadow map would: every visible caster and every shadow-casting light. */
export function casterSignature(scene: THREE.Object3D): number[] {
  const out: number[] = []
  scene.traverseVisible((o) => {
    const m = o as THREE.Mesh
    if ((m as unknown as THREE.Light).isLight) {
      const l = o as THREE.DirectionalLight
      if (!l.castShadow) return
      l.updateMatrixWorld()
      out.push(-1, l.id, l.intensity, ...l.matrixWorld.elements.slice(12, 15), ...l.target.matrixWorld.elements.slice(12, 15))
      return
    }
    if (!m.isMesh || !m.castShadow) return
    const g = m.geometry
    out.push(m.id, g.id, g.index ? g.index.version : 0, g.drawRange.start, g.drawRange.count, (g.getAttribute('position') as THREE.BufferAttribute | undefined)?.version ?? 0)
    const e = m.matrixWorld.elements
    out.push(e[0], e[1], e[4], e[5], e[10], e[12], e[13], e[14])
  })
  return out
}

/** Whether two signatures differ (a changed caster, light or count). */
export function signatureChanged(a: number[] | null, b: number[]): boolean {
  if (!a || a.length !== b.length) return true
  for (let i = 0; i < b.length; i++) if (a[i] !== b[i]) return true
  return false
}
