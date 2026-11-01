// Antes de entrar al programa (Luis, 01/11/2026):
//  1. Doble verificación: si el empleado la tiene activada (super administradores, opcional), pide el
//     código de 6 cifras de la aplicación del móvil (Google Authenticator, Microsoft Authenticator…).
//  2. Clave provisional: si la puso un administrador o es su primer acceso (empleado.debe_cambiar_clave),
//     obliga a poner una propia antes de seguir.
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/AuthContext'
import { GwField, GwInput, GwWindow } from '../gw'
import { FormNuevaClave } from './FormNuevaClave'

type Estado = 'mirando' | 'codigo' | 'cambiar' | 'dentro'

export function PuertaSeguridad({ children }: { children: ReactNode }) {
  const { session, signOut } = useAuth()
  const [estado, setEstado] = useState<Estado>('mirando')
  const usuario = (session?.user.email ?? '').replace(/@ofipapel\.local$/, '')

  const mirar = useCallback(async () => {
    const { data: nivel } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    if (nivel && nivel.nextLevel === 'aal2' && nivel.currentLevel !== 'aal2') return setEstado('codigo')
    const { data: debe } = await supabase.rpc('fn_debo_cambiar_clave')
    setEstado(debe === true ? 'cambiar' : 'dentro')
  }, [])

  useEffect(() => {
    void mirar()
  }, [mirar])

  if (estado === 'dentro') return <>{children}</>
  if (estado === 'mirando') return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Cargando…</div>

  const salir = (
    <button type="button" className="gw-btn w-[80px]" onClick={() => void signOut()}>
      Salir
    </button>
  )
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--gw-mdi)] p-4">
      <GwWindow title={estado === 'codigo' ? 'Doble verificación' : 'Pon tu clave'} className="w-[360px] max-w-full">
        <div className="flex flex-col gap-2 p-1">
          {estado === 'codigo' ? (
            <CodigoDobleVerificacion onHecho={() => void mirar()} salir={salir} />
          ) : (
            <>
              <div className="text-[12px]">
                Hola <b>{usuario}</b>: la clave con la que has entrado es provisional. Pon una tuya para seguir; solo la sabrás tú.
              </div>
              <FormNuevaClave
                usuario={usuario}
                botones={salir}
                onGuardar={async (nueva) => {
                  const { error } = await supabase.auth.updateUser({ password: nueva })
                  if (error) return /same|different/i.test(error.message) ? 'Tiene que ser distinta de la provisional.' : `No se pudo cambiar: ${error.message}`
                  await supabase.rpc('fn_clave_cambiada')
                  setEstado('dentro')
                  return null
                }}
              />
            </>
          )}
        </div>
      </GwWindow>
    </div>
  )
}

function CodigoDobleVerificacion({ onHecho, salir }: { onHecho: () => void; salir: ReactNode }) {
  const [codigo, setCodigo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  async function comprobar(e: FormEvent) {
    e.preventDefault()
    setOcupado(true)
    setError(null)
    const { data: f } = await supabase.auth.mfa.listFactors()
    const factor = f?.totp[0]
    if (!factor) {
      setOcupado(false)
      return onHecho()
    }
    const { error: err } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: codigo.replace(/\D/g, '') })
    setOcupado(false)
    if (err) return setError('Código incorrecto. Mira el que sale ahora en la aplicación del móvil.')
    onHecho()
  }

  return (
    <form onSubmit={comprobar} className="flex flex-col gap-2">
      <div className="text-[12px]">Escribe el código de 6 cifras que sale ahora en la aplicación de doble verificación de tu móvil.</div>
      <GwField label="Código">
        <GwInput
          type="text"
          required
          autoFocus
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={7}
          value={codigo}
          onChange={(e) => setCodigo(e.target.value)}
        />
      </GwField>
      {error && <div className="text-[12px] text-[#c42b1c]">{error}</div>}
      <div className="mt-1 flex justify-end gap-1.5">
        <button type="submit" className="gw-btn w-[80px]" disabled={ocupado}>
          {ocupado ? 'Mirando…' : 'Aceptar'}
        </button>
        {salir}
      </div>
    </form>
  )
}
