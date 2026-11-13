// The competition context on the live website. The derived context (outlines, heights, simplified meshes) is included
// with the app, so the competition site opens with it (Ruijie, 13 Nov). Adding your own copy of "Vancouver Tall Base
// Model.3dm" from the competition download stays an option: it is read in this browser, kept on this computer
// (lib/vtcContextSource.ts) and replaces the included context here. Two places: the card on the competition view while
// the context is missing (the included file failed to load), and the "Competition context model" section of the dock.
import { useRef, useState, type DragEvent, type ReactNode } from 'react'
import { Building2, CircleAlert, FileUp, Landmark, Loader2, LockKeyhole, TowerOnSite, Trash2, X } from './icons'
import Help from './Help'
import { BRIEF_SITE, addVtcModel, removeVtcModel, useVtcSource } from '../lib/vtcContextSource'
import { useStore } from '../store'

const NOTE = 'Read in this browser and kept on this computer only. Never uploaded. Context © Buildner.'
const INCLUDED_NOTE = 'Derived from the brief download (outlines, heights, simplified massing). Context © Buildner, Vancouver Tall Challenge.'

function HelpText() {
  return (
    <Help label="About the competition base model">
      <p>The competition's 3D context (neighbouring buildings, heritage, plazas, curbs and the three future towers) comes from Buildner's <b>Vancouver Tall Base Model.3dm</b>, part of the brief download every entrant receives.</p>
      <p className="mt-1.5">The app includes a derived copy of that context (building outlines, heights and simplified massing, not the model file), so the competition site opens with it. The brief gives its materials for an academic exercise, to be used at the participant's discretion; the model itself is Buildner's and is not shipped.</p>
      <p className="mt-1.5">Prefer your own copy, or a newer download? Add the .3dm once: the app reads it here with rhino3dm and keeps the result in this browser's own storage. It is not sent anywhere, and other people who open the site don't see it.</p>
      <p className="mt-1.5">The site, north arrow and every check still work without any context. With it, the separation, PV shading, wind screen and sun-hours checks count the context and future towers.</p>
    </Help>
  )
}

/** A hidden file picker plus drop handlers that keep the file away from the massing import (ImportHost). */
function usePicker() {
  const input = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const take = (f: File | undefined | null) => { if (f) void addVtcModel(f) }
  const drop = {
    onDragOver: (e: DragEvent) => { if ([...e.dataTransfer.types].includes('Files')) { e.preventDefault(); e.stopPropagation(); setOver(true) } },
    onDragLeave: () => setOver(false),
    // Handled here: stopPropagation and preventDefault keep ImportHost from opening the file as a massing upload.
    onDrop: (e: DragEvent) => { e.preventDefault(); e.stopPropagation(); setOver(false); take(e.dataTransfer.files?.[0]) },
  }
  const field = <input ref={input} type="file" accept=".3dm" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => { take(e.target.files?.[0]); e.target.value = '' }} />
  return { open: () => input.current?.click(), drop, over, field }
}

function AddButton({ open, children }: { open: () => void; children: ReactNode }) {
  const reading = useVtcSource((s) => s.status === 'reading')
  return (
    <button type="button" onClick={open} disabled={reading}
      className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60">
      {reading ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <FileUp size={14} aria-hidden />}
      {reading ? 'Reading the model…' : children}
    </button>
  )
}

/** Why the last file was refused. Announced by the card only, so a screen reader hears it once. */
function ErrorLine({ announce = false }: { announce?: boolean }) {
  const error = useVtcSource((s) => s.error)
  if (!error) return null
  return <p role={announce ? 'alert' : undefined} className="flex gap-1.5 text-flag-false"><CircleAlert size={14} className="mt-0.5 shrink-0" aria-hidden />{error}</p>
}

function Privacy() {
  return <p className="flex gap-1.5 text-muted"><LockKeyhole size={13} className="mt-0.5 shrink-0" aria-hidden />{NOTE}</p>
}

/** The dock section's body. */
export function VtcBaseModelPanel() {
  const { status, source, fileName, addedAt } = useVtcSource()
  const pick = usePicker()
  if (source === 'dev-file') {
    return <p>Competition context © Buildner, loaded from <code>public/local/</code> on this computer only (git-ignored, never published). Context buildings ghost in x-ray; future towers are drawn translucent with their heights.</p>
  }
  return (
    <div {...pick.drop} className={`space-y-2 rounded-md ${pick.over ? 'outline-dashed outline-2 outline-accent' : ''}`}>
      {pick.field}
      {source === 'browser' ? (
        <>
          <p>Your copy of the base model{fileName ? <> (<span className="break-all">{fileName}</span>)</> : null}{addedAt ? `, added ${new Date(addedAt).toLocaleDateString()}` : ''}, in place of the included context. Context buildings ghost in x-ray; future towers are drawn translucent with their heights.</p>
          <Privacy />
          <ErrorLine />
          <div className="flex flex-wrap items-center gap-2">
            <AddButton open={pick.open}>Replace</AddButton>
            <button type="button" onClick={() => void removeVtcModel()} data-testid="vtc-remove-copy"
              className="inline-flex items-center gap-1.5 rounded-md border border-line bg-panel px-2.5 py-1.5 text-xs font-medium text-ink hover:bg-paper">
              <Trash2 size={14} aria-hidden />Remove from this browser
            </button>
          </div>
        </>
      ) : source === 'included' ? (
        <>
          <div className="flex items-start gap-1">
            <p className="flex-1">Included with the app: neighbours, heritage, plazas, curbs and the three future towers. Context buildings ghost in x-ray; future towers are drawn translucent with their heights.</p>
            <HelpText />
          </div>
          <p className="flex gap-1.5 text-muted"><LockKeyhole size={13} className="mt-0.5 shrink-0" aria-hidden />{INCLUDED_NOTE}</p>
          <ErrorLine />
          <AddButton open={pick.open}>Use your own copy instead (.3dm)</AddButton>
        </>
      ) : status === 'idle' || status === 'loading' ? (
        <p>Looking for the context model…</p>
      ) : (
        <>
          <div className="flex items-start gap-1">
            <p className="flex-1">The included context could not be loaded. Add your copy of the base model (<b className="text-ink">.3dm</b>) from the competition download, or drop it here.</p>
            <HelpText />
          </div>
          <ErrorLine />
          <AddButton open={pick.open}>Add your copy of the base model (.3dm)</AddButton>
          <Privacy />
        </>
      )}
    </div>
  )
}

/** The card over the competition view while its context is missing (or being read). Closing it hides it for this visit;
 * it steps aside while a tower is being placed (the placing hint sits at the top of the view). */
export function VtcContextCard() {
  const status = useVtcSource((s) => s.status)
  const hasCtx = useVtcSource((s) => !!s.ctx)
  const placing = useStore((s) => s.placing)
  const [closed, setClosed] = useState(false)
  const pick = usePicker()
  if (hasCtx || closed || placing || status === 'idle' || status === 'loading') return null
  return (
    <section aria-labelledby="vtc-card-title" {...pick.drop}
      className={`absolute left-3 top-3 z-20 w-[min(23rem,calc(100%-1.5rem))] rounded-lg border bg-panel/95 p-3 text-xs text-muted shadow-lg backdrop-blur-md ${pick.over ? 'border-2 border-dashed border-accent' : 'border-line'}`}>
      {pick.field}
      <div className="flex items-start gap-2">
        <h2 id="vtc-card-title" className="flex-1 text-sm font-semibold text-ink">Competition context not loaded</h2>
        <HelpText />
        <button type="button" onClick={() => setClosed(true)} aria-label="Close" className="-mr-1 -mt-1 rounded p-1 text-muted hover:bg-paper hover:text-ink"><X size={14} aria-hidden /></button>
      </div>
      {/* What is shown, and what the base model adds, as glyphs and chips (Ruijie, 6 Nov: graphics, not paragraphs); the
          full story is behind the "?". */}
      <div className="mt-1.5 flex items-center gap-3" data-testid="vtc-card-glyphs">
        <figure className="m-0 flex shrink-0 flex-col items-center" aria-label={`Shown now: the brief's ${BRIEF_SITE.width_m} by ${BRIEF_SITE.depth_m} m block`}>
          <svg viewBox="0 0 64 40" className="h-10 w-16" aria-hidden>
            <rect x={4} y={10} width={56} height={22} className="fill-accent/15 stroke-accent" strokeWidth={1.2} />
          </svg>
          <figcaption className="text-meta tabular-nums">{BRIEF_SITE.width_m} × {BRIEF_SITE.depth_m} m</figcaption>
        </figure>
        <div className="grid gap-1">
          <span className="text-meta text-muted">The base model adds:</span>
          <ul className="flex flex-wrap gap-1" aria-label="What the base model adds">
            {[[Building2, 'Neighbours'], [Landmark, 'Heritage'], [TowerOnSite, 'Future towers']].map(([I, w]) => {
              const Icon = I as typeof Building2
              return <li key={w as string} className="flex items-center gap-1 rounded border border-line px-1.5 py-0.5 text-meta text-ink"><Icon size={12} className="text-accent" aria-hidden />{w as string}</li>
            })}
          </ul>
        </div>
      </div>
      <div className="mt-2.5 space-y-2">
        <ErrorLine announce />
        <AddButton open={pick.open}>Add your copy of the base model (.3dm)</AddButton>
        <p className="flex items-center gap-1.5 text-meta text-muted"><LockKeyhole size={12} className="shrink-0" aria-hidden />{NOTE} Or drop the .3dm on this card.</p>
      </div>
    </section>
  )
}
