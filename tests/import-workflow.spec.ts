import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'

// MIH_test_schedule.xls contains:
//   29 events  (13 in Aug 2026, 15 in Sep 2026, 1 in Nov 2026)
//   1 team:    "EHC Mighty Oaks U12"
//   11 people: Mick Darko, Dortie Ruben, Hereby Joe, Moveon Marry, Moser Steven,
//              Ry Lin, O'Relly Sven, Hischier Marco, Hancock Herbie, Bergman Lars,
//              Mickely Darko
const FIXTURE_FILE = fileURLToPath(new URL('fixtures/MIH_test_schedule.xls', import.meta.url))
const EXPECTED_EVENTS = 29
const EXPECTED_TEAMS = 1
const EXPECTED_PEOPLE = 11
const EXPECTED_TEAM_NAME = 'EHC Mighty Oaks U12'
// Month delta (can be negative) from the current month to August 2026.
function monthsDeltaToAugust2026(): number {
  const now = new Date()
  const target = new Date(2026, 7, 1) // month is 0-indexed; 7 = August
  return (target.getFullYear() - now.getFullYear()) * 12 + (target.getMonth() - now.getMonth())
}

test('import MIH schedule: full workflow – import, preview, commit, schedule, teams, people', async ({ page }) => {
  await page.goto('/')

  // ── 1. Navigate to Sources ────────────────────────────────────────────────
  await page.getByRole('button', { name: 'Quellen' }).click()
  await expect(page.getByRole('heading', { name: 'Quellen' })).toBeVisible()

  // ── 2. Open the import dialog ─────────────────────────────────────────────
  await page.getByRole('button', { name: '+ Datei importieren' }).click()
  await expect(page.locator('.drawer')).toBeVisible()

  // ── 3. Upload the fixture file ────────────────────────────────────────────
  const fileInput = page.locator('input[type="file"]')
  await fileInput.setInputFiles(FIXTURE_FILE)

  // ── 4. Verify the import preview ──────────────────────────────────────────
  const previewBox = page.locator('.preview-box')
  await expect(previewBox).toBeVisible()

  // No error banner
  await expect(previewBox.locator('p[style*="danger"]')).toHaveCount(0)

  // KPI: total events
  const totalKpi = previewBox.locator('.kpi').filter({ hasText: 'Events' }).locator('b')
  await expect(totalKpi).toHaveText(String(EXPECTED_EVENTS))

  // KPI: all events are new (first import)
  const newKpi = previewBox.locator('.kpi').filter({ has: page.locator('span', { hasText: /^neu$/ }) }).locator('b')
  await expect(newKpi).toHaveText(String(EXPECTED_EVENTS))

  // KPI: new teams and people
  const newTeamsKpi = previewBox.locator('.kpi').filter({ hasText: 'neue Teams' }).locator('b')
  await expect(newTeamsKpi).toHaveText(String(EXPECTED_TEAMS))

  const newPeopleKpi = previewBox.locator('.kpi').filter({ hasText: 'neue Personen' }).locator('b')
  await expect(newPeopleKpi).toHaveText(String(EXPECTED_PEOPLE))

  // ── 5. Commit the import ──────────────────────────────────────────────────
  await page.locator('.drawer button', { hasText: /Importieren \(/ }).click()
  await expect(page.locator('.drawer')).toHaveCount(0)

  // ── 6. Verify the source row in the table ─────────────────────────────────
  const sourceRows = page.locator('.grid tbody tr')
  await expect(sourceRows).toHaveCount(1)
  await expect(sourceRows.first()).toContainText('MIH_test_schedule.xls')
  await expect(sourceRows.first()).toContainText(String(EXPECTED_EVENTS))

  // ── 7. Switch to Spielplan and verify events appear in the calendar ───────
  await page.getByRole('button', { name: 'Spielplan' }).click()

  // Navigate forward month-by-month until we reach August 2026 where the
  // bulk of the events live (13 events in Aug, 15 in Sep, 1 in Nov).
const months = monthsDeltaToAugust2026()
const navButton = months >= 0 ? 'button.fc-next-button' : 'button.fc-prev-button'
for (let i = 0; i < Math.abs(months); i++) {
  await page.locator(navButton).click()
}
  // The month grid should render event pills for August 2026.
  await expect(page.locator('.fc-daygrid-event')).not.toHaveCount(0)

  // ── 8. Switch to Teams and verify the imported team ───────────────────────
  await page.getByRole('button', { name: 'Teams' }).click()
  const teamRows = page.locator('.grid tbody tr')
  await expect(teamRows).toHaveCount(EXPECTED_TEAMS)
  await expect(teamRows.first()).toContainText(EXPECTED_TEAM_NAME)

  // ── 9. Switch to Personen and verify the imported people ──────────────────
  await page.getByRole('button', { name: 'Personen' }).click()
  const personRows = page.locator('.grid tbody tr')
  await expect(personRows).toHaveCount(EXPECTED_PEOPLE)
})
