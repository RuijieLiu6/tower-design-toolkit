// Case-study towers for "Start your massing" (Sinnie Choi's Toolkit build, artifact 1794900977-6d89, ported 17 Nov
// 2026 at Ruijie's request; source of the design: her build and github.com/xubynii/towerdesigntool). Each row is a
// known tower with its published height and storeys and an approximate plate and podium; picking one places a tower
// with those numbers, then asks where it stands. Every number is hers and unverified (no source opened here), so each
// row keeps the flag; her note says what is simplified. Plans and podiums approximate; twists and tapers not modelled.
export interface CaseStudy {
  id: string; name: string; place: string; architect: string; year: number
  height: number; storeys: number; width: number; depth: number
  podiumHeight: number; podiumWidth: number; podiumDepth: number
  note: string
}

export const CASE_STUDIES: CaseStudy[] = [
  { id: 'shangri-la-vancouver', name: 'Shangri-La Vancouver', place: 'Vancouver', architect: 'James K.M. Cheng', year: 2008, height: 201, storeys: 62, width: 42, depth: 26, podiumHeight: 15, podiumWidth: 60, podiumDepth: 40, note: 'Slender slab over a hotel podium; plate and podium approximate.' },
  { id: 'trump-vancouver', name: 'Trump International Hotel & Tower', place: 'Vancouver', architect: 'Arthur Erickson', year: 2016, height: 188, storeys: 63, width: 30, depth: 30, podiumHeight: 10, podiumWidth: 45, podiumDepth: 40, note: 'The 45° twist at mid-height is not modelled.' },
  { id: 'st-mary-axe', name: '30 St Mary Axe', place: 'London', architect: 'Foster + Partners', year: 2004, height: 180, storeys: 41, width: 49, depth: 49, podiumHeight: 0, podiumWidth: 49, podiumDepth: 49, note: 'Round, bulging plan: modelled as its widest square.' },
  { id: 'vancouver-house', name: 'Vancouver House', place: 'Vancouver', architect: 'BIG', year: 2020, height: 150, storeys: 59, width: 40, depth: 24, podiumHeight: 10, podiumWidth: 60, podiumDepth: 40, note: 'The base narrows to a triangle and widens as it rises: modelled as its upper plate.' },
  { id: 'one-wall-centre', name: 'One Wall Centre', place: 'Vancouver', architect: 'Busby + Associates', year: 2001, height: 150, storeys: 48, width: 44, depth: 26, podiumHeight: 8, podiumWidth: 55, podiumDepth: 40, note: 'Elliptical plan: modelled as its bounding box.' },
  { id: '432-park', name: '432 Park Avenue', place: 'New York', architect: 'Rafael Viñoly', year: 2015, height: 426, storeys: 85, width: 28.5, depth: 28.5, podiumHeight: 0, podiumWidth: 28.5, podiumDepth: 28.5, note: 'A square tube; the open double-storey mechanical floors are not modelled.' },
  { id: 'aqua-chicago', name: 'Aqua', place: 'Chicago', architect: 'Studio Gang', year: 2009, height: 262, storeys: 82, width: 50, depth: 28, podiumHeight: 25, podiumWidth: 75, podiumDepth: 55, note: 'The wavy balconies are not modelled.' },
  { id: 'leadenhall', name: 'The Leadenhall Building', place: 'London', architect: 'Rogers Stirk Harbour + Partners', year: 2014, height: 225, storeys: 52, width: 50, depth: 45, podiumHeight: 0, podiumWidth: 50, podiumDepth: 45, note: 'The tapering wedge and the open base are not modelled: the base plate is used.' },
  { id: 'vancouver-point-tower', name: 'Vancouver point tower', place: 'Downtown Vancouver (type)', architect: 'Typical residential', year: 2020, height: 110, storeys: 36, width: 25, depth: 25, podiumHeight: 12, podiumWidth: 40, podiumDepth: 35, note: 'A typical slim residential tower (about 625 m² plate) on a townhouse podium.' },
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
