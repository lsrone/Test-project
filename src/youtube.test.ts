import { describe, expect, it } from 'vitest'
import { parseYouTubeId } from './youtube'

describe('YouTube links', () => {
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
