// The Architectural set (Sinnie, 13 Nov: "add architectural set to the presentation presets, and this architectural
// set should include all the drawings produced by the nodes of the workflow selected"). Every check that is on in the
// workflow has its results drawn once in a hidden host (components/boards/CaptureHost.tsx, the same results the right
// panel shows), each drawing there becomes a board image, and the images go onto analysis sheets by workflow phase.
import { nodeById } from '../data/registry'
import type { BoardImage } from '../engine/boards'
import { useStore } from '../store'
import { useBoardStore, type ArchGroup } from './boardStore'
import { PHASES } from './phases'
import { svgImage } from './sheetAdd'
import { isSw, useSwOut } from './swRun'

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
const PREFIX = 'arch-'

/** The checks of the workflow in phase order (the checks that are switched on). */
export function workflowChecks(): { id: string; name: string; phase: string }[] {
  const on = useStore.getState().enabled
  const out: { id: string; name: string; phase: string }[] = []
  for (const p of PHASES) for (const id of p.nodes) if (on[id]) out.push({ id, name: nodeById(id)?.name ?? id, phase: p.name })
  return out
}

/** A drawing's title: its figure caption, else its accessible name. */
function titleOf(svg: SVGSVGElement): string {
  const fig = svg.closest('figure')
  const cap = fig?.querySelector('figcaption')
  const t = (cap?.childNodes[0]?.textContent ?? cap?.textContent ?? '').trim()
  return (t || svg.getAttribute('aria-label') || 'Drawing').replace(/\s+/g, ' ').slice(0, 70)
}

/**
 * Draws every workflow check's results in `host` one after another and collects their drawings as board images.
 * `host` must hold the results components (it follows the store's selected check).
 */
export async function captureWorkflowDrawings(host: HTMLElement, onProgress: (text: string) => void): Promise<ArchGroup[]> {
  const S = useStore.getState()
  const before = S.selectedNode
  const checks = workflowChecks()
  const B = useBoardStore.getState()
  // The previous architectural set's images are replaced, not piled up.
  for (const id of Object.keys(B.images)) if (id.startsWith(PREFIX)) B.removeImage(id)
  const groups: ArchGroup[] = []
  let n = 0
  for (const c of checks) {
    onProgress(`${c.name} · ${++n} of ${checks.length}`)
    useStore.getState().selectNode(c.id)
    // A Sun & Wind tool computes in the queue: wait for its run (at most 25 s), then for the drawings to mount.
    if (isSw(c.id)) { const id = c.id; for (let k = 0; k < 100; k++) { const o = useSwOut.getState(); if (o.out[id] && !o.busy[id]) break; await wait(250) } }
    await wait(350)
    host.querySelectorAll('details').forEach((d) => { d.open = true })
    await wait(450)
    const svgs = (Array.from(host.querySelectorAll('svg')) as SVGSVGElement[]).filter((s) => {
      const vb = s.viewBox.baseVal
      return !!vb && vb.width >= 90 && vb.height >= 24 && !s.closest('button') && !s.closest('[data-testid=plan-key]') && !s.classList.contains('tdt-icon')
    })
    const seen = new Set<string>()
    for (const svg of svgs) {
      const title = titleOf(svg)
      const key = `${title}|${svg.outerHTML.length}`
      if (seen.has(key)) continue
      seen.add(key)
      try {
        const img = await svgImage([svg], title, c.name, 1200)
        const id = `${PREFIX}${c.id.replace(/[^a-z0-9]/gi, '')}-${seen.size}`
        const rec: BoardImage = { id, dataUrl: img.dataUrl, w: img.w, h: img.h, source: 'capture', label: `${c.name}: ${title}` }
        useBoardStore.getState().addImage(rec)
        let g = groups.find((x) => x.title === c.phase)
        if (!g) { g = { title: c.phase, items: [] }; groups.push(g) }
        g.items.push({ imageId: id, caption: `${c.name} · ${title}` })
      } catch { /* a drawing that cannot be rasterised is left out */ }
    }
  }
  useStore.getState().selectNode(before ?? null)
  return groups
}
