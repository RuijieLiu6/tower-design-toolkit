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
  await page.getByTestId('agent-types').getByRole('button', { name: /^Passionate designer/ }).click()
  await expect(page.getByTestId('landing-presets')).toContainText('Starting workflows for a passionate designer')
  expect(await cards.count()).toBeGreaterThanOrEqual(3)
  // The first workflow is on the phase board, editable: switch a node off, then start from the board.
  await expect(page.getByTestId('landing-composer')).toContainText('Enter the Vancouver Tall Challenge')
  const sky = page.getByTestId('landing-composer').locator('[data-node="built.sky-room"]')
  await expect(sky).toHaveAttribute('aria-pressed', 'true')
  await sky.click()
  await expect(sky).toHaveAttribute('aria-pressed', 'false')
  await expect(page.getByTestId('composer-summary')).toContainText('(edited)')
  await page.getByTestId('composer-start').click()
  await expect(page).toHaveURL(/#\/guided/, { timeout: 30_000 })
  await expect(page.getByRole('heading', { name: 'Design tools' })).toBeVisible({ timeout: 60_000 })
  // The top bar's role follows the choice.
  await expect(page.getByRole('combobox', { name: 'Role' })).toHaveValue('designer')
  // Step to step: the rail counts the workflow's checks per step, and Next goes on.
  const rail = page.getByRole('navigation', { name: 'Design process' })
  await expect(rail.locator('[data-step="site"]')).toHaveAttribute('aria-current', 'step')
  await expect(page.getByTestId('step-count-program')).toHaveText('4') // fsr, streetwall, frontage, open space (sky room off)
  await page.getByTestId('rail-next').click()
  await expect(rail.locator('[data-step="volume"]')).toHaveAttribute('aria-current', 'step')
})
