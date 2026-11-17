// "Start your massing" (Sinnie Choi's Toolkit build, artifact 1794900977-6d89, ported 17 Nov 2026 at Ruijie's
// request; source of the design: her build and github.com/xubynii/towerdesigntool), in the Massing tool while the
// site has no tower: four tiles in the Toolkit's own icon style, one word each, the full name and what it does on
// hover. From scratch starts the Rectangle tool (Ruijie's brief); the Toolkit's starting tower stays as a link (twenty
// browser tests drive; the rail's Rectangle then draws footprints). Import opens the same platform tiles as the
// Import tool. Case study places one of nine known towers with its published height and storeys and an approximate
// plate and podium (height and storeys checked against the CTBUH Skyscraper Center on 17 Nov, the plate and podium hers and unverified; her note on hover), then asks where it stands. Typology shows her tower-form
// presets above the Generate tool.
import { setDrawTool, toast } from '../../lib/draw/drawStore'
import { Suspense, lazy, useState } from 'react'
import { Building2, Crosshair, FileUp, Landmark, MapPin, Shapes, Wand2 } from '../icons'
import { CASE_STUDIES, caseStudyPatch, type CaseStudy } from '../../lib/draw/caseStudies'
import { goToStep } from '../../lib/step'
import { useStore } from '../../store'
import { useShallow } from 'zustand/react/shallow'
import Help from '../Help'
import IconTile from '../IconTile'
import { FlagChip } from '../ui'
import { placeFirstTower } from '../tools/NoTower'
import TowerForms from './TowerForms'

const RhinoImportPanel = lazy(() => import('../import/RhinoImportPanel'))
type Start = 'scratch' | 'import' | 'case' | 'typology'

/** Place a case-study tower: the starting tower with its numbers, then placing. */
export function placeCaseStudy(c: CaseStudy) {
  placeFirstTower()
  const s = useStore.getState()
  s.updateTower(s.selectedTower, { ...caseStudyPatch(c), blocks: undefined, boxFromBlocks: undefined })
  useStore.setState({ announce: `${c.name} placed: ${c.height} m, ${c.storeys} storeys. Click the ground where it should stand.` })
}

/** A tiny elevation glyph: the tower's proportions over its podium. */
function Elevation({ c }: { c: CaseStudy }) {
  const k = 26 / Math.max(c.height, 1), tw = Math.max(3, c.width * 0.18), pw = Math.max(tw, c.podiumWidth * 0.18)
  const th = (c.height - c.podiumHeight) * k, ph = c.podiumHeight * k
  return (
    <svg viewBox="0 0 16 28" className="h-7 w-4 shrink-0" aria-hidden>
      <rect x={8 - tw / 2} y={28 - ph - th} width={tw} height={th} className="fill-slate-400" />
      {ph > 0 && <rect x={8 - pw / 2} y={28 - ph} width={pw} height={ph} className="fill-slate-300" />}
    </svg>
  )
}

export default function StartMassing({ onGenerate }: { onGenerate?: () => void } = {}) {
  const { project, site } = useStore(useShallow((s) => ({ project: s.project, site: s.citySite })))
  const [open, setOpen] = useState<Start | null>(null)
  const noSite = project === 'city' && !site
  const where = project === 'vtc' ? 'on the competition block' : site ? `on your site${site.label ? ` (${site.label})` : ''}` : null
  // From scratch (Ruijie's brief): the Rectangle tool, a footprint dragged on the ground; the starting tower is the link below.
  const pick = (k: Start) => { if (k === 'scratch') { setDrawTool('rect'); toast('Drag a footprint on the ground, then push it up'); return } setOpen((o) => (o === k ? null : k)) }
  return (
    <section data-testid="place-first-tower" data-massing-start aria-labelledby="start-massing-head" className="m-3 rounded-lg border border-accent/40 bg-accent/[0.06] p-2.5">
      <h3 id="start-massing-head" className="flex items-center gap-2 text-sm font-semibold text-ink">
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-accent text-white"><Building2 size={15} /></span>
        Start your massing
        <Help label="About starting a massing">
          Four ways in (after Sinnie Choi's Downtown Massing Tool). From scratch: the Rectangle tool, a footprint dragged on the ground and pushed up (the Toolkit's starting tower is the link under the tiles). Import: a model from Rhino, Revit, Archicad, AutoCAD, SketchUp or a file. Case study: a known tower with its published height and storeys (plans and podiums approximate, every row unverified). Typology: a tower-form preset, tapered, twisting, tiered or stacked, over the Generate tool.
        </Help>
      </h3>
      <div className="mt-2 flex flex-wrap gap-0.5" role="group" aria-label="Start your massing">
        <IconTile icon={Crosshair} word="Scratch" label="From scratch: draw a footprint" hint="Starts the Rectangle tool: drag a footprint on the ground, then push it up; Line and Circle draw other outlines." data-start="scratch" onClick={() => pick('scratch')} />
        <IconTile icon={FileUp} word="Import" label="Import a model" hint="A model from Rhino, Revit, Archicad, AutoCAD, SketchUp or any OBJ, glTF or IFC file; the same import as the project menu's Import › 3D model." active={open === 'import'} aria-expanded={open === 'import'} data-start="import" onClick={() => pick('import')} />
        <IconTile icon={Landmark} word="Case study" label="Case study: a known tower" hint="Nine towers with their published height and storeys (eight checked against the CTBUH Skyscraper Center, one a type) and an approximate plate and podium; one click places it, then you say where it stands." active={open === 'case'} aria-expanded={open === 'case'} data-start="case" onClick={() => pick('case')} />
        <IconTile icon={Shapes} word="Typology" label="Typology: a tower-form preset" hint="Tapered shaft, twisting tower, set-back tiers or shifted stack, with sliders; or generate a massing from a brief." active={open === 'typology'} aria-expanded={open === 'typology'} data-start="typology" onClick={() => pick('typology')} />
      </div>
      <p className="mt-1.5 text-meta text-muted">Or <button type="button" onClick={placeFirstTower} data-testid="place-tower" className="text-accent underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-accent">place the Toolkit's starting tower</button> {where ?? 'downtown'} and shape it.</p>
      {noSite && (
        <button type="button" onClick={() => goToStep('site')} className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-md border border-line bg-panel px-3 py-1.5 text-xs text-ink outline-none hover:border-accent focus-visible:ring-2 focus-visible:ring-accent">
          <MapPin size={13} />No site yet: choose one first
        </button>
      )}
      {open === 'import' && <div className="-mx-2.5 mt-2 border-t border-line pt-1"><Suspense fallback={<p className="px-4 py-2 text-meta text-muted">Loading the import…</p>}><RhinoImportPanel /></Suspense></div>}
      {open === 'case' && (
        <div className="mt-2 rounded-md border border-line bg-panel" data-testid="case-studies">
          <ol className="max-h-72 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
            {CASE_STUDIES.map((c) => (
              <li key={c.id} className="border-b border-line/60 last:border-0">
                <button type="button" onClick={() => placeCaseStudy(c)} data-case={c.id} data-flag={c.flag} title={`${c.note} ${c.source ? `Height and storeys verified against ${c.source.what} (${c.source.accessed}).${c.changed ? ` ${c.changed}` : ''}` : 'Unverified: no source for a type.'} Plate and podium approximate, unverified.`}
                  className="flex w-full items-center gap-2 px-2 py-1.5 text-left outline-none hover:bg-subtle focus-visible:ring-2 focus-visible:ring-accent">
                  <Elevation c={c} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-control text-ink">{c.name}</span>
                    <span className="block truncate text-meta text-muted">{c.place} · {c.architect} · {c.year}</span>
                  </span>
                  <span className="shrink-0 text-right text-meta tabular-nums text-muted">{c.height} m<br />{c.storeys} fl</span>
                  <FlagChip flag={c.flag} />
                </button>
                {c.source && <a href={c.source.url} target="_blank" rel="noopener noreferrer" data-case-source={c.id} className="-mt-1 block truncate px-2 pb-1 text-meta text-muted underline-offset-2 hover:text-accent hover:underline">Height and storeys: {c.source.what}, read {c.source.accessed}{c.changed ? ' · corrected' : ''}</a>}
              </li>
            ))}
          </ol>
          <p className="flex items-center gap-1.5 border-t border-line px-2 py-1 text-meta text-muted"><FlagChip flag="unverified" />Plans and podiums approximate; twists and tapers not modelled. Height and storeys are verified where a row shows its source.</p>
        </div>
      )}
      {open === 'typology' && (
        <div className="-mx-2.5 mt-2 border-t border-line">
          <TowerForms />
          {onGenerate && (
            <button type="button" onClick={onGenerate} data-testid="open-generate" className="mx-3 mb-2 flex items-center gap-1.5 rounded-md border border-line bg-panel px-3 py-1.5 text-xs text-ink outline-none hover:border-accent focus-visible:ring-2 focus-visible:ring-accent">
              <Wand2 size={13} />Or generate a massing from a brief
            </button>
          )}
        </div>
      )}
    </section>
  )
}
