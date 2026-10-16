// Electron uses Windows network/proxy settings, which Node's fetch does not read.
// Keep TLS verification on and never attach browser account cookies.
export function desktopFetch(fetchWithChromium) {
  return async (input, options = {}) => {
    const { timeoutMs = 12000, dispatcher: _dispatcher, ...init } = options
    const request = new Request(input, init)
    const signal = timeoutMs
      ? AbortSignal.any([request.signal, AbortSignal.timeout(timeoutMs)])
      : request.signal
    return fetchWithChromium(request.url, {
      method: request.method,
      headers: request.headers,
      body: ['GET', 'HEAD'].includes(request.method) ? undefined : await request.arrayBuffer(),
      redirect: request.redirect,
      signal,
      credentials: 'omit',
    })
  }
}
