// Figures of the outdoor Sun & Wind Studio tools (shadow, sun on the faces, wind, rain) and of Energy use, after the
// Studio's renderSun, renderWind, rain.js and energy.js: the main drawing first, the rest in folded sections.
import { useMemo, type ReactNode } from 'react'
import { prismsToNorth, type FaceSunHours, type ProfilePoint, type RoofYear, type ShadowRange, type StormFaces } from '../../engine/sw/detail'
import { END_USES, TARGETS, type EndUse, type EnergyResult } from '../../engine/sw/energy'
import { ORI, type Face } from '../../engine/sw/plate'
import { keepFor, monthOfHour, rainBySector, type FaceRain, type GroundShelter, type RainBySector, type RoofWater } from '../../engine/sw/rain'
import type { SunGround } from '../../engine/sw/sun'
import type { SunFace, SunImpact } from '../../engine/sw/sunImpact'
import { towerFloors } from '../../engine/massing'
import { useStore } from '../../store'
import type { ClimatePayload, FacadeFace, Prism } from '../../engine/sw/types'
import { ALPHA, lawsonClass, SEASONS, windRose, type Season, type WindStudy } from '../../engine/sw/wind'
import type { Pt } from '../../engine/shadow'
import { useSwInputs } from '../../lib/swInputs'
import { BAND_COL, BAND_NAME, LOSS_COL, useSwOut, type SwId } from '../../lib/swRun'
import { useSwStudy } from '../../lib/swStudy'
import { Compass, RainMonths, Rose, Stack, SunPath } from '../ClimateDrawings'
import { BAD_C, BarRows, Chips, FACE_C, FloorMatrix, Fold, fmtI, GRID, INK, LineChart, MonthStack, Multiples, OK_C, Panel, RAIN_C, RAMP, SUN_C, Tx, WIND_C, YearMap } from './SwCharts'
import { SwFig } from './SwResults'

const FACE_W: Record<Face, string> = { N: 'North', E: 'East', S: 'South', W: 'West' }
const oriOf = (az: number): Face => ORI[Math.round((((az % 360) + 360) % 360) / 90) % 4]
const path = (r: Pt[], X: (v: number) => number, Y: (v: number) => number) => `M${r.map((p) => `${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join('L')}Z`
const USE_NAME: Record<EndUse, string> = { heat: 'Heating', cool: 'Cooling', light: 'Lighting', equip: 'Equipment', dhw: 'Hot water', aux: 'Fans, pumps' }
const USE_COL: Record<EndUse, string> = { heat: '#c2410c', cool: '#2563eb', light: '#eab308', equip: '#64748b', dhw: '#db2777', aux: '#0d9488' }
const PROG_NAME: Record<string, string> = { office: 'Office', retail: 'Retail', hotel: 'Hotel', resi: 'Residential', public: 'Civic', amenity: 'Amenity', mep: 'Plant' }

// ------------------------------------------------------------------ shadow
/** The towers' shadow at each clock hour of a day, in plan with north up (study.js shadowRangeSVG). */
function ShadowFan({ range, site, context, box, small = false, label }: { range: ShadowRange; site: Pt[] | null; context: Prism[]; box?: [number, number, number, number]; small?: boolean; label: string }) {
  const pad = small ? 12 : 24, b = box ?? range.box
  if (!Number.isFinite(b[0])) return null
  const x0 = b[0] - pad, y0 = b[1] - pad, x1 = b[2] + pad, y1 = b[3] + pad
  const W = 300, H = small ? 300 : 230, sc = Math.min((W - 12) / (x1 - x0), (H - 26) / (y1 - y0)), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2
  const X = (x: number) => W / 2 + (x - cx) * sc, Y = (y: number) => H / 2 + 4 - (y - cy) * sc
  const near = context.filter((p) => p.ring.some(([x, y]) => x > x0 && x < x1 && y > y0 && y < y1))
  const fc = range.foot.flat(), fx = fc.reduce((a, p) => a + p[0], 0) / (fc.length || 1), fy = fc.reduce((a, p) => a + p[1], 0) / (fc.length || 1)
  const bar = (small ? 100 : 50) * sc
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={label}>
      <rect width={W} height={H} fill="#f6f7f8" />
      {near.map((p, i) => <path key={i} d={path(p.ring as Pt[], X, Y)} fill="#cfd4da" fillOpacity={0.7} />)}
      {site && <path d={path(site, X, Y)} fill="none" stroke="#2563eb" strokeDasharray="4 3" strokeWidth={small ? 1.6 : 1} />}
      {range.hours.map((s) => <g key={s.h} opacity={0.16}><title>{`${s.h}:00 · sun ${Math.round(s.alt)}° high`}</title>{s.hulls.map((h, i) => <path key={i} d={path(h, X, Y)} fill={SUN_C} />)}</g>)}
      {range.hours.map((s) => <g key={s.h} fill="none" stroke={SUN_C} strokeOpacity={0.8} strokeWidth={small ? 1.4 : 0.8} pointerEvents="none">{s.hulls.map((h, i) => <path key={i} d={path(h, X, Y)} />)}</g>)}
      {range.foot.map((r, i) => <path key={i} d={path(r, X, Y)} fill={INK} fillOpacity={0.85} />)}
      {!small && range.hours.map((s) => {
        let far: Pt = [fx, fy], fd = -1
        for (const h of s.hulls) for (const p of h) { const d = (p[0] - fx) * s.dir[0] + (p[1] - fy) * s.dir[1]; if (d > fd) { fd = d; far = p } }
        return <Tx key={s.h} x={Math.max(8, Math.min(W - 8, X(far[0]) + s.dir[0] * 7))} y={Math.max(18, Math.min(H - 12, Y(far[1]) - s.dir[1] * 7 + 3))} anchor="middle" k>{s.h}</Tx>
      })}
      <line x1={8} x2={8 + bar} y1={H - 7} y2={H - 7} stroke={INK} strokeWidth={small ? 2.4 : 1.5} />
      <Tx x={11 + bar} y={H - 4} size={small ? 15 : 8.5}>{small ? '100 m' : '50 m'}</Tx>
      <Tx x={W - 8} y={small ? 18 : 11} anchor="end" k size={small ? 15 : 8.5}>N ↑</Tx>
      {!range.hours.length && <Tx x={W / 2} y={H / 2} anchor="middle" size={small ? 15 : 8.5}>sun too low</Tx>}
    </svg>
  )
}

const SUN_FACE_NAME: Record<SunFace, string> = { N: 'North', E: 'East', S: 'South', W: 'West', roof: 'Roofs' }
const SUN_FACE_C: Record<SunFace, string> = { ...FACE_C, roof: '#64748b' }
/** The Studio's headline (study.js sunReadings[0]): the face that takes most of the direct sun, and what shades it. */
function sunHeadline(H: SunImpact): ReactNode {
  const walls = ORI as Face[], h = walls.reduce((a, o) => (H.by[o] > H.by[a] ? o : a), 'S' as Face), share = H.by[h] / Math.max(1, H.towerKWh)
  const how = h === 'E' || h === 'W' ? 'Low sun there means vertical fins, egg-crates or deep reveals work; overhangs do little.'
    : h === 'S' ? 'High sun there means an overhang, louvres or a light shelf work well and keep the view.' : 'North sun is low and brief; shading matters less than glazing area.'
  return <>The <b>{FACE_W[h].toLowerCase()}</b> face takes {Math.round(share * 100)}% of the direct sun ({H.intensity[h].toFixed(1)} kWh/m² on a clear day): the first face to shade. {how}</>
}
export function Tile({ name, value, unit, sub, over }: { name: string; value: string; unit?: string; sub: string; over?: boolean }) {
  return (
    <div className="min-w-0 rounded-lg border border-line bg-white p-2.5" data-tile={name}>
      <p className="text-[10px] font-semibold uppercase leading-tight tracking-[0.06em] text-muted">{name}</p>
      <p className={`mt-1 font-mono text-lg font-semibold leading-tight tabular-nums ${over ? 'text-[#b3362b]' : 'text-ink'}`}>{value}{unit && <span className="ml-0.5 text-xs font-normal">{unit}</span>}</p>
      <p className="mt-0.5 text-meta leading-snug text-muted">{sub}</p>
    </div>
  )
}

/** The Studio's report head: "Site impact · <study>", the tallest tower, its height and floors, and when it ran. */
export function ImpactHead({ what, at, color, note }: { what: string; at?: number; color: string; note?: string }) {
  const towers = useSwInputs().towers
  const t = [...towers].sort((a, b) => b.height - a.height)[0]
  const run = at ? new Date(at).toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit', hour12: false }) : null
  return (
    <div className="rounded-lg border border-line bg-white px-3 py-2.5" data-testid="impact-head">
      <h4 className="text-control font-semibold" style={{ color }}>Site impact · {what}</h4>
      <p className="mt-0.5 text-meta text-muted">{t ? `${t.name} · ${Math.round(t.height)} m · ${towerFloors(t).length} floors` : 'No tower'}{run ? ` · run ${run}` : ''}{note ? ` · ${note}` : ''}</p>
    </div>
  )
}

function ShadowBody() {
  const out = useSwOut((s) => s.out['built.sw-shadow'])
  const inp = useSwInputs()
  const s = useSwStudy()
  const sun = useStore((x) => x.sun)
  const ctx = useMemo(() => prismsToNorth(inp.context, inp.north), [inp.context, inp.north])
  const d = out?.data as { g: SunGround; when: string; range: ShadowRange; days: { k: string; label: string; range: ShadowRange }[]; siteRing: Pt[] | null; dateLabel: string; impact?: SunImpact; at?: number } | undefined
  if (!d?.range) return null
  const g = d.g, H = d.impact, period = s.sunScope === 'period', unit = period ? 'h in the period' : 'h', u = period ? 'h' : 'h'
  const all = d.days.flatMap((x) => (Number.isFinite(x.range.box[0]) ? [x.range.box] : []))
  const box = all.length ? all.reduce((a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])] as [number, number, number, number]) : undefined
  const mo = { equinox: 3, summer: 6, autumn: 9, winter: 12 }[s.sunDate]
  const t = [...inp.towers].sort((a, b) => b.height - a.height)[0]
  const floors = t ? towerFloors(t).length : 0
  const run = d.at ? new Date(d.at).toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit', hour12: false }) : null
  const share = g.siteOpen ? g.siteInShadow / g.siteOpen : null
  const day = d.dateLabel.split(' · ')[1]
  return (
    <>
      <ImpactHead what="Sun and shadow" at={d.at} color="#a16207" />
      {H && H.towerKWh > 0 && <p className="border-l-[3px] border-[#d9a441] bg-white py-1.5 pl-2.5 pr-2 text-xs leading-snug text-ink" data-testid="sun-headline">{sunHeadline(H)}</p>}
      <div className="@container"><div className="grid grid-cols-1 gap-1.5 @[26rem]:grid-cols-3" data-testid="sun-tiles">
        <Tile name={`New shadow ≥ ${g.th[0]} ${u}`} value={fmtI(g.a[0])} unit="m²" sub={`${fmtI(g.a[1])} m² ≥ ${g.th[1]} · ${fmtI(g.a[2])} m² ≥ ${g.th[2]}`} />
        <Tile name="Open site shaded" value={share != null ? `${Math.round(share * 100)}%` : '–'} sub={share != null ? `${fmtI(g.siteInShadow)} of ${fmtI(g.siteOpen)} m² ≥ ${g.th[0]} ${u}` : 'no site boundary'} over={share != null && share > 0.25} />
        <Tile name="Sunlight lost by neighbours" value={H ? fmtI(H.lostKWh) : '–'} sub={H ? `kWh, clear day · tower receives ${fmtI(H.towerKWh)}` : 'run again'} />
      </div></div>
      <div className="@container">
        <div className="grid grid-cols-1 gap-3 @[34rem]:grid-cols-2">
          <SwFig explain title={`Shadow range · ${day}`} caption={`${s.h0}:00–${s.h1}:00, hourly. Dashed: the site.`} tip={`The towers' shadow at each clock hour of ${d.dateLabel}, ${s.h0}:00 to ${s.h1}:00, in plan with north up. Each fan is one hour, labelled at its tip; the darker the overlap, the longer the ground stays in shadow. Grey: the buildings around. Dashed blue: the site.`}>
            <ShadowFan range={d.range} site={d.siteRing} context={ctx} label="Shadow range through the study day" />
          </SwFig>
          <SwFig explain title="Sun paths" caption="Solstices and equinox; the current sun marked." tip="The sun's path across the sky on the solstices and the equinox, seen from above: north up, altitude rising towards the centre. Amber: the study date, with the sun at the hour the viewport shows.">
            <div className="mx-auto w-full max-w-[15rem]"><SunPath month={mo} day={21} hour={Math.round(sun.hour)} /></div>
          </SwFig>
        </div>
      </div>
      <SwFig explain title={`Ground newly shaded${period ? ` · ${d.when}` : ''}`} caption="By threshold and on the site; footprints left out." tip={`Ground that the towers newly shade, by how long the new shadow lasts (${d.when}), and the part of it on the open site. "New" shadow is shadow the buildings around do not already cast; the towers' own footprints are left out.`}>
        <BarRows label="Ground newly shaded by threshold" labelW={70} textW={84} rows={[
          ...g.th.map((th, i) => ({ label: `≥ ${th} ${u}`, v: g.a[i], color: SUN_C, text: `${fmtI(g.a[i])} m²`, tip: `${fmtI(g.a[i])} m² of ground gets ${th} ${unit} or more of new shadow.` })),
          { label: 'On the site', v: g.siteInShadow, color: SUN_C, text: g.siteOpen ? `${fmtI(g.siteInShadow)} of ${fmtI(g.siteOpen)}` : '–' },
        ]} />
      </SwFig>
      {H && H.towerKWh > 0 && (
        <div className="@container">
          <div className="grid grid-cols-1 gap-3 @[34rem]:grid-cols-2">
            <SwFig explain title="Sun hours by face · clear day" caption="After the neighbours and the tower's own form." tip={`Hours each face of the towers sees the sun on a clear ${day}, averaged over the face, after the buildings around and the towers' own blocks. Roofs include terraces.`}>
              <BarRows label="Sun hours by face on a clear day" labelW={46} textW={44} rows={(['N', 'E', 'S', 'W', 'roof'] as SunFace[]).map((o) => ({ label: SUN_FACE_NAME[o], v: H.sunH[o], color: SUN_FACE_C[o], text: `${H.sunH[o].toFixed(1)} h` }))} />
            </SwFig>
            <SwFig explain title="Direct sun per m² · clear day" caption="Beam per m² of face; the brightest is the first to shade." tip={`Beam irradiation per m² of each face on a clear ${day} (clear-sky direct sun, kWh/m²), and in total on the face. The brightest face is the first to shade.`}>
              <BarRows label="Direct sun per square metre by face on a clear day" labelW={46} textW={96} rows={(['N', 'E', 'S', 'W', 'roof'] as SunFace[]).map((o) => ({ label: SUN_FACE_NAME[o], v: H.intensity[o], color: SUN_FACE_C[o], text: `${H.intensity[o].toFixed(1)} kWh/m²`, tip: `${SUN_FACE_NAME[o]}: ${H.intensity[o].toFixed(1)} kWh/m², ${fmtI(H.by[o])} kWh over ${fmtI(H.area[o])} m².` }))} />
            </SwFig>
          </div>
        </div>
      )}
      <Fold title="Sample days">
        <SwFig title="Three days · 9:00–16:00" caption="Same scale; hourly outlines." tip="Same scale on each; hourly outlines.">
          <Multiples cols={3}>{d.days.map((x) => <Panel key={x.k} name={x.label}><ShadowFan small range={x.range} site={d.siteRing} context={ctx} box={box} label={`Shadows on ${x.label}`} /></Panel>)}</Multiples>
        </SwFig>
      </Fold>
    </>
  )
}

// ------------------------------------------------------------------ sun on the faces
function SunFacesBody() {
  const out = useSwOut((s) => s.out['built.sw-sun-faces'])
  const d = out?.data as { faces: FacadeFace[]; by: Partial<Record<Face, number>>; sunH: FaceSunHours | null; dateLabel: string } | undefined
  if (!d?.by) return null
  const STOPS = ['#d9e2ec', '#f1dca7', '#e9b562', '#c9822b']
  const col = (v: number) => STOPS[Math.max(0, Math.min(3, Math.round(((v - 200) / 600) * 3)))]
  const day = d.dateLabel.split(' · ')[1]
  // sun by height: each block's faces, area-weighted
  const bands = [...new Map(d.faces.map((f) => [`${Math.round(f.z0)}|${Math.round(f.z1)}`, [f.z0, f.z1]])).values()].sort((a, b) => b[0] - a[0])
  const mx = d.sunH ? Math.max(1, d.sunH.max) : 1
  return (
    <>
      <SwFig title="Sun on each face · kWh/m²" caption="Mean of each compass face over the year." tip="Area-weighted mean of each compass face, after the buildings around.">
        <div className="mx-auto w-full max-w-[15rem]"><Compass label="Annual sun on each face" faces={Object.fromEntries(ORI.filter((o) => d.by[o] != null).map((o) => [o, { v: d.by[o]!, color: col(d.by[o]!), text: `${Math.round(d.by[o]!)}` }]))} /></div>
      </SwFig>
      {d.sunH && <SwFig title={`Sun hours by floor · ${day}`} caption="Column: face. Row: floor. Clear day." tip="Each column a face, each row a floor; dark rows are screened by neighbours.">
        <FloorMatrix label="Sun hours on each face by floor" cols={ORI.map((o) => ({ key: o, label: FACE_W[o] }))} levels={d.sunH.levels} at={(i, o) => d.sunH!.hours[o as Face][i]} color={(v) => RAMP.hours(v / mx)} legend={[[0, '0 h'], [mx / 2, `${(mx / 2).toFixed(0)} h`], [mx, `${mx.toFixed(0)} h`]]} read={(v) => `${v.toFixed(1)} h`} />
      </SwFig>}
      {d.sunH && <Fold title="Sun hours by face">
        <SwFig title={`Sun hours by face · ${day}`} caption="Mean over the floors, clear day." tip="Hours each face sees the sun, mean over the floors.">
          <BarRows label="Sun hours by face" labelW={44} rows={ORI.map((o) => ({ label: FACE_W[o], v: d.sunH!.byFace[o], color: FACE_C[o], text: `${d.sunH!.byFace[o].toFixed(1)} h` }))} />
        </SwFig>
      </Fold>}
      {bands.length > 1 && <Fold title="Sun by height">
        <SwFig title="Sun by height · kWh/m²" caption="Mean of each block's faces, top first." tip="Mean over the faces of each block, top first.">
          <BarRows label="Annual sun by block height" labelW={64} rows={bands.map(([z0, z1]) => { const fs = d.faces.filter((f) => Math.round(f.z0) === Math.round(z0) && Math.round(f.z1) === Math.round(z1)); const A = fs.reduce((a, f) => a + f.area, 0) || 1, v = fs.reduce((a, f) => a + f.value * f.area, 0) / A; return { label: `${Math.round(z0)}–${Math.round(z1)} m`, v, color: col(v), text: `${Math.round(v)} kWh/m²` } })} />
        </SwFig>
      </Fold>}
    </>
  )
}

// ------------------------------------------------------------------ wind
function WindRoses({ C }: { C: ClimatePayload }) {
  const seasons: Season[] = ['winter', 'spring', 'summer', 'fall']
  const year = useMemo(() => windRose(C, 'year'), [C])
  const each = useMemo(() => seasons.map((s) => ({ s, r: windRose(C, s) })), [C]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <SwFig title="Wind rose · the year" caption={`Petal: hours. Colour: speed. ${Math.round((year.calm / Math.max(1, year.hours)) * 100)}% calm.`} tip="Petal length: share of the hours from each direction. Depth of colour: mean speed at 10 m.">
        <div className="mx-auto w-full max-w-[14rem]"><Rose label="Wind rose for the year" color="#3b7fb6" sectors={year.sectors.map((r) => ({ name: r.name, dir: r.dir, f: r.f, s: r.s }))} /></div>
      </SwFig>
      <SwFig title="By season">
        <Multiples>{each.map(({ s, r }) => <Panel key={s} name={SEASONS[s].label.split(' · ')[0]}><Rose size={150} label={`Wind rose, ${SEASONS[s].label}`} color="#3b7fb6" sectors={r.sectors.map((x) => ({ name: x.name, dir: x.dir, f: x.f, s: x.s }))} /></Panel>)}</Multiples>
      </SwFig>
    </>
  )
}

function WindComfortBody() {
  const out = useSwOut((s) => s.out['built.sw-wind-comfort'])
  const C = useSwInputs().C
  const d = out?.data as { w: WindStudy; sec?: DownSec; profile?: ProfilePoint[]; ref?: { U10: number; label: string }; roseP?: ReturnType<typeof windRose>; single?: boolean; period?: string; at?: number } | undefined
  const w = d?.w
  if (!w) return null
  const tot = (c: number[]) => c.reduce((a, b) => a + b, 0) || 1
  const sec = d.sec, single = !!d.single
  const peak = w.sitePeak, mean = w.sitePeakMean
  const ratio = sec ? sec.H / Math.max(8, sec.hn) : 0
  const top = d.profile?.[d.profile.length - 1]
  return (
    <>
      <ImpactHead what="Pedestrian wind" at={d.at} color="#0f766e" />
      {sec && sec.H > 0 && <p className="border-l-[3px] border-[#1F8A8A] bg-white py-1.5 pl-2.5 pr-2 text-xs leading-snug text-ink" data-testid="wind-headline">
        The tower stands {ratio.toFixed(1)}× taller than its neighbours (mean {sec.hn.toFixed(0)} m within 120 m), so downwash can raise ground speeds up to {sec.amp0.toFixed(2)}× within {sec.depth.toFixed(0)} m of the windward face{sec.amp < sec.amp0 ? <>; the podium brings that to {sec.amp.toFixed(2)}×</> : null}.{ratio > 2 && sec.amp >= sec.amp0 ? ' A podium that reaches 10 m or more beyond the tower, or a deep entrance canopy, is the usual fix.' : ''}
      </p>}
      <div className="@container"><div className="grid grid-cols-1 gap-1.5 @[26rem]:grid-cols-3" data-testid="wind-tiles">
        <Tile name="Site wind · mean / peak" value={mean != null && peak != null ? `${mean.toFixed(1)} / ${peak.toFixed(1)}` : '–'} unit={peak != null ? 'm/s' : undefined} sub={peak == null ? 'no open site' : peak > 6 ? 'too windy at the peak' : peak > 4 ? 'walking comfort' : 'sitting comfort'} over={peak != null && peak > 6} />
        <Tile name="Ground made windier" value={fmtI(w.worse)} unit="m²" sub={`${fmtI(w.better)} m² calmer in the lee`} over={w.worse > w.better} />
        <Tile name={single ? 'Peak speed' : 'Peak period mean'} value={w.maxS.toFixed(1)} unit="m/s" sub={single ? 'at pedestrian level' : `gusty over 5% of hours on ${fmtI(w.gusty)} m² (was ${fmtI(w.gustyB)})`} />
      </div></div>
      <SwFig explain title={single ? 'Lawson comfort bands · open ground' : 'Lawson comfort bands · period mean'} caption="With the towers and without; calmest left." tip="Share of the open ground around the towers in each Lawson comfort band, with the towers and without them: sitting up to 2.5, standing 2.5–4, strolling 4–6, walking 6–8, uncomfortable over 8 m/s mean wind at pedestrian height.">
        <StackRowsLawson rows={[{ label: 'With the towers', parts: w.cats.map((c) => c / tot(w.cats)) }, { label: 'Without', parts: w.catsB.map((c) => c / tot(w.catsB)) }]} />
        <Chips items={BAND_NAME.map((n, i) => ({ name: n, color: BAND_COL[i] }))} />
      </SwFig>
      <div className="@container">
        <div className="grid grid-cols-1 gap-3 @[34rem]:grid-cols-2">
          {sec && sec.H > 0 && <SwFig explain title="Downwash section" caption={`×${sec.amp.toFixed(2)} at the ground, ${sec.depth.toFixed(0)} m out.`} tip="The stagnation point near 0.7 H turns the wind down the windward face into a ground vortex; the label is the ground amplification against the free wind. Grey on the left: the neighbours' mean height within 120 m.">
            <DownwashSection s={sec} />
          </SwFig>}
          {single ? (d.roseP && <SwFig explain title={`Wind rose · ${d.period ?? 'the period'}`} caption="Petal: hours. Colour: speed." tip="The time period's wind at the airport: petal length is the share of the hours from each direction, depth of colour the mean speed at 10 m. This run is one wind case from it.">
            <div className="mx-auto w-full max-w-[14rem]"><Rose label="Wind rose for the period" color="#3b7fb6" sectors={d.roseP.sectors.map((r) => ({ name: r.name, dir: r.dir, f: r.f, s: r.s }))} /></div>
          </SwFig>) : (w.sectors?.length > 0 && <SwFig explain title="By sector" caption="Petal: hours. Colour: ground mean." tip="Petal length is the sector's share of the period's hours; depth of colour is the mean wind it gives on the open ground around the towers.">
            <div className="mx-auto w-full max-w-[14rem]"><Rose label="Wind by sector, coloured by the ground mean" color="#1F8A8A" sUnit="m/s ground mean" sectors={w.sectors.map((r) => ({ name: r.name, dir: r.dir, f: r.f, s: r.groundMean, text: `${Math.round(r.f * 100)}% of hours, ground mean ${r.groundMean.toFixed(1)} m/s, ${fmtI(r.worse)} m² a band windier` }))} /></div>
          </SwFig>)}
        </div>
      </div>
      {d.profile && d.profile.length > 0 && <SwFig explain title={`Wind with height · ${d.ref?.label ?? ''}`} caption={`Solid: mean. Dashed: gusts${top ? `, ${(top.q / 1000).toFixed(1)} kPa at the top` : ''}.`} tip={`Power-law profile (exponent ${ALPHA}) from the reference wind at 10 m; gusts 1.8× the mean. Terraces need screens above about 60 m.`}>
        <LineChart label="Wind speed with height" xLabel="m/s" yLabel="height m" marks={[{ y: 60, label: 'terraces need screens above ~60 m' }]} series={[
          { name: 'mean', color: WIND_C, pts: d.profile.map((p) => [p.U, p.z]), read: (x, y) => `${x.toFixed(1)} m/s at ${Math.round(y)} m` },
          { name: 'gust', color: BAD_C, dash: true, pts: d.profile.map((p) => [p.gust, p.z]), read: (x, y) => `${x.toFixed(1)} m/s at ${Math.round(y)} m` },
        ]} />
      </SwFig>}
      {!single && w.sectors?.length > 0 && <Fold title="Ground wind by sector">
        <SwFig title="Ground wind by sector" caption="Bar: ground mean. Colour: Lawson band." tip="Bar: the mean each sector gives on the ground; colour: its Lawson band.">
          <BarRows label="Ground mean wind by sector" labelW={28} textW={96} rows={w.sectors.map((r) => ({ label: r.name, v: r.groundMean, color: BAND_COL[lawsonClass(r.groundMean)], text: `${r.groundMean.toFixed(1)} m/s · ${Math.round(r.f * 100)}% h`, tip: `${r.name}: ${Math.round(r.f * 100)}% of hours at ${r.s.toFixed(1)} m/s (10 m); ground mean ${r.groundMean.toFixed(1)} m/s; ${fmtI(r.worse)} m² a band windier than without the towers` }))} />
        </SwFig>
      </Fold>}
      <Fold title="Gusts and safety">
        <SwFig title="Gusty and unsafe ground" caption="Gusts over 6 m/s; unsafe over 15 m/s." tip="Gusty: over 6 m/s gusts more than 5% of hours. Unsafe: over 15 m/s.">
          <BarRows label="Gusty and unsafe ground" labelW={96} rows={[
            { label: 'Gusty, with towers', v: w.gusty, color: '#E08A3C', text: `${fmtI(w.gusty)} m²` }, { label: 'Gusty, without', v: w.gustyB, color: '#cfd4da', text: `${fmtI(w.gustyB)} m²` },
            { label: 'Unsafe', v: w.unsafe, color: BAD_C, text: `${fmtI(w.unsafe)} m²` },
            { label: 'Made windier', v: w.worse, color: '#E08A3C', text: `${fmtI(w.worse)} m²` }, { label: 'Made calmer', v: w.better, color: '#3E8E7E', text: `${fmtI(w.better)} m²` },
          ]} />
        </SwFig>
      </Fold>
      {C && <Fold title="Wind climate"><WindRoses C={C} /></Fold>}
    </>
  )
}
/** Two 100% rows of the five Lawson bands. */
function StackRowsLawson({ rows }: { rows: { label: string; parts: number[] }[] }) {
  const W = 300, L = 84, pw = W - L - 4
  return (
    <svg viewBox={`0 0 ${W} ${rows.length * 20}`} width="100%" role="img" aria-label="Lawson comfort bands with and without the towers">
      {rows.map((r, i) => { let acc = 0; return <g key={i} transform={`translate(0 ${i * 20})`}><Tx x={L - 4} y={12} anchor="end" k>{r.label}</Tx>{r.parts.map((p, j) => { const x = L + acc * pw; acc += p; return p > 0 ? <g key={j}><rect x={x} y={2} width={p * pw} height={14} fill={BAND_COL[j]}><title>{`${r.label} · ${BAND_NAME[j]}: ${Math.round(p * 100)}%`}</title></rect>{p * pw > 20 && <text x={x + (p * pw) / 2} y={12} textAnchor="middle" fontSize={8} fill="#fff" pointerEvents="none">{Math.round(p * 100)}%</text>}</g> : null })}</g> })}
    </svg>
  )
}

interface DownSec { H: number; w: number; hn: number; amp: number; amp0: number; depth: number; podiumH: number; podiumW: number; U10: number }
/** Wind from the left meets the tower: neighbours' mean height, the stagnation point, the ground vortex (study.js downwashSVG). */
function DownwashSection({ s }: { s: DownSec }) {
  const W = 300, H = 200, gy = H - 26, sc = (gy - 22) / Math.max(60, s.H), tw = Math.max(14, s.w * sc), tx0 = W * 0.62 - tw / 2
  const Y = (h: number) => gy - h * sc, sp = s.H * 0.7, dx = Math.max(14, s.depth * sc)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Downwash section">
      <defs><marker id="sw-ah" viewBox="0 0 6 6" refX={5} refY={3} markerWidth={5} markerHeight={5} orient="auto"><path d="M0,0L6,3L0,6Z" fill={WIND_C} /></marker></defs>
      <line x1={0} x2={W} y1={gy} y2={gy} stroke={INK} strokeWidth={1.2} />
      {s.hn > 0 && <g><rect x={6} y={Y(s.hn)} width={30} height={gy - Y(s.hn)} fill="#cfd4da"><title>{`Neighbours within 120 m: ${s.hn.toFixed(0)} m mean height`}</title></rect><Tx x={6} y={Y(s.hn) - 3} size={8.5}>{s.hn.toFixed(0)} m</Tx></g>}
      {s.podiumH > 0 && <rect x={tx0 - Math.max(0, (s.podiumW - s.w) / 2) * sc} y={Y(s.podiumH)} width={tw + Math.max(0, s.podiumW - s.w) * sc} height={gy - Y(s.podiumH)} fill="#a9b2bc" fillOpacity={0.7}><title>{`Podium ${s.podiumH} m: it catches the downwash`}</title></rect>}
      <rect x={tx0} y={Y(s.H)} width={tw} height={gy - Y(s.H)} fill="#a9b2bc" stroke={INK} strokeWidth={0.8} />
      <Tx x={tx0 + tw / 2} y={Y(s.H) - 4} anchor="middle" k>{Math.round(s.H)} m</Tx>
      {[0.9, 0.6, 0.3].map((t) => { const h = s.H * t, U = s.U10 * Math.pow(Math.max(10, h) / 10, ALPHA), x1 = tx0 - 12, x0 = x1 - (22 + U * 4); return <g key={t}><line x1={x0} x2={x1} y1={Y(h)} y2={Y(h)} stroke={WIND_C} strokeWidth={1.6} markerEnd="url(#sw-ah)"><title>{`${U.toFixed(1)} m/s mean at ${Math.round(h)} m`}</title></line><Tx x={x0 - 3} y={Y(h) + 3} anchor="end" size={8.5}>{U.toFixed(1)}</Tx></g> })}
      <circle cx={tx0} cy={Y(sp)} r={3} fill={WIND_C}><title>Stagnation point near 0.7 of the height: below it the wind turns down the face</title></circle>
      <path d={`M${tx0 - 4},${Y(sp)}Q${tx0 - 10},${Y(sp * 0.5)} ${tx0 - 8},${gy - 6}Q${tx0 - 10},${gy - 2} ${tx0 - dx},${gy - 4}`} fill="none" stroke={WIND_C} strokeWidth={2} markerEnd="url(#sw-ah)" />
      <Tx x={Math.max(64, tx0 - dx / 2)} y={gy + 11} anchor="middle" k>×{s.amp.toFixed(2)} at ground{s.amp !== s.amp0 ? ` (×${s.amp0.toFixed(2)} bare)` : ''} · {s.depth.toFixed(0)} m out</Tx>
      <Tx x={tx0 + tw + 6} y={Y(s.H * 0.4)} size={8.5}>lee</Tx><Tx x={4} y={H - 3} size={8.5}>m/s mean →</Tx>
    </svg>
  )
}

function WindHeightBody() {
  const out = useSwOut((s) => s.out['built.sw-wind-height'])
  const C = useSwInputs().C
  const d = out?.data as { rows: { tower: string; z: number; u: number; band: number; cls: number; season: string }[]; classes?: string[]; classBands?: number[]; criteria?: string; profile: ProfilePoint[]; sec: DownSec; U10: number; H: number } | undefined
  if (!d?.profile) return null
  const top = d.profile[d.profile.length - 1]
  return (
    <>
      <SwFig title="Wind with height" caption={`Solid: mean. Dashed: gusts${top ? `, ${(top.q / 1000).toFixed(1)} kPa at the top` : ''}.`} tip="Power-law profile; gusts 1.8 × the mean.">
        <LineChart label="Wind speed with height" xLabel="m/s" yLabel="height m" marks={[{ y: 60, label: 'screens above ~60 m' }]} series={[
          { name: 'mean', color: WIND_C, pts: d.profile.map((p) => [p.U, p.z]), read: (x, y) => `${x.toFixed(1)} m/s at ${Math.round(y)} m` },
          { name: 'gust', color: BAD_C, dash: true, pts: d.profile.map((p) => [p.gust, p.z]), read: (x, y) => `${x.toFixed(1)} m/s at ${Math.round(y)} m` },
        ]} />
      </SwFig>
      <SwFig title="Downwash section" caption="The face turns the wind down to the street." tip="The face turns the wind down into a ground vortex; the label is the speed-up at the ground.">
        <DownwashSection s={d.sec} />
      </SwFig>
      {d.rows.length > 0 && <Fold title="Roofs and terraces">
        <SwFig title="Wind on each deck" caption={`Worst season. ${d.criteria ?? 'Lawson'} class.`} tip="The speed the criteria read (London: exceeded in 5% of comfort hours), in the windiest season. Colour: the class.">
          <BarRows label="Wind on each roof and terrace" labelW={58} textW={118} max={Math.max(8, ...d.rows.map((r) => r.u)) * 1.05} rows={[...d.rows].reverse().map((r) => ({ label: `${Math.round(r.z)} m`, v: r.u, color: BAND_COL[r.band], text: `${r.u.toFixed(1)} m/s · ${d.classes?.[r.cls] ?? BAND_NAME[r.band]}`, tip: `${r.tower} · deck at ${Math.round(r.z)} m: ${r.u.toFixed(1)} m/s in ${r.season}${d.classes ? `, ${d.classes[r.cls]}` : ''}` }))} />
          <Chips items={(d.classes ?? BAND_NAME).map((n, i) => ({ name: n, color: BAND_COL[d.classBands?.[i] ?? i] }))} />
        </SwFig>
      </Fold>}
      {C && <Fold title="Wind climate"><WindRoses C={C} /></Fold>}
    </>
  )
}

// ------------------------------------------------------------------ rain
const RAIN_BAND_C: Record<string, string> = { sheltered: OK_C, moderate: '#E3C25C', severe: '#E08A3C', 'very severe': BAD_C }
const bandOf = (I: number) => (I / 4 < 33 ? 'sheltered' : I / 4 < 56.5 ? 'moderate' : I / 4 < 100 ? 'severe' : 'very severe')

/** The design storm: where it comes from (plan dial) and how it falls on the tower (section). */
function StormSection({ dir, speed, alphaDeg, H }: { dir: number; speed: number; alphaDeg: number; H: number }) {
  const W = 300, Hh = 120, gy = Hh - 16, a = (alphaDeg * Math.PI) / 180, th = gy - 18, tw = 26, tx = 196
  const lee = Math.min(70, th * Math.tan(a)), dr = (dir * Math.PI) / 180, cx = 46, cy = 54, R = 30
  const ux = -Math.sin(dr), uy = Math.cos(dr)
  return (
    <svg viewBox={`0 0 ${W} ${Hh}`} width="100%" role="img" aria-label={`Design storm from ${Math.round(dir)} degrees at ${speed.toFixed(1)} metres a second, rain ${Math.round(alphaDeg)} degrees from vertical`}>
      <circle cx={cx} cy={cy} r={R} fill="none" stroke={GRID} strokeWidth={2} />
      <Tx x={cx} y={cy - R - 3} anchor="middle" k>N</Tx>
      <line x1={cx - ux * R} y1={cy - uy * R} x2={cx + ux * R * 0.5} y2={cy + uy * R * 0.5} stroke={RAIN_C} strokeWidth={3}><title>{`Storm from ${Math.round(dir)}°`}</title></line>
      <path d={`M${cx + ux * R * 0.8},${cy + uy * R * 0.8}L${cx + ux * R * 0.4 - uy * 6},${cy + uy * R * 0.4 + ux * 6}L${cx + ux * R * 0.4 + uy * 6},${cy + uy * R * 0.4 - ux * 6}Z`} fill={RAIN_C} />
      <Tx x={cx} y={Hh - 3} anchor="middle" k>{Math.round(dir)}° · {speed.toFixed(1)} m/s</Tx>
      <line x1={100} x2={W} y1={gy} y2={gy} stroke={INK} strokeWidth={1.2} />
      {Array.from({ length: 9 }, (_, i) => { const x = 104 + i * 11, len = 16 + (i % 3) * 5, y = 14 + ((i * 23) % 50); return <line key={i} x1={x} y1={y} x2={x + Math.sin(a) * len} y2={y + Math.cos(a) * len} stroke={RAIN_C} strokeWidth={1.2} strokeOpacity={0.7} /> })}
      <rect x={tx} y={gy - th} width={tw} height={th} fill="#a9b2bc" stroke={INK} strokeWidth={0.8} />
      <line x1={tx} x2={tx} y1={gy - th} y2={gy} stroke={RAIN_C} strokeWidth={3}><title>The windward face: wetted, most at the top</title></line>
      <path d={`M${tx + tw},${gy - th}L${tx + tw + lee},${gy}L${tx + tw},${gy}Z`} fill={RAIN_C} fillOpacity={0.1} stroke={RAIN_C} strokeDasharray="3 2" strokeWidth={0.8}><title>{`Rain shadow: about ${Math.round(H * Math.tan(a))} m of ground kept dry in the lee`}</title></path>
      <Tx x={tx + tw / 2} y={gy - th - 4} anchor="middle" k>{Math.round(H)} m</Tx>
      <Tx x={tx + tw + 4} y={gy + 11} k>dry {Math.round(H * Math.tan(a))} m</Tx>
      <Tx x={104} y={gy + 11}>rain {Math.round(alphaDeg)}° off vertical</Tx>
    </svg>
  )
}
/** One face: a bar for each height band, the top of the tower at the top. */
function HeightBars({ rows, max, color, unit }: { rows: { z: number; v: number; wet: number }[]; max: number; color: string; unit: string }) {
  const W = 60, H = 84, rh = (H - 2) / Math.max(1, rows.length)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Storm catch by height">
      <line x1={1} x2={1} y1={0} y2={H} stroke={INK} strokeWidth={1} />
      {[...rows].reverse().map((r, i) => <rect key={i} x={1.5} y={1 + i * rh} width={Math.max(0.5, ((W - 4) * r.v) / max)} height={Math.max(1, rh - 1)} fill={color} fillOpacity={0.35 + 0.65 * r.wet}><title>{`${Math.round(r.z)} m: ${r.v.toFixed(1)} ${unit}, ${Math.round(r.wet * 100)}% wetted`}</title></rect>)}
    </svg>
  )
}

function useRainClimate(C: ClimatePayload | null) {
  return useMemo(() => {
    if (!C) return null
    const A = rainBySector(C, keepFor(C, 'year'))
    if (!A) return null
    const mo = monthOfHour(C.days)
    const months = C.months.map((n, m) => { const x = rainBySector(C, (i) => mo[i] === m); return { n: n.slice(0, 1), mm: x?.tot ?? 0, top: x?.ranked[0] ?? null } })
    const seasons = ([['Winter', [11, 0, 1]], ['Spring', [2, 3, 4]], ['Summer', [5, 6, 7]], ['Fall', [8, 9, 10]]] as [string, number[]][]).map(([n, ms]) => { const x = rainBySector(C, (i) => ms.includes(mo[i])); return x ? { n, top: x.ranked[0], tot: x.tot } : null }).filter((x): x is { n: string; top: RainBySector['ranked'][number]; tot: number } => !!x)
    return { A, months, seasons }
  }, [C])
}
function RainClimate({ C }: { C: ClimatePayload }) {
  const R = useRainClimate(C)
  if (!R) return null
  return (
    <>
      <SwFig title="Where the rain comes from" caption={`Petal: share of the rain. ${Math.round(R.A.tot)} mm a year.`} tip="Petal length: share of the year's rain arriving from each direction. Colour: mean wind while it rains.">
        <div className="mx-auto w-full max-w-[14rem]"><Rose label="Rain by wind direction" color={RAIN_C} sectors={R.A.sec.map((x) => ({ name: x.dir % 45 ? '' : x.name, dir: x.dir, f: x.f, s: x.s, text: `${x.name} · ${Math.round(x.f * 100)}% of the rain (${Math.round(x.mm)} mm)` }))} /></div>
      </SwFig>
      <SwFig title="By season" caption="Share of rain from the main direction." tip="Bar: share of the season's rain from its main direction.">
        <BarRows label="Main rain direction by season" labelW={44} textW={96} max={1} rows={R.seasons.map((x) => ({ label: x.n, v: x.top.f, color: RAIN_C, text: `${x.top.name} ${Math.round(x.top.f * 100)}% · ${Math.round(x.tot)} mm` }))} />
      </SwFig>
      <SwFig title="By month" caption="Arrow: main direction. Bar: mm." tip="Arrow: where most of the month's rain comes from. Bar: mm.">
        <RainMonths months={R.months} />
      </SwFig>
    </>
  )
}

function RainFacesBody() {
  const out = useSwOut((s) => s.out['built.sw-rain-faces'])
  const inp = useSwInputs()
  const d = out?.data as { faces: FaceRain[]; by: Partial<Record<Face, number>>; SF: StormFaces | null } | undefined
  if (!d?.by) return null
  const SF = d.SF, smax = SF ? Math.max(1e-9, ...SF.faces.flatMap((f) => f.byHeight.map((b) => b.storm))) : 1
  return (
    <>
      <SwFig title="Driving rain by face" caption="Bar: ISO 15927-3 index. Colour: band." tip="Bar: ISO 15927-3 index; colour: BS 8104 band.">
        <div className="mx-auto w-full max-w-[15rem]"><Compass label="Driving rain by face" faces={Object.fromEntries(ORI.filter((o) => d.by[o] != null).map((o) => [o, { v: d.by[o]!, color: RAIN_BAND_C[bandOf(d.by[o]!)], text: `${Math.round(d.by[o]!)}` }]))} /></div>
        <Chips items={Object.entries(RAIN_BAND_C).map(([name, color]) => ({ name, color }))} />
      </SwFig>
      {SF && <SwFig title="Design storm on each face" caption="Rain caught and share of the face wetted." tip="Bar: rain caught, L/m² an hour; text: share of the face wetted.">
        <BarRows label="Storm catch and wetted share by face" labelW={44} textW={104} rows={SF.faces.map((f) => ({ label: FACE_W[f.o], v: f.storm, color: FACE_C[f.o], text: `${f.storm.toFixed(1)} L/m²h · ${Math.round(f.wetShare * 100)}% wet` }))} />
      </SwFig>}
      {SF && <Fold title="By height">
        <SwFig title="Storm catch by height" caption="Tower top at the top; paler: sheltered." tip="Top of the tower at the top; paler where neighbours shelter the face.">
          <Multiples cols={4}>{SF.faces.map((f) => <Panel key={f.o} name={FACE_W[f.o]}><HeightBars rows={f.byHeight.map((b) => ({ z: b.z, v: b.storm, wet: b.wet }))} max={smax} color={FACE_C[f.o]} unit="L/m² h" /></Panel>)}</Multiples>
        </SwFig>
      </Fold>}
      {SF && <Fold title="Design storm">
        <SwFig title="Design storm" caption="Wettest sector, 95th-percentile wind." tip="From the wettest sector at the 95th-percentile wet-hour wind.">
          <StormSection dir={SF.dir} speed={SF.speed} alphaDeg={SF.alphaDeg} H={SF.top} />
        </SwFig>
      </Fold>}
      {inp.C && <Fold title="Rain climate"><RainClimate C={inp.C} /></Fold>}
    </>
  )
}

const WORD16: Record<string, string> = { N: 'north', NNE: 'north-north-east', NE: 'north-east', ENE: 'east-north-east', E: 'east', ESE: 'east-south-east', SE: 'south-east', SSE: 'south-south-east', S: 'south', SSW: 'south-south-west', SW: 'south-west', WSW: 'west-south-west', W: 'west', WNW: 'west-north-west', NW: 'north-west', NNW: 'north-north-west' }

/** Rain, as the Studio's Rain tab reads in the massing phase (rain.js html): where the rain comes from, the wettest
 *  face, the storm, the ground kept dry, what the roofs collect, driving rain and wetting by face and height. */
function RainWaterBody() {
  const out = useSwOut((s) => s.out['built.sw-rain-water'])
  const faces = useSwOut((s) => s.out['built.sw-rain-faces'])
  const inp = useSwInputs()
  const setStudy = useSwStudy((s) => s.set)
  const d = out?.data as { roof: RoofWater; sh: GroundShelter | null; RY: RoofYear; A: RainBySector | null; storm: { dir: number; speed: number } | null; drop?: string; alphaDeg?: number; period?: string; at?: number } | undefined
  const f = faces?.data as { faces: FaceRain[]; by: Partial<Record<Face, number>>; SF: StormFaces | null; worst: FaceRain | null } | undefined
  if (!d?.RY) return null
  const RY = d.RY, A = d.A, storm = d.storm, H = Math.max(0, ...inp.towers.map((t) => t.height))
  const SF = f?.SF ?? null, worst = f?.worst ?? null
  const wo = worst ? oriOf(worst.az) : null, wetW = SF && wo ? SF.faces.find((x) => x.o === wo) : null
  const dryF = SF ? SF.faces.reduce((a, x) => (x.wetShare < a.wetShare ? x : a), SF.faces[0]) : null
  const period = d.period ?? 'the year', ofThe = period === 'Whole year' ? "the year's" : "the period's"
  const top3 = A ? A.ranked.slice(0, 3) : []
  const quarter = A && top3[0] ? A.sec.filter((x) => Math.abs(((x.dir - top3[0].dir + 540) % 360) - 180) <= 45).reduce((t, x) => t + x.f, 0) : 0
  const off = A && storm && top3[0] ? Math.abs(((storm.dir - top3[0].dir + 540) % 360) - 180) : 0
  const needFits = RY.people > 0 && Math.max(...RY.months.map((m) => m.demand)) <= 3 * Math.max(1e-9, ...RY.months.map((m) => m.m3))
  const perMm = d.roof.area * (useSwStudy.getState().rainEff ?? 0.8)
  return (
    <>
      <ImpactHead what="Rain" at={d.at} color="#2563eb" />
      {A && top3[0] && <>
        <p className="border-l-[3px] border-[#3B7DD8] bg-white py-1.5 pl-2.5 pr-2 text-xs leading-snug text-ink" data-testid="rain-from">
          Mostly from the <b>{WORD16[top3[0].name] ?? top3[0].name}</b>: {Math.round(top3[0].f * 100)}% of {ofThe} rain arrives on {top3[0].name} winds, {Math.round(quarter * 100)}% from {top3[0].name} ± 45°.{top3[1] ? ` Next ${top3[1].name} ${Math.round(top3[1].f * 100)}%` : ''}{top3[2] ? `, ${top3[2].name} ${Math.round(top3[2].f * 100)}%` : ''}.
          {off > 22.5 && storm && <button type="button" data-testid="rain-use-dir" onClick={() => setStudy({ rainDir: top3[0].dir, rainSpeed: storm.speed })} className="ml-1.5 rounded border border-line px-1.5 py-0.5 text-meta font-semibold text-[#2563eb] hover:border-[#2563eb]">Use {top3[0].dir}° ({top3[0].name})</button>}
        </p>
        <SwFig explain title={`Where the rain comes from · ${period}`} caption={`Petal: share of the rain. ${Math.round(A.tot)} mm.`} tip="Petal length: share of the period's rain arriving on winds from each direction. Colour: mean wind speed while it rains. Wind direction in the wet hours of the CWEC 2020 typical year at Vancouver Intl Airport.">
          <div className="mx-auto w-full max-w-[14rem]"><Rose label="Rain by wind direction" color={RAIN_C} sectors={A.sec.map((x) => ({ name: x.dir % 45 ? '' : x.name, dir: x.dir, f: x.f, s: x.s, text: `${x.name}: ${Math.round(x.f * 100)}% of the rain` }))} /></div>
        </SwFig>
      </>}
      {worst && wo && <p className="border-l-[3px] border-[#3B7DD8] bg-white py-1.5 pl-2.5 pr-2 text-xs leading-snug text-ink" data-testid="rain-headline">
        The <b>{FACE_W[wo].toLowerCase()}</b> face carries the driving rain: {Math.round(worst.index)} on the annual index, {worst.band} on the BS 8104 scale{wetW ? <>, and {Math.round(wetW.wetShare * 100)}% of it is wetted in the design storm</> : null}. Upper floors catch two to three times the rain of the base, so copings, sealant joints and glazing at the top of that face are the first details to resolve.
      </p>}
      <div className="@container"><div className="grid grid-cols-1 gap-1.5 @[26rem]:grid-cols-3" data-testid="rain-tiles">
        <Tile name="Design storm" value={storm ? `${Math.round(storm.dir)}° · ${storm.speed.toFixed(1)}` : '–'} unit={storm ? 'm/s' : undefined} sub={`${d.drop ?? 'steady'} · rain ${Math.round(d.alphaDeg ?? 0)}° from vertical`} />
        <Tile name="Most exposed face" value={wo ? FACE_W[wo] : '–'} sub={worst ? `${worst.band} · index ${Math.round(worst.index)}${wetW ? ` · ${Math.round(wetW.wetShare * 100)}% wetted` : ''}` : 'run the study'} over={worst?.band === 'very severe'} />
        <Tile name="Ground kept dry" value={d.sh ? fmtI(d.sh.dryStorm) : '–'} unit={d.sh ? 'm²' : undefined} sub={d.sh?.dryStormSite ? `${fmtI(d.sh.dryStormSite)} m² of it on the site` : 'rain shadow of the building'} />
      </div></div>
      {d.roof.area > 0 && <>
        <h4 className="pt-1 text-xs font-semibold text-ink">How much the roof can collect</h4>
        <div className="@container"><div className="grid grid-cols-1 gap-1.5 @[26rem]:grid-cols-3" data-testid="roof-tiles">
          <Tile name="Collected a year" value={fmtI(d.roof.annual)} unit="m³" sub={`from ${fmtI(d.roof.area)} m² of roof and terraces`} />
          <Tile name="In the design storm" value={fmtI(RY.storm)} unit="m³" sub={`${Math.round(RY.stormMM)} mm · peak ${Math.round(RY.peakLs)} L/s to the drains`} />
          <Tile name="Per mm of rain" value={fmtI(perMm)} unit="L" sub={RY.flushShare != null ? `covers ${Math.round(RY.flushShare * 100)}% of toilet flushing for ${fmtI(RY.people)} people` : 'at the run-off kept'} />
        </div></div>
        <div className="@container"><div className="grid grid-cols-1 gap-3 @[34rem]:grid-cols-2">
          <SwFig explain title="Roof water by month · m³" caption={needFits ? 'Bars: collected. Line: flushing need.' : 'Collected each month.'} tip="Rain × roof and terrace area × run-off kept, for each month of the typical year, against the non-potable toilet flushing of the people in the tower.">
            <MonthStack label="Rain collected by month against flushing demand" unit="m³" series={[{ name: 'collected', color: RAIN_C, values: RY.months.map((m) => m.m3) }]} need={needFits ? { name: 'flushing need', color: '#5E8F5A', values: RY.months.map((m) => m.demand) } : undefined} />
          </SwFig>
          {d.roof.surfaces.length > 0 && <SwFig explain title="Each roof · m³ a year" caption="Rain × area × run-off, largest first." tip="What each roof and terrace collects in a year: its area × the year's rain × the run-off kept.">
            <BarRows label="Rain collected by roof surface" labelW={98} textW={84} rows={d.roof.surfaces.slice(0, 10).map((x) => ({ label: x.name.replace('Terrace at', 'Terrace').replace('Podium roof at', 'Podium'), v: x.m3, color: x.name === 'Main roof' ? RAIN_C : '#6FA3CF', text: `${fmtI(x.m3)} · ${fmtI(x.area)} m²` }))} />
          </SwFig>}
        </div></div>
      </>}
      {f?.by && <div className="@container"><div className="grid grid-cols-1 gap-3 @[34rem]:grid-cols-2">
        <SwFig explain title="Driving rain by face" caption="ISO 15927-3 index. Colour: BS 8104 band." tip="The annual driving-rain index on each face (ISO 15927-3, from the hourly wind and rain of the period), read against the BS 8104 exposure bands: sheltered, moderate, severe, very severe.">
          <div className="mx-auto w-full max-w-[15rem]"><Compass label="Driving rain by face" faces={Object.fromEntries(ORI.filter((o) => f.by[o] != null).map((o) => [o, { v: f.by[o]!, color: RAIN_BAND_C[bandOf(f.by[o]!)], text: `${Math.round(f.by[o]!)}` }]))} /></div>
          <Chips items={Object.entries(RAIN_BAND_C).map(([name, color]) => ({ name, color }))} />
        </SwFig>
        {SF && <SwFig explain title="Wetted face by height" caption="Share of each face the storm wets." tip="Share of each face the design storm wets, by height: upper floors catch two to three times the rain of the base; neighbours shelter the lower floors.">
          <LineChart label="Wetted share of each face by height" xLabel="wetted %" yLabel="height m" series={SF.faces.map((x) => ({ name: x.o, color: FACE_C[x.o], pts: x.byHeight.map((b) => [Math.round(b.wet * 100), b.z] as [number, number]), read: (vx: number, vy: number) => `${FACE_W[x.o]}: ${Math.round(vx)}% wetted at ${Math.round(vy)} m` }))} />
        </SwFig>}
      </div></div>}
      {SF && <SwFig explain title="Storm catch on each face" caption="L/m² an hour and the share wetted." tip="Wind-driven rain on the face in the design storm: catch ratio 0.222 · U · R^0.88 with wall factors rising with height.">
        <BarRows label="Storm catch on each face" labelW={44} textW={104} rows={SF.faces.map((x) => ({ label: FACE_W[x.o], v: x.storm, color: FACE_C[x.o], text: `${x.storm.toFixed(1)} L/m²h · ${Math.round(x.wetShare * 100)}% wet` }))} />
      </SwFig>}
      {dryF && <p className="text-meta leading-snug text-muted">The {FACE_W[dryF.o].toLowerCase()} face stays largely dry ({Math.round(dryF.wetShare * 100)}% wetted): the place for entrances, operable windows and anything that dislikes water.</p>}
      <Fold title="Storage and the design storm">
        <SwFig title="Roof water · m³" caption="Year, need, cistern, one storm." tip="A year's catch, the flushing need, the store to bridge dry months, one storm.">
          <BarRows label="Roof water: year, need, cistern, storm" labelW={98} rows={[
            { label: 'Collected a year', v: d.roof.annual, color: RAIN_C, text: `${fmtI(d.roof.annual)} m³` },
            ...(RY.flushNeed > 0 ? [{ label: 'Flushing need', v: RY.flushNeed, color: '#5E8F5A', text: `${fmtI(RY.flushNeed)} m³` }, { label: 'Cistern', v: RY.cistern, color: '#6FA3CF', text: `${fmtI(RY.cistern)} m³` }] : []),
            { label: 'Design storm', v: RY.storm, color: '#123F73', text: `${fmtI(RY.storm)} m³ · ${Math.round(RY.peakLs)} L/s` },
          ]} />
        </SwFig>
        {storm && <SwFig title="Design storm" caption="The lee of the towers stays dry." tip="The towers keep the ground in their lee dry.">
          <StormSection dir={storm.dir} speed={storm.speed} alphaDeg={d.sh?.stormAlphaDeg ?? d.alphaDeg ?? 0} H={H} />
        </SwFig>}
      </Fold>
      {inp.C && <Fold title="Rain climate"><RainClimate C={inp.C} /></Fold>}
    </>
  )
}

// ------------------------------------------------------------------ energy
function EnergyBody() {
  const out = useSwOut((s) => s.out['built.sw-energy'])
  const r = out?.data.r as EnergyResult | undefined
  if (!r?.mon) return null
  const g = r.gfa || 1, sum = (k: EndUse) => r.zones.reduce((s, z) => s + z[k], 0)
  const L = r.loss
  const lossRows = [
    ...ORI.map((o) => ({ label: `Windows · ${FACE_W[o]}`, v: L.glass[o] / g, color: LOSS_COL.glass })), ...ORI.map((o) => ({ label: `Walls · ${FACE_W[o]}`, v: L.wall[o] / g, color: LOSS_COL.wall })),
    { label: 'Roofs and soffits', v: L.roof / g, color: LOSS_COL.roof }, { label: 'Ventilation', v: L.vent / g, color: LOSS_COL.vent }, { label: 'Infiltration', v: L.infil / g, color: LOSS_COL.infil },
  ].filter((x) => x.v > 0.05).sort((a, b) => b.v - a.v)
  const lt = lossRows.reduce((a, b) => a + b.v, 0) || 1
  const gA = ORI.reduce((a, o) => a + r.env.glass[o], 0), wA = ORI.reduce((a, o) => a + r.env.wall[o], 0)
  const per = [{ label: 'Window', v: gA ? ORI.reduce((a, o) => a + L.glass[o], 0) / gA : 0, color: LOSS_COL.glass }, { label: 'Wall', v: wA ? ORI.reduce((a, o) => a + L.wall[o], 0) / wA : 0, color: LOSS_COL.wall }, { label: 'Roof, soffit', v: r.env.roof ? L.roof / r.env.roof : 0, color: LOSS_COL.roof }].filter((x) => x.v > 0)
  const hMax = Math.max(1, r.peakH), cMax = Math.max(1, r.peakC), k = 1000 / g
  return (
    <>
      <SwFig title="Energy by month · MWh" caption={`${fmtI(r.total / 1000)} MWh a year over ${fmtI(r.gfa)} m².`}>
        <MonthStack label="Monthly energy by end use" unit="MWh" series={END_USES.map((u) => ({ name: USE_NAME[u], color: USE_COL[u], values: r.mon[u].map((v) => v / 1000) }))} />
        <Chips items={END_USES.map((u) => ({ name: USE_NAME[u], color: USE_COL[u] }))} />
      </SwFig>
      <SwFig sheet={false} title="Where the energy goes" caption={`${fmtI(r.elec / 1000)} MWh electricity, ${fmtI(r.gas / 1000)} MWh gas.`} tip={r.people ? `${fmtI(r.total / r.people)} kWh a person a year` : undefined}>
        <Stack label="Energy by end use" parts={END_USES.map((u) => ({ name: USE_NAME[u], v: sum(u), color: USE_COL[u] }))} />
      </SwFig>
      <Fold title="Loads through the year">
        <SwFig title="Peak loads · W/m²" caption="Design hour of the typical year.">
          <BarRows label="Peak heating and cooling load" labelW={54} rows={[{ label: 'Heating', v: r.peakH, color: USE_COL.heat, text: `${Math.round(r.peakH)} W/m²` }, { label: 'Cooling', v: r.peakC, color: USE_COL.cool, text: `${Math.round(r.peakC)} W/m²` }]} />
        </SwFig>
        <SwFig title="Heating demand · day × hour" caption="W/m² of floor, each hour of the year." tip="Night and morning heating in winter; the setback after hours.">
          <YearMap hourly={r.hourly.heat} scale={k} color={(v) => RAMP.heat(v / hMax)} label="Heating demand by day and hour" legend={[[0, '0'], [hMax, `${Math.round(hMax)} W`]]} read={(v) => `${v.toFixed(0)} W/m²`} />
        </SwFig>
        <SwFig title="Cooling demand · day × hour" caption="W/m² of floor, each hour of the year." tip="Sun-driven afternoons in summer.">
          <YearMap hourly={r.hourly.cool} scale={k} color={(v) => RAMP.cool(v / cMax)} label="Cooling demand by day and hour" legend={[[0, '0'], [cMax, `${Math.round(cMax)} W`]]} read={(v) => `${v.toFixed(0)} W/m²`} />
        </SwFig>
      </Fold>
      <Fold title="Where the heat goes">
        <SwFig title="Heat lost by path · kWh/m²" caption={`${Math.round(lt)} in all; heat recovery keeps ${Math.round(L.recov / g)}.`} tip="Summed over every hour of the typical year that the inside is warmer than the outside, per m² of floor.">
          <BarRows label="Heat lost by path" labelW={96} rows={lossRows.map((x) => ({ ...x, text: `${x.v.toFixed(1)} · ${Math.round((x.v / lt) * 100)}%` }))} />
        </SwFig>
        <SwFig title="Loss per m² of element" caption="kWh a year for each m² of it." tip="What one more square metre of it costs.">
          <BarRows label="Heat loss per square metre of element" labelW={70} rows={per.map((x) => ({ ...x, text: `${Math.round(x.v)} kWh/m²` }))} />
        </SwFig>
      </Fold>
      <Fold title="By program and face">
        <SwFig title="TEUI by program · kWh/m²" caption="Tick: the program's Vancouver target.">
          <BarRows label="TEUI by program against target" labelW={70} textW={96} rows={r.zones.map((z) => { const t = (TARGETS[z.prog] ?? TARGETS.office).teui; return { label: PROG_NAME[z.prog] ?? z.prog, v: z.teui, mark: t, color: z.teui <= t ? OK_C : BAD_C, text: `${Math.round(z.teui)} / ${t} · ${fmtI(z.area)} m²`, tip: `${PROG_NAME[z.prog] ?? z.prog}: TEUI ${Math.round(z.teui)} (target ${t}), TEDI ${z.tedi.toFixed(1)}, ${fmtI(z.area)} m²${z.cond ? '' : ', unconditioned'}` } })} />
        </SwFig>
        <SwFig title="Glazing by face" caption="Window-to-wall ratio. Tick: 40%." tip="Window-to-wall ratio from the façade zones.">
          <BarRows label="Window-to-wall ratio by face" labelW={44} max={1} rows={ORI.map((o) => { const A = r.env.glass[o] + r.env.wall[o], w = A ? r.env.glass[o] / A : 0; return { label: FACE_W[o], v: w, mark: 0.4, color: '#78A6CC', text: `${Math.round(w * 100)}% · ${fmtI(r.env.glass[o])} m²` } })} />
        </SwFig>
      </Fold>
    </>
  )
}

/** The outdoor tools' and Energy use's figures (none for the other tools). */
export function ExteriorDrawings({ id }: { id: SwId }) {
  if (id === 'built.sw-shadow') return <ShadowBody />
  if (id === 'built.sw-sun-faces') return <SunFacesBody />
  if (id === 'built.sw-wind-comfort') return <WindComfortBody />
  if (id === 'built.sw-wind-height') return <WindHeightBody />
  if (id === 'built.sw-rain-faces') return <RainFacesBody />
  if (id === 'built.sw-rain-water') return <RainWaterBody />
  if (id === 'built.sw-energy') return <EnergyBody />
  return null
}
