// The functional gate of the overnight brief (8 Nov), on the competition site, entered through a landing preset:
// F01 a real massing change updates the affected results, and selecting or reordering tools changes no result;
// F02 each result names the model revision it evaluated, missing evaluation is explicit, old results never pass as new;
// F03 reorder + Undo, a return path, Program and back keep the workflow, the open tool, parameters, model and camera,
//     and a return path starts no repeated execution;
// F04 save and reload; a phase package round trip with unknown tools and missing cross-phase references named, and the
//     other phases' configuration kept;
// F05 a use-only band edit keeps GFA and FSR, moves the value, and Undo restores it.
import { expect, test, type Page } from '@playwright/test'
import { readFileSync, writeFileSync } from 'node:fs'
import { placeStartingTower, openDesignTool } from './helpers'

const rail = (p: Page) => p.getByRole('navigation', { name: 'Design process' })
const panel = (p: Page) => p.getByTestId('phase-panel')
const rows = (p: Page) => panel(p).locator('[data-phase-node]').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.phaseNode))
const row = (p: Page, id: string) => panel(p).locator(`[data-phase-node="${id}"] [data-node]`)
const pick = (re: RegExp) => performance.getEntriesByType('resource').map((e) => e.name).filter((n) => re.test(n)).pop()!

/** The live state, read from the app's own modules (dev server). */
async function live(p: Page) {
  return p.evaluate(async (src) => {
    const pick = new Function(`return (${src})`)() as (re: RegExp) => string
    const { useStore } = await import(/* @vite-ignore */ pick(/\/src\/store\.ts/))
    const { useTrace } = await import(/* @vite-ignore */ pick(/\/src\/lib\/trace\/trace\.ts/))
    const s = useStore.getState(), t = s.towers[s.project][0]
    const d = useTrace.getState().live?.digest ?? null
    let solar: string | null = null
    try { const m = await import(/* @vite-ignore */ pick(/\/src\/hooks\/useSolarAccess\.ts/)); solar = m.useSolar.getState().status } catch { /* not loaded */ }
    let camera: number[] | null = null
    try {
      const f = await import(/* @vite-ignore */ pick(/@react-three_fiber/))
      const canvas = document.querySelector('[data-viewport] canvas') as HTMLCanvasElement
      camera = f._roots.get(canvas).store.getState().camera.position.toArray().map((v: number) => Math.round(v * 100) / 100)
    } catch { /* no canvas */ }
    return {
      height: t?.height ?? null, bands: t ? t.bands.map((b: { use: string; share: number }) => `${b.use}:${b.share}`) : [],
      digest: d ? JSON.stringify({ lines: d.lines.map((l: { id: string; value: string; state: string }) => [l.id, l.value, l.state]), metrics: d.metrics }) : null,
      metrics: d?.metrics ?? {}, solar, camera, analysis: s.analysis, fsrTier: s.fsrTier,
    }
  }, pick.toString())
}
const freshness = (p: Page) => p.getByTestId('result-freshness')
const undoDesign = (p: Page) => p.locator('header').getByRole('button', { name: 'Undo', exact: true }).click()

test('F01–F05: Form and Program journeys, freshness, persistence and a phase-package round trip', async ({ page: p }) => {
  test.setTimeout(480_000)
  await p.addInitScript(() => { try { localStorage.setItem('ts.onboarding.seen', '1'); localStorage.setItem('ts.landing.skip', '0') } catch { /* */ } })
  await p.goto('/#/start')
  await p.getByTestId('cover-enter').click({ timeout: 120_000 }) // the landing preset
  await rail(p).waitFor({ timeout: 120_000 })
  await p.getByRole('tab', { name: 'Competition site' }).click()
  await placeStartingTower(p, { stay: true })
  await expect(panel(p)).toHaveAttribute('data-phase', 'form')
  await expect.poll(async () => (await live(p)).digest, { timeout: 60_000 }).not.toBeNull()

  // ---- F01: selecting and reordering tools changes no result
  const s0 = await live(p)
  await row(p, 'built.sun').click()
  await row(p, 'built.wind-screen').click()
  await p.getByTestId('phase-edit').click() // the workflow editor, in the centre view (9 Nov)
  const ed = p.getByTestId('workflow-overview')
  await ed.locator('[data-dock-node="built.wind-screen"]').click()
  await ed.getByTestId('dock-node-actions').getByRole('button', { name: 'Move before' }).click()
  await ed.getByRole('button', { name: 'Undo the last workflow change' }).click()
  await ed.getByTestId('overview-close').click()
  await expect(ed).toHaveCount(0)
  await p.waitForTimeout(1200)
  expect((await live(p)).digest).toBe(s0.digest)
  // a real massing parameter: the tower's height. The model changes and the affected results follow; Undo puts it back.
  await row(p, 'design.massing').click()
  await openDesignTool(p, 'massing')
  const heightField = p.getByLabel('Height (architectural top) value')
  await heightField.fill(String((s0.height ?? 285) - 30))
  await heightField.press('Tab')
  await expect.poll(async () => (await live(p)).height).toBe((s0.height ?? 285) - 30)
  await expect.poll(async () => (await live(p)).digest).not.toBe(s0.digest)
  const s1 = await live(p)
  const moved = Object.keys(s1.metrics).filter((k) => s1.metrics[k] !== s0.metrics[k])
  expect(moved.length).toBeGreaterThan(0)
  await undoDesign(p)
  await expect.poll(async () => (await live(p)).height).toBe(s0.height)
  await expect.poll(async () => (await live(p)).digest).toBe(s0.digest)

  // ---- F02: each result names the model revision it evaluated; missing evaluation stays explicit
  await row(p, 'built.sun').click()
  await expect(freshness(p)).toContainText(/Evaluated for the current model \(revision [0-9a-f]{8}\)/)
  const rev0 = (await freshness(p).textContent())!.match(/[0-9a-f]{8}/)![0]
  await row(p, 'built.wind-screen').click()
  await expect(freshness(p)).toContainText(rev0)
  await p.getByTestId('phase-add').click()
  await p.getByTestId('phase-add-list').locator('[data-add="built.solar-access"]').click()
  await p.getByTestId('phase-add-list').getByTestId('add-confirm-yes').click()
  await expect(freshness(p)).toContainText(/Evaluat/, { timeout: 60_000 })
  await expect(freshness(p)).toContainText(/Evaluated for the current model/, { timeout: 120_000 })
  // the model changes: the sun-hours result is marked as being re-evaluated (or out of date), never silently current
  await row(p, 'design.massing').click()
  await openDesignTool(p, 'massing')
  await heightField.fill(String((s0.height ?? 285) - 30))
  await heightField.press('Tab')
  await row(p, 'built.solar-access').click()
  const seen = (await freshness(p).textContent())!
  // whatever the moment, the old result is never presented as the current model's: it is named out of date
  if (seen.includes(rev0)) expect(seen).toMatch(/out of date/i)
  await expect(freshness(p)).toContainText(/Evaluated for the current model/, { timeout: 120_000 })
  expect(await freshness(p).textContent()).not.toContain(rev0)
  await undoDesign(p)
  await expect.poll(async () => (await live(p)).height).toBe(s0.height)
  // paused checks: not evaluated, said so
  await p.getByTestId('analysis-switch').click()
  await expect(p.getByTestId('analysis-off')).toBeVisible()
  await p.getByTestId('analysis-switch').click()

  // ---- F03: reorder + Undo, a return path, Program and back; nothing lost, and a return path runs nothing by itself
  await row(p, 'built.sun').click()
  await openDesignTool(p, 'sun').catch(() => {})
  const cam0 = (await live(p)).camera
  await p.getByTestId('phase-edit').click()
  const ed3 = p.getByTestId('workflow-overview')
  const order0 = await rows(p)
  await ed3.locator('[data-dock-node="built.wind-screen"]').focus()
  await p.keyboard.press('ArrowLeft')
  await expect.poll(() => rows(p)).not.toEqual(order0)
  await ed3.getByRole('button', { name: 'Undo the last workflow change' }).click()
  await expect.poll(() => rows(p)).toEqual(order0)
  await ed3.locator('[data-dock-node="built.wind-screen"]').click()
  await ed3.getByTestId('dock-node-actions').getByRole('button', { name: /Connect to/ }).click()
  await ed3.locator('span.group:has([data-dock-node="design.massing"])').getByRole('button', { name: /Create loop/ }).click()
  await expect(ed3.locator('[data-dock-edge="built.wind-screen>design.massing"]')).toHaveCount(1)
  await ed3.getByTestId('overview-close').click() // Confirm workflow
  await expect(ed3).toHaveCount(0)
  await expect(panel(p).locator('[data-return="built.wind-screen>design.massing"]')).toHaveCount(1)
  await row(p, 'built.sun').click()
  const stable: (string | null)[] = []
  for (let i = 0; i < 4; i++) { await p.waitForTimeout(800); const s = await live(p); stable.push(s.digest); expect(s.solar).not.toBe('running') }
  expect(new Set(stable).size).toBe(1)
  await rail(p).locator('[data-phase="program"]').click()
  await expect(panel(p)).toHaveAttribute('data-phase', 'program')
  await rail(p).locator('[data-phase="form"]').click()
  await expect(panel(p).getByTestId('phase-active')).toHaveAttribute('data-active', 'built.sun')
  const formRows = await rows(p)
  expect(formRows).toEqual(expect.arrayContaining(['design.massing', 'built.sun', 'built.wind-screen', 'built.solar-access']))
  expect((await live(p)).height).toBe(s0.height)
  if (cam0) expect((await live(p)).camera).toEqual(cam0)

  // ---- F04: save and reload; then a phase package round trip
  await p.reload()
  await rail(p).waitFor({ timeout: 120_000 })
  await expect(panel(p)).toHaveAttribute('data-phase', 'form', { timeout: 60_000 })
  await expect.poll(() => rows(p), { timeout: 60_000 }).toEqual(formRows)
  await expect(panel(p).locator('[data-return="built.wind-screen>design.massing"]')).toHaveCount(1)
  await expect.poll(async () => (await live(p)).height, { timeout: 60_000 }).toBe(s0.height)
  await rail(p).locator('[data-phase="program"]').click()
  const programRows = await rows(p)
  const tier = (await live(p)).fsrTier
  await rail(p).locator('[data-phase="form"]').click()
  await p.getByTestId('transfer-export').click()
  await p.getByTestId('purpose-workflow').click()
  const [dl] = await Promise.all([p.waitForEvent('download'), p.getByTestId('transfer-action').click()])
  await p.keyboard.press('Escape')
  const pkg = JSON.parse(readFileSync((await dl.path())!, 'utf8'))
  expect(pkg.workflow.nodes).toEqual(formRows)
  // the test project's package gets a tool this app doesn't have and a link to a tool not in this workflow
  pkg.workflow.nodes.push('community.test.not-installed')
  pkg.workflow.links.push({ edge: { a: 'built.sun', b: 'built.economics' }, other: 'built.economics', out: true })
  const file = test.info().outputPath('form-package-edited.json')
  writeFileSync(file, JSON.stringify(pkg))
  await p.getByTestId('transfer-import').click()
  await p.getByTestId('purpose-package').click()
  await p.getByTestId('transfer-file').setInputFiles(file)
  await p.getByTestId('transfer-action').click()
  const preview = p.getByTestId('phase-package-preview')
  await expect(preview).toBeVisible()
  await expect(preview.locator('[data-pp-node="community.test.not-installed"]')).toHaveAttribute('data-state', 'not in this app: skipped')
  await expect(preview.getByTestId('pp-missing-links')).toContainText('Program value & land residual')
  await preview.locator('input[data-mode="replace"]').check()
  await preview.getByTestId('pp-apply').click()
  await expect(preview).toHaveCount(0)
  await expect.poll(() => rows(p)).toEqual(formRows)
  await rail(p).locator('[data-phase="program"]').click()
  expect(await rows(p)).toEqual(programRows) // the other phase's workflow is untouched
  expect((await live(p)).fsrTier).toBe(tier) // and its settings

  // ---- F05: Program/Value: a use-only band edit keeps GFA and FSR and moves the value; Undo restores both
  await p.getByTestId('phase-add').click()
  await p.getByTestId('phase-add-list').locator('[data-add="built.economics"]').click()
  await p.getByTestId('phase-add-list').getByTestId('add-confirm-yes').click()
  await expect(panel(p).getByTestId('phase-active')).toHaveAttribute('data-active', 'built.economics')
  const valueNumber = p.getByTestId('value-number')
  await expect(valueNumber).toBeVisible()
  const v0 = await valueNumber.textContent()
  const fsrText = () => panel(p).getByText(/FSR total/).first().locator('..').textContent()
  const fsr0 = await fsrText()
  const bands0 = (await live(p)).bands
  const office = bands0.findIndex((b) => b.startsWith('office:'))
  expect(office).toBeGreaterThanOrEqual(0)
  await p.getByLabel(`Band ${office + 1} use`).selectOption('residential')
  await expect.poll(async () => (await live(p)).bands[office]).toMatch(/^residential:/)
  expect(await fsrText()).toBe(fsr0) // total floor area and FSR: unchanged
  await expect(valueNumber).not.toHaveText(v0!) // the value follows the use
  await undoDesign(p)
  await expect.poll(async () => (await live(p)).bands).toEqual(bands0)
  await expect(valueNumber).toHaveText(v0!)
  await p.screenshot({ path: 'test-results/journeys.png' })
})
