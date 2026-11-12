import { useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../lib/AuthContext'
import { Check, KeyRound, X } from 'lucide-react'
import { GwInput, GwWindow } from '../components/gw'
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
// Botones grandes de la ventana de GeminisWin (los mismos que la del TPV, ventas/VentaDialogs).
const BTN_GRANDE =
  'flex h-[58px] items-center justify-center gap-1.5 border border-[var(--gw-border)] bg-[#e1e1e1] text-[20px] hover:border-[var(--gw-select)] hover:bg-[#e5f1fb] disabled:text-[#8a8a8a]'

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

  // «Cambiar Contraseña» y «¿Has olvidado la clave?» trabajan con el nombre de usuario: si se tecleó
  // el número, se traduce.
  async function abrirOlvide() {
    if (/^\d{1,6}$/.test(email.trim())) {
      const { data: deNumero } = await supabase.rpc('fn_login_por_numero', { p_numero: email.trim() })
      if (typeof deNumero === 'string' && deNumero) setEmail(deNumero.replace(/@ofipapel\.local$/, ''))
    }
    setOlvide(true)
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
      <GwWindow title="Introducir Empleado y contraseña" className="w-[720px] max-w-full">
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
            {/* Calcado de GeminisWin («Introducir Empleado y contraseña», capturas 9-01, 12/11/2026): marco
                «Empleado» con número, nombre y «···»; «Contraseña:» con la llave; y abajo Cambiar Contraseña,
                Aceptar y Cancelar. Propio del ERP: el logotipo, los cuadros de área, «¿Has olvidado la
                clave?», «No soy un robot» y el ojo de la contraseña. */}
            <fieldset className="gw-group px-2 pb-2">
              <legend className="!text-[24px] !font-bold !leading-[28px]">Empleado</legend>
              <div className="flex items-center gap-2">
                <GwInput
                  type="text"
                  required
                  autoFocus
                  autoComplete="username"
                  autoCapitalize="none"
                  inputMode="text"
                  aria-label="Nº de empleado"
                  className="!h-[44px] !w-[110px] flex-none !text-[28px] !font-bold tracking-wider"
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
                <GwInput type="text" readOnly tabIndex={-1} className="!h-[44px] min-w-0 flex-1 !text-[26px] !font-bold" value={nombreEmpleado} aria-label="Nombre del empleado" />
                {/* En GeminisWin abre la lista de empleados. Aquí, antes de entrar, la lista no se enseña a nadie. */}
                <button type="button" tabIndex={-1} disabled className="gw-btn !h-[44px] !w-[70px] flex-none !text-[22px] !font-bold" title="La lista de empleados no se enseña antes de entrar: teclea tu número">
                  ···
                </button>
              </div>
            </fieldset>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2">
              <label htmlFor="entrada-clave" className="w-[230px] text-[26px] font-bold">
                Contraseña:
              </label>
              <div className="w-[270px] max-w-full">
                <CampoClave id="entrada-clave" required autoComplete="current-password" className="!h-[44px] !text-[24px] !font-bold tracking-widest" value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              <KeyRound size={28} className="text-[#c99a1c]" aria-hidden />
            </div>
            <button type="button" className="self-start text-[12px] text-[#1d3a8a] hover:underline" onClick={abrirOlvide}>
              ¿Has olvidado la clave?
            </button>
            <NoSoyRobot key={vueltaCaptcha} onToken={setCaptcha} />
            {error && <div className="text-[12px] text-[#c42b1c]">{error}</div>}
            <div className="mt-1 grid grid-cols-1 gap-1.5 border-t border-[var(--gw-border-light)] pt-1.5 sm:grid-cols-[240px_1fr_190px_190px]">
              {/* Antes de entrar, la contraseña se cambia con el código que llega al correo (lo mismo que «¿Has
                  olvidado la clave?»); ya dentro, en Archivo → Cambiar Contraseña. */}
              <button type="button" className={BTN_GRANDE} onClick={abrirOlvide} title="Poner una contraseña nueva con el código que llega a tu correo">
                <KeyRound size={22} className="text-[#c99a1c]" aria-hidden /> Cambiar Contraseña
              </button>
              <span className="hidden sm:block" />
              <button type="submit" className={BTN_GRANDE} disabled={loading}>
                <Check size={20} className="text-[#127a12]" aria-hidden /> {loading ? 'Entrando…' : 'Aceptar'}
              </button>
              <button
                type="button"
                className={BTN_GRANDE}
                onClick={() => {
                  setEmail('')
                  setPassword('')
                  setError(null)
                }}
              >
                <X size={20} className="text-[#c42b1c]" aria-hidden /> Cancelar
              </button>
            </div>
          </form>
        )}
      </GwWindow>
    </div>
  )
}
