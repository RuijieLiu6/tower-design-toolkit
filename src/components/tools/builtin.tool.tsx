// The design tools that ship with the guided app. Their bodies live in DesignPanel.tsx and Anatomy.tsx.
import { Building, Cuboid, Layers, Layers2, MapPinned, PersonStanding, Sun } from 'lucide-react'
import Anatomy from '../Anatomy'
import { CoreTool, GroundTool, MassingTool, ProgramTool, SunTool, TowersTool } from '../DesignPanel'
import type { DesignTool } from './registry'

function AnatomyTool() { return <Anatomy embedded /> }

const tools: DesignTool[] = [
  { id: 'core', label: 'Core & floors', icon: Building, stages: ['advanced'], order: 10, defaultOpen: true,
    hint: 'Core sized to the lifts, plant, sky lobbies, stairs', component: CoreTool },
  { id: 'anatomy', label: 'Tower anatomy', icon: Layers2, stages: ['advanced'], order: 15,
    hint: 'Show or hide shell, plates, core, plant, lifts, stairs', component: AnatomyTool },
  { id: 'towers', label: 'Towers & site', icon: MapPinned, stages: ['basic', 'advanced'], order: { basic: 10, advanced: 110 }, defaultOpen: true,
    hint: 'Pick, add, import and place towers', component: TowersTool },
  { id: 'massing', label: 'Massing', icon: Cuboid, stages: ['basic', 'advanced'], order: { basic: 20, advanced: 120 }, defaultOpen: true,
    hint: 'Height, blocks, rotation, floor-to-floor', component: MassingTool },
  { id: 'program', label: 'Program', icon: Layers, stages: ['basic', 'advanced'], order: { basic: 30, advanced: 130 },
    hint: 'Uses by floor band, floor area and FSR', component: ProgramTool },
  { id: 'ground', label: 'Ground & public realm', icon: PersonStanding, stages: ['basic'], order: 40, when: (s) => s.project === 'vtc',
    hint: 'Streetwall, frontage, open space, transit link', component: GroundTool },
  { id: 'sun', label: 'Sun & time', icon: Sun, stages: ['basic', 'advanced'], order: { basic: 50, advanced: 150 },
    hint: 'Date and hour for shadows and sun views', component: SunTool },
]

export default tools
