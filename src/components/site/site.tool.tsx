// "Site", the first design tool of the Site step (tools/registry.ts collects every *.tool.tsx; lib/step.ts orders the
// panel by step): an address, a neighbourhood, or a click on the map, in Real Vancouver; the competition block in one
// click. Icon: lucide MapPin (a place), always with its word. The body loads lazily, so this file stays light.
import { lazy } from 'react'
import { MapPin } from 'lucide-react'
import type { DesignTool } from '../tools/registry'

export default {
  id: 'site', label: 'Site', icon: MapPin, stages: ['basic'], steps: ['site'], order: 5, defaultOpen: true,
  hint: 'Address, neighbourhood or a click on the map',
  component: lazy(() => import('./SiteStart')),
} satisfies DesignTool
