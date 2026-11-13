// "Add to sheet": puts an analysis drawing on the presentation boards (lib/sheetAdd.ts) and says where it went.
import { useState } from 'react'
import { addToSheet, placeText } from '../lib/sheetAdd'
import { ImagePlus } from './icons'

export default function SheetButton({ make, label, compact = false }: { make: () => Promise<{ dataUrl: string; w: number; h: number } | null>; label: string; compact?: boolean }) {
  const [state, setState] = useState<string | null>(null)
  const go = async () => {
    setState('Adding…')
    try {
      const img = await make()
      if (!img) { setState('Nothing to add'); return }
      setState(placeText(addToSheet(img, label)))
    } catch { setState('Could not add') }
    setTimeout(() => setState(null), 2500)
  }
  return (
    <button type="button" onClick={go} data-testid="add-to-sheet" title={`Add “${label}” to the presentation boards`}
      className={`flex shrink-0 items-center gap-1 rounded-lg text-ink outline-none hover:bg-subtle focus-visible:ring-2 focus-visible:ring-accent ${compact ? 'h-6 px-1.5 text-meta' : 'h-8 border border-line bg-panel px-2 text-control'}`}>
      <ImagePlus size={compact ? 12 : 14} aria-hidden />{state ?? (compact ? 'Sheet' : 'Add to sheet')}
    </button>
  )
}
