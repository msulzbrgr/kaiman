import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'

const FIXTURE_FILE = fileURLToPath(new URL('fixtures/MIH_test_schedule.xls', import.meta.url))

function monthsDeltaToAugust2026(): number {
  const now = new Date()
  const target = new Date(2026, 7, 1)
  return (target.getFullYear() - now.getFullYear()) * 12 + (target.getMonth() - now.getMonth())
}

async function importFixture(page: import('@playwright/test').Page): Promise<void> {
  await page.getByRole('button', { name: 'Quellen' }).click()
  await page.getByRole('button', { name: '+ Datei importieren' }).click()
  await expect(page.locator('.drawer')).toBeVisible()

  await page.locator('input[type="file"]').setInputFiles(FIXTURE_FILE)
  await expect(page.locator('.preview-box')).toBeVisible()
  await page.locator('.drawer button', { hasText: /Importieren \(/ }).click()
  await expect(page.locator('.drawer')).toHaveCount(0)

  await page.getByRole('button', { name: 'Spielplan' }).click()
}

test('split view keeps ranges synced and manages saved states', async ({ page }) => {
  await page.goto('/')
  await importFixture(page)

  await page.locator('.schedule-desktop-bar button', { hasText: 'Split-View' }).click()

  await expect(page.locator('.schedule-split-toolbar')).toBeVisible()
  await expect(page.locator('.schedule-split-pane')).toHaveCount(2)
  const toolbarToggle = page.locator('button[aria-label="Split-View-Steuerung einklappen"]')
  await toolbarToggle.click()
  await expect(page.getByRole('button', { name: 'Stand speichern' })).toHaveCount(0)
  await page.locator('button[aria-label="Split-View-Steuerung ausklappen"]').click()
  await expect(page.getByRole('button', { name: 'Stand speichern' })).toBeVisible()

  const leftPane = page.locator('.schedule-split-pane--left')
  const rightPane = page.locator('.schedule-split-pane--right')

  const months = monthsDeltaToAugust2026()
  const navButton = months >= 0 ? 'button.fc-next-button' : 'button.fc-prev-button'
  for (let i = 0; i < Math.abs(months); i++) {
    await leftPane.locator(navButton).click()
  }

  await expect(leftPane.locator('.fc-daygrid-event')).not.toHaveCount(0)

  await leftPane.locator('button.fc-timeGridWeek-button').click()
  await expect(leftPane.locator('.fc-timegrid-slot')).not.toHaveCount(0)
  await expect(rightPane.locator('.fc-timegrid-slot')).not.toHaveCount(0)

  const leftImportedCount = await leftPane.locator('.import-card').count()
  const rightImportedCount = await rightPane.locator('.import-card').count()
  expect(leftImportedCount).toBe(rightImportedCount)

  await leftPane.locator('button.fc-next-button').click()
  await expect(leftPane.locator('.import-card')).toHaveCount(await rightPane.locator('.import-card').count())

  const stateSelect = page.locator('.schedule-split-select')
  await expect(stateSelect.locator('option')).toHaveCount(1)

  await page.getByRole('button', { name: 'Stand speichern' }).click()
  await expect(stateSelect.locator('option')).toHaveCount(2)

  await page.getByRole('button', { name: 'Differenz' }).click()
  await expect(page.getByText(/^Neu: \d+ · Entfernt: \d+ · Geändert: \d+$/)).toBeVisible()

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export' }).click()
  await downloadPromise

  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Löschen' }).click()
  await expect(stateSelect.locator('option')).toHaveCount(1)
})
