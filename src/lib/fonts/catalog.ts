// The fonts the board composer offers (Ruijie, 17 Nov: "an option to change the font, and users can also download and
// upload the font type they want"). Built in: Inter (the app's own face, loaded by src/index.css) and four more SIL
// Open Font Licence faces shipped in public/fonts/<id>/ with their licence files, so the offline app never calls a
// font server. More come from the free sources listed here (a link, nothing sent) or from the viewer's own files
// (lib/fonts/fontStore.ts). Pure data and string helpers; the loading is in fontStore.ts.
import type { BoardFonts } from '../../engine/boards'

export type FontKind = 'sans' | 'serif' | 'mono' | 'condensed' | 'display'
export const KIND_WORD: Record<FontKind, string> = { sans: 'Sans', serif: 'Serif', mono: 'Mono', condensed: 'Condensed', display: 'Display' }

export interface BuiltinFont {
  id: string
  /** The CSS family name, as the board and the picker use it. */
  family: string
  kind: FontKind
  /** One line on hover: what it is good for on a board. */
  about: string
  /** Weight files under public/fonts/<id>/ (none for Inter: the app's CSS loads it). */
  files: { weight: number; file: string }[]
  licence: string
  /** The licence text shipped beside the font, under public/. */
  licenceFile: string
  source: string
}

export const BUILTIN_FONTS: BuiltinFont[] = [
  { id: 'inter', family: 'Inter Variable', kind: 'sans', about: 'The app\'s own face: neutral, every weight, good small', files: [], licence: 'SIL OFL 1.1', licenceFile: 'fonts/inter/LICENSE.txt', source: 'rsms.me/inter (npm @fontsource-variable/inter)' },
  { id: 'ibm-plex-sans', family: 'IBM Plex Sans', kind: 'sans', about: 'A plain, engineered sans for body text and labels', files: [{ weight: 400, file: 'ibm-plex-sans-latin-400-normal.woff2' }, { weight: 700, file: 'ibm-plex-sans-latin-700-normal.woff2' }], licence: 'SIL OFL 1.1', licenceFile: 'fonts/ibm-plex-sans/LICENSE.txt', source: 'IBM Plex (npm @fontsource/ibm-plex-sans)' },
  { id: 'lora', family: 'Lora', kind: 'serif', about: 'A calm serif for narrative text and titles', files: [{ weight: 400, file: 'lora-latin-400-normal.woff2' }, { weight: 700, file: 'lora-latin-700-normal.woff2' }], licence: 'SIL OFL 1.1', licenceFile: 'fonts/lora/LICENSE.txt', source: 'Lora Project (npm @fontsource/lora)' },
  { id: 'ibm-plex-mono', family: 'IBM Plex Mono', kind: 'mono', about: 'A monospace for numbers, tables and evidence lines', files: [{ weight: 400, file: 'ibm-plex-mono-latin-400-normal.woff2' }, { weight: 700, file: 'ibm-plex-mono-latin-700-normal.woff2' }], licence: 'SIL OFL 1.1', licenceFile: 'fonts/ibm-plex-mono/LICENSE.txt', source: 'IBM Plex (npm @fontsource/ibm-plex-mono)' },
  { id: 'barlow-condensed', family: 'Barlow Condensed', kind: 'condensed', about: 'A condensed face for big board titles that must stay on one line', files: [{ weight: 400, file: 'barlow-condensed-latin-400-normal.woff2' }, { weight: 700, file: 'barlow-condensed-latin-700-normal.woff2' }], licence: 'SIL OFL 1.1', licenceFile: 'fonts/barlow-condensed/LICENSE.txt', source: 'Barlow Project (npm @fontsource/barlow-condensed)' },
]

export const DEFAULT_FAMILY = BUILTIN_FONTS[0].family
export const DEFAULT_FONTS: BoardFonts = { heading: DEFAULT_FAMILY, body: DEFAULT_FAMILY }
export const isBuiltin = (family: string) => BUILTIN_FONTS.some((f) => f.family === family)
export const builtinFont = (family: string) => BUILTIN_FONTS.find((f) => f.family === family)

const GENERIC: Record<FontKind, string> = { sans: 'sans-serif', serif: 'serif', mono: 'monospace', condensed: 'sans-serif', display: 'sans-serif' }
/** The CSS font stack for a family: itself, then Inter, then the system's, so a missing font still reads. */
export function fontStack(family: string, kind: FontKind = builtinFont(family)?.kind ?? 'sans'): string {
  const own = family.replace(/["\\]/g, '').trim()
  const inter = `"Inter Variable", "Inter", "Segoe UI", system-ui, -apple-system, ${GENERIC[kind]}`
  return own && own !== 'Inter Variable' ? `"${own}", ${inter}` : inter
}

/** Where more free fonts come from. Opening a link is the viewer's own visit: the app sends nothing. */
export const FONT_SOURCES: { name: string; url: string; note: string }[] = [
  { name: 'Google Fonts', url: 'https://fonts.google.com/?category=Sans+Serif,Serif,Display,Monospace&sort=popularity', note: 'free faces, most under the SIL Open Font Licence; download the family, then add a .ttf here' },
  { name: 'Fontsource', url: 'https://fontsource.org/', note: 'the same open fonts as npm packages with .woff2 files' },
  { name: 'The League of Moveable Type', url: 'https://www.theleagueofmoveabletype.com/', note: 'a small set of open fonts' },
]
