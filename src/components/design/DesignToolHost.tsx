// Which full-size design editor is open (Plan or Section), and the overlay that shows it over the 3D view
// ([data-viewport]), so the left-panel cards can open an editor without touching the app layout. Esc on the overlay's
// own button or "Back to 3D" closes it; changing stage closes it too (the cards only exist in Schematic).
import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { create } from 'zustand'

export type DesignToolId = 'plan' | 'section'
export const useDesignTool = create<{ open: DesignToolId | null; set: (open: DesignToolId | null) => void }>((set) => ({ open: null, set: (open) => set({ open }) }))

/** Fixed over the 3D view's box, following it as the window or the panels resize. */
export function DesignToolOverlay({ children }: { children: ReactNode }) {
  const [box, setBox] = useState<DOMRect | null>(null)
  useEffect(() => {
    const el = document.querySelector('[data-viewport]')?.parentElement ?? document.querySelector('main')
    if (!el) return
    const measure = () => setBox(el.getBoundingClientRect())
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    window.addEventListener('resize', measure)
    return () => { ro.disconnect(); window.removeEventListener('resize', measure) }
  }, [])
  const style = box ? { left: box.left, top: box.top, width: box.width, height: box.height } : { inset: 0 }
  return createPortal(
    <div role="dialog" aria-label="Design editor" className="@container fixed z-30 overflow-hidden border border-line bg-[#f7f7f5] shadow-lg" style={style}>{children}</div>,
    document.body,
  )
}
