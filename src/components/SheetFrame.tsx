// Any analysis drawing with its "Sheet" button (16 Nov, Sinnie: "for each analysis drawing, there should be a button
// to add it to the presentation sheet"). Wraps a drawing (SVG or canvas) and adds the compact Add-to-sheet button at
// its top right; the button sends the drawing(s) inside, as lib/sheetAdd places them on the boards.
import { useRef, type ReactNode } from 'react'
import { canvasImage, svgImage } from '../lib/sheetAdd'
import SheetButton from './SheetButton'

export default function SheetFrame({ title, caption = '', children, className = '' }: { title: string; caption?: string; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const make = async () => {
    const root = ref.current
    if (!root) return null
    const svgs = Array.from(root.querySelectorAll('svg')).filter((s) => s.viewBox.baseVal?.width && !s.closest('button')) as SVGSVGElement[]
    if (svgs.length) return svgImage(svgs, title, caption)
    const cv = root.querySelector('canvas')
    return cv ? canvasImage(cv, title, caption) : null
  }
  return (
    <div ref={ref} className={`group/sheet relative min-w-0 ${className}`} data-sheet-frame={title}>
      {children}
      <div className="absolute right-0 top-0 rounded-lg bg-white/85 opacity-80 shadow-sm backdrop-blur-sm transition-opacity group-hover/sheet:opacity-100 focus-within:opacity-100">
        <SheetButton compact label={title} make={make} />
      </div>
    </div>
  )
}
