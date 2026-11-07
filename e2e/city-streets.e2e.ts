// The streets around a Real Vancouver study site (Ruijie, 7 Nov): take the default site, see its four streets with
// their measured widths in Your site, pick a type per street, answer the station-entrance question in Ground & public
// realm, and read the street rules in the three public realm nodes' results.
import { expect, test } from '@playwright/test'
import { openDesignTool, openResultDetails, placeStartingTower } from './helpers'

test('Real Vancouver streets: measured widths, types picked, street rules in the results', async ({ page }) => {
  test.setTimeout(900_000)
  await page.addInitScript(() => { try { localStorage.setItem('ts.landing.skip', '0'); localStorage.setItem('ts.onboarding.seen', '1') } catch { /* private mode */ } })
  await page.goto('/#/guided')
  await expect(page.getByRole('tablist', { name: 'Project' }).getByRole('tab', { name: 'Real Vancouver' })).toHaveAttribute('aria-selected', 'true', { timeout: 120_000 })

  // The default site, then a tower on it.
  await page.getByTestId('use-default-site').click()
  await placeStartingTower(page)

  // Your site: the four streets, Granville at its measured 24.4 m, no type until picked.
  const streets = page.getByTestId('site-streets').first()
  await expect(streets.locator('[data-street]')).toHaveCount(4, { timeout: 120_000 })
  await expect(streets.locator('[data-street="GRANVILLE ST"]')).toContainText('24.4 m')
  await expect(streets.locator('[data-street="HOWE ST"]')).toContainText('20.1 m')
  await expect(streets).toContainText('4 streets have no type yet')
  const pick = (street: string, type: string) => streets.getByRole('radiogroup', { name: `${street} street type` }).getByRole('radio', { name: type })
  await pick('Granville St', 'Retail').click()
  await expect(pick('Granville St', 'Retail')).toHaveAttribute('aria-checked', 'true')
  await pick('Howe St', 'Arterial').click()
  await pick('W Pender St', 'Local').click()
  await pick('Dunsmuir St', 'Local').click()
  await expect(streets).not.toContainText('no type yet')

  // Ground & public realm (Program step): the same streets with their frontage, and the station-entrance question.
  await page.getByRole('navigation', { name: 'Design process' }).locator('[data-step="program"]').click()
  await openDesignTool(page, 'ground')
  const panel = page.getByTestId('city-public-realm')
  await expect(panel).toBeVisible()
  await expect(panel.getByRole('spinbutton', { name: 'Granville St active share' })).toHaveValue('90') // the retail starting value
  await panel.getByTestId('city-station').selectOption('GRANVILLE ST')

  // Results: the street rules run, named by street (the checklist folds its passing rows, so read the visible card).
  await page.getByRole('tab', { name: /Results/ }).first().click()
  const show = page.getByLabel('Show results for')
  await show.selectOption('built.pr-streetwall')
  await openResultDetails(page)
  await expect(page.getByText('Streetwall on Granville St').filter({ visible: true }).first()).toBeVisible({ timeout: 60_000 })
  await expect(page.getByText('Streetwall continuity on Granville St').filter({ visible: true }).first()).toBeVisible()
  await show.selectOption('built.pr-frontage')
  await openResultDetails(page)
  await expect(page.getByText('Active frontage on Granville St').filter({ visible: true }).first()).toBeVisible()
  await show.selectOption('built.pr-ground')
  await openResultDetails(page)
  await expect(page.getByText('Transit plaza by the station entrance').filter({ visible: true }).first()).toBeVisible()
  await expect(page.getByText('Mid-block connection').filter({ visible: true }).first()).toBeVisible()
  await expect(page.getByRole('img', { name: /Plan of the study site with its streets/ })).toBeVisible()
})
