import { useState, useEffect } from 'react'
import { Plus, Trash2, Music2, Radio, ExternalLink, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { SpotifyPlaylist } from '../types'
import { GuitarBackground, VinylRecord } from '../components/RockBackground'

const RADIO_STATIONS = [
  { name: 'Rock FM España',     url: 'https://www.rockfm.fm/', logo: '🎸' },
  { name: 'Radio 3 (RNE)',      url: 'https://www.rtve.es/radio/radio3/', logo: '🎵' },
  { name: 'M80 Radio',          url: 'https://www.m80radio.com/', logo: '🤘' },
  { name: 'Classic Rock Radio', url: 'https://www.classicrockradio.com/', logo: '🎺' },
]

const EMBED_EXAMPLES = [
  { label: 'Rock Clásico',   uri: '37i9dQZF1DWXRqgorJj26U' },
  { label: 'Power Ballads',  uri: '37i9dQZF1DX1s5THSb5hwB' },
  { label: 'Rock Español',   uri: '37i9dQZF1DX3dFTZmfJWMI' },
]

function toEmbedUrl(input: string): string {
  const uriMatch = input.match(/playlist\/([a-zA-Z0-9]+)/)
  const id = uriMatch ? uriMatch[1] : input.replace('spotify:playlist:', '')
  return `https://open.spotify.com/embed/playlist/${id}?utm_source=generator&theme=0`
}

export default function MusicPage() {
  const [playlists, setPlaylists] = useState<SpotifyPlaylist[]>([])
  const [active, setActive] = useState<SpotifyPlaylist | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ name: '', spotify_uri: '' })

  useEffect(() => { loadPlaylists() }, [])

  async function loadPlaylists() {
    const { data } = await supabase.from('spotify_playlists').select('*').order('created_at')
    if (data) setPlaylists(data)
  }

  async function addPlaylist() {
    if (!form.name.trim() || !form.spotify_uri.trim()) return
    const embed_url = toEmbedUrl(form.spotify_uri)
    await supabase.from('spotify_playlists').insert({
      name: form.name,
      spotify_uri: form.spotify_uri,
      embed_url,
    })
    setForm({ name: '', spotify_uri: '' })
    setShowAdd(false)
    loadPlaylists()
  }

  async function deletePlaylist(id: string) {
    await supabase.from('spotify_playlists').delete().eq('id', id)
    if (active?.id === id) setActive(null)
    loadPlaylists()
  }

  return (
    <div className="animate-fadeIn max-w-4xl mx-auto">

      {/* Hero Rock */}
      <div className="relative rounded-2xl overflow-hidden mb-8"
        style={{
          background: 'linear-gradient(135deg, #120808 0%, #0e0e0e 40%, #0d0d14 100%)',
          border: '1px solid #2a1a1a',
          minHeight: '160px',
        }}
      >
        {/* Guitarra fondo */}
        <div className="absolute -right-8 -top-4 h-full pointer-events-none opacity-[0.07] text-[#e05252]">
          <GuitarBackground className="h-full w-auto" />
        </div>
        {/* Vinilo decorativo */}
        <div className="absolute right-32 top-1/2 -translate-y-1/2 w-28 pointer-events-none opacity-[0.12] text-[#c9a96e]">
          <VinylRecord className="w-full" />
        </div>
        {/* Resplandor rojo */}
        <div className="absolute inset-0 pointer-events-none"
          style={{ background: 'radial-gradient(ellipse at 10% 50%, #e0525215 0%, transparent 60%)' }} />

        <div className="relative z-10 px-7 py-7">
          <p className="text-xs tracking-[0.3em] uppercase text-[#e0525260] mb-2">♩ ♪ ♫ ♬</p>
          <h2 className="font-display text-4xl font-bold leading-none mb-1"
            style={{
              background: 'linear-gradient(135deg, #ff8080, #e05252, #c9a96e)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}>
            Música
          </h2>
          <p className="text-[#666] text-sm mt-2">Rock & más — tus playlists y emisoras</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Player principal */}
        <div className="lg:col-span-2 space-y-4">
          {active ? (
            <div className="card p-0 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-[#2a2a2a]">
                <span className="text-sm font-medium text-[#e0e0e0] flex items-center gap-2">
                  <Music2 size={14} className="text-[#c9a96e]" /> {active.name}
                </span>
                <button onClick={() => setActive(null)} className="text-[#555] hover:text-[#888]">
                  <X size={16} />
                </button>
              </div>
              <iframe
                src={active.embed_url}
                width="100%"
                height="380"
                frameBorder="0"
                allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                loading="lazy"
                className="block"
              />
            </div>
          ) : (
            <div className="card flex flex-col items-center justify-center py-16 text-center">
              <Music2 size={48} className="text-[#2a2a2a] mb-4" />
              <p className="text-[#555] font-display text-xl">Selecciona una playlist</p>
              <p className="text-[#444] text-sm mt-2">o añade una nueva desde Spotify</p>
            </div>
          )}

          {/* Emisoras de radio */}
          <div className="card">
            <h3 className="font-display text-base font-semibold text-[#e0e0e0] flex items-center gap-2 mb-4">
              <Radio size={16} className="text-[#e05252]" /> Emisoras Rock
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {RADIO_STATIONS.map(s => (
                <a
                  key={s.name}
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2.5 p-3 rounded-xl bg-[#111] border border-[#2a2a2a] hover:border-[#e05252] hover:bg-[#e0525208] transition-all group"
                >
                  <span className="text-xl">{s.logo}</span>
                  <span className="text-xs text-[#888] group-hover:text-[#e0e0e0] transition-colors leading-tight">{s.name}</span>
                  <ExternalLink size={10} className="ml-auto text-[#444] group-hover:text-[#e05252]" />
                </a>
              ))}
            </div>
          </div>
        </div>

        {/* Sidebar playlists */}
        <div className="space-y-4">
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-base font-semibold text-[#e0e0e0]">Mis Playlists</h3>
              <button onClick={() => setShowAdd(true)} className="btn-primary text-xs px-2.5 py-1.5 flex items-center gap-1">
                <Plus size={12} /> Añadir
              </button>
            </div>

            {playlists.length === 0 && (
              <div className="text-center py-6">
                <p className="text-[#555] text-sm">Sin playlists aún</p>
                <p className="text-[#444] text-xs mt-1">Añade un enlace de Spotify</p>
              </div>
            )}

            <div className="space-y-2">
              {playlists.map(pl => (
                <div
                  key={pl.id}
                  className={`flex items-center gap-2 p-2.5 rounded-xl border cursor-pointer transition-all group ${
                    active?.id === pl.id
                      ? 'border-[#c9a96e] bg-[#c9a96e10]'
                      : 'border-[#2a2a2a] hover:border-[#3a3a3a] bg-[#111]'
                  }`}
                  onClick={() => setActive(pl)}
                >
                  <Music2 size={14} className="text-[#c9a96e] flex-shrink-0" />
                  <span className="text-sm text-[#ccc] flex-1 truncate">{pl.name}</span>
                  <button
                    onClick={e => { e.stopPropagation(); deletePlaylist(pl.id) }}
                    className="text-[#444] hover:text-[#e05252] opacity-0 group-hover:opacity-100 transition-all"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Sugerencias rápidas */}
          <div className="card">
            <h4 className="text-xs text-[#666] uppercase tracking-wider mb-3">Añadir rápido</h4>
            <div className="space-y-1.5">
              {EMBED_EXAMPLES.map(ex => (
                <button
                  key={ex.uri}
                  onClick={() => setForm({ name: ex.label, spotify_uri: ex.uri })}
                  className="w-full text-left text-xs text-[#888] hover:text-[#c9a96e] transition-colors py-1"
                >
                  + {ex.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Modal añadir playlist */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-[#1a1a1a] border border-[#3a3a3a] rounded-2xl w-full max-w-sm animate-fadeIn">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#2a2a2a]">
              <h3 className="font-display text-lg font-semibold text-[#e0e0e0]">Añadir Playlist</h3>
              <button onClick={() => setShowAdd(false)} className="text-[#555] hover:text-[#888]"><X size={20} /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="text-xs text-[#888] uppercase tracking-wider block mb-1.5">Nombre</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                  placeholder="Mi playlist rock favorita"
                  className="w-full bg-[#111] border border-[#3a3a3a] rounded-lg px-3 py-2.5 text-sm text-[#e0e0e0] placeholder-[#444] focus:border-[#c9a96e] focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs text-[#888] uppercase tracking-wider block mb-1.5">Enlace o ID de Spotify</label>
                <input
                  type="text"
                  value={form.spotify_uri}
                  onChange={e => setForm(p => ({ ...p, spotify_uri: e.target.value }))}
                  placeholder="https://open.spotify.com/playlist/..."
                  className="w-full bg-[#111] border border-[#3a3a3a] rounded-lg px-3 py-2.5 text-sm text-[#e0e0e0] placeholder-[#444] focus:border-[#c9a96e] focus:outline-none"
                />
                <p className="text-xs text-[#555] mt-1">Pega el enlace de Spotify → Compartir → Copiar enlace</p>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-[#2a2a2a] flex justify-end gap-2">
              <button onClick={() => setShowAdd(false)} className="btn-ghost">Cancelar</button>
              <button onClick={addPlaylist} className="btn-primary">Añadir</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
