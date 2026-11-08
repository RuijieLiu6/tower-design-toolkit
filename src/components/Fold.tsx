// A long text folded behind a summary that says its point (Ruijie, 6 Nov: "for any long texts … could be potentially
// expandable with a comprehensive summary title or a drop down menu"). The summary must carry what matters on its own
// (a privacy point, a caveat), so a reader who never opens it still knows it; the details are one click away.
import type { ReactNode } from 'react'
import { ChevronRight } from './icons'

export default function Fold({ summary, children, className = '', testId }: { summary: ReactNode; children: ReactNode; className?: string; testId?: string }) {
  return (
    <details className={`group text-meta ${className}`} data-testid={testId}>
      <summary className="flex cursor-pointer list-none items-start gap-1 rounded text-muted outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-accent [&::-webkit-details-marker]:hidden">
        <ChevronRight size={12} aria-hidden className="mt-[1px] shrink-0 transition-transform group-open:rotate-90" />
        <span>{summary}</span>
      </summary>
      <div className="mt-1 grid gap-1 pl-4 text-muted">{children}</div>
    </details>
  )
}
