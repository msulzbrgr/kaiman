import * as path from 'path'
import { expect, test } from '@playwright/test'

const FIXTURE_FILE = path.join(__dirname, 'fixtures', 'MIH_test_schedule.xlsx')

test('import MIH schedule file and verify events appear in the calendar', async ({ page }) => {
  await page.goto('/')

  // ── Navigate to Sources ──────────────────────────────────────────────────
  await page.getByRole('button', { name: 'Quellen' }).click()
  await expect(page.getByRole('heading', { name: 'Quellen' })).toBeVisible()

  // ── Open import dialog ───────────────────────────────────────────────────
  await page.getByRole('button', { name: '+ Datei importieren' }).click()
  await expect(page.locator('.drawer')).toBeVisible()

  // ── Upload test data file ────────────────────────────────────────────────
  const fileInput = page.locator('input[type="file"]')
  await fileInput.setInputFiles(FIXTURE_FILE)

  // ── Verify preview ───────────────────────────────────────────────────────
  // At least one event must be shown in the preview
  const previewBox = page.locator('.preview-box')
  await expect(previewBox).toBeVisible()
  await expect(previewBox.locator('.kpi').filter({ hasText: 'Events' })).toBeVisible()

  const totalKpi = previewBox.locator('.kpi').filter({ hasText: 'Events' }).locator('b')
  const totalText = await totalKpi.textContent()
  expect(Number(totalText)).toBeGreaterThan(0)

  // No error banner must be shown
  await expect(previewBox.locator('p[style*="danger"]')).toHaveCount(0)

  // ── Commit the import ────────────────────────────────────────────────────
  await page.locator('.drawer button', { hasText: /Importieren \(/ }).click()
  await expect(page.locator('.drawer')).toHaveCount(0)

  // ── Verify source row appears in the sources table ───────────────────────
  await expect(page.locator('.grid tbody tr')).toHaveCount(1)

  // ── Switch to Schedule and verify events are rendered ────────────────────
  await page.getByRole('button', { name: 'Spielplan' }).click()
  // Month view is the default; switch to list/week is not strictly necessary,
  // but the FullCalendar event dots should be present on the month grid.
  await expect(page.locator('.fc-event')).not.toHaveCount(0)

  // ── Switch to Teams and verify at least one team was created ─────────────
  await page.getByRole('button', { name: 'Teams' }).click()
  await expect(page.locator('.grid tbody tr').first()).toBeVisible()

  // ── Switch to Personen and verify at least one person was created ─────────
  await page.getByRole('button', { name: 'Personen' }).click()
  await expect(page.locator('.grid tbody tr').first()).toBeVisible()
})
