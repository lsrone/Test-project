export type Mood = 'all' | 'chill' | 'focus' | 'energy' | 'night'
export interface Track {
  id: string
  title: string
  artist: string
  genre: string
  cover: string
  artwork: string
  color: string
  audio: string
  duration: number
  moods: Mood[]
}
export interface Playlist {
  id: string
  title: string
  description: string
  artwork: string
  color: string
  tracks: string[]
  label?: string
}
export const tracks: Track[] = [
  {
    id: 'blue-hour',
    title: 'Blue Hour',
    artist: 'Polar Echo',
    genre: 'Электроника',
    cover: 'blue',
    artwork: 'blue',
    color: '#477bf4',
    audio: '/audio/blue-hour.mp3',
    duration: 48,
    moods: ['chill', 'night'],
  },
  {
    id: 'weightless',
    title: 'Weightless',
    artist: 'Coastline',
    genre: 'Эмбиент',
    cover: 'coast',
    artwork: 'coast',
    color: '#7fadb5',
    audio: '/audio/weightless.mp3',
    duration: 48,
    moods: ['focus', 'chill'],
  },
  {
    id: 'neon-dreams',
    title: 'Neon Dreams',
    artist: 'Night Drive',
    genre: 'Электроника',
    cover: 'neon',
    artwork: 'neon',
    color: '#b56bda',
    audio: '/audio/neon-dreams.mp3',
    duration: 48,
    moods: ['night', 'energy'],
  },
  {
    id: 'first-light',
    title: 'First Light',
    artist: 'Mellow Fields',
    genre: 'Лоу-фай',
    cover: 'sunrise',
    artwork: 'sunrise',
    color: '#d5a077',
    audio: '/audio/first-light.mp3',
    duration: 48,
    moods: ['chill', 'focus'],
  },
  {
    id: 'slow-motion',
    title: 'Slow Motion',
    artist: 'Kai River',
    genre: 'Лоу-фай',
    cover: 'bloom',
    artwork: 'bloom',
    color: '#ce8b91',
    audio: '/audio/slow-motion.mp3',
    duration: 48,
    moods: ['focus', 'chill'],
  },
  {
    id: 'velvet-sky',
    title: 'Velvet Sky',
    artist: 'Luna Park',
    genre: 'Дрим-поп',
    cover: 'violet',
    artwork: 'violet',
    color: '#9d9dd1',
    audio: '/audio/velvet-sky.mp3',
    duration: 48,
    moods: ['night', 'chill'],
  },
  {
    id: 'momentum',
    title: 'Momentum',
    artist: 'Solar State',
    genre: 'Хаус',
    cover: 'solar',
    artwork: 'solar',
    color: '#c9b860',
    audio: '/audio/momentum.mp3',
    duration: 48,
    moods: ['energy'],
  },
  {
    id: 'somewhere',
    title: 'Somewhere, Again',
    artist: 'June & July',
    genre: 'Эмбиент',
    cover: 'forest',
    artwork: 'forest',
    color: '#6fa397',
    audio: '/audio/somewhere.mp3',
    duration: 48,
    moods: ['focus', 'chill'],
  },
]
export const playlists: Playlist[] = [
  {
    id: 'daily',
    title: 'Твоя дневная доза',
    description: 'Знакомое, любимое, новое',
    artwork: 'blue',
    color: '#477bf4',
    tracks: ['blue-hour', 'velvet-sky', 'first-light', 'weightless', 'neon-dreams'],
    label: 'DAILY MIX 01',
  },
  {
    id: 'night',
    title: 'После полуночи',
    description: 'Город засыпает. Музыка — нет.',
    artwork: 'neon',
    color: '#b56bda',
    tracks: ['neon-dreams', 'blue-hour', 'velvet-sky'],
    label: 'AFTER HOURS',
  },
  {
    id: 'focus',
    title: 'В потоке',
    description: 'Меньше мыслей. Больше фокуса.',
    artwork: 'coast',
    color: '#7fadb5',
    tracks: ['weightless', 'somewhere', 'slow-motion', 'first-light'],
    label: 'DEEP FOCUS',
  },
  {
    id: 'morning',
    title: 'Никуда не спешить',
    description: 'Для маленькой паузы в большом дне',
    artwork: 'sunrise',
    color: '#d5a077',
    tracks: ['first-light', 'slow-motion', 'weightless'],
    label: 'SLOW MORNINGS',
  },
  {
    id: 'discover',
    title: 'За горизонтом',
    description: 'Твои следующие любимые треки',
    artwork: 'violet',
    color: '#9d9dd1',
    tracks: ['velvet-sky', 'momentum', 'somewhere', 'neon-dreams'],
    label: 'FRESH FINDS',
  },
  {
    id: 'energy',
    title: 'На полной громкости',
    description: 'Заряд, которого хватит на всё',
    artwork: 'solar',
    color: '#c9b860',
    tracks: ['momentum', 'neon-dreams', 'blue-hour'],
    label: 'FULL ENERGY',
  },
]
export const initialPlaylists: Playlist[] = [
  {
    id: 'my-night',
    title: 'Ночной город',
    description: 'Мой плейлист',
    artwork: 'neon',
    color: '#b56bda',
    tracks: ['neon-dreams', 'blue-hour', 'velvet-sky'],
  },
  {
    id: 'my-focus',
    title: 'Фокус на главном',
    description: 'Мой плейлист',
    artwork: 'coast',
    color: '#7fadb5',
    tracks: ['weightless', 'somewhere', 'slow-motion'],
  },
  {
    id: 'my-quiet',
    title: 'Тише, пожалуйста',
    description: 'Мой плейлист',
    artwork: 'sunrise',
    color: '#d5a077',
    tracks: ['first-light', 'velvet-sky'],
  },
]
export const moods: { id: Mood; title: string; emoji: string; subtitle: string }[] = [
  { id: 'chill', title: 'Расслабиться', emoji: '☁', subtitle: 'Выдохни. Ты дома.' },
  { id: 'focus', title: 'Сосредоточиться', emoji: '◎', subtitle: 'Всё лишнее — на паузу' },
  { id: 'energy', title: 'Зарядиться', emoji: 'ϟ', subtitle: 'Почувствуй этот ритм' },
  { id: 'night', title: 'Помечтать', emoji: '☾', subtitle: 'Дальше, чем горизонт' },
]
