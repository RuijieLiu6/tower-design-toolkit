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
} from 'lucide-react'
import { Ruler } from 'lucide-react'
import type { Category } from './registry'
import type { Flag, UseId } from '../engine/types'

export const CATEGORY_ICONS: Record<Category, LucideIcon> = {
  SITE: MapPin,
  PROG: Layers,
  CLIM: Sun,
  ENER: Zap,
  ECOL: Leaf,
  PUBL: PersonStanding,
  CULT: BookOpen,
  MOBI: TrainFront,
  STRC: Building2,
  SYST: Cable,
  SPAC: PanelsTopLeft,
  PRES: Presentation,
  DATA: Database,
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
  'built.daylight-depth': SunDim,
  'built.view-from': Eye,
  'built.vista': MountainSnow,
  'built.heights': Ruler,
  'built.pr-streetwall': BrickWall,
  'built.pr-frontage': Store,
  'built.pr-ground': Trees,
  'built.city-in-nature': Sprout,
  'built.solar-access': SunMedium,
  'built.wind-procedure': Ratio,
  'built.structure': Activity,
  'built.wind-study': FlagIcon,
  'built.wind-screen': Wind,
  'built.trips': TramFront,
  'built.energy-carbon': PlugZap,
}

/** Icons for My / Community nodes, none of them used by a built node. */
export const COMMUNITY_ICON_POOL: LucideIcon[] = [
  Atom, FlaskRound, Brain, Compass, Cpu, Diamond, Dna, Droplet, Feather, Gem, Globe, Hexagon, Key, Lightbulb, Magnet, MapIcon,
  Microscope, Moon, Octagon, Palette, Pentagon, Puzzle, Rocket, Shell, Snowflake, Star, Target, Tent, Triangle, Umbrella,
  WandSparkles, Wrench, Anchor, Award, Bell, Box, Telescope, Hourglass, Shapes, Orbit, Clover, Origami, Flower2, InfinityIcon,
  Paperclip, Scale, Sigma, Trophy, Crown, Sailboat,
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
