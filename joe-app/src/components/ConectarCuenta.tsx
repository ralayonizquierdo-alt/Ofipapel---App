import { useState } from 'react'
import { conectarDispositivo } from '../lib/supabase'

/**
 * Se muestra UNA VEZ por dispositivo, la primera vez que se abre la app.
 *
 * Antes no existía: la app abría una sesión anónima al arrancar, y como esa
 * sesión la puede crear cualquiera con la clave pública del bundle, los datos
 * estaban al alcance de quien conociera la dirección. Ahora hace falta una
 * cuenta real, y como la contraseña no puede vivir en el código (el bundle es
 * público), se pide aquí y supabase-js la guarda ya convertida en sesión.
 *
 * No sustituye al PIN: el PIN sigue bloqueando la pantalla cada vez que se
 * abre la app. Esto es lo que da acceso a los datos, y sólo se pide una vez.
 */
export default function ConectarCuenta({ onConectado }: { onConectado: () => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    if (!email || !password) {
      setError('Escribe el correo y la contraseña.')
      return
    }
    setEnviando(true)
    setError('')
    try {
      await conectarDispositivo(email, password)
      onConectado()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo conectar.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-stone-50 px-6">
      <form onSubmit={enviar} className="w-full max-w-sm space-y-4">
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-semibold text-stone-800">Conectar este dispositivo</h1>
          <p className="text-sm text-stone-500">
            Solo la primera vez. Después entrarás con tu PIN de siempre.
          </p>
        </div>

        <label className="block space-y-1">
          <span className="text-sm text-stone-600">Correo</span>
          <input
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-xl border border-stone-300 px-4 py-3 text-base outline-none focus:border-stone-500"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-sm text-stone-600">Contraseña</span>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-xl border border-stone-300 px-4 py-3 text-base outline-none focus:border-stone-500"
          />
        </label>

        {error && (
          <p className="text-sm text-red-600" role="alert">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={enviando}
          className="w-full rounded-xl bg-stone-800 px-4 py-3 text-white disabled:opacity-50"
        >
          {enviando ? 'Conectando…' : 'Conectar'}
        </button>
      </form>
    </div>
  )
}
