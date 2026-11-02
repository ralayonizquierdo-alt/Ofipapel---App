// Clave nueva + repetirla, con las reglas de una clave segura (src/lib/claves.ts). Lo usan
// Archivo → Cambiar Contraseña y la pantalla que obliga a cambiarla al entrar.
import { useState, type FormEvent, type ReactNode } from 'react'
import { fallosClave, REGLAS_CLAVE } from '../../lib/claves'
import { GwField } from '../gw'
import { CampoClave } from './CampoClave'

export function FormNuevaClave({
  usuario,
  antes,
  botones,
  onGuardar,
}: {
  usuario: string
  /** Campos que van delante (la clave actual). */
  antes?: ReactNode
  /** Botones que van detrás de «Aceptar» (Cancelar, Salir…). */
  botones?: ReactNode
  /** Devuelve el error o null si se ha cambiado. */
  onGuardar: (nueva: string) => Promise<string | null>
}) {
  const [nueva, setNueva] = useState('')
  const [repetida, setRepetida] = useState('')
  const [msg, setMsg] = useState<{ texto: string; error: boolean } | null>(null)
  const [guardando, setGuardando] = useState(false)

  async function guardar(e: FormEvent) {
    e.preventDefault()
    setMsg(null)
    const f = fallosClave(nueva, usuario)
    if (f) return setMsg({ texto: f, error: true })
    if (nueva !== repetida) return setMsg({ texto: 'Las dos claves nuevas no coinciden.', error: true })
    setGuardando(true)
    const error = await onGuardar(nueva)
    setGuardando(false)
    if (error) return setMsg({ texto: error, error: true })
    setNueva('')
    setRepetida('')
    setMsg({ texto: 'Clave cambiada. La próxima vez entra con la nueva.', error: false })
  }

  return (
    <form onSubmit={guardar} className="flex flex-col gap-2">
      {antes}
      <GwField label="Clave nueva">
        <CampoClave required autoComplete="new-password" value={nueva} onChange={(e) => setNueva(e.target.value)} />
      </GwField>
      <GwField label="Repetir clave nueva">
        <CampoClave required autoComplete="new-password" value={repetida} onChange={(e) => setRepetida(e.target.value)} />
      </GwField>
      <div className="text-[11px] text-[#555]">{REGLAS_CLAVE}</div>
      {msg && <div className={`text-[12px] ${msg.error ? 'text-[#c42b1c]' : 'text-[#1a7f37]'}`}>{msg.texto}</div>}
      <div className="mt-1 flex justify-end gap-1.5">
        <button type="submit" className="gw-btn w-[80px]" disabled={guardando}>
          {guardando ? 'Guardando…' : 'Aceptar'}
        </button>
        {botones}
      </div>
    </form>
  )
}
