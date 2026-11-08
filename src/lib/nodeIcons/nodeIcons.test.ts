// Node Icon System (Ruijie, 7 Nov): briefs, the shared generator, upload checks, the package route and the rule that an
// icon never changes what a node does.
import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import example from '../../../skills/tower-studio-node-builder/references/example-node.json'
import { CUES, CURRENT_STYLE, OBJECTS, briefProblems, proposeBrief, type IconBrief } from './brief'
import { FallbackIcon, GeneratedIcon, HAS_VARIANTS } from './generate'
import { CHECKS, FIT, OCCUPANCY, PALETTE, PALETTE_HEX, PALETTE_HEX_V1, matchStyle, placement, qualityChecks, sniff } from './image'
import { dataUrlBytes } from './fromPackage'
import { packageIconOf, useNodeIcons, type IconRecord } from './store'
import { PACK_FILES, agentInstructions } from './agentInstructions'
import { validatePackage, validatePackageText } from '../nodeValidate'
import { useCommunityStore } from '../communityStore'
import { useStore } from '../../store'

const brief = (patch: Partial<IconBrief> = {}): IconBrief => ({ styleVersion: '1', name: 'Balcony noise', function: 'Estimates road noise at balconies.', category: 'CLIM', metaphor: { object: 'sound', cue: 'none' }, ...patch })

describe('briefs', () => {
  it('proposes an object and a cue from what the node does', () => {
    expect(proposeBrief({ name: 'Balcony noise', question: 'How loud is road noise at the balconies?', category: 'CLIM' }).metaphor.object).toBe('sound')
    expect(proposeBrief({ name: 'Rainwater detention', category: 'ECOL' }).metaphor.object).toBe('water')
    // stems and plurals match, short words don't match inside longer ones
    expect(proposeBrief({ name: 'Ecological corridors', category: 'DATA' }).metaphor.object).toBe('park')
    expect(proposeBrief({ name: 'Embodied carbon', category: 'ENER' }).metaphor).toEqual({ object: 'solar', cue: 'bolt' })
    expect(proposeBrief({ name: 'Window to wall ratio', category: 'SPAC' }).metaphor.object).toBe('facade')
    expect(proposeBrief({ name: 'Passenger trips', category: 'MOBI' }).metaphor.cue).toBe('none')
    const b = proposeBrief({ name: 'Lift waiting time at peak hour', category: 'SYST' })
    expect(b.metaphor).toEqual({ object: 'core', cue: 'clock' })
    // nothing in the words: the category's object, no cue
    expect(proposeBrief({ name: 'Quxx', category: 'PUBL' }).metaphor).toEqual({ object: 'street', cue: 'none' })
    expect(proposeBrief({ name: 'Quxx', category: 'PUBL' }).phase).toBe('program')
  })
  it('never pairs an object with its own cue', () => {
    for (const name of ['Sun hours on the plaza', 'Rain water storage', 'Noise and sound']) {
      const m = proposeBrief({ name, category: 'CLIM' }).metaphor
      expect(m.cue === m.object || (m.object === 'water' && m.cue === 'drop')).toBe(false)
    }
  })
  it('explains what is wrong with a brief', () => {
    expect(briefProblems(brief())).toEqual([])
    expect(briefProblems(null)).toHaveLength(1)
    expect(briefProblems(brief({ styleVersion: '9' as never }))[0]).toMatch(/Style pack "9"/)
    expect(briefProblems(brief({ metaphor: { object: 'rocket' as never } }))[0]).toMatch(/object must be one of/)
    expect(briefProblems(brief({ metaphor: { object: 'tower', cue: 'stars' as never } }))[0]).toMatch(/cue must be one of/)
  })
})

describe('the shared generator', () => {
  it('draws every object with every cue, the same way each time', () => {
    for (const object of OBJECTS) for (const cue of CUES) {
      const el = createElement(GeneratedIcon, { brief: brief({ metaphor: { object, cue } }), variant: 1, size: 40 })
      const a = renderToStaticMarkup(el)
      expect(a).toContain(`data-generated-icon="1:${object}:${cue}:1"`)
      expect(a).toMatch(/<(polygon|path|circle|ellipse|rect)/)
      expect(renderToStaticMarkup(el)).toBe(a)
    }
  })
  it('gives other drawings on Regenerate only where the object has them', () => {
    for (const object of OBJECTS) {
      const draw = (variant: number) => renderToStaticMarkup(createElement(GeneratedIcon, { brief: brief({ metaphor: { object } }), variant })).replace(/data-generated-icon="[^"]*"/, '')
      expect(draw(0) !== draw(3)).toBe(HAS_VARIANTS.has(object))
    }
  })
  it('falls back to the approved illustration for a style pack it does not know', () => {
    const svg = renderToStaticMarkup(createElement(GeneratedIcon, { brief: brief({ styleVersion: '9' as never }) }))
    const fallback = renderToStaticMarkup(createElement(FallbackIcon, { phase: 'form' }))
    const body = (s: string) => s.replace(/^<svg[^>]*>/, '')
    expect(body(svg)).toBe(body(fallback))
  })
  it('keeps icons saved under style pack 1 exactly as they were; style pack 2 uses the phase palette', () => {
    const v1 = renderToStaticMarkup(createElement(GeneratedIcon, { brief: brief({ metaphor: { object: 'tower' } }) }))
    expect(v1).toContain('hsl(14 82% 76%)') // style 1's Form tones, from its own frozen hue
    const v2 = renderToStaticMarkup(createElement(GeneratedIcon, { brief: brief({ styleVersion: '2', metaphor: { object: 'tower' } }) }))
    expect(v2).toContain('#ffae9b')
    expect(v2).not.toContain('hsl(')
  })
  it('never draws text', () => {
    for (const object of OBJECTS) expect(renderToStaticMarkup(createElement(GeneratedIcon, { brief: brief({ metaphor: { object, cue: 'check' } }) }))).not.toMatch(/<text/)
  })
})

/** A size × size RGBA square with a filled rectangle. */
function square(size: number, rect: [number, number, number, number] | null, rgb: [number, number, number] = [79, 88, 104], bg?: [number, number, number]): Uint8ClampedArray {
  const px = new Uint8ClampedArray(size * size * 4)
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = (y * size + x) * 4
    const inside = rect && x >= rect[0] && y >= rect[1] && x < rect[2] && y < rect[3]
    const c = inside ? rgb : bg
    if (c) { px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; px[i + 3] = 255 }
  }
  return px
}
/** A diamond like the toolkit's ground plate: `w` of the square wide, centred, its lowest point `bottom` above the edge. */
function plateLike(size: number, w = 0.85, bottom = 0.08, rgb: [number, number, number] = [217, 222, 228]): Uint8ClampedArray {
  const px = new Uint8ClampedArray(size * size * 4)
  const cx = size / 2, hw = (w * size) / 2, hh = hw * 0.58, cy = size * (1 - bottom) - hh
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    if (Math.abs(x + 0.5 - cx) / hw + Math.abs(y + 0.5 - cy) / hh > 1) continue
    const i = (y * size + x) * 4
    px[i] = rgb[0]; px[i + 1] = rgb[1]; px[i + 2] = rgb[2]; px[i + 3] = 255
  }
  return px
}
const state = (checks: ReturnType<typeof qualityChecks>) => Object.fromEntries(checks.map((c) => [c.id, c.state]))

describe('uploads', () => {
  it('reads the format from the bytes, not the name, and refuses SVG', () => {
    expect(sniff(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe('image/png')
    expect(sniff(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg')
    expect(sniff(new TextEncoder().encode('RIFF\0\0\0\0WEBPVP8 '))).toBe('image/webp')
    expect(sniff(new TextEncoder().encode('  <svg xmlns="http://www.w3.org/2000/svg"/>'))).toBe('image/svg+xml')
    expect(sniff(new TextEncoder().encode('<?xml version="1.0"?><svg/>'))).toBe('image/svg+xml')
    expect(sniff(new TextEncoder().encode('GIF89a'))).toBeNull()
  })
  it('fits the whole image by default, and crops on request', () => {
    expect(placement(512, 256, FIT, 256)).toEqual({ x: 0, y: 64, w: 256, h: 128 })
    const crop = placement(512, 256, { mode: 'crop', zoom: 1, dx: 0, dy: 0 }, 256)
    expect(crop).toEqual({ x: -128, y: 0, w: 512, h: 256 })
    expect(placement(512, 256, { mode: 'crop', zoom: 1, dx: 1, dy: 0 }, 256).x).toBe(-256)
    expect(placement(512, 256, { mode: 'crop', zoom: 2, dx: 0, dy: 0 }, 256).w).toBe(1024)
  })
  it('passes a well-framed drawing in the palette', () => {
    const s = 200
    expect(state(qualityChecks(plateLike(s), s))).toMatchObject({ framing: 'pass', clipping: 'pass', background: 'pass', palette: 'pass' })
    // off centre, floating, or covering the square: warnings in words
    const shifted = qualityChecks(plateLike(s, 0.85, 0.3), s)[0]
    expect(shifted.state).toBe('warn')
    expect(shifted.detail).toMatch(/above the bottom edge/)
    const full = (m: number) => square(s, [m, m, s - m, s - m])
    expect(qualityChecks(full(Math.round((1 - OCCUPANCY.target) / 2 * s)), s).find((c) => c.id === 'background')?.detail).toMatch(/covers 7\d% of the square/)
  })
  it('warns about a small, a clipped, an empty or an off-palette image', () => {
    const s = 100
    expect(state(qualityChecks(square(s, [40, 40, 60, 60]), s)).framing).toBe('warn')
    expect(state(qualityChecks(square(s, [0, 20, 80, 80]), s)).clipping).toBe('warn')
    expect(qualityChecks(square(s, null), s)[0].detail).toMatch(/fully transparent/)
    expect(state(qualityChecks(square(s, [15, 15, 85, 85], [255, 0, 255]), s)).palette).toBe('warn')
    expect(OCCUPANCY.min).toBeLessThan(OCCUPANCY.max)
  })
  it('spots a solid background, and Match toolkit style removes it and moves colours onto the palette', () => {
    const s = 64
    const img = square(s, [16, 16, 48, 48], [250, 0, 250], [30, 200, 30])
    expect(state(qualityChecks(img, s)).background).toBe('warn')
    const out = matchStyle(img, s)
    expect(out[3]).toBe(0) // the corner (background) is cleared
    const c = (32 * s + 32) * 4
    expect(out[c + 3]).toBe(255)
    expect(PALETTE.some((p) => p[0] === out[c] && p[1] === out[c + 1] && p[2] === out[c + 2])).toBe(true)
    expect(img[3]).toBe(255) // the original is untouched
    expect(state(qualityChecks(out, s))).toMatchObject({ background: 'pass', palette: 'pass' })
  })
  it('reads base64 data URLs', () => {
    expect(dataUrlBytes('data:image/png;base64,iVBORw0KGgo=')?.bytes.slice(0, 4)).toEqual(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))
    expect(dataUrlBytes('https://example.com/a.png')).toBeNull()
  })
})

const PNG_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg=='
describe('icons in node packages', () => {
  it('takes the icon out of the package, so the node itself never carries it', () => {
    const r = validatePackage({ ...example, icon: { kind: 'brief', brief: brief({ name: example.name, category: example.category as never }) } })
    expect(r.ok).toBe(true)
    expect(r.icon?.kind).toBe('brief')
    expect(r.pkg && 'icon' in r.pkg).toBe(false)
    expect(validatePackage({ ...example, icon: { kind: 'image', dataUrl: PNG_URL, source: 'agent', styleVersion: '1' } }).icon?.kind).toBe('image')
  })
  it('never refuses a node over its icon: a broken one is a warning and the node keeps the standard illustration', () => {
    for (const icon of [{ kind: 'image', dataUrl: 'data:image/svg+xml;base64,PHN2Zz4=', styleVersion: '1' }, { kind: 'brief', brief: { styleVersion: '1' } }, { kind: 'gif' }, 'tower']) {
      const r = validatePackage({ ...example, icon })
      expect(r.ok).toBe(true)
      expect(r.icon).toBeUndefined()
      expect(r.problems.some((p) => p.level === 'warning' && p.where === 'Icon')).toBe(true)
    }
    expect(validatePackage({ ...example, icon: { kind: 'image', dataUrl: 'data:image/svg+xml;base64,PHN2Zz4=', styleVersion: '1' } }).problems.find((p) => p.where === 'Icon')?.message).toMatch(/SVG/)
  })
  it('lets a package carry a full-size icon image, but not an oversized file', () => {
    const big = 'A'.repeat(1_000_000)
    expect(validatePackageText(JSON.stringify({ ...example, icon: { kind: 'image', dataUrl: `data:image/png;base64,${big}`, styleVersion: '1' } })).problems.some((p) => p.where === 'The file')).toBe(false)
    expect(validatePackageText(JSON.stringify({ ...example, method: 'x'.repeat(250_000) })).problems[0].where).toBe('The file')
  })
  it('writes the icon back into a shared package in the same shape', () => {
    const generated: IconRecord = { kind: 'generated', brief: brief(), variant: 2, styleVersion: '1', source: 'editor', updatedAt: '' }
    expect(validatePackage({ ...example, icon: packageIconOf(generated) }).icon).toEqual({ kind: 'brief', brief: brief() })
    const image: IconRecord = { kind: 'image', source: 'upload', styleVersion: '1', updatedAt: '', display: PNG_URL, restyled: 'data:image/png;base64,AAAA', useRestyled: true, adjust: FIT, width: 512, height: 512, type: 'image/png', checks: [] }
    expect(packageIconOf(image)).toEqual({ kind: 'image', dataUrl: 'data:image/png;base64,AAAA', source: 'upload', styleVersion: '1' })
  })
})

describe('an icon only changes how a node looks', () => {
  it('leaves the node, its parameters and whether it is on untouched', () => {
    useCommunityStore.setState({ packages: [example as never], params: { [example.id]: { maxWidth: 30 } } })
    useStore.setState((s) => ({ enabled: { ...s.enabled, [example.id]: true } }))
    const before = JSON.stringify([useCommunityStore.getState().packages, useCommunityStore.getState().params, useStore.getState().enabled])
    useNodeIcons.getState().setIcon(example.id, { kind: 'generated', brief: brief(), variant: 0, styleVersion: '1', source: 'editor', updatedAt: 'now' })
    useNodeIcons.getState().clearIcon(example.id)
    useNodeIcons.getState().setIcon(example.id, { kind: 'generated', brief: brief({ metaphor: { object: 'tower' } }), variant: 4, styleVersion: '1', source: 'agent', updatedAt: 'now' })
    expect(JSON.stringify([useCommunityStore.getState().packages, useCommunityStore.getState().params, useStore.getState().enabled])).toBe(before)
    expect(useNodeIcons.getState().icons[example.id]?.kind).toBe('generated')
  })
})

describe('instructions for AI agents', () => {
  it('name the versioned style pack, both routes and every brief word', () => {
    const t = agentInstructions({ name: 'Balcony noise', category: 'CLIM' })
    expect(t).toContain(`style-pack/node-icons/v${CURRENT_STYLE}/NODE_ICON_STYLE.md`)
    expect(t).toContain('"kind": "brief"')
    expect(t).toContain('"kind": "image"')
    for (const w of [...OBJECTS, ...CUES]) expect(t).toContain(w)
    expect(t).toMatch(/no SVG/)
    expect(t).toMatch(/not enough/)
    // Ruijie's prompt (7 Nov): honest about what exists, names missing pack files, returns meaning, source and version
    expect(t).toContain('Do not claim to have created an image when no image file exists.')
    expect(t).toMatch(/which of these files you could not get/)
    expect(t).toMatch(/keep it as it is unless I explicitly choose to restyle it/)
    for (const f of PACK_FILES) expect(t).toContain(`style-pack/node-icons/v${CURRENT_STYLE}/${f}`)
    for (const w of ['intended meaning', 'Its source', 'style pack version', 'standard node preview']) expect(t).toContain(w)
  })
})

describe('the published style pack (public/style-pack/node-icons/v1)', () => {
  it('uses the same brief words as the generator and the package schema', async () => {
    const pack = (await import('../../../public/style-pack/node-icons/v1/icon-brief.schema.json')).default as { properties: { metaphor: { properties: { object: { enum: string[] }; cue: { enum: string[] } } } } }
    const pkgSchema = (await import('../../../skills/tower-studio-node-builder/references/node-package.schema.json')).default as unknown as { $defs: { iconBrief: { properties: { metaphor: { properties: { object: { enum: string[] }; cue: { enum: string[] } } } } } } }
    expect(pack.properties.metaphor.properties.object.enum).toEqual([...OBJECTS])
    expect(pack.properties.metaphor.properties.cue.enum).toEqual([...CUES])
    expect(pkgSchema.$defs.iconBrief.properties.metaphor.properties.object.enum).toEqual([...OBJECTS])
    expect(pkgSchema.$defs.iconBrief.properties.metaphor.properties.cue.enum).toEqual([...CUES])
  })
  it('ships example packages that import with their icon, both ways', async () => {
    const files = { 'example-node.json': await import('../../../public/style-pack/node-icons/v1/example-node/example-node.json'), 'example-node-with-image.json': await import('../../../public/style-pack/node-icons/v1/example-node/example-node-with-image.json') }
    for (const [f, mod] of Object.entries(files)) {
      const pkg = mod.default
      const r = validatePackage(pkg)
      expect(r.ok, f).toBe(true)
      expect(r.problems.filter((p) => p.where === 'Icon'), f).toEqual([])
      expect(r.icon?.kind).toBe(f.includes('image') ? 'image' : 'brief')
    }
  })
  it('publishes exactly the thresholds and palette the app checks with', async () => {
    type Warn = { id: string; occupancy?: number[]; maxOffsetX?: number; bottomMargin?: number[]; maxEdgeShare?: number; maxInkShare?: number; minDark?: number; maxBusy?: number; minPaletteShare?: number; distance?: number; palette?: string[] }
    const tokens = (await import('../../../public/style-pack/node-icons/v1/icon-tokens.json')).default as unknown as { validation: { warn: Warn[] } }
    const w = Object.fromEntries(tokens.validation.warn.map((x) => [x.id, x])) as Record<string, Warn>
    expect([w.framing.occupancy, w.framing.maxOffsetX, w.framing.bottomMargin]).toEqual([CHECKS.occupancy, CHECKS.maxOffsetX, CHECKS.bottomMargin])
    expect([w.clipping.maxEdgeShare, w.background.maxInkShare, w.legibility.minDark, w.legibility.maxBusy]).toEqual([CHECKS.maxEdgeShare, CHECKS.maxInkShare, CHECKS.minDark, CHECKS.maxBusy])
    expect([w.palette.minPaletteShare, w.palette.distance]).toEqual([CHECKS.minPaletteShare, CHECKS.paletteDistance])
    expect([...(w.palette.palette ?? [])].sort()).toEqual([...PALETTE_HEX_V1].sort())
  })
  it('measures its framing from the toolkit’s own icons, and the app checks against the same band', async () => {
    const tokens = (await import('../../../public/style-pack/node-icons/v1/icon-tokens.json')).default as unknown as { export: { occupancy: { accept: [number, number]; target: number } } }
    expect([OCCUPANCY.min, OCCUPANCY.max]).toEqual(tokens.export.occupancy.accept)
    expect(OCCUPANCY.target).toBe(tokens.export.occupancy.target)
  })
})

describe('the current style pack (public/style-pack/node-icons/v2)', () => {
  it('uses the generator’s words, the app’s palette and thresholds, and ships examples that import with their icon', async () => {
    const pack = (await import('../../../public/style-pack/node-icons/v2/icon-brief.schema.json')).default as unknown as { properties: { styleVersion: { const?: string; enum?: string[] }; metaphor: { properties: { object: { enum: string[] }; cue: { enum: string[] } } } } }
    expect(pack.properties.metaphor.properties.object.enum).toEqual([...OBJECTS])
    expect(pack.properties.metaphor.properties.cue.enum).toEqual([...CUES])
    type Warn = { id: string; occupancy?: number[]; maxOffsetX?: number; bottomMargin?: number[]; maxEdgeShare?: number; maxInkShare?: number; minDark?: number; maxBusy?: number; minPaletteShare?: number; distance?: number; palette?: string[] }
    const tokens = (await import('../../../public/style-pack/node-icons/v2/icon-tokens.json')).default as unknown as { validation: { warn: Warn[] } }
    const w = Object.fromEntries(tokens.validation.warn.map((x) => [x.id, x])) as Record<string, Warn>
    expect([w.framing.occupancy, w.framing.maxOffsetX, w.framing.bottomMargin]).toEqual([CHECKS.occupancy, CHECKS.maxOffsetX, CHECKS.bottomMargin])
    expect([w.clipping.maxEdgeShare, w.background.maxInkShare, w.legibility.minDark, w.legibility.maxBusy, w.palette.minPaletteShare]).toEqual([CHECKS.maxEdgeShare, CHECKS.maxInkShare, CHECKS.minDark, CHECKS.maxBusy, CHECKS.minPaletteShare])
    expect([...(w.palette.palette ?? [])].sort()).toEqual([...PALETTE_HEX].sort())
    const files = { brief: await import('../../../public/style-pack/node-icons/v2/example-node/example-node.json'), image: await import('../../../public/style-pack/node-icons/v2/example-node/example-node-with-image.json') }
    for (const [k, mod] of Object.entries(files)) {
      const r = validatePackage(mod.default)
      expect(r.ok, k).toBe(true)
      expect(r.problems.filter((p) => p.where === 'Icon'), k).toEqual([])
      expect(r.icon?.kind).toBe(k)
      expect(r.icon && (r.icon.kind === 'brief' ? r.icon.brief.styleVersion : r.icon.styleVersion)).toBe(CURRENT_STYLE)
    }
  })
  it('is the version latest.json names', async () => {
    const latest = (await import('../../../public/style-pack/node-icons/latest.json')).default as { version: string }
    expect(latest.version).toBe(CURRENT_STYLE)
  })
})
