# Playwright skill

## Version

Playwright **1.61+** — `@playwright/test`

## Config

```ts
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'on-first-retry',
    viewport: { width: 1280, height: 900 },
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
```

Key points:
- Only **chromium** is tested.
- The dev server is reused locally (`reuseExistingServer: !process.env.CI`); a fresh server is started in CI.
- Default viewport is 1280 × 900 (desktop).
- `baseURL` is set, so tests can use relative paths: `await page.goto('/')`.

## Running tests

```bash
npm run test:e2e          # run all tests
npx playwright test --ui  # interactive UI mode
npx playwright show-report # open last HTML report
```

## File structure

```
tests/
  fixtures/           # test fixture files (e.g. sample XLS files for import tests)
  import-workflow.spec.ts
  week-view-slot-range.spec.ts
```

## Writing tests

### Basic page test

```ts
import { test, expect } from '@playwright/test'

test('shows the schedule tab by default', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('Spielplan')).toBeVisible()
})
```

### File upload

Use `page.setInputFiles` with a path relative to the project root (or an absolute path). Put sample files in `tests/fixtures/`:

```ts
import path from 'path'

const fixturePath = path.join(__dirname, 'fixtures', 'sample.xls')
await page.locator('input[type="file"]').setInputFiles(fixturePath)
```

### Waiting for UI state

Prefer `expect(locator).toBeVisible()` / `toHaveText()` over `page.waitForTimeout()`. Playwright automatically retries assertions up to `expect.timeout` (10 s):

```ts
await expect(page.getByRole('button', { name: 'Importieren' })).toBeVisible()
```

### Navigating tabs

The app uses buttons for tab navigation. Use `getByRole` or `getByText` to click them:

```ts
await page.getByRole('button', { name: 'Teams' }).click()
await expect(page.getByText('Kein Team')).toBeVisible()
```

### Checking calendar events

Events rendered by FullCalendar appear as `<a>` elements inside `.fc-event`. Query them by their title text:

```ts
await expect(page.locator('.fc-event', { hasText: 'Training' })).toBeVisible()
```

## CI configuration

Tests run in CI via `.github/workflows/e2e.yml` on every pull request:

```yaml
- name: Install Playwright browsers
  run: npx playwright install --with-deps chromium

- name: Run e2e tests
  run: npm run test:e2e
```

Only chromium is installed to keep the CI image small. Do not add other browsers unless there is a specific cross-browser requirement.

## Debugging tips

- Run `npx playwright test --headed` to watch the browser.
- Use `page.pause()` inside a test to open the Playwright Inspector.
- Traces are collected on first retry; view with `npx playwright show-trace trace.zip`.
