// Runs the Sun & Wind Studio tools that are on (or open in the analysis view) whenever the design, the site or their
// settings change, after a short pause so dragging a tower does not start a run per frame.
import { useEffect } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useAnalysisView } from '../../lib/analysisView'
import { useSwInputs } from '../../lib/swInputs'
import { runSw, SW_IDS, type SwId } from '../../lib/swRun'
import '../../lib/swRunInterior'
import { useSwStudy } from '../../lib/swStudy'
import { useStore } from '../../store'

export default function SwRunner() {
  const inp = useSwInputs()
  const settings = useSwStudy(useShallow(({ set: _s, reset: _r, ...rest }) => rest)) // eslint-disable-line @typescript-eslint/no-unused-vars
  const on = useStore(useShallow((s) => SW_IDS.filter((id) => s.analysis && s.enabled[id])))
  const open = useAnalysisView((s) => s.node)
  useEffect(() => {
    const ids = new Set<SwId>(on)
    if (open && (SW_IDS as readonly string[]).includes(open)) ids.add(open as SwId)
    if (!ids.size) return
    const t = setTimeout(() => { for (const id of ids) runSw(id, inp, settings) }, 450)
    return () => clearTimeout(t)
  }, [inp, settings, on, open])
  return null
}
