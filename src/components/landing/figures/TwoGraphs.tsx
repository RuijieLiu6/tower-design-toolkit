// Two designers, two graphs: a form-first and a brief-first designer wire the same node library in different orders.
// Each graph reads left to right (analysis nodes in, then the stages they feed, then the drawing set), with its loop
// back drawn in the accent and the step it leaves out as a dashed empty slot. The library underneath holds the ten
// analysis nodes; any node, in a graph or in the library, lights where each designer wired it.
import { ICON } from '../../GlassIcon'
import { ACCENT, chevron, cubic, dir, Ghost, hueWire, Info, line, SLATE, Tile, useParts, useWidth, Wire, WireNote, type InfoPart, type Pt, type WordAt } from './kit'
import { analysis, ANALYSES, analysisText, DRAWINGS, ENGINE, STAGES, type Item } from './content'

interface GNode { k: string; item: Item; col: number; row: number; wordAt?: WordAt }
interface Graph {
  id: 'a' | 'b'; title: string; mode: 'advanced' | 'basic'; text: string
  nodes: GNode[]; edges: [string, string][]; loop: { from: string; to: string; note: string; side: 'over' | 'right' }
  ghost: { item: Item; col: number; row: number; title: string; text: string }
}

const A: Graph = {
  id: 'a', title: 'Designer A · form-first', mode: 'advanced',
  text: 'Sun, view cone and building code feed the massing engine (advanced), then program and schematic, then the drawing set.',
  nodes: [
    { k: 'sun', item: analysis('sun'), col: 0, row: 0 }, { k: 'view', item: analysis('view'), col: 0, row: 1 }, { k: 'code', item: analysis('code'), col: 0, row: 2 },
    { k: 'engine', item: ENGINE, col: 1, row: 1 }, { k: 'program', item: STAGES.program, col: 2, row: 0 }, { k: 'schematic', item: STAGES.schematic, col: 2, row: 2 },
    { k: 'drawings', item: DRAWINGS, col: 3, row: 1 },
  ],
  edges: [['sun', 'engine'], ['view', 'engine'], ['code', 'engine'], ['engine', 'program'], ['engine', 'schematic'], ['program', 'drawings'], ['schematic', 'drawings']],
  loop: { from: 'program', to: 'engine', note: 're-mass', side: 'over' },
  ghost: { item: STAGES.concept, col: 3, row: -0.5, title: 'No concept node', text: 'Designer A went straight to form.' },
}
const B: Graph = {
  id: 'b', title: 'Designer B · brief-first', mode: 'basic',
  text: 'Economics and building code feed the program, which goes to concept / research; traffic, energy and structure feed the massing engine (basic), then design development and the drawing set.',
  nodes: [
    { k: 'economics', item: analysis('economics'), col: 0, row: 0 }, { k: 'code', item: analysis('code'), col: 0, row: 1 },
    { k: 'traffic', item: analysis('traffic'), col: 0, row: 2 }, { k: 'energy', item: analysis('energy'), col: 0, row: 3 }, { k: 'structure', item: analysis('structure'), col: 0, row: 4 },
    { k: 'program', item: STAGES.program, col: 1, row: 0.5, wordAt: 'above' }, { k: 'concept', item: STAGES.concept, col: 2, row: 0.5 },
    { k: 'engine', item: ENGINE, col: 1, row: 3 }, { k: 'development', item: STAGES.development, col: 2, row: 3 }, { k: 'drawings', item: DRAWINGS, col: 3, row: 3 },
  ],
  edges: [['economics', 'program'], ['code', 'program'], ['traffic', 'engine'], ['energy', 'engine'], ['structure', 'engine'], ['program', 'concept'], ['program', 'engine'], ['engine', 'development'], ['development', 'drawings']],
  loop: { from: 'engine', to: 'program', note: 're-stack', side: 'right' },
  ghost: { item: STAGES.schematic, col: 3, row: 0.5, title: 'No schematic node yet', text: 'Added when the numbers close.' },
}
const GRAPHS = [A, B]
const isAnalysis = (k: string) => ANALYSES.some((a) => a.k === k)
const IDLE = 'A form-first and a brief-first designer wire the same node library in different orders.'

export default function TwoGraphs() {
  const [box, w] = useWidth<HTMLDivElement>()
  const { active, bind } = useParts()
  const wide = w >= 720
  const S = wide ? ICON.feature : ICON.tool, I = ICON.tool
  const gw = wide ? (w - 48) / 2 : w
  const top = 62, r = 64
  const hOf = (g: Graph) => top + 20 + Math.max(...g.nodes.map((n) => n.row)) * r + 62
  // Graph A sits a row lower beside B, so the two read level.
  const shift = (g: Graph) => (wide && g.id === 'a' ? 1 : 0)
  const origin = (g: Graph): Pt => (g.id === 'a' ? { x: 0, y: 0 } : wide ? { x: gw + 48, y: 0 } : { x: 0, y: hOf(A) + 26 })
  const cols = (c: number) => 40 + c * ((gw - 40 - 30) / 3)
  const pos = (g: Graph, col: number, row: number): Pt => ({ x: origin(g).x + cols(col), y: origin(g).y + top + 20 + (row + shift(g)) * r })
  const sizeOf = (k: string) => (isAnalysis(k) ? I : S)
  const graphsH = wide ? Math.max(hOf(A) + r, hOf(B)) : origin(B).y + hOf(B)
  const libTop = graphsH + 14
  const perRow = wide ? 10 : 5
  const libStep = (w - 72) / (perRow - 1)
  const libAt = (i: number): Pt => ({ x: 36 + (i % perRow) * libStep, y: libTop + 52 + Math.floor(i / perRow) * 68 })
  const H = libAt(ANALYSES.length - 1).y + I / 2 + 30

  // What lights with the part in focus.
  const rel = new Set<string>()
  if (active) {
    rel.add(active)
    const [g, k] = active.includes(':') ? active.split(':') : [active, '']
    if (g === 'lib' || isAnalysis(k)) {
      rel.add(`lib:${k}`)
      for (const G of GRAPHS) if (G.nodes.some((n) => n.k === k)) { rel.add(`${G.id}:${k}`); rel.add(G.id); G.edges.filter((e) => e[0] === k).forEach((e) => { rel.add(`${G.id}:${e[0]}>${e[1]}`); rel.add(`${G.id}:${e[1]}`) }) }
    } else {
      const G = GRAPHS.find((x) => x.id === g)!
      if (!k) {
        rel.add(`${g}:ghost`); rel.add(`${g}:loop`)
        G.nodes.forEach((n) => { rel.add(`${g}:${n.k}`); if (isAnalysis(n.k)) rel.add(`lib:${n.k}`) })
        G.edges.forEach((e) => rel.add(`${g}:${e[0]}>${e[1]}`))
      } else if (k !== 'ghost') {
        rel.add(g)
        G.edges.filter((e) => e.includes(k)).forEach((e) => { rel.add(`${g}:${e[0]}>${e[1]}`); rel.add(`${g}:${e[0]}`); rel.add(`${g}:${e[1]}`) })
        if (G.loop.from === k || G.loop.to === k) rel.add(`${g}:loop`)
      } else rel.add(g)
    }
  }
  const dim = (id: string) => !!active && !rel.has(id)

  // A link between two tiles: straight when they share a row or a column, else an S with level ends.
  const link = (G: Graph, from: string, to: string) => {
    const a = G.nodes.find((n) => n.k === from)!, b = G.nodes.find((n) => n.k === to)!
    const pa = pos(G, a.col, a.row), pb = pos(G, b.col, b.row), sa = sizeOf(from) / 2, sb = sizeOf(to) / 2
    if (a.col === b.col) {
      const down = pb.y > pa.y, p0 = { x: pa.x, y: pa.y + (down ? sa + 5 : -sa - 5) }, p1 = { x: pb.x, y: pb.y + (down ? -sb - 6 : sb + 6) }
      return { d: line(p0, p1), head: chevron(p1, down ? Math.PI / 2 : -Math.PI / 2, 4.5) }
    }
    const p0 = { x: pa.x + sa + 5, y: pa.y }, p1 = { x: pb.x - sb - 6, y: pb.y }, mx = (p0.x + p1.x) / 2
    return Math.abs(pa.y - pb.y) < 1 ? { d: line(p0, p1), head: chevron(p1, 0, 4.5) } : { d: cubic(p0, { x: mx, y: p0.y }, { x: mx, y: p1.y }, p1), head: chevron(p1, 0, 4.5) }
  }
  // The loop back: a hook from the later tile's left side over into the top of the earlier one, or bowed out to the
  // right of a vertical link.
  const loopPath = (G: Graph) => {
    const a = G.nodes.find((n) => n.k === G.loop.from)!, b = G.nodes.find((n) => n.k === G.loop.to)!
    const pa = pos(G, a.col, a.row), pb = pos(G, b.col, b.row), sa = sizeOf(a.k) / 2, sb = sizeOf(b.k) / 2
    if (G.loop.side === 'right') {
      const p0 = { x: pa.x + 10, y: pa.y - sa - 4 }, p1 = { x: pb.x + 10, y: pb.y + sb + 6 }, bow = Math.min(40, (cols(2) - cols(1)) * 0.38)
      const c1 = { x: pa.x + bow, y: p0.y - 24 }, c2 = { x: pb.x + bow, y: p1.y + 24 }
      return { d: cubic(p0, c1, c2, p1), head: chevron(p1, dir(c2, p1), 5), note: { x: pa.x + bow + 4, y: (p0.y + p1.y) / 2 }, anchor: 'start' as const }
    }
    const p0 = { x: pa.x - sa - 5, y: pa.y - 10 }, p1 = { x: pb.x, y: pb.y - sb - 6 }
    const c1 = { x: pb.x + (p0.x - pb.x) * 0.25, y: p0.y }, c2 = { x: pb.x, y: p0.y + (p1.y - p0.y) * 0.25 }
    return { d: cubic(p0, c1, c2, p1), head: chevron(p1, Math.PI / 2, 5), note: { x: (p0.x + pb.x) / 2, y: p0.y - 11 }, anchor: 'middle' as const }
  }

  const [g, k] = active?.includes(':') ? active.split(':') : [active, '']
  const G = GRAPHS.find((x) => x.id === g)
  const focusItem = k && k !== 'ghost' ? (G?.nodes.find((n) => n.k === k)?.item ?? (g === 'lib' ? analysis(k) : undefined)) : undefined
  const info: InfoPart | null = G && !k ? { title: G.title, text: `${G.text} ${G.ghost.title}: ${G.ghost.text.charAt(0).toLowerCase()}${G.ghost.text.slice(1)}` }
    : G && k === 'ghost' ? { title: G.ghost.title, text: G.ghost.text }
    : focusItem ? (isAnalysis(focusItem.k) ? { title: focusItem.name, text: analysisText(focusItem), role: focusItem.role }
      : focusItem.k === 'engine' ? { title: `Massing engine · ${G!.mode}`, text: `The shared model's massing engine, in ${G!.mode} mode.`, role: 'tool' }
      : { title: focusItem.name, text: focusItem.sub, role: focusItem.role })
    : null

  return (
    <div className="grid gap-3">
      <div ref={box} role="group" aria-label="Two designers, two graphs: a form-first and a brief-first graph wired from the same ten-node library in different orders."
        className="relative w-full" style={{ height: H }}>
        <svg aria-hidden className="pointer-events-none absolute inset-0" width={w} height={H} viewBox={`0 0 ${w} ${H}`}>
          {GRAPHS.map((G) => G.edges.map(([from, to]) => {
            const l = link(G, from, to), src = G.nodes.find((n) => n.k === from)!.item
            return <Wire key={`${G.id}${from}${to}`} d={l.d} head={l.head} color={isAnalysis(from) ? hueWire(src.hue, 0.75) : SLATE} width={1.3} dim={dim(`${G.id}:${from}>${to}`)} />
          }))}
          {GRAPHS.map((G) => { const l = loopPath(G); return <Wire key={`${G.id}loop`} d={l.d} head={l.head} color={ACCENT} width={1.5} dash="5 4" dim={dim(`${G.id}:loop`)} /> })}
          {/* the hairline between the two graphs, and above the library */}
          {wide ? <path d={`M${gw + 24} 8V${graphsH - 8}`} stroke="rgb(255 255 255 / 0.9)" strokeWidth={1} /> : <path d={`M8 ${origin(B).y - 13}H${w - 8}`} stroke="rgb(255 255 255 / 0.9)" strokeWidth={1} />}
          <path d={`M8 ${libTop}H${w - 8}`} stroke="rgb(255 255 255 / 0.9)" strokeWidth={1} />
        </svg>

        {GRAPHS.map((G) => {
          const o = origin(G), l = loopPath(G), gp = pos(G, G.ghost.col, G.ghost.row)
          return (
            <div key={G.id}>
              <button type="button" {...bind(G.id)} aria-label={`${G.title}: show this graph`}
                className={`absolute rounded-xl px-1.5 py-0.5 text-left outline-none transition-opacity duration-200 focus-visible:ring-2 focus-visible:ring-accent motion-reduce:transition-none ${dim(G.id) ? 'opacity-25' : ''}`}
                style={{ left: o.x + 8, top: o.y + 2 }}>
                <span aria-hidden className="block text-node font-semibold text-ink hover:text-accent">{G.title}</span>
                <span aria-hidden className="block text-meta text-muted">Massing engine · {G.mode}</span>
              </button>
              {G.nodes.map((n) => {
                const p = pos(G, n.col, n.row), an = isAnalysis(n.k)
                return <Tile key={n.k} testId={`${G.id}-${n.k}`} x={p.x} y={p.y} size={sizeOf(n.k)} icon={n.item.icon} hue={n.item.hue} word={n.item.word} wordAt={n.wordAt ?? 'below'} strong={!an}
                  label={an ? `Analysis node: ${n.item.name}` : n.k === 'engine' ? `Massing engine, ${G.mode}` : n.item.name} role={n.item.role} dim={dim(`${G.id}:${n.k}`)} bind={bind(`${G.id}:${n.k}`)} />
              })}
              <Ghost x={gp.x} y={gp.y} size={sizeOf('ghost')} icon={G.ghost.item.icon} word={`no ${G.ghost.item.word}`} label={`${G.ghost.title}: ${G.ghost.text}`} dim={dim(`${G.id}:ghost`)} bind={bind(`${G.id}:ghost`)} />
              <WireNote x={l.note.x} y={l.note.y} anchor={l.anchor} dim={dim(`${G.id}:loop`)}>{G.loop.note}</WireNote>
            </div>
          )
        })}

        <p className="absolute left-2 text-[12.5px] font-semibold text-ink" style={{ top: libTop + 8 }}>Node library <span className="font-normal text-muted">· the ten analysis nodes</span></p>
        {ANALYSES.map((a, i) => { const p = libAt(i); return <Tile key={a.k} testId={`lib-${a.k}`} x={p.x} y={p.y} size={I} icon={a.icon} hue={a.hue} level={active === `lib:${a.k}` || rel.has(`lib:${a.k}`) ? 'on' : 'soft'} word={a.word} label={`Analysis node: ${a.name}`} role={a.role} dim={dim(`lib:${a.k}`)} bind={bind(`lib:${a.k}`)} /> })}
      </div>
      <Info part={info} idle={IDLE} />
    </div>
  )
}
