import { chromium, expect } from '@playwright/test'
import { startAppServer } from '../server/app-server.mjs'

// Real provider + actual built-in server + unmodified production renderer.
// This intentionally fails if catalogue/audio access fails; no provider fixtures.
const app = await startAppServer({ root: 'dist', port: 0 })
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
  args: ['--no-sandbox'],
})
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 960 },
    serviceWorkers: 'block',
  })
  const errors = [],
    requests = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('request', (request) => requests.push(request.url()))
  await page.goto(app.origin)
  await page.getByRole('textbox', { name: 'Поиск музыки' }).fill('ambient')
  await page.getByRole('tab', { name: 'Аудиокаталог', exact: true }).click()
  const row = page.locator('.audio-search .track-row').first()
  await expect(row).toBeVisible({ timeout: 40000 })
  const title = await row.locator('.track-info strong').textContent()
  await row.locator('.track-cover').click()
  await expect
    .poll(() => page.locator('audio').evaluate((audio) => audio.currentTime), { timeout: 35000 })
    .toBeGreaterThan(0.2)
  await expect(page.locator('audio')).toHaveJSProperty('paused', false)
  const duration = await page.locator('audio').evaluate((audio) => audio.duration)
  expect(duration).toBeGreaterThan(30)
  await page.getByRole('slider', { name: 'Позиция воспроизведения' }).fill('20')
  await expect
    .poll(() => page.locator('audio').evaluate((audio) => audio.currentTime), { timeout: 15000 })
    .toBeGreaterThan(19)
  await page.getByRole('button', { name: 'Пауза', exact: true }).click()
  await expect(page.locator('audio')).toHaveJSProperty('paused', true)
  await page.getByRole('button', { name: 'Воспроизвести', exact: true }).click()
  await expect(page.locator('audio')).toHaveJSProperty('paused', false)
  await page.getByRole('button', { name: 'Любимый текущий трек', exact: true }).click()
  await page.screenshot({ path: '/tmp/volna-1.3-live.png' })
  await page.reload()
  await page
    .locator('.collection-nav')
    .getByRole('button', { name: /Любимые треки/ })
    .click()
  await expect(page.locator('.track-info strong')).toHaveText(title)
  await expect(page.locator('iframe,video')).toHaveCount(0)
  expect(requests.some((url) => /youtube|googlevideo/.test(url))).toBe(false)
  expect(errors).toEqual([])
  console.log(
    JSON.stringify({
      passed: true,
      liveProvider: 'Internet Archive',
      title,
      duration,
      seekPosition: 20,
      server: 'production built-in HTTP/CSP',
      fixtures: false,
      pauseResume: true,
      seek: true,
      favouriteReload: true,
      videoFrames: 0,
      nativeWindowsTested: false,
    }),
  )
} catch (error) {
  console.error('Live browser playback check failed:', error.message)
  process.exitCode = 1
} finally {
  await browser.close()
  await app.close()
}
