// Who is designing, and how they might start (Ruijie, 6 Nov: "a platform which designers of different focus could use …
// start the page with a landing page with a natural language model agent to help the tool define its users, and for each
// user type … create at least 3 preset nodes combination and workflows to begin with"). Four user types, each with
// starting workflows: a project, the step it opens on and the analysis nodes switched on (only built nodes, and only
// those that run on that project). A preset is a starting point: every node can be switched on or off afterwards, in
// the guided app or as a graph in Customize. The agent (lib/agent) matches what a visitor types to these words.
import { create } from 'zustand'
import type { StepId } from './step'
import { canonicalNodes } from '../data/registry'

export type UserTypeId = 'designer' | 'practitioner' | 'planner' | 'engineer'

export interface Preset {
  id: string
  type: UserTypeId
  /** Short, sentence case: what the person wants to do. */
  name: string
  /** One plain line: what they get from it. */
  goal: string
  project: 'vtc' | 'city'
  /** The step the guided app opens on. */
  step: StepId
  /** Analysis nodes switched on, in the order they matter for this workflow. */
  nodes: string[]
  /** How people describe this goal in their own words (the agent's examples). */
  says: string[]
}

export interface UserType {
  id: UserTypeId
  name: string
  /** Who this is, in a line. */
  who: string
  /** How people of this type describe themselves (the agent's examples). */
  says: string[]
  presets: Preset[]
}

export const USER_TYPES: UserType[] = [
  {
    id: 'designer', name: 'Passionate designer', who: 'Students and curious citizens, no expertise needed',
    says: [
      "I'm an architecture student entering the Vancouver Tall Challenge",
      "I'm a student designing a tower for my studio project",
      "I'm a resident and want to see what a tower would do to my neighbourhood",
      "I'm not an architect, just curious how towers get designed",
      'We are running a community co-design workshop',
      "I'm a citizen worried about shadows and views on my street",
      'first time designing a building, a beginner',
    ],
    presets: [
      {
        id: 'designer.competition', type: 'designer', name: 'Enter the Vancouver Tall Challenge',
        goal: "The competition block and its rules, with the public realm (40% of the jury's marks) first.",
        project: 'vtc', step: 'site',
        // 21 Nov (R10 juries: "not distinctive enough", no reading of the skyline): the silhouette reading joins the Form checks.
        // 21 Nov (P1 #12 occupant loads): the exit stairs, now that amenity floors fill at the BCBC 2024 lounge row.
        nodes: ['built.vtc-rules', 'built.fsr', 'built.pr-streetwall', 'built.pr-frontage', 'built.pr-ground', 'built.sun', 'built.wind-screen', 'built.silhouette', 'built.sky-room', 'built.f2f-use', 'built.egress'],
        says: ['competition entry and boards', 'Vancouver Tall Challenge brief and rules', 'student competition deadline'],
      },
      {
        id: 'designer.neighbourhood', type: 'designer', name: 'What a tower would mean for my street',
        goal: 'A real Vancouver site: the views it blocks, the shadows it casts and how tall the City lets it go.',
        project: 'city', step: 'site',
        // 21 Nov (P1 #3): open space and the sun on the design's own square.
        nodes: ['built.view-from', 'built.viewcones', 'built.heights', 'built.relax-aviation', 'built.solar-access', 'built.sun', 'built.wind-screen', 'built.pr-ground'],
        says: ['shadows on my street and park', 'would it block the mountain views', 'how tall can a tower be here', 'impact on my neighbourhood'],
      },
      {
        id: 'designer.form', type: 'designer', name: 'Sketch a tower and see how it does',
        goal: 'Shape a tower freely and read sun, wind, daylight, value and carbon as you go.',
        project: 'vtc', step: 'volume',
        nodes: ['built.sun', 'built.wind-screen', 'built.silhouette', 'built.daylight-depth', 'built.f2f-use', 'built.fsr', 'built.economics', 'built.energy-carbon', 'built.wind-procedure', 'built.structure'],
        says: ['play with the form and massing', 'quick massing study', 'try shapes and see the results'],
      },
      {
        id: 'designer.codesign', type: 'designer', name: 'Run a co-design workshop',
        goal: 'The ground floor and public space a group can shape together, with care for culture and claims.',
        project: 'vtc', step: 'program',
        nodes: ['built.pr-streetwall', 'built.pr-frontage', 'built.pr-ground', 'built.sky-room', 'built.solar-access', 'built.city-in-nature', 'built.interior'],
        says: ['community workshop with residents', 'co-design session', 'public space and ground floor with the community'],
      },
      {
        // Sinnie, 13 Nov: "a preset workflow named demo: site, massing, program, sun/wind/rain/energy related nodes, and
        // view cone, and final presentation sheet". Real Vancouver, since the view-cone check runs only there.
        id: 'designer.demo', type: 'designer', name: 'Demo',
        goal: 'The whole run in one go: site and view cones, massing with sun, wind and rain, program, the building code, then facade, daylight, air and energy, and the presentation sheet.',
        project: 'city', step: 'site',
        // Checks only: the Site, Massing, Program, Core and Frame steps go in front of each phase's first check by themselves
        // (lib/workflow/designNodes.ts withDesignSteps). Floor area brings the Program step, the board record the Frame step
        // with the presentation sheet.
        // 13 Nov: the Sun & Wind Studio tools in place of the old sun, wind and energy checks, and its rain tools added.
        // 13 Nov (Sinnie: "can you include those into the demo workflow"): all sixteen Sun & Wind Studio tools again, now
        // that each has the Studio's level of drawings, in the order of the design.
        nodes: ['built.viewcones',
          'built.sw-shadow', 'built.sw-sun-faces', 'built.sw-wind-comfort', 'built.sw-wind-height', 'built.sw-rain-faces', 'built.sw-rain-water', 'built.sw-form',
          'built.fsr',
          // 17 Nov (Sinnie: "include view cone and building code as a node tool for the demo workflow"): the building code
          // check (VBBL high-building and life-safety requirements) at the head of the Schematic checks; view cones lead the run.
          'built.life-safety',
          'built.sw-glazing', 'built.sw-daylight', 'built.sw-natvent', 'built.sw-airflow', 'built.sw-indoor-temp', 'built.sw-energy', 'built.sw-pv'],
        says: ['demo', 'show the whole tool', 'walk through the toolkit from site to boards'],
      },
    ],
  },
  {
    id: 'practitioner', name: 'Practitioner architect', who: 'Architects taking a Vancouver high-rise from feasibility to permit',
    says: [
      "I'm an architect at a Vancouver practice working on a high-rise",
      'We are testing a rezoning for a downtown site',
      "I'm a project architect preparing a development permit",
      'design team doing feasibility for a client',
      'I lead the schematic design of a residential tower',
      'I run a small architecture office',
      'our client has a downtown lot and wants a tower',
      'registered architect, licensed professional',
    ],
    presets: [
      {
        id: 'practitioner.rezoning', type: 'practitioner', name: 'Rezoning feasibility',
        goal: 'Height limits, view cones and their relaxations, density and the land value, before the first meeting.',
        project: 'city', step: 'site',
        nodes: ['built.heights', 'built.viewcones', 'built.relax-aviation', 'built.vista', 'built.fsr', 'built.economics', 'built.solar-access', 'built.f2f-use'],
        says: ['rezoning enquiry', 'feasibility and pro forma', 'how tall and how much floor area', 'Higher Buildings Policy site'],
      },
      {
        id: 'practitioner.schematic', type: 'practitioner', name: 'Schematic core and code',
        goal: 'Core, lifts, stairs, structure and floor plates sized as the form settles.',
        project: 'city', step: 'plates',
        nodes: ['built.core-lifts', 'built.egress', 'built.life-safety', 'built.structure', 'built.wind-procedure', 'built.interior', 'built.daylight-depth'],
        says: ['core and lifts', 'floor plate efficiency', 'schematic design', 'building code and egress'],
      },
      {
        id: 'practitioner.permit', type: 'practitioner', name: 'Permit-stage checks',
        goal: 'Code, parking and loading, trips, facade, energy and nature: the lists a permit asks for.',
        project: 'city', step: 'plates',
        // 21 Nov (P1 #11 smoke path): exit separation read along the smoke path joins the permit checks.
        nodes: ['built.life-safety', 'built.egress', 'built.mobility', 'built.trips', 'built.facade', 'built.energy-carbon', 'built.city-in-nature'],
        says: ['development permit', 'building permit submission', 'checklist before submitting'],
      },
    ],
  },
  {
    id: 'planner', name: 'Planner or City reviewer', who: 'Planners and reviewers testing a proposal against policy',
    says: [
      "I'm a City planner reviewing a tower proposal",
      'I review rezoning applications',
      "I'm an urban planner looking at downtown policy",
      'policy analyst checking a development against the guidelines',
      'urban designer at the City',
    ],
    presets: [
      {
        id: 'planner.views', type: 'planner', name: 'Views and the Higher Buildings Policy',
        goal: 'Which protected views the proposal enters, how far, and which relaxation routes could apply.',
        project: 'city', step: 'site',
        nodes: ['built.viewcones', 'built.relax-aviation', 'built.vista', 'built.view-from', 'built.heights', 'built.solar-access', 'built.city-in-nature', 'built.wind-procedure'],
        says: ['protected view cones', 'Higher Buildings Policy', 'height review', 'skyline and mountain views'],
      },
      {
        id: 'planner.public', type: 'planner', name: 'Shadows, wind and public space',
        goal: 'New shadow on parks and plazas, wind at street level, sky room access and nature.',
        project: 'city', step: 'volume',
        // 21 Nov (P1 #3): open space and the sun on the design's own square.
        nodes: ['built.solar-access', 'built.sun', 'built.wind-study', 'built.wind-screen', 'built.sky-room', 'built.city-in-nature', 'built.pr-ground'],
        says: ['shadow on parks', 'solar access guidelines', 'pedestrian wind', 'public realm review'],
      },
      {
        id: 'planner.growth', type: 'planner', name: 'Density, transit and servicing',
        goal: 'Floor area and value, homes and keys per floor, trips and the station entrance, parking and loading.',
        project: 'city', step: 'program',
        // 21 Nov (P1 #2): the HBP 2.1(g) community benefit, with the sky room.
        nodes: ['built.fsr', 'built.economics', 'built.trips', 'built.mobility', 'built.interior', 'built.f2f-use', 'built.sky-room'],
        says: ['density and FSR', 'transit and trips', 'parking and loading', 'community benefits'],
      },
    ],
  },
  {
    id: 'engineer', name: 'Engineer or consultant', who: 'Structural, building systems and sustainability specialists',
    says: [
      "I'm a structural engineer",
      "I'm a sustainability consultant working on energy and carbon",
      'I work on elevators and vertical transportation',
      "I'm a building code and life safety consultant",
      'mechanical engineer checking the energy targets',
      'wind engineer',
      'I size concrete cores, columns and outriggers for tall buildings',
      'I calculate loads and design the structure',
      'I model how much energy a building uses',
      'I design the mechanical and electrical systems',
      'I check fire safety, exits and sprinklers',
    ],
    presets: [
      {
        id: 'engineer.structure', type: 'engineer', name: 'Structure and wind',
        goal: 'Slenderness and the wind procedure, the lateral system and seismic category, pedestrian wind, the core and life safety.',
        project: 'vtc', step: 'plates',
        nodes: ['built.structure', 'built.wind-procedure', 'built.wind-study', 'built.wind-screen', 'built.core-lifts', 'built.life-safety'],
        says: ['structural system and seismic', 'wind tunnel and slenderness', 'lateral system'],
      },
      {
        id: 'engineer.vertical', type: 'engineer', name: 'Lifts, egress and life safety',
        goal: 'Lift groups and sky lobbies, stair widths and exits, the high-building code checklist.',
        project: 'vtc', step: 'plates',
        nodes: ['built.core-lifts', 'built.egress', 'built.life-safety', 'built.sky-room', 'built.interior'],
        says: ['elevators and lift groups', 'egress and stairs', 'fire and life safety code'],
      },
      {
        id: 'engineer.sustainability', type: 'engineer', name: 'Energy, carbon and daylight',
        goal: 'Energy and emissions against the targets, embodied carbon, glazing, daylight and nature.',
        project: 'city', step: 'plates',
        nodes: ['built.energy-carbon', 'built.facade', 'built.daylight-depth', 'built.city-in-nature', 'built.solar-access', 'built.life-safety'],
        says: ['energy and carbon targets', 'embodied carbon', 'sustainability and green building', 'daylight and glazing'],
      },
    ],
  },
]

// Sinnie, 13 Nov ("replace in presets"): the Sun & Wind Studio tools take the place of the checks they overlap in every
// preset; the old checks stay in the library. City in Nature stays (it is more than rain: canopy, birds, the ledger).
export const SW_REPLACES: Record<string, string[]> = {
  'built.sun': ['built.sw-shadow', 'built.sw-sun-faces'],
  'built.solar-access': ['built.sw-shadow'],
  'built.wind-screen': ['built.sw-wind-comfort'],
  'built.wind-study': ['built.sw-wind-height'],
  'built.energy-carbon': ['built.sw-energy', 'built.sw-pv'],
  'built.daylight-depth': ['built.sw-daylight'],
}
// …and every merged tool's part by its lead (data/registry.ts MERGES).
for (const t of USER_TYPES) for (const p of t.presets) p.nodes = canonicalNodes(p.nodes.flatMap((n) => SW_REPLACES[n] ?? [n]))

export const userType = (id: UserTypeId) => USER_TYPES.find((t) => t.id === id)!
/** "a passionate designer", "an engineer or consultant", "a planner or City reviewer": the name inside a sentence. */
export const aType = (id: UserTypeId) => { const n = userType(id).name; const low = n.charAt(0).toLowerCase() + n.slice(1); return `${/^[aeiou]/i.test(n) ? 'an' : 'a'} ${low}` }
export const typeInSentence = (id: UserTypeId) => { const n = userType(id).name; return n.charAt(0).toLowerCase() + n.slice(1) }
export const presetById = (id: string): Preset | undefined => USER_TYPES.flatMap((t) => t.presets).find((p) => p.id === id)

// ---------- what this visitor chose (this browser only) ----------

const KEY = 'ts.userType'
interface Chosen { type: UserTypeId | null; preset: string | null }
const read = (): Chosen => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Chosen | null
    if (v && USER_TYPES.some((t) => t.id === v.type)) return { type: v.type, preset: v.preset && presetById(v.preset) ? v.preset : null }
  } catch { /* nothing kept */ }
  return { type: null, preset: null }
}
export const useUserType = create<Chosen>(() => read())
export function rememberUserType(type: UserTypeId | null, preset: string | null = null) {
  useUserType.setState({ type, preset })
  try { localStorage.setItem(KEY, JSON.stringify({ type, preset })) } catch { /* this visit only */ }
}
