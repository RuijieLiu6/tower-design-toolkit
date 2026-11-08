// Body of the "Import" design tool (Ruijie, 6 Nov: "merge 'import' and 'upload' … choose to upload from multiple
// platforms, for each include the icon of their software … Archicad, Revit, AutoCAD, and SketchUp … instructions just
// like how you did with rhino"). Pick the software the model comes from (lib/interchange/platforms.ts); its card has
// Upload (the file it exports) and its live link: Rhino's plugin (public/rhino/tdt_link.py, Connect), SketchUp's
// (public/plugins/sketchup, Connect), or a script that rewrites one file the Toolkit links (Revit, Archicad, AutoCAD).
// Once a model is in: what it brought, and the place-and-basement guide.
import { Check, Copy, Download, FileUp, Link2, Loader2, Plug, Unplug } from '../icons'
import { useState, type ReactNode } from 'react'
import { useImportStore } from '../../lib/import/store'
import { canLink, pickLinkedFile, stopLink, useLiveLink } from '../../lib/interchange/live'
import { PLATFORMS, platformById, type Platform, type PlatformId } from '../../lib/interchange/platforms'
import { connectRhino, RHINO_COMMAND, RHINO_SCRIPT, useRhinoState } from '../../lib/interchange/rhinoLink'
import { connectServer, useServerLinks } from '../../lib/interchange/serverLink'
import { useStore, useTowers } from '../../store'
import Help from '../Help'
import { FlagChip } from '../ui'
import PlaceModelGuide from './PlaceModelGuide'
import SoftwareBadge from './SoftwareBadge'

const PICKED = 'ts.importPlatform'
const readPicked = (): PlatformId => { try { return platformById(localStorage.getItem(PICKED) ?? 'rhino').id } catch { return 'rhino' } }

export default function RhinoImportPanel() {
  const present = useStore((s) => s.phase === 'present')
  const model = useStore((s) => s.models[s.project])
  const towers = useTowers()
  const live = useLiveLink()
  const [pid, setPid] = useState<PlatformId>(readPicked)
  const pick = (id: PlatformId) => { setPid(id); try { localStorage.setItem(PICKED, id) } catch { /* private mode */ } }
  const p = platformById(pid)
  const ours = model ? towers.filter((t) => t.imported?.source?.modelId === model.id).length : 0
  const site = model?.elements.some((e) => e.role === 'site'), context = model?.elements.filter((e) => e.role === 'context').length ?? 0
  const details = () => { const s = useStore.getState(); s.set({ selectedNode: 'built.model', enabled: { ...s.enabled, 'built.model': true } }) }
  return (
    <div className="grid gap-2 px-4 pb-3 pt-1 text-xs">
      {model && (
        <div className="rounded-md border border-line bg-black/[0.02] px-2 py-1.5 text-meta">
          <div className="flex items-center gap-1.5"><FileUp size={12} className="shrink-0 text-accent" aria-hidden /><b className="truncate">{model.source.fileName}</b></div>
          <div className="mt-0.5 text-muted">{ours} tower{ours === 1 ? '' : 's'}{site ? ' · lot line' : ''}{context ? ` · ${context} context` : ''}</div>
          {live.status !== 'off' && <div className="mt-0.5 flex items-center gap-1 text-accent"><Link2 size={11} aria-hidden />{live.status === 'error' ? 'Link problem: see the details' : live.name?.endsWith('(live link)') ? `Live from ${live.name.replace(' (live link)', '')}` : 'Linked: updates on each save'}</div>}
          <button type="button" onClick={details} className="mt-1 text-meta text-accent hover:underline">Details and provenance</button>
        </div>
      )}
      {model && !present && <PlaceModelGuide />}
      <div role="radiogroup" aria-label="Where the model comes from" className="grid grid-cols-3 gap-1">
        {PLATFORMS.map((x) => (
          <button key={x.id} type="button" role="radio" aria-checked={x.id === pid} onClick={() => pick(x.id)} data-platform={x.id} title={`${x.name}: ${x.versions}`}
            className={`flex flex-col items-center gap-1 rounded-md border px-1 py-1.5 text-meta outline-none focus-visible:ring-2 focus-visible:ring-accent ${x.id === pid ? 'border-accent bg-accent/[0.07] font-semibold text-ink' : 'border-line text-muted hover:border-accent hover:text-ink'}`}>
            <SoftwareBadge p={x} />{x.name}
          </button>
        ))}
      </div>
      <PlatformCard p={p} model={!!model} disabled={present} />
    </div>
  )
}

/** One platform: Upload (what it exports), then its live link and whether it has been run inside the app. */
function PlatformCard({ p, model, disabled }: { p: Platform; model: boolean; disabled: boolean }) {
  const open = () => useImportStore.getState().openDialog()
  const label = p.id === 'rhino' ? (model ? 'Upload a new version' : 'Upload a Rhino model') : p.id === 'other' ? 'Upload a model file' : `Upload from ${p.name} (${p.upload.accept})`
  return (
    <section aria-labelledby={`pf-${p.id}`} data-testid={`platform-${p.id}`} className="grid gap-1.5 rounded-md border border-line p-2">
      <h3 id={`pf-${p.id}`} className="flex items-center gap-1.5 text-meta font-semibold text-ink">
        <SoftwareBadge p={p} size={18} />{p.name}<span className="font-normal text-muted">{p.versions}</span>
        {!p.tested.ok && <span className="ml-auto"><FlagChip flag="unverified" /></span>}
        <Help label={`About ${p.name}`}>{p.upload.how} {p.tested.text}</Help>
      </h3>
      <button type="button" onClick={open} disabled={disabled} data-tool="tool.rhino-import" title={disabled ? 'The model is locked in Present' : p.upload.how}
        className="flex items-center justify-center gap-2 rounded-md border border-accent bg-panel px-3 py-1.5 font-semibold text-accent outline-none hover:bg-accent/5 focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40">
        <FileUp size={14} aria-hidden />{label}
      </button>
      <p className="text-meta leading-snug text-muted">{p.upload.how} Read in this browser; nothing is uploaded.</p>
      {p.id === 'rhino' ? <RhinoLive disabled={disabled} /> : p.link?.kind === 'server' ? <ServerLive p={p} disabled={disabled} /> : p.link?.kind === 'file' ? <FileLive p={p} disabled={disabled} /> : null}
    </section>
  )
}

/** A script inside the app serves the model; Connect (SketchUp). */
function ServerLive({ p, disabled }: { p: Platform; disabled: boolean }) {
  const l = p.link!
  const live = useLiveLink()
  const last = useServerLinks((s) => s[p.name])
  const linked = live.name === l.linkName && live.status !== 'off'
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const notFound = `No ${p.name} link found on this computer. In ${p.name}, load ${l.script} (step 2), then press Connect again. If your browser asks to let this site reach devices on your local network, allow it.`
  const connect = async () => { setBusy(true); setNote(null); try { setNote(await connectServer({ app: p.name, ports: l.ports!, model: l.model!, linkName: l.linkName! }, notFound)) } finally { setBusy(false) } }
  return (
    <LiveBox p={p} linked={linked} note={note}>
      {linked ? (
        <div className="grid gap-1.5">
          <p className={live.status === 'error' ? 'text-amber-900' : 'text-ink'}>{live.message}</p>
          {last?.instant === false && <p className="font-semibold text-amber-900">Instant sync is off in {p.name}: changes wait there until you press Send now.</p>}
          <button type="button" onClick={() => { stopLink(); setNote(`Link stopped here. To stop it in ${p.name} too, use Extensions › Tower Design Toolkit › Stop link.`) }} className={`${btn} w-fit border-line hover:border-accent`}><Unplug size={12} />Stop the link</button>
        </div>
      ) : (
        <Steps p={p} last={<button type="button" onClick={connect} disabled={disabled || busy} data-testid={`${p.id}-connect`} className={`${btn} w-fit border-accent text-accent hover:bg-accent/5`}>{busy ? <Loader2 size={12} className="animate-spin" /> : <Plug size={12} />}{busy ? `Looking for ${p.name}…` : `Connect to ${p.name}`}</button>} />
      )}
    </LiveBox>
  )
}

/** A script inside the app rewrites one file; Link the file once (Revit, Archicad, AutoCAD). */
function FileLive({ p, disabled }: { p: Platform; disabled: boolean }) {
  const live = useLiveLink()
  const linked = live.status !== 'off' && !!live.name && !live.name.endsWith('(live link)')
  const [note, setNote] = useState<string | null>(null)
  const link = async () => {
    setNote(null)
    if (!canLink()) { setNote('Linking a file needs Chrome or Edge on a computer. In this browser, upload the file instead (and again after each change).'); return }
    const got = await pickLinkedFile()
    if (got) useImportStore.getState().openDialog(got.file, null, got.handle)
  }
  return (
    <LiveBox p={p} linked={linked} note={note}>
      {linked ? (
        <div className="grid gap-1.5">
          <p className={live.status === 'error' ? 'text-amber-900' : 'text-ink'}>{live.message}</p>
          <button type="button" onClick={() => { stopLink(); setNote('Link stopped: the file is no longer re-read.') }} className={`${btn} w-fit border-line hover:border-accent`}><Unplug size={12} />Stop the link</button>
        </div>
      ) : (
        <Steps p={p} last={<button type="button" onClick={link} disabled={disabled} data-testid={`${p.id}-link-file`} className={`${btn} w-fit border-accent text-accent hover:bg-accent/5`}><Link2 size={12} />Link the file</button>} />
      )}
    </LiveBox>
  )
}

function LiveBox({ p, linked, note, children }: { p: Platform; linked: boolean; note: string | null; children: ReactNode }) {
  const live = useLiveLink()
  const state = linked ? (live.status === 'error' ? { dot: 'bg-amber-500', word: 'Link problem' } : { dot: 'bg-green-600', word: 'Live' }) : { dot: 'bg-slate-300', word: 'Off' }
  return (
    <section aria-labelledby={`live-${p.id}`} data-testid={`${p.id}-live`} className="mt-1 rounded-md border border-line px-2.5 py-2 text-meta">
      <h4 id={`live-${p.id}`} className="flex items-center gap-1.5 font-semibold text-ink">
        <Plug size={12} className="text-accent" aria-hidden />Link {p.name} live
        <Help label={`About the ${p.name} link`}>
          {p.link!.kind === 'server'
            ? `A small script inside ${p.name} serves the open model to this page, on your own computer only; the Toolkit asks for the latest copy every second or two. The first time you map its tags or layers and place it, as with an upload; after that it updates by itself with the same mapping.`
            : `A small script inside ${p.name} writes the model to one file (${p.link!.writes}). Link that file here once (Chrome or Edge): the Toolkit re-reads it every time it changes, with the mapping you chose the first time. The file stays on your computer.`}
          {' '}{p.tested.text}
        </Help>
        <span className="ml-auto flex items-center gap-1 font-normal text-muted" role="status"><i aria-hidden className={`h-2 w-2 rounded-full ${state.dot}`} />{state.word}</span>
      </h4>
      <div className="mt-1.5">{children}</div>
      {note && <p className="mt-1.5 rounded bg-amber-50 px-2 py-1 text-amber-900" role="status">{note}</p>}
    </section>
  )
}

/** The numbered steps of a link: download, run inside the app (with the text to type, and Copy), then the last action. */
function Steps({ p, last }: { p: Platform; last: ReactNode }) {
  const l = p.link!
  const at = Math.max(0, l.steps.findIndex((s) => s.download))
  return (
    <ol className="grid list-none gap-2">
      {l.steps.map((s, i) => (
        <li key={i} className="flex gap-1.5"><Num n={i + 1} />
          <div className="grid min-w-0 gap-1">
            <span>{s.text}</span>
            {s.code && <CodeLine code={s.code} />}
            {i === at && <a href={`${import.meta.env.BASE_URL}${l.href}`} download={l.script} data-testid={`${p.id}-download`} className={`${btn} w-fit border-accent bg-accent text-white hover:opacity-90`}><Download size={12} />Download {l.script}</a>}
            {i === l.steps.length - 1 && last}
          </div>
        </li>
      ))}
    </ol>
  )
}

function CodeLine({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => { try { await navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch { /* the text is there to type */ } }
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <code className="min-w-0 break-all rounded border border-line bg-black/[0.04] px-1.5 py-0.5 font-mono text-meta text-ink">{code}</code>
      <button type="button" onClick={copy} className={`${btn} shrink-0 border-line hover:border-accent`} aria-label={`Copy ${code}`}>{copied ? <Check size={12} /> : <Copy size={12} />}{copied ? 'Copied' : 'Copy'}</button>
    </span>
  )
}

const RHINO_LINK_NAME = 'Rhino (live link)'
const btn = 'flex items-center gap-1 rounded-md border px-2 py-1 text-meta outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40'

/** What Rhino's window is set to (link 2): instant sync, or changes held until Send now; the ground and basements it sends. */
function RhinoSyncLine() {
  const last = useRhinoState((s) => s.last)
  if (!last || last.instant === undefined) return null
  const s = last.settings ?? {}
  const below = Number(s.levels) > 0 ? `${s.levels} basement level${s.levels === '1' ? '' : 's'}${s.f2f ? ` at ${s.f2f} m` : ''}` : null
  return (
    <p className="text-muted" data-testid="rhino-sync">
      {last.instant ? 'Instant sync is on in Rhino.' : <b className="text-amber-900">Instant sync is off in Rhino: changes wait there until you press Send now.</b>}
      {s.ground !== undefined && ` Ground level z = ${s.ground}.`}{below && ` ${below}.`}
    </p>
  )
}

/** Link Rhino live: the three steps, the plugin to download, what to type in Rhino, and the link's state. */
function RhinoLive({ disabled }: { disabled: boolean }) {
  const live = useLiveLink()
  const linked = live.name === RHINO_LINK_NAME && live.status !== 'off'
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const connect = async () => { setBusy(true); setNote(null); try { setNote(await connectRhino()) } finally { setBusy(false) } }
  const copy = async () => { try { await navigator.clipboard.writeText(RHINO_COMMAND); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch { setNote(`Copy did not work here: type ${RHINO_COMMAND} in Rhino.`) } }
  const state = linked ? (live.status === 'error' ? { dot: 'bg-amber-500', word: 'Link problem' } : { dot: 'bg-green-600', word: 'Live' }) : { dot: 'bg-slate-300', word: 'Off' }
  return (
    <section aria-labelledby="rhino-live-title" data-testid="rhino-live" className="mt-1 rounded-md border border-line px-2.5 py-2">
      <h4 id="rhino-live-title" className="flex items-center gap-1.5 text-meta font-semibold text-ink">
        <Plug size={12} className="text-accent" aria-hidden />Link Rhino live
        <Help label="About the Rhino live link">
          <span className="block">A small script for Rhino 7 and 8 serves the model open in Rhino to this page, on your own computer (http://127.0.0.1:8798), and opens a Tower Design Toolkit window in Rhino. The first time, you map its layers and place it, as with an upload; after that it updates a second or two after each change you make in Rhino, with the same mapping.</span>
          <span className="block">In Rhino's window: turn Instant sync off to hold changes until you press Send now; Set up Toolkit layers (Tower massing, Podium, Below grade, Landscape, Urban design, Context, Site boundary) so nothing needs mapping; set the ground level and the basement levels, or draw the basement under the selected massing. Basements, landscape and urban design come across with their roles.</span>
          <span className="block">Nothing is uploaded, and only the Toolkit's own pages can read the model while the link runs. Works in Chrome and Edge; if the browser asks to let this site reach devices on your local network, allow it.</span>
        </Help>
        <span className="ml-auto flex items-center gap-1 font-normal text-muted" role="status"><i aria-hidden className={`h-2 w-2 rounded-full ${state.dot}`} />{state.word}</span>
      </h4>
      {linked ? (
        <div className="mt-1.5 grid gap-1.5 text-meta">
          <p className={live.status === 'error' ? 'text-amber-900' : 'text-ink'}>{live.message}</p>
          <RhinoSyncLine />
          <button type="button" onClick={() => { stopLink(); setNote('Link stopped here. To stop it in Rhino too, press Stop link in Rhino\'s Tower Design Toolkit window.') }} className={`${btn} w-fit border-line hover:border-accent`}><Unplug size={12} />Stop the link</button>
        </div>
      ) : (
        <ol className="mt-1.5 grid list-none gap-2 text-meta">
          <li className="flex gap-1.5"><Num n={1} />
            <div className="grid gap-1">
              <span>Download the link script for Rhino 7 or 8 (one file, nothing to install).</span>
              <a href={`${import.meta.env.BASE_URL}rhino/${RHINO_SCRIPT}`} download={RHINO_SCRIPT} data-testid="rhino-download" className={`${btn} w-fit border-accent bg-accent text-white hover:opacity-90`}><Download size={12} />Download {RHINO_SCRIPT}</a>
            </div>
          </li>
          <li className="flex gap-1.5"><Num n={2} />
            <div className="grid gap-1">
              <span>In Rhino, type this command, press Enter and pick <b>{RHINO_SCRIPT}</b>:</span>
              <span className="flex items-center gap-1.5">
                <code className="rounded border border-line bg-black/[0.04] px-1.5 py-0.5 font-mono text-meta text-ink">{RHINO_COMMAND}</code>
                <button type="button" onClick={copy} className={`${btn} border-line hover:border-accent`} aria-label={`Copy ${RHINO_COMMAND}`}>{copied ? <Check size={12} /> : <Copy size={12} />}{copied ? 'Copied' : 'Copy'}</button>
              </span>
              <span className="text-muted">A <i>Tower Design Toolkit</i> window opens in Rhino. Running the script again brings the window back.</span>
            </div>
          </li>
          <li className="flex gap-1.5"><Num n={3} />
            <div className="grid gap-1">
              <span>Connect, then map the layers. The first time, place the building on your site, set its basement and confirm.</span>
              <button type="button" onClick={connect} disabled={disabled || busy} data-testid="rhino-connect" className={`${btn} w-fit border-accent text-accent hover:bg-accent/5`}>{busy ? <Loader2 size={12} className="animate-spin" /> : <Plug size={12} />}{busy ? 'Looking for Rhino…' : 'Connect to Rhino'}</button>
            </div>
          </li>
        </ol>
      )}
      {note && <p className="mt-1.5 rounded bg-amber-50 px-2 py-1 text-meta text-amber-900" role="status">{note}</p>}
      <details className="mt-1.5 text-meta text-muted">
        <summary className="cursor-pointer hover:text-ink">Stop, or make it a one-word command</summary>
        <div className="mt-1 grid gap-1">
          <span>To stop the link, press Stop link in Rhino's Tower Design Toolkit window (or close Rhino). Closing the window keeps the link running; run {RHINO_SCRIPT} again to open it.</span>
          <span>One-word command: in Rhino, Options › Aliases › New, alias <code className="font-mono text-ink">TDTLink</code>, command <code className="break-all font-mono text-ink">! _-RunPythonScript "C:\path\to\{RHINO_SCRIPT}"</code> (the folder you saved it in). Then type TDTLink.</span>
          <span>Rhino 8 runs it in Python 3; Rhino 7 in IronPython. You can also open it in Rhino 8's Script Editor and press Run.</span>
        </div>
      </details>
    </section>
  )
}

function Num({ n }: { n: number }) {
  return <span aria-hidden className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-accent/15 text-meta font-semibold text-accent">{n}</span>
}
