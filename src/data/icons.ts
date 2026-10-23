// One icon per meaning, always shown with a visible label (icons are aria-hidden by default in lucide-react).
// Program glyphs drawn by the team (program-value-visualizer) can replace PROGRAM_ICONS once their licence is decided.
import {
  BadgeCheck, BedDouble, BookOpen, Briefcase, Building2, Cable, CircleDashed, Database, Fan, House, Landmark, Layers, Leaf,
  MapPin, OctagonX, PanelsTopLeft, PersonStanding, Presentation, ShieldQuestionMark, ShoppingBag, Sun, TrainFront, Trees, Users, Zap,
  type LucideIcon,
} from 'lucide-react'
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
