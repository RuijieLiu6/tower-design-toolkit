// The tower's façade as built (17 Nov 2026, Sinnie: "when I get to facade tool, I want to actually see the changes apply to
// the 3d model ... a view mode ... where you see the facade and exterior with materials"). The View › Façade mode draws,
// over the solid tower, each floor's faces in the zone the Façade zones tool gives them (engine/sw/plate.ts zoneFor):
// the vision glass band at its window-to-wall ratio, the spandrels, mullions every 1.5 m, and the zone's device at its
// depth (fins, overhang, light shelf, louvres, egg-crate, balcony with a glass rail, a second skin, a wind screen), with
// PV or planting in the spandrel where the strategy says so, and punched windows in a solid wall. Illustrative
// materials, not a render: one instanced mesh per material, rebuilt only when the tower or its zones change.
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import type { Tower } from '../engine/types'
import { band, swFloors, zoneFor, zonesOf, type FacadeZone } from '../engine/sw/plate'
import { useStore } from '../store'

type Mat = 'glass' | 'spandrel' | 'mullion' | 'device' | 'wall' | 'slab' | 'pv' | 'green' | 'rail'
const MATS: Record<Mat, () => THREE.Material> = {
  glass: () => new THREE.MeshStandardMaterial({ color: '#6f9ab8', metalness: 0.35, roughness: 0.12, transparent: true, opacity: 0.88 }),
  spandrel: () => new THREE.MeshStandardMaterial({ color: '#9aa3ab', metalness: 0.4, roughness: 0.45 }),
  mullion: () => new THREE.MeshStandardMaterial({ color: '#3d4247', metalness: 0.5, roughness: 0.4 }),
  device: () => new THREE.MeshStandardMaterial({ color: '#d9d6cf', metalness: 0.25, roughness: 0.5 }),
  wall: () => new THREE.MeshStandardMaterial({ color: '#cfc8bd', roughness: 0.85 }),
  slab: () => new THREE.MeshStandardMaterial({ color: '#e9e6e0', roughness: 0.8 }),
  pv: () => new THREE.MeshStandardMaterial({ color: '#1f2f4a', metalness: 0.5, roughness: 0.25 }),
  green: () => new THREE.MeshStandardMaterial({ color: '#4f8a4a', roughness: 0.95 }),
  rail: () => new THREE.MeshStandardMaterial({ color: '#a9c4d6', metalness: 0.2, roughness: 0.1, transparent: true, opacity: 0.45 }),
}
/** A box: centre (x, y, z), size along the face (a), out of it (b) and up (c), turned by `ang` about z. */
type Box = [number, number, number, number, number, number, number]
const MULLION = 1.5

/** The façade of one floor face in its zone, as boxes per material (tower-local metres, z from the tower's base). */
export function faceBoxes(z: FacadeZone, f: { z: number; h: number }, e: { L: number; mx: number; my: number; ux: number; uy: number; ox: number; oy: number }, out: Record<Mat, Box[]>) {
  const ang = Math.atan2(e.uy, e.ux)
  const at = (s: number, o: number) => [e.mx + e.ux * s + e.ox * o, e.my + e.uy * s + e.oy * o] as const
  const put = (m: Mat, s: number, o: number, zc: number, a: number, b: number, c: number) => { const [x, y] = at(s, o); out[m].push([x, y, zc, a, b, c, ang]) }
  const { gh, head } = band({ h: f.h } as never, z)
  const sill = Math.max(0, head - gh), L = e.L, d = Math.max(0.25, z.depth || 0)
  const n = Math.max(1, Math.round(L / MULLION)), step = L / n
  const spMat: Mat = z.strat === 'pvspandrel' ? 'pv' : z.strat === 'greenwall' ? 'green' : 'spandrel'
  if (z.strat === 'punched') {
    // A solid wall with one window per bay: the bay's share of glass so the wall keeps the zone's ratio.
    put('wall', 0, 0.06, f.z + f.h / 2, L, 0.1, f.h)
    const ww = Math.max(0.6, Math.min(step - 0.4, (z.wwr * step * f.h) / Math.max(0.5, gh)))
    for (let i = 0; i < n; i++) put('glass', -L / 2 + (i + 0.5) * step, 0.12, f.z + sill + gh / 2, ww, 0.04, gh)
    return
  }
  // Curtain-wall family: spandrel under and over the vision band, the glass, the mullions.
  if (sill > 0.02) put(spMat, 0, 0.05, f.z + sill / 2, L, 0.08, sill)
  if (f.h - head > 0.02) put(spMat, 0, 0.05, f.z + head + (f.h - head) / 2, L, 0.08, f.h - head)
  put('glass', 0, 0.06, f.z + sill + gh / 2, L, 0.04, gh)
  for (let i = 0; i <= n; i++) put('mullion', -L / 2 + i * step, 0.12, f.z + f.h / 2, 0.07, 0.16, f.h)
  put('mullion', 0, 0.1, f.z + 0.03, L, 0.14, 0.06) // the slab edge
  switch (z.strat) {
    case 'fins': for (let i = 0; i <= n; i++) put('device', -L / 2 + i * step, d / 2 + 0.12, f.z + f.h / 2, 0.08, d, f.h); break
    case 'overhang': put('device', 0, d / 2 + 0.1, f.z + head + 0.06, L, d, 0.12); break
    case 'lightshelf': put('device', 0, d / 2 + 0.1, f.z + sill + gh * 0.65, L, d, 0.06); break
    case 'louvres': { const k = Math.max(3, Math.round(gh / 0.35)); for (let i = 0; i < k; i++) put('device', 0, d / 2 + 0.1, f.z + sill + ((i + 0.5) * gh) / k, L, d, 0.04) } break
    case 'eggcrate': {
      for (let i = 0; i <= n; i++) put('device', -L / 2 + i * step, d / 2 + 0.12, f.z + f.h / 2, 0.06, d, f.h)
      const k = Math.max(2, Math.round(f.h / 1.2)); for (let i = 1; i <= k; i++) put('device', 0, d / 2 + 0.1, f.z + (i * f.h) / k - 0.03, L, d, 0.06)
    } break
    case 'balcony': { const bd = Math.max(1.2, d); put('slab', 0, bd / 2 + 0.1, f.z + 0.1, L, bd, 0.2); put('rail', 0, bd + 0.08, f.z + 0.2 + 0.55, L, 0.03, 1.1) } break
    case 'doubleskin': put('rail', 0, Math.max(0.6, d) + 0.1, f.z + f.h / 2, L, 0.03, f.h); break
    case 'windscreen': put('rail', 0, Math.max(0.4, d) + 0.1, f.z + 1.0, L, 0.03, 2.0); break
    default: break
  }
}

function useInstanced(boxes: Box[], mat: THREE.Material) {
  return useMemo(() => {
    if (!boxes.length) return null
    const g = new THREE.BoxGeometry(1, 1, 1)
    const m = new THREE.InstancedMesh(g, mat, boxes.length)
    const o = new THREE.Object3D()
    boxes.forEach(([x, y, z, a, b, c, ang], i) => { o.position.set(x, y, z); o.rotation.set(0, 0, ang); o.scale.set(a, b, c); o.updateMatrix(); m.setMatrixAt(i, o.matrix) })
    m.instanceMatrix.needsUpdate = true
    m.castShadow = true; m.receiveShadow = true
    return m
  }, [boxes, mat])
}

function Part({ boxes, mat }: { boxes: Box[]; mat: THREE.Material }) {
  const mesh = useInstanced(boxes, mat)
  useEffect(() => () => { mesh?.geometry.dispose(); mesh?.dispose() }, [mesh])
  return mesh ? <primitive object={mesh} /> : null
}

/** The façade of one tower, in the same frame as the tower body (Viewport TowerMesh). */
export default function FacadeSkin({ t, baseZ, north }: { t: Tower; baseZ: number; north: number }) {
  const selectTower = useStore((s) => s.selectTower)
  const mats = useMemo(() => Object.fromEntries((Object.keys(MATS) as Mat[]).map((k) => [k, MATS[k]()])) as Record<Mat, THREE.Material>, [])
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats])
  const parts = useMemo(() => {
    const out = Object.fromEntries((Object.keys(MATS) as Mat[]).map((k) => [k, [] as Box[]])) as Record<Mat, Box[]>
    let floors: ReturnType<typeof swFloors> = []
    try { floors = swFloors(t, north, 4) } catch { return out }
    const zones = zonesOf(t)
    for (const f of floors) for (const e of f.edges) faceBoxes(zoneFor(zones, e.o, f.level), f, e, out)
    return out
  }, [t, north])
  return (
    <group position={[t.x, t.y, baseZ]} rotation={[0, 0, (t.rotation * Math.PI) / 180]} data-facade-skin onPointerDown={(e) => { e.stopPropagation(); selectTower(t.id) }}>
      {(Object.keys(parts) as Mat[]).map((k) => <Part key={k} boxes={parts[k]} mat={mats[k]} />)}
    </group>
  )
}
