import { test, expect } from '@playwright/test'
import { mockArchive } from './archive-fixture'
test.use({ serviceWorkers: 'block' })
test('legacy YouTube likes survive, are not queued as audio, and new playable favourites appear above them', async ({
  page,
}) => {
  await page.addInitScript(() => {
    if (localStorage.getItem('test.seeded')) return
    const tracks = ['Older song', 'Newer song'].map((title, i) => ({
      id: `youtube:legacy0000${i}`,
      youtubeId: `legacy0000${i}`,
      source: 'youtube',
      title,
      artist: 'Old Artist',
      genre: 'YouTube',
      audio: '',
      duration: 0,
      moods: [],
      artwork: 'blue',
      cover: 'blue',
      color: '#5485ff',
    }))
    localStorage.setItem('volna.online-tracks', JSON.stringify(tracks))
    localStorage.setItem('volna.liked', JSON.stringify(tracks.map((t) => t.id)))
    localStorage.setItem('volna.current', JSON.stringify(tracks[0].id))
    localStorage.setItem('test.seeded', 'yes')
  })
  const requests: string[] = []
  page.on('request', (r) => requests.push(r.url()))
  await mockArchive(page)
  await page.goto('/')
  await expect(page.locator('.player-track-info strong')).toHaveText('Blue Hour')
  await page
    .locator('.collection-nav')
    .getByRole('button', { name: /Любимые треки/ })
    .click()
  await expect(page.locator('.track-info strong')).toHaveText(['Newer song', 'Older song'])
  await expect(page.locator('.legacy-notice')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Слушать коллекцию', exact: true })).toBeDisabled()
  await expect(page.locator('.collection-meta')).not.toContainText('Алекс')
  await page.getByRole('textbox', { name: 'Поиск музыки' }).fill('ambient')
  await page.getByRole('button', { name: 'Добавить Ocean Lights в избранное', exact: true }).click()
  await page.reload()
  await page
    .locator('.collection-nav')
    .getByRole('button', { name: /Любимые треки/ })
    .click()
  await expect(page.locator('.track-info strong')).toHaveText([
    'Ocean Lights',
    'Newer song',
    'Older song',
  ])
  await page.getByRole('button', { name: 'Слушать коллекцию', exact: true }).click()
  await expect(page.locator('.player-track-info strong')).toHaveText('Ocean Lights')
  await page.getByRole('button', { name: 'Следующий трек', exact: true }).click()
  await expect(page.locator('.player-track-info strong')).toHaveText('Ocean Lights')
  expect(requests.some((url) => /youtube|googlevideo/.test(url))).toBe(false)
})
test('an explicit search choice teaches the wave a genre and cached unselected results do not', async ({
  page,
}) => {
  const queries = await mockArchive(page, { genre: 'jazz' })
  await page.goto('/')
  await page.getByRole('textbox', { name: 'Поиск музыки' }).fill('saxophone')
  await page.getByRole('button', { name: 'Слушать Ocean Lights', exact: true }).click()
  expect(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem('volna.search-choices') || '[]').map(
        (choice) => choice.trackId,
      ),
    ),
  ).toEqual(['archive:search-0:song.mp3'])
  await page.locator('.primary-nav').getByRole('button', { name: 'Моя волна', exact: true }).click()
  await expect.poll(() => queries.some((query) => query.includes('jazz'))).toBe(true)
  await expect(page.locator('iframe,video')).toHaveCount(0)
})
test('search retains focus and cursor through keyboard layout modifiers', async ({ page }) => {
  await mockArchive(page)
  await page.goto('/')
  const input = page.getByRole('textbox', { name: 'Поиск музыки' })
  await input.fill('jazz')
  await input.press('Alt+Shift')
  await page.keyboard.insertText('джаз')
  await expect(input).toHaveValue('jazzджаз')
  await expect(
    page.getByRole('heading', { name: 'Нашлось в аудиокаталоге', exact: true }),
  ).toBeVisible()
  await expect(input).toBeFocused()
})
