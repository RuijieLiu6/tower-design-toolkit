import { describe, expect, it } from 'vitest'
import { EXPORTS, forProject, IMPORTS } from './capabilities'

describe('transfer capabilities', () => {
  it('names a route for every purpose, and disables what has no writer or the other project', () => {
    for (const c of [...Object.values(IMPORTS), ...Object.values(EXPORTS)]) { expect(c.via.length).toBeGreaterThan(10); expect(c.title).toMatch(/\S/) }
    expect(forProject(EXPORTS, 'vtc').find((c) => c.key === 'tool')?.enabled).toBe(false)
    expect(forProject(IMPORTS, 'vtc').find((c) => c.key === 'site')?.enabled).toBe(false)
    expect(forProject(IMPORTS, 'city').find((c) => c.key === 'site')?.enabled).toBe(true)
    expect(forProject(IMPORTS, 'city').every((c) => c.key === 'site' || c.enabled)).toBe(true)
  })
})
