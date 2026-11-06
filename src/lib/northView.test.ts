import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { northTheta, shortestTurn } from './northView'

/** Screen-up direction of true north for a camera at azimuth theta about the origin (tilted 50° down). */
function northOnScreen(theta: number, northDeg: number): number {
  const cam = new THREE.PerspectiveCamera(45, 1, 1, 10000)
  const r = 500
  cam.position.set(r * Math.sin(theta), 600, r * Math.cos(theta))
  cam.lookAt(0, 0, 0); cam.updateMatrixWorld(); cam.updateProjectionMatrix()
  const n = (northDeg * Math.PI) / 180
  const a = new THREE.Vector3(0, 0, 0).project(cam), b = new THREE.Vector3(100 * Math.sin(n), 0, -100 * Math.cos(n)).project(cam)
  return THREE.MathUtils.radToDeg(Math.atan2(b.x - a.x, b.y - a.y))
}

describe('face north', () => {
  it('puts true north straight up the screen (grid north and the VTC 45°)', () => {
    for (const north of [0, 45, -30, 180]) expect(Math.abs(northOnScreen(northTheta(north), north))).toBeLessThan(1e-6)
  })
  it('turns the short way round', () => {
    expect(shortestTurn(0, Math.PI / 2)).toBeCloseTo(Math.PI / 2)
    expect(shortestTurn(Math.PI * 0.9, -Math.PI * 0.9)).toBeCloseTo(Math.PI * 0.2)
    expect(shortestTurn(-Math.PI * 0.9, Math.PI * 0.9)).toBeCloseTo(-Math.PI * 0.2)
    expect(Math.abs(shortestTurn(1, 1 + 4 * Math.PI))).toBeLessThan(1e-9)
  })
})
