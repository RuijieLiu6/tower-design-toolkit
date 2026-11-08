// "Who are you?" (workflow study §8.1, approved 4 Nov; since 6 Nov the landing page's agent asks it): the compact switch
// in the top bar. Choosing a role applies its preset once (lib/role.ts): the project and the checks that start on. The design
// is never changed, and nothing stops the user switching any check afterwards.
import { Compass, GraduationCap, HardHat, Landmark, Wrench } from './icons'
import { TYPE_ICONS } from '../data/icons'
import type { LucideIcon } from './icons'
import { chooseRole, ROLE_PRESETS, useRole, type Role } from '../lib/role'
import { navigate } from '../lib/route'
import { useStore } from '../store'

export const ROLE_ICON: Record<Role, LucideIcon> = TYPE_ICONS
const ORDER: Role[] = ['designer', 'practitioner', 'planner', 'engineer', 'explore']

/** Apply after the saved project is restored, or the restore would switch the preset's checks straight back. */
function pick(r: Role, go: boolean) {
  // Loaded on demand: the start page stays light (the project module brings the file validator).
  void import('../lib/project/session').then((m) => m.whenRestored()).then(() => {
    const said = chooseRole(r)
    useStore.setState({ announce: said })
    if (go) navigate('guided')
  })
}

/** The compact switch in the top bar. */
export function RoleSelect({ className = '' }: { className?: string }) {
  const role = useRole((s) => s.role)
  return (
    <select aria-label="Role" title="Who is designing: a starting preset for the site and the checks (your design is never changed)" value={role ?? ''}
      onChange={(e) => { if (e.target.value) pick(e.target.value as Role, false) }}
      className={`rounded-md border border-line bg-panel px-1.5 py-1 text-meta ${className}`}>
      {!role && <option value="">Role…</option>}
      {ORDER.map((r) => <option key={r} value={r}>{ROLE_PRESETS[r].short}</option>)}
    </select>
  )
}
