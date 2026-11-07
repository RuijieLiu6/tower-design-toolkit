// An icon with depth (Ruijie, 7 Nov: "give your tool icons a sense of depth … make sure they all have a rounded edge and
// the same size, each have their unique colour but limit the colours to the very light or bright tone, and you could
// make them have an inner shadow, or a transparent glow"; references: frosted glass app-icon tiles). One frosted
// rounded-square tile, the same shape everywhere, with an inner shadow and a lit rim; the glyph in a bright colour of
// its own, glowing through the frost (a blurred copy behind it). Its level carries importance by transparency (the
// glass UI rule, index.css): 'on' is the lit tool or a switched-on node, 'soft' an available tool at rest, 'off' a node
// that is off (clear glass, a quiet glyph). Styles in index.css (.gicon*); always decorative, so the button or label
// around it carries the name.
import type { CSSProperties } from 'react'
import type { Category } from '../data/registry'
import type { LucideIcon } from './icons'

export type GlassLevel = 'on' | 'soft' | 'off'

/** Two sizes only, so every icon of a kind matches: features on the landing page, tools inside the app. */
export const ICON = { feature: 52, tool: 40 } as const

/** Bright hues (HSL degrees) for icons that are not analysis nodes. */
export const HUES = { red: 0, coral: 14, orange: 32, yellow: 48, lime: 82, green: 140, teal: 168, cyan: 188, sky: 206, indigo: 232, violet: 268, magenta: 300, pink: 330 } as const

/** Each analysis category's hue: the old category colours lifted to bright tones, spread around the wheel. */
export const CATEGORY_HUE: Record<Category, number> = {
  ENER: 0, STRC: 16, PROG: 34, CLIM: 48, DATA: 82, ECOL: 138, PUBL: 166, SYST: 188, SITE: 208, MOBI: 232, CULT: 268, PRES: 300, SPAC: 330,
}

const hash = (s: string) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h) }
const WHEEL = Object.values(HUES)
/** A hue of its own for a name (design tools, actions): one of the bright hues, the same every time. */
export const hueFor = (name: string) => WHEEL[hash(name) % WHEEL.length]
/** A node's own hue: its category's hue, turned a little by its id, so nodes of one category differ but stay kin. */
export const nodeHue = (id: string, category: Category) => (CATEGORY_HUE[category] + ((hash(id) % 5) - 2) * 7 + 360) % 360

export default function GlassIcon({ icon: Icon, mono, hue = HUES.sky, size = ICON.feature, level = 'on', className = '' }: {
  icon?: LucideIcon; mono?: string; hue?: number; size?: number; level?: GlassLevel; className?: string
}) {
  const style = { '--gi': `${size}px`, '--gh': hue } as CSSProperties
  const glyph = Math.round(size * 0.46), stroke = size >= 96 ? size / 40 : size >= 48 ? 2 : 1.75
  return (
    <span aria-hidden className={`gicon ${className}`} data-level={level} style={style}>
      {Icon ? <>
        {level !== 'off' && <span className="gicon-glow"><Icon size={glyph} strokeWidth={stroke * 1.75} /></span>}
        <span className="gicon-glyph"><Icon size={glyph} strokeWidth={stroke} /></span>
      </> : <span className="gicon-glyph font-semibold tracking-tight" style={{ fontSize: Math.round(size * 0.3) }}>{mono}</span>}
    </span>
  )
}

/** Two letters for a name that has no icon of its own: "Solar envelope" → "SE". */
export const monogram = (name: string) => {
  const words = name.replace(/[^A-Za-z0-9 ]+/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !/^(the|and|for|with|from)$/i.test(w))
  return ((words[0]?.[0] ?? name[0] ?? '?') + (words[1]?.[0] ?? words[0]?.[1] ?? '')).toUpperCase()
}
