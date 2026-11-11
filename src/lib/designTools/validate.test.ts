// Validation of a tool definition and of a returned proposal (brief §7, §9, §11): every rule one case, nothing repaired.
import { describe, expect, it } from 'vitest'
import { DESIGN_TOOL_FORMAT, LIMITS, PROTOCOL, type ProposalStorey, type ToolDefinition } from './contract'
import { checkDefinition, checkProposal, ringArea, type ProposalContext } from './validate'

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v))

/** The pilot tool as it would be registered (plan §2: Form Studio on GitHub Pages, one pinned origin). */
const definition = (): ToolDefinition => ({
  format: DESIGN_TOOL_FORMAT, id: 'tool.form-studio', version: '1.0.0', name: 'Form Studio',
  purpose: 'Tapered and twisted tower plates with a podium retreat', author: { name: 'Ruijie Liu', url: 'https://github.com/RuijieLiu6/form-studio' }, licence: 'MIT',
  phases: ['form'], connection: { method: 'web', url: 'https://ruijieliu6.github.io/form-studio/?toolkit=1', origin: 'https://ruijieliu6.github.io', protocol: PROTOCOL },
  runtime: { browser: true, network: ['https://ruijieliu6.github.io'] }, inputs: ['tower.selected'], outputs: ['geometry.storeys', 'parameters'], operations: ['replace-geometry'],
  units: { length: 'm', frame: 'tower-local', up: 'z' }, destination: { sends: ['footprint', 'height', 'storeys', 'floor-to-floor', 'podium'], to: 'ruijieliu6.github.io, in your browser', stores: 'the tool page’s own localStorage' },
  limits: ['Plates are one outline per storey'], editability: 'externally-generated',
})
type Loose = Record<string, unknown>
const loose = (): Loose => clone(definition()) as unknown as Loose

const rect = (w: number, d: number): [number, number][] => [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]]
const storeys = (n = 10, f2f = 4, w = 30, d = 30): ProposalStorey[] => Array.from({ length: n }, (_, i) => ({ z0: i * f2f, z1: (i + 1) * f2f, loops: [rect(w, d)] }))

const session = () => ({ sessionId: 's-1', runId: 'r-1', projectId: 'vtc:untitled', baseRevision: 'rev-a', targets: ['t1'] })
const ctx = (over: Partial<ProposalContext> = {}): ProposalContext => ({ def: definition(), session: session(), currentRevision: 'rev-a', applied: new Set<string>(), ...over })
const proposal = (over: Loose = {}): Loose => ({
  protocol: PROTOCOL, type: 'tdt:proposal', toolId: 'tool.form-studio', toolVersion: '1.0.0', sessionId: 's-1', runId: 'r-1', projectId: 'vtc:untitled', baseRevision: 'rev-a',
  units: { length: 'm', frame: 'tower-local', up: 'z' }, operations: [{ op: 'replace-geometry', target: 't1', storeys: storeys(), keep: ['name', 'bands'] }],
  parameters: { taper: 0.8, twist: 15 }, assumptions: ['Plates are rectangles'], warnings: [], ...over,
})
const withStoreys = (st: unknown) => proposal({ operations: [{ op: 'replace-geometry', target: 't1', storeys: st }] })
const problems = (p: Loose, c = ctx()) => checkProposal(p, c).problems.join(' | ')

describe('checkDefinition', () => {
  it('accepts the Form Studio definition and hands it back typed', () => {
    const r = checkDefinition(loose())
    expect(r).toMatchObject({ ok: true, problems: [], warnings: [] })
    expect(r.def?.id).toBe('tool.form-studio')
    expect(r.def?.connection.origin).toBe('https://ruijieliu6.github.io')
  })
  it('refuses anything that is not an object, or another format', () => {
    expect(checkDefinition(null).ok).toBe(false)
    expect(checkDefinition('tool').ok).toBe(false)
    expect(checkDefinition([]).ok).toBe(false)
    const r = checkDefinition({ ...loose(), format: 'tower-studio-node@1' })
    expect(r.ok).toBe(false)
    expect(r.def).toBeUndefined()
    expect(r.problems.join(' ')).toMatch(/format must be "tower-studio-design-tool@1"/)
  })
  it('needs a tool. id of lower-case letters, digits and hyphens', () => {
    expect(checkDefinition({ ...loose(), id: 'community.ruijie.form-studio' }).problems.join(' ')).toMatch(/id must be "tool\."/)
    expect(checkDefinition({ ...loose(), id: 'tool.Form Studio' }).problems.join(' ')).toMatch(/id must be/)
    expect(checkDefinition({ ...loose(), id: 'tool.my-tool-2' }).ok).toBe(true)
  })
  it('never allows a wildcard origin', () => {
    const d = loose()
    ;(d.connection as Loose).origin = '*'
    const r = checkDefinition(d)
    expect(r.ok).toBe(false)
    expect(r.problems.join(' ')).toMatch(/never "\*"/)
  })
  it('pins the origin to the url’s origin', () => {
    const d = loose()
    ;(d.connection as Loose).origin = 'https://example.com'
    const r = checkDefinition(d)
    expect(r.ok).toBe(false)
    expect(r.problems.join(' ')).toMatch(/connection\.origin \(https:\/\/example\.com\) does not match the url's origin \(https:\/\/ruijieliu6\.github\.io\)/)
  })
  it('needs a web connection with a http(s) url and the protocol name', () => {
    const d1 = loose(); d1.connection = { method: 'desktop', url: 'x', origin: 'x', protocol: PROTOCOL }
    expect(checkDefinition(d1).problems.join(' ')).toMatch(/connection\.method must be "web"/)
    const d2 = loose(); (d2.connection as Loose).url = 'not a url'
    expect(checkDefinition(d2).problems.join(' ')).toMatch(/connection\.url is not a URL/)
    const d3 = loose(); (d3.connection as Loose).url = 'ftp://ruijieliu6.github.io/x'; (d3.connection as Loose).origin = 'ftp://ruijieliu6.github.io'
    expect(checkDefinition(d3).problems.join(' ')).toMatch(/must be http\(s\)/)
    const d4 = loose(); (d4.connection as Loose).protocol = 'tdt-design-tool@2'
    expect(checkDefinition(d4).problems.join(' ')).toMatch(/connection\.protocol must be "tdt-design-tool@1"/)
  })
  it('allows plain http on this computer without a word, and warns about http elsewhere', () => {
    const local = loose(); local.connection = { method: 'web', url: 'http://localhost:5173/tools/test-tool.html', origin: 'http://localhost:5173', protocol: PROTOCOL }
    expect(checkDefinition(local)).toMatchObject({ ok: true, warnings: [] })
    const far = loose(); far.connection = { method: 'web', url: 'http://tools.example.com/studio', origin: 'http://tools.example.com', protocol: PROTOCOL }
    const r = checkDefinition(far)
    expect(r.ok).toBe(true)
    expect(r.warnings.join(' ')).toMatch(/served over http, not https/)
  })
  it('needs the destination: what is sent, to whom, where it is stored', () => {
    const d = loose(); delete d.destination
    expect(checkDefinition(d).problems.join(' ')).toMatch(/destination must say what is sent \(sends\), to whom \(to\) and where it is stored \(stores\)/)
    const d2 = loose(); d2.destination = { sends: ['footprint'], to: '', stores: 'nowhere' }
    expect(checkDefinition(d2).ok).toBe(false)
  })
  it('knows only replace-geometry and set-parameter; deletion is refused', () => {
    const d = loose(); d.operations = ['update-program']
    expect(checkDefinition(d).problems.join(' ')).toMatch(/operations must list replace-geometry and\/or set-parameter \(deletion is never allowed\)/)
    const del = loose(); del.operations = ['replace-geometry', 'delete-geometry']
    expect(checkDefinition(del).ok).toBe(false)
    const none = loose(); none.operations = []
    expect(checkDefinition(none).ok).toBe(false)
    const both = loose(); both.operations = ['replace-geometry', 'set-parameter']
    expect(checkDefinition(both).ok).toBe(true)
  })
  it('checks the remaining fields one by one, in plain words', () => {
    const say = (patch: Loose) => checkDefinition({ ...loose(), ...patch }).problems.join(' ')
    expect(say({ version: '' })).toMatch(/version is missing/)
    expect(say({ name: '  ' })).toMatch(/name is missing/)
    expect(say({ purpose: undefined })).toMatch(/purpose is missing/)
    expect(say({ licence: undefined })).toMatch(/licence is missing/)
    expect(say({ author: {} })).toMatch(/author\.name is missing/)
    expect(say({ phases: [] })).toMatch(/phases must list at least one of site, form, program, schematic, present/)
    expect(say({ phases: ['massing'] })).toMatch(/phases must list/)
    expect(say({ runtime: { browser: false, network: [] } })).toMatch(/runtime must be \{ browser: true, network: \[origins\] \}/)
    expect(say({ inputs: ['towers.all'] })).toMatch(/inputs may only list tower\.selected and site\.outline/)
    expect(say({ outputs: ['mesh'] })).toMatch(/outputs may only list geometry\.storeys and parameters/)
    expect(say({ units: { length: 'mm', frame: 'tower-local', up: 'z' } })).toMatch(/units must be \{ length: "m", frame: "tower-local", up: "z" \}/)
    expect(say({ units: { length: 'm', frame: 'world', up: 'z' } })).toMatch(/units must be/)
    expect(say({ limits: 'none' })).toMatch(/limits must be a list/)
    expect(say({ editability: 'parametric' })).toMatch(/editability must be externally-generated or native-parameters/)
    expect(checkDefinition({ ...loose(), limits: [] }).ok).toBe(true)
  })
})

describe('checkProposal', () => {
  it('accepts a replace-geometry proposal that answers the waiting run', () => {
    const r = checkProposal(proposal(), ctx())
    expect(r).toMatchObject({ ok: true, stale: false, problems: [], warnings: [] })
    expect(r.proposal?.operations).toHaveLength(1)
    expect(r.proposal?.parameters).toEqual({ taper: 0.8, twist: 15 })
    expect(r.proposal?.assumptions).toEqual(['Plates are rectangles'])
  })
  it('fills in empty lists and null parameters when the tool sent none', () => {
    const p = proposal(); delete p.assumptions; delete p.warnings; delete p.parameters
    const r = checkProposal(p, ctx())
    expect(r.ok).toBe(true)
    expect(r.proposal).toMatchObject({ assumptions: [], warnings: [], parameters: null })
  })
  it('refuses a non-object, another protocol or another tool', () => {
    expect(checkProposal(null, ctx())).toMatchObject({ ok: false, stale: false })
    expect(problems(proposal({ protocol: 'tdt-sunwind@1' }))).toMatch(/Not a tdt-design-tool@1 proposal/)
    expect(problems(proposal({ type: 'tdt:inputs' }))).toMatch(/Not a tdt-design-tool@1 proposal/)
    expect(problems(proposal({ toolId: 'tool.other' }))).toMatch(/It comes from tool\.other, not tool\.form-studio/)
  })
  it('a different tool version is a warning, not a refusal', () => {
    const r = checkProposal(proposal({ toolVersion: '1.1.0' }), ctx())
    expect(r.ok).toBe(true)
    expect(r.warnings.join(' ')).toMatch(/Made by version 1\.1\.0; 1\.0\.0 is registered/)
  })
  it('ties the answer to this session, this run and this project', () => {
    expect(problems(proposal({ sessionId: 's-2' }))).toMatch(/belongs to another session/)
    expect(problems(proposal({ runId: 'r-0' }))).toMatch(/answers another run \(cancelled or already finished\)/)
    expect(problems(proposal({ projectId: 'city:untitled' }))).toMatch(/made for another project/)
  })
  it('drops a proposal when no run is waiting (cancelled, or it arrived twice)', () => {
    const r = checkProposal(proposal(), ctx({ session: null }))
    expect(r.ok).toBe(false)
    expect(r.stale).toBe(false)
    expect(r.problems.join(' ')).toMatch(/No run is waiting for a proposal/)
  })
  it('never accepts a run id that was already applied', () => {
    expect(problems(proposal(), ctx({ applied: new Set(['r-1']) }))).toMatch(/already applied/)
  })
  it('wants metres in the tower-local frame, z up', () => {
    expect(problems(proposal({ units: { length: 'mm', frame: 'tower-local', up: 'z' } }))).toMatch(/Units must be metres in the tower-local frame, z up/)
    expect(problems(proposal({ units: { length: 'm', frame: 'world', up: 'z' } }))).toMatch(/Units must be metres/)
    expect(problems(proposal({ units: { length: 'm', frame: 'tower-local', up: 'y' } }))).toMatch(/Units must be metres/)
    expect(problems(proposal({ units: undefined }))).toMatch(/got "none"/)
  })
  it('refuses a point that is not two finite numbers, or one a kilometre away', () => {
    const nan = storeys(1); nan[0].loops[0][1] = [Number.NaN, 0]
    expect(problems(withStoreys(nan))).toMatch(/storey 1, loop 1: a point is not two finite numbers/)
    const inf = storeys(1); inf[0].loops[0][2] = [Number.POSITIVE_INFINITY, 5]
    expect(problems(withStoreys(inf))).toMatch(/not two finite numbers/)
    const three = storeys(1); (three[0].loops[0] as unknown[])[0] = [1, 2, 3]
    expect(problems(withStoreys(three))).toMatch(/not two finite numbers/)
    const far = storeys(1); far[0].loops[0][0] = [1200, 0]
    expect(problems(withStoreys(far))).toMatch(/more than 1 km from the tower \(units or frame wrong\?\)/)
  })
  it('needs at least 3 points in a loop and not more than the limit', () => {
    const two = storeys(1); two[0].loops = [[[0, 0], [10, 0]]]
    expect(problems(withStoreys(two))).toMatch(/storey 1, loop 1: a loop needs at least 3 points/)
    const many = storeys(1); many[0].loops = [Array.from({ length: LIMITS.maxLoopPoints + 1 }, (_, i) => [Math.cos(i) * 10, Math.sin(i) * 10] as [number, number])]
    expect(problems(withStoreys(many))).toMatch(/more than 512 points in one loop/)
    const none = storeys(1); none[0].loops = []
    expect(problems(withStoreys(none))).toMatch(/storey 1: no loops/)
  })
  it('refuses a plate larger than 12,000 m²', () => {
    expect(problems(withStoreys(storeys(1, 4, 120, 120)))).toMatch(/plate of 14400 m² is larger than 12000 m²/)
    expect(checkProposal(withStoreys(storeys(1, 4, 100, 100)), ctx()).ok).toBe(true) // 10,000 m²
  })
  it('wants storeys in rising order, each above its base', () => {
    const down = [{ z0: 0, z1: 4, loops: [rect(30, 30)] }, { z0: 2, z1: 6, loops: [rect(30, 30)] }]
    expect(problems(withStoreys(down))).toMatch(/storey 2: storeys must rise in order/)
    const flat = [{ z0: 4, z1: 4, loops: [rect(30, 30)] }]
    expect(problems(withStoreys(flat))).toMatch(/storey 1: z1 must be above z0/)
    const gap = [{ z0: 0, z1: 4, loops: [rect(30, 30)] }, { z0: 4.005, z1: 8, loops: [rect(30, 30)] }]
    expect(checkProposal(withStoreys(gap), ctx()).ok).toBe(true) // 1 cm tolerance
    const bad = [{ z0: 'ground', z1: 4, loops: [rect(30, 30)] }]
    expect(problems(withStoreys(bad))).toMatch(/z0 and z1 must be finite numbers/)
  })
  it('refuses anything above 600 m, and more than 200 storeys', () => {
    const tall = storeys(1); tall[0] = { z0: 596, z1: 601, loops: [rect(30, 30)] }
    expect(problems(withStoreys(tall))).toMatch(/higher than 600 m/)
    expect(problems(withStoreys(storeys(LIMITS.maxStoreys + 1, 2)))).toMatch(/more than 200 storeys/)
    expect(problems(withStoreys([]))).toMatch(/replace-geometry needs storeys/)
  })
  it('marks the proposal stale when it answers an older model, or the model moved since', () => {
    const older = checkProposal(proposal({ baseRevision: 'rev-old' }), ctx())
    expect(older).toMatchObject({ ok: true, stale: true })
    const moved = checkProposal(proposal(), ctx({ currentRevision: 'rev-b' }))
    expect(moved).toMatchObject({ ok: true, stale: true })
    expect(checkProposal(proposal(), ctx()).stale).toBe(false)
  })
  it('warns about plates under 25 m² (they count as voids) and passes the tool’s own warnings on', () => {
    const r = checkProposal(withStoreys([...storeys(2, 4, 4, 4), ...storeys(1, 4, 30, 30).map((s) => ({ ...s, z0: 8, z1: 12 }))]), ctx())
    expect(r.ok).toBe(true)
    expect(r.warnings).toContain('2 storeys under 25 m² will count as voids, not floor area.')
    const one = checkProposal(withStoreys(storeys(1, 4, 4, 4)), ctx())
    expect(one.warnings).toContain('1 storey under 25 m² will count as voids, not floor area.')
    const told = checkProposal(proposal({ warnings: ['Twist above 30° thins the plate'] }), ctx())
    expect(told.ok).toBe(true)
    expect(told.warnings).toContain('Tool: Twist above 30° thins the plate')
  })
  it('checks the operations: known, registered, aimed at an object that was sent', () => {
    expect(problems(proposal({ operations: [] }))).toMatch(/No operations/)
    expect(problems(proposal({ operations: ['x'] }))).toMatch(/operation 1: not an object/)
    expect(problems(proposal({ operations: [{ op: 'delete-geometry', target: 't1' }] }))).toMatch(/"delete-geometry" is not an allowed operation \(replace-geometry, set-parameter\)/)
    expect(problems(proposal({ operations: [{ op: 'set-parameter', target: 't1', field: 'height', value: 200 }] }))).toMatch(/the tool is not registered for set-parameter/)
    expect(problems(proposal({ operations: [{ op: 'replace-geometry', storeys: storeys() }] }))).toMatch(/operation 1: no target/)
    expect(problems(proposal({ operations: [{ op: 'replace-geometry', target: 't2', storeys: storeys() }] }))).toMatch(/target t2 was not among the objects sent to the tool/)
  })
  it('set-parameter: only the settable fields, finite values within 0..600', () => {
    const def: ToolDefinition = { ...definition(), operations: ['replace-geometry', 'set-parameter'] }
    const c = ctx({ def })
    const set = (field: unknown, value: unknown) => proposal({ operations: [{ op: 'set-parameter', target: 't1', field, value }] })
    expect(checkProposal(set('height', 200), c).ok).toBe(true)
    expect(problems(set('coreShare', 0.3), c)).toMatch(/"coreShare" is not a settable field \(width, depth, height, f2f, rotation, podiumHeight, podiumWidth, podiumDepth\)/)
    expect(problems(set('height', 601), c)).toMatch(/value must be a finite number between 0 and 600/)
    expect(problems(set('height', -1), c)).toMatch(/value must be a finite number/)
    expect(problems(set('height', '200'), c)).toMatch(/value must be a finite number/)
  })
  it('assumptions and warnings must be lists; a storey use must be a use id', () => {
    expect(problems(proposal({ assumptions: 'rectangles' }))).toMatch(/assumptions must be a list of sentences/)
    expect(problems(proposal({ warnings: { a: 1 } }))).toMatch(/warnings must be a list of sentences/)
    const used = storeys(1); (used[0] as unknown as Loose).use = 3
    expect(problems(withStoreys(used))).toMatch(/use must be a use id/)
  })
  it('refuses a proposal over the byte limit', () => {
    const big = proposal({ assumptions: ['x'.repeat(LIMITS.maxBytes + 10)] })
    expect(problems(big)).toMatch(/more than 8 MB/)
  })
  it('collects every problem instead of stopping at the first', () => {
    const r = checkProposal(proposal({ sessionId: 'other', units: { length: 'mm', frame: 'world', up: 'y' }, operations: [{ op: 'replace-geometry', target: 't9', storeys: storeys(1, 4, 130, 130) }] }), ctx())
    expect(r.ok).toBe(false)
    expect(r.problems.length).toBeGreaterThanOrEqual(4)
  })
})

describe('ringArea', () => {
  it('is positive counter-clockwise, negative clockwise', () => {
    expect(ringArea(rect(10, 20))).toBe(200)
    expect(ringArea([...rect(10, 20)].reverse())).toBe(-200)
  })
})
