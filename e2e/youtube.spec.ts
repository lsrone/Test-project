import { test, expect } from '@playwright/test'
import { mockYouTubePlayback } from './youtube-fixture'

// Route fixtures must reach the browser request rather than a service-worker fetch.
test.use({ serviceWorkers: 'block' })

test.beforeEach(async ({ page }) => {
  await mockYouTubePlayback(page)
})

test('global search defaults to YouTube, displays rows, updates the query and switches to the local library', async ({
  page,
}) => {
  const queries: string[] = []
  await page.route('**/api/youtube/status', (route) =>
    route.fulfill({ json: { configured: true } }),
  )
  await page.route('**/api/youtube/search?**', (route) => {
    const query = new URL(route.request().url()).searchParams.get('q')!
    queries.push(query)
    return route.fulfill({
      json: {
        items: [
          {
            id: 'jfKfPfyJRdk',
            title: `${query} — first recording`,
            channel: 'First music channel',
          },
          {
            id: '4xDzrJKXOOY',
            title: `${query} — second recording`,
            channel: 'Second music channel',
          },
        ],
      },
    })
  })
  await page.goto('/')
  const search = page.getByRole('textbox', { name: 'Поиск музыки' })
  await search.fill('Neon')
  await expect(page.getByRole('tab', { name: 'YouTube', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  const list = page.getByRole('list', { name: 'Результаты поиска YouTube' })
  await expect(list.getByRole('listitem')).toHaveCount(2)
  await expect(list).toContainText('First music channel')
  const rows = await list.getByRole('listitem').evaluateAll((items) =>
    items.map((item) => {
      const { x, y, width, bottom } = item.getBoundingClientRect()
      return { x, y, width, bottom }
    }),
  )
  expect(rows[0].x).toBe(rows[1].x)
  expect(rows[0].width).toBe(rows[1].width)
  expect(rows[1].y).toBeGreaterThanOrEqual(rows[0].bottom)
  await search.fill('Ambient')
  await expect(list).toContainText('Ambient — first recording')
  await expect(list).not.toContainText('Neon — first recording')
  await search.fill('Neon')
  await page.getByRole('tab', { name: 'В библиотеке' }).click()
  await expect(page.locator('.track-row')).toHaveCount(1)
  await expect(page.locator('.track-info strong')).toHaveText('Neon Dreams')
  await expect(list).toHaveCount(0)
  await page.getByRole('tab', { name: 'В библиотеке' }).press('ArrowLeft')
  await expect(list.getByRole('listitem')).toHaveCount(2)
  await page.getByRole('button', { name: 'Очистить поиск' }).click()
  await expect(list).toHaveCount(0)
  expect(queries).toContain('Ambient')
})

test('YouTube search renders paginated API results and pauses local music for the official embed', async ({
  page,
}) => {
  await page.route('**/api/youtube/status', (route) =>
    route.fulfill({ json: { configured: true } }),
  )
  await page.route('**/api/youtube/search?**', (route) => {
    const next = new URL(route.request().url()).searchParams.has('pageToken')
    return route.fulfill({
      json: {
        items: [
          {
            id: next ? '4xDzrJKXOOY' : 'jfKfPfyJRdk',
            title: next ? 'Second mix' : 'Jazz for focus',
            channel: 'Test music channel',
          },
        ],
        ...(next ? {} : { nextPageToken: 'NEXT' }),
      },
    })
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Слушать мою волну', exact: true }).click()
  await page.locator('.primary-nav').getByRole('button', { name: 'YouTube', exact: true }).click()
  await page.getByRole('textbox', { name: 'Поиск на YouTube или ссылка' }).fill('jazz')
  await page.getByRole('button', { name: 'Найти', exact: true }).click()
  await expect(page.locator('.youtube-result')).toHaveCount(1)
  await page.getByRole('button', { name: 'Включить Jazz for focus' }).click()
  await expect(page.getByRole('region', { name: 'Плеер YouTube' })).toBeVisible()
  await expect(page.locator('.player-youtube iframe')).toHaveAttribute(
    'src',
    /youtube-nocookie.com\/embed\/jfKfPfyJRdk/,
  )
  await expect(page.locator('audio')).toHaveJSProperty('paused', true)
  await page.getByRole('button', { name: /Показать ещё/ }).click()
  await expect(page.locator('.youtube-result')).toHaveCount(2)
  await expect(page.locator('.player-track-info strong')).toHaveText('Jazz for focus')
  await expect(page.getByRole('button', { name: 'Пауза', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Пауза', exact: true }).click()
  await expect(page.frameLocator('.player-youtube iframe').locator('audio')).toHaveJSProperty(
    'paused',
    true,
  )
  await page.getByRole('button', { name: 'Воспроизвести', exact: true }).click()
  await expect
    .poll(() =>
      page
        .frameLocator('.player-youtube iframe')
        .locator('audio')
        .evaluate((a: HTMLAudioElement) => a.currentTime),
    )
    .toBeGreaterThan(0.1)
  await page.getByRole('slider', { name: 'Позиция воспроизведения' }).fill('20')
  await expect
    .poll(() =>
      page
        .frameLocator('.player-youtube iframe')
        .locator('audio')
        .evaluate((a: HTMLAudioElement) => a.currentTime),
    )
    .toBeGreaterThan(19)
  await page.getByRole('slider', { name: 'Громкость', exact: true }).fill('0.25')
  await expect
    .poll(() =>
      page
        .frameLocator('.player-youtube iframe')
        .locator('audio')
        .evaluate((a: HTMLAudioElement) => a.volume),
    )
    .toBe(0.25)
  await page.getByRole('button', { name: 'Любимый текущий трек', exact: true }).click()
  await page.getByRole('button', { name: 'Добавить текущий трек в плейлист' }).click()
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /Ночной город/ })
    .click()
  await page.getByRole('button', { name: 'Следующий трек', exact: true }).click()
  await expect(page.locator('.player-track-info strong')).toHaveText('Second mix')
  await page
    .locator('.collection-nav')
    .getByRole('button', { name: /Любимые треки/ })
    .click()
  await expect(page.locator('.track-info strong')).toHaveText('Jazz for focus')
  await page.reload()
  await page
    .locator('.sidebar-playlists')
    .getByRole('button', { name: /Ночной город/ })
    .click()
  await expect(page.locator('.track-info strong')).toContainText([
    'Neon Dreams',
    'Blue Hour',
    'Velvet Sky',
    'Jazz for focus',
  ])
  await page.getByRole('button', { name: 'Слушать Jazz for focus', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Пауза', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Слушать Blue Hour', exact: true }).click()
  await expect(page.locator('.player-youtube')).toHaveCount(0)
  await expect
    .poll(() => page.locator('audio').evaluate((a: HTMLAudioElement) => a.currentTime))
    .toBeGreaterThan(0.1)
})

test('blocked embeds report the restriction, keep the right metadata, and allow saving and another recording', async ({
  page,
}) => {
  await mockYouTubePlayback(page, ['jfKfPfyJRdk'])
  await page.route('**/api/youtube/status', (route) =>
    route.fulfill({ json: { configured: true } }),
  )
  await page.route('**/api/youtube/search?**', (route) =>
    route.fulfill({
      json: {
        items: [
          { id: 'jfKfPfyJRdk', title: 'Blocked recording', channel: 'Channel' },
          { id: '4xDzrJKXOOY', title: 'Playable recording', channel: 'Channel' },
        ],
      },
    }),
  )
  await page.goto('/')
  await page.getByRole('textbox', { name: 'Поиск музыки' }).fill('recording')
  await page
    .getByRole('button', { name: 'Добавить Blocked recording в избранное', exact: true })
    .click()
  await page
    .getByRole('button', { name: 'Добавить Blocked recording в плейлист', exact: true })
    .click()
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /Ночной город/ })
    .click()
  await page.getByRole('button', { name: 'Слушать Blocked recording', exact: true }).click()
  await expect(page.locator('.player').getByRole('alert')).toContainText('Автор запретил')
  await expect(page.locator('.player-track-info strong')).toHaveText('Blocked recording')
  await expect(page.getByRole('button', { name: 'Любимый текущий трек' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(page.getByRole('button', { name: 'Воспроизвести', exact: true })).toBeVisible()
  await expect(page.locator('audio')).toHaveJSProperty('paused', true)
  await page.getByRole('button', { name: 'Другая запись', exact: true }).click()
  await page.getByRole('button', { name: 'Слушать Playable recording', exact: true }).click()
  await expect(page.locator('.player-track-info strong')).toHaveText('Playable recording')
  await expect(page.getByRole('button', { name: 'Пауза', exact: true })).toBeVisible()
  await expect(page.locator('.player').getByRole('alert')).toHaveCount(0)
  await expect(page.locator('.youtube-dock')).toHaveCount(0)
})

test('failure to load the official player stops loading and offers a retry', async ({ page }) => {
  await page.route('https://www.youtube.com/iframe_api', (route) => route.abort('failed'))
  await page.goto('/')
  await page.locator('.primary-nav').getByRole('button', { name: 'YouTube', exact: true }).click()
  await page
    .getByRole('textbox', { name: 'Поиск на YouTube или ссылка' })
    .fill('https://youtu.be/jfKfPfyJRdk')
  await page.getByRole('button', { name: 'Найти', exact: true }).click()
  await expect(page.locator('.player').getByRole('alert')).toContainText(
    'Не удалось подключить плеер',
  )
  await expect(page.locator('.player .play-pause .spinner')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Воспроизвести', exact: true })).toBeVisible()
})

test('unavailable search is explained and a YouTube link still opens the embed', async ({
  page,
}) => {
  await page.route('**/api/youtube/status', (route) => route.fulfill({ status: 503, json: {} }))
  await page.goto('/')
  await page.locator('.primary-nav').getByRole('button', { name: 'YouTube', exact: true }).click()
  await expect(page.locator('.youtube-connection-note')).toBeVisible()
  await page.getByRole('textbox', { name: 'Поиск на YouTube или ссылка' }).fill('jazz')
  await page.getByRole('button', { name: 'Найти', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Поиск приложения недоступен')
  await expect(page.getByRole('link', { name: 'Открыть поиск на YouTube' })).toHaveAttribute(
    'href',
    'https://www.youtube.com/results?search_query=jazz',
  )
  await page
    .getByRole('textbox', { name: 'Поиск на YouTube или ссылка' })
    .fill('https://youtu.be/jfKfPfyJRdk')
  await page.getByRole('button', { name: 'Найти', exact: true }).click()
  await expect(page.locator('.player-youtube iframe')).toHaveAttribute(
    'src',
    /youtube-nocookie.com\/embed\/jfKfPfyJRdk/,
  )
})
