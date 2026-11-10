// The competition view's model in the display modes (lib/displayMode.ts; Ruijie, 6 Nov: "one with the surround
// program and the legend and one with the gray or white model"; design system §9, 7 Nov):
// - Program: each existing building in its ground-level use (lib/vtcUses.ts), in the same palette as Real Vancouver's
//   types (lib/buildingUse.ts), with a labelled legend.
// - Massing and Analysis: the neutral model (MODEL tokens), matte, under a soft inspection light with restrained shadows,
//   a pale gradient behind and quiet edges. Materials is not offered here: the base model carries no materials.
// The context drawn here comes from the entrant's own copy of the base model (lib/vtcContextSource.ts); without it only
// the brief's site is drawn, and the legend says so.
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { isExtruded, type ContextItem, type VtcContext } from '../context'
import type { Look } from '../data/stages'
import { BUILDING_USES, SWATCH_BORDER, useColor, type BuildingUse } from '../lib/buildingUse'
import { MODEL } from '../lib/design/tokens'
import { useShownMode } from '../lib/displayModeHooks'
import { contextUses } from '../lib/vtcUses'
import { useVtcSource } from '../lib/vtcContextSource'
import { useStore } from '../store'
import { Building2, ChevronDown, ChevronUp, EyeOff } from './icons'
import Help from './Help'
import { useDisplayMode } from '../lib/displayMode'
import { AnalysisLegend, DisplayModeSwitch, KeyGroup, KeyItem, MassingKey, SunChip, TowerUseKey } from './DisplayMode'

/** Which context colouring the scene draws: by ground-level use (Program) or the neutral model (every other mode). */
export type VtcLookId = 'program' | 'plain'

/** The neutral model (MODEL tokens): grey context a step darker than the proposal, light ground, a pale gradient. */
export const PLAIN = {
  building: MODEL.context, heritage: MODEL.context, edge: MODEL.edge, ground: MODEL.ground, site: '#eef1f5', plinth: '#d3d9e0', plinthEdge: MODEL.edge, block: '#aab3bf',
  sky: ['#f7f8fa', MODEL.ground] as [string, string],
}
/** Heritage keeps its own tone in Program: one heritage building is many stacked pieces, mostly with no use in the plan. */
const HERITAGE = '#e6d8bf'

/** The stage look with the neutral model's ground, site and base colours. */
export function vtcSceneLook(look: Look, id: VtcLookId, xray: boolean): Look {
  if (xray) return look
  const base = { ...look, ground: PLAIN.ground, site: PLAIN.site, edge: PLAIN.block, plinth: PLAIN.plinth, plinthEdge: PLAIN.plinthEdge }
  return id === 'plain' ? { ...base, context: PLAIN.building, heritage: PLAIN.heritage } : base
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

/** Solid and matte in Massing, see-through in x-ray so it never hides the tower being studied; edges optional. */
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

// The context's edges sit at lower emphasis than the proposal's (which are full strength, Viewport.tsx).
const EDGE_PLAIN = { color: PLAIN.edge, opacity: 0.38 }
const EDGE_PROGRAM = { color: MODEL.edge, opacity: 0.3 }
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
 * The neutral inspection light of the competition view: the pale gradient behind the model, a soft fill and, while the
 * Sun & shadow preview is off (it casts its own, at the hour shown beside the switch), one soft shadow-casting light from
 * the view's default light direction (three [600, 1200, 400], here in the model frame), weak enough that its shadows
 * only seat the volumes on the ground.
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
        <directionalLight name="vtc-plain-light" castShadow position={[600, -400, 1200]} intensity={0.65}
          shadow-mapSize={[2048, 2048]} shadow-radius={5} shadow-bias={-0.0005} shadow-normalBias={0.5}
          shadow-camera-left={-450} shadow-camera-right={450} shadow-camera-top={450} shadow-camera-bottom={-450} shadow-camera-near={100} shadow-camera-far={3200} />
      )}
    </>
  )
}

// ---------------------------------------------------------------- the mode switch and its key (over the view)
const sw = (color: string, border = SWATCH_BORDER, extra: CSSProperties = {}) => <i aria-hidden className="inline-block h-3 w-3 shrink-0 rounded-[3px]" style={{ background: color, border: `1px solid ${border}`, ...extra }} />

/** Show or hide the surrounding buildings (the site, its lines and labels stay): a view choice, never a change to the checks. */
function ContextToggle() {
  const on = useDisplayMode((s) => s.context)
  const set = useDisplayMode((s) => s.setContext)
  return (
    <button type="button" role="switch" aria-checked={on} onClick={() => set(!on)} data-testid="context-toggle" aria-label="Surrounding buildings"
      title={on ? 'Hide the surrounding buildings to see your model; the checks still count them' : 'Show the surrounding buildings'}
      className={`flex h-7 items-center gap-1 rounded-[6px] px-2 text-control outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${on ? 'text-ink hover:bg-subtle' : 'bg-selected text-accent-hover'}`}>
      {on ? <Building2 size={14} aria-hidden /> : <EyeOff size={14} aria-hidden />}Context{on ? '' : ' off'}</button>
  )
}

/** Bottom left of the competition view, above the north arrow: the display-mode switch and the key of the shown mode. */
export function VtcLookBar() {
  const mode = useShownMode()
  const ctx = useVtcSource((s) => s.ctx)
  const devFile = useVtcSource((s) => s.source === 'dev-file')
  const uses = ctx ? contextUses(ctx) : null
  const shown = uses ? BUILDING_USES.filter((u) => uses.buildings.includes(u.id)) : []
  // The full key on request (8 Nov), shared with Real Vancouver's; an Analysis scale stays visible (units and range).
  const [folded, setFolded] = useState(() => { try { return localStorage.getItem('ts.legend.folded') !== '0' } catch { return true } })
  const fold = (v: boolean) => { setFolded(v); try { localStorage.setItem('ts.legend.folded', v ? '1' : '0') } catch { /* this session only */ } }
  return (
    <div data-testid="vtc-look" className="glass pointer-events-auto absolute bottom-12 left-3 z-10 grid max-w-[min(46rem,calc(100%-1.5rem))] gap-1.5 rounded-[8px] border border-line bg-panel/95 p-1.5 text-meta text-ink">
      <div className="flex flex-wrap items-center gap-1.5">
        <DisplayModeSwitch project="vtc" />
        <SunChip />
        {ctx && <ContextToggle />}
        {mode !== 'analysis' && <button type="button" onClick={() => fold(!folded)} aria-expanded={!folded} data-testid="key-toggle" title={folded ? 'Show the legend' : 'Fold the legend'}
          className="ml-auto flex h-7 shrink-0 items-center gap-1 rounded-[6px] px-2 text-control text-ink outline-none hover:bg-subtle focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">{mode === 'program' ? 'Program legend' : 'Legend'}{folded ? <ChevronUp size={14} aria-hidden /> : <ChevronDown size={14} aria-hidden />}</button>}
      </div>
      {/* a missing input stays visible with the key folded (8 Nov): what to add to see the surrounding program */}
      {folded && mode === 'program' && !uses?.hasPlan && <p role="status" className="text-meta text-muted">{!ctx ? 'Add your copy of the base model to see the surrounding program.' : devFile ? 'The local context predates the use plan: run npm run context:vtc again.' : 'This copy of the model has no ground-level use plan.'}</p>}
      {!folded && mode === 'massing' && <MassingKey />}
      {!folded && mode === 'program' && <>
        <div className="flex items-start gap-2">
          <KeyGroup label="Ground-level use">
            {uses?.hasPlan
              ? <>
                  {shown.map((u) => <KeyItem key={u.id} sw={sw(useColor(u.id))}>{u.id === 'other' ? 'Unknown' : u.label.replace(/ \(.*\)$/, '')}</KeyItem>)}
                  <KeyItem sw={sw(HERITAGE, EDGE_HERITAGE.color)}>Heritage</KeyItem>
                </>
              : <span role="listitem" className="text-muted">{!ctx ? 'Add your copy of the base model to see the surrounding program.' : devFile ? 'The local context predates the use plan: run npm run context:vtc again.' : 'This copy of the model has no ground-level use plan.'}</span>}
          </KeyGroup>
          <Help label="How the uses are read">
            <p>From the competition's Ground Level Use Plan (in Buildner's base model). A building standing on the ground takes the use covering most of its footprint. A tower on a podium takes the lobby use beneath it (office, hotel, residential…). Otherwise it is Unknown, never guessed.</p>
            <p className="mt-1.5">The plan shows the ground floor only. Heritage buildings keep one heritage tone.</p>
          </Help>
        </div>
        <TowerUseKey />
      </>}
      {mode === 'analysis' && <AnalysisLegend project="vtc" />}
    </div>
  )
}
