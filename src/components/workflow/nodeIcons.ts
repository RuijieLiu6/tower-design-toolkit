// A distinct glyph per node, picked from its name, so the palette reads like Grasshopper's icon tabs.
// The category icon is the fallback; the category colour always frames the glyph.
import {
  Accessibility, ArrowUpDown, Bird, Box, Building, Camera, ChartColumn, CircleCheck, CircleDollarSign, CircleX, ClipboardCheck, Cloud, Columns3,
  Compass, Database, Droplets, Eye, Factory, FileText, Flame, Footprints, Gauge, GitCompareArrows, Hammer, Image, KeyRound, Landmark, Layers,
  LayoutGrid, Leaf, Lightbulb, Map as MapIcon, MapPin, MessageSquare, Mountain, Network, Package, Palette, Plane, Recycle, Ruler, Scale, ScrollText,
  ShieldCheck, Sigma, Sparkles, Sun, Thermometer, TrainFront, TreePine, Truck, Users, Waypoints, Wind, Zap, type LucideIcon,
} from '../icons'
import { CATEGORY_ICONS } from '../../data/icons'
import type { Category } from '../../data/registry'

// First match wins, so specific words come before general ones.
const KEYWORDS: [RegExp, LucideIcon][] = [
  [/view.?cone|cone|isovist|visibility|viewpoint|skyline/i, Eye],
  [/wind/i, Wind],
  [/shadow|solar|sun|daylight|glare/i, Sun],
  [/rain|water|storm/i, Droplets],
  [/thermal|heat|comfort|overheat/i, Thermometer],
  [/bird/i, Bird],
  [/tree|canopy|planting|habitat|greening|nature/i, TreePine],
  [/carbon|ghg|emission/i, Factory],
  [/energy|teui|electrical|pv|power/i, Zap],
  [/smoke|fire/i, Flame],
  [/lift|elevator|vertical/i, ArrowUpDown],
  [/egress|stair|exit|evacuation/i, Footprints],
  [/accessib|barrier|inclusive/i, Accessibility],
  [/transit|station|mode split|trip/i, TrainFront],
  [/parking|loading|servicing|kerb|waste|logistic/i, Truck],
  [/airspace|aviation|obstruction/i, Plane],
  [/seismic|lateral|structur|foundation|timber|slender/i, Columns3],
  [/cost|pro forma|value|finance|charges|land lift|cac|economic/i, CircleDollarSign],
  [/fsr|density|program|occupan|activity|adjacen|stacking/i, Layers],
  [/datum|crs|georef|north|frame|units/i, Compass],
  [/terrain|mountain|backdrop/i, Mountain],
  [/footprint|lidar|height extraction|lod1/i, Building],
  [/map|zoning|land-use|register|policy/i, MapIcon],
  [/site|block|siting/i, MapPin],
  [/facade|envelope|glazing|wwr/i, LayoutGrid],
  [/material|colour|color|style/i, Palette],
  [/camera|capture|render/i, Camera],
  [/drawing|linework|plans|section/i, Ruler],
  [/board|layout|composer|jpeg/i, Image],
  [/rubric|jury|self-assessment|gate|checker|checklist|validator|audit/i, ClipboardCheck],
  [/engagement|nation|reconciliation|indigenous|cultural|ethic/i, Users],
  [/precedent|library|knowledge|prompt/i, Lightbulb],
  [/licen|permission|rights|governance|secrets|privacy/i, KeyRound],
  [/comment|review|rating/i, MessageSquare],
  [/provenance|ledger|trace|log|writing/i, ScrollText],
  [/badge|evidence|flag/i, ShieldCheck],
  [/comparison|compare|comparator/i, GitCompareArrows],
  [/uncertainty|sensitivity|statistic|calibration/i, Sigma],
  [/canvas|node|dag|port/i, Network],
  [/registry|distribution|manifest|package|sandbox/i, Package],
  [/storage|tiling|cache|hosting|schema|import|format|layer/i, Database],
  [/public|street|sidewalk|frontage|open space|permeab|realm|life/i, Landmark],
  [/performance|budget|kernel/i, Gauge],
  [/ai|llm|evaluation harness/i, Sparkles],
  [/quantit|construction/i, Hammer],
  [/scorecard|ledger/i, ChartColumn],
  [/deliverable|tracker|text|report/i, FileText],
  [/recycl|resource/i, Recycle],
  [/route|connectivity|connection|flows/i, Waypoints],
  [/leaf|ecolog/i, Leaf],
  [/cloud|sky/i, Cloud],
  [/legal|rule|code/i, Scale],
]

const cache = new Map<string, LucideIcon>()
export function iconFor(name: string, category: Category | undefined): LucideIcon {
  const key = `${category}:${name}`
  let icon = cache.get(key)
  if (!icon) {
    icon = KEYWORDS.find(([re]) => re.test(name))?.[1] ?? (category ? CATEGORY_ICONS[category] : Box)
    cache.set(key, icon)
  }
  return icon
}

export const STATE_ICON = { pass: CircleCheck, fail: CircleX } as const
