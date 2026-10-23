import { describe, expect, it } from 'vitest'
import { BUILT_NODES } from '../data/registry'
import { egressCheck } from '../engine/egress'
import { liftCheck, withAutoCore } from '../engine/lifts'
import { skyRoomCheck } from '../engine/skyRoom'
import type { Tower } from '../engine/types'
import { fsrSummary, vtcRules } from '../engine/vtcRules'
import { builtOutput, type Results } from './workflowLive'

const tower = (id: string, height: number): Tower => withAutoCore({
  id, name: `Tower ${id}`, x: 0, y: 0, rotation: 0, width: 46, depth: 46, height, f2f: 4.2, podiumHeight: 18, podiumWidth: 100, podiumDepth: 64,
  podiumUse: 'retail', bands: [{ use: 'office', share: 0.7 }, { use: 'residential', share: 0.3 }], coreShare: 0.25, plantEvery: 0, coreAuto: true, skyLobbies: [],
})

/** The same computation as hooks/useResults, without React. */
function results(towers: Tower[], project: 'vtc' | 'city'): Results {
  const lifts = towers.map((t) => ({ tower: t, ...liftCheck(t) }))
  const egress = towers.map((t) => ({ tower: t, ...egressCheck(t) }))
  return {
    fsr: fsrSummary(towers), rules: project === 'vtc' ? vtcRules(towers, { fsrTier: 2, transitLink: false }) : [], cones: [],
    lifts, egress, skyRooms: towers.map((t, i) => ({ tower: t, ...skyRoomCheck(t, lifts[i], egress[i]) })),
  } as Results
}
const def = (id: string) => BUILT_NODES.find((n) => n.id === id)!

describe('live results on the canvas', () => {
  const towers = [tower('a', 285), tower('b', 200)]
  const r = results(towers, 'vtc')

  it('passes the engine rule lines through unchanged, with their flags and sources', () => {
    const out = builtOutput(def('built.vtc-rules'), r, 'vtc')!
    expect(out.items).toHaveLength(r.rules.length)
    expect(out.items.map((i) => [i.state, i.flag, i.source?.label])).toEqual(r.rules.map((x) => [x.state, x.flag, x.source.label]))
    // Tower b is under 244 m: its height line fails and is tagged with its tower, so Compare can split options.
    const hb = out.items.find((i) => i.id === 'height-b')!
    expect(hb.state).toBe('fail')
    expect(hb.towerId).toBe('b')
    expect(out.state).toBe('fail')
  })

  it('tags per-tower checks with their tower', () => {
    const out = builtOutput(def('built.core-lifts'), r, 'vtc')!
    expect(out.items.length).toBe(r.lifts[0].rules.length + r.lifts[1].rules.length)
    expect(new Set(out.items.map((i) => i.towerId))).toEqual(new Set(['a', 'b']))
  })

  it('stays idle in a project the node does not run in', () => {
    expect(builtOutput(def('built.vtc-rules'), results(towers, 'city'), 'city')!.headline).toMatch(/Competition site/)
    expect(builtOutput(def('built.viewcones'), r, 'vtc')!.state).toBe('idle')
  })

  it('does not judge FSR against the VTC 9.0 rule outside the competition site', () => {
    const vtc = builtOutput(def('built.fsr'), r, 'vtc')!
    expect(vtc.items[1].flag).toBe('verified')
    const city = builtOutput(def('built.fsr'), results(towers, 'city'), 'city')!
    expect(city.state).toBe('unknown')
    expect(city.items.every((i) => i.state === 'unknown')).toBe(true)
  })

  it('passes solar-access lines on, keeping unresolved spaces unknown', () => {
    const solar = def('built.solar-access')
    expect(builtOutput(solar, r, 'vtc', null)!.headline).toMatch(/Computing/)
    const lines = [
      { id: 'solar-frame', label: 'Self-test', value: 'ok', threshold: '', state: 'pass' as const, flag: 'verified' as const, source: { label: 'NOAA' } },
      { id: 'solar-space-vtc-plaza-0', label: 'Plaza', value: '734 m² new shadow over 22 Sep', threshold: 'class unresolved', state: 'unknown' as const, flag: 'unresolved' as const, source: { label: 'City', page: 's.2, p.3' } },
      { id: 'solar-space-vtc-midblock-0', label: 'Link', value: '0 m² new shadow over 22 Sep', threshold: 'class unresolved', state: 'unknown' as const, flag: 'unresolved' as const, source: { label: 'City' } },
    ]
    const out = builtOutput(solar, r, 'vtc', lines)!
    expect(out.headline).toBe('1 of 2 spaces get new shadow')
    expect(out.state).toBe('unknown')
    expect(out.items.map((i) => i.id)).toEqual(['solar-space-vtc-plaza-0', 'solar-space-vtc-midblock-0'])
    expect(out.items[0].flag).toBe('unresolved')
  })

  it('keeps the sun preview from reading as a pass', () => {
    const out = builtOutput(def('built.sun'), r, 'vtc')!
    expect(out.state).toBe('unknown')
    expect(out.items[0].flag).toBe('unverified')
  })
})
