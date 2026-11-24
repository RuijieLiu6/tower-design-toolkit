// Board-style presentation render of the 3D scene (lib/presentRender.ts): one synchronous pass that swaps every visible
// mesh's material for the line-drawing style, adds hairline edges, renders from the requested camera at print size,
// renders a label mask of the design towers and the figures for their ink outline, composites, and puts everything back
// before the next frame. Mounted inside the Canvas next to HiResCapture; nothing changes on screen.
import { useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { isOverlay } from './HiResCapture'
import { BOARD, closeMask, outlineAlpha, setPresentRenderer, tint, type RenderRequest, type RenderResult } from '../lib/presentRender'
import { USES, type UseId } from '../engine/types'

const toThree = (x: number, y: number, z: number) => new THREE.Vector3(x, z, -y)
const edgeCache = new WeakMap<THREE.BufferGeometry, { count: number; edges: THREE.EdgesGeometry | null }>()
/**
 * Hairline edges of a mesh: creases over 30°; none for very large unbuilt surfaces (terrain, where every grid cell is a
 * crease). Only the drawn part of an indexed geometry counts: the city chunks draw the buildings kept on the site first
 * and stop (CityContext useHiddenParts), so the ones under the design get no edges either.
 */
function edgesOf(g: THREE.BufferGeometry, built: boolean): THREE.EdgesGeometry | null {
  const index = g.index
  const count = index ? Math.min(index.count, g.drawRange.count) : g.getAttribute('position')?.count ?? 0
  const hit = edgeCache.get(g)
  if (hit && hit.count === count) return hit.edges
  hit?.edges?.dispose()
  if (!g.boundingBox) g.computeBoundingBox()
  const b = g.boundingBox!
  const wide = Math.max(b.max.x - b.min.x, b.max.y - b.min.y) > 2500
  let edges: THREE.EdgesGeometry | null = null
  if (count > 0 && (built || !(wide && count > 20000))) {
    let src = g
    if (index && count < index.count) {
      src = new THREE.BufferGeometry()
      src.setAttribute('position', g.getAttribute('position'))
      src.setIndex(new THREE.BufferAttribute((index.array as Uint32Array).slice(g.drawRange.start, g.drawRange.start + count), 1))
    }
    edges = new THREE.EdgesGeometry(src, 30)
  }
  edgeCache.set(g, { count, edges })
  return edges
}

/** A scale figure, 1.75 m: legs, body and head (outlined in the mask pass, so it reads as a line figure). */
let figure: THREE.BufferGeometry | null = null
function figureGeometry(): THREE.BufferGeometry {
  if (figure) return figure
  const legL = new THREE.BoxGeometry(0.14, 0.86, 0.18).translate(-0.09, 0.43, 0)
  const legR = new THREE.BoxGeometry(0.14, 0.86, 0.18).translate(0.09, 0.43, 0)
  const body = new THREE.CylinderGeometry(0.2, 0.17, 0.62, 12).translate(0, 1.17, 0)
  const arms = new THREE.BoxGeometry(0.56, 0.5, 0.14).translate(0, 1.18, 0)
  const head = new THREE.SphereGeometry(0.12, 12, 8).translate(0, 1.63, 0)
  for (const g of [legL, legR, arms]) g.deleteAttribute('uv')
  for (const g of [body, head]) g.deleteAttribute('uv')
  figure = mergeGeometries([legL.toNonIndexed(), legR.toNonIndexed(), body.toNonIndexed(), arms.toNonIndexed(), head.toNonIndexed()])!
  return figure
}

const useColours = (() => {
  let map: { c: THREE.Color; use: UseId }[] | null = null
  return () => (map ??= (Object.keys(USES) as UseId[]).map((use) => ({ c: new THREE.Color(USES[use].color), use })))
})()
/** A copy of a tower's per-storey colours (ImportedMass slabs) with the highlighted uses in their tint and the rest white. */
function highlightColours(attr: THREE.BufferAttribute, hl: Partial<Record<UseId, string>>): THREE.BufferAttribute {
  const uses = useColours(), out = new Float32Array(attr.count * 3), white = new THREE.Color('#ffffff'), tmp = new THREE.Color()
  const tints = new Map(Object.entries(hl).map(([u, hex]) => [u, new THREE.Color(tint(hex as string, 0.55))]))
  for (let i = 0; i < attr.count; i++) {
    tmp.setRGB(attr.getX(i), attr.getY(i), attr.getZ(i))
    const hit = uses.find((u) => Math.abs(u.c.r - tmp.r) + Math.abs(u.c.g - tmp.g) + Math.abs(u.c.b - tmp.b) < 0.02)
    const c = (hit && tints.get(hit.use)) || white
    out[3 * i] = c.r; out[3 * i + 1] = c.g; out[3 * i + 2] = c.b
  }
  return new THREE.BufferAttribute(out, 3)
}

type Kind = 'tower' | 'context' | 'ground' | 'figure'

export default function PresentRender() {
  const { gl, scene } = useThree()
  useEffect(() => {
    setPresentRenderer((req: RenderRequest): RenderResult => {
      const t0 = performance.now()
      const { shot, style } = req
      const ctx = gl.getContext()
      const maxRb = ctx.getParameter(ctx.MAX_RENDERBUFFER_SIZE) as number
      const W = Math.min(req.width, maxRb), H = Math.min(req.height, maxRb)
      // ---- camera
      const pos = toThree(...shot.position), tgt = toThree(...shot.target)
      let cam: THREE.Camera
      if (shot.kind === 'axo') {
        const hh = shot.height / 2, hw = hh * (W / H)
        const c = new THREE.OrthographicCamera(-hw, hw, hh, -hh, 1, 8000)
        c.position.copy(pos); c.up.set(0, 1, 0); c.lookAt(tgt); c.updateProjectionMatrix(); cam = c
      } else {
        const d = pos.distanceTo(tgt)
        const c = new THREE.PerspectiveCamera(shot.fov, W / H, d > 1500 ? Math.max(2, d / 100) : 0.2, 60000)
        c.position.copy(pos); c.up.set(0, 1, 0); c.lookAt(tgt); c.updateProjectionMatrix(); cam = c
      }
      // ---- classify what is drawn (design towers by their TowerMover group, flat meshes as ground)
      const items: { mesh: THREE.Mesh; kind: Kind }[] = []
      const hidden: THREE.Object3D[] = []
      const walk = (o: THREE.Object3D, inTower: boolean) => {
        if (!o.visible) return
        const tower = inTower || o.userData.designTower != null
        if (o !== scene && (isOverlay(o) || o.userData.siteOverlay || (o as THREE.InstancedMesh).isInstancedMesh || (o as THREE.Light).isLight)) { hidden.push(o); return }
        const m = o as THREE.Mesh
        if (m.isMesh && m.geometry) {
          if (!m.geometry.boundingBox) m.geometry.computeBoundingBox()
          const b = m.geometry.boundingBox!
          const flat = !tower && (b.max.z - b.min.z < 0.6 && m.geometry.getAttribute('position').count < 200)
          // Ground: flat things (streets, sidewalks, the site) and very large surfaces (terrain, water, the plinth).
          const big = Math.max(b.max.x - b.min.x, b.max.y - b.min.y) > 2500
          const kind: Kind = tower ? 'tower' : o.userData.presentContext ? 'context' : flat || big || o.name === 'vtc-site' ? 'ground' : 'context'
          if (kind === 'context' && style.noContext) { hidden.push(o); return }
          items.push({ mesh: m, kind })
        }
        for (const ch of o.children) walk(ch, tower)
      }
      walk(scene, false)
      // ---- figures
      const figs = new THREE.Group()
      const ground = (scene.userData.presentGround as number | undefined) ?? 0
      for (const [i, [x, y]] of (style.people ?? []).entries()) {
        const f = new THREE.Mesh(figureGeometry())
        const s = i % 5 === 3 ? 0.66 : 0.92 + ((i * 37) % 10) / 100
        f.scale.setScalar(s); f.position.copy(toThree(x, y, ground)); f.rotation.y = (i * 1.7) % Math.PI
        figs.add(f); items.push({ mesh: f, kind: 'figure' })
      }
      scene.add(figs)
      // ---- state to restore
      const mats = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>()
      const colourSwap = new Map<THREE.BufferGeometry, THREE.BufferAttribute>()
      const added: THREE.Object3D[] = []
      const fog = scene.fog, bg = scene.background
      const prevRatio = gl.getPixelRatio(), prevSize = gl.getSize(new THREE.Vector2()), prevClear = gl.getClearColor(new THREE.Color()), prevAlpha = gl.getClearAlpha()
      const prevShadow = gl.shadowMap.enabled, prevTarget = gl.getRenderTarget(), prevTone = gl.toneMapping
      const lights = [new THREE.AmbientLight(0xffffff, 2.35), new THREE.DirectionalLight(0xffffff, 0.8)]
      lights[1].position.set(-0.55, 1, 0.75).multiplyScalar(1000) // from the south-west and above (three: +z is model south)
      const disposables: { dispose: () => void }[] = []
      let towerPixels = 0
      try {
        for (const o of hidden) o.visible = false
        scene.fog = null; scene.background = null
        gl.shadowMap.enabled = false
        gl.toneMapping = THREE.NoToneMapping
        for (const l of lights) scene.add(l)
        // ---- pass 1: the drawing
        const fill = { tower: '#ffffff', context: '#f3f5f8', ground: '#ffffff', figure: '#ffffff' }
        const line = { tower: BOARD.edge, context: '#b4bcc7', ground: BOARD.line, figure: null }
        for (const { mesh, kind } of items) {
          const orig = mesh.material as THREE.Material & { clippingPlanes?: THREE.Plane[] | null; side?: THREE.Side }
          mats.set(mesh, mesh.material)
          const clip = Array.isArray(orig) ? null : orig?.clippingPlanes ?? null
          const colours = kind === 'tower' && style.highlight && Object.keys(style.highlight).length ? mesh.geometry.getAttribute('color') as THREE.BufferAttribute | undefined : undefined
          if (colours && !colourSwap.has(mesh.geometry)) { colourSwap.set(mesh.geometry, colours); mesh.geometry.setAttribute('color', highlightColours(colours, style.highlight!)) }
          const m = kind === 'ground'
            ? new THREE.MeshBasicMaterial({ color: fill.ground, clippingPlanes: clip, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2 })
            : new THREE.MeshLambertMaterial({ color: colours ? '#ffffff' : fill[kind], vertexColors: !!colours, side: THREE.DoubleSide, clippingPlanes: clip, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 })
          disposables.push(m)
          mesh.material = m
          const lc = line[kind]
          const e = lc ? edgesOf(mesh.geometry, kind !== 'ground') : null
          if (e && lc) {
            const lm = new THREE.LineBasicMaterial({ color: lc, clippingPlanes: clip }); disposables.push(lm)
            const ls = new THREE.LineSegments(e, lm); ls.raycast = () => {}
            mesh.add(ls); added.push(ls)
          }
        }
        const bgc = style.background === 'transparent' ? null : style.background === 'paper' ? BOARD.paper : '#ffffff'
        gl.setPixelRatio(1); gl.setSize(W, H, false)
        gl.setRenderTarget(null)
        gl.setClearColor(bgc ?? '#ffffff', bgc ? 1 : 0)
        gl.render(scene, cam)
        const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H
        const c2 = canvas.getContext('2d')!
        c2.drawImage(gl.domElement, 0, 0, W, H)
        // ---- pass 2: the label mask (towers red, figures green, everything else depth only)
        const outline = style.outline ?? 4
        for (const o of added) o.visible = false
        const maskT = new THREE.MeshBasicMaterial({ color: '#ff0000' }), maskF = new THREE.MeshBasicMaterial({ color: '#00ff00' }), depth = new THREE.MeshBasicMaterial({ color: '#000000' })
        disposables.push(maskT, maskF, depth)
        for (const { mesh, kind } of items) {
          const cur = mesh.material as THREE.Material & { clippingPlanes?: THREE.Plane[] | null }
          const base = kind === 'tower' ? maskT : kind === 'figure' ? maskF : depth
          const m = cur.clippingPlanes?.length ? base.clone() : base
          if (m !== base) { m.clippingPlanes = cur.clippingPlanes ?? null; m.side = THREE.DoubleSide; disposables.push(m) }
          else base.side = THREE.DoubleSide
          mesh.material = m
        }
        // A 24-bit depth buffer: the default 16 bits cannot tell a building 50 m in front of the tower from the tower at 5 km.
        const rt = new THREE.WebGLRenderTarget(W, H, { depthBuffer: true, depthTexture: new THREE.DepthTexture(W, H, THREE.UnsignedIntType) }); disposables.push(rt)
        gl.setRenderTarget(rt); gl.setClearColor('#000000', 0); gl.clear(); gl.render(scene, cam)
        const px = new Uint8Array(W * H * 4)
        gl.readRenderTargetPixels(rt, 0, 0, W, H, px)
        gl.setRenderTarget(null)
        const mask = new Uint8Array(W * H)
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          const i = ((H - 1 - y) * W + x) * 4 // the target is read bottom-up
          const v = px[i] > 127 ? 1 : px[i + 1] > 127 ? 2 : 0
          mask[y * W + x] = v
          if (v === 1) towerPixels++
        }
        const ink = outlineAlpha(closeMask(mask, W, H, 1, Math.max(2, Math.round(outline / 2))), W, H, { 1: outline, 2: Math.max(1, outline / 3) })
        const img = c2.getImageData(0, 0, W, H), d = img.data
        const [ir, ig, ib] = [0x20, 0x26, 0x30]
        for (let i = 0; i < W * H; i++) {
          const a = ink[i] / 255
          if (!a) continue
          const j = i * 4, da = d[j + 3] / 255, oa = a + da * (1 - a)
          d[j] = Math.round((ir * a + d[j] * da * (1 - a)) / oa); d[j + 1] = Math.round((ig * a + d[j + 1] * da * (1 - a)) / oa); d[j + 2] = Math.round((ib * a + d[j + 2] * da * (1 - a)) / oa); d[j + 3] = Math.round(oa * 255)
        }
        c2.putImageData(img, 0, 0)
        if (style.debugMask) { const m = c2.createImageData(W, H); for (let i = 0; i < W * H; i++) { m.data[i * 4] = mask[i] === 1 ? 255 : 0; m.data[i * 4 + 1] = mask[i] === 2 ? 255 : 0; m.data[i * 4 + 3] = 255 } c2.putImageData(m, 0, 0) }
        return { dataUrl: canvas.toDataURL('image/png'), width: W, height: H, towerPixels, ms: Math.round(performance.now() - t0) }
      } finally {
        for (const [mesh, m] of mats) mesh.material = m
        for (const [g, a] of colourSwap) g.setAttribute('color', a)
        for (const o of added) o.parent?.remove(o)
        for (const l of lights) scene.remove(l)
        scene.remove(figs)
        for (const o of hidden) o.visible = true
        for (const x of disposables) x.dispose()
        scene.fog = fog; scene.background = bg
        gl.shadowMap.enabled = prevShadow
        gl.toneMapping = prevTone
        gl.setRenderTarget(prevTarget)
        gl.setClearColor(prevClear, prevAlpha)
        gl.setPixelRatio(prevRatio); gl.setSize(prevSize.x, prevSize.y, false)
      }
    })
    return () => setPresentRenderer(null)
  }, [gl, scene])
  return null
}
