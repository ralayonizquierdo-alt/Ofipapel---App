// «¿Has olvidado la clave?» (Luis, 01/11/2026): se pide un código de 6 cifras que llega al correo de la
// ficha del empleado y con él se pone una clave nueva. Lo hace la función del servidor clave-recuperar.
import { useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabase'
import { fallosClave, REGLAS_CLAVE } from '../../lib/claves'
import { GwField, GwInput } from '../gw'
import { CampoClave } from './CampoClave'
import { NoSoyRobot, SITE_KEY_TURNSTILE } from './NoSoyRobot'

async function llamar(cuerpo: Record<string, unknown>): Promise<{ ok: boolean; texto: string }> {
  const { data, error } = await supabase.functions.invoke('clave-recuperar', { body: cuerpo })
  // En los 400 el motivo viene en el cuerpo de la respuesta.
  let d = data as { ok?: boolean; mensaje?: string; error?: string } | null
  if (error && 'context' in error && error.context instanceof Response) d = await error.context.json().catch(() => null)
  if (d?.ok) return { ok: true, texto: d.mensaje ?? 'Hecho.' }
  return { ok: false, texto: d?.error ?? 'No se ha podido hacer. Prueba otra vez dentro de un rato.' }
}

export function OlvideClave({ usuarioInicial, onVolver }: { usuarioInicial: string; onVolver: (usuario: string) => void }) {
  const [paso, setPaso] = useState<'pedir' | 'cambiar' | 'hecho'>('pedir')
  const [usuario, setUsuario] = useState(usuarioInicial.replace(/@ofipapel\.local$/i, ''))
  const [codigo, setCodigo] = useState('')
  const [nueva, setNueva] = useState('')
  const [repetida, setRepetida] = useState('')
  const [captcha, setCaptcha] = useState<string | null>(null)
  const [vueltaCaptcha, setVueltaCaptcha] = useState(0)
  const [msg, setMsg] = useState<{ texto: string; error: boolean } | null>(null)
  const [ocupado, setOcupado] = useState(false)

  async function pedir(e: FormEvent) {
    e.preventDefault()
    if (SITE_KEY_TURNSTILE && !captcha) return setMsg({ texto: 'Marca la casilla «No soy un robot».', error: true })
    setOcupado(true)
    const r = await llamar({ accion: 'pedir', usuario, captcha })
    setOcupado(false)
    setCaptcha(null)
    setVueltaCaptcha((n) => n + 1)
    setMsg({ texto: r.texto, error: !r.ok })
    if (r.ok) setPaso('cambiar')
  }

  async function cambiar(e: FormEvent) {
    e.preventDefault()
    const f = fallosClave(nueva, usuario)
    if (f) return setMsg({ texto: f, error: true })
    if (nueva !== repetida) return setMsg({ texto: 'Las dos claves nuevas no coinciden.', error: true })
    setOcupado(true)
    const r = await llamar({ accion: 'cambiar', usuario, codigo, nueva })
    setOcupado(false)
    setMsg({ texto: r.texto, error: !r.ok })
    if (r.ok) setPaso('hecho')
  }

  const mensaje = msg && <div className={`text-[12px] ${msg.error ? 'text-[#c42b1c]' : 'text-[#1a7f37]'}`}>{msg.texto}</div>
  const volver = (
    <button type="button" className="gw-btn" onClick={() => onVolver(usuario)}>
      {paso === 'hecho' ? 'Entrar' : 'Volver'}
    </button>
  )

  if (paso === 'pedir')
    return (
      <form onSubmit={pedir} className="flex flex-col gap-2">
        <b className="text-[14px] text-[#1d3a8a]">¿Has olvidado la clave?</b>
        <div className="text-[12px]">Te mandamos un código de 6 cifras al correo de tu ficha de empleado.</div>
        <GwField label="Usuario">
          <GwInput type="text" required autoFocus autoCapitalize="none" autoComplete="username" value={usuario} onChange={(e) => setUsuario(e.target.value)} />
        </GwField>
        <NoSoyRobot key={vueltaCaptcha} onToken={setCaptcha} />
        {mensaje}
        <div className="mt-1 flex justify-end gap-1.5">
          <button type="submit" className="gw-btn" disabled={ocupado}>
            {ocupado ? 'Enviando…' : 'Enviar código'}
          </button>
          {volver}
        </div>
      </form>
    )

  if (paso === 'cambiar')
    return (
      <form onSubmit={cambiar} className="flex flex-col gap-2">
        <b className="text-[14px] text-[#1d3a8a]">Pon tu clave nueva</b>
        {mensaje}
        <GwField label="Código del correo">
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
        <GwField label="Clave nueva">
          <CampoClave required autoComplete="new-password" value={nueva} onChange={(e) => setNueva(e.target.value)} />
        </GwField>
        <GwField label="Repetir clave nueva">
          <CampoClave required autoComplete="new-password" value={repetida} onChange={(e) => setRepetida(e.target.value)} />
        </GwField>
        <div className="text-[11px] text-[#555]">{REGLAS_CLAVE}</div>
        <div className="mt-1 flex justify-end gap-1.5">
          <button type="button" className="gw-btn" onClick={() => (setPaso('pedir'), setMsg(null))}>
            Pedir otro código
          </button>
          <button type="submit" className="gw-btn" disabled={ocupado}>
            {ocupado ? 'Guardando…' : 'Aceptar'}
          </button>
          {volver}
        </div>
      </form>
    )

  return (
    <div className="flex flex-col gap-2">
      {mensaje}
      <div className="flex justify-end">{volver}</div>
    </div>
  )
}
