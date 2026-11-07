// Mid-review screenshots (backlog item 34): one consistent 1600 × 1000 set on the demo project (item 24), written to
// 04 Tool Plan/mid-review/screens/. Run: node node_modules/playwright/cli.js test e2e/screens.e2e.ts
// Each group is its own test on a fresh page, so one slow panel (Energy & carbon under SwiftShader) can't block the rest.
import { test, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

const OUT = resolve(process.cwd(), '..', '04 Tool Plan', 'mid-review', 'screens')
mkdirSync(OUT, { recursive: true })
test.use({ viewport: { width: 1600, height: 1000 }, actionTimeout: 20_000 })
test.describe.configure({ timeout: 4 * 60_000 })

type Proj = 'Competition site' | 'Real Vancouver'
const shot = async (p: Page, name: string) => { await p.waitForTimeout(900); await p.screenshot({ path: join(OUT, `${name}.png`) }) }
async function dismiss(p: Page) {
  if (await p.locator('[aria-labelledby="ob-title"]').count()) await p.getByRole('button', { name: 'Start designing' }).click({ timeout: 3000 }).catch(() => p.keyboard.press('Escape'))
}
async function project(p: Page, which: Proj) {
  await dismiss(p)
  await p.getByRole('tab', { name: which }).first().click()
  await p.waitForTimeout(which === 'Real Vancouver' ? 3500 : 1500)
  await dismiss(p)
}
async function stage(p: Page, key: '1' | '2' | '3') { await dismiss(p); await p.keyboard.press(key); await p.waitForTimeout(1800) }
/**
 * Shows a node's results. Switching a node on in the bottom bar also selects it; a node that is already on is picked
 * in the results panel's "Show results for" list (clicking its icon would switch it off).
 */
async function showNode(p: Page, name: string) {
  const sw = p.getByRole('switch', { name: `Use ${name}`, exact: true })
  await sw.waitFor({ timeout: 20_000 })
  if ((await sw.getAttribute('aria-checked')) === 'false') await sw.click()
  else {
    await p.getByRole('tab', { name: /Results/ }).click().catch(() => {})
    await p.getByLabel('Show results for').selectOption({ label: name })
  }
  await p.getByRole('tab', { name: /Results/ }).click().catch(() => {})
}
async function node(p: Page, name: string) {
  await dismiss(p)
  await showNode(p, name)
  await p.waitForTimeout(1500)
}
/** Landing → "Open the demo project" → the guided app on the given project and stage. */
async function demo(p: Page, proj: Proj = 'Competition site', st: '1' | '2' | '3' = '1') {
  await p.addInitScript(() => { performance.setResourceTimingBufferSize(10_000); try { localStorage.setItem('ts.landing.skip', '0') } catch { /* ignore */ } })
  await p.goto('/#/start')
  // The cover comes first since 7 Nov: its Enter leads to the landing page, which holds the demo button.
  await p.getByTestId('intro-enter').click()
  await p.getByRole('button', { name: 'Open the demo project' }).click()
  await p.waitForURL(/#\/guided/)
  await p.waitForTimeout(2500)
  await project(p, proj)
  if (st !== '1') await stage(p, st)
}
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
async function panels(p: Page, list: [number, string][]) {
  for (const [n, name] of list) {
    if (await node(p, name).then(() => true, () => false)) await shot(p, `10-node-${String(n).padStart(2, '0')}-${slug(name)}`)
  }
}

test('stages', async ({ page: p }) => {
  await p.addInitScript(() => { performance.setResourceTimingBufferSize(10_000); try { localStorage.setItem('ts.landing.skip', '0') } catch { /* ignore */ } })
  await p.goto('/#/start')
  await p.waitForSelector('#root > *')
  await shot(p, '01-landing')

  await demo(p)
  await node(p, 'VTC hard rules')
  await shot(p, '02-massing-vtc')

  await stage(p, '2')
  await p.getByRole('button', { name: 'Section cut' }).click().catch(() => {})
  await shot(p, '03a-schematic-xray-section')
  await p.getByRole('button', { name: 'Section cut' }).click().catch(() => {})
  await p.getByRole('button', { name: 'Explode zones' }).click().catch(() => {})
  await shot(p, '03b-schematic-xray-explode')
  await p.getByRole('button', { name: 'Explode zones' }).click().catch(() => {})

  await stage(p, '3')
  await shot(p, '04-present-board')

  await stage(p, '1')
  await project(p, 'Real Vancouver')
  const surface = p.getByRole('checkbox', { name: /Height limit surface/ })
  if (await surface.count()) { await surface.first().check().catch(() => {}); await p.waitForTimeout(2500) }
  await node(p, 'View-cone height check')
  await shot(p, '05-real-vancouver-cones-height-surface')
})

test('massing node panels', async ({ page: p }) => {
  await demo(p)
  await panels(p, [[1, 'Program & FSR accounting'], [2, 'Streetwall & tower form'], [3, 'Active frontage'], [4, 'Open space & links'],
    [5, 'Solar access & sun hours'], [6, 'City in Nature ledger'], [7, 'Program value & land residual'], [8, 'Engagement & claims guard'], [9, 'AI use & provenance log']])
})

test('schematic node panels', async ({ page: p }) => {
  await demo(p, 'Competition site', '2')
  await panels(p, [[10, 'Core & lift check'], [11, 'Egress & stairs'], [12, 'Code & life safety'], [13, 'Public sky room'], [14, 'Structure: system & seismic'],
    [15, 'Wind procedure (slenderness)'], [16, 'Interior & activity programme'], [17, 'Facade: glazing & bird safety'], [18, 'Parking, loading & bikes']])
})

test('view from here + import dialog', async ({ page: p }) => {
  await demo(p, 'Real Vancouver')
  await panels(p, [[20, 'View from here']])
  await project(p, 'Competition site')
  await p.getByRole('button', { name: 'Upload a massing model' }).first().click()
  await p.waitForTimeout(800)
  await shot(p, '10-node-21-import-massing-dialog')
  await p.keyboard.press('Escape')
})

test('customize, options, sources, status', async ({ page: p }) => {
  await demo(p)
  await p.getByRole('button', { name: 'Customize' }).first().click()
  await p.waitForURL(/#\/customize/)
  await p.waitForTimeout(3000)
  await shot(p, '06-customize-workflow')

  // Options: save the demo, raise Tower 1 to 300 m with more office, save again; the page then compares the two.
  await p.goto('/#/guided'); await p.waitForTimeout(2000); await dismiss(p)
  await p.getByRole('button', { name: 'Options' }).first().click()
  await p.waitForURL(/#\/options/)
  await p.waitForTimeout(1500)
  const nameBox = p.getByLabel('Option name')
  await nameBox.fill('A · demo')
  await p.getByRole('button', { name: /^Save/ }).first().click()
  await p.waitForTimeout(1500)
  await p.evaluate(async () => {
    const url = performance.getEntriesByType('resource').map((e) => e.name).filter((x) => /\/src\/store\.ts/.test(x)).pop()!
    const { useStore } = await import(/* @vite-ignore */ url)
    const s = useStore.getState(); const t = s.towers.vtc[0]
    s.updateTower(t.id, { height: 300, bands: [{ use: 'office', share: 0.7 }, { use: 'residential', share: 0.3 }] })
  })
  await nameBox.fill('B · 300 m, more office')
  await p.getByRole('button', { name: /^Save/ }).first().click()
  await p.waitForTimeout(2500)
  await shot(p, '07-options-compare')

  await p.getByRole('button', { name: 'Guided process' }).first().click().catch(() => p.goto('/#/guided'))
  await p.waitForTimeout(1500); await dismiss(p)
  await p.getByRole('button', { name: 'Sources and assumptions' }).click()
  await p.waitForURL(/#\/sources/)
  await p.waitForTimeout(2500)
  await shot(p, '08-sources-hub')

  await p.goto('/#/status')
  await p.waitForTimeout(2500)
  await shot(p, '09-status')
})

test('energy panel (heavy under SwiftShader)', async ({ page: p }) => {
  await demo(p, 'Competition site', '2')
  await panels(p, [[19, 'Energy & carbon']])
})

test('extra: a view from the tower roof, and the evaluation cases on the Status page', async ({ page: p }) => {
  await demo(p, 'Real Vancouver')
  await node(p, 'View from here')
  const from = p.getByLabel('View from a design tower')
  const roof = await from.locator('option').filter({ hasText: ': roof' }).first().getAttribute('value')
  if (roof) {
    await from.selectOption(roof); await p.waitForTimeout(1500)
    await p.getByRole('button', { name: 'Look from here' }).click().catch(() => {}); await p.waitForTimeout(4000)
    await shot(p, '10-node-20b-view-from-tower-roof')
  }

  await p.goto('/#/status')
  await p.waitForTimeout(2500)
  await p.locator('#eval-title').scrollIntoViewIfNeeded()
  await p.evaluate(() => document.getElementById('eval-title')?.scrollIntoView({ block: 'start' }))
  await shot(p, '09b-status-evaluation-cases')
})
