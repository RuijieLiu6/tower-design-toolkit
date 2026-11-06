// Inside the canvas: runs the "face north" turn asked for by a click on a north arrow (lib/northView.ts) and turns the
// registered compass arrows so they point to true north on screen. The camera orbits its target at the same distance
// and tilt; grabbing the view stops the turn.
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { northTheta, northView, reducedMotion, shortestTurn } from '../lib/northView'

type Ctl = THREE.EventDispatcher & { target: THREE.Vector3; update: () => void }
const DUR = 700
const a3 = new THREE.Vector3(), b3 = new THREE.Vector3()

export default function NorthTurnRig() {
  const { camera, invalidate } = useThree()
  const controls = useThree((s) => s.controls) as unknown as Ctl | null
  const run = useRef<{ from: number; turn: number; start: number } | null>(null)

  useEffect(() => {
    northView.invalidate = invalidate
    return () => { northView.invalidate = null }
  }, [invalidate])

  useEffect(() => {
    const ctl = controls as unknown as { addEventListener?: (t: string, f: () => void) => void; removeEventListener?: (t: string, f: () => void) => void } | null
    const stop = () => { run.current = null; northView.want = null }
    ctl?.addEventListener?.('start', stop)
    return () => ctl?.removeEventListener?.('start', stop)
  }, [controls])

  useFrame(({ size }) => {
    const ctl = controls
    if (!ctl) return
    const setTheta = (theta: number) => {
      const off = camera.position.clone().sub(ctl.target)
      const r = Math.max(0.01, Math.hypot(off.x, off.z))
      camera.position.set(ctl.target.x + r * Math.sin(theta), camera.position.y, ctl.target.z + r * Math.cos(theta))
      ctl.update()
      invalidate()
    }
    if (northView.want != null) {
      const off = camera.position.clone().sub(ctl.target)
      const from = Math.atan2(off.x, off.z), turn = shortestTurn(from, northTheta(northView.want))
      northView.want = null
      if (reducedMotion() || Math.abs(turn) < 1e-3) { run.current = null; setTheta(from + turn) }
      else run.current = { from, turn, start: performance.now() }
    }
    if (run.current) {
      const x = Math.min(1, (performance.now() - run.current.start) / DUR), e = x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2
      setTheta(run.current.from + run.current.turn * e)
      if (x >= 1) run.current = null
    }
    // Compass arrows: the screen direction from the target to a point 100 m true north of it.
    if (northView.arrows.size) {
      const a = a3.copy(ctl.target).project(camera)
      for (const [el, north] of northView.arrows) {
        const n = (north * Math.PI) / 180
        const b = b3.copy(ctl.target).add(new THREE.Vector3(100 * Math.sin(n), 0, -100 * Math.cos(n))).project(camera)
        const deg = THREE.MathUtils.radToDeg(Math.atan2((b.x - a.x) * size.width, (b.y - a.y) * size.height))
        el.style.transform = `rotate(${deg.toFixed(1)}deg)`
      }
    }
  })
  return null
}
