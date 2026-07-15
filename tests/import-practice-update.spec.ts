import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'

const SCHEDULE_FIXTURE = fileURLToPath(
  new URL('fixtures/MIH_Club_schedulelist(U14).xls', import.meta.url),
)
const PRACTICE_FIXTURE = fileURLToPath(
  new URL('fixtures/MIH_U14_practicelist.xls', import.meta.url),
)
const SCHEDULE_FIXTURE_U12 = fileURLToPath(
  new URL('fixtures/MIH_test_schedule.xls', import.meta.url),
)
const PRACTICE_FIXTURE_U12 = fileURLToPath(
  new URL(
    'fixtures/MIH_EHCMightyOaksU12_15.07.2026-30.04.2027_practicelist.xls',
    import.meta.url,
  ),
)

function monthsDeltaToAugust2026(): number {
  const now = new Date()
  const target = new Date(2026, 7, 1)
  return (target.getFullYear() - now.getFullYear()) * 12 + (target.getMonth() - now.getMonth())
}

function monthsDeltaToSeptember2026(): number {
  const now = new Date()
  const target = new Date(2026, 8, 1) // month is 0-indexed; 8 = September
  return (target.getFullYear() - now.getFullYear()) * 12 + (target.getMonth() - now.getMonth())
}

async function navigateToAugust2026(page: Page) {
  const months = monthsDeltaToAugust2026()
  const navButton = months >= 0 ? 'button.fc-next-button' : 'button.fc-prev-button'
  for (let i = 0; i < Math.abs(months); i++) {
    await page.locator(navButton).click()
  }
}

async function navigateToSeptember2026(page: Page) {
  const months = monthsDeltaToSeptember2026()
  const navButton = months >= 0 ? 'button.fc-next-button' : 'button.fc-prev-button'
  for (let i = 0; i < Math.abs(months); i++) {
    await page.locator(navButton).click()
  }
}

async function cancelAllEvents(page: Page) {
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('mih-schedule')
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        const db = request.result
        const tx = db.transaction('events', 'readwrite')
        const store = tx.objectStore('events')
        const getAll = store.getAll()
        getAll.onerror = () => reject(getAll.error)
        getAll.onsuccess = () => {
          for (const event of getAll.result) {
            store.put({ ...event, status: 'cancelled' })
          }
        }
        tx.oncomplete = () => {
          db.close()
          resolve()
        }
        tx.onerror = () => reject(tx.error)
      }
    })
  })
}

function updatedKpi(preview: Locator, page: Page) {
  return preview
    .locator('.kpi')
    .filter({ has: page.locator('span', { hasText: 'aktualisiert' }) })
    .locator('b')
}

function unmatchedKpi(preview: Locator) {
  return preview.locator('.kpi').filter({ hasText: 'kein Treffer' }).locator('b')
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
  await navigateToAugust2026(page)

  await expect(page.locator('.fc').getByText('17/21 Spieler').first()).toBeVisible()
})

test('practice list imported before schedule still applies player counts', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Quellen' }).click()
  await page.getByRole('button', { name: '+ Datei importieren' }).click()

  // Upload practice list FIRST – the importer must commit the schedule before the practice-update
  const fileInput = page.locator('input[type="file"]')
  await fileInput.setInputFiles([PRACTICE_FIXTURE, SCHEDULE_FIXTURE])

  const practicePreview = page.locator('.preview-box').filter({ hasText: 'MIH_U14_practicelist.xls' })
  await expect(practicePreview).toBeVisible()

  // Practice list preview shows 0 new events (Verfügbar rows never create new entries)
  const newKpi = practicePreview.locator('.kpi').filter({ has: page.locator('span', { hasText: /^neu$/ }) }).locator('b')
  await expect(newKpi).toHaveText('0')

  await page.locator('.drawer button', { hasText: /Importieren \(/ }).click()
  await expect(page.locator('.drawer')).toHaveCount(0)

  await page.getByRole('button', { name: 'Spielplan' }).click()
  await navigateToAugust2026(page)

  // Player counts must be present even though practice list was uploaded before the schedule
  await expect(page.locator('.fc').getByText('17/21 Spieler').first()).toBeVisible()
})

test('practice list import alone creates no new schedule events', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Quellen' }).click()
  await page.getByRole('button', { name: '+ Datei importieren' }).click()

  const fileInput = page.locator('input[type="file"]')
  await fileInput.setInputFiles([PRACTICE_FIXTURE])

  const practicePreview = page.locator('.preview-box').filter({ hasText: 'MIH_U14_practicelist.xls' })
  await expect(practicePreview).toBeVisible()

  // Verfügbar rows must never appear as new events in the preview
  const newKpi = practicePreview.locator('.kpi').filter({ has: page.locator('span', { hasText: /^neu$/ }) }).locator('b')
  await expect(newKpi).toHaveText('0')

  await page.locator('.drawer button', { hasText: /Importieren \(/ }).click()
  await expect(page.locator('.drawer')).toHaveCount(0)

  // Navigate to the schedule – no events should have been created
  await page.getByRole('button', { name: 'Spielplan' }).click()
  await navigateToAugust2026(page)
  await expect(page.locator('.fc-daygrid-event')).toHaveCount(0)
})

// ── EHC Mighty Oaks U12 practice list tests ────────────────────────────────
// The U12 schedule uses ageGroup "Erfassungsstufe" (a scheduling-system category
// label), while the team in the DB stores the derived ageGroup "U12".  The
// practice list also carries "Erfassungsstufe", so the matching must check the
// raw ageGroup stored on each event – not only the team's derived ageGroupKey.

test('U12 practice list updates player counts for matched schedule entries', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Quellen' }).click()

  // Step 1: Import the schedule alone so events are in the DB before the practice preview.
  await page.getByRole('button', { name: '+ Datei importieren' }).click()
  const fileInput = page.locator('input[type="file"]')
  await fileInput.setInputFiles([SCHEDULE_FIXTURE_U12])
  await page.locator('.drawer button', { hasText: /Importieren \(/ }).click()
  await expect(page.locator('.drawer')).toHaveCount(0)

  // Step 2: Import the practice list – schedule events are now committed in the DB.
  await page.getByRole('button', { name: '+ Datei importieren' }).click()
  await fileInput.setInputFiles([PRACTICE_FIXTURE_U12])

  const practicePreview = page.locator('.preview-box').filter({
    hasText: 'MIH_EHCMightyOaksU12_15.07.2026-30.04.2027_practicelist.xls',
  })
  await expect(practicePreview).toBeVisible()

  // 14 practice entries match schedule slots; 9 have no corresponding event.
  await expect(updatedKpi(practicePreview, page)).toHaveText('14')
  await expect(unmatchedKpi(practicePreview)).toHaveText('9')

  // The Dry Run section lists the 9 unmatched slots.
  await expect(practicePreview).toContainText('Dry Run: Kein bestehender Termin für diese Einträge gefunden:')

  await page.locator('.drawer button', { hasText: /Importieren \(/ }).click()
  await expect(page.locator('.drawer')).toHaveCount(0)

  // Navigate to August 2026 and verify a specific player ratio is visible.
  // 13.08.26 @ 18:40 → available=37, additional=87, total=124 → "37/124 Spieler"
  await page.getByRole('button', { name: 'Spielplan' }).click()
  await navigateToAugust2026(page)
  await expect(page.locator('.fc').getByText('37/124 Spieler').first()).toBeVisible()
})

test('U12 practice list: entries without a matching schedule slot are not applied', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Quellen' }).click()
  await page.getByRole('button', { name: '+ Datei importieren' }).click()

  // Import schedule and practice list together; commitAll() commits schedule first so
  // the practice update can resolve matches against the freshly committed events.
  const fileInput = page.locator('input[type="file"]')
  await fileInput.setInputFiles([SCHEDULE_FIXTURE_U12, PRACTICE_FIXTURE_U12])

  const practicePreview = page.locator('.preview-box').filter({
    hasText: 'MIH_EHCMightyOaksU12_15.07.2026-30.04.2027_practicelist.xls',
  })
  await expect(practicePreview).toBeVisible()

  const updatedKpi = practicePreview
    .locator('.kpi')
    .filter({ has: page.locator('span', { hasText: 'aktualisiert' }) })
    .locator('b')
  await expect(updatedKpi).toHaveText('14')

  const unmatchedKpi = practicePreview.locator('.kpi').filter({ hasText: 'kein Treffer' }).locator('b')
  await expect(unmatchedKpi).toHaveText('9')

  await page.locator('.drawer button', { hasText: /Importieren \(/ }).click()
  await expect(page.locator('.drawer')).toHaveCount(0)

  // Navigate to September 2026: matched practice entries must carry player ratios.
  // 02.09.26 @ 18:30 → available=52, additional=72, total=124 → "52/124 Spieler"
  await page.getByRole('button', { name: 'Spielplan' }).click()
  await navigateToSeptember2026(page)
  await expect(page.locator('.fc').getByText('52/124 Spieler').first()).toBeVisible()
})

test('U12 practice list ignores cancelled schedule events', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Quellen' }).click()

  await page.getByRole('button', { name: '+ Datei importieren' }).click()
  const fileInput = page.locator('input[type="file"]')
  await fileInput.setInputFiles([SCHEDULE_FIXTURE_U12])
  await page.locator('.drawer button', { hasText: /Importieren \(/ }).click()
  await expect(page.locator('.drawer')).toHaveCount(0)

  await cancelAllEvents(page)

  await page.getByRole('button', { name: '+ Datei importieren' }).click()
  await fileInput.setInputFiles([PRACTICE_FIXTURE_U12])

  const practicePreview = page.locator('.preview-box').filter({
    hasText: 'MIH_EHCMightyOaksU12_15.07.2026-30.04.2027_practicelist.xls',
  })
  await expect(practicePreview).toBeVisible()

  await expect(updatedKpi(practicePreview, page)).toHaveText('0')
  await expect(unmatchedKpi(practicePreview)).toHaveText('23')

  await page.locator('.drawer button', { hasText: /Importieren \(/ }).click()
  await expect(page.locator('.drawer')).toHaveCount(0)

  await page.getByRole('button', { name: 'Spielplan' }).click()
  await navigateToAugust2026(page)
  await expect(page.locator('.fc').getByText(/Spieler/)).toHaveCount(0)
})

test('U12 practice list: mismatched team name does not update player counts', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Quellen' }).click()
  await page.getByRole('button', { name: '+ Datei importieren' }).click()

  // Import the U12 schedule together with the U14 practice list.
  // The U14 practice entries carry team "U14" which does not match "EHC Mighty Oaks U12",
  // so every entry must be reported as "kein Treffer" even when date/time overlap.
  const fileInput = page.locator('input[type="file"]')
  await fileInput.setInputFiles([SCHEDULE_FIXTURE_U12, PRACTICE_FIXTURE])

  const practicePreview = page.locator('.preview-box').filter({ hasText: 'MIH_U14_practicelist.xls' })
  await expect(practicePreview).toBeVisible()

  // No U14 practice entry should match any U12 schedule event.
  await expect(updatedKpi(practicePreview, page)).toHaveText('0')

  await page.locator('.drawer button', { hasText: /Importieren \(/ }).click()
  await expect(page.locator('.drawer')).toHaveCount(0)

  // August 2026 U12 events must have no player counts after the import.
  await page.getByRole('button', { name: 'Spielplan' }).click()
  await navigateToAugust2026(page)
  await expect(page.locator('.fc').getByText(/Spieler/)).toHaveCount(0)
})
