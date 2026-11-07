// A basement as a small section (Ruijie, 6 Nov: information as graphics, not sentences): the ground line, the tower's
// foot above it, the levels dug below (B1 at the top) with the depth dimension, the thick ground they sit in, and the
// ramp's run at its slope. To scale vertically; widths are schematic. Used by the Basement tool and the import guide.
import { RAMP_SLOPE, type BasementSummary } from '../../engine/basement'

const fmt = (v: number, d = 0) => v.toLocaleString('en-CA', { maximumFractionDigits: d, minimumFractionDigits: d })

export default function BasementSection({ sum, ground, f2f }: { sum: BasementSummary; ground: number; f2f: number }) {
  const W = 236, H = 104, top = 22, left = 40, right = W - 58
  // Metres to pixels: the ground thickness fills the space under the ground line.
  const k = (H - top - 6) / Math.max(ground, sum.depth + 1)
  const yOf = (m: number) => top + m * k
  const levels = Array.from({ length: sum.levels }, (_, i) => i)
  const rampRise = sum.depth, rampRun = rampRise / RAMP_SLOPE
  const rampW = Math.min(right - left - 8, rampRun * k * 0.35)
  return (
    <figure className="m-0" aria-label={`Section: ${sum.levels} levels, ${fmt(sum.depth, 1)} m deep, in a ${fmt(ground)} m thick ground`} data-testid="basement-section">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-[104px] w-full max-w-[236px]" aria-hidden>
        {/* the ground the site model stands on, as thick as it needs to be */}
        <rect x={left - 24} y={yOf(0)} width={right - left + 48} height={yOf(ground) - yOf(0)} className="fill-[#efe9dd]" />
        <line x1={4} x2={W - 4} y1={yOf(0)} y2={yOf(0)} className="stroke-ink" strokeWidth={1.2} />
        <text x={6} y={yOf(0) - 3} className="fill-muted text-[8px]">grade</text>
        {/* the tower's foot */}
        <rect x={left + 30} y={4} width={34} height={top - 4} className="fill-slate-200 stroke-slate-500" strokeWidth={0.75} />
        {/* the levels, B1 at the top */}
        {levels.map((i) => (
          <g key={i}>
            <rect x={left} y={yOf(i * f2f)} width={right - left} height={Math.max(1, f2f * k)} className="fill-[#3d5a80]/80 stroke-[#1d2b3a]" strokeWidth={0.6} />
            {f2f * k >= 7 && <text x={left + 3} y={yOf(i * f2f) + f2f * k / 2 + 3} className="fill-white text-[7.5px] font-semibold">B{i + 1}</text>}
          </g>
        ))}
        {/* the ramp: its run at 12.5 %, drawn from grade down to the lowest floor */}
        {sum.levels > 0 && <line x1={right - rampW} y1={yOf(0)} x2={right} y2={yOf(sum.depth)} className="stroke-[#c9822b]" strokeWidth={1.6} />}
        {/* depth and ground thickness dimensions */}
        <g className="stroke-ink" strokeWidth={0.6}>
          <line x1={right + 8} x2={right + 8} y1={yOf(0)} y2={yOf(sum.depth)} />
          <line x1={right + 5} x2={right + 11} y1={yOf(sum.depth)} y2={yOf(sum.depth)} />
          <line x1={right + 24} x2={right + 24} y1={yOf(0)} y2={yOf(ground)} strokeDasharray="2 2" />
        </g>
        <text x={right + 11} y={yOf(sum.depth / 2) + 3} className="fill-ink text-[8px] font-semibold">{fmt(sum.depth, 1)} m</text>
        <text x={right + 27} y={yOf(ground) - 2} className="fill-muted text-[7.5px]">{fmt(ground)} m</text>
      </svg>
      <figcaption className="mt-0.5 flex flex-wrap gap-x-2 text-[10px] text-muted">
        <span><i aria-hidden className="mr-1 inline-block h-2 w-2 bg-[#3d5a80]" />levels</span>
        <span><i aria-hidden className="mr-1 inline-block h-0.5 w-3 bg-[#c9822b] align-middle" />ramp {fmt(sum.rampLength, 1)} m</span>
        <span><i aria-hidden className="mr-1 inline-block h-2 w-2 bg-[#efe9dd]" />ground {fmt(ground)} m thick</span>
      </figcaption>
    </figure>
  )
}
