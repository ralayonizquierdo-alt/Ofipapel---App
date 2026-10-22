import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { entrar, USUARIOS, type UsuarioApp } from '../lib/auth'
import VersionBadge from './VersionBadge'
import bgTrebol from '../assets/bg-trebol.png'

interface Props { onLogin: (user: UsuarioApp) => void }

export default function LoginScreen({ onLogin }: Props) {
  const [user, setUser] = useState<UsuarioApp>('Luis')
  const [pw, setPw] = useState('')
  const [show, setShow] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [ayuda, setAyuda] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      await entrar(user, pw)
      setPw('')
      onLogin(user)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se ha podido entrar')
      setPw('')
    }
    setLoading(false)
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
              {USUARIOS.map(u => (
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
            <button type="button" onClick={() => setAyuda(a => !a)}
              className="text-xs text-slate-400 hover:text-blue-500 transition-colors">
              ¿Olvidaste la contraseña?
            </button>
          </p>
        </form>

        {ayuda && (
          <div className="mt-4 pt-4 border-t border-slate-100">
            <p className="text-xs text-slate-500 leading-relaxed">
              Las cuentas son internas y no tienen buzón de correo, así que no se puede
              enviar un enlace de recuperación. Para restablecerla, entra en{' '}
              <b>Firebase Console → Authentication → Usuarios</b>, busca la cuenta y usa
              «Restablecer contraseña».
            </p>
          </div>
        )}

        <VersionBadge />
      </div>
    </div>
  )
}
