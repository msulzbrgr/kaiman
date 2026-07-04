import { expect, test, type Page } from '@playwright/test'

function toLocalInput(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function mondayOfCurrentWeek(): Date {
  const today = new Date()
  const mondayOffset = (today.getDay() + 6) % 7
  const monday = new Date(today)
  monday.setHours(0, 0, 0, 0)
  monday.setDate(today.getDate() - mondayOffset)
  return monday
}

async function createTeam(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: 'Teams' }).click()
  page.once('dialog', (dialog) => dialog.accept(name))
  await page.getByRole('button', { name: '+ Team' }).click()
  await expect(page.getByText(name, { exact: false })).toBeVisible()
  await page.getByRole('button', { name: 'Spielplan' }).click()
}

async function createEvent(page: Page, start: Date, end: Date, remarks?: string): Promise<void> {
  await page.getByRole('button', { name: '+ Neues Event' }).click()
  await expect(page.locator('.drawer')).toBeVisible()

  const dateTimeInputs = page.locator('.drawer input[type="datetime-local"]')
  await dateTimeInputs.nth(0).fill(toLocalInput(start))
  await dateTimeInputs.nth(1).fill(toLocalInput(end))

  if (remarks !== undefined) {
    await page.locator('.field', { hasText: 'Bemerkungen' }).locator('.editable').click()
    await page.locator('.drawer textarea').fill(remarks)
    await dateTimeInputs.nth(0).click()
  }

  await page.locator('.drawer button', { hasText: '✕' }).click()
  await expect(page.locator('.drawer')).toHaveCount(0)
}

test('week view uses slot range from visible week entries only', async ({ page }) => {
  const monday = mondayOfCurrentWeek()

  const visibleStart = new Date(monday)
  visibleStart.setDate(monday.getDate() + 2)
  visibleStart.setHours(10, 0, 0, 0)
  const visibleEnd = new Date(visibleStart)
  visibleEnd.setHours(11, 0, 0, 0)

  const hiddenStart = new Date(visibleStart)
  hiddenStart.setDate(hiddenStart.getDate() + 10)
  hiddenStart.setHours(2, 0, 0, 0)
  const hiddenEnd = new Date(hiddenStart)
  hiddenEnd.setHours(3, 0, 0, 0)

  await page.goto('/')
  await createTeam(page, 'EHC Zuchwil Regio U12')
  await createEvent(page, visibleStart, visibleEnd)
  await createEvent(page, hiddenStart, hiddenEnd)

  await page.locator('button.fc-timeGridWeek-button').click()

  const slotTimes = await page.locator('.fc-timegrid-slot').evaluateAll((elements) => {
    const times = elements
      .map((element) => element.getAttribute('data-time'))
      .filter((time): time is string => time !== null)
    return [...new Set(times)]
  })

  const earliestSlotTime = [...slotTimes].sort()[0]
  expect(earliestSlotTime).toBe('09:00:00')
  expect(slotTimes).toContain('11:30:00')
  expect(slotTimes).not.toContain('01:00:00')
})

test('team filters include short remarks only and filter matching events', async ({ page }) => {
  const monday = mondayOfCurrentWeek()

  const shortStart = new Date(monday)
  shortStart.setDate(monday.getDate() + 1)
  shortStart.setHours(10, 0, 0, 0)
  const shortEnd = new Date(shortStart)
  shortEnd.setHours(11, 0, 0, 0)

  const longStart = new Date(monday)
  longStart.setDate(monday.getDate() + 1)
  longStart.setHours(12, 0, 0, 0)
  const longEnd = new Date(longStart)
  longEnd.setHours(13, 0, 0, 0)

  const plainStart = new Date(monday)
  plainStart.setDate(monday.getDate() + 1)
  plainStart.setHours(14, 0, 0, 0)
  const plainEnd = new Date(plainStart)
  plainEnd.setHours(15, 0, 0, 0)

  await page.goto('/')
  await createTeam(page, 'EHC Zuchwil Regio U12')
  await createEvent(page, shortStart, shortEnd, 'ICE')
  await createEvent(page, longStart, longEnd, 'Länger')
  await createEvent(page, plainStart, plainEnd)

  await page.locator('button.fc-timeGridWeek-button').click()
  await expect(page.locator('.fc-timegrid-event')).toHaveCount(3)

  const filterRail = page.locator('.filter-rail')
  await expect(filterRail.getByText('EHC Zuchwil Regio U12 · ICE')).toBeVisible()
  await expect(filterRail.getByText('EHC Zuchwil Regio U12 · Länger')).toHaveCount(0)

  await page.getByLabel('EHC Zuchwil Regio U12 · ICE').check()
  await expect(page.locator('.fc-timegrid-event')).toHaveCount(1)
})
