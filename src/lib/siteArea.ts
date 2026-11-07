// The site area every check reads, for both projects (node audit, 7 Nov: on Real Vancouver, City in Nature, the
// Exceptional Downtown Site test and the land value said "needs a site area" although the study site, and so its area,
// was known). The competition site: its block, from the brief. Real Vancouver: the study site's area as the Site step
// works it out (lib/siteParcels.ts: the joined City parcels or the drawn boundary), with that source and flag; null
// until a study site is chosen. FSR already divided by it (hooks/useResults.ts); now the other checks do too.
import { ringMetrics, validateRing } from '../engine/site'
import type { Flag } from '../engine/types'
import { BRIEF, SITE } from '../engine/vtcRules'
import { useStore, type ProjectKind } from '../store'
import { boundarySource } from './siteParcels'
import { useSiteStore, type SiteAreaInfo, type StudySite } from './siteStore'

export interface ProjectSiteArea {
  /** m²; null when Real Vancouver has no study site yet. */
  area: number | null
  basis: 'block' | 'parcels' | 'boundary' | null
  source: string
  flag: Flag
}

export const BLOCK_AREA_SOURCE = `${BRIEF}, p.15: about 79.2 × 144.8 m (260 × 475 ft)`

/**
 * `study` is the Site step's answer (parcels or boundary); until the Site step has worked it out in this session (it
 * runs while the site's map layers are up), the study site's own boundary stands in, with the same source and flag.
 */
export function projectSiteArea(project: ProjectKind, study: SiteAreaInfo | null, site: StudySite | null = null): ProjectSiteArea {
  if (project === 'vtc') return { area: SITE.area, basis: 'block', source: BLOCK_AREA_SOURCE, flag: 'verified' }
  if (!study && site && !validateRing(site.ring)) { const b = boundarySource(site); return { area: ringMetrics(site.ring).area, basis: 'boundary', source: b.source, flag: b.flag } }
  if (!study) return { area: null, basis: null, source: 'No study site yet: choose one in the Site step.', flag: 'unresolved' }
  return { area: study.area, basis: study.basis, source: study.source, flag: study.flag }
}

/** The site area for the open project, with where it comes from. */
export function useProjectSiteArea(): ProjectSiteArea {
  const project = useStore((s) => s.project)
  const study = useSiteStore((s) => s.fsrArea)
  const site = useStore((s) => s.citySite)
  return projectSiteArea(project, project === 'city' ? study : null, project === 'city' ? site : null)
}

/** One line saying which area a check divided by. */
export const siteAreaNote = (a: ProjectSiteArea) => a.area === null ? a.source
  : `Site ${Math.round(a.area).toLocaleString('en-CA')} m² (${a.basis === 'block' ? 'the competition block' : a.basis === 'parcels' ? 'the joined City parcels' : 'the study site boundary'}; ${a.source}).`
