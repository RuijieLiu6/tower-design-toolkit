// A node's artwork, whatever made it (Ruijie, 7 Nov: "The uploaded or generated asset should contain the icon artwork
// only. The platform must consistently render the surrounding tile … connection points … states … names and tooltips"):
// a built node's illustration (icons/nodeArt.tsx); a user-created node's icon from the icon store (generated in the
// style pack, or an uploaded image); else the approved fallback illustration. Only the artwork: the tile, states,
// markers and names are the caller's (NodeTile, the node bar), the same for every node.
import { NodeArt, hasNodeArt } from '../icons/nodeArt'
import { FallbackIcon, GeneratedIcon } from '../../lib/nodeIcons/generate'
import { useNodeIcons, type IconRecord } from '../../lib/nodeIcons/store'
import { CATEGORY_PHASE } from '../../lib/nodeIcons/brief'
import type { Category } from '../../data/registry'

/** Artwork for a record (used by the editor's preview before the record is saved too). */
export function IconRecordArt({ icon, size, muted = false }: { icon: IconRecord; size: number; muted?: boolean }) {
  const style = muted ? { filter: 'saturate(0.45)', opacity: 0.9 } : undefined
  if (icon.kind === 'generated') return <span style={style} className="inline-flex"><GeneratedIcon brief={icon.brief} variant={icon.variant} size={size} /></span>
  return <img src={icon.useRestyled && icon.restyled ? icon.restyled : icon.display} width={size} height={size} alt="" aria-hidden draggable={false} data-uploaded-icon style={{ objectFit: 'contain', ...style }} />
}

export function NodeArtwork({ id, size, category, muted = false }: { id: string; size: number; category?: Category; muted?: boolean }) {
  const icon = useNodeIcons((s) => s.icons[id])
  if (hasNodeArt(id)) return <NodeArt id={id} size={size} muted={muted} />
  if (icon) return <IconRecordArt icon={icon} size={size} muted={muted} />
  return <span style={muted ? { filter: 'saturate(0.45)', opacity: 0.9 } : undefined} className="inline-flex"><FallbackIcon phase={CATEGORY_PHASE[category ?? 'DATA']} size={size} /></span>
}
