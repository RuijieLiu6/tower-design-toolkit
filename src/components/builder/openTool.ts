// Open tool, from a workflow card (Result A brief §7): the builder closes keeping its changes, the tool's phase opens in
// the workspace with that tool active (its own settings, the right panel's results for a check), and the shared model,
// project and camera stay as they were (the workspace was mounted under the builder all along). Nothing runs: opening a
// tool only sets what is shown (lib/workflow/toolView.ts is applied by the phase panel when the active tool changes).
import { navigate } from '../../lib/route'
import { goToStep } from '../../lib/step'
import { useStore } from '../../store'
import { designNode } from '../../lib/workflow/designNodes'
import { PHASE_STEP, usePhaseTools } from '../../lib/workflow/phaseTools'
import { closeBuilder } from '../../lib/workflow/projectWorkflow'
import { homeOf } from '../workflow/WorkflowOverview'

export function openToolInWorkspace(id: string) {
  closeBuilder('apply', { keep: true })
  const d = designNode(id)
  const ph = d?.phase ?? homeOf(id)
  goToStep(PHASE_STEP[ph])
  usePhaseTools.getState().setActive(ph, id)
  if (!d) useStore.getState().selectNode(id)
  navigate('guided')
}
