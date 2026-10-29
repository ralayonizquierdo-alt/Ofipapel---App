// Formulario «SEGUIMIENTO» de un presupuesto (Luis, 29/10/2026): hasta 3 contactos (día, con quién,
// qué contestó, próximo contacto y si fue por teléfono o correo), envío del correo de seguimiento
// desde el programa de correo del empleado (mailto:, sin servidor) dejando constancia en
// presupuesto_correo, y cierre del presupuesto con motivo, fecha y vendedor.

import { useCallback, useEffect, useState } from 'react'
import { GwDate, GwInput, GwSelect, GwWindow } from '../../../components/gw'
import { supabase } from '../../../lib/supabase'
import { MOTIVOS_PERDIDA } from './estadosPresupuesto'

interface Contacto {
  id?: number
  orden: number
  fecha: string
  contacto_con: string
  respuesta: string
  proximo_contacto: string | null
  medio: 'telefono' | 'email'
  empleado_codigo?: string | null
}

interface Correo {
  id: number
  contacto_orden: number | null
  para: string | null
  asunto: string | null
  enviado_en: string
  enviado_por: string | null
}

const hoy = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Atlantic/Canary' }).format(new Date())
const fechaEs = (iso: string | null) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '')
const ORD = ['1.º', '2.º', '3.º']

export function SeguimientoFormulario({
  tienda,
  numero,
  clienteCodigo,
  clienteNombre,
  responsable,
  estado,
  total,
  onClose,
  onCambio,
}: {
  tienda: string
  numero: number
  clienteCodigo: string | null
  clienteNombre: string | null
  responsable: string | null
  estado: string
  total: number | null
  onClose: () => void
  /** Lo que ha cambiado en el presupuesto (estado, próximo contacto…), para la ficha. */
  onCambio: (p: Record<string, unknown>) => void
}) {
  const vacios = (): Contacto[] => [1, 2, 3].map((o) => ({ orden: o, fecha: hoy(), contacto_con: '', respuesta: '', proximo_contacto: null, medio: 'telefono' as const }))
  const [contactos, setContactos] = useState<Contacto[]>(vacios)
  const [correos, setCorreos] = useState<Correo[]>([])
  const [numeros, setNumeros] = useState<Record<string, string>>({})
  const [yo, setYo] = useState<string | null>(null)
  const [cliente, setCliente] = useState<{ email: string | null; contacto: string | null }>({ email: null, contacto: null })
  const [mensaje, setMensaje] = useState<{ texto: string; error?: boolean } | null>(null)
  const [cierre, setCierre] = useState<{ resultado: 'perdido' | 'aceptado'; motivo: string }>({ resultado: 'perdido', motivo: '' })
  const cerrado = estado === 'aceptado' || estado === 'perdido'

  const cargar = useCallback(async () => {
    const [c, m] = await Promise.all([
      supabase.from('presupuesto_contacto').select('id, orden, fecha, contacto_con, respuesta, proximo_contacto, medio, empleado_codigo').eq('tienda_terminal_codigo', tienda).eq('numero', numero).order('orden'),
      supabase.from('presupuesto_correo').select('id, contacto_orden, para, asunto, enviado_en, enviado_por').eq('tienda_terminal_codigo', tienda).eq('numero', numero).order('enviado_en'),
    ])
    const guardados = ((c.data ?? []) as Contacto[]).map((x) => ({ ...x, contacto_con: x.contacto_con ?? '', respuesta: x.respuesta ?? '' }))
    setContactos(
      [1, 2, 3].map((o) => guardados.find((x) => x.orden === o) ?? { orden: o, fecha: hoy(), contacto_con: '', respuesta: '', proximo_contacto: null, medio: 'telefono' as const }),
    )
    setCorreos((m.data ?? []) as Correo[])
  }, [tienda, numero])

  useEffect(() => {
    cargar()
    supabase.rpc('fn_empleado_actual').then(({ data }) => setYo(typeof data === 'string' ? data : null))
    supabase
      .from('empleado')
      .select('codigo, numero_operario')
      .then(({ data }) => setNumeros(Object.fromEntries(((data ?? []) as { codigo: string; numero_operario: string | null }[]).map((e) => [e.codigo, e.numero_operario || e.codigo]))))
    if (clienteCodigo)
      supabase
        .from('cliente')
        .select('email, contacto')
        .eq('codigo', clienteCodigo)
        .maybeSingle()
        .then(({ data }) => data && setCliente({ email: (data.email as string | null) ?? null, contacto: (data.contacto as string | null) ?? null }))
  }, [cargar, clienteCodigo])

  const num = (c: string | null | undefined) => (c ? (numeros[c] ?? c) : '')
  const set = (o: number, p: Partial<Contacto>) => setContactos((l) => l.map((x) => (x.orden === o ? { ...x, ...p } : x)))

  async function guardar(c: Contacto) {
    setMensaje(null)
    if (!c.respuesta.trim() && !c.contacto_con.trim()) return setMensaje({ texto: 'Escribe con quién hablaste o qué contestó.', error: true })
    const fila = { tienda_terminal_codigo: tienda, numero, orden: c.orden, fecha: c.fecha, contacto_con: c.contacto_con || null, respuesta: c.respuesta || null, proximo_contacto: c.proximo_contacto, medio: c.medio }
    const r = c.id ? await supabase.from('presupuesto_contacto').update(fila).eq('id', c.id) : await supabase.from('presupuesto_contacto').insert(fila)
    if (r.error) return setMensaje({ texto: r.error.message, error: true })
    if (!cerrado) onCambio({ presupuesto_estado: 'seguimiento', en_seguimiento: true, proximo_contacto: c.proximo_contacto })
    setMensaje({ texto: `${ORD[c.orden - 1]} seguimiento guardado.` })
    cargar()
  }

  async function enviarCorreo(c: Contacto) {
    const para = cliente.email ?? ''
    const asunto = `Presupuesto ${tienda}-${numero} · Ofipapel`
    const saludo = c.contacto_con || cliente.contacto || ''
    const cuerpo = [
      `Buenos días${saludo ? ` ${saludo}` : ''}:`,
      '',
      `Le escribimos en relación con el presupuesto nº ${tienda}-${numero} que le enviamos${clienteNombre ? ` para ${clienteNombre}` : ''}.`,
      '¿Ha podido revisarlo? Si tiene cualquier duda o quiere ajustar algo, estaremos encantados de ayudarle.',
      '',
      'Un saludo,',
      `Ofipapel · Vend. ${num(yo)}`,
    ].join('\n')
    const { error } = await supabase.from('presupuesto_correo').insert({ tienda_terminal_codigo: tienda, numero, contacto_orden: c.orden, para: para || null, asunto, cuerpo })
    if (error) return setMensaje({ texto: error.message, error: true })
    window.location.href = `mailto:${encodeURIComponent(para)}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(cuerpo)}`
    setMensaje({ texto: para ? `Correo preparado para ${para} y apuntado en «Correos de seguimiento».` : 'Correo preparado (el cliente no tiene e-mail en su ficha: escríbelo en tu programa de correo).' })
    cargar()
  }

  async function cerrar() {
    setMensaje(null)
    if (cierre.resultado === 'perdido' && !cierre.motivo) return setMensaje({ texto: 'Elige el motivo para cerrar el presupuesto.', error: true })
    const p = { presupuesto_estado: cierre.resultado, motivo_perdida: cierre.resultado === 'perdido' ? cierre.motivo : null }
    const { error } = await supabase.from('pedido_cliente').update(p).eq('tienda_terminal_codigo', tienda).eq('numero', numero)
    if (error) return setMensaje({ texto: error.message, error: true })
    onCambio({ ...p, aceptado: cierre.resultado === 'aceptado', en_seguimiento: false, proximo_contacto: null })
    setMensaje({ texto: `Presupuesto cerrado como ${cierre.resultado === 'aceptado' ? 'ACEPTADO' : `PERDIDO (${cierre.motivo})`} el ${fechaEs(hoy())} por el Vend. ${num(yo)}.` })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/25 pt-10" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <GwWindow title={`SEGUIMIENTO · Presupuesto ${tienda}-${numero}`} onClose={onClose} className="w-[1040px] max-w-[97vw]">
        <div className="flex flex-col gap-2 text-[14px]">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border border-[var(--gw-border)] bg-white px-2 py-1.5 text-[15px]">
            <span>
              Presupuesto Nº <b>{tienda}-{numero}</b>
            </span>
            <span>
              Cliente <b>{clienteNombre ?? clienteCodigo ?? ''}</b>
            </span>
            <span>
              Vend. Nº <b>{num(responsable) || '—'}</b>
            </span>
            {total != null && (
              <span>
                Total <b>{total.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</b>
              </span>
            )}
            <span className="ml-auto">{cliente.email ? `✉ ${cliente.email}` : 'Sin e-mail en la ficha del cliente'}</span>
          </div>

          {contactos.map((c, i) => {
            const habilitado = i === 0 || !!contactos[i - 1]?.id
            return (
              <fieldset key={c.orden} className={`gw-group flex flex-col gap-1 !pt-0 ${habilitado ? '' : 'opacity-45'}`}>
                <legend className="font-bold text-[#1d3a8a]">
                  {ORD[i]} seguimiento {c.id && c.empleado_codigo ? <span className="font-normal text-[#555]">· Vend. {num(c.empleado_codigo)}</span> : null}
                </legend>
                <div className="flex flex-wrap items-end gap-2">
                  <label className="flex flex-col">
                    <span className="gw-label">Día</span>
                    <div className="w-[125px]">
                      <GwDate value={c.fecha} disabled={!habilitado} onChange={(v) => set(c.orden, { fecha: v ?? hoy() })} />
                    </div>
                  </label>
                  <label className="flex flex-col">
                    <span className="gw-label">Contactado con Sr./Sra.</span>
                    <div className="w-[200px]">
                      <GwInput value={c.contacto_con} disabled={!habilitado} placeholder={cliente.contacto ?? ''} onChange={(e) => set(c.orden, { contacto_con: e.target.value })} />
                    </div>
                  </label>
                  <label className="flex min-w-[220px] flex-1 flex-col">
                    <span className="gw-label">Contesta</span>
                    <GwInput value={c.respuesta} disabled={!habilitado} onChange={(e) => set(c.orden, { respuesta: e.target.value })} />
                  </label>
                  <label className="flex flex-col">
                    <span className="gw-label">Avisar próximo contacto el día</span>
                    <div className="w-[125px]">
                      <GwDate value={c.proximo_contacto} disabled={!habilitado} onChange={(v) => set(c.orden, { proximo_contacto: v ?? null })} />
                    </div>
                  </label>
                  <span className="flex flex-col">
                    <span className="gw-label">Mediante</span>
                    <span className="flex h-[25px] items-center gap-2">
                      {(
                        [
                          ['telefono', '📞 Tlf.'],
                          ['email', '✉ E-mail'],
                        ] as const
                      ).map(([v, t]) => (
                        <label key={v} className="flex items-center gap-1">
                          <input type="radio" disabled={!habilitado} checked={c.medio === v} onChange={() => set(c.orden, { medio: v })} />
                          {t}
                        </label>
                      ))}
                    </span>
                  </span>
                  <button type="button" className="gw-btn h-[28px] font-bold" disabled={!habilitado} onClick={() => guardar(c)}>
                    💾 Guardar
                  </button>
                  {c.medio === 'email' && (
                    <button type="button" className="gw-btn h-[28px]" disabled={!habilitado} onClick={() => enviarCorreo(c)} title="Abre tu programa de correo con el texto preparado">
                      ✉ Enviar correo
                    </button>
                  )}
                </div>
              </fieldset>
            )
          })}

          <fieldset className="gw-group !pt-0">
            <legend className="font-bold text-[#1d3a8a]">Correos de seguimiento enviados ({correos.length})</legend>
            {correos.length === 0 ? (
              <span className="text-[13px] text-[#777]">Ninguno todavía.</span>
            ) : (
              <table className="gw-grid">
                <thead>
                  <tr>
                    <th className="w-[140px]">Fecha</th>
                    <th className="w-[90px]">Seguim.</th>
                    <th>Para</th>
                    <th>Asunto</th>
                    <th className="w-[70px]">Vend.</th>
                  </tr>
                </thead>
                <tbody>
                  {correos.map((m) => (
                    <tr key={m.id}>
                      <td>{new Date(m.enviado_en).toLocaleString('es-ES')}</td>
                      <td>{m.contacto_orden ? `${ORD[m.contacto_orden - 1]}` : ''}</td>
                      <td className="truncate">{m.para ?? ''}</td>
                      <td className="truncate">{m.asunto ?? ''}</td>
                      <td>{num(m.enviado_por)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </fieldset>

          <fieldset className="gw-group !pt-0" style={{ borderColor: '#c42b1c' }}>
            <legend className="font-bold text-[#c42b1c]">Cerrar el presupuesto</legend>
            {cerrado ? (
              <span className="font-bold">Este presupuesto ya está cerrado ({estado === 'aceptado' ? 'aceptado' : 'perdido'}).</span>
            ) : (
              <div className="flex flex-wrap items-end gap-2">
                <label className="flex flex-col">
                  <span className="gw-label">Resultado</span>
                  <GwSelect className="w-[140px]" value={cierre.resultado} onChange={(e) => setCierre((x) => ({ ...x, resultado: e.target.value as 'perdido' | 'aceptado' }))}>
                    <option value="perdido">Perdido</option>
                    <option value="aceptado">Aceptado</option>
                  </GwSelect>
                </label>
                {cierre.resultado === 'perdido' && (
                  <label className="flex flex-col">
                    <span className="gw-label">Motivo</span>
                    <GwSelect className="w-[260px]" value={cierre.motivo} onChange={(e) => setCierre((x) => ({ ...x, motivo: e.target.value }))}>
                      <option value="">— elige el motivo —</option>
                      {MOTIVOS_PERDIDA.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </GwSelect>
                  </label>
                )}
                <span className="pb-1">
                  Fecha <b>{fechaEs(hoy())}</b> · Vend. <b>{num(yo)}</b>
                </span>
                <span className="flex-1" />
                <button type="button" className="gw-btn h-[30px] font-bold text-[#c42b1c]" onClick={cerrar}>
                  Cerrar presupuesto
                </button>
              </div>
            )}
          </fieldset>

          {mensaje && <div className={`px-2 py-1 ${mensaje.error ? 'bg-[#fdeaea] text-[#a00]' : 'bg-[#eef8ee] text-[#185a18]'}`}>{mensaje.texto}</div>}
          <div className="flex justify-end">
            <button type="button" className="gw-btn" onClick={onClose}>
              Salir
            </button>
          </div>
        </div>
      </GwWindow>
    </div>
  )
}
