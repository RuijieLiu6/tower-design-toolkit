// The container of a design node's illustration (Ruijie, 7 Nov: "Keep the node containers restrained: neutral surfaces,
// consistent dimensions, upright orientation, subtle shadows, and visible names. Let the illustrations provide the
// character … clickable nodes need clear hover, focus, and selected states"). A white tile of one size per place, a soft
// shadow, never turned; the illustration (icons/nodeArt.tsx) carries the colour. Interactive states come from the
// clickable element around it (class `node-hit`, styled in index.css): hover lifts it, keyboard focus rings it, a
// selected node (data-selected) wears an accent ring. `state`: on (in the workflow), soft (available), off (not used).
// User-created nodes use the same tile with their own artwork (`art`, see nodeIcons/NodeArtwork.tsx): the tile, padding
// and states never come from the image.
import type { CSSProperties, ReactNode } from 'react'
import { hasNodeArt, NodeArt } from './icons/nodeArt'

export function NodeTile({ id, size, state = 'on', className = '', art }: { id: string; size: number; state?: 'on' | 'soft' | 'off'; className?: string; art?: ReactNode }) {
  if (!art && !hasNodeArt(id)) return null
  return (
    <span aria-hidden className={`node-tile ${className}`} data-state={state} style={{ '--nt': `${size}px` } as CSSProperties}>
      {art ?? <NodeArt id={id} size={Math.round(size * 0.9)} />}
    </span>
  )
}
