// Pedestrian wind: massing screen (research P03-M03, with a reduced P03-M01 wind climate and the P03-M02 triggers).
// Rules-based screening only: per strong-wind sector, downwash exposure, the podium step on the windward side, windward
// corners and gaps between towers, each Low / Medium / High with a reason and its source, and indicative zones on the
// ground. It predicts no speeds and no comfort class (research P03-M03 limits; P03-M04 needs wind-tunnel or CFD factors).
import roseData from '../data/windRoseYVR.json'
import { towerFootprint } from './massing'
import type { Flag, RuleResult, RuleState, Source, Tower } from './types'
import { ANALOG_LABEL, windStudyTriggers } from './windStructure'

export type Level = 'low' | 'medium' | 'high'
export type Season = 'year' | 'winter' | 'summer'
export type Corner = 'sharp' | 'chamfered' | 'rounded' | 'stepped'

export interface WindScreenPresets {
  /** Hourly station speed at or above which an hour counts as strong (km/h, a bin edge). */
  strongKmh: 10 | 20 | 30 | 40
  season: Season
  /** Strong-wind sectors: the fewest that hold this share of strong-wind hours, at most maxSectors. */
  sectorCover: number
  maxSectors: number
  /** Tower height ÷ tallest upwind roof at or above which downwash is High, and Medium. */
  exposureHigh: number
  exposureMedium: number
  /** Podium projection beyond the tower face, toward the wind, that counts as a downwash shelter (m). */
  podiumStepMin: number
  corner: Corner
  /** Indicative zone sizes, as multiples of the windward width (drawing only). */
  zoneDepth: number
  cornerLength: number
}

export const DEFAULT_WIND_SCREEN: WindScreenPresets = { strongKmh: 30, season: 'year', sectorCover: 0.6, maxSectors: 4, exposureHigh: 2, exposureMedium: 1.25, podiumStepMin: 3, corner: 'sharp', zoneDepth: 0.5, cornerLength: 1.2 }

export const SCREEN_LABEL = 'Screening, not CFD: rules rank risk for discussion and predict no wind speeds or comfort classes.'
export const ENGINE_NOTE = 'No credible wind engine runs in a browser yet (research P03-M05): steady CFD needs a server or a consultant, machine-learning surrogates are unvalidated for supertall towers, and at massing stage even CFD is weak on gusts and safety. Wind-tunnel testing by a wind engineer is the evidence a High-trigger tower needs.'

export const SRC = {
  eccc: { label: 'ECCC hourly climate data, Vancouver Intl A (1108395), 2016–2025', url: 'https://climate.weather.gc.ca/climate_data/bulk_data_e.html?format=csv&stationID=51442&timeframe=1' },
  toronto: { label: 'City of Toronto, Pedestrian Level Wind Study Terms of Reference (2022)', url: 'https://www.toronto.ca/wp-content/uploads/2022/03/8f9c-CityPlanning-ToR-Wind-Guide.pdf' },
  hamilton: { label: 'City of Hamilton, Development Application Guidelines: Wind Study (20 Feb 2026)', url: 'https://www.hamilton.ca/sites/default/files/2026-02/pedguidelines-wind-study-ph1proposed.pdf' },
  rwdiGeneral: { label: 'RWDI, IDCP V3 Cambridge MA pedestrian wind study (2021): downwashing, corner acceleration, channelling', url: 'https://www.cambridgema.gov/-/media/files/cdd/zoningdevel/specialpermitsadvisory/sp315/sp315_amend2appappendixa.pdf' },
  rwdiZones: { label: 'RWDI, Watermark Central Cambridge MA pedestrian wind consultation (2016): uses by zone', url: 'https://www.cambridgema.gov/-/media/files/cdd/zoningdevel/specialpermitsadvisory/sp321/sp321_app_wind.pdf' },
  team: { label: 'Team assumption (research P03-M03: cut-offs unsourced and editable)' },
} satisfies Record<string, Source>

// --- Wind climate (reduced P03-M01) -------------------------------------------------------------------------------

export interface RoseBlock { hours: number; calm: number; variable: number; bins: number[][] }
export interface WindRose { station: string; years: number[]; speedEdgesKmh: number[]; comfortWindow: string; seasons: Record<string, string>; notes: string; rose: Record<string, RoseBlock> }
export const YVR_ROSE = roseData as WindRose

export const SECTOR_NAMES = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW']
export interface SectorStat { k: number; name: string; fromDeg: number; all: number; strong: number }

/** Share of comfort-window hours (calms and variable hours in the denominator) per sector, all speeds and strong. */
export function sectorStats(rose: WindRose, season: Season, strongKmh: number): SectorStat[] {
  const b = rose.rose[`${season}.comfort`]
  const from = rose.speedEdgesKmh.indexOf(strongKmh) + 1
  return b.bins.map((row, k) => ({ k, name: SECTOR_NAMES[k], fromDeg: k * 22.5, all: row.reduce((s, x) => s + x, 0) / b.hours, strong: row.slice(from).reduce((s, x) => s + x, 0) / b.hours }))
}

/** The fewest sectors holding `cover` of the strong-wind hours (at most `max`), strongest first. */
export function strongSectors(stats: SectorStat[], cover: number, max: number): (SectorStat & { share: number })[] {
  const total = stats.reduce((s, x) => s + x.strong, 0)
  if (total <= 0) return []
  const sorted = [...stats].sort((a, b) => b.strong - a.strong)
  const out: (SectorStat & { share: number })[] = []
  let acc = 0
  for (const s of sorted) {
    if (out.length >= max || acc >= cover * total - 1e-9) break
    out.push({ ...s, share: s.strong / total }); acc += s.strong
  }
  return out
}

// --- Geometry ------------------------------------------------------------------------------------------------------

type P = [number, number]
export interface ContextBox { footprint: P[]; height: number }
export interface Zone { id: string; tower: string; kind: 'downwash' | 'corner' | 'gap'; level: Level; sector: string; share: number; z: number; poly: P[]; reason: string }
export interface SectorRisk { sector: string; fromDeg: number; share: number; width: number; upwindMax: number | null; ratio: number | null; downwash: Level; podiumStep: number; base: Level; corner: Level }
export interface TowerScreen { tower: string; name: string; height: number; sectors: SectorRisk[] }

const dot = (a: P, b: P) => a[0] * b[0] + a[1] * b[1]
const add = (a: P, b: P, s = 1): P => [a[0] + b[0] * s, a[1] + b[1] * s]
const centroid = (r: P[]): P => [r.reduce((s, p) => s + p[0], 0) / r.length, r.reduce((s, p) => s + p[1], 0) / r.length]
const RANK: Record<Level, number> = { low: 0, medium: 1, high: 2 }
export const maxLevel = (...l: Level[]): Level => l.reduce((a, b) => (RANK[b] > RANK[a] ? b : a), 'low' as Level)

/** Unit vector pointing upwind (toward where the wind comes from) in the model frame; true north at northDeg from +y. */
export function upwind(fromDeg: number, northDeg: number): P {
  const a = ((fromDeg + northDeg) * Math.PI) / 180
  return [Math.sin(a), Math.cos(a)]
}

/** Width of a plan ring seen by a wind along u (projection on the perpendicular). */
export function projectedWidth(ring: P[], u: P): number {
  const p: P = [u[1], -u[0]]
  const v = ring.map((q) => dot(q, p))
  return Math.max(...v) - Math.min(...v)
}

/** Tallest context roof whose centre lies upwind within the radius and within ±halfAngle of the wind direction. */
export function upwindMax(c: P, u: P, context: ContextBox[], radius: number, halfAngle = 22.5): number {
  const cos = Math.cos((halfAngle * Math.PI) / 180)
  let top = 0
  for (const b of context) {
    const q = centroid(b.footprint)
    const d: P = [q[0] - c[0], q[1] - c[1]]
    const len = Math.hypot(d[0], d[1])
    if (len < 1 || len > radius) continue
    if (dot(d, u) / len >= cos) top = Math.max(top, b.height)
  }
  return top
}

// --- Screen --------------------------------------------------------------------------------------------------------

export interface WindScreenResult {
  sectors: (SectorStat & { share: number })[]
  stats: SectorStat[]
  towers: TowerScreen[]
  gaps: { a: string; b: string; clear: number; sector: string; level: Level }[]
  zones: Zone[]
  rules: RuleResult[]
  study: { required: boolean; height: number; triggers: ReturnType<typeof windStudyTriggers> }
  contextLoaded: boolean
}

const rule = (id: string, label: string, value: string, threshold: string, state: RuleState, flag: Flag, source: Source, note?: string): RuleResult => ({ id, label, value, threshold, state, flag, source, note })
const stateOf = (l: Level): RuleState => (l === 'low' ? 'pass' : 'warn')
const LEVEL_WORD: Record<Level, string> = { low: 'Low', medium: 'Medium', high: 'High' }

export function windScreen(towers: Tower[], o: { northDeg: number; context: ContextBox[]; contextLoaded: boolean }, p: WindScreenPresets = DEFAULT_WIND_SCREEN, rose: WindRose = YVR_ROSE): WindScreenResult {
  const stats = sectorStats(rose, p.season, p.strongKmh)
  const sectors = strongSectors(stats, p.sectorCover, p.maxSectors)
  const zones: Zone[] = []
  const screens: TowerScreen[] = []
  const H = Math.max(0, ...towers.map((t) => t.height))

  for (const t of towers) {
    const ring = towerFootprint(t) as P[]
    const pod = t.podiumHeight > 0 && !t.imported ? (towerFootprint(t, true) as P[]) : null
    const c = centroid(ring)
    const others: ContextBox[] = towers.filter((x) => x.id !== t.id).map((x) => ({ footprint: towerFootprint(x) as P[], height: x.height }))
    const radius = Math.max(400, 2 * t.height) // ContextSpec radius, research P03-M02 (2H is a team term)
    const res: SectorRisk[] = []
    for (const s of sectors) {
      const u = upwind(s.fromDeg, o.northDeg)
      const f: P = [-u[0], -u[1]], perp: P = [u[1], -u[0]]
      const w = projectedWidth(ring, u)
      const up = o.contextLoaded || others.length ? upwindMax(c, u, [...o.context, ...others], radius) : null
      const ratio = up === null ? null : up > 0 ? t.height / up : Infinity
      const downwash: Level = ratio === null ? 'high' : ratio >= p.exposureHigh ? 'high' : ratio >= p.exposureMedium ? 'medium' : 'low'
      const front = Math.max(...ring.map((q) => dot([q[0] - c[0], q[1] - c[1]], u)))
      const podFront = pod ? Math.max(...pod.map((q) => dot([q[0] - c[0], q[1] - c[1]], u))) : front
      const step = Math.max(0, podFront - front)
      const sheltered = !!pod && step >= p.podiumStepMin
      // The podium catches downwash before the street: one level lower at grade (benefit size unverified).
      const base: Level = sheltered && downwash !== 'low' ? (downwash === 'high' ? 'medium' : 'low') : downwash
      const corner: Level = p.corner !== 'sharp' ? 'low' : t.height > 100 ? 'high' : 'medium'
      res.push({ sector: s.name, fromDeg: s.fromDeg, share: s.share, width: w, upwindMax: up, ratio, downwash, podiumStep: step, base, corner })

      // Indicative zones (team geometry): a band in front of the windward face, and a wedge off each windward corner.
      const half = w / 2
      const faceMid = add(c, u, front)
      const depth = p.zoneDepth * Math.min(w, t.height)
      const z = sheltered ? t.podiumHeight : 0
      const dw: P[] = [add(faceMid, perp, -half), add(faceMid, perp, half), add(add(faceMid, perp, half), u, depth), add(add(faceMid, perp, -half), u, depth)]
      zones.push({ id: `${t.id}-dw-${s.name}`, tower: t.id, kind: 'downwash', level: sheltered ? downwash : base, sector: s.name, share: s.share, z, poly: dw, reason: sheltered ? `Downwash from ${s.name} lands on the podium roof (step ${step.toFixed(1)} m)` : `Downwash from ${s.name} reaches the ground at the windward face` })
      const pc = (q: P): number => dot([q[0] - c[0], q[1] - c[1]], perp)
      const L = p.cornerLength * Math.min(w, t.height)
      for (const side of [-1, 1]) {
        // The ring vertex furthest to this side (ties: the most windward), where the flow separates.
        const v = ring.reduce((a, q) => (side * pc(q) > side * pc(a) + 0.01 || (Math.abs(pc(q) - pc(a)) <= 0.01 && dot(q, u) > dot(a, u)) ? q : a))
        const out = (k: number): P => add(v, perp, side * k * w)
        const wedge: P[] = [out(0.02), out(0.3), add(out(0.55), f, L), add(out(0.05), f, L)]
        zones.push({ id: `${t.id}-c${side}-${s.name}`, tower: t.id, kind: 'corner', level: maxLevel(corner, base === 'high' ? 'medium' : 'low'), sector: s.name, share: s.share, z: 0, poly: wedge, reason: `Corner stream off the ${side < 0 ? 'left' : 'right'} windward corner, wind from ${s.name}` })
      }
    }
    screens.push({ tower: t.id, name: t.name, height: t.height, sectors: res })
  }

  // Gaps between towers: a gap aligned within one sector of a strong wind channels flow (non-monotonic; Medium at most).
  const gaps: WindScreenResult['gaps'] = []
  for (let i = 0; i < towers.length; i++) for (let j = i + 1; j < towers.length; j++) {
    const A = towers[i], B = towers[j]
    const ra = towerFootprint(A) as P[], rb = towerFootprint(B) as P[]
    const ca = centroid(ra), cb = centroid(rb)
    const d: P = [cb[0] - ca[0], cb[1] - ca[1]], len = Math.hypot(d[0], d[1])
    if (len < 1) continue
    const n: P = [d[0] / len, d[1] / len]
    const clear = Math.max(0, Math.min(...rb.map((q) => dot(q, n))) - Math.max(...ra.map((q) => dot(q, n))))
    if (clear <= 0 || clear > Math.min(A.height, B.height)) continue
    for (const s of sectors) {
      const u = upwind(s.fromDeg, o.northDeg)
      // The gap's axis is perpendicular to the line between the towers: aligned when the wind runs along it.
      const along = Math.abs(dot(u, [n[1], -n[0]]))
      if (along < Math.cos((22.5 * Math.PI) / 180)) continue
      gaps.push({ a: A.id, b: B.id, clear, sector: s.name, level: 'medium' })
      const mid: P = [(ca[0] + cb[0]) / 2, (ca[1] + cb[1]) / 2]
      const axis: P = [n[1], -n[0]]
      const L = Math.max(...[...ra, ...rb].map((q) => Math.abs(dot([q[0] - mid[0], q[1] - mid[1]], axis)))) * 1.6
      zones.push({ id: `gap-${A.id}-${B.id}-${s.name}`, tower: A.id, kind: 'gap', level: 'medium', sector: s.name, share: s.share, z: 0,
        poly: [add(add(mid, n, -clear / 2), axis, -L), add(add(mid, n, clear / 2), axis, -L), add(add(mid, n, clear / 2), axis, L), add(add(mid, n, -clear / 2), axis, L)], reason: `Gap of ${clear.toFixed(0)} m between ${A.name} and ${B.name} aligned with wind from ${s.name}` })
    }
  }

  // --- Results --------------------------------------------------------------------------------------------------
  const triggers = windStudyTriggers(H)
  const asking = triggers.filter((x) => x.state === 'warn')
  const pct = (x: number) => `${Math.round(x * 100)}%`
  const rules: RuleResult[] = [
    rule('wind-study', 'Wind study required?', asking.length ? `Yes by ${asking.length} of 3 analog cities at ${H.toFixed(0)} m (${asking.map((x) => x.jurisdiction.replace(' analog', '').replace(' (downtown)', '')).join(', ')})` : H > 0 ? 'Not by every analog rule: read the trigger node' : 'no tower', 'Toronto Area 1 High over 100 m; Hamilton tunnel study at 44 m+; City of London tunnel or CFD over 100 m', asking.length ? 'warn' : 'unknown', 'verified', { ...SRC.toronto, page: 'Table 1' }, `${ANALOG_LABEL} Vancouver: the Higher Buildings Policy asks for no adverse microclimate effects; no numeric trigger found (research P03, HTTP 403).`),
    rule('wind-climate', 'Strong-wind directions', sectors.length ? sectors.map((s) => `${s.name} ${pct(s.share)}`).join(', ') : 'no strong-wind hours', `sectors holding ${pct(p.sectorCover)} of hours ≥ ${p.strongKmh} km/h, ${p.season === 'year' ? 'all year' : p.season}, ${rose.comfortWindow}`, 'unknown', 'verified', { ...SRC.eccc, page: `${rose.years[0]}–${rose.years[1]}, ${rose.station}` }, `Airport anemometer at 10 m, ${rose.years[1] - rose.years[0] + 1} years (the analog guides ask for 30); no exposure transfer to the site, so the directions are a regional pattern, not site speeds. Strong-wind threshold and sector cover are team choices.`),
  ]
  for (const s of screens) {
    const worst = (k: 'downwash' | 'base' | 'corner') => maxLevel(...s.sectors.map((x) => x[k]))
    const by = (k: 'downwash' | 'base' | 'corner') => (['high', 'medium', 'low'] as Level[]).map((l) => { const names = s.sectors.filter((x) => x[k] === l).map((x) => x.sector); return names.length ? `${LEVEL_WORD[l]} from ${names.join(', ')}` : '' }).filter(Boolean).join('; ')
    const ratios = s.sectors.map((x) => `${x.sector} ${x.ratio === null ? 'open ground' : x.ratio === Infinity ? 'nothing upwind' : `${x.ratio.toFixed(1)}×`}`).join(', ')
    rules.push(
      rule(`downwash-${s.tower}`, `${s.name}: downwash exposure`, by('downwash') || '—', `tower height ÷ tallest upwind roof within max(400 m, 2H): High ≥ ${p.exposureHigh}×, Medium ≥ ${p.exposureMedium}×`, stateOf(worst('downwash')), 'team_assumption', SRC.hamilton, `Mechanism: tall, wide faces intercept the wind and push it down to the base (Toronto ToR, Hamilton). Hamilton's 2× surroundings is a study trigger; using it as a screening cut is a team choice. Ratios: ${ratios}.${o.contextLoaded ? '' : ' Context not loaded: open ground assumed (worst case).'}`),
      rule(`podium-${s.tower}`, `${s.name}: podium step toward the wind`, s.sectors.map((x) => `${x.sector} ${x.podiumStep.toFixed(1)} m`).join(', ') || '—', `≥ ${p.podiumStepMin} m of podium beyond the tower face catches downwash before the street`, stateOf(worst('base')), 'unverified', SRC.rwdiGeneral, 'Direction of the effect is sourced (podium set-back, deep canopies); the size of the benefit and the step depth are not (research P03-M03: calibrate with CFD).'),
      rule(`corner-${s.tower}`, `${s.name}: windward corners`, `${p.corner}${p.corner === 'sharp' ? ` corners on a ${s.height.toFixed(0)} m tower` : ''}: ${LEVEL_WORD[worst('corner')]}`, 'chamfered, rounded, stepped or re-entrant corners rather than sharp corners on a tall windward volume', stateOf(worst('corner')), 'verified', { ...SRC.toronto, page: '6.7.2 building-form strategies' }, 'Qualitative rule; the 100 m cut between Medium and High is a team mapping of Toronto’s High tier.'),
    )
  }
  if (towers.length > 1) rules.push(rule('gaps', 'Gaps aligned with strong winds', gaps.length ? gaps.map((g) => `${g.clear.toFixed(0)} m gap, ${g.sector}`).join('; ') : 'none aligned', 'a through-gap between towers within one 22.5° sector of a strong-wind direction', gaps.length ? 'warn' : 'pass', 'team_assumption', SRC.toronto, 'Channelling is non-monotonic in gap width (an idealised study found larger windy zones at 2× height than 1×), so gaps never rate High (research P03-M03).'))
  rules.push(rule('comfort-targets', 'Comfort class each zone needs', 'sidewalks Walking (Strolling preferred); main entrances Standing; terraces, podium roofs and seating Sitting', 'achieved class not computed: needs wind-tunnel or CFD speed factors (P03-M04)', 'unknown', 'verified', SRC.rwdiZones, 'Classes are named, not judged: the screen predicts no speeds. Criteria sets (Toronto 10/15/20 km/h GEM at 80%, Hamilton, RWDI, Lawson) differ and are analogs, not Vancouver rules.'))

  return { sectors, stats, towers: screens, gaps, zones, rules, study: { required: asking.length > 0, height: H, triggers }, contextLoaded: o.contextLoaded }
}
