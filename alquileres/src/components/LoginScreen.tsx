import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'

type User = 'Luis' | 'Rober'

const USERS: User[] = ['Luis', 'Rober']
const DEFAULT_PW_HASH = 'd086b000c4d69407866d15606d2c5bb9c8f64431bf4f72d1393b9996ca9a3cec'
const PW_KEY = 'aq_pw_hash'

async function hashPw(pw: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pw))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

export function getStoredHash(): string {
  return localStorage.getItem(PW_KEY) ?? DEFAULT_PW_HASH
}

export function saveHash(hash: string) {
  localStorage.setItem(PW_KEY, hash)
}

interface Props { onLogin: (user: User) => void }

export default function LoginScreen({ onLogin }: Props) {
  const [user, setUser] = useState<User>('Luis')
  const [pw, setPw] = useState('')
  const [show, setShow] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const h = await hashPw(pw)
    if (h !== getStoredHash()) {
      setError('Contraseña incorrecta')
      setPw('')
    } else {
      onLogin(user)
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100">
      <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-full flex items-center justify-center text-2xl mb-3"
            style={{ background: '#1976D2' }}>
            🍀
          </div>
          <h1 className="text-xl font-bold text-slate-800">Alquileres Ofipapel</h1>
          <p className="text-slate-400 text-sm mt-1">Gestión vacacional</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5 uppercase tracking-wide">
              Usuario
            </label>
            <div className="flex gap-2">
              {USERS.map(u => (
                <button key={u} type="button"
                  onClick={() => { setUser(u); setError('') }}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-medium border transition-all ${
                    user === u
                      ? 'border-blue-600 bg-blue-600 text-white'
                      : 'border-slate-200 text-slate-600 hover:border-blue-300'
                  }`}>
                  {u}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5 uppercase tracking-wide">
              Contraseña
            </label>
            <div className="relative">
              <input
                type={show ? 'text' : 'password'}
                value={pw}
                onChange={e => { setPw(e.target.value); setError('') }}
                className="w-full border border-slate-200 rounded-lg px-3 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Contraseña"
                required
                autoComplete="current-password"
              />
              <button type="button" onClick={() => setShow(s => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                {show ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {error && <p className="text-red-500 text-xs mt-1.5">{error}</p>}
          </div>

          <button type="submit" disabled={loading}
            className="w-full py-2.5 rounded-lg text-sm font-semibold text-white transition-all disabled:opacity-60"
            style={{ background: '#1976D2' }}>
            {loading ? 'Verificando...' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  )
}
