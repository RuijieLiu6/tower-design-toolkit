// The icon brief (Ruijie, 7 Nov: "The brief should contain the node's name, actual function, category, proposed visual
// metaphor, and requested style-pack version. The icon should represent what the node does; it must not imply
// capabilities the node does not have"). The same brief comes from the node editor, from our assistant and from an
// external agent (public/style-pack/node-icons/v1/icon-brief.schema.json); the shared generator (./generate.tsx) draws
// it in the style pack it names.
import type { Category } from '../../data/registry'
import type { PhaseId } from '../phases'

/** Style packs this platform can draw. A new pack adds a version; icons keep the one they were made with. */
export const STYLE_VERSIONS = ['1'] as const
export type StyleVersion = (typeof STYLE_VERSIONS)[number]
export const CURRENT_STYLE: StyleVersion = '1'
export const STYLE_PACK_URL = 'https://ruijieliu6.github.io/tower-design-toolkit/style-pack/node-icons/v1/'

/** The one main architectural object an icon shows. */
export const OBJECTS = ['tower', 'podium', 'floor', 'core', 'stairs', 'facade', 'park', 'street', 'water', 'train', 'car', 'document', 'chart', 'coins', 'sun', 'wind', 'mountain', 'people', 'solar', 'sound', 'heat'] as const
export type IconObject = (typeof OBJECTS)[number]
/** At most one supporting cue, small, at the top right. */
export const CUES = ['none', 'check', 'sun', 'drop', 'wind', 'bolt', 'pin', 'clock', 'warning', 'leaf', 'person', 'sound', 'eye', 'plus'] as const
export type IconCue = (typeof CUES)[number]

export const OBJECT_WORDS: Record<IconObject, string> = {
  tower: 'A tower', podium: 'A podium with its tower', floor: 'A floor plate with rooms', core: 'Floors around a core', stairs: 'A flight of stairs',
  facade: 'A glazed facade', park: 'A park with a tree', street: 'A street front', water: 'Water', train: 'A train', car: 'A car on its bay',
  document: 'A record sheet', chart: 'A bar chart', coins: 'A stack of coins by a tower', sun: 'The sun and a shadow', wind: 'Wind round a tower',
  mountain: 'A view to the mountains', people: 'People', solar: 'Solar panels on a roof', sound: 'Sound from a tower', heat: 'Heat from a tower',
}
export const CUE_WORDS: Record<IconCue, string> = {
  none: 'No cue', check: 'A check', sun: 'The sun', drop: 'A water drop', wind: 'Wind', bolt: 'Energy', pin: 'A place', clock: 'Time', warning: 'A warning',
  leaf: 'A leaf', person: 'A person', sound: 'Sound', eye: 'A view', plus: 'Safety',
}

export interface IconBrief {
  styleVersion: StyleVersion
  name: string
  /** What the node actually does (its question or method), not what it might. */
  function: string
  category: Category
  phase?: PhaseId
  metaphor: { object: IconObject; cue?: IconCue }
  notes?: string
}

/** Which phase colour a category wears when the brief names none (the built nodes' phases, by their categories). */
export const CATEGORY_PHASE: Record<Category, PhaseId> = {
  SITE: 'site', DATA: 'site', CLIM: 'form', ECOL: 'form', PROG: 'program', PUBL: 'program', MOBI: 'program',
  STRC: 'schematic', SYST: 'schematic', SPAC: 'schematic', ENER: 'schematic', CULT: 'present', PRES: 'present',
}

// Words → the object that shows them (first match wins, most specific first), and → a supporting cue.
const OBJECT_KEYS: [IconObject, RegExp][] = [
  // Whole words, plurals, and stems with \w* ("ecolog\w*"); "water" also inside compounds (rainwater, stormwater).
  ['sound', /\b(noise|acoustic\w*|sound\w*|decibels?|dba?)\b/], ['heat', /\b(heat\w*|thermal|overheat\w*|temperatures?|cooling)\b/],
  ['solar', /\b(pv|photovoltaics?|solar panels?|renewables?)\b/], ['water', /water|\b(rain|storm|flood|drain|plumbing)/],
  ['wind', /\b(wind|winds|windy|gusts?|draughts?|ventilat\w*)\b/], ['sun', /\b(sun|sunlight|sunlit|sunny|shadows?|shading|shade|solar|daylight\w*|light|lighting)\b/],
  ['mountain', /\b(views?|vista|mountains?|skylines?|sightlines?)\b/], ['train', /\b(transit|trains?|stations?|skytrain|metro|bus|buses)\b/],
  ['car', /\b(cars?|parking|traffic|vehicles?|loading)\b/], ['stairs', /\b(stairs?|stairways?|egress|exits?|evacuat\w*|ramps?)\b/],
  ['core', /\b(core|lifts?|elevators?|risers?|shafts?|structur\w*|seismic)\b/], ['facade', /\b(facades?|façades?|glazing|windows?|envelope|cladding)\b/],
  ['park', /\b(parks?|trees?|green\w*|ecolog\w*|habitat\w*|biodivers\w*|canopy|nature)\b/], ['street', /\b(streets?|frontages?|retail|sidewalks?|public realm|plazas?)\b/],
  ['floor', /\b(floor plans?|units?|rooms?|layouts?|interiors?|apartments?|homes?)\b/], ['coins', /\b(costs?|value|price\w*|money|econom\w*|financ\w*|budgets?|rents?|rental)\b/],
  ['people', /\b(people|occupan\w*|population|residents?|users?|visitors?|social|community)\b/], ['document', /\b(records?|documents?|reports?|claims?|logs?|declar\w*|policy|policies|licen\w*)\b/],
  ['chart', /\b(scores?|metrics?|index|rating|count|area|ratio|fsr|density|data)\b/], ['podium', /\b(podium|streetwall|massing|setbacks?)\b/],
]
const CUE_KEYS: [IconCue, RegExp][] = [
  ['warning', /\b(risks?|hazards?|danger\w*|fail\w*|warn\w*)\b/], ['clock', /\b(time|times|hours?|schedul\w*|peak|duration|phasing)\b/], ['check', /\b(check\w*|complian\w*|meets?|pass|passes|rules?|requirements?)\b/],
  ['drop', /water|\b(rain|storm)/], ['bolt', /\b(energy|power|electric\w*|carbon)\b/], ['leaf', /\b(green\w*|ecolog\w*|carbon|nature)\b/], ['person', /\b(people|persons?|occupan\w*|residents?)\b/],
  ['eye', /\b(views?|visib\w*|sightlines?)\b/], ['pin', /\b(sites?|location|address\w*|parcels?)\b/], ['sound', /\b(noise|sound)\b/], ['plus', /\b(safety|health|life)\b/],
]
const CATEGORY_OBJECT: Record<Category, IconObject> = {
  SITE: 'tower', DATA: 'chart', CLIM: 'sun', ECOL: 'park', PROG: 'chart', PUBL: 'street', MOBI: 'train', STRC: 'core', SYST: 'core', SPAC: 'floor', ENER: 'solar', CULT: 'document', PRES: 'document',
}

/** A first visual concept from what the node is and does (the user can change it before generating). */
export function proposeBrief(node: { name: string; question?: string; method?: string; category: Category; phase?: PhaseId }): IconBrief {
  const text = `${node.name} ${node.question ?? ''} ${node.method ?? ''}`.toLowerCase()
  const object = OBJECT_KEYS.find(([, re]) => re.test(text))?.[0] ?? CATEGORY_OBJECT[node.category] ?? 'tower'
  const cue = CUE_KEYS.find(([c, re]) => re.test(text) && c !== object && !(object === 'sun' && c === 'sun') && !(object === 'water' && c === 'drop') && !(object === 'sound' && c === 'sound'))?.[0] ?? 'none'
  return {
    styleVersion: CURRENT_STYLE, name: node.name.slice(0, 120), function: (node.question || node.method || node.name).slice(0, 300), category: node.category,
    phase: node.phase ?? CATEGORY_PHASE[node.category], metaphor: { object, cue },
  }
}

/** Problems with a brief, in words ([] when it can be drawn). */
export function briefProblems(b: unknown): string[] {
  const x = b as Partial<IconBrief> | null
  const out: string[] = []
  if (!x || typeof x !== 'object') return ['The icon brief is missing.']
  if (!STYLE_VERSIONS.includes(x.styleVersion as StyleVersion)) out.push(`Style pack "${String(x.styleVersion)}" is not one this platform draws (it draws ${STYLE_VERSIONS.join(', ')}).`)
  if (!x.name || typeof x.name !== 'string') out.push('The brief needs the node’s name.')
  if (!x.function || typeof x.function !== 'string') out.push('The brief needs what the node actually does (function).')
  if (!x.metaphor || !OBJECTS.includes(x.metaphor.object as IconObject)) out.push(`The metaphor's object must be one of: ${OBJECTS.join(', ')}.`)
  if (x.metaphor?.cue && !CUES.includes(x.metaphor.cue)) out.push(`The cue must be one of: ${CUES.join(', ')}.`)
  return out
}
