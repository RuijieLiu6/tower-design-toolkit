import { X } from 'lucide-react'
import { useEffect } from 'react'
import { navigate } from '../lib/route'
import { useStore } from '../store'
import { Kbd } from './ui'
import { useShallow } from 'zustand/react/shallow'

const STEPS = [
  { n: 1, title: 'Massing: shape your tower', text: 'The design tools on the left set height, blocks, podium and the program by floor band. Use "Place on map" in Towers & site to move it.' },
  { n: 2, title: 'Switch on the nodes you need', text: 'Each evaluation is an icon in the bar at the bottom: hover to read its name, click to switch it on. Library (bottom left) searches every node, including researched ones with their method and thresholds.' },
  { n: 3, title: 'Read results with their evidence', text: 'Every number shows where it comes from: verified, team assumption, unverified, unresolved, or a false assumption kept visible.' },
  { n: 4, title: 'Schematic, then Present', text: 'Schematic (key 2) turns the clay into an x-ray axonometric: floor plates, core and plant floors, with a section cut and an exploded view. Present (key 3) locks the model and frames an A2 board for captures.' },
  { n: 5, title: 'Try the real city', text: 'Switch to "Real Vancouver" and place a tower downtown: the view-cone node estimates how high each protected view allows, or stops and says "no estimate".' },
]

/** Once closed, the card stays closed on later visits in this browser ("How it works" in the top bar opens it again). */
const SEEN = 'ts.onboarding.seen'
const seen = () => { try { return window.localStorage.getItem(SEEN) === '1' } catch { return false } }
if (typeof window !== 'undefined' && seen()) useStore.setState({ showOnboarding: false })

export default function Onboarding() {
  const { showOnboarding, set } = useStore(useShallow((s) => ({ showOnboarding: s.showOnboarding, set: s.set })))
  useEffect(() => { if (!showOnboarding) { try { window.localStorage.setItem(SEEN, '1') } catch { /* private mode: shows again next visit */ } } }, [showOnboarding])
  if (!showOnboarding) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-4" role="dialog" aria-modal="true" aria-labelledby="ob-title">
      <div className="w-full max-w-xl rounded-xl bg-panel p-6 shadow-xl">
        <div className="flex items-start justify-between">
          <div>
            <h2 id="ob-title" className="text-lg font-semibold">Tower Design Toolkit</h2>
            <p className="mt-1 text-sm text-muted">Design a tall building for Vancouver, and see the evidence behind every result.</p>
          </div>
          <button aria-label="Close" onClick={() => set({ showOnboarding: false })} className="rounded p-1 text-muted hover:bg-slate-100"><X size={18} /></button>
        </div>
        <ol className="mt-5 grid gap-3">
          {STEPS.map((s) => (
            <li key={s.n} className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-white">{s.n}</span>
              <div><div className="text-sm font-medium">{s.title}</div><div className="text-xs text-slate-600">{s.text}</div></div>
            </li>
          ))}
        </ol>
        <div className="mt-5 flex items-center justify-between">
          <span className="text-[11px] text-muted"><Kbd>P</Kbd> place tower · <Kbd>M</Kbd><Kbd>R</Kbd> move, rotate · <Kbd>Esc</Kbd> stop · <Kbd>1</Kbd><Kbd>2</Kbd><Kbd>3</Kbd> stages · <Kbd>H</Kbd> hide overlays</span>
          <span className="flex items-center gap-3">
            <button onClick={() => { set({ showOnboarding: false }); navigate('guide') }} className="text-xs font-medium text-accent hover:underline">Read the user guide</button>
            <button onClick={() => set({ showOnboarding: false })} className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90">Start designing</button>
          </span>
        </div>
      </div>
    </div>
  )
}
