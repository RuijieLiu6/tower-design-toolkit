// Workspaces (Ruijie, 17 Nov: "like Adobe Illustrator's presets … Getting Started, Essentials, Classic and Manage
// Workspaces, so users set the tools they keep and where they sit"). Driven like a user: the Interface drawer's
// Workspace menu → Classic (model beside the data graph, the tool rail on the right) → Getting Started (Trace tucked
// away) → a change marks "changed" and Reset puts it back → a workspace of your own saved, renamed, kept after a reload,
// deleted. Screenshots go to test-results/workspaces/ (they show the competition model, so they stay out of docs/).
import { expect, test, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { placeStartingTower } from './helpers'

const SHOTS = join(process.cwd(), 'test-results', 'workspaces')
mkdirSync(SHOTS, { recursive: true })
const drawer = (p: Page) => p.getByTestId('interface-drawer')
async function openDrawer(p: Page) {
  if (!(await drawer(p).isVisible().catch(() => false))) await p.getByTestId('interface-button').click()
  await expect(drawer(p)).toBeVisible()
}
async function choose(p: Page, id: string) {
  await openDrawer(p)
  await drawer(p).getByTestId('workspace-button').click()
  await drawer(p).getByTestId('workspace-menu').locator(`[data-workspace="${id}"]`).click()
}

test('Workspaces: Classic, Getting Started, changed and Reset, your own workspace saved, renamed, kept, deleted', async ({ page: p }) => {
  test.setTimeout(300_000)
  await p.setViewportSize({ width: 1440, height: 900 })
  await p.addInitScript(() => { try { localStorage.setItem('ts.landing.skip', '1'); localStorage.setItem('ts.onboarding.seen', '1'); if (!sessionStorage.getItem('e2e.ws')) { localStorage.removeItem('ts.workspaces'); sessionStorage.setItem('e2e.ws', '1') } } catch { /* ignore */ } })
  await p.goto('/#/guided')
  await p.waitForSelector('#root > *', { timeout: 60_000 })
  await p.getByRole('tab', { name: 'Competition site' }).or(p.getByRole('button', { name: 'Competition site' })).first().click({ timeout: 120_000 })
  await placeStartingTower(p, { stay: true })
  const right = p.getByRole('complementary', { name: 'Results and evidence' })

  // The default is Essentials, unchanged.
  await openDrawer(p)
  await expect(drawer(p).getByTestId('workspace-name')).toHaveText('Essentials')
  await expect(drawer(p).getByTestId('workspace-changed')).toHaveCount(0)
  await drawer(p).getByTestId('workspace-button').click()
  const menu = drawer(p).getByTestId('workspace-menu')
  await expect(menu.getByRole('menuitemradio')).toHaveText(['Getting Started', 'Essentials', 'Classic'])
  await expect(menu.getByRole('menuitemradio', { name: 'Essentials' })).toHaveAttribute('aria-checked', 'true')
  await p.screenshot({ path: join(SHOTS, '01-workspace-menu.png') })
  await p.keyboard.press('Escape')

  // Classic: the model beside the data graph, the tool rail on the right of the model.
  await choose(p, 'classic')
  await expect(drawer(p).getByTestId('workspace-name')).toHaveText('Classic')
  await expect(p.locator('[data-model-region]')).toHaveClass(/w-1\/2/)
  const railRight = await p.evaluate(() => {
    const rail = document.querySelector('[data-testid="tool-rail"]') as HTMLElement | null, model = document.querySelector('[data-model-region]') as HTMLElement | null
    return rail && model ? rail.getBoundingClientRect().left > model.getBoundingClientRect().left : null
  })
  expect(railRight).toBe(true)
  await p.keyboard.press('Escape')
  await p.screenshot({ path: join(SHOTS, '02-classic.png') })

  // Getting Started: Trace is tucked away; the 3D view is back.
  await choose(p, 'getting-started')
  await expect(right.getByRole('tab', { name: 'Trace' })).toHaveCount(0)
  await expect(p.locator('[data-model-region]')).toHaveClass(/w-full/)

  // A change of your own marks the workspace changed; Reset puts it back.
  await drawer(p).locator('[data-ui-toggle="right.tab.trace"]').click()
  await expect(right.getByRole('tab', { name: 'Trace' })).toHaveCount(1)
  await expect(drawer(p).getByTestId('workspace-changed')).toBeVisible()
  await drawer(p).getByTestId('workspace-reset').click()
  await expect(right.getByRole('tab', { name: 'Trace' })).toHaveCount(0)
  await expect(drawer(p).getByTestId('workspace-changed')).toHaveCount(0)

  // A workspace of your own: Results hidden, saved under a name, renamed in Manage workspaces.
  await drawer(p).locator('[data-ui-toggle="right.tab.results"]').click()
  await drawer(p).getByTestId('workspace-button').click()
  await drawer(p).getByTestId('workspace-new').click()
  await drawer(p).getByTestId('workspace-name-input').fill('Essentials')
  await drawer(p).getByTestId('workspace-save').click()
  await expect(drawer(p).getByTestId('workspace-new-form').getByRole('alert')).toContainText('already')
  await drawer(p).getByTestId('workspace-name-input').fill('Crit desk')
  await drawer(p).getByTestId('workspace-save').click()
  await expect(drawer(p).getByTestId('workspace-name')).toHaveText('Crit desk')
  await drawer(p).getByTestId('workspace-button').click()
  await drawer(p).getByTestId('workspace-manage').click()
  const manage = drawer(p).getByTestId('workspace-manage-panel')
  await manage.getByRole('button', { name: 'Rename Crit desk' }).click()
  await manage.getByRole('textbox', { name: 'New name for Crit desk' }).fill('Review desk')
  await manage.getByRole('button', { name: 'Rename', exact: true }).click()
  await expect(manage.locator('[data-my-workspace="Review desk"]')).toBeVisible()
  await p.screenshot({ path: join(SHOTS, '03-manage.png') })

  // Kept after a reload: the active workspace and its arrangement.
  await p.reload()
  await p.waitForSelector('#root > *', { timeout: 60_000 })
  await openDrawer(p)
  await expect(drawer(p).getByTestId('workspace-name')).toHaveText('Review desk')
  await expect(p.getByRole('complementary', { name: 'Results and evidence' }).getByRole('tab', { name: 'Results', exact: true })).toHaveCount(0)

  // Switching away and back; then deleted (asks once), Essentials becomes active.
  await choose(p, 'essentials')
  await expect(p.getByRole('complementary', { name: 'Results and evidence' }).getByRole('tab', { name: 'Results', exact: true })).toHaveCount(1)
  await drawer(p).getByTestId('workspace-button').click()
  await drawer(p).getByTestId('workspace-manage').click()
  await drawer(p).getByRole('button', { name: 'Delete Review desk' }).click()
  await drawer(p).getByRole('button', { name: 'Delete?' }).click()
  await expect(drawer(p).locator('[data-my-workspace]')).toHaveCount(0)
  await expect(drawer(p).getByTestId('workspace-name')).toHaveText('Essentials')
})
