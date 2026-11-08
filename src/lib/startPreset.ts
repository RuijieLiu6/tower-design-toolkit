// Starting a workflow from the landing page: a preset (lib/userTypes.ts) or one designed on the landing page's phase
// board (components/landing/Composer.tsx). In the guided app it opens its project on the first phase with a node, with
// exactly its checks on; or it opens as a node graph in Customize; or it is saved as a workflow file. The design itself
// is never changed; in Real Vancouver a study site is set when there is none yet (the default site), so the checks have
// one. Heavier modules load on demand, so the landing page stays light.
import { navigate } from './route'
import { goToStep, type StepId } from './step'
import { presetById, rememberUserType, type UserTypeId } from './userTypes'
import { useRole } from './role'
import { useStore } from '../store'
import { analysisOnly } from './workflow/designNodes'

export interface Runnable {
  id?: string | null
  type?: UserTypeId | null
  name: string
  goal?: string
  project: 'vtc' | 'city'
  step: StepId
  nodes: string[]
}

/** The workflow running in the guided app (its name and nodes), for the process rail's Next. */
export const WORKFLOW_KEY = 'ts.workflowRun'
export function runningWorkflow(): { name: string; nodes: string[]; id?: string | null; type?: UserTypeId | null; at?: string } | null {
  try { const v = JSON.parse(localStorage.getItem(WORKFLOW_KEY) ?? 'null'); return v && Array.isArray(v.nodes) ? v : null } catch { return null }
}

/** Remembers the user type and preset, keeps the top bar's role in step, and the running workflow. */
function remember(p: Runnable) {
  if (p.type) {
    rememberUserType(p.type, p.id && presetById(p.id) ? p.id : null)
    useRole.setState({ role: p.type })
    try { localStorage.setItem('ts.role', p.type) } catch { /* this visit only */ }
  }
  // With its preset, role and time, so the cover can tell whether it is newer than its own saved board (lib/coverWorkflow.ts).
  try { localStorage.setItem(WORKFLOW_KEY, JSON.stringify({ name: p.name, nodes: p.nodes, id: p.id ?? null, type: p.type ?? null, at: new Date().toISOString() })) } catch { /* this visit only */ }
}

export async function startPreset(p: Runnable): Promise<void> {
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
  // Design nodes (lib/workflow/designNodes.ts) are steps, not checks: only the checks are switched on.
  const checks = analysisOnly(p.nodes)
  st.setEnabled(checks)
  if (checks[0]) st.selectNode(checks[0])
  st.set({ showOnboarding: false })
  remember(p)
  navigate('guided')
  goToStep(p.step)
  useStore.setState({ announce: `${p.name}: ${p.nodes.length} checks switched on${p.project === 'city' ? ' in Real Vancouver' : ' on the competition site'}. Your design is unchanged.` })
}

async function asWorkflow(p: Runnable) {
  const [{ templateWorkflow }, wfs] = await Promise.all([import('../components/workflow/editorStore'), import('./workflows')])
  return { wf: { ...templateWorkflow(p.name, p.nodes, { logic: true }), project: p.project, ...(p.goal ? { description: p.goal } : {}) }, wfs }
}

/** The same workflow as a node graph in Customize (its checks wired to the model and to All pass / Weighted score). */
export async function openPresetInCustomize(p: Runnable): Promise<void> {
  const [{ wf, wfs }, { useEditor }] = await Promise.all([asWorkflow(p), import('../components/workflow/editorStore')])
  useEditor.getState().load(wf)
  try { wfs.browserStorage()?.setItem(wfs.DRAFT_KEY, wfs.serializeWorkflow(wf)) } catch { /* the editor has it for this visit */ }
  remember(p)
  navigate('customize')
}

/** Saves it as a tower-studio-workflow@1 file, which Customize opens (Import) and anyone can share. */
export async function saveWorkflowFile(p: Runnable): Promise<void> {
  const { wf, wfs } = await asWorkflow(p)
  const blob = new Blob([wfs.serializeWorkflow(wf)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${p.name.replace(/[^\w-]+/g, '-').replace(/-+/g, '-').toLowerCase() || 'workflow'}.workflow.json`
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}
