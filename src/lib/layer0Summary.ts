// The fixed Layer 0 summary that community node formulas read (tower-studio-node@1).
// Names here are the contract: the package schema lists the same names in `inputs`, and the skill documents them
// (nodePackages.test.ts checks all three agree). Add names; never rename or remove one without a new format version.
import { SITE } from '../engine/vtcRules'
import { coreSide, gfaByUse, netToGross, towerFloors } from '../engine/massing'
import { sunPosition, vancouverTime } from '../engine/sun'
import { USES, type Tower, type UseId } from '../engine/types'

export interface VarInfo { name: string; unit: string; label: string; note?: string }

const USE_IDS = Object.keys(USES) as UseId[]

export const TOWER_VARS: VarInfo[] = [
  { name: 'height', unit: 'm', label: 'Architectural top above grade' },
  { name: 'width', unit: 'm', label: 'Tower plate width (before rotation)' },
  { name: 'depth', unit: 'm', label: 'Tower plate depth (before rotation)' },
  { name: 'rotation', unit: 'deg', label: 'Footprint rotation, counter-clockwise' },
  { name: 'f2f', unit: 'm', label: 'Typical tower floor-to-floor' },
  { name: 'floors', unit: 'count', label: 'All floors, podium included' },
  { name: 'towerFloors', unit: 'count', label: 'Floors above the podium' },
  { name: 'podiumFloors', unit: 'count', label: 'Podium floors (0 if none)' },
  { name: 'podiumHeight', unit: 'm', label: 'Podium height (0 if none)' },
  { name: 'podiumWidth', unit: 'm', label: 'Podium width (0 if none)' },
  { name: 'podiumDepth', unit: 'm', label: 'Podium depth (0 if none)' },
  { name: 'podiumArea', unit: 'm²', label: 'Podium footprint area (0 if none)' },
  { name: 'plateArea', unit: 'm²', label: 'Gross tower floor plate = width × depth' },
  { name: 'perimeter', unit: 'm', label: 'Tower plate perimeter = 2 × (width + depth)' },
  { name: 'minSide', unit: 'm', label: 'Shorter plan side of the tower' },
  { name: 'maxSide', unit: 'm', label: 'Longer plan side of the tower' },
  { name: 'slenderness', unit: 'ratio', label: 'height ÷ shorter plan side' },
  { name: 'coreShare', unit: 'ratio', label: 'Core area as a share of the plate (0–1)', note: 'Sized to the lifts or set by hand (team assumption)' },
  { name: 'coreArea', unit: 'm²', label: 'Core area on a typical floor' },
  { name: 'netToGross', unit: 'ratio', label: '1 − core share', note: 'Core only; columns, walls and shafts outside the core are not deducted (team assumption)' },
  { name: 'plantFloors', unit: 'count', label: 'Mechanical (plant) floors' },
  { name: 'skyLobbies', unit: 'count', label: 'Sky lobby floors' },
  { name: 'gfa', unit: 'm²', label: 'Gross floor area, all floors' },
  ...USE_IDS.map((u) => ({ name: `gfa_${u}`, unit: 'm²', label: `Gross floor area: ${USES[u].label.toLowerCase()}` })),
]

export const PROJECT_VARS: VarInfo[] = [
  { name: 'towerCount', unit: 'count', label: 'Towers in the project' },
  { name: 'siteArea', unit: 'm²', label: 'Site area', note: 'Competition site only (brief p.15, 79.2 × 144.8 m); not available in Real Vancouver' },
  { name: 'gfa', unit: 'm²', label: 'Gross floor area, all towers' },
  ...USE_IDS.map((u) => ({ name: `gfa_${u}`, unit: 'm²', label: `Gross floor area, all towers: ${USES[u].label.toLowerCase()}` })),
  { name: 'fsr', unit: 'ratio', label: 'Gross floor area ÷ site area', note: 'Gross, no exclusions; not available in Real Vancouver' },
  { name: 'maxHeight', unit: 'm', label: 'Tallest tower' },
  { name: 'groundElevation', unit: 'm', label: 'Ground elevation, geodetic', note: 'Real Vancouver only (follows the terrain under the selected tower unless set by hand); not available on the competition site' },
  { name: 'isVtc', unit: '0/1', label: '1 on the competition site' },
  { name: 'isCity', unit: '0/1', label: '1 in Real Vancouver' },
]

export const SUN_VARS: VarInfo[] = [
  { name: 'month', unit: 'month', label: 'Month of the sun setting (1–12)' },
  { name: 'day', unit: 'day', label: 'Day of the sun setting' },
  { name: 'hour', unit: 'h', label: 'Local hour of the sun setting (decimal)' },
  { name: 'altitude', unit: 'deg', label: 'Sun altitude', note: 'Approximate formula (±0.5°), unverified' },
  { name: 'azimuth', unit: 'deg', label: 'Sun azimuth, clockwise from true north', note: 'Approximate formula (±0.5°), unverified' },
]

/** Every name a formula may read, besides params.<id>. */
export const VARIABLES: VarInfo[] = [
  ...TOWER_VARS.map((v) => ({ ...v, name: `tower.${v.name}` })),
  ...PROJECT_VARS.map((v) => ({ ...v, name: `project.${v.name}` })),
  ...SUN_VARS.map((v) => ({ ...v, name: `sun.${v.name}` })),
]
export const VARIABLE_NAMES = VARIABLES.map((v) => v.name)

export interface Layer0Input {
  project: 'vtc' | 'city'
  towers: Tower[]
  sun: { month: number; day: number; hour: number }
  groundElevation: number
}

/** Values are numbers, or null where this project doesn't have the input. */
export type Values = Record<string, number | null>
export interface Layer0Summary { project: Values; sun: Values; towers: { id: string; name: string; values: Values }[] }

function towerValues(t: Tower): Values {
  const floors = towerFloors(t)
  const gfa = gfaByUse([t])
  const podium = t.podiumHeight > 0
  const plate = t.width * t.depth
  const core = coreSide(t) ** 2
  const v: Values = {
    height: t.height,
    width: t.width,
    depth: t.depth,
    rotation: t.rotation,
    f2f: t.f2f,
    floors: floors.length,
    towerFloors: floors.filter((f) => !f.podium).length,
    podiumFloors: floors.filter((f) => f.podium).length,
    podiumHeight: podium ? t.podiumHeight : 0,
    podiumWidth: podium ? t.podiumWidth : 0,
    podiumDepth: podium ? t.podiumDepth : 0,
    podiumArea: podium ? t.podiumWidth * t.podiumDepth : 0,
    plateArea: plate,
    perimeter: 2 * (t.width + t.depth),
    minSide: Math.min(t.width, t.depth),
    maxSide: Math.max(t.width, t.depth),
    slenderness: t.height / Math.max(1e-9, Math.min(t.width, t.depth)),
    coreShare: t.coreShare,
    coreArea: core,
    netToGross: netToGross(t),
    plantFloors: floors.filter((f) => f.use === 'mechanical' && !f.podium).length,
    skyLobbies: floors.filter((f) => f.skyLobby).length,
    gfa: Object.values(gfa).reduce((a, b) => a + b, 0),
  }
  for (const u of USE_IDS) v[`gfa_${u}`] = gfa[u]
  return v
}

export function layer0Summary(input: Layer0Input): Layer0Summary {
  const towers = input.towers.map((t) => ({ id: t.id, name: t.name, values: towerValues(t) }))
  const vtc = input.project === 'vtc'
  const gfa = gfaByUse(input.towers)
  const total = Object.values(gfa).reduce((a, b) => a + b, 0)
  const project: Values = {
    towerCount: input.towers.length,
    siteArea: vtc ? SITE.area : null,
    gfa: total,
    fsr: vtc ? total / SITE.area : null,
    maxHeight: input.towers.length ? Math.max(...input.towers.map((t) => t.height)) : 0,
    groundElevation: vtc ? null : input.groundElevation,
    isVtc: vtc ? 1 : 0,
    isCity: vtc ? 0 : 1,
  }
  for (const u of USE_IDS) project[`gfa_${u}`] = gfa[u]
  const s = sunPosition(vancouverTime(input.sun.month, input.sun.day, input.sun.hour))
  const sun: Values = { month: input.sun.month, day: input.sun.day, hour: input.sun.hour, altitude: s.altitude, azimuth: s.azimuth }
  return { project, sun, towers }
}

/** Flat name → value map for one tower (or the project when towerIndex is null), plus the node's parameters. */
export function scopeVars(s: Layer0Summary, towerIndex: number | null, params: Record<string, number> = {}): Values {
  const out: Values = {}
  for (const [k, v] of Object.entries(s.project)) out[`project.${k}`] = v
  for (const [k, v] of Object.entries(s.sun)) out[`sun.${k}`] = v
  if (towerIndex !== null) for (const [k, v] of Object.entries(s.towers[towerIndex]?.values ?? {})) out[`tower.${k}`] = v
  for (const [k, v] of Object.entries(params)) out[`params.${k}`] = v
  return out
}
