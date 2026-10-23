import { describe, expect, it } from 'vitest'
import { imageSource, newBoard, printedCaption, boardChecks, type BoardImage } from './boards'
import {
  FIXED_CONSTRAINTS, JOB_FORMAT, RESULT_FORMAT, STYLES, aiLabel, buildPrompt, checkSize, fitSize, makeJob, pairFiles, parseResult, renderId, type AiMeta,
} from './renderPrompt'

const fields = { style: 'overcast' as const, cameraNote: 'aerial, looking from the south-east, 38° lens', programNote: 'office, hotel and homes over a retail podium', notes: '' }
const meta: AiMeta = { id: 'tsr-20261022-021500', model: 'gpt-image-2', tool: 'codex-cli 0.163.0', rendered: '2026-10-22T09:20:00Z', sourceLabel: 'Clay view at 02:15', sourceShotId: 's1', prompt: 'p' }

describe('prompt builder', () => {
  it('always carries the fixed fidelity and anonymity lines, whatever the style', () => {
    for (const style of Object.keys(STYLES) as (keyof typeof STYLES)[]) {
      const p = buildPrompt({ ...fields, style })
      for (const c of FIXED_CONSTRAINTS) expect(p.text).toContain(c)
      expect(p.text).toContain(STYLES[style].text)
    }
    expect(buildPrompt(fields).text).toContain('Same massing, same camera, label nothing.')
  })

  it('includes the camera note and program, and keeps notes on one line', () => {
    const p = buildPrompt({ ...fields, notes: 'people on the\n retail high street' })
    expect(p.text).toContain('Camera: aerial, looking from the south-east, 38° lens.')
    expect(p.text).toContain('office, hotel and homes over a retail podium')
    expect(p.text).toContain('Also: people on the retail high street')
    expect(p.warnings).toEqual([])
  })

  it('warns when notes ask for a logo, signage or the school', () => {
    expect(buildPrompt({ ...fields, notes: 'add our logo on the crown' }).warnings.length).toBe(1)
    expect(buildPrompt({ ...fields, notes: 'a banner saying UBC SALA' }).warnings.length).toBe(1)
    expect(buildPrompt({ ...fields, notes: 'cherry trees in bloom' }).warnings.length).toBe(0)
  })
})

describe('image size rules (OpenAI image guide, as read in research P13)', () => {
  it('accepts a 16-multiple A2-ratio size under the experimental line', () => {
    const s = fitSize(1.414)
    expect(s.w % 16).toBe(0); expect(s.h % 16).toBe(0)
    expect(s.w * s.h).toBeLessThanOrEqual(2560 * 1440)
    expect(Math.abs(s.w / s.h - 1.414)).toBeLessThan(0.02)
    expect(checkSize(s.w, s.h)).toEqual({ ok: true, experimental: false, problems: [] })
  })

  it('rejects sizes that break a rule and marks large ones experimental', () => {
    expect(checkSize(1000, 700).problems).toContain('both sides must be multiples of 16')
    expect(checkSize(4000, 1600).problems).toContain('no side may exceed 3840 px')
    expect(checkSize(3200, 960).problems).toContain('the ratio must be between 1:3 and 3:1')
    expect(checkSize(512, 512).problems).toContain('the pixel count must be between 655,360 and 8,294,400')
    expect(checkSize(3840, 2160)).toMatchObject({ ok: true, experimental: true })
  })
})

describe('job and result manifests', () => {
  it('makes a sortable id and a job that carries the prompt and capture', () => {
    const id = renderId(new Date('2026-10-22T09:15:00Z'))
    expect(id).toBe('tsr-20261022-091500')
    const job = makeJob(id, '2026-10-22T09:15:00Z', { file: `${id}.png`, label: 'Clay view at 02:15', shotId: 's1', width: 2256, height: 1600 }, fields, 'vtc')
    expect(job.format).toBe(JOB_FORMAT)
    expect(job.prompt).toContain('label nothing')
    expect(job.constraints).toEqual(FIXED_CONSTRAINTS)
    expect(checkSize(job.size.w, job.size.h).ok).toBe(true)
  })

  it('reads a result manifest and rejects anything else', () => {
    const job = makeJob('tsr-20261022-091500', 'x', { file: 'a.png', label: 'L', shotId: null, width: 10, height: 10 }, fields, 'vtc')
    expect(parseResult(JSON.stringify({ format: RESULT_FORMAT, id: job.id, job, image: 'a.ai.png', tool: 't', model: 'm', rendered: 'r' }))?.id).toBe(job.id)
    expect(parseResult(JSON.stringify({ format: 'other' }))).toBeNull()
    expect(parseResult('not json')).toBeNull()
  })

  it('pairs each render with the manifest of the same id, and keeps unpaired images', () => {
    const pairs = pairFiles(['tsr-20261022-091500.ai.png', 'tsr-20261022-091500.ai.json', 'tsr-20261022-101500.ai.png', 'notes.txt', 'random.jpg'])
    expect(pairs).toEqual([
      { image: 'tsr-20261022-091500.ai.png', id: 'tsr-20261022-091500', manifest: 'tsr-20261022-091500.ai.json' },
      { image: 'tsr-20261022-101500.ai.png', id: 'tsr-20261022-101500', manifest: null },
      { image: 'random.jpg', id: null, manifest: null },
    ])
  })
})

describe('AI label rule', () => {
  it('labels every AI render "AI-generated", linked to its capture', () => {
    expect(aiLabel(meta)).toBe('AI-generated image from Clay view at 02:15')
    expect(aiLabel(meta, 'Retail high street')).toBe('AI-generated image from Clay view at 02:15 · Retail high street')
    expect(aiLabel(null)).toBe('AI-generated image')
  })

  it('keeps an imported render AI on the boards even if its source says otherwise', () => {
    const img: BoardImage = { id: 'r', dataUrl: '', w: 2256, h: 1600, source: 'own', label: 'render', ai: meta }
    expect(imageSource(img)).toBe('ai')
    const b = newBoard(0, 'hero')
    b.frames[1].content = { kind: 'image', imageId: 'r', fit: 'cover' }
    b.frames[1].caption = 'Dusk on the high street'
    expect(printedCaption(b.frames[1], img)).toBe('AI-generated image · Dusk on the high street')
    expect(boardChecks(b, 1, { boards: [b], images: { r: img }, denyList: [] }).find((x) => x.id === 'b1-ai')?.value).toContain('1 of 1')
    expect(imageSource({ ...img, ai: undefined })).toBe('own')
  })
})
