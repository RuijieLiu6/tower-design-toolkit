// One icon per meaning, always shown with a visible label (icons are aria-hidden by default in lucide-react).
// Program glyphs drawn by the team (program-value-visualizer) can replace PROGRAM_ICONS once their licence is decided.
import {
  Activity, Anchor, ArrowUpDown, Atom, Award, BadgeCheck, BedDouble, Bell, Bird, BookOpen, Bot, Box, Brain, Briefcase, BrickWall,
  Building2, Cable, Calculator, CircleDashed, CircleDollarSign, ClipboardCheck, Clover, Compass, Cone, Cpu, Crown, Database, Diamond,
  Dna, DoorOpen, Droplet, Fan, Feather, FileBox, FireExtinguisher, Flag as FlagIcon, FlaskRound, Flower2, Gem, Globe, Handshake, Hexagon,
  Hourglass, House, Infinity as InfinityIcon, Key, Landmark, Layers, Leaf, Lightbulb, Magnet, Map as MapIcon, MapPin, Microscope, Moon, MountainSnow, Octagon,
  OctagonX, Orbit, Origami, Palette, PanelsTopLeft, Paperclip, Pentagon, PersonStanding, PlugZap, Presentation, Puzzle, Ratio, Rocket,
  Sailboat, Scale, Shapes, Shell, ShieldQuestionMark, ShoppingBag, Sigma, Snowflake, Sofa, Sparkles, Sprout, SquareParking, Star,
  Store, Sun, SunDim, SunMedium, Sunrise, Target, Telescope, Tent, TrainFront, TramFront, Trees, Triangle, Trophy, Umbrella, Users,
  WandSparkles, Wind, Wrench, Eye, Plane, Zap,
  type LucideIcon,
} from '../components/icons'
import {
  Aperture, BelowGrade, Building as BuildingIcon, Camera, ChartColumn, ClipboardList, Cloud, Columns3, CorePlan, Cuboid, FileCheck2, FileImage,
  FileJson, FileUp, Footprints, GitCommitHorizontal, GraduationCap, Grid2x2, Hammer, HardHat, ImagePlus, LandPlot, Layers2, LayoutGrid,
  LayoutPanelTop, MapPinned, SquareDashed, ScrollText, CircleCheckBig, Ban, GitCompareArrows, Network, Package, Axis3d, MessageSquare, MessagesSquare, Image as ImageIcon, PencilLine, PenTool, Recycle, Rows3,
  Ruler, Scissors, ShieldCheck, Tags, TowerHeight, TowerOnSite, TowerStack, TowerSun, Wand2, Waypoints, Workflow,
} from '../components/icons'
import type { Category } from './registry'
import type { Flag, UseId } from '../engine/types'

// The icon book (Ruijie, 7 Nov: "make sure there is no repetitive icons … check across the site to see how many
// individual icons you need … develop different icons for all tools"). Every meaning shown as an icon has its own
// drawing, and no drawing stands for two meanings: categories, built nodes, design tools, process steps, user types,
// the landing page's ways in, preset workflows, uses and evidence flags. icons.test.ts checks the whole book.

export const CATEGORY_ICONS: Record<Category, LucideIcon> = {
  SITE: MapIcon,
  PROG: ChartColumn,
  CLIM: Cloud,
  ENER: Zap,
  ECOL: Leaf,
  PUBL: Footprints,
  CULT: BookOpen,
  MOBI: TrainFront,
  STRC: Columns3,
  SYST: Cable,
  SPAC: PanelsTopLeft,
  PRES: FileImage,
  DATA: Database,
}

/** The five steps of the guided process (the process rail, the landing page's phase board, the preset cards). */
export const STEP_ICONS = { site: LandPlot, volume: Shapes, program: Rows3, plates: Grid2x2, frame: Aperture } as const

/**
 * The design tools, by tool id (components/tools and the *.tool.tsx files read their icon here). Present's tools are
 * listed too, for the phase board. The word is what the tool tile shows.
 */
export const TOOL_ICONS = {
  site: MapPin, 'rhino-import': FileUp,
  towers: TowerOnSite, 'height-suggestion': TowerHeight, generate: Wand2, massing: Cuboid, sun: TowerSun, basement: BelowGrade,
  program: TowerStack, ground: PersonStanding, brief: ClipboardList,
  core: CorePlan, anatomy: Layers2, plan: LayoutPanelTop, section: Scissors,
  camera: Camera, capture: ImagePlus, boards: LayoutGrid, drawings: PencilLine, render: ImageIcon,
} as const satisfies Record<string, LucideIcon>
export type ToolIconId = keyof typeof TOOL_ICONS
export const TOOL_WORDS: Record<ToolIconId, string> = {
  site: 'Site', 'rhino-import': 'Import', towers: 'Position', 'height-suggestion': 'Height', generate: 'Generate', massing: 'Massing',
  sun: 'Sun', basement: 'Basement', program: 'Program', ground: 'Ground', brief: 'Brief', core: 'Core', anatomy: 'Anatomy', plan: 'Plan',
  section: 'Section', camera: 'Camera', capture: 'Capture', boards: 'Boards', drawings: 'Drawings', render: 'Render',
}

/** Customize's library: the Layer 0 sources, the logic nodes and the non-category tabs. */
export const SOURCE_ICONS: Record<string, LucideIcon> = { 'src.site': SquareDashed, 'src.massing': Box, 'src.program': ScrollText }
export const LOGIC_ICONS: Record<string, LucideIcon> = { 'logic.all-pass': CircleCheckBig, 'logic.any-fail': Ban, 'logic.score': Sigma, 'logic.compare': GitCompareArrows }
export const LIBRARY_TAB_ICONS = { L0: Axis3d, LOGIC: Network, MINE: Package } as const

/** Who the visitor is (the landing page's agent, the top bar's role). */
export const TYPE_ICONS = { designer: GraduationCap, practitioner: HardHat, planner: ShieldCheck, engineer: Wrench, explore: Compass } as const

/** The landing page's ways to design a workflow. */
export const WAY_ICONS = { ask: MessageSquare, presets: Tags, phases: GitCommitHorizontal, graph: Workflow, import: FileJson, node: Puzzle } as const

/** The preset workflows (lib/userTypes.ts), each its own picture. */
export const PRESET_ICONS: Record<string, LucideIcon> = {
  'designer.competition': Trophy, 'designer.neighbourhood': MapPinned, 'designer.form': PenTool, 'designer.codesign': MessagesSquare,
  'practitioner.rezoning': Scale, 'practitioner.schematic': BuildingIcon, 'practitioner.permit': FileCheck2,
  'planner.views': Telescope, 'planner.public': Sun, 'planner.growth': Building2,
  'engineer.structure': Hammer, 'engineer.vertical': Layers, 'engineer.sustainability': Recycle,
  /** The workflow the landing page's agent builds from a design concept (components/landing/Agent.tsx). */
  concept: Feather,
}

export const PROGRAM_ICONS: Record<UseId, LucideIcon> = {
  retail: ShoppingBag,
  office: Briefcase,
  hotel: BedDouble,
  residential: House,
  civic: Landmark,
  amenity: Trees,
  mechanical: Fan,
}

export const FLAG_ICONS: Record<Flag, LucideIcon> = {
  verified: BadgeCheck,
  team_assumption: Users,
  unverified: ShieldQuestionMark,
  unresolved: CircleDashed,
  false_assumption: OctagonX,
}

/**
 * One distinct icon per built node, for the icon-only node bar (the name shows on hover and focus).
 * Every built node needs its own entry: icons.test.ts fails on a missing entry or on two nodes sharing an icon.
 */
export const NODE_ICONS: Record<string, LucideIcon> = {
  'built.vtc-rules': ClipboardCheck,
  'built.fsr': Calculator,
  'built.viewcones': Cone,
  'built.relax-aviation': Plane,
  'built.sun': Sunrise,
  'built.core-lifts': ArrowUpDown,
  'built.egress': DoorOpen,
  'built.life-safety': FireExtinguisher,
  'built.sky-room': Sparkles,
  'built.economics': CircleDollarSign,
  'built.culture-claims': Handshake,
  'built.model': FileBox,
  'built.provenance': Bot,
  'built.mobility': SquareParking,
  'built.facade': Bird,
  'built.interior': Sofa,
  'built.daylight-depth': Lightbulb,
  'built.view-from': Eye,
  'built.vista': MountainSnow,
  'built.heights': Ruler,
  'built.pr-streetwall': BrickWall,
  'built.pr-frontage': Store,
  'built.pr-ground': Flower2,
  'built.city-in-nature': Sprout,
  'built.solar-access': Umbrella,
  'built.wind-procedure': Ratio,
  'built.structure': Activity,
  'built.wind-study': FlagIcon,
  'built.wind-screen': Wind,
  'built.trips': Waypoints,
  'built.energy-carbon': PlugZap,
}

/** Icons for My / Community nodes, none of them used by a built node. */
export const COMMUNITY_ICON_POOL: LucideIcon[] = [
  Atom, FlaskRound, Brain, Cpu, Diamond, Dna, Droplet, Gem, Globe, Hexagon, Key, Magnet,
  Microscope, Moon, Octagon, Palette, Pentagon, Rocket, Shell, Snowflake, Star, Target, Tent, Triangle,
  Anchor, Award, Bell, Hourglass, Orbit, Clover, Origami, InfinityIcon,
  Paperclip, Crown, Sailboat,
]

function hash(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}

/**
 * A distinct pool icon for each community node id. It depends only on the set of ids (each id starts at its hash and
 * steps on past taken icons), so the icons stay put as the list is reordered. Once the pool is used up the rest get
 * null, and the bar draws the node's initials instead.
 */
export function communityIcons(ids: string[]): Map<string, LucideIcon | null> {
  const out = new Map<string, LucideIcon | null>()
  const taken = new Set<number>()
  for (const id of [...new Set(ids)].sort()) {
    if (taken.size >= COMMUNITY_ICON_POOL.length) { out.set(id, null); continue }
    let k = hash(id) % COMMUNITY_ICON_POOL.length
    while (taken.has(k)) k = (k + 1) % COMMUNITY_ICON_POOL.length
    taken.add(k)
    out.set(id, COMMUNITY_ICON_POOL[k])
  }
  return out
}
