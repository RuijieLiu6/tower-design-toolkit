// The Interface drawer (Ruijie, 17 Nov: "another button whose drop-down is about personalising the interface … click
// an item and it shows or hides on the interface … like a library: almost all the information on the site shown as a
// table of contents"). Driven like a user on the competition site: the drawer opens from the top bar as an ARIA tree;
// hiding the Trace tab, a design tool (Sun), a Results section and a viewport layer (the dock's Site section) makes
// each disappear, with the group counts following; a reload keeps it; Reset brings everything back; a My-tool package
// added appears under Add-ons. Screenshots go to docs/evaluation/2026-11-17-ui-drawer/.
import { expect, test, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { placeStartingTower } from './helpers'

const SHOTS = join(process.cwd(), 'docs', 'evaluation', '2026-11-17-ui-drawer')
mkdirSync(SHOTS, { recursive: true })
const pick = (re: RegExp) => performance.getEntriesByType('resource').map((e) => e.name).filter((n) => re.test(n)).pop()!

const drawer = (p: Page) => p.getByTestId('interface-drawer')
const toggle = (p: Page, id: string) => drawer(p).locator(`[data-ui-toggle="${id}"]`)
const state = (p: Page, id: string) => drawer(p).locator(`[data-ui-id="${id}"]`).first().getAttribute('data-ui-state')
async function openDrawer(p: Page) {
  if (!(await drawer(p).isVisible().catch(() => false))) await p.getByTestId('interface-button').click()
  await expect(drawer(p)).toBeVisible()
}

test('Interface drawer: hide a tab, a tool, a section and a layer; it persists, Reset restores, add-ons appear', async ({ page: p }) => {
  test.setTimeout(480_000)
  await p.addInitScript(() => { performance.setResourceTimingBufferSize(10_000); try { localStorage.setItem('ts.landing.skip', '1'); localStorage.setItem('ts.onboarding.seen', '1') } catch { /* ignore */ } })
  const errors: string[] = []
  p.on('pageerror', (e) => errors.push(e.message))
  await p.goto('/#/guided')
  await p.waitForSelector('#root > *', { timeout: 60_000 })
  await p.getByRole('tab', { name: 'Competition site' }).or(p.getByRole('button', { name: 'Competition site' })).first().click({ timeout: 120_000 })
  await placeStartingTower(p, { stay: true })
  const right = p.getByRole('complementary', { name: 'Results and evidence' })
  // The Results tab's sections register as they are seen; the dock's sections as the dock exists.
  await right.getByRole('tab', { name: 'Results', exact: true }).click()
  await expect(right.getByRole('heading', { name: 'What stays with people' })).toBeVisible({ timeout: 60_000 })
  const layersTab = p.locator('[data-model-region]').getByRole('button', { name: /layers/i }).first()
  await layersTab.click()
  await expect(p.getByTestId('vtc-north-datum')).toBeVisible()

  // The drawer: a tree with the big categories, locked parts, the view-only note.
  await openDrawer(p)
  await expect(drawer(p).getByRole('tree')).toBeVisible()
  await expect(drawer(p)).toContainText('Hiding is view-only')
  expect(await state(p, 'topbar.mode-switch')).toBe('locked')
  expect(await state(p, 'topbar.project-menu')).toBe('locked')
  await expect(toggle(p, 'topbar.mode-switch')).toBeDisabled()
  for (const id of ['topbar', 'left', 'tools', 'viewport', 'right', 'addons']) await expect(drawer(p).locator(`[data-ui-id="${id}"]`).first()).toBeVisible()
  await p.screenshot({ path: join(SHOTS, '01-drawer-open.png') })

  // Hide the Trace tab, the Sun tool, a Results section and the dock's Site section: each disappears at once.
  await toggle(p, 'right.tab.trace').click()
  await expect(right.getByRole('tab', { name: 'Trace' })).toHaveCount(0)
  await expect(drawer(p).locator('[data-ui-id="right"] [data-ui-hidden-count]').first()).toHaveAttribute('data-ui-hidden-count', '1')
  expect(await state(p, 'right')).toBe('mixed')
  await toggle(p, 'tools.sun').click()
  await expect(p.locator('[role="tab"][data-tool="sun"]')).toHaveCount(0)
  await expect(p.getByRole('toolbar', { name: 'Design tools' }).locator('[data-tool="sun"]')).toHaveCount(0)
  await toggle(p, 'right.tab.results.what-stays-with-people').click()
  await expect(right.getByRole('heading', { name: 'What stays with people' })).toHaveCount(0)
  await toggle(p, 'viewport.dock.vtc-site').click()
  await expect(p.getByTestId('vtc-north-datum')).toHaveCount(0)
  await expect(drawer(p)).toContainText('4 of')
  // Search narrows the tree; the arrow keys and Space work on a row.
  await p.getByTestId('interface-search').fill('trace')
  await expect(drawer(p).locator('[data-ui-id="right.tab.trace"]')).toBeVisible()
  await expect(drawer(p).locator('[data-ui-id="tools.sun"]')).toHaveCount(0)
  await drawer(p).locator('[data-ui-id="right.tab.trace"]').focus()
  await p.keyboard.press('Space')
  await expect(right.getByRole('tab', { name: 'Trace' })).toBeVisible()
  await p.keyboard.press('Space')
  await expect(right.getByRole('tab', { name: 'Trace' })).toHaveCount(0)
  await p.getByTestId('interface-search').fill('')
  await p.keyboard.press('Escape')
  await expect(drawer(p)).toHaveCount(0)
  await p.waitForTimeout(400)
  await p.screenshot({ path: join(SHOTS, '02-items-hidden.png') })

  // A reload keeps the layout (this browser), and Reset brings everything back.
  await p.reload()
  await p.waitForSelector('#root > *', { timeout: 60_000 })
  await expect(p.getByTestId('interface-button')).toBeVisible({ timeout: 120_000 })
  await expect(right.getByRole('tab', { name: 'Trace' })).toHaveCount(0)
  await expect(p.locator('[role="tab"][data-tool="sun"]')).toHaveCount(0)
  expect(await p.evaluate(() => JSON.parse(localStorage.getItem('ts.ui.visibility') ?? '{}').hidden?.length)).toBe(4)
  await openDrawer(p)
  await p.getByTestId('interface-reset').click()
  await expect(right.getByRole('tab', { name: 'Trace' })).toBeVisible()
  await expect(p.locator('[role="tab"][data-tool="sun"]')).toBeVisible()
  await expect(drawer(p)).toContainText('Everything is shown')
  await p.keyboard.press('Escape')

  // A My-tool package added appears under Add-ons; hidden there, it leaves the Add tool list.
  await p.evaluate(async (src) => {
    const pick = new Function(`return (${src})`)() as (re: RegExp) => string
    const { useCommunityStore } = await import(/* @vite-ignore */ pick(/\/src\/lib\/communityStore\.ts/))
    const pkg = await (await fetch('registry/packages/community.example.tower-width@0.1.0.json')).json()
    useCommunityStore.getState().addPackage(pkg)
  }, pick.toString())
  await openDrawer(p)
  await expect(drawer(p).locator('[data-ui-id="addons.tools.community.example.tower-width"]')).toBeVisible()
  await toggle(p, 'addons.tools.community.example.tower-width').click()
  await p.keyboard.press('Escape')
  await p.getByTestId('phase-add').click()
  await p.getByTestId('phase-add-list').getByRole('tab', { name: /My tools/ }).click()
  await expect(p.getByTestId('phase-add-list').locator('[data-my-tool="community.example.tower-width"]')).toHaveCount(0)
  expect(errors).toEqual([])
})
