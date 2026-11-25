// Board-style presentation render of the 3D scene (lib/presentRender.ts): one synchronous pass that swaps every visible
// mesh's material for the line-drawing style, adds hairline edges, renders from the requested camera at print size,
// renders a label mask of the design towers and the figures for their ink outline, composites, and puts everything back
// before the next frame. Mounted inside the Canvas next to HiResCapture; nothing changes on screen.
import { useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { isOverlay } from './HiResCapture'
import { BOARD, CLAY, closeMask, outlineAlpha, setGroundProbe, setPresentRenderer, tint, type RenderPass, type RenderRequest, type RenderResult } from '../lib/presentRender'
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
      const ground = style.peopleZ ?? (scene.userData.presentGround as number | undefined) ?? 0
      for (const [i, [x, y]] of (style.people ?? []).entries()) {
        const f = new THREE.Mesh(figureGeometry())
        const s = i % 5 === 3 ? 0.66 : 0.92 + ((i * 37) % 10) / 100
        f.scale.setScalar(s); f.position.copy(toThree(x, y, ground)); f.rotation.y = (i * 1.7) % Math.PI
        figs.add(f); items.push({ mesh: f, kind: 'figure' })
      }
      scene.add(figs)
      const passes: RenderPass[] = style.passes?.length ? style.passes : ['line']
      // ---- state to restore
      const mats = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>()
      const shadowFlags = new Map<THREE.Mesh, [boolean, boolean]>()
      const colourSwap = new Map<THREE.BufferGeometry, THREE.BufferAttribute>()
      const added: THREE.Object3D[] = []
      const fog = scene.fog, bg = scene.background
      const prevRatio = gl.getPixelRatio(), prevSize = gl.getSize(new THREE.Vector2()), prevClear = gl.getClearColor(new THREE.Color()), prevAlpha = gl.getClearAlpha()
      const prevShadow = gl.shadowMap.enabled, prevShadowType = gl.shadowMap.type, prevShadowAuto = gl.shadowMap.autoUpdate, prevTarget = gl.getRenderTarget(), prevTone = gl.toneMapping
      const lineLights = [new THREE.AmbientLight(0xffffff, 2.35), new THREE.DirectionalLight(0xffffff, 0.8)]
      lineLights[1].position.set(-0.55, 1, 0.75).multiplyScalar(1000) // from the south-west and above (three: +z is model south)
      const inScene: THREE.Object3D[] = []
      const disposables: { dispose: () => void }[] = []
      let towerPixels = 0
      const layers: Partial<Record<RenderPass, string>> = {}
      const distance = pos.distanceTo(tgt)
      const depthFar = style.depthFar ?? distance * 3
      const clipOf = (o: THREE.Material | THREE.Material[]) => (Array.isArray(o) ? null : (o as THREE.Material & { clippingPlanes?: THREE.Plane[] | null })?.clippingPlanes ?? null)
      const light = (on: THREE.Object3D[]) => { for (const o of inScene) scene.remove(o); inScene.length = 0; for (const o of on) { scene.add(o); inScene.push(o) } }
      const toCanvas = () => {
        const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H
        const c2 = canvas.getContext('2d')!
        c2.drawImage(gl.domElement, 0, 0, W, H)
        return { canvas, c2 }
      }
      const drawTo = (clear: string | null) => {
        gl.setRenderTarget(null)
        gl.setClearColor(clear ?? '#ffffff', clear ? 1 : 0)
        gl.clear()
        gl.render(scene, cam)
        return toCanvas()
      }
      try {
        for (const o of hidden) o.visible = false
        scene.fog = null; scene.background = null
        gl.shadowMap.enabled = false
        gl.toneMapping = THREE.NoToneMapping
        gl.setPixelRatio(1); gl.setSize(W, H, false)
        for (const { mesh } of items) mats.set(mesh, mesh.material)
        const bgc = style.background === 'transparent' ? null : style.background === 'paper' ? BOARD.paper : '#ffffff'

        // ---- the label mask (towers red, figures green, everything else depth only): outlines, the tower mask, the count
        const maskT = new THREE.MeshBasicMaterial({ color: '#ff0000', side: THREE.DoubleSide }), maskF = new THREE.MeshBasicMaterial({ color: '#00ff00', side: THREE.DoubleSide }), depthOnly = new THREE.MeshBasicMaterial({ color: '#000000', side: THREE.DoubleSide })
        const maskG = new THREE.MeshBasicMaterial({ color: '#0000ff', side: THREE.DoubleSide })
        disposables.push(maskT, maskF, depthOnly, maskG)
        for (const { mesh, kind } of items) {
          const clip = clipOf(mats.get(mesh)!)
          const base = kind === 'tower' ? maskT : kind === 'figure' ? maskF : kind === 'ground' ? maskG : depthOnly
          const m = clip?.length ? base.clone() : base
          if (m !== base) { m.clippingPlanes = clip; disposables.push(m) }
          mesh.material = m
        }
        // A 24-bit depth buffer: the default 16 bits cannot tell a building 50 m in front of the tower from the tower at 5 km.
        const rt = new THREE.WebGLRenderTarget(W, H, { depthBuffer: true, depthTexture: new THREE.DepthTexture(W, H, THREE.UnsignedIntType) }); disposables.push(rt)
        gl.setRenderTarget(rt); gl.setClearColor('#000000', 0); gl.clear(); gl.render(scene, cam)
        const px = new Uint8Array(W * H * 4)
        gl.readRenderTargetPixels(rt, 0, 0, W, H, px)
        gl.setRenderTarget(null)
        const mask = new Uint8Array(W * H), sky = new Uint8Array(W * H), grnd = new Uint8Array(W * H)
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          const i = ((H - 1 - y) * W + x) * 4 // the target is read bottom-up
          const v = px[i] > 127 ? 1 : px[i + 1] > 127 ? 2 : 0
          mask[y * W + x] = v
          if (v === 1) towerPixels++
          if (px[i + 3] === 0) sky[y * W + x] = 1
          else if (px[i + 2] > 127) grnd[y * W + x] = 1
        }
        // The skyline of the ground (terrain: the mountains, the shore) against the sky, drawn as a grey line: the line
        // drawing has no edges on the terrain's surface, so without it the North Shore would not show at all.
        const ridgeMask = new Uint8Array(W * H)
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          const i = y * W + x
          if (!grnd[i]) continue
          if ((y > 0 && sky[i - W]) || (x > 0 && sky[i - 1]) || (x < W - 1 && sky[i + 1])) ridgeMask[i] = 1
        }
        const outline = style.outline ?? 4
        const closed = closeMask(mask, W, H, 1, Math.max(2, Math.round(outline / 2)))
        let ink: Uint8Array | null = null, ridge: Uint8Array | null = null
        const over = (c2: CanvasRenderingContext2D, alpha: Uint8Array, [ir, ig, ib]: number[]) => {
          const img = c2.getImageData(0, 0, W, H), d = img.data
          for (let i = 0; i < W * H; i++) {
            const a = alpha[i] / 255
            if (!a) continue
            const j = i * 4, da = d[j + 3] / 255, oa = a + da * (1 - a)
            d[j] = Math.round((ir * a + d[j] * da * (1 - a)) / oa); d[j + 1] = Math.round((ig * a + d[j + 1] * da * (1 - a)) / oa); d[j + 2] = Math.round((ib * a + d[j + 2] * da * (1 - a)) / oa); d[j + 3] = Math.round(oa * 255)
          }
          c2.putImageData(img, 0, 0)
        }
        const inkOver = (c2: CanvasRenderingContext2D) => {
          ridge ??= outlineAlpha(ridgeMask, W, H, { 1: Math.max(0.5, outline / 4) })
          over(c2, ridge, [0x9a, 0xa4, 0xb1])
          ink ??= outlineAlpha(closed, W, H, { 1: outline, 2: Math.max(1, outline / 3) })
          over(c2, ink, [0x20, 0x26, 0x30])
        }
        // ---- the line drawing (line: on the chosen background; edges: the lines alone on transparent)
        const fill = { tower: '#ffffff', context: '#f3f5f8', ground: '#ffffff', figure: '#ffffff' }
        const line = { tower: BOARD.edge, context: '#b4bcc7', ground: BOARD.line, figure: null }
        const lineMats = (edgesOnly: boolean) => {
          for (const { mesh, kind } of items) {
            const clip = clipOf(mats.get(mesh)!)
            const colours = kind === 'tower' && style.highlight && Object.keys(style.highlight).length ? (colourSwap.get(mesh.geometry) ?? mesh.geometry.getAttribute('color') as THREE.BufferAttribute | undefined) : undefined
            if (colours && !colourSwap.has(mesh.geometry)) { colourSwap.set(mesh.geometry, colours); mesh.geometry.setAttribute('color', highlightColours(colours, style.highlight!)) }
            const m = kind === 'ground'
              ? new THREE.MeshBasicMaterial({ color: fill.ground, clippingPlanes: clip, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2 })
              : new THREE.MeshLambertMaterial({ color: colours ? '#ffffff' : fill[kind], vertexColors: !!colours, side: THREE.DoubleSide, clippingPlanes: clip, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 })
            // Edges only: the fills still hide what is behind them (depth) but leave the colour as it is (a blend that keeps the target).
            if (edgesOnly && kind !== 'figure') Object.assign(m, { blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.ZeroFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor })
            disposables.push(m)
            mesh.material = m
          }
          if (!added.length) {
            for (const { mesh, kind } of items) {
              const lc = line[kind]
              const e = lc ? edgesOf(mesh.geometry, kind !== 'ground') : null
              if (!e || !lc) continue
              const lm = new THREE.LineBasicMaterial({ color: lc, clippingPlanes: clipOf(mats.get(mesh)!) }); disposables.push(lm)
              const ls = new THREE.LineSegments(e, lm); ls.raycast = () => {}
              // Lines after every fill: in the edges pass a fill drawn later could not cover a line already drawn behind it.
              ls.renderOrder = 1e6
              mesh.add(ls); added.push(ls)
            }
          }
          for (const o of added) o.visible = true
          light(lineLights)
        }

        // ---- the clay render
        const shadedMats = () => {
          for (const o of added) o.visible = false
          const water = new THREE.Color(CLAY.water)
          const make = (kind: Kind, clip: THREE.Plane[] | null) => {
            const m = new THREE.MeshLambertMaterial({ color: CLAY[kind === 'figure' ? 'tower' : kind], side: kind === 'ground' ? THREE.FrontSide : THREE.DoubleSide, clippingPlanes: clip, polygonOffset: kind === 'ground', polygonOffsetFactor: 2, polygonOffsetUnits: 2 })
            if (kind === 'ground') {
              // Water: wherever the drawn surface lies at the sea (0 m CGVD28 and below), a flat pale colour, unlit.
              m.onBeforeCompile = (sh) => {
                sh.uniforms.uWater = { value: water }
                sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vWZ;').replace('#include <project_vertex>', '#include <project_vertex>\nvWZ = (modelMatrix * vec4(transformed, 1.0)).y;')
                sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vWZ;\nuniform vec3 uWater;').replace('#include <fog_fragment>', 'if (vWZ < 0.35) gl_FragColor.rgb = uWater;\n#include <fog_fragment>')
              }
              m.customProgramCacheKey = () => 'present-clay-ground'
            }
            disposables.push(m)
            return m
          }
          for (const { mesh, kind } of items) {
            mesh.material = make(kind, clipOf(mats.get(mesh)!))
            if (!shadowFlags.has(mesh)) shadowFlags.set(mesh, [mesh.castShadow, mesh.receiveShadow])
            mesh.castShadow = kind !== 'ground'
            mesh.receiveShadow = true
          }
          const sunV = style.sun ?? [-0.55, -0.75, 0.6]
          const at = style.shadowAt ?? shot.target, r = style.shadowRadius ?? 1200
          const sun = new THREE.DirectionalLight(0xffffff, 2.4)
          const c = toThree(...at), dir = toThree(...sunV).normalize()
          sun.position.copy(c).addScaledVector(dir, 4000); sun.target.position.copy(c)
          sun.castShadow = true
          const maxTex = ctx.getParameter(ctx.MAX_TEXTURE_SIZE) as number
          const size = Math.min(8192, maxTex)
          sun.shadow.mapSize.set(size, size)
          const sc = sun.shadow.camera
          sc.left = -r; sc.right = r; sc.top = r; sc.bottom = -r; sc.near = 10; sc.far = 9000; sc.updateProjectionMatrix()
          sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.6; sun.shadow.radius = 2
          const hemi = new THREE.HemisphereLight(CLAY.sky, CLAY.bounce, 2.5)
          light([sun, sun.target, hemi])
          disposables.push({ dispose: () => sun.shadow.map?.dispose() })
          gl.shadowMap.enabled = true; gl.shadowMap.type = THREE.PCFSoftShadowMap; gl.shadowMap.autoUpdate = true; gl.shadowMap.needsUpdate = true
          if (style.haze) {
            const f = new THREE.Fog(style.haze.color ?? BOARD.paper, style.haze.near, style.haze.far)
            scene.fog = f
          }
        }
        const unshade = () => { scene.fog = null; gl.shadowMap.enabled = false; for (const [mesh, [c, r]] of shadowFlags) { mesh.castShadow = c; mesh.receiveShadow = r } }

        // ---- depth: distance from the eye, white near, black at depthFar
        const depthMats = () => {
          for (const o of added) o.visible = false
          light([])
          const dm = new THREE.ShaderMaterial({
            uniforms: { uFar: { value: depthFar } }, side: THREE.DoubleSide,
            vertexShader: 'varying float vD; void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vD = length(mv.xyz); gl_Position = projectionMatrix * mv; }',
            fragmentShader: 'uniform float uFar; varying float vD; void main() { float g = 1.0 - clamp(vD / uFar, 0.0, 1.0); gl_FragColor = vec4(vec3(g), 1.0); }',
          })
          disposables.push(dm)
          for (const { mesh } of items) mesh.material = dm
        }

        for (const pass of passes) {
          if (pass === 'mask') {
            const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H
            const c2 = canvas.getContext('2d')!, img = c2.createImageData(W, H)
            for (let i = 0; i < W * H; i++) { const v = closed[i] === 1 ? 255 : 0; img.data[i * 4] = v; img.data[i * 4 + 1] = v; img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255 }
            c2.putImageData(img, 0, 0)
            layers.mask = canvas.toDataURL('image/png')
            continue
          }
          if (pass === 'line' || pass === 'edges') {
            lineMats(pass === 'edges')
            const { canvas, c2 } = drawTo(pass === 'edges' ? null : bgc)
            inkOver(c2)
            if (style.debugMask && pass === 'line') { const m = c2.createImageData(W, H); for (let i = 0; i < W * H; i++) { m.data[i * 4] = mask[i] === 1 ? 255 : 0; m.data[i * 4 + 1] = mask[i] === 2 ? 255 : 0; m.data[i * 4 + 3] = 255 } c2.putImageData(m, 0, 0) }
            layers[pass] = canvas.toDataURL('image/png')
          } else if (pass === 'shaded') {
            shadedMats()
            const { canvas } = drawTo(bgc)
            unshade()
            layers.shaded = canvas.toDataURL('image/png')
          } else if (pass === 'depth') {
            depthMats()
            const { canvas } = drawTo(null)
            layers.depth = canvas.toDataURL('image/png')
          }
        }
        return { dataUrl: layers[passes[0]]!, width: W, height: H, towerPixels, ms: Math.round(performance.now() - t0), layers, ...(passes.includes('depth') ? { depthFar } : {}) }
      } finally {
        for (const [mesh, m] of mats) mesh.material = m
        for (const [mesh, [c, r]] of shadowFlags) { mesh.castShadow = c; mesh.receiveShadow = r }
        for (const [g, a] of colourSwap) g.setAttribute('color', a)
        for (const o of added) o.parent?.remove(o)
        light([])
        scene.remove(figs)
        for (const o of hidden) o.visible = true
        for (const x of disposables) x.dispose()
        scene.fog = fog; scene.background = bg
        gl.shadowMap.enabled = prevShadow
        gl.shadowMap.type = prevShadowType
        gl.shadowMap.autoUpdate = prevShadowAuto
        gl.shadowMap.needsUpdate = true
        gl.toneMapping = prevTone
        gl.setRenderTarget(prevTarget)
        gl.setClearColor(prevClear, prevAlpha)
        gl.setPixelRatio(prevRatio); gl.setSize(prevSize.x, prevSize.y, false)
      }
    })
    const ray = new THREE.Raycaster()
    setGroundProbe((x, y) => {
      ray.set(toThree(x, y, 5000), new THREE.Vector3(0, -1, 0)); ray.far = 10000
      const under = (o: THREE.Object3D | null): boolean => { for (let p = o; p; p = p.parent) { if (p.userData.designTower != null || p.userData.presentContext || p.userData.siteOverlay || !p.visible) return true } return false }
      let best: number | null = null
      scene.traverseVisible((o) => {
        const m = o as THREE.Mesh
        if (!m.isMesh || (m as unknown as THREE.InstancedMesh).isInstancedMesh || isOverlay(m) || under(m)) return
        try { for (const h of ray.intersectObject(m, false)) if (best == null || h.point.y > best) best = h.point.y } catch { /* not raycastable */ }
      })
      return best
    }, () => {
      // The design towers' bounds in the model frame (an imported tower's mesh need not sit on its tower's x, y).
      const box = new THREE.Box3()
      scene.traverse((o) => { if (o.userData.designTower != null && o.visible) box.expandByObject(o) })
      if (box.isEmpty()) return null
      return { min: [box.min.x, -box.max.z, box.min.y], max: [box.max.x, -box.min.z, box.max.y] }
    })
    return () => { setPresentRenderer(null); setGroundProbe(null, null) }
  }, [gl, scene])
  return null
}
