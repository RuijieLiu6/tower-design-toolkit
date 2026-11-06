// "Add your copy of the base model": the competition context on the live website. Buildner's model can't be published
// with the app, so each entrant adds the "Vancouver Tall Base Model.3dm" from their competition download. It is read in
// this browser and kept on this computer (lib/vtcContextSource.ts). Two places use it: the card on the competition view
// while the context is missing, and the "Competition context model" section of the view's dock.
import { useRef, useState, type DragEvent, type ReactNode } from 'react'
import { CircleAlert, FileUp, Loader2, LockKeyhole, Trash2, X } from './icons'
import Help from './Help'
import { addVtcModel, removeVtcModel, useVtcSource } from '../lib/vtcContextSource'

const NOTE = 'Read in this browser and kept on this computer only. Never uploaded. Context © Buildner.'

function HelpText() {
  return (
    <Help label="About the competition base model">
      <p>The competition's 3D context (neighbouring buildings, heritage, plazas, curbs and the three future towers) comes from Buildner's <b>Vancouver Tall Base Model.3dm</b>, part of the brief download every entrant receives.</p>
      <p className="mt-1.5">Buildner owns the model, so this website can't include it. Add your own copy once: the app reads it here with rhino3dm and keeps the result in this browser's own storage. It is not sent anywhere, and other people who open the site don't see it.</p>
      <p className="mt-1.5">The site, north arrow and every check still work without it. With it, the separation, PV shading, wind screen and sun-hours checks count the context and future towers.</p>
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
          <p>Your copy of the base model{fileName ? <> (<span className="break-all">{fileName}</span>)</> : null}{addedAt ? `, added ${new Date(addedAt).toLocaleDateString()}` : ''}. Context buildings ghost in x-ray; future towers are drawn translucent with their heights.</p>
          <Privacy />
          <ErrorLine />
          <div className="flex flex-wrap items-center gap-2">
            <AddButton open={pick.open}>Replace</AddButton>
            <button type="button" onClick={() => void removeVtcModel()}
              className="inline-flex items-center gap-1.5 rounded-md border border-line bg-panel px-2.5 py-1.5 text-xs font-medium text-ink hover:bg-paper">
              <Trash2 size={14} aria-hidden />Remove from this browser
            </button>
          </div>
        </>
      ) : status === 'idle' || status === 'loading' ? (
        <p>Looking for the context model…</p>
      ) : (
        <>
          <div className="flex items-start gap-1">
            <p className="flex-1">Not loaded. Add your copy of the base model (<b className="text-ink">.3dm</b>) from the competition download, or drop it here.</p>
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

/** The card over the competition view while its context is missing (or being read). Closing it hides it for this visit. */
export function VtcContextCard() {
  const status = useVtcSource((s) => s.status)
  const hasCtx = useVtcSource((s) => !!s.ctx)
  const [closed, setClosed] = useState(false)
  const pick = usePicker()
  if (hasCtx || closed || status === 'idle' || status === 'loading') return null
  return (
    <section aria-labelledby="vtc-card-title" {...pick.drop}
      className={`absolute bottom-16 left-3 z-20 w-[min(23rem,calc(100%-1.5rem))] rounded-lg border bg-panel/95 p-3 text-xs text-muted shadow-lg backdrop-blur-md ${pick.over ? 'border-2 border-dashed border-accent' : 'border-line'}`}>
      {pick.field}
      <div className="flex items-start gap-2">
        <h2 id="vtc-card-title" className="flex-1 text-sm font-semibold text-ink">Competition context not loaded</h2>
        <HelpText />
        <button type="button" onClick={() => setClosed(true)} aria-label="Close" className="-mr-1 -mt-1 rounded p-1 text-muted hover:bg-paper hover:text-ink"><X size={14} aria-hidden /></button>
      </div>
      <p className="mt-1">The neighbouring buildings and future towers come from Buildner's base model, which this website can't include. Add your copy of <b className="text-ink">Vancouver Tall Base Model.3dm</b>, or drop it on this card.</p>
      <div className="mt-2.5 space-y-2">
        <ErrorLine announce />
        <AddButton open={pick.open}>Add your copy of the base model (.3dm)</AddButton>
        <Privacy />
      </div>
    </section>
  )
}
