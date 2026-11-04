import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '../store'
import { followStage, goToStep, pristineDesign, splitForStep, startOnSite, startStepFollow, useStep } from './step'

const tools = [{ id: 'towers' }, { id: 'site' }, { id: 'program' }, { id: 'massing' }, { id: 'extra' }, { id: 'mine', steps: ['program' as const] }]

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
  it("the step's tools lead; the rest stay under More tools, none hidden", () => {
    const site = splitForStep(tools, 'site')
    expect(site.main.map((t) => t.id)).toEqual(['site'])
    expect(site.more.map((t) => t.id)).toEqual(['towers', 'program', 'massing', 'extra', 'mine'])
    const program = splitForStep(tools, 'program')
    expect(program.main.map((t) => t.id)).toEqual(['program', 'mine'])
    expect(program.main.length + program.more.length).toBe(tools.length)
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
