// Node Icon System (Ruijie, 7 Nov): a node you import gets an icon in the node builder's Icons tab, generated in the
// toolkit's style or uploaded; the tile is the toolkit's; SVG is refused; the agent instructions can be copied.
import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
const PNG = path.join(here, '../public/style-pack/node-icons/v1/example-node/icon.png')

test('a community node gets a generated icon, then an uploaded one, and SVG is refused', async ({ page: p }) => {
  test.setTimeout(180_000)
  await p.addInitScript(() => { try { localStorage.setItem('ts.landing.skip', '0'); localStorage.setItem('ts.onboarding.seen', '1') } catch { /* ignore */ } })
  await p.goto('/#/guided')
  const dialog = p.getByRole('dialog', { name: 'Build your own node' })
  // the builder opens from the end of the node library
  // (it loads on demand: the first open can take a while on the dev server)
  const openBuilder = async () => {
    await p.getByRole('button', { name: /^Library$/ }).click({ timeout: 120_000 })
    await p.getByRole('dialog', { name: 'Node library' }).getByRole('button', { name: /Build your own node/ }).click()
    await expect(dialog).toBeVisible({ timeout: 60_000 })
  }
  await openBuilder()

  // the agent instructions live in the Build tab
  await expect(dialog.getByTestId('icon-instructions')).toBeVisible()
  await dialog.getByRole('button', { name: 'Show instructions' }).click()
  await expect(dialog.getByLabel('Icon instructions for an AI agent')).toHaveValue(/style-pack\/node-icons\/v1\/NODE_ICON_STYLE\.md/)
  await expect(dialog.getByRole('link', { name: /Download style pack/ })).toHaveAttribute('href', /node-icon-style-pack-v1\.zip$/)

  // no nodes yet: the Icons tab says how to get one
  await dialog.getByRole('tab', { name: 'Icons' }).click()
  await expect(dialog.getByTestId('icons-empty')).toBeVisible()

  // import the worked example
  await dialog.getByRole('tab', { name: 'Import a node' }).click()
  await dialog.getByRole('button', { name: 'Try the worked example' }).click()
  await dialog.getByRole('button', { name: /Add to My nodes/ }).click()
  await expect(dialog).toBeHidden()

  // in the node bar it shows the standard illustration; the Icons tab opens on it
  const tileButton = p.locator('[data-node="community.example.tower-width"]')
  await expect(tileButton.locator('[data-fallback-icon]')).toBeVisible({ timeout: 30_000 })
  await openBuilder()
  await dialog.getByRole('tab', { name: 'Icons' }).click()
  await expect(dialog.getByRole('radio', { name: /Tower width/ })).toHaveAttribute('aria-checked', 'true')
  const editor = dialog.getByTestId('icon-editor')
  await expect(editor).toBeVisible()
  await expect(editor.getByTestId('icon-preview').locator('[data-generated-icon]')).toHaveCount(3)
  // the editor passes WCAG 2.1 A/AA (serious and critical), like every other screen (a11y.e2e.ts)
  const axeDialog = async () => {
    const axe = await new AxeBuilder({ page: p }).include('[role="dialog"][aria-labelledby="nb-title"]').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    expect(axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([])
  }
  await axeDialog()

  // generate: change the concept, use it; the node's tile everywhere shows it
  await editor.getByLabel('Main object').selectOption('tower')
  await editor.getByLabel('Supporting cue').selectOption('check')
  await editor.getByTestId('icon-regenerate').click()
  await editor.getByTestId('icon-use').click()
  await expect(editor.getByRole('status')).toHaveText(/Icon saved/)
  await expect(tileButton.locator('[data-generated-icon^="1:tower:check:1"]')).toBeVisible()

  // upload: an SVG is refused by its contents, a PNG is checked and fitted in the same tile
  await editor.getByRole('tab', { name: 'Upload' }).click()
  await editor.getByTestId('icon-file').setInputFiles({ name: 'icon.png', mimeType: 'image/png', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><rect width="9" height="9"/></svg>') })
  await expect(editor.getByRole('alert')).toContainText('SVG')
  await editor.getByTestId('icon-file').setInputFiles(PNG)
  const checks = editor.getByTestId('icon-checks')
  await expect(checks.locator('li')).toHaveCount(5, { timeout: 30_000 }) // decoding and checking take a moment
  await expect(editor.getByTestId('icon-preview').locator('img[data-uploaded-icon]')).toHaveCount(3)
  await axeDialog()
  await editor.getByTestId('icon-restyle').click()
  await expect(editor.getByRole('radio', { name: 'Restyled' })).toHaveAttribute('aria-checked', 'true')
  await editor.getByRole('radio', { name: 'Original' }).click()
  await editor.getByTestId('icon-use-upload').click()
  await expect(editor.getByRole('status')).toHaveText(/Icon saved/)
  await expect(tileButton.locator('img[data-uploaded-icon]')).toBeVisible()
  await p.screenshot({ path: 'test-results/node-icons-upload.png' })

  // remove: back to the standard illustration; the node is still on
  await editor.getByRole('button', { name: 'Remove icon' }).click()
  await expect(tileButton.locator('[data-fallback-icon]')).toBeVisible()
})
