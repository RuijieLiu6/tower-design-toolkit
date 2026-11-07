// Why one platform: today's five separate steps in a row, ending in "it doesn't work" and a long way back to the start
// (weeks lost), against the short loop on one model (mass, analyse, learn, in minutes) that leaves only once it works.
// The old way is drawn in clear glass, the loop lit: importance by opacity. Each row's name is a button for the whole
// row; each tile for its own step.
import { ICON } from '../../GlassIcon'
import { ACCENT, chevron, cubic, dir, Info, line, SLATE, Tile, useParts, useWidth, Wire, WireNote, type InfoPart, type Pt } from './kit'
import { LOOP, PROCEED, TODAY } from './content'

const IDLE = 'The research still happens, but inside the massing loop while the form is cheap to change, not after a hand-off.'
const ROWS = {
  today: { title: 'Today', text: "Separate tool at each step. Research → model in CAD → export to analysis → wait for results → it doesn't work. Start over: weeks lost, five tools, five files." },
  loop: { title: 'In the loop', text: 'One platform, one model, all the nodes. Mass → analyse → learn, in minutes on the same model, then proceed, knowing it works.' },
} as const
const RED = 'hsl(8 78% 52%)', RED_TEXT = 'hsl(8 70% 38%)'

export default function WhyOnePlatform() {
  const [box, w] = useWidth<HTMLDivElement>()
  const { active, bind } = useParts()
  const wide = w >= 640
  const T = wide ? ICON.feature : ICON.tool
  // Five columns; the loop uses the first three and ends in the fifth, under "it doesn't work".
  const pad = wide ? 70 : 38
  const step = Math.min(wide ? 175 : 999, (w - 2 * pad) / 4)
  const x0 = (w - 4 * step) / 2
  const col = (i: number) => x0 + i * step
  // Each row, top down: its name, a return arc with its note, then the tiles with their words. The loop's arc is the
  // shorter one (minutes, not weeks).
  const y1 = wide ? 100 : 82, loopName = wide ? 166 : 128, y2 = wide ? 250 : 212
  const H = y2 + T / 2 + 30
  const top = (y: number) => y - T / 2 - 5

  const todayKeys = TODAY.map((t) => t.k), loopKeys = [...LOOP.map((t) => t.k), PROCEED.k]
  const rowOf = (k: string | null) => (k === 'today' || todayKeys.includes(k ?? '') ? 'today' : k === 'loop' || loopKeys.includes(k ?? '') ? 'loop' : null)
  const lit = rowOf(active)
  // A tile in focus lights its own row; a row name lights the row.
  const dimRow = (r: 'today' | 'loop') => !!lit && lit !== r

  // Flow arrows between neighbouring tiles.
  const flow = (a: Pt, b: Pt) => { const p0 = { x: a.x + T / 2 + 5, y: a.y }, p1 = { x: b.x - T / 2 - 6, y: b.y }; return { d: line(p0, p1), head: chevron(p1, 0, 4.5) } }
  // A return arc over a row, from the tile at x1 back to the one at x0.
  const back = (xa: number, xb: number, y: number, peak: number) => {
    const a = { x: xa, y: top(y) }, b = { x: xb, y: top(y) }, c1 = { x: xa, y: peak }, c2 = { x: xb, y: peak }
    return { d: cubic(a, c1, c2, b), head: chevron(b, dir(c2, b), 5), mid: 0.25 * top(y) + 0.75 * peak }
  }
  const backToday = back(col(4), col(0), y1, wide ? 34 : 32)
  const backLoop = back(col(2), col(0), y2, top(y2) - (wide ? 17 : 13))

  const item = [...TODAY, ...LOOP, PROCEED].find((t) => t.k === active)
  const info: InfoPart | null = active === 'today' || active === 'loop' ? ROWS[active]
    : item ? { title: item.name, text: rowOf(item.k) === 'today' ? 'Today: a separate tool at each step.' : 'In the loop: the same model, in minutes.', role: item.role }
    : null

  const rowName = (r: 'today' | 'loop', y: number) => (
    <button type="button" {...bind(r)} aria-label={`${ROWS[r].title}: the whole row`}
      className={`absolute left-0 rounded-xl px-1.5 py-0.5 text-[12.5px] font-semibold outline-none transition-opacity duration-200 hover:text-accent focus-visible:ring-2 focus-visible:ring-accent motion-reduce:transition-none ${r === 'today' ? 'text-muted' : 'text-ink'} ${dimRow(r) ? 'opacity-25' : ''}`}
      style={{ top: y }}>{ROWS[r].title}</button>
  )

  return (
    <div className="grid gap-3">
      <div ref={box} role="group" aria-label="Why one platform: today's separated sequence loses weeks when analysis fails, while one platform keeps massing, analysis and learning in a short loop on the same model."
        className="relative w-full" style={{ height: H }}>
        <svg aria-hidden className="pointer-events-none absolute inset-0" width={w} height={H} viewBox={`0 0 ${w} ${H}`}>
          {TODAY.slice(0, -1).map((t, i) => { const f = flow({ x: col(i), y: y1 }, { x: col(i + 1), y: y1 }); return <Wire key={t.k} d={f.d} head={f.head} color={SLATE} dim={dimRow('today')} /> })}
          <Wire d={backToday.d} head={backToday.head} color={RED} width={1.4} dash="5 4" dim={dimRow('today')} />
          {LOOP.slice(0, -1).map((t, i) => { const f = flow({ x: col(i), y: y2 }, { x: col(i + 1), y: y2 }); return <Wire key={t.k} d={f.d} head={f.head} color={SLATE} width={1.3} dim={dimRow('loop')} /> })}
          <Wire d={backLoop.d} head={backLoop.head} color={ACCENT} width={1.5} dim={dimRow('loop')} />
          {(() => { const f = flow({ x: col(2), y: y2 }, { x: col(4), y: y2 }); return <Wire d={f.d} head={f.head} color={ACCENT} width={1.5} dim={dimRow('loop')} /> })()}
        </svg>

        {rowName('today', 0)}
        <WireNote x={(col(0) + col(4)) / 2} y={backToday.mid - 10} color={RED_TEXT} dim={dimRow('today')}>Start over · weeks lost</WireNote>
        {TODAY.map((t, i) => (
          <Tile key={t.k} testId={t.k} x={col(i)} y={y1} size={T} icon={t.icon} hue={t.hue} level={active === t.k ? 'on' : t.k === 'fail' ? 'soft' : 'off'} word={t.word}
            label={t.name} role={t.role} dim={dimRow('today')} bind={bind(t.k)} />
        ))}

        {rowName('loop', loopName)}
        <WireNote x={(col(0) + col(2)) / 2} y={backLoop.mid - 10} dim={dimRow('loop')}>Minutes, same model</WireNote>
        {LOOP.map((t, i) => (
          <Tile key={t.k} testId={t.k} x={col(i)} y={y2} size={T} icon={t.icon} hue={t.hue} word={t.word} strong label={t.name} role={t.role} dim={dimRow('loop')} bind={bind(t.k)} />
        ))}
        <Tile testId={PROCEED.k} x={col(4)} y={y2} size={T} icon={PROCEED.icon} hue={PROCEED.hue} word={PROCEED.word} strong label={PROCEED.name} role={PROCEED.role} dim={dimRow('loop')} bind={bind(PROCEED.k)} />
      </div>
      <Info part={info} idle={IDLE} />
    </div>
  )
}
