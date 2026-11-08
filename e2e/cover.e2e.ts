// The cover (7 Nov): the box's role menu previews each role's starting workflow on the string and restores it on
// leaving; a click keeps it; a floating node clicked is threaded; Enter goes into the guided app with that workflow.
import { expect, test } from '@playwright/test'

test('the cover: preview a role, keep one, thread a node, enter with the workflow', async ({ page }) => {
  test.setTimeout(180_000)
  await page.addInitScript(() => { try { localStorage.setItem('ts.onboarding.seen', '1') } catch { /* private mode */ } })
  await page.goto('/')
  const name = page.getByTestId('cover-chain-name')
  await expect(name).toHaveText('Enter the Vancouver Tall Challenge')
  // Hovering a role shows its workflow; leaving the list puts the string back.
  await page.getByTestId('cover-role').click()
  await page.locator('[data-role="engineer"]').hover()
  await expect(name).toHaveText('Structure and wind')
  await page.mouse.move(40, 880)
  await expect(name).toHaveText('Enter the Vancouver Tall Challenge')
  // A click keeps it.
  await page.locator('[data-role="practitioner"]').click()
  await expect(name).toHaveText('Rezoning feasibility')
  const on = page.locator('[data-cover-node][data-on="1"]')
  const before = await on.count()
  // A floating node, clicked, is threaded onto the string.
  await page.locator('[data-cover-node][data-on="0"]').first().focus()
  await page.keyboard.press('Enter')
  await expect(on).toHaveCount(before + 1)
  await expect(name).toHaveText('Rezoning feasibility (edited)')
  // Enter goes in with that workflow.
  await page.getByTestId('cover-enter').click()
  await expect(page).toHaveURL(/#\/guided/, { timeout: 30_000 })
  await expect(page.getByRole('heading', { name: 'Design tools' })).toBeVisible({ timeout: 60_000 })
  await expect(page.getByRole('combobox', { name: 'Role' })).toHaveValue('practitioner')
})

// The workflow assistant below the canvas (7 Nov): a description becomes a proposal previewed on the string, applied or
// discarded; applied changes come back with Undo; an unplaceable request gets one question with choices. Keyword mode
// (the language model is not fetched in tests).
test('the workflow assistant: suggest, preview, apply, undo, clarify', async ({ page }) => {
  test.setTimeout(180_000)
  await page.route('**/huggingface.co/**', (r) => r.abort())
  await page.addInitScript(() => { try { localStorage.setItem('ts.onboarding.seen', '1') } catch { /* private mode */ } })
  await page.goto('/')
  const on = page.locator('[data-cover-node][data-on="1"]')
  await expect(on).toHaveCount(10)
  const input = page.getByTestId('assistant-input')
  await input.fill('Help me explore a mixed-use tower with a public ground floor.')
  await page.getByTestId('assistant-suggest').click()
  await expect(page.getByTestId('assistant-proposal')).toContainText('Suggested workflow')
  await expect(page.locator('[data-proposed="add"]').first()).toBeVisible()
  const previewed = await on.count()
  expect(previewed).toBeGreaterThan(10)
  // Discard puts the string back; suggest again and apply keeps it.
  await page.getByTestId('assistant-discard').click()
  await expect(on).toHaveCount(10)
  await page.getByTestId('assistant-suggest').click()
  await page.getByTestId('assistant-apply').click()
  await expect(page.getByTestId('assistant-applied')).toContainText('Applied')
  await expect(on).toHaveCount(previewed)
  await expect(page.locator('[data-proposed]')).toHaveCount(0)
  // Undo brings the string back to before the suggestion.
  await page.getByTestId('assistant-applied').getByRole('button', { name: 'Undo' }).click()
  await expect(on).toHaveCount(10)
  await expect(page.getByTestId('cover-chain-name')).toHaveText('Enter the Vancouver Tall Challenge')
  // A request no single node answers gets a question with built nodes to choose from.
  await input.fill('Add a water-systems study after the program stage.')
  await page.getByTestId('assistant-suggest').click()
  await expect(page.getByTestId('assistant-clarify')).toContainText('No node studies water on its own')
  await page.getByTestId('assistant-clarify').getByRole('button', { name: /Code & life safety/ }).click()
  await expect(page.getByTestId('assistant-proposal')).toContainText('Adds Code & life safety after the Program stage')
})
