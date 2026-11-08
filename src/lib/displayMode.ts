// The 3D view's display modes (Ruijie's design system §9, 7 Nov): one model, four explicit ways of colouring it, so a
// colour on screen always means one thing. Massing shows geometry (a neutral matte model, the proposal lighter than its
// context and edged); Program shows building uses in the categorical palette with a legend; Analysis shows one measured
// or calculated quantity with its units, range and legend; Materials shows the illustrative textures, only where the
// app has them (Real Vancouver's Context look), never faked elsewhere. Selection is drawn apart (an outline), so no
// mode's colours change when a tower is picked. Kept free of three.js: the switch loads with the app.
import { create } from 'zustand'
import { DATA, MODEL } from './design/tokens'

export type DisplayMode = 'massing' | 'program' | 'analysis' | 'materials'
export type ProjectKind = 'vtc' | 'city'

// Labels (overnight brief, 8 Nov): "View: Geometry / Building use / Analysis / Materials", so a view never shares a name
// with the Program phase. The ids (massing, program, analysis, materials) are what is stored, and stay.
export const DISPLAY_MODES: { id: DisplayMode; word: string; hint: string }[] = [
  { id: 'massing', word: 'Geometry', hint: 'Geometry, height and proportion: a neutral model, your towers lighter than the context, with edges' },
  { id: 'program', word: 'Building use', hint: 'Building uses in one labelled palette: your towers by floor, the context by type' },
  { id: 'analysis', word: 'Analysis', hint: 'One measured or calculated quantity on a neutral model, with its units, range and legend' },
  { id: 'materials', word: 'Materials', hint: 'Illustrative material textures, where the model has them' },
]

/** Whether a project can show a mode; when not, the reason in plain words (shown, never hidden). */
export function modeSupport(mode: DisplayMode, project: ProjectKind): { ok: true } | { ok: false; why: string } {
  if (mode === 'materials' && project === 'vtc') return { ok: false, why: 'Not available on the competition site: its model carries no material appearance. Materials works in Real Vancouver (Vista’s illustrative textures).' }
  return { ok: true }
}

/** What each mode colours. The renderer reads this, not the mode, so the rules live in one tested place. */
export interface ModeColours {
  /** Design towers: one neutral fill, or each floor in its use. */
  tower: 'neutral' | 'use'
  /** Existing buildings: one neutral fill, each in a light tint of its type, or textured. */
  context: 'neutral' | 'use' | 'materials'
  /** Analytical colour layers (sun hours, sun on surfaces, wind zones) show only in Analysis. */
  analysis: boolean
}
export function modeColours(mode: DisplayMode): ModeColours {
  if (mode === 'program') return { tower: 'use', context: 'use', analysis: false }
  if (mode === 'analysis') return { tower: 'neutral', context: 'neutral', analysis: true }
  if (mode === 'materials') return { tower: 'neutral', context: 'materials', analysis: false }
  return { tower: 'neutral', context: 'neutral', analysis: false }
}

/** The proposal's neutral body and edges in Massing, Analysis and Materials (design tokens, MODEL). */
export const NEUTRAL_TOWER = { fill: MODEL.proposed, edge: MODEL.edge } as const

// ---------------------------------------------------------------- Real Vancouver's existing switches
/**
 * Real Vancouver already had two switches that are really this mode: the scene style (Plain / Context textures, also in
 * Present and the Layers dock) and "Colour buildings by type". They stay, in step with the mode both ways.
 */
export function cityStyleFor(mode: DisplayMode): { style: 'plain' | 'context'; typeColours: boolean } {
  return { style: mode === 'materials' ? 'context' : 'plain', typeColours: mode === 'program' }
}
export function modeFromCityStyle(prev: DisplayMode, style: 'plain' | 'context', typeColours: boolean): DisplayMode {
  if (style === 'context') return 'materials'
  if (prev === 'materials') return typeColours ? 'program' : 'massing'
  if (typeColours && prev === 'massing') return 'program'
  if (!typeColours && prev === 'program') return 'massing'
  return prev
}

// ---------------------------------------------------------------- analysis layers
export type AnalysisLayerId = 'solar' | 'surface-sun' | 'wind'
/** The analytical colour layers the model can carry, each owned by one check (node). */
export const ANALYSIS_LAYERS: { id: AnalysisLayerId; node: string; word: string; hint: string }[] = [
  { id: 'solar', node: 'built.solar-access', word: 'Sun hours', hint: 'Hours of direct sun on the ground (or hours lost to the design), Solar access check' },
  { id: 'surface-sun', node: 'built.energy-carbon', word: 'Sun on surfaces', hint: 'Modelled annual sun on roofs and facades, kWh/m²·yr, Energy & carbon check' },
  { id: 'wind', node: 'built.wind-screen', word: 'Wind risk', hint: 'Indicative pedestrian wind risk zones (screening, not CFD), Wind screen check' },
]
export const layerOfNode = (node: string | null): AnalysisLayerId | null => ANALYSIS_LAYERS.find((l) => l.node === node)?.id ?? null

/**
 * The layer Analysis shows: the one asked for, only while its check runs (8 Nov: never another quantity in its place, so
 * the colours on the model always match the quantity the legend names); with none asked for, the first that runs.
 */
export function activeLayer(preferred: AnalysisLayerId | null, runs: (node: string) => boolean): AnalysisLayerId | null {
  const want = ANALYSIS_LAYERS.find((l) => l.id === preferred)
  if (want) return runs(want.node) ? want.id : null
  return ANALYSIS_LAYERS.find((l) => runs(l.node))?.id ?? null
}

// ---------------------------------------------------------------- scales
/**
 * Picked by the data, never by taste (§9): sequential for an increasing quantity (sun hours, sun on surfaces),
 * diverging for change from a reference, categorical for kinds. Missing data has its own hatch, never the zero colour.
 */
export const SEQUENTIAL = DATA.sequential
/**
 * Change in sun hours against the existing context. The design can only take sun away (engine/solarRules: the proposal
 * adds shadow to the baseline, never removes it), so only the losing half of the diverging scale is reachable: zero
 * change is the scale's neutral middle (drawn, so "no change" is a measured value), losses run to its dark end.
 */
export const LOSS_SIDE = [DATA.diverging[3], DATA.diverging[2], DATA.diverging[1], DATA.diverging[0]] as const
export const MISSING = DATA.missing

const rgb = (hex: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number]

/** A colour along a scale, t in 0..1 (clamped), interpolated in sRGB, as 0..1 channels (for sRGB textures and CSS). */
export function rampColour(stops: readonly string[], t: number): [number, number, number] {
  const x = (Number.isFinite(t) ? Math.max(0, Math.min(1, t)) : 0) * (stops.length - 1)
  const i = Math.min(stops.length - 2, Math.floor(x)), f = x - i
  const a = rgb(stops[i]), b = rgb(stops[i + 1])
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]
}

/** The CSS gradient of a scale, for legends. */
export const rampCss = (stops: readonly string[]) => `linear-gradient(90deg, ${stops.map((s, i) => `${s} ${Math.round((i / (stops.length - 1)) * 100)}%`).join(', ')})`
/** The missing-data hatch, for legends (the 3D maps draw the same stripes). */
export const MISSING_CSS = `repeating-linear-gradient(135deg, ${MISSING} 0 2px, transparent 2px 5px)`

/**
 * A legend's tick values: the two ends, and whole numbers between them when they fit (at most `max` ticks), so every
 * analytical legend states its range in the quantity's own units.
 */
export function ticks(lo: number, hi: number, max = 5): number[] {
  if (!(hi > lo)) return [lo]
  const span = hi - lo, raw = span / Math.max(1, max - 1)
  const mag = 10 ** Math.floor(Math.log10(raw)), step = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((s) => s >= raw) ?? raw
  // Inner ticks keep clear of the ends (a fifth of the span), so no two labels run together on a short bar.
  const clear = Math.max(step * 0.3, span * 0.2)
  const out = [lo]
  for (let v = Math.ceil(lo / step) * step; v < hi - clear; v += step) if (v > lo + clear) out.push(Math.round(v * 1e6) / 1e6)
  out.push(hi)
  return out
}

// ---------------------------------------------------------------- the choice (this browser)
const KEY = 'ts.display.mode'
const MODES = DISPLAY_MODES.map((m) => m.id)
const saved = (): DisplayMode => { try { const v = localStorage.getItem(KEY) as DisplayMode | null; return v && MODES.includes(v) ? v : 'massing' } catch { return 'massing' } }

interface DisplayState {
  mode: DisplayMode
  /** The analytical layer asked for in Analysis (null: the first check that runs). */
  layer: AnalysisLayerId | null
  setMode: (mode: DisplayMode) => void
  /** Analysis with this layer (picking a check that colours the model opens it). */
  showLayer: (layer: AnalysisLayerId) => void
  /** Pinned (8 Nov): the View stays as it is when another tool opens (lib/workflow/toolView.ts); this visit only. */
  pinned: boolean
  setPinned: (v: boolean) => void
}
export const useDisplayMode = create<DisplayState>((set) => ({
  mode: saved(),
  layer: null,
  setMode: (mode) => { set({ mode }); try { localStorage.setItem(KEY, mode) } catch { /* this visit only */ } },
  showLayer: (layer) => { set({ mode: 'analysis', layer }); try { localStorage.setItem(KEY, 'analysis') } catch { /* this visit only */ } },
  pinned: false,
  setPinned: (pinned) => set({ pinned }),
}))

/**
 * The mode a project shows: a mode it cannot show (Materials on the competition site) falls back to Massing, and the
 * switch says why. The stored choice is kept, so going back to Real Vancouver restores it.
 */
export const shownMode = (mode: DisplayMode, project: ProjectKind): DisplayMode => (modeSupport(mode, project).ok ? mode : 'massing')
