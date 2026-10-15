import { test, expect } from '@playwright/test'

// Route fixtures must reach the browser request rather than a service-worker fetch.
test.use({ serviceWorkers: 'block' })

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
