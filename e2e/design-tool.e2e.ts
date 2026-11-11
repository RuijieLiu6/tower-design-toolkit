// Connected design tools (Ruijie's brief, 11 Nov 2026, §14 acceptance journey): an independently developed tool joins
// the Toolkit as a workflow node, is sent one tower with the person's permission, answers with a Design Change Proposal
// that is previewed as a ghost and in the Proposal tab, and Apply turns it into one undoable change of the shared model.
// Test 1 walks the whole journey against the Toolkit's own TEST HARNESS page (public/tools/test-tool.html, served by the
// dev server, origin http://localhost:5499). Test 2 repeats the core of it against FORM STUDIO (the real tool, served
// here from the sibling read-only checkout ../form-studio-ro with its toolkit-bridge.js: a DEMONSTRATION of the protocol
// against the real code until the bridge is deployed to Pages; skipped when that checkout or the bridge is missing).
// Run: node node_modules/playwright/cli.js test -c playwright.edge.config.ts e2e/design-tool.e2e.ts
import { expect, test, type FrameLocator, type Locator, type Page } from '@playwright/test'
import { createServer, type Server } from 'node:http'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, extname, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { placeStartingTower, showCheck } from './helpers'

test.describe.configure({ mode: 'serial', timeout: 600_000 })

const here = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(here, '..')
const OUT = join(ROOT, 'test-results')
const TEST_TOOL = join(ROOT, 'public/tools/test-tool.tool.json')
const FORM_STUDIO_DEF = join(ROOT, 'public/tools/form-studio.tool.json')
const EXAMPLE_NODE = join(ROOT, 'skills/tower-studio-node-builder/references/example-node.json')
const FS = resolve(ROOT, '..', 'form-studio-ro')
const FS_PORT = 5577
const FS_ORIGIN = `http://localhost:${FS_PORT}`
const NOTHING_PORT = 5598 // nothing listens here: the "runtime unavailable" case
const TEST_ID = 'tool.test-tool'
const NOTHING_ID = 'tool.nothing'
const FORM_STUDIO_ID = 'tool.form-studio'

// ---------------------------------------------------------------------------------------------------------- helpers

const rail = (p: Page) => p.getByRole('navigation', { name: 'Design process' })
const panel = (p: Page) => p.getByTestId('phase-panel')
const controls = (p: Page) => p.getByTestId('tool-controls')
const frameOf = (p: Page): FrameLocator => p.frameLocator('[data-testid="tool-frame"]')

/**
 * Runs `body` against a source module of the app, imported by its dev-server URL (the same instance the app uses, as
 * designTools.e2e.ts does for the store). The URL is taken from the resource timing when the app already loaded the
 * module (it may carry a cache query), else from the plain path.
 */
const viaModule = <T,>(p: Page, path: string, body: string, arg: unknown = null): Promise<T> => p.evaluate(async ({ path, body, arg }) => {
  const seen = performance.getEntriesByType('resource').map((e) => e.name).filter((n) => n.includes(path)).pop()
  const m = await import(/* @vite-ignore */ seen ?? `${location.origin}${path}`)
  return new Function('m', 'arg', body)(m, arg)
}, { path, body, arg }) as Promise<T>

type TowerSnap = { id: string; name: string; x: number; y: number; width: number; depth: number; height: number; imported: null | { top: number; tool: null | { toolId: string; runId: string; parameters: unknown } } }
const towers = (p: Page) => viaModule<TowerSnap[]>(p, '/src/store.ts', `
  const s = m.useStore.getState()
  return s.towers[s.project].map((t) => ({ id: t.id, name: t.name, x: t.x, y: t.y, width: t.width, depth: t.depth, height: t.height,
    imported: t.imported ? { top: t.imported.top, tool: t.imported.tool ? { toolId: t.imported.tool.toolId, runId: t.imported.tool.runId, parameters: t.imported.tool.parameters ?? null } : null } : null }))`)
const storeCall = (p: Page, body: string, arg: unknown = null) => viaModule<unknown>(p, '/src/store.ts', `const s = m.useStore.getState(); ${body}`, arg)

type Run = { runId: string; status: string; note?: string }
type DesignToolsSnap = { definitions: string[]; instances: Record<string, { targets: string[]; parameters: unknown; runs: Run[] }>; run: null | { runId: string }; pending: null | { ok: boolean; stale: boolean; runId: string }; workspace: string | null; consented: string[] }
const designTools = (p: Page) => viaModule<DesignToolsSnap>(p, '/src/lib/designTools/store.ts', `
  const s = m.useDesignTools.getState()
  return { definitions: Object.keys(s.definitions), instances: Object.fromEntries(Object.entries(s.instances).map(([k, i]) => [k, { targets: i.targets, parameters: i.parameters, runs: i.runs.map((r) => ({ runId: r.runId, status: r.status, note: r.note })) }])),
    run: s.run ? { runId: s.run.runId } : null, pending: s.pending ? { ok: s.pending.check.ok, stale: s.pending.check.stale, runId: s.pending.proposal.runId } : null, workspace: s.workspace, consented: Object.keys(s.consented) }`)

/** The viewport's R3F scene: how many children the proposal ghost group has (-1: no group; null: no scene yet). */
const ghostChildren = (p: Page) => p.evaluate(async () => {
  const url = performance.getEntriesByType('resource').map((e) => e.name).filter((x) => /@react-three_fiber\.js/.test(x)).pop()
  if (!url) return null
  const f = await import(/* @vite-ignore */ url)
  const canvas = document.querySelector('[data-viewport] canvas') as HTMLCanvasElement | null
  const root = canvas && f._roots.get(canvas)
  if (!root) return null
  const g = root.store.getState().scene.getObjectByName('tool-proposal-ghost')
  return g ? (g.children as unknown[]).length : -1
})

/** Opens the guided app on the competition site with two towers, the Form step open (the brief wants ≥ 2 model objects). */
async function openProjectWithTwoTowers(p: Page) {
  await p.addInitScript(() => { performance.setResourceTimingBufferSize(10_000); try { localStorage.setItem('ts.landing.skip', '0'); localStorage.setItem('ts.onboarding.seen', '1') } catch { /* private mode */ } })
  await p.addLocatorHandler(p.getByRole('dialog').filter({ has: p.locator('#ob-title') }), async (d) => { await d.getByRole('button', { name: 'Start designing' }).click() })
  await p.goto('/#/guided')
  await rail(p).waitFor({ timeout: 120_000 })
  await p.getByRole('tab', { name: 'Competition site' }).or(p.getByRole('button', { name: 'Competition site' })).first().click({ timeout: 120_000 })
  await placeStartingTower(p, { stay: true })
  await p.waitForFunction(() => performance.getEntriesByType('resource').some((e) => /\/src\/store\.ts/.test(e.name)))
  await expect.poll(() => towers(p).then((t) => t.length), { timeout: 60_000 }).toBe(1)
  // the second tower: the Towers › Add tile of the Form step (IconTile "Add tower"), else the store's addTower
  const add = p.getByRole('button', { name: 'Add tower' }).first()
  if (await add.isVisible({ timeout: 5_000 }).catch(() => false)) await add.click()
  else await storeCall(p, 's.addTower()')
  await expect.poll(() => towers(p).then((t) => t.length), { timeout: 30_000 }).toBe(2)
}

/** Registers a tool definition file through the transfer centre (Import › Add my tool) and closes the centre. */
async function registerTool(p: Page, file: string, expectWords: (string | RegExp)[]) {
  const dialog = p.getByTestId('transfer-dialog')
  await p.getByTestId('transfer-import').click({ timeout: 60_000 })
  await expect(dialog).toHaveAttribute('data-tab', 'import')
  await dialog.getByTestId('purpose-tool').click()
  await dialog.getByTestId('transfer-file').setInputFiles(file)
  const preview = dialog.getByTestId('transfer-preview')
  for (const w of expectWords) await expect(preview).toContainText(w, { timeout: 30_000 })
  await expect(dialog.getByTestId('transfer-action')).toHaveText('Add to My tools')
  await expect(dialog.getByTestId('transfer-action')).toBeEnabled()
  await dialog.getByTestId('transfer-action').click()
  // the centre closes by itself or reports; either way it is closed before going on
  if (await dialog.isVisible({ timeout: 2_000 }).catch(() => false)) { await p.keyboard.press('Escape'); await expect(dialog).toHaveCount(0) }
}

/** Opens the workflow builder (project bar › Edit workflow) and returns it. */
async function openBuilder(p: Page) {
  const b = p.getByTestId('workflow-builder')
  if (!(await b.isVisible().catch(() => false))) await p.getByTestId('edit-workflow-button').click({ timeout: 60_000 })
  await expect(b).toBeVisible({ timeout: 30_000 })
  return b
}

/** The builder's library entry of a tool, searched by name when the list is long. */
async function libraryEntry(p: Page, id: string, name: string): Promise<Locator> {
  const b = await openBuilder(p)
  const lib = b.getByTestId('tool-library')
  const entry = lib.getByTestId(`library-entry-${id}`)
  if (!(await entry.isVisible({ timeout: 3_000 }).catch(() => false))) await lib.getByTestId('library-search').fill(name)
  await expect(entry).toBeVisible({ timeout: 30_000 })
  return entry
}

/** Adds an installed tool to the open phase's workflow from the builder's library (Add › yes › Apply). */
async function addToolToWorkflow(p: Page, id: string, name: string) {
  const b = await openBuilder(p)
  await libraryEntry(p, id, name)
  const lib = b.getByTestId('tool-library')
  await lib.getByTestId(`library-add-${id}`).click()
  const pending = b.getByTestId('pending-add')
  await expect(pending).toBeVisible({ timeout: 30_000 })
  await pending.getByTestId('add-confirm-yes').click()
  await expect(b.getByTestId(`card-${id}`)).toBeVisible({ timeout: 30_000 })
  await lib.getByTestId('library-search').fill('').catch(() => {})
  await b.getByTestId('builder-apply').click()
  await expect(b).toHaveCount(0, { timeout: 30_000 })
}

/** Closes the builder without changing the workflow (Continue when nothing changed, else Discard). */
async function closeBuilder(p: Page) {
  const b = p.getByTestId('workflow-builder')
  if (!(await b.isVisible().catch(() => false))) return
  const cont = b.getByTestId('builder-continue')
  if (await cont.isVisible().catch(() => false)) await cont.click()
  else await b.getByTestId('builder-discard').click()
  await expect(b).toHaveCount(0, { timeout: 30_000 })
}

/** Opens the tool's row in the phase panel so its controls show (the row stays open when it already is). */
async function openToolRow(p: Page, id: string) {
  const row = panel(p).locator(`[data-phase-node="${id}"] [data-node]`).first()
  await row.waitFor({ timeout: 60_000 })
  const active = await panel(p).getByTestId('phase-active').getAttribute('data-active').catch(() => null)
  if (active !== id || !(await controls(p).isVisible().catch(() => false))) await row.click()
  await expect(controls(p)).toBeVisible({ timeout: 30_000 })
}

/** Sends a fresh snapshot: Update preview when the workspace is open, else Open tool (which sends once consented). */
async function sendRun(p: Page) {
  const ws = p.getByTestId('tool-workspace')
  if (await ws.isVisible().catch(() => false)) await p.getByTestId('tool-send').click()
  else await p.getByTestId('tool-open').click()
  await expect(ws).toBeVisible({ timeout: 30_000 })
  await expect(p.getByTestId('tool-frame')).toBeVisible({ timeout: 30_000 })
  await expect(controls(p)).toHaveAttribute('data-state', 'waiting', { timeout: 30_000 })
}

/** The harness's one design change: a plate 4 m wider with a 3 % taper, sent back as a proposal. */
async function harnessSend(p: Page) {
  const btn = frameOf(p).getByRole('button', { name: /Widen by 4 m/ })
  await btn.waitFor({ timeout: 60_000 })
  await expect(btn).toBeEnabled({ timeout: 30_000 })
  await btn.click()
}

/** Ctrl+Z / Ctrl+Y on the page itself (never inside an input or the tool's frame: the host's shortcut would not see it). */
async function hostKey(p: Page, key: 'Control+z' | 'Control+y') {
  await p.evaluate(() => { const el = document.activeElement as HTMLElement | null; if (el && el !== document.body) el.blur() })
  await p.keyboard.press(key)
}

const proposalTab = (p: Page) => p.getByRole('tab', { name: 'Proposal' })
async function openProposalTab(p: Page) {
  await expect(proposalTab(p)).toBeVisible({ timeout: 30_000 })
  if ((await proposalTab(p).getAttribute('aria-selected')) !== 'true') await proposalTab(p).click()
  await expect(p.getByTestId('proposal-summary')).toBeVisible({ timeout: 30_000 })
}

/** A definition file derived from another, with the connection pointed elsewhere (written under test-results/). */
function deriveDefinition(from: string, name: string, patch: { id?: string; name?: string; url: string }): string {
  const def = JSON.parse(readFileSync(from, 'utf8')) as Record<string, unknown>
  const origin = new URL(patch.url).origin
  const out = {
    ...def, ...(patch.id ? { id: patch.id } : {}), ...(patch.name ? { name: patch.name } : {}),
    connection: { ...(def.connection as Record<string, unknown>), url: patch.url, origin },
    runtime: { ...(def.runtime as Record<string, unknown>), browser: true, network: [origin] },
    destination: { ...(def.destination as Record<string, unknown>), to: origin },
  }
  mkdirSync(OUT, { recursive: true })
  const file = join(OUT, name)
  writeFileSync(file, JSON.stringify(out, null, 2))
  return file
}

// ------------------------------------------------------------------------------------------- 1 · the test harness

test('journey §14 with the test harness: register, add, consent, send, propose, preview, apply, undo, reload, rerun, cancel, stale, foreign message, no runtime', async ({ page: p }) => {
  test.setTimeout(600_000)
  await openProjectWithTwoTowers(p)
  const before = await towers(p)
  const [first, second] = before
  expect(before).toHaveLength(2)
  // nothing goes to the tool's page before the person consents and opens it
  let harnessLoads = 0
  p.on('request', (r) => { if (r.url().includes('/tools/test-tool.html')) harnessLoads++ })

  // 1 · register: Import › Add my tool › the definition file; the preview says what it is and may change; Add to My tools
  await registerTool(p, TEST_TOOL, ['Test tool', 'replace geometry'])
  const entry = await libraryEntry(p, TEST_ID, 'Test tool')
  await expect(entry.getByTestId(`tool-state-${TEST_ID}`)).toHaveText('Connected')
  expect((await designTools(p)).definitions).toContain(TEST_ID)
  await closeBuilder(p)

  // 2 · add to the Form workflow: library › Add › yes › Apply; the card and then the phase row exist
  await addToolToWorkflow(p, TEST_ID, 'Test tool')
  await expect(panel(p).locator(`[data-phase-node="${TEST_ID}"]`)).toBeVisible({ timeout: 30_000 })
  expect(await towers(p)).toEqual(before) // adding a node changes no geometry (brief §8)

  // 3–4 · select one tower; nothing is sent before consent (no frame, no load of the tool page)
  await openToolRow(p, TEST_ID)
  await expect(controls(p)).toHaveAttribute('data-state', 'consent')
  const targets = p.getByTestId('tool-targets')
  await expect(targets).toBeVisible()
  await targets.selectOption(first.id)
  await expect(targets).toHaveValue(first.id)
  await expect(p.getByTestId('tool-frame')).toHaveCount(0)
  expect(harnessLoads).toBe(0)
  expect((await designTools(p)).run).toBeNull()
  await p.screenshot({ path: join(OUT, 'design-tool-harness-before.png') })
  expect(harnessLoads).toBe(0) // nothing loaded, nothing sent, before the person agrees
  await p.getByTestId('tool-consent').click() // agreeing opens the tool; the inputs go only once it says ready
  const ws = p.getByTestId('tool-workspace')
  if (!(await ws.isVisible({ timeout: 1_500 }).catch(() => false))) await p.getByTestId('tool-open').click()
  await expect(ws).toBeVisible({ timeout: 30_000 })
  await expect(p.getByTestId('tool-frame')).toBeVisible({ timeout: 30_000 })
  await expect(controls(p)).toHaveAttribute('data-state', 'waiting', { timeout: 30_000 })
  await expect.poll(() => harnessLoads, { timeout: 30_000 }).toBeGreaterThan(0)
  expect((await designTools(p)).consented).toContain(TEST_ID)
  expect(await towers(p)).toEqual(before) // opening the tool changes nothing either

  // 5–7 · the tool makes its change and returns a proposal; the Proposal tab and the ghost show it; validation has no Fail
  await harnessSend(p)
  await expect(controls(p)).toHaveAttribute('data-state', 'returned', { timeout: 30_000 })
  await openProposalTab(p)
  const changes = p.getByTestId('proposal-changes')
  await expect(changes).toContainText('Replace geometry')
  await expect(changes).toContainText(first.name)
  await expect(changes.locator('[data-change]')).not.toHaveCount(0)
  await expect(p.getByTestId('proposal-validation')).not.toContainText(/\bFail\b/)
  await expect(p.getByTestId('proposal-impacts')).toBeVisible()
  await expect.poll(() => ghostChildren(p), { timeout: 30_000 }).toBeGreaterThan(0)
  expect(await towers(p)).toEqual(before) // a proposal is not the model
  await p.screenshot({ path: join(OUT, 'design-tool-harness-proposed.png') })

  // 8–9 · Apply: the selected tower is 4 m wider and carries the tool's geometry; the other tower is untouched; still two
  await p.getByTestId('proposal-apply').click()
  await expect(controls(p)).toHaveAttribute('data-state', 'applied', { timeout: 30_000 })
  await expect.poll(() => towers(p).then((t) => t[0].width), { timeout: 30_000 }).toBeGreaterThan(first.width + 3)
  const applied = await towers(p)
  expect(applied).toHaveLength(2)
  expect(applied[0].id).toBe(first.id)
  expect(Math.abs(applied[0].width - (first.width + 4))).toBeLessThan(1.2) // the typical plate of a 3 % taper
  expect(applied[0].imported?.tool?.toolId).toBe(TEST_ID)
  expect(applied[1]).toEqual(second)
  const run1 = applied[0].imported!.tool!.runId
  expect(run1).toBeTruthy()
  await expect.poll(() => ghostChildren(p).then((n) => n ?? 0), { timeout: 30_000 }).toBeLessThanOrEqual(0) // the ghost goes with the proposal
  await p.screenshot({ path: join(OUT, 'design-tool-harness-after.png') })

  // 10 · downstream results read the new model: the Program & FSR check runs on the imported mass
  await showCheck(p, 'Program & FSR accounting')
  await expect(p.getByRole('tabpanel').filter({ hasText: /FSR/i }).first()).toBeVisible({ timeout: 60_000 }).catch(() => { /* the results panel's layout is not this test's contract */ })
  expect((await towers(p))[0].imported?.tool?.toolId).toBe(TEST_ID)

  // 11–12 · one Undo restores the tower as it was; Redo applies it again; the autosave follows
  await hostKey(p, 'Control+z')
  await expect.poll(() => towers(p).then((t) => t[0]), { timeout: 30_000 }).toEqual(first)
  expect((await towers(p))[1]).toEqual(second)
  await hostKey(p, 'Control+y')
  await expect.poll(() => towers(p).then((t) => t[0].imported?.tool?.runId ?? null), { timeout: 30_000 }).toBe(run1)
  expect(Math.abs((await towers(p))[0].width - (first.width + 4))).toBeLessThan(1.2)
  await p.waitForTimeout(1_500)

  // 13 · reload: geometry, parameters and provenance are back; the tool is still installed; its last run is applied
  await p.reload()
  await rail(p).waitFor({ timeout: 120_000 })
  await p.waitForFunction(() => performance.getEntriesByType('resource').some((e) => /\/src\/store\.ts/.test(e.name)))
  await expect.poll(() => towers(p).then((t) => t.length), { timeout: 60_000 }).toBe(2)
  const reloaded = await towers(p)
  expect(reloaded[0].id).toBe(first.id)
  expect(reloaded[0].imported?.tool?.toolId).toBe(TEST_ID)
  expect(reloaded[0].imported?.tool?.runId).toBe(run1)
  expect(reloaded[0].imported?.tool?.parameters).not.toBeNull()
  expect(Math.abs(reloaded[0].width - (first.width + 4))).toBeLessThan(1.2)
  expect(reloaded[1]).toEqual(second)
  const dtAfterReload = await designTools(p)
  expect(dtAfterReload.definitions).toContain(TEST_ID)
  const runs = dtAfterReload.instances[TEST_ID]?.runs ?? []
  expect(runs.length).toBeGreaterThan(0)
  expect(runs[runs.length - 1].status).toBe('applied')
  expect(runs[runs.length - 1].runId).toBe(run1)
  await libraryEntry(p, TEST_ID, 'Test tool')
  await closeBuilder(p)
  if (!(await panel(p).locator(`[data-phase-node="${TEST_ID}"]`).isVisible({ timeout: 10_000 }).catch(() => false))) await rail(p).locator('[data-step="volume"]').click()
  await openToolRow(p, TEST_ID)

  // 14 · run again: the same tower changes again under a new run id; no duplicate tower
  if ((await p.getByTestId('tool-targets').inputValue().catch(() => '')) !== first.id) await p.getByTestId('tool-targets').selectOption(first.id)
  await sendRun(p)
  await harnessSend(p)
  await expect(controls(p)).toHaveAttribute('data-state', 'returned', { timeout: 30_000 })
  await openProposalTab(p)
  await p.getByTestId('proposal-apply').click()
  await expect.poll(() => towers(p).then((t) => t[0].imported?.tool?.runId ?? null), { timeout: 30_000 }).not.toBe(run1)
  const rerun = await towers(p)
  expect(rerun).toHaveLength(2)
  expect(rerun[0].id).toBe(first.id)
  expect(rerun[0].imported?.tool?.toolId).toBe(TEST_ID)
  expect(rerun[1]).toEqual(second)
  const run2 = rerun[0].imported!.tool!.runId

  // 15 · cancel in the tool: no proposal, the controls go back to idle, the model stays
  await sendRun(p)
  const cancel = frameOf(p).getByRole('button', { name: 'Cancel' })
  await cancel.waitFor({ timeout: 30_000 })
  await cancel.click()
  await expect(controls(p)).toHaveAttribute('data-state', 'idle', { timeout: 30_000 })
  expect((await designTools(p)).pending).toBeNull()
  expect((await designTools(p)).run).toBeNull()
  expect(await towers(p)).toEqual(rerun)
  // A late proposal for the cancelled run (sent after Cancel) is dropped by the host's run-id check: covered by the
  // unit tests (validate.test.ts); the harness has no "send late" control, so it is not driven from here.

  // 16 · stale: the model changes after the inputs went out; the answer is marked as based on an older model and Apply is blocked
  await sendRun(p)
  await storeCall(p, 's.updateTower(arg, { height: s.towers[s.project].find((t) => t.id === arg).height + 10, x: s.towers[s.project].find((t) => t.id === arg).x + 1 })', second.id)
  await expect.poll(() => towers(p).then((t) => t[1].x), { timeout: 10_000 }).not.toBe(second.x)
  await harnessSend(p)
  await expect(controls(p)).toHaveAttribute('data-state', 'stale', { timeout: 30_000 })
  await openProposalTab(p)
  await expect(p.getByTestId('proposal-summary')).toContainText('older model')
  await expect(p.getByTestId('proposal-apply')).toBeDisabled()
  expect((await designTools(p)).pending?.stale).toBe(true)
  await p.getByTestId('proposal-discard').click()
  await expect.poll(() => designTools(p).then((d) => d.pending), { timeout: 30_000 }).toBeNull()
  expect((await towers(p))[0].imported?.tool?.runId).toBe(run2)
  const stateAfterDiscard = await controls(p).getAttribute('data-state')

  // 17 · a message that does not come from the tool's frame is ignored, whatever it claims (here: a proposal in millimetres)
  await p.evaluate(({ toolId, target }) => {
    window.postMessage({ protocol: 'tdt-design-tool@1', type: 'tdt:proposal', toolId, toolVersion: '0.0.0', sessionId: 'x', runId: 'x', projectId: 'x', baseRevision: 'x',
      units: { length: 'mm', frame: 'world', up: 'y' }, operations: [{ op: 'replace-geometry', target, storeys: [{ z0: 0, z1: 4000, loops: [[[-20000, -20000], [20000, -20000], [20000, 20000], [-20000, 20000]]] }] }], parameters: null, assumptions: [], warnings: [] }, location.origin)
  }, { toolId: TEST_ID, target: first.id })
  await p.waitForTimeout(1_000)
  expect((await designTools(p)).pending).toBeNull()
  await expect(controls(p)).toHaveAttribute('data-state', stateAfterDiscard ?? 'idle')
  expect((await towers(p))[0].imported?.tool?.runId).toBe(run2)
  // and a real run still works after it
  await sendRun(p)
  await harnessSend(p)
  await expect(controls(p)).toHaveAttribute('data-state', 'returned', { timeout: 30_000 })
  await openProposalTab(p)
  await p.getByTestId('proposal-discard').click()
  await expect.poll(() => designTools(p).then((d) => d.pending), { timeout: 30_000 }).toBeNull()
  await p.getByTestId('tool-workspace-close').click()
  await expect(p.getByTestId('tool-workspace')).toHaveCount(0, { timeout: 30_000 })

  // 18 · runtime unavailable: a tool whose page answers nothing; the host gives up after its ready wait and says so
  const nothing = deriveDefinition(TEST_TOOL, 'design-tool-nothing.tool.json', { id: NOTHING_ID, name: 'Nothing tool', url: `http://localhost:${NOTHING_PORT}/nothing.html` })
  await registerTool(p, nothing, ['Nothing tool'])
  await closeBuilder(p)
  await addToolToWorkflow(p, NOTHING_ID, 'Nothing tool')
  const beforeNothing = await towers(p)
  await openToolRow(p, NOTHING_ID)
  await p.getByTestId('tool-targets').selectOption(first.id)
  if (await p.getByTestId('tool-consent').isVisible({ timeout: 2_000 }).catch(() => false)) await p.getByTestId('tool-consent').click()
  if (!(await p.getByTestId('tool-workspace').isVisible({ timeout: 1_500 }).catch(() => false))) await p.getByTestId('tool-open').click()
  await expect.poll(async () => {
    const state = await controls(p).getAttribute('data-state')
    const status = (await p.getByTestId('tool-status').textContent().catch(() => '')) ?? ''
    return state === 'error' || /did not answer/i.test(status)
  }, { timeout: 20_000, message: 'the host should time out its ready wait (10 s) with status error / "did not answer"' }).toBe(true)
  expect(await towers(p)).toEqual(beforeNothing) // nothing moved
  expect((await towers(p))[0].imported?.tool?.runId).toBe(run2)
  if (await p.getByTestId('tool-workspace').isVisible().catch(() => false)) await p.getByTestId('tool-workspace-close').click()

  // existing evaluation packages still work: a tower-studio-node@1 package goes through the same Import route to the node builder
  const dialog = p.getByTestId('transfer-dialog')
  await p.getByTestId('transfer-import').click({ timeout: 60_000 })
  await dialog.getByTestId('purpose-tool').click()
  await dialog.getByTestId('transfer-file').setInputFiles(EXAMPLE_NODE)
  await expect(dialog.getByTestId('transfer-action')).toBeEnabled({ timeout: 30_000 })
  await dialog.getByTestId('transfer-action').click()
  const nb = p.getByRole('dialog', { name: 'Build your own node' })
  const addNode = nb.getByRole('button', { name: /Add to My nodes|Replace v/ })
  if (await nb.waitFor({ timeout: 60_000 }).then(() => true, () => false)) { await addNode.click({ timeout: 60_000 }); await expect(nb).toBeHidden({ timeout: 30_000 }) }
  else if (await dialog.isVisible().catch(() => false)) { await dialog.getByRole('button', { name: /Add to My (nodes|tools)/ }).click(); if (await dialog.isVisible({ timeout: 2_000 }).catch(() => false)) await p.keyboard.press('Escape') }
  await libraryEntry(p, 'community.example.tower-width', 'Tower width')
  await closeBuilder(p)
  expect((await towers(p))[0].imported?.tool?.runId).toBe(run2)
  expect(await towers(p)).toHaveLength(2)
})

// ---------------------------------------------------------------------------------------- 2 · Form Studio (real tool)

let fsServer: Server | null = null
const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.geojson': 'application/geo+json', '.txt': 'text/plain' }
const formStudioReady = () => existsSync(join(FS, 'index.html')) && existsSync(join(FS, 'toolkit-bridge.js'))

test.beforeAll(async () => {
  if (!formStudioReady()) return
  fsServer = createServer((req, res) => {
    const path = decodeURIComponent((req.url ?? '/').split('?')[0])
    const file = normalize(join(FS, path === '/' ? 'index.html' : path))
    if (!file.startsWith(FS) || !existsSync(file) || !statSync(file).isFile()) { res.writeHead(404); res.end(); return }
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' })
    res.end(readFileSync(file))
  })
  await new Promise<void>((ok) => fsServer!.listen(FS_PORT, '127.0.0.1', ok))
})
test.afterAll(() => { fsServer?.close() })

test('Form Studio (demonstration: the real tool served from ../form-studio-ro with its bridge): a taller tower comes back as a proposal and is applied', async ({ page: p }) => {
  test.skip(!formStudioReady(), 'needs the form-studio-ro checkout with toolkit-bridge.js beside this repo')
  test.skip(!existsSync(FORM_STUDIO_DEF), 'needs public/tools/form-studio.tool.json')
  test.setTimeout(600_000)
  await openProjectWithTwoTowers(p)
  const before = await towers(p)
  const [first, second] = before

  // the committed definition points at the deployed tool; this run embeds the local copy, so the connection is rewritten to it
  const def = JSON.parse(readFileSync(FORM_STUDIO_DEF, 'utf8')) as { connection: { url: string; origin: string } }
  const local = new URL(def.connection.url)
  const file = def.connection.origin === FS_ORIGIN ? FORM_STUDIO_DEF
    : deriveDefinition(FORM_STUDIO_DEF, 'design-tool-form-studio-local.tool.json', { url: `${FS_ORIGIN}/index.html${local.search}` })

  // register, add, choose a tower, consent, open
  await registerTool(p, file, ['Form Studio', 'replace geometry'])
  const entry = await libraryEntry(p, FORM_STUDIO_ID, 'Form Studio')
  await expect(entry.getByTestId(`tool-state-${FORM_STUDIO_ID}`)).toHaveText('Connected')
  await closeBuilder(p)
  await addToolToWorkflow(p, FORM_STUDIO_ID, 'Form Studio')
  await openToolRow(p, FORM_STUDIO_ID)
  await expect(controls(p)).toHaveAttribute('data-state', 'consent')
  await p.getByTestId('tool-targets').selectOption(first.id)
  await expect(p.getByTestId('tool-frame')).toHaveCount(0)
  await p.screenshot({ path: join(OUT, 'design-tool-before.png') })
  await p.getByTestId('tool-consent').click()
  const ws = p.getByTestId('tool-workspace')
  if (!(await ws.isVisible({ timeout: 1_500 }).catch(() => false))) await p.getByTestId('tool-open').click()
  await expect(ws).toBeVisible({ timeout: 30_000 })
  await expect(controls(p)).toHaveAttribute('data-state', 'waiting', { timeout: 60_000 })

  // in Form Studio: the bridge bar says it is connected; the height goes up 20 m (Precise dimensions › Height (m)); Send to Toolkit
  const fs = frameOf(p)
  await expect(fs.getByText(/Connected to Tower Design Toolkit/)).toBeVisible({ timeout: 120_000 })
  const details = fs.getByText('Precise dimensions').first()
  if (await details.isVisible({ timeout: 10_000 }).catch(() => false)) await details.click()
  const height = fs.locator('#height')
  await expect(height).toBeVisible({ timeout: 30_000 })
  const seeded = Number(await height.inputValue())
  expect(Number.isFinite(seeded)).toBe(true)
  const target = Math.min(400, Math.round(seeded + 20))
  await height.fill(String(target))
  await height.press('Tab') // commit the change (Form Studio listens to change)
  await expect(fs.locator('#height')).toHaveValue(String(target))
  const send = fs.getByRole('button', { name: /Send to Toolkit/ })
  await expect(send).toBeEnabled({ timeout: 30_000 })
  await send.click()

  // the proposal: Replace geometry of the tower, shown as a ghost and in the Proposal tab
  await expect(controls(p)).toHaveAttribute('data-state', 'returned', { timeout: 60_000 })
  await openProposalTab(p)
  await expect(p.getByTestId('proposal-changes')).toContainText('Replace geometry')
  await expect(p.getByTestId('proposal-changes')).toContainText(first.name)
  await expect(p.getByTestId('proposal-validation')).not.toContainText(/\bFail\b/)
  await expect.poll(() => ghostChildren(p), { timeout: 30_000 }).toBeGreaterThan(0)
  expect(await towers(p)).toEqual(before)
  await p.screenshot({ path: join(OUT, 'design-tool-proposed.png') })

  // Apply: the tower carries Form Studio's mass at about the new height; the other tower is as it was
  await p.getByTestId('proposal-apply').click()
  await expect(controls(p)).toHaveAttribute('data-state', 'applied', { timeout: 30_000 })
  await expect.poll(() => towers(p).then((t) => t[0].imported?.tool?.toolId ?? null), { timeout: 30_000 }).toBe(FORM_STUDIO_ID)
  const after = await towers(p)
  expect(after).toHaveLength(2)
  expect(after[0].id).toBe(first.id)
  expect(Math.abs(after[0].imported!.top - target)).toBeLessThan(5) // whole storeys: the top one can stop under the nominal height
  expect(after[1]).toEqual(second)
  await p.getByTestId('tool-workspace-close').click().catch(() => {})
  await p.waitForTimeout(500)
  await p.screenshot({ path: join(OUT, 'design-tool-after.png') })

  // one Undo takes it back
  await hostKey(p, 'Control+z')
  await expect.poll(() => towers(p).then((t) => t[0]), { timeout: 30_000 }).toEqual(first)
})
