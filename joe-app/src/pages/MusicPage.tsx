import { useState, useEffect } from 'react'
import { Plus, Trash2, Music2, Radio, ExternalLink, X, Quote, Star } from 'lucide-react'
import { getDayOfYear } from 'date-fns'
import { supabase } from '../lib/supabase'
import type { SpotifyPlaylist } from '../types'
import { GuitarBackground, VinylRecord } from '../components/RockBackground'

/* ── tipos ── */
interface FavoriteArtist {
  id: string
  name: string
  spotify_url: string
  embed_url: string
  created_at: string
}

/* ── constantes ── */
const RADIO_STATIONS = [
  { name: 'Rock FM España',     url: 'https://www.rockfm.fm/', logo: '🎸' },
  { name: 'Radio 3 (RNE)',      url: 'https://www.rtve.es/radio/radio3/', logo: '🎵' },
  { name: 'M80 Radio',          url: 'https://www.m80radio.com/', logo: '🤘' },
  { name: 'Classic Rock Radio', url: 'https://www.classicrockradio.com/', logo: '🎺' },
]

const ROCK_QUOTES = [
  { quote: 'Rock and roll is here to stay, it will never die.', author: 'Neil Young' },
  { quote: 'Music gives a soul to the universe, wings to the mind, flight to the imagination, and life to everything.', author: 'Platón' },
  { quote: "I am not afraid of dying. I'm afraid of not trying.", author: 'Jay-Z' },
  { quote: 'Without music, life would be a mistake.', author: 'Friedrich Nietzsche' },
  { quote: "One good thing about music — when it hits you, you feel no pain.", author: 'Bob Marley' },
  { quote: 'Rock and roll is the music of the streets.', author: 'Chuck Berry' },
  { quote: "I'd rather be hated for who I am than loved for who I'm not.", author: 'Kurt Cobain' },
  { quote: 'We will rock you.', author: 'Queen' },
  { quote: "I'm a cult hero, baby. This is what I do.", author: 'Ozzy Osbourne' },
  { quote: 'Music is the shorthand of emotion.', author: 'Leo Tolstói' },
  { quote: 'Talk about passion — that is what rock and roll is all about.', author: 'Mick Jagger' },
  { quote: "It's only rock 'n' roll, but I like it.", author: 'The Rolling Stones' },
  { quote: 'Drugs, sex, rock and roll. All three at once if possible.', author: 'Lemmy Kilmister' },
  { quote: 'The music is all around us. All you have to do is listen.', author: 'August Rush' },
  { quote: "I just want to live while I'm alive.", author: 'Jon Bon Jovi' },
  { quote: 'Rock music is not meant to be perfect.', author: 'Ozzy Osbourne' },
  { quote: "Don't stop believin'.", author: 'Journey' },
  { quote: 'We are the champions, my friends.', author: 'Freddie Mercury' },
  { quote: 'Rock and roll is a nuclear blast of reality in a mundane world.', author: 'Kim Fowley' },
  { quote: "Long live rock, I need it every night.", author: 'The Who' },
  { quote: 'Music can change the world because it can change people.', author: 'Bono' },
  { quote: "I'm not going to change the way I look or the way I feel to conform to anything.", author: 'Freddie Mercury' },
  { quote: "You shook me all night long.", author: 'AC/DC' },
  { quote: 'The first time I heard Elvis, I knew that music was going to mean everything to me.', author: 'Keith Richards' },
  { quote: 'I live for rock and roll. It is my life.', author: 'Jimmy Page' },
  { quote: "It's my life and it's now or never.", author: 'Bon Jovi' },
  { quote: 'Music is the universal language of mankind.', author: 'Henry Longfellow' },
  { quote: 'Turn it up! Rock and roll!', author: 'AC/DC' },
  { quote: "I'd rather die on my feet than live on my knees.", author: 'Emiliano Zapata' },
  { quote: 'Music is the wine that fills the cup of silence.', author: 'Robert Fripp' },
  { quote: 'Every day is a new beginning.', author: 'Steven Tyler' },
  { quote: 'If you want to sing out, sing out.', author: 'Cat Stevens' },
  { quote: "Keep the faith.", author: 'Bon Jovi' },
  { quote: 'Rock and roll means well.', author: 'Tom Petty' },
  { quote: 'The first time I sang in the church choir, two hundred people changed their religion.', author: 'Fred Allen' },
]

const ARTIST_COLORS = [
  'linear-gradient(135deg, #c9281a, #7a0a00)',
  'linear-gradient(135deg, #c9a96e, #7a5a10)',
  'linear-gradient(135deg, #3a6db5, #102050)',
  'linear-gradient(135deg, #8b3ab5, #3a0a6e)',
  'linear-gradient(135deg, #3a9e6e, #0a5030)',
  'linear-gradient(135deg, #c97040, #7a2800)',
  'linear-gradient(135deg, #c940a0, #7a0050)',
  'linear-gradient(135deg, #4a9ec9, #0a3050)',
]

const DEFAULT_ARTISTS: FavoriteArtist[] = [
  {
    id: '__default_bon_jovi__',
    name: 'Bon Jovi',
    spotify_url: 'https://open.spotify.com/artist/58lV9VcRSjABbAbfWS6skp',
    embed_url: 'https://open.spotify.com/embed/artist/58lV9VcRSjABbAbfWS6skp?utm_source=generator&theme=0',
    created_at: '2000-01-01T00:00:00Z',
  },
  {
    id: '__default_bruno_mars__',
    name: 'Bruno Mars',
    spotify_url: 'https://open.spotify.com/artist/0du5cEVh5yTK9QJze8zA0C',
    embed_url: 'https://open.spotify.com/embed/artist/0du5cEVh5yTK9QJze8zA0C?utm_source=generator&theme=0',
    created_at: '2000-01-02T00:00:00Z',
  },
]

/* ── helpers ── */
function toArtistEmbedUrl(input: string): string {
  const match = input.match(/artist\/([a-zA-Z0-9]+)/)
  if (!match) return ''
  return `https://open.spotify.com/embed/artist/${match[1]}?utm_source=generator&theme=0`
}

function toPlaylistEmbedUrl(input: string): string {
  const uriMatch = input.match(/playlist\/([a-zA-Z0-9]+)/)
  const id = uriMatch ? uriMatch[1] : input.replace('spotify:playlist:', '')
  return `https://open.spotify.com/embed/playlist/${id}?utm_source=generator&theme=0`
}

function artistInitial(name: string) {
  return name.trim().charAt(0).toUpperCase()
}

/* ── componente ── */
export default function MusicPage() {
  const [artists, setArtists] = useState<FavoriteArtist[]>(DEFAULT_ARTISTS)
  const [artistImages, setArtistImages] = useState<Record<string, string>>({})
  const [playlists, setPlaylists] = useState<SpotifyPlaylist[]>([])
  const [activeArtist, setActiveArtist] = useState<FavoriteArtist | null>(null)
  const [activePlaylist, setActivePlaylist] = useState<SpotifyPlaylist | null>(null)
  const [showAddArtist, setShowAddArtist] = useState(false)
  const [showAddPlaylist, setShowAddPlaylist] = useState(false)
  const [artistForm, setArtistForm] = useState({ name: '', spotify_url: '' })
  const [playlistForm, setPlaylistForm] = useState({ name: '', spotify_uri: '' })
  const [artistError, setArtistError] = useState<string | null>(null)

  const todayQuote = ROCK_QUOTES[getDayOfYear(new Date()) % ROCK_QUOTES.length]

  useEffect(() => { loadAll() }, [])

  useEffect(() => {
    if (artists.length === 0) return
    const missing = artists.filter(a => !artistImages[a.id])
    if (missing.length === 0) return
    Promise.all(
      missing.map(async a => {
        try {
          const res = await fetch(
            `https://open.spotify.com/oembed?url=${encodeURIComponent(a.spotify_url)}`
          )
          if (!res.ok) return null
          const data = await res.json()
          return data.thumbnail_url ? { id: a.id, url: data.thumbnail_url as string } : null
        } catch { return null }
      })
    ).then(results => {
      const imgs: Record<string, string> = {}
      for (const r of results) { if (r) imgs[r.id] = r.url }
      if (Object.keys(imgs).length > 0)
        setArtistImages(prev => ({ ...prev, ...imgs }))
    })
  }, [artists])

  async function loadAll() {
    const [artRes, plRes] = await Promise.all([
      supabase.from('favorite_artists').select('*').order('created_at'),
      supabase.from('spotify_playlists').select('*').order('created_at'),
    ])
    if (artRes.data) {
      setArtists(prev => {
        const merged = [...DEFAULT_ARTISTS]
        for (const db of artRes.data!) {
          if (!merged.some(d => d.spotify_url === db.spotify_url)) merged.push(db)
        }
        // keep any optimistic (local_) adds not yet confirmed in DB
        for (const local of prev) {
          if (local.id.startsWith('local_') && !merged.some(d => d.spotify_url === local.spotify_url))
            merged.push(local)
        }
        return merged
      })
    }
    if (plRes.data) setPlaylists(plRes.data)
  }

  async function addArtist() {
    const url = artistForm.spotify_url.trim()
    if (!artistForm.name.trim()) { setArtistError('Escribe el nombre del artista'); return }
    if (!url) { setArtistError('Pega el enlace de Spotify del artista'); return }
    const embed_url = toArtistEmbedUrl(url)
    if (!embed_url) {
      setArtistError('URL no válida — copia desde Spotify → artista → ··· → Compartir → Copiar enlace')
      return
    }
    setArtistError(null)
    const name = artistForm.name.trim()
    const { error } = await supabase.from('favorite_artists').insert({ name, spotify_url: url, embed_url })
    if (error) { setArtistError(`Error al guardar: ${error.message}`); return }
    // optimistic update so the artist appears immediately even if SELECT is blocked
    const optimistic: FavoriteArtist = {
      id: `local_${Date.now()}`,
      name, spotify_url: url, embed_url,
      created_at: new Date().toISOString(),
    }
    setArtists(prev => {
      const deduped = prev.filter(a => a.spotify_url !== url)
      return [...deduped, optimistic]
    })
    setArtistForm({ name: '', spotify_url: '' })
    setShowAddArtist(false)
    loadAll() // try to swap in real DB id; harmless if SELECT is blocked
  }

  async function deleteArtist(id: string) {
    if (activeArtist?.id === id) setActiveArtist(null)
    setArtists(prev => prev.filter(a => a.id !== id))
    if (!id.startsWith('__default_') && !id.startsWith('local_')) {
      await supabase.from('favorite_artists').delete().eq('id', id)
      loadAll()
    }
  }

  async function addPlaylist() {
    if (!playlistForm.name.trim() || !playlistForm.spotify_uri.trim()) return
    const embed_url = toPlaylistEmbedUrl(playlistForm.spotify_uri)
    await supabase.from('spotify_playlists').insert({ name: playlistForm.name, spotify_uri: playlistForm.spotify_uri, embed_url })
    setPlaylistForm({ name: '', spotify_uri: '' })
    setShowAddPlaylist(false)
    loadAll()
  }

  async function deletePlaylist(id: string) {
    await supabase.from('spotify_playlists').delete().eq('id', id)
    if (activePlaylist?.id === id) setActivePlaylist(null)
    loadAll()
  }

  function selectArtist(a: FavoriteArtist) {
    setActiveArtist(a)
    setActivePlaylist(null)
  }

  function selectPlaylist(p: SpotifyPlaylist) {
    setActivePlaylist(p)
    setActiveArtist(null)
  }

  const activeEmbed   = activeArtist?.embed_url ?? activePlaylist?.embed_url ?? null
  const activeName    = activeArtist?.name ?? activePlaylist?.name ?? null
  const isArtistMode  = !!activeArtist

  return (
    <div className="animate-fadeIn max-w-4xl mx-auto">

      {/* Hero */}
      <div className="relative rounded-2xl overflow-hidden mb-8"
        style={{ background: 'linear-gradient(135deg, #120808 0%, #0e0e0e 40%, #0d0d14 100%)', border: '1px solid #2a1a1a', minHeight: '160px' }}>
        <div className="absolute -right-8 -top-4 h-full pointer-events-none opacity-[0.07] text-[#e05252]">
          <GuitarBackground className="h-full w-auto" />
        </div>
        <div className="absolute right-32 top-1/2 -translate-y-1/2 w-28 pointer-events-none opacity-[0.12] text-[#c9a96e]">
          <VinylRecord className="w-full" />
        </div>
        <div className="absolute inset-0 pointer-events-none"
          style={{ background: 'radial-gradient(ellipse at 10% 50%, #e0525215 0%, transparent 60%)' }} />
        <div className="relative z-10 px-7 py-7">
          <p className="text-xs tracking-[0.3em] uppercase text-[#e0525260] mb-2">♩ ♪ ♫ ♬</p>
          <h2 className="font-display text-4xl font-bold leading-none mb-1"
            style={{ background: 'linear-gradient(135deg, #ff8080, #e05252, #c9a96e)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Música
          </h2>
          <p className="text-[#666] text-sm mt-2">Rock & más — artistas, playlists y emisoras</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Columna principal */}
        <div className="lg:col-span-2 space-y-6">

          {/* Player */}
          {activeEmbed ? (
            <div className="card p-0 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-[#2a2a2a]">
                <span className="text-sm font-medium text-[#e0e0e0] flex items-center gap-2">
                  {isArtistMode
                    ? <Star size={14} className="text-[#c9a96e]" />
                    : <Music2 size={14} className="text-[#c9a96e]" />}
                  {activeName}
                </span>
                <button onClick={() => { setActiveArtist(null); setActivePlaylist(null) }} className="text-[#555] hover:text-[#888]">
                  <X size={16} />
                </button>
              </div>
              <iframe
                key={activeEmbed}
                src={activeEmbed}
                width="100%"
                height={isArtistMode ? 460 : 380}
                frameBorder="0"
                allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                loading="lazy"
                className="block"
              />
            </div>
          ) : (
            <div className="card flex flex-col items-center justify-center py-16 text-center">
              <Music2 size={48} className="text-[#2a2a2a] mb-4" />
              <p className="text-[#555] font-display text-xl">Selecciona un artista o playlist</p>
              <p className="text-[#444] text-sm mt-2">Tu música favorita en un clic</p>
            </div>
          )}

          {/* Artistas favoritos */}
          <div className="card">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-display text-lg font-bold text-[#e0e0e0] flex items-center gap-2">
                <Star size={16} className="text-[#c9a96e]" /> Mis Artistas
              </h3>
              <button onClick={() => setShowAddArtist(true)} className="btn-primary text-xs px-2.5 py-1.5 flex items-center gap-1">
                <Plus size={12} /> Añadir
              </button>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
              {artists.map((a, i) => {
                const grad = ARTIST_COLORS[i % ARTIST_COLORS.length]
                const isActive = activeArtist?.id === a.id
                return (
                  <div key={a.id} className="relative group">
                    <button
                      onClick={() => selectArtist(a)}
                      className={`w-full flex flex-col items-center gap-2 p-3 rounded-2xl border transition-all ${
                        isActive ? 'border-[#c9a96e] scale-105' : 'border-[#2a2a2a] hover:border-[#444] hover:scale-102'
                      }`}
                      style={{ background: isActive ? grad : '#111' }}
                    >
                      <div
                        className="w-14 h-14 rounded-full flex items-center justify-center text-2xl font-black text-white shadow-lg overflow-hidden"
                        style={{ background: artistImages[a.id] ? '#111' : grad }}
                      >
                        {artistImages[a.id]
                          ? <img src={artistImages[a.id]} alt={a.name} className="w-full h-full object-cover" />
                          : artistInitial(a.name)
                        }
                      </div>
                      <span className="text-xs font-semibold text-center leading-tight line-clamp-2"
                        style={{ color: isActive ? '#fff' : '#ccc' }}>
                        {a.name}
                      </span>
                    </button>
                    {!a.id.startsWith('__default_') && (
                      <button
                        onClick={() => deleteArtist(a.id)}
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-[#1a1a1a] border border-[#3a3a3a] text-[#555] hover:text-[#e05252] hover:border-[#e05252] transition-all flex items-center justify-center"
                      >
                        <X size={10} />
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Emisoras */}
          <div className="card">
            <h3 className="font-display text-base font-semibold text-[#e0e0e0] flex items-center gap-2 mb-4">
              <Radio size={16} className="text-[#e05252]" /> Emisoras Rock
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {RADIO_STATIONS.map(s => (
                <a key={s.name} href={s.url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2.5 p-3 rounded-xl bg-[#111] border border-[#2a2a2a] hover:border-[#e05252] hover:bg-[#e0525208] transition-all group">
                  <span className="text-xl">{s.logo}</span>
                  <span className="text-xs text-[#888] group-hover:text-[#e0e0e0] transition-colors leading-tight">{s.name}</span>
                  <ExternalLink size={10} className="ml-auto text-[#444] group-hover:text-[#e05252]" />
                </a>
              ))}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">

          {/* Mis Playlists */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-base font-semibold text-[#e0e0e0]">Mis Playlists</h3>
              <button onClick={() => setShowAddPlaylist(true)} className="btn-primary text-xs px-2.5 py-1.5 flex items-center gap-1">
                <Plus size={12} /> Añadir
              </button>
            </div>
            {playlists.length === 0 && (
              <p className="text-[#555] text-sm text-center py-4">Sin playlists aún</p>
            )}
            <div className="space-y-2">
              {playlists.map(pl => (
                <div key={pl.id}
                  className={`flex items-center gap-2 p-2.5 rounded-xl border cursor-pointer transition-all ${
                    activePlaylist?.id === pl.id ? 'border-[#c9a96e] bg-[#c9a96e10]' : 'border-[#2a2a2a] hover:border-[#3a3a3a] bg-[#111]'
                  }`}
                  onClick={() => selectPlaylist(pl)}
                >
                  <Music2 size={14} className="text-[#c9a96e] flex-shrink-0" />
                  <span className="text-sm text-[#ccc] flex-1 truncate">{pl.name}</span>
                  <button onClick={e => { e.stopPropagation(); deletePlaylist(pl.id) }}
                    className="text-[#555] hover:text-[#e05252] transition-colors flex-shrink-0">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Frase rock del día */}
          <div className="card" style={{ background: 'linear-gradient(135deg, #120808 0%, #111 100%)', borderColor: '#2a1a1a' }}>
            <div className="flex items-center gap-2 mb-3">
              <Quote size={14} className="text-[#e05252]" />
              <span className="text-xs text-[#e05252] uppercase tracking-[0.2em] font-semibold">Frase del día</span>
            </div>
            <p className="text-[#e0e0e0] text-sm font-medium leading-relaxed italic mb-3">
              "{todayQuote.quote}"
            </p>
            <p className="text-[#c9a96e] text-xs text-right font-semibold tracking-wide">
              — {todayQuote.author}
            </p>
            <div className="mt-3 flex justify-center gap-1 opacity-30">
              <span className="text-[#e05252] text-base">♩</span>
              <span className="text-[#c9a96e] text-base">♪</span>
              <span className="text-[#e05252] text-base">♫</span>
            </div>
          </div>
        </div>
      </div>

      {/* Modal añadir artista */}
      {showAddArtist && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-[#1a1a1a] border border-[#3a3a3a] rounded-2xl w-full max-w-sm animate-fadeIn">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#2a2a2a]">
              <h3 className="font-display text-lg font-semibold text-[#e0e0e0]">Añadir Artista</h3>
              <button onClick={() => { setShowAddArtist(false); setArtistError(null); setArtistForm({ name: '', spotify_url: '' }) }} className="text-[#555] hover:text-[#888]"><X size={20} /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {artistError && (
                <div className="px-3 py-2.5 rounded-lg bg-[#e0525215] border border-[#e05252]/40 text-sm text-[#e05252]">
                  {artistError}
                </div>
              )}
              <div>
                <label className="text-xs text-[#bbb] uppercase tracking-wider block mb-1.5">Nombre del artista</label>
                <input type="text" value={artistForm.name}
                  onChange={e => setArtistForm(p => ({ ...p, name: e.target.value }))}
                  placeholder="Ej: AC/DC"
                  className="w-full bg-[#111] border border-[#3a3a3a] rounded-lg px-3 py-2.5 text-sm text-[#e0e0e0] placeholder-[#444] focus:border-[#c9a96e] focus:outline-none" />
              </div>
              <div>
                <label className="text-xs text-[#bbb] uppercase tracking-wider block mb-1.5">URL de Spotify</label>
                <input type="text" value={artistForm.spotify_url}
                  onChange={e => setArtistForm(p => ({ ...p, spotify_url: e.target.value }))}
                  placeholder="https://open.spotify.com/artist/..."
                  className="w-full bg-[#111] border border-[#3a3a3a] rounded-lg px-3 py-2.5 text-sm text-[#e0e0e0] placeholder-[#444] focus:border-[#c9a96e] focus:outline-none" />
                <p className="text-xs text-[#555] mt-1">Spotify → artista → ··· → Compartir → Copiar enlace</p>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-[#2a2a2a] flex justify-end gap-2">
              <button onClick={() => { setShowAddArtist(false); setArtistError(null); setArtistForm({ name: '', spotify_url: '' }) }} className="btn-ghost">Cancelar</button>
              <button onClick={addArtist} className="btn-primary">Añadir</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal añadir playlist */}
      {showAddPlaylist && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-[#1a1a1a] border border-[#3a3a3a] rounded-2xl w-full max-w-sm animate-fadeIn">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#2a2a2a]">
              <h3 className="font-display text-lg font-semibold text-[#e0e0e0]">Añadir Playlist</h3>
              <button onClick={() => setShowAddPlaylist(false)} className="text-[#555] hover:text-[#888]"><X size={20} /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="text-xs text-[#bbb] uppercase tracking-wider block mb-1.5">Nombre</label>
                <input type="text" value={playlistForm.name}
                  onChange={e => setPlaylistForm(p => ({ ...p, name: e.target.value }))}
                  placeholder="Mi playlist rock favorita"
                  className="w-full bg-[#111] border border-[#3a3a3a] rounded-lg px-3 py-2.5 text-sm text-[#e0e0e0] placeholder-[#444] focus:border-[#c9a96e] focus:outline-none" />
              </div>
              <div>
                <label className="text-xs text-[#bbb] uppercase tracking-wider block mb-1.5">Enlace de Spotify</label>
                <input type="text" value={playlistForm.spotify_uri}
                  onChange={e => setPlaylistForm(p => ({ ...p, spotify_uri: e.target.value }))}
                  placeholder="https://open.spotify.com/playlist/..."
                  className="w-full bg-[#111] border border-[#3a3a3a] rounded-lg px-3 py-2.5 text-sm text-[#e0e0e0] placeholder-[#444] focus:border-[#c9a96e] focus:outline-none" />
                <p className="text-xs text-[#555] mt-1">Spotify → Compartir → Copiar enlace</p>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-[#2a2a2a] flex justify-end gap-2">
              <button onClick={() => setShowAddPlaylist(false)} className="btn-ghost">Cancelar</button>
              <button onClick={addPlaylist} className="btn-primary">Añadir</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
