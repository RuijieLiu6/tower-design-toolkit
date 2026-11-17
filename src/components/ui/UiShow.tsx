// A gate: its children show while the part is shown in the Interface drawer (lib/ui/registry.ts).
import type { ReactNode } from 'react'
import { useUiGroupVisible, useUiVisible } from '../../lib/ui/registry'

export default function UiShow({ id, group = false, children }: { id: string; group?: boolean; children: ReactNode }) {
  const on = useUiVisible(id)
  const groupOn = useUiGroupVisible(id)
  return (group ? groupOn : on) ? <>{children}</> : null
}
