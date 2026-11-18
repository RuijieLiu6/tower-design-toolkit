// Board composer (research P13-M06a, thin form): four A2 landscape boards in templates; drop shots, renders and vector
// floor plans into frames, write titles and text, add evidence frames from the checks, tag each frame with the brief's
// deliverable it shows. Checks and export are in SubmissionPanel.
import { ArrowUpDown, ChevronDown, FileImage, LayoutPanelTop, ListChecks, Sparkles, Trash2, Upload, X } from '../icons'
import { useEffect, useRef, useState, type ReactNode, type DragEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { A2_RATIO, BOARD_H, BOARD_W, DELIVERABLES, MAX_SHEETS, SHEET_SIZES, SOURCE_LABEL, TEMPLATES, boardName, templateRects, familiesUsed, imageSource, sheetName, sheetNumbers, type FrameContent, type SheetSize, type Board, type BoardImage, type DeliverableId, type Frame, type ImageSource, type TemplateId } from '../../engine/boards'
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
    </div>
  )
}

/**
 * One board's tab (Ruijie, 17 Nov: boards can be renamed and rearranged): its preview and its name. Click selects;
 * double-click the name (or F2) renames, Enter keeps, Esc drops; drag a tab onto another, or Alt+← / Alt+→, to move it.
 */
function Thumb({ index, evidence, active, onClick, rev }: { index: number; evidence: Record<string, EvidenceSet>; active: boolean; onClick: () => void; rev?: DrawData }) {
  const style = useBoardStore((s) => s.style)
  const board = useBoardStore((s) => s.boards[index])
  const count = useBoardStore((s) => s.boards.length)
  const renameBoard = useBoardStore((s) => s.renameBoard)
  const move = useBoardStore((s) => s.moveBoard)
  const [editing, setEditing] = useState(false)
  const [over, setOver] = useState(false)
  const name = boardName(board, index)
  const keep = (v: string) => { renameBoard(index, v.trim()); setEditing(false) }
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
    <div data-testid="board-tab" data-board-name={name} draggable={!editing}
      onDragStart={(e) => { e.dataTransfer.setData(BOARD_DRAG, String(index)); e.dataTransfer.effectAllowed = 'move' }}
      onDragOver={(e) => { if (e.dataTransfer.types.includes(BOARD_DRAG)) { e.preventDefault(); setOver(true) } }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { setOver(false); const from = Number(e.dataTransfer.getData(BOARD_DRAG)); if (Number.isInteger(from)) { e.preventDefault(); move(from, index) } }}
      className={`flex w-[92px] flex-col items-center gap-1 rounded p-1 text-meta ${active ? 'bg-white/15 text-white' : 'text-slate-300 hover:bg-white/5'} ${over ? 'outline outline-2 outline-sky-400' : ''}`}>
      <button type="button" onClick={onClick} aria-pressed={active} aria-label={`${name}: board ${index + 1} of ${count}`} title="Click to open · double-click the name or F2 to rename · drag or Alt+← → to move"
        onKeyDown={(e) => {
          if (e.key === 'F2') { e.preventDefault(); setEditing(true) }
          if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { e.preventDefault(); move(index, index + (e.key === 'ArrowLeft' ? -1 : 1)) }
        }}
        className="rounded-[2px] outline-none focus-visible:ring-2 focus-visible:ring-sky-400">
        <canvas ref={ref} className={`h-[52px] w-[74px] rounded-[2px] ${active ? 'ring-2 ring-sky-500' : 'ring-1 ring-white/20'}`} />
      </button>
      {editing
        ? <input autoFocus defaultValue={board.name ?? ''} placeholder={boardName({ ...board, name: undefined }, index)} aria-label={`Name of board ${index + 1}`} maxLength={80} data-testid="board-name-input"
            onBlur={(e) => keep(e.target.value)} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') keep(e.currentTarget.value); if (e.key === 'Escape') setEditing(false) }}
            className="w-full min-w-0 rounded border border-sky-400 bg-slate-900 px-1 text-center text-meta text-slate-100 outline-none" />
        : <span onDoubleClick={() => setEditing(true)} className="w-full cursor-text truncate text-center" title={name}>{name}</span>}
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
  useEffect(() => {
    const el = ref.current, ctx = el?.getContext('2d')
    if (!el || !ctx) return
    const W = 150, H = W / A2_RATIO, k = el.width / W, st = BOARD_STYLES[style] ?? BOARD_STYLES.competition
    ctx.fillStyle = st.paper; ctx.fillRect(0, 0, el.width, el.height)
    const f = { x: 0, y: 0, w: W, h: H }
    if (c.kind === 'drawing') drawDrawing(ctx, k, f, c, d, st, 1)
    else if (c.kind === 'table') drawTable(ctx, k, f, Object.values(evidence).map((s) => [s.name, '', s.rules.some((r) => r.state === 'fail') ? 'fail' : 'pass'] as [string, string, 'pass' | 'fail']), st)
  }, [c, style, d, evidence])
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
  const { boards, selected, images, updateFrame, addImage, setTemplate } = useBoardStore()
  const user = useFonts((s) => s.user)
  const b: Board = boards[selected.board]
  const f = b.frames.find((x) => x.id === selected.frame)
  const set = (patch: Partial<Frame>) => f && updateFrame(selected.board, f.id, patch)
  const label = 'flex flex-col gap-1 text-xs'
  // Columns that can shrink below their content (the deliverable select's longest option used to widen the whole inspector past its 320 px, 17 Nov).
  const input = 'w-full min-w-0 max-w-full rounded border border-white/15 bg-slate-900 px-2 py-1 text-xs text-slate-100'
  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 p-3 text-slate-200">
      <div>
        <label className={`${label} mb-3`}>Sheet name
          <input key={b.id} defaultValue={b.name ?? ''} placeholder={boardName({ ...b, name: undefined }, selected.board)} maxLength={80} data-testid="board-name"
            onBlur={(e) => useBoardStore.getState().renameBoard(selected.board, e.target.value.trim())} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
            className={input} />
          <span className="text-meta text-slate-400">Shown on its tab and used for the file name; Sort by name orders the boards by it. Not printed on the board.</span>
        </label>
        <div className="mb-1.5 text-meta font-semibold text-slate-400">{boardName(b, selected.board)} layout</div>
        <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Board template">
          {(Object.keys(TEMPLATES) as TemplateId[]).map((t) => (
            <button key={t} type="button" role="radio" aria-checked={b.template === t} aria-label={TEMPLATES[t].label} title={`${TEMPLATES[t].label}: ${TEMPLATES[t].hint}`} onClick={() => setTemplate(selected.board, t)} data-layout={t}
              className={`rounded border p-1 transition-colors ${b.template === t ? 'border-sky-400 bg-sky-500/15 text-sky-300' : 'border-white/15 text-slate-400 hover:border-sky-400 hover:text-slate-200'}`}>
              <LayoutThumb t={t} />
            </button>
          ))}
        </div>
      </div>
      <SheetLibrary evidence={evidence} />
      <FontPanel />
      {!f && <p className="text-xs text-slate-400">Select a frame on the board to fill it.</p>}
      {f && (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-3">
          <div className="text-meta font-semibold text-slate-400">{f.role === 'title' ? 'Title band' : 'Frame'} · {Math.round(f.w)} × {Math.round(f.h)} mm</div>
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
      )}
    </div>
  )
}

// The Tower Workspace's "Drawing space" panel (Sinnie, 13 Nov: "add this tab to the current set"): Sheets = the drawing
// set (style, sheet size), the sheet list (number, name, remove, blank sheet) and Create drawing set; Add = what goes on
// a sheet (a drawing, the results table, text, an image from the library).
function SheetsPanel({ levels, onCreate, msg, preset, setPreset, busy }: { levels: number; onCreate: () => void; msg: string; preset: 'drawings' | 'arch'; setPreset: (p: 'drawings' | 'arch') => void; busy: boolean }) {
  const [tab, setTab] = useState<'sheets' | 'add'>('sheets')
  const boards = useBoardStore((s) => s.boards)
  const selected = useBoardStore((s) => s.selected)
  const select = useBoardStore((s) => s.select)
  const style = useBoardStore((s) => s.style)
  const setStyle = useBoardStore((s) => s.setStyle)
  const sheet = useBoardStore((s) => s.sheet)
  const setSheet = useBoardStore((s) => s.setSheet)
  const addBoard = useBoardStore((s) => s.addBoard)
  const removeBoard = useBoardStore((s) => s.removeBoard)
  const renameBoard = useBoardStore((s) => s.renameBoard)
  const updateFrame = useBoardStore((s) => s.updateFrame)
  const nos = sheetNumbers(boards)
  const [note, setNote] = useState('')
  const sel = 'w-full rounded-lg border border-white/15 bg-slate-900 px-2 py-1.5 text-xs text-slate-100'
  // Put a drawing, the table or text in the selected frame, else in the sheet's first empty frame.
  const put = (content: FrameContent, word: string) => {
    const b = boards[selected.board]
    const f = b.frames.find((x) => x.id === selected.frame && x.role === 'body') ?? b.frames.find((x) => x.role === 'body' && x.content.kind === 'empty')
    if (!f) { setNote('This sheet has no empty frame: select a frame to replace, or add a blank sheet.'); return }
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
    <aside className="flex w-64 shrink-0 flex-col border-r border-white/10" aria-label="Drawing space" data-testid="drawing-space">
      <div className="flex gap-1 border-b border-white/10 p-2" role="tablist" aria-label="Drawing space">
        {(['sheets', 'add'] as const).map((k) => <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} data-testid={`space-${k}`} className={`rounded-md px-2.5 py-1 text-xs ${tab === k ? 'bg-white/15' : 'text-slate-300 hover:bg-white/5'}`}>{k === 'sheets' ? 'Sheets' : 'Add'}</button>)}
      </div>
      {tab === 'sheets' ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto">
            <details open className="border-b border-white/10 p-3">
              <summary className="cursor-pointer text-xs font-semibold">Drawing set</summary>
              <label className="mt-2 grid gap-1 text-meta text-slate-400">Architectural style
                <select value={style} onChange={(e) => setStyle(e.target.value as StyleId)} data-testid="board-style" className={sel}>{(Object.keys(BOARD_STYLES) as StyleId[]).map((k) => <option key={k} value={k}>{BOARD_STYLES[k].name}</option>)}</select>
              </label>
              <label className="mt-2 grid gap-1 text-meta text-slate-400">Sheet size
                <select value={sheet} onChange={(e) => setSheet(e.target.value as SheetSize)} data-testid="sheet-size" className={sel}>{(Object.keys(SHEET_SIZES) as SheetSize[]).map((k) => <option key={k} value={k}>{SHEET_SIZES[k].label}</option>)}</select>
              </label>
              {sheet !== 'A2' && <p className="mt-1 text-meta text-amber-300">The competition takes A2 only; this size is for your own prints.</p>}
            </details>
            <details open className="border-b border-white/10 p-3">
              <summary className="flex cursor-pointer items-center justify-between text-xs font-semibold"><span>Sheets</span><span className="font-normal text-slate-400" data-testid="sheet-count">{boards.length}</span></summary>
              <ul className="mt-2 grid gap-0.5" data-testid="sheet-list">
                {boards.map((b, i) => (
                  <li key={b.id} className={`flex items-center gap-2 rounded-lg px-2 py-1 ${selected.board === i ? 'bg-white/10 ring-1 ring-white/20' : 'hover:bg-white/5'}`} data-sheet={i}>
                    <button type="button" onClick={() => select(i, null)} className="shrink-0 font-mono text-meta text-slate-400" aria-label={`Open sheet ${nos[i]}`}>{nos[i]}</button>
                    <input value={sheetName(b, i)} onFocus={() => select(i, null)} onChange={(e) => renameBoard(i, e.target.value)} aria-label={`Name of sheet ${nos[i]}`} className="min-w-0 flex-1 truncate bg-transparent text-xs text-slate-100 outline-none focus:underline" />
                    <button type="button" onClick={() => removeBoard(i)} disabled={boards.length <= 1} aria-label={`Remove sheet ${nos[i]}`} title="Remove the sheet (its contents are kept aside)" className="shrink-0 rounded px-1 text-slate-400 hover:bg-white/10 hover:text-slate-100 disabled:opacity-30">×</button>
                  </li>
                ))}
              </ul>
              <button type="button" onClick={addBoard} disabled={boards.length >= MAX_SHEETS} data-testid="sheet-add" className="mt-2 w-full rounded-lg border border-white/15 py-1.5 text-xs hover:border-sky-400 disabled:opacity-40">+ Blank sheet</button>
              {boards.length !== 4 && <p className="mt-1 text-meta text-amber-300">The competition asks for four boards; you have {boards.length}.</p>}
            </details>
            {msg && <p role="status" className="p-3 text-meta text-emerald-300">{msg}</p>}
          </div>
          <div className="grid gap-1.5 border-t border-white/10 p-2">
            <label className="grid gap-1 text-meta text-slate-400">Preset
              <select value={preset} onChange={(e) => setPreset(e.target.value as 'drawings' | 'arch')} data-testid="set-preset" className={sel}>
                <option value="drawings">Drawing set · five sheets</option>
                <option value="arch">Architectural set · cover to renders, black and white</option>
              </select>
            </label>
            <button type="button" onClick={onCreate} disabled={busy} data-testid="drawing-set" title={preset === 'arch' ? 'Cover, context plan, site plan, analysis drawings, program diagram, floor plans (ground, typical mid, typical high, roof), two sections, exterior axonometric and renders, in black and white with poché walls' : 'An axonometric cover with the site plan, floor plans, elevations, section, and a sheet for analysis: five sheets drawn from the model in this style'}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-white/10 py-2 text-xs font-medium hover:bg-white/15"><LayoutPanelTop size={13} />{busy ? 'Working…' : preset === 'arch' ? 'Create architectural set' : 'Create drawing set'}</button>
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="border-b border-white/10 p-3">
            <div className="text-xs font-semibold">On {nos[selected.board]}</div>
            <div className="mt-2 grid grid-cols-2 gap-1" data-testid="space-add-list">
              {ADD.map(([word, c]) => <button key={word} type="button" draggable onDragStart={(e) => { e.dataTransfer.setData(DRAG, JSON.stringify({ content: c })); e.dataTransfer.effectAllowed = 'copy' }} onClick={() => put(c, word)} data-add={word} title="Click to add to this sheet, or drag onto a frame" className="cursor-grab rounded-lg border border-white/15 px-2 py-1.5 text-left text-xs hover:border-sky-400 active:cursor-grabbing">{word}</button>)}
            </div>
            {note && <p role="status" className="mt-2 text-meta text-emerald-300">{note}</p>}
          </div>
        </div>
      )}
    </aside>
  )
}

// One Present page (Sinnie, 13 Nov: "merge the presentation layout into the old toolkit present page, i dont want two
// separate one"): the sheets ARE the Present page, inside the workspace under the top bar. The old page's 3D view is
// the centre's second view (to frame and capture shots) and its Present / Render / Results / Trace panel is the right
// side's third tab.
/** The right side's tabs (18 Nov, one row, no tabs inside tabs): Compose and Check are the sheets'; the others are the old Present panel's. */
type PanelTab = 'frame' | 'views' | 'render' | 'results' | 'trace' | 'submit'
const PANEL_TABS: { id: PanelTab; word: string; hint: string }[] = [
  { id: 'frame', word: 'Compose', hint: 'Layout, library and the selected frame' },
  { id: 'views', word: 'Views', hint: 'Representation, camera presets and capture; shows the 3D view' },
  { id: 'render', word: 'Render', hint: 'AI render from a capture; shows the 3D view' },
  { id: 'results', word: 'Results', hint: 'The analysis results and their drawings' },
  { id: 'trace', word: 'Trace', hint: 'Where each number comes from' },
  { id: 'submit', word: 'Check and export', hint: 'Submission checks, deliverables and the JPEG export' },
]
const TOOL_TAB = { views: 'present', render: 'render', results: 'results', trace: 'trace' } as const
type ToolTab = (typeof TOOL_TAB)[keyof typeof TOOL_TAB]

export default function BoardComposer({ viewport, tools }: { viewport?: ReactNode; tools?: (tab: ToolTab) => ReactNode }) {
  return <ComposerBody viewport={viewport} tools={tools} />
}

function ComposerBody({ viewport, tools }: { viewport?: ReactNode; tools?: (tab: ToolTab) => ReactNode }) {
  const open = true
  const boards = useBoardStore((s) => s.boards)
  const images = useBoardStore((s) => s.images)
  const selected = useBoardStore((s) => s.selected)
  const select = useBoardStore((s) => s.select)
  const updateFrame = useBoardStore((s) => s.updateFrame)
  const evidence = useEvidence()
  const overflow = useOverflow(boards, images, evidence)
  const draw = useDrawData()
  const makeDrawingSet = useBoardStore((s) => s.makeDrawingSet)
  const levels = Math.max(1, ...draw.towers.map((t) => t.floors.length))
  const [setMsg, setSetMsg] = useState('')
  // Presets (13 Nov): the five-sheet drawing set, or the Architectural set with every workflow tool's drawings.
  const [preset, setPreset] = useState<'drawings' | 'arch'>('drawings')
  const [capturing, setCapturing] = useState(false)
  const createArch = async () => {
    if (capturing) return
    setCapturing(true); setSetMsg('Collecting the drawings…')
    await new Promise((r) => setTimeout(r, 300))
    try {
      // 17 Nov (Sinnie): analysis drawings only when the user added them from the model ("Sheet" on a drawing).
      const added = Object.values(useBoardStore.getState().images).filter((i) => i.id.startsWith('analysis-')).sort((a, b) => a.id.localeCompare(b.id))
      const groups = added.length ? [{ title: 'Analysis', items: added.map((i) => ({ imageId: i.id, caption: i.label })) }] : []
      // Renders: the AI renders among the shots and the library, else the 3D views captured (never plans).
      const shots = useStore.getState().shots
      const ai = [...await Promise.all(shots.filter((x) => x.ai).map(importShot)), ...Object.values(useBoardStore.getState().images).filter((i) => i.ai || i.source === 'ai').map((i) => i.id)]
      const renders = [...new Set(ai)].length ? [...new Set(ai)] : await Promise.all(shots.filter((x) => !x.ai && x.representation !== 'plan').slice(0, 4).map(importShot))
      useBoardStore.getState().makeArchSet(Math.max(2, Math.round(levels / 2)), levels, groups, { title: `${draw.towers[0]?.name ?? 'Tower'}: architectural set`, renders })
      const n = groups.reduce((a, g) => a + g.items.length, 0)
      setSetMsg(`Architectural set: ${useBoardStore.getState().boards.length} sheets${n ? `, ${n} analysis drawing${n > 1 ? 's' : ''} you added` : ', no analysis sheet (add drawings with Sheet in the model)'}${renders.length ? `, ${renders.length} render${renders.length > 1 ? 's' : ''}` : ', render frames left empty'}.`)
    } catch (e) { setSetMsg(`The set stopped: ${e instanceof Error ? e.message : String(e)}`) }
    setCapturing(false)
    setTimeout(() => setSetMsg(''), 9000)
  }
  const createSet = () => {
    if (preset === 'arch') { void createArch(); return }
    const used = boards.slice(0, 5).some((b) => b.frames.some((f) => f.role === 'body' && f.content.kind !== 'empty'))
    makeDrawingSet(Math.max(2, Math.round(levels / 2)), levels)
    setSetMsg(used ? 'Five sheets now hold the drawing set; earlier images stay in the library.' : 'Drawing set created: five sheets.')
    setTimeout(() => setSetMsg(''), 5000)
  }
  const [centre, setCentre] = useState<'sheet' | '3d'>('sheet')
  const [tab, setTabRaw] = useState<PanelTab>('frame')
  // Views and Render work on the 3D view, Compose and Check on the sheet: the centre follows (the Sheet | 3D switch stays).
  const setTab = (k: PanelTab) => { setTabRaw(k); if (k === 'views' || k === 'render') setCentre('3d'); else if (k === 'frame' || k === 'submit') setCentre('sheet') }

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
    setTab('frame')
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
        <div className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md border border-white/15 p-0.5" role="tablist" aria-label="Centre view">
          {([['sheet', 'Sheet'], ['3d', '3D view']] as const).map(([k, w]) => <button key={k} type="button" role="tab" aria-selected={centre === k} onClick={() => setCentre(k)} data-testid={`centre-${k}`} title={k === '3d' ? 'Frame the model and capture shots for the sheets' : 'The sheet being composed'} className={`rounded px-2 py-1 text-xs ${centre === k ? 'bg-white/15' : 'text-slate-300'}`}>{w}</button>)}
        </div>
        <div className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md border border-white/15 p-0.5" role="tablist" aria-label="Panel">
          {PANEL_TABS.filter((x) => x.id === 'frame' || x.id === 'submit' || tools).map((x) => (
            <button key={x.id} type="button" role="tab" aria-selected={tab === x.id} onClick={() => setTab(x.id)} data-testid={`panel-${x.id}`} title={x.hint}
              className={`flex items-center gap-1 rounded px-2 py-1 text-xs ${tab === x.id ? 'bg-white/15' : 'text-slate-300'}`}>{x.id === 'submit' && <ListChecks size={12} />}{x.word}</button>
          ))}
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
        <SheetsPanel levels={levels} onCreate={createSet} msg={setMsg} preset={preset} setPreset={setPreset} busy={capturing} />
        {/* While the Architectural set is made, the results of each workflow tool are drawn here, out of sight. */}
        {centre === '3d' && viewport
          ? <main className="min-w-0 flex-1 overflow-hidden bg-panel text-ink" data-testid="present-3d">{viewport}</main>
          : <main className="flex min-w-0 flex-1 items-center justify-center overflow-hidden bg-[#2a2e34] p-6">
          <div className="flex h-full w-full items-center justify-center">
            <BoardCanvas index={selected.board} evidence={evidence} onFrame={onFrame} rev={draw} />
          </div>
        </main>}
        {tab !== 'frame' && tab !== 'submit' && tools ? <div className="flex shrink-0 text-ink" data-testid="present-tools-panel">{tools(TOOL_TAB[tab])}</div> : (
        <UiShow id="present.composer.inspector"><aside className="w-80 shrink-0 overflow-y-auto border-l border-white/10" aria-label={tab === 'frame' ? 'Frame' : 'Check and export'}>
          {tab === 'frame' ? <FrameInspector evidence={evidence} levels={levels} /> : <SubmissionPanel evidence={evidence} overflow={overflow} />}
        </aside></UiShow>
        )}
      </div>
    </div>
  )
}
