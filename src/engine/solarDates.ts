// Dates the sun-hours map can show (kept apart from the job so the UI does not bundle the engine).
export type MapDate = 'equinox' | 'mar21' | 'jun21' | 'dec21'
export const MAP_DATES: { id: MapDate; label: string; note: string }[] = [
  { id: 'equinox', label: '22 Sep, 10–16 PT', note: 'the City test window' },
  { id: 'mar21', label: '21 Mar, whole day', note: 'sun above 10°' },
  { id: 'jun21', label: '21 Jun, whole day', note: 'sun above 10°' },
  { id: 'dec21', label: '21 Dec, whole day', note: 'sun above 10°' },
]
