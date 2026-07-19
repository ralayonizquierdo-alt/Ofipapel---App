import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { hashPw, getStoredHash, saveHash } from '../lib/passwordAuth'
import bgTrebol from '../assets/bg-trebol.png'

type User = 'Luis' | 'Rober'

const USERS: User[] = ['Luis', 'Rober']

interface Props { onLogin: (user: User) => void }

export default function LoginScreen({ onLogin }: Props) {
  const [user, setUser] = useState<User>('Luis')
  const [pw, setPw] = useState('')
  const [show, setShow] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [resetMode, setResetMode] = useState(false)
  const [resetCode, setResetCode] = useState('')
  const [resetMsg, setResetMsg] = useState('')

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

  async function handleReset(e: React.FormEvent) {
    e.preventDefault()
    const h = await hashPw(resetCode)
    const DEFAULT_HASH = 'd086b000c4d69407866d15606d2c5bb9c8f64431bf4f72d1393b9996ca9a3cec'
    if (h !== DEFAULT_HASH) { setResetMsg('Código incorrecto'); return }
    saveHash(DEFAULT_HASH)
    setResetMsg('✓ Contraseña restablecida')
    setResetCode('')
    setTimeout(() => { setResetMode(false); setResetMsg('') }, 2500)
  }

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden"
      style={{ backgroundImage: `url(${bgTrebol})`, backgroundSize: 'cover', backgroundPosition: 'center' }}>
      <div className="absolute inset-0 bg-blue-950/75 pointer-events-none" />
      <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-sm relative z-10">
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

          <p className="text-center">
            <button type="button" onClick={() => setResetMode(true)}
              className="text-xs text-slate-400 hover:text-blue-500 transition-colors">
              ¿Olvidaste la contraseña?
            </button>
          </p>
        </form>

        {resetMode && (
          <div className="mt-4 pt-4 border-t border-slate-100">
            <form onSubmit={handleReset} className="space-y-3">
              <p className="text-xs text-slate-500 text-center">Introduce la contraseña predeterminada para restablecer el acceso</p>
              <input
                type="password"
                value={resetCode}
                onChange={e => { setResetCode(e.target.value); setResetMsg('') }}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Contraseña predeterminada"
                autoFocus
              />
              {resetMsg && (
                <p className={`text-xs ${resetMsg.startsWith('✓') ? 'text-green-600' : 'text-red-500'}`}>{resetMsg}</p>
              )}
              <div className="flex gap-2">
                <button type="submit" className="flex-1 py-2 rounded-lg text-xs font-semibold text-white" style={{ background: '#1976D2' }}>
                  Restablecer
                </button>
                <button type="button" onClick={() => { setResetMode(false); setResetMsg('') }}
                  className="px-3 py-2 rounded-lg text-xs text-slate-500 border border-slate-200 hover:border-slate-400">
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}
