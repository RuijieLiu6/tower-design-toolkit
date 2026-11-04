import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { casterSignature, signatureChanged } from './shadowCache'

describe('shadow map cache', () => {
  const scene = () => {
    const s = new THREE.Scene()
    const light = new THREE.DirectionalLight(); light.castShadow = true; light.position.set(100, 200, 50); s.add(light, light.target)
    const tower = new THREE.Mesh(new THREE.BoxGeometry(30, 120, 30), new THREE.MeshStandardMaterial()); tower.castShadow = true; s.add(tower)
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(1000, 1000), new THREE.MeshStandardMaterial()); ground.receiveShadow = true; s.add(ground)
    s.updateMatrixWorld(true)
    return { s, light, tower, ground }
  }

  it('stays the same while only the camera moves, and changes with the sun or a caster', () => {
    const { s, light, tower, ground } = scene()
    const a = casterSignature(s)
    const cam = new THREE.PerspectiveCamera(); cam.position.set(5000, 2000, 0); s.add(cam); s.updateMatrixWorld(true)
    expect(signatureChanged(a, casterSignature(s))).toBe(false)
    ground.position.x = 50; s.updateMatrixWorld(true) // a receiver only: no new shadows
    expect(signatureChanged(a, casterSignature(s))).toBe(false)
    tower.position.x = 40; s.updateMatrixWorld(true)
    const b = casterSignature(s)
    expect(signatureChanged(a, b)).toBe(true)
    light.position.set(-100, 200, 50); s.updateMatrixWorld(true)
    expect(signatureChanged(b, casterSignature(s))).toBe(true)
  })

  it('notices hidden parts (a new draw index or range) and a caster that stops casting', () => {
    const { s, tower } = scene()
    const a = casterSignature(s)
    tower.geometry.setDrawRange(0, 12)
    const b = casterSignature(s)
    expect(signatureChanged(a, b)).toBe(true)
    tower.geometry.index!.needsUpdate = true
    expect(signatureChanged(b, casterSignature(s))).toBe(true)
    tower.castShadow = false
    expect(casterSignature(s).length).toBeLessThan(b.length)
    expect(signatureChanged(null, b)).toBe(true)
  })
})
