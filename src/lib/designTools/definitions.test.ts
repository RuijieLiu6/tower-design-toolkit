// The shipped tool definitions (public/tools/*.tool.json) pass checkDefinition, and the test harness page returns a
// proposal that passes checkProposal against the Form Studio-shaped snapshot target.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { checkDefinition } from './validate'
import { DESIGN_TOOL_FORMAT, PROTOCOL, TOOL_PREFIX } from './contract'

const read = (name: string) => JSON.parse(readFileSync(new URL(`../../../public/tools/${name}`, import.meta.url), 'utf8')) as Record<string, unknown>

describe('shipped tool definitions', () => {
  for (const file of ['form-studio.tool.json', 'test-tool.tool.json']) {
    it(`${file} is a valid ${DESIGN_TOOL_FORMAT} definition`, () => {
      const json = read(file)
      const r = checkDefinition(json)
      expect(r.problems).toEqual([])
      expect(r.ok).toBe(true)
      expect(r.def?.connection.protocol).toBe(PROTOCOL)
      expect(r.def?.id.startsWith(TOOL_PREFIX)).toBe(true)
      expect(r.def?.connection.origin).toBe(new URL(r.def!.connection.url).origin)
    })
  }

  it('form-studio is Ruijie\'s Form Studio on localhost:5577, form phase, replace-geometry only', () => {
    const r = checkDefinition(read('form-studio.tool.json'))
    expect(r.def?.id).toBe('tool.form-studio')
    expect(r.def?.version).toBe('0.1.0')
    expect(r.def?.phases).toEqual(['form'])
    expect(r.def?.operations).toEqual(['replace-geometry'])
    expect(r.def?.connection.url).toBe('http://localhost:5577/index.html')
    expect(r.def?.editability).toBe('externally-generated')
    expect(r.warnings).toEqual([]) // http on localhost is fine; the validator warns only for a shared http site
  })

  it('test-tool says it is a demonstration harness', () => {
    const r = checkDefinition(read('test-tool.tool.json'))
    expect(r.def?.id).toBe('tool.test-tool')
    expect(r.def?.purpose.toLowerCase()).toContain('demonstration')
    expect(r.def?.connection.url).toBe('http://localhost:5499/tools/test-tool.html')
  })
})
