import { test, expect } from '@playwright/test'

test('plays real audio, seeks, skips and manages the queue', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await page.getByRole('button', { name: 'Слушать мою волну', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Пауза', exact: true })).toBeVisible()
  await expect
    .poll(() => page.locator('audio').evaluate((audio: HTMLAudioElement) => audio.currentTime))
    .toBeGreaterThan(0.1)
  await page.getByRole('slider', { name: 'Позиция воспроизведения' }).fill('20')
  await expect
    .poll(() => page.locator('audio').evaluate((audio: HTMLAudioElement) => audio.currentTime))
    .toBeGreaterThan(19)
  await page.getByRole('button', { name: 'Следующий трек', exact: true }).click()
  await expect(page.locator('.player-track-info strong')).toHaveText('Weightless')
  await page.getByRole('button', { name: 'Очередь воспроизведения' }).click()
  await expect(page.getByRole('heading', { name: 'Очередь', exact: true })).toBeVisible()
  await page.locator('.queue-next-title').getByRole('button', { name: 'Очистить' }).click()
  await expect(page.locator('.queue-empty')).toBeVisible()
  await page.getByRole('button', { name: 'Пауза', exact: true }).click()
  await expect(page.locator('audio')).toHaveJSProperty('paused', true)
  expect(errors).toEqual([])
})

test('searches, saves favorites, creates playlists and persists changes', async ({ page }) => {
  await page.goto('/')
  const search = page.getByRole('textbox', { name: 'Поиск музыки' })
  await search.fill('Neon')
  await expect(page.locator('.track-row')).toHaveCount(1)
  await page.getByRole('button', { name: 'Добавить Neon Dreams в избранное', exact: true }).click()
  await page.getByRole('button', { name: 'Создать плейлист', exact: true }).click()
  await page.getByRole('textbox', { name: 'Название', exact: true }).fill('Для прогулок')
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Создать плейлист', exact: true })
    .click()
  await expect(page.getByRole('heading', { name: 'Для прогулок', exact: true })).toBeVisible()
  await search.fill('Neon')
  await page.getByRole('button', { name: 'Действия с Neon Dreams' }).click()
  await page.getByRole('button', { name: 'В плейлист', exact: true }).click()
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /Для прогулок/ })
    .click()
  await page.reload()
  await page
    .locator('.sidebar-playlists')
    .getByRole('button', { name: /Для прогулок/ })
    .click()
  await expect(page.locator('.track-info strong')).toHaveText('Neon Dreams')
  await page
    .locator('.collection-nav')
    .getByRole('button', { name: /Любимые треки/ })
    .click()
  await expect(page.locator('.track-info strong')).toHaveText('Neon Dreams')
  await search.fill('zzzzzz')
  await expect(page.getByRole('heading', { name: 'Кажется, здесь пока тихо' })).toBeVisible()
})

test('filters recommendations by mood and provides working back navigation', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /Сосредоточиться/ }).click()
  await expect(page.getByRole('heading', { name: 'Только твоя волна.' })).toBeVisible()
  await expect(page.locator('.track-row')).toHaveCount(4)
  await page.getByRole('button', { name: 'ϟ Зарядиться', exact: true }).click()
  await expect(page.locator('.track-row')).toHaveCount(2)
  await page.getByRole('button', { name: 'Назад', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Поймай свою волну.' })).toBeVisible()
})

test('installs an offline cache and plays the catalog after an offline reload', async ({
  page,
  context,
}) => {
  await page.goto('/')
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
    if (!navigator.serviceWorker.controller)
      await new Promise<void>((resolve) =>
        navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), {
          once: true,
        }),
      )
  })
  const manifest = await page.request.get('/manifest.webmanifest')
  expect((await manifest.json()).display).toBe('standalone')
  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Поймай свою волну.' })).toBeVisible()
  await page.getByRole('button', { name: 'Слушать мою волну', exact: true }).click()
  await expect
    .poll(() => page.locator('audio').evaluate((audio: HTMLAudioElement) => audio.currentTime))
    .toBeGreaterThan(0.2)
  await page.getByRole('slider', { name: 'Позиция воспроизведения' }).fill('25')
  await expect
    .poll(() => page.locator('audio').evaluate((audio: HTMLAudioElement) => audio.currentTime))
    .toBeGreaterThan(24)
  await context.setOffline(false)
})
