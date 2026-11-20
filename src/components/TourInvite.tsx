// The tour's offer to a new visitor (Sinnie, 20 Nov): a small card in the corner of the cover, once per browser.
// Take it, or Not now; either way it is not shown again (the tour stays in the top bar's More menu and on the
// start page under Other ways in).
import { useState } from 'react'
import { PlayCircle, X } from './icons'
import { markTourOffered, tourOffered, useTour } from '../lib/tour'

export default function TourInvite() {
  const [shown, setShown] = useState(() => !tourOffered())
  const loading = useTour((s) => s.loading)
  if (!shown) return null
  const close = () => { markTourOffered(); setShown(false) }
  return (
    <aside aria-label="New here?" data-testid="tour-invite"
      className="glass fixed bottom-5 right-5 z-[55] w-[min(300px,calc(100vw-40px))] rounded-xl border border-line bg-panel p-3 text-ink shadow-2xl">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">New here?</p>
          <p className="mt-0.5 text-[12px] leading-snug text-muted">A two-minute tour: place a tower, read a result, switch views, open the sheets. You do each step yourself.</p>
        </div>
        <button type="button" onClick={close} aria-label="Not now" className="rounded p-1 text-muted outline-none hover:bg-black/5 hover:text-ink focus-visible:ring-2 focus-visible:ring-accent"><X size={15} /></button>
      </div>
      <div className="mt-2.5 flex items-center justify-end gap-2">
        <button type="button" onClick={close} className="rounded-md px-2 py-1 text-xs text-muted outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-accent">Not now</button>
        <button type="button" disabled={loading} data-testid="tour-invite-start"
          onClick={() => { setShown(false); void useTour.getState().start() }}
          className="flex items-center gap-1 rounded-md bg-accent px-3 py-1 text-xs font-medium text-white outline-none hover:opacity-90 disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"><PlayCircle size={13} aria-hidden />Take the tour</button>
      </div>
    </aside>
  )
}
