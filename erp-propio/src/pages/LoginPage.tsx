import { useState, type FormEvent } from 'react'
import { ChevronLeft } from 'lucide-react'
import { useAuth } from '../lib/AuthContext'
import { GwField, GwInput, GwWindow } from '../components/gw'
import { AREAS, SelectorArea } from '../components/shell/SelectorArea'
import { fijarArea, ultimaArea, type Area } from '../lib/areaTrabajo'
import { supabase } from '../lib/supabase'
import { correoDeUsuario } from '../lib/claves'
import { CampoClave } from '../components/claves/CampoClave'
import { OlvideClave } from '../components/claves/OlvideClave'
import { NoSoyRobot, SITE_KEY_TURNSTILE } from '../components/claves/NoSoyRobot'

// Entrada: primero se elige el área (Gestión, Contabilidad, Web o AVATAR) y después la clave.
// Seguridad (Luis, 01/11/2026): ojo para ver la clave, «¿Has olvidado la clave?», «No soy un robot»
// (si está configurado) y bloqueo de 15 minutos tras 5 claves incorrectas (fn_acceso_bloqueo).
export function LoginPage() {
  const { signIn } = useAuth()
  const [area, setArea] = useState<Area | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [olvide, setOlvide] = useState(false)
  const [captcha, setCaptcha] = useState<string | null>(null)
  const [vueltaCaptcha, setVueltaCaptcha] = useState(0)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!area) return
    if (SITE_KEY_TURNSTILE && !captcha) return setError('Marca la casilla «No soy un robot».')
    setLoading(true)
    setError(null)
    fijarArea(area)
    // Se entra con el nombre de usuario (luis, rober…); internamente es usuario@ofipapel.local.
    const correo = correoDeUsuario(email)
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

  if (!area)
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[var(--gw-mdi)] p-4">
        <div className="rounded-lg bg-white/90 px-6 py-2 shadow-sm">{logo}</div>
        <div className="text-[15px] font-bold text-[#1d3a8a]">¿Dónde quieres entrar?</div>
        <SelectorArea onElegir={setArea} marcada={ultimaArea()} />
      </div>
    )

  const a = AREAS.find((x) => x.id === area)!
  const Icono = a.icono
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--gw-mdi)] p-4">
      <GwWindow title="Cambiar Empleado" className="w-[340px] max-w-full">
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
            <div className="flex items-center gap-2 rounded border-2 px-2 py-1" style={{ background: a.fondo, borderColor: a.borde, color: a.color }}>
              {a.id === 'avatar' ? (
                <img src={`${import.meta.env.BASE_URL}marca/icono-64.png`} alt="" width={22} height={22} />
              ) : (
                <Icono size={22} aria-hidden />
              )}
              <b className="text-[15px]">Entrar en {a.id === 'avatar' ? 'Gestión · Avatar' : a.titulo}</b>
              <button type="button" className="ml-auto flex items-center text-[12px] text-[#555] hover:underline" onClick={() => setArea(null)}>
                <ChevronLeft size={14} /> Cambiar
              </button>
            </div>
            <GwField label="Usuario">
              <GwInput type="text" required autoFocus autoComplete="username" autoCapitalize="none" value={email} onChange={(e) => setEmail(e.target.value)} />
            </GwField>
            <GwField label="Contraseña">
              <CampoClave required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </GwField>
            <button type="button" className="self-start text-[12px] text-[#1d3a8a] hover:underline" onClick={() => setOlvide(true)}>
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
                  setArea(null)
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
