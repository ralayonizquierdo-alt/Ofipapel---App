import { useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../lib/AuthContext'
import { GwField, GwInput, GwWindow } from '../components/gw'
import { AREAS } from '../components/shell/SelectorArea'
import { fijarArea, type Area } from '../lib/areaTrabajo'
import { supabase } from '../lib/supabase'
import { correoDeUsuario } from '../lib/claves'
import { CampoClave } from '../components/claves/CampoClave'
import { OlvideClave } from '../components/claves/OlvideClave'
import { NoSoyRobot, SITE_KEY_TURNSTILE } from '../components/claves/NoSoyRobot'

// Entrada: primero se elige el área (Gestión, Contabilidad, Web o AVATAR) y después la clave.
// Seguridad (Luis, 01/11/2026): ojo para ver la clave, «¿Has olvidado la clave?», «No soy un robot»
// (si está configurado) y bloqueo de 15 minutos tras 5 claves incorrectas (fn_acceso_bloqueo).
// Cada terminal recuerda el último número de empleado (o usuario) que entró, para que ya salga
// escrito. Solo el número: la contraseña nunca se guarda. Si el navegador no deja, se ignora.
const CLAVE_ULTIMO_USUARIO = 'erp_ultimo_usuario'
const ultimoUsuario = () => {
  try {
    return localStorage.getItem(CLAVE_ULTIMO_USUARIO) ?? ''
  } catch {
    return ''
  }
}

export function LoginPage() {
  const { signIn } = useAuth()
  const [area, setArea] = useState<Area>('avatar')
  const [email, setEmail] = useState(ultimoUsuario)
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [olvide, setOlvide] = useState(false)
  const [captcha, setCaptcha] = useState<string | null>(null)
  const [vueltaCaptcha, setVueltaCaptcha] = useState(0)
  // Al teclear un número de empleado, al lado sale el nombre de esa persona (como en GeminisWin).
  const [nombreEmpleado, setNombreEmpleado] = useState('')
  useEffect(() => {
    const n = email.trim()
    if (!/^\d{1,6}$/.test(n)) {
      setNombreEmpleado('')
      return
    }
    let vigente = true
    const t = setTimeout(async () => {
      const { data } = await supabase.rpc('fn_nombre_por_numero', { p_numero: n })
      if (vigente) setNombreEmpleado(typeof data === 'string' ? data : '')
    }, 250)
    return () => {
      vigente = false
      clearTimeout(t)
    }
  }, [email])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!area) return
    if (SITE_KEY_TURNSTILE && !captcha) return setError('Marca la casilla «No soy un robot».')
    setLoading(true)
    setError(null)
    fijarArea(area)
    // Se entra con el número de empleado (como en GeminisWin: 008, 009, 410…) o con el nombre de
    // usuario (luis, rober…); internamente es usuario@ofipapel.local.
    let correo = correoDeUsuario(email)
    if (/^\d{1,6}$/.test(email.trim())) {
      const { data: deNumero } = await supabase.rpc('fn_login_por_numero', { p_numero: email.trim() })
      if (typeof deNumero === 'string' && deNumero) correo = deNumero
    }
    const { data: espera } = await supabase.rpc('fn_acceso_bloqueo', { p_usuario: correo })
    if (Number(espera) > 0) {
      setLoading(false)
      return setError(`Demasiadas claves incorrectas. Espera ${Math.ceil(Number(espera) / 60)} min o usa «¿Has olvidado la clave?».`)
    }
    const { error } = await signIn(correo, password, captcha)
    if (error) {
      setError('Usuario o contraseña incorrectos')
      // El «No soy un robot» vale una sola vez.
      setCaptcha(null)
      setVueltaCaptcha((n) => n + 1)
    } else {
      try {
        localStorage.setItem(CLAVE_ULTIMO_USUARIO, email.trim())
      } catch {
        /* sin almacenamiento: no pasa nada */
      }
    }
    setLoading(false)
  }

  const logo = (
    <img
      src={`${import.meta.env.BASE_URL}marca/logo-ofipapel.png`}
      alt="Ofipapel — Suministros de Oficina"
      className="mx-auto my-1 w-[220px] select-none"
      draggable={false}
    />
  )

  // Los tres cuadros de área van dentro de la misma ventana: Contabilidad a la izquierda, Gestión en
  // el medio (marcado por defecto) y Web a la derecha.
  const CUADROS: Area[] = ['contabilidad', 'avatar', 'web']
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--gw-mdi)] p-4">
      <GwWindow title="Cambiar Empleado" className="w-[480px] max-w-full">
        {olvide ? (
          <div className="flex flex-col gap-2 p-1">
            {logo}
            <OlvideClave
              usuarioInicial={email}
              onVolver={(u) => {
                setEmail(u)
                setPassword('')
                setError(null)
                setOlvide(false)
              }}
            />
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-2 p-1">
            {logo}
            <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Dónde quieres entrar">
              {CUADROS.map((id) => {
                const ar = AREAS.find((x) => x.id === id)!
                const Ico = ar.icono
                const marcado = area === id
                return (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={marcado}
                    onClick={() => setArea(id)}
                    className={`flex h-[76px] flex-col items-center justify-center gap-0.5 rounded-lg border-2 transition ${marcado ? 'ring-2 ring-offset-1' : 'opacity-60 hover:opacity-100'}`}
                    style={{ background: ar.fondo, borderColor: marcado ? ar.color : ar.borde, color: ar.color, ['--tw-ring-color' as string]: ar.color }}
                  >
                    {id === 'avatar' ? (
                      <img src={`${import.meta.env.BASE_URL}marca/icono-64.png`} alt="" width={28} height={28} className="select-none" draggable={false} />
                    ) : (
                      <Ico size={28} strokeWidth={1.6} aria-hidden />
                    )}
                    <span className="text-[14px] font-bold leading-tight">{ar.titulo}</span>
                  </button>
                )
              })}
            </div>
            <div className="flex gap-2">
              <div className="w-[150px] shrink-0">
                <GwField label="Nº de empleado">
                  <GwInput
                    type="text"
                    required
                    autoFocus
                    autoComplete="username"
                    autoCapitalize="none"
                    inputMode="text"
                    className="!h-[52px] !text-[32px] !font-bold tracking-wider"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onFocus={(e) => e.currentTarget.select()}
                    onKeyDown={(e) => {
                      // Intro en el número: pasa a la contraseña (no envía todavía).
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        document.getElementById('entrada-clave')?.focus()
                      }
                    }}
                  />
                </GwField>
              </div>
              <div className="min-w-0 flex-1">
                <GwField label="Nombre">
                  <GwInput type="text" readOnly tabIndex={-1} className="!h-[52px] !text-[24px] !font-semibold" value={nombreEmpleado} aria-label="Nombre del empleado" />
                </GwField>
              </div>
            </div>
            <GwField label="Contraseña">
              <div className="w-[250px] max-w-full">
                <CampoClave id="entrada-clave" required autoComplete="current-password" className="!h-[52px] !text-[28px] !font-bold tracking-widest" value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
            </GwField>
            <button type="button" className="self-start text-[12px] text-[#1d3a8a] hover:underline" onClick={async () => {
                // «¿Has olvidado la clave?» trabaja con el nombre de usuario: si se tecleó el número, se traduce.
                if (/^\d{1,6}$/.test(email.trim())) {
                  const { data: deNumero } = await supabase.rpc('fn_login_por_numero', { p_numero: email.trim() })
                  if (typeof deNumero === 'string' && deNumero) setEmail(deNumero.replace(/@ofipapel\.local$/, ''))
                }
                setOlvide(true)
              }}>
              ¿Has olvidado la clave?
            </button>
            <NoSoyRobot key={vueltaCaptcha} onToken={setCaptcha} />
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
        )}
      </GwWindow>
    </div>
  )
}
