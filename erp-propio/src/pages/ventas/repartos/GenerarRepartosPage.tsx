// Generar repartos (Rober, 18/11/2026). Desde el 19/11/2026 se abre DENTRO de Control de Repartos (botón «Generar
// repartos» de arriba, ControlRepartosHoy.tsx): todo en el mismo sitio. La ruta antigua /repartos/generar lleva allí. Generar y cerrar los repartos en el ERP con las ventas de GeminisWin,
// ruta a ruta, en lugar de hacerlo en GeminisWin (migración 20261118_reparto_circuito_erp.sql).
//  · Por cada ruta, la propuesta: ventas de clientes de esa ruta que no han ido en ningún reparto y las que no se
//    entregaron en el anterior («viene del anterior», siempre marcadas). Las de otras tiendas salen sin marcar.
//  · Repartidor: el de la última vez en esa ruta. «Generar reparto» cierra el anterior de esa ruta (lo sin entregar
//    vuelve a la propuesta) y crea el del día; si ya existe, le añade lo marcado.
//  · Las rutas que siguen en GeminisWin solo se pueden comparar: lo que el ERP habría generado al lado de lo que hay
//    en el reparto abierto de GeminisWin. «Pasar al ERP» cambia la ruta de sitio (y «Devolver a GeminisWin»).
//  · Hora de corte (David, 19/11/2026: «lo suele sacar hasta las 15 h»): solo se proponen las ventas hechas hasta esa
//    hora del día anterior al reparto (o de hoy si el reparto es de mañana). Lo que viene del reparto anterior sale
//    siempre. Por defecto las 15:00; la última hora elegida se recuerda en este ordenador.
// Datos: fn_reparto_erp_panel, fn_reparto_erp_generar, fn_reparto_erp_cerrar, fn_reparto_erp_quitar, fn_reparto_erp_ruta.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'
import { GwTabs } from '../../../components/gw'
import { GwOperativa } from '../../../components/gw/GwOperativa'

interface Propuesta {
  vt: string
  vn: number
  fecha: string | null
  hora: string | null
  cliente_codigo: string | null
  cliente: string
  poblacion: string | null
  total: number | null
  pendiente: number | null
  forma_pago: string | null
  factura: string | null
  principal: boolean
  viene: boolean
  antes: string | null
  en_gw: string | null
  de_ruta: 'venta' | 'ficha'
}
interface Ruta {
  ruta: string
  nombre: string
  erp: boolean
  repartidor: string | null
  abierto: { tienda: string; numero: number; repartidor: string | null; lineas: number } | null
  anteriores: number
  propuesta: Propuesta[]
  gw: { tienda: string; numero: number; fecha: string; hasta: string | null; ventas: [string, number][] } | null
}
interface Panel {
  fecha: string
  hoy: string
  tienda: string
  tiendas_venta: string[]
  puente_ventas: boolean
  ultima_lectura: string | null
  repartidores: { codigo: string; nombre: string }[]
  rutas: Ruta[]
}

const euros = (n: number | null | undefined) =>
  n == null ? '' : n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, useGrouping: 'always' } as Intl.NumberFormatOptions)
const fechaCorta = (iso: string | null) => (iso ? new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' }) : '')
const fechaLarga = (iso: string) => {
  const t = new Date(`${iso}T12:00:00`).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })
  return t.charAt(0).toUpperCase() + t.slice(1)
}
const hace = (iso: string | null) => {
  if (!iso) return 'nunca'
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  return m < 1 ? 'ahora mismo' : m < 60 ? `hace ${m} min` : m < 1440 ? `hace ${Math.floor(m / 60)} h` : `hace ${Math.floor(m / 1440)} día(s)`
}
const clave = (vt: string, vn: number) => `${vt}/${vn}`
/** Día de las ventas que entran: hoy si el reparto es de un día posterior; si es de hoy, el día laborable anterior. */
const diaCorte = (fecha: string, hoy: string) => {
  if (fecha > hoy) return hoy
  const d = new Date(`${hoy}T12:00:00`)
  do d.setDate(d.getDate() - 1)
  while (d.getDay() === 0)
  return d.toLocaleDateString('sv-SE')
}
const HORA_CORTE = 'erp.repartos.horaCorte'
const leerHora = () => {
  try {
    return localStorage.getItem(HORA_CORTE) || '15:00'
  } catch {
    return '15:00'
  }
}
const doc = (p: Propuesta) => (p.factura ? `Fra. ${p.factura}` : `Alb. ${p.vt}/${p.vn}`)

export function GenerarRepartosPage({ enControl = false }: { enControl?: boolean }) {
  const [tab, setTab] = useState('generar')
  return (
    <div className="p-2">
      <GwTabs
        rows={[
          [
            { key: 'generar', label: 'Generar repartos' },
            { key: 'operativa', label: 'Operativa' },
          ],
        ]}
        active={tab}
        onChange={setTab}
      >
        <div className="p-2">{tab === 'generar' ? <Generar enControl={enControl} /> : <Operativa />}</div>
      </GwTabs>
    </div>
  )
}

function Generar({ enControl }: { enControl: boolean }) {
  const navigate = useNavigate()
  const [fecha, setFecha] = useState<string | null>(null)
  const [panel, setPanel] = useState<Panel | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [mensaje, setMensaje] = useState<{ texto: string; error: boolean } | null>(null)
  const [cargando, setCargando] = useState(false)
  const [version, setVersion] = useState(0)
  const [horaCorte, setHoraCorte] = useState(leerHora)
  const [diaElegido, setDiaElegido] = useState<string | null>(null)

  const cargar = useCallback(async (f: string | null) => {
    setCargando(true)
    const { data, error: e } = await supabase.rpc('fn_reparto_erp_panel', f ? { p_fecha: f } : {})
    setCargando(false)
    if (e) return setError(e.message)
    setError(null)
    setPanel(data as Panel)
    setFecha((data as Panel).fecha)
    setVersion((v) => v + 1)
  }, [])
  useEffect(() => {
    const t = setTimeout(() => void cargar(null), 0)
    return () => clearTimeout(t)
  }, [cargar])

  if (error) return <div className="text-[13px] text-[#b00020]">{error}</div>
  if (!panel) return <div className="text-[13px]">Cargando…</div>

  const dia = diaElegido ?? diaCorte(panel.fecha, panel.hoy)
  const corte = horaCorte ? `${dia} ${horaCorte}` : null
  const dentro = (p: Propuesta) => p.viene || !corte || `${p.fecha} ${p.hora ?? '00:00'}` <= corte
  const fuera = panel.rutas.reduce((n, r) => n + r.propuesta.filter((p) => !dentro(p)).length, 0)
  const rutasCorte = panel.rutas.map((r) => ({ ...r, propuesta: r.propuesta.filter(dentro) }))
  const enErp = rutasCorte.filter((r) => r.erp)
  const enGw = rutasCorte.filter((r) => !r.erp)
  const ponerHora = (h: string) => {
    setHoraCorte(h)
    try {
      localStorage.setItem(HORA_CORTE, h)
    } catch {
      /* sin almacenamiento */
    }
  }
  const aviso = (texto: string, err = false) => setMensaje({ texto, error: err })

  return (
    <div className="flex flex-col gap-3 text-[13px]">
      <div className="flex flex-wrap items-center gap-3 rounded border border-[#c9d3e6] bg-[#f4f7fc] px-3 py-2">
        <label className="flex items-center gap-2">
          <b>Día del reparto</b>
          <input
            type="date"
            className="gw-input"
            value={fecha ?? ''}
            min={panel.hoy}
            onChange={(e) => {
              setFecha(e.target.value)
              setDiaElegido(null)
              setMensaje(null)
              if (e.target.value) void cargar(e.target.value)
            }}
          />
        </label>
        <span className="text-[#444]">{fechaLarga(panel.fecha)}</span>
        <label className="flex items-center gap-2" title="Solo salen las ventas hechas hasta esa hora (las que vienen del reparto anterior salen siempre). Déjala vacía para no cortar.">
          <b>Ventas hasta</b>
          <input type="date" className="gw-input" value={dia} max={panel.hoy} onChange={(e) => setDiaElegido(e.target.value || null)} />
          <input type="time" className="gw-input" value={horaCorte} onChange={(e) => ponerHora(e.target.value)} />
        </label>
        {fuera > 0 && <span className="text-[#b26a00]">{fuera} venta(s) posteriores no salen.</span>}
        <span className="text-[#444]">
          Ventas de GeminisWin leídas por última vez: <b>{hace(panel.ultima_lectura)}</b>
        </span>
        <button type="button" className="gw-btn ml-auto" onClick={() => void cargar(fecha)} disabled={cargando}>
          {cargando ? 'Mirando…' : 'Actualizar'}
        </button>
        {!enControl && (
          <button type="button" className="gw-btn" onClick={() => navigate('/repartos')}>
            Control de Repartos
          </button>
        )}
      </div>

      {!panel.puente_ventas && (
        <div className="rounded border border-[#e0b000] bg-[#fff8dc] px-3 py-2">
          El puente con GeminisWin todavía no manda las ventas, así que no hay nada que proponer. Para activarlo: Archivo → Parámetros, pon{' '}
          <b>reparto.puente_gw_ventas</b> a <b>true</b> (y que en el PC del puente esté instalado el programa nuevo).
        </div>
      )}
      {mensaje && (
        <div className={`rounded border px-3 py-2 ${mensaje.error ? 'border-[#e3a1a1] bg-[#fdecec] text-[#b00020]' : 'border-[#9fd0a8] bg-[#eaf7ec] text-[#1b5e20]'}`}>
          {mensaje.texto}
        </div>
      )}

      <h3 className="text-[15px] font-bold text-[#1d3a8a]">Rutas que se generan en el ERP</h3>
      {!enErp.length && <div className="text-[#555]">Ninguna todavía. Compara primero una ruta de las de abajo y, cuando cuadre, pulsa «Pasar al ERP».</div>}
      {enErp.map((r) => (
        <TarjetaRuta key={`${r.ruta}-${version}-${corte ?? ''}`} r={r} panel={panel} onHecho={(t, err) => (aviso(t, err), void cargar(fecha))} />
      ))}

      <h3 className="mt-2 text-[15px] font-bold text-[#555]">Rutas que siguen en GeminisWin (solo comparar)</h3>
      {enGw.map((r) => (
        <TarjetaRuta key={`${r.ruta}-${version}-${corte ?? ''}`} r={r} panel={panel} onHecho={(t, err) => (aviso(t, err), void cargar(fecha))} />
      ))}
    </div>
  )
}

function TarjetaRuta({ r, panel, onHecho }: { r: Ruta; panel: Panel; onHecho: (texto: string, error?: boolean) => void }) {
  const libres = useMemo(() => r.propuesta.filter((p) => r.erp ? !p.en_gw : true), [r])
  const [marcadas, setMarcadas] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(r.propuesta.filter((p) => p.principal && (!r.erp || !p.en_gw)).map((p) => [clave(p.vt, p.vn), true])),
  )
  const [repartidor, setRepartidor] = useState(r.repartidor ?? '')
  const [abierta, setAbierta] = useState(r.erp && r.propuesta.length > 0)
  const [comparar, setComparar] = useState(false)
  const [ocupado, setOcupado] = useState(false)

  const elegidas = libres.filter((p) => marcadas[clave(p.vt, p.vn)])
  const enGw = new Set((r.gw?.ventas ?? []).map(([vt, vn]) => clave(vt, vn)))
  // Lo vendido después de la última venta que lleva el reparto de GeminisWin no pudo entrar en él: no es diferencia.
  const despues = (p: Propuesta) => !!r.gw?.hasta && !enGw.has(clave(p.vt, p.vn)) && `${p.fecha} ${p.hora ?? ''}` > r.gw.hasta
  const tarde = elegidas.filter(despues).length
  const aComparar = elegidas.filter((p) => !despues(p))
  const enErpSet = new Set(elegidas.map((p) => clave(p.vt, p.vn)))
  const soloGw = [...enGw].filter((k) => !enErpSet.has(k))
  const ambos = aComparar.filter((p) => enGw.has(clave(p.vt, p.vn))).length
  const nombreRuta = `RUTA ${/^\d+$/.test(r.ruta) ? Number(r.ruta) : r.ruta} · ${r.nombre}`

  const rpc = async (fn: string, args: Record<string, unknown>) => {
    setOcupado(true)
    const { data, error } = await supabase.rpc(fn, args)
    setOcupado(false)
    if (error) {
      onHecho(error.message, true)
      return null
    }
    return data as Record<string, unknown>
  }

  const generar = async () => {
    if (!repartidor) return onHecho(`Elige el repartidor de la ${nombreRuta}.`, true)
    if (!elegidas.length && !r.anteriores) return onHecho(`Marca al menos una venta de la ${nombreRuta}.`, true)
    const d = await rpc('fn_reparto_erp_generar', {
      p_ruta: r.ruta,
      p_fecha: panel.fecha,
      p_repartidor: repartidor,
      p_ventas: elegidas.map((p) => ({ vt: p.vt, vn: p.vn })),
    })
    if (!d) return
    const saltadas = (d.saltadas as { vt: string; vn: number; motivo: string }[]) ?? []
    const cerrados = (d.cerrados as string[]) ?? []
    onHecho(
      `${nombreRuta}: reparto ${d.tienda}-${d.numero} del ${fechaLarga(String(d.fecha))} con ${d.nuevas} venta(s) nueva(s).` +
        (cerrados.length ? ` Cerrado el anterior (${cerrados.join(', ')}).` : '') +
        (saltadas.length ? ` No se metieron ${saltadas.length}: ${saltadas.map((s) => `${s.vt}/${s.vn} (${s.motivo})`).join('; ')}.` : ''),
    )
  }
  const pasar = async (erp: boolean) => {
    if (erp && !window.confirm(`¿Pasar la ${nombreRuta} al ERP?\n\nDesde ahora sus repartos se generan aquí y NO hay que generarlos en GeminisWin. Avisa a la oficina.`)) return
    if (!erp && !window.confirm(`¿Devolver la ${nombreRuta} a GeminisWin? Sus repartos se volverán a generar allí.`)) return
    const d = await rpc('fn_reparto_erp_ruta', { p_ruta: r.ruta, p_erp: erp })
    if (d) onHecho(erp ? `${nombreRuta} pasa al ERP: genera aquí su reparto y deja de generarlo en GeminisWin.` : `${nombreRuta} vuelve a GeminisWin.`)
  }
  const cerrar = async () => {
    if (!r.abierto || !window.confirm(`¿Cerrar el reparto ${r.abierto.tienda}-${r.abierto.numero}? Lo que siga sin marcar pasa a «no entregado» y volverá a salir en la propuesta.`)) return
    const d = await rpc('fn_reparto_erp_cerrar', { p_tienda: r.abierto.tienda, p_numero: r.abierto.numero })
    if (d) onHecho(`Reparto ${r.abierto.tienda}-${r.abierto.numero} cerrado${Number(d.sin_marcar) ? `: ${d.sin_marcar} sin marcar pasan a no entregado` : ''}.`)
  }

  return (
    <div className={`rounded border ${r.erp ? 'border-[#2e7d32]' : 'border-[#c9d3e6]'} bg-white`}>
      <div className="flex flex-wrap items-center gap-2 px-3 py-2">
        <button type="button" className="font-bold text-[14px] text-[#1d3a8a]" onClick={() => setAbierta(!abierta)}>
          {abierta ? '▾' : '▸'} {nombreRuta}
        </button>
        <span className={`rounded px-2 py-[1px] text-[12px] font-bold ${r.erp ? 'bg-[#e6f4e6] text-[#2e7d32]' : 'bg-[#eee] text-[#555]'}`}>
          {r.erp ? 'En el ERP' : 'En GeminisWin'}
        </span>
        <span className="text-[#444]">
          {r.propuesta.length} propuesta(s){r.propuesta.some((p) => p.viene) ? `, ${r.propuesta.filter((p) => p.viene).length} del anterior` : ''}
        </span>
        {r.abierto && (
          <span className="text-[#2e7d32]">
            · Ya generado: <b>{r.abierto.tienda}-{r.abierto.numero}</b> con {r.abierto.lineas} pedido(s)
          </span>
        )}
        {r.erp && r.anteriores > 0 && <span className="text-[#b26a00]">· Al generar se cierra el reparto anterior</span>}
        {!r.erp && r.gw && (
          <span className="text-[#444]">
            · En GeminisWin: {r.gw.tienda}-{r.gw.numero} con {r.gw.ventas.length}
          </span>
        )}
        <span className="ml-auto flex gap-2">
          {r.erp ? (
            <button type="button" className="gw-btn" disabled={ocupado} onClick={() => void pasar(false)}>
              Devolver a GeminisWin
            </button>
          ) : (
            <>
              {r.gw && (
                <button type="button" className="gw-btn font-bold" onClick={() => (setAbierta(true), setComparar(true))}>
                  Comparar con GeminisWin
                </button>
              )}
              <button type="button" className="gw-btn" disabled={ocupado} onClick={() => void pasar(true)}>
                Pasar al ERP
              </button>
            </>
          )}
        </span>
      </div>

      {abierta && (
        <div className="border-t border-[#e3e8f2] px-3 py-2">
          <div className="mb-2 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2">
              Repartidor
              <select className="gw-input" value={repartidor} onChange={(e) => setRepartidor(e.target.value)}>
                <option value="">— elige —</option>
                {panel.repartidores.map((d) => (
                  <option key={d.codigo} value={d.codigo}>
                    {d.nombre}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className="gw-btn" onClick={() => setMarcadas(Object.fromEntries(libres.map((p) => [clave(p.vt, p.vn), true])))}>
              Marcar todas
            </button>
            <button type="button" className="gw-btn" onClick={() => setMarcadas({})}>
              Desmarcar
            </button>
            <span>
              Marcadas <b>{elegidas.length}</b> · {euros(elegidas.reduce((s, p) => s + (p.total ?? 0), 0))}
            </span>
            <span className="ml-auto flex gap-2">
              {r.gw && (
                <button type="button" className="gw-btn" onClick={() => setComparar(!comparar)}>
                  {comparar ? 'Quitar comparación' : 'Comparar con GeminisWin'}
                </button>
              )}
              {r.erp && r.abierto && (
                <button type="button" className="gw-btn" disabled={ocupado} onClick={() => void cerrar()}>
                  Cerrar reparto
                </button>
              )}
              {r.erp && (
                <button type="button" className="gw-btn font-bold" disabled={ocupado} onClick={() => void generar()}>
                  {r.abierto ? `Añadir al reparto (${elegidas.length})` : `Generar reparto (${elegidas.length})`}
                </button>
              )}
            </span>
          </div>

          {comparar && r.gw && (
            <div className="mb-2 rounded border border-[#c9d3e6] bg-[#f4f7fc] px-3 py-2">
              Reparto de GeminisWin {r.gw.tienda}-{r.gw.numero}: <b>{r.gw.ventas.length}</b> venta(s). Marcadas aquí: <b>{aComparar.length}</b>. En los dos: <b>{ambos}</b>.{' '}
              {aComparar.length - ambos > 0 && <span className="text-[#b26a00]">Solo en el ERP: {aComparar.length - ambos}. </span>}
              {soloGw.length > 0 && <span className="text-[#b00020]">Solo en GeminisWin: {soloGw.length} ({soloGw.slice(0, 30).join(', ')}{soloGw.length > 30 ? '…' : ''}).</span>}
              {aComparar.length === ambos && !soloGw.length && <b className="text-[#2e7d32]"> Cuadra.</b>}
              {tarde > 0 && r.gw.hasta && (
                <div className="text-[#555]">
                  {tarde} venta(s) hechas después de generar el de GeminisWin (lleva hasta el {fechaCorta(r.gw.hasta.slice(0, 10))} {r.gw.hasta.slice(11)}): no pudieron entrar y no cuentan.
                </div>
              )}
            </div>
          )}

          {!r.propuesta.length ? (
            <div className="text-[#555]">No hay ventas pendientes de repartir en esta ruta.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="gw-grid w-full text-[13px]">
                <thead>
                  <tr>
                    <th />
                    <th className="text-left">Cliente</th>
                    <th className="text-left">Población</th>
                    <th className="text-left">Documento</th>
                    <th className="text-left">Fecha</th>
                    <th className="text-right">Importe</th>
                    <th className="text-left">Forma de pago</th>
                    <th className="text-left">Nota</th>
                    {comparar && <th className="text-left">GeminisWin</th>}
                  </tr>
                </thead>
                <tbody>
                  {r.propuesta.map((p) => {
                    const k = clave(p.vt, p.vn)
                    const bloqueada = r.erp && !!p.en_gw
                    const notas = [
                      p.viene ? `Viene del anterior${p.antes ? ` (${p.antes.replace(/^Anterior: /, '')})` : ''}` : null,
                      !p.principal && !p.viene ? `Tienda ${p.vt}: ¿va en reparto?` : null,
                      p.de_ruta === 'venta' ? 'Ruta puesta en la venta' : null,
                      bloqueada ? `Ya en el reparto ${p.en_gw} de GeminisWin` : null,
                    ].filter(Boolean)
                    return (
                      <tr key={k} className={bloqueada ? 'opacity-50' : p.viene ? 'bg-[#fff6e5]' : ''}>
                        <td className="text-center">
                          <input
                            type="checkbox"
                            disabled={bloqueada}
                            checked={!!marcadas[k] && !bloqueada}
                            onChange={(e) => setMarcadas((m) => ({ ...m, [k]: e.target.checked }))}
                          />
                        </td>
                        <td>
                          {p.cliente}
                          {p.cliente_codigo ? <span className="text-[#888]"> · {p.cliente_codigo}</span> : null}
                        </td>
                        <td>{p.poblacion}</td>
                        <td className="whitespace-nowrap">{doc(p)}</td>
                        <td className="whitespace-nowrap">
                          {fechaCorta(p.fecha)}
                          {p.hora ? ` ${p.hora}` : ''}
                        </td>
                        <td className="whitespace-nowrap text-right">{euros(p.total)}</td>
                        <td>{p.forma_pago}</td>
                        <td>{notas.join(' · ')}</td>
                        {comparar && (
                          <td className={enGw.has(k) ? 'text-[#2e7d32]' : despues(p) ? 'text-[#888]' : 'text-[#b26a00]'}>
                            {enGw.has(k) ? 'También' : despues(p) ? 'Hecha después' : 'No'}
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Operativa() {
  return (
    <GwOperativa
      bloques={[
        {
          titulo: 'Para qué sirve',
          notas: [
            'Para generar y cerrar los repartos en el ERP en lugar de en GeminisWin. Las ventas, las facturas y los cobros siguen en GeminisWin: de allí se leen solas cada 5 minutos.',
            'Se abre desde Ventas → Control de Repartos, con el botón «Generar repartos» de arriba. Allí mismo, en cada ruta, se cierra el reparto del día.',
            'Se hace ruta a ruta. Las rutas «En GeminisWin» se siguen generando allí como siempre; aquí solo se comparan.',
          ],
        },
        {
          titulo: 'Generar el reparto de mañana',
          pasos: [
            'Arriba sale el día siguiente de reparto (el viernes, el lunes). Cámbialo si hace falta.',
            '«Ventas hasta»: solo salen las ventas hechas hasta esa hora (normalmente las 15:00 de hoy, o del día anterior si el reparto es de hoy). Las que vienen del reparto anterior salen siempre. Si cambias la hora, se recuerda la próxima vez.',
            'En cada ruta «En el ERP» aparecen las ventas de sus clientes que todavía no han ido en ningún reparto, y en naranja las que no se entregaron en el anterior.',
            'Solo salen las ventas que en GeminisWin tienen marcado que van a reparto (y las que vienen del anterior). Repasa las marcas: las de otras tiendas salen sin marcar, porque a veces el cliente se lo lleva en mano.',
            'Comprueba el repartidor (sale el de la última vez) y pulsa «Generar reparto».',
            'Al momento le sale al repartidor en la app. Si después entran más ventas, vuelve a pulsar: se añaden al mismo reparto («Añadir al reparto»).',
          ],
          notas: [
            'Al generar se cierra solo el reparto anterior de esa ruta: lo que no se marcó en la app pasa a «no entregado» y vuelve a salir en la propuesta.',
            '«Cerrar reparto» (aquí o en la fila de la ruta en Control de Repartos) lo cierra sin generar el siguiente (por ejemplo, el último día antes de fiestas).',
            'Las rutas que siguen en GeminisWin se cierran en GeminisWin: en Control de Repartos ponen «Se cierra en GeminisWin».',
            'La ruta de cada venta es la de la venta si se puso al hacerla; si no, la de la sucursal del cliente o la de su ficha. Si una venta sale en una ruta que no es, corrige la ruta en la ficha del cliente en GeminisWin.',
          ],
        },
        {
          titulo: 'Probar una ruta antes de pasarla al ERP',
          pasos: [
            'Genera el reparto de esa ruta en GeminisWin como siempre.',
            'Aquí, pulsa «Comparar con GeminisWin» en la fila de la ruta (sale cuando ya ha llegado su reparto de GeminisWin): dice cuántas ventas están en los dos, cuáles solo en el ERP y cuáles solo en GeminisWin. No genera nada.',
            'Las ventas hechas después de generar el reparto de GeminisWin salen como «Hecha después» y no cuentan como diferencia.',
            'Cuando cuadre varios días seguidos, pulsa «Pasar al ERP». Desde entonces esa ruta NO se genera en GeminisWin.',
          ],
          notas: [
            'Si una ruta pasada al ERP tiene ventas metidas en un reparto de GeminisWin, salen apagadas: alguien lo generó allí. Avisa para no repartirlas dos veces.',
            '«Devolver a GeminisWin» deshace el cambio (antes hay que cerrar el reparto abierto del ERP).',
          ],
        },
      ]}
    />
  )
}
