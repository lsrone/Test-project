import { test, expect } from '@playwright/test'
import { mockArchive } from './archive-fixture'

test.use({ serviceWorkers: 'block' })

test('imports 128 CSV tracks, merges repeated imports, persists playlists and favourites, and searches the audio catalogue', async ({
  page,
}) => {
  const rows = Array.from(
    { length: 128 },
    (_, n) =>
      `${1000 + n},My track ${n},Artist ${n % 7},Album ${n % 3},${n % 2 ? 'Ночь из Яндекса' : 'Дорога из Яндекса'},${n % 2 === 0}`,
  )
  const csv = `ID,Track name,Artist name,Album,Playlist,Liked\n${rows.join('\n')}\n${rows[0].replace('Дорога из Яндекса', 'Ночь из Яндекса')}\n,,,,,`
  const upload = { name: 'yandex-library.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) }
  const sent: string[] = []
  page.on('request', (request) => {
    if (['POST', 'PUT'].includes(request.method())) sent.push(request.url())
  })
  const queries = await mockArchive(page, { title: 'Matched imported recording' })
  await page.goto('/')
  await page.getByRole('button', { name: 'Перенести библиотеку', exact: true }).click()
  await page.getByLabel('Файл экспорта Яндекс Музыки').setInputFiles(upload)
  await expect(page.locator('.import-cleanup')).toContainText('повторов: 1')
  await page.getByRole('button', { name: 'Перенести 128 треков', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Библиотека уже здесь' })).toBeVisible()
  await expect(page.locator('.import-success')).toContainText('Добавлено 128 треков')
  await page.getByRole('button', { name: 'Перенести ещё один файл', exact: true }).click()
  await page.getByLabel('Файл экспорта Яндекс Музыки').setInputFiles(upload)
  await page.getByRole('button', { name: 'Перенести 128 треков', exact: true }).click()
  await expect(page.locator('.import-success')).toContainText('Добавлено 0 треков')
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem('volna.liked') || '[]').length),
  ).toBe(64)
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem('volna.playlists') || '[]').filter(
          (playlist: { id: string }) => playlist.id.startsWith('yandex-playlist-'),
        ).length,
    ),
  ).toBe(2)
  await page.reload()
  await page.getByRole('textbox', { name: 'Поиск музыки' }).fill('My track')
  await page.getByRole('tab', { name: 'В библиотеке' }).click()
  await expect(page.locator('.track-row')).toHaveCount(128)
  await page.getByRole('textbox', { name: 'Поиск музыки' }).fill('My track 127')
  await page.getByRole('button', { name: 'Найти My track 127 в каталоге', exact: true }).click()
  await expect(page.locator('.audio-search .track-row')).toHaveCount(4)
  await expect(page.getByRole('textbox', { name: 'Поиск музыки' })).toHaveValue(
    'Artist 1 My track 127',
  )
  expect(queries.some((query) => query.includes('Artist AND 1 AND My AND track AND 127'))).toBe(
    true,
  )
  await page.getByRole('button', { name: 'Слушать Matched imported recording' }).click()
  await expect(page.locator('iframe,video')).toHaveCount(0)
  await expect(page.locator('audio')).toHaveJSProperty('paused', false)
  expect(sent).toEqual([])
})

test('imports nested JSON playlists and favourites, then rejects an ID-only file without changing the library', async ({
  page,
}) => {
  const track = {
    id: 42,
    title: 'Ночной рейс',
    artists: [{ name: 'Группа' }],
    albums: [{ id: 11, title: 'Город' }],
  }
  const json = {
    result: {
      playlists: [
        { title: 'Ночь', tracks: [{ track }] },
        {
          title: 'Дорога',
          tracks: [{ track }, { track: { ...track, id: 43, title: 'Утренний свет' } }],
        },
      ],
      likedTracks: [{ track }],
    },
  }
  await page.goto('/')
  await page.getByRole('button', { name: 'Перенести библиотеку', exact: true }).click()
  await page.getByLabel('Файл экспорта Яндекс Музыки').setInputFiles({
    name: 'yandex-export.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(json)),
  })
  await page.getByRole('button', { name: 'Перенести 2 треков', exact: true }).click()
  await page.getByRole('button', { name: 'Открыть перенесённую коллекцию' }).click()
  await expect(page.getByRole('heading', { name: 'Ночь', exact: true })).toBeVisible()
  await expect(page.locator('.track-row')).toHaveCount(1)
  await page
    .locator('.collection-nav')
    .getByRole('button', { name: /Любимые треки/ })
    .click()
  await expect(page.locator('.track-info strong')).toHaveText('Ночной рейс')
  await page.getByRole('button', { name: 'Перенести библиотеку', exact: true }).first().click()
  await page.getByLabel('Файл экспорта Яндекс Музыки').setInputFiles({
    name: 'ids.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"tracks":[{"id":123}]}'),
  })
  await expect(page.getByRole('alert')).toContainText('полные метаданные')
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('volna.online-tracks') || '[]').length,
    ),
  ).toBe(2)
})
