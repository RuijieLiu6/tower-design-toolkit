// The display-mode switch and its key, shown over the 3D view in both projects (design system §9, lib/displayMode.ts):
// Massing · Program · Analysis · Materials, always visible with the active one marked, and under it the legend of what
// the colours mean in that mode. Analysis names its quantity, units, range and missing data; while the sun and shadow
// preview is on, its date and time sit beside the switch, so a shadow is never read without its hour.
import { useEffect, type CSSProperties, type ReactNode } from 'react'
import { MAP_DATES } from '../engine/solarDates'
import { sunPosition, vancouverTime } from '../engine/sun'
import { USES, type Tower, type UseId } from '../engine/types'
import { useSolar } from '../hooks/useSolarAccess'
import { nodeOn } from '../lib/analysis'
import { BUILT_NODES } from '../data/registry'
import { MODEL } from '../lib/design/tokens'
import {
  ANALYSIS_LAYERS, LOSS_SIDE, MISSING_CSS, SEQUENTIAL, cityStyleFor, layerOfNode, modeFromCityStyle, rampCss, ticks,
  useDisplayMode, type AnalysisLayerId, type DisplayMode,
} from '../lib/displayMode'
import { useAnalysisLayer } from '../lib/displayModeHooks'
import { useSceneStyle } from '../lib/sceneStyle'
import { useVistaLook } from '../lib/vistaLook'
import { useStore, useTowers, type ProjectKind } from '../store'
import { POA_RANGE } from './energyRamp'
import { Sun } from './icons'
import { LOSS_MAX_H } from './solarRamps'
import { LEVEL_COLOR } from './WindScreenResults'

const focusRing = 'outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent'

// ---------------------------------------------------------------- keeping the older switches in step
/**
 * Real Vancouver's scene style (Plain / Context, also in Present and the Layers dock) and "Colour buildings by type"
 * are this mode by other names: they follow it, and it follows them. Picking a check that colours the model (Solar
 * access, Energy & carbon, Wind screen) opens Analysis on that layer. Mounted once, by the Viewport.
 */
export function useDisplaySync() {
  useEffect(() => {
    const apply = (mode: DisplayMode) => {
      const want = cityStyleFor(mode)
      if (useSceneStyle.getState().style !== want.style) useSceneStyle.setState({ style: want.style })
      if (useVistaLook.getState().typeColours !== want.typeColours) useVistaLook.setState({ typeColours: want.typeColours })
    }
    apply(useDisplayMode.getState().mode)
    const follow = () => {
      const d = useDisplayMode.getState()
      const next = modeFromCityStyle(d.mode, useSceneStyle.getState().style, useVistaLook.getState().typeColours)
      if (next !== d.mode) d.setMode(next)
    }
    const offs = [
      useDisplayMode.subscribe((s, p) => { if (s.mode !== p.mode) apply(s.mode) }),
      useSceneStyle.subscribe((s, p) => { if (s.style !== p.style) follow() }),
      useVistaLook.subscribe((s, p) => { if (s.typeColours !== p.typeColours) follow() }),
      // Only the user's own node picks (resultsSeq), never a project switch or a restore.
      useStore.subscribe((s, p) => {
        if (s.resultsSeq === p.resultsSeq) return
        const layer = layerOfNode(s.selectedNode)
        if (layer) useDisplayMode.getState().showLayer(layer)
      }),
    ]
    return () => offs.forEach((off) => off())
  }, [])
}

export { DisplayModeSwitch } from './DisplayModeSwitch'

// ---------------------------------------------------------------- sun and shadow: the active settings
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const clock = (hour: number) => `${Math.floor(hour)}:${String(Math.round((hour % 1) * 60)).padStart(2, '0')}`

/**
 * Shown while the Sun & shadow preview lights the model (the analytical light, not the neutral inspection light): the
 * date, the local time and where the sun stands, so a shadow is never read without its hour.
 */
export function SunChip() {
  const on = useStore((s) => !!s.enabled['built.sun'])
  const sun = useStore((s) => s.sun)
  if (!on) return null
  const p = sunPosition(vancouverTime(sun.month, sun.day, sun.hour))
  const up = p.altitude > 0
  const text = `${sun.day} ${MONTHS[sun.month - 1] ?? sun.month} · ${clock(sun.hour)} PT`
  return (
    <span data-testid="sun-chip" className="flex h-7 items-center gap-1.5 rounded-[8px] border border-line bg-panel px-2 text-meta text-ink"
      title={`Sun & shadow preview: ${text} (UTC−7). Sun ${up ? `${p.altitude.toFixed(0)}° above the horizon, azimuth ${p.azimuth.toFixed(0)}° from north` : 'below the horizon: no shadows'}. Set in Form › Sun.`}>
      <Sun size={14} aria-hidden className="text-warning" />
      <b className="font-semibold tabular-nums">{text}</b>
      <span className="tabular-nums text-muted">{up ? `sun ${p.altitude.toFixed(0)}° up` : 'sun below horizon'}</span>
    </span>
  )
}

// ---------------------------------------------------------------- keys
const swatch = (style: CSSProperties) => <i aria-hidden className="inline-block h-3 w-3 shrink-0 rounded-[3px]" style={style} />
export function KeyItem({ sw, children, title }: { sw: ReactNode; children: ReactNode; title?: string }) {
  return <span role="listitem" title={title} className="flex items-center gap-1.5 whitespace-nowrap">{sw}<span>{children}</span></span>
}
export const KeyGroup = ({ label, children }: { label: string; children: ReactNode }) => (
  <div role="list" aria-label={label} className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
    <span aria-hidden className="text-meta font-semibold text-muted">{label}</span>{children}
  </div>
)

/** Massing (and Materials' towers): the neutral model, and the selection outline drawn apart from any surface. */
export function MassingKey({ existing = true }: { existing?: boolean }) {
  return (
    <KeyGroup label="Model">
      <KeyItem sw={swatch({ background: MODEL.proposed, border: `1.5px solid ${MODEL.edge}` })} title="Your design towers: the lighter, edged volumes">Proposed</KeyItem>
      {existing && <KeyItem sw={swatch({ background: MODEL.context, border: '1px solid rgb(32 38 48 / 0.15)' })} title="Existing buildings, at lower emphasis">Existing</KeyItem>}
      <KeyItem sw={swatch({ background: 'transparent', border: `2px solid ${MODEL.selected}`, boxShadow: `0 0 0 1.5px ${MODEL.keyline}` })} title="The picked tower: an outline with a white keyline, so its colours stay as they are">Selected</KeyItem>
    </KeyGroup>
  )
}

/** The uses on the design towers (Program), labelled. */
export function towerUses(towers: Tower[]): UseId[] {
  const seen = new Set<UseId>()
  for (const t of towers) {
    if (t.podiumHeight > 0) seen.add(t.podiumUse)
    for (const b of t.bands) if (b.share > 0) seen.add(b.use)
    if (t.plantEvery) seen.add('mechanical')
  }
  return (Object.keys(USES) as UseId[]).filter((u) => seen.has(u))
}
export function TowerUseKey() {
  const uses = towerUses(useTowers())
  if (!uses.length) return null
  return (
    <KeyGroup label="Proposed tower">
      {uses.map((u) => <KeyItem key={u} sw={swatch({ background: USES[u].color, border: '1px solid rgb(32 38 48 / 0.25)' })}>{USES[u].label.replace(/ \/.*$/, '')}</KeyItem>)}
    </KeyGroup>
  )
}

// ---------------------------------------------------------------- analysis
const fmt = (v: number) => (Math.abs(v - Math.round(v)) < 1e-6 ? String(Math.round(v)) : v.toFixed(1))

/** A continuous scale: the quantity and its units, the bar, its range in ticks, and missing data apart from zero. */
function ScaleBar({ title, unit, stops, lo, hi, last, missing, note }: { title: string; unit: string; stops: readonly string[]; lo: number; hi: number; last?: string; missing?: string; note?: string }) {
  const ts = ticks(lo, hi, 5)
  return (
    <figure className="m-0 grid gap-1" aria-label={`${title}, ${unit}, from ${fmt(lo)} to ${last ?? fmt(hi)}`}>
      <figcaption className="text-meta"><b className="font-semibold text-ink">{title}</b> <span className="text-muted">· {unit}</span></figcaption>
      <div className="grid w-[16rem] max-w-full gap-0.5">
        <i aria-hidden className="block h-2.5 rounded-[3px] border border-black/10" style={{ background: rampCss(stops) }} />
        <div aria-hidden className="relative h-4 text-meta tabular-nums text-muted">
          {ts.map((v, i) => (
            <span key={v} className="absolute top-0 whitespace-nowrap" style={{ left: `${((v - lo) / (hi - lo || 1)) * 100}%`, transform: i === 0 ? 'none' : i === ts.length - 1 ? 'translateX(-100%)' : 'translateX(-50%)' }}>
              {i === ts.length - 1 && last ? last : fmt(v)}
            </span>
          ))}
        </div>
      </div>
      {(missing || note) && (
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-meta text-muted">
          {missing && <KeyItem sw={swatch({ background: MISSING_CSS, border: '1px solid rgb(32 38 48 / 0.25)' })}>{missing}</KeyItem>}
          {note && <span>{note}</span>}
        </div>
      )}
    </figure>
  )
}

function SolarScale({ project }: { project: ProjectKind }) {
  const out = useSolar((s) => (s.out?.project === project ? s.out : null))
  const status = useSolar((s) => s.status)
  const view = useSolar((s) => s.view)
  const showMap = useSolar((s) => s.showMap)
  const date = MAP_DATES.find((d) => d.id === useSolar.getState().mapDate)
  if (!out?.map) return <p className="text-meta text-muted">{status === 'running' ? 'Sun hours: computing…' : status === 'error' ? 'Sun hours could not run: see the Solar access results.' : 'Sun hours: waiting for the first run.'}</p>
  const possible = out.map.possible
  return (
    <>
      {view === 'hours'
        ? <ScaleBar title={`Sun hours · ${date?.label ?? ''}`} unit="hours of direct sun, with your design" stops={SEQUENTIAL} lo={0} hi={possible} last={`${fmt(possible)} (all)`} missing="no data (under buildings)" />
        : <ScaleBar title={`Sun lost to the design · ${date?.label ?? ''}`} unit="hours, against the existing context" stops={LOSS_SIDE} lo={0} hi={LOSS_MAX_H} last={`${LOSS_MAX_H}+`} missing="no data (under buildings)" note="0 = no change (drawn)" />}
      {!showMap && <p className="text-meta text-muted">The map is switched off in the Solar access results.</p>}
    </>
  )
}

function WindKey() {
  return (
    <figure className="m-0 grid gap-1" aria-label="Pedestrian wind risk, indicative levels">
      <figcaption className="text-meta"><b className="font-semibold text-ink">Pedestrian wind risk</b> <span className="text-muted">· level, screening only (not CFD)</span></figcaption>
      <div role="list" className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-meta">
        {(['low', 'medium', 'high'] as const).map((l) => <KeyItem key={l} sw={swatch({ background: LEVEL_COLOR[l], opacity: 0.75 })}>{l[0].toUpperCase() + l.slice(1)}</KeyItem>)}
      </div>
      <span className="text-meta text-muted">Zone sizes are drawing rules (team assumption), not predicted extents.</span>
    </figure>
  )
}

/**
 * Analysis: which quantity is on the model (one at a time) and its scale. Showing a layer and computing it are separate
 * (overnight brief, 8 Nov): the radios only choose what is drawn; a quantity whose check is off or paused says so, with
 * its own labelled action to compute it. Nothing is switched on by picking a layer.
 */
export function AnalysisLegend({ project }: { project: ProjectKind }) {
  const layer = useAnalysisLayer()
  const wanted = useDisplayMode((s) => s.layer)
  const showLayer = useDisplayMode((s) => s.showLayer)
  const analysisOn = useStore((s) => s.analysis)
  const running = useStore((s) => ANALYSIS_LAYERS.filter((l) => nodeOn(s, l.node)).map((l) => l.id).join(','))
  const runningIds = running ? running.split(',') as AnalysisLayerId[] : []
  const pick = wanted ?? layer
  const def = ANALYSIS_LAYERS.find((l) => l.id === pick)
  const checkName = def ? BUILT_NODES.find((n) => n.id === def.node)?.name ?? def.node : ''
  return (
    <div className="grid gap-1.5">
      <div role="radiogroup" aria-label="Quantity on the model" className="flex flex-wrap gap-1">
        {ANALYSIS_LAYERS.map((l) => {
          const runs = runningIds.includes(l.id)
          return (
            <button key={l.id} type="button" role="radio" aria-checked={pick === l.id} onClick={() => showLayer(l.id)}
              title={runs ? l.hint : `${l.hint}. Not computed: its check is ${analysisOn ? 'off' : 'paused'}.`}
              className={`rounded-[6px] border px-2 py-0.5 text-control font-medium ${focusRing} ${pick === l.id ? 'border-accent bg-selected text-ink' : 'border-line bg-panel text-muted hover:text-ink'}`}>
              {l.word}{!runs && <span className="font-normal text-muted"> · not computed</span>}
            </button>
          )
        })}
      </div>
      {!pick && <span className="text-meta text-muted">Choose the quantity to draw on the model.</span>}
      {def && !runningIds.includes(def.id) && (
        <p role="status" data-testid="layer-not-computed" className="flex flex-wrap items-center gap-2 text-meta text-ink">
          {analysisOn
            ? <><span>{def.word} is not computed: the {checkName} check is off.</span>
              <button type="button" data-testid="layer-compute" onClick={() => useStore.getState().toggleNode(def.node)} className={`h-7 rounded-lg bg-panel px-2 text-control text-ink ${focusRing}`}>Switch on {checkName}</button></>
            : <><span>Checks are paused (Auto-run checks is off), so {def.word} is not computed.</span>
              <button type="button" onClick={() => useStore.getState().setAnalysis(true)} className={`h-7 rounded-lg bg-panel px-2 text-control text-ink ${focusRing}`}>Turn on auto-run</button></>}
        </p>
      )}
      {layer === 'solar' && <SolarScale project={project} />}
      {layer === 'surface-sun' && <ScaleBar title="Sun on surfaces · modelled, per year" unit="kWh/m²·yr, roofs and facade bands" stops={SEQUENTIAL} lo={POA_RANGE[0]} hi={POA_RANGE[1]}
        note="Fixed scale for every option; values beyond it take the end colour." />}
      {layer === 'wind' && <WindKey />}
    </div>
  )
}
