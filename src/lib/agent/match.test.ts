// The landing agent's reading of a sentence: keywords before the model loads, the model's cosine scores after, and when
// it asks instead of guessing. The model itself is replaced by a tiny stand-in (the real one is 30 MB from the web).
import { describe, expect, it } from 'vitest'
import { USER_TYPES } from '../userTypes'
import { buildIndex, MARGIN, MIN_SCORE, rankPresets, readText, wordScores } from './match'
import { readSafetensors, staticEmbedder } from './model2vec'

describe('reading what a visitor types', () => {
  it('keywords find the type when the words are clear, and say they are unsure otherwise', () => {
    expect(wordScores("I'm a structural engineer")[0].type).toBe('engineer')
    const r = readText("I'm a City planner reviewing applications", null)
    expect(r).toMatchObject({ confident: true, via: 'words' })
    expect(r.types[0].type).toBe('planner')
    expect(readText('I am a student in a design studio', null).types[0].type).toBe('designer')
    expect(readText('our architecture practice has a rezoning', null).types[0].type).toBe('practitioner')
    expect(readText('hello there', null).confident).toBe(false)
  })

  it('with a language model: the closest type by cosine, and a tie means asking', () => {
    // A stand-in model: one dimension per type, a sentence points along the words it contains.
    const AXES = ['student', 'architect', 'planner', 'engineer']
    const e = { dim: 4, embed: (texts: string[]) => texts.map((t) => {
      const v = new Float32Array(AXES.map((w) => (t.toLowerCase().includes(w) ? 1 : 0)))
      const n = Math.hypot(...v) || 1
      return v.map((x) => x / n)
    }) }
    const model = { e, index: buildIndex(e) }
    const r = readText('a planner at the City', model)
    expect(r.via).toBe('model')
    expect(r.types[0].type).toBe('planner')
    expect(r.types[0].score).toBeGreaterThanOrEqual(MIN_SCORE)
    const tie = readText('a planner and an engineer', model)
    expect(Math.abs(tie.types[0].score - tie.types[1].score)).toBeLessThan(MARGIN)
    expect(tie.confident).toBe(false)
  })

  it('a type\'s workflows: the closest to the words first, the curated order otherwise', () => {
    const order = USER_TYPES.find((t) => t.id === 'engineer')!.presets.map((p) => p.id)
    expect(rankPresets('', 'engineer').map((p) => p.id)).toEqual(order)
    expect(rankPresets('embodied carbon and energy targets', 'engineer')[0].id).toBe('engineer.sustainability')
    expect(rankPresets('elevators and egress stairs', 'engineer')[0].id).toBe('engineer.vertical')
  })
})

describe('the in-browser model file', () => {
  it('reads a safetensors table and makes unit sentence vectors from token rows', () => {
    const rows = [[1, 0], [0, 1], [1, 1]]
    const data = new Float32Array(rows.flat())
    const header = new TextEncoder().encode(JSON.stringify({ embeddings: { dtype: 'F32', shape: [3, 2], data_offsets: [0, data.byteLength] } }).padEnd(64, ' '))
    const buf = new ArrayBuffer(8 + header.length + data.byteLength)
    new DataView(buf).setBigUint64(0, BigInt(header.length), true)
    new Uint8Array(buf, 8, header.length).set(header)
    new Uint8Array(buf, 8 + header.length).set(new Uint8Array(data.buffer))
    const table = readSafetensors(buf)
    expect(table).toMatchObject({ rows: 3, dim: 2 })
    const e = staticEmbedder((t) => t.split(' ').map(Number), table)
    const [v] = e.embed(['0 1'])
    expect([v[0], v[1]]).toEqual([expect.closeTo(Math.SQRT1_2, 6), expect.closeTo(Math.SQRT1_2, 6)])
  })
})
