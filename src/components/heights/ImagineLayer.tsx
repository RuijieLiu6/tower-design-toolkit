// Imagine Vancouver on the model (after Vista v37, Ruijie Liu): the scenario roof of every building whose height
// changes, drawn as a cap over its footprint. Higher: green caps above the roofs. Lower: caps seen through the
// buildings (x-ray), coloured by what cuts them (zoning amber, City-sourced estimate blue, study surface violet).
// Clicking a cap selects the building in the Results panel. Inside CityScene's z-up group (local metres).
import { useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useImagine } from '../../lib/imagineStore'
import { useViewFromStore } from '../../lib/viewFromStore'
import { useCityData } from '../CityContext'

export const IMAGINE_COLORS = { grown: '#16a34a', zoning: '#d97706', estimate: '#2563eb', study: '#7c3aed' } as const

export default function ImagineLayer() {
  const { data } = useCityData()
  const show = useImagine((s) => s.show)
  const scenario = useImagine((s) => s.scenario)
  const res = useImagine((s) => s.results[s.scenario])
  const prep = useImagine((s) => s.prep)
  const looking = useViewFromStore((s) => s.looking)
  const built = useMemo(() => {
    if (!show || !res || !prep || !data || scenario === 'existing') return null
    const up: number[] = [], down: number[] = [], downColor: number[] = [], upTri: number[] = [], downTri: number[] = []
    const col = { zoning: new THREE.Color(IMAGINE_COLORS.zoning), estimate: new THREE.Color(IMAGINE_COLORS.estimate), study: new THREE.Color(IMAGINE_COLORS.study) }
    prep.input.footprints.forEach((f, p) => {
      const g = prep.partGroup[p], gr = res.groups[g]
      if (!gr.changed || !Number.isFinite(res.roof[p])) return
      const ring = f.outer.map(([x, y]) => new THREE.Vector2(x, y))
      const faces = THREE.ShapeUtils.triangulateShape(ring, [])
      const higher = res.roof[p] > prep.input.roof[p]
      const z = res.roof[p] + (higher ? 0.05 : 0)
      const c = gr.control ? col[gr.control.kind] : col.zoning
      for (const [a, b, d] of faces) for (const k of [a, b, d]) {
        if (higher) { up.push(ring[k].x, ring[k].y, z) } else { down.push(ring[k].x, ring[k].y, z); downColor.push(c.r, c.g, c.b) }
      }
      const n = faces.length
      for (let i = 0; i < n; i++) (higher ? upTri : downTri).push(p)
    })
    const geom = (pos: number[], color?: number[]) => {
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
      if (color) g.setAttribute('color', new THREE.Float32BufferAttribute(color, 3))
      return g
    }
    return { up: geom(up), down: geom(down, downColor), upTri, downTri }
  }, [show, res, prep, data, scenario])
  useEffect(() => () => { built?.up.dispose(); built?.down.dispose() }, [built])
  // A click selects the cap under it even where a building is in front (the lower caps are seen through buildings):
  // the layer raycasts its own two meshes only, and leaves the click to the rest of the app.
  const { gl, camera } = useThree()
  const upRef = useRef<THREE.Mesh>(null), downRef = useRef<THREE.Mesh>(null)
  useEffect(() => {
    if (!built || !prep) return
    const el = gl.domElement, ray = new THREE.Raycaster()
    let at: { x: number; y: number } | null = null
    const onDown = (e: PointerEvent) => { at = e.target === el ? { x: e.clientX, y: e.clientY } : null }
    const onClick = (e: MouseEvent) => {
      if (e.target !== el || !at || Math.hypot(e.clientX - at.x, e.clientY - at.y) > 6) return
      const r = el.getBoundingClientRect()
      ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera)
      const meshes = [downRef.current, upRef.current].filter(Boolean) as THREE.Mesh[]
      const hit = ray.intersectObjects(meshes, false)[0]
      if (!hit || hit.faceIndex === undefined || hit.faceIndex === null) return
      const part = (hit.object === downRef.current ? built.downTri : built.upTri)[hit.faceIndex]
      const row = prep.partRow[part]
      if (row >= 0) useImagine.setState({ selected: row })
    }
    window.addEventListener('pointerdown', onDown, true)
    window.addEventListener('click', onClick, true)
    return () => { window.removeEventListener('pointerdown', onDown, true); window.removeEventListener('click', onClick, true) }
  }, [built, prep, gl, camera])
  if (!built || looking) return null
  return (
    <group>
      <mesh ref={upRef} geometry={built.up} renderOrder={18}>
        <meshBasicMaterial color={IMAGINE_COLORS.grown} transparent opacity={0.7} side={THREE.DoubleSide} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh ref={downRef} geometry={built.down} renderOrder={19}>
        <meshBasicMaterial vertexColors transparent opacity={0.65} side={THREE.DoubleSide} depthTest={false} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  )
}
