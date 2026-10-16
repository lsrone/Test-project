import { test, expect } from '@playwright/test'
import { mockArchive } from './archive-fixture'
test.use({ serviceWorkers: 'block' })
test('search defaults to audio rows, plays full audio and saves newest first across reloads', async ({
  page,
}) => {
  const requests: string[] = []
  page.on('request', (r) => requests.push(r.url()))
  await mockArchive(page)
  await page.goto('/')
  await page.getByRole('textbox', { name: 'Поиск музыки' }).fill('ambient')
  await expect(page.getByRole('tab', { name: 'Аудиокаталог', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await expect(page.locator('.audio-search .track-row')).toHaveCount(4)
  await page.getByRole('button', { name: 'Слушать Ocean Lights', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Пауза', exact: true })).toBeVisible()
  await page.getByRole('slider', { name: 'Позиция воспроизведения' }).fill('20')
  await expect
    .poll(() => page.locator('audio').evaluate((a: HTMLAudioElement) => a.currentTime))
    .toBeGreaterThan(19)
  await page.getByRole('button', { name: 'Добавить Ocean Lights в избранное', exact: true }).click()
  await page.getByRole('button', { name: 'Добавить Discovery 1 в избранное', exact: true }).click()
  await page.getByRole('button', { name: 'Действия с Discovery 1', exact: true }).click()
  await page.getByRole('button', { name: 'В плейлист', exact: true }).click()
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /Ночной город/ })
    .click()
  await page.getByRole('button', { name: 'Загрузить ещё треки', exact: true }).click()
  await expect(page.locator('.audio-search .track-row')).toHaveCount(8)
  await expect(page.locator('iframe,video')).toHaveCount(0)
  expect(requests.some((url) => /youtube|googlevideo/.test(url))).toBe(false)
  await page.reload()
  await page
    .locator('.collection-nav')
    .getByRole('button', { name: /Любимые треки/ })
    .click()
  await expect(page.locator('.track-info strong')).toHaveText(['Discovery 1', 'Ocean Lights'])
  await page
    .locator('.sidebar-playlists')
    .getByRole('button', { name: /Ночной город/ })
    .click()
  await expect(page.locator('.track-info strong').first()).toHaveText('Discovery 1')
})
test('source failure is visible and retry recovers while built-in audio remains available', async ({
  page,
}) => {
  await mockArchive(page, { fail: true })
  await page.goto('/')
  await page.getByRole('textbox', { name: 'Поиск музыки' }).fill('jazz')
  await expect(page.locator('.audio-search [role=alert]')).toBeVisible()
  await mockArchive(page, { genre: 'jazz' })
  await page.getByRole('button', { name: 'Повторить', exact: true }).click()
  await page.getByRole('button', { name: 'Слушать Ocean Lights', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Пауза', exact: true })).toBeVisible()
  await expect(page.locator('iframe,video')).toHaveCount(0)
})

test('audio error shows the transport reason, retries successfully and ignores rapid track changes', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await mockArchive(page)
  let failed = true
  await page.route('**/api/archive/audio?**', async (route) => {
    if (failed) return route.fulfill({ status: 502, json: { code: 'TLS' } })
    return route.fallback()
  })
  await page.route('**/api/archive/playback-status?**', (route) =>
    route.fulfill({
      json: { failure: { code: 'TLS', stage: 'audio', at: Date.now() } },
    }),
  )
  await page.goto('/')
  await page.getByRole('textbox', { name: 'Поиск музыки' }).fill('ambient')
  await page.getByRole('button', { name: 'Слушать Ocean Lights', exact: true }).click()
  const error = page.locator('.playback-failure')
  await expect(error).toContainText('защищённое соединение')
  await error.getByRole('button', { name: 'Копировать диагностику' }).click()
  const diagnostic = await page.evaluate(() => navigator.clipboard.readText())
  expect(JSON.parse(diagnostic)).toMatchObject({ app: 'Volna', code: 'TLS', stage: 'audio' })
  expect(diagnostic).not.toMatch(/https:|token|cookie/i)
  failed = false
  await error.getByRole('button', { name: 'Повторить', exact: true }).click()
  await expect
    .poll(() => page.locator('audio').evaluate((a: HTMLAudioElement) => a.currentTime))
    .toBeGreaterThan(0.1)
  await expect(error).toHaveCount(0)
  await page.getByRole('button', { name: 'Слушать Discovery 1', exact: true }).click()
  await page.getByRole('button', { name: 'Слушать Discovery 2', exact: true }).click()
  await expect(page.locator('.player-track-info strong')).toHaveText('Discovery 2')
  await expect
    .poll(() => page.locator('audio').evaluate((a: HTMLAudioElement) => a.currentTime))
    .toBeGreaterThan(0.1)
  await expect(error).toHaveCount(0)
})
