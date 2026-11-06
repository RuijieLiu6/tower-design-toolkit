// Who is designing (Phase 1 #9; research/workflows/WORKFLOW_STUDY.md §7–8, approved by Ruijie 4 Nov 2026). A role is a
// starting preset: which project opens, which checks start on (in the study's tool order, mapped onto the built
// nodes) and which role-only tools show (Brief & plan for VTC students). It never hides a tool or blocks a check: the
// user can switch anything on or off afterwards, or change role from the top bar. The choice is kept in this browser.
import { create } from 'zustand'
import { useStore } from '../store'

export type Role = 'student' | 'practitioner' | 'explore'

export interface RolePreset {
  id: Role
  label: string
  short: string
  blurb: string
  project: 'vtc' | 'city' | null
  /** Checks switched on, in the order of the study's preset (§7). */
  nodes: string[]
  /** Tools from the study that are not built yet: listed as coming, never faked. */
  coming: string[]
}

export const ROLE_PRESETS: Record<Role, RolePreset> = {
  student: {
    id: 'student', label: 'Student · Vancouver Tall Challenge', short: 'VTC student',
    blurb: 'The competition site and brief: the deliverables, the 40% human-scale criterion and the boards first (study §7.1).',
    project: 'vtc',
    nodes: [
      'built.vtc-rules', 'built.fsr', // brief & plan, site
      'built.pr-streetwall', 'built.pr-frontage', 'built.pr-ground', // ground & public realm, moved forward (40%)
      'built.economics', 'built.sky-room', // program & value
      'built.viewcones', 'built.sun', 'built.wind-screen', 'built.wind-study', // views, sun, shadow, wind
      'built.core-lifts', 'built.egress', 'built.structure', 'built.wind-procedure', // core, floors, structure
      'built.facade', 'built.energy-carbon', 'built.city-in-nature', // facade, energy, nature
      'built.culture-claims', 'built.provenance', // culture & engagement guardrails
    ],
    coming: ['Research & precedents', 'Concept & narrative'],
  },
  practitioner: {
    id: 'practitioner', label: 'Practitioner · Vancouver high-rise', short: 'Practitioner',
    blurb: 'Real Vancouver: site and policy, view cones and heights early, then the pro forma and the permit-stage checks (study §7.2).',
    project: 'city',
    nodes: [
      'built.heights', 'built.viewcones', 'built.relax-aviation', 'built.vista', // site, policy, views & skyline
      'built.economics', 'built.fsr', // program & value
      'built.solar-access', 'built.sun', 'built.wind-screen', 'built.wind-study', // sun, shadow, wind
      'built.pr-streetwall', 'built.pr-frontage', 'built.pr-ground', // ground & public realm
      'built.core-lifts', 'built.egress', 'built.life-safety', 'built.structure', 'built.wind-procedure', // core, floors, structure, code
      'built.energy-carbon', 'built.city-in-nature', 'built.facade', 'built.mobility', // energy, nature, facade, servicing
      'built.culture-claims', // culture & engagement
    ],
    coming: ['Policy & zoning pathway', 'Rezoning package', 'Design review prep', 'Consultant hand-off', 'Permit readiness'],
  },
  explore: {
    id: 'explore', label: 'Just exploring', short: 'Exploring',
    blurb: 'Keeps the current library and checks as they are.',
    project: null, nodes: [], coming: [],
  },
}

const KEY = 'ts.role'
const read = (): Role | null => {
  try { const v = localStorage.getItem(KEY); return v === 'student' || v === 'practitioner' || v === 'explore' ? v : null } catch { return null }
}

export const useRole = create<{ role: Role | null }>(() => ({ role: read() }))

/**
 * Choose a role: remembered, and its preset applied once (project, checks on). The design itself is not touched;
 * "Just exploring" changes nothing. Returns what changed, in words, for the announcement.
 */
export function chooseRole(role: Role): string {
  useRole.setState({ role })
  try { localStorage.setItem(KEY, role) } catch { /* this session only */ }
  const p = ROLE_PRESETS[role]
  if (role === 'explore') return 'Role: just exploring. Nothing was changed.'
  const s = useStore.getState()
  if (p.project && s.project !== p.project) s.setProject(p.project)
  s.setEnabled(p.nodes)
  s.selectNode(p.nodes[0])
  return `Role: ${p.label}. ${p.nodes.length} checks switched on; your design is unchanged.`
}
