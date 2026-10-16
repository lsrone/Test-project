import { _electron, expect } from '@playwright/test'
import { createServer } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

// Launch the production desktop entry point, not a browser/server approximation.
// ELECTRON_PATH selects an independently checksum-verified runtime when the
// dependency was installed with ELECTRON_SKIP_BINARY_DOWNLOAD=1.
const profile = await mkdtemp(join(tmpdir(), 'volna-electron-live-'))
const redirects = createServer(async (req, res) => {
  if (req.url === '/post') {
    const body = []
    for await (const chunk of req) body.push(chunk)
    res.setHeader('Content-Type', 'application/json')
    res.end(
      JSON.stringify({
        method: req.method,
        body: JSON.parse(Buffer.concat(body).toString()),
        type: req.headers['content-type'],
      }),
    )
  } else if (req.url === '/redirect') {
    res.writeHead(302, { Location: '/audio' })
    res.end()
  } else {
    res.writeHead(206, {
      'Content-Type': 'audio/mpeg',
      'Content-Length': '4',
      'Content-Range': 'bytes 2-5/10',
    })
    res.end(req.method === 'HEAD' ? undefined : '2345')
  }
})
await new Promise((done) => redirects.listen(0, '127.0.0.1', done))
const origin = `http://127.0.0.1:${redirects.address().port}`
let app
try {
  app = await _electron.launch({
    ...(process.env.ELECTRON_PATH ? { executablePath: process.env.ELECTRON_PATH } : {}),
    args: [
      ...(process.platform === 'linux' ? ['--no-sandbox', '--disable-gpu'] : []),
      `--user-data-dir=${profile}`,
      ...(process.env.HTTPS_PROXY ? [`--proxy-server=${process.env.HTTPS_PROXY}`] : []),
      '.',
    ],
  })
  if (process.env.ELECTRON_TEST_HOME)
    await app.evaluate(({ app }, home) => app.setPath('home', home), process.env.ELECTRON_TEST_HOME)
  const networkModule = resolve('desktop/network.mjs')
  const transport = await app.evaluate(
    async ({ net }, { origin, networkModule }) => {
      let originalError
      try {
        await net.fetch(`${origin}/redirect`, { redirect: 'manual', credentials: 'omit' })
      } catch (error) {
        originalError = error.message
      }
      const { desktopFetch } = process.getBuiltinModule('module').createRequire(networkModule)(
        networkModule,
      )
      const fetcher = desktopFetch((options) => net.request(options))
      const redirected = await fetcher(`${origin}/redirect`, { redirect: 'manual' })
      const url = new URL(redirected.headers.get('location'), origin)
      const audio = await fetcher(url, { headers: { Range: 'bytes=2-5' } })
      const head = await fetcher(url, { method: 'HEAD' })
      const post = await fetcher(`${origin}/post`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'ØDEN Blink' }),
      })
      const posted = await post.json()
      const controller = new AbortController()
      controller.abort()
      let aborted
      try {
        await fetcher(url, { signal: controller.signal })
      } catch (error) {
        aborted = error.name
      }
      return {
        originalError,
        posted,
        redirectStatus: redirected.status,
        status: audio.status,
        range: audio.headers.get('content-range'),
        bytes: await audio.text(),
        headStatus: head.status,
        headBytes: await head.text(),
        aborted,
      }
    },
    { origin, networkModule },
  )
  expect(transport).toEqual({
    originalError: 'Redirect was cancelled',
    posted: { method: 'POST', body: { query: 'ØDEN Blink' }, type: 'application/json' },
    redirectStatus: 302,
    status: 206,
    range: 'bytes 2-5/10',
    bytes: '2345',
    headStatus: 206,
    headBytes: '',
    aborted: 'AbortError',
  })
  const page = await app.firstWindow()
  await page.waitForURL('http://127.0.0.1:28741/')
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.getByRole('textbox', { name: 'Поиск музыки' }).fill('Aydio')
  await page.getByRole('tab', { name: 'Аудиокаталог', exact: true }).click()
  const row = page
    .locator('.audio-search .track-row')
    .filter({ hasText: 'Aydio_-_03_-_XHD' })
    .first()
  await expect(row).toBeVisible({ timeout: 45000 })
  await row.locator('.track-cover').click()
  await expect
    .poll(() => page.locator('audio').evaluate((audio) => audio.currentTime), {
      timeout: 40000,
    })
    .toBeGreaterThan(0.3)
  const duration = await page.locator('audio').evaluate((audio) => audio.duration)
  expect(duration).toBeGreaterThan(200)
  await page.getByRole('slider', { name: 'Позиция воспроизведения' }).fill('60')
  await expect
    .poll(() => page.locator('audio').evaluate((audio) => audio.currentTime), {
      timeout: 20000,
    })
    .toBeGreaterThan(59)
  await page.getByRole('button', { name: 'Пауза', exact: true }).click()
  await expect(page.locator('audio')).toHaveJSProperty('paused', true)
  await page.getByRole('button', { name: 'Воспроизвести', exact: true }).click()
  await expect(page.locator('audio')).toHaveJSProperty('paused', false)
  const next = page
    .locator('.audio-search .track-row')
    .filter({ hasText: 'Aydio_-_04_-_Step_One' })
    .first()
  await next.locator('.track-cover').click()
  await expect
    .poll(() => page.locator('audio').evaluate((audio) => audio.currentSrc))
    .toContain('Step_One.mp3')
  await expect
    .poll(() => page.locator('audio').evaluate((audio) => audio.duration), {
      timeout: 35000,
    })
    .toBeGreaterThan(200)
  await expect
    .poll(() => page.locator('audio').evaluate((audio) => audio.currentTime), {
      timeout: 15000,
    })
    .toBeGreaterThan(0.3)
  await expect(page.locator('iframe, video')).toHaveCount(0)
  expect(errors).toEqual([])
  await page.screenshot({ path: '/tmp/volna-electron-live.png' })
  console.log(
    JSON.stringify({
      passed: true,
      runtime: await app.evaluate(() => process.versions.electron),
      transport,
      provider: 'Internet Archive, real requests',
      fixtures: false,
      tracks: ['DWK031 / Aydio XHD', 'DWK031 / Aydio Step One'],
      duration,
      seekSeconds: 60,
      pauseResume: true,
      trackSwitch: true,
      nativeWindowsTested: process.platform === 'win32',
    }),
  )
} finally {
  if (app) await app.close()
  redirects.closeAllConnections()
  await new Promise((done) => redirects.close(done))
  await rm(profile, { recursive: true, force: true })
}
