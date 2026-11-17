// Site limits that need no mass (17 Nov 2026, Sinnie: "site limits should be based on building code and zoning (refer to
// dt massing tool to see) only extract building code related information … it should not require a mass"). Two lists
// for the Your site tab, beside the height readings: the zoning limits on a downtown tower's form (Downtown South
// Guidelines, as engine/siteLimits.ts checks them), and the Vancouver Building By-law rules that every downtown tower
// meets, taken from the Downtown Massing Tool's rule data (dtmass src/codes.js, compiled 1 Oct 2026 from VBBL 2025
// Vol. 1 Part 3; its massing, layout and parking rules are left out). Same shape as the height facts.
import { PLATE_MAX_M2, SEPARATION_M, TOWER_ABOVE_M, WIDTH_MAX_M } from '../engine/siteLimits'
import type { HeightFact } from './downtownHeights'

const DSG = { label: 'Downtown South Guidelines (excl. Granville Street), 4.1.3 and 4.2.4', url: 'https://guidelines.vancouver.ca/guidelines-downtown-south.pdf', read: 'opened through the newyaletown.ca copy, 17 Nov 2026; the City PDF refused automated readers' }
const VBBL = (clause: string) => ({ label: `Vancouver Building By-law 2025 (No. 14275), Division B ${clause}`, url: 'https://www.vancouver.ca/home-property-development/building-bylaw.aspx', read: 'as transcribed in the Downtown Massing Tool (codes.js, 1 Oct 2026); not re-read here' })

export const SITE_CODE: HeightFact[] = [
  // ---- zoning: the tower's form
  { id: 'sep', layer: 'form', label: 'Tower separation', value: `${SEPARATION_M} m (80 ft)`,
    note: `Parts of towers above ${TOWER_ABOVE_M} m (70 ft) stay at least ${SEPARATION_M} m apart, from towers proposed and existing; the Site limits tool measures it once a tower is placed.`, source: DSG, flag: 'unverified' },
  { id: 'plate', layer: 'form', label: 'Residential floor plate', value: `${PLATE_MAX_M2} m² (6,500 sq ft)`,
    note: `The gross plate of a residential tower above ${TOWER_ABOVE_M} m; a larger plate is a City decision at rezoning (June 2025 Residential Tower Floor Plates bulletin, not opened). Office floors are not capped.`, source: DSG, flag: 'unverified' },
  { id: 'width', layer: 'form', label: 'Tower width or depth', value: `${WIDTH_MAX_M} m (90 ft)`, note: 'The longest side of a residential tower above the podium.', source: DSG, flag: 'unverified' },
  { id: 'setbacks', layer: 'form', label: 'Setbacks', value: '3.7 m street · 12.2 m interior above 21.3 m',
    note: 'Podium 3.7 m (12 ft) from the street property line for a double row of trees; the tower 12.2 m (40 ft) from interior property lines above 21.3 m (70 ft), rear yard 9.1 m (30 ft) above 10.7 m (35 ft). Retail streets build to the property line instead (Downtown Design Guidelines 6.2.4).', source: DSG, flag: 'unverified' },
  // ---- building code (VBBL 2025, Part 3)
  { id: 'bylaw', layer: 'code', label: 'By-law in force', value: 'VBBL 2025, since 15 Sep 2025',
    note: 'Applications filed before 15 Sep 2025 may stay on the 2019 by-law until 8 Mar 2027.', source: VBBL('transition'), flag: 'unverified' },
  { id: 'high', layer: 'code', label: 'High building (3.2.6)', value: 'above 18 m residential · 36 m other',
    note: 'Every downtown tower is one: smoke control and stair pressurization, elevator emergency recall, a firefighters’ elevator, voice communication, a central alarm and control facility.', source: VBBL('3.2.6.1'), flag: 'unverified' },
  { id: 'construction', layer: 'code', label: 'Construction', value: 'noncombustible, 2 h floors, sprinklered',
    note: 'Above 18 storeys (76 m to the top residential floor) the tower is noncombustible with 2 h floors (3.2.2.47, 3.2.2.56); encapsulated mass timber reaches 12 storeys (3.2.2.48) or 18 (3.2.2.93). Sprinklers throughout (3.2.2.18).', source: VBBL('3.2.2'), flag: 'unverified' },
  { id: 'exits', layer: 'code', label: 'Exits per storey', value: '2 exit stairs, ½ diagonal apart',
    note: 'Two separate exit stairs from every storey, at least half the floor’s diagonal apart (not less than 9 m; capped at 9 m along a public corridor). The single exterior stair (3.2.10.1, 2026) is for up to 6 storeys only, never a tower.', source: VBBL('3.4.2.1, 3.4.2.3'), flag: 'unverified' },
  { id: 'travel', layer: 'code', label: 'Travel distance to an exit', value: '45 m sprinklered',
    note: '45 m in a sprinklered floor area (40 m for offices read strictly), 30 m otherwise; dwelling units may have one door when travel inside is 18 m or less.', source: VBBL('3.4.2.5'), flag: 'unverified' },
  { id: 'widths', layer: 'code', label: 'Corridors, stairs, dead ends', value: '1.1 m · 1.1 m · 6 m',
    note: 'Corridors and tower stairs at least 1.1 m clear; stairs 8 mm and doors 6.1 mm per person served; no dead-end corridor longer than 6 m.', source: VBBL('3.3.1.9, 3.4.3.2'), flag: 'unverified' },
  { id: 'firesep', layer: 'code', label: 'Fire separations between uses', value: 'homes / retail 2 h · homes / office 1 h',
    note: 'Table 3.1.3.1: residential (C) to retail (E) 2 h, to office (D), restaurant (A-2) or parking (F-3) 1 h; office to retail none. Suites 1 h; exit stairs and shafts take the floor rating.', source: VBBL('3.1.3.1'), flag: 'unverified' },
  { id: 'garage', layer: 'code', label: 'Parking levels', value: '2 exits · 2.0 m clear',
    note: 'Each parking level is its own floor area with two exits and 2.0 m clear height; stairs into other uses need vestibules.', source: VBBL('3.3.5.4, 3.4.2.1'), flag: 'unverified' },
  { id: 'energy', layer: 'code', label: 'Energy', value: 'TEUI · TEDI · GHGI limits',
    note: 'Part 10 sets energy use, heating demand and carbon intensity limits by building type, with airtightness testing and embodied-carbon reporting; a rezoning also follows the Green Buildings Policy for Rezonings.', source: VBBL('Part 10'), flag: 'unverified' },
]
