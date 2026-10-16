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

test('audio search playback shares controls, saves newest first and never creates video', async ({
  page,
}) => {
  await page.route('**/api/youtube/status', (route) =>
    route.fulfill({ json: { configured: true } }),
  )
  await page.route('**/api/youtube/search?**', (route) =>
    route.fulfill({
      json: {
        items: [
          { id: 'jfKfPfyJRdk', title: 'Jazz for focus', channel: 'Artist' },
          { id: '4xDzrJKXOOY', title: 'Second mix', channel: 'Other artist' },
        ],
      },
    }),
  )
  await page.goto('/')
  const search = page.getByRole('textbox', { name: 'Поиск музыки' })
  await search.fill('jazz')
  await page.getByRole('button', { name: 'Слушать Jazz for focus', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Пауза', exact: true })).toBeVisible()
  await expect(page.locator('.player-track-info strong')).toHaveText('Jazz for focus')
  await expect(page.locator('iframe,video')).toHaveCount(0)
  await page.getByRole('button', { name: 'Любимый текущий трек', exact: true }).click()
  await page.getByRole('button', { name: 'Пауза', exact: true }).click()
  await expect(page.locator('audio')).toHaveJSProperty('paused', true)
  await page.getByRole('button', { name: 'Воспроизвести', exact: true }).click()
  await expect
    .poll(() => page.locator('audio').evaluate((a: HTMLAudioElement) => a.currentTime))
    .toBeGreaterThan(0.1)
  await page.getByRole('slider', { name: 'Позиция воспроизведения' }).fill('20')
  await expect
    .poll(() => page.locator('audio').evaluate((a: HTMLAudioElement) => a.currentTime))
    .toBeGreaterThan(19)
  await page.getByRole('slider', { name: 'Громкость', exact: true }).fill('0.25')
  await expect(page.locator('audio')).toHaveJSProperty('volume', 0.25)
  await page.getByRole('button', { name: 'Следующий трек', exact: true }).click()
  await expect(page.locator('.player-track-info strong')).toHaveText('Second mix')
  await page.getByRole('button', { name: 'Любимый текущий трек', exact: true }).click()
  await page.getByRole('button', { name: 'Добавить текущий трек в плейлист' }).click()
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /Ночной город/ })
    .click()
  await page
    .locator('.collection-nav')
    .getByRole('button', { name: /Любимые треки/ })
    .click()
  await expect(page.locator('.track-info strong')).toHaveText(['Second mix', 'Jazz for focus'])
  await expect(page.locator('.collection-meta')).not.toContainText('Алекс')
  await page.reload()
  await page
    .locator('.sidebar-playlists')
    .getByRole('button', { name: /Ночной город/ })
    .click()
  await expect(page.locator('.track-info strong').first()).toHaveText('Second mix')
  await page.getByRole('button', { name: 'Слушать Second mix', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Пауза', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Слушать Blue Hour', exact: true }).click()
  await expect(page.locator('.player-track-info strong')).toHaveText('Blue Hour')
  await expect(page.locator('iframe,video')).toHaveCount(0)
})

test('an unavailable source stops loading and a matching replacement is shown explicitly', async ({
  page,
}) => {
  await mockYouTubePlayback(page, ['jfKfPfyJRdk'])
  await page.route('**/api/youtube/status', (r) => r.fulfill({ json: { configured: true } }))
  await page.route('**/api/youtube/search?**', (r) =>
    r.fulfill({ json: { items: [{ id: 'jfKfPfyJRdk', title: 'Song', channel: 'Artist' }] } }),
  )
  await page.goto('/')
  await page.getByRole('textbox', { name: 'Поиск музыки' }).fill('song')
  await page.getByRole('button', { name: 'Слушать Song', exact: true }).click()
  await expect(page.locator('.audio-source-message')).toContainText('ограничена источником')
  await expect(page.getByRole('button', { name: 'Воспроизвести', exact: true })).toBeVisible()
  await page.route('**/api/youtube/resolve?**', (r) =>
    r.fulfill({
      json: {
        id: '4xDzrJKXOOY',
        replacement: true,
        title: 'Artist - Song (audio)',
        channel: 'Artist Topic',
        duration: 48,
      },
    }),
  )
  await page.getByRole('button', { name: 'Воспроизвести', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Пауза', exact: true })).toBeVisible()
  await expect(page.locator('.player-track-info strong')).toHaveText('Artist - Song (audio)')
  await expect(page.locator('.audio-source-message')).toContainText('другая доступная запись')
  await expect(page.locator('iframe,video')).toHaveCount(0)
})

test('search errors have an external link and direct audio links remain usable', async ({
  page,
}) => {
  await page.route('**/api/youtube/status', (r) => r.fulfill({ status: 503, json: {} }))
  await page.goto('/')
  await page.locator('.primary-nav').getByRole('button', { name: 'YouTube', exact: true }).click()
  const input = page.getByRole('textbox', { name: 'Поиск на YouTube или ссылка' })
  await input.fill('jazz')
  await page.getByRole('button', { name: 'Найти', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Поиск приложения недоступен')
  await input.fill('https://youtu.be/jfKfPfyJRdk')
  await page.getByRole('button', { name: 'Найти', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Пауза', exact: true })).toBeVisible()
  await expect(page.locator('iframe,video')).toHaveCount(0)
})

test('transport failures expose safe copyable diagnostics and local audio still works', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.route('**/api/youtube/status', (route) =>
    route.fulfill({ json: { configured: true } }),
  )
  await page.route('**/api/youtube/search?**', (route) =>
    route.fulfill({ json: { items: [{ id: '4xDzrJKXOOY', title: 'Song', channel: 'Artist' }] } }),
  )
  await page.route('**/api/youtube/resolve?**', (route) =>
    route.fulfill({
      status: 503,
      json: {
        message: 'YouTube отклонил запрос приложения (HTTP 403).',
        diagnostic: {
          code: 'HTTP',
          stage: 'metadata',
          httpStatus: 403,
          version: '1.2.1',
          videoId: '4xDzrJKXOOY',
        },
      },
    }),
  )
  await page.goto('/')
  await page.getByRole('textbox', { name: 'Поиск музыки' }).fill('song')
  await page.getByRole('button', { name: 'Слушать Song', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('HTTP 403')
  await expect(page.getByRole('button', { name: 'Воспроизвести', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Копировать диагностику', exact: true }).click()
  const diagnostic = await page.evaluate(() => navigator.clipboard.readText())
  expect(JSON.parse(diagnostic)).toEqual({
    code: 'HTTP',
    stage: 'metadata',
    httpStatus: 403,
    version: '1.2.1',
    videoId: '4xDzrJKXOOY',
  })
  await page
    .locator('.sidebar-playlists')
    .getByRole('button', { name: /Ночной город/ })
    .click()
  await page.getByRole('button', { name: 'Слушать Blue Hour', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Пауза', exact: true })).toBeVisible()
  await expect
    .poll(() => page.locator('audio').evaluate((audio: HTMLAudioElement) => audio.currentTime))
    .toBeGreaterThan(0.1)
  await expect(page.locator('iframe,video')).toHaveCount(0)
})
