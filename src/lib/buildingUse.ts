// Real Vancouver building types for the Plain style. One palette across the app: each type is a light, pure tint of the
// design tower's programme colour (engine/types.ts USES), so an office reads as office everywhere and the design tower,
// drawn at full colour with its outline, stays the strongest thing in view. A type comes from OpenStreetMap; an unknown
// type stays "other" (never guessed from height or shape).
import { USES } from '../engine/types'
import { DATA } from './design/tokens'

export type BuildingUse = 'residential' | 'retail' | 'office' | 'hotel' | 'cultural' | 'institutional' | 'transit' | 'other'

export const BUILDING_USES: { id: BuildingUse; label: string; base: string }[] = [
  { id: 'residential', label: 'Residential', base: USES.residential.color },
  { id: 'retail', label: 'Retail / commercial', base: USES.retail.color },
  { id: 'office', label: 'Office', base: USES.office.color },
  { id: 'hotel', label: 'Hotel', base: USES.hotel.color },
  { id: 'cultural', label: 'Cultural & religious', base: USES.civic.color },
  { id: 'institutional', label: 'Institutional (schools, health, civic)', base: USES.amenity.color },
  { id: 'transit', label: 'Transit station', base: DATA.categorical[3] },
  // Unknown is missing data, not a kind: the missing-data grey, whose tint is close to the neutral context.
  { id: 'other', label: 'Other / type unknown', base: DATA.missing },
]

/**
 * Share of white mixed into a programme colour for an existing building: light enough that the design tower, at full
 * colour, stays the most saturated thing in view (checked on Present boards, 3 Nov; 0.35 left offices close to it).
 */
export const TINT = 0.45
/** Legend swatch border: every tint keeps at least 3:1 against it (WCAG 1.4.11, the swatch's boundary). */
export const SWATCH_BORDER = '#3d434b'

const hex = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16))
const toHex = (rgb: number[]) => `#${rgb.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`

/** The building colour of a type: its programme colour mixed with white. */
export function useColor(use: BuildingUse, white = TINT): string {
  const base = BUILDING_USES.find((u) => u.id === use)!.base
  return toHex(hex(base).map((v) => v + (255 - v) * white))
}

/** WCAG relative luminance and contrast ratio, for the palette check. */
export function luminance(c: string): number {
  const [r, g, b] = hex(c).map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
export const contrast = (a: string, b: string) => { const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05) }

/** OpenStreetMap building=* values by type (values not listed, including the generic "yes", are "other"). */
const BY_BUILDING_TAG: Record<string, BuildingUse> = {}
const add = (use: BuildingUse, tags: string) => tags.split(' ').forEach((t) => { BY_BUILDING_TAG[t] = use })
add('residential', 'apartments residential house detached terrace semidetached_house townhouse dormitory bungalow cabin houseboat static_caravan')
add('retail', 'retail commercial kiosk supermarket shop restaurant bank')
add('office', 'office')
add('hotel', 'hotel')
add('cultural', 'church chapel cathedral temple synagogue mosque shrine religious theatre museum community_centre community_hall library')
add('institutional', 'school university college kindergarten hospital clinic nursing_home civic government public fire_station police courthouse military barracks')
add('transit', 'train_station transportation station')

/** Where a building's type comes from, for captions and the legend (codes 0, 1, 2 in vista_buildings.json useBasis). */
export type UseBasis = 'none' | 'osm-building' | 'osm-poi'
export const USE_BASES: UseBasis[] = ['none', 'osm-building', 'osm-poi']

/** A building's type from its OpenStreetMap building=* value. */
export function useFromBuildingTag(tag: string | undefined): { use: BuildingUse; basis: UseBasis } {
  const use = tag ? BY_BUILDING_TAG[tag] : undefined
  return use ? { use, basis: 'osm-building' } : { use: 'other', basis: 'none' }
}

export const USE_BASIS_TEXT: Record<UseBasis, string> = {
  'osm-building': 'OpenStreetMap tag on the building',
  'osm-poi': 'OpenStreetMap point of interest inside the building',
  none: 'no use in OpenStreetMap',
}

/**
 * A building part's type and its source: from the layer (tools/build_vista_buildings.py: the building's own tags, else
 * points of interest inside it), else from Vista's building=* value alone.
 */
export function partUse(v: { use: Uint8Array | null; useBasis: Uint8Array | null; osmType: string[] }, i: number): { use: BuildingUse; basis: UseBasis } {
  if (v.use && v.useBasis) return { use: BUILDING_USES[v.use[i]]?.id ?? 'other', basis: USE_BASES[v.useBasis[i]] ?? 'none' }
  return useFromBuildingTag(v.osmType[i])
}
