import { useState, type FormEvent } from 'react'
import { useAuth } from '../lib/AuthContext'
import { GwField, GwInput, GwWindow } from '../components/gw'

export function LoginPage() {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    // Se entra con el nombre de usuario (luis, rober…); internamente es usuario@ofipapel.local.
    const usuario = email.trim().toLowerCase()
    const { error } = await signIn(usuario.includes('@') ? usuario : `${usuario}@ofipapel.local`, password)
    if (error) setError('Usuario o contraseña incorrectos')
    setLoading(false)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--gw-mdi)] p-4">
      <GwWindow title="Cambiar Empleado" className="w-[340px] max-w-full">
        <form onSubmit={handleSubmit} className="flex flex-col gap-2 p-1">
          <img
            src={`${import.meta.env.BASE_URL}marca/logo-ofipapel.png`}
            alt="Ofipapel — Suministros de Oficina"
            className="mx-auto my-1 w-[220px] select-none"
            draggable={false}
          />
          <div className="text-[12px]">Ofipapel ERP — identificación del empleado</div>
          <GwField label="Usuario">
            <GwInput type="text" required autoFocus autoComplete="username" autoCapitalize="none" value={email} onChange={(e) => setEmail(e.target.value)} />
          </GwField>
          <GwField label="Contraseña">
            <GwInput type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </GwField>
          {error && <div className="text-[12px] text-[#c42b1c]">{error}</div>}
          <div className="mt-1 flex justify-end gap-1.5">
            <button type="submit" className="gw-btn w-[80px]" disabled={loading}>
              {loading ? 'Entrando…' : 'Aceptar'}
            </button>
            <button
              type="button"
              className="gw-btn w-[80px]"
              onClick={() => {
                setEmail('')
                setPassword('')
                setError(null)
              }}
            >
              Cancelar
            </button>
          </div>
        </form>
      </GwWindow>
    </div>
  )
}
