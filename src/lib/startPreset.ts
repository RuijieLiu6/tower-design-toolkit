// Starting a preset workflow from the landing page (lib/userTypes.ts): in the guided app (its project, the step it
// opens on, its checks switched on) or as a node graph in Customize. The design itself is never changed; in Real
// Vancouver a study site is set when there is none yet (the default site, lib/defaultSite.ts), so the checks have one.
// Heavier modules load on demand, so the landing page stays light.
import { navigate } from './route'
import { goToStep } from './step'
import { rememberUserType, type Preset } from './userTypes'
import { useRole } from './role'
import { useStore } from '../store'

/** Remembers the user type and preset, and keeps the top bar's role in step. */
function remember(p: Preset) {
  rememberUserType(p.type, p.id)
  useRole.setState({ role: p.type })
  try { localStorage.setItem('ts.role', p.type) } catch { /* this visit only */ }
}

export async function startPreset(p: Preset): Promise<void> {
  // After the saved project is restored, or the restore would switch the preset's checks straight back.
  const { whenRestored } = await import('./project/session')
  await whenRestored()
  if (p.project === 'city' && !useStore.getState().citySite) {
    const { DEFAULT_CITY_SITE } = await import('./defaultSite')
    useStore.setState({ citySite: DEFAULT_CITY_SITE })
  }
  const s = useStore.getState()
  if (s.project !== p.project) s.setProject(p.project)
  const st = useStore.getState()
  st.setEnabled(p.nodes)
  st.selectNode(p.nodes[0])
  st.set({ showOnboarding: false })
  remember(p)
  navigate('guided')
  goToStep(p.step)
  useStore.setState({ announce: `${p.name}: ${p.nodes.length} checks switched on${p.project === 'city' ? ' in Real Vancouver' : ' on the competition site'}. Your design is unchanged.` })
}

/** The same preset as a node graph in Customize (its checks wired to the model and to All pass / Weighted score). */
export async function openPresetInCustomize(p: Preset): Promise<void> {
  const [{ templateWorkflow, useEditor }, { browserStorage, DRAFT_KEY, serializeWorkflow }] = await Promise.all([
    import('../components/workflow/editorStore'), import('./workflows'),
  ])
  const wf = { ...templateWorkflow(p.name, p.nodes, { logic: true }), project: p.project, description: p.goal }
  useEditor.getState().load(wf)
  try { browserStorage()?.setItem(DRAFT_KEY, serializeWorkflow(wf)) } catch { /* the editor has it for this visit */ }
  remember(p)
  navigate('customize')
}
