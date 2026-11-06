// Body of the "Rhino import" design tool: the upload button, and once a model is in, what it brought and its live link;
// then "Link Rhino live" (Ruijie, 5 Nov): a short tutorial with the plugin to download (public/rhino/tdt_link.py), what
// to type in Rhino, and Connect to Rhino (lib/interchange/rhinoLink.ts).
import { Check, Copy, Download, FileUp, Link2, Loader2, Plug, Spline, Unplug } from '../icons'
import { useState } from 'react'
import { useImportStore } from '../../lib/import/store'
import { stopLink, useLiveLink } from '../../lib/interchange/live'
import { connectRhino, RHINO_COMMAND, RHINO_SCRIPT } from '../../lib/interchange/rhinoLink'
import { useStore, useTowers } from '../../store'
import Help from '../Help'

export default function RhinoImportPanel() {
  const present = useStore((s) => s.phase === 'present')
  const model = useStore((s) => s.models[s.project])
  const towers = useTowers()
  const live = useLiveLink()
  const open = () => useImportStore.getState().openDialog()
  const ours = model ? towers.filter((t) => t.imported?.source?.modelId === model.id).length : 0
  const site = model?.elements.some((e) => e.role === 'site'), context = model?.elements.filter((e) => e.role === 'context').length ?? 0
  const details = () => { const s = useStore.getState(); s.set({ selectedNode: 'built.model', enabled: { ...s.enabled, 'built.model': true } }) }
  return (
    <div className="grid gap-2 px-4 pb-3 pt-1 text-xs">
      <button type="button" onClick={open} disabled={present} data-tool="tool.rhino-import" title={present ? 'The model is locked in Present' : 'Rhino .3dm, OBJ, glTF or IFC'}
        className="flex items-center justify-center gap-2 rounded-md border border-accent bg-panel px-3 py-1.5 font-semibold text-accent outline-none hover:bg-accent/5 focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40">
        <Spline size={15} aria-hidden />{model ? 'Upload a new version' : 'Upload a Rhino model'}
      </button>
      <p className="flex items-center gap-1.5 text-[11px] leading-snug text-muted"><Help label="About Rhino import">.3dm, OBJ, glTF or IFC. Map its layers to tower, podium, program, core, site and context, check units, north and datum, and place it on the map.</Help>Read in this browser; nothing is uploaded.</p>
      {model && (
        <div className="rounded-md border border-line bg-black/[0.02] px-2 py-1.5 text-[11px]">
          <div className="flex items-center gap-1.5"><FileUp size={12} className="shrink-0 text-accent" aria-hidden /><b className="truncate">{model.source.fileName}</b></div>
          <div className="mt-0.5 text-muted">{ours} tower{ours === 1 ? '' : 's'}{site ? ' · lot line' : ''}{context ? ` · ${context} context` : ''}</div>
          {live.status !== 'off' && <div className="mt-0.5 flex items-center gap-1 text-accent"><Link2 size={11} aria-hidden />{live.status === 'error' ? 'Link problem: see the details' : live.name === RHINO_LINK_NAME ? 'Live from Rhino' : 'Linked: updates on each save'}</div>}
          <button type="button" onClick={details} className="mt-1 text-[11px] text-accent hover:underline">Details and provenance</button>
        </div>
      )}
      <RhinoLive disabled={present} />
    </div>
  )
}

const RHINO_LINK_NAME = 'Rhino (live link)'
const btn = 'flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40'

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
      <h4 id="rhino-live-title" className="flex items-center gap-1.5 text-[11px] font-semibold text-ink">
        <Plug size={12} className="text-accent" aria-hidden />Link Rhino live
        <Help label="About the Rhino live link">
          <span className="block">A small script for Rhino 7 and 8 serves the model open in Rhino to this page, on your own computer (http://127.0.0.1:8798). The first time, you map its layers and place it, as with an upload; after that it updates a second or two after each change you make in Rhino, with the same mapping.</span>
          <span className="block">Nothing is uploaded, and only the Toolkit's own pages can read the model while the link runs. Works in Chrome and Edge; if the browser asks to let this site reach devices on your local network, allow it.</span>
        </Help>
        <span className="ml-auto flex items-center gap-1 font-normal text-muted" role="status"><i aria-hidden className={`h-2 w-2 rounded-full ${state.dot}`} />{state.word}</span>
      </h4>
      {linked ? (
        <div className="mt-1.5 grid gap-1.5 text-[11px]">
          <p className={live.status === 'error' ? 'text-amber-900' : 'text-ink'}>{live.message}</p>
          <button type="button" onClick={() => { stopLink(); setNote('Link stopped here. To stop it in Rhino too, run tdt_link.py again.') }} className={`${btn} w-fit border-line hover:border-accent`}><Unplug size={12} />Stop the link</button>
        </div>
      ) : (
        <ol className="mt-1.5 grid list-none gap-2 text-[11px]">
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
                <code className="rounded border border-line bg-black/[0.04] px-1.5 py-0.5 font-mono text-[11.5px] text-ink">{RHINO_COMMAND}</code>
                <button type="button" onClick={copy} className={`${btn} border-line hover:border-accent`} aria-label={`Copy ${RHINO_COMMAND}`}>{copied ? <Check size={12} /> : <Copy size={12} />}{copied ? 'Copied' : 'Copy'}</button>
              </span>
              <span className="text-muted">Rhino's command line then says <i>running on http://127.0.0.1:8798</i>.</span>
            </div>
          </li>
          <li className="flex gap-1.5"><Num n={3} />
            <div className="grid gap-1">
              <span>Connect, then map the layers and place the model the first time.</span>
              <button type="button" onClick={connect} disabled={disabled || busy} data-testid="rhino-connect" className={`${btn} w-fit border-accent text-accent hover:bg-accent/5`}>{busy ? <Loader2 size={12} className="animate-spin" /> : <Plug size={12} />}{busy ? 'Looking for Rhino…' : 'Connect to Rhino'}</button>
            </div>
          </li>
        </ol>
      )}
      {note && <p className="mt-1.5 rounded bg-amber-50 px-2 py-1 text-[11px] text-amber-900" role="status">{note}</p>}
      <details className="mt-1.5 text-[11px] text-muted">
        <summary className="cursor-pointer hover:text-ink">Stop, or make it a one-word command</summary>
        <div className="mt-1 grid gap-1">
          <span>To stop the link, run {RHINO_SCRIPT} again in Rhino (or close Rhino).</span>
          <span>One-word command: in Rhino, Options › Aliases › New, alias <code className="font-mono text-ink">TDTLink</code>, command <code className="break-all font-mono text-ink">! _-RunPythonScript "C:\path\to\{RHINO_SCRIPT}"</code> (the folder you saved it in). Then type TDTLink.</span>
          <span>Rhino 8 runs it in Python 3; Rhino 7 in IronPython. You can also open it in Rhino 8's Script Editor and press Run.</span>
        </div>
      </details>
    </section>
  )
}

function Num({ n }: { n: number }) {
  return <span aria-hidden className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-accent/15 text-[10px] font-semibold text-accent">{n}</span>
}
