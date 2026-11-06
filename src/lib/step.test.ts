import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '../store'
import { followStage, goToStep, pristineDesign, startOnSite, toolsForStep, startStepFollow, useStep } from './step'

const tools = [{ id: 'towers' }, { id: 'site' }, { id: 'rhino-import' }, { id: 'program' }, { id: 'massing' }, { id: 'extra' }, { id: 'mine', steps: ['program' as const] }]

describe('design steps inside the stages', () => {
  beforeEach(() => {
    useStore.setState(useStore.getInitialState(), true)
    useStep.setState({ step: 'site', lastBasic: 'site', firstOpen: true })
  })
  it('a step lights alone and takes its stage', () => {
    goToStep('program')
    expect(useStep.getState().step).toBe('program')
    expect(useStore.getState().phase).toBe('basic')
    goToStep('plates')
    expect(useStore.getState().phase).toBe('advanced')
    expect(useStep.getState().lastBasic).toBe('program')
  })
  it('a stage chosen elsewhere moves to its step; Massing returns to its last step', () => {
    const stop = startStepFollow()
    goToStep('volume')
    useStore.getState().setPhase('present')
    expect(useStep.getState().step).toBe('frame')
    useStore.getState().setPhase('basic')
    expect(useStep.getState().step).toBe('volume')
    followStage('advanced')
    expect(useStep.getState().step).toBe('plates')
    stop()
  })
  it("each step shows only its own tools; a tool without a step joins Volume, so none is lost", () => {
    expect(toolsForStep(tools, 'site').map((t) => t.id)).toEqual(['site', 'rhino-import'])
    expect(toolsForStep(tools, 'volume').map((t) => t.id)).toEqual(['towers', 'massing', 'extra'])
    expect(toolsForStep(tools, 'program').map((t) => t.id)).toEqual(['program', 'mine'])
    const all = new Set((['site', 'volume', 'program'] as const).flatMap((s) => toolsForStep(tools, s).map((t) => t.id)))
    expect(all.size).toBe(tools.length)
  })
  it('a first open starts on Site in Real Vancouver; a design already opened keeps its project', () => {
    goToStep('program')
    useStep.setState({ firstOpen: true })
    expect(pristineDesign()).toBe(true)
    expect(startOnSite()).toBe('city')
    expect(useStore.getState().project).toBe('city')
    expect(useStep.getState().step).toBe('site')
    expect(startOnSite()).toBe('skipped')

    useStore.setState(useStore.getInitialState(), true)
    useStore.getState().updateTower('t1', { height: 200 })
    useStep.setState({ firstOpen: true })
    expect(startOnSite()).toBe('kept')
    expect(useStore.getState().project).toBe('vtc')
  })
})
