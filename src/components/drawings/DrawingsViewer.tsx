// Present → Drawings: typical floor plans per use zone, section A–A and two elevations of the selected tower, each on
// an A2 sheet at a standard scale. Export as SVG (prints at scale) or PNG, or add to the boards as a vector image.
import { Download, FileImage, LayoutGrid, Plus, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { VTC_NORTH_DEG } from '../../context'
import { elevationDrawing, mainFaces, sectionDrawing, type Drawing } from '../../engine/drawings'
import { towerFloors } from '../../engine/massing'
import { typicalFloor } from '../../engine/plan'
import { USES, type Tower } from '../../engine/types'
import { useBoardStore } from '../../lib/boardStore'
import { useStore, useTowers } from '../../store'
import PlanDrawing from '../PlanDrawing'
import { useUnits } from '../../lib/units'

type Choice = { kind: 'plan'; level: number; label: string } | { kind: 'section' } | { kind: 'elevation'; face: number }

/** One plan per use zone (its middle floor), sky lobbies, the podium and the top floor. */
export function planChoices(t: Tower): { level: number; label: string }[] {
  const floors = towerFloors(t)
  const out: { level: number; label: string }[] = []
  const seen = new Set<number>()
  const add = (level: number | undefined, label: string) => { if (level === undefined || seen.has(level)) return; seen.add(level); out.push({ level, label }) }
  const typ = typicalFloor(t)
  if (typ) add(typ.level, `Typical floor (${USES[typ.use].label.toLowerCase()})`)
  for (const use of [...new Set(floors.filter((f) => !f.podium && !f.skyLobby && f.use !== 'mechanical' && f.z0 > 0.5).map((f) => f.use))]) {
    const of = floors.filter((f) => f.use === use && !f.podium && !f.skyLobby && f.z0 > 0.5)
    add(of[Math.floor(of.length / 2)]?.level, `${USES[use].label} zone`)
  }
  for (const f of floors.filter((x) => x.skyLobby)) add(f.level, t.skyRoom?.level === f.level ? 'Public sky room' : 'Sky lobby')
  add(floors.find((f) => f.podium)?.level, 'Ground floor (podium)')
  add(floors[floors.length - 1]?.level, 'Top floor')
  return out
}

function download(href: string, name: string) { const a = document.createElement('a'); a.href = href; a.download = name; a.click() }
const svgUrl = (text: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(text)}`

async function svgToPng(text: string, widthMm: number, heightMm: number, dpi = 150): Promise<string> {
  const img = new Image()
  await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error('drawing failed to load')); img.src = svgUrl(text) })
  const c = document.createElement('canvas')
  c.width = Math.round((widthMm / 25.4) * dpi); c.height = Math.round((heightMm / 25.4) * dpi)
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, c.width, c.height)
  ctx.drawImage(img, 0, 0, c.width, c.height)
  return c.toDataURL('image/png')
}

/** The plan as standalone SVG text, read from the rendered component (sheet millimetres). */
function planText(root: HTMLElement | null): string | null {
  const svg = root?.querySelector('svg[data-plan-viewer]') as SVGSVGElement | null
  if (!svg) return null
  const clone = svg.cloneNode(true) as SVGSVGElement
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg'); clone.setAttribute('width', '594mm'); clone.setAttribute('height', '420mm'); clone.removeAttribute('class')
  return new XMLSerializer().serializeToString(clone)
}

export default function DrawingsViewer({ onClose }: { onClose: () => void }) {
  const towers = useTowers()
  const { selectedTower, project } = useStore()
  const t = towers.find((x) => x.id === selectedTower) ?? towers[0]
  const north = project === 'vtc' ? VTC_NORTH_DEG : 0
  const unit = useUnits((st) => st.unit)
  const opts = useMemo(() => ({ northDeg: north, projectLabel: project === 'vtc' ? 'Competition site (VTC)' : 'Real Vancouver', date: new Date().toISOString().slice(0, 10), unit }), [north, project, unit])
  const plans = useMemo(() => (t ? planChoices(t) : []), [t])
  const facesList = useMemo(() => (t ? mainFaces(t, north) : []), [t, north])
  const [choice, setChoice] = useState<Choice>(() => (plans[0] ? { kind: 'plan', ...plans[0] } : { kind: 'section' }))
  const [msg, setMsg] = useState('')
  const planRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); e.stopPropagation() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const built: { sheet: Drawing; tight: Drawing } | null = useMemo(() => {
    if (!t || choice.kind === 'plan') return null
    if (choice.kind === 'section') return { sheet: sectionDrawing(t, { ...opts, mode: 'sheet' }), tight: sectionDrawing(t, { ...opts, mode: 'tight' }) }
    const f = facesList[choice.face]
    return f ? { sheet: elevationDrawing(t, f, { ...opts, mode: 'sheet' }), tight: elevationDrawing(t, f, { ...opts, mode: 'tight' }) } : null
  }, [t, choice, opts, facesList])

  if (!t) return null
  const title = choice.kind === 'plan' ? `Floor plan, level ${choice.level}` : built?.sheet.title ?? ''
  const fileBase = (choice.kind === 'plan' ? `floor-plan-L${choice.level}` : title.toLowerCase().replace(/[^a-z0-9]+/g, '-')).replace(/-+$/, '')
  const sheetText = () => (choice.kind === 'plan' ? planText(planRef.current) : built?.sheet.svg ?? null)

  const saveSvg = () => { const s = sheetText(); if (!s) return; const u = URL.createObjectURL(new Blob([s], { type: 'image/svg+xml' })); download(u, `${fileBase}.svg`); setTimeout(() => URL.revokeObjectURL(u), 3000) }
  const savePng = async () => { const s = sheetText(); if (!s) return; download(await svgToPng(s, 594, 420), `${fileBase}.png`) }
  const addToBoard = () => {
    // Section and elevations go in tight (the drawing only); a plan goes as its sheet. Both stay vector.
    const text = choice.kind === 'plan' ? planText(planRef.current) : built?.tight.svg ?? null
    if (!text) return
    const wMm = choice.kind === 'plan' ? 594 : built!.tight.widthMm, hMm = choice.kind === 'plan' ? 420 : built!.tight.heightMm
    const scale = choice.kind === 'plan' ? null : built!.tight.scale
    useBoardStore.getState().addImage({ id: `drawing-${fileBase}-${Date.now()}`, dataUrl: svgUrl(text), w: Math.round(wMm * 10), h: Math.round(hMm * 10), source: 'capture', label: `${title}${scale ? `, drawn at 1:${scale}` : ''} (vector)`, vector: true })
    setMsg(`Added "${title}" to the board library. Open the board composer to place it.`)
  }

  const item = (active: boolean) => `w-full rounded px-2 py-1.5 text-left text-xs ${active ? 'bg-white/15 text-white' : 'text-slate-300 hover:bg-white/5'}`
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Drawings" className="fixed inset-0 z-[80] flex flex-col bg-[#15181c] text-slate-100">
      <header className="flex items-center gap-3 border-b border-white/10 px-3 py-2">
        <FileImage size={16} className="text-sky-400" />
        <div>
          <div className="text-sm font-semibold">Drawings · {t.name}</div>
          <div className="text-[10px] text-slate-400">Generated from the massing at a standard scale on A2 · LOD 100, a schematic space reservation</div>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <button type="button" onClick={saveSvg} className="flex items-center gap-1.5 rounded border border-white/15 px-2.5 py-1.5 text-xs hover:border-sky-400"><Download size={13} />SVG, to scale</button>
          <button type="button" onClick={savePng} className="flex items-center gap-1.5 rounded border border-white/15 px-2.5 py-1.5 text-xs hover:border-sky-400"><Download size={13} />PNG</button>
          <button type="button" onClick={addToBoard} className="flex items-center gap-1.5 rounded bg-sky-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-sky-500"><Plus size={13} />Add to board</button>
          <button type="button" onClick={() => { onClose(); useBoardStore.getState().setOpen(true) }} className="flex items-center gap-1.5 rounded border border-white/15 px-2.5 py-1.5 text-xs hover:border-sky-400"><LayoutGrid size={13} />Board composer</button>
          <button type="button" onClick={onClose} aria-label="Close drawings (Esc)" className="rounded p-1.5 text-slate-300 hover:bg-white/10"><X size={16} /></button>
        </div>
      </header>
      {msg && <div className="border-b border-white/10 bg-emerald-500/10 px-3 py-1 text-[11px] text-emerald-200">{msg}</div>}
      <div className="flex min-h-0 flex-1">
        <nav aria-label="Drawing list" className="w-60 shrink-0 overflow-y-auto border-r border-white/10 p-3">
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Floor plans</div>
          {plans.map((p) => <button key={p.level} type="button" onClick={() => setChoice({ kind: 'plan', ...p })} className={item(choice.kind === 'plan' && choice.level === p.level)}>{p.label} · L{p.level}</button>)}
          <div className="mb-1.5 mt-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Section</div>
          <button type="button" onClick={() => setChoice({ kind: 'section' })} className={item(choice.kind === 'section')}>Section A–A, through the core</button>
          <div className="mb-1.5 mt-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Elevations</div>
          {facesList.map((f, i) => <button key={f.index} type="button" onClick={() => setChoice({ kind: 'elevation', face: i })} className={item(choice.kind === 'elevation' && choice.face === i)}>{f.name}</button>)}
          <p className="mt-4 text-[10px] leading-snug text-slate-400">Every drawing carries the LOD 100 note: floors, core and plant come from the massing and team presets, and the structure is not sized. SVG files print at the stated scale; on a board, the scale bar stays true.</p>
        </nav>
        <main className="flex min-w-0 flex-1 items-center justify-center overflow-auto bg-[#2a2e34] p-6">
          <div className="aspect-[594/420] w-full max-w-[min(100%,calc((100vh-9rem)*1.414))] bg-white shadow-2xl">
            {choice.kind === 'plan'
              ? <div ref={planRef} className="h-full w-full"><PlanDrawing level={choice.level} standalone /></div>
              : <div className="h-full w-full [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: built?.sheet.svg ?? '' }} />}
          </div>
        </main>
      </div>
    </div>,
    document.body,
  )
}
