import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'

const SCHEDULE_FIXTURE = fileURLToPath(
  new URL('fixtures/MIH_Club_schedulelist(U14).xls', import.meta.url),
)
const PRACTICE_FIXTURE = fileURLToPath(
  new URL('fixtures/MIH_U14_practicelist.xls', import.meta.url),
)

function monthsDeltaToAugust2026(): number {
  const now = new Date()
  const target = new Date(2026, 7, 1)
  return (target.getFullYear() - now.getFullYear()) * 12 + (target.getMonth() - now.getMonth())
}

test('practice list import updates existing entries and shows player ratio', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Quellen' }).click()
  await page.getByRole('button', { name: '+ Datei importieren' }).click()

  const fileInput = page.locator('input[type="file"]')
  await fileInput.setInputFiles([SCHEDULE_FIXTURE, PRACTICE_FIXTURE])

  const schedulePreview = page.locator('.preview-box').filter({ hasText: 'MIH_Club_schedulelist(U14).xls' })
  const practicePreview = page.locator('.preview-box').filter({ hasText: 'MIH_U14_practicelist.xls' })

  await expect(schedulePreview).toBeVisible()
  await expect(practicePreview).toBeVisible()
  await expect(practicePreview).toContainText('Dry Run: Kein bestehender Termin für diese Einträge gefunden:')

  const unmatchedKpi = practicePreview.locator('.kpi').filter({ hasText: 'kein Treffer' }).locator('b')
  await expect(unmatchedKpi).not.toHaveText('0')

  await page.locator('.drawer button', { hasText: /Importieren \(/ }).click()
  await expect(page.locator('.drawer')).toHaveCount(0)

  await page.getByRole('button', { name: 'Spielplan' }).click()
  const months = monthsDeltaToAugust2026()
  const navButton = months >= 0 ? 'button.fc-next-button' : 'button.fc-prev-button'
  for (let i = 0; i < Math.abs(months); i++) {
    await page.locator(navButton).click()
  }

  await expect(page.locator('.fc').getByText('17/21 Spieler').first()).toBeVisible()
})
