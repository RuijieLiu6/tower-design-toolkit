// Display units (Phase 1 item 7): metres, feet or millimetres for every displayed length, height and area.
// Everything the app computes, saves and exports stays in metres; only what is shown and typed converts.
// Conversion model from Ruijie's Vista, explorer/units.js (github.com/RuijieLiu6/vancouver-tall-view-tool): metres per
// unit, 2 decimals for m and ft, 0 for mm, and input values written with 12 significant digits so a value converted
// back and forth never drifts.
//
// Choices: feet are DECIMAL feet (984.25 ft), not feet-inches, so typed values stay plain numbers. Areas show in ft² in
// feet mode and in m² in metre and millimetre modes (Canadian drawing practice: dimensions in mm, areas in m²).
// Metre mode shows the app exactly as authored (including stair widths in mm).
import { create } from 'zustand'

export type LengthUnit = 'm' | 'ft' | 'mm'
export const UNITS: Record<LengthUnit, { name: string; symbol: string; metresPerUnit: number; decimals: number }> = {
  m: { name: 'Metres', symbol: 'm', metresPerUnit: 1, decimals: 2 },
  ft: { name: 'Feet (decimal)', symbol: 'ft', metresPerUnit: 0.3048, decimals: 2 },
  mm: { name: 'Millimetres', symbol: 'mm', metresPerUnit: 0.001, decimals: 0 },
}
export const LENGTH_UNITS = Object.keys(UNITS) as LengthUnit[]
/** Square metres per square foot (0.3048²), exact. */
export const M2_PER_FT2 = 0.09290304

export const normalizeUnit = (u: unknown): LengthUnit => (u === 'ft' || u === 'mm' ? u : 'm')
export const toMetres = (value: number, unit: LengthUnit) => value * UNITS[unit].metresPerUnit
export const fromMetres = (metres: number, unit: LengthUnit) => metres / UNITS[unit].metresPerUnit
export const areaSymbol = (unit: LengthUnit) => (unit === 'ft' ? 'ft²' : 'm²')
export const areaFromM2 = (m2: number, unit: LengthUnit) => (unit === 'ft' ? m2 / M2_PER_FT2 : m2)
export const areaToM2 = (value: number, unit: LengthUnit) => (unit === 'ft' ? value * M2_PER_FT2 : value)

/** A metre value as an input shows it in `unit` (12 significant digits, as Vista: a round trip returns the same metres). */
export function inputValue(metres: number, unit: LengthUnit): number {
  const v = fromMetres(metres, unit)
  return Number.isFinite(v) ? Number(v.toPrecision(12)) : 0
}

const fmt = (v: number, decimals: number) => v.toLocaleString('en-CA', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })

/** "984.25 ft", "300.00 m", "300,000 mm". `decimals` overrides the unit's default. */
export function formatLength(metres: number, unit: LengthUnit, decimals = UNITS[unit].decimals): string {
  const v = fromMetres(metres, unit)
  return Number.isFinite(v) ? `${fmt(v, decimals)} ${UNITS[unit].symbol}` : '—'
}
/** "4,898 ft²" or "455 m²". */
export function formatArea(m2: number, unit: LengthUnit, decimals = 0): string {
  const v = areaFromM2(m2, unit)
  return Number.isFinite(v) ? `${fmt(v, decimals)} ${areaSymbol(unit)}` : '—'
}

// ---------------------------------------------------------------- text from the engines
// Engines write their results as text with metric units ("300.0 m", "2 stairs × 1,426 mm", "455 m²", "244–305 m").
// convertText rewrites those quantities for display, keeping each number's own precision. It leaves alone anything
// that is not a plain length or area: rates per area ("$/m²", "kg/m²"), speeds (m/s), volumes (m³) and kilometres.
const NUM = String.raw`[−-]?\d[\d,]*(?:\.\d+)?`
const SP = '[ \u00a0\u2009]?'
/** A number or a range, a space, and m², mm or m not followed by a letter, a digit, ³ or "/" (m/s, min, m³ stay). */
const QTY = new RegExp(String.raw`(${NUM})(\s?[–-]\s?(${NUM}))?(${SP})(m²|m2|mm|m)(?![A-Za-z0-9³/])`, 'g')
/** An area per something ("4.6 m²/person"): the area converts; a rate per area ("$/m²") has no number before it. */
const AREA_PER = new RegExp(String.raw`(${NUM})(\s?[–-]\s?(${NUM}))?(${SP})(m²)(?=/)`, 'g')

const parse = (s: string) => Number(s.replace(/,/g, '').replace('−', '-'))
const decimalsOf = (s: string) => (s.includes('.') ? s.split('.')[1].length : 0)
const show = (v: number, decimals: number, src: string) => {
  const out = v.toLocaleString('en-CA', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
  return src.startsWith('−') ? out.replace('-', '−') : out
}

/** One number from the text in its new unit, keeping the source's precision. */
function convertNumber(src: string, from: 'm' | 'mm' | 'm²', unit: 'ft' | 'mm'): string {
  const v = parse(src), d = decimalsOf(src)
  if (from === 'm²') return show(areaFromM2(v, unit), d, src)
  const metres = from === 'mm' ? v / 1000 : v
  if (unit === 'mm') return show(metres * 1000, Math.max(0, d - 3), src)
  // Feet: the source's decimals; a millimetre source gets 2 (1,426 mm → 4.68 ft).
  return show(fromMetres(metres, 'ft'), from === 'mm' ? 2 : d, src)
}

/** Rewrites metric lengths and areas in display text for `unit`. Metre mode returns the text unchanged. */
export function convertText(text: string, unit: LengthUnit): string {
  if (unit === 'm' || !text) return text
  const to = unit
  const rewrite = (all: string, a: string, range: string | undefined, b: string | undefined, sp: string, u: string) => {
    const from = (u === 'm2' ? 'm²' : u) as 'm' | 'mm' | 'm²'
    // Millimetre mode: lengths in metres become mm; areas and values already in mm stay as written.
    if (to === 'mm' && from !== 'm') return all
    const sym = from === 'm²' ? areaSymbol(to) : UNITS[to].symbol
    const right = range && b ? range.replace(b, convertNumber(b, from, to)) : ''
    return `${convertNumber(a, from, to)}${right}${sp || ' '}${sym}`
  }
  return text.replace(AREA_PER, rewrite).replace(QTY, rewrite)
}

// ---------------------------------------------------------------- the viewer's choice
const KEY = 'ts.units'
const read = (): LengthUnit => { try { return normalizeUnit(window.localStorage.getItem(KEY)) } catch { return 'm' } }

export const useUnits = create<{ unit: LengthUnit }>(() => ({ unit: typeof window === 'undefined' ? 'm' : read() }))
export function setUnit(unit: LengthUnit) {
  useUnits.setState({ unit })
  try { window.localStorage.setItem(KEY, unit) } catch { /* private mode: the choice lasts this visit only */ }
}
/** For text outside React's render (titles, canvas, file names): the current unit, read once. */
export const unitText = (text: string) => convertText(text, useUnits.getState().unit)

// ---------------------------------------------------------------- number inputs
export interface FieldUnit { label: string; toShown: (v: number) => number; fromShown: (v: number) => number }
const p12 = (v: number) => (Number.isFinite(v) ? Number(v.toPrecision(12)) : 0)

/**
 * How a number field whose value is stored in `stored` ("m", "mm" or "m²") shows in the display unit; null when the
 * field needs no conversion (other units, or metre mode, which shows fields as authored).
 */
export function fieldUnit(stored: string | undefined, display: LengthUnit): FieldUnit | null {
  const s = stored?.trim()
  if (display === 'm' || (s !== 'm' && s !== 'mm' && s !== 'm²')) return null
  if (s === 'm²') return display === 'ft' ? { label: 'ft²', toShown: (v) => p12(areaFromM2(v, 'ft')), fromShown: (v) => areaToM2(v, 'ft') } : null
  if (s === 'mm' && display === 'mm') return null
  const perStored = s === 'mm' ? 0.001 : 1
  return { label: UNITS[display].symbol, toShown: (v) => inputValue(v * perStored, display), fromShown: (v) => toMetres(v, display) / perStored }
}
