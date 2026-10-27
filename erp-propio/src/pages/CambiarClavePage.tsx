import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { GwField, GwInput } from '../components/gw'

/** Archivo → Cambiar Contraseña: el empleado conectado cambia su propia contraseña. */
export function CambiarClavePage() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const [actual, setActual] = useState('')
  const [nueva, setNueva] = useState('')
  const [repetida, setRepetida] = useState('')
  const [mensaje, setMensaje] = useState<{ texto: string; error: boolean } | null>(null)
  const [guardando, setGuardando] = useState(false)
  const email = session?.user.email ?? ''
  const usuario = email.replace(/@ofipapel\.local$/, '')

  async function guardar(e: FormEvent) {
    e.preventDefault()
    setMensaje(null)
    if (nueva.length < 8) return setMensaje({ texto: 'La contraseña nueva debe tener al menos 8 caracteres.', error: true })
    if (nueva !== repetida) return setMensaje({ texto: 'Las dos contraseñas nuevas no coinciden.', error: true })
    setGuardando(true)
    // Se comprueba la contraseña actual antes de cambiarla.
    const { error: errorActual } = await supabase.auth.signInWithPassword({ email, password: actual })
    if (errorActual) {
      setGuardando(false)
      return setMensaje({ texto: 'La contraseña actual no es correcta.', error: true })
    }
    const { error } = await supabase.auth.updateUser({ password: nueva })
    setGuardando(false)
    if (error) return setMensaje({ texto: `No se pudo cambiar: ${error.message}`, error: true })
    setActual('')
    setNueva('')
    setRepetida('')
    setMensaje({ texto: 'Contraseña cambiada. La próxima vez entra con la nueva.', error: false })
  }

  return (
    <form onSubmit={guardar} className="mx-auto flex w-[360px] max-w-full flex-col gap-2 p-3">
      <div className="text-[12px]">
        Usuario: <b>{usuario}</b>
      </div>
      <GwField label="Contraseña actual">
        <GwInput type="password" required autoComplete="current-password" value={actual} onChange={(e) => setActual(e.target.value)} />
      </GwField>
      <GwField label="Contraseña nueva">
        <GwInput type="password" required autoComplete="new-password" value={nueva} onChange={(e) => setNueva(e.target.value)} />
      </GwField>
      <GwField label="Repetir contraseña nueva">
        <GwInput type="password" required autoComplete="new-password" value={repetida} onChange={(e) => setRepetida(e.target.value)} />
      </GwField>
      {mensaje && <div className={`text-[12px] ${mensaje.error ? 'text-[#c42b1c]' : 'text-[#1a7f37]'}`}>{mensaje.texto}</div>}
      <div className="mt-1 flex justify-end gap-1.5">
        <button type="submit" className="gw-btn w-[80px]" disabled={guardando}>
          {guardando ? 'Guardando…' : 'Aceptar'}
        </button>
        <button type="button" className="gw-btn w-[80px]" onClick={() => navigate('/')}>
          Cancelar
        </button>
      </div>
    </form>
  )
}
