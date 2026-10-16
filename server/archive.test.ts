import { describe, it, expect } from 'vitest'
import { createServer } from 'node:http'
import { createArchiveApi, archiveHost } from './archive.mjs'
async function withServer(fetcher, check) {
  const api = createArchiveApi({ fetcher })
  const server = createServer(
    (req, res) =>
      void api(req, res, () => {
        res.statusCode = 404
        res.end()
      }),
  )
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  try {
    await check(`http://127.0.0.1:${(server.address() as any).port}`)
  } finally {
    server.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
}
describe('audio catalogue gateway', () => {
  it('keeps search within the audio collection, bounds pagination and caches metadata', async () => {
    const calls: URL[] = []
    await withServer(
      async (url) => {
        calls.push(new URL(url))
        return Response.json({ response: { docs: [], numFound: 0 } })
      },
      async (origin) => {
        expect((await fetch(`${origin}/api/archive/search?q=ambient&page=2`)).status).toBe(200)
        await fetch(`${origin}/api/archive/search?q=ambient&page=2`)
        expect(calls).toHaveLength(1)
        expect(calls[0].searchParams.get('q')).toContain('collection:netlabels')
        expect(calls[0].searchParams.get('page')).toBe('2')
        expect((await fetch(`${origin}/api/archive/search?page=-1`)).status).toBe(400)
        expect((await fetch(`${origin}/api/archive/search`, { method: 'POST' })).status).toBe(405)
      },
    )
  })
  it('streams actual byte ranges after checking file membership and follows only Archive redirects', async () => {
    const ranges: string[] = []
    await withServer(
      async (url, options) => {
        if (url.pathname.includes('/metadata/'))
          return Response.json({ files: [{ name: 'song.mp3' }] })
        ranges.push(options.headers.Range)
        if (url.hostname === 'archive.org')
          return new Response(null, {
            status: 302,
            headers: { Location: 'https://ia800123.us.archive.org/song.mp3' },
          })
        return new Response('2345', {
          status: 206,
          headers: {
            'Content-Type': 'audio/mpeg',
            'Content-Length': '4',
            'Content-Range': 'bytes 2-5/10',
          },
        })
      },
      async (origin) => {
        const response = await fetch(`${origin}/api/archive/audio?release=test&file=song.mp3`, {
          headers: { Range: 'bytes=2-5' },
        })
        expect(response.status).toBe(206)
        expect(response.headers.get('content-range')).toBe('bytes 2-5/10')
        expect(await response.text()).toBe('2345')
        expect(ranges).toEqual(['bytes=2-5', 'bytes=2-5'])
      },
    )
    for (const url of [
      'http://archive.org/x',
      'https://archive.org.evil.example/x',
      'https://127.0.0.1/x',
      'https://user:pass@archive.org/x',
    ])
      expect(() => archiveHost(url)).toThrow()
  })
  it('refuses private, missing and traversal files and never proxies HTML as audio', async () => {
    let mediaCalls = 0
    await withServer(
      async (url) => {
        if (url.pathname.includes('/metadata/'))
          return Response.json({
            files: [{ name: 'private.mp3', private: 'true' }, { name: 'page.mp3' }],
          })
        mediaCalls++
        return new Response('<html>not audio</html>', { headers: { 'Content-Type': 'text/html' } })
      },
      async (origin) => {
        for (const file of ['private.mp3', 'missing.mp3'])
          expect(
            (await fetch(`${origin}/api/archive/audio?release=test&file=${file}`)).status,
          ).toBe(403)
        expect(mediaCalls).toBe(0)
        expect(
          (await fetch(`${origin}/api/archive/audio?release=test&file=..%2Fsong.mp3`)).status,
        ).toBe(400)
        expect((await fetch(`${origin}/api/archive/audio?release=test&file=page.mp3`)).status).toBe(
          502,
        )
        expect(mediaCalls).toBe(1)
      },
    )
  })
  it('rejects restricted items and redirects outside the provider', async () => {
    await withServer(
      async () =>
        Response.json({
          metadata: { 'access-restricted-item': 'true' },
          files: [{ name: 'song.mp3' }],
        }),
      async (origin) => {
        expect((await fetch(`${origin}/api/archive/audio?release=test&file=song.mp3`)).status).toBe(
          403,
        )
      },
    )
    let calls = 0
    await withServer(
      async () => {
        calls++
        return new Response(null, {
          status: 302,
          headers: { Location: 'https://127.0.0.1/private' },
        })
      },
      async (origin) => {
        expect((await fetch(`${origin}/api/archive/metadata/test`)).status).toBe(502)
        expect(calls).toBe(1)
      },
    )
  })
  it('reports safe playback diagnostics and clears them after a successful retry', async () => {
    let unavailable = true
    await withServer(
      async (url) => {
        if (url.pathname.includes('/metadata/'))
          return Response.json({ files: [{ name: 'song.mp3' }] })
        if (unavailable)
          throw Error('net::ERR_CERT_AUTHORITY_INVALID https://secret.example/?token=private')
        return new Response('real audio bytes', { headers: { 'Content-Type': 'audio/mpeg' } })
      },
      async (origin) => {
        const query = '?release=test&file=song.mp3'
        expect((await fetch(`${origin}/api/archive/audio${query}`)).status).toBe(502)
        const diagnostic = await (
          await fetch(`${origin}/api/archive/playback-status${query}`)
        ).json()
        expect(diagnostic.failure).toMatchObject({ code: 'TLS', stage: 'audio' })
        expect(JSON.stringify(diagnostic)).not.toMatch(/secret|token|private|https:/)
        unavailable = false
        expect(await (await fetch(`${origin}/api/archive/audio${query}`)).text()).toBe(
          'real audio bytes',
        )
        expect(await (await fetch(`${origin}/api/archive/playback-status${query}`)).json()).toEqual(
          { failure: null },
        )
      },
    )
  })
})
