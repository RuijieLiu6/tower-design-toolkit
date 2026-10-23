import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { BUILT_NODES } from '../data/registry'
import { demoDesign } from './demo'
import { exportProject, readProject, toDesign } from './project/projectFile'

const file = new URL('../../public/demo/demo-project.json', import.meta.url)
const UPDATE = !!(globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.UPDATE_DEMO

describe('demo project', () => {
  const text = exportProject(demoDesign())

  it('is a valid project file that opens back to the same design', () => {
    const r = readProject(text)
    expect(r.problems).toEqual([])
    expect(r.ok).toBe(true)
    const d = toDesign(r.file!)
    expect(d.towers.vtc.map((t) => t.name)).toEqual(['Tower 1 · mixed use', 'Tower 2 · residential'])
    expect(d.towers.vtc[0].skyRoom).not.toBeNull()
    expect(d.towers.vtc.every((t) => t.height >= 244 && t.height <= 305)).toBe(true)
    expect(BUILT_NODES.every((n) => d.enabled[n.id])).toBe(true)
  })

  it('ships as public/demo/demo-project.json, which still opens as the schema grows (UPDATE_DEMO=1 regenerates it)', () => {
    if (UPDATE || !existsSync(file)) {
      mkdirSync(new URL('../../public/demo/', import.meta.url), { recursive: true })
      writeFileSync(file, text)
    }
    // Not byte-equal on purpose: a new design field elsewhere must not break this test; the saved file must open.
    const r = readProject(readFileSync(file, 'utf8'))
    expect(r.problems).toEqual([])
    const d = toDesign(r.file!)
    expect(d.towers.vtc.map((t) => t.name)).toEqual(['Tower 1 · mixed use', 'Tower 2 · residential'])
    expect(d.towers.vtc[0].skyRoom).not.toBeNull()
  })
})
