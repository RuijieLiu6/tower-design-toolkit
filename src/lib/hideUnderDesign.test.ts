// The "hide existing buildings under the design" switch: on by default, the person's choice remembered, blocked
// storage never breaks it.
import { describe, expect, it } from 'vitest'
import { HIDE_UNDER_DESIGN_DEFAULT, HIDE_UNDER_DESIGN_KEY, readHideUnderDesign, useHideUnderDesign, writeHideUnderDesign } from './hideUnderDesign'

const memory = () => {
  const m = new Map<string, string>()
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v) }, m }
}
const blocked = { getItem: () => { throw new Error('SecurityError') }, setItem: () => { throw new Error('SecurityError') } }

describe('hide existing buildings under the design: default and memory', () => {
  it('is on by default, so a new browser never shows an existing building through the proposal', () => {
    expect(HIDE_UNDER_DESIGN_DEFAULT).toBe(true)
    expect(readHideUnderDesign(memory())).toBe(true)
    expect(readHideUnderDesign(null)).toBe(true)
    // The store starts from the same rule (no localStorage in the test runner).
    expect(useHideUnderDesign.getInitialState().on).toBe(true)
  })

  it('remembers "show the existing buildings again" and turning it back on', () => {
    const s = memory()
    writeHideUnderDesign(false, s)
    expect(s.m.get(HIDE_UNDER_DESIGN_KEY)).toBe('0')
    expect(readHideUnderDesign(s)).toBe(false)
    writeHideUnderDesign(true, s)
    expect(readHideUnderDesign(s)).toBe(true)
  })

  it('falls back to the default on blocked storage or a stray value, and never throws', () => {
    expect(readHideUnderDesign(blocked)).toBe(true)
    expect(() => writeHideUnderDesign(false, blocked)).not.toThrow()
    const s = memory(); s.m.set(HIDE_UNDER_DESIGN_KEY, 'yes')
    expect(readHideUnderDesign(s)).toBe(true)
  })
})
