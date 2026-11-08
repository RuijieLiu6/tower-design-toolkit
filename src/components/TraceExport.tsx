// Export the decision trace as a W3C PROV-O bundle (JSON-LD), for the team's own audit (research P16-M04).
import { Download } from './icons'
import { useState } from 'react'
import { RULE_CARDS } from '../data/ruleCards'
import { saveFile } from '../lib/download'
import { APP_LABEL } from '../lib/project/appLabel'
import { traceToProv } from '../lib/trace/prov'
import { useTrace } from '../lib/trace/trace'
import { Section } from './ui'

export default function TraceExport() {
  const { iterations, decisions, reviews } = useTrace()
  const [anonymise, setAnonymise] = useState(true)
  const empty = !iterations.length && !decisions.length && !reviews.length
  const run = () => {
    const bundle = traceToProv({ iterations, decisions, reviews }, { anonymise, app: APP_LABEL, cards: RULE_CARDS, exportedAt: new Date().toISOString() })
    saveFile(`tower-studio-trace${anonymise ? '-anonymised' : ''}.jsonld`, JSON.stringify(bundle, null, 2))
  }
  return (
    <Section title="Export the trace" help="A W3C PROV bundle (JSON-LD): each iteration as a check run that used a design and produced results, designs derived from earlier ones, and decisions and card reviews tied to the person who made them. For the team's audit; never part of the anonymous entry.">
      <div className="flex flex-wrap items-center gap-3 text-meta">
        <label className="flex items-center gap-1"><input type="checkbox" checked={anonymise} onChange={(e) => setAnonymise(e.target.checked)} />Replace names with Person 1, 2…</label>
        <button disabled={empty} onClick={run} className="flex items-center gap-1 rounded-md border border-line px-2 py-1 font-medium hover:border-accent hover:text-accent disabled:opacity-40"><Download size={12} />Export PROV (.jsonld)</button>
      </div>
      <p className="mt-1 text-meta text-muted">{empty ? 'Record an iteration first.' : `${iterations.length} iterations, ${decisions.length} decisions, ${reviews.length} reviews.`} Rationales and notes are kept as written, so names typed into them stay.</p>
    </Section>
  )
}
