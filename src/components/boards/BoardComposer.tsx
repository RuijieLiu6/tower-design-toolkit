// Board composer (research P13-M06a, thin form): four A2 landscape boards in templates; drop shots, renders and vector
// floor plans into frames, write titles and text, add evidence frames from the checks, tag each frame with the brief's
// deliverable it shows. Checks and export are in SubmissionPanel.
import { ArrowUpDown, ChevronDown, FileImage, LayoutPanelTop, Sparkles, Trash2, Upload, X } from '../icons'
import { useEffect, useRef, useState, type ReactNode, type DragEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { A2_RATIO, BOARD_H, BOARD_W, DELIVERABLES, type Orientation, MAX_SHEETS, SHEET_SIZES, SOURCE_LABEL, TEMPLATES, boardName, templateRects, familiesUsed, imageSource, sheetName, sheetNumbers, type FrameContent, type SheetSize, type Board, type BoardImage, type DeliverableId, type Frame, type ImageSource, type TemplateId } from '../../engine/boards'
import { drawBoard, imageSize, type EvidenceSet } from '../../lib/boardRender'
import { hydrateBoardImages, useBoardStore } from '../../lib/boardStore'
import { BUILTIN_FONTS, FONT_SOURCES, KIND_WORD, fontStack } from '../../lib/fonts/catalog'
import { FONT_ACCEPT } from '../../lib/fonts/fontFile'
import { addUserFont, allFamilies, ensureFontsLoaded, familyAvailable, hydrateUserFonts, missingFamilies, removeUserFont, useFonts, type UserFont } from '../../lib/fonts/fontStore'
import Fold from '../Fold'
import UiShow from '../ui/UiShow'
import { isVisible, useUiItems, useUiVisibility } from '../../lib/ui/registry'
import { useStore, type Shot } from '../../store'
import SubmissionPanel from './SubmissionPanel'
import { useBoardFonts, useDrawData, useEvidence, useLoadedImages, useOverflow } from './useBoardData'
import { BOARD_STYLES, SCALES, drawDrawing, drawTable, type DrawData, type StyleId } from '../../lib/boardDrawings'

const DRAG = 'application/x-board-image'
/** A board tab being dragged to a new place (Ruijie, 17 Nov). */
const BOARD_DRAG = 'application/x-board-order'
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

function BoardCanvas({ index, evidence, onFrame, rev }: { index: number; evidence: Record<string, EvidenceSet>; onFrame?: (board: number, frame: string, e?: DragEvent) => void; rev?: DrawData }) {
  const style = useBoardStore((s) => s.style)
  const updateFrame = useBoardStore((s) => s.updateFrame)
  const drag = useRef<{ id: string; x: number; y: number; f: Frame; resize: boolean; moved: boolean } | null>(null)
  const board = useBoardStore((s) => s.boards[index])
  const images = useBoardStore((s) => s.images)
  const selected = useBoardStore((s) => s.selected)
  const total = useBoardStore((s) => s.boards.length)
  const loaded = useLoadedImages([board], images)
  const { fonts, resolve, loaded: fontsLoaded } = useBoardFonts()
  const wrap = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const [width, setWidth] = useState(0)
  const [over, setOver] = useState<string | null>(null)
  // Typing on the board (19 Nov, Sinnie: "two ways of editing, either directly on the board, or on the side panel").
  const [typing, setTyping] = useState<string | null>(null)
  const renameBoard = useBoardStore((s) => s.renameBoard)
  const startTyping = (f: Frame) => {
    if (f.role === 'body' && f.content.kind === 'empty') updateFrame(index, f.id, { content: { kind: 'text', text: '', sizeMm: 4.5 } })
    else if (f.content.kind !== 'text' && f.role !== 'title') return
    setTyping(f.id)
  }
  useEffect(() => { setTyping(null) }, [index])
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
    if (ctx) drawBoard(ctx, board, { pxPerMm: c.width / BOARD_W, images, loaded, evidence, editing: true, index, total, fonts, resolve })
  }, [board, images, loaded, evidence, width, index, total, style, rev, fonts, resolve, fontsLoaded]) // eslint-disable-line react-hooks/exhaustive-deps
  // Drag a selected frame to move it, its corner to resize it (the Workspace's sheet editing), in whole millimetres.
  const mmPerPx = BOARD_W / Math.max(1, width)
  const move = (e: ReactPointerEvent) => {
    const d = drag.current
    if (!d) return
    const dx = (e.clientX - d.x) * mmPerPx, dy = (e.clientY - d.y) * mmPerPx
    if (!d.moved && Math.hypot(dx, dy) < 1) return
    d.moved = true
    const f = d.f
    if (d.resize) updateFrame(index, f.id, { w: Math.round(Math.max(30, Math.min(BOARD_W - 6 - f.x, f.w + dx))), h: Math.round(Math.max(25, Math.min(BOARD_H - 12 - f.y, f.h + dy))) })
    else updateFrame(index, f.id, { x: Math.round(Math.max(6, Math.min(BOARD_W - 6 - f.w, f.x + dx))), y: Math.round(Math.max(6, Math.min(BOARD_H - 12 - f.h, f.y + dy))) })
  }
  const pct = (f: Frame) => ({ left: `${(f.x / BOARD_W) * 100}%`, top: `${(f.y / BOARD_H) * 100}%`, width: `${(f.w / BOARD_W) * 100}%`, height: `${(f.h / BOARD_H) * 100}%` })
  return (
    <div ref={wrap} className="relative shadow-2xl" style={{ width, height: width / A2_RATIO }}>
      <canvas ref={canvas} className="absolute inset-0 h-full w-full" aria-label={`Board ${index + 1} preview`} />
      {onFrame && board.frames.map((f) => {
        const sel = selected.board === index && selected.frame === f.id
        const tag = f.tag ? DELIVERABLES.find((d) => d.id === f.tag) : null
        return (
          <button key={f.id} type="button" style={pct(f)} aria-label={`Frame ${f.id}${tag ? `, ${tag.label}` : ''}`} aria-pressed={sel}
            title={f.role === 'title' || f.content.kind === 'text' || f.content.kind === 'empty' ? 'Double-click to type here' : undefined}
            onDoubleClick={() => startTyping(f)} onKeyDown={(e) => { if (e.key === 'Enter' && sel) { e.preventDefault(); startTyping(f) } }}
            onClick={() => { if (drag.current?.moved) { drag.current = null; return } onFrame(index, f.id) }}
            onPointerDown={(e) => { if (!sel || f.role !== 'body') return; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); drag.current = { id: f.id, x: e.clientX, y: e.clientY, f, resize: !!(e.target as HTMLElement).dataset.resize, moved: false } }}
            onPointerMove={move} onPointerUp={() => { if (drag.current && !drag.current.moved) drag.current = null }}
            onDragOver={(e) => { if (f.role === 'body') { e.preventDefault(); setOver(f.id) } }} onDragLeave={() => setOver(null)}
            onDrop={(e) => { e.preventDefault(); setOver(null); onFrame(index, f.id, e) }}
            className={`absolute rounded-[2px] outline-none transition-shadow ${sel && f.role === 'body' ? 'cursor-move ' : ''}${sel ? 'ring-2 ring-sky-500' : over === f.id ? 'ring-2 ring-emerald-500' : 'hover:ring-1 hover:ring-sky-400/70 focus-visible:ring-2 focus-visible:ring-sky-500'}`}>
            {tag && <span className="pointer-events-none absolute left-1 top-1 rounded bg-slate-900/75 px-1.5 py-0.5 text-meta font-medium text-white">{tag.label}</span>}
            {sel && f.role === 'body' && <span data-resize="1" title="Drag to resize" className="absolute -bottom-1 -right-1 h-3 w-3 cursor-nwse-resize rounded-sm bg-sky-500" />}
          </button>
        )
      })}
      {typing && (() => {
        const f = board.frames.find((x) => x.id === typing)
        if (!f) return null
        const c = f.content.kind === 'text' ? f.content : null
        const px = (mm: number) => mm / mmPerPx
        const box = 'absolute z-10 rounded-[2px] bg-white/95 text-slate-900 outline-none ring-2 ring-sky-500 placeholder:text-slate-400'
        if (f.role === 'title') {
          const name = board.name ?? (c?.text.split('\n')[0] ?? '')
          return <input autoFocus defaultValue={name} placeholder="Sheet name" aria-label="Sheet name, on the board" maxLength={80} data-testid="board-title-inline"
            onBlur={(e) => { renameBoard(index, e.target.value); setTyping(null) }}
            onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setTyping(null) }}
            style={{ ...pct(f), fontSize: px(c?.sizeMm ?? 9), fontWeight: c?.bold === false ? 400 : 700, padding: `0 ${px(2)}px` }} className={box} />
        }
        if (!c) return null
        return <textarea autoFocus defaultValue={c.text} placeholder="Type here" aria-label="Text, on the board" data-testid="frame-text-inline"
          onBlur={(e) => { updateFrame(index, f.id, { content: { ...c, text: e.target.value } }); setTyping(null) }}
          onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Escape') setTyping(null); if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) e.currentTarget.blur() }}
          style={{ ...pct(f), fontSize: px(c.sizeMm), fontWeight: c.bold ? 700 : 400, lineHeight: 1.3, padding: px(1.5) }} className={`${box} resize-none`} />
      })()}
    </div>
  )
}

/**
 * One board's tab (Ruijie, 17 Nov: boards can be renamed and rearranged): its preview and its name. Click selects; drag a
 * tab onto another, or Alt+← / Alt+→, to move it. The name is edited on the board or under Sheet name (19 Nov: two ways).
 */
function Thumb({ index, evidence, active, onClick, rev }: { index: number; evidence: Record<string, EvidenceSet>; active: boolean; onClick: () => void; rev?: DrawData }) {
  const style = useBoardStore((s) => s.style)
  const board = useBoardStore((s) => s.boards[index])
  const count = useBoardStore((s) => s.boards.length)
  const move = useBoardStore((s) => s.moveBoard)
  const [over, setOver] = useState(false)
  const name = boardName(board, index)
  const images = useBoardStore((s) => s.images)
  const loaded = useLoadedImages([board], images)
  const { fonts, resolve, loaded: fontsLoaded } = useBoardFonts()
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current
    if (!c) return
    c.width = 220; c.height = Math.round(220 / A2_RATIO)
    const ctx = c.getContext('2d')
    if (ctx) drawBoard(ctx, board, { pxPerMm: 220 / BOARD_W, images, loaded, evidence, editing: true, index, total: 4, fonts, resolve })
  }, [board, images, loaded, evidence, index, style, rev, fonts, resolve, fontsLoaded]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div data-testid="board-tab" data-board-name={name} draggable
      onDragStart={(e) => { e.dataTransfer.setData(BOARD_DRAG, String(index)); e.dataTransfer.effectAllowed = 'move' }}
      onDragOver={(e) => { if (e.dataTransfer.types.includes(BOARD_DRAG)) { e.preventDefault(); setOver(true) } }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { setOver(false); const from = Number(e.dataTransfer.getData(BOARD_DRAG)); if (Number.isInteger(from)) { e.preventDefault(); move(from, index) } }}
      className={`flex w-[92px] flex-col items-center gap-1 rounded p-1 text-meta ${active ? 'bg-white/15 text-white' : 'text-slate-300 hover:bg-white/5'} ${over ? 'outline outline-2 outline-sky-400' : ''}`}>
      <button type="button" onClick={onClick} aria-pressed={active} aria-label={`${name}: board ${index + 1} of ${count}`} title="Click to open · drag or Alt+← → to move"
        onKeyDown={(e) => {
          if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { e.preventDefault(); move(index, index + (e.key === 'ArrowLeft' ? -1 : 1)) }
        }}
        className="rounded-[2px] outline-none focus-visible:ring-2 focus-visible:ring-sky-400">
        <canvas ref={ref} style={{ height: 52, width: Math.round(52 * A2_RATIO) }} className={`rounded-[2px] ${active ? 'ring-2 ring-sky-500' : 'ring-1 ring-white/20'}`} />
      </button>
      <span className="w-full truncate text-center" title={name}>{name}</span>
    </div>
  )
}

/**
 * The board's type (Ruijie, 17 Nov: "an option to change the font, and users can also download and upload the font
 * type they want"): a heading and a text face for the whole board (each text frame may name its own), the built-in
 * faces and your own files (lib/fonts), every name drawn in its face, and where free fonts come from.
 */
function FontPanel() {
  const fonts = useBoardStore((s) => s.fonts)
  const setFonts = useBoardStore((s) => s.setFonts)
  const boards = useBoardStore((s) => s.boards)
  const hiddenUi = useUiVisibility((s) => s.hidden)
  const uiItems = useUiItems()
  const user = useFonts((s) => s.user).filter((u) => isVisible(`addons.fonts.${u.family}`, hiddenUi, uiItems))
  const fileRef = useRef<HTMLInputElement>(null)
  const [msg, setMsg] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const available = (f: string) => familyAvailable(f, user)
  const missing = missingFamilies(boards.flatMap((b) => familiesUsed(b, fonts)), available)
  const add = async (files: FileList | File[]) => {
    setBusy(true); setMsg(null)
    for (const f of [...files]) {
      const r = await addUserFont(f)
      setMsg(r.ok ? { tone: 'ok', text: `${r.family} added from ${f.name}: pick it under Headings, Text or a frame.` } : { tone: 'bad', text: r.error })
      if (!r.ok) break
    }
    setBusy(false)
  }
  return (
    <section aria-label="Board fonts" data-testid="font-panel" className="grid min-w-0 gap-2 [overflow-wrap:anywhere]">
      <div className="text-meta font-semibold text-slate-400">Type on every board</div>
      <div className="grid grid-cols-2 gap-1.5">
        <FontPick id="heading" label="Headings" value={fonts.heading} user={user} onPick={(family) => family && setFonts({ heading: family })} />
        <FontPick id="body" label="Text" value={fonts.body} user={user} onPick={(family) => family && setFonts({ body: family })} />
      </div>
      {missing.length > 0 && <p data-testid="font-missing" className="text-meta text-amber-300">Not in this browser: {missing.join(', ')}. Inter is drawn instead; add the file under Your fonts to bring it back.</p>}
      <div>
        <div className="mb-1 text-meta text-slate-400">Your fonts ({user.length})</div>
        {user.length > 0 && (
          <ul className="grid gap-1">
            {user.map((u) => (
              <li key={u.id} data-user-font={u.family} className="flex items-center gap-2 rounded border border-white/10 px-1.5 py-1 text-meta">
                <span className="min-w-0 flex-1 truncate text-sm" style={{ fontFamily: fontStack(u.family) }}>{u.family}</span>
                <span className="shrink-0 text-slate-400">{u.format} · {Math.max(1, Math.round(u.size / 1000))} kB</span>
                <button type="button" onClick={() => void removeUserFont(u.id)} aria-label={`Remove ${u.family}`} className="p-1 text-slate-400 hover:text-red-300"><Trash2 size={12} /></button>
              </li>
            ))}
          </ul>
        )}
        <div data-testid="font-drop" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files.length) void add(e.dataTransfer.files) }}
          className="mt-1 min-w-0 rounded border border-dashed border-white/20 p-2 text-meta text-slate-300">
          <button type="button" disabled={busy} onClick={() => fileRef.current?.click()} className="flex items-center gap-1.5 rounded border border-white/15 px-2 py-1 text-xs hover:border-sky-400 disabled:opacity-50"><Upload size={13} />Add a font file</button>
          <input ref={fileRef} data-testid="font-file" type="file" accept={FONT_ACCEPT} multiple className="hidden" onChange={async (e) => { if (e.target.files) await add(e.target.files); e.target.value = '' }} />
          <p className="mt-1">.ttf, .otf, .woff or .woff2 up to 8 MB, or drop one here. It stays in this browser and is never uploaded.</p>
          <p className="mt-0.5 text-slate-400">You are responsible for having the right to use a font on your boards: its licence says.</p>
          {msg && <p data-testid="font-msg" className={`mt-1 ${msg.tone === 'ok' ? 'text-emerald-300' : 'text-amber-300'}`}>{msg.text}</p>}
        </div>
      </div>
      <Fold summary="Find fonts: free sources (a link; the app sends nothing)" className="[&_summary]:text-slate-400 [&_summary:hover]:text-slate-200 [&>div]:text-slate-300">
        {FONT_SOURCES.map((s) => <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer" className="text-sky-300 hover:underline">{s.name}<span className="text-slate-400"> · {s.note}</span></a>)}
        <span className="text-slate-400">Built in, all SIL Open Font Licence: {BUILTIN_FONTS.map((b) => b.family.replace(' Variable', '')).join(', ')}; their licences are on the Sources page.</span>
      </Fold>
    </section>
  )
}

/** A font picker: the current family in its own face; a list where every name is drawn in its face. */
function FontPick({ id, label, value, user, onPick, allowDefault = false }: { id: string; label: string; value: string | undefined; user: UserFont[]; onPick: (family: string | undefined) => void; allowDefault?: boolean }) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false) } }
    window.addEventListener('pointerdown', away, true); window.addEventListener('keydown', key, true)
    return () => { window.removeEventListener('pointerdown', away, true); window.removeEventListener('keydown', key, true) }
  }, [open])
  const options: { family: string | undefined; name: string; note: string }[] = [
    ...(allowDefault ? [{ family: undefined, name: 'Board default', note: '' }] : []),
    ...BUILTIN_FONTS.map((b) => ({ family: b.family, name: b.family.replace(' Variable', ''), note: KIND_WORD[b.kind] })),
    ...user.map((u) => ({ family: u.family, name: u.family, note: 'yours' })),
  ]
  const current = options.find((o) => o.family === value) ?? (value ? { family: value, name: value, note: 'not here' } : options[0])
  return (
    <div ref={box} className="relative flex min-w-0 flex-col gap-1 text-xs">
      <span className="text-slate-400">{label}</span>
      <button type="button" data-font-pick={id} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((v) => !v)} title={`${label}: ${current.name}`}
        className="flex items-center justify-between gap-1 rounded border border-white/15 bg-slate-900 px-2 py-1 text-left text-xs text-slate-100 hover:border-sky-400">
        <span className="truncate" style={{ fontFamily: value ? fontStack(value) : undefined }}>{current.name}</span><ChevronDown size={12} className="shrink-0 text-slate-400" />
      </button>
      {open && (
        <ul role="listbox" aria-label={label} className="absolute left-0 top-full z-10 mt-1 max-h-64 w-56 overflow-y-auto rounded border border-white/15 bg-slate-900 p-1 shadow-xl">
          {options.map((o) => (
            <li key={o.family ?? '__default'}>
              <button type="button" role="option" aria-selected={o.family === value} data-font-option={o.family ?? ''} onClick={() => { onPick(o.family); setOpen(false) }}
                className={`flex w-full items-center justify-between gap-2 rounded px-2 py-1 text-left ${o.family === value ? 'bg-sky-600 text-white' : 'hover:bg-white/10'}`}>
                <span className="truncate text-sm" style={{ fontFamily: o.family ? fontStack(o.family) : undefined }}>{o.name}</span>
                {o.note && <span className="shrink-0 text-meta text-slate-400">{o.note}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

const DRAW_WORD: Record<string, string> = { site: 'Site plan', plan: 'Floor plan', elev: 'Elevation', section: 'Section', context: 'Context plan', roof: 'Roof plan', axo: 'Axonometric', program: 'Program diagram' }
const contentWord = (c: FrameContent) => c.kind === 'table' ? 'Results table' : c.kind === 'drawing'
  ? c.label ?? `${DRAW_WORD[c.vt] ?? 'Drawing'}${c.vt === 'plan' && c.level ? `, level ${c.level}` : ''}${c.vt === 'elev' && c.dir ? ` ${c.dir}` : ''}` : ''
type LibEntry = { key: string; label: string } & ({ image: BoardImage } | { shot: Shot } | { content: FrameContent })

/** A drawing or the results table drawn small, in the sheet style, from the same code that draws the sheet. */
function DrawingThumb({ c, evidence, d }: { c: FrameContent; evidence: Record<string, EvidenceSet>; d: DrawData }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const style = useBoardStore((s) => s.style)
  const streetsWhite = useBoardStore((s) => s.streetsWhite)
  useEffect(() => {
    const el = ref.current, ctx = el?.getContext('2d')
    if (!el || !ctx) return
    // A fixed landscape tile whatever the sheet's orientation, so the library grid stays even.
    const W = 150, H = (W * el.height) / el.width, k = el.width / W
    const st = { ...(BOARD_STYLES[style] ?? BOARD_STYLES.competition), ...(streetsWhite ? { streets: '#ffffff' } : {}) }
    ctx.fillStyle = st.paper; ctx.fillRect(0, 0, el.width, el.height)
    const f = { x: 0, y: 0, w: W, h: H }
    if (c.kind === 'drawing') drawDrawing(ctx, k, f, c, d, st, 1)
    else if (c.kind === 'table') drawTable(ctx, k, f, Object.values(evidence).map((s) => [s.name, '', s.rules.some((r) => r.state === 'fail') ? 'fail' : 'pass'] as [string, string, 'pass' | 'fail']), st)
  }, [c, style, d, evidence, streetsWhite])
  return <canvas ref={ref} width={192} height={136} className="block aspect-[1.414] w-full bg-white" />
}

/**
 * Everything already on the sheets, in one place (Sinnie, 18 Nov: "after users add an image to sheets, these diagrams
 * should show up in the right panel with all the other images and act as a library"): images, shots and every
 * drawing or table placed on any sheet. Drag one onto a frame, or click it to fill the selected frame.
 */
function SheetLibrary({ evidence }: { evidence: Record<string, EvidenceSet> }) {
  const boards = useBoardStore((s) => s.boards)
  const images = useBoardStore((s) => s.images)
  const selected = useBoardStore((s) => s.selected)
  const updateFrame = useBoardStore((s) => s.updateFrame)
  const shots = useStore((s) => s.shots)
  const d = useDrawData()
  const fileRef = useRef<HTMLInputElement>(null)
  const [dropping, setDropping] = useState(false)
  const seen = new Set<string>()
  const entries: LibEntry[] = []
  for (const b of boards) for (const fr of b.frames) {
    const c = fr.content
    if (c.kind !== 'drawing' && c.kind !== 'table') continue
    const key = JSON.stringify(c)
    if (!seen.has(key)) { seen.add(key); entries.push({ key, label: contentWord(c), content: c }) }
  }
  for (const img of Object.values(images)) entries.push({ key: img.id, label: img.label, image: img })
  const removeImage = useBoardStore((s) => s.removeImage)
  const imported = new Set(Object.keys(images))
  for (const s of shots) if (!imported.has(`shot-${s.id}`)) entries.push({ key: `shot-${s.id}`, label: `Shot, ${s.representation}`, shot: s })
  const target = boards[selected.board]?.frames.find((x) => x.id === selected.frame && x.role === 'body')
  const pick = async (e: LibEntry) => {
    if (!target) return
    const content: FrameContent = 'content' in e ? e.content
      : 'image' in e ? { kind: 'image', imageId: e.image.id, fit: e.image.vector ? 'contain' : 'cover' }
      : { kind: 'image', imageId: await importShot(e.shot), fit: 'cover' }
    updateFrame(selected.board, target.id, { content })
  }
  const drag = (ev: DragEvent, e: LibEntry) => {
    ev.dataTransfer.setData(DRAG, JSON.stringify('content' in e ? { content: e.content } : 'image' in e ? { image: e.image.id } : { shot: e.shot.id }))
    ev.dataTransfer.effectAllowed = 'copy'
  }
  return (
    <div data-testid="sheet-library" onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDropping(true) } }} onDragLeave={() => setDropping(false)}
      onDrop={(e) => { setDropping(false); if (e.dataTransfer.files.length) { e.preventDefault(); void importFiles(e.dataTransfer.files) } }}
      className={dropping ? 'rounded ring-2 ring-sky-400' : ''}>
      <div className="mb-1.5 flex items-center justify-between text-meta font-semibold text-slate-400"><span>Library</span><span className="font-normal">{entries.length}</span></div>
      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" multiple className="hidden" data-testid="library-upload-input"
        onChange={async (e) => { if (e.target.files) await importFiles(e.target.files); e.target.value = '' }} />
      <div className="grid grid-cols-3 gap-1.5">
          <button type="button" onClick={() => fileRef.current?.click()} data-testid="library-upload" aria-label="Upload images" title="Upload your own images (PNG, JPEG, WebP, SVG), or drop files here"
            className="flex aspect-[1.414] w-full items-center justify-center rounded border border-dashed border-white/25 text-slate-400 hover:border-sky-400 hover:text-sky-300"><Upload size={16} aria-hidden /></button>
          {entries.map((e) => (
            <div key={e.key} className="group relative">
            <button type="button" draggable onDragStart={(ev) => drag(ev, e)} onClick={() => void pick(e)} data-lib={'content' in e ? e.content.kind : 'image' in e ? 'image' : 'shot'}
              title={`${e.label}. Drag onto a frame${target ? ', or click to fill the selected frame' : ''}`} aria-label={e.label}
              className="cursor-grab overflow-hidden rounded border border-white/15 bg-white hover:border-sky-400 active:cursor-grabbing">
              {'content' in e ? <DrawingThumb c={e.content} evidence={evidence} d={d} />
                : <img src={'image' in e ? e.image.dataUrl : e.shot.dataUrl} alt="" draggable={false} className={`block aspect-[1.414] w-full ${'image' in e && e.image.vector ? 'object-contain' : 'object-cover'}`} />}
            </button>
            {'image' in e && <button type="button" onClick={() => removeImage(e.image.id)} aria-label={`Remove ${e.label}`} title="Remove from the library" className="absolute right-0.5 top-0.5 hidden rounded bg-slate-900/80 p-0.5 text-slate-200 hover:text-red-300 group-hover:block focus-visible:block"><X size={11} /></button>}
            </div>
          ))}
        </div>
    </div>
  )
}

/** A layout drawn as the sheet it makes: title band, image frames filled, text frames as lines. */
function LayoutThumb({ t }: { t: TemplateId }) {
  const text = new Set(TEMPLATES[t].text ?? [])
  return (
    <svg viewBox={`0 0 ${BOARD_W} ${BOARD_H}`} className="block w-full" aria-hidden="true">
      <rect x={0} y={0} width={BOARD_W} height={BOARD_H} rx={10} fill="currentColor" opacity={0.08} />
      {templateRects(t).map((r, i) => r.role === 'title'
        ? <rect key={i} x={r.x} y={r.y + 4} width={r.w * 0.45} height={r.h - 8} rx={4} fill="currentColor" opacity={0.85} />
        : text.has(i)
          ? <g key={i}>{Array.from({ length: Math.max(1, Math.floor((r.h - 8) / 26)) }, (_, k) => <rect key={k} x={r.x + 6} y={r.y + 8 + k * 26} width={(r.w - 12) * (k % 3 === 2 ? 0.6 : 1)} height={10} rx={5} fill="currentColor" opacity={0.55} />)}</g>
          : <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} rx={6} fill="currentColor" opacity={0.45} />)}
    </svg>
  )
}

function FrameInspector({ evidence, levels }: { evidence: Record<string, EvidenceSet>; levels: number }) {
  const { boards, selected, images, updateFrame, addImage } = useBoardStore()
  const user = useFonts((s) => s.user)
  const b: Board = boards[selected.board]
  const f = b.frames.find((x) => x.id === selected.frame)
  const set = (patch: Partial<Frame>) => f && updateFrame(selected.board, f.id, patch)
  const label = 'flex flex-col gap-1 text-xs'
  // Columns that can shrink below their content (the deliverable select's longest option used to widen the whole inspector past its 320 px, 17 Nov).
  const input = 'w-full min-w-0 max-w-full rounded border border-white/15 bg-slate-900 px-2 py-1 text-xs text-slate-100'
  return (
    f ? (
    <section className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 border-b border-white/10 p-3 text-slate-200" data-testid="frame-panel" aria-label="Selected frame">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold">{f.role === 'title' ? 'Title band' : 'Frame'} <span className="font-normal text-slate-400">· {Math.round(f.w)} × {Math.round(f.h)} mm</span></span>
        <button type="button" onClick={() => useBoardStore.getState().select(selected.board, null)} aria-label="Done with this frame" title="Done" className="rounded p-0.5 text-slate-400 hover:bg-white/10 hover:text-slate-100"><X size={13} /></button>
      </div>
        <div className="grid grid-cols-[minmax(0,1fr)] gap-3">
          {f.role === 'body' && (
            <div className="grid grid-cols-3 gap-1" role="radiogroup" aria-label="Frame content">
              {([['image', 'Image'], ['drawing', 'Drawing'], ['text', 'Text'], ['table', 'Table'], ['evidence', 'Evidence'], ['empty', 'Empty']] as const).map(([k, l]) => (
                <button key={k} type="button" role="radio" aria-checked={f.content.kind === k} data-content={k}
                  onClick={() => set({ content: k === 'text' ? { kind: 'text', text: '', sizeMm: 4.5 } : k === 'evidence' ? { kind: 'evidence', nodeId: Object.keys(evidence)[0] ?? '' } : k === 'drawing' ? (f.content.kind === 'drawing' ? f.content : { kind: 'drawing', vt: 'plan', level: 1 }) : k === 'table' ? { kind: 'table' } : k === 'image' ? (f.content.kind === 'image' ? f.content : { kind: 'empty' }) : { kind: 'empty' } })}
                  className={`min-w-0 truncate rounded border px-1 py-1 text-meta ${f.content.kind === k ? 'border-sky-500 bg-sky-600 text-white' : 'border-white/15 hover:border-sky-400'}`}>{l}</button>
              ))}
            </div>
          )}
          {f.content.kind === 'drawing' && (() => {
            const c = f.content
            return (
              <div className="grid gap-2">
                <label className={label}><span className="text-slate-400">Drawing</span>
                  <select value={c.vt} data-testid="drawing-kind" onChange={(e) => set({ content: { ...c, vt: e.target.value as typeof c.vt } })} className={input}>
                    <option value="context">Context plan</option><option value="site">Site plan</option><option value="plan">Floor plan</option><option value="roof">Roof plan</option><option value="elev">Elevation</option><option value="section">Section</option><option value="axo">Axonometric</option><option value="program">Program diagram</option>
                  </select>
                </label>
                {c.vt === 'plan' && <label className={label}><span className="text-slate-400">Level (1 to {levels})</span>
                  <input type="number" min={1} max={levels} value={c.level ?? 1} onChange={(e) => set({ content: { ...c, level: Math.max(1, Math.min(levels, Math.round(Number(e.target.value) || 1))) } })} className={`${input} w-24`} /></label>}
                {c.vt === 'section' && <label className={label}><span className="text-slate-400">Cut</span>
                  <select value={c.axis ?? 'long'} onChange={(e) => set({ content: { ...c, axis: e.target.value as 'long' | 'cross' } })} className={input}>
                    <option value="long">A–A, along the tower</option><option value="cross">B–B, across it</option>
                  </select></label>}
                {c.vt === 'elev' && <label className={label}><span className="text-slate-400">Seen from</span>
                  <select value={c.dir ?? 'N'} onChange={(e) => set({ content: { ...c, dir: e.target.value as 'N' | 'E' | 'S' | 'W' } })} className={input}>
                    <option value="N">North</option><option value="E">East</option><option value="S">South</option><option value="W">West</option>
                  </select></label>}
                <label className={label}><span className="text-slate-400">Scale at A2</span>
                  <select value={c.scale ?? ''} onChange={(e) => set({ content: { ...c, scale: e.target.value ? Number(e.target.value) : undefined } })} className={input}>
                    <option value="">Fit the frame</option>{SCALES.map((s) => <option key={s} value={s}>1:{s}</option>)}
                  </select></label>
                <p className="text-meta text-slate-400">Drawn from the design as it is now, in the board's style; it follows every change. Drag the frame to move it, its corner to resize it.</p>
              </div>
            )
          })()}
          {f.content.kind === 'table' && <p className="text-meta text-slate-400">One line per check with its reading and PASS / CHECK / NEAR, from the checks that are on.</p>}
          {f.content.kind === 'empty' && f.role === 'body' && <p className="text-meta text-slate-400">Drag a drawing or an image from the left onto this frame.</p>}
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
                {f.role === 'title'
                  ? <p className="text-meta text-slate-400">The title band shows the sheet name: type it under Sheet name below, or double-click the band on the board.</p>
                  : <label className={label}><span className="text-slate-400">Text</span>
                    <textarea value={c.text} rows={8} onChange={(e) => set({ content: { ...c, text: e.target.value } })} className={input} />
                  </label>}
                <div className="flex items-end gap-3">
                  <label className={label}><span className="text-slate-400">Type height (mm)</span>
                    <input type="number" min={2} max={24} step={0.5} value={c.sizeMm} onChange={(e) => set({ content: { ...c, sizeMm: Math.max(2, Math.min(24, Number(e.target.value) || c.sizeMm)) } })} className={`${input} w-20`} />
                  </label>
                  <label className="flex items-center gap-1.5 pb-1 text-xs"><input type="checkbox" checked={!!c.bold} onChange={() => set({ content: { ...c, bold: !c.bold } })} />Bold</label>
                </div>
                <FontPick id={`frame-${f.id}`} label="Font for this frame" value={c.font} user={user} allowDefault onPick={(family) => set({ content: { ...c, font: family } })} />
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
    </section>
    ) : null
  )
}

// The left panel (18 Nov, Sinnie: "sheet | style | render | export"): what goes on a sheet. The drawings, drawn from
// the model and always current, then the Library (uploads, captures from Model mode, renders, drawings already placed).
// Each drawing as a small picture of itself (Sinnie, 18 Nov: "ICONs and not text"); the name is the tooltip.
const DRAWING_ICONS: Record<string, ReactNode> = {
  'Site plan': <><rect x={3} y={4} width={18} height={16} strokeDasharray="2 1.6" /><rect x={8} y={8} width={7} height={8} fill="currentColor" /><path d="M18.5 6.5 v4 M17 8 l1.5-1.5 1.5 1.5" /></>,
  'Floor plan': <><rect x={3.5} y={4.5} width={17} height={15} strokeWidth={2.2} /><path d="M12 4.5 v8 M3.5 12.5 h5" strokeWidth={1.4} /><path d="M12 19.5 a5 5 0 0 0 -5 -5" strokeWidth={1} /></>,
  'Elevation': <><path d="M2 20.5 h20" strokeWidth={2.2} /><rect x={7.5} y={3.5} width={9} height={17} /><path d="M9.5 7 h5 M9.5 10 h5 M9.5 13 h5 M9.5 16 h5" strokeWidth={1} /></>,
  'Section': <><path d="M2 20.5 h20" strokeWidth={2.2} /><g fill="currentColor" stroke="none"><rect x={6.5} y={3} width={2.2} height={17.5} /><rect x={15.3} y={3} width={2.2} height={17.5} /><rect x={6.5} y={3} width={11} height={1.8} /><rect x={6.5} y={9} width={11} height={1.6} /><rect x={6.5} y={14.6} width={11} height={1.6} /></g><path d="M1.5 3 v3 M22.5 3 v3" strokeWidth={1} strokeDasharray="1.5 1" /></>,
  'Context plan': <><path d="M2 12 h20 M12 2 v20" strokeWidth={1} /><rect x={4} y={4} width={5} height={5} /><rect x={15} y={4} width={5} height={5} /><rect x={4} y={15} width={5} height={5} /><rect x={15} y={15} width={5} height={5} fill="currentColor" /></>,
  'Roof plan': <><rect x={3.5} y={5.5} width={17} height={13} /><path d="M3.5 5.5 l5 6.5 h7 l5 -6.5 M3.5 18.5 l5 -6.5 M15.5 12 l5 6.5" strokeWidth={1} /></>,
  'Axonometric': <><path d="M12 3 l8 4 v10 l-8 4 l-8 -4 V7 z" /><path d="M4 7 l8 4 l8 -4 M12 11 v10" /></>,
  'Program diagram': <><rect x={7} y={3} width={10} height={4.5} fill="currentColor" fillOpacity={0.35} /><rect x={7} y={7.5} width={10} height={6} fill="currentColor" fillOpacity={0.6} /><rect x={5} y={13.5} width={14} height={7} fill="currentColor" /></>,
  'Results table': <><rect x={3.5} y={4.5} width={17} height={15} /><path d="M3.5 9 h17 M3.5 14 h17 M10 4.5 v15" strokeWidth={1} /></>,
  'Text': <><path d="M4 5 h16 M12 5 v14" strokeWidth={2.2} /><path d="M9 19 h6" /></>,
}

function AddPanel({ levels, evidence }: { levels: number; evidence: Record<string, EvidenceSet> }) {
  const boards = useBoardStore((s) => s.boards)
  const selected = useBoardStore((s) => s.selected)
  const updateFrame = useBoardStore((s) => s.updateFrame)
  const nos = sheetNumbers(boards)
  const [note, setNote] = useState('')
  // Put a drawing, the table or text in the selected frame, else in the sheet's first empty frame.
  const put = (content: FrameContent, word: string) => {
    const b = boards[selected.board]
    const f = b.frames.find((x) => x.id === selected.frame && x.role === 'body') ?? b.frames.find((x) => x.role === 'body' && x.content.kind === 'empty')
    if (!f) { setNote('No empty frame here: drag it onto a frame instead.'); return }
    updateFrame(selected.board, f.id, { content })
    setNote(`${word} added to ${nos[selected.board]}.`)
  }
  const ADD: [string, FrameContent][] = [
    ['Site plan', { kind: 'drawing', vt: 'site' }], ['Floor plan', { kind: 'drawing', vt: 'plan', level: Math.max(1, Math.round(levels / 2)) }],
    ['Elevation', { kind: 'drawing', vt: 'elev', dir: 'S' }], ['Section', { kind: 'drawing', vt: 'section' }],
    ['Context plan', { kind: 'drawing', vt: 'context' }], ['Roof plan', { kind: 'drawing', vt: 'roof' }],
    ['Axonometric', { kind: 'drawing', vt: 'axo' }], ['Program diagram', { kind: 'drawing', vt: 'program' }],
    ['Results table', { kind: 'table' }], ['Text', { kind: 'text', text: '', sizeMm: 4.5 }],
  ]
  return (
    <aside className="flex w-64 shrink-0 flex-col overflow-y-auto border-r border-white/10" aria-label="Add to a sheet" data-testid="drawing-space">
      <div className="border-b border-white/10 p-3">
        <div className="mb-2 text-meta font-semibold text-slate-400">Drawings</div>
        <div className="grid grid-cols-5 gap-1" data-testid="space-add-list">
          {ADD.map(([word, c]) => <button key={word} type="button" draggable onDragStart={(e) => { e.dataTransfer.setData(DRAG, JSON.stringify({ content: c })); e.dataTransfer.effectAllowed = 'copy' }} onClick={() => put(c, word)} data-add={word} aria-label={word} title={`${word}: drag onto a frame, or click`} className="flex aspect-square cursor-grab items-center justify-center rounded-lg border border-white/15 text-slate-200 hover:border-sky-400 hover:text-sky-300 active:cursor-grabbing"><svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="miter" aria-hidden="true">{DRAWING_ICONS[word]}</svg></button>)}
        </div>
        {note && <p role="status" className="mt-2 text-meta text-emerald-300">{note}</p>}
      </div>
      <div className="p-3"><SheetLibrary evidence={evidence} /></div>
    </aside>
  )
}

/** A sheet drawn small in an orientation: the choice is the picture. */
function PageIcon({ o }: { o: Orientation }) {
  const w = o === 'landscape' ? 28 : 20, h = o === 'landscape' ? 20 : 28
  return <svg viewBox="0 0 32 32" className="h-7 w-7" aria-hidden="true"><rect x={(32 - w) / 2} y={(32 - h) / 2} width={w} height={h} rx={2} fill="none" stroke="currentColor" strokeWidth={1.6} /><rect x={(32 - w) / 2 + 3} y={(32 - h) / 2 + 3} width={w * 0.45} height={2.4} rx={1} fill="currentColor" /></svg>
}

const sectionCls = 'border-b border-white/10 p-3'
const headCls = 'mb-2 text-meta font-semibold text-slate-400'
const inputCls = 'w-full min-w-0 rounded border border-white/15 bg-slate-900 px-2 py-1 text-xs text-slate-100'
function Toggle({ on, onChange, label, testid }: { on: boolean; onChange: (v: boolean) => void; label: string; testid?: string }) {
  return (
    <label className="flex items-center justify-between gap-2 py-0.5 text-xs">
      <span>{label}</span>
      <button type="button" role="switch" aria-checked={on} aria-label={label} data-testid={testid} onClick={() => onChange(!on)}
        className={`relative h-4 w-7 shrink-0 rounded-full transition-colors ${on ? 'bg-sky-500' : 'bg-white/20'}`}><span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all ${on ? 'left-3.5' : 'left-0.5'}`} /></button>
    </label>
  )
}

// Sheet (18 Nov): the selected frame when there is one, then the sheet itself: its name, the sheet list, its layout,
// the page, the title block and how the drawings read.
function SheetTab({ evidence, levels }: { evidence: Record<string, EvidenceSet>; levels: number }) {
  const boards = useBoardStore((s) => s.boards)
  const selected = useBoardStore((s) => s.selected)
  const select = useBoardStore((s) => s.select)
  const setTemplate = useBoardStore((s) => s.setTemplate)
  const addBoard = useBoardStore((s) => s.addBoard)
  const removeBoard = useBoardStore((s) => s.removeBoard)
  const renameBoard = useBoardStore((s) => s.renameBoard)
  const sheet = useBoardStore((s) => s.sheet)
  const setSheet = useBoardStore((s) => s.setSheet)
  const orientation = useBoardStore((s) => s.orientation)
  const setOrientation = useBoardStore((s) => s.setOrientation)
  const tb = useBoardStore((s) => s.titleBlock)
  const setTitleBlock = useBoardStore((s) => s.setTitleBlock)
  const streetsWhite = useBoardStore((s) => s.streetsWhite)
  const setStreetsWhite = useBoardStore((s) => s.setStreetsWhite)
  const b = boards[selected.board]
  const nos = sheetNumbers(boards)
  if (!b) return null
  return (
    <div className="text-slate-200">
      <section className={sectionCls} data-testid="page-options">
        <div className={`${headCls} flex items-center justify-between`}><span>Page</span><span className="font-normal">{(() => { const s = SHEET_SIZES[sheet] ?? SHEET_SIZES.A2, arch = s.series === 'ARCH', [l, h] = s.mm.map((v) => (arch ? +(v / 25.4).toFixed(1) : v)); return orientation === 'portrait' ? `${h} × ${l} ${arch ? 'in' : 'mm'}` : `${l} × ${h} ${arch ? 'in' : 'mm'}` })()}</span></div>
        <div className="flex items-start gap-2">
          <div className="grid min-w-0 flex-1 gap-1" role="radiogroup" aria-label="Page size">
            {(['ISO', 'ARCH'] as const).map((series) => (
              <div key={series} className="flex items-center gap-1">
                <span className="w-9 shrink-0 text-meta text-slate-500">{series === 'ISO' ? 'A' : 'ARCH'}</span>
                <div className="flex flex-1 flex-wrap rounded-md border border-white/15 p-0.5">
                  {(Object.keys(SHEET_SIZES) as SheetSize[]).filter((k) => SHEET_SIZES[k].series === series).map((k) => (
                    <button key={k} type="button" role="radio" aria-checked={sheet === k} aria-label={k} onClick={() => setSheet(k)} data-size={k} title={SHEET_SIZES[k].label}
                      className={`flex-1 rounded px-1 py-1 text-xs ${sheet === k ? 'bg-white/15 text-white' : 'text-slate-300 hover:text-white'}`}>{SHEET_SIZES[k].short}</button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="flex shrink-0 flex-col rounded-md border border-white/15 p-0.5" role="radiogroup" aria-label="Orientation">
            {(['landscape', 'portrait'] as Orientation[]).map((o) => (
              <button key={o} type="button" role="radio" aria-checked={orientation === o} aria-label={o === 'landscape' ? 'Landscape' : 'Portrait'} title={o === 'landscape' ? 'Landscape' : 'Portrait'} onClick={() => setOrientation(o)} data-orientation={o}
                className={`rounded px-1 ${orientation === o ? 'bg-white/15 text-white' : 'text-slate-400'}`}><PageIcon o={o} /></button>
            ))}
          </div>
        </div>
        {(sheet !== 'A2' || orientation !== 'landscape') && <p className="mt-1.5 text-meta text-amber-300">The competition takes A2 landscape only.</p>}
      </section>
      <FrameInspector evidence={evidence} levels={levels} />
      <section className={sectionCls}>
        <label className="grid gap-1 text-xs"><span className={headCls.replace('mb-2 ', '')}>Sheet name <span className="font-normal">· also the board title</span></span>
          <input key={`${b.id}:${b.name ?? ''}`} defaultValue={b.name ?? ''} placeholder={boardName({ ...b, name: undefined }, selected.board)} maxLength={80} data-testid="board-name"
            onBlur={(e) => renameBoard(selected.board, e.target.value.trim())} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }} className={inputCls} />
        </label>
      </section>
      <section className={sectionCls}>
        <div className={`${headCls} flex items-center justify-between`}><span>Sheets</span><span className="font-normal" data-testid="sheet-count">{boards.length}</span></div>
        <ul className="grid gap-0.5" data-testid="sheet-list">
          {boards.map((x, i) => (
            <li key={x.id} className={`flex items-center gap-2 rounded-lg px-2 py-1 ${selected.board === i ? 'bg-white/10 ring-1 ring-white/20' : 'hover:bg-white/5'}`} data-sheet={i}>
              <button type="button" onClick={() => select(i, null)} className="shrink-0 font-mono text-meta text-slate-400" aria-label={`Open sheet ${nos[i]}`}>{nos[i]}</button>
              <button type="button" onClick={() => select(i, null)} className="min-w-0 flex-1 truncate text-left text-xs">{sheetName(x, i)}</button>
              <button type="button" onClick={() => removeBoard(i)} disabled={boards.length <= 1} aria-label={`Remove sheet ${nos[i]}`} title="Remove the sheet" className="shrink-0 rounded px-1 text-slate-400 hover:bg-white/10 hover:text-slate-100 disabled:opacity-30">×</button>
            </li>
          ))}
        </ul>
        <button type="button" onClick={addBoard} disabled={boards.length >= MAX_SHEETS} data-testid="sheet-add" className="mt-2 w-full rounded-lg border border-white/15 py-1.5 text-xs hover:border-sky-400 disabled:opacity-40">+ Add sheet</button>
        {boards.length !== 4 && <p className="mt-1 text-meta text-amber-300">The competition asks for four boards; you have {boards.length}.</p>}
      </section>
      <section className={sectionCls}>
        <div className={headCls}>Layout</div>
        <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Board template">
          {(Object.keys(TEMPLATES) as TemplateId[]).map((k) => (
            <button key={k} type="button" role="radio" aria-checked={b.template === k} aria-label={TEMPLATES[k].label} title={`${TEMPLATES[k].label}: ${TEMPLATES[k].hint}`} onClick={() => setTemplate(selected.board, k)} data-layout={k}
              className={`rounded border p-1 transition-colors ${b.template === k ? 'border-sky-400 bg-sky-500/15 text-sky-300' : 'border-white/15 text-slate-400 hover:border-sky-400 hover:text-slate-200'}`}>
              <LayoutThumb t={k} />
            </button>
          ))}
        </div>
      </section>
      <section className={sectionCls} data-testid="title-block-options">
        <div className={headCls}>Title block</div>
        <Toggle on={tb.show} onChange={(show) => setTitleBlock({ show })} label="Show" testid="tb-show" />
        {tb.show && <>
          <input value={tb.project} onChange={(e) => setTitleBlock({ project: e.target.value })} placeholder="Project name" aria-label="Project name" maxLength={60} className={`${inputCls} my-1`} data-testid="tb-project" />
          <Toggle on={tb.date} onChange={(date) => setTitleBlock({ date })} label="Date" />
          <Toggle on={tb.number} onChange={(number) => setTitleBlock({ number })} label="Sheet number" />
        </>}
      </section>
      <section className={sectionCls}>
        <div className={headCls}>Drawings</div>
        <Toggle on={streetsWhite} onChange={setStreetsWhite} label="Streets in white" testid="streets-white" />
      </section>
    </div>
  )
}

/** One style drawn as a corner of a sheet in its own paper, ink and cut colours. */
function StyleSwatch({ id }: { id: StyleId }) {
  const s = BOARD_STYLES[id]
  const cut = s.cut === 'hatch' || s.cut === 'use' ? s.ink : s.cut
  return (
    <svg viewBox="0 0 60 42" className="block w-full" aria-hidden="true">
      <rect width={60} height={42} rx={3} fill={s.paper} />
      <rect x={6} y={8} width={22} height={26} fill={s.ctx} stroke={s.soft} strokeWidth={0.6} />
      <rect x={12} y={14} width={10} height={14} fill={cut} stroke={s.ink} strokeWidth={s.w} />
      <path d="M34 34 V14 h8 v-6 h8 v26" fill={s.mass === 'use' ? '#e9c46a' : s.mass} stroke={s.ink} strokeWidth={s.w} />
      <line x1={4} y1={38} x2={56} y2={38} stroke={s.ink} strokeWidth={0.8} />
    </svg>
  )
}

// The four styles in Ruijie's original order, then the architectural one.
const STYLE_ORDER: StyleId[] = ['competition', 'technical', 'concept', 'blueprint', 'architectural']

type SetId = 'presentation' | 'drawings' | 'arch'
const SETS: { id: SetId; name: string; sheets: string; hint: string }[] = [
  { id: 'presentation', name: 'Presentation set', sheets: '4 boards', hint: 'The four competition boards in colour: the idea, the plans, section and elevations, performance. Uses your renders and the analysis you added.' },
  { id: 'arch', name: 'Architectural set', sheets: 'Cover to renders', hint: 'Cover, context and site plans, your analysis, program, floor plans, sections, axonometric and renders, in black and white with poché walls.' },
  { id: 'drawings', name: 'Drawing set', sheets: '5 sheets', hint: 'An axonometric cover with the site plan, floor plans, elevations, section and a sheet for analysis.' },
]

// Style (18 Nov): a ready set of sheets, the drawing style and the type.
function StyleTab({ onCreate, busy, msg }: { onCreate: (id: SetId) => void; busy: boolean; msg: string }) {
  const style = useBoardStore((s) => s.style)
  const setStyle = useBoardStore((s) => s.setStyle)
  const [pick, setPick] = useState<SetId>('presentation')
  return (
    <div className="text-slate-200">
      <section className={sectionCls}>
        <div className={headCls}>Sets</div>
        <div className="grid gap-1.5" role="radiogroup" aria-label="Sheet set">
          {SETS.map((x) => (
            <button key={x.id} type="button" role="radio" aria-checked={pick === x.id} onClick={() => setPick(x.id)} title={x.hint} data-set={x.id}
              className={`flex items-center justify-between rounded-lg border px-2.5 py-2 text-left ${pick === x.id ? 'border-sky-400 bg-sky-500/15' : 'border-white/15 hover:border-sky-400'}`}>
              <span className="text-xs font-medium">{x.name}</span><span className="text-meta text-slate-400">{x.sheets}</span>
            </button>
          ))}
        </div>
        <button type="button" onClick={() => onCreate(pick)} disabled={busy} data-testid="drawing-set"
          className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg bg-sky-600 py-2 text-xs font-medium text-white hover:bg-sky-500 disabled:opacity-50"><LayoutPanelTop size={13} />{busy ? 'Working…' : `Create ${SETS.find((x) => x.id === pick)!.name.toLowerCase()}`}</button>
        <p className="mt-1 text-meta text-slate-400">Replaces the sheets; your images stay in the Library.</p>
        {msg && <p role="status" className="mt-1 text-meta text-emerald-300">{msg}</p>}
      </section>
      <section className={sectionCls}>
        <div className={headCls}>Set style</div>
        <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="Set style" data-testid="board-style">
          {STYLE_ORDER.map((k) => (
            <button key={k} type="button" role="radio" aria-checked={style === k} aria-label={BOARD_STYLES[k].name} title={BOARD_STYLES[k].name} onClick={() => setStyle(k)} data-style={k}
              className={`overflow-hidden rounded-lg border p-1 text-left ${style === k ? 'border-sky-400 bg-sky-500/15 ring-2 ring-sky-400/40' : 'border-white/15 hover:border-sky-400'}`}>
              <StyleSwatch id={k} />
              <span className="mt-1 block truncate px-0.5 text-xs">{BOARD_STYLES[k].name}</span>
            </button>
          ))}
        </div>
        <p className="mt-1 text-meta text-slate-400">Applies to every sheet.</p>
      </section>
      <div className="p-3"><FontPanel /></div>
    </div>
  )
}

// One Present page (Sinnie, 13 Nov), reorganised 18 Nov ("sheet | style | render | export"): the sheets in the
// middle, what goes on them on the left, and four tabs on the right. No 3D view here: views are captured in Model mode.
type PanelTab = 'sheet' | 'style' | 'render' | 'export'
const PANEL_TABS: { id: PanelTab; word: string; hint: string }[] = [
  { id: 'sheet', word: 'Sheet', hint: 'Name, sheets, layout, page, title block' },
  { id: 'style', word: 'Style', hint: 'Sets, drawing style and type' },
  { id: 'render', word: 'Render', hint: 'AI render from a view captured in Model mode' },
  { id: 'export', word: 'Export', hint: 'Submission checks and the export' },
]
type ToolTab = 'render'

export default function BoardComposer({ tools }: { tools?: (tab: ToolTab) => ReactNode }) {
  return <ComposerBody tools={tools} />
}

function ComposerBody({ tools }: { tools?: (tab: ToolTab) => ReactNode }) {
  const open = true
  const boards = useBoardStore((s) => s.boards)
  const images = useBoardStore((s) => s.images)
  const selected = useBoardStore((s) => s.selected)
  const select = useBoardStore((s) => s.select)
  const updateFrame = useBoardStore((s) => s.updateFrame)
  const orientation = useBoardStore((s) => s.orientation)
  const evidence = useEvidence()
  const overflow = useOverflow(boards, images, evidence)
  const draw = useDrawData()
  const makeDrawingSet = useBoardStore((s) => s.makeDrawingSet)
  const levels = Math.max(1, ...draw.towers.map((t) => t.floors.length))
  const [setMsg, setSetMsg] = useState('')
  const [capturing, setCapturing] = useState(false)
  const say = (m: string, ms = 7000) => { setSetMsg(m); setTimeout(() => setSetMsg(''), ms) }
  // Analysis drawings only when the user added them from the model (17 Nov); renders: the AI renders, else the captures.
  const collect = async () => {
    const added = Object.values(useBoardStore.getState().images).filter((i) => i.id.startsWith('analysis-')).sort((a, b) => a.id.localeCompare(b.id))
    const shots = useStore.getState().shots
    const ai = [...await Promise.all(shots.filter((x) => x.ai).map(importShot)), ...Object.values(useBoardStore.getState().images).filter((i) => i.ai || i.source === 'ai').map((i) => i.id)]
    const renders = [...new Set(ai)].length ? [...new Set(ai)] : await Promise.all(shots.filter((x) => !x.ai && x.representation !== 'plan').slice(0, 4).map(importShot))
    return { added, renders }
  }
  const createSet = async (id: SetId) => {
    if (capturing) return
    const typ = Math.max(2, Math.round(levels / 2))
    if (id === 'drawings') { makeDrawingSet(typ, levels); say('Drawing set: five sheets.'); return }
    setCapturing(true)
    try {
      const { added, renders } = await collect()
      if (id === 'presentation') {
        useBoardStore.getState().makePresentationSet(typ, levels, { renders, analysis: added.map((i) => ({ imageId: i.id, caption: i.label })) })
        say(`Presentation set: four boards${renders.length ? `, ${renders.length} render${renders.length > 1 ? 's' : ''}` : ''}${added.length ? `, ${Math.min(4, added.length)} analysis drawing${added.length > 1 ? 's' : ''}` : ''}.`)
      } else {
        const groups = added.length ? [{ title: 'Analysis', items: added.map((i) => ({ imageId: i.id, caption: i.label })) }] : []
        useBoardStore.getState().makeArchSet(typ, levels, groups, { title: `${draw.towers[0]?.name ?? 'Tower'}: architectural set`, renders })
        say(`Architectural set: ${useBoardStore.getState().boards.length} sheets.`)
      }
    } catch (e) { say(`The set stopped: ${e instanceof Error ? e.message : String(e)}`) }
    setCapturing(false)
  }
  const [tab, setTab] = useState<PanelTab>('sheet')

  useEffect(() => { if (open) { void hydrateBoardImages(); void hydrateUserFonts() } }, [open])
  // Every face on offer loads with the composer (small files), so the picker shows each name in its face and the
  // previews and the fit measurement use the real font; a board's faces are loaded again before each export.
  const fonts = useBoardStore((s) => s.fonts)
  const user = useFonts((s) => s.user)
  useEffect(() => { void ensureFontsLoaded([...allFamilies(user), ...boards.flatMap((b) => familiesUsed(b, fonts))]) }, [fonts, user, boards])

  const place = (board: number, frame: string, imageId: string) => {
    const f = boards[board].frames.find((x) => x.id === frame)
    if (!f || f.role !== 'body') return
    const img = useBoardStore.getState().images[imageId]
    updateFrame(board, frame, { content: { kind: 'image', imageId, fit: img?.vector ? 'contain' : 'cover' } })
  }
  const onFrame = async (board: number, frame: string, e?: DragEvent) => {
    select(board, frame)
    setTab('sheet')
    if (!e) return
    if (e.dataTransfer.files.length) { const ids = await importFiles(e.dataTransfer.files); if (ids[0]) place(board, frame, ids[0]); return }
    const raw = e.dataTransfer.getData(DRAG)
    if (!raw) return
    const p = JSON.parse(raw) as { shot?: string; image?: string; content?: FrameContent }
    if (p.content) { const t = boards[board].frames.find((x) => x.id === frame); if (t?.role === 'body') updateFrame(board, frame, { content: p.content }) }
    else if (p.image) place(board, frame, p.image)
    else if (p.shot) { const shot = useStore.getState().shots.find((s) => s.id === p.shot); if (shot) place(board, frame, await importShot(shot)) }
  }

  return (
    <div role="region" aria-label="Presentation" data-testid="present-page" className="flex h-full w-full min-w-0 flex-col overflow-hidden rounded-2xl bg-[#15181c] text-slate-100">
      <header className="flex items-center gap-3 border-b border-white/10 px-3 py-2">
        <FileImage size={16} className="text-sky-400" />
        <div className="mr-2 shrink-0" title="The competition asks for four A2 landscape boards, ≤ 10 MB each (brief p.27)">
          <div className="text-sm font-semibold">Sheets</div>
          {boards.length <= 5 && <div className="whitespace-nowrap text-meta text-slate-400">Competition: four A2 boards, ≤ 10 MB each</div>}
        </div>
        <nav aria-label="Boards" className="flex min-w-0 gap-1 overflow-x-auto">
          {boards.map((b, i) => <Thumb key={b.id} index={i} evidence={evidence} active={selected.board === i} onClick={() => select(i, null)} rev={draw} />)}
        </nav>
        <button type="button" onClick={() => useBoardStore.getState().sortByName()} disabled={!boards.some((b) => b.name?.trim())} data-testid="boards-sort"
          title="Order the sheets by their names (numbers read as numbers: 2 before 10); unnamed sheets stay after the named ones"
          className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded border border-white/15 px-2 py-1 text-xs text-slate-200 hover:border-sky-400 disabled:opacity-40"><ArrowUpDown size={12} aria-hidden />Sort by name</button>
        <span className="mx-auto" />
        <div className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md border border-white/15 p-0.5" role="tablist" aria-label="Panel">
          {PANEL_TABS.filter((x) => x.id !== 'render' || tools).map((x) => (
            <button key={x.id} type="button" role="tab" aria-selected={tab === x.id} onClick={() => setTab(x.id)} data-testid={`panel-${x.id}`} title={x.hint}
              className={`rounded px-2.5 py-1 text-xs ${tab === x.id ? 'bg-white/15' : 'text-slate-300'}`}>{x.word}</button>
          ))}
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
        <AddPanel levels={levels} evidence={evidence} />
        <main className="flex min-w-0 flex-1 items-center justify-center overflow-hidden bg-[#2a2e34] p-6">
          <div className="flex h-full w-full items-center justify-center">
            <BoardCanvas key={orientation} index={selected.board} evidence={evidence} onFrame={onFrame} rev={draw} />
          </div>
        </main>
        <UiShow id="present.composer.inspector"><aside className="w-80 shrink-0 overflow-y-auto border-l border-white/10" aria-label={PANEL_TABS.find((x) => x.id === tab)!.word} data-testid={tab === 'render' ? 'present-tools-panel' : undefined}>
          {tab === 'sheet' ? <SheetTab evidence={evidence} levels={levels} /> : tab === 'style' ? <StyleTab onCreate={(id) => void createSet(id)} busy={capturing} msg={setMsg} />
            : tab === 'render' && tools ? tools('render') : <SubmissionPanel evidence={evidence} overflow={overflow} />}
        </aside></UiShow>
      </div>
    </div>
  )
}
