// What the research figures say, from the research site's own figure script (vancouver-tower-toolbench, the "How the
// toolkit runs" diagrams): the five design stages, the ten analysis nodes, the drawing set and who does each step.
// Each takes the icon the rest of the toolkit uses for the same meaning (data/icons.ts): a stage is the phase board's
// step icon in the phase board's hue, an analysis node is the built node that answers it, Your tool is the landing
// page's "Your node", the drawing set is the Drawings tool. Rain, Model in CAD and Design development have no built
// counterpart, so they take drawings no other meaning uses.
import { CircleCheck, CircleX, Clock, DraftingCompass, Droplets, FileDown, ListChecks, Monitor, type LucideIcon } from '../../icons'
import { NODE_ICONS, STEP_ICONS, TOOL_ICONS, TOOL_WORDS, WAY_ICONS } from '../../../data/icons'
import { EVALUATE } from '../../../data/stages'
import { BUILT_NODES } from '../../../data/registry'
import { HUES, hueFor, nodeHue } from '../../GlassIcon'
import type { Role } from './kit'

export interface Item { k: string; name: string; word: string; icon: LucideIcon; hue: number; role: Role; sub?: string; num?: string; built?: string }

/** The five stages. Concept / research is the toolkit's Site phase; hues are the phase board's (Composer.tsx). */
export const STAGES = {
  concept: { k: 'concept', num: '01', name: 'Concept / research', word: 'Concept', sub: 'Site, climate, zoning, brief', icon: STEP_ICONS.site, hue: HUES.sky, role: 'you' },
  form: { k: 'form', num: '02a', name: 'Form', word: 'Form', sub: 'Massing options, basic or advanced', icon: STEP_ICONS.volume, hue: HUES.coral, role: 'you' },
  program: { k: 'program', num: '02b', name: 'Program', word: 'Program', sub: 'Stack uses, test area and mix', icon: STEP_ICONS.program, hue: HUES.yellow, role: 'you' },
  schematic: { k: 'schematic', num: '03', name: 'Schematic', word: 'Schematic', sub: 'Core, structure grid, circulation', icon: STEP_ICONS.plates, hue: HUES.violet, role: 'you' },
  development: { k: 'development', num: '04', name: 'Design development', word: 'Development', sub: 'Facade, systems, details', icon: DraftingCompass, hue: HUES.teal, role: 'you' },
} satisfies Record<string, Item>
export type StageKey = keyof typeof STAGES

const node = (id: string) => {
  const n = BUILT_NODES.find((x) => x.id === id)
  return { icon: NODE_ICONS[id], hue: n ? nodeHue(id, n.category) : HUES.sky, built: n?.name }
}

/** The ten analysis nodes, in the research figure's order. */
export const ANALYSES: Item[] = [
  { k: 'sun', name: 'Sun', word: 'Sun', role: 'tool', ...node('built.sun') },
  { k: 'rain', name: 'Rain', word: 'Rain', role: 'tool', icon: Droplets, hue: HUES.cyan },
  { k: 'view', name: 'View cone', word: 'View cone', role: 'tool', ...node('built.viewcones') },
  { k: 'traffic', name: 'Traffic', word: 'Traffic', role: 'tool', ...node('built.trips') },
  { k: 'circulation', name: 'Circulation', word: 'Circulation', role: 'tool', ...node('built.core-lifts') },
  { k: 'economics', name: 'Economics', word: 'Economics', role: 'tool', ...node('built.economics') },
  { k: 'energy', name: 'Energy', word: 'Energy', role: 'tool', ...node('built.energy-carbon') },
  { k: 'structure', name: 'Structure', word: 'Structure', role: 'tool', ...node('built.structure') },
  { k: 'code', name: 'Building code', word: 'Building code', role: 'tool', ...node('built.life-safety') },
  // Your own tool, built with your agent (the research site draws it in the violet of "AI helps").
  { k: 'your', name: 'Your tool', word: 'Your tool', role: 'ai', icon: WAY_ICONS.node, hue: HUES.pink, built: 'your own node, made with the node-builder skill' },
]
export const analysis = (k: string) => ANALYSES.find((a) => a.k === k)!

export const analysisText = (a: Item) => `Analysis node: it reads the shared model and is available to every stage.${a.built ? ` In the toolkit: ${a.built}.` : ''}`

/** The output: the drawing set (the Drawings tool, its word and hue as on the tool tiles). */
export const DRAWINGS: Item = { k: 'drawings', name: 'Drawing set', word: TOOL_WORDS.drawings, sub: 'Plans, sections, diagrams, renders', icon: TOOL_ICONS.drawings, hue: hueFor(TOOL_WORDS.drawings), role: 'tool' }
/** The massing engine (the Massing tool), basic or advanced. */
export const ENGINE: Item = { k: 'engine', name: 'Massing engine', word: TOOL_WORDS.massing, icon: TOOL_ICONS.massing, hue: hueFor(TOOL_WORDS.massing), role: 'tool' }

/** "Why one platform": today's five separate steps, and the loop on one model. */
export const TODAY: Item[] = [
  { k: 'research', name: 'Research', word: 'Research', icon: STAGES.concept.icon, hue: STAGES.concept.hue, role: 'you' },
  { k: 'cad', name: 'Model in CAD', word: 'CAD model', icon: Monitor, hue: HUES.indigo, role: 'tool' },
  { k: 'export', name: 'Export to analysis', word: 'Export', icon: FileDown, hue: HUES.orange, role: 'code' },
  { k: 'wait', name: 'Wait for results', word: 'Wait', icon: Clock, hue: HUES.yellow, role: 'tool' },
  { k: 'fail', name: "It doesn't work", word: "Doesn't work", icon: CircleX, hue: HUES.red, role: 'code' },
]
export const LOOP: Item[] = [
  { k: 'mass', name: 'Mass', word: 'Mass', icon: STAGES.form.icon, hue: STAGES.form.hue, role: 'you' },
  { k: 'analyse', name: 'Analyse', word: 'Analyse', icon: EVALUATE.icon, hue: HUES.sky, role: 'tool' },
  { k: 'learn', name: 'Learn', word: 'Learn', icon: ListChecks, hue: HUES.lime, role: 'code' },
]
export const PROCEED: Item = { k: 'proceed', name: 'Proceed, knowing it works', word: 'Proceed', icon: CircleCheck, hue: HUES.green, role: 'you' }
