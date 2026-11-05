import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { usePermisos } from '../lib/PermisosContext'
import { GwField, GwInput, GwTabs } from '../components/gw'
import { GwOperativa } from '../components/gw/GwOperativa'
import { CampoClave } from '../components/claves/CampoClave'
import { FormNuevaClave } from '../components/claves/FormNuevaClave'

/** Archivo → Cambiar Contraseña: el empleado conectado cambia su propia clave y, si es super
 *  administrador, puede activar la doble verificación (código del móvil al entrar). */
export function CambiarClavePage() {
  const { session } = useAuth()
  const { superAdmin } = usePermisos()
  const navigate = useNavigate()
  const [tab, setTab] = useState('clave')
  const [actual, setActual] = useState('')
  // Con la doble verificación hecha (aal2) no se vuelve a pedir la clave actual: volver a entrar con
  // ella bajaría la sesión a «solo clave» y Supabase no dejaría cambiarla sin el código del móvil.
  const [conDoble, setConDoble] = useState(false)
  useEffect(() => {
    void supabase.auth.mfa.getAuthenticatorAssuranceLevel().then(({ data }) => setConDoble(data?.currentLevel === 'aal2'))
  }, [])
  const email = session?.user.email ?? ''
  const usuario = email.replace(/@ofipapel\.local$/, '')

  const tabs = [
    [
      { key: 'clave', label: 'Cambiar clave' },
      ...(superAdmin ? [{ key: 'doble', label: 'Doble verificación' }] : []),
      { key: 'operativa', label: 'Operativa' },
    ],
  ]

  return (
    <div className="mx-auto w-[520px] max-w-full p-3">
      <GwTabs rows={tabs} active={tab} onChange={setTab}>
        <div className="p-2">
          {tab === 'clave' && (
            <div className="mx-auto w-[360px] max-w-full">
              <FormNuevaClave
                usuario={usuario}
                antes={
                  <>
                    <div className="text-[12px]">
                      Usuario: <b>{usuario}</b>
                    </div>
                    {!conDoble && (
                      <GwField label="Clave actual">
                        <CampoClave required autoComplete="current-password" value={actual} onChange={(e) => setActual(e.target.value)} />
                      </GwField>
                    )}
                  </>
                }
                botones={
                  <button type="button" className="gw-btn w-[80px]" onClick={() => navigate('/')}>
                    Cancelar
                  </button>
                }
                onGuardar={async (nueva) => {
                  // Se comprueba la clave actual antes de cambiarla.
                  if (!conDoble) {
                    const { error: errorActual } = await supabase.auth.signInWithPassword({ email, password: actual })
                    if (errorActual) return 'La clave actual no es correcta.'
                    if (nueva === actual) return 'La clave nueva tiene que ser distinta de la actual.'
                  }
                  const { error } = await supabase.auth.updateUser({ password: nueva })
                  if (error) return `No se pudo cambiar: ${error.message}`
                  await supabase.rpc('fn_clave_cambiada')
                  setActual('')
                  return null
                }}
              />
            </div>
          )}
          {tab === 'doble' && superAdmin && <DobleVerificacion />}
          {tab === 'operativa' && (
            <GwOperativa
              bloques={[
                {
                  titulo: 'Cambiar tu clave',
                  pasos: ['Escribe tu clave actual.', 'Escribe la nueva dos veces (con el ojo 👁 puedes verla).', 'Pulsa Aceptar.'],
                  notas: [
                    'La clave tiene que tener al menos 6 caracteres (números y/o letras), sin tu usuario y que no sea fácil de adivinar (123456, 111111…).',
                    'Si un administrador te pone una clave (o eres nuevo), al entrar el programa te obliga a poner una tuya.',
                  ],
                },
                {
                  titulo: 'Si se te olvida',
                  pasos: [
                    'En la pantalla de entrada pulsa «¿Has olvidado la clave?».',
                    'Escribe tu usuario y pulsa «Enviar código»: llega un código de 6 cifras al correo de tu ficha de empleado.',
                    'Escribe el código y tu clave nueva. El código caduca a los 15 minutos.',
                  ],
                  notas: [
                    'Hace falta que tu ficha de empleado tenga el correo puesto (Archivo → Empleados).',
                    'Si no tienes correo o no te llega, un administrador te pone una clave provisional desde Archivo → Empleados → Seguridad.',
                  ],
                },
                {
                  titulo: 'Bloqueo y «No soy un robot»',
                  notas: [
                    'Tras 5 claves incorrectas seguidas, ese usuario queda bloqueado 15 minutos. Se puede usar «¿Has olvidado la clave?» mientras tanto.',
                    'Los fallos quedan en la Auditoría y avisan a los super administradores.',
                    'La casilla «No soy un robot» sale en la entrada cuando está configurada.',
                  ],
                },
                {
                  titulo: 'Doble verificación (super administradores, opcional)',
                  pasos: [
                    'Instala en el móvil Google Authenticator o Microsoft Authenticator.',
                    'Pestaña «Doble verificación» → «Activar»: escanea el código QR con la aplicación.',
                    'Escribe el código de 6 cifras que te sale y pulsa «Confirmar».',
                    'Desde entonces, al entrar se pide la clave y además el código del móvil.',
                  ],
                  notas: ['Si cambias de móvil, desactívala antes y vuelve a activarla en el nuevo.'],
                },
              ]}
            />
          )}
        </div>
      </GwTabs>
    </div>
  )
}

interface Alta {
  id: string
  qr: string
  secreto: string
}

/** Doble verificación con aplicación del móvil (TOTP de Supabase Auth). */
function DobleVerificacion() {
  const [activa, setActiva] = useState<string | null | undefined>(undefined)
  const [alta, setAlta] = useState<Alta | null>(null)
  const [codigo, setCodigo] = useState('')
  const [msg, setMsg] = useState<{ texto: string; error: boolean } | null>(null)
  const [ocupado, setOcupado] = useState(false)

  const mirar = useCallback(async () => {
    const { data } = await supabase.auth.mfa.listFactors()
    setActiva(data?.totp[0]?.id ?? null)
  }, [])
  useEffect(() => {
    void mirar()
  }, [mirar])

  async function activar() {
    setMsg(null)
    setOcupado(true)
    // Quitar altas a medias de otras veces.
    const { data } = await supabase.auth.mfa.listFactors()
    for (const f of data?.all ?? []) if (f.factor_type === 'totp' && f.status !== 'verified') await supabase.auth.mfa.unenroll({ factorId: f.id })
    const { data: d, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: `Avatar ${new Date().toLocaleDateString('es-ES')}` })
    setOcupado(false)
    if (error || !d) return setMsg({ texto: `No se ha podido empezar: ${error?.message ?? ''}`, error: true })
    setAlta({ id: d.id, qr: d.totp.qr_code, secreto: d.totp.secret })
  }

  async function confirmar(e: FormEvent) {
    e.preventDefault()
    if (!alta) return
    setOcupado(true)
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: alta.id, code: codigo.replace(/\D/g, '') })
    setOcupado(false)
    if (error) return setMsg({ texto: 'Código incorrecto. Escribe el que sale ahora en la aplicación.', error: true })
    setAlta(null)
    setCodigo('')
    setMsg({ texto: 'Doble verificación activada. La próxima vez que entres se te pedirá el código del móvil.', error: false })
    void mirar()
  }

  async function desactivar() {
    if (!activa || !window.confirm('¿Quitar la doble verificación? Al entrar solo se pedirá la clave.')) return
    setOcupado(true)
    const { error } = await supabase.auth.mfa.unenroll({ factorId: activa })
    setOcupado(false)
    if (error) return setMsg({ texto: `No se ha podido quitar: ${error.message}`, error: true })
    setMsg({ texto: 'Doble verificación quitada.', error: false })
    void mirar()
  }

  const mensaje = msg && <div className={`text-[12px] ${msg.error ? 'text-[#c42b1c]' : 'text-[#1a7f37]'}`}>{msg.texto}</div>
  if (activa === undefined) return <div className="text-[12px] text-[#555]">Mirando…</div>
  if (alta)
    return (
      <form onSubmit={confirmar} className="mx-auto flex w-[360px] max-w-full flex-col gap-2">
        <div className="text-[12px]">1. Escanea este código con Google Authenticator o Microsoft Authenticator:</div>
        <img src={alta.qr} alt="Código QR de la doble verificación" className="mx-auto h-[180px] w-[180px] bg-white" />
        <div className="text-[11px] text-[#555]">
          Si no puedes escanearlo, escribe a mano esta clave en la aplicación: <code className="select-all break-all">{alta.secreto}</code>
        </div>
        <GwField label="2. Código que sale">
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
        {mensaje}
        <div className="flex justify-end gap-1.5">
          <button type="submit" className="gw-btn" disabled={ocupado}>
            Confirmar
          </button>
          <button type="button" className="gw-btn" onClick={() => (setAlta(null), setMsg(null))}>
            Cancelar
          </button>
        </div>
      </form>
    )
  return (
    <div className="mx-auto flex w-[360px] max-w-full flex-col gap-2">
      <div className="text-[12px]">
        {activa ? (
          <>
            ✅ <b>Activada.</b> Al entrar se te pide la clave y el código de 6 cifras del móvil.
          </>
        ) : (
          'Además de la clave, al entrar se pide un código de 6 cifras que sale en una aplicación del móvil. Así, aunque alguien sepa tu clave, no puede entrar sin tu móvil.'
        )}
      </div>
      {mensaje}
      <div className="flex justify-end">
        {activa ? (
          <button type="button" className="gw-btn" disabled={ocupado} onClick={() => void desactivar()}>
            Quitar doble verificación
          </button>
        ) : (
          <button type="button" className="gw-btn" disabled={ocupado} onClick={() => void activar()}>
            Activar
          </button>
        )}
      </div>
    </div>
  )
}
