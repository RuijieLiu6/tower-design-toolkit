// 3D label contrast (Ruijie, 9 Nov: "the View 3.2.3 Queen Elizabeth Park is not readable with the colour combination").
// Labels in the 3D view are canvas sprites, so the axe accessibility run cannot see them; this test reads every
// <Label …> with a filled plate in the source and checks its text against the plate, composited over the backdrops a
// label can sit on (the light street map, dark parkland, white sky and dark water). WCAG 2.1 AA for normal text: 4.5:1.
// The regression it guards: the featured-cone label took CHROME.activeInk, the selected tab's blue, as text on a blue
// plate (about 1.1:1) after the 8 Nov token remap. Labels with a computed colour (e.g. a result state) or the quiet
// map-name plate (background={null}) are not checked here; the test lists how many it skipped so none go unnoticed.
import { describe, expect, it } from 'vitest'
import { CHROME } from '../lib/vistaLook'
import { STATUS, UI } from '../lib/design/tokens'

type RGB = [number, number, number]
const BACKDROPS: RGB[] = [[236, 236, 234], [90, 110, 95], [255, 255, 255], [40, 60, 80]]
const DEFAULT_PLATE = 'rgba(255,255,255,0.92)' // Label.tsx PLATE

function parse(c: string): { rgb: RGB; a: number } | null {
  const h = /^#([0-9a-f]{6})$/i.exec(c)
  if (h) return { rgb: [0, 2, 4].map((i) => parseInt(h[1].slice(i, i + 2), 16)) as RGB, a: 1 }
  const m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)$/.exec(c)
  return m ? { rgb: [+m[1], +m[2], +m[3]], a: m[4] === undefined ? 1 : +m[4] } : null
}
const lum = (c: RGB) => { const [r, g, b] = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }); return 0.2126 * r + 0.7152 * g + 0.0722 * b }
const ratio = (a: RGB, b: RGB) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05) }
const over = (fg: RGB, a: number, bg: RGB): RGB => fg.map((v, i) => v * a + bg[i] * (1 - a)) as RGB

/** A JSX attribute value as a colour string: "literal", {'literal'}, {CHROME.x}, {STATUS.x.fg|surface}, {UI.x}. */
function resolve(raw: string | undefined, local: Record<string, string>): string | null | undefined {
  if (raw === undefined) return undefined
  const lit = /^["']([^"']+)["']$/.exec(raw) ?? /^\{\s*["']([^"']+)["']\s*\}$/.exec(raw)
  if (lit) return lit[1]
  const expr = /^\{\s*([A-Za-z_][\w.]*)\s*\}$/.exec(raw)?.[1]
  if (!expr) return null
  if (expr === 'null') return null
  const [head, ...rest] = expr.split('.')
  const roots: Record<string, unknown> = { CHROME, STATUS, UI }
  if (head in roots) { let v: unknown = roots[head]; for (const k of rest) v = (v as Record<string, unknown>)?.[k]; return typeof v === 'string' ? v : null }
  return rest.length === 0 && local[head] ? local[head] : null
}

function labels() {
  // Every component's source, as text (Vite's raw import; no file system access needed).
  const sources = import.meta.glob('./**/*.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
  const files = Object.keys(sources).filter((f) => !f.endsWith('/Label.tsx'))
  const out: { where: string; color: string; background: string }[] = []
  let skipped = 0
  for (const f of files) {
    const src = sources[f]
    // File-level string constants used as colours (e.g. const INK_PLATE = 'rgba(…)').
    const local: Record<string, string> = {}
    for (const m of src.matchAll(/(?:const|,)\s*([A-Z_][A-Z0-9_]*)\s*=\s*'([^']+)'/g)) local[m[1]] = m[2]
    for (const m of src.matchAll(/<Label\b([^>]*?)\/>/gs)) {
      const attrs = m[1]
      const attr = (name: string) => new RegExp(`\\b${name}=("[^"]*"|\\{[^}]*\\})`).exec(attrs)?.[1]
      const color = resolve(attr('color'), local)
      const bgRaw = attr('background')
      const background = bgRaw === undefined ? DEFAULT_PLATE : resolve(bgRaw, local)
      const line = src.slice(0, m.index).split('\n').length
      if (!color || !background || !parse(color) || !parse(background)) { skipped++; continue }
      out.push({ where: `${f}:${line}`, color, background })
    }
  }
  return { out, skipped }
}

describe('3D label contrast', () => {
  const { out, skipped } = labels()

  it('finds the labels it checks, including the featured view-cone label', () => {
    expect(out.length).toBeGreaterThan(10)
    expect(out.some((l) => l.where.includes('VistaCones'))).toBe(true)
    // Informational: computed colours and quiet map-name plates are not checked here.
    expect(skipped).toBeLessThan(out.length)
  })

  it('every filled plate keeps its text at 4.5:1 or more over light map, dark park, white and dark backdrops', () => {
    const fails = out.flatMap((l) => {
      const fg = parse(l.color)!, bg = parse(l.background)!
      const worst = Math.min(...BACKDROPS.map((b) => ratio(over(fg.rgb, fg.a, over(bg.rgb, bg.a, b)), over(bg.rgb, bg.a, b))))
      return worst < 4.5 ? [`${l.where}: ${l.color} on ${l.background} = ${worst.toFixed(2)}:1`] : []
    })
    expect(fails).toEqual([])
  })

  it('the plate text token is not the selected-tab blue', () => {
    expect(CHROME.plateInk).not.toBe(CHROME.activeInk)
  })
})
