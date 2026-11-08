import { Aperture, Download } from './icons'
import { aiLabel } from '../engine/renderPrompt'
import { captureShot } from '../lib/capture'
import { STAGE_LABEL, useStore } from '../store'

/**
 * Present: the captured shots (each stamped with stage and representation). `tone="light"`: inside the Present phase
 * panel (a white panel, two columns); the default is the dark strip.
 */
export default function Filmstrip({ tone = 'dark' }: { tone?: 'dark' | 'light' } = {}) {
  const shots = useStore((s) => s.shots)
  const light = tone === 'light'
  return (
    <div className={light ? 'grid grid-cols-2 gap-2 px-3 pb-3 text-ink' : 'flex h-full flex-col gap-2 overflow-y-auto p-2 text-chrome-ink'} data-testid="filmstrip">
      <button onClick={() => captureShot(false)} className={`flex flex-col items-center gap-1 rounded-md border border-dashed py-3 text-meta ${light ? 'border-line hover:border-accent hover:text-accent' : 'border-white/30 hover:border-white/70'}`}>
        <Aperture size={16} />Capture
      </button>
      {shots.map((s) => (
        <figure key={s.id} className="group relative">
          <img src={s.dataUrl} alt={s.ai ? aiLabel(s.ai) : `Shot: ${STAGE_LABEL[s.stage]}, ${s.representation}`} className={`w-full rounded border ${s.ai ? 'border-fuchsia-400/70' : light ? 'border-line' : 'border-white/20'}`} />
          {s.ai && <span className="absolute left-1 top-1 rounded bg-fuchsia-700 px-1 py-0.5 text-meta font-semibold text-white">AI-generated</span>}
          <figcaption className={`mt-0.5 text-meta ${light ? 'text-muted' : 'opacity-70'}`}>{s.ai ? `from ${s.ai.sourceLabel || 'unknown capture'}` : `${s.representation === 'plan' ? 'Plan' : s.representation === 'xray' ? 'X-ray' : 'Clay'} · ${new Date(s.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}</figcaption>
          <a href={s.dataUrl} download={`shot-${s.at.slice(0, 19).replace(/[:T]/g, '-')}.png`} aria-label="Download shot"
            className="absolute right-1 top-1 hidden rounded bg-black/60 p-1 group-hover:block"><Download size={12} /></a>
        </figure>
      ))}
      {shots.length === 0 && <p className={`text-meta ${light ? 'col-span-2 text-muted' : 'opacity-60'}`}>Shots you capture appear here.</p>}
    </div>
  )
}
