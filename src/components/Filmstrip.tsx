import { Aperture, Download } from 'lucide-react'
import { aiLabel } from '../engine/renderPrompt'
import { captureShot } from '../lib/capture'
import { STAGE_LABEL, useStore } from '../store'

/** Present: the library folds into a strip of captured shots (each stamped with stage and representation). */
export default function Filmstrip() {
  const shots = useStore((s) => s.shots)
  return (
    <div className="flex h-full flex-col gap-2 overflow-y-auto p-2 text-chrome-ink">
      <button onClick={() => captureShot(false)} className="flex flex-col items-center gap-1 rounded-md border border-dashed border-white/30 py-3 text-[10px] hover:border-white/70">
        <Aperture size={16} />Capture
      </button>
      {shots.map((s) => (
        <figure key={s.id} className="group relative">
          <img src={s.dataUrl} alt={s.ai ? aiLabel(s.ai) : `Shot: ${STAGE_LABEL[s.stage]}, ${s.representation}`} className={`w-full rounded border ${s.ai ? 'border-fuchsia-400/70' : 'border-white/20'}`} />
          {s.ai && <span className="absolute left-1 top-1 rounded bg-fuchsia-700 px-1 py-0.5 text-[8px] font-semibold uppercase tracking-wide text-white">AI-generated</span>}
          <figcaption className="mt-0.5 text-[9px] opacity-70">{s.ai ? `from ${s.ai.sourceLabel || 'unknown capture'}` : `${s.representation === 'plan' ? 'Plan' : s.representation === 'xray' ? 'X-ray' : 'Clay'} · ${new Date(s.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}</figcaption>
          <a href={s.dataUrl} download={`shot-${s.at.slice(0, 19).replace(/[:T]/g, '-')}.png`} aria-label="Download shot"
            className="absolute right-1 top-1 hidden rounded bg-black/60 p-1 group-hover:block"><Download size={12} /></a>
        </figure>
      ))}
      {shots.length === 0 && <p className="text-[10px] opacity-60">Shots you capture appear here.</p>}
    </div>
  )
}
