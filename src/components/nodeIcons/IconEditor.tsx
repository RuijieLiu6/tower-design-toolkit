// A user-created node's icon (Ruijie, 7 Nov: "In the node editor, show an icon preview with two actions: Generate and
// Upload … Keep detailed guidance behind an information control … If an icon is missing or generation fails, use an
// approved fallback illustration. A missing custom icon should not prevent someone from saving a node"). The preview is
// the real tile at the sizes it is shown, beside three of the toolkit's own icons. Generate proposes a concept from the
// node and draws it with the shared generator; Upload checks the file, fits it (Crop on request), reports how it will
// read and can make a restyled copy while keeping the original. Saving an icon changes only how the node looks.
import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ImagePlus, RotateCcw, Sparkles, Trash2, TriangleAlert, Wand2 } from '../icons'
import Help from '../Help'
import { NodeTile } from '../NodeTile'
import { IconRecordArt, NodeArtwork } from './NodeArtwork'
import { HAS_VARIANTS } from '../../lib/nodeIcons/generate'
import { CUES, CUE_WORDS, CURRENT_STYLE, OBJECTS, OBJECT_WORDS, STYLE_PACK_URL, proposeBrief, type IconBrief, type IconCue, type IconObject } from '../../lib/nodeIcons/brief'
import { DISPLAY, FIT, TYPE_WORD, pixels, qualityChecks, readUpload, renderDisplay, restyledCanvas, type Adjust, type QualityCheck, type Upload } from '../../lib/nodeIcons/image'
import { saveOriginal, useNodeIcons, type IconRecord } from '../../lib/nodeIcons/store'
import type { Category } from '../../data/registry'

export interface IconNode { id: string; name: string; question?: string; method?: string; category: Category }
const REFERENCES = ['built.viewcones', 'built.sun', 'built.core-lifts']
const SIZES = [52, 40, 30]
const btn = 'flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-control outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40'

export default function IconEditor({ node }: { node: IconNode }) {
  const saved = useNodeIcons((s) => s.icons[node.id])
  const setIcon = useNodeIcons((s) => s.setIcon), clearIcon = useNodeIcons((s) => s.clearIcon)
  const [mode, setMode] = useState<'generate' | 'upload'>(saved?.kind === 'image' ? 'upload' : 'generate')
  const [note, setNote] = useState<string | null>(null)

  // ---- generate
  const [brief, setBrief] = useState<IconBrief>(() => (saved?.kind === 'generated' ? saved.brief : proposeBrief(node)))
  const [variant, setVariant] = useState(saved?.kind === 'generated' ? saved.variant : 0)
  const generated: IconRecord = useMemo(() => ({ kind: 'generated', brief, variant, styleVersion: CURRENT_STYLE, source: 'editor', updatedAt: '' }), [brief, variant])
  const concept = (patch: Partial<IconBrief['metaphor']>) => { setBrief((b) => ({ ...b, metaphor: { ...b.metaphor, ...patch } })); setVariant(0) }

  // ---- upload
  const [up, setUp] = useState<{ upload: Upload; name: string } | null>(null)
  const [problems, setProblems] = useState<string[]>([])
  const [adjust, setAdjust] = useState<Adjust>(FIT)
  const [display, setDisplay] = useState<{ original: string; restyled: string | null; checks: QualityCheck[]; restyledChecks: QualityCheck[] | null } | null>(null)
  const [useRestyled, setUseRestyled] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const take = async (f: File | undefined) => {
    if (!f) return
    setNote(null)
    const r = await readUpload(f)
    if (!r.ok) { setProblems(r.problems); setUp(null); setDisplay(null); return }
    setProblems([]); setAdjust(FIT); setUseRestyled(false); setUp({ upload: r.upload, name: f.name })
  }
  // The display asset and its checks follow the adjustments; a restyled copy is remade from them when it exists.
  const wantRestyle = useRef(false)
  useEffect(() => {
    if (!up) return
    const cv = renderDisplay(up.upload.bitmap, up.upload.width, up.upload.height, adjust)
    const px = pixels(cv)
    const checks = qualityChecks(px.rgba, DISPLAY, px.small)
    let restyled: string | null = null, restyledChecks: QualityCheck[] | null = null
    if (wantRestyle.current) { const rc = restyledCanvas(cv), rp = pixels(rc); restyled = rc.toDataURL('image/png'); restyledChecks = qualityChecks(rp.rgba, DISPLAY, rp.small) }
    setDisplay({ original: cv.toDataURL('image/png'), restyled, checks, restyledChecks })
  }, [up, adjust])
  const restyle = () => { wantRestyle.current = true; setAdjust((a) => ({ ...a })); setUseRestyled(true) }
  const uploaded: IconRecord | null = up && display ? { kind: 'image', source: 'upload', styleVersion: CURRENT_STYLE, updatedAt: '', display: display.original, restyled: display.restyled, useRestyled: useRestyled && !!display.restyled, adjust, width: up.upload.width, height: up.upload.height, type: up.upload.type, checks: useRestyled && display.restyledChecks ? display.restyledChecks : display.checks } : null

  const candidate = mode === 'generate' ? generated : uploaded
  const use = async () => {
    if (!candidate) return
    if (candidate.kind === 'image' && up) {
      const kept = await saveOriginal(node.id, { bytes: up.upload.bytes.buffer.slice(up.upload.bytes.byteOffset, up.upload.bytes.byteOffset + up.upload.bytes.byteLength) as ArrayBuffer, type: up.upload.type, name: up.name, savedAt: new Date().toISOString() })
      setNote(kept ? 'Icon saved. The original file is kept in this browser.' : 'Icon saved. This browser would not keep the original file, so restyling it again later needs the file.')
    } else setNote('Icon saved.')
    setIcon(node.id, { ...candidate, updatedAt: new Date().toISOString() })
  }
  const checks = candidate?.kind === 'image' ? candidate.checks : null

  return (
    <section aria-labelledby="icon-editor-title" className="grid gap-3 text-sm" data-testid="icon-editor">
      <div className="flex items-center gap-1.5">
        <h3 id="icon-editor-title" className="text-section">Icon for {node.name}</h3>
        <Help label="About node icons">
          An icon is artwork only: the tile, its size and corners, the connection points, the hover, focus and selected states, the category marker and the node’s name are always drawn by the toolkit, the same for every node, and changing the icon never changes what the node does.
          Generate draws one architectural object (and at most one small cue) in the toolkit’s isometric style, from the same parts as the toolkit’s own icons (style pack {CURRENT_STYLE}). Upload takes a PNG, JPEG or WebP up to 5 MB and 64–4096 px; it is fitted whole into the tile, and you can crop it. Match toolkit style makes a copy with the background removed and the colours brought onto the toolkit’s palette; your original is kept. The checks below say how it will read; they are advice, not a gate. Rules for you or your AI agent: {STYLE_PACK_URL}
        </Help>
      </div>

      {/* the preview: in the real tile, at the sizes it is shown, beside the toolkit's own icons */}
      <div className="flex flex-wrap items-end gap-5" data-testid="icon-preview">
        <div className="flex items-end gap-3">
          {SIZES.map((s) => (
            <figure key={s} className="flex flex-col items-center gap-1">
              <NodeTile id={node.id} size={s} art={candidate ? <IconRecordArt icon={candidate} size={Math.round(s * 0.9)} /> : <NodeArtwork id={node.id} size={Math.round(s * 0.9)} category={node.category} />} />
              <figcaption className="text-meta text-muted">{s} px</figcaption>
            </figure>
          ))}
        </div>
        <div className="flex items-end gap-2 border-l border-line/70 pl-4" aria-label="The toolkit's own icons, for comparison">
          {REFERENCES.map((r) => <NodeTile key={r} id={r} size={52} />)}
        </div>
      </div>

      <div className="flex rounded-xl bg-black/5 p-0.5" role="tablist" aria-label="How to make the icon">
        {(['generate', 'upload'] as const).map((m) => (
          <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => setMode(m)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-control ${mode === m ? 'bg-white text-ink shadow-sm' : 'text-muted hover:text-ink'}`}>
            {m === 'generate' ? <Sparkles size={15} aria-hidden /> : <ImagePlus size={15} aria-hidden />}{m === 'generate' ? 'Generate' : 'Upload'}
          </button>
        ))}
      </div>

      {mode === 'generate' ? (
        <div className="grid gap-2" data-testid="icon-generate">
          <p className="flex flex-wrap items-center gap-1.5 text-sm text-ink">
            <span>Shows</span>
            <select aria-label="Main object" value={brief.metaphor.object} onChange={(e) => concept({ object: e.target.value as IconObject })} className="rounded-lg border border-line bg-white px-2 py-1 text-control">
              {OBJECTS.map((o) => <option key={o} value={o}>{OBJECT_WORDS[o].toLowerCase()}</option>)}
            </select>
            <span>with</span>
            <select aria-label="Supporting cue" value={brief.metaphor.cue ?? 'none'} onChange={(e) => concept({ cue: e.target.value as IconCue })} className="rounded-lg border border-line bg-white px-2 py-1 text-control">
              {CUES.map((c) => <option key={c} value={c}>{CUE_WORDS[c].toLowerCase()}</option>)}
            </select>
          </p>
          <p className="text-meta text-muted">Proposed from the node’s name, question and category. Pick what the node actually does; the icon should not promise more.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setVariant((v) => v + 1)} disabled={!HAS_VARIANTS.has(brief.metaphor.object)} title={HAS_VARIANTS.has(brief.metaphor.object) ? 'Another drawing of the same concept' : 'This object has one drawing: pick another object or cue to change it'} className={`${btn} bg-white text-ink hover:bg-white/80`} data-testid="icon-regenerate"><Wand2 size={15} aria-hidden />Regenerate</button>
            <button type="button" onClick={() => { setBrief(proposeBrief(node)); setVariant(0) }} className={`${btn} bg-white text-ink hover:bg-white/80`}><RotateCcw size={15} aria-hidden />Propose again</button>
            <button type="button" onClick={use} className={`${btn} bg-accent`} data-testid="icon-use"><Check size={15} aria-hidden />Use icon</button>
          </div>
        </div>
      ) : (
        <div className="grid gap-2" data-testid="icon-upload">
          <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => { void take(e.target.files?.[0]); e.target.value = '' }} data-testid="icon-file" />
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => input.current?.click()} className={`${btn} bg-white text-ink hover:bg-white/80`}><ImagePlus size={15} aria-hidden />{up ? 'Choose another image' : 'Choose an image'}</button>
            {up && <span className="text-meta text-muted">{up.name} · {TYPE_WORD[up.upload.type]} · {up.upload.width} × {up.upload.height} px</span>}
          </div>
          {problems.length > 0 && <ul className="grid gap-1 text-sm text-[#a0322a]" role="alert">{problems.map((p) => <li key={p} className="flex items-start gap-1.5"><TriangleAlert size={15} className="mt-0.5 shrink-0" aria-hidden />{p}</li>)}</ul>}
          {up && display && (
            <>
              <details className="rounded-xl bg-white/50 px-3 py-2">
                <summary className="cursor-pointer text-control text-ink">Image adjustments</summary>
                <div className="mt-2 grid gap-2">
                  <div className="flex rounded-lg bg-black/5 p-0.5 text-control" role="radiogroup" aria-label="How the image sits in the tile">
                    {(['fit', 'crop'] as const).map((m) => <button key={m} type="button" role="radio" aria-checked={adjust.mode === m} onClick={() => setAdjust((a) => ({ ...a, mode: m }))} className={`flex-1 rounded-md px-2 py-1 ${adjust.mode === m ? 'bg-white shadow-sm' : 'text-muted'}`}>{m === 'fit' ? 'Fit (the whole image)' : 'Crop'}</button>)}
                  </div>
                  {adjust.mode === 'crop' && (
                    <div className="grid gap-1.5 text-meta text-muted">
                      <label className="flex items-center gap-2">Zoom<input type="range" min={1} max={3} step={0.05} value={adjust.zoom} onChange={(e) => setAdjust((a) => ({ ...a, zoom: Number(e.target.value) }))} className="flex-1" /></label>
                      <label className="flex items-center gap-2">Left–right<input type="range" min={-1} max={1} step={0.05} value={adjust.dx} onChange={(e) => setAdjust((a) => ({ ...a, dx: Number(e.target.value) }))} className="flex-1" /></label>
                      <label className="flex items-center gap-2">Up–down<input type="range" min={-1} max={1} step={0.05} value={adjust.dy} onChange={(e) => setAdjust((a) => ({ ...a, dy: Number(e.target.value) }))} className="flex-1" /></label>
                    </div>
                  )}
                  <button type="button" onClick={() => setAdjust(FIT)} className="justify-self-start text-meta text-accent hover:underline">Reset</button>
                </div>
              </details>
              <div className="flex flex-wrap items-center gap-2">
                {!display.restyled ? <button type="button" onClick={restyle} className={`${btn} bg-white text-ink hover:bg-white/80`} data-testid="icon-restyle"><Wand2 size={15} aria-hidden />Match toolkit style</button>
                  : <div className="flex rounded-lg bg-black/5 p-0.5 text-control" role="radiogroup" aria-label="Which version">
                      {[false, true].map((r) => <button key={String(r)} type="button" role="radio" aria-checked={useRestyled === r} onClick={() => setUseRestyled(r)} className={`rounded-md px-2.5 py-1 ${useRestyled === r ? 'bg-white shadow-sm' : 'text-muted'}`}>{r ? 'Restyled' : 'Original'}</button>)}
                    </div>}
                <button type="button" onClick={use} className={`${btn} bg-accent`} data-testid="icon-use-upload"><Check size={15} aria-hidden />Use icon</button>
              </div>
            </>
          )}
        </div>
      )}

      {checks && (
        <ul className="grid gap-1" aria-label="How the icon will read" data-testid="icon-checks">
          {checks.map((c) => (
            <li key={c.id} className="flex items-start gap-1.5 text-meta" title={c.detail}>
              {c.state === 'pass' ? <Check size={14} className="mt-px shrink-0 text-[#2e8b57]" aria-hidden /> : <TriangleAlert size={14} className="mt-px shrink-0 text-[#c27a12]" aria-hidden />}
              <span><span className="font-semibold text-ink">{c.label}</span> <span className="text-muted">{c.detail}</span></span>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-line/60 pt-2">
        {saved ? <span className="text-meta text-muted">In use: {saved.kind === 'generated' ? `generated (style pack ${saved.styleVersion})` : `${saved.useRestyled ? 'restyled ' : ''}uploaded image`}{saved.source === 'agent' ? ', from an AI agent' : ''}</span>
          : <span className="text-meta text-muted">No icon yet: the node shows the standard illustration. Saving the node never needs one.</span>}
        {saved && <button type="button" onClick={() => { clearIcon(node.id); setNote('Icon removed: the node shows the standard illustration.') }} className="ml-auto flex items-center gap-1 text-meta text-muted hover:text-[#a0322a]"><Trash2 size={13} aria-hidden />Remove icon</button>}
      </div>
      {note && <p role="status" className="text-meta text-ink">{note}</p>}
    </section>
  )
}
