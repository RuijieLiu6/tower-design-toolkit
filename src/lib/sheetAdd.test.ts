import { describe, expect, it } from 'vitest'
import { addToSheet, placeText } from './sheetAdd'
import { useBoardStore } from './boardStore'

describe('Add to sheet', () => {
  it('keeps the drawing in the library and places nothing on the sheets', () => {
    const before = JSON.stringify(useBoardStore.getState().boards)
    const p = addToSheet({ dataUrl: 'data:image/png;base64,AAAA', w: 10, h: 10 }, 'Shadow range')
    expect(p.board).toBe(-1)
    expect(placeText(p)).toBe('In the library')
    expect(JSON.stringify(useBoardStore.getState().boards)).toBe(before)
    expect(Object.values(useBoardStore.getState().images).some((i) => i.label === 'Shadow range')).toBe(true)
  })
})
