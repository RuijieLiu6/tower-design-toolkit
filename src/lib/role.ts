// Who is designing (Phase 1 #9; research/workflows/WORKFLOW_STUDY.md §7–8, approved by Ruijie 4 Nov 2026). A role is a
// starting preset: which project opens, which checks start on (in the study's tool order, mapped onto the built
// nodes) and which role-only tools show (Brief & plan for VTC students). It never hides a tool or blocks a check: the
// user can switch anything on or off afterwards, or change role from the top bar. The choice is kept in this browser.
import { create } from 'zustand'
import { useStore } from '../store'
import { userType, type UserTypeId } from './userTypes'

// Since 6 Nov the roles are the landing page's user types (lib/userTypes.ts); a role's preset is that type's first
// starting workflow. The old "student" role reads as the passionate designer.
export type Role = UserTypeId | 'explore'

export interface RolePreset {
  id: Role
  label: string
  short: string
  blurb: string
  project: 'vtc' | 'city' | null
  /** Checks switched on: the type's first starting workflow. */
  nodes: string[]
  /** Tools from the study that are not built yet: listed as coming, never faked. */
  coming: string[]
}

const fromType = (id: UserTypeId, coming: string[] = []): RolePreset => {
  const t = userType(id), p = t.presets[0]
  return { id, label: t.name, short: t.name.replace(/ (architect|or City reviewer|or consultant)$/, ''), blurb: t.who, project: p.project, nodes: p.nodes, coming }
}

export const ROLE_PRESETS: Record<Role, RolePreset> = {
  designer: fromType('designer', ['Research & precedents', 'Concept & narrative']),
  practitioner: fromType('practitioner', ['Rezoning package', 'Design review prep', 'Consultant hand-off']),
  planner: fromType('planner'),
  engineer: fromType('engineer'),
  explore: {
    id: 'explore', label: 'Just exploring', short: 'Exploring',
    blurb: 'Keeps the current library and checks as they are.',
    project: null, nodes: [], coming: [],
  },
}

const KEY = 'ts.role'
const ROLES: Role[] = ['designer', 'practitioner', 'planner', 'engineer', 'explore']
const read = (): Role | null => {
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'student') return 'designer'
    return ROLES.includes(v as Role) ? (v as Role) : null
  } catch { return null }
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
