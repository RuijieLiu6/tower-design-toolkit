// The design loop: five stages on a ring around one shared model, each linked both ways to its neighbours (no stage is
// a prerequisite for the next), the ten analysis nodes on an inner ring reading the model, and the drawing set one
// step out from the model, at any point. On a wide screen the drawing set sits to the right; on a phone, below.
import { useId } from 'react'
import { ICON } from '../../GlassIcon'
import { ACCENT, at, chevron, clamp, cubic, dir, hueWire, Info, line, ModelTower, SLATE, Tile, useParts, useWidth, WHITE, Wire, WireNote, type InfoPart, type Pt, type WordAt } from './kit'
import { ANALYSES, analysisText, DRAWINGS, STAGES, type StageKey } from './content'

/** Ring order, clockwise from the top; each stage's angle (degrees) around the model. */
const RING: { k: StageKey; deg: number }[] = [
  { k: 'form', deg: -90 }, { k: 'program', deg: -18 }, { k: 'schematic', deg: 54 }, { k: 'development', deg: 126 }, { k: 'concept', deg: 198 },
]
const rad = (d: number) => (d * Math.PI) / 180
/** The analysis nodes sit between the stage spokes (36° apart, 18° off them), so every spoke passes in a gap. */
const nodeDeg = (i: number) => -108 + i * 36
const IDLE = 'Five stages around one shared model. Enter at any stage, move either way, and step out to the drawing set when the scheme is ready.'

export default function DesignLoop() {
  const [box, w] = useWidth<HTMLDivElement>()
  const { active, bind } = useParts()
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const wide = w >= 700
  // On a phone the stages take the smaller tile too, so ten nodes, five stages and their words fit in 360 px.
  const S = wide ? ICON.feature : ICON.tool, A = ICON.tool

  // Geometry, in pixels for this width. Stages on an ellipse (a circle on a phone), nodes on a circle inside it.
  let rx: number, ry: number, cx: number, cy: number, ra: number
  let out: Pt
  if (wide) {
    rx = clamp((w - 400) / 2, 200, 280); ry = 185
    const G = 2 * rx + 150 + 210
    cx = Math.max(0, (w - G) / 2) + 75 + rx; cy = 40 + ry; ra = 116
    out = { x: Math.min(w - 60, cx + rx + 175), y: cy + 30 }
  } else {
    const r = clamp((w / 2 - 40) / 0.951, 110, 150)
    // A taller ring than wide, so the top and bottom stages keep clear of the nodes.
    rx = r; ry = Math.round(r * 1.3); cx = w / 2; cy = 32 + ry; ra = clamp(r * 0.615, 74, 96)
    out = { x: cx, y: cy + ry + 92 }
  }
  // A point on the stage ring in direction deg (so a stage's spoke to the model runs exactly along deg).
  const R = (deg: number) => { const c = Math.cos(rad(deg)), s = Math.sin(rad(deg)); return 1 / Math.sqrt((c * c) / (rx * rx) + (s * s) / (ry * ry)) }
  const onRing = (deg: number): Pt => ({ x: cx + R(deg) * Math.cos(rad(deg)), y: cy + R(deg) * Math.sin(rad(deg)) })
  const stages = RING.map((s) => ({ ...STAGES[s.k], deg: s.deg, p: onRing(s.deg) }))
  const nodes = ANALYSES.map((a, i) => ({ ...a, deg: nodeDeg(i), p: { x: cx + ra * Math.cos(rad(nodeDeg(i))), y: cy + ra * Math.sin(rad(nodeDeg(i))) } }))
  const hub: Pt = { x: cx, y: cy - 10 }
  const s = (ra - 24) / 100
  // Words: the top stage's to its right; on a phone the two side stages' above (below, they would meet the nodes).
  const side = (deg: number) => deg === -18 || deg === 198
  const stageWord = (deg: number): WordAt => (deg === -90 ? 'right' : side(deg) && !wide ? 'above' : 'below')
  const H = Math.max(cy + R(54) * Math.sin(rad(54)), out.y) + S / 2 + 28

  // The ring between neighbouring stages: an arc with an arrowhead at each end (either way).
  const arcs = stages.map((a, i) => {
    const b = stages[(i + 1) % stages.length]
    const d0 = a.deg, d1 = b.deg < a.deg ? b.deg + 360 : b.deg
    // Each arc stops short of the tiles, and further short of a word sitting above a side stage.
    const gap = (deg: number, extra: boolean) => ((S / 2 + 9 + (extra ? 30 : 0)) / R(deg)) * (180 / Math.PI)
    const from = d0 + gap(d0, !wide && a.k === 'concept'), to = d1 - gap(d1, !wide && b.k === 'program')
    const pts = Array.from({ length: 25 }, (_, j) => onRing(from + ((to - from) * j) / 24))
    const d = pts.map((p, j) => `${j ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join('')
    const head = chevron(pts[0], dir(pts[1], pts[0])) + chevron(pts[24], dir(pts[23], pts[24]))
    return { id: `${a.k}-${b.k}`, ends: [a.k, b.k], d, head }
  })

  // The way out to the drawing set: from the model, through a gap in both rings.
  const o0: Pt = wide ? { x: cx + 46 * s * Math.cos(rad(18)), y: cy + 46 * s * Math.sin(rad(18)) } : { x: cx, y: cy + 62 * s }
  const o3: Pt = wide ? { x: out.x - S / 2 - 6, y: out.y } : { x: out.x, y: out.y - S / 2 - 6 }
  const o1: Pt = wide ? { x: cx + rx * 0.75 * Math.cos(rad(18)), y: cy + rx * 0.75 * Math.sin(rad(18)) } : { x: cx, y: o0.y + 60 }
  const o2: Pt = wide ? { x: o3.x - 90, y: out.y } : { x: cx, y: o3.y - 40 }
  const exitNote = wide ? at(o0, o1, o2, o3, 0.62) : { x: cx + 8, y: (cy + R(54) * Math.sin(rad(54)) + S / 2 + 18 + o3.y) / 2 }

  // What lights with the part in focus (everything when nothing is).
  const rel = new Set<string>()
  if (active) {
    rel.add(active)
    if (active === 'hub') { stages.forEach((x) => rel.add(x.k)); nodes.forEach((x) => rel.add(x.k)); rel.add('drawings') }
    else { rel.add('hub'); rel.add(`spoke:${active}`) }
    arcs.forEach((a) => { if (a.ends.includes(active)) rel.add(a.id) })
    if (active === 'drawings') rel.add('exit')
  }
  const dim = (id: string) => !!active && active !== 'hub' && !rel.has(id)

  const stage = stages.find((x) => x.k === active), node = nodes.find((x) => x.k === active)
  const info: InfoPart | null = stage ? { title: `${stage.num} · ${stage.name}`, text: `${stage.sub}. Reads and writes the shared model.`, role: 'you' }
    : node ? { title: node.name, text: analysisText(node), role: node.role }
    : active === 'drawings' ? { title: 'Output · drawing set', text: `${DRAWINGS.sub}. Exit at any point.`, role: 'tool' }
    : active === 'hub' ? { title: 'One model', text: 'The massing engine, basic or advanced. Every stage and every analysis node reads and writes it.' }
    : null

  // Node words point outward, away from the spokes: above or below at the top and bottom, else to the side.
  const nodeWord = (deg: number): WordAt => {
    if (!wide) return 'none'
    const sn = Math.sin(rad(deg)), cs = Math.cos(rad(deg))
    return Math.abs(sn) > 0.9 ? (sn < 0 ? 'above' : 'below') : cs > 0 ? 'right' : 'left'
  }

  return (
    <div className="grid gap-3">
      <div ref={box} role="group" aria-label="The design loop: five design stages move both ways around one shared model, ten analysis nodes read that model, and a drawing set can be produced at any point."
        className="relative w-full" style={{ height: H }}>
        <svg aria-hidden className="pointer-events-none absolute inset-0" width={w} height={H} viewBox={`0 0 ${w} ${H}`}>
          {nodes.map((n) => <Wire key={n.k} d={line(hub, { x: n.p.x - (A / 2 + 4) * Math.cos(rad(n.deg)), y: n.p.y - (A / 2 + 4) * Math.sin(rad(n.deg)) })} color={active === n.k ? hueWire(n.hue) : WHITE} width={active === n.k ? 1.6 : 1} dim={dim(`spoke:${n.k}`)} />)}
          {stages.map((st) => <Wire key={st.k} d={line(hub, { x: st.p.x - (S / 2 + 4) * Math.cos(rad(st.deg)), y: st.p.y - (S / 2 + 4) * Math.sin(rad(st.deg)) })} color={hueWire(st.hue, active === st.k ? 0.9 : 0.5)} width={active === st.k ? 1.6 : 1.1} dim={dim(`spoke:${st.k}`)} />)}
          {arcs.map((a) => <Wire key={a.id} d={a.d} head={a.head} color={SLATE} width={1.3} dim={dim(a.id)} />)}
          <Wire d={cubic(o0, o1, o2, o3)} head={chevron(o3, dir(o2, o3))} color={ACCENT} width={1.5} dash="5 4" dim={dim('exit')} />
          <ModelTower x={cx} y={cy} s={s} id={`loop${uid}`} />
        </svg>

        {/* The model: one button over the drawing. */}
        <button type="button" aria-label="One model: the massing engine every stage reads and writes" {...bind('hub')}
          className="absolute flex -translate-x-1/2 flex-col items-center justify-end rounded-xl pb-0.5 outline-none focus-visible:ring-2 focus-visible:ring-accent"
          style={{ left: cx, top: cy - 84 * s, width: 110 * s, height: 84 * s + 60 * s + 22 }}>
          <span aria-hidden className="whitespace-nowrap text-meta font-semibold text-ink [text-shadow:0_0_6px_#fff]">One model</span>
        </button>

        {nodes.map((n) => (
          <Tile key={n.k} testId={n.k} x={n.p.x} y={n.p.y} size={A} icon={n.icon} hue={n.hue} level={active === n.k ? 'on' : 'soft'} word={n.word} wordAt={nodeWord(n.deg)}
            label={`Analysis node: ${n.name}`} role={n.role} dim={dim(n.k)} bind={bind(n.k)} />
        ))}
        {stages.map((st) => (
          <Tile key={st.k} testId={st.k} x={st.p.x} y={st.p.y} size={S} icon={st.icon} hue={st.hue} word={st.word} num={st.num} strong wordAt={stageWord(st.deg)}
            label={`Stage ${st.num}: ${st.name}`} role="you" dim={dim(st.k)} bind={bind(st.k)} />
        ))}
        <Tile testId="drawings" x={out.x} y={out.y} size={S} icon={DRAWINGS.icon} hue={DRAWINGS.hue} word={DRAWINGS.word} strong label="Output: the drawing set" role="tool" dim={dim('drawings')} bind={bind('drawings')} />
        <WireNote x={exitNote.x} y={exitNote.y - (wide ? 12 : 0)} anchor={wide ? 'middle' : 'start'} dim={dim('exit')}>exit at any point</WireNote>
      </div>
      <Info part={info} idle={IDLE} />
    </div>
  )
}
