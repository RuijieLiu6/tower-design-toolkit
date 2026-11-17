// A project opens with no tower (Ruijie, 6 Nov: "start the project with no tower, and then introduce the placing tower
// experience"). The Form step leads with one card: "Place a tower" puts the project's starting tower on the site
// (the study site's centre in Real Vancouver, the competition block otherwise), then the usual placing follows: click
// the ground where it goes, Confirm in the toolbar, or Esc to keep it where it stands. Other steps say where to start.
import { lazy, Suspense, useState } from 'react'
import { ArrowLeft, BookOpen, Building2, Crosshair, FileUp, LayoutGrid, MapPin, Wand2 } from '../icons'
import { setTool, toast } from '../../lib/drawTools'
import { CASE_STUDIES, type CaseStudy } from '../../data/caseStudies'
import { useTransfer } from '../../lib/porting/transfer'
import { breakStep } from '../../lib/project/history'
import { FlagChip } from '../ui'
import { useShallow } from 'zustand/react/shallow'
import { defaultTower, useStore } from '../../store'
import { goToStep } from '../../lib/step'
import Help from '../Help'
import { flyToFit } from '../VistaLook'

/** Places the starting tower (with `patch`, a case study's form) and starts placing it; Real Vancouver frames it. */
export function placeFirstTower(patch?: Partial<import('../../engine/types').Tower>) {
  const s = useStore.getState()
  breakStep()
  s.addTower()
  if (patch) { const id = useStore.getState().selectedTower; useStore.getState().updateTower(id, patch) }
  breakStep()
  const st = useStore.getState()
  const t = st.towers[st.project].find((x) => x.id === st.selectedTower)
  st.set({ placing: true })
  if (t && st.project === 'city') {
    const r = Math.max(t.width, t.depth, t.podiumWidth, t.podiumDepth) / 2 + 40
    const pts: [number, number, number][] = [[t.x - r, t.y - r, st.groundElevation], [t.x + r, t.y + r, st.groundElevation + t.height]]
    flyToFit(pts, 500)
  }
}

/** `onGenerate`: opens Generate (a massing from a brief, Sinnie Choi's generator) below the card. */
export function PlaceFirstTower({ onGenerate }: { onGenerate?: () => void } = {}) {
  const { project, site } = useStore(useShallow((s) => ({ project: s.project, site: s.citySite })))
  const start = defaultTower(project)
  const where = project === 'vtc' ? 'on the competition block' : site ? `on your site${site.label ? ` (${site.label})` : ''}` : null
  return (
    <section data-testid="place-first-tower" aria-labelledby="place-first-head" className="m-3 rounded-lg border border-accent/40 bg-accent/[0.06] p-3">
      <h3 id="place-first-head" className="flex items-center gap-2 text-sm font-semibold text-ink">
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-accent text-white"><Building2 size={15} /></span>
        Place your tower
        <Help label="About placing a tower">
          The tower starts {where ?? 'downtown'} as {start.name}, {start.height} m tall{start.podiumHeight > 0 ? ` on a ${start.podiumHeight} m podium` : ''}.
          Then click the ground where it should stand: it moves there at once (Ctrl+Z undoes it, Esc stops placing).
          Shape it afterwards in Massing: height, blocks, rotation and floor-to-floor.
        </Help>
      </h3>
      <p className="mt-1.5 text-meta text-muted">{where ? `No tower yet. It goes ${where}; then click where it should stand.` : 'No site chosen yet: the tower would start downtown.'}</p>
      <button type="button" onClick={() => placeFirstTower()} data-testid="place-tower"
        className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-md bg-accent px-3 py-2 text-xs font-semibold text-white outline-none hover:bg-accent/90 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2">
        <Crosshair size={14} />Place a tower
      </button>
      {onGenerate && (
        <button type="button" onClick={onGenerate} data-testid="open-generate"
          className="mt-1.5 flex w-full items-center justify-center gap-1.5 rounded-md border border-line bg-panel px-3 py-1.5 text-xs text-ink outline-none hover:border-accent focus-visible:ring-2 focus-visible:ring-accent">
          <Wand2 size={13} />Or generate a massing from a brief
        </button>
      )}
      {project === 'city' && !site && (
        <button type="button" onClick={() => goToStep('site')} className="mt-1.5 flex w-full items-center justify-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-xs text-ink outline-none hover:border-accent focus-visible:ring-2 focus-visible:ring-accent">
          <MapPin size={13} />Choose a site first
        </button>
      )}
    </section>
  )
}

/** Program and Schematic before any tower: one line and the way to Volume. */
export function NoTowerYet() {
  return (
    <section data-testid="no-tower-yet" className="m-3 rounded-lg border border-line bg-black/[0.02] p-3">
      <p className="text-xs font-semibold text-ink">No tower yet</p>
      <p className="mt-1 text-meta text-muted">These tools shape a tower. Place one first.</p>
      <button type="button" onClick={() => goToStep('volume')}
        className="mt-2 flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-xs text-ink outline-none hover:border-accent focus-visible:ring-2 focus-visible:ring-accent">
        <ArrowLeft size={13} />Go to Form
      </button>
    </section>
  )
}

/** A case study as the starting tower: its height, storeys (floor-to-floor), plate and podium (data/caseStudies.ts). */
export function startFromCaseStudy(c: CaseStudy) {
  placeFirstTower({ name: c.name, height: c.height, f2f: Math.round((c.height / c.storeys) * 100) / 100, width: c.width, depth: c.depth,
    podiumHeight: c.podiumHeight, podiumWidth: c.podiumWidth, podiumDepth: c.podiumDepth })
  useStore.getState().set({ announce: `${c.name} placed as your starting tower: ${c.height} m, ${c.storeys} storeys (published); plate and podium approximate. Click where it should stand.` })
}

const ImportPanel = lazy(() => import('../import/RhinoImportPanel'))
const TypologyPanel = lazy(() => import('../generate/GenerateTool'))
const FormsPanel = lazy(() => import('./TowerForms'))

/** From scratch: the drawing rail's Rectangle, ready to drag a footprint on the cleared site. */
export function startFromScratch() {
  useStore.getState().set({ placing: false })
  setTool('rect')
  toast('Drag a footprint on the ground; Select comes back once it is drawn')
}

type StartWay = 'case' | 'import' | 'type'

/**
 * The Massing tool before any tower (13 Nov, Sinnie: "massing tool should give three options before showing any other
 * tool information"; 16 Nov: "when users select start from scratch, it means they will use the design tool chain on the
 * right, import tool should give the live update tool with the python file", "for case study, users should be able to
 * select a list of known towers and edit from there", "also add a typology button" with dtmass's typologies).
 * From scratch picks the rail's Rectangle; Import opens the Import tool (upload or Rhino's live link, tdt_link.py);
 * Case study lists known towers, one click places it and Massing opens to edit it; Typology is dtmass's four
 * typologies with their sliders (components/generate/GenerateTool.tsx), placed as editable blocks.
 */
export function MassingStart() {
  const { project, site } = useStore(useShallow((s) => ({ project: s.project, site: s.citySite })))
  const [way, setWay] = useState<StartWay | null>(null)
  const needSite = project === 'city' && !site
  const opt = 'flex min-w-0 flex-col items-center gap-1.5 rounded-lg border px-0.5 py-2 text-center outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40'
  const tile = (on: boolean) => `${opt} ${on ? 'border-accent bg-accent/[0.08] text-ink' : 'border-line bg-panel text-ink hover:border-accent'}`
  const toggle = (w: StartWay) => setWay((v) => (v === w ? null : w))
  const tiles: { id: 'scratch' | StartWay; word: string; icon: typeof Crosshair; bg: string; go: () => void }[] = [
    { id: 'scratch', word: 'From scratch', icon: Crosshair, bg: 'bg-accent', go: () => { setWay(null); startFromScratch() } },
    { id: 'import', word: 'Import', icon: FileUp, bg: 'bg-orange-500', go: () => toggle('import') },
    { id: 'case', word: 'Case study', icon: BookOpen, bg: 'bg-violet-600', go: () => toggle('case') },
    { id: 'type', word: 'Typology', icon: LayoutGrid, bg: 'bg-emerald-600', go: () => toggle('type') },
  ]
  return (
    <section data-testid="place-first-tower" data-massing-start aria-labelledby="massing-start-head" className="min-w-0">
      <div className="m-3 mb-0">
        <h3 id="massing-start-head" className="flex items-center gap-1.5 text-sm font-semibold text-ink">Start your massing
          <Help label="About starting the massing">From scratch: draw with the design tools on the right (Rectangle, then Push / pull). Import: a model from Rhino, Revit, Archicad, AutoCAD or SketchUp, uploaded or linked live (Rhino through the tdt_link.py script). Case study: a known tower to edit from (height and storeys as published; plan and podium approximate). Typology: the Downtown Massing Tool&apos;s four typologies, shaped with their sliders and placed as blocks you can edit.</Help>
        </h3>
        <div role="group" aria-label="How to start" className="mt-2 grid grid-cols-4 gap-1">
          {tiles.map((t) => (
            <button key={t.id} type="button" data-start={t.id} data-testid={t.id === 'scratch' ? 'place-tower' : undefined} aria-expanded={t.id === 'scratch' ? undefined : way === t.id} onClick={t.go} className={tile(way === t.id)}>
              <span className={`flex h-9 w-9 items-center justify-center rounded-lg text-white ${t.bg}`}><t.icon size={18} aria-hidden /></span>
              <span className="text-meta font-semibold leading-tight">{t.word}</span>
            </button>
          ))}
        </div>
      </div>
      {way === 'case' && (
        <ul data-testid="case-studies" aria-label="Case studies" className="m-3 mt-2 grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1">
          {CASE_STUDIES.map((c) => (
            <li key={c.id}>
              <button type="button" data-case={c.id} onClick={() => startFromCaseStudy(c)} title={c.note}
                className="flex w-full items-center gap-2 rounded-md border border-line bg-panel px-2 py-1.5 text-left outline-none hover:border-accent focus-visible:ring-2 focus-visible:ring-accent">
                <CaseGlyph c={c} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold text-ink">{c.name}</span>
                  <span className="block truncate text-meta text-muted">{c.place} · {c.architect}, {c.year}</span>
                </span>
                <span className="shrink-0 text-right text-meta tabular-nums text-ink">{c.height} m<span className="block text-muted">{c.storeys} fl</span></span>
              </button>
            </li>
          ))}
          <li className="flex min-w-0 items-start gap-1.5 px-1 text-meta text-muted"><FlagChip flag="unverified" />Plans and podiums approximate; twists and tapers not modelled.</li>
        </ul>
      )}
      {way === 'import' && <div data-testid="start-import" className="mt-2 border-t border-line"><Suspense fallback={<div aria-busy="true" className="min-h-16" />}><ImportPanel /></Suspense></div>}
      {way === 'type' && <div data-testid="start-typology" className="mt-2 border-t border-line"><Suspense fallback={<div aria-busy="true" className="min-h-16" />}><FormsPanel /><div className="border-t border-line"><TypologyPanel /></div></Suspense></div>}
      {needSite && (
        <button type="button" onClick={() => goToStep('site')} className="m-3 flex w-[calc(100%-1.5rem)] items-center justify-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-xs text-ink outline-none hover:border-accent focus-visible:ring-2 focus-visible:ring-accent">
          <MapPin size={13} />No site yet: choose one first
        </button>
      )}
    </section>
  )
}

/** A case study's profile at a common scale: the shaft over its podium. */
function CaseGlyph({ c }: { c: CaseStudy }) {
  const H = 34, k = H / 210, w = Math.max(3, c.width * k * 1.4), pw = Math.max(w, c.podiumWidth * k * 1.4), ph = c.podiumHeight * k
  return (
    <svg viewBox={`0 0 24 ${H}`} className="h-9 w-6 shrink-0" aria-hidden>
      <line x1="0" y1={H - 0.5} x2="24" y2={H - 0.5} stroke="#c9cdd2" />
      {ph > 0 && <rect x={12 - pw / 2} y={H - 0.5 - ph} width={pw} height={ph} fill="#c7d2dd" />}
      <rect x={12 - w / 2} y={H - 0.5 - c.height * k} width={w} height={c.height * k - ph} fill="#1f5f8b" opacity="0.8" />
    </svg>
  )
}
