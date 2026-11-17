// A short word over the model when a drawing tool did something (lib/draw/drawStore.ts toast): shown a few seconds,
// also read to the live region. After Sinnie Choi's toasts, in the Toolkit's style.
import { useEffect, useState } from 'react'
import { useDraw } from '../../lib/draw/drawStore'
import { useStore } from '../../store'

export default function DrawToast() {
  const t = useDraw((s) => s.toast)
  const [shown, setShown] = useState<string | null>(null)
  useEffect(() => {
    if (!t) return
    setShown(t.text)
    useStore.getState().set({ announce: t.text })
    const h = setTimeout(() => setShown(null), 3200)
    return () => clearTimeout(h)
  }, [t])
  if (!shown) return null
  return <div role="status" data-testid="draw-toast" className="pointer-events-none absolute bottom-16 left-1/2 z-10 max-w-[80%] -translate-x-1/2 rounded-full bg-ink/85 px-3 py-1 text-xs text-white">{shown}</div>
}
