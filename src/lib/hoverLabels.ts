// Text on the model only when the pointer asks for it (Ruijie, 7 Nov: "use different method to hide as much text as
// possible, for example the height texts on the model could be shown only when your mouse touch on the model"). Two
// signals for components/Label.tsx: which object the pointer is on (a tower's name and height show while it is touched),
// and whether the pointer is over the 3D view at all (street and place names show only then). Warnings never hide.
import { invalidate } from '@react-three/fiber'
import { create } from 'zustand'

interface HoverLabels {
  /** The key of the object under the pointer (a tower id, `future-3`, …), or null. */
  over: string | null
  /** The pointer is inside the 3D view. */
  inView: boolean
  setOver: (key: string | null) => void
  setInView: (on: boolean) => void
}

// Labels read this inside the frame loop, so a change asks for one more frame (the view draws on demand).
export const useHoverLabels = create<HoverLabels>((set, get) => ({
  over: null,
  inView: false,
  setOver: (key) => { if (get().over !== key) { set({ over: key }); invalidate() } },
  setInView: (on) => {
    if (get().inView === on) return
    set({ inView: on, ...(on ? {} : { over: null }) })
    // The DOM text over the view (map names, mouse hints) follows the same signal: index.css keys off this attribute.
    if (on) document.documentElement.dataset.viewHover = ''; else delete document.documentElement.dataset.viewHover
    invalidate()
  },
}))

/** Pointer handlers for a 3D object whose labels show on touch: spread them on its group or mesh. */
export const hoverHandlers = (key: string) => ({
  onPointerOver: () => { useHoverLabels.getState().setOver(key) },
  onPointerOut: () => { if (useHoverLabels.getState().over === key) useHoverLabels.getState().setOver(null) },
})
