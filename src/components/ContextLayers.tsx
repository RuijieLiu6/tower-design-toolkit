// Real Vancouver context layers v1 (Context Model spec, layer table): street trees, parcels with land value, zoning,
// heritage and traffic count locations. Each loads only when switched on (not part of the first load), cites its
// source from layers.json, ghosts in x-ray, and reads out under the cursor. Packed by tools/build_city_layers.py.
import { dataFetch } from '../lib/loadProgress'
import type { ThreeEvent } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { create } from 'zustand'
import { decodeFootprints, layerBytes, sampleTerrain, type Footprint, type HeightGrid, type LayerEntry, type Manifest } from '../lib/cityLayers'
import {
  CONTEXT_LAYER_IDS, DESIGNATION_LABEL, decodeTrees, dmPoints, heightClassLabel, parcelMesh, parcelRow, treeHeightM,
  type ContextLayerId, type HeritageData, type ParcelAttrs, type TrafficData, type Tree, type ZoningData,
} from '../lib/contextLayers'
import Label from './Label'
import { parcelHeightLines } from '../lib/heightReadout'
import { FlagChip } from './ui'

/** Land value per m2, quintiles. One orange ramp, light to dark (validated as an ordinal ramp); blue is taken by the height limits. */
export const VALUE_RAMP = ['#f0a27a', '#e97b4a', '#d45e2a', '#a8481e', '#773312']
const NO_VALUE = '#d9dadd'
const TREE = '#8fa77f', HERITAGE = '#9c6b2f', TRAFFIC = '#3d434b', ZONING = '#5b5f8a'

interface Readout { layer: ContextLayerId; title: string; lines: string[]; link?: string }
interface LayersState {
  on: Partial<Record<ContextLayerId, boolean>>
  status: Partial<Record<ContextLayerId, 'loading' | 'ready' | 'error'>>
  hover: Readout | null
  pinned: Readout | null
}
export const useContextLayers = create<LayersState>(() => ({ on: {}, status: {}, hover: null, pinned: null }))

// ---------- loading (once per layer per session) ----------
interface TreesData { trees: Tree[]; names: string[] }
interface ParcelsData { polys: Footprint[]; attrs: ParcelAttrs }
type LayerData = TreesData | ParcelsData | ZoningData | HeritageData | TrafficData
const cache: Partial<Record<ContextLayerId, Promise<LayerData>>> = {}

async function get(file: string, kind: 'bin' | 'json') {
  const r = await dataFetch(file)
  if (!r.ok) throw new Error(`${file}: HTTP ${r.status}`)
  return kind === 'bin' ? r.arrayBuffer() : r.json()
}

function load(entry: LayerEntry): Promise<LayerData> {
  const id = entry.id as ContextLayerId
  cache[id] ??= (async (): Promise<LayerData> => {
    if (id === 'trees') {
      const [b, j] = await Promise.all([get('trees.bin', 'bin'), get('trees.json', 'json')])
      return { trees: decodeTrees(b as ArrayBuffer), names: (j as { names: string[] }).names }
    }
    if (id === 'parcels') {
      const [b, j] = await Promise.all([get('parcels.bin', 'bin'), get('parcels.json', 'json')])
      return { polys: decodeFootprints(b as ArrayBuffer), attrs: j as ParcelAttrs }
    }
    return (await get(`${id}.json`, 'json')) as LayerData
  })()
  cache[id]!.catch(() => { delete cache[id] })
  return cache[id]!
}

function useLayer<T extends LayerData>(id: ContextLayerId, manifest: Manifest): T | null {
  const on = useContextLayers((s) => !!s.on[id])
  const entry = manifest.layers.find((l) => l.id === id)
  const [data, setData] = useState<T | null>(null)
  useEffect(() => {
    if (!on || !entry || data) return
    let live = true
    useContextLayers.setState((s) => ({ status: { ...s.status, [id]: 'loading' } }))
    load(entry).then(
      (d) => { if (live) { setData(d as T); useContextLayers.setState((s) => ({ status: { ...s.status, [id]: 'ready' } })) } },
      () => useContextLayers.setState((s) => ({ status: { ...s.status, [id]: 'error' } })),
    )
    return () => { live = false }
  }, [on, entry, data, id])
  return on ? data : null
}

const groundAt = (grids: HeightGrid[], x: number, y: number) => Math.max(0, sampleTerrain(grids, x, y) ?? 0)
const hoverTo = (r: Readout | null) => useContextLayers.setState({ hover: r })
const pinTo = (r: Readout) => useContextLayers.setState({ pinned: r })
const money = (k: number) => (k >= 1000 ? `$${(k / 1000).toFixed(k >= 10000 ? 0 : 1)} M` : `$${k.toLocaleString()} k`)

function ghostProps(ghost: boolean, opacity = 1) {
  return { transparent: ghost || opacity < 1, opacity: ghost ? Math.min(opacity, 0.3) : opacity, depthWrite: !ghost && opacity === 1 }
}

// ---------- trees: a cone of the tree's height (display massing), a flat dot when the height is unknown ----------
function TreesLayer({ data, grids, xray }: { data: TreesData; grids: HeightGrid[]; xray: boolean }) {
  const cone = useMemo(() => new THREE.ConeGeometry(1, 1, 8).rotateX(Math.PI / 2).translate(0, 0, 0.5), [])
  const dot = useMemo(() => new THREE.CylinderGeometry(1, 1, 0.3, 8).rotateX(Math.PI / 2).translate(0, 0, 0.15), [])
  const { known, unknown } = useMemo(() => ({
    known: data.trees.map((t, i) => [t, i] as const).filter(([t]) => t.feet !== null),
    unknown: data.trees.map((t, i) => [t, i] as const).filter(([t]) => t.feet === null),
  }), [data])
  const coneRef = useRef<THREE.InstancedMesh>(null), dotRef = useRef<THREE.InstancedMesh>(null)
  useEffect(() => {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3()
    known.forEach(([t], k) => {
      const h = treeHeightM(t) as number
      coneRef.current?.setMatrixAt(k, m.compose(p.set(t.x, t.y, groundAt(grids, t.x, t.y)), q, s.set(h * 0.3, h * 0.3, h)))
    })
    unknown.forEach(([t], k) => dotRef.current?.setMatrixAt(k, m.compose(p.set(t.x, t.y, groundAt(grids, t.x, t.y) + 0.3), q, s.set(1.2, 1.2, 1))))
    if (coneRef.current) { coneRef.current.instanceMatrix.needsUpdate = true; coneRef.current.computeBoundingSphere() }
    if (dotRef.current) { dotRef.current.instanceMatrix.needsUpdate = true; dotRef.current.computeBoundingSphere() }
  }, [known, unknown, grids])
  const read = (list: typeof known) => (e: ThreeEvent<PointerEvent>) => {
    if (e.instanceId === undefined) return
    e.stopPropagation()
    const t = list[e.instanceId][0]
    hoverTo({ layer: 'trees', title: data.names[t.name] ?? 'Street tree', lines: [heightClassLabel(t), 'Massing: a cone of the tree height, 0.6 × height wide (display only)'] })
  }
  return (
    <>
      <instancedMesh ref={coneRef} args={[cone, undefined, Math.max(1, known.length)]} count={known.length} castShadow={!xray} onPointerMove={read(known)} onPointerOut={() => hoverTo(null)}>
        <meshStandardMaterial color={TREE} roughness={1} {...ghostProps(xray)} />
      </instancedMesh>
      <instancedMesh ref={dotRef} args={[dot, undefined, Math.max(1, unknown.length)]} count={unknown.length} onPointerMove={read(unknown)} onPointerOut={() => hoverTo(null)}>
        <meshStandardMaterial color="#b7b9bd" roughness={1} {...ghostProps(xray)} />
      </instancedMesh>
    </>
  )
}

// ---------- parcels: land value shading draped on the ground, with outlines ----------
function ParcelsLayer({ data, grids, xray }: { data: ParcelsData; grids: HeightGrid[]; xray: boolean }) {
  const built = useMemo(() => {
    const m = parcelMesh(data.polys, data.attrs, (x, y) => groundAt(grids, x, y))
    const palette = VALUE_RAMP.map((h) => new THREE.Color(h)), none = new THREE.Color(NO_VALUE)
    const col = new Float32Array(m.band.length * 3)
    m.band.forEach((b, k) => (b < 0 ? none : palette[b]).toArray(col, k * 3))
    const fill = new THREE.BufferGeometry()
    fill.setAttribute('position', new THREE.BufferAttribute(m.positions, 3))
    fill.setAttribute('color', new THREE.BufferAttribute(col, 3))
    fill.setIndex(new THREE.BufferAttribute(m.index, 1))
    const outline = new THREE.BufferGeometry()
    outline.setAttribute('position', new THREE.BufferAttribute(m.outline, 3))
    return { fill, outline, tri: m.triangleParcel }
  }, [data, grids])
  useEffect(() => () => { built.fill.dispose(); built.outline.dispose() }, [built])
  const readout = (e: ThreeEvent<PointerEvent>): Readout | null => {
    if (e.faceIndex === undefined || e.faceIndex === null) return null
    const r = parcelRow(data.attrs, built.tri[e.faceIndex])
    const heights = parcelHeightLines(data.polys[built.tri[e.faceIndex]].outer, grids) // Vista height model (Integrate Vista)
    return {
      layer: 'parcels', title: r.address || 'Parcel',
      lines: [...(r.landK === null ? ['No row in the property tax report: no land value shown'] : [
        `Land ${money(r.landK)}${r.perM2 !== null ? ` · $${Math.round(r.perM2).toLocaleString()}/m²` : ''} · improvements ${money(r.improvementK ?? 0)}`,
        `${r.zoning ? `Zoning ${r.zoning} · ` : ''}${r.folios} folio${r.folios === 1 ? '' : 's'} · ${r.m2.toLocaleString()} m² · assessed ${data.attrs.year ?? '?'}`,
      ]), ...heights],
    }
  }
  return (
    <>
      <mesh geometry={built.fill} renderOrder={1}
        onPointerMove={(e) => { const r = readout(e); if (r) { e.stopPropagation(); hoverTo(r) } }} onPointerOut={() => hoverTo(null)}
        onPointerDown={(e) => { const r = readout(e); if (r) pinTo(r) }}>
        <meshBasicMaterial vertexColors transparent opacity={xray ? 0.3 : 0.62} depthWrite={false} toneMapped={false} polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-4} />
      </mesh>
      <lineSegments geometry={built.outline}><lineBasicMaterial color="#5a4030" transparent opacity={xray ? 0.25 : 0.5} /></lineSegments>
    </>
  )
}

// ---------- zoning: outlines and one label per district ----------
function ZoningLayer({ data, grids, xray }: { data: ZoningData; grids: HeightGrid[]; xray: boolean }) {
  const { geom, labels } = useMemo(() => {
    const pts: number[] = [], best = new Map<number, { area: number; at: [number, number] }>()
    for (const [d, flat] of data.polys) {
      const ring = dmPoints(flat)
      let area = 0, cx = 0, cy = 0
      ring.forEach(([x, y], k) => {
        const [nx, ny] = ring[(k + 1) % ring.length]
        pts.push(x, y, groundAt(grids, x, y) + 1.2, nx, ny, groundAt(grids, nx, ny) + 1.2)
        const cr = x * ny - nx * y
        area += cr; cx += (x + nx) * cr; cy += (y + ny) * cr
      })
      area /= 2
      if (Math.abs(area) > (best.get(d)?.area ?? 0)) best.set(d, { area: Math.abs(area), at: [cx / (6 * area), cy / (6 * area)] })
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
    return { geom: g, labels: [...best].map(([d, v]) => ({ text: data.districts[d], at: v.at })) }
  }, [data, grids])
  useEffect(() => () => geom.dispose(), [geom])
  return (
    <>
      <lineSegments geometry={geom}><lineBasicMaterial color={ZONING} transparent opacity={xray ? 0.35 : 0.8} /></lineSegments>
      {labels.length <= 200 && labels.map((l) => (
        <Label key={l.text} text={l.text} position={[l.at[0], l.at[1], groundAt(grids, l.at[0], l.at[1]) + 8]} size={0.012} color={ZONING} background="rgba(255,255,255,0.9)" />
      ))}
    </>
  )
}

// ---------- heritage and traffic: point markers ----------
function Markers({ pts, geometry, color, grids, lift, xray, onRead }: {
  pts: [number, number][]; geometry: THREE.BufferGeometry; color: string; grids: HeightGrid[]; lift: number; xray: boolean
  onRead: (i: number) => Readout
}) {
  const ref = useRef<THREE.InstancedMesh>(null)
  useEffect(() => {
    const m = new THREE.Matrix4()
    pts.forEach(([x, y], i) => ref.current?.setMatrixAt(i, m.makeTranslation(x, y, groundAt(grids, x, y) + lift)))
    if (ref.current) { ref.current.instanceMatrix.needsUpdate = true; ref.current.computeBoundingSphere() }
  }, [pts, grids, lift])
  return (
    <instancedMesh ref={ref} args={[geometry, undefined, Math.max(1, pts.length)]} count={pts.length}
      onPointerMove={(e) => { if (e.instanceId !== undefined) { e.stopPropagation(); hoverTo(onRead(e.instanceId)) } }}
      onPointerOut={() => hoverTo(null)} onPointerDown={(e) => { if (e.instanceId !== undefined) pinTo(onRead(e.instanceId)) }}>
      <meshStandardMaterial color={color} roughness={0.7} {...ghostProps(xray)} />
    </instancedMesh>
  )
}

function HeritageLayer({ data, grids, xray }: { data: HeritageData; grids: HeightGrid[]; xray: boolean }) {
  const geometry = useMemo(() => new THREE.OctahedronGeometry(4), [])
  const pts = useMemo(() => data.rows.map((r) => [r[0] / 10, r[1] / 10] as [number, number]), [data])
  return (
    <Markers pts={pts} geometry={geometry} color={HERITAGE} grids={grids} lift={7} xray={xray} onRead={(i) => {
      const [, , name, address, category, group, des] = data.rows[i]
      return { layer: 'heritage', title: name || address || 'Heritage site', lines: [
        [address && name ? address : '', category, group ? `evaluation group ${group}` : ''].filter(Boolean).join(' · '),
        des.length ? des.map((d) => DESIGNATION_LABEL[d] ?? d).join(', ') : 'On the register (no designation recorded)',
      ] }
    }} />
  )
}

function TrafficLayer({ data, grids, xray }: { data: TrafficData; grids: HeightGrid[]; xray: boolean }) {
  const geometry = useMemo(() => new THREE.SphereGeometry(6, 12, 8), [])
  const pts = useMemo(() => data.intersections.map((r) => [r[0] / 10, r[1] / 10] as [number, number]), [data])
  const segs = useMemo(() => {
    const p: number[] = []
    for (const [, flat] of data.segments) {
      const line = dmPoints(flat)
      for (let k = 0; k + 1 < line.length; k++) {
        const [ax, ay] = line[k], [bx, by] = line[k + 1]
        p.push(ax, ay, groundAt(grids, ax, ay) + 1.5, bx, by, groundAt(grids, bx, by) + 1.5)
      }
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3))
    return g
  }, [data, grids])
  useEffect(() => () => segs.dispose(), [segs])
  return (
    <>
      <lineSegments geometry={segs}><lineBasicMaterial color="#6b7079" transparent opacity={xray ? 0.3 : 0.75} /></lineSegments>
      <Markers pts={pts} geometry={geometry} color={TRAFFIC} grids={grids} lift={4} xray={xray} onRead={(i) => {
        const [, , name, url] = data.intersections[i]
        return { layer: 'traffic', title: name, lines: ['Intersection movement count location. Volumes are on the City count sheet, not in the open data.'], link: url || undefined }
      }} />
    </>
  )
}

/** The 3D layers, inside CityScene's z-up group. */
export default function ContextLayersScene({ manifest, grids, xray }: { manifest: Manifest; grids: HeightGrid[]; xray: boolean }) {
  const trees = useLayer<TreesData>('trees', manifest)
  const parcels = useLayer<ParcelsData>('parcels', manifest)
  const zoning = useLayer<ZoningData>('zoning', manifest)
  const heritage = useLayer<HeritageData>('heritage', manifest)
  const traffic = useLayer<TrafficData>('traffic', manifest)
  return (
    <>
      {trees && <TreesLayer data={trees} grids={grids} xray={xray} />}
      {parcels && <ParcelsLayer data={parcels} grids={grids} xray={xray} />}
      {zoning && <ZoningLayer data={zoning} grids={grids} xray={xray} />}
      {heritage && <HeritageLayer data={heritage} grids={grids} xray={xray} />}
      {traffic && <TrafficLayer data={traffic} grids={grids} xray={xray} />}
    </>
  )
}

// ---------- DOM panel: toggles, sources, legends, readout ----------
const TITLES: Record<ContextLayerId, string> = { trees: 'Street trees', parcels: 'Parcels and land value', zoning: 'Zoning districts', heritage: 'Heritage sites', traffic: 'Traffic count locations' }
const mb = (b: number) => (b >= 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} kB`)

function Legend({ id, entry }: { id: ContextLayerId; entry: LayerEntry }) {
  if (id === 'parcels') {
    const breaks = (entry.processing?.value_breaks_per_m2 as number[] | undefined) ?? []
    const edges = [0, ...breaks]
    return (
      <div className="ml-5 space-y-0.5">
        <div className="text-meta text-slate-500">Land value per m² (quintiles)</div>
        {VALUE_RAMP.map((c, i) => (
          <div key={c} className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-4 rounded-sm border border-black/10" style={{ background: c }} />
            {i < breaks.length ? `$${edges[i].toLocaleString()}–${breaks[i].toLocaleString()}` : `$${(breaks[breaks.length - 1] ?? 0).toLocaleString()} or more`}
          </div>
        ))}
        <div className="flex items-center gap-1.5"><span className="inline-block h-3 w-4 rounded-sm border border-black/10" style={{ background: NO_VALUE }} />No tax row: no value</div>
      </div>
    )
  }
  if (id === 'trees') return <div className="ml-5 text-slate-500">Cone = the City height class; grey dot = height unknown (never guessed).</div>
  if (id === 'traffic') {
    return (
      <div className="ml-5 space-y-0.5 text-slate-500">
        <div>Dots: intersection movement counts; lines: directional count segments. Click a dot for its count sheet.</div>
        {(entry.false_assumptions ?? []).map((f) => (
          <p key={f.claim} className="border-l-2 border-flag-false pl-1.5"><span className="font-semibold text-flag-false">False assumption: </span>{f.claim}. {f.correction}</p>
        ))}
      </div>
    )
  }
  return null
}

function ReadoutBox() {
  const { hover, pinned } = useContextLayers()
  const r = hover ?? pinned
  if (!r) return null
  return (
    <div className="rounded border border-line bg-slate-50 px-1.5 py-1">
      <div className="flex items-center justify-between gap-2">
        <b className="text-ink">{r.title}</b>
        {pinned && !hover && <button type="button" className="text-meta text-slate-500 underline" onClick={() => useContextLayers.setState({ pinned: null })}>clear</button>}
      </div>
      {r.lines.filter(Boolean).map((l) => <div key={l}>{l}</div>)}
      {r.link && <a className="text-ink underline" href={r.link} target="_blank" rel="noreferrer">City count sheet</a>}
    </div>
  )
}

/** Toggles for the on-demand layers, with their sources, legends and the readout. */
export function ContextLayersPanel({ manifest, bare = false }: { manifest: Manifest; bare?: boolean }) {
  const { on, status } = useContextLayers()
  return (
    <div className={bare ? 'space-y-1.5 text-meta text-slate-600' : 'w-80 shrink-0 space-y-1.5 rounded-md border border-line bg-white/95 px-2 py-1.5 text-meta text-slate-600 shadow-sm'}>
      {!bare && <div className="flex items-center justify-between"><b className="text-ink">More layers</b><span className="text-meta text-slate-500">load when switched on</span></div>}
      {CONTEXT_LAYER_IDS.map((id) => {
        const entry = manifest.layers.find((l) => l.id === id)
        return (
          <div key={id} className="space-y-0.5">
            <div className="flex items-center justify-between gap-2">
              <label className={`flex items-center gap-1.5 ${entry ? 'text-ink' : 'text-slate-400'}`}>
                <input type="checkbox" disabled={!entry} checked={!!on[id]}
                  onChange={(e) => useContextLayers.setState((s) => ({ on: { ...s.on, [id]: e.target.checked }, hover: null }))} />
                {entry?.title ?? TITLES[id]}
                {entry && <span className="text-slate-500">· {entry.count?.toLocaleString()} · {mb(layerBytes(entry))}</span>}
                {status[id] === 'loading' && on[id] && <span className="text-slate-500">loading…</span>}
                {status[id] === 'error' && <span className="text-flag-unresolved">failed to load</span>}
              </label>
              {entry && <FlagChip flag={entry.flag} />}
            </div>
            <div className="ml-5 text-meta text-slate-500">
              {entry ? <>{entry.source.publisher} · {entry.licence.name} · retrieved {entry.source.retrieved}</> : 'Not downloaded yet (City of Vancouver open data)'}
            </div>
            {entry && on[id] && <Legend id={id} entry={entry} />}
          </div>
        )
      })}
      <ReadoutBox />
    </div>
  )
}
