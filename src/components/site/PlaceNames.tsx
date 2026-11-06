// The map's place names as the way to a neighbourhood (Ruijie, 4 Nov: take "Or start from a neighbourhood" out of the
// Site step and let the neighbourhood names on the map zoom to their neighbourhood when clicked). The names are Vista's
// 34 labels plus the City local areas Vista does not name (Dunbar-Southlands, Kerrisdale, Killarney, Marpole, Oakridge,
// Renfrew-Collingwood, Sunset, Victoria-Fraserview, West Point Grey), at the City's label point. A click on a local
// area's name fits the view to its City boundary; any other name (Gastown, Stanley Park, Yaletown…) flies to a 700 m
// square around it. In the Site step the place is also marked (dashed boundary, marker, note), as the list did.
// Water names (Burrard Inlet, English Bay, False Creek, Lost Lagoon) do not answer. The clicks: VistaLook usePlacePicks.
import { useMemo } from 'react'
import type { Pt } from '../../engine/site'
import { pointInRing } from '../../engine/viewCones'
import { sampleTerrain, type Footprint, type HeightGrid } from '../../lib/cityLayers'
import { useLocalAreas, type Neighbourhood } from '../../lib/localAreas'
import { tell, useSiteStep } from '../../lib/siteActions'
import { useSiteStore } from '../../lib/siteStore'
import { useStep } from '../../lib/step'
import { useViewFromStore } from '../../lib/viewFromStore'
import { useStore } from '../../store'
import { useCityData } from '../CityContext'
import { useHeightSurface } from '../HeightSurface'
import { useSolar } from '../../hooks/useSolarAccess'
import { flyToFit, PlaceLabels, type PlaceLabel, type PlacePick } from '../VistaLook'

const WATER = /Inlet|Bay|Creek|Lagoon|Harbour$/
export const LOCAL_AREA_SOURCE = 'City local area (OGL-Vancouver, 2026-11-03)'
const VISTA_SOURCE = "Vista's place label (Ruijie Liu)"
/** Half the side of the square a name that is not a local area flies to (m). */
const PLACE_HALF = 350

/** The outline's points on the ground (the terrain where it has loaded, else the project ground). */
export function onGround(rings: Pt[][], grids: HeightGrid[] | undefined): [number, number, number][] {
  const g = useStore.getState().groundElevation
  return rings.flat().map(([x, y]) => [x, y, grids ? Math.max(0, sampleTerrain(grids, x, y) ?? g) : g])
}

const inSiteStep = () => useStep.getState().step === 'site' && useStore.getState().phase === 'basic'

/** Fly to a place so its outline fills the view (north up); in the Site step also mark it. The site does not move. */
function goTo(label: string, at: Pt, rings: Pt[][], kind: 'neighbourhood' | 'street', source: string, area: string | null, grids: HeightGrid[] | undefined) {
  flyToFit(onGround(rings, grids))
  if (!inSiteStep()) return
  useSiteStore.getState().set({ marker: { at, label, kind, source } })
  useSiteStep.setState({ area })
  tell(`${label} is in view and marked${area ? ' (dashed line: its boundary)' : ''}. Your site has not moved: type an address there, or click the map to pick a lot or a building.`)
}

const square = ([x, y]: Pt, h: number): Pt[][] => [[[x - h, y - h], [x + h, y - h], [x + h, y + h], [x - h, y + h]]]

/**
 * The local areas with at least one building of the 3D model inside (a footprint's first corner within the boundary).
 * Ruijie (4 Nov): an area wholly outside the buildings is left out, not offered with an empty view. Since the
 * OpenStreetMap fill (4 Nov) the buildings reach every one of the 22; null until the city has loaded (show all).
 */
export function withBuildings(areas: readonly Neighbourhood[], footprints: readonly Footprint[] | undefined): Set<string> | null {
  if (!footprints?.length) return null
  const out = new Set<string>()
  for (const a of areas) {
    const [x0, y0, x1, y1] = a.bounds
    for (const f of footprints) {
      const [x, y] = f.outer[0]
      if (x < x0 || x > x1 || y < y0 || y > y1) continue
      if (a.rings.some((r) => pointInRing([x, y], r))) { out.add(a.name); break }
    }
  }
  return out
}

/** No other map tool is taking clicks: placing a tower, drawing or picking a site, a box over lots, an eye-level view, drawing a height-surface area, editing the sun-hours area. */
function idle(): boolean {
  const st = useStore.getState(), vf = useViewFromStore.getState()
  return st.project === 'city' && !st.placing && !vf.picking && !vf.looking && !useHeightSurface.getState().drawing && !useSiteStore.getState().tool && !useSiteStep.getState().box && !useSolar.getState().editing
}

/** Vista's place names over the Real Vancouver view, each one a way there (Viewport.tsx). */
export function SitePlaceLabels() {
  const areas = useLocalAreas()
  const { data } = useCityData()
  const marker = useSiteStore((s) => s.marker)
  const step = useStep((s) => s.step)
  const phase = useStore((s) => s.phase)
  const built = useMemo(() => withBuildings(areas ?? [], data?.footprints), [areas, data])
  const extra = useMemo<PlaceLabel[]>(() => (areas ?? []).filter((a) => !built || built.has(a.name)).map((a) => ({ text: a.name, x: a.at[0], y: a.at[1], z: 0, ext: true })), [areas, built])
  const pick = useMemo<PlacePick>(() => ({
    can: (text) => !WATER.test(text) || text === 'Coal Harbour',
    idle,
    go: (l) => {
      const a = areas?.find((k) => k.name === l.text)
      if (a) goTo(a.name, a.at, a.rings, 'neighbourhood', LOCAL_AREA_SOURCE, a.name, data?.grids)
      else goTo(l.text, [l.x, l.y], square([l.x, l.y], PLACE_HALF), 'street', VISTA_SOURCE, null, data?.grids)
    },
  }), [areas, data])
  const site = step === 'site' && phase === 'basic'
  return <PlaceLabels extra={extra} pick={pick} active={site ? marker?.label ?? null : null} />
}
