// Program in the model (Sinnie, 13 Nov: "users should be able to see division of floors so when im in program i can
// select floors and adjust the programming type"). In the Program step every design tower is drawn floor by floor in
// its use's colour with a line at each floor; a click picks a floor (Shift: a range, Ctrl / Cmd: add or remove), and a
// small bar beside the picked floors sets their use. The floors' uses live on the tower (Tower.floorUses), so area, FSR,
// value and every other check follow at once. Lives in the z-up scene group (Viewport.tsx).
import { Html } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import { useEffect, useMemo, useState } from 'react'
import * as THREE from 'three'
import { USES, type Tower, type UseId } from '../engine/types'
import { clearFloorPick, floorPlates, pickFloor, resetFloorUses, setPickedUse, useFloorPick } from '../lib/floorPick'
import { useHiddenTowers } from '../lib/hiddenTowers'
import { useStep } from '../lib/step'
import { useStore, useTowers } from '../store'

type Pt = [number, number]
// Picked floors in ink, a colour no use wears (the selection blue is too near Office's).
const ACCENT = '#1f2937'

/** A plate a hair outside the tower's faces, so the floors read over the solid without fighting it. */
function grow(ring: Pt[], by: number): Pt[] {
  const c = ring.reduce((a, p) => [a[0] + p[0] / ring.length, a[1] + p[1] / ring.length], [0, 0])
  return ring.map(([x, y]) => { const dx = x - c[0], dy = y - c[1], d = Math.hypot(dx, dy) || 1; return [x + (dx / d) * by, y + (dy / d) * by] as Pt })
}

function TowerFloors({ t, base }: { t: Tower; base: number }) {
  const picked = useFloorPick((s) => (s.tower === t.id ? s.levels : null))
  const [hover, setHover] = useState<number | null>(null)
  const plates = useMemo(() => floorPlates(t).map(({ f, rings }) => ({
    f,
    parts: rings.map((r) => {
      const g = new THREE.ExtrudeGeometry(new THREE.Shape(grow(r, 0.25).map(([x, y]) => new THREE.Vector2(x, y))), { depth: Math.max(0.2, f.z1 - f.z0 - 0.12), bevelEnabled: false })
      g.translate(0, 0, f.z0 + 0.06)
      return g
    }),
  })), [t])
  useEffect(() => () => plates.forEach((p) => p.parts.forEach((g) => g.dispose())), [plates])
  const edges = useMemo(() => plates.map((p) => p.parts.map((g) => new THREE.EdgesGeometry(g, 30))), [plates])
  useEffect(() => () => edges.forEach((e) => e.forEach((g) => g.dispose())), [edges])
  const sel = new Set(picked ?? [])
  const onDown = (level: number) => (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    const ev = e.nativeEvent
    pickFloor(t.id, level, ev.shiftKey ? 'range' : ev.ctrlKey || ev.metaKey ? 'toggle' : 'one')
  }
  // The bar sits beside the highest picked floor.
  const top = picked?.length ? plates.filter((p) => sel.has(p.f.level)).sort((a, b) => b.f.z1 - a.f.z1)[0] : null
  const anchor = useMemo(() => {
    if (!top) return null
    const r = floorPlates(t).find((p) => p.f.level === top.f.level)?.rings[0] ?? []
    const xs = r.map((p) => p[0]), ys = r.map((p) => p[1])
    return [Math.max(...xs) + 4, (Math.min(...ys) + Math.max(...ys)) / 2, top.f.z1] as [number, number, number]
  }, [top, t])
  return (
    <group position={[0, 0, base]} data-floors={t.id}>
      {plates.map(({ f, parts }, i) => {
        const on = sel.has(f.level), hot = hover === f.level
        const color = on ? ACCENT : USES[f.use]?.color ?? '#cfd5dc'
        return parts.map((g, k) => (
          <group key={`${f.level}:${k}`}>
            <mesh geometry={g} userData={{ floor: f.level, tower: t.id }} onPointerDown={onDown(f.level)}
              onPointerOver={(e) => { e.stopPropagation(); setHover(f.level); document.body.style.cursor = 'pointer' }}
              onPointerOut={() => { setHover((h) => (h === f.level ? null : h)); document.body.style.cursor = '' }}>
              <meshStandardMaterial color={color} emissive={hot && !on ? '#ffffff' : '#000000'} emissiveIntensity={hot && !on ? 0.25 : 0} transparent opacity={on ? 0.95 : 0.88} />
            </mesh>
            <lineSegments geometry={edges[i][k]}><lineBasicMaterial color={on ? '#0b2a6b' : '#3b4350'} transparent opacity={on ? 0.9 : 0.45} /></lineSegments>
          </group>
        ))
      })}
      {anchor && picked && <Html position={anchor} zIndexRange={[40, 0]} style={{ pointerEvents: 'auto' }}><UseBar count={picked.length} levels={picked} /></Html>}
    </group>
  )
}

/** The picked floors' use, beside them in the model. */
function UseBar({ count, levels }: { count: number; levels: number[] }) {
  const span = levels.length > 1 ? `L${levels[0]}–${levels[levels.length - 1]}` : `L${levels[0]}`
  return (
    <div data-testid="floor-usebar" onPointerDown={(e) => e.stopPropagation()} className="glass grid w-56 gap-1 rounded-xl bg-glass-1 p-2 text-meta shadow-float">
      <div className="flex items-center justify-between px-0.5">
        <span className="font-semibold text-ink">{span}<span className="font-normal text-muted"> · {count} fl</span></span>
        <button type="button" onClick={clearFloorPick} aria-label="Done" title="Done (Esc)" className="flex h-6 w-6 items-center justify-center rounded-md text-muted hover:bg-subtle hover:text-ink">✕</button>
      </div>
      <div className="grid grid-cols-2 gap-0.5">
        {(Object.keys(USES) as UseId[]).map((u) => (
          <button key={u} type="button" data-use={u} onClick={() => setPickedUse(u)} title={`Make ${count === 1 ? 'this floor' : `these ${count} floors`} ${USES[u].label}`}
            className="flex h-7 min-w-0 items-center gap-1.5 rounded-md px-1.5 text-left text-ink hover:bg-subtle">
            <span className="h-3 w-3 shrink-0 rounded-sm border border-black/15" style={{ background: USES[u].color }} /><span className="truncate">{USES[u].label.replace(/ \/.*$/, '')}</span>
          </button>
        ))}
        <button type="button" onClick={() => resetFloorUses()} title="Give these floors back to the bands" className="flex h-7 items-center rounded-md px-1.5 text-muted hover:bg-subtle hover:text-ink">↺ Bands</button>
      </div>
    </div>
  )
}

export default function FloorPicker3D() {
  const step = useStep((s) => s.step)
  const phase = useStore((s) => s.phase)
  const on = phase === 'basic' && step === 'program'
  const towers = useTowers()
  const hidden = useHiddenTowers((s) => s.hidden)
  const base = useStore((s) => (s.project === 'city' ? s.groundElevation : 0))
  useEffect(() => { if (!on) clearFloorPick() }, [on])
  useEffect(() => {
    if (!on) return
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') clearFloorPick() }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [on])
  if (!on) return null
  return <>{towers.filter((t) => !hidden[t.id]).map((t) => <TowerFloors key={t.id} t={t} base={base} />)}</>
}
