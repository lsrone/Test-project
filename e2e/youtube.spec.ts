import { test, expect } from '@playwright/test'

// Route fixtures must reach the browser request rather than a service-worker fetch.
test.use({ serviceWorkers: 'block' })

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
  await page.route('https://www.youtube-nocookie.com/**', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<p>Official embed fixture</p>' }),
  )
  await page.goto('/')
  await page.getByRole('button', { name: 'Слушать мою волну', exact: true }).click()
  await page.locator('.primary-nav').getByRole('button', { name: 'YouTube', exact: true }).click()
  await page.getByRole('textbox', { name: 'Поиск на YouTube или ссылка' }).fill('jazz')
  await page.getByRole('button', { name: 'Найти', exact: true }).click()
  await expect(page.locator('.youtube-result')).toHaveCount(1)
  await page.getByRole('button', { name: 'Включить Jazz for focus' }).click()
  await expect(page.getByRole('complementary', { name: 'Плеер YouTube' })).toBeVisible()
  await expect(page.locator('.youtube-dock iframe')).toHaveAttribute(
    'src',
    /youtube-nocookie.com\/embed\/jfKfPfyJRdk/,
  )
  await expect(page.locator('audio')).toHaveJSProperty('paused', true)
  await page.getByRole('button', { name: /Показать ещё/ }).click()
  await expect(page.locator('.youtube-result')).toHaveCount(2)
  await page.getByRole('button', { name: 'Воспроизвести', exact: true }).click()
  await expect(page.locator('.youtube-dock')).toHaveCount(0)
})

test('unavailable search is explained and a YouTube link still opens the embed', async ({
  page,
}) => {
  await page.route('**/api/youtube/status', (route) => route.fulfill({ status: 503, json: {} }))
  await page.route('https://www.youtube-nocookie.com/**', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<p>Embed fixture</p>' }),
  )
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
  await expect(page.locator('.youtube-dock iframe')).toHaveAttribute(
    'src',
    /youtube-nocookie.com\/embed\/jfKfPfyJRdk/,
  )
})
