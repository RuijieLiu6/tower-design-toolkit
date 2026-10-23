// AI render workflow in Present (research P13-M05): prepare a capture and its prompt file, run the local script
// (tools/render.mjs, the user's own Codex CLI and ChatGPT plan), then import the result, review it and accept or
// reject it. Every imported render is labelled AI-generated in the shot strip and on the boards, linked to its capture.
import { Check, Copy, Download, FileUp, Sparkles, X } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { STYLES, aiLabel, buildPrompt, checkSize, fitSize, makeJob, pairFiles, parseResult, renderId, type AiMeta, type StyleId } from '../engine/renderPrompt'
import { USES } from '../engine/types'
import { imageSize } from '../lib/boardRender'
import { useBoardStore } from '../lib/boardStore'
import { useCultureStore } from '../lib/cultureStore'
import { captureHiRes } from '../lib/hiresCapture'
import { REVIEW_CHECKS, useRenderStore, type RenderRecord } from '../lib/renderStore'
import { useStore, useTowers } from '../store'
import { FlagChip, Section } from './ui'

const SCRIPT = 'node "tower-studio/tools/render.mjs"'
const COMMANDS = [
  { cmd: `${SCRIPT} --collect`, what: 'copies prepared files from your Downloads folder into 04 Tool Plan/renders/inbox' },
  { cmd: `${SCRIPT} --dry-run`, what: 'shows what would run; uses nothing' },
  { cmd: SCRIPT, what: 'renders each inbox item with your Codex CLI and ChatGPT plan; asks first' },
]

function download(href: string, name: string) { const a = document.createElement('a'); a.href = href; a.download = name; a.click() }
const readFile = (f: File) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(r.error); r.readAsDataURL(f) })
const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

/** Plain-words camera note from the last camera preset (direction relative to true north, lens). */
function cameraNote(req: { position: number[]; target: number[]; fov?: number } | null, northDeg: number): string {
  if (!req) return 'the current view'
  const dx = req.position[0] - req.target[0], dy = req.position[1] - req.target[1], dz = req.position[2] - req.target[2]
  const az = ((Math.atan2(dx, dy) * 180) / Math.PI - northDeg + 720) % 360
  const dir = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'][Math.round(az / 45) % 8]
  const dist = Math.hypot(dx, dy), elev = (Math.atan2(dz, dist) * 180) / Math.PI
  const kind = req.position[2] < 3 ? 'eye level from the street' : elev > 25 ? 'aerial' : 'distant'
  return `${kind}, looking from the ${dir}, ${Math.round(req.fov ?? 38)}° lens`
}

export default function AiRenderSection() {
  const towers = useTowers()
  const { project, shots, cameraRequest, presentRep } = useStore()
  const { style, notes, jobs, results, set, addJob, addResult, updateResult } = useRenderStore()
  const [source, setSource] = useState<string>('view')
  const [msg, setMsg] = useState('')
  const [showPrompt, setShowPrompt] = useState(false)
  const [logIt, setLogIt] = useState(true)
  const fileRef = useRef<HTMLInputElement>(null)
  const north = project === 'vtc' ? 45 : 0
  const programNote = useMemo(() => {
    const t = towers[0]
    if (!t) return ''
    const uses = [...new Set(t.bands.filter((b) => b.share > 0).map((b) => USES[b.use].label.toLowerCase()))]
    return `${uses.join(', ')}${t.podiumHeight > 0 ? ` over a ${USES[t.podiumUse].label.toLowerCase()} podium` : ''}`
  }, [towers])
  const fields = { style, cameraNote: source === 'view' ? cameraNote(cameraRequest, north) : 'as in the attached image', programNote, notes }
  const prompt = buildPrompt(fields)
  const size = fitSize(1.414)
  const sizeCheck = checkSize(size.w, size.h)

  const prepare = async () => {
    setMsg('')
    const s = useStore.getState()
    let dataUrl: string | null = null, label = '', shotId: string | null = null
    if (source === 'view') {
      if (s.boardView !== '3d') { s.set({ boardView: '3d' }); await new Promise((r) => setTimeout(r, 400)) }
      dataUrl = captureHiRes(size.w)
      if (!dataUrl) { setMsg('The 3D view is not showing: switch the main view to 3D and try again.'); return }
      const at = new Date().toISOString()
      s.addShot({ id: at, dataUrl, stage: s.phase, representation: s.presentRep, project: s.project, at })
      shotId = at; label = `${presentRep === 'xray' ? 'X-ray' : 'Clay'} view at ${time(at)}`
    } else {
      const shot = shots.find((x) => x.id === source)
      if (!shot) { setMsg('Pick a shot.'); return }
      if (shot.ai) { setMsg('That shot is already an AI render. Prepare from a capture instead.'); return }
      dataUrl = shot.dataUrl; shotId = shot.id; label = `${shot.representation === 'xray' ? 'X-ray' : shot.representation === 'plan' ? 'Plan' : 'Clay'} view at ${time(shot.at)}`
    }
    const { w, h } = await imageSize(dataUrl)
    const now = new Date(), id = renderId(now)
    const job = makeJob(id, now.toISOString(), { file: `${id}.png`, label, shotId, width: w, height: h }, fields, s.project, size)
    download(dataUrl, `${id}.png`)
    const url = URL.createObjectURL(new Blob([JSON.stringify(job, null, 2)], { type: 'application/json' }))
    setTimeout(() => { download(url, `${id}.json`); setTimeout(() => URL.revokeObjectURL(url), 4000) }, 300)
    addJob({ id, created: job.created, style, cameraNote: job.cameraNote })
    setMsg(`Saved ${id}.png and ${id}.json to your Downloads folder.`)
  }

  const importResults = async (files: FileList) => {
    const list = [...files]
    const pairs = pairFiles(list.map((f) => f.name))
    if (!pairs.length) { setMsg('Pick the render images (and their .ai.json files) from renders/outbox.'); return }
    for (const p of pairs) {
      const img = list.find((f) => f.name === p.image)!
      const man = p.manifest ? list.find((f) => f.name === p.manifest) : undefined
      const result = man ? parseResult(await man.text()) : null
      const dataUrl = await readFile(img)
      const { w, h } = await imageSize(dataUrl)
      const meta: AiMeta = {
        id: result?.id ?? p.id, model: result?.model ?? 'unknown model', tool: result?.tool ?? 'unknown tool',
        rendered: result?.rendered ?? new Date(img.lastModified).toISOString(), sourceLabel: result?.job.capture.label ?? '',
        sourceShotId: result?.job.capture.shotId ?? null, prompt: result?.job.prompt ?? '',
      }
      const key = meta.id ?? `ai-${img.name.replace(/\W+/g, '-')}`
      const at = new Date().toISOString()
      useStore.getState().addShot({ id: `ai-${key}-${at}`, dataUrl, stage: 'present', representation: 'clay', project, at, ai: meta })
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
      addResult({ id: key, imageId: `ai-${key}`, shotId: `ai-${key}-${at}`, meta, imported: at, checks: {}, status: 'review', provId, orphan: !result })
    }
    setMsg(`Imported ${pairs.length} render${pairs.length > 1 ? 's' : ''}: review each one below before using it.`)
  }

  const decide = (r: RenderRecord, status: 'accepted' | 'rejected') => {
    updateResult(r.id, { status })
    if (r.provId) useCultureStore.getState().updateProv(r.provId, { decidedBy: status === 'accepted' ? 'ai-proposed-person-accepted' : 'person', humanContribution: status === 'rejected' ? 'Rejected after review; not used on the boards.' : useCultureStore.getState().prov.find((e) => e.id === r.provId)?.humanContribution ?? '' })
    if (status === 'rejected') useBoardStore.getState().removeImage(r.imageId)
  }

  const waiting = jobs.filter((j) => !results.some((r) => r.id === j.id))
  return (
    <Section title="AI render (your ChatGPT plan, via Codex)">
      <div className="grid gap-2">
        <label className="flex flex-col gap-1 text-xs"><span className="text-muted">Start from</span>
          <select value={source} onChange={(e) => setSource(e.target.value)} className="rounded border border-line bg-panel px-1.5 py-1 text-xs" aria-label="Capture to render">
            <option value="view">The current view, at {size.w} × {size.h} px</option>
            {shots.filter((x) => !x.ai).map((x) => <option key={x.id} value={x.id}>Shot at {time(x.at)} ({x.representation})</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs"><span className="text-muted">Style</span>
          <select value={style} onChange={(e) => set({ style: e.target.value as StyleId })} className="rounded border border-line bg-panel px-1.5 py-1 text-xs" aria-label="Render style">
            {(Object.keys(STYLES) as StyleId[]).map((k) => <option key={k} value={k}>{STYLES[k].label}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs"><span className="text-muted">Notes (season, entourage, materials)</span>
          <textarea value={notes} rows={2} onChange={(e) => set({ notes: e.target.value })} className="rounded border border-line bg-panel px-1.5 py-1 text-xs" placeholder="e.g. people on the retail high street, cherry trees in bloom" />
        </label>
        {prompt.warnings.map((w) => <p key={w} className="text-[11px] text-amber-700">{w}</p>)}
        <button type="button" onClick={() => setShowPrompt(!showPrompt)} className="w-fit text-[11px] text-accent hover:underline">{showPrompt ? 'Hide' : 'Show'} the prompt</button>
        {showPrompt && <p className="rounded bg-black/[0.04] p-1.5 text-[10px] leading-snug text-slate-700">{prompt.text}</p>}
        <p className="text-[10px] text-muted">Size {size.w} × {size.h} px: {sizeCheck.ok ? 'meets' : 'breaks'} the image model's size rules{sizeCheck.experimental ? ' (experimental above 2560 × 1440)' : ''}. Fixed lines in every prompt: same massing, same camera, label nothing; no text, logos, real people or imitation of Indigenous art.</p>
        <button type="button" onClick={prepare} className="flex w-fit items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"><Download size={13} />Prepare AI render</button>
        {msg && <p className="text-[11px] text-emerald-700">{msg}</p>}
      </div>

      <div className="mt-3 rounded-md border border-line p-2">
        <div className="text-[11px] font-semibold">Then, in a terminal in the ARCH540 AI Studio folder</div>
        <ol className="mt-1 grid gap-1.5 text-[10px] text-slate-700">
          {COMMANDS.map((c, i) => (
            <li key={c.cmd}>
              <div className="flex items-start gap-1 rounded bg-black/[0.04] p-1 font-mono"><span className="flex-1 break-all">{i + 1}. {c.cmd}</span>
                <button type="button" aria-label="Copy command" onClick={() => navigator.clipboard?.writeText(c.cmd)} className="text-muted hover:text-ink"><Copy size={11} /></button></div>
              <div className="mt-0.5 text-muted">{c.what}</div>
            </li>
          ))}
        </ol>
        <p className="mt-1.5 text-[10px] text-muted">The images go to OpenAI under your ChatGPT plan's terms; unpublished designs leave this computer. The script never runs without asking.</p>
        {waiting.length > 0 && <p className="mt-1 text-[10px] text-slate-700">Waiting for results: {waiting.slice(0, 4).map((j) => j.id).join(', ')}{waiting.length > 4 ? ` and ${waiting.length - 4} more` : ''}</p>}
      </div>

      <div className="mt-3 grid gap-2">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => fileRef.current?.click()} className="flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-xs hover:border-accent"><FileUp size={13} />Import AI results</button>
          <input ref={fileRef} type="file" multiple accept="image/png,image/jpeg,image/webp,application/json,.json" className="hidden" onChange={async (e) => { if (e.target.files) await importResults(e.target.files); e.target.value = '' }} />
          <label className="flex items-center gap-1 text-[11px]"><input type="checkbox" checked={logIt} onChange={() => setLogIt(!logIt)} />Add to the AI-use log</label>
        </div>
        <p className="text-[10px] text-muted">Pick the .ai.png and .ai.json files from 04 Tool Plan/renders/outbox. Each render joins the shot strip and the boards, always labelled AI-generated.</p>
        {results.map((r) => {
          const done = REVIEW_CHECKS.every((c) => r.checks[c.id])
          return (
            <div key={r.id} className={`rounded-md border p-2 ${r.status === 'rejected' ? 'border-line opacity-60' : 'border-fuchsia-300'}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1 text-[11px] font-semibold text-fuchsia-800"><Sparkles size={12} />{aiLabel(r.meta)}</span>
                <span className="text-[10px] text-muted">{r.status === 'review' ? 'to review' : r.status}</span>
              </div>
              <div className="mt-0.5 text-[10px] text-muted">{r.meta.model} via {r.meta.tool} · {r.meta.rendered.slice(0, 16).replace('T', ' ')}{r.orphan ? ' · no manifest: source capture unknown' : r.meta.sourceShotId && !shots.some((x) => x.id === r.meta.sourceShotId) ? ' · source shot not in this session' : ''}</div>
              {r.status === 'review' && (
                <>
                  <div className="mt-1.5 grid gap-1">
                    {REVIEW_CHECKS.map((c) => (
                      <label key={c.id} className="flex items-start gap-1.5 text-[11px]"><input type="checkbox" className="mt-0.5" checked={!!r.checks[c.id]} onChange={() => updateResult(r.id, { checks: { ...r.checks, [c.id]: !r.checks[c.id] } })} />{c.label}</label>
                    ))}
                  </div>
                  <div className="mt-1.5 flex gap-1.5">
                    <button type="button" disabled={!done} onClick={() => decide(r, 'accepted')} className="flex items-center gap-1 rounded bg-accent px-2 py-1 text-[11px] text-white disabled:opacity-40" title={done ? '' : 'Tick every check first'}><Check size={12} />Accept</button>
                    <button type="button" onClick={() => decide(r, 'rejected')} className="flex items-center gap-1 rounded border border-line px-2 py-1 text-[11px] hover:border-red-400"><X size={12} />Reject</button>
                  </div>
                </>
              )}
            </div>
          )
        })}
        <div className="flex items-center gap-1"><FlagChip flag="team_assumption" /><span className="text-[10px] text-muted">Review checks and the always-on AI label are team rules (research P13-M05); Buildner's terms as read have no AI rule.</span></div>
      </div>
    </Section>
  )
}
