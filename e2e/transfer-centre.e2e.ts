// The transfer centre, step 1 (Result B brief, 9 Nov, acceptance checks 1, 2, 4, 9, 12, 14): Import and Export open
// the same dialog without downloading anything; Cancel and Esc change nothing and give focus back; a geometry export
// previews its counts and writes a .glb only on "Export file"; the model stays as it was; it works from the builder too.
import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { placeStartingTower } from './helpers'

test('Import and Export open the centre; Cancel is clean; a glTF export is a real file; focus returns', async ({ page: p }) => {
  test.setTimeout(240_000)
  await p.addInitScript(() => { try { localStorage.setItem('ts.landing.skip', '0'); localStorage.setItem('ts.onboarding.seen', '1') } catch { /* */ } })
  await p.goto('/#/guided')
  const rail = p.getByRole('navigation', { name: 'Design process' })
  await rail.waitFor({ timeout: 120_000 })
  await p.getByRole('tab', { name: 'Competition site' }).click({ timeout: 120_000 })
  await placeStartingTower(p, { stay: true })
  const dialog = p.getByTestId('transfer-dialog')
  let downloads = 0
  p.on('download', () => downloads++)

  // 1 · opening downloads nothing; the purposes are listed, the unavailable one disabled, no action until a purpose is chosen
  await p.getByTestId('transfer-import').click()
  await expect(dialog).toHaveAttribute('data-tab', 'import')
  await expect(dialog.getByTestId('purpose-site')).toBeDisabled() // Real Vancouver only
  await expect(dialog.getByTestId('transfer-action')).toHaveCount(0)
  await dialog.getByTestId('transfer-tab-export').click()
  await expect(dialog).toHaveAttribute('data-tab', 'export')
  await expect(dialog.getByTestId('purpose-tool')).toBeDisabled() // no writer yet
  expect(downloads).toBe(0)

  // 4 · Cancel: nothing changed, focus back on the opener
  await dialog.getByTestId('transfer-cancel').waitFor({ state: 'detached' }).catch(() => {})
  await dialog.getByTestId('transfer-close').click()
  await expect(dialog).toHaveCount(0)
  await expect(p.getByTestId('transfer-import')).toBeFocused()
  expect(downloads).toBe(0)

  // 9 · geometry: the preview says what the file holds, Export file writes it
  await p.getByTestId('transfer-export').click()
  await dialog.getByTestId('purpose-geometry').click()
  await expect(dialog.getByTestId('transfer-preview')).toContainText(/\d+ solids on \d+ layers/)
  await dialog.locator('input[data-kind="glb"]').check()
  const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 60_000 }), dialog.getByTestId('transfer-action').click()])
  expect(dl.suggestedFilename()).toMatch(/^massing-vtc-\d{4}-\d{2}-\d{2}\.glb$/)
  await expect(dialog.getByTestId('transfer-status')).toContainText(/objects on \d+ layers/)
  // 12 · exporting mutates nothing: the tower list is as it was
  await p.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await p.getByRole('tab', { name: 'Your site' }).click().catch(() => {})
  await expect(p.getByText(/Towers on this site/).first()).toContainText('(1)')

  // 14 · Escape closes and returns focus; the Export route also works while the workflow builder is open (check 2)
  await p.getByTestId('edit-workflow-button').click()
  await p.getByTestId('workflow-builder').waitFor()
  await p.getByTestId('transfer-export').click()
  await expect(dialog).toBeVisible()
  await p.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(p.getByTestId('workflow-builder')).toBeVisible()
  await expect(p.getByTestId('transfer-export')).toBeFocused()
  await p.getByTestId('builder-continue').click()

  // drag-and-drop: a project backup dropped anywhere opens the centre on Import with the purpose read from the file
  await p.getByTestId('transfer-export').click()
  await dialog.getByTestId('purpose-backup').click()
  const [pkg] = await Promise.all([p.waitForEvent('download', { timeout: 60_000 }), dialog.getByTestId('transfer-action').click()])
  const text = readFileSync((await pkg.path())!, 'utf8')
  await p.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  const dt = await p.evaluateHandle((t) => { const d = new DataTransfer(); d.items.add(new File([t], 'backup.json', { type: 'application/json' })); return d }, text)
  await p.dispatchEvent('[data-model-region]', 'drop', { dataTransfer: dt })
  await expect(dialog).toHaveAttribute('data-tab', 'import')
  await expect(dialog.getByTestId('purpose-project')).toHaveAttribute('aria-checked', 'true')
  await expect(dialog.getByTestId('transfer-preview')).toContainText(/Competition site, 1 towers/)
  await expect(p.getByText(/Towers on this site/).first()).toContainText('(1)') // the drop changed nothing
  await p.keyboard.press('Escape')
})
