// The design tools that ship with the guided app. Their bodies live in DesignPanel.tsx and Anatomy.tsx.
import { Building, Cuboid, Layers, Layers2, PersonStanding, Sun, TowerOnSite } from '../icons'
import { TOOL_ICONS } from '../../data/icons'
import Anatomy from '../Anatomy'
import { CoreTool, GroundTool, MassingTool, ProgramTool, SunTool, TowersTool } from '../DesignPanel'
import type { DesignTool } from './registry'

function AnatomyTool() { return <Anatomy embedded /> }

const tools: DesignTool[] = [
  { id: 'core', label: 'Core & floors', short: 'Core', icon: TOOL_ICONS['core'], stages: ['advanced'], order: 10, defaultOpen: true,
    hint: 'Core sized to the lifts, plant, sky lobbies, stairs', component: CoreTool },
  { id: 'anatomy', label: 'Tower anatomy', short: 'Anatomy', icon: TOOL_ICONS['anatomy'], stages: ['advanced'], order: 15,
    hint: 'Show or hide shell, plates, core, plant, lifts, stairs', component: AnatomyTool },
  // Tower position (Ruijie, 6 Nov): a tower on its site; opening it locks the view on the site, the tower drags on the
  // ground, and the right panel's Properties tab takes exact numbers. Every change applies at once (no Confirm).
  { id: 'towers', label: 'Tower position', short: 'Position', icon: TOOL_ICONS['towers'], stages: ['basic', 'advanced'], order: { basic: 10, advanced: 110 }, defaultOpen: true,
    hint: 'Where the tower stands: drag it on the site, click the ground, or type the numbers in Properties', component: TowersTool },
  { id: 'massing', label: 'Massing', short: 'Massing', icon: TOOL_ICONS['massing'], stages: ['basic', 'advanced'], order: { basic: 20, advanced: 120 }, defaultOpen: true,
    hint: 'Height, blocks, rotation, floor-to-floor', component: MassingTool },
  { id: 'program', label: 'Program', short: 'Program', icon: TOOL_ICONS['program'], stages: ['basic', 'advanced'], order: { basic: 30, advanced: 130 },
    hint: 'Uses by floor band, floor area and FSR', component: ProgramTool },
  { id: 'ground', label: 'Ground & public realm', short: 'Ground', icon: TOOL_ICONS['ground'], stages: ['basic'], order: 40, when: (s) => s.project === 'vtc',
    hint: 'Streetwall, frontage, open space, transit link', component: GroundTool },
  { id: 'sun', label: 'Sun & time', short: 'Sun', icon: TOOL_ICONS['sun'], stages: ['basic', 'advanced'], order: { basic: 14, advanced: 150 },
    hint: 'Date and hour for shadows and sun views', component: SunTool },
]

export default tools
