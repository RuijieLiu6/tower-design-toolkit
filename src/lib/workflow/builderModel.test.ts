// The workflow builder's view model (Result A, 9 Nov): the library, the sequence of cards, the state words, the edit
// previews and the inspector's plain words, all derived from the saved board and the catalogues. Nothing here runs a
// check: every expectation is about words and connections. Ids are the registry's (built.fsr, built.sun,
// built.vtc-rules, built.wind-screen) and the design steps (design.site, design.massing, design.program).
import { describe, expect, it } from 'vitest'
import {
  addPreview, applicability, bestAfter, cardState, designSummary, entryFor, filterEntries, libraryEntries, movePreview, phaseName,
  plainWords, previewWords, purposeOf, removePreview, runsInProject, sequenceModel, TOOL_STATE_DETAIL, toolState, type StateContext,
} from './builderModel'
import type { ToolDefinition } from '../designTools/contract'
import { ALL_NODES, BUILT_NODES } from '../../data/registry'
import { NODE_NEEDS } from '../../data/nodeNeeds'
import { DESIGN_NODES } from './designNodes'
import { homePhase } from './phaseTools'
import { connect, runOrder } from './projectWorkflow'
import { edgeKey, linear, returnEdges, walk, type Board } from '../workflowGraph'
import type { NodePackage } from '../nodePackages'

const board = (ids: string[]): Board => ({ nodes: ids, edges: linear(ids) })
const home = (id: string) => homePhase(id)
const EMPTY: Board = { nodes: [], edges: [] }

/** An installed custom tool, as a package in My tools (its category puts it in Schematic). */
const PKG: NodePackage = {
  format: 'tower-studio-node@1', id: 'community.plate-check', version: '1.0.0', licence: 'MIT', name: 'Plate depth check',
  author: { name: 'Test' }, category: 'STRC', stage: 'schematic', question: 'Is each floor plate shallow enough for daylight?',
  inputs: ['the typical floor plates', 'the core'], method: 'test', human: 'test', limits: 'test',
  parameters: [{ id: 'depth', label: 'Target depth', unit: 'm', default: 12, flag: 'team_assumption', source: { label: 'Team assumption: test' } }],
  metrics: [],
}
const RESEARCHED = ALL_NODES.filter((n) => n.status === 'researched')

// ---------- the tool library ----------

describe('purposeOf', () => {
  it('keeps the first clause of a long question and drops the question mark', () => {
    expect(purposeOf({ question: 'How much floor area does each use get, and what FSR results?' })).toBe('How much floor area does each use get, and what FSR results')
    expect(purposeOf({ question: 'Does the massing meet the competition rules: height band, 9.0 non-residential FSR, block, transit link?' })).toBe('Does the massing meet the competition rules')
  })
  it('keeps a short lead-in whole rather than cutting it to a fragment', () => {
    expect(purposeOf({ question: 'Short: does it fit?' })).toBe('Short: does it fit')
    expect(purposeOf({ question: '  No punctuation at all  ' })).toBe('No punctuation at all')
  })
})

describe('entryFor', () => {
  const b = board(['design.site', 'built.fsr'])
  it('describes a design step from its own words', () => {
    const e = entryFor('design.massing', { board: b, packages: [] })
    expect(e).toMatchObject({ id: 'design.massing', name: 'Massing', word: 'Massing', purpose: 'Place and shape the towers.', phase: 'form', kind: 'design', availability: 'available', inWorkflow: false })
    expect(entryFor('design.site', { board: b, packages: [] }).inWorkflow).toBe(true)
  })
  it('describes a built check with its full name, word, one-line purpose, home phase and projects', () => {
    const e = entryFor('built.fsr', { board: b, packages: [] })
    expect(e).toMatchObject({ name: 'Program & FSR accounting', word: 'FSR', phase: 'program', kind: 'check', availability: 'available', category: 'PROG', projects: ['vtc', 'city'], inWorkflow: true })
    expect(e.purpose).toBe('How much floor area does each use get, and what FSR results')
    expect(entryFor('built.wind-screen', { board: b, packages: [] })).toMatchObject({ phase: 'form', kind: 'check', availability: 'available', inWorkflow: false })
    expect(entryFor('built.vtc-rules', { board: b, packages: [] })).toMatchObject({ phase: 'site', projects: ['vtc'] })
  })
  it('marks a preview check as a preview, not as available', () => {
    expect(BUILT_NODES.find((n) => n.id === 'built.sun')!.status).toBe('preview')
    expect(entryFor('built.sun', { board: b, packages: [] })).toMatchObject({ name: 'Sun & shadow preview', word: 'Shadow', phase: 'form', kind: 'check', availability: 'preview' })
  })
  it('shows a check where the user placed it, over its home phase', () => {
    expect(entryFor('built.fsr', { board: b, packages: [], placed: { 'built.fsr': 'form' } }).phase).toBe('form')
    expect(entryFor('built.fsr', { board: b, packages: [], placed: {} }).phase).toBe('program')
  })
  it('describes an installed custom tool from its package, in the phase of its category', () => {
    const e = entryFor(PKG.id, { board: b, packages: [PKG] })
    expect(e).toMatchObject({ name: 'Plate depth check', word: 'Plate', purpose: 'Is each floor plate shallow enough for daylight', phase: 'schematic', kind: 'custom', availability: 'custom', category: 'STRC', inWorkflow: false })
    expect(entryFor(PKG.id, { board: b, packages: [PKG], placed: { [PKG.id]: 'form' } }).phase).toBe('form')
  })
  it('keeps a custom tool the workflow refers to but which is not installed, as a missing reference', () => {
    const e = entryFor('community.x', { board: { nodes: ['community.x'], edges: linear(['community.x']) }, packages: [] })
    expect(e).toMatchObject({ id: 'community.x', name: 'x', word: 'Missing', kind: 'missing', availability: 'missing', inWorkflow: true })
    expect(e.purpose).toMatch(/not installed/)
  })
  it('describes a researched module as research only', () => {
    const r = RESEARCHED[0]
    expect(r).toBeDefined()
    const e = entryFor(r.id, { board: b, packages: [] })
    expect(e).toMatchObject({ id: r.id, name: r.name, kind: 'research', availability: 'research', category: r.category, inWorkflow: false })
    expect(['site', 'form', 'program', 'schematic', 'present']).toContain(e.phase)
  })
  it('never throws on an unknown id', () => {
    expect(entryFor('nope', { board: b, packages: [] })).toMatchObject({ id: 'nope', name: 'nope', kind: 'missing', availability: 'missing', purpose: 'Unknown tool.' })
  })
})

/** A connected design tool, as its definition registers it (lib/designTools/contract.ts): Form phase, replace-geometry. */
const TOOL: ToolDefinition = {
  format: 'tower-studio-design-tool@1', id: 'tool.form-studio', version: '0.1.0', name: 'Form Studio', purpose: 'Shape a tapered, twisted tower and send it back.',
  author: { name: 'Ruijie' }, licence: 'MIT', phases: ['form'],
  connection: { method: 'web', url: 'http://localhost:5577/index.html', origin: 'http://localhost:5577', protocol: 'tdt-design-tool@1' },
  runtime: { browser: true, network: ['http://localhost:5577'] }, inputs: ['tower.selected'], outputs: ['geometry.storeys'], operations: ['replace-geometry'],
  units: { length: 'm', frame: 'tower-local', up: 'z' }, destination: { sends: ['the selected tower’s footprint and height'], to: 'http://localhost:5577', stores: 'the tool’s localStorage' },
  limits: [], editability: 'externally-generated',
}

describe('connected design tools in the library', () => {
  const b = board(['design.massing', TOOL.id])
  it('describes an installed design tool from its definition: kind tool, its first phase, its state word, after the packages under My tools', () => {
    const e = entryFor(TOOL.id, { board: b, packages: [], tools: { [TOOL.id]: TOOL } })
    expect(e).toMatchObject({ id: TOOL.id, name: 'Form Studio', word: 'Form', purpose: TOOL.purpose, phase: 'form', kind: 'tool', availability: 'tool', category: 'CLIM', inWorkflow: true, toolState: 'Connected' })
    expect(entryFor(TOOL.id, { board: b, packages: [], tools: { [TOOL.id]: TOOL }, placed: { [TOOL.id]: 'program' } }).phase).toBe('program')
    const lib = libraryEntries({ board: b, packages: [PKG], tools: { [TOOL.id]: TOOL } })
    expect(lib.mine.map((e) => [e.id, e.kind, e.inWorkflow])).toEqual([[PKG.id, 'custom', false], [TOOL.id, 'tool', true]])
    expect(lib.available.some((e) => e.id === TOOL.id)).toBe(false)
    expect(cardState(TOOL.id, { project: 'vtc', towers: 1, siteArea: 1000, analysis: true, installed: new Set(), tools: { [TOOL.id]: TOOL } })).toEqual({ kind: 'tool', word: 'Design tool', detail: 'Opens its workspace; proposes changes you apply.' })
  })
  it('keeps a design tool the workflow refers to but which is not installed, as a missing reference in Form', () => {
    const e = entryFor(TOOL.id, { board: b, packages: [], tools: {} })
    expect(e).toMatchObject({ id: TOOL.id, name: 'form-studio', word: 'Missing', kind: 'missing', availability: 'missing', phase: 'form', inWorkflow: true })
    expect(e.purpose).toBe('A connected design tool that is not installed in this browser.')
    const lib = libraryEntries({ board: b, packages: [], tools: {} })
    expect(lib.mine.map((e) => [e.id, e.availability])).toEqual([[TOOL.id, 'missing']])
    expect(cardState(TOOL.id, { project: 'vtc', towers: 1, siteArea: 1000, analysis: true, installed: new Set(), tools: {} }).kind).toBe('missing')
    expect(cardState(TOOL.id, { project: 'vtc', towers: 1, siteArea: 1000, analysis: true, installed: new Set([TOOL.id]), tools: {} }).kind).toBe('tool')
  })
  it('names the five states from the definition alone, never from the network', () => {
    expect(toolState(TOOL)).toBe('Connected')
    expect(toolState({ ...TOOL, format: 'tower-studio-design-tool@2' as typeof TOOL.format })).toBe('Unsupported version')
    expect(toolState({ ...TOOL, operations: [] })).toBe('External reference')
    expect(toolState({ ...TOOL, runtime: { browser: false as unknown as true, network: [] } })).toBe('Missing runtime')
    expect(toolState({ ...TOOL, connection: { ...TOOL.connection, method: 'desktop' as unknown as 'web' } })).toBe('Connection required')
    expect(Object.keys(TOOL_STATE_DETAIL).sort()).toEqual(['Connected', 'Connection required', 'External reference', 'Missing runtime', 'Unsupported version'])
  })
})

describe('libraryEntries', () => {
  const b: Board = { nodes: ['design.site', 'built.fsr', 'community.x'], edges: linear(['design.site', 'built.fsr', 'community.x']) }
  const lib = libraryEntries({ board: b, packages: [PKG], research: ALL_NODES, tools: {} })

  it('offers the design steps and every built check as available, previews marked', () => {
    expect(lib.available.map((e) => e.id)).toEqual([...DESIGN_NODES.map((d) => d.id), ...BUILT_NODES.map((n) => n.id)])
    expect(lib.available.filter((e) => e.kind === 'design')).toHaveLength(5)
    expect(lib.available.find((e) => e.id === 'built.sun')!.availability).toBe('preview')
    expect(lib.available.find((e) => e.id === 'built.fsr')!.availability).toBe('available')
    expect(lib.available.every((e) => e.availability === 'available' || e.availability === 'preview')).toBe(true)
    expect(lib.available.find((e) => e.id === 'built.fsr')!.inWorkflow).toBe(true)
    expect(lib.available.find((e) => e.id === 'built.sun')!.inWorkflow).toBe(false)
  })
  it('puts installed packages under My tools, then the missing references the workflow still holds', () => {
    expect(lib.mine.map((e) => [e.id, e.availability, e.inWorkflow])).toEqual([[PKG.id, 'custom', false], ['community.x', 'missing', true]])
  })
  it('does not list an installed package as missing', () => {
    const withIt: Board = { nodes: [PKG.id], edges: linear([PKG.id]) }
    const l = libraryEntries({ board: withIt, packages: [PKG] })
    expect(l.mine.map((e) => [e.id, e.availability, e.inWorkflow])).toEqual([[PKG.id, 'custom', true]])
  })
  it('keeps research-only modules apart, and only those', () => {
    expect(lib.research.length).toBe(RESEARCHED.length)
    expect(lib.research.length).toBeGreaterThan(0)
    expect(lib.research.every((e) => e.availability === 'research' && e.kind === 'research')).toBe(true)
    expect(lib.research.some((e) => e.id.startsWith('built.') || e.id.startsWith('design.'))).toBe(false)
    expect(libraryEntries({ board: b, packages: [], research: BUILT_NODES }).research).toEqual([]) // built ones never land there
    expect(libraryEntries({ board: b, packages: [] }).research).toEqual([])
  })
  it('never offers a built check or design step twice', () => {
    const ids = [...lib.available, ...lib.mine, ...lib.research].map((e) => e.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('applicability', () => {
  it('names the one project a tool runs in, or nothing when it runs in both', () => {
    expect(applicability({ projects: ['vtc'] })).toBe('Competition project only')
    expect(applicability({ projects: ['city'] })).toBe('Real Vancouver only')
    expect(applicability({ projects: ['vtc', 'city'] })).toBeNull()
    expect(applicability({})).toBeNull()
    expect(applicability(entryFor('built.vtc-rules', { board: EMPTY, packages: [] }))).toBe('Competition project only')
    expect(applicability(entryFor('built.heights', { board: EMPTY, packages: [] }))).toBe('Real Vancouver only')
  })
  it('says whether a tool runs in the open project', () => {
    expect(runsInProject({ projects: ['vtc'] }, 'city')).toBe(false)
    expect(runsInProject({ projects: ['vtc'] }, 'vtc')).toBe(true)
    expect(runsInProject({ projects: ['vtc', 'city'] }, 'city')).toBe(true)
    expect(runsInProject({}, 'city')).toBe(true)
  })
})

describe('filterEntries', () => {
  const all = libraryEntries({ board: EMPTY, packages: [PKG] })
  const list = [...all.available, ...all.mine]
  it('searches names, words, purposes and categories, ignoring case and spaces', () => {
    expect(filterEntries(list, { query: 'fsr' }).map((e) => e.id)).toContain('built.fsr')
    expect(filterEntries(list, { query: '  FSR ' }).map((e) => e.id)).toContain('built.fsr')
    expect(filterEntries(list, { query: 'shape the towers' }).map((e) => e.id)).toEqual(['design.massing']) // a purpose
    expect(filterEntries(list, { query: 'CLIM' }).map((e) => e.id)).toContain('built.wind-screen') // a category
    expect(filterEntries(list, { query: 'plate depth' }).map((e) => e.id)).toContain(PKG.id)
    expect(filterEntries(list, { query: 'zzz-nothing' })).toEqual([])
  })
  it('filters by phase, and passes everything through with no query and no phase', () => {
    const form = filterEntries(list, { phase: 'form' })
    expect(form.every((e) => e.phase === 'form')).toBe(true)
    expect(form.map((e) => e.id)).toEqual(expect.arrayContaining(['design.massing', 'built.sun', 'built.wind-screen']))
    expect(form.map((e) => e.id)).not.toContain('built.fsr')
    expect(filterEntries(list, { phase: 'schematic' }).map((e) => e.id)).toContain(PKG.id)
    expect(filterEntries(list, {})).toHaveLength(list.length)
    expect(filterEntries(list, { query: '', phase: null })).toHaveLength(list.length)
  })
  it('combines the query and the phase', () => {
    expect(filterEntries(list, { query: 'wind', phase: 'form' }).map((e) => e.id).sort()).toEqual(['built.wind-screen', 'built.wind-study'])
    expect(filterEntries(list, { query: 'wind', phase: 'program' })).toEqual([])
  })
})

// ---------- the sequence of cards ----------

describe('sequenceModel', () => {
  const ids = ['design.site', 'built.fsr', 'built.sun']
  const lin = board(ids)

  it('numbers a linear board 1..n on the main lane, each card leading to the next and the last to the end', () => {
    const m = sequenceModel(lin, home)
    expect(m.cards.map((c) => [c.id, c.index, c.lane, c.col])).toEqual([['design.site', 1, 'main', 1], ['built.fsr', 2, 'main', 2], ['built.sun', 3, 'main', 3]])
    expect(m.cards.map((c) => c.next)).toEqual([['built.fsr'], ['built.sun'], ['enter']])
    expect(m.cards.every((c) => c.returnsTo.length === 0 && c.returnedFrom.length === 0 && c.branchesTo.length === 0)).toBe(true)
    expect(m.cards.map((c) => c.phase)).toEqual(['site', 'program', 'form'])
    expect(m.columns).toEqual([{ col: 1, main: 'design.site', branches: [] }, { col: 2, main: 'built.fsr', branches: [] }, { col: 3, main: 'built.sun', branches: [] }])
    expect(m.returns).toEqual([])
    expect(m.unwired).toEqual([])
    expect(m.run).toEqual(ids)
    expect(m.hasBranches).toBe(false)
    expect(m.cards.some((c) => c.id === 'start' || c.id === 'enter')).toBe(false)
  })
  it('shows a return path on both ends and in the returns list, without changing the order', () => {
    const looped = connect(lin, 'built.sun', 'design.site')
    const m = sequenceModel(looped, home)
    expect(m.run).toEqual(ids)
    expect(m.cards.map((c) => c.index)).toEqual([1, 2, 3])
    const sun = m.cards.find((c) => c.id === 'built.sun')!, site = m.cards.find((c) => c.id === 'design.site')!
    expect(sun.returnsTo).toEqual(['design.site'])
    expect(sun.next).toEqual(['enter']) // the forward route stays
    expect(site.returnedFrom).toEqual(['built.sun'])
    expect(m.returns).toEqual([{ key: 'built.sun>design.site', from: 'built.sun', to: 'design.site', level: 1 }])
    expect(m.hasBranches).toBe(false)
  })
  it('puts a branch (Start→A→B and A→C→B) on the branch lane and says so', () => {
    const branched: Board = { nodes: ['a', 'b', 'c'], edges: [...linear(['a', 'b']), { a: 'a', b: 'c' }, { a: 'c', b: 'b' }] }
    const m = sequenceModel(branched, () => 'form')
    const a = m.cards.find((x) => x.id === 'a')!, c = m.cards.find((x) => x.id === 'c')!, b = m.cards.find((x) => x.id === 'b')!
    expect(a.lane).toBe('main'); expect(b.lane).toBe('main'); expect(c.lane).toBe('branch')
    expect(a.next).toEqual(['b', 'c'])
    expect(a.branchesTo).toEqual(['c'])
    expect(c.next).toEqual(['b'])
    expect(c.index).toBe(3) // reached by Start, so it has a place in the run
    expect(m.hasBranches).toBe(true)
    expect(m.returns).toEqual([])
    expect(m.columns.find((col) => col.branches.includes('c'))).toBeDefined()
    expect(m.columns.flatMap((col) => [col.main, ...col.branches]).filter(Boolean).sort()).toEqual(['a', 'b', 'c'])
  })
  it('keeps a node with no way from Start as an unwired card with no index', () => {
    const m = sequenceModel({ nodes: ['built.fsr', 'built.sun'], edges: linear(['built.fsr']) }, home)
    const sun = m.cards.find((c) => c.id === 'built.sun')!
    expect(sun).toMatchObject({ lane: 'unwired', index: null, next: [], returnsTo: [], phase: 'form' })
    expect(m.unwired).toEqual(['built.sun'])
    expect(m.run).toEqual(['built.fsr'])
    expect(m.columns.flatMap((col) => [col.main, ...col.branches])).not.toContain('built.sun')
    expect(m.hasBranches).toBe(false)
  })
  it('uses the home phase for checks and the design node phase for design steps', () => {
    const m = sequenceModel(board(['design.massing', 'built.fsr']), () => 'present')
    expect(m.cards.map((c) => c.phase)).toEqual(['form', 'present'])
  })
  it('accounts for every wire exactly once across next and returnsTo (branches are a subset of next)', () => {
    const base: Board = { nodes: ['a', 'b', 'c', 'd', 'x', 'u'], edges: [...linear(['a', 'b', 'c', 'd']), { a: 'b', b: 'x' }, { a: 'x', b: 'enter' }] }
    const looped = connect(connect(base, 'c', 'a'), 'd', 'b')
    const m = sequenceModel(looped, () => 'site')
    const shown = m.cards.flatMap((c) => [...c.next.map((b) => `${c.id}>${b}`), ...c.returnsTo.map((b) => `${c.id}>${b}`)])
    const onBoard = looped.edges.filter((e) => e.a !== 'start').map(edgeKey)
    expect(shown.sort()).toEqual(onBoard.sort())
    expect(new Set(shown).size).toBe(shown.length)
    for (const c of m.cards) for (const t of c.branchesTo) expect(c.next).toContain(t)
    expect(m.returns.map((r) => r.key).sort()).toEqual(['c>a', 'd>b'])
    expect(new Set(m.returns.map((r) => r.level)).size).toBe(2) // overlapping loops take two levels
    for (const r of m.returns) {
      expect(m.cards.find((c) => c.id === r.from)!.returnsTo).toContain(r.to)
      expect(m.cards.find((c) => c.id === r.to)!.returnedFrom).toContain(r.from)
    }
    expect(m.unwired).toEqual(['u'])
    expect(m.hasBranches).toBe(true)
  })
})

// ---------- states ----------

describe('cardState', () => {
  const ctx = (o: Partial<StateContext> = {}): StateContext => ({ project: 'vtc', towers: 1, siteArea: 11468, analysis: true, installed: new Set<string>(), ...o })

  it('calls a design step a design step, whatever the project holds', () => {
    expect(cardState('design.massing', ctx({ towers: 0, analysis: false }))).toMatchObject({ kind: 'design', word: 'Design step' })
  })
  it('keeps a missing custom tool visible as missing, and treats an installed one as a normal tool', () => {
    expect(cardState('community.x', ctx())).toMatchObject({ kind: 'missing', word: 'Missing tool' })
    expect(cardState('community.x', ctx()).detail).toMatch(/not installed/)
    expect(cardState('community.x', ctx({ installed: new Set(['community.x']) })).kind).toBe('ready')
  })
  it('says a competition-only check does not run in Real Vancouver, before anything about its inputs', () => {
    const s = cardState('built.vtc-rules', ctx({ project: 'city', towers: 0 }))
    expect(s).toMatchObject({ kind: 'other-project', word: 'Competition project only' })
    expect(cardState('built.vtc-rules', ctx({ project: 'vtc' })).kind).toBe('ready')
    expect(cardState('built.heights', ctx({ project: 'vtc' }))).toMatchObject({ kind: 'other-project', word: 'Real Vancouver only' })
  })
  it('says Needs model with no tower, for a check that reads the model', () => {
    const s = cardState('built.fsr', ctx({ towers: 0 }))
    expect(s).toMatchObject({ kind: 'needs-model', word: 'Needs model' })
    expect(s.detail).toMatch(/no building model/)
    expect(s.detail).toMatch(/Place a tower/)
    expect(cardState('built.wind-screen', ctx({ towers: 0 })).kind).toBe('needs-model')
    expect(cardState('built.sun', ctx({ towers: 0 })).kind).toBe('ready') // runs without a tower
  })
  it('says Waiting for input for Real Vancouver FSR with no study site', () => {
    const s = cardState('built.fsr', ctx({ project: 'city', towers: 1, siteArea: null }))
    expect(s).toMatchObject({ kind: 'waiting-input', word: 'Waiting for input' })
    expect(s.detail).toMatch(/study site/)
    expect(cardState('built.fsr', ctx({ project: 'city', towers: 1, siteArea: 2000 })).kind).toBe('ready')
    expect(cardState('built.fsr', ctx({ project: 'city', towers: 0, siteArea: null })).kind).toBe('needs-model') // the model first
  })
  it('says Paused when auto-run is off, and Ready otherwise', () => {
    expect(cardState('built.fsr', ctx({ analysis: false }))).toMatchObject({ kind: 'paused', word: 'Paused' })
    expect(cardState('built.fsr', ctx())).toMatchObject({ kind: 'ready', word: 'Ready' })
    expect(cardState('built.fsr', ctx({ towers: 0, analysis: false })).kind).toBe('needs-model') // a missing input comes before the pause
  })
  it('always has a word and a detail', () => {
    for (const id of ['design.site', 'community.x', 'built.vtc-rules', 'built.fsr', 'built.sun']) {
      for (const c of [ctx(), ctx({ project: 'city', towers: 0, siteArea: null, analysis: false })]) {
        const s = cardState(id, c)
        expect(s.word.length).toBeGreaterThan(0)
        expect(s.detail.length).toBeGreaterThan(0)
      }
    }
  })
})

describe('designSummary', () => {
  const t = (bands: number) => ({ bands: Array.from({ length: bands }, () => ({})) })
  it('says what the Site step holds', () => {
    expect(designSummary('design.site', { project: 'vtc', towers: [], hasSite: false })).toBe('Competition block')
    expect(designSummary('design.site', { project: 'city', towers: [], hasSite: true, siteName: 'Granville & Robson' })).toBe('Granville & Robson')
    expect(designSummary('design.site', { project: 'city', towers: [], hasSite: true, siteName: null })).toBe('Study site chosen')
    expect(designSummary('design.site', { project: 'city', towers: [], hasSite: false })).toBe('No site yet')
  })
  it('counts towers for Massing', () => {
    expect(designSummary('design.massing', { project: 'vtc', towers: [], hasSite: true })).toBe('No tower yet')
    expect(designSummary('design.massing', { project: 'vtc', towers: [t(0)], hasSite: true })).toBe('1 tower')
    expect(designSummary('design.massing', { project: 'vtc', towers: [t(0), t(0)], hasSite: true })).toBe('2 towers')
  })
  it('counts program bands across the towers for Program', () => {
    expect(designSummary('design.program', { project: 'vtc', towers: [], hasSite: true })).toBe('No tower yet')
    expect(designSummary('design.program', { project: 'vtc', towers: [t(1)], hasSite: true })).toBe('1 program band')
    expect(designSummary('design.program', { project: 'vtc', towers: [t(2), t(1)], hasSite: true })).toBe('3 program bands')
    expect(designSummary('design.program', { project: 'vtc', towers: [{}], hasSite: true })).toBe('0 program bands')
  })
  it('has nothing to say for the other steps or a check', () => {
    expect(designSummary('design.plates', { project: 'vtc', towers: [t(1)], hasSite: true })).toBeNull()
    expect(designSummary('design.frame', { project: 'vtc', towers: [t(1)], hasSite: true })).toBeNull()
    expect(designSummary('built.fsr', { project: 'vtc', towers: [t(1)], hasSite: true })).toBeNull()
  })
})

// ---------- previews ----------

describe('bestAfter', () => {
  const process = board(['design.site', 'built.vtc-rules', 'design.massing', 'built.sun', 'design.program', 'built.fsr'])
  it('puts a tool after the last node of its phase or an earlier one', () => {
    expect(bestAfter(process, 'built.wind-screen', home)).toBe('built.sun') // Form, after the last Form node
    expect(bestAfter(process, 'built.heights', home)).toBe('built.vtc-rules') // Site
    expect(bestAfter(process, 'built.economics', home)).toBe('built.fsr') // Program, at the end
    expect(bestAfter(process, 'built.core-lifts', home)).toBe('built.fsr') // Schematic: nothing later, so the end
    expect(bestAfter(process, 'design.plates', home)).toBe('built.fsr')
  })
  it('goes first when the run has nothing of its phase or earlier, and on an empty board', () => {
    expect(bestAfter(board(['design.massing', 'built.fsr']), 'built.vtc-rules', home)).toBe('start')
    expect(bestAfter(EMPTY, 'built.fsr', home)).toBe('start')
  })
  it('respects where a check was placed, through the home function', () => {
    expect(bestAfter(process, 'built.heights', (id) => (id === 'built.heights' ? 'program' : home(id)))).toBe('built.fsr')
  })
})

describe('addPreview', () => {
  it('shows the wires an insertion adds and removes, without changing the board it was given', () => {
    const b = board(['a', 'b'])
    const p = addPreview(b, 'c', 'a')
    expect(p.added.map(edgeKey).sort()).toEqual(['a>c', 'c>b'])
    expect(p.removed.map(edgeKey)).toEqual(['a>b'])
    expect(p.loopsDropped).toBe(0)
    expect(runOrder(p.board)).toEqual(['a', 'c', 'b'])
    expect(b.nodes).toEqual(['a', 'b']) // untouched
    expect(b.edges).toEqual(linear(['a', 'b']))
  })
  // Known gap (reported 9 Nov): the front slot's "start" is mapped to addNode(b, id, null), which means "at the end of
  // the run", so a tool dropped on the front slot lands last. Expected to fail until addNode accepts 'start' (see the
  // builderModel report); flip this to `it` once it does.
  it('puts a tool first with "start"', () => {
    const p = addPreview(board(['a']), 'c', 'start')
    expect(p.added.map(edgeKey).sort()).toEqual(['c>a', 'start>c'])
    expect(p.removed.map(edgeKey)).toEqual(['start>a'])
    expect(runOrder(p.board)).toEqual(['c', 'a'])
  })
  it('starts a board from nothing', () => {
    const first = addPreview(EMPTY, 'built.fsr', 'start')
    expect(first.added.map(edgeKey).sort()).toEqual(['built.fsr>enter', 'start>built.fsr'])
    expect(first.removed).toEqual([])
    expect(runOrder(first.board)).toEqual(['built.fsr'])
  })
  it('changes nothing for a tool already in the workflow', () => {
    const b = board(['a', 'b'])
    const p = addPreview(b, 'b', 'a')
    expect(p.added).toEqual([]); expect(p.removed).toEqual([]); expect(p.loopsDropped).toBe(0)
    expect(p.board).toBe(b)
  })
  it('keeps a return path that does not pass the insertion', () => {
    const looped = connect(board(['a', 'b', 'c']), 'c', 'a')
    const p = addPreview(looped, 'd', 'a')
    expect(p.loopsDropped).toBe(0)
    expect(returnEdges(p.board.edges).has('c>a')).toBe(true)
    expect(runOrder(p.board)).toEqual(['a', 'd', 'b', 'c'])
  })
})

describe('movePreview', () => {
  it('shows the wires a move changes and the new order', () => {
    const b = board(['a', 'b', 'c'])
    const p = movePreview(b, 'c', 'a', 'before')
    expect(runOrder(p.board)).toEqual(['c', 'a', 'b'])
    expect(p.added.map(edgeKey)).toEqual(expect.arrayContaining(['start>c', 'c>a', 'b>enter']))
    expect(p.removed.map(edgeKey)).toEqual(expect.arrayContaining(['start>a', 'b>c', 'c>enter']))
    expect(p.loopsDropped).toBe(0)
    const after = movePreview(b, 'a', 'c', 'after')
    expect(runOrder(after.board)).toEqual(['b', 'c', 'a'])
  })
  it('keeps a return path that still runs back, and counts one that would not', () => {
    const looped = connect(board(['a', 'b', 'c', 'd']), 'c', 'a')
    const kept = movePreview(looped, 'd', 'a', 'before')
    expect(runOrder(kept.board)).toEqual(['d', 'a', 'b', 'c'])
    expect(kept.loopsDropped).toBe(0)
    expect(returnEdges(kept.board.edges).has('c>a')).toBe(true)
    const dropped = movePreview(looped, 'c', 'a', 'before') // c now comes before a: c → a would run forward
    expect(runOrder(dropped.board)).toEqual(['c', 'a', 'b', 'd'])
    expect(dropped.loopsDropped).toBe(1)
    expect(dropped.board.edges.some((e) => e.a === 'c' && e.b === 'a' && returnEdges(dropped.board.edges).has('c>a'))).toBe(false)
  })
  it('changes nothing when the target is the node itself', () => {
    const b = board(['a', 'b'])
    const p = movePreview(b, 'a', 'a', 'after')
    expect(p.added).toEqual([]); expect(p.removed).toEqual([]); expect(p.board).toBe(b)
  })
})

describe('removePreview', () => {
  it('joins the neighbours of the removed node', () => {
    const p = removePreview(board(['a', 'b', 'c']), 'b')
    expect(p.added.map(edgeKey)).toEqual(['a>c'])
    expect(p.removed.map(edgeKey).sort()).toEqual(['a>b', 'b>c'])
    expect(p.loopsDropped).toBe(0)
    expect(walk(p.board.edges)).toEqual(['a', 'c'])
    expect(p.board.nodes).toEqual(['a', 'c'])
  })
  it('keeps a loop that runs round the removed node, and counts the loops that end at it', () => {
    const looped = connect(board(['a', 'b', 'c']), 'c', 'a')
    const inside = removePreview(looped, 'b')
    expect(inside.loopsDropped).toBe(0)
    expect(returnEdges(inside.board.edges).has('c>a')).toBe(true)
    const source = removePreview(looped, 'c')
    expect(source.loopsDropped).toBe(1)
    expect(source.removed.map(edgeKey)).toContain('c>a')
    expect(walk(source.board.edges)).toEqual(['a', 'b'])
    const target = removePreview(looped, 'a')
    expect(target.loopsDropped).toBe(1)
    expect(walk(target.board.edges)).toEqual(['b', 'c'])
  })
  it('counts every return path that goes with the node', () => {
    const twice = connect(connect(board(['a', 'b', 'c']), 'c', 'a'), 'c', 'b')
    expect(removePreview(twice, 'c').loopsDropped).toBe(2)
  })
})

describe('previewWords', () => {
  const NAMES: Record<string, string> = { a: 'Massing', b: 'Sun hours', c: 'FSR' }
  const name = (id: string) => NAMES[id] ?? id
  it('says what connects, what goes, and how many return paths are dropped, with Start and End by name', () => {
    expect(previewWords(addPreview(board(['a']), 'c', 'a'), name)).toBe('connects Massing → FSR, FSR → End; removes Massing → End')
    expect(previewWords(removePreview(board(['a', 'b']), 'a'), name)).toBe('connects Start → Sun hours; removes Start → Massing, Massing → Sun hours')
    expect(previewWords(removePreview(board(['a', 'b', 'c']), 'b'), name)).toBe('connects Massing → FSR; removes Massing → Sun hours, Sun hours → FSR')
    expect(previewWords({ added: [], removed: [], loopsDropped: 1, board: EMPTY }, name)).toBe('1 return path dropped')
    expect(previewWords({ added: [{ a: 'a', b: 'enter' }], removed: [], loopsDropped: 2, board: EMPTY }, name)).toBe('connects Massing → End; 2 return paths dropped')
  })
  it('says so when nothing changes', () => {
    expect(previewWords(addPreview(board(['a']), 'a', 'start'), name)).toBe('no connection changes')
    expect(previewWords({ added: [], removed: [], loopsDropped: 0, board: EMPTY }, name)).toBe('no connection changes')
  })
})

// ---------- plain words ----------

describe('plainWords', () => {
  it('tells what a built check uses, asks, produces and which settings it opens with', () => {
    const fsr = plainWords('built.fsr', [])
    expect(fsr.uses).toEqual(NODE_NEEDS['built.fsr'].reads)
    expect(fsr.uses).toContain('every floor’s area and use')
    expect(fsr.asks).toEqual([])
    expect(fsr.produces).toBe(BUILT_NODES.find((n) => n.id === 'built.fsr')!.question)
    expect(fsr.settings).toEqual(['program'])
    const sun = plainWords('built.sun', [])
    expect(sun.asks).toEqual(NODE_NEEDS['built.sun'].asks)
    expect(sun.settings).toEqual(['sun'])
    expect(plainWords('built.heights', []).settings).toEqual(['height suggestion']) // no hyphens in words
    expect(plainWords('built.wind-screen', [])).toMatchObject({ uses: NODE_NEEDS['built.wind-screen'].reads, asks: [], settings: [] })
  })
  it('tells a design step from its own words', () => {
    expect(plainWords('design.massing', [])).toEqual({ uses: ['the shared project model'], asks: [], produces: 'Place and shape the towers.', settings: [] })
  })
  it('reads a custom tool from its package', () => {
    expect(plainWords(PKG.id, [PKG])).toEqual({ uses: ['the typical floor plates', 'the core'], asks: ['Target depth'], produces: PKG.question, settings: [] })
    expect(plainWords(PKG.id, [{ ...PKG, parameters: undefined }]).asks).toEqual([])
  })
  it('says so for a tool that is not installed', () => {
    expect(plainWords('community.x', [])).toEqual({ uses: [], asks: [], produces: 'Unknown: this tool is not installed.', settings: [] })
    expect(plainWords(PKG.id, []).produces).toMatch(/not installed/)
  })
  it('never names a port type', () => {
    for (const n of BUILT_NODES) {
      const p = plainWords(n.id, [])
      for (const s of [...p.uses, ...p.asks, p.produces]) expect(s).not.toMatch(/\b(port|Layer 0|layer0)\b/i)
    }
  })
})

describe('phaseName', () => {
  it('gives the five primary phase names', () => {
    expect((['site', 'form', 'program', 'schematic', 'present'] as const).map(phaseName)).toEqual(['Site', 'Form', 'Program', 'Schematic', 'Present'])
  })
})
