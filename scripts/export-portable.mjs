import { readFile, writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dist = path.join(root, 'dist')
const output = path.join(root, 'exports')
const mimeTypes = {
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}
const embedded = new Map()

async function dataUrl(url) {
  const relative = url.replace(/^\//, '').split(/[?#]/)[0]
  const file = path.resolve(dist, relative)
  if (!file.startsWith(dist + path.sep)) throw new Error(`Invalid asset path: ${url}`)
  if (!embedded.has(file)) {
    const bytes = await readFile(file)
    const mime = mimeTypes[path.extname(file)]
    if (!mime) throw new Error(`Unsupported asset: ${url}`)
    embedded.set(file, `data:${mime};base64,${bytes.toString('base64')}`)
  }
  return embedded.get(file)
}

async function replaceAsync(text, expression, transform) {
  const matches = [...text.matchAll(expression)]
  const replacements = await Promise.all(matches.map((match) => transform(...match)))
  let i = 0
  return text.replace(expression, () => replacements[i++])
}

let html = await readFile(path.join(dist, 'index.html'), 'utf8')
html = html.replace('<html lang="ru">', '<html lang="ru" data-portable="true">')
html = html.replace(/\s*<link\b[^>]*rel="(?:manifest|apple-touch-icon)"[^>]*>/g, '')
html = await replaceAsync(
  html,
  /<link\b[^>]*rel="icon"[^>]*href="([^"]+)"[^>]*>/g,
  async (_tag, url) => `<link rel="icon" type="image/svg+xml" href="${await dataUrl(url)}">`,
)

html = await replaceAsync(
  html,
  /<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g,
  async (_tag, url) => {
    let css = await readFile(path.join(dist, url.replace(/^\//, '')), 'utf8')
    css = await replaceAsync(css, /url\(([^)]+)\)/g, async (original, value) => {
      const asset = value.trim().replace(/^['"]|['"]$/g, '')
      if (asset.startsWith('data:') || asset.startsWith('#')) return original
      if (/^https?:/.test(asset)) throw new Error(`External CSS asset: ${asset}`)
      const absolute = asset.startsWith('/')
        ? asset
        : path.posix.join(path.posix.dirname(url), asset)
      return `url("${await dataUrl(absolute)}")`
    })
    return `<style>${css.replace(/<\/style/gi, '<\\/style')}</style>`
  },
)

html = await replaceAsync(
  html,
  /<script\b[^>]*src="([^"]+)"[^>]*><\/script>/g,
  async (_tag, url) => {
    let javascript = await readFile(path.join(dist, url.replace(/^\//, '')), 'utf8')
    javascript = await replaceAsync(
      javascript,
      /(["'])(\/(?:audio\/[^"']+\.mp3|app-icon-\d+\.png))\1/g,
      async (_original, _quote, asset) => JSON.stringify(await dataUrl(asset)),
    )
    return `<script>${javascript.replace(/<\/script/gi, '<\\/script')}</script>`
  },
)

// Keep blocking application code after #root, matching module-script execution order.
const scripts = [...html.matchAll(/<script>[\s\S]*?<\/script>/g)].map((match) => match[0])
html = html.replace(/<script>[\s\S]*?<\/script>/g, '')
html = html.replace('</body>', () => scripts.join('\n') + '\n</body>')
if (/\b(?:src|href)="\/(?:assets|audio|images)\//.test(html))
  throw new Error('HTML still depends on external assets')
const fontLicense = await readFile(path.join(dist, 'FONT-LICENSE.txt'), 'utf8')
html = html.replace(
  '</html>',
  `<!-- Manrope font license:\n${fontLicense.replace(/--/g, '—')}\n-->\n</html>`,
)
html = html.replace(/^[\t ]+$/gm, '')
await mkdir(output, { recursive: true })
await writeFile(path.join(output, 'Volna.html'), html)
console.log(
  `Portable HTML: ${path.join(output, 'Volna.html')} (${(Buffer.byteLength(html) / 1024 / 1024).toFixed(1)} MB, ${embedded.size} embedded assets)`,
)
