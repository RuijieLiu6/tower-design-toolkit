import { Box } from 'lucide-react'
import { describe, expect, it, vi } from 'vitest'
import { collectTools, DESIGN_TOOLS, toolsFor, type DesignTool } from './registry'

const Body = () => null
const tool = (id: string, extra: Partial<DesignTool> = {}): DesignTool => ({ id, label: id, icon: Box, stages: ['basic'], order: 10, component: Body, ...extra })

describe('design tool registry', () => {
  it('collects single tools and arrays, and skips duplicates and incomplete entries', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const tools = collectTools({
      '/src/a.tool.tsx': { default: tool('a') },
      '/src/b.tool.tsx': { default: [tool('b'), tool('c')] },
      '/src/c.tool.tsx': { default: tool('a') },
      '/src/d.tool.tsx': { default: { id: 'broken' } as DesignTool },
    })
    expect(tools.map((t) => t.id)).toEqual(['a', 'b', 'c'])
    expect(warn).toHaveBeenCalledTimes(2)
    warn.mockRestore()
  })

  it('filters by stage and condition and sorts by the per-stage order', () => {
    const tools = [
      tool('late', { order: 50, stages: ['basic', 'advanced'] }),
      tool('both', { order: { basic: 20, advanced: 5 }, stages: ['basic', 'advanced'] }),
      tool('first', { order: 10 }),
      tool('vtc-only', { order: 30, when: (s) => s.project === 'vtc' }),
    ]
    expect(toolsFor(tools, 'basic').map((t) => t.id)).toEqual(['first', 'both', 'vtc-only', 'late'])
    expect(toolsFor(tools, 'advanced').map((t) => t.id)).toEqual(['both', 'late'])
    expect(toolsFor(tools, 'basic', { project: 'city' } as never).map((t) => t.id)).toEqual(['first', 'both', 'late'])
  })

  it('finds the built-in tools through the *.tool.tsx glob, each id once', () => {
    const ids = DESIGN_TOOLS.map((t) => t.id)
    expect(ids).toEqual(expect.arrayContaining(['towers', 'massing', 'program', 'ground', 'sun', 'core', 'anatomy']))
    expect(new Set(ids).size).toBe(ids.length)
    const schematic = toolsFor(DESIGN_TOOLS, 'advanced').map((t) => t.id)
    expect(schematic.indexOf('core')).toBeLessThan(schematic.indexOf('towers'))
  })
})
