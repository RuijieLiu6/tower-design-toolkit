// Display units in the UI (Phase 1 item 7; lib/units.ts holds the maths): <U> shows an engine's text in the viewer's
// unit, and UnitSelect is the setting (top bar and user guide). The choice is remembered in this browser.
import { useCallback } from 'react'
import { convertText, LENGTH_UNITS, setUnit, UNITS, useUnits, type LengthUnit } from '../lib/units'

/** An engine's result text with its lengths and areas in the chosen unit. */
export function U({ children }: { children?: string | null }) {
  const unit = useUnits((s) => s.unit)
  return <>{children ? keepUnits(convertText(children, unit)) : children}</>
}

/** A number and its unit never break across lines (UI review, 3 Nov: "93.5 / m" wrapped in the results). Display only. */
export function keepUnits(text: string): string {
  return text.replace(/(\d)\s+(m²|ft²|m|ft|mm|km|%|°)(?=$|[\s),.;:/±])/g, '$1 $2')
}

/** The same conversion as a function, for titles and other attributes. */
export function useUnitText() {
  const unit = useUnits((s) => s.unit)
  return useCallback((text: string) => convertText(text, unit), [unit])
}

export function UnitSelect({ className = '' }: { className?: string }) {
  const unit = useUnits((s) => s.unit)
  return (
    <select value={unit} onChange={(e) => setUnit(e.target.value as LengthUnit)} aria-label="Display units"
      title="Display units: lengths, heights and areas. Calculations, saved files and exports stay in metres."
      className={`rounded border border-line bg-panel px-1 py-0.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-accent ${className}`}>
      {LENGTH_UNITS.map((u) => <option key={u} value={u}>{u === 'ft' ? 'ft' : UNITS[u].symbol}</option>)}
    </select>
  )
}
