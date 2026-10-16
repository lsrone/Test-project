import { Readable } from 'node:stream'

// Electron's net.fetch rejects manual redirects with "Redirect was cancelled".
// Expose net.request's redirect event as a Response so the catalogue gateway can
// validate every destination before sending the next request. TLS and the OS
// proxy remain Chromium's responsibility; account cookies are never attached.
export function desktopFetch(requestWithChromium) {
  return async (input, options = {}) => {
    const { timeoutMs = 12000, dispatcher: _dispatcher, ...init } = options
    const request = new Request(input, init)
    const signal = timeoutMs
      ? AbortSignal.any([request.signal, AbortSignal.timeout(timeoutMs)])
      : request.signal
    if (!['GET', 'HEAD'].includes(request.method)) throw Error('Unsupported catalogue method')
    signal.throwIfAborted()
    return new Promise((resolve, reject) => {
      const outgoing = requestWithChromium({
        url: request.url,
        method: request.method,
        redirect: request.redirect,
        credentials: 'omit',
        useSessionCookies: false,
      })
      const cleanup = () => signal.removeEventListener('abort', abort)
      const abort = () => {
        cleanup()
        reject(signal.reason)
        outgoing.abort()
      }
      signal.addEventListener('abort', abort, { once: true })
      outgoing.on('error', (error) => {
        cleanup()
        reject(error)
      })
      outgoing.on('redirect', (status, _method, location, rawHeaders) => {
        if (request.redirect !== 'manual') return
        const headers = responseHeaders(rawHeaders)
        headers.set('location', location)
        resolve(new Response(null, { status, headers }))
        cleanup()
        outgoing.abort()
      })
      outgoing.on('response', (incoming) => {
        incoming.once('end', cleanup)
        incoming.once('close', () => {
          cleanup()
          if (!incoming.readableEnded) outgoing.abort()
        })
        const bodyless = request.method === 'HEAD' || [204, 205, 304].includes(incoming.statusCode)
        const body = bodyless ? null : Readable.toWeb(incoming)
        resolve(
          new Response(body, {
            status: incoming.statusCode,
            headers: responseHeaders(incoming.headers),
          }),
        )
        if (bodyless) incoming.resume()
      })
      for (const [name, value] of request.headers) outgoing.setHeader(name, value)
      outgoing.end()
    })
  }
}

function responseHeaders(raw) {
  const headers = new Headers()
  for (const [name, values] of Object.entries(raw))
    for (const value of Array.isArray(values) ? values : [values])
      if (typeof value === 'string') headers.append(name, value)
  return headers
}
