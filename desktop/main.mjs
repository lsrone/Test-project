import { app, BrowserWindow, dialog, Menu, nativeTheme, shell, net } from 'electron'
import { join } from 'node:path'
import { createYouTubeApi } from '../server/youtube.mjs'
import { desktopFetch } from './network.mjs'
import { startAppServer } from '../server/app-server.mjs'

let service
let window
const singleInstance = app.requestSingleInstanceLock()
if (!singleInstance) app.quit()
else {
  app.on('second-instance', () => {
    if (window) {
      if (window.isMinimized()) window.restore()
      window.focus()
    }
  })
  app.whenReady().then(async () => {
    Menu.setApplicationMenu(null)
    nativeTheme.themeSource = 'dark'
    try {
      // The fixed loopback origin keeps the music library stable between launches.
      service = await startAppServer({
        root: join(app.getAppPath(), 'dist'),
        youtubeApi: createYouTubeApi({ fetcher: desktopFetch((...args) => net.fetch(...args)) }),
      })
      window = new BrowserWindow({
        width: 1450,
        height: 960,
        minWidth: 800,
        minHeight: 620,
        title: 'Volna',
        backgroundColor: '#0d0e12',
        show: false,
        autoHideMenuBar: true,
        icon: join(app.getAppPath(), 'dist', 'app-icon-512.png'),
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
          webviewTag: false,
        },
      })
      const external = (value) => {
        try {
          const url = new URL(value)
          if (url.protocol === 'https:') void shell.openExternal(url.href)
        } catch {
          /* Invalid links are ignored. */
        }
      }
      window.webContents.setWindowOpenHandler(({ url }) => {
        external(url)
        return { action: 'deny' }
      })
      window.webContents.on('will-navigate', (event, url) => {
        if (new URL(url).origin !== service.origin) {
          event.preventDefault()
          external(url)
        }
      })
      window.once('ready-to-show', () => window.show())
      window.on('focus', () => window?.webContents.focus())
      await window.loadURL(service.origin)
      window.on('closed', () => {
        window = null
        app.quit()
      })
    } catch (error) {
      dialog.showErrorBox(
        'Volna не запустилась',
        error.code === 'EADDRINUSE'
          ? 'Локальный порт 28741 занят. Закрой другую копию Volna или использующее этот порт приложение.'
          : 'Не удалось открыть приложение. Распакуй или скачай сборку заново.',
      )
      app.quit()
    }
  })
  app.on('window-all-closed', () => app.quit())
  app.on('before-quit', () => {
    const closing = service
    service = undefined
    if (closing) void closing.close().catch(() => {})
  })
}
