// "Who are you?" (workflow study §8.1, approved 4 Nov): the role cards on the start page and the compact switch in the
// top bar. Choosing a role applies its preset once (lib/role.ts): the project and the checks that start on. The design
// is never changed, and nothing stops the user switching any check afterwards.
import { Compass, GraduationCap, HardHat } from './icons'
import { chooseRole, ROLE_PRESETS, useRole, type Role } from '../lib/role'
import { navigate } from '../lib/route'
import { useStore } from '../store'

const ICON: Record<Role, typeof Compass> = { student: GraduationCap, practitioner: HardHat, explore: Compass }
const ORDER: Role[] = ['student', 'practitioner', 'explore']

/** Apply after the saved project is restored, or the restore would switch the preset's checks straight back. */
function pick(r: Role, go: boolean) {
  // Loaded on demand: the start page stays light (the project module brings the file validator).
  void import('../lib/project/session').then((m) => m.whenRestored()).then(() => {
    const said = chooseRole(r)
    useStore.setState({ announce: said })
    if (go) navigate('guided')
  })
}

/** The three role cards on the start page; a choice opens the guided process with the role's preset. */
export function RoleCards() {
  const role = useRole((s) => s.role)
  return (
    <section aria-labelledby="role-title" className="mt-6">
      <h2 id="role-title" className="text-sm font-semibold">Who is designing?</h2>
      <p className="mt-0.5 text-[12px] text-muted">A starting preset: which site opens and which checks start on. You can switch any check, or change role from the top bar, at any time.</p>
      <div role="radiogroup" aria-label="Role" className="mt-2 grid gap-2 md:grid-cols-3">
        {ORDER.map((r) => {
          const p = ROLE_PRESETS[r], Icon = ICON[r], on = role === r
          return (
            <button key={r} role="radio" aria-checked={on} onClick={() => pick(r, true)}
              className={`flex items-start gap-2.5 rounded-lg border p-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-accent ${on ? 'border-accent bg-accent/[0.06]' : 'border-line bg-panel hover:border-accent'}`}>
              <Icon size={18} className="mt-0.5 shrink-0 text-accent" aria-hidden />
              <span className="min-w-0">
                <span className="block text-[13px] font-semibold">{p.label}</span>
                <span className="mt-0.5 block text-[12px] leading-snug text-muted">{p.blurb}</span>
                {p.nodes.length > 0 && <span className="mt-1 block text-[11px] text-muted">{p.nodes.length} checks on{p.coming.length ? ` · coming: ${p.coming.join(', ')}` : ''}</span>}
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}

/** The compact switch in the top bar. */
export function RoleSelect({ className = '' }: { className?: string }) {
  const role = useRole((s) => s.role)
  return (
    <select aria-label="Role" title="Who is designing: a starting preset for the site and the checks (your design is never changed)" value={role ?? ''}
      onChange={(e) => { if (e.target.value) pick(e.target.value as Role, false) }}
      className={`rounded-md border border-line bg-panel px-1.5 py-1 text-[11px] ${className}`}>
      {!role && <option value="">Role…</option>}
      {ORDER.map((r) => <option key={r} value={r}>{ROLE_PRESETS[r].short}</option>)}
    </select>
  )
}
