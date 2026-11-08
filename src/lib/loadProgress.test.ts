// The map's loading bar counts real bytes where the manifest gives the size, and each other load as one step.
import { describe, expect, it } from 'vitest'
import { progressOf, type LoadJob } from './loadProgress'

const job = (p: Partial<LoadJob>): LoadJob => ({ label: 'x', loaded: 0, total: 0, done: false, failed: false, ...p })

describe('map loading progress', () => {
  it('is the share of bytes in, over every sized file of the batch', () => {
    const p = progressOf([job({ label: 'Terrain', total: 1000, loaded: 1000, done: true }), job({ label: 'Buildings', total: 3000, loaded: 1500 })])
    expect(p.share).toBeCloseTo(2500 / 4000)
    expect(p.label).toBe('Buildings')
    expect(p.done).toBe(false)
  })
  it('counts a load without a size (a texture) as one average step, and never goes past 100%', () => {
    const p = progressOf([job({ total: 1000, loaded: 1400, done: true }), job({ label: 'Textures', done: false })])
    expect(p.share).toBeCloseTo(0.5)
    expect(progressOf([job({ total: 10, loaded: 10, done: true }), job({ done: true })])).toMatchObject({ share: 1, done: true })
  })
  it('is complete when nothing is loading', () => {
    expect(progressOf([])).toEqual({ share: 1, label: null, done: true })
  })
})
