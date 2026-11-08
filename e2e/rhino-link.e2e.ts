// "Link Rhino live" (5 Nov, Ruijie: a Rhino plugin like Sun & Wind Studio's, with a tutorial on the Rhino import tab):
// the real public/rhino/tdt_link.py runs under tools/rhino_link_stub.py (Rhino stood in for; no Rhino on the build
// machine), the page connects, the first copy goes through the upload dialog, and an "edit in Rhino" updates the model.
// Also: the tutorial's download button serves the script, and what to type in Rhino is shown.
// Run: node node_modules/playwright/cli.js test e2e/rhino-link.e2e.ts (needs python on the PATH)
import { expect, test } from '@playwright/test'
import { spawn, type ChildProcess } from 'node:child_process'
import { join } from 'node:path'
import { openDesignTool, openResultDetails } from './helpers'

// The link's ports, as lib/interchange/rhinoLink.ts tries them (the page connects to the first one that answers).
const LINK_PORTS = [8798, 8799, 8800]
let stub: ChildProcess | null = null
/** The port the stub took; null when all the link's ports were already held (then the test is skipped). */
let stubPort: number | null = null
let portsBusy = ''
test.beforeAll(async () => {
  stub = spawn('python', ['-u', join(process.cwd(), 'tools', 'rhino_link_stub.py'), '--edit-every', '4'], { stdio: 'pipe' })
  let err = ''
  stub.stderr!.on('data', (d: Buffer) => { err += String(d) })
  await new Promise<void>((ok, fail) => {
    const t = setTimeout(() => fail(new Error(`the Rhino link stub did not start${err ? `: ${err.trim()}` : ''}`)), 20_000)
    stub!.stdout!.on('data', (d: Buffer) => {
      const m = /running on http:\/\/127\.0\.0\.1:(\d+)/.exec(String(d))
      if (m) { clearTimeout(t); stubPort = Number(m[1]); ok() }
      // Every link port taken (e.g. Rhino with the link open, plus others): nothing to test against, and the page
      // would read someone's real Rhino document. Skip rather than stop anyone's Rhino. (The script says so and the
      // stub keeps running, so it is read from the output.)
      const busy = /ports [\d, ]+ are all in use/.exec(String(d))
      if (busy) { clearTimeout(t); portsBusy = busy[0]; ok() }
    })
    stub!.on('exit', (code) => { clearTimeout(t); fail(new Error(`the Rhino link stub exited (${code}): ${err.trim()}`)) })
  })
})
test.afterAll(() => { stub?.kill() })

test('Link Rhino live: tutorial, download, connect, map once, then updates from Rhino', async ({ page }) => {
  test.setTimeout(300_000)
  test.skip(!stubPort, `the Rhino link stub found no free port (${portsBusy})`)
  // A real Rhino on this computer may already serve the link on 8798 (it does on Ruijie's laptop), so the stub takes the
  // next free port. The page connects to the first port that answers, so other link ports are refused for this page
  // only: it then finds the stub by the same search a user's page does, and reads the stub's model, not the open Rhino
  // document. Nothing outside the page is touched.
  await page.route((u) => u.hostname === '127.0.0.1' && LINK_PORTS.includes(Number(u.port)) && Number(u.port) !== stubPort, (r) => r.abort('connectionrefused'))
  await page.addInitScript(() => { try { localStorage.setItem('ts.landing.skip', '0'); localStorage.setItem('ts.onboarding.seen', '1') } catch { /* private mode */ } })
  await page.goto('/#/guided')
  await page.waitForSelector('#root > *', { timeout: 60_000 })
  await page.getByRole('tab', { name: 'Competition site' }).or(page.getByRole('button', { name: 'Competition site' })).first().click()
  const rail = page.getByRole('navigation', { name: 'Design process' })
  await rail.getByRole('button', { name: 'Site' }).click()
  await openDesignTool(page, 'rhino-import') // its icon, "Import", in the Site step's tools

  // The tutorial: the script to download, the Rhino command, and Connect.
  const box = page.getByTestId('rhino-live')
  await box.waitFor({ timeout: 60_000 })
  await expect(box).toContainText('Download tdt_link.py')
  await expect(box.locator('code').first()).toHaveText('RunPythonScript')
  await expect(box).toContainText('Off')
  const href = await page.getByTestId('rhino-download').getAttribute('href')
  const script = await page.evaluate(async (u) => { const r = await fetch(u!); return { ok: r.ok, text: (await r.text()).slice(0, 200) } }, href)
  expect(script.ok).toBe(true)
  expect(script.text).toContain('Tower Design Toolkit Link')

  // Connect: the first copy opens the upload dialog, mapped and checked like a file.
  await page.getByTestId('rhino-connect').click()
  const dialog = page.getByRole('dialog', { name: 'Import a model' })
  await expect(dialog).toBeVisible({ timeout: 30_000 })
  await expect(dialog.getByRole('combobox', { name: 'Role for Core' })).toHaveValue('core', { timeout: 120_000 })
  await dialog.getByRole('button', { name: /Check units, north and datum/ }).click()
  await expect(dialog.getByText('In plain words')).toBeVisible({ timeout: 120_000 })
  await dialog.getByRole('button', { name: /^Use this model|^Update / }).click()
  await expect(dialog).toBeHidden()
  // In the Site step the right panel opens on Your site (5 Nov); the towers' results are under Results & evidence.
  await page.getByRole('tab', { name: 'Results', exact: true }).click()
  await openResultDetails(page) // the rule cards sit under Details below the pass/fail checklist (6 Nov)
  // The checklist's passing rows are folded too; the card under Details is the one that shows.
  const bandA = page.getByText('Height band: Tower A').filter({ visible: true }).first()
  await expect(bandA).toBeVisible({ timeout: 60_000 })

  // Live: an edit in "Rhino" (the stub fires one every 4 s) updates the model with the same mapping.
  await expect(box).toContainText('Live', { timeout: 30_000 })
  await expect(box).toContainText(/Updated from Rhino at/, { timeout: 60_000 })
  await expect(bandA).toBeVisible()
  await box.getByRole('button', { name: 'Stop the link' }).click()
  await expect(box).toContainText('Off')
})
