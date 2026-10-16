import { startAppServer } from '../server/app-server.mjs'

// Live-only check: never substitutes provider responses or counts fixtures as success.
const id = process.argv[2]
if (!/^[A-Za-z0-9_-]{11}$/.test(id || '')) {
  console.error('Usage: npm run test:youtube:live -- VIDEO_ID (a public, non-live recording)')
  process.exitCode = 2
} else {
  const app = await startAppServer({ root: 'dist', port: 0 })
  try {
    const resolved = await fetch(`${app.origin}/api/youtube/resolve?id=${id}`, {
      signal: AbortSignal.timeout(45000),
    })
    const source = await resolved.json()
    if (!resolved.ok) {
      console.error(
        JSON.stringify({ livePlaybackVerified: false, status: resolved.status, ...source }),
      )
      process.exitCode = 1
    } else {
      const response = await fetch(`${app.origin}${source.audio}`, {
        headers: { Range: 'bytes=0-65535' },
        signal: AbortSignal.timeout(20000),
      })
      const bytes = new Uint8Array(await response.arrayBuffer())
      if (
        response.status !== 206 ||
        bytes.length !== 65536 ||
        !/^audio\//.test(response.headers.get('content-type') || '')
      ) {
        console.error(
          JSON.stringify({
            livePlaybackVerified: false,
            stage: 'audio',
            status: response.status,
            bytes: bytes.length,
          }),
        )
        process.exitCode = 1
      } else
        console.log(
          JSON.stringify({
            liveAudioTransportVerified: true,
            videoId: id,
            status: response.status,
            bytes: bytes.length,
            duration: source.duration,
          }),
        )
    }
  } finally {
    await app.close()
  }
}
