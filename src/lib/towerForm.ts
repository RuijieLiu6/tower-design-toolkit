// Applies a tower form (engine/towerForms.ts, after dtmass's form.js) to a tower: the podium blocks stay, the shaft above
// them is rebuilt from the form's base plate and height. The base is taken from the shaft the first time a form is
// applied and kept on the tower, so sliders re-shape from the same base; Plain box puts that base back as one block.
import { blocksOf } from '../engine/blocks'
import { withBlocks } from '../engine/massing'
import { formBlocks, type FormBase, type FormType } from '../engine/towerForms'
import type { Tower } from '../engine/types'
import { useStore } from '../store'

/** The shaft a form starts from: the saved base, else the blocks above the podium as one plate. */
export function formBase(t: Tower): FormBase {
  if (t.form?.base) return t.form.base
  const blocks = blocksOf(t), shaft = blocks.filter((b) => !b.podium)
  const first = shaft[0] ?? blocks[blocks.length - 1]
  const h = shaft.reduce((a, b) => a + b.height, 0) || Math.max(t.f2f, t.height - t.podiumHeight)
  return { w: first?.width ?? t.width, d: first?.depth ?? t.depth, h, f2f: t.f2f }
}

/** Reshapes tower `id` with a form (no undo step of its own: the caller groups a drag into one). */
export function applyForm(id: string, type: FormType, p: Record<string, number>) {
  const s = useStore.getState(), t = s.towers[s.project].find((x) => x.id === id)
  if (!t || (t.imported && !t.drawn) || t.drawn) return false
  const base = formBase(t)
  const all = blocksOf(t), podium: typeof all = []
  for (const b of all) { if (b.podium) podium.push(b); else break }
  const next = withBlocks(t, [...podium, ...formBlocks(type, p, base)])
  s.updateTower(id, { blocks: next.blocks, boxFromBlocks: next.boxFromBlocks, height: next.height, width: next.width, depth: next.depth,
    podiumHeight: next.podiumHeight, podiumWidth: next.podiumWidth, podiumDepth: next.podiumDepth, form: type === 'none' ? undefined : { type, p, base } })
  return true
}
