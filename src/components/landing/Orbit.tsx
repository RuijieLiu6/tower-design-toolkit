// The landing page's one drawing (the research site's design loop, made live): one shared tower model in the middle,
// the analysis categories around it, each a node every stage can call. When a workflow is in view, the categories in
// it light up and wire to the model, so the idea and the visitor's own starting point are one picture. Drawn in the
// toolkit's own style (Ruijie, 7 Nov: "recreate this diagram so that it matches the overall style of your website"):
// the categories are the same frosted icon tiles as everywhere else (GlassIcon, lit = opaque, off = clear glass), the
// wires take each category's bright hue, and the model is a glass tower on a frosted podium.
import GlassIcon, { CATEGORY_HUE, ICON } from '../GlassIcon'
import { CATEGORY_ICONS } from '../../data/icons'
import { BUILT_NODES, CATEGORIES, type Category } from '../../data/registry'

/** Categories with built nodes, in a fixed ring order (site and program at the top, then round the tower). */
const RING: Category[] = (['SITE', 'PROG', 'PUBL', 'CULT', 'MOBI', 'ECOL', 'ENER', 'CLIM', 'STRC', 'SYST', 'SPAC'] as Category[])
  .filter((c) => BUILT_NODES.some((n) => n.category === c))
const SHORT: Partial<Record<Category, string>> = {
  SITE: 'Site & views', PROG: 'Program & value', PUBL: 'Public realm', CULT: 'Culture', MOBI: 'Mobility', ECOL: 'Nature',
  ENER: 'Energy & carbon', CLIM: 'Sun & wind', STRC: 'Structure', SYST: 'Systems & code', SPAC: 'Facade & interior',
}
const hue = (c: Category, l = 55) => `hsl(${CATEGORY_HUE[c]} 80% ${l}%)`

export default function Orbit({ nodes, label }: { nodes: string[]; label: string | null }) {
  const W = 440, C = W / 2, R = 165
  const lit = new Map<Category, number>()
  for (const id of nodes) { const n = BUILT_NODES.find((x) => x.id === id); if (n) lit.set(n.category, (lit.get(n.category) ?? 0) + 1) }
  const at = (i: number) => { const a = -Math.PI / 2 + (i * 2 * Math.PI) / RING.length; return [C + R * Math.cos(a), C + R * Math.sin(a)] as const }
  const pct = (v: number) => `${(v / W) * 100}%`
  return (
    <figure className="m-0 w-full max-w-[440px]" aria-label={label ? `${label}: ${nodes.length} analysis nodes around one tower model` : 'One tower model with the analysis nodes around it'}>
      <div className="relative aspect-square w-full" data-testid="landing-orbit" aria-hidden>
        <svg viewBox={`0 0 ${W} ${W}`} className="absolute inset-0 h-full w-full">
          <defs>
            <linearGradient id="orbit-glass" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#fff" stopOpacity="0.95" />
              <stop offset="1" stopColor="hsl(206 90% 88%)" stopOpacity="0.55" />
            </linearGradient>
            <linearGradient id="orbit-podium" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#fff" stopOpacity="0.9" />
              <stop offset="1" stopColor="#fff" stopOpacity="0.45" />
            </linearGradient>
          </defs>
          <circle cx={C} cy={C} r={R} fill="none" stroke="#fff" strokeOpacity={0.8} strokeWidth={1} strokeDasharray="2 6" />
          {RING.map((c, i) => {
            const [x, y] = at(i), on = lit.has(c)
            return <line key={c} x1={C} y1={C - 10} x2={x} y2={y} stroke={on ? hue(c) : '#fff'} strokeOpacity={on ? 0.85 : 0.7} strokeWidth={on ? 1.8 : 1} className="transition-[stroke-opacity] duration-300" />
          })}
          {/* the shared model: a glass tower on a frosted podium, in axonometric */}
          <g transform={`translate(${C} ${C + 34})`}>
            <ellipse cx={0} cy={6} rx={58} ry={18} fill="hsl(206 40% 40%)" opacity={0.12} />
            <path d="M-50 0 L0 26 L50 0 L0 -26 Z" fill="url(#orbit-podium)" stroke="#fff" strokeWidth={1.2} />
            <path d="M-50 0 V-12 L0 -38 L50 -12 V0 L0 26 Z" fill="url(#orbit-podium)" stroke="#fff" strokeWidth={1.2} />
            <path d="M-50 -12 L0 14 L50 -12 M0 14 V26" fill="none" stroke="hsl(206 30% 60%)" strokeOpacity={0.5} strokeWidth={1} />
            <path d="M-19 -21 V-108 L0 -118 L19 -108 V-21 L0 -11 Z" fill="url(#orbit-glass)" stroke="hsl(206 80% 55%)" strokeOpacity={0.9} strokeWidth={1.3} />
            <path d="M-19 -108 L0 -98 L19 -108 M0 -98 V-11" fill="none" stroke="hsl(206 80% 55%)" strokeOpacity={0.9} strokeWidth={1.3} />
            {[0, 1, 2, 3, 4, 5, 6].map((k) => <path key={k} d={`M-19 ${-32 - k * 11} L0 ${-22 - k * 11} L19 ${-32 - k * 11}`} fill="none" stroke="hsl(206 80% 55%)" strokeOpacity={0.3} strokeWidth={0.8} />)}
            <path d="M-12 -100 L-12 -30" stroke="#fff" strokeOpacity={0.9} strokeWidth={2} />
          </g>
        </svg>
        <span className="absolute left-1/2 -translate-x-1/2 text-[12px] font-semibold text-ink" style={{ top: pct(C + 78) }}>One shared model</span>
        {RING.map((c, i) => {
          const [x, y] = at(i), on = lit.has(c), n = lit.get(c) ?? 0, below = y > C - 20
          return (
            <div key={c} className="absolute flex -translate-x-1/2 -translate-y-1/2" style={{ left: pct(x), top: pct(y) }} data-category={c} data-lit={on || undefined}>
              <GlassIcon icon={CATEGORY_ICONS[c]} hue={CATEGORY_HUE[c]} size={ICON.tool} level={on ? 'on' : 'off'} />
              {on && n > 1 && <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-ink px-1 text-[10.5px] font-semibold text-white">{n}</span>}
              <span className={`absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-[11px] ${below ? 'top-full mt-1' : 'bottom-full mb-1'} ${on ? 'font-semibold text-ink' : 'text-muted'}`}>{SHORT[c] ?? CATEGORIES[c].label}</span>
            </div>
          )
        })}
      </div>
      <figcaption className="mt-1 text-center text-[13px] text-muted">{label ? <>Lit: the nodes in <b className="font-semibold text-ink">{label}</b></> : 'Every analysis is a node that reads the same model'}</figcaption>
    </figure>
  )
}
