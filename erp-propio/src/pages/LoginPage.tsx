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
    const { error } = await signIn(email, password)
    if (error) setError('Email o contraseña incorrectos')
    setLoading(false)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--gw-mdi)] p-4">
      <GwWindow title="Cambiar Empleado" className="w-[340px] max-w-full">
        <form onSubmit={handleSubmit} className="flex flex-col gap-2 p-1">
          <div className="text-[12px]">Ofipapel ERP — identificación del empleado</div>
          <GwField label="Email">
            <GwInput type="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
          </GwField>
          <GwField label="Contraseña">
            <GwInput type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
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
