// Design tokens for code that draws in JavaScript: the 3D scene, SVG wires, charts and canvases (Ruijie, 7 Nov, design
// system §3–§4, §9). The same values as src/index.css @theme (CSS reads those; this file mirrors them, and
// design/tokens.test.ts fails if the two drift). Colour by meaning, four separate roles:
//   UI      interface surfaces, text, action and selection (blue is only for interaction and selection)
//   PHASE   workflow phases (artwork, phase markers, node-library categories, bounded highlights)
//   STATUS  execution status and assessment results (always with a symbol and a word)
//   MODEL / DATA   the 3D building and site, and analytical data (sequential, diverging, categorical)
import type { PhaseId } from '../phases'

export const UI = {
  canvas: '#f7f8fa', panel: '#ffffff', subtle: '#f0f2f5',
  ink: '#202630', muted: '#5f6875',
  accent: '#2563eb', accentHover: '#1d4ed8', selected: '#eaf1ff',
  line: '#d9dee7', control: '#778294', edge: '#66758a', focus: '#2563eb',
  ai: '#0e7490', aiSurface: '#ecfafd', aiLine: '#9bdcea',
} as const

export interface PhaseColour { accent: string; surface: string; ink: string; /** artwork: top, left face, right face */ tones: [string, string, string] }
export const PHASE_COLOR: Record<PhaseId, PhaseColour> = {
  site: { accent: '#00a9d6', surface: '#e7f7fc', ink: '#006b85', tones: ['#73d0e8', '#00a9d6', '#0084a7'] },
  form: { accent: '#ff6b4a', surface: '#fff0eb', ink: '#a93920', tones: ['#ffae9b', '#ff6b4a', '#c7533a'] },
  program: { accent: '#f4c430', surface: '#fff8dd', ink: '#785a00', tones: ['#f9df8d', '#f4c430', '#be9925'] },
  schematic: { accent: '#8b5cf6', surface: '#f3eeff', ink: '#5b21b6', tones: ['#bfa5fa', '#8b5cf6', '#6c48c0'] },
  present: { accent: '#e145c2', surface: '#fdecf8', ink: '#9b227c', tones: ['#ee99dd', '#e145c2', '#b03697'] },
}

export type StatusKind = 'success' | 'warning' | 'error' | 'pending'
export const STATUS: Record<StatusKind, { fg: string; surface: string }> = {
  success: { fg: '#147d50', surface: '#e7f4ed' },
  warning: { fg: '#946200', surface: '#fdf4dd' },
  error: { fg: '#c9363e', surface: '#fdecec' },
  pending: { fg: '#5f6875', surface: '#f0f2f5' },
}

/** The 3D model's default appearance (§9): a neutral matte architectural model. Starting values, checked under the scene's light. */
export const MODEL = {
  background: '#f2f4f7',
  proposed: '#e8ecf1',
  context: '#c7cdd5',
  ground: '#e3e7ec',
  edge: '#66758a',
  selected: '#2563eb',
  /** a contrasting keyline outside the selection outline, where the scene behind is dark */
  keyline: '#ffffff',
} as const

/** Analytical colour scales (§9): pick by the data, not by taste. */
export const DATA = {
  /** increasing quantities (e.g. hours of sunlight): light to dark in one warm family (yellow → brown), so the blue
   *  selection outline stays visible on top of it */
  sequential: ['#fff8e1', '#fde3a3', '#f8c264', '#ec9437', '#cf6418', '#8f3d0b'],
  /** above and below a meaningful reference (e.g. change from a baseline): two hues through a neutral middle */
  diverging: ['#a8402d', '#d9826b', '#f2cfc4', '#eef0f3', '#c7d9f2', '#7ea4dd', '#2f5fae'],
  /** distinct uses or object types: labelled, never ordered */
  categorical: ['#3b6fd8', '#e0803c', '#2e9b74', '#c24f8a', '#8a6fd1', '#b59b2d', '#4aa3b8', '#7d8794'],
  /** missing data, never zero: a neutral hatch with this ink */
  missing: '#9aa3af',
} as const

export const RADIUS = { control: 8, panel: 12, float: 16 } as const
export const SPACE = [4, 8, 12, 16, 24, 32, 48] as const
export const MOTION = { fast: 120, base: 200, slow: 300, ease: 'cubic-bezier(0.2, 0, 0, 1)' } as const

/** The landing page's atmosphere (Ruijie, 7 Nov): mood colours for the background light only. Never a phase, an action,
 *  a selection, a status, a model material or a data scale. Same values as src/index.css --atmo-*. */
export const LANDING = {
  atmosphere: {
    ivory: '#fffaf2', cream: '#fdf0e1', peach: '#ffc4a0', coral: '#ff9473', rose: '#f3a3c4', lavender: '#c8b6f3', blue: '#a6bdf6', sky: '#cde6fb',
    /** the stable ivory reading surface for the workflow card on the landing page */
    surface: '#fffdf9',
  },
} as const
