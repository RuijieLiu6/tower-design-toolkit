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
  await expect(page.getByTestId('phase-panel')).toBeVisible({ timeout: 60_000 })
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

// Local loops (Ruijie, 7 Nov): no global Loop button or permanent hint; a return connection is made from a node's
// connection point (here by keyboard: C, then Enter on an earlier node), keeps every forward wire, shows "Return to …"
// only when focused or selected, and can be removed and brought back with Undo.
test('loops: connect back by keyboard, select, remove, undo', async ({ page }) => {
  test.setTimeout(120_000)
  await page.route('**/huggingface.co/**', (r) => r.abort())
  await page.addInitScript(() => { try { localStorage.setItem('ts.onboarding.seen', '1') } catch { /* private mode */ } })
  await page.goto('/')
  await expect(page.locator('[data-cover-node][data-on="1"]')).toHaveCount(10)
  await expect(page.getByTestId('cover-loop')).toHaveCount(0)
  await expect(page.locator('[data-lane-loop]')).toHaveCount(0)
  await expect(page.getByTestId('wire-tip')).toHaveCount(0)
  const wires = () => page.locator('[data-wire]').evaluateAll((els) => els.map((e) => e.getAttribute('data-wire')!))
  const before = await wires()
  await page.locator('[data-cover-node="built.sky-room"]').focus()
  await page.keyboard.press('c')
  await expect(page.getByTestId('connect-guide')).toContainText('Connect nodes')
  await page.locator('[data-cover-node="built.wind-screen"]').focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('[data-return]')).toHaveCount(1)
  const after = await wires()
  expect(after.filter((k) => !before.includes(k))).toEqual(['built.sky-room>built.wind-screen'])
  expect(before.every((k) => after.includes(k))).toBe(true)
  await page.locator('[data-wire-point="built.sky-room>built.wind-screen"]').focus()
  await expect(page.getByTestId('wire-tip')).toContainText('Return to Pedestrian wind: massing screen')
  await page.keyboard.press('Enter')
  await page.getByTestId('wire-remove').click()
  await expect(page.locator('[data-return]')).toHaveCount(0)
  expect(await wires()).toEqual(before)
  await page.getByTestId('cover-notice').getByRole('button', { name: 'Undo' }).click()
  await expect(page.locator('[data-return]')).toHaveCount(1)
})

// Ruijie, 7 Nov: returning to the landing page restores the active workflow (nodes, connections, local loops, name,
// starting preset); the default appears only on New. Unused nodes wait in their lane's shelf; Presets previews on the
// same canvas.
test('the cover keeps its workflow: back from the app, after a reload; New starts over', async ({ page }) => {
  test.setTimeout(240_000)
  await page.route('**/huggingface.co/**', (r) => r.abort())
  await page.addInitScript(() => { try { localStorage.setItem('ts.onboarding.seen', '1') } catch { /* private mode */ } })
  await page.goto('/')
  const name = page.getByTestId('cover-chain-name')
  const on = page.locator('[data-cover-node][data-on="1"]')
  await expect(on).toHaveCount(10)
  // From the shelf: a click adds it; C then Enter on an earlier node makes a local loop.
  await page.locator('[data-cover-node="built.core-lifts"]').click()
  await expect(on).toHaveCount(11)
  await page.locator('[data-cover-node="built.core-lifts"]').focus()
  await page.keyboard.press('c')
  await page.locator('[data-cover-node="built.sun"]').focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('[data-return]')).toHaveCount(1)
  await expect(name).toHaveText('Enter the Vancouver Tall Challenge (edited)')
  // Presets: hovering previews on the same canvas, Escape puts this workflow back.
  await page.getByTestId('cover-presets').click()
  await page.locator('[data-preset="eng-structure-wind"], [data-preset]').filter({ hasText: 'Structure and wind' }).first().hover()
  await expect(name).toHaveText('Structure and wind')
  await page.keyboard.press('Escape')
  await expect(name).toHaveText('Enter the Vancouver Tall Challenge (edited)')
  // Into the app and back by the logo: the same workflow, loop included.
  await page.getByTestId('cover-enter').click()
  await expect(page.getByTestId('phase-panel')).toBeVisible({ timeout: 90_000 })
  await page.getByRole('banner').getByRole('button').first().click()
  await expect(name).toHaveText('Enter the Vancouver Tall Challenge (edited)', { timeout: 30_000 })
  await expect(on).toHaveCount(11)
  await expect(page.locator('[data-return]')).toHaveCount(1)
  // After a reload too.
  await page.reload()
  await expect(name).toHaveText('Enter the Vancouver Tall Challenge (edited)', { timeout: 60_000 })
  await expect(page.locator('[data-return]')).toHaveCount(1)
  // Only New brings the default back; Undo returns the edited one.
  await page.getByTestId('cover-new').click()
  await expect(name).toHaveText('Enter the Vancouver Tall Challenge')
  await expect(on).toHaveCount(10)
  await page.keyboard.press('Control+z')
  await expect(name).toHaveText('Enter the Vancouver Tall Challenge (edited)')
})
