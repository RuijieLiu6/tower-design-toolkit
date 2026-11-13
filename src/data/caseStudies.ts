// Case studies to start a massing from (13 Nov, Sinnie: the Massing tool starts with "start from scratch, import, or
// start through case study"). Each is a known tower reduced to the toolkit's massing: one shaft over an optional podium.
// Heights and storey counts are the published figures (to check against the source before quoting); plan dimensions,
// podiums and floor-to-floor are team approximations of the overall form, not survey data. Twists, tapers and setbacks
// are not modelled: the starting box is for scale and proportion only.
import type { Flag } from '../engine/types'

export interface CaseStudy {
  id: string
  name: string
  place: string
  architect: string
  year: number
  /** Published height to the roof, m. */
  height: number
  storeys: number
  /** Approximate typical tower plate, m (team assumption). */
  width: number
  depth: number
  /** Approximate podium, m (0 = none; team assumption). */
  podiumHeight: number
  podiumWidth: number
  podiumDepth: number
  /** What the box leaves out. */
  note: string
  flag: Flag
}

export const CASE_STUDIES: CaseStudy[] = [
  { id: 'shangri-la-vancouver', name: 'Shangri-La Vancouver', place: 'Vancouver', architect: 'James K.M. Cheng', year: 2008, height: 201, storeys: 62,
    width: 42, depth: 26, podiumHeight: 15, podiumWidth: 60, podiumDepth: 40, note: 'Slender slab over a hotel podium; plate and podium approximate.', flag: 'unverified' },
  { id: 'trump-vancouver', name: 'Trump International Hotel & Tower', place: 'Vancouver', architect: 'Arthur Erickson', year: 2016, height: 188, storeys: 63,
    width: 30, depth: 30, podiumHeight: 10, podiumWidth: 45, podiumDepth: 40, note: 'The 45° twist at mid-height is not modelled.', flag: 'unverified' },
  { id: 'st-mary-axe', name: '30 St Mary Axe', place: 'London', architect: 'Foster + Partners', year: 2004, height: 180, storeys: 41,
    width: 49, depth: 49, podiumHeight: 0, podiumWidth: 49, podiumDepth: 49, note: 'Round, bulging plan: modelled as its widest square.', flag: 'unverified' },
  { id: 'vancouver-point-tower', name: 'Vancouver point tower', place: 'Downtown Vancouver (type)', architect: 'Typical residential', year: 2020, height: 110, storeys: 36,
    width: 25, depth: 25, podiumHeight: 12, podiumWidth: 40, podiumDepth: 35, note: 'A typical slim residential tower (about 625 m² plate) on a townhouse podium.', flag: 'unverified' },
]
