import { describe, expect, it } from 'vitest'
import { keyIsElsewhere } from './keys'

// A drawing tool's keys used to be taken app-wide: Enter on a dialog's button did nothing, Esc could not close the
// drawer, and 1 / 2 / 3 were dead. They count on the canvas, the body and the rail's tiles only. The elements here
// are stand-ins (the tests run without a DOM): `closest` answers for the ancestors the element has.
const el = (ancestors: string[]) => ({ closest: (selector: string) => (selector.split(',').some((s) => ancestors.includes(s.trim())) ? {} : null) })
const canvas = el([])

describe('where a drawing key counts', () => {
  it('on the body and the canvas', () => {
    expect(keyIsElsewhere(canvas, '3', canvas)).toBe(false)
    expect(keyIsElsewhere(canvas, 'Enter', canvas)).toBe(false)
    expect(keyIsElsewhere(null, 'Enter', canvas)).toBe(false)
    expect(keyIsElsewhere({} as EventTarget, 'Enter', canvas)).toBe(false)
  })
  it('not inside a dialog, a menu or a text field, whatever the key', () => {
    expect(keyIsElsewhere(el(['button', '[role="dialog"]']), 'Enter')).toBe(true)
    expect(keyIsElsewhere(el(['button', '[role="dialog"]']), 'Escape')).toBe(true)
    expect(keyIsElsewhere(el(['[role="menuitem"]', '[role="menu"]']), '3')).toBe(true)
    expect(keyIsElsewhere(el(['input']), 'Backspace')).toBe(true)
  })
  it('on a plain button or link Enter and digits are the button\'s; Esc still ends the tool', () => {
    expect(keyIsElsewhere(el(['button']), 'Enter')).toBe(true)
    expect(keyIsElsewhere(el(['button']), '1')).toBe(true)
    expect(keyIsElsewhere(el(['a']), 'Enter')).toBe(true)
    expect(keyIsElsewhere(el(['button', '[role="tab"]']), 'Enter')).toBe(true)
    expect(keyIsElsewhere(el(['button']), 'Escape')).toBe(false)
  })
  it('on the tool rail\'s tiles: a value typed right after the tile was clicked', () => {
    expect(keyIsElsewhere(el(['button', '[data-testid="tool-rail"]']), '3')).toBe(false)
    expect(keyIsElsewhere(el(['button', '[data-testid="tool-rail"]']), 'Enter')).toBe(false)
  })
})
