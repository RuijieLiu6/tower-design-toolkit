// The two modes of the guided app (Ruijie, 17 Nov: "At the very top of the page there is a Model / Presentation
// switch; one click takes you from design to layout … the whole model is one thing"). Model is the design: Site, Form,
// Program and Schematic as one continuous run of phases. Presentation is the Present stage: the model locked, the A2
// board frame, boards, drawings, AI render and the shot strip. The switch changes the view, never the design (nothing
// to undo). The present phase stays in every workflow and project file; it is simply the one phase of Presentation.
import type { PhaseId } from './phases'
import { goToStep, useStep } from './step'
import type { Phase } from '../store'

export type Mode = 'model' | 'presentation'
export const MODE_NAME: Record<Mode, string> = { model: 'Model', presentation: 'Presentation' }
export const MODEL_PHASES: PhaseId[] = ['site', 'form', 'program', 'schematic']
export const PRESENTATION_PHASES: PhaseId[] = ['present']

export const modeOfPhase = (p: PhaseId): Mode => (p === 'present' ? 'presentation' : 'model')
export const modeOfStage = (s: Phase): Mode => (s === 'present' ? 'presentation' : 'model')
/** The phases a mode runs through, in order. */
export const phasesOf = (m: Mode): PhaseId[] => (m === 'model' ? MODEL_PHASES : PRESENTATION_PHASES)

/** Go to a mode: Presentation is its one step; Model returns to the design step last used. */
export function setMode(m: Mode) {
  const s = useStep.getState()
  if (m === 'presentation') { if (s.step !== 'frame') goToStep('frame') } else if (s.step === 'frame') goToStep(s.lastModel)
}
export const currentMode = (): Mode => (useStep.getState().step === 'frame' ? 'presentation' : 'model')
export const toggleMode = () => setMode(currentMode() === 'model' ? 'presentation' : 'model')
