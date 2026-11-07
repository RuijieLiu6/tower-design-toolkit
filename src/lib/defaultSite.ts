// One click from the competition site to the real city (Ruijie, 6 Nov: "switch from competition site to the actual
// vancouver context with one click and allow the model to assume a default site that is within the Vancouver Tall
// Policy region where it allows you to build taller"). Switching to Real Vancouver:
//   - with no study site yet, the default site is set: the Granville / W Pender / Howe / Dunsmuir block, chosen by the
//     6 Nov research (04 Tool Plan/research/default-site/DEFAULT_SITE.md; src/data/defaultSite.json). It is 97.9% of the
//     competition block, covered only by the Queen Elizabeth Park 3.2.3 cone (relaxable by the Higher Buildings route),
//     66 m from Granville station. Whether it lies inside the policy's Figure 1 area is UNRESOLVED until a person
//     reads it; the site's note and flags say so.
//   - with no tower there yet, the competition design comes along: every tower turned so the competition block's long
//     side runs along the real block's (the downtown grid, 45.2° from east, as the competition grid is 45° from north),
//     centred on the site.
// One undo step undoes both. A site already chosen is kept, and so are towers placed or changed there.
import type { StudySite } from '../engine/site'
import { ringMetrics } from '../engine/site'
import type { Tower } from '../engine/types'
import data from '../data/defaultSite.json'
import { breakStep } from './project/history'
import { normalizeDeg } from './towerEdit'
import { useStore } from '../store'

type Pt = [number, number]

export const DEFAULT_CITY_SITE: StudySite = {
  ring: data.ring as Pt[], source: data.source as StudySite['source'], note: data.note, label: data.label,
  replaced: [], keepReplaced: data.keepReplaced, parcelsAdd: [], parcelsSkip: [],
  ...(data.parcelLayer ? { parcelLayer: data.parcelLayer } : {}), ...(data.areaBasis ? { areaBasis: data.areaBasis as StudySite['areaBasis'] } : {}),
} as StudySite

/** Direction of the ring's longest side (degrees counter-clockwise from +x, in [0, 180)). */
export function longSideDeg(ring: Pt[]): number {
  let best = 0, deg = 0
  ring.forEach((a, i) => {
    const b = ring[(i + 1) % ring.length], l = Math.hypot(b[0] - a[0], b[1] - a[1])
    if (l > best) { best = l; deg = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI }
  })
  return ((deg % 180) + 180) % 180
}

/**
 * The competition design moved onto a real site: turned by the angle between the competition block's long side (+x of
 * its grid, centred on the origin) and the site's, then centred on the site. Pure; the towers keep their ids.
 */
export function competitionToCity(towers: Tower[], ring: Pt[]): Tower[] {
  const turn = longSideDeg(ring), r = (turn * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r)
  const [cx, cy] = ringMetrics(ring).centre
  const r3 = (v: number) => Math.round(v * 1000) / 1000
  return towers.map((t) => ({ ...t, x: r3(cx + t.x * c - t.y * s), y: r3(cy + t.x * s + t.y * c), rotation: normalizeDeg(t.rotation + turn) }))
}

/** Switch to Real Vancouver, setting the default site and bringing the design when there is none there yet. */
export function openInRealVancouver(): { site: boolean; towers: number } {
  const s = useStore.getState()
  const site = !s.citySite
  // Real Vancouver still empty, or holding only its untouched starting tower: the design comes along (replacing it).
  const pristine = JSON.stringify(s.towers.city) === JSON.stringify(useStore.getInitialState().towers.city)
  const bring = (s.towers.city.length === 0 || pristine) && s.towers.vtc.length > 0
  if (site || bring) {
    breakStep()
    const ring = (s.citySite?.ring ?? DEFAULT_CITY_SITE.ring) as Pt[]
    useStore.setState({
      ...(site ? { citySite: DEFAULT_CITY_SITE } : {}),
      ...(bring ? { towers: { ...s.towers, city: competitionToCity(s.towers.vtc, ring) } } : {}),
    })
    breakStep()
  }
  useStore.getState().setProject('city')
  const n = bring ? s.towers.vtc.length : 0
  if (site || bring) {
    useStore.setState({
      announce: [
        site ? `Real Vancouver: default site ${DEFAULT_CITY_SITE.label ?? ''} (Higher Buildings Policy area not yet confirmed; change it in the Site step).` : 'Real Vancouver.',
        bring ? `Your ${n} tower${n === 1 ? '' : 's'} from the competition site ${n === 1 ? 'stands' : 'stand'} on it, turned to the street grid. Ctrl+Z undoes it.` : '',
      ].join(' ').trim(),
    })
  }
  return { site, towers: n }
}
