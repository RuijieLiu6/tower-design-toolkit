// The builder's result summaries: counted from the digest's lines, in words, only for nodes that are on.
import { describe, expect, it } from 'vitest'
import { summarizeDigest, summaryWords } from './useNodeSummaries'
import type { Digest } from '../lib/trace/digest'

const line = (id: string, state: 'pass' | 'warn' | 'fail' | 'unknown') => ({ id, group: 'g', label: id, value: '', state, flag: 'verified' })

describe('node summaries', () => {
  it('count pass, check and fail per node, leaving open lines out', () => {
    const d: Digest = { metrics: {}, lines: [line('fsr:t1:a', 'pass'), line('fsr:t1:b', 'pass'), line('fsr:t1:c', 'warn'), line('fsr:t1:d', 'fail'), line('fsr:t1:e', 'unknown')] }
    expect(summarizeDigest(d, { 'built.fsr': true })).toEqual({ 'built.fsr': '2 pass · 1 check · 1 fail' })
  })
  it('say "n open" only when every line is open, and nothing for a node that is off or has no lines', () => {
    const d: Digest = { metrics: {}, lines: [line('lifts:t1:x', 'unknown'), line('lifts:t1:y', 'unknown'), line('egress:t1:z', 'pass')] }
    expect(summarizeDigest(d, { 'built.core-lifts': true, 'built.egress': false })).toEqual({ 'built.core-lifts': '2 open' })
    expect(summaryWords({ pass: 0, warn: 0, fail: 0, unknown: 0 })).toBeUndefined()
  })
  it('map community lines to their package', () => {
    const d: Digest = { metrics: {}, lines: [line('community:r1:community.mine', 'pass')] }
    expect(summarizeDigest(d, { 'community.mine': true })).toEqual({ 'community.mine': '1 pass' })
  })
})
