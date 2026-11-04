// AI render workflow (research P13-M05), shared by the Render tab: prepare a capture and its prompt file, render it with
// the user's own Codex CLI (through the local helper, render.plugin.ts, or by hand with tools/render.mjs), then import
// the result. Every imported render is labelled AI-generated in the shot strip and on the boards, linked to its capture,
// and waits for the four review checks before it can be accepted.
import { aiLabel, makeJob, parseResult, renderId, type AiMeta, type PromptFields, type RenderJob, type RenderResult } from '../engine/renderPrompt'
import { USES, type Tower } from '../engine/types'
import { useStore } from '../store'
import { imageSize } from './boardRender'
import { useBoardStore } from './boardStore'
import { creditedDataUrl, sceneCredit } from './credit'
import { useCultureStore } from './cultureStore'
import { captureHiRes } from './hiresCapture'
import { useRenderStore, type RenderRecord } from './renderStore'

export { aiLabel }
export const RENDER_SCRIPT = 'node "tower-studio/tools/render.mjs"'
export const RENDER_COMMANDS = [
  { cmd: `${RENDER_SCRIPT} --collect`, what: 'copies prepared files from your Downloads folder into 04 Tool Plan/renders/inbox' },
  { cmd: `${RENDER_SCRIPT} --dry-run`, what: 'shows what would run; uses nothing' },
  { cmd: RENDER_SCRIPT, what: 'renders each inbox item with your Codex CLI and ChatGPT plan; asks first' },
]

export const clock = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

/** Plain-words camera note from the last camera preset (direction relative to true north, lens). */
export function cameraNote(req: { position: number[]; target: number[]; fov?: number } | null, northDeg: number): string {
  if (!req) return 'the current view'
  const dx = req.position[0] - req.target[0], dy = req.position[1] - req.target[1], dz = req.position[2] - req.target[2]
  const az = ((Math.atan2(dx, dy) * 180) / Math.PI - northDeg + 720) % 360
  const dir = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'][Math.round(az / 45) % 8]
  const dist = Math.hypot(dx, dy), elev = (Math.atan2(dz, dist) * 180) / Math.PI
  const kind = req.position[2] < 3 ? 'eye level from the street' : elev > 25 ? 'aerial' : 'distant'
  return `${kind}, looking from the ${dir}, ${Math.round(req.fov ?? 38)}° lens`
}

/** The programme in a few words, from the first tower's bands. */
export function programNote(towers: Tower[]): string {
  const t = towers[0]
  if (!t) return ''
  const uses = [...new Set(t.bands.filter((b) => b.share > 0).map((b) => USES[b.use].label.toLowerCase()))]
  return `${uses.join(', ')}${t.podiumHeight > 0 ? ` over a ${USES[t.podiumUse].label.toLowerCase()} podium` : ''}`
}

export type Capture = { dataUrl: string; label: string; shotId: string | null; w: number; h: number }

/**
 * The image to render: the current 3D view at `width` px, massing only (no labels, lines or see-through overlays,
 * which an image model would redraw as buildings), also filed in the shot strip; or a shot from the strip as it is.
 */
export async function captureFor(source: 'view' | string, width: number): Promise<Capture | string> {
  const s = useStore.getState()
  if (source === 'view') {
    if (s.boardView !== '3d') { s.set({ boardView: '3d' }); await new Promise((r) => setTimeout(r, 400)) }
    const dataUrl = captureHiRes(width, { massingOnly: true })
    if (!dataUrl) return 'The 3D view is not showing: switch the main view to 3D and try again.'
    const at = new Date().toISOString()
    s.addShot({ id: at, dataUrl, stage: s.phase, representation: s.presentRep, project: s.project, at })
    const { w, h } = await imageSize(dataUrl)
    return { dataUrl, label: `${s.presentRep === 'xray' ? 'X-ray' : 'Clay'} view at ${clock(at)}`, shotId: at, w, h }
  }
  const shot = s.shots.find((x) => x.id === source)
  if (!shot) return 'Pick a shot.'
  if (shot.ai) return 'That shot is already an AI render. Start from a capture instead.'
  const { w, h } = await imageSize(shot.dataUrl)
  return { dataUrl: shot.dataUrl, label: `${shot.representation === 'xray' ? 'X-ray' : shot.representation === 'plan' ? 'Plan' : 'Clay'} view at ${clock(shot.at)}`, shotId: shot.id, w, h }
}

/** A job file for the capture (engine/renderPrompt.ts). Record it with `recordJob` once it has been sent or saved. */
export function jobFor(capture: Capture, fields: PromptFields, size: { w: number; h: number }): RenderJob {
  const now = new Date(), id = renderId(now)
  return makeJob(id, now.toISOString(), { file: `${id}.png`, label: capture.label, shotId: capture.shotId, width: capture.w, height: capture.h }, fields, useStore.getState().project, size)
}

/** Lists the job as waiting for its result (the Render tab follows waiting jobs with the helper). */
export function recordJob(job: RenderJob): void {
  useRenderStore.getState().addJob({ id: job.id, created: job.created, style: job.style, cameraNote: job.cameraNote })
}

function download(href: string, name: string) { const a = document.createElement('a'); a.href = href; a.download = name; a.click() }

/** By hand (no local helper, e.g. the published site): the capture and its job file go to the Downloads folder. */
export function downloadJob(job: RenderJob, capture: Capture): void {
  download(capture.dataUrl, `${job.id}.png`)
  const url = URL.createObjectURL(new Blob([JSON.stringify(job, null, 2)], { type: 'application/json' }))
  setTimeout(() => { download(url, `${job.id}.json`); setTimeout(() => URL.revokeObjectURL(url), 4000) }, 300)
}

/**
 * Files one rendered image: shot strip and board library (always labelled AI-generated), an AI-use log entry if
 * `logIt`, and a review record. `result` is the runner's manifest; without one the source capture is unknown.
 */
export async function importRender(raw: string, result: RenderResult | null, fallback: { id: string | null; name: string; date: string }, logIt: boolean): Promise<RenderRecord> {
  // A Real Vancouver render shows Vista's OpenStreetMap buildings, so like every capture of them it carries the ODbL
  // credit (lib/credit.ts). The AI input was captured without it: the prompt forbids text in the image.
  const credit = (result?.job.project ?? useStore.getState().project) === 'city' ? sceneCredit() : null
  const dataUrl = credit ? await withCredit(raw, credit) : raw
  const { w, h } = await imageSize(dataUrl)
  const meta: AiMeta = {
    id: result?.id ?? fallback.id, model: result?.model ?? 'unknown model', tool: result?.tool ?? 'unknown tool',
    rendered: result?.rendered ?? fallback.date, sourceLabel: result?.job.capture.label ?? '',
    sourceShotId: result?.job.capture.shotId ?? null, prompt: result?.job.prompt ?? '',
  }
  const key = meta.id ?? `ai-${fallback.name.replace(/\W+/g, '-')}`
  const at = new Date().toISOString()
  const s = useStore.getState()
  s.addShot({ id: `ai-${key}-${at}`, dataUrl, stage: 'present', representation: 'clay', project: s.project, at, ai: meta })
  useBoardStore.getState().addImage({ id: `ai-${key}`, dataUrl, w, h, source: 'ai', label: `AI render from ${meta.sourceLabel || 'an unknown capture'}`, ai: meta })
  let provId: string | null = null
  if (logIt) {
    const c = useCultureStore.getState()
    c.addProv()
    provId = useCultureStore.getState().prov.at(-1)?.id ?? null
    if (provId) c.updateProv(provId, {
      element: `AI render ${key}`, kind: 'image', involvement: 'generative-edit', tool: `${meta.tool} + ${meta.model}`, toolGenerative: true,
      date: meta.rendered.slice(0, 10), humanContribution: 'Massing, camera and style chosen by the team in Tower Design Toolkit; the render is a restyle of that capture.',
      decidedBy: 'ai', licence: '', sourceIds: meta.sourceLabel,
    })
  }
  const record: RenderRecord = { id: key, imageId: `ai-${key}`, shotId: `ai-${key}-${at}`, meta, imported: at, checks: {}, status: 'review', provId, orphan: !result }
  useRenderStore.getState().addResult(record)
  return record
}

function withCredit(dataUrl: string, credit: string): Promise<string> {
  return new Promise((ok, fail) => {
    const img = new Image()
    img.onload = () => {
      const c = document.createElement('canvas')
      c.width = img.naturalWidth; c.height = img.naturalHeight
      c.getContext('2d')?.drawImage(img, 0, 0)
      ok(creditedDataUrl(c, credit))
    }
    img.onerror = () => fail(new Error('The render could not be read.'))
    img.src = dataUrl
  })
}

/** Accept (after every review check) or reject a render; a rejected render leaves the board library. */
export function decideRender(r: RenderRecord, status: 'accepted' | 'rejected'): void {
  useRenderStore.getState().updateResult(r.id, { status })
  const c = useCultureStore.getState()
  if (r.provId) c.updateProv(r.provId, { decidedBy: status === 'accepted' ? 'ai-proposed-person-accepted' : 'person', humanContribution: status === 'rejected' ? 'Rejected after review; not used on the boards.' : c.prov.find((e) => e.id === r.provId)?.humanContribution ?? '' })
  if (status === 'rejected') useBoardStore.getState().removeImage(r.imageId)
}

// ---------- local helper (render.plugin.ts) ----------
export type HelperStatus = { available: boolean; codex: string | null; folder?: string }
export type HelperJob = { id: string; state: 'queued' | 'running' | 'done' | 'failed'; seconds: number; log: string[]; result?: RenderResult }

// no-store: the offline service worker leaves these alone, and nothing is cached.
const call = (path: string, init?: RequestInit) => fetch(`./__render/${path}`, { cache: 'no-store', ...init })

/** Is the render helper running (the app served by `vite` or `vite preview` on this computer)? */
export async function helperStatus(): Promise<HelperStatus> {
  try {
    const r = await call('status')
    if (!r.ok || !(r.headers.get('content-type') ?? '').includes('json')) return { available: false, codex: null }
    const j = await r.json() as HelperStatus
    return { available: !!j.available, codex: j.codex ?? null, folder: j.folder }
  } catch { return { available: false, codex: null } }
}

/** Sends one prepared job to the helper, which renders it with the user's Codex CLI (the caller has asked the user). */
export async function sendToHelper(job: RenderJob, capture: Capture): Promise<string> {
  const r = await call('jobs', { method: 'POST', headers: { 'content-type': 'application/json', 'x-tower-render': '1' }, body: JSON.stringify({ job, png: capture.dataUrl }) })
  const j = await r.json().catch(() => ({})) as { id?: string; error?: string }
  if (!r.ok || !j.id) throw new Error(j.error ?? `The render helper answered ${r.status}.`)
  return j.id
}

export async function helperJob(id: string): Promise<HelperJob> {
  const r = await call(`jobs/${id}`)
  if (!r.ok) throw new Error(`The render helper answered ${r.status}.`)
  return r.json() as Promise<HelperJob>
}

/** The rendered image of a finished job, as a data URL, ready for importRender. */
export async function helperImage(result: RenderResult): Promise<string> {
  const r = await call(`outbox/${encodeURIComponent(result.image)}`)
  if (!r.ok) throw new Error('The rendered image could not be read.')
  const blob = await r.blob()
  return new Promise((ok, fail) => { const f = new FileReader(); f.onload = () => ok(String(f.result)); f.onerror = () => fail(f.error); f.readAsDataURL(blob) })
}

export { parseResult }
