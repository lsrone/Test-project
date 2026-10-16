import { randomUUID } from 'node:crypto'
import { Innertube, Mixins } from 'youtubei.js'

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/
const TTL = 15 * 60 * 1000

export class ExpiredYouTubePage extends Error {}

// Public search metadata only. Playback stays in the official YouTube iframe.
// No cookies, account login, player scripts or audio extraction are needed.
export function createPublicYouTubeSearch({ fetcher, now = Date.now }) {
  let client
  const pages = new Map()

  async function getClient() {
    if (!client) {
      client = Innertube.create({
        lang: 'ru',
        location: 'US',
        retrieve_player: false,
        retrieve_innertube_config: false,
        generate_session_locally: true,
        enable_session_cache: false,
        enable_safety_mode: true,
        fetch: fetcher,
      }).catch((error) => {
        client = undefined
        throw error
      })
    }
    return client
  }

  const search = async (query, pageToken = '') => {
    for (const [token, saved] of pages) {
      if (saved.expires <= now()) pages.delete(token)
    }
    let page
    if (pageToken) {
      const saved = pages.get(pageToken)
      if (!saved || saved.query !== query.toLocaleLowerCase()) throw new ExpiredYouTubePage()
      page = await saved.page.getContinuation()
    } else {
      const youtube = await getClient()
      const result = await youtube.search(query, { type: 'video' })
      // Generic Feed supports both append and reload continuation responses.
      // Search.getContinuation in 18.1.0 assumes a reload-only header response.
      page = new Mixins.Feed(youtube.actions, result.page, true)
    }

    const seen = new Set()
    const items = page.videos.flatMap((video) => {
      const id = video.video_id ?? video.id
      if (!VIDEO_ID.test(id) || seen.has(id)) return []
      seen.add(id)
      return [
        {
          id,
          title: String(video.title ?? video.metadata?.title ?? 'Видео YouTube'),
          channel: String(video.author?.name ?? video.metadata?.author?.name ?? 'YouTube'),
          thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
        },
      ]
    })
    let nextPageToken
    if (page.has_continuation) {
      nextPageToken = `public-${randomUUID()}`
      if (pages.size >= 100) pages.delete(pages.keys().next().value)
      pages.set(nextPageToken, {
        page,
        query: query.toLocaleLowerCase(),
        expires: now() + TTL,
      })
    }
    return { items, nextPageToken }
  }
  search.related = async (id) => {
    if (!VIDEO_ID.test(id)) throw new Error('Invalid video')
    const info = await (await getClient()).getInfo(id)
    const seen = new Set([id])
    return {
      items: (info.watch_next_feed || [])
        .flatMap((video) => {
          const key = video.video_id ?? video.id
          if (!VIDEO_ID.test(key) || seen.has(key)) return []
          seen.add(key)
          return [
            {
              id: key,
              title: String(video.title ?? 'Музыка'),
              channel:
                video.author?.name && video.author.name !== 'N/A'
                  ? String(video.author.name)
                  : String(video.long_byline_text ?? video.short_byline_text ?? 'YouTube'),
              thumbnail: `https://i.ytimg.com/vi/${key}/hqdefault.jpg`,
            },
          ]
        })
        .slice(0, 30),
    }
  }
  return search
}
