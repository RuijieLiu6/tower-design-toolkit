import { describe, expect, it } from 'vitest'
import { closeMask, outlineAlpha, tint } from './presentRender'

const grid = (rows: string[]) => ({ w: rows[0].length, h: rows.length, m: Uint8Array.from(rows.join('').split('').map(Number)) })

describe('presentation render post-process', () => {
  it('outlines a tower label along its edge against empty pixels only', () => {
    const { w, h, m } = grid(['00000', '01110', '01110', '01110', '00000'])
    const a = outlineAlpha(m, w, h, { 1: 0.5 })
    expect(a[1 * w + 1]).toBe(255)
    expect(a[2 * w + 2]).toBe(0) // the inside stays clear
    expect(a[0]).toBe(0)
  })
  it('a figure in front of a tower is outlined; the tower is not outlined along the figure', () => {
    const { w, h, m } = grid(['111111', '111111', '112211', '112211', '111111', '111111'])
    const a = outlineAlpha(m, w, h, { 1: 0.5, 2: 0.5 })
    expect(a[2 * w + 2]).toBe(255) // the figure's edge
    expect(a[2 * w + 1]).toBe(0) // the tower beside the figure
  })
  it('closes one-pixel gaps between storeys before outlining', () => {
    const { w, h, m } = grid(['00000', '01110', '00000', '01110', '00000'])
    const c = closeMask(m, w, h, 1, 1)
    expect(c[2 * w + 2]).toBe(1)
    expect(c[0]).toBe(0)
  })
  it('tints toward white', () => {
    expect(tint('#e145c2', 0)).toBe('#e145c2')
    expect(tint('#e145c2', 1)).toBe('#ffffff')
  })
})
