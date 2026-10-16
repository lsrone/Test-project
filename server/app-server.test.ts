import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { startAppServer } from './app-server.mjs'

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
})
async function start() {
  const root = await mkdtemp(join(tmpdir(), 'volna-desktop-'))
  cleanups.push(() => rm(root, { recursive: true, force: true }))
  await writeFile(join(root, 'index.html'), '<title>Volna desktop</title>')
  await writeFile(join(root, 'song.mp3'), Buffer.from('0123456789'))
  const service = await startAppServer({
    root,
    port: 0,
    catalogApi: (req, res, next) => {
      if (req.url === '/api/archive/search') {
        res.setHeader('Content-Type', 'application/json')
        res.end('{"configured":true,"mode":"public"}')
      } else next()
    },
  })
  cleanups.push(service.close)
  return service.origin
}
describe('Windows app local server', () => {
  it('serves the application and its built-in API on a loopback origin', async () => {
    const origin = await start()
    const page = await fetch(origin)
    expect(await page.text()).toContain('Volna desktop')
    expect(page.headers.get('content-security-policy')).toContain("script-src 'self'")
    expect(await (await fetch(`${origin}/api/archive/search`)).json()).toEqual({
      configured: true,
      mode: 'public',
    })
  })
  it('supports full, partial, suffix and invalid audio ranges for offline seeking', async () => {
    const origin = await start()
    const partial = await fetch(`${origin}/song.mp3`, { headers: { Range: 'bytes=2-5' } })
    expect(partial.status).toBe(206)
    expect(partial.headers.get('content-range')).toBe('bytes 2-5/10')
    expect(await partial.text()).toBe('2345')
    expect(
      await (await fetch(`${origin}/song.mp3`, { headers: { Range: 'bytes=-3' } })).text(),
    ).toBe('789')
    expect((await fetch(`${origin}/song.mp3`, { headers: { Range: 'bytes=50-' } })).status).toBe(
      416,
    )
    expect(await (await fetch(`${origin}/song.mp3`)).text()).toBe('0123456789')
  })
  it('rejects filesystem traversal and requests from a different origin', async () => {
    const origin = await start()
    expect((await fetch(`${origin}/..%2fprivate.json`)).status).toBe(403)
    expect((await fetch(origin, { headers: { Origin: 'https://example.com' } })).status).toBe(403)
    expect((await fetch(`${origin}/missing.js`)).status).toBe(404)
  })
})
