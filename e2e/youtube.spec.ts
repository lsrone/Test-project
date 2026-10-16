import { test, expect } from '@playwright/test'
import { mockYouTube } from './youtube-fixture'
test.use({ serviceWorkers: 'block' })
test('YouTube is the default, paginates 120 records, saves newest first and opens externally without replacing the audio player', async ({
  page,
  context,
}) => {
  await mockYouTube(page)
  await context.route('https://www.youtube.com/**', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<title>YouTube external fixture</title>' }),
  )
  const requests: string[] = []
  page.on('request', (r) => requests.push(r.url()))
  await page.goto('/')
  await page.getByRole('button', { name: 'Воспроизвести', exact: true }).click()
  await expect(page.locator('audio')).toHaveJSProperty('paused', false)
  await page.getByRole('textbox', { name: 'Поиск музыки' }).fill('ØDEN Blink')
  await expect(page.getByRole('tab', { name: 'YouTube', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await expect(page.locator('.youtube-search .track-row')).toHaveCount(20)
  await page.getByRole('button', { name: 'Добавить ØDEN — Blink в избранное', exact: true }).click()
  for (let n = 2; n <= 6; n++) {
    await page.getByRole('button', { name: 'Загрузить ещё записи', exact: true }).click()
    await expect(page.locator('.youtube-search .track-row')).toHaveCount(n * 20)
  }
  await page
    .getByRole('button', { name: 'Добавить YouTube song 119 в избранное', exact: true })
    .click()
  const popupPromise = context.waitForEvent('page')
  await page.getByRole('button', { name: 'Открыть ØDEN — Blink на YouTube', exact: true }).click()
  const popup = await popupPromise
  await popup.waitForLoadState()
  expect(popup.url()).toBe('https://www.youtube.com/watch?v=vid00000000')
  await popup.close()
  await expect(page.locator('audio')).toHaveJSProperty('paused', true)
  await expect(page.locator('.player-track-info strong')).toHaveText('Blue Hour')
  await expect(page.locator('iframe,video')).toHaveCount(0)
  expect(requests.some((url) => /googlevideo|\/api\/youtube\/(audio|resolve)/.test(url))).toBe(
    false,
  )
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('volna.search-choices') || '[]')[0].trackId,
    ),
  ).toBe('youtube:vid00000000')
  await page.screenshot({ path: '/tmp/volna14-youtube.png' })
  await page.reload()
  await page
    .locator('.collection-nav')
    .getByRole('button', { name: /Любимые треки/ })
    .click()
  await expect(page.locator('.track-info strong')).toHaveText(['YouTube song 119', 'ØDEN — Blink'])
  await expect(page.getByRole('button', { name: 'Слушать коллекцию', exact: true })).toBeDisabled()
})
test('Yandex recording is explicitly linked to a chosen YouTube result without losing its existing collection membership', async ({
  page,
  context,
}) => {
  const queries = await mockYouTube(page, { total: 2 })
  await context.route('https://www.youtube.com/**', (route) =>
    route.fulfill({ body: 'YouTube external fixture' }),
  )
  await page.goto('/')
  await page.getByRole('button', { name: 'Перенести библиотеку', exact: true }).click()
  await page.getByLabel('Файл экспорта Яндекс Музыки').setInputFiles({
    name: 'liked.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('Название;Исполнитель;id;liked;playlist\nBlink;ØDEN;123;true;Моя музыка'),
  })
  await page.getByRole('button', { name: 'Перенести 1 треков', exact: true }).click()
  await page.getByRole('button', { name: 'Открыть перенесённую коллекцию' }).click()
  await page.getByRole('button', { name: 'Найти Blink на YouTube', exact: true }).click()
  await expect(page.locator('.youtube-match-banner')).toContainText('ØDEN — Blink')
  await expect(page.locator('.youtube-search .track-row')).toHaveCount(2)
  expect(queries).toContain('ØDEN Blink')
  await page.getByRole('button', { name: 'Связать с ØDEN — Blink', exact: true }).click()
  await expect(page.locator('.youtube-match-banner')).toHaveCount(0)
  await page.reload()
  await page
    .locator('.collection-nav')
    .getByRole('button', { name: /Любимые треки/ })
    .click()
  await expect(page.locator('.track-info strong')).toHaveText('Blink')
  const stored = await page.evaluate(() => ({
    liked: JSON.parse(localStorage.getItem('volna.liked') || '[]'),
    tracks: JSON.parse(localStorage.getItem('volna.online-tracks') || '[]'),
    playlists: JSON.parse(localStorage.getItem('volna.playlists') || '[]'),
  }))
  expect(stored.liked).toEqual(['yandex:123'])
  expect(stored.tracks.find((t) => t.id === 'yandex:123')).toMatchObject({
    title: 'Blink',
    artist: 'ØDEN',
    source: 'yandex',
    youtubeId: 'vid00000000',
    sourceUrl: 'https://music.yandex.ru/track/123',
  })
  expect(stored.playlists.find((p) => p.title === 'Моя музыка').tracks).toEqual(['yandex:123'])
  const popupPromise = context.waitForEvent('page')
  await page.getByRole('button', { name: 'Открыть Blink на YouTube', exact: true }).click()
  const popup = await popupPromise
  await popup.waitForLoadState()
  expect(popup.url()).toContain('v=vid00000000')
  await popup.close()
  await expect(page.locator('iframe,video')).toHaveCount(0)
})
test('a failed source has a browser search fallback, and retry and pasted links remain usable', async ({
  page,
}) => {
  await mockYouTube(page, { fail: true })
  await page.goto('/')
  await page.getByRole('textbox', { name: 'Поиск музыки' }).fill('SNIZOV завязывай')
  await expect(page.locator('.youtube-search [role=alert]')).toContainText('Не удалось')
  const link = page.getByRole('link', { name: 'Открыть поиск на YouTube' })
  await expect(link).toHaveAttribute(
    'href',
    `https://www.youtube.com/results?search_query=${encodeURIComponent('SNIZOV завязывай')}`,
  )
  await mockYouTube(page, { total: 2 })
  await page.getByRole('button', { name: 'Повторить поиск', exact: true }).click()
  await expect(page.locator('.youtube-search .track-row')).toHaveCount(2)
  await page.getByRole('textbox', { name: 'Поиск музыки' }).fill('https://youtu.be/jfKfPfyJRdk')
  await expect(page.locator('.youtube-search .track-row')).toHaveCount(1)
  await expect(
    page.getByRole('button', { name: 'Открыть Запись YouTube на YouTube', exact: true }),
  ).toBeVisible()
  await expect(page.locator('iframe,video')).toHaveCount(0)
})
