import { test, expect } from '@playwright/test'
import { mockYouTube, mockYouTubePlayback } from './youtube-fixture'
import { startAppServer } from '../server/app-server.mjs'
test.use({ serviceWorkers: 'block' })

test('YouTube paginates 120 records, plays in the footer and keeps newest favourites after reload', async ({
  page,
  context,
}) => {
  await mockYouTube(page)
  await mockYouTubePlayback(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Воспроизвести', exact: true }).click()
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
  await page.getByRole('button', { name: 'Слушать ØDEN — Blink', exact: true }).click()
  await expect(page.locator('.player-track-info strong')).toHaveText('ØDEN — Blink')
  await expect(page.locator('.player-youtube iframe')).toBeVisible()
  await expect
    .poll(() =>
      page
        .frameLocator('.player-youtube iframe')
        .locator('audio')
        .evaluate((a: HTMLAudioElement) => a.currentTime),
    )
    .toBeGreaterThan(0.1)
  await expect(page.locator('audio')).toHaveJSProperty('paused', true)
  await page.getByRole('button', { name: 'Пауза', exact: true }).click()
  await expect(page.frameLocator('.player-youtube iframe').locator('audio')).toHaveJSProperty(
    'paused',
    true,
  )
  await page.getByRole('slider', { name: 'Позиция воспроизведения' }).fill('20')
  await page.getByRole('button', { name: 'Воспроизвести', exact: true }).click()
  await expect
    .poll(() =>
      page
        .frameLocator('.player-youtube iframe')
        .locator('audio')
        .evaluate((a: HTMLAudioElement) => a.currentTime),
    )
    .toBeGreaterThan(19)
  expect(context.pages()).toHaveLength(1)
  await page.getByRole('button', { name: 'Следующий трек', exact: true }).click()
  await expect(page.locator('.player-track-info strong')).toHaveText('YouTube song 1')
  await page.reload()
  await page
    .locator('.collection-nav')
    .getByRole('button', { name: /Любимые треки/ })
    .click()
  await expect(page.locator('.track-info strong')).toHaveText(['YouTube song 119', 'ØDEN — Blink'])
  await expect(page.getByRole('button', { name: 'Слушать коллекцию', exact: true })).toBeEnabled()
})

test('a TXT song is matched inside the production server CSP and original IDs, likes and playlists survive', async ({
  page,
  context,
}) => {
  const app = await startAppServer({ root: 'dist', port: 0 })
  const queries: string[] = []
  await page.route('**/api/youtube/search?**', (route) => {
    queries.push(new URL(route.request().url()).searchParams.get('q') || '')
    return route.fulfill({
      json: {
        items: [
          { id: 'wrong000001', title: 'Signal (Remix)', channel: 'Northern Lights' },
          {
            id: 'exact000001',
            title: 'Northern Lights - Signal (Official Audio)',
            channel: 'Northern Lights - Topic',
          },
        ],
      },
    })
  })
  await page.route('https://i.ytimg.com/**', (route) =>
    route.fulfill({ path: 'public/app-icon-192.png' }),
  )
  await mockYouTubePlayback(page)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  try {
    await page.goto(app.origin)
    await page.getByRole('button', { name: 'Перенести библиотеку', exact: true }).click()
    await page.getByLabel('Файл экспорта Яндекс Музыки').setInputFiles({
      name: 'Мне нравится.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('Northern Lights - Signal'),
    })
    await page.getByRole('button', { name: 'Перенести 1 треков', exact: true }).click()
    await page.getByRole('button', { name: 'Открыть перенесённую коллекцию' }).click()
    expect(queries).toEqual([])
    const before = await page.evaluate(() => ({
      liked: JSON.parse(localStorage.getItem('volna.liked') || '[]'),
      playlists: JSON.parse(localStorage.getItem('volna.playlists') || '[]'),
    }))
    await page.getByRole('button', { name: 'Слушать Signal', exact: true }).click()
    await expect(page.locator('.player-youtube iframe')).toBeVisible()
    await expect
      .poll(() =>
        page
          .frameLocator('.player-youtube iframe')
          .locator('audio')
          .evaluate((a: HTMLAudioElement) => a.currentTime),
      )
      .toBeGreaterThan(0.2)
    const after = await page.evaluate(() => ({
      liked: JSON.parse(localStorage.getItem('volna.liked') || '[]'),
      playlists: JSON.parse(localStorage.getItem('volna.playlists') || '[]'),
      tracks: JSON.parse(localStorage.getItem('volna.online-tracks') || '[]'),
    }))
    expect(after.liked).toEqual(before.liked)
    expect(after.playlists).toEqual(before.playlists)
    expect(after.tracks.find((t) => t.id === before.liked[0])).toMatchObject({
      title: 'Signal',
      artist: 'Northern Lights',
      source: 'yandex',
      youtubeId: 'exact000001',
    })
    await page.getByRole('slider', { name: 'Позиция воспроизведения' }).fill('30')
    await page.getByRole('button', { name: 'Пауза', exact: true }).click()
    await page.getByRole('textbox', { name: 'Поиск музыки' }).fill('Blue Hour')
    await page.getByRole('tab', { name: 'В библиотеке', exact: true }).click()
    await page.getByRole('button', { name: 'Слушать Blue Hour', exact: true }).click()
    await expect(page.locator('.player-youtube')).toHaveCount(0)
    await expect(page.locator('audio')).toHaveJSProperty('paused', false)
    expect(context.pages()).toHaveLength(1)
    expect(errors).toEqual([])
    await page.reload()
    await page
      .locator('.collection-nav')
      .getByRole('button', { name: /Любимые треки/ })
      .click()
    await page.getByRole('button', { name: 'Слушать Signal', exact: true }).click()
    await expect(page.locator('.player-youtube iframe')).toBeVisible()
    expect(queries).toEqual(['Northern Lights Signal'])
  } finally {
    await app.close()
  }
})

test('blocked embedding is explained and a different recording can be linked without losing the favourite', async ({
  page,
  context,
}) => {
  await mockYouTube(page, { total: 2 })
  await mockYouTubePlayback(page, ['vid00000000'])
  await page.goto('/')
  await page.getByRole('textbox', { name: 'Поиск музыки' }).fill('ambient')
  await page.getByRole('button', { name: 'Добавить ØDEN — Blink в избранное', exact: true }).click()
  await page.getByRole('button', { name: 'Слушать ØDEN — Blink', exact: true }).click()
  await expect(page.locator('.youtube-playback-error')).toContainText('запретил')
  await page.getByRole('button', { name: 'Другая запись', exact: true }).click()
  await expect(page.locator('.youtube-match-banner')).toBeVisible()
  await page.getByRole('button', { name: 'Связать с YouTube song 1', exact: true }).click()
  await expect(page.locator('.youtube-playback-error')).toHaveCount(0)
  await expect
    .poll(() =>
      page
        .frameLocator('.player-youtube iframe')
        .locator('audio')
        .evaluate((a: HTMLAudioElement) => a.currentTime),
    )
    .toBeGreaterThan(0.1)
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem('volna.liked') || '[]')),
  ).toEqual(['youtube:vid00000000'])
  expect(context.pages()).toHaveLength(1)
})

test('a failed search allows retry and a pasted link still plays inside Volna', async ({
  page,
}) => {
  await mockYouTube(page, { fail: true })
  await mockYouTubePlayback(page)
  await page.goto('/')
  await page.getByRole('textbox', { name: 'Поиск музыки' }).fill('Northern Lights Signal')
  await expect(page.locator('.youtube-search [role=alert]')).toContainText('Не удалось')
  await expect(page.getByRole('link', { name: 'Открыть поиск на YouTube' })).toHaveAttribute(
    'href',
    `https://www.youtube.com/results?search_query=${encodeURIComponent('Northern Lights Signal')}`,
  )
  await mockYouTube(page, { total: 2 })
  await page.getByRole('button', { name: 'Повторить поиск', exact: true }).click()
  await expect(page.locator('.youtube-search .track-row')).toHaveCount(2)
  await page.getByRole('textbox', { name: 'Поиск музыки' }).fill('https://youtu.be/jfKfPfyJRdk')
  await page.getByRole('button', { name: 'Слушать Запись YouTube', exact: true }).click()
  await expect(page.locator('.player-youtube iframe')).toBeVisible()
})

test('YouTube listening learns from twenty actual seconds and never credits a seek as a full play', async ({
  page,
}) => {
  test.setTimeout(45000)
  await mockYouTube(page, { total: 2 })
  await mockYouTubePlayback(page)
  await page.goto('/')
  await page.getByRole('textbox', { name: 'Поиск музыки' }).fill('ambient')
  await page.getByRole('button', { name: 'Слушать ØDEN — Blink', exact: true }).click()
  await expect
    .poll(() =>
      page
        .frameLocator('.player-youtube iframe')
        .locator('audio')
        .evaluate((a: HTMLAudioElement) => a.currentTime),
    )
    .toBeGreaterThan(0.2)
  await page.getByRole('slider', { name: 'Позиция воспроизведения' }).fill('23')
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem('volna.listening') || '{}')['youtube:vid00000000']?.plays ||
        0,
    ),
  ).toBe(0)
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            JSON.parse(localStorage.getItem('volna.listening') || '{}')['youtube:vid00000000']
              ?.plays || 0,
        ),
      { timeout: 27000 },
    )
    .toBe(1)
  await page.getByRole('button', { name: 'Следующий трек', exact: true }).click()
  const stat = await page.evaluate(
    () => JSON.parse(localStorage.getItem('volna.listening') || '{}')['youtube:vid00000000'],
  )
  expect(stat.seconds).toBeGreaterThanOrEqual(20)
  expect(stat.seconds).toBeLessThan(27)
})
