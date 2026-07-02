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

async function createEvent(page: Page, start: Date, end: Date): Promise<void> {
  await page.getByRole('button', { name: '+ Neues Event' }).click()
  await expect(page.locator('.drawer')).toBeVisible()

  const dateTimeInputs = page.locator('.drawer input[type="datetime-local"]')
  await dateTimeInputs.nth(0).fill(toLocalInput(start))
  await dateTimeInputs.nth(1).fill(toLocalInput(end))

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

  expect(slotTimes[0]).toBe('09:00:00')
  expect(slotTimes).toContain('11:30:00')
  expect(slotTimes).not.toContain('01:00:00')
})
