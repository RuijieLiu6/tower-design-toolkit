// "How the toolkit runs": the research site's three figures (https://ruijieliu6.github.io/vancouver-tower-toolbench/#research,
// same authors), the design loop, why one platform, and two designers' node graphs. Redrawn here in the toolkit's own
// style (Ruijie, 7 Nov: "redesign all these diagrams so that it matches the rest style of your site"): one glass window,
// the figures inside it drawn with the same icon tiles and thin wires as the landing page's Orbit (figures/), the long
// texts in one info line that answers hover and tap, and the research site's legend of who does what as the dots on
// the tiles. Same content and meaning as the research site's figures; no external script, styles or pictures.
import { useState, type KeyboardEvent } from 'react'
import { ExternalLink } from '../icons'
import DesignLoop from './figures/DesignLoop'
import WhyOnePlatform from './figures/WhyOnePlatform'
import TwoGraphs from './figures/TwoGraphs'
import { RoleLegend } from './figures/kit'

const FIGS = [
  { id: 'loop', title: 'The design loop', Figure: DesignLoop },
  { id: 'why', title: 'Why one platform', Figure: WhyOnePlatform },
  { id: 'graphs', title: 'Two designers, two graphs', Figure: TwoGraphs },
] as const
type FigId = (typeof FIGS)[number]['id']
const RESEARCH = 'https://ruijieliu6.github.io/vancouver-tower-toolbench/#research'

export default function ResearchFigures() {
  const [shown, setShown] = useState<FigId>('loop')
  const go = (id: FigId) => { setShown(id); document.getElementById(`research-tab-${id}`)?.focus() }
  const onKey = (e: KeyboardEvent) => {
    const i = FIGS.findIndex((f) => f.id === shown)
    const to = e.key === 'ArrowRight' ? (i + 1) % FIGS.length : e.key === 'ArrowLeft' ? (i + FIGS.length - 1) % FIGS.length : e.key === 'Home' ? 0 : e.key === 'End' ? FIGS.length - 1 : -1
    if (to < 0) return
    e.preventDefault(); go(FIGS[to].id)
  }
  const { Figure } = FIGS.find((f) => f.id === shown)!
  return (
    <section aria-labelledby="research-title" data-testid="landing-research" className="glass-edge grid gap-4 rounded-3xl bg-glass-3 p-4 md:p-5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h2 id="research-title" className="text-section text-ink">How the toolkit runs</h2>
        <div role="tablist" aria-label="Figures" className="flex flex-wrap gap-1" onKeyDown={onKey}>
          {FIGS.map((f) => (
            <button key={f.id} id={`research-tab-${f.id}`} type="button" role="tab" aria-selected={shown === f.id} aria-controls="research-figure" tabIndex={shown === f.id ? 0 : -1}
              onClick={() => setShown(f.id)}
              className={`rounded-full px-3 py-1.5 text-control outline-none focus-visible:ring-2 focus-visible:ring-accent ${shown === f.id ? 'bg-ink font-semibold text-white' : 'text-muted hover:bg-white/50 hover:text-ink'}`}>
              {f.title}
            </button>
          ))}
        </div>
        <a href={RESEARCH} target="_blank" rel="noreferrer" title="The figures come from the research site, by the same team"
          className="ml-auto flex items-center gap-1.5 rounded-full px-2 py-1 text-control text-accent outline-none hover:underline focus-visible:ring-2 focus-visible:ring-accent">
          Read the full research<ExternalLink size={14} aria-hidden />
        </a>
      </div>
      <div id="research-figure" role="tabpanel" aria-labelledby={`research-tab-${shown}`} data-figure={shown}>
        <Figure key={shown} />
      </div>
      <RoleLegend />
    </section>
  )
}
