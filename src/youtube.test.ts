import { describe, expect, it } from 'vitest'
import { parseYouTubeId, youtubeTrack, youtubePlaybackError } from './youtube'

describe('YouTube links', () => {
  it('keeps stable library IDs, the original source and no downloadable audio', () => {
    const track = youtubeTrack({ id: 'jfKfPfyJRdk', title: 'Jazz', channel: 'Jazz channel' })
    expect(track).toMatchObject({
      id: 'youtube:jfKfPfyJRdk',
      source: 'youtube',
      youtubeId: 'jfKfPfyJRdk',
      audio: '',
      downloadAllowed: false,
    })
    expect(track.sourceUrl).toBe('https://www.youtube.com/watch?v=jfKfPfyJRdk')
    expect(() => youtubeTrack({ id: 'bad', title: 'Bad', channel: '' })).toThrow()
    expect(youtubePlaybackError(150)).toContain('Автор запретил')
    expect(youtubePlaybackError(100)).toContain('Видео удалено')
    expect(youtubePlaybackError(153)).toContain('источник плеера')
  })
  it('accepts watch, short, live and shared URLs without accepting other hosts', () => {
    for (const value of [
      'https://www.youtube.com/watch?v=jfKfPfyJRdk&list=anything',
      'https://youtu.be/jfKfPfyJRdk?t=12',
      'youtube.com/live/jfKfPfyJRdk',
      'https://www.youtube.com/shorts/jfKfPfyJRdk',
    ])
      expect(parseYouTubeId(value)).toBe('jfKfPfyJRdk')
    expect(parseYouTubeId('https://youtube.com.evil.example/watch?v=jfKfPfyJRdk')).toBeNull()
    expect(parseYouTubeId('https://example.com/jfKfPfyJRdk')).toBeNull()
    expect(parseYouTubeId('javascript:alert(1)')).toBeNull()
    expect(parseYouTubeId('https://youtu.be/invalid')).toBeNull()
  })
})
