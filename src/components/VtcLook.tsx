// Two looks for the competition view (Ruijie, 6 Nov: "one with the surround program and the legend and one with the gray
// or white model and refer to Rhino's default rendering shade"), remembered in this browser.
// - Program: each existing building in its ground-level use (lib/vtcUses.ts), in Real Vancouver's colours
//   (lib/buildingUse.ts), with a legend in the same visual language as Real Vancouver's.
// - Plain: a white model in the manner of Rhino's Rendered display: light grey surfaces, soft shadows on a light ground,
//   a pale gradient behind, subtle dark edges.
// The context drawn here comes from the entrant's own copy of the base model (lib/vtcContextSource.ts); without it only
// the brief's site is drawn, and the legend says so.
import { useEffect, useMemo, type CSSProperties, type ReactNode } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { create } from 'zustand'
import { isExtruded, type ContextItem, type VtcContext } from '../context'
import type { Look } from '../data/stages'
import { USES } from '../engine/types'
import { BUILDING_USES, SWATCH_BORDER, useColor, type BuildingUse } from '../lib/buildingUse'
import { CHROME } from '../lib/vistaLook'
import { contextUses } from '../lib/vtcUses'
import { useVtcSource } from '../lib/vtcContextSource'
import { useStore, useTowers } from '../store'
import Help from './Help'

// ---------------------------------------------------------------- the choice (this browser)
export type VtcLookId = 'program' | 'plain'
const KEY = 'ts.vtc.look'
const saved = (): VtcLookId => { try { return localStorage.getItem(KEY) === 'plain' ? 'plain' : 'program' } catch { return 'program' } }
export const useVtcLook = create<{ look: VtcLookId; setLook: (l: VtcLookId) => void }>((set) => ({
  look: saved(),
  setLook: (look) => { set({ look }); try { localStorage.setItem(KEY, look) } catch { /* this visit only */ } },
}))

/** Rhino's Rendered display, approximately: white materials under a soft light, a light ground, a pale gradient. */
export const PLAIN = {
  building: '#f3f3f2', heritage: '#ebe7df', edge: '#4b4f55', ground: '#ededeb', site: '#fbfbfa', plinth: '#d6d6d4', plinthEdge: '#8d8d8a', block: '#a7a7a3',
  sky: ['#fbfbfc', '#d9dbde'] as [string, string],
}
/** Heritage keeps its own tone in Program: one heritage building is many stacked pieces, mostly with no use in the plan. */
const HERITAGE = '#e6d8bf'

/** The stage look with the competition look's ground, site and base colours. */
export function vtcSceneLook(look: Look, id: VtcLookId, xray: boolean): Look {
  if (xray || id !== 'plain') return look
  return { ...look, ground: PLAIN.ground, site: PLAIN.site, context: PLAIN.building, heritage: PLAIN.heritage, edge: PLAIN.block, plinth: PLAIN.plinth, plinthEdge: PLAIN.plinthEdge }
}

// ---------------------------------------------------------------- geometry
/** All items merged into one non-indexed geometry (extruded footprints and saved meshes alike). */
export function mergeContext(items: ContextItem[]): THREE.BufferGeometry | null {
  const geoms: THREE.BufferGeometry[] = []
  for (const it of items) {
    let g: THREE.BufferGeometry
    if (isExtruded(it)) {
      if (it.footprint.length < 3 || it.z1 - it.z0 <= 0.01) continue
      const shape = new THREE.Shape(it.footprint.map(([x, y]) => new THREE.Vector2(x, y)))
      g = new THREE.ExtrudeGeometry(shape, { depth: it.z1 - it.z0, bevelEnabled: false })
      g.translate(0, 0, it.z0)
    } else {
      g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.Float32BufferAttribute(it.positions, 3))
      g.setIndex(it.indices)
    }
    g = g.index ? g.toNonIndexed() : g
    g.deleteAttribute('uv')
    g.computeVertexNormals()
    geoms.push(g)
  }
  return geoms.length ? mergeGeometries(geoms) : null
}

/** Solid in Massing, see-through in x-ray so it never hides the tower being studied; edges optional. */
function Solid({ items, color, ghost, edges, name }: { items: ContextItem[]; color: string; ghost: boolean; edges?: { color: string; opacity: number }; name?: string }) {
  const geom = useMemo(() => mergeContext(items), [items])
  const lines = useMemo(() => (geom && edges ? new THREE.EdgesGeometry(geom, 25) : null), [geom, edges])
  useEffect(() => () => { geom?.dispose(); lines?.dispose() }, [geom, lines])
  if (!geom) return null
  return (
    <group name={name}>
      <mesh geometry={geom} castShadow={!ghost} receiveShadow>
        <meshStandardMaterial color={color} roughness={0.92} metalness={0} transparent opacity={ghost ? 0.45 : 1} depthWrite={!ghost} />
      </mesh>
      {lines && edges && !ghost && <lineSegments geometry={lines}><lineBasicMaterial color={edges.color} transparent opacity={edges.opacity} /></lineSegments>}
    </group>
  )
}

const EDGE_PLAIN = { color: PLAIN.edge, opacity: 0.32 }
const EDGE_PROGRAM = { color: '#3d434b', opacity: 0.22 }
const EDGE_HERITAGE = { color: '#6b5a3c', opacity: 0.45 }

/** The context buildings, heritage and plazas in the chosen look. */
export function VtcContextModel({ ctx, look, id, xray }: { ctx: VtcContext; look: Look; id: VtcLookId; xray: boolean }) {
  const byUse = useMemo(() => {
    const uses = contextUses(ctx).buildings
    const groups = new Map<BuildingUse, ContextItem[]>()
    ctx.buildings.forEach((b, i) => { const u = uses[i]; groups.set(u, [...(groups.get(u) ?? []), b]) })
    return [...groups]
  }, [ctx])
  const open = useMemo(() => [...ctx.plazas, ...ctx.midblock], [ctx])
  const program = id === 'program'
  return (
    <group name={`vtc-context-${id}`}>
      {program
        ? byUse.map(([use, items]) => <Solid key={use} name={`vtc-use-${use}`} items={items} color={useColor(use)} ghost={xray} edges={EDGE_PROGRAM} />)
        : <Solid items={ctx.buildings} color={look.context} ghost={xray} edges={EDGE_PLAIN} />}
      <Solid items={ctx.heritage} color={program ? HERITAGE : look.heritage} ghost={xray} edges={program ? EDGE_HERITAGE : EDGE_PLAIN} />
      <Solid items={open} color={program ? '#dfe8dc' : PLAIN.site} ghost={false} />
    </group>
  )
}

// ---------------------------------------------------------------- Plain: Rhino-like environment
function skyTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null
  const c = document.createElement('canvas')
  c.width = 4; c.height = 256
  const g = c.getContext('2d')
  if (!g) return null
  const grad = g.createLinearGradient(0, 0, 0, 256)
  grad.addColorStop(0, PLAIN.sky[0]); grad.addColorStop(1, PLAIN.sky[1])
  g.fillStyle = grad; g.fillRect(0, 0, 4, 256)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

/**
 * The pale gradient behind the model and, while the Sun check is off (it casts its own), one soft shadow-casting light
 * from the same direction as the view's default light (three [600, 1200, 400], here in the model frame).
 */
export function PlainEnvironment() {
  const scene = useThree((s) => s.scene)
  const invalidate = useThree((s) => s.invalidate)
  const sunOn = useStore((s) => !!s.enabled['built.sun'])
  useEffect(() => {
    const tex = skyTexture()
    if (!tex) return
    const prev = scene.background
    scene.background = tex
    invalidate()
    return () => { if (scene.background === tex) scene.background = prev; tex.dispose(); invalidate() }
  }, [scene, invalidate])
  return (
    <>
      {/* Rhino's white model keeps its faces in shade light: a soft fill from all around. */}
      <hemisphereLight name="vtc-plain-fill" args={['#ffffff', '#e4e4e2', 0.6]} />
      {!sunOn && (
        <directionalLight name="vtc-plain-light" castShadow position={[600, -400, 1200]} intensity={0.55}
          shadow-mapSize={[2048, 2048]} shadow-radius={5} shadow-bias={-0.0005} shadow-normalBias={0.5}
          shadow-camera-left={-450} shadow-camera-right={450} shadow-camera-top={450} shadow-camera-bottom={-450} shadow-camera-near={100} shadow-camera-far={3200} />
      )}
    </>
  )
}

// ---------------------------------------------------------------- switch + legend (over the view)
const box: CSSProperties = { background: CHROME.box, border: `1px solid ${CHROME.border}`, color: CHROME.ink, boxShadow: CHROME.shadow, borderRadius: 2, letterSpacing: '0.15px' }
const focusRing = 'outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#426b61]'
function Swatch({ color, border = SWATCH_BORDER, style }: { color: string; border?: string; style?: CSSProperties }) {
  return <i aria-hidden className="inline-block h-3 w-3 shrink-0 rounded-[3px]" style={{ background: color, border: `1px solid ${border}`, ...style }} />
}
const item = (key: string, sw: ReactNode, text: ReactNode, title?: string) => <span role="listitem" key={key} title={title} className="flex items-center gap-1.5">{sw}<span className="sr-only group-hover/legend:not-sr-only group-focus-within/legend:not-sr-only">{text}</span></span>
const group = (label: string) => <span aria-hidden className="mr-0.5 hidden text-meta font-semibold group-hover/legend:inline group-focus-within/legend:inline" style={{ color: CHROME.tabInk }}>{label}</span>

function LookSwitch() {
  const { look, setLook } = useVtcLook()
  const opt = (id: VtcLookId, label: string, title: string) => (
    <button type="button" role="radio" aria-checked={look === id} title={title} onClick={() => setLook(id)}
      className={`rounded-[2px] px-2 py-[1px] text-meta font-medium ${focusRing}`}
      style={look === id ? { background: CHROME.active, color: CHROME.activeInk } : { color: CHROME.tabInk }}>{label}</button>
  )
  return (
    <div role="radiogroup" aria-label="Competition view look" className="flex items-center gap-0.5">
      {opt('program', 'Program', 'Surrounding buildings in their ground-level use, with a legend')}
      {opt('plain', 'Plain', 'A white model, shaded like Rhino’s Rendered display')}
    </div>
  )
}

/** The proposed tower's swatch: its programme colours, as in Real Vancouver's legend. */
function TowerSwatch() {
  const towers = useTowers()
  const sel = useStore((s) => s.selectedTower)
  const t = towers.find((k) => k.id === sel) ?? towers[0]
  const uses = [...new Set((t?.bands ?? []).filter((b) => b.share > 0).map((b) => b.use))].slice(0, 3)
  if (!uses.length) return <Swatch color={USES.residential.color} />
  return <i aria-hidden className="inline-flex h-[9px] w-[9px] shrink-0 overflow-hidden rounded-[2px]" style={{ border: `1px solid ${SWATCH_BORDER}` }}>{uses.map((u) => <i key={u} className="h-full flex-1" style={{ background: USES[u]?.color }} />)}</i>
}

/** Bottom left of the competition view, above the north arrow: the look switch, and in Program the legend. */
export function VtcLookBar() {
  const look = useVtcLook((s) => s.look)
  const ctx = useVtcSource((s) => s.ctx)
  const devFile = useVtcSource((s) => s.source === 'dev-file')
  const uses = ctx ? contextUses(ctx) : null
  const shown = uses ? BUILDING_USES.filter((u) => uses.buildings.includes(u.id)) : []
  return (
    <div data-testid="vtc-look" className="group/legend pointer-events-auto absolute bottom-12 left-3 z-10 max-w-[min(46rem,calc(100%-1.5rem))] px-2 py-[5px] text-meta" style={box} title="Legend: point at it for the names">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <LookSwitch />
        {look === 'program' && (
          <div role="list" aria-label="Ground-level use" className="flex flex-wrap items-center gap-x-2 gap-y-[3px]">
            {group('Ground-level use')}
            {uses?.hasPlan
              ? <>
                  {shown.map((u) => item(u.id, <Swatch color={useColor(u.id)} />, u.id === 'other' ? 'Other / unknown' : u.label.replace(/ \(.*\)$/, '')))}
                  {item('heritage', <Swatch color={HERITAGE} border={EDGE_HERITAGE.color} />, 'Heritage')}
                </>
              : <span role="listitem">{!ctx ? 'Add your copy of the base model to see the surrounding program.' : devFile ? 'The local context predates the use plan: run npm run context:vtc again.' : 'This copy of the model has no ground-level use plan.'}</span>}
            {item('proposal', <TowerSwatch />, <b className="font-semibold">Proposed tower</b>, 'Your design tower, in its programme colours')}
          </div>
        )}
        {look === 'program' && (
          <Help label="How the uses are read">
            <p>From the competition's Ground Level Use Plan (in Buildner's base model). A building standing on the ground takes the use covering most of its footprint. A tower on a podium takes the lobby use beneath it (office, hotel, residential…). Otherwise it is Other / unknown, never guessed.</p>
            <p className="mt-1.5">The plan shows the ground floor only. Heritage buildings keep one heritage tone.</p>
          </Help>
        )}
      </div>
    </div>
  )
}
