import { test, expect } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { mockYouTube } from './youtube-fixture'
test.use({ serviceWorkers: 'block' })
test('imports a plain TXT, previews reversed columns and preserves the collection on reimport', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Перенести библиотеку', exact: true }).click()
  const upload = {
    name: 'Мне нравится.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('First Light - Polar Echo\nНочной маршрут - Север\nSignal - ØMEN, GUEST'),
  }
  await page.getByLabel('Файл экспорта Яндекс Музыки').setInputFiles(upload)
  await expect(page.locator('.import-song-preview strong').first()).toHaveText('Polar Echo')
  await page.getByLabel('Порядок полей в TXT').selectOption('title-artist')
  await expect(page.locator('.import-song-preview strong')).toHaveText([
    'First Light',
    'Ночной маршрут',
    'Signal',
  ])
  await expect(page.locator('.import-song-preview small').last()).toHaveText('ØMEN, GUEST')
  await page.getByRole('button', { name: 'Перенести 3 треков', exact: true }).click()
  await page.getByRole('button', { name: 'Перенести ещё один файл' }).click()
  await page.getByLabel('Файл экспорта Яндекс Музыки').setInputFiles(upload)
  await page.getByRole('button', { name: 'Перенести 3 треков', exact: true }).click()
  await expect(page.locator('.import-success')).toContainText('Добавлено 0 треков')
  await page.getByRole('button', { name: 'Открыть перенесённую коллекцию' }).click()
  await expect(page.locator('.track-row')).toHaveCount(3)
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem('volna.liked') || '[]').length),
  ).toBe(3)
})
test('a local audio attachment plays inside the app, survives metadata refresh, seeks offline and can be removed without losing the favourite', async ({
  page,
  context,
}) => {
  await mockYouTube(page, { total: 2 })
  await page.goto('/')
  await page.getByRole('textbox', { name: 'Поиск музыки' }).fill('ambient')
  await expect(page.locator('.youtube-search .track-row')).toHaveCount(2)
  await page.getByRole('button', { name: 'Добавить ØDEN — Blink в избранное', exact: true }).click()
  await page.getByRole('button', { name: 'Добавить аудио для ØDEN — Blink', exact: true }).click()
  await page.getByLabel('Аудиофайл для трека').setInputFiles({
    name: 'owned.mp3',
    mimeType: 'audio/mpeg',
    buffer: await readFile('public/audio/blue-hour.mp3'),
  })
  await expect(page.getByRole('dialog', { name: 'Прослушивание в Volna' })).toHaveCount(0)
  await expect(page.locator('.player-track-info strong')).toHaveText('ØDEN — Blink')
  await expect
    .poll(() => page.locator('audio').evaluate((a: HTMLAudioElement) => a.currentTime))
    .toBeGreaterThan(0.1)
  expect(context.pages()).toHaveLength(1)
  await expect(page.locator('iframe,video')).toHaveCount(0)
  // Fetch the same remote metadata again; it must not detach the local file.
  await page.getByRole('textbox', { name: 'Поиск музыки' }).fill('ambient wave')
  await expect(
    page.getByRole('button', { name: 'Слушать ØDEN — Blink', exact: true }),
  ).toBeVisible()
  await page.getByRole('textbox', { name: 'Поиск музыки' }).fill('')
  await page
    .locator('.collection-nav')
    .getByRole('button', { name: /Скачанное/ })
    .click()
  await expect(page.locator('.track-row')).toHaveCount(1)
  await page.reload()
  await context.setOffline(true)
  await page
    .locator('.collection-nav')
    .getByRole('button', { name: /Скачанное/ })
    .click()
  await page.getByRole('button', { name: 'Слушать ØDEN — Blink', exact: true }).click()
  await expect
    .poll(() => page.locator('audio').evaluate((a: HTMLAudioElement) => a.currentTime))
    .toBeGreaterThan(0.1)
  await page.getByRole('slider', { name: 'Позиция воспроизведения' }).fill('20')
  await expect
    .poll(() => page.locator('audio').evaluate((a: HTMLAudioElement) => a.currentTime))
    .toBeGreaterThan(19)
  await page.getByRole('button', { name: 'Удалить аудиофайл ØDEN — Blink', exact: true }).click()
  await expect(page.locator('.track-row')).toHaveCount(0)
  await page
    .locator('.collection-nav')
    .getByRole('button', { name: /Любимые треки/ })
    .click()
  await expect(page.locator('.track-info strong')).toHaveText('ØDEN — Blink')
  await expect(
    page.getByRole('button', { name: 'Добавить аудио для ØDEN — Blink', exact: true }),
  ).toBeVisible()
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem('volna.liked') || '[]')),
  ).toEqual(['youtube:vid00000000'])
})
test('rejecting a bad local file leaves existing audio and collection membership intact', async ({
  page,
}) => {
  await mockYouTube(page, { total: 2 })
  await page.goto('/')
  await page.getByRole('textbox', { name: 'Поиск музыки' }).fill('ambient')
  await page.getByRole('button', { name: 'Добавить аудио для ØDEN — Blink', exact: true }).click()
  await page.getByLabel('Аудиофайл для трека').setInputFiles({
    name: 'not-music.mp3',
    mimeType: 'audio/mpeg',
    buffer: Buffer.from('<html>not audio</html>'),
  })
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('повреждён')
  expect(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem('volna.online-tracks') || '[]').some((t) => t.localAudio),
    ),
  ).toBe(false)
  await page.getByRole('button', { name: 'Закрыть выбор аудио' }).click()
  await page
    .locator('.collection-nav')
    .getByRole('button', { name: /Скачанное/ })
    .click()
  await expect(page.locator('.track-row')).toHaveCount(0)
})
