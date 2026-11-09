// In-canvas part of "View from here" (Real Vancouver): picks a roof or street point by clicking the 3D view, puts the
// camera at eye height and turns it to the chosen bearing, and captures a stitched 360° strip for the filmstrip.
// Mounted inside CityScene (model frame: x east, y north, z up, geodetic heights).
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { sampleTerrain } from '../lib/cityLayers'
import { is2009Part } from '../lib/cityGeometry'
import { buildingLabel, buildingSource, buildingsNote } from '../lib/vistaBuildings'
import { terrainBasis } from '../lib/terrainDetails'
import { pickAt } from '../engine/viewFrom'
import { eyeZ, useViewFromStore } from '../lib/viewFromStore'
import { useStore } from '../store'
import { useCityObstacles } from './CityContext'
import Label from './Label'

/** Model frame (x, y, z-up) to three.js world (y-up). */
const toThree = (x: number, y: number, z: number) => new THREE.Vector3(x, z, -y)
type Ctl = { target: THREE.Vector3; enabled: boolean; update: () => void }

export default function ViewFromRig() {
  // Footprints hidden under the design (opt-in, CityContext) can't be picked; their meshes are not drawn or raycast either.
  const { data, idx, heights, hidden: removed } = useCityObstacles()
  const { gl, camera, scene, controls } = useThree() as unknown as { gl: THREE.WebGLRenderer; camera: THREE.PerspectiveCamera; scene: THREE.Scene; controls: Ctl | null }
  const v = useViewFromStore()
  const saved = useRef<{ pos: THREE.Vector3; target: THREE.Vector3; fov: number; near: number } | null>(null)
  const marker = useRef<THREE.Group>(null)
  const hidden = useRef<THREE.Object3D[]>([])
  /** Map overlays (cone sheets, ground tints, the height surface) are translucent double-sided sheets: hide them for a real view. */
  const hideOverlays = () => {
    if (useViewFromStore.getState().overlays || hidden.current.length) return
    scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined
      if ((o as THREE.Mesh).isMesh && o.visible && m && !Array.isArray(m) && m.transparent && m.side === THREE.DoubleSide && !m.depthWrite) { o.visible = false; hidden.current.push(o) }
    })
  }
  const showOverlays = () => { for (const o of hidden.current) o.visible = true; hidden.current = [] }

  useEffect(() => {
    const state = useViewFromStore.getState(), vp = state.viewpoint
    if (!data || !idx || vp?.kind !== 'roof') return
    const p = pickAt(idx, heights, vp.x, vp.y, state.eye)
    if (p.kind === 'roof') state.set({ viewpoint: { ...vp, footprint: p.index, stand: p.roof, basis: `${buildingSource(data, p.index)}: roof surface ${p.roof.toFixed(1)} m CGVD28` } })
    else state.set({ looking: false, viewpoint: null, note: vp.footprint !== undefined && removed.has(vp.footprint) ? 'That roof is hidden under the design (hypothetical removal). Choose another roof.' : 'Roof geometry changed. Select a measured roof again.' })
  }, [data, idx]) // eslint-disable-line react-hooks/exhaustive-deps

  // Click to pick (only while picking): raycast the scene, then classify the plan point.
  useEffect(() => {
    if (!v.picking || !data || !idx) return
    const el = gl.domElement
    const ray = new THREE.Raycaster()
    const onDown = (e: PointerEvent) => {
      const r = el.getBoundingClientRect()
      ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera)
      const hit = ray.intersectObjects(scene.children, true).find((h) => (h.object as THREE.Mesh).isMesh && h.object.visible)
      if (!hit) return
      const x = hit.point.x, y = -hit.point.z
      const s = useViewFromStore.getState()
      const p = pickAt(idx, heights, x, y, s.eye)
      if (p.kind === 'unknown') { s.set({ note: p.reason }); return }
      if (p.kind === 'roof') {
        const id = data.footprints[p.index].id
        s.set({ picking: false, note: null, viewpoint: data.model === 'vista'
          ? { kind: 'roof', x, y, stand: p.roof, footprint: p.index, label: buildingLabel(data, p.index),
            basis: `${buildingSource(data, p.index)}: roof ${p.roof.toFixed(1)} m CGVD28 (building base ${p.ground.toFixed(1)} m on the City ground)` }
          : is2009Part(id)
          ? { kind: 'roof', x, y, stand: p.roof, footprint: p.index, label: buildingLabel(data, p.index),
            basis: `City 2009 heights (Building footprints 2009, older survey): base + average height ${p.roof.toFixed(1)} m (top ${p.max.toFixed(1)} m, base ${p.ground.toFixed(1)} m)` }
          : { kind: 'roof', x, y, stand: p.roof, footprint: p.index, label: buildingLabel(data, p.index), basis: `LiDAR 2022 ${id < 0 ? 'roof-level median' : 'whole-footprint P90'} ${p.roof.toFixed(1)} m (${id < 0 ? 'cell P99' : 'supported max'} ${p.max.toFixed(1)} m, ground ${p.ground.toFixed(1)} m, ${p.points >= 65535 ? '65,535+' : p.points.toLocaleString()} roof points)` } })
        return
      }
      const ground = sampleTerrain(data.grids, x, y)
      s.set({ picking: false, note: null, viewpoint: { kind: 'street', x, y, stand: ground ?? hit.point.y, label: 'Street point', basis: ground != null ? `Terrain ${ground.toFixed(1)} m (${terrainBasis(data.grids, [[x, y]])}; CGVD28)` : 'Clicked surface (no terrain here)' } })
    }
    el.addEventListener('pointerdown', onDown)
    el.style.cursor = 'crosshair'
    return () => { el.removeEventListener('pointerdown', onDown); el.style.cursor = '' }
  }, [v.picking, data, idx, heights, gl, camera, scene])

  // Enter and leave the eye-level view, restoring the orbit camera afterwards.
  useEffect(() => {
    if (v.looking && v.viewpoint) {
      saved.current ??= { pos: camera.position.clone(), target: controls?.target.clone() ?? new THREE.Vector3(), fov: camera.fov, near: camera.near }
      if (controls) controls.enabled = false
      hideOverlays()
    } else if (saved.current) {
      showOverlays()
      const s = saved.current
      saved.current = null
      camera.position.copy(s.pos); camera.fov = s.fov; camera.near = s.near; camera.updateProjectionMatrix()
      if (controls) { controls.target.copy(s.target); controls.enabled = true; controls.update() }
    }
  }, [v.looking, v.viewpoint, v.overlays, camera, controls]) // eslint-disable-line react-hooks/exhaustive-deps

  const aim = (bearing: number, pitch: number, hfov: number) => {
    const vp = useViewFromStore.getState().viewpoint!
    const e = useViewFromStore.getState().eye
    const eye = toThree(vp.x, vp.y, eyeZ(vp, e))
    const a = (bearing * Math.PI) / 180, p = (pitch * Math.PI) / 180
    const dir = toThree(Math.sin(a) * Math.cos(p), Math.cos(a) * Math.cos(p), Math.sin(p))
    camera.position.copy(eye)
    const target = eye.clone().add(dir)
    camera.lookAt(target)
    const aspect = gl.domElement.width / Math.max(1, gl.domElement.height)
    camera.fov = (2 * Math.atan(Math.tan(((hfov * Math.PI) / 180) / 2) / aspect) * 180) / Math.PI
    camera.near = vp.near ?? 0.3
    camera.updateProjectionMatrix()
    if (controls) controls.target.copy(target)
  }

  useFrame(() => {
    const s = useViewFromStore.getState()
    if (s.looking && s.viewpoint && !s.capturing) aim(s.bearing, s.pitch, s.hfov)
  })

  // 360° strip: eight 45° shots from north, clockwise, stitched side by side.
  useEffect(() => {
    if (!v.captureReq) return
    const s = useViewFromStore.getState()
    const vp = s.viewpoint
    if (!vp) return
    s.set({ capturing: true })
    const wasLooking = s.looking
    if (!wasLooking && !saved.current) saved.current = { pos: camera.position.clone(), target: controls?.target.clone() ?? new THREE.Vector3(), fov: camera.fov, near: camera.near }
    if (controls) controls.enabled = false
    if (marker.current) marker.current.visible = false
    const hadHidden = hidden.current.length > 0
    hideOverlays()
    const n = 8, slot = 480
    const aspect = gl.domElement.width / Math.max(1, gl.domElement.height)
    const sh = Math.round(slot / aspect)
    const strip = document.createElement('canvas')
    strip.width = slot * n; strip.height = sh + 64
    const g = strip.getContext('2d')!
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, strip.width, strip.height)
    for (let k = 0; k < n; k++) {
      aim(k * 45 + 22.5, 0, 45)
      gl.render(scene, camera)
      g.drawImage(gl.domElement, k * slot, 22, slot, sh)
      g.fillStyle = '#1f2328'; g.font = '600 14px Inter, system-ui, sans-serif'; g.textAlign = 'center'
      g.fillText(['N–NE', 'NE–E', 'E–SE', 'SE–S', 'S–SW', 'SW–W', 'W–NW', 'NW–N'][k], k * slot + slot / 2, 16)
    }
    g.textAlign = 'left'; g.font = '12px Inter, system-ui, sans-serif'; g.fillStyle = '#3d434b'
    g.fillText(`360° from ${vp.label} · eye ${eyeZ(vp, s.eye).toFixed(1)} m geodetic (CGVD28) · ${vp.basis}`, 8, sh + 40)
    g.fillText(`${data ? buildingsNote(data) : ''}${removed.size ? ` ${removed.size} existing footprint${removed.size === 1 ? '' : 's'} under the design hidden (hypothetical removal, team assumption).` : ''} Terrain: City LiDAR 1 m where available; MRDEM 30 m, 60 m fallback. Eight 45° frames, not a cylindrical panorama.`, 8, sh + 58)
    const st = useStore.getState()
    st.addShot({ id: `view360-${Date.now().toString(36)}`, dataUrl: strip.toDataURL('image/jpeg', 0.9), stage: st.phase, representation: 'clay', project: 'city', at: new Date().toISOString() })
    st.set({ announce: `360° view from ${vp.label} added to the filmstrip` })
    if (wasLooking) aim(s.bearing, s.pitch, s.hfov)
    else if (saved.current) {
      const sv = saved.current; saved.current = null
      camera.position.copy(sv.pos); camera.fov = sv.fov; camera.near = sv.near; camera.updateProjectionMatrix()
      if (controls) { controls.target.copy(sv.target); controls.enabled = true; controls.update() }
    }
    if (marker.current) marker.current.visible = true
    if (!hadHidden && !wasLooking) showOverlays()
    s.set({ capturing: false })
  }, [v.captureReq]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!v.viewpoint || v.looking) return null
  const vp = v.viewpoint
  const z = eyeZ(vp, v.eye)
  return (
    <group ref={marker}>
      <mesh position={[vp.x, vp.y, z]}><sphereGeometry args={[6, 16, 16]} /><meshBasicMaterial color="#d97706" /></mesh>
      <mesh position={[vp.x, vp.y, z / 2]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[1.2, 1.2, z, 8]} /><meshBasicMaterial color="#d97706" transparent opacity={0.6} /></mesh>
      <Label text={`Viewpoint · eye ${z.toFixed(1)} m`} position={[vp.x, vp.y, z + 30]} size={0.015} color="#ffffff" background="rgba(173,80,9,0.92)" bold />
    </group>
  )
}
