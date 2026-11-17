// Model | Presentation (Ruijie, 17 Nov: "At the very top of the page there is a Model / Presentation switch; one click
// takes you from design to layout … the clickable Site / Form / Program / Schematic / Present row at the top should
// probably go"). Driven like a user on the competition site, then Real Vancouver: the switch sits in the top bar; the
// phase row under the top bar is gone and the phases are a compact list in the left panel's Workflow block (its dots
// keep their colours, a click or the arrow keys go there, Back / Next walk the phases); Presentation shows that mode's
// own tools (in the rail and the workflow line) and none of them in Model; V switches; the design is untouched.
// Screenshots go to docs/evaluation/2026-11-17-model-presentation/.
import { expect, test, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { placeStartingTower } from './helpers'

const SHOTS = join(process.cwd(), 'docs', 'evaluation', '2026-11-17-model-presentation')
mkdirSync(SHOTS, { recursive: true })

const panel = (p: Page) => p.getByTestId('phase-panel')
const nav = (p: Page) => p.getByRole('navigation', { name: 'Design process' })
const rail = (p: Page) => p.getByRole('toolbar', { name: 'Design tools' })
const radio = (p: Page, name: 'Model' | 'Presentation') => p.getByRole('radiogroup', { name: 'Model or Presentation' }).getByRole('radio', { name })
const phases = (p: Page) => nav(p).locator('[data-phase]').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.phase))
const mapNodes = (p: Page) => p.getByTestId('phase-map').locator('[data-map-node]').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.mapNode))

test('Model | Presentation: the switch replaces the phase row; the phases list in the panel; present tools only in Presentation', async ({ page: p }) => {
  test.setTimeout(420_000)
  await p.addInitScript(() => { try { localStorage.setItem('ts.landing.skip', '1'); localStorage.setItem('ts.onboarding.seen', '1') } catch { /* ignore */ } })
  const errors: string[] = []
  p.on('pageerror', (e) => errors.push(e.message))
  await p.goto('/#/guided')
  await p.waitForSelector('#root > *', { timeout: 60_000 })
  await p.getByRole('tab', { name: 'Competition site' }).or(p.getByRole('button', { name: 'Competition site' })).first().click({ timeout: 120_000 })
  await placeStartingTower(p, { stay: true })
  await expect(panel(p)).toHaveAttribute('data-phase', 'form')

  // The switch is in the top bar, Model checked; the phase row under the top bar is gone: the one "Design process"
  // landmark is the panel's phase list, and the model region starts right under the top bar.
  const sw = p.getByTestId('mode-switch')
  await expect(sw).toBeVisible()
  await expect(p.locator('header').getByTestId('mode-switch')).toHaveCount(1)
  await expect(radio(p, 'Model')).toHaveAttribute('aria-checked', 'true')
  await expect(nav(p)).toHaveCount(1)
  await expect(panel(p).getByRole('navigation', { name: 'Design process' })).toHaveCount(1)
  expect(await phases(p)).toEqual(['site', 'form', 'program', 'schematic'])
  const header = (await p.locator('header').boundingBox())!, model = (await p.locator('[data-model-region]').boundingBox())!
  expect(model.y - (header.y + header.height)).toBeLessThan(20)
  // Model shows only the design phases' tools: the dots line and the rail carry none of Presentation's.
  expect((await mapNodes(p)).some((id) => id === 'design.frame' || id === 'built.provenance' || id === 'built.culture-claims')).toBe(false)
  await expect(rail(p).locator('[data-tool="boards"]')).toHaveCount(0)
  await expect(rail(p).locator('[data-mode="place"]')).toBeVisible()
  // Add tool offers the design phases' tools only.
  await p.getByTestId('phase-add').click()
  const more = p.getByTestId('phase-add-list').getByRole('button', { name: /Show tools from other phases/ })
  if (await more.isVisible().catch(() => false)) await more.click()
  await expect(p.getByTestId('phase-add-list').locator('[data-add="built.provenance"], [data-add="built.culture-claims"]')).toHaveCount(0)
  await p.getByRole('button', { name: 'Close Add tool' }).click()
  await p.waitForTimeout(800)
  await p.screenshot({ path: join(SHOTS, '01-model.png') })

  // A phase dot navigates; Back and Next walk the phases; the arrow keys move along the list.
  // No phase-name rows (17 Nov): the hooks are the line's coloured segments, which carry no visible text.
  expect(await nav(p).locator('[data-phase]').evaluateAll((els) => els.map((e) => (e.textContent ?? '').trim()))).toEqual(['', '', '', ''])
  await expect(nav(p).locator('[data-phase="site"]')).toHaveAttribute('aria-label', /^Site: /)
  await nav(p).locator('[data-phase="program"]').click()
  await expect(panel(p)).toHaveAttribute('data-phase', 'program')
  await expect(nav(p).locator('[data-phase="program"]')).toHaveAttribute('aria-current', 'step')
  await expect(panel(p).getByRole('heading', { level: 2, name: 'Program', exact: true })).toBeVisible()
  await p.getByTestId('phase-back').click()
  await expect(panel(p)).toHaveAttribute('data-phase', 'form')
  await nav(p).locator('[data-phase="form"]').focus()
  await p.keyboard.press('ArrowDown')
  await expect(panel(p)).toHaveAttribute('data-phase', 'program')
  await expect(nav(p).locator('[data-phase="program"]')).toBeFocused()
  await expect(p.getByTestId('phase-next')).toHaveAccessibleName('Next phase: Schematic')
  await p.getByTestId('phase-next').click()
  await expect(panel(p)).toHaveAttribute('data-phase', 'schematic')
  // The arrows stop at the ends (Site and Schematic) and never wrap; Presentation is the switch.
  await expect(p.getByTestId('phase-next')).toBeDisabled()
  await expect(p.getByTestId('phase-back')).toHaveAccessibleName('Previous phase: Program')
  await nav(p).locator('[data-phase="site"]').click()
  await expect(p.getByTestId('phase-back')).toBeDisabled()
  await expect(p.getByTestId('phase-next')).toHaveAccessibleName('Next phase: Form')
  await nav(p).locator('[data-phase="schematic"]').click()
  await radio(p, 'Presentation').click()
  await expect(radio(p, 'Presentation')).toHaveAttribute('aria-checked', 'true')
  await expect(panel(p)).toHaveAttribute('data-phase', 'present')

  // Presentation: the model locked, the filmstrip in the panel, Present first on the right; the phase list is that
  // mode's one phase; the rail and the dots line show Presentation's tools and no edit modes.
  await expect(p.getByTestId('model-locked')).toBeVisible()
  await expect(panel(p).getByTestId('filmstrip')).toBeVisible()
  await expect(p.getByRole('complementary', { name: 'Present and results' }).getByRole('tab', { name: 'Present' })).toHaveAttribute('aria-selected', 'true')
  expect(await phases(p)).toEqual(['present'])
  await expect(nav(p).locator('[data-phase="present"]')).toHaveAttribute('aria-label', /^Presentation: /)
  await expect(rail(p).locator('[data-tool="boards"]')).toBeVisible()
  await expect(rail(p).locator('[data-tool="capture"]')).toBeVisible()
  await expect(rail(p).locator('[data-mode]')).toHaveCount(0)
  expect((await mapNodes(p)).every((id) => id === 'design.frame' || id === 'built.provenance' || id === 'built.culture-claims')).toBe(true)
  // The Render tool in the rail opens the Render tab on the right.
  await rail(p).locator('[data-tool="render"]').click()
  await expect(p.getByRole('complementary', { name: 'Present and results' }).getByRole('tab', { name: 'Render' })).toHaveAttribute('aria-selected', 'true')
  await p.waitForTimeout(800)
  await p.screenshot({ path: join(SHOTS, '02-presentation.png') })

  // Model brings back the design step last used (Schematic), its tools and the four phases; the design is untouched (Undo stays off).
  await radio(p, 'Model').click()
  await expect(panel(p)).toHaveAttribute('data-phase', 'schematic')
  expect(await phases(p)).toEqual(['site', 'form', 'program', 'schematic'])
  await expect(rail(p).locator('[data-tool="boards"]')).toHaveCount(0)
  await expect(p.getByTestId('model-locked')).toHaveCount(0)
  // V toggles from the keyboard; 3 and 1 still jump to Presentation and Massing.
  await p.keyboard.press('v')
  await expect(radio(p, 'Presentation')).toHaveAttribute('aria-checked', 'true')
  await p.keyboard.press('v')
  await expect(radio(p, 'Model')).toHaveAttribute('aria-checked', 'true')
  await expect(panel(p)).toHaveAttribute('data-phase', 'schematic')
  await p.keyboard.press('3')
  await expect(panel(p)).toHaveAttribute('data-phase', 'present')
  await p.keyboard.press('1') // Massing: the last Massing step used (Program here)
  await expect(radio(p, 'Model')).toHaveAttribute('aria-checked', 'true')
  await expect(panel(p)).toHaveAttribute('data-phase', /^(site|form|program)$/)

  // Real Vancouver: the same switch and list.
  await p.getByRole('tab', { name: 'Real Vancouver' }).click()
  await p.waitForTimeout(3000)
  await p.getByRole('button', { name: 'Start designing' }).click({ timeout: 3000 }).catch(() => {})
  await expect(nav(p)).toHaveCount(1)
  await radio(p, 'Presentation').click()
  await expect(panel(p)).toHaveAttribute('data-phase', 'present')
  await expect(rail(p).locator('[data-tool="boards"]')).toBeVisible()
  await radio(p, 'Model').click()
  await expect(panel(p)).not.toHaveAttribute('data-phase', 'present')
  expect(await phases(p)).toEqual(['site', 'form', 'program', 'schematic'])
  expect(errors).toEqual([])
})
