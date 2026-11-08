// Board composer (research P13-M06a, thin form): four A2 landscape boards in templates; drop shots, renders and vector
// floor plans into frames, write titles and text, add evidence frames from the checks, tag each frame with the brief's
// deliverable it shows. Checks and export are in SubmissionPanel.
import { Camera, FileImage, ImagePlus, LayoutPanelTop, ListChecks, Sparkles, Trash2, X } from '../icons'
import { useEffect, useRef, useState, type DragEvent } from 'react'
import { createPortal } from 'react-dom'
import { A2_RATIO, BOARD_H, BOARD_W, DELIVERABLES, SOURCE_LABEL, TEMPLATES, imageSource, type Board, type BoardImage, type DeliverableId, type Frame, type ImageSource, type TemplateId } from '../../engine/boards'
import { drawBoard, imageSize, type EvidenceSet } from '../../lib/boardRender'
import { hydrateBoardImages, useBoardStore } from '../../lib/boardStore'
import { planSvgText } from '../../lib/capture'
import { captureHiRes } from '../../lib/hiresCapture'
import { useStore, type Shot } from '../../store'
import SubmissionPanel from './SubmissionPanel'
import { useEvidence, useLoadedImages, useOverflow } from './useBoardData'

const DRAG = 'application/x-board-image'
const AI_NAME = /render|gpt|dall|midjourney|firefly|imagen|stable.?diffusion|\bai\b/i

function readFile(file: File): Promise<string> {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(r.error); r.readAsDataURL(file) })
}

/** Bring an image into the board library: a shot, a file or the vector plan. Returns its id. */
async function importShot(shot: Shot): Promise<string> {
  const id = `shot-${shot.id}`
  const s = useBoardStore.getState()
  if (s.images[id]) return id
  const { w, h } = await imageSize(shot.dataUrl)
  const kind = shot.representation === 'plan' ? 'Floor plan' : shot.representation === 'xray' ? 'X-ray view' : 'Clay view'
  const time = new Date(shot.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  // An AI render keeps its metadata, so it stays labelled AI-generated on every board (label rule).
  if (shot.ai) s.addImage({ id, dataUrl: shot.dataUrl, w, h, source: 'ai', label: `AI render from ${shot.ai.sourceLabel || 'an unknown capture'}`, ai: shot.ai })
  else s.addImage({ id, dataUrl: shot.dataUrl, w, h, source: 'capture', label: `${kind}, ${time}` })
  return id
}
async function importFiles(files: FileList | File[]): Promise<string[]> {
  const ids: string[] = []
  for (const [i, f] of [...files].entries()) {
    if (!f.type.startsWith('image/')) continue
    const dataUrl = await readFile(f)
    const { w, h } = await imageSize(dataUrl)
    const id = `file-${Date.now()}-${i}`
    useBoardStore.getState().addImage({ id, dataUrl, w, h, source: AI_NAME.test(f.name) ? 'ai' : 'own', label: f.name, vector: f.type === 'image/svg+xml' })
    ids.push(id)
  }
  return ids
}

function BoardCanvas({ index, evidence, onFrame }: { index: number; evidence: Record<string, EvidenceSet>; onFrame?: (board: number, frame: string, e?: DragEvent) => void }) {
  const board = useBoardStore((s) => s.boards[index])
  const images = useBoardStore((s) => s.images)
  const selected = useBoardStore((s) => s.selected)
  const total = useBoardStore((s) => s.boards.length)
  const loaded = useLoadedImages([board], images)
  const wrap = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const [width, setWidth] = useState(0)
  const [over, setOver] = useState<string | null>(null)
  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const measure = () => {
      const r = el.parentElement!.getBoundingClientRect()
      setWidth(Math.max(200, Math.min(r.width, r.height * A2_RATIO)))
    }
    // Measure now as well: ResizeObserver does not fire while the page is in the background.
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el.parentElement!)
    window.addEventListener('resize', measure)
    return () => { ro.disconnect(); window.removeEventListener('resize', measure) }
  }, [])
  useEffect(() => {
    const c = canvas.current
    if (!c || !width) return
    const dpr = window.devicePixelRatio || 1
    c.width = Math.round(width * dpr); c.height = Math.round((width / A2_RATIO) * dpr)
    const ctx = c.getContext('2d')
    if (ctx) drawBoard(ctx, board, { pxPerMm: c.width / BOARD_W, images, loaded, evidence, editing: true, index, total })
  }, [board, images, loaded, evidence, width, index, total])
  const pct = (f: Frame) => ({ left: `${(f.x / BOARD_W) * 100}%`, top: `${(f.y / BOARD_H) * 100}%`, width: `${(f.w / BOARD_W) * 100}%`, height: `${(f.h / BOARD_H) * 100}%` })
  return (
    <div ref={wrap} className="relative shadow-2xl" style={{ width, height: width / A2_RATIO }}>
      <canvas ref={canvas} className="absolute inset-0 h-full w-full" aria-label={`Board ${index + 1} preview`} />
      {onFrame && board.frames.map((f) => {
        const sel = selected.board === index && selected.frame === f.id
        const tag = f.tag ? DELIVERABLES.find((d) => d.id === f.tag) : null
        return (
          <button key={f.id} type="button" style={pct(f)} aria-label={`Frame ${f.id}${tag ? `, ${tag.label}` : ''}`} aria-pressed={sel}
            onClick={() => onFrame(index, f.id)}
            onDragOver={(e) => { if (f.role === 'body') { e.preventDefault(); setOver(f.id) } }} onDragLeave={() => setOver(null)}
            onDrop={(e) => { e.preventDefault(); setOver(null); onFrame(index, f.id, e) }}
            className={`absolute rounded-[2px] outline-none transition-shadow ${sel ? 'ring-2 ring-sky-500' : over === f.id ? 'ring-2 ring-emerald-500' : 'hover:ring-1 hover:ring-sky-400/70 focus-visible:ring-2 focus-visible:ring-sky-500'}`}>
            {tag && <span className="pointer-events-none absolute left-1 top-1 rounded bg-slate-900/75 px-1.5 py-0.5 text-meta font-medium text-white">{tag.label}</span>}
          </button>
        )
      })}
    </div>
  )
}

function Thumb({ index, evidence, active, onClick }: { index: number; evidence: Record<string, EvidenceSet>; active: boolean; onClick: () => void }) {
  const board = useBoardStore((s) => s.boards[index])
  const images = useBoardStore((s) => s.images)
  const loaded = useLoadedImages([board], images)
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current
    if (!c) return
    c.width = 220; c.height = Math.round(220 / A2_RATIO)
    const ctx = c.getContext('2d')
    if (ctx) drawBoard(ctx, board, { pxPerMm: 220 / BOARD_W, images, loaded, evidence, editing: true, index, total: 4 })
  }, [board, images, loaded, evidence, index])
  return (
    <button type="button" onClick={onClick} aria-pressed={active} className={`flex flex-col items-center gap-1 rounded p-1 text-meta ${active ? 'bg-white/15 text-white' : 'text-slate-300 hover:bg-white/5'}`}>
      <canvas ref={ref} className={`h-[52px] w-[74px] rounded-[2px] ${active ? 'ring-2 ring-sky-500' : 'ring-1 ring-white/20'}`} />
      Board {index + 1}
    </button>
  )
}

function Library({ onPick }: { onPick: (imageId: string) => void }) {
  const shots = useStore((s) => s.shots)
  const images = useBoardStore((s) => s.images)
  const { addImage, removeImage } = useBoardStore()
  const fileRef = useRef<HTMLInputElement>(null)
  const [msg, setMsg] = useState('')
  const lib = Object.values(images)
  const addPlan = async () => {
    setMsg('')
    const s = useStore.getState()
    if (s.boardView !== 'plan') { s.set({ boardView: 'plan' }); await new Promise((r) => setTimeout(r, 400)) }
    const text = planSvgText()
    if (!text) { setMsg('The floor plan is drawn in the 3D view area: show the 3D view (not the canvas only) and try again.'); return }
    const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(text)}`
    const { w, h } = await imageSize(dataUrl)
    const level = useStore.getState().planLevel
    addImage({ id: `plan-${Date.now()}`, dataUrl, w, h, source: 'capture', label: `Floor plan${level !== null ? `, level ${level}` : ', typical floor'} (vector)`, vector: true })
  }
  const add3d = async () => {
    setMsg('')
    const s = useStore.getState()
    if (s.boardView !== '3d') { s.set({ boardView: '3d' }); await new Promise((r) => setTimeout(r, 400)) }
    const dataUrl = captureHiRes(3508)
    if (!dataUrl) { setMsg('The 3D view is not showing: switch the main view to 3D (not the canvas only) and try again.'); return }
    const { w, h } = await imageSize(dataUrl)
    const rep = s.presentRep === 'xray' ? 'X-ray view' : 'Clay view'
    addImage({ id: `view-${Date.now()}`, dataUrl, w, h, source: 'capture', label: `${rep} at print size, ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` })
  }
  const drag = (e: DragEvent, payload: { shot?: string; image?: string }) => { e.dataTransfer.setData(DRAG, JSON.stringify(payload)); e.dataTransfer.effectAllowed = 'copy' }
  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-3 text-slate-200">
      <div>
        <div className="mb-1.5 text-meta font-semibold text-slate-400">Add</div>
        <div className="grid gap-1.5">
          <button type="button" onClick={add3d} title="Re-renders the current Present camera at about 3500 px wide" className="flex items-center gap-2 rounded border border-white/15 px-2 py-1.5 text-left text-xs hover:border-sky-400"><Camera size={13} />Current 3D view, print size</button>
          <button type="button" onClick={addPlan} className="flex items-center gap-2 rounded border border-white/15 px-2 py-1.5 text-left text-xs hover:border-sky-400"><LayoutPanelTop size={13} />Floor plan (vector, stays sharp)</button>
          <button type="button" onClick={() => fileRef.current?.click()} className="flex items-center gap-2 rounded border border-white/15 px-2 py-1.5 text-left text-xs hover:border-sky-400"><ImagePlus size={13} />Image file (render, drawing, photo)</button>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" multiple className="hidden" onChange={async (e) => { if (e.target.files) await importFiles(e.target.files); e.target.value = '' }} />
        </div>
        {msg && <p className="mt-1 text-meta text-amber-300">{msg}</p>}
      </div>
      <div>
        <div className="mb-1.5 text-meta font-semibold text-slate-400">Shots from Present ({shots.length})</div>
        {shots.length === 0 && <p className="text-meta text-slate-400">Capture views with the camera presets; they appear here.</p>}
        <div className="grid grid-cols-2 gap-1.5">
          {shots.map((s) => (
            <button key={s.id} type="button" draggable onDragStart={(e) => drag(e, { shot: s.id })} onClick={async () => onPick(await importShot(s))}
              title="Click to place in the selected frame, or drag onto the board" className="overflow-hidden rounded border border-white/15 hover:border-sky-400">
              <img src={s.dataUrl} alt={`Shot ${s.representation}`} className="aspect-[1.414] w-full object-cover" draggable={false} />
            </button>
          ))}
        </div>
      </div>
      <div>
        <div className="mb-1.5 text-meta font-semibold text-slate-400">On the boards ({lib.length})</div>
        <div className="grid gap-1.5">
          {lib.map((img) => <LibraryItem key={img.id} img={img} onPick={() => onPick(img.id)} onDrag={(e) => drag(e, { image: img.id })} onRemove={() => removeImage(img.id)} />)}
        </div>
      </div>
    </div>
  )
}

function LibraryItem({ img, onPick, onDrag, onRemove }: { img: BoardImage; onPick: () => void; onDrag: (e: DragEvent) => void; onRemove: () => void }) {
  return (
    <div className="flex items-center gap-2 rounded border border-white/10 p-1">
      <button type="button" draggable onDragStart={onDrag} onClick={onPick} className="shrink-0" title="Place in the selected frame">
        <img src={img.dataUrl} alt="" className="h-9 w-12 rounded-[2px] bg-white object-cover" draggable={false} />
      </button>
      <div className="min-w-0 flex-1">
        <div className="truncate text-meta">{img.label}</div>
        <div className={`text-meta ${imageSource(img) === 'ai' ? 'text-fuchsia-300' : 'text-slate-400'}`}>{img.vector ? 'Vector · ' : `${img.w} × ${img.h} px · `}{SOURCE_LABEL[imageSource(img) ?? img.source]}</div>
      </div>
      <button type="button" onClick={onRemove} aria-label={`Remove ${img.label}`} className="p-1 text-slate-400 hover:text-red-300"><Trash2 size={12} /></button>
    </div>
  )
}

function FrameInspector({ evidence }: { evidence: Record<string, EvidenceSet> }) {
  const { boards, selected, images, updateFrame, addImage, setTemplate, parked, unpark } = useBoardStore()
  const b: Board = boards[selected.board]
  const f = b.frames.find((x) => x.id === selected.frame)
  const set = (patch: Partial<Frame>) => f && updateFrame(selected.board, f.id, patch)
  const label = 'flex flex-col gap-1 text-xs'
  const input = 'rounded border border-white/15 bg-slate-900 px-2 py-1 text-xs text-slate-100'
  return (
    <div className="grid gap-4 p-3 text-slate-200">
      <div>
        <div className="mb-1.5 text-meta font-semibold text-slate-400">Board {selected.board + 1} layout</div>
        <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="Board template">
          {(Object.keys(TEMPLATES) as TemplateId[]).map((t) => (
            <button key={t} type="button" role="radio" aria-checked={b.template === t} title={TEMPLATES[t].hint} onClick={() => setTemplate(selected.board, t)}
              className={`rounded border px-2 py-1 text-xs ${b.template === t ? 'border-sky-500 bg-sky-600 text-white' : 'border-white/15 hover:border-sky-400'}`}>{TEMPLATES[t].label}</button>
          ))}
        </div>
        {parked.length > 0 && (
          <div className="mt-2 rounded border border-amber-400/40 p-2 text-meta">
            <div className="mb-1 text-amber-200">{parked.length} item{parked.length > 1 ? 's' : ''} moved off a board by a layout change. Select an empty frame, then put one back:</div>
            {parked.map((p, i) => (
              <button key={i} type="button" disabled={!f || f.role === 'title'} onClick={() => f && unpark(i, selected.board, f.id)} className="mr-1 mt-1 rounded border border-white/20 px-1.5 py-0.5 disabled:opacity-40">
                {p.content.kind === 'image' ? images[p.content.imageId]?.label ?? 'Image' : p.content.kind === 'text' ? `“${p.content.text.slice(0, 18)}…”` : 'Evidence'}
              </button>
            ))}
          </div>
        )}
      </div>
      {!f && <p className="text-xs text-slate-400">Select a frame on the board to fill it.</p>}
      {f && (
        <div className="grid gap-3">
          <div className="text-meta font-semibold text-slate-400">{f.role === 'title' ? 'Title band' : 'Frame'} · {Math.round(f.w)} × {Math.round(f.h)} mm</div>
          {f.role === 'body' && (
            <div className="grid grid-cols-4 gap-1" role="radiogroup" aria-label="Frame content">
              {([['image', 'Image'], ['text', 'Text'], ['evidence', 'Evidence'], ['empty', 'Empty']] as const).map(([k, l]) => (
                <button key={k} type="button" role="radio" aria-checked={f.content.kind === k}
                  onClick={() => set({ content: k === 'text' ? { kind: 'text', text: '', sizeMm: 4.5 } : k === 'evidence' ? { kind: 'evidence', nodeId: Object.keys(evidence)[0] ?? '' } : k === 'image' ? (f.content.kind === 'image' ? f.content : { kind: 'empty' }) : { kind: 'empty' } })}
                  className={`rounded border px-1 py-1 text-meta ${f.content.kind === k ? 'border-sky-500 bg-sky-600 text-white' : 'border-white/15 hover:border-sky-400'}`}>{l}</button>
              ))}
            </div>
          )}
          {f.content.kind === 'empty' && f.role === 'body' && <p className="text-meta text-slate-400">Click a shot or image on the left, or drag it onto this frame.</p>}
          {f.content.kind === 'image' && (() => {
            const c = f.content, img = images[c.imageId]
            return (
              <>
                <div className="text-meta">{img?.label ?? 'Image missing'}{img?.vector && <span className="text-slate-400"> · the plan's written scale holds only at full board size; its scale bar stays true</span>}</div>
                <div className="grid grid-cols-2 gap-1" role="radiogroup" aria-label="Image fit">
                  {(['cover', 'contain'] as const).map((fit) => (
                    <button key={fit} type="button" role="radio" aria-checked={c.fit === fit} onClick={() => set({ content: { ...c, fit } })}
                      className={`rounded border px-2 py-1 text-meta ${c.fit === fit ? 'border-sky-500 bg-sky-600 text-white' : 'border-white/15'}`}>{fit === 'cover' ? 'Fill (crop)' : 'Fit (whole image)'}</button>
                  ))}
                </div>
                {img?.ai && <p className="text-meta text-fuchsia-200">AI render{img.ai.model ? ` (${img.ai.model})` : ''} from {img.ai.sourceLabel || 'an unknown capture'}. Its AI label cannot be removed.</p>}
                {img && !img.ai && (
                  <label className={label}><span className="text-slate-400">Made by</span>
                    <select value={img.source} className={input} onChange={(e) => addImage({ ...img, source: e.target.value as ImageSource })}>
                      {(Object.keys(SOURCE_LABEL) as ImageSource[]).map((s) => <option key={s} value={s}>{SOURCE_LABEL[s]}</option>)}
                    </select>
                  </label>
                )}
                {imageSource(img) === 'ai' && <p className="flex items-start gap-1.5 text-meta text-fuchsia-200"><Sparkles size={12} className="mt-0.5 shrink-0" />"AI-generated image" is printed under it (team rule; it cannot be removed).</p>}
                <label className={label}><span className="text-slate-400">Caption</span>
                  <input value={f.caption ?? ''} onChange={(e) => set({ caption: e.target.value })} className={input} placeholder="What it shows (printed at 3.5 mm)" />
                </label>
              </>
            )
          })()}
          {f.content.kind === 'text' && (() => {
            const c = f.content
            return (
              <>
                <label className={label}><span className="text-slate-400">{f.role === 'title' ? 'Board title (no names: brief p.27)' : 'Text'}</span>
                  <textarea value={c.text} rows={f.role === 'title' ? 2 : 8} onChange={(e) => set({ content: { ...c, text: e.target.value } })} className={input} />
                </label>
                <div className="flex items-end gap-3">
                  <label className={label}><span className="text-slate-400">Type height (mm)</span>
                    <input type="number" min={2} max={24} step={0.5} value={c.sizeMm} onChange={(e) => set({ content: { ...c, sizeMm: Math.max(2, Math.min(24, Number(e.target.value) || c.sizeMm)) } })} className={`${input} w-20`} />
                  </label>
                  <label className="flex items-center gap-1.5 pb-1 text-xs"><input type="checkbox" checked={!!c.bold} onChange={() => set({ content: { ...c, bold: !c.bold } })} />Bold</label>
                </div>
              </>
            )
          })()}
          {f.content.kind === 'evidence' && (() => {
            const c = f.content
            return (
              <>
                <label className={label}><span className="text-slate-400">Check results to show</span>
                  <select value={c.nodeId} onChange={(e) => set({ content: { ...c, nodeId: e.target.value } })} className={input}>
                    {Object.values(evidence).map((s) => <option key={s.id} value={s.id}>{s.name} ({s.rules.length})</option>)}
                  </select>
                </label>
                <p className="text-meta text-slate-400">Each line keeps its state, threshold, evidence flag and source, so the jury sees what is checked and what is assumed. Fails and checks come first.</p>
              </>
            )
          })()}
          {f.role === 'body' && (
            <label className={label}><span className="text-slate-400">Shows (brief p.30 deliverable)</span>
              <select value={f.tag ?? ''} onChange={(e) => set({ tag: (e.target.value || null) as DeliverableId | null })} className={input}>
                <option value="">Not tagged</option>
                {[...new Set(DELIVERABLES.map((d) => d.group))].map((g) => (
                  <optgroup key={g} label={g}>{DELIVERABLES.filter((d) => d.group === g).map((d) => <option key={d.id} value={d.id}>{d.label}{d.min > 1 ? ` (min ${d.min})` : ''}</option>)}</optgroup>
                ))}
              </select>
            </label>
          )}
        </div>
      )}
    </div>
  )
}

export default function BoardComposer() {
  const open = useBoardStore((s) => s.open)
  // The body (and its results) only runs while the composer is open.
  return open ? <ComposerBody /> : null
}

function ComposerBody() {
  const open = true
  const setOpen = useBoardStore((s) => s.setOpen)
  const boards = useBoardStore((s) => s.boards)
  const images = useBoardStore((s) => s.images)
  const selected = useBoardStore((s) => s.selected)
  const select = useBoardStore((s) => s.select)
  const updateFrame = useBoardStore((s) => s.updateFrame)
  const evidence = useEvidence()
  const overflow = useOverflow(boards, images, evidence)
  const [tab, setTab] = useState<'frame' | 'submit'>('frame')

  useEffect(() => { if (open) void hydrateBoardImages() }, [open])
  // While open, keys stay in the composer (the app's 1/2/3 and P shortcuts would change stage underneath).
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); e.stopPropagation() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, setOpen])

  const place = (board: number, frame: string, imageId: string) => {
    const f = boards[board].frames.find((x) => x.id === frame)
    if (!f || f.role !== 'body') return
    const img = useBoardStore.getState().images[imageId]
    updateFrame(board, frame, { content: { kind: 'image', imageId, fit: img?.vector ? 'contain' : 'cover' } })
  }
  const onFrame = async (board: number, frame: string, e?: DragEvent) => {
    select(board, frame)
    setTab('frame')
    if (!e) return
    if (e.dataTransfer.files.length) { const ids = await importFiles(e.dataTransfer.files); if (ids[0]) place(board, frame, ids[0]); return }
    const raw = e.dataTransfer.getData(DRAG)
    if (!raw) return
    const p = JSON.parse(raw) as { shot?: string; image?: string }
    if (p.image) place(board, frame, p.image)
    else if (p.shot) { const shot = useStore.getState().shots.find((s) => s.id === p.shot); if (shot) place(board, frame, await importShot(shot)) }
  }
  const pick = (imageId: string) => { if (selected.frame) place(selected.board, selected.frame, imageId) }

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Board composer" className="fixed inset-0 z-[80] flex flex-col bg-[#15181c] text-slate-100">
      <header className="flex items-center gap-3 border-b border-white/10 px-3 py-2">
        <FileImage size={16} className="text-sky-400" />
        <div className="mr-2">
          <div className="text-sm font-semibold">Boards</div>
          <div className="text-meta text-slate-400">Four A2 landscape boards, ≤ 10 MB each (brief p.27)</div>
        </div>
        <nav aria-label="Boards" className="flex gap-1">
          {boards.map((_, i) => <Thumb key={i} index={i} evidence={evidence} active={selected.board === i} onClick={() => select(i, null)} />)}
        </nav>
        <div className="ml-auto flex items-center gap-1 rounded-md border border-white/15 p-0.5" role="tablist" aria-label="Panel">
          <button type="button" role="tab" aria-selected={tab === 'frame'} onClick={() => setTab('frame')} className={`rounded px-2 py-1 text-xs ${tab === 'frame' ? 'bg-white/15' : 'text-slate-300'}`}>Compose</button>
          <button type="button" role="tab" aria-selected={tab === 'submit'} onClick={() => setTab('submit')} className={`flex items-center gap-1 rounded px-2 py-1 text-xs ${tab === 'submit' ? 'bg-white/15' : 'text-slate-300'}`}><ListChecks size={12} />Check and export</button>
        </div>
        <button type="button" onClick={() => setOpen(false)} aria-label="Close the board composer (Esc)" className="rounded p-1.5 text-slate-300 hover:bg-white/10"><X size={16} /></button>
      </header>
      <div className="flex min-h-0 flex-1">
        <aside className="w-60 shrink-0 border-r border-white/10" aria-label="Images"><Library onPick={pick} /></aside>
        <main className="flex min-w-0 flex-1 items-center justify-center overflow-hidden bg-[#2a2e34] p-6">
          <div className="flex h-full w-full items-center justify-center">
            <BoardCanvas index={selected.board} evidence={evidence} onFrame={onFrame} />
          </div>
        </main>
        <aside className="w-80 shrink-0 overflow-y-auto border-l border-white/10" aria-label={tab === 'frame' ? 'Frame' : 'Check and export'}>
          {tab === 'frame' ? <FrameInspector evidence={evidence} /> : <SubmissionPanel evidence={evidence} overflow={overflow} />}
        </aside>
      </div>
    </div>,
    document.body,
  )
}
