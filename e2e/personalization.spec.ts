import { test, expect } from '@playwright/test'
import { youtubeTrack } from '../src/youtube'
import { mockYouTubePlayback } from './youtube-fixture'

test.use({ serviceWorkers: 'block' })
test('existing collections migrate once and new favourites and playlist additions appear above older songs', async ({
  page,
}) => {
  const older = youtubeTrack({ id: 'older000001', title: 'Older song', channel: 'Artist' })
  const newer = youtubeTrack({ id: 'newer000001', title: 'Newer song', channel: 'Artist' })
  await page.addInitScript(
    ({ older, newer }) => {
      if (localStorage.getItem('test.seeded')) return
      localStorage.setItem('volna.liked', JSON.stringify([older.id, newer.id]))
      localStorage.setItem('volna.online-tracks', JSON.stringify([older, newer]))
      localStorage.setItem(
        'volna.playlists',
        JSON.stringify([
          {
            id: 'custom',
            title: 'My list',
            description: '',
            artwork: 'blue',
            color: '#5485ff',
            tracks: [older.id, newer.id],
          },
        ]),
      )
      localStorage.setItem('test.seeded', 'yes')
    },
    { older, newer },
  )
  await page.route('**/api/youtube/status', (r) => r.fulfill({ json: { configured: true } }))
  await page.route('**/api/youtube/search?**', (r) =>
    r.fulfill({ json: { items: [{ id: 'third000001', title: 'Third song', channel: 'Artist' }] } }),
  )
  await page.goto('/')
  await page
    .locator('.collection-nav')
    .getByRole('button', { name: /Любимые треки/ })
    .click()
  await expect(page.locator('.track-info strong')).toHaveText(['Newer song', 'Older song'])
  await expect(page.locator('.collection-meta')).not.toContainText('Алекс')
  await page.getByRole('textbox', { name: 'Поиск музыки' }).fill('third')
  await page.getByRole('button', { name: 'Добавить Third song в избранное', exact: true }).click()
  await page.getByRole('button', { name: 'Добавить Third song в плейлист', exact: true }).click()
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /My list/ })
    .click()
  await page.reload()
  await page
    .locator('.collection-nav')
    .getByRole('button', { name: /Любимые треки/ })
    .click()
  await expect(page.locator('.track-info strong')).toHaveText([
    'Third song',
    'Newer song',
    'Older song',
  ])
  await page
    .locator('.sidebar-playlists')
    .getByRole('button', { name: /My list/ })
    .click()
  await expect(page.locator('.track-info strong')).toHaveText([
    'Third song',
    'Newer song',
    'Older song',
  ])
})

test('a song selected through search drives fresh wave recommendations from its related feed', async ({
  page,
}) => {
  await mockYouTubePlayback(page)
  const seeds: string[] = []
  await page.route('**/api/youtube/status', (r) => r.fulfill({ json: { configured: true } }))
  await page.route('**/api/youtube/search?**', (r) =>
    r.fulfill({
      json: {
        items: [
          { id: 'seed0000001', title: 'supwel - deja vu (chill wave vibe)', channel: 'supwel' },
          { id: 'other000001', title: 'Unselected search result', channel: 'Another artist' },
        ],
      },
    }),
  )
  await page.route('**/api/youtube/related?**', (r) => {
    seeds.push(new URL(r.request().url()).searchParams.get('id')!)
    return r.fulfill({
      json: {
        items: Array.from({ length: 12 }, (_, i) => ({
          id: `rec${String(i).padStart(8, '0')}`,
          title: `Recommended wave ${i}`,
          channel: `New artist ${i % 4}`,
        })),
      },
    })
  })
  await page.goto('/')
  await page.getByRole('textbox', { name: 'Поиск музыки' }).fill('supwel')
  await page
    .getByRole('button', { name: 'Слушать supwel - deja vu (chill wave vibe)', exact: true })
    .click()
  await expect(page.getByRole('button', { name: 'Пауза', exact: true })).toBeVisible()
  await page.locator('.primary-nav').getByRole('button', { name: 'Моя волна', exact: true }).click()
  await expect(page.locator('.wave-status')).toContainText('12 новых треков')
  expect(seeds[0]).toBe('seed0000001')
  expect(seeds).not.toContain('other000001')
  await expect(page.locator('.track-info strong').first()).toContainText('Recommended wave')
  await page.getByRole('button', { name: 'Включить волну', exact: true }).click()
  await expect(page.locator('.player-track-info strong')).toContainText('Recommended wave')
  await expect(page.getByRole('button', { name: 'Пауза', exact: true })).toBeVisible()
  await expect(page.locator('iframe,video')).toHaveCount(0)
})

test('search keeps the input focus while modifier keys and refreshed results are handled', async ({
  page,
}) => {
  await page.route('**/api/youtube/status', (r) => r.fulfill({ json: { configured: true } }))
  await page.route('**/api/youtube/search?**', (r) => r.fulfill({ json: { items: [] } }))
  await page.goto('/')
  const input = page.getByRole('textbox', { name: 'Поиск музыки' })
  await input.fill('jazz')
  await input.press('Alt+Shift')
  await page.keyboard.insertText('джаз')
  await expect(input).toHaveValue('jazzджаз')
  await expect(page.getByRole('heading', { name: 'Нашлось на YouTube', exact: true })).toBeVisible()
  await expect(input).toBeFocused()
})
