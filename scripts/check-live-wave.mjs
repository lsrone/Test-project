import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { EnvHttpProxyAgent } from 'undici'

// Explicit opt-in live test. Keep TLS verification and the environment's proxy.
const nativeFetch = globalThis.fetch
const agent = new EnvHttpProxyAgent()
globalThis.fetch = (input, options = {}) => nativeFetch(input, { ...options, dispatcher: agent })
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
const started = performance.now()
try {
  const { discoverWave } = await server.ssrLoadModule('/src/wave.ts')
  const ids = new Set()
  const tracks = []
  const pages = new Set()
  let cursor
  let batches = 0
  while (ids.size < 120 && batches < 20) {
    const result = await discoverWave({
      query: 'ambient',
      mood: 'focus',
      knownIds: ids,
      cursor,
      signal: AbortSignal.timeout(26000),
    })
    batches++
    for (const track of result.tracks) {
      assert(!ids.has(track.id), `Repeated track: ${track.id}`)
      assert.equal(track.source, 'archive')
      assert.equal(new URL(track.audio).hostname, 'archive.org')
      ids.add(track.id)
      tracks.push(track)
    }
    cursor = result.cursor
    pages.add(cursor.page)
    console.log(
      `Live wave batch ${batches}: +${result.tracks.length}, ${ids.size} distinct tracks, catalogue page ${cursor.page}`,
    )
    if (!result.hasMore) break
  }
  assert(ids.size >= 120, `Expected at least 120 tracks, received ${ids.size}`)
  const response = await globalThis.fetch(tracks[0].audio, {
    headers: { Range: 'bytes=0-65535', Origin: 'http://127.0.0.1:4173' },
    signal: AbortSignal.timeout(20000),
  })
  assert.equal(response.status, 206, 'MP3 must support seeking with HTTP Range')
  assert.match(response.headers.get('content-type') || '', /audio/)
  assert.equal(response.headers.get('access-control-allow-origin'), '*')
  const reader = response.body.getReader()
  let bytes = 0
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      bytes += chunk.value.byteLength
    }
  } finally {
    reader.releaseLock()
  }
  assert.equal(bytes, 65536)
  console.log(
    JSON.stringify({
      passed: true,
      uniqueTracks: ids.size,
      batches,
      cataloguePages: [...pages],
      sampleAudioBytes: bytes,
      seconds: Number(((performance.now() - started) / 1000).toFixed(1)),
    }),
  )
} catch (error) {
  // These requests contain no credentials; still avoid logging transport URLs or internals.
  console.error(
    `Live wave check failed: ${error instanceof assert.AssertionError ? error.message : error.name}`,
  )
  process.exitCode = 1
} finally {
  globalThis.fetch = nativeFetch
  await server.close()
  await agent.close()
}
