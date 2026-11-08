// Keeps the 3D view from failing silently (6 Nov, after "the context doesn't show up on a different computer"). Without
// a guard, a browser that can't open WebGL 2 (graphics acceleration off, an old driver, a blocklisted GPU) made the R3F
// Canvas throw and took the whole page down, and a graphics card that dropped the context (low memory on shared
// graphics) left a blank view. Now the rest of the app keeps working and a card says what happened and how to fix it.
// "Restart the 3D view" mounts a fresh Canvas (a new WebGL context).
import { Component, useEffect, useRef, useState, type ErrorInfo, type ReactNode } from 'react'
import { CircleAlert, RefreshCw } from './icons'
import Help from './Help'

let support: boolean | null = null
/** WebGL 2 (three.js needs it), checked once with a throwaway canvas that is released straight away. */
export function webgl2Available(): boolean {
  if (support !== null) return support
  try {
    const gl = document.createElement('canvas').getContext('webgl2')
    support = !!gl
    gl?.getExtension('WEBGL_lose_context')?.loseContext()
  } catch { support = false }
  return support
}

type Problem = { kind: 'unsupported' } | { kind: 'lost' } | { kind: 'error'; message: string }

class Boundary extends Component<{ onError: (e: Error) => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('The 3D view stopped:', error, info.componentStack)
    this.props.onError(error)
  }
  render() { return this.state.failed ? null : this.props.children }
}

export default function ViewGuard({ children }: { children: ReactNode }) {
  const [attempt, setAttempt] = useState(0)
  const [problem, setProblem] = useState<Problem | null>(() => (webgl2Available() ? null : { kind: 'unsupported' }))
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = box.current
    if (!el) return
    // Context events don't bubble; capture still reaches them. A canvas that React is removing (project switch) also
    // loses its context on purpose: only a canvas still on the page counts.
    const lost = (e: Event) => { const t = e.target as Node; setTimeout(() => { if (el.contains(t)) setProblem((p) => p ?? { kind: 'lost' }) }, 0) }
    const restored = () => setProblem((p) => (p?.kind === 'lost' ? null : p))
    el.addEventListener('webglcontextlost', lost, true)
    el.addEventListener('webglcontextrestored', restored, true)
    return () => { el.removeEventListener('webglcontextlost', lost, true); el.removeEventListener('webglcontextrestored', restored, true) }
  }, [])
  const restart = () => {
    support = null
    setProblem(webgl2Available() ? null : { kind: 'unsupported' })
    setAttempt((a) => a + 1)
  }
  return (
    <div ref={box} className="contents">
      {problem?.kind !== 'unsupported' && <Boundary key={attempt} onError={(e) => setProblem({ kind: 'error', message: e?.message || String(e) })}>{children}</Boundary>}
      {problem && <ProblemCard problem={problem} onRestart={restart} />}
    </div>
  )
}

function ProblemCard({ problem, onRestart }: { problem: Problem; onRestart: () => void }) {
  const webgl = problem.kind === 'unsupported' || (problem.kind === 'error' && /webgl|context/i.test(problem.message))
  const title = webgl ? '3D view couldn\'t start' : problem.kind === 'lost' ? 'The 3D view stopped' : 'The 3D view stopped with an error'
  return (
    <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center p-4">
      <section role="alert" aria-labelledby="view-problem-title" className="pointer-events-auto w-full max-w-md rounded-lg border border-line bg-panel p-4 text-xs text-muted shadow-lg">
        <div className="flex items-start gap-2">
          <CircleAlert size={18} className="mt-0.5 shrink-0 text-flag-false" aria-hidden />
          <h2 id="view-problem-title" className="flex-1 text-sm font-semibold text-ink">{title}</h2>
          <Help label="About the 3D view">
            <p>The 3D view draws with WebGL 2, the browser's link to the graphics card. The panels, checks, results and files work without it.</p>
            <p className="mt-1.5">To see what your browser reports, open <code>chrome://gpu</code> (Chrome, Edge) or <code>about:support</code> (Firefox) and look for WebGL2.</p>
          </Help>
        </div>
        {webgl ? (
          <>
            <p className="mt-1.5">This browser couldn't open WebGL 2, which the 3D view needs. Everything else still works. To fix it:</p>
            <ul className="mt-1.5 list-disc space-y-0.5 pl-5">
              <li>Turn on graphics (hardware) acceleration in the browser's settings, then restart the browser.</li>
              <li>Update the browser and the graphics driver.</li>
              <li>Or open the site in another current browser: Chrome, Edge, Firefox or Safari.</li>
            </ul>
          </>
        ) : problem.kind === 'lost' ? (
          <p className="mt-1.5">The graphics card dropped the 3D view, often when it runs short of memory (common on laptops with shared graphics). Your design is not affected. Closing other tabs with maps or 3D can help.</p>
        ) : (
          <p className="mt-1.5">Your design is not affected. Restart the view; if it happens again, the message below helps us find the cause.</p>
        )}
        {problem.kind === 'error' && <p className="mt-1.5 break-words font-mono text-meta text-ink">{problem.message}</p>}
        <button type="button" onClick={onRestart}
          className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
          <RefreshCw size={14} aria-hidden />{webgl ? 'Try again' : 'Restart the 3D view'}
        </button>
      </section>
    </div>
  )
}
