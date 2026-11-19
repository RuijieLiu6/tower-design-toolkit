// Render tab (Present): frame → style → render → review, in one place (research P13-M05). On this computer the local
// helper (render.plugin.ts) runs the user's own Codex CLI and ChatGPT plan after asking; on the published site the
// capture and its prompt file are downloaded and rendered with tools/render.mjs, then imported. Every render is
// labelled AI-generated, linked to its capture, and needs the four review checks before it can be accepted.
import { Check, Copy, Download, FileUp, Loader2, Sparkles, Wand2, X } from './icons'
import { useEffect, useMemo, useRef, useState } from 'react'
import { STYLES, buildPrompt, fitSize, pairFiles, type StyleId } from '../engine/renderPrompt'
import {
  RENDER_COMMANDS, aiLabel, captureFor, clock, decideRender, downloadJob, helperImage, helperJob, helperStatus,
  importRender, jobFor, parseResult, programNote, recordJob, sendToHelper, type HelperJob, type HelperStatus,
} from '../lib/aiRender'
import { REVIEW_CHECKS, useRenderStore, type RenderRecord } from '../lib/renderStore'
import { useStore, useTowers } from '../store'
import { FlagChip } from './ui'
import { useShallow } from 'zustand/react/shallow'

const readFile = (f: File) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(r.error); r.readAsDataURL(f) })
/** Renders already being filed, so a poll that lands twice imports once. */
const importing = new Set<string>()

// Dark, like the Sheet, Style and Export tabs beside it (19 Nov, Sinnie: "update render tab to match style of other tabs").
const btnCls = 'flex w-full items-center justify-center gap-1.5 rounded-lg bg-sky-600 py-2 text-xs font-medium text-white hover:bg-sky-500 disabled:opacity-50'
const ghostCls = 'flex items-center gap-1 rounded-lg border border-white/15 px-2.5 py-1 text-meta text-slate-200 hover:border-sky-400'
function Step({ title, children }: { n?: number; title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-white/10 p-3">
      <h3 className="mb-2 text-meta font-semibold text-slate-400">{title}</h3>
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
          <span className="absolute left-1 top-1 rounded bg-black/60 px-1 text-meta text-white">Capture</span>
        </>
      )}
      <span className="absolute right-1 top-1 flex items-center gap-0.5 rounded bg-fuchsia-800/90 px-1 text-meta font-medium text-white"><Sparkles size={9} />AI-generated</span>
    </div>
  )
}

export default function RenderTab() {
  const towers = useTowers()
  const { project, shots } = useStore(useShallow((s) => ({ project: s.project, shots: s.shots })))
  const { style, notes, jobs, results, set, updateResult } = useRenderStore()
  const [helper, setHelper] = useState<HelperStatus | null>(null)
  // 18 Nov (Sinnie: "select captured view from model mode and prompting to render, remove 3d view in presentation
  // mode"): the source is always a view captured in Model mode; the latest one is picked until you choose another.
  const [picked, setSource] = useState<string | null>(null)
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null)
  const [showPrompt, setShowPrompt] = useState(false)
  const [logIt, setLogIt] = useState(true)
  const [running, setRunning] = useState<HelperJob | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const prog = useMemo(() => programNote(towers), [towers])
  const fields = { style, cameraNote: 'as in the attached image', programNote: prog, notes }
  const prompt = buildPrompt(fields)
  const size = fitSize(1.414)
  const captures = shots.filter((x) => !x.ai && x.project === project)
  const source = picked && captures.some((x) => x.id === picked) ? picked : captures[captures.length - 1]?.id ?? ''
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
    if (!source) { setMsg({ text: 'Capture a view in Model mode first (Capture in the top bar).', bad: true }); return null }
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
    <div className="text-xs text-slate-200">
      <div className="flex items-start gap-2 border-b border-white/10 px-3 py-2.5">
        <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${canRender ? 'bg-emerald-600' : helper?.available ? 'bg-amber-500' : 'bg-slate-500'}`} aria-hidden />
        <p className="text-meta leading-snug text-slate-300" role="status">
          {helper === null ? 'Checking for the render helper…'
            : canRender ? <>Renders on this computer with <b className="text-white">{helper.codex}</b> and your ChatGPT plan. Results come back here.</>
            : helper.available ? <>The render helper is running, but the <b className="text-white">Codex CLI</b> was not found. Install it (<code>npm i -g @openai/codex</code>), run <code>codex login</code>, then reload.</>
            : <>Online version: prepare the files here, render them with the script on your computer, then import the result.</>}
        </p>
      </div>

      <Step n={1} title="View">
        {captures.length === 0
          ? <p className="text-meta text-slate-400" data-testid="render-no-capture">Capture a view in Model mode (Capture in the top bar); it appears here.</p>
          : <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Image to render" data-testid="render-sources">
            {captures.slice(-12).reverse().map((x) => (
              <button key={x.id} type="button" role="radio" aria-checked={source === x.id} onClick={() => setSource(x.id)} title={`Captured at ${clock(x.at)} (${x.representation})`}
                className={`overflow-hidden rounded border ${source === x.id ? 'border-sky-400 ring-2 ring-sky-400/40' : 'border-white/15 hover:border-sky-400'}`}>
                <img src={x.dataUrl} alt={`Captured at ${clock(x.at)}`} className="aspect-[1.414] w-full object-cover" />
              </button>
            ))}
          </div>}
      </Step>

      <Step n={2} title="Style">
        <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="Render style">
          {(Object.keys(STYLES) as StyleId[]).map((k) => (
            <button key={k} type="button" role="radio" aria-checked={style === k} onClick={() => set({ style: k })}
              className={`rounded-lg border px-2 py-1.5 text-left text-xs ${style === k ? 'border-sky-400 bg-sky-500/15 text-white' : 'border-white/15 text-slate-300 hover:border-sky-400'}`}>{STYLES[k].label}</button>
          ))}
        </div>
        <label className="mt-2 flex flex-col gap-1"><span className="text-meta text-slate-400">Notes: season, people, planting, materials</span>
          <textarea value={notes} rows={2} onChange={(e) => set({ notes: e.target.value })} className="w-full min-w-0 rounded border border-white/15 bg-slate-900 px-2 py-1 text-xs text-slate-100 placeholder:text-slate-500" placeholder="e.g. people on the retail high street, cherry trees in bloom" />
        </label>
        {prompt.warnings.map((w) => <p key={w} className="mt-1 text-meta text-amber-300">{w}</p>)}
        <button type="button" onClick={() => setShowPrompt(!showPrompt)} className="mt-1 text-meta text-sky-300 hover:underline">{showPrompt ? 'Hide' : 'Show'} the full prompt</button>
        {showPrompt && <p className="mt-1 rounded bg-white/5 p-1.5 text-meta leading-snug text-slate-300">{prompt.text}</p>}
        <p className="mt-1 text-meta text-slate-400">Every prompt keeps fixed lines you can't remove: same massing, same camera, same sun; no text, logos, real people or imitation of Indigenous art.</p>
      </Step>

      <Step n={3} title="Render">
        {canRender ? (
          asking ? (
            <div className="rounded-lg border border-amber-400/40 bg-amber-500/10 p-2" role="alertdialog" aria-label="Confirm the render">
              <p className="text-meta leading-snug text-amber-100">The capture, an unpublished design, goes to OpenAI under your ChatGPT plan's terms and data settings, and uses your plan's image allowance. One render takes about one to three minutes.</p>
              <div className="mt-2 flex gap-1.5">
                <button type="button" onClick={render} className="flex items-center gap-1 rounded-lg bg-sky-600 px-2.5 py-1 text-meta font-medium text-white hover:bg-sky-500"><Wand2 size={12} />Render now</button>
                <button type="button" onClick={() => setAsking(false)} className="rounded-lg border border-white/15 px-2.5 py-1 text-meta text-slate-200">Cancel</button>
              </div>
            </div>
          ) : (
            <button type="button" disabled={busy || !!running || !source} onClick={() => setAsking(true)} className={btnCls}>
              <Wand2 size={13} />Render with my ChatGPT plan
            </button>
          )
        ) : (
          <>
            <button type="button" onClick={prepareFiles} disabled={!source} className={btnCls}><Download size={13} />Prepare the files</button>
            <ol className="mt-2 grid gap-1.5 text-meta text-slate-300">
              {RENDER_COMMANDS.map((c, i) => (
                <li key={c.cmd}>
                  <div className="flex items-start gap-1 rounded bg-white/5 p-1 font-mono"><span className="flex-1 break-all">{i + 1}. {c.cmd}</span>
                    <button type="button" aria-label="Copy command" onClick={() => navigator.clipboard?.writeText(c.cmd)} className="text-slate-400 hover:text-white"><Copy size={11} /></button></div>
                  <div className="mt-0.5 text-slate-400">{c.what}</div>
                </li>
              ))}
            </ol>
            <p className="mt-1 text-meta text-slate-400">Run them in a terminal in the ARCH540 AI Studio folder. The script asks before it uses your plan.</p>
          </>
        )}
        {running && (
          <div className="mt-2 flex items-start gap-2 rounded-lg border border-white/10 bg-white/5 p-2" role="status">
            <Loader2 size={14} className="mt-0.5 shrink-0 animate-spin text-sky-400" />
            <div className="min-w-0">
              <div className="text-meta font-medium">{running.state === 'queued' ? 'Waiting to start' : 'Rendering'} {running.id} · {Math.floor(running.seconds / 60)}:{String(running.seconds % 60).padStart(2, '0')}</div>
              {running.log.at(-1) && <div className="truncate text-meta text-slate-400">{running.log.at(-1)}</div>}
            </div>
          </div>
        )}
        {msg && <p className={`mt-2 text-meta ${msg.bad ? 'text-red-300' : 'text-emerald-300'}`} role={msg.bad ? 'alert' : 'status'}>{msg.text}</p>}
      </Step>

      <Step n={4} title="Review">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => fileRef.current?.click()} className={ghostCls}><FileUp size={12} />Import results</button>
          <input ref={fileRef} type="file" multiple accept="image/png,image/jpeg,image/webp,application/json,.json" className="hidden" onChange={async (e) => { if (e.target.files) await importFiles(e.target.files); e.target.value = '' }} />
          <label className="flex items-center gap-1 text-meta"><input type="checkbox" className="accent-sky-500" checked={logIt} onChange={() => setLogIt(!logIt)} />Add to the AI-use log</label>
        </div>
        {!reviewList.length && <p className="text-meta text-slate-400">No renders yet. Each one joins the shot strip and the board library, always labelled AI-generated.</p>}
        <div className="grid gap-3">
          {reviewList.map((r: RenderRecord) => {
            const done = REVIEW_CHECKS.every((c) => r.checks[c.id])
            const after = shotUrl(r.shotId)
            return (
              <article key={r.id} className={`rounded-lg border p-2 ${r.status === 'rejected' ? 'border-white/10 opacity-60' : r.status === 'accepted' ? 'border-emerald-400/50' : 'border-fuchsia-400/50'}`}>
                {after && <Compare before={shotUrl(r.meta.sourceShotId)} after={after} />}
                <div className="mt-1.5 flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1 text-meta font-semibold text-fuchsia-300"><Sparkles size={12} />{aiLabel(r.meta)}</span>
                  <span className="text-meta text-slate-400">{r.status === 'review' ? 'to review' : r.status}</span>
                </div>
                <div className="mt-0.5 text-meta text-slate-400">{r.meta.model} via {r.meta.tool} · {r.meta.rendered.slice(0, 16).replace('T', ' ')}{r.orphan ? ' · no manifest: source capture unknown' : r.meta.sourceShotId && !shots.some((x) => x.id === r.meta.sourceShotId) ? ' · source shot not in this session' : ''}</div>
                {r.status === 'review' && (
                  <>
                    <div className="mt-1.5 grid gap-1">
                      {REVIEW_CHECKS.map((c) => (
                        <label key={c.id} className="flex items-start gap-1.5 text-meta"><input type="checkbox" className="mt-0.5 accent-sky-500" checked={!!r.checks[c.id]} onChange={() => updateResult(r.id, { checks: { ...r.checks, [c.id]: !r.checks[c.id] } })} />{c.label}</label>
                      ))}
                    </div>
                    <div className="mt-1.5 flex gap-1.5">
                      <button type="button" disabled={!done} onClick={() => decideRender(r, 'accepted')} className="flex items-center gap-1 rounded-lg bg-sky-600 px-2 py-1 text-meta text-white hover:bg-sky-500 disabled:opacity-40" title={done ? '' : 'Tick every check first'}><Check size={12} />Accept</button>
                      <button type="button" onClick={() => decideRender(r, 'rejected')} className="flex items-center gap-1 rounded-lg border border-white/15 px-2 py-1 text-meta text-slate-200 hover:border-red-400"><X size={12} />Reject</button>
                    </div>
                  </>
                )}
              </article>
            )
          })}
        </div>
        <div className="mt-2 flex items-center gap-1"><FlagChip flag="team_assumption" /><span className="text-meta text-slate-400">Review checks and the always-on AI label are team rules (research P13-M05).</span></div>
      </Step>
    </div>
  )
}
