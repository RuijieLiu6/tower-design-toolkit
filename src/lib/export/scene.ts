// Layer 0 out to other tools (backlog item 32): one closed solid per storey on a layer per program use, the core and
// plant floors on their own layers, imported masses as their mesh, each with user strings (use, level, heights,
// area, where the preset came from and its evidence flag) and document notes for units, north and datum.
// Pure: the writers (obj.ts, rhino.ts, gltf.ts) turn this into files. Coordinates: project frame, metres, Z up,
// z = 0 at the tower base.
import { coreSide, towerFloors, floorRing } from '../../engine/massing'
import { USES, type Tower, type UseId } from '../../engine/types'

export type RGB = [number, number, number]
export interface ExportSolid { name: string; layer: string; color: RGB; positions: number[]; indices: number[]; strings: Record<string, string> }
/** A polyline (x, y, z per point), e.g. the site boundary of an uploaded model (lib/interchange). */
export interface ExportCurve { name: string; layer: string; color: RGB; points: number[]; closed: boolean; strings: Record<string, string> }
export interface ExportScene { solids: ExportSolid[]; curves?: ExportCurve[]; layers: { path: string; color: RGB }[]; notes: Record<string, string> }

export interface SceneOptions {
  project: 'vtc' | 'city'
  /** True north, degrees clockwise from +Y of the model frame. */
  northDeg: number
  /** Tower base elevation (m, CGVD28 in Real Vancouver). */
  groundElevation: number
  /** UTM (EPSG:26910) of the frame origin, Real Vancouver only. */
  utmOrigin: [number, number] | null
  /** Imported masses: the stored mesh (tower frame, metres, Z up). */
  meshOf: (meshId: string) => { positions: ArrayLike<number>; indices: ArrayLike<number> } | undefined
  date?: string
}

const hex = (c: string): RGB => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]
export const LAYER = {
  use: (u: UseId) => `Massing::${USES[u].label}`,
  sky: 'Massing::Sky lobby',
  plant: 'Plant',
  core: 'Core',
  imported: 'Imported massing',
}

/** A closed prism over a convex ring (CCW in plan) from z0 to z1: bottom, top and sides, outward-facing. */
export function prism(ring: [number, number][], z0: number, z1: number): { positions: number[]; indices: number[] } {
  const ccw = ring.reduce((s, [x, y], i) => { const [x2, y2] = ring[(i + 1) % ring.length]; return s + x * y2 - x2 * y }, 0) > 0
  const r = ccw ? ring : [...ring].reverse()
  const n = r.length
  const positions: number[] = []
  for (const [x, y] of r) positions.push(x, y, z0)
  for (const [x, y] of r) positions.push(x, y, z1)
  const indices: number[] = []
  for (let i = 1; i + 1 < n; i++) { indices.push(0, i + 1, i); indices.push(n, n + i, n + i + 1) }
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; indices.push(i, j, n + j, i, n + j, n + i) }
  return { positions, indices }
}

export function buildScene(towers: Tower[], o: SceneOptions): ExportScene {
  const solids: ExportSolid[] = []
  const layers = new Map<string, RGB>()
  const add = (s: ExportSolid) => { solids.push(s); if (!layers.has(s.layer)) layers.set(s.layer, s.color) }
  for (const t of towers) {
    if (t.imported) {
      const m = o.meshOf(t.imported.meshId)
      if (!m) continue
      const a = (t.rotation * Math.PI) / 180, c = Math.cos(a), sn = Math.sin(a)
      const positions: number[] = []
      for (let i = 0; i < m.positions.length; i += 3) {
        const x = m.positions[i], y = m.positions[i + 1], z = m.positions[i + 2]
        positions.push(t.x + x * c - y * sn, t.y + x * sn + y * c, z)
      }
      add({ name: `${t.name} (imported mass)`, layer: LAYER.imported, color: [170, 176, 184], positions, indices: Array.from(m.indices),
        strings: { tower: t.name, source: `imported ${t.imported.format ?? 'model'}${t.imported.fileName ? `: ${t.imported.fileName}` : ''}`, storeys: String(t.imported.storeys.length), height_m: t.height.toFixed(2) } })
      continue
    }
    const floors = towerFloors(t)
    for (const f of floors) {
      // The plate of the block at this level (stacked, shifted and twisted blocks included).
      const ring = floorRing(t, f)
      const { positions, indices } = prism(ring, f.z0, f.z1)
      const plant = f.use === 'mechanical'
      const layer = plant ? LAYER.plant : f.skyLobby ? LAYER.sky : LAYER.use(f.use)
      add({
        name: `${t.name} · L${f.level} ${f.skyLobby ? 'Sky lobby' : USES[f.use].label}`, layer, color: f.skyLobby ? hex('#6cc0b8') : hex(USES[f.use].color), positions, indices,
        strings: {
          tower: t.name, level: String(f.level), use: f.use, z0_m: f.z0.toFixed(2), z1_m: f.z1.toFixed(2), floor_to_floor_m: (f.z1 - f.z0).toFixed(2),
          gross_area_m2: f.area.toFixed(1), podium: f.podium ? 'yes' : 'no', ...(f.skyLobby ? { sky_lobby: 'yes' } : {}),
          source: f.podium ? 'podium inputs (Design panel)' : 'program bands (Design panel)',
          evidence: plant ? `team_assumption: plant every ${t.plantEvery} floors (Schematic preset)` : 'design input',
        },
      })
    }
    // The core box, centred, through the floors (lift overrun and roof are not modelled).
    const top = floors.length ? floors[floors.length - 1].z1 : t.height
    const half = coreSide(t) / 2, r = (t.rotation * Math.PI) / 180, c = Math.cos(r), sn = Math.sin(r)
    const corner = (u: number, v: number): [number, number] => [t.x + u * c - v * sn, t.y + u * sn + v * c]
    const core = prism([corner(-half, -half), corner(half, -half), corner(half, half), corner(-half, half)], 0, top)
    add({ name: `${t.name} · Core`, layer: LAYER.core, color: [60, 64, 72], ...core,
      strings: { tower: t.name, core_share: t.coreShare.toFixed(3), core_side_m: (half * 2).toFixed(2), core_mode: t.coreAuto === false ? 'set by hand' : 'sized to the lifts, stairs and risers',
        source: 'core & lift check and egress check (team presets)', evidence: 'team_assumption (LOD 100 space reservation)' } })
  }
  const north = Math.round(o.northDeg * 100) / 100
  const notes: Record<string, string> = {
    units: 'metres',
    up_axis: 'Z (OBJ files: Y up, by the OBJ convention)',
    frame: o.project === 'vtc' ? 'VTC competition model grid, origin at the centre of the site block' : `Real Vancouver local frame: EPSG:26910 minus (${o.utmOrigin?.[0] ?? '?'}, ${o.utmOrigin?.[1] ?? '?'})`,
    true_north_deg_clockwise_from_plus_y: String(north),
    datum: o.project === 'city' ? `z = 0 at the tower base, ${o.groundElevation.toFixed(2)} m CGVD28` : 'z = 0 at grade on the competition model',
    content: 'One closed solid per storey (layer per use); core and plant floors on their own layers; imported masses as their mesh',
    lod: 'LOD 100: schematic space reservation, not a design or construction model',
    exported: o.date ?? new Date().toISOString().slice(0, 10),
  }
  return { solids, layers: [...layers.entries()].map(([path, color]) => ({ path, color })), notes }
}
