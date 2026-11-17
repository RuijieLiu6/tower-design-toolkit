import { describe, expect, it } from 'vitest'
import { currentMode, modeOfPhase, phasesOf, setMode, toggleMode } from './mode'
import { goToStep, useStep } from './step'
import { useStore } from '../store'

// Model | Presentation (Ruijie, 17 Nov): Model is Site, Form, Program and Schematic as one run; Presentation is Present.
describe('Model and Presentation', () => {
  it('splits the phases: the four design phases are Model, Present is Presentation', () => {
    expect(phasesOf('model')).toEqual(['site', 'form', 'program', 'schematic'])
    expect(phasesOf('presentation')).toEqual(['present'])
    expect(modeOfPhase('schematic')).toBe('model')
    expect(modeOfPhase('present')).toBe('presentation')
  })
  it('Presentation is the Frame step; Model returns to the design step last used', () => {
    goToStep('plates')
    expect(currentMode()).toBe('model')
    setMode('presentation')
    expect(useStep.getState().step).toBe('frame')
    expect(useStore.getState().phase).toBe('present')
    expect(currentMode()).toBe('presentation')
    setMode('model')
    expect(useStep.getState().step).toBe('plates')
    expect(useStore.getState().phase).toBe('advanced')
    toggleMode()
    expect(useStep.getState().step).toBe('frame')
    toggleMode()
    expect(useStep.getState().step).toBe('plates')
    goToStep('volume')
    setMode('presentation'); setMode('model')
    expect(useStep.getState().step).toBe('volume')
  })
})
