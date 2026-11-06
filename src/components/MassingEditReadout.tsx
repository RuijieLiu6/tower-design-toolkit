// The readout beside the pointer while a block is pushed, pulled or moved on the model (components/MassingEdit3D.tsx),
// as in Sinnie Choi's Downtown Massing Tool: what is changing, its new size and the change, and what it lined up with.
import { useBlockEdit } from '../lib/blockEdit'

export default function MassingEditReadout() {
  const op = useBlockEdit((s) => s.op)
  if (!op) return null
  const { info } = op
  return (
    <div role="status" aria-live="polite" data-testid="massing-edit-readout"
      className="pointer-events-none fixed z-50 max-w-[18rem] rounded-md border border-accent/40 bg-panel/95 px-2 py-1.5 text-[11px] text-ink shadow-md backdrop-blur"
      style={{ left: op.x + 16, top: op.y + 14 }}>
      <p className="font-semibold">{info.title}</p>
      <p className="tabular-nums"><b>{info.value}</b> <span className="text-muted">({info.delta})</span></p>
      {info.extra && <p className="text-muted">{info.extra}</p>}
      {info.guide && <p className="text-amber-800">{info.guide}</p>}
      <p className="mt-0.5 text-[10px] text-muted">Alt: no snapping · Esc cancels</p>
    </div>
  )
}
