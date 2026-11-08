// The JS tokens mirror the CSS tokens (src/index.css @theme), and the core colour pairs meet WCAG AA contrast.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { LANDING, PHASE_COLOR, STATUS, UI } from './tokens'

const css = readFileSync(new URL('../../index.css', import.meta.url), 'utf8')
const cssVar = (name: string) => new RegExp(`--color-${name}:\\s*(#[0-9a-f]{6})`, 'i').exec(css)?.[1]?.toLowerCase()

const lum = (hex: string) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}
export const contrast = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }

describe('design tokens', () => {
  it('match the CSS theme', () => {
    const pairs: [string, string][] = [['canvas', UI.canvas], ['panel', UI.panel], ['subtle', UI.subtle], ['ink', UI.ink], ['muted', UI.muted], ['accent', UI.accent],
      ['accent-hover', UI.accentHover], ['selected', UI.selected], ['line', UI.line], ['boundary', UI.control], ['edge', UI.edge], ['focus', UI.focus], ['ai', UI.ai], ['ai-surface', UI.aiSurface]]
    for (const [n, v] of pairs) expect(cssVar(n), n).toBe(v)
    for (const [p, c] of Object.entries(PHASE_COLOR)) {
      expect(cssVar(p)).toBe(c.accent); expect(cssVar(`${p}-surface`)).toBe(c.surface); expect(cssVar(`${p}-ink`)).toBe(c.ink)
    }
    for (const [s, c] of Object.entries(STATUS)) { expect(cssVar(s)).toBe(c.fg); expect(cssVar(`${s}-surface`)).toBe(c.surface) }
  })
  it('meet WCAG AA: 4.5:1 for text, 3:1 for control boundaries and meaningful graphics', () => {
    for (const bg of [UI.panel, UI.canvas, UI.subtle]) {
      expect(contrast(UI.ink, bg)).toBeGreaterThanOrEqual(4.5)
      expect(contrast(UI.muted, bg)).toBeGreaterThanOrEqual(4.5)
      expect(contrast(UI.accent, bg)).toBeGreaterThanOrEqual(4.5)
      expect(contrast(UI.control, bg)).toBeGreaterThanOrEqual(3)
      expect(contrast(UI.edge, bg)).toBeGreaterThanOrEqual(3)
    }
    expect(contrast('#ffffff', UI.accent)).toBeGreaterThanOrEqual(4.5) // primary button text
    expect(contrast('#ffffff', UI.accentHover)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(UI.accentHover, UI.selected)).toBeGreaterThanOrEqual(4.5) // selected option text
    expect(contrast(UI.ai, UI.aiSurface)).toBeGreaterThanOrEqual(4.5)
    for (const c of Object.values(PHASE_COLOR)) { expect(contrast(c.ink, c.surface)).toBeGreaterThanOrEqual(4.5); expect(contrast(c.ink, '#ffffff')).toBeGreaterThanOrEqual(4.5) }
    for (const c of Object.values(STATUS)) { expect(contrast(c.fg, c.surface)).toBeGreaterThanOrEqual(4.5); expect(contrast(c.fg, '#ffffff')).toBeGreaterThanOrEqual(4.5) }
  })
  it('keep the landing atmosphere apart from every functional colour, and mirrored in CSS', () => {
    for (const [k, v] of Object.entries(LANDING.atmosphere)) expect(css.toLowerCase().includes(`--atmo-${k}: ${v}`), k).toBe(true)
    const functional = new Set([...Object.values(UI), ...Object.values(PHASE_COLOR).flatMap((p) => [p.accent, p.surface, p.ink, ...p.tones]), ...Object.values(STATUS).flatMap((s) => [s.fg, s.surface])].map((x) => x.toLowerCase()))
    for (const v of Object.values(LANDING.atmosphere)) expect(functional.has(v.toLowerCase()), v).toBe(false)
    expect(contrast(UI.ink, LANDING.atmosphere.surface)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(UI.muted, LANDING.atmosphere.ivory)).toBeGreaterThanOrEqual(4.5)
  })
})
