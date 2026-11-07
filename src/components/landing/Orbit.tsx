// The landing page's one drawing (the research site's design loop, made live): one shared tower model in the middle,
// the analysis categories around it, each a node every stage can call. When the agent has a workflow in view, the
// categories in it light up and wire to the model, so the idea and the visitor's own starting point are one picture.
import { CATEGORY_ICONS } from '../../data/icons'
import { BUILT_NODES, CATEGORIES, type Category } from '../../data/registry'

/** Categories with built nodes, in a fixed ring order (site and program at the top, then round the tower). */
const RING: Category[] = (['SITE', 'PROG', 'PUBL', 'CULT', 'MOBI', 'ECOL', 'ENER', 'CLIM', 'STRC', 'SYST', 'SPAC'] as Category[])
  .filter((c) => BUILT_NODES.some((n) => n.category === c))
const SHORT: Partial<Record<Category, string>> = {
  SITE: 'Site & views', PROG: 'Program & value', PUBL: 'Public realm', CULT: 'Culture', MOBI: 'Mobility', ECOL: 'Nature',
  ENER: 'Energy & carbon', CLIM: 'Sun & wind', STRC: 'Structure', SYST: 'Systems & code', SPAC: 'Facade & interior',
}

export default function Orbit({ nodes, label }: { nodes: string[]; label: string | null }) {
  const W = 440, C = W / 2, R = 162
  const lit = new Map<Category, number>()
  for (const id of nodes) { const n = BUILT_NODES.find((x) => x.id === id); if (n) lit.set(n.category, (lit.get(n.category) ?? 0) + 1) }
  const any = lit.size > 0
  const at = (i: number) => { const a = -Math.PI / 2 + (i * 2 * Math.PI) / RING.length; return [C + R * Math.cos(a), C + R * Math.sin(a)] as const }
  return (
    <figure className="m-0" aria-label={label ? `${label}: ${nodes.length} analysis nodes around one tower model` : 'One tower model with the analysis nodes around it'}>
      <svg viewBox={`0 0 ${W} ${W}`} className="h-auto w-full max-w-[440px]" role="img" aria-hidden data-testid="landing-orbit">
        <circle cx={C} cy={C} r={R} fill="none" className="stroke-line" strokeWidth={1} strokeDasharray="3 5" />
        {RING.map((c, i) => {
          const [x, y] = at(i), on = lit.has(c)
          return <line key={`w-${c}`} x1={C} y1={C} x2={x} y2={y} stroke={on ? CATEGORIES[c].color : 'currentColor'} strokeOpacity={on ? 0.9 : 0.08} strokeWidth={on ? 1.6 : 1} className="text-ink transition-[stroke-opacity] duration-300" />
        })}
        {/* the shared model: a tower on its podium, drawn in axonometric */}
        <g transform={`translate(${C} ${C + 30})`} aria-hidden>
          <path d="M-46 0 L0 24 L46 0 L0 -24 Z" className="fill-panel stroke-ink" strokeWidth={1} />
          <path d="M-46 0 V-14 L0 -38 L46 -14 V0" className="fill-paper stroke-ink" strokeWidth={1} />
          <path d="M0 -38 L0 -24 M-46 -14 L0 10 L46 -14" className="fill-none stroke-ink" strokeWidth={1} />
          <path d="M-18 -21 V-104 L0 -113 L18 -104 V-21 L0 -12 Z" className="fill-accent/15 stroke-accent" strokeWidth={1.4} />
          <path d="M-18 -104 L0 -95 L18 -104 M0 -95 V-12" className="fill-none stroke-accent" strokeWidth={1.4} />
          {[0, 1, 2, 3, 4, 5, 6].map((k) => <path key={k} d={`M-18 ${-32 - k * 11} L0 ${-23 - k * 11} L18 ${-32 - k * 11}`} className="fill-none stroke-accent" strokeOpacity={0.35} strokeWidth={0.8} />)}
        </g>
        <text x={C} y={C + 74} textAnchor="middle" className="fill-ink text-[12px] font-semibold">One shared model</text>
        {RING.map((c, i) => {
          const [x, y] = at(i), on = lit.has(c), Icon = CATEGORY_ICONS[c]
          return (
            <g key={c} className="transition-opacity duration-300" opacity={!any || on ? 1 : 0.35}>
              <circle cx={x} cy={y} r={on ? 24 : 21} fill={on ? CATEGORIES[c].color : 'var(--color-panel)'} stroke={CATEGORIES[c].color} strokeWidth={1.4} />
              <foreignObject x={x - 9} y={y - 9} width={18} height={18}><Icon size={18} color={on ? '#fff' : CATEGORIES[c].color} /></foreignObject>
              {on && (lit.get(c) ?? 0) > 1 && <g><circle cx={x + 18} cy={y - 18} r={8} className="fill-ink" /><text x={x + 18} y={y - 15} textAnchor="middle" className="fill-white text-[10px] font-semibold">{lit.get(c)}</text></g>}
              <text x={x} y={y + (y > C ? 38 : -30)} textAnchor="middle" className={`text-[11px] ${on ? 'fill-ink font-semibold' : 'fill-muted'}`}>{SHORT[c] ?? CATEGORIES[c].label}</text>
            </g>
          )
        })}
      </svg>
      <figcaption className="mt-1 text-center text-[12px] text-muted">{label ? <>Lit: the nodes in <b className="font-semibold text-ink">{label}</b></> : 'Every analysis is a node that reads the same model'}</figcaption>
    </figure>
  )
}
