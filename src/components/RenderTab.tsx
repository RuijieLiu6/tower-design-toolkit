// Render tab (Present): frame → style → render → review, in one place (research P13-M05). On this computer the local
// helper (render.plugin.ts) runs the user's own Codex CLI and ChatGPT plan after asking; on the published site the
// capture and its prompt file are downloaded and rendered with tools/render.mjs, then imported. Every render is
// labelled AI-generated, linked to its capture, and needs the four review checks before it can be accepted.
import { Camera, Check, Copy, Download, FileUp, Loader2, Sparkles, Wand2, X } from './icons'
import { useEffect, useMemo, useRef, useState } from 'react'
import { STYLES, buildPrompt, checkSize, fitSize, pairFiles, type StyleId } from '../engine/renderPrompt'
import {
  RENDER_COMMANDS, aiLabel, cameraNote, captureFor, clock, decideRender, downloadJob, helperImage, helperJob, helperStatus,
  importRender, jobFor, parseResult, programNote, recordJob, sendToHelper, type HelperJob, type HelperStatus,
} from '../lib/aiRender'
import { REVIEW_CHECKS, useRenderStore, type RenderRecord } from '../lib/renderStore'
import { useStore, useTowers } from '../store'
import { FlagChip } from './ui'
import { useShallow } from 'zustand/react/shallow'

const readFile = (f: File) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(r.error); r.readAsDataURL(f) })
/** Renders already being filed, so a poll that lands twice imports once. */
const importing = new Set<string>()

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-line px-3 py-3">
      <h3 className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-ink text-[10px] text-white">{n}</span>{title}
      </h3>
      {children}
    </section>
  )
}

/** The render over its capture, with a slider to compare them. */
function Compare({ before, after }: { before: string | null; after: string }) {
  const [x, setX] = useState(50)
  return (
    <div className="relative overflow-hidden rounded border border-line bg-black/5">
      <img src={after} alt="AI-generated render" className="block w-full" />
      {before && (
        <>
          <img src={before} alt="The capture it was made from" className="absolute inset-0 h-full w-full object-cover" style={{ clipPath: `inset(0 ${100 - x}% 0 0)` }} />
          <div className="pointer-events-none absolute inset-y-0 w-px bg-white shadow" style={{ left: `${x}%` }} />
          <input type="range" min={0} max={100} value={x} onChange={(e) => setX(Number(e.target.value))} aria-label="Slide between the capture and the render" className="absolute inset-x-2 bottom-1.5" />
          <span className="absolute left-1 top-1 rounded bg-black/60 px-1 text-[9px] text-white">Capture</span>
        </>
      )}
      <span className="absolute right-1 top-1 flex items-center gap-0.5 rounded bg-fuchsia-800/90 px-1 text-[9px] font-medium text-white"><Sparkles size={9} />AI-generated</span>
    </div>
  )
}

export default function RenderTab() {
  const towers = useTowers()
  const { project, shots, cameraRequest } = useStore(useShallow((s) => ({ project: s.project, shots: s.shots, cameraRequest: s.cameraRequest })))
  const { style, notes, jobs, results, set, updateResult } = useRenderStore()
  const [helper, setHelper] = useState<HelperStatus | null>(null)
  const [source, setSource] = useState<string>('view')
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null)
  const [showPrompt, setShowPrompt] = useState(false)
  const [logIt, setLogIt] = useState(true)
  const [running, setRunning] = useState<HelperJob | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const north = project === 'vtc' ? 45 : 0
  const prog = useMemo(() => programNote(towers), [towers])
  const fields = { style, cameraNote: source === 'view' ? cameraNote(cameraRequest, north) : 'as in the attached image', programNote: prog, notes }
  const prompt = buildPrompt(fields)
  const size = fitSize(1.414)
  const sizeCheck = checkSize(size.w, size.h)
  const captures = shots.filter((x) => !x.ai && x.project === project)
  const canRender = !!helper?.available && !!helper.codex

  useEffect(() => { let live = true; helperStatus().then((h) => { if (live) setHelper(h) }); return () => { live = false } }, [])

  // Follow renders sent to the helper (also ones sent before this tab was last open) and file each one when it is done.
  const waiting = jobs.filter((j) => !results.some((r) => r.id === j.id) && Date.now() - Date.parse(j.created) < 3 * 3600_000)
  const waitingKey = waiting.map((j) => j.id).join()
  useEffect(() => {
    if (!helper?.available || !waiting.length) return
    let live = true
    const poll = async () => {
      for (const j of waiting) {
        const st = await helperJob(j.id).catch(() => null)
        if (!live || !st) continue
        if (st.state === 'queued' || st.state === 'running') { setRunning(st); continue }
        setRunning((r) => (r?.id === st.id ? null : r))
        if (st.state === 'failed') { setMsg({ text: `The render ${st.id} failed. ${st.log.at(-1) ?? ''}`, bad: true }); continue }
        if (st.result && !importing.has(st.id)) {
          importing.add(st.id)
          try {
            const dataUrl = await helperImage(st.result)
            await importRender(dataUrl, st.result, { id: st.id, name: st.result.image, date: st.result.rendered }, logIt)
            setMsg({ text: `Render ${st.id} is back after ${st.seconds} s. Review it below before you use it.` })
          } catch (e) { importing.delete(st.id); setMsg({ text: String((e as Error).message ?? e), bad: true }) }
        }
      }
    }
    void poll()
    const t = setInterval(poll, 2000)
    return () => { live = false; clearInterval(t) }
  }, [helper?.available, waitingKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const prepare = async () => {
    setMsg(null)
    const cap = await captureFor(source, size.w)
    if (typeof cap === 'string') { setMsg({ text: cap, bad: true }); return null }
    return { cap, job: jobFor(cap, fields, size) }
  }

  const render = async () => {
    setAsking(false); setBusy(true)
    try {
      const p = await prepare()
      if (!p) return
      await sendToHelper(p.job, p.cap)
      recordJob(p.job) // only now: the tab starts following it, and the helper knows it
      setRunning({ id: p.job.id, state: 'queued', seconds: 0, log: [] })
      setMsg({ text: `Sent ${p.job.id} to your Codex CLI. A render usually takes one to three minutes; you can keep working.` })
    } catch (e) { setMsg({ text: String((e as Error).message ?? e), bad: true }) } finally { setBusy(false) }
  }

  const prepareFiles = async () => {
    const p = await prepare()
    if (!p) return
    downloadJob(p.job, p.cap)
    recordJob(p.job)
    setMsg({ text: `Saved ${p.job.id}.png and ${p.job.id}.json to your Downloads folder. Run the commands below, then import the result.` })
  }

  const importFiles = async (files: FileList) => {
    const list = [...files]
    const pairs = pairFiles(list.map((f) => f.name))
    if (!pairs.length) { setMsg({ text: 'Pick the render images (and their .ai.json files) from renders/outbox.', bad: true }); return }
    for (const p of pairs) {
      const img = list.find((f) => f.name === p.image)!
      const man = p.manifest ? list.find((f) => f.name === p.manifest) : undefined
      const result = man ? parseResult(await man.text()) : null
      await importRender(await readFile(img), result, { id: p.id, name: img.name, date: new Date(img.lastModified).toISOString() }, logIt)
    }
    setMsg({ text: `Imported ${pairs.length} render${pairs.length > 1 ? 's' : ''}: review each one below before using it.` })
  }

  const shotUrl = (id: string | null) => (id ? shots.find((x) => x.id === id)?.dataUrl ?? null : null)
  const reviewList = results // rejected renders stay listed (faded), so the record of AI use is complete

  return (
    <div className="text-xs">
      <div className="flex items-start gap-2 border-b border-line px-3 py-2.5">
        <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${canRender ? 'bg-emerald-600' : helper?.available ? 'bg-amber-500' : 'bg-slate-400'}`} aria-hidden />
        <p className="text-[11px] leading-snug text-slate-700" role="status">
          {helper === null ? 'Checking for the render helper…'
            : canRender ? <>Renders on this computer with <b className="text-ink">{helper.codex}</b> and your ChatGPT plan. Results come back here.</>
            : helper.available ? <>The render helper is running, but the <b className="text-ink">Codex CLI</b> was not found. Install it (<code>npm i -g @openai/codex</code>), run <code>codex login</code>, then reload.</>
            : <>Online version: prepare the files here, render them with the script on your computer, then import the result.</>}
        </p>
      </div>

      <Step n={1} title="Frame">
        <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Image to render">
          <button type="button" role="radio" aria-checked={source === 'view'} onClick={() => setSource('view')}
            className={`flex aspect-[1.414] flex-col items-center justify-center gap-1 rounded border text-[10px] ${source === 'view' ? 'border-accent bg-accent/10 text-ink' : 'border-line text-muted hover:border-accent'}`}>
            <Camera size={14} />Current view
          </button>
          {captures.slice(-8).reverse().map((x) => (
            <button key={x.id} type="button" role="radio" aria-checked={source === x.id} onClick={() => setSource(x.id)} title={`Shot at ${clock(x.at)} (${x.representation})`}
              className={`overflow-hidden rounded border ${source === x.id ? 'border-accent ring-2 ring-accent/30' : 'border-line hover:border-accent'}`}>
              <img src={x.dataUrl} alt={`Shot at ${clock(x.at)}`} className="aspect-[1.414] w-full object-cover" />
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-[10px] text-muted">{source === 'view' ? `The view is captured at ${size.w} × ${size.h} px (${sizeCheck.ok ? 'within' : 'outside'} the image model's size rules) and filed in the shot strip.` : 'A shot from the strip, sent as it is.'}</p>
      </Step>

      <Step n={2} title="Style">
        <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Render style">
          {(Object.keys(STYLES) as StyleId[]).map((k) => (
            <button key={k} type="button" role="radio" aria-checked={style === k} onClick={() => set({ style: k })}
              className={`rounded-full border px-2 py-0.5 text-[11px] ${style === k ? 'border-accent bg-accent/10 font-medium text-ink' : 'border-line text-muted hover:border-accent'}`}>{STYLES[k].label}</button>
          ))}
        </div>
        <label className="mt-2 flex flex-col gap-1"><span className="text-[11px] text-muted">Notes: season, people, planting, materials</span>
          <textarea value={notes} rows={2} onChange={(e) => set({ notes: e.target.value })} className="rounded border border-line bg-panel px-1.5 py-1 text-xs" placeholder="e.g. people on the retail high street, cherry trees in bloom" />
        </label>
        {prompt.warnings.map((w) => <p key={w} className="mt-1 text-[11px] text-amber-700">{w}</p>)}
        <button type="button" onClick={() => setShowPrompt(!showPrompt)} className="mt-1 text-[11px] text-accent hover:underline">{showPrompt ? 'Hide' : 'Show'} the full prompt</button>
        {showPrompt && <p className="mt-1 rounded bg-black/[0.04] p-1.5 text-[10px] leading-snug text-slate-700">{prompt.text}</p>}
        <p className="mt-1 text-[10px] text-muted">Every prompt keeps fixed lines you can't remove: same massing, same camera, same sun; no text, logos, real people or imitation of Indigenous art.</p>
      </Step>

      <Step n={3} title="Render">
        {canRender ? (
          asking ? (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-2" role="alertdialog" aria-label="Confirm the render">
              <p className="text-[11px] leading-snug text-amber-950">The capture, an unpublished design, goes to OpenAI under your ChatGPT plan's terms and data settings, and uses your plan's image allowance. One render takes about one to three minutes.</p>
              <div className="mt-2 flex gap-1.5">
                <button type="button" onClick={render} className="flex items-center gap-1 rounded bg-accent px-2.5 py-1 text-[11px] font-medium text-white"><Wand2 size={12} />Render now</button>
                <button type="button" onClick={() => setAsking(false)} className="rounded border border-line px-2.5 py-1 text-[11px]">Cancel</button>
              </div>
            </div>
          ) : (
            <button type="button" disabled={busy || !!running} onClick={() => setAsking(true)} className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50">
              <Wand2 size={13} />Render with my ChatGPT plan
            </button>
          )
        ) : (
          <>
            <button type="button" onClick={prepareFiles} className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"><Download size={13} />Prepare the files</button>
            <ol className="mt-2 grid gap-1.5 text-[10px] text-slate-700">
              {RENDER_COMMANDS.map((c, i) => (
                <li key={c.cmd}>
                  <div className="flex items-start gap-1 rounded bg-black/[0.04] p-1 font-mono"><span className="flex-1 break-all">{i + 1}. {c.cmd}</span>
                    <button type="button" aria-label="Copy command" onClick={() => navigator.clipboard?.writeText(c.cmd)} className="text-muted hover:text-ink"><Copy size={11} /></button></div>
                  <div className="mt-0.5 text-muted">{c.what}</div>
                </li>
              ))}
            </ol>
            <p className="mt-1 text-[10px] text-muted">Run them in a terminal in the ARCH540 AI Studio folder. The script asks before it uses your plan.</p>
          </>
        )}
        {running && (
          <div className="mt-2 flex items-start gap-2 rounded-md border border-line bg-white p-2" role="status">
            <Loader2 size={14} className="mt-0.5 shrink-0 animate-spin text-accent" />
            <div className="min-w-0">
              <div className="text-[11px] font-medium">{running.state === 'queued' ? 'Waiting to start' : 'Rendering'} {running.id} · {Math.floor(running.seconds / 60)}:{String(running.seconds % 60).padStart(2, '0')}</div>
              {running.log.at(-1) && <div className="truncate text-[10px] text-muted">{running.log.at(-1)}</div>}
            </div>
          </div>
        )}
        {msg && <p className={`mt-2 text-[11px] ${msg.bad ? 'text-red-700' : 'text-emerald-700'}`} role={msg.bad ? 'alert' : 'status'}>{msg.text}</p>}
      </Step>

      <Step n={4} title="Review">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => fileRef.current?.click()} className="flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1 text-[11px] hover:border-accent"><FileUp size={12} />Import results</button>
          <input ref={fileRef} type="file" multiple accept="image/png,image/jpeg,image/webp,application/json,.json" className="hidden" onChange={async (e) => { if (e.target.files) await importFiles(e.target.files); e.target.value = '' }} />
          <label className="flex items-center gap-1 text-[11px]"><input type="checkbox" checked={logIt} onChange={() => setLogIt(!logIt)} />Add to the AI-use log</label>
        </div>
        {!reviewList.length && <p className="text-[11px] text-muted">No renders yet. Each one joins the shot strip and the board library, always labelled AI-generated.</p>}
        <div className="grid gap-3">
          {reviewList.map((r: RenderRecord) => {
            const done = REVIEW_CHECKS.every((c) => r.checks[c.id])
            const after = shotUrl(r.shotId)
            return (
              <article key={r.id} className={`rounded-md border p-2 ${r.status === 'rejected' ? 'border-line opacity-60' : r.status === 'accepted' ? 'border-emerald-300' : 'border-fuchsia-300'}`}>
                {after && <Compare before={shotUrl(r.meta.sourceShotId)} after={after} />}
                <div className="mt-1.5 flex items-center justify-between gap-2">
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
                      <button type="button" disabled={!done} onClick={() => decideRender(r, 'accepted')} className="flex items-center gap-1 rounded bg-accent px-2 py-1 text-[11px] text-white disabled:opacity-40" title={done ? '' : 'Tick every check first'}><Check size={12} />Accept</button>
                      <button type="button" onClick={() => decideRender(r, 'rejected')} className="flex items-center gap-1 rounded border border-line px-2 py-1 text-[11px] hover:border-red-400"><X size={12} />Reject</button>
                    </div>
                  </>
                )}
              </article>
            )
          })}
        </div>
        <div className="mt-2 flex items-center gap-1"><FlagChip flag="team_assumption" /><span className="text-[10px] text-muted">Review checks and the always-on AI label are team rules (research P13-M05).</span></div>
      </Step>
    </div>
  )
}
