// Solar frame (research P02-M01): sun position from explicit UTC instants, Pacific Time as BC keeps it, and the
// study windows of the Downtown Peninsula Solar Access Guidelines. Deterministic; no browser time-zone data is used.
//
// Sun position: NOAA GML solar calculator equations (Meeus, Astronomical Algorithms), with NOAA's refraction model,
// as documented at https://gml.noaa.gov/grad/solcalc/calcdetails.html. Accuracy is a fraction of a tenth of a degree
// for this century, against the 0.5° of the older preview formula in engine/sun.ts.

const RAD = Math.PI / 180
const DEG = 180 / Math.PI

/** Downtown Vancouver (about Georgia and Granville). */
export const DOWNTOWN = { lat: 49.2827, lon: -123.1207 }

export interface SunPos {
  /** Degrees clockwise from true north. */
  azimuth: number
  /** Apparent altitude (refraction included), degrees above the horizon. */
  altitude: number
}

/** Sun position at a UTC instant (ms since epoch or Date). Longitude is positive east. */
export function solarPosition(utc: number | Date, lat = DOWNTOWN.lat, lon = DOWNTOWN.lon): SunPos {
  const ms = typeof utc === 'number' ? utc : utc.getTime()
  const jd = ms / 86400000 + 2440587.5
  const jc = (jd - 2451545) / 36525
  const l0 = (280.46646 + jc * (36000.76983 + jc * 0.0003032)) % 360
  const m = 357.52911 + jc * (35999.05029 - 0.0001537 * jc)
  const e = 0.016708634 - jc * (0.000042037 + 0.0000001267 * jc)
  const c = Math.sin(m * RAD) * (1.914602 - jc * (0.004817 + 0.000014 * jc)) + Math.sin(2 * m * RAD) * (0.019993 - 0.000101 * jc) + Math.sin(3 * m * RAD) * 0.000289
  const omega = 125.04 - 1934.136 * jc
  const lambda = l0 + c - 0.00569 - 0.00478 * Math.sin(omega * RAD)
  const eps0 = 23 + (26 + (21.448 - jc * (46.815 + jc * (0.00059 - jc * 0.001813))) / 60) / 60
  const eps = eps0 + 0.00256 * Math.cos(omega * RAD)
  const decl = Math.asin(Math.sin(eps * RAD) * Math.sin(lambda * RAD))
  const y = Math.tan((eps / 2) * RAD) ** 2
  const eqTime = 4 * DEG * (y * Math.sin(2 * l0 * RAD) - 2 * e * Math.sin(m * RAD) + 4 * e * y * Math.sin(m * RAD) * Math.cos(2 * l0 * RAD)
    - 0.5 * y * y * Math.sin(4 * l0 * RAD) - 1.25 * e * e * Math.sin(2 * m * RAD))
  const minutesUtc = (((ms % 86400000) + 86400000) % 86400000) / 60000
  const tst = (((minutesUtc + eqTime + 4 * lon) % 1440) + 1440) % 1440
  const ha = tst / 4 < 0 ? tst / 4 + 180 : tst / 4 - 180
  const latR = lat * RAD
  const cosZen = Math.sin(latR) * Math.sin(decl) + Math.cos(latR) * Math.cos(decl) * Math.cos(ha * RAD)
  const zen = Math.acos(Math.max(-1, Math.min(1, cosZen)))
  const elev = 90 - zen * DEG
  const azRaw = Math.acos(Math.max(-1, Math.min(1, (Math.sin(latR) * Math.cos(zen) - Math.sin(decl)) / (Math.cos(latR) * Math.sin(zen))))) * DEG
  const azimuth = ha > 0 ? (azRaw + 180) % 360 : (540 - azRaw) % 360
  return { azimuth, altitude: elev + refraction(elev) }
}

/** NOAA's atmospheric refraction correction (degrees) for a geometric elevation. */
export function refraction(elev: number): number {
  if (elev > 85) return 0
  const t = Math.tan(elev * RAD)
  if (elev > 5) return (58.1 / t - 0.07 / t ** 3 + 0.000086 / t ** 5) / 3600
  if (elev > -0.575) return (1735 + elev * (-518.2 + elev * (103.4 + elev * (-12.79 + elev * 0.711)))) / 3600
  return -20.772 / t / 3600
}

// ---- Pacific Time in BC ----------------------------------------------------------------------------------------

/** BC stopped changing clocks: UTC-7 all year from 8 Mar 2026 (BC Gov News 2026AG0013, opened by research P02 r2). */
export const BC_PERMANENT_UTC7_FROM = Date.UTC(2026, 2, 8, 10) // 02:00 PST on 8 Mar 2026

/** Nth weekday of a month (UTC date maths), e.g. the 2nd Sunday of March. */
function nthSunday(year: number, month0: number, n: number): number {
  const first = new Date(Date.UTC(year, month0, 1)).getUTCDay()
  return 1 + ((7 - first) % 7) + (n - 1) * 7
}

/** UTC offset of Pacific Time in BC (hours) at a UTC instant. Before 2026: DST from the 2nd Sunday of March to the 1st Sunday of November. */
export function bcUtcOffset(utcMs: number): -7 | -8 {
  if (utcMs >= BC_PERMANENT_UTC7_FROM) return -7
  const y = new Date(utcMs).getUTCFullYear()
  const start = Date.UTC(y, 2, nthSunday(y, 2, 2), 10) // 02:00 PST
  const end = Date.UTC(y, 10, nthSunday(y, 10, 1), 9) // 02:00 PDT
  return utcMs >= start && utcMs < end ? -7 : -8
}

/** Explicit UTC instant for a wall-clock time at a fixed UTC offset (never the browser's time-zone data). */
export const utcAt = (year: number, month: number, day: number, hour: number, minute: number, offsetH: number) =>
  Date.UTC(year, month - 1, day, hour - offsetH, minute)

/** Pacific wall-clock time in BC (offset looked up from the date itself). */
export function bcClock(year: number, month: number, day: number, hour: number, minute = 0): number {
  const guess = utcAt(year, month, day, hour, minute, -8)
  return utcAt(year, month, day, hour, minute, bcUtcOffset(guess))
}

/** "10:15" for a UTC instant at an offset. */
export function clockLabel(utcMs: number, offsetH: number): string {
  const d = new Date(utcMs + offsetH * 3600000)
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}

// ---- Study windows -----------------------------------------------------------------------------------------------

export interface StudyWindow {
  id: string
  label: string
  /** Inclusive UTC bounds. */
  startUtc: number
  endUtc: number
  /** Offset used to label clock times. */
  offsetH: number
  /** What the clause literally says about the clock. */
  clockText: string
}

/** The year studies are run for (the competition year). */
export const STUDY_YEAR = 2026

/** Guideline windows (Solar Access Guidelines for the Downtown Peninsula, July 2026; see engine/solarRules.ts). */
export function studyWindow(id: 'equinox' | 'robson' | 'cenotaphA' | 'cenotaphB', year = STUDY_YEAR): StudyWindow {
  switch (id) {
    // s.5 p.10: models are set to "Pacific Time (PT, UTC -7) unless otherwise specified".
    case 'equinox': return { id, label: '22 Sep, 10:00–16:00 PT', startUtc: utcAt(year, 9, 22, 10, 0, -7), endUtc: utcAt(year, 9, 22, 16, 0, -7), offsetH: -7, clockText: '10 am to 4 pm PT' }
    case 'robson': return { id, label: '22 Sep, 10:00–15:00 PT', startUtc: utcAt(year, 9, 22, 10, 0, -7), endUtc: utcAt(year, 9, 22, 15, 0, -7), offsetH: -7, clockText: '10 am to 3 pm PT' }
    // s.4.3.1 p.10 says "PST" (UTC-8); BC clocks read UTC-7 on 11 Nov since 2026. Both readings are kept.
    case 'cenotaphA': return { id, label: '11 Nov, 10:00–12:00 PST (UTC-8, literal)', startUtc: utcAt(year, 11, 11, 10, 0, -8), endUtc: utcAt(year, 11, 11, 12, 0, -8), offsetH: -8, clockText: '10 am to 12 pm PST, read literally' }
    case 'cenotaphB': return { id, label: '11 Nov, 10:00–12:00 on the clock (UTC-7)', startUtc: utcAt(year, 11, 11, 10, 0, -7), endUtc: utcAt(year, 11, 11, 12, 0, -7), offsetH: -7, clockText: '10 am to 12 pm on BC clocks' }
  }
}

/** Instants from start to end inclusive at a step (minutes). */
export function instants(w: Pick<StudyWindow, 'startUtc' | 'endUtc'>, stepMin: number): number[] {
  const out: number[] = []
  for (let t = w.startUtc; t <= w.endUtc + 1; t += stepMin * 60000) out.push(t)
  return out
}

/** Whole-day window (sunrise to sunset is filtered later by the altitude cut-off), for the sun-hours map. */
export function dayWindow(month: number, day: number, year = STUDY_YEAR): StudyWindow {
  const startUtc = bcClock(year, month, day, 4)
  const offsetH = bcUtcOffset(startUtc)
  return { id: `day-${month}-${day}`, label: `${day} ${MONTHS[month - 1]}, whole day`, startUtc, endUtc: utcAt(year, month, day, 21, 0, offsetH), offsetH, clockText: 'sunrise to sunset' }
}
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// ---- Model frame -------------------------------------------------------------------------------------------------

/**
 * Unit vector pointing TO the sun in a model frame (x, y, z-up) whose true north lies `northDeg` clockwise from +Y.
 * (The VTC model's north is 45° clockwise from +Y, read from its drawn arrow; the City frame is EPSG:26910 grid north,
 * about 0.09° from true north downtown, 0.12° east of the zone's central meridian: ignored.)
 */
export function sunDirection(p: SunPos, northDeg: number): [number, number, number] {
  const a = (p.azimuth + northDeg) * RAD
  const h = Math.cos(p.altitude * RAD)
  return [Math.sin(a) * h, Math.cos(a) * h, Math.sin(p.altitude * RAD)]
}

/** Runtime self-test values from research P02-M01 (NOAA): 11 Nov 2026 17:00Z, downtown. */
export const SELF_TEST = { utc: Date.UTC(2026, 10, 11, 17, 0), altitude: 12.65, azimuth: 137.2, tolerance: 0.2 }

export function selfTest(): { ok: boolean; altitude: number; azimuth: number } {
  const p = solarPosition(SELF_TEST.utc)
  return { ok: Math.abs(p.altitude - SELF_TEST.altitude) <= SELF_TEST.tolerance && Math.abs(p.azimuth - SELF_TEST.azimuth) <= SELF_TEST.tolerance, ...p }
}
