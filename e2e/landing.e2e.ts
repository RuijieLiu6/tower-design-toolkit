// The landing page (6 Nov): the tool opens on it; the agent finds the visitor's user type from a sentence and offers at
// least three starting workflows; Start opens the guided app with exactly that workflow's checks on. Uses the keyword
// reading, which answers before the in-browser language model has loaded (the model comes from huggingface.co).
import { expect, test } from '@playwright/test'

test('the landing page: say who you are, get starting workflows, start one', async ({ page }) => {
  test.setTimeout(180_000)
  await page.addInitScript(() => { try { localStorage.setItem('ts.onboarding.seen', '1') } catch { /* private mode */ } })
  await page.goto('/')
  await expect(page).toHaveURL(/#\/start$/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('One tower model. Every analysis a node. You decide.')
  await page.getByTestId('agent-input').fill("I'm a structural engineer checking a tall tower")
  await page.getByTestId('agent-send').click()
  const cards = page.locator('[data-preset]')
  await expect(page.getByTestId('landing-presets')).toContainText('Starting workflows for an engineer or consultant')
  expect(await cards.count()).toBeGreaterThanOrEqual(3)
  await expect(page.locator('[role=log]')).toContainText('You sound like an engineer or consultant')
  // Picking another type by hand gives that type's workflows.
  await page.getByTestId('agent-model-status').getByRole('button', { name: 'passionate designer' }).click()
  await expect(page.getByTestId('landing-presets')).toContainText('Starting workflows for a passionate designer')
  expect(await cards.count()).toBeGreaterThanOrEqual(3)
  // Start the competition workflow.
  await page.getByTestId('start-designer.competition').click()
  await expect(page).toHaveURL(/#\/guided/, { timeout: 30_000 })
  await expect(page.getByRole('heading', { name: 'Design tools' })).toBeVisible({ timeout: 60_000 })
  // The top bar's role follows the choice.
  await expect(page.getByRole('combobox', { name: 'Role' })).toHaveValue('designer')
})
