// The software a model comes from, as a monogram badge in a colour of its own (lib/interchange/platforms.ts). Drawn
// here on purpose: the makers' logos are their trademarks and their artwork is not ours to copy or relicense.
import type { Platform } from '../../lib/interchange/platforms'

export default function SoftwareBadge({ p, size = 26 }: { p: Platform; size?: number }) {
  return (
    <span aria-hidden className="flex shrink-0 items-center justify-center rounded-md font-bold tracking-tight" data-badge={p.id}
      style={{ width: size, height: size, background: p.badge.bg, color: p.badge.fg, fontSize: size * (p.badge.text.length > 2 ? 0.34 : 0.42), lineHeight: 1 }}>{p.badge.text}</span>
  )
}
