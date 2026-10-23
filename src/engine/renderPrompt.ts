// AI render workflow (research P13-M05): the prompt file that goes with a capture, the size rules for the image
// model, and the manifests that pair a render with its source capture. Pure functions; the app writes the files and a
// local script (tools/render.mjs) runs the user's own Codex CLI on them. Nothing here calls a model.

export type StyleId = 'clay' | 'overcast' | 'dusk' | 'winter' | 'sketch'

/** Style presets (team choices). Each is anchored to the site so the image does not drift to a generic city. */
export const STYLES: Record<StyleId, { label: string; text: string }> = {
  clay: { label: 'Clay study model', text: 'Render it as a soft matte clay study model: one warm off-white material, soft ambient occlusion, a plain light ground and grey context blocks.' },
  overcast: { label: 'Photoreal, Vancouver overcast', text: 'Render it as a photorealistic architectural view under a bright overcast Vancouver sky, with wet pavements, mature street trees and the North Shore mountains and water where they are visible.' },
  dusk: { label: 'Photoreal, dusk', text: 'Render it as a photorealistic architectural view at dusk, with warm interior light in the lower floors, a deep blue sky and the mountains in silhouette where visible.' },
  winter: { label: 'Photoreal, winter morning', text: 'Render it as a photorealistic view on a clear winter morning with low sun, snow on the North Shore mountains and crisp shadows.' },
  sketch: { label: 'Watercolour sketch', text: 'Render it as a loose architectural watercolour sketch with fine pencil linework over the massing and light washes of colour.' },
}

/** Lines every prompt carries; the user cannot remove them (fidelity and anonymity, research P13-M05). */
export const FIXED_CONSTRAINTS = [
  'Same massing, same camera, label nothing.',
  'Keep every building where it is: the same outlines, heights, setbacks and floor lines. Do not add, remove, move or resize any tower.',
  'Keep the sun direction and the shadows of the input image.',
  'No text, signage, logos, watermarks, names or numbers anywhere in the image.',
  'No recognisable real people.',
  'Do not imitate Indigenous art, motifs or carving.',
]

export interface PromptFields {
  style: StyleId
  /** e.g. "Aerial, from the south-east, 38° lens" */
  cameraNote: string
  /** e.g. "office, hotel and homes over a retail podium" */
  programNote: string
  notes: string
}

/** Words that would put an identity or a mark on the image (checked in the user's own notes). */
const BLOCKED = /\b(logo|brand|signage|sign that says|watermark|signature|our (team|names?)|ubc|sala|arch ?540)\b/i

export interface BuiltPrompt { text: string; warnings: string[] }

export function buildPrompt(f: PromptFields): BuiltPrompt {
  const warnings: string[] = []
  const notes = f.notes.trim().replace(/\s+/g, ' ')
  if (BLOCKED.test(notes)) warnings.push('Your notes ask for a mark, a name or signage. The fixed lines forbid them; reword the notes.')
  const parts = [
    'This image is a 3D capture of a tower design in downtown Vancouver.',
    STYLES[f.style].text,
    f.cameraNote ? `Camera: ${f.cameraNote}. Do not change the viewpoint or the lens.` : '',
    f.programNote ? `The tower holds ${f.programNote}.` : '',
    notes ? `Also: ${notes}` : '',
    ...FIXED_CONSTRAINTS,
    'Save the result as one landscape PNG.',
  ].filter(Boolean)
  return { text: parts.join(' '), warnings }
}

// ---------------------------------------------------------------- size rules (OpenAI image guide, as read in research P13 r2)
export interface SizeCheck { ok: boolean; experimental: boolean; problems: string[] }

/** gpt-image sizes: multiples of 16, ratio between 1:3 and 3:1, edges ≤ 3840 px, 655,360–8,294,400 pixels; above 2560 × 1440 is experimental. */
export function checkSize(w: number, h: number): SizeCheck {
  const problems: string[] = []
  if (w % 16 || h % 16) problems.push('both sides must be multiples of 16')
  const r = w / h
  if (r > 3 || r < 1 / 3) problems.push('the ratio must be between 1:3 and 3:1')
  if (w > 3840 || h > 3840) problems.push('no side may exceed 3840 px')
  const px = w * h
  if (px < 655_360 || px > 8_294_400) problems.push('the pixel count must be between 655,360 and 8,294,400')
  return { ok: problems.length === 0, experimental: px > 2560 * 1440, problems }
}

/** Largest size of the given ratio that satisfies the rules without being experimental. */
export function fitSize(ratio: number, maxPixels = 2560 * 1440): { w: number; h: number } {
  let h = Math.floor(Math.sqrt(maxPixels / ratio) / 16) * 16
  let w = Math.floor((h * ratio) / 16) * 16
  while (w * h > maxPixels && h > 16) { h -= 16; w = Math.floor((h * ratio) / 16) * 16 }
  return { w, h }
}

// ---------------------------------------------------------------- manifests
export const JOB_FORMAT = 'tower-studio-render-job@1'
export const RESULT_FORMAT = 'tower-studio-render-result@1'

/** Prepared in Present, saved next to the capture as `<id>.json`. */
export interface RenderJob {
  format: typeof JOB_FORMAT
  id: string
  created: string
  capture: { file: string; label: string; shotId: string | null; width: number; height: number }
  style: StyleId
  cameraNote: string
  prompt: string
  constraints: string[]
  size: { w: number; h: number }
  project: string
}

/** Written by tools/render.mjs next to the render as `<id>.ai.json`. */
export interface RenderResult {
  format: typeof RESULT_FORMAT
  id: string
  job: RenderJob
  image: string
  tool: string
  model: string
  rendered: string
  inputSha256?: string
  outputSha256?: string
}

/** Short, sortable, file-safe id. */
export function renderId(at: Date): string {
  return `tsr-${at.toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '-')}`
}

export function makeJob(id: string, created: string, capture: RenderJob['capture'], fields: PromptFields, project: string, size = fitSize(capture.width / capture.height)): RenderJob {
  const p = buildPrompt(fields)
  return { format: JOB_FORMAT, id, created, capture, style: fields.style, cameraNote: fields.cameraNote, prompt: p.text, constraints: FIXED_CONSTRAINTS, size, project }
}

/** Read a result manifest; null if it is not one. */
export function parseResult(text: string): RenderResult | null {
  try {
    const j = JSON.parse(text) as Partial<RenderResult>
    if (j.format !== RESULT_FORMAT || typeof j.id !== 'string' || !j.job || j.job.format !== JOB_FORMAT) return null
    return j as RenderResult
  } catch { return null }
}

/** Pair picked files: each image with the manifest of the same id (`<id>.ai.png` + `<id>.ai.json`). Unpaired images still import, flagged. */
export function pairFiles(names: string[]): { image: string; manifest: string | null; id: string | null }[] {
  const idOf = (n: string) => /(tsr-\d{8}-\d{6})/.exec(n)?.[1] ?? null
  const manifests = new Map(names.filter((n) => /\.json$/i.test(n)).map((n) => [idOf(n), n]))
  return names.filter((n) => /\.(png|jpe?g|webp)$/i.test(n)).map((image) => { const id = idOf(image); return { image, id, manifest: id ? manifests.get(id) ?? null : null } })
}

// ---------------------------------------------------------------- label rule
export interface AiMeta {
  /** Render id, or null when the image came without a manifest. */
  id: string | null
  model: string
  tool: string
  rendered: string
  sourceLabel: string
  sourceShotId: string | null
  prompt: string
}

/** The visible label on every AI-derived image (filmstrip and boards); it always starts with "AI-generated". */
export function aiLabel(meta: AiMeta | null | undefined, caption = ''): string {
  const own = caption.trim()
  const from = meta?.sourceLabel ? ` from ${meta.sourceLabel}` : ''
  return own ? `AI-generated image${from} · ${own}` : `AI-generated image${from}`
}
