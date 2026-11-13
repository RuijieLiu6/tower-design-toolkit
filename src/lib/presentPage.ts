// One Present page (Sinnie, 13 Nov): the presentation sheets are the Present phase. The board store's `open` and the
// phase follow each other, so every door (the Model | Presentation switch, key 5, Next in the workflow card, "Add to
// sheet") leads to the same page, and Model returns to the step the designer came from.
import { useStore } from '../store'
import { useBoardStore } from './boardStore'
import { goToStep, useStep, type StepId } from './step'

let last: StepId = 'volume'
export function startPresentSync(): () => void {
  const st = useStep.getState().step
  if (st !== 'frame') last = st
  useBoardStore.getState().setOpen(useStore.getState().phase === 'present')
  const a = useStep.subscribe((s) => { if (s.step !== 'frame') last = s.step })
  const b = useStore.subscribe((s, p) => {
    if (s.phase === p.phase) return
    const open = s.phase === 'present'
    if (useBoardStore.getState().open !== open) useBoardStore.getState().setOpen(open)
  })
  const c = useBoardStore.subscribe((s, p) => {
    if (s.open === p.open) return
    const present = useStore.getState().phase === 'present'
    if (s.open && !present) goToStep('frame')
    if (!s.open && present) goToStep(last)
  })
  return () => { a(); b(); c() }
}
