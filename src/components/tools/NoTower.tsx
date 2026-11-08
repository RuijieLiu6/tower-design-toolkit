// A project opens with no tower (Ruijie, 6 Nov: "start the project with no tower, and then introduce the placing tower
// experience"). The Form step leads with one card: "Place a tower" puts the project's starting tower on the site
// (the study site's centre in Real Vancouver, the competition block otherwise), then the usual placing follows: click
// the ground where it goes, Confirm in the toolbar, or Esc to keep it where it stands. Other steps say where to start.
import { ArrowLeft, Building2, Crosshair, MapPin, Wand2 } from '../icons'
import { useShallow } from 'zustand/react/shallow'
import { defaultTower, useStore } from '../../store'
import { goToStep } from '../../lib/step'
import Help from '../Help'
import { flyToFit } from '../VistaLook'

/** Places the starting tower and starts placing it; Real Vancouver frames it in the view. */
export function placeFirstTower() {
  const s = useStore.getState()
  s.addTower()
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
      <button type="button" onClick={placeFirstTower} data-testid="place-tower"
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
