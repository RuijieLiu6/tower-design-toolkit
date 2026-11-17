import { beforeEach, describe, expect, it } from 'vitest'
import { DRAW_KEY, setDrawTool, useDraw } from './drawStore'
import { goToStep, useStep } from '../step'
import { useStore } from '../../store'

// A drawing tool belongs to the Form step in Model: leaving the step or the stage ends it (it used to stay on, with
// its pointer handlers, on Program and in Presentation).
describe('a drawing tool and the step', () => {
  beforeEach(() => { useStore.setState({ phase: 'basic' }); useStep.setState({ step: 'volume' }); setDrawTool(null) })

  it('ends when the step changes', () => {
    setDrawTool('rect')
    expect(useDraw.getState().tool).toBe('rect')
    goToStep('program')
    expect(useDraw.getState().tool).toBeNull()
  })
  it('ends when the stage changes', () => {
    setDrawTool('pull')
    useStore.setState({ phase: 'present' })
    expect(useDraw.getState().tool).toBeNull()
  })
  it('has one key per tool, none on the Toolkit\'s own keys', () => {
    for (const k of ['v', 'l', 'o', 'f', 'h', 'p', '1', '2', '3']) expect(DRAW_KEY[k]).toBeUndefined()
    expect(DRAW_KEY.b).toBe('rect')
    expect(DRAW_KEY.m).toBe('move')
  })
})
