import { BufferAttribute, BufferGeometry, Float32BufferAttribute, Mesh, MeshBasicMaterial, Raycaster, Vector3, type Intersection } from 'three'
import { describe, expect, it } from 'vitest'
import { attachBvh, buildBvhJob } from './bvhJob'
import { BVH_MIN_TRIANGLES, ensureIndex, eventsWithoutWheel, installFastRaycast, triangleCount } from './fastRaycast'

// A rough "city": many small boxes on a 2 km grid, as one merged non-indexed geometry.
function city(n = 1500, seed = 7): BufferGeometry {
  let s = seed
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647)
  const pos: number[] = []
  const quad = (a: number[], b: number[], c: number[], d: number[]) => pos.push(...a, ...b, ...c, ...a, ...c, ...d)
  for (let i = 0; i < n; i++) {
    const x = rnd() * 2000 - 1000, z = rnd() * 2000 - 1000, w = 5 + rnd() * 25, h = 5 + rnd() * 150
    const p = [[x, 0, z], [x + w, 0, z], [x + w, 0, z + w], [x, 0, z + w]]
    const q = p.map(([a, , c]) => [a, h, c])
    quad(q[0], q[1], q[2], q[3])
    for (let k = 0; k < 4; k++) quad(p[k], p[(k + 1) % 4], q[(k + 1) % 4], q[k])
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(pos, 3))
  return g
}

const plain = Mesh.prototype.raycast // three's own test, kept before installFastRaycast() replaces it
const rays = Array.from({ length: 40 }, (_, i) => new Raycaster(new Vector3(-900 + i * 45, 400, -1200), new Vector3(0.1, -0.3, 1).normalize()))
const nearest = (mesh: Mesh, r: Raycaster, cast: Mesh['raycast']) => {
  const hits: Intersection[] = []
  cast.call(mesh, r, hits)
  hits.sort((a, b) => a.distance - b.distance)
  return hits[0] ? { d: hits[0].distance, face: hits[0].faceIndex } : null
}
const expectSame = (mesh: Mesh) => {
  const brute = rays.map((r) => nearest(mesh, r, plain))
  const fast = rays.map((r) => nearest(mesh, r, mesh.raycast))
  expect(fast.filter(Boolean).length).toBeGreaterThan(5)
  fast.forEach((h, i) => { if (!brute[i]) expect(h).toBeNull(); else { expect(h?.d).toBeCloseTo(brute[i]!.d, 4); expect(h?.face).toBe(brute[i]!.face) } })
}
/** Hides every other box the way the city mesh hides buildings under the design: rewrite the draw index, shorten the draw range. */
function hideEveryOther(g: BufferGeometry) {
  const n = g.getAttribute('position').count
  const index = g.index ?? new BufferAttribute(new Uint32Array(n), 1)
  if (!g.index) g.setIndex(index)
  const out = index.array as Uint32Array
  let k = 0
  for (let box = 0; box * 30 < n; box++) if (box % 2 === 0) for (let v = 0; v < 30; v++) out[k++] = box * 30 + v
  g.setDrawRange(0, k)
  index.needsUpdate = true
}

describe('fast pointer picking', () => {
  it('finds the same nearest hit as three.js brute force', () => {
    const g = city()
    expect(triangleCount(g)).toBeGreaterThan(BVH_MIN_TRIANGLES)
    installFastRaycast()
    expectSame(new Mesh(g, new MeshBasicMaterial()))
  })

  it('never picks a building hidden by rewriting the draw index (stale index is rebuilt)', () => {
    const g = city()
    const mesh = new Mesh(g, new MeshBasicMaterial())
    installFastRaycast()
    expectSame(mesh) // builds the index for all boxes
    hideEveryOther(g)
    expectSame(mesh) // same hits as three's own test, which follows the draw range
  })

  it("leaves the geometry's own triangle index in its order", () => {
    const g = city(800)
    hideEveryOther(g)
    const before = (g.index!.array as Uint32Array).slice()
    expect(ensureIndex(g)).toBe(true)
    expect(g.index!.array).toEqual(before)
  })

  it('a worker-built index (copied arrays) attached to the real geometry gives the same hits', () => {
    const g = city()
    hideEveryOther(g)
    const pos = g.getAttribute('position') as Float32BufferAttribute
    const reply = buildBvhJob({ id: 1, position: (pos.array as Float32Array).slice(), itemSize: 3, normalized: false, index: (g.index!.array as Uint32Array).slice(), start: g.drawRange.start, count: g.drawRange.count })
    if ('error' in reply) throw new Error(reply.error)
    const mesh = new Mesh(g, new MeshBasicMaterial())
    const bvh = attachBvh(g, reply)
    // The attached index on its own (mesh.raycast would rebuild it here, since it was not stamped by fastRaycast).
    const viaIndex = rays.map((r) => { const h = bvh.raycastFirst(r.ray, mesh.material as MeshBasicMaterial); return h ? { d: h.distance, face: h.faceIndex } : null })
    const brute = rays.map((r) => nearest(mesh, r, plain))
    expect(viaIndex.filter(Boolean).length).toBeGreaterThan(5)
    viaIndex.forEach((h, i) => { if (!brute[i]) expect(h).toBeNull(); else { expect(h?.d).toBeCloseTo(brute[i]!.d, 4); expect(h?.face).toBe(brute[i]!.face) } })
  })

  it('rebuilds the index after an in-place edit of the positions', () => {
    const g = city(800)
    expect(ensureIndex(g)).toBe(true)
    const first = (g as unknown as { boundsTree: unknown }).boundsTree
    const pos = g.getAttribute('position') as Float32BufferAttribute
    pos.setY(0, pos.getY(0) + 10); pos.needsUpdate = true
    ensureIndex(g)
    expect((g as unknown as { boundsTree: unknown }).boundsTree).not.toBe(first)
  })

  it('leaves small geometry (a tower block) without an index', () => {
    const g = city(10)
    expect(ensureIndex(g)).toBe(false)
  })

  it('drops only the wheel handler from the 3D pointer events', () => {
    const fakeStore = { getState: () => ({}), setState: () => {}, subscribe: () => () => {} } as unknown as Parameters<typeof eventsWithoutWheel>[0]
    const handlers = eventsWithoutWheel(fakeStore).handlers ?? {}
    expect('onWheel' in handlers).toBe(false)
    expect('onPointerDown' in handlers && 'onPointerMove' in handlers && 'onClick' in handlers).toBe(true)
  })
})
