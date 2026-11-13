// The few shared shapes Sun & Wind Studio's engines read (from the local-climate-nodes branch's nodes/contract.ts).
import type { Tower } from '../types'
import type { Pt } from '../shadow'

export interface Prism { ring: Pt[]; z0: number; z1: number; source?: string }

export interface SitePayload {
  project: 'vtc' | 'city'
  /** Site boundary (project frame), null when none is set. */
  ring: Pt[] | null
  /** Context buildings around the site (not the proposed towers). */
  context: Prism[]
  /** Latitude and longitude of the site centre. */
  latLon: [number, number]
  /** True north, degrees clockwise from the frame's +y axis (0 in Real Vancouver's UTM frame). */
  northDeg: number
  /** Ground elevation of the project (m, CGVD28) — heights in every payload are above it. */
  ground: number
}

export interface MassingTower { id: string; name: string; height: number; blocks: (Prism & { podium: boolean })[]; tower: Tower }
export interface MassingPayload { towers: MassingTower[] }

/** The hourly typical year, in the shape of Sun & Wind Studio's weather.json (CWEC 2020 for Vancouver Intl AP). */
export interface ClimatePayload {
  source: string
  station: string
  lat: number
  lon: number
  tz: number
  elev: number
  months: string[]
  days: number[]
  temp: number[]
  rain: number[]
  ghi: number[]
  sunshine: number[]
  daylight: number[]
  kd: number[]
  hdd: number
  cdd: number
  windMean: number
  rose?: unknown
  roseMonthly?: unknown
  rainRose?: unknown
  wdrFace?: Record<string, number>
  wdrBins?: number[]
  stormSpeedP95?: number
  hourly: { t: number[]; wd: number[]; ws: number[]; ghi: number[]; dni: number[]; dhi: number[]; rain: number[] }
}

/** A colour band of a field's legend: values up to `to` read as `label`. */
export interface LegendBand { to: number; label: string; color: string }

/** Values per façade (one entry per tower block face or per compass face of a tower). */
export interface FacadeFace { towerId: string; az: number; z0: number; z1: number; area: number; value: number; a?: Pt; b?: Pt }
