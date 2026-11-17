// Case-study towers for "Start your massing" (Sinnie Choi's Toolkit build, artifact 1794900977-6d89, ported 17 Nov
// 2026 at Ruijie's request; source of the design: her build and github.com/xubynii/towerdesigntool). Each row is a
// known tower with its published height and storeys and an approximate plate and podium; picking one places a tower
// with those numbers, then asks where it stands. Height and storeys were checked on 17 Nov 2026 against the CTBUH
// Skyscraper Center page of each tower (the architectural height, the floors above ground); a row with a source is
// verified, and `changed` says where Sinnie's number was corrected. The plate and podium sizes are hers, approximate
// and unverified in every row; her note says what is simplified. Twists and tapers are not modelled. The "point
// tower" is a type, not a building: it has no source and stays unverified.
export interface CaseSource { url: string; /** ISO date the page was read. */ accessed: string; /** What the page is. */ what: string }
export interface CaseStudy {
  id: string; name: string; place: string; architect: string; year: number
  /** Architectural height in metres and floors above ground, as the source gives them. */
  height: number; storeys: number
  /** Plate and podium: approximate, unverified. */
  width: number; depth: number; podiumHeight: number; podiumWidth: number; podiumDepth: number
  /** Height and storeys: `verified` when `source` confirms them, else `unverified`. The plate and podium are always unverified. */
  flag: 'verified' | 'unverified'
  source?: CaseSource
  /** Where the checked number differs from the ported list, the correction made. */
  changed?: string
  note: string
}

const CTBUH = (slug: string, id: number): CaseSource => ({ url: `https://www.skyscrapercenter.com/building/${slug}/${id}`, accessed: '2026-11-17', what: 'CTBUH Skyscraper Center' })

export const CASE_STUDIES: CaseStudy[] = [
  { id: 'shangri-la-vancouver', name: 'Shangri-La Vancouver', place: 'Vancouver', architect: 'James K.M. Cheng', year: 2009, height: 200.9, storeys: 59, width: 42, depth: 26, podiumHeight: 15, podiumWidth: 60, podiumDepth: 40,
    flag: 'verified', source: CTBUH('shangri-la-vancouver', 1639), changed: 'Was 201 m, 62 storeys, 2008: the Skyscraper Center gives 200.9 m, 59 floors, completed 2009.', note: 'Slender slab over a hotel podium; plate and podium approximate.' },
  { id: 'trump-vancouver', name: 'Trump International Hotel & Tower', place: 'Vancouver', architect: 'Arthur Erickson', year: 2016, height: 187.8, storeys: 63, width: 30, depth: 30, podiumHeight: 10, podiumWidth: 45, podiumDepth: 40,
    flag: 'verified', source: CTBUH('trump-international-hotel-tower-vancouver', 2196), changed: 'Was 188 m: the Skyscraper Center gives 187.8 m (listed as 1133 West Georgia); 63 floors confirmed.', note: 'The 45° twist at mid-height is not modelled.' },
  { id: 'st-mary-axe', name: '30 St Mary Axe', place: 'London', architect: 'Foster + Partners', year: 2004, height: 179.8, storeys: 40, width: 49, depth: 49, podiumHeight: 0, podiumWidth: 49, podiumDepth: 49,
    flag: 'verified', source: CTBUH('30-st-mary-axe', 2369), changed: 'Was 180 m, 41 storeys: the Skyscraper Center gives 179.8 m, 40 floors.', note: 'Round, bulging plan: modelled as its widest square.' },
  { id: 'vancouver-house', name: 'Vancouver House', place: 'Vancouver', architect: 'BIG', year: 2020, height: 155.6, storeys: 52, width: 40, depth: 24, podiumHeight: 10, podiumWidth: 60, podiumDepth: 40,
    flag: 'verified', source: CTBUH('vancouver-house', 13987), changed: 'Was 150 m, 59 storeys: the Skyscraper Center gives 155.6 m, 52 floors.', note: 'The base narrows to a triangle and widens as it rises: modelled as its upper plate.' },
  { id: 'one-wall-centre', name: 'One Wall Centre', place: 'Vancouver', architect: 'Busby + Associates', year: 2001, height: 149.8, storeys: 48, width: 44, depth: 26, podiumHeight: 8, podiumWidth: 55, podiumDepth: 40,
    flag: 'verified', source: CTBUH('one-wall-centre', 4069), changed: 'Was 150 m: the Skyscraper Center gives 149.8 m; 48 floors confirmed.', note: 'Elliptical plan: modelled as its bounding box.' },
  { id: '432-park', name: '432 Park Avenue', place: 'New York', architect: 'Rafael Viñoly', year: 2015, height: 425.7, storeys: 85, width: 28.5, depth: 28.5, podiumHeight: 0, podiumWidth: 28.5, podiumDepth: 28.5,
    flag: 'verified', source: CTBUH('432-park-avenue', 13227), changed: 'Was 426 m: the Skyscraper Center gives 425.7 m; 85 floors confirmed.', note: 'A square tube; the open double-storey mechanical floors are not modelled.' },
  { id: 'aqua-chicago', name: 'Aqua', place: 'Chicago', architect: 'Studio Gang', year: 2009, height: 261.8, storeys: 86, width: 50, depth: 28, podiumHeight: 25, podiumWidth: 75, podiumDepth: 55,
    flag: 'verified', source: CTBUH('aqua-at-lakeshore-east', 886), changed: 'Was 262 m, 82 storeys: the Skyscraper Center gives 261.8 m, 86 floors (listed as Aqua at Lakeshore East).', note: 'The wavy balconies are not modelled.' },
  { id: 'leadenhall', name: 'The Leadenhall Building', place: 'London', architect: 'Rogers Stirk Harbour + Partners', year: 2014, height: 224.5, storeys: 52, width: 50, depth: 45, podiumHeight: 0, podiumWidth: 50, podiumDepth: 45,
    flag: 'verified', source: CTBUH('the-leadenhall-building', 1194), changed: 'Was 225 m: the Skyscraper Center gives 224.5 m; 52 floors confirmed.', note: 'The tapering wedge and the open base are not modelled: the base plate is used.' },
  { id: 'vancouver-point-tower', name: 'Vancouver point tower', place: 'Downtown Vancouver (type)', architect: 'Typical residential', year: 2020, height: 110, storeys: 36, width: 25, depth: 25, podiumHeight: 12, podiumWidth: 40, podiumDepth: 35,
    flag: 'unverified', note: 'A typical slim residential tower (about 625 m² plate) on a townhouse podium: a type, not a building, so no source.' },
]

/** The tower fields a case study sets: its numbers, and a floor-to-floor that gives its storey count. */
export function caseStudyPatch(c: CaseStudy) {
  const towerHeight = c.height - c.podiumHeight
  const towerStoreys = Math.max(1, c.storeys - (c.podiumHeight > 0 ? Math.max(1, Math.round(c.podiumHeight / 4.5)) : 0))
  return {
    name: c.name, height: c.height, width: c.width, depth: c.depth, f2f: Math.round((towerHeight / towerStoreys) * 100) / 100,
    podiumHeight: c.podiumHeight, podiumWidth: c.podiumWidth, podiumDepth: c.podiumDepth,
  }
}
