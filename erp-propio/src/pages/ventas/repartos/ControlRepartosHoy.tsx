// Control de Repartos · «Repartos de hoy» (Rober, 03/11/2026): va arriba de la ficha de Repartos, en la misma ventana
// (antes era una pantalla aparte, «Seguimiento de Repartos»). Con el estilo del ERP.
//  · Una fila por ruta abierta hoy, en vivo (cada 20 s) con lo que marca el repartidor en la app (/repartidor):
//    un punto por pedido en su color, cuántos quedan y cuándo se le vio por última vez.
//  · Pulsando el nombre de una ruta se abre debajo la ficha de su reparto; pulsando su barra de puntos, la lista de
//    pedidos como en la app (lo mismo que «▾ Pedidos»).
//  · Cierre (19/11/2026, «todo en Control de Repartos»): en las rutas pasadas al ERP, «Cerrar reparto» usa el cierre
//    del ERP (fn_reparto_erp_cerrar: lo sin marcar pasa a «no entregado» y vuelve a la propuesta del día siguiente).
//    Las rutas de GeminisWin ponen «Se cierra en GeminisWin» (allí no se pueden cerrar: lo impide fn_reparto_gw_guarda).
//  · «Generar repartos»: abre aquí mismo la propuesta de cada ruta y «Comparar con GeminisWin» (GenerarRepartosPage).
//  · «▾ Pedidos» (David, 19/11/2026): despliega los pedidos de la ruta como en la vista de oficina de la app, con la
//    marca de comprobado para revisar y separar albaranes y facturas. Al pasar el ratón por cada puntito sale ese
//    pedido (fn_reparto_control_lineas, mismo orden que los puntos; fn_reparto_control_comprobar).
//    «⇄ Cambiar de ruta» en cada pedido sin entregar: lo pasa a otro reparto abierto, con motivo (fn_reparto_cambiar_ruta,
//    queda anotado en reparto_cambio_ruta).
//  · «💶 Por cobrar» (19/11/2026): el mismo cuadro que la oficina ve en la app (facturas entregadas con importe
//    pendiente: contado, transferencias, remesas) y los abonos recogidos que el almacén aún no ha validado, con el
//    botón «Validar» (fn_reparto_control_por_cobrar, fn_reparto_abono_validar; apartados en reparto-app/porCobrar.ts).
//  · NULOS e incidencias por ruta (19/11/2026): «⊘ Anular (Nulo)» en cada pedido del desplegable lo saca del reparto
//    (fn_reparto_linea_nulo); y arriba del desplegable de cada ruta salen sus incidencias: facturas por cobrar, abonos
//    y nulos por validar en almacén, con «Validar» (fn_reparto_abono_validar / fn_reparto_nulo_validar). Lo de rutas
//    que hoy no tienen reparto sale en «Todas las incidencias».
//  · Mapa, PIN de la app de cada repartidor y enlace para la TV.
// Sin ranking ni totales: eso es solo para la TV (/reparto-tv). Datos: migración 20261103_reparto_app.sql.

import { Fragment, useCallback, useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import QRCode from 'qrcode'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'
import { GwWindow } from '../../../components/gw'
import { BarraPuntos, VistaMapa, type DatosSeg, type RutaSeg } from '../../../reparto-app/PanelReparto'
import { GenerarRepartosPage } from './GenerarRepartosPage'
import type { PorCobrar } from '../../../reparto-app/api'
import { GRUPO_ABONOS, GRUPO_NULOS, gruposPorCobrar, listaPorCobrar, sumaPorCobrar } from '../../../reparto-app/porCobrar'

interface LineaCtl {
  vt: string
  vn: number
  estado: 'entregado' | 'liquidado' | 'incidencia' | 'no_entregado' | 'pendiente'
  cliente: string
  poblacion: string | null
  factura: string | number | null
  total: number | null
  pagado: number | null
  contado: boolean | null
  forma_pago: string | null
  incidencia: string | null
  motivo: string | null
  no_cobro: string | null
  medio: 'efectivo' | 'tarjeta' | null
  nota: string | null
  hora: string | null
  comprobado: boolean
}
const eur = (n: number | null) => (n == null ? '' : `${Number(n).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`)
const docDe = (l: LineaCtl) => (l.factura ? `Factura ${l.factura}` : `Albarán ${l.vt}/${l.vn}`)
const ESTADO_TXT: Record<LineaCtl['estado'], string> = {
  entregado: 'Entregado',
  liquidado: 'Entregado y liquidado',
  incidencia: 'Entregado con incidencia',
  no_entregado: 'No entregado',
  pendiente: 'Por entregar',
}
const ESTADO_COLOR: Record<LineaCtl['estado'], string> = {
  entregado: '#2e7d32',
  liquidado: '#2e7d32',
  incidencia: '#a86400',
  no_entregado: '#c62828',
  pendiente: '#666',
}
/** Cobro: lo cobrado en el reparto (efectivo/tarjeta) o lo que queda por cobrar. */
const cobro = (l: LineaCtl) => {
  const total = Number(l.total ?? 0)
  const pagado = Number(l.pagado ?? 0)
  if (l.medio) return `Cobrado · ${l.medio === 'tarjeta' ? '💳 tarjeta' : '💶 efectivo'}`
  if (l.no_cobro) return `Sin cobrar: ${l.no_cobro}`
  if (total > 0 && pagado >= total) return 'Pagada'
  if (l.contado && total > 0) return `Cobrar ${eur(total - pagado)}`
  return ''
}
const resumen = (l: LineaCtl) =>
  [
    `${l.cliente} · ${eur(l.total)}`,
    [docDe(l), l.poblacion].filter(Boolean).join(' · '),
    [l.forma_pago, cobro(l)].filter(Boolean).join(' · '),
    `${ESTADO_TXT[l.estado]}${l.hora ? ` · ${l.hora}` : ''}`,
    l.incidencia ? `Incidencia: ${l.incidencia}` : '',
    l.motivo ? `Motivo: ${l.motivo}` : '',
    l.nota ? `Nota: ${l.nota}` : '',
    l.comprobado ? '✓ Comprobado' : '',
  ]
    .filter(Boolean)
    .join('\n')

// La ruta desplegada sobrevive a que la ficha de abajo recargue la pantalla (al abrir otro reparto se vuelve a montar).
let ultimaDesplegada: string | null = null

const hace = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  return m < 1 ? 'ahora' : m < 60 ? `hace ${m} min` : `hace ${Math.floor(m / 60)} h`
}

export function ControlRepartosHoy({
  actual,
  bloqueado,
  onAbrir,
}: {
  actual: { tienda_terminal_codigo: string; numero: number } | null
  bloqueado: boolean
  onAbrir: (tienda: string, numero: number) => void
}) {
  const [datos, setDatos] = useState<DatosSeg | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [plegado, setPlegado] = useState(() => {
    try {
      return localStorage.getItem('erp.repartos.controlPlegado') === '1'
    } catch {
      return false
    }
  })
  const [mapa, setMapa] = useState(false)
  const [pines, setPines] = useState(false)
  const [tv, setTv] = useState(false)
  const [lineas, setLineas] = useState<Record<string, LineaCtl[]>>({})
  const [cobros, setCobros] = useState<PorCobrar[] | null>(null)
  const [verCobros, setVerCobros] = useState(false)
  const [desplegada, setDesplegadaEstado] = useState<string | null>(() => ultimaDesplegada)
  const [resaltado, setResaltado] = useState<string | null>(null)
  const setDesplegada = (k: string | null) => {
    ultimaDesplegada = k
    setDesplegadaEstado(k)
  }
  const [params, setParams] = useSearchParams()
  const generar = params.get('generar') === '1'
  const verGenerar = (v: boolean) =>
    setParams(
      (p) => {
        const n = new URLSearchParams(p)
        if (v) n.set('generar', '1')
        else n.delete('generar')
        return n
      },
      { replace: true },
    )

  const cargar = useCallback(async () => {
    const { data, error: e } = await supabase.rpc('fn_reparto_seguimiento', {})
    if (e) return setError(e.message)
    setError(null)
    setDatos(data as DatosSeg)
    const [l, c] = await Promise.all([supabase.rpc('fn_reparto_control_lineas', {}), supabase.rpc('fn_reparto_control_por_cobrar', {})])
    if (!l.error) setLineas((l.data ?? {}) as Record<string, LineaCtl[]>)
    if (!c.error) setCobros((c.data ?? []) as PorCobrar[])
  }, [])

  const comprobar = async (r: RutaSeg, l: LineaCtl) => {
    const k = `${r.tienda}-${r.numero}`
    setLineas((m) => ({ ...m, [k]: (m[k] ?? []).map((x) => (x.vt === l.vt && x.vn === l.vn ? { ...x, comprobado: !l.comprobado } : x)) }))
    const { error: e } = await supabase.rpc('fn_reparto_control_comprobar', { p_tienda: r.tienda, p_numero: r.numero, p_vt: l.vt, p_vn: l.vn, p_ok: !l.comprobado })
    if (e) setMensaje(e.message)
    void cargar()
  }

  const validar = async (c: PorCobrar) => {
    const que = c.nulo ? 'el nulo' : 'el abono'
    if (!confirm(`¿Validar ${que} de ${c.cliente} (${eur(c.total)})? Confirma que la mercancía ha llegado al almacén y está bien.`)) return
    const { error: e } = await supabase.rpc(c.nulo ? 'fn_reparto_nulo_validar' : 'fn_reparto_abono_validar', { p_tienda: c.rt, p_numero: c.rn, p_vt: c.vt, p_vn: c.vn, p_ok: true })
    setMensaje(e ? e.message : `${c.nulo ? 'Nulo' : 'Abono'} de ${c.cliente} validado.`)
    void cargar()
  }

  const anular = async (r: RutaSeg, l: LineaCtl) => {
    const motivo = prompt(
      `Pasar a NULO: ${l.cliente} (${docDe(l)}, ${eur(l.total)}).\n\nSale del reparto y queda en las incidencias de la ruta hasta que valides que la mercancía ha vuelto al almacén. Recuerda anularla también en GeminisWin.\n\n¿Por qué se anula?`,
    )
    if (motivo == null) return
    if (!motivo.trim()) return setMensaje('Para anular hay que poner el motivo.')
    const { error: e } = await supabase.rpc('fn_reparto_linea_nulo', { p_tienda: r.tienda, p_numero: r.numero, p_vt: l.vt, p_vn: l.vn, p_motivo: motivo.trim(), p_ok: true })
    setMensaje(e ? e.message : `${l.cliente} (${docDe(l)}) pasa a NULO y sale del reparto de ${r.ruta_nombre}. Queda en sus incidencias hasta validarlo. Anúlala también en GeminisWin.`)
    void cargar()
  }

  const cambiarRuta = async (r: RutaSeg, l: LineaCtl, dest: RutaSeg, motivo: string) => {
    const { error: e } = await supabase.rpc('fn_reparto_cambiar_ruta', {
      p_tienda: r.tienda,
      p_numero: r.numero,
      p_vt: l.vt,
      p_vn: l.vn,
      p_dest_tienda: dest.tienda,
      p_dest_numero: dest.numero,
      p_motivo: motivo,
    })
    if (e) return e.message
    setMensaje(`${l.cliente} (${docDe(l)}) pasa de ${r.ruta_nombre} a ${dest.ruta_nombre}.`)
    void cargar()
    return null
  }
  useEffect(() => {
    const primera = setTimeout(() => void cargar(), 0)
    const t = setInterval(() => void cargar(), 20_000)
    return () => {
      clearTimeout(primera)
      clearInterval(t)
    }
  }, [cargar])

  const plegar = (v: boolean) => {
    setPlegado(v)
    try {
      localStorage.setItem('erp.repartos.controlPlegado', v ? '1' : '0')
    } catch {
      /* sin almacenamiento */
    }
  }

  const cerrar = async (r: RutaSeg) => {
    const texto = r.pendientes
      ? `Quedan ${r.pendientes} pedido(s) sin marcar en ${r.ruta_nombre}. Si cierras, pasan a «no entregado» y vuelven a salir en la propuesta del día siguiente. ¿Cerrar?`
      : `¿Cerrar el reparto de ${r.ruta_nombre}? Lo no entregado vuelve a salir en la propuesta del día siguiente.`
    if (!confirm(texto)) return
    const { data, error: e } = await supabase.rpc('fn_reparto_erp_cerrar', { p_tienda: r.tienda, p_numero: r.numero })
    if (e) return setMensaje(e.message)
    const x = data as { sin_marcar: number }
    setMensaje(`Reparto de ${r.ruta_nombre} cerrado${x.sin_marcar ? `: ${x.sin_marcar} sin marcar pasan a «no entregado» y vuelven a la propuesta` : ''}.`)
    void cargar()
  }

  const rutas = datos?.rutas ?? []
  const quedan = rutas.filter((r) => r.estado === 2).reduce((s, r) => s + r.pendientes, 0)

  return (
    <div className="border border-[var(--gw-border)] bg-[var(--gw-face)] text-[13px]">
      <div className="flex flex-wrap items-center gap-1.5 border-b border-[var(--gw-border-light)] px-1.5 py-1">
        <button type="button" className="gw-btn h-[24px] font-bold" onClick={() => plegar(!plegado)} title={plegado ? 'Ver las rutas de hoy' : 'Plegar'}>
          {plegado ? '▸' : '▾'} Repartos de hoy
        </button>
        <span className="text-[#333]">
          {rutas.length} ruta(s) · <b>{quedan}</b> pedido(s) por entregar
        </span>
        <span className="flex-1" />
        <button
          type="button"
          className={`gw-btn h-[24px] font-bold ${generar ? 'bg-[#91c9f7]' : ''}`}
          title="Propuesta de reparto de cada ruta: generar y cerrar las del ERP y comparar las de GeminisWin"
          onClick={() => verGenerar(!generar)}
        >
          ➕ Generar repartos
        </button>
        <button
          type="button"
          className={`gw-btn h-[24px] ${verCobros ? 'bg-[#91c9f7] font-bold' : ''}`}
          title="Facturas entregadas con importe pendiente (contado, transferencias, remesas) y abonos por validar en almacén"
          onClick={() => (setVerCobros(!verCobros), plegar(false))}
        >
          💶 Todas las incidencias
          {cobros && (() => {
            const ab = cobros.filter((x) => x.abono || x.nulo).length
            return ab ? <b className="ml-1 text-[#c42b1c]">· {ab} por validar</b> : null
          })()}
        </button>
        <button type="button" className={`gw-btn h-[24px] ${mapa ? 'bg-[#91c9f7] font-bold' : ''}`} onClick={() => (setMapa(!mapa), plegar(false))}>
          🗺 Mapa
        </button>
        <button type="button" className="gw-btn h-[24px]" onClick={() => setPines(true)}>
          PIN de la app
        </button>
        <button
          type="button"
          className="gw-btn h-[24px]"
          title="Abre aquí mismo la pantalla grande de repartos (rutas, mapa y ranking), sin crear ningún enlace"
          onClick={() => window.open(`${import.meta.env.BASE_URL}reparto-pantalla`, '_blank')}
        >
          🖥️ Ver la pantalla
        </button>
        <button type="button" className="gw-btn h-[24px]" title="Crea el enlace para ponerla en una TV que no tiene usuario del ERP" onClick={() => setTv(true)}>
          📺 Enlace para la TV
        </button>
      </div>
      {!plegado && (
        <div className="flex flex-col gap-1 p-1.5">
          {error && <div className="font-bold text-[#c42b1c]">{error}</div>}
          {mensaje && (
            <div className="flex items-center justify-between border border-[var(--gw-border)] bg-white px-2 py-0.5 text-[#1a4fd0]">
              {mensaje}
              <button type="button" className="gw-btn h-[20px]" onClick={() => setMensaje(null)}>
                ✕
              </button>
            </div>
          )}
          {verCobros && (
            <CuadroPorCobrar titulo="TODAS LAS INCIDENCIAS (todas las rutas)" cobros={cobros} onValidar={(c) => void validar(c)} />
          )}
          {mapa && (
            <div className="h-[340px] border border-[var(--gw-border)]">
              <VistaMapa rutas={rutas} tv={false} />
            </div>
          )}
          {!datos && !error && <div>Cargando…</div>}
          {datos && !rutas.length && <div>No hay repartos hoy.</div>}
          {!!rutas.length && (
            <table className="w-full table-fixed border-collapse bg-white">
              <tbody>
                {rutas.map((r) => {
                  const esActual = actual?.tienda_terminal_codigo === r.tienda && actual.numero === r.numero
                  const cerrado = r.estado !== 2
                  const k = `${r.tienda}-${r.numero}`
                  const ls = lineas[k]
                  const abierta = desplegada === k
                  const inc = cobros ? listaPorCobrar(cobros.filter((c) => c.ruta === r.ruta)) : []
                  const porValidar = inc.filter((c) => c.abono || c.nulo).length
                  return (
                    <Fragment key={k}>
                    <tr
                      onClick={() => !bloqueado && onAbrir(r.tienda, r.numero)}
                      title={bloqueado ? 'Termina de editar el reparto de abajo para abrir otro' : 'Abrir aquí debajo la ficha de este reparto'}
                      className={`cursor-pointer ${esActual ? 'bg-[#cce4f7]' : 'hover:bg-[#e5f1fb]'} ${cerrado ? 'text-[#888]' : ''}`}
                    >
                      <td className="w-[230px] border-b border-[var(--gw-border-light)] px-1.5 py-1">
                        <div className="font-bold text-[#1d3a8a]">
                          {esActual ? '▸ ' : ''}
                          {r.ruta_nombre ?? 'Sin ruta'} · nº {r.numero}
                        </div>
                        <div className="text-[12px] text-[#555]">
                          🚚 {r.repartidor_nombre ?? 'sin repartidor'}
                          {r.posicion && ` · 📍 ${hace(r.posicion.en)}`}
                        </div>
                      </td>
                      <td
                        className="cursor-pointer border-b border-[var(--gw-border-light)] px-1.5"
                        title="Pincha para ver o esconder los pedidos de esta ruta (como en la app)"
                        onClick={(e) => {
                          e.stopPropagation()
                          setDesplegada(abierta ? null : k)
                          setResaltado(null)
                        }}
                      >
                        <div className="flex overflow-hidden">
                          {/* Horas encima solo si caben: con muchos pedidos la barra se salía de la pantalla. */}
                          <BarraPuntos
                            r={r}
                            alto={22}
                            horas={(r.pedidos?.length ?? 0) <= 16}
                            detalle={ls && ls.length === (r.pedidos?.length ?? -1) ? (i) => (ls[i] ? resumen(ls[i]) : undefined) : undefined}
                            onPunto={(i) => {
                              setDesplegada(k)
                              const l = ls && ls.length === (r.pedidos?.length ?? -1) ? ls[i] : undefined
                              setResaltado(l ? `${l.vt}/${l.vn}` : null)
                            }}
                          />
                        </div>
                      </td>
                      <td className="w-[170px] border-b border-[var(--gw-border-light)] px-1.5 text-right">
                        <div className="font-bold">{cerrado ? 'Cerrado' : !r.total ? 'Sin pedidos' : r.pendientes ? `${r.pendientes} quedan` : '✔ Hecho'}</div>
                        <div className="text-[11px] text-[#555]">
                          {r.entregados + r.incidencias}/{r.total} entregados
                          {r.incidencias ? ` · ${r.incidencias} incid.` : ''}
                          {r.no_entregados ? ` · ${r.no_entregados} no` : ''}
                        </div>
                      </td>
                      <td className="w-[275px] whitespace-nowrap border-b border-[var(--gw-border-light)] px-1.5 text-right">
                        <button
                          type="button"
                          className={`gw-btn mr-1 h-[24px] whitespace-nowrap ${abierta ? 'bg-[#91c9f7] font-bold' : ''}`}
                          title="Ver aquí los pedidos de la ruta, como en la vista de oficina, para revisarlos y separarlos"
                          onClick={(e) => {
                            e.stopPropagation()
                            setDesplegada(abierta ? null : k)
                          }}
                        >
                          {abierta ? '▴' : '▾'} Pedidos{ls ? ` (${ls.filter((x) => x.comprobado).length}/${ls.length} ✓)` : ''}
                          {porValidar > 0 && <b className="ml-1 text-[#c42b1c]">⚠{porValidar}</b>}
                        </button>
                        {!cerrado && !r.generado_erp && (
                          <span className="inline-block w-[64px] whitespace-normal text-center align-middle text-[10px] leading-tight text-[#666]" title="Esta ruta se lleva en GeminisWin: el reparto se cierra allí y aquí se actualiza solo">
                            Se cierra en GeminisWin
                          </span>
                        )}
                        {!cerrado && r.generado_erp && (
                          <button
                            type="button"
                            className="gw-btn h-[24px] whitespace-nowrap font-bold"
                            onClick={(e) => {
                              e.stopPropagation()
                              void cerrar(r)
                            }}
                          >
                            Cerrar reparto
                          </button>
                        )}
                      </td>
                    </tr>
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          )}
          <div className="flex flex-wrap gap-3 text-[11px] text-[#333]">
            <Leyenda color="#3DAF3D">Entregado</Leyenda>
            <Leyenda color="#F5A623">Con incidencia</Leyenda>
            <Leyenda color="#C62828">No entregado</Leyenda>
            <Leyenda color="#b9c4b9">Por entregar</Leyenda>
            <Leyenda color="#1E6FD9">Contado por cobrar</Leyenda>
            <span>· Se actualiza solo cada 20 s.</span>
          </div>
        </div>
      )}
      {pines && <DialogoPines onCerrar={() => setPines(false)} />}
      {/* Pedidos de la ruta en su propia ventana, encima de todo (19/11/2026): desplegados dentro de la tabla no se le
          veían a Rober. Va con portal a <body> para que nada de la pantalla de abajo la tape ni la recorte. */}
      {desplegada &&
        (() => {
          const r = rutas.find((x) => `${x.tienda}-${x.numero}` === desplegada)
          if (!r) return null
          const k = desplegada
          const ls = lineas[k]
          const cerrado = r.estado !== 2
          const inc = cobros ? listaPorCobrar(cobros.filter((c) => c.ruta === r.ruta)) : []
          return createPortal(
            <div
              className="fixed inset-0 z-[400] flex items-start justify-center bg-black/30 py-4"
              onClick={() => setDesplegada(null)}
              onKeyDown={(e) => e.key === 'Escape' && setDesplegada(null)}
            >
              <div onClick={(e) => e.stopPropagation()} className="w-[1000px] max-w-[97vw]">
                <GwWindow title={`Pedidos · ${r.ruta_nombre ?? 'Sin ruta'} · nº ${r.numero} · ${r.repartidor_nombre ?? 'sin repartidor'}`} onClose={() => setDesplegada(null)}>
                  <div className="max-h-[85vh] overflow-auto bg-[#f6f8f6] p-1.5 text-[13px]">
                    {mensaje && <div className="mb-1 border border-[var(--gw-border)] bg-white px-2 py-0.5 text-[#1a4fd0]">{mensaje}</div>}
                    {inc.length > 0 && (
                      <div className="mb-1.5">
                        <CuadroPorCobrar titulo={`INCIDENCIAS DE ${(r.ruta_nombre ?? 'LA RUTA').toUpperCase()}`} cobros={inc} onValidar={(c) => void validar(c)} />
                      </div>
                    )}
                    <ListaPedidos
                      lineas={ls}
                      onAnular={(l) => void anular(r, l)}
                      resaltado={resaltado}
                      onComprobar={(l) => void comprobar(r, l)}
                      destinos={cerrado ? [] : rutas.filter((x) => x.estado === 2 && !(x.tienda === r.tienda && x.numero === r.numero))}
                      onCambiarRuta={(l, d, m) => cambiarRuta(r, l, d, m)}
                    />
                  </div>
                </GwWindow>
              </div>
            </div>,
            document.body,
          )
        })()}
      {generar && (
        <div className="fixed inset-0 z-[300] flex items-start justify-center overflow-auto bg-black/25 py-6" onKeyDown={(e) => e.key === 'Escape' && verGenerar(false)}>
          <GwWindow
            title="Generar repartos"
            onClose={() => {
              verGenerar(false)
              void cargar()
            }}
            className="w-[1180px] max-w-[97vw]"
          >
            <GenerarRepartosPage enControl />
          </GwWindow>
        </div>
      )}
      {tv && <DialogoTv onCerrar={() => setTv(false)} />}
    </div>
  )
}

function ListaPedidos({
  lineas,
  resaltado,
  onAnular,
  onComprobar,
  destinos,
  onCambiarRuta,
}: {
  lineas: LineaCtl[] | undefined
  resaltado: string | null
  onAnular: (l: LineaCtl) => void
  onComprobar: (l: LineaCtl) => void
  destinos: RutaSeg[]
  onCambiarRuta: (l: LineaCtl, destino: RutaSeg, motivo: string) => Promise<string | null>
}) {
  const [cambiando, setCambiando] = useState<string | null>(null)
  // Al pinchar un punto de la barra, la lista baja hasta ese pedido.
  useEffect(() => {
    if (!resaltado) return
    document.getElementById(`ctl-ped-${resaltado}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [resaltado])
  if (!lineas) return <div>Cargando…</div>
  if (!lineas.length) return <div>Este reparto no tiene pedidos.</div>
  return (
    <div className="flex flex-col gap-1">
      {lineas.map((l) => (
        <div
          key={`${l.vt}/${l.vn}`}
          id={`ctl-ped-${l.vt}/${l.vn}`}
          className={`flex items-start gap-2 border border-[var(--gw-border-light)] px-2 py-1 ${resaltado === `${l.vt}/${l.vn}` ? 'bg-[#fff6c2]' : 'bg-white'}`}
          style={{ borderLeft: `4px solid ${l.estado === 'pendiente' && l.contado && Number(l.total ?? 0) > Number(l.pagado ?? 0) ? '#1E6FD9' : ESTADO_COLOR[l.estado]}` }}
        >
          <label className="flex cursor-pointer items-center gap-1 pt-0.5 text-[11px] text-[#555]" title="Marcar como comprobado (revisado y separado), igual que en la app">
            <input type="checkbox" checked={l.comprobado} onChange={() => onComprobar(l)} />
          </label>
          <div className="min-w-0 flex-1">
            <div className="flex justify-between gap-2">
              <b className="truncate">{l.cliente}</b>
              <span className="flex items-center gap-2">
                <button type="button" className="gw-btn h-[22px] whitespace-nowrap" title="Anular esta factura o albarán (NULO): sale del reparto y queda en las incidencias de la ruta hasta validarlo" onClick={() => onAnular(l)}>
                  ⊘ Anular (Nulo)
                </button>
                {(l.estado === 'pendiente' || l.estado === 'no_entregado') && destinos.length > 0 && (
                  <button
                    type="button"
                    className={`gw-btn h-[22px] whitespace-nowrap ${cambiando === `${l.vt}/${l.vn}` ? 'bg-[#91c9f7]' : ''}`}
                    title="Pasar este pedido a otra ruta"
                    onClick={() => setCambiando(cambiando === `${l.vt}/${l.vn}` ? null : `${l.vt}/${l.vn}`)}
                  >
                    ⇄ Cambiar de ruta
                  </button>
                )}
                <b className="whitespace-nowrap">{eur(l.total)}</b>
              </span>
            </div>
            <div className="text-[12px] text-[#444]">
              {[l.forma_pago, cobro(l)].filter(Boolean).join(' · ')}
            </div>
            <div className="text-[12px] text-[#555]">{[docDe(l), l.poblacion].filter(Boolean).join(' · ')}</div>
            <div className="text-[12px] font-bold" style={{ color: ESTADO_COLOR[l.estado] }}>
              {ESTADO_TXT[l.estado]}
              {l.hora ? ` · ${l.hora}` : ''}
              {l.incidencia ? ` · ${l.incidencia}` : ''}
              {l.motivo ? ` · ${l.motivo}` : ''}
            </div>
            {l.nota && <div className="text-[12px] italic text-[#555]">Nota: {l.nota}</div>}
            {cambiando === `${l.vt}/${l.vn}` && (
              <CambioRuta destinos={destinos} onCancelar={() => setCambiando(null)} onHacer={async (d, m) => {
                const err = await onCambiarRuta(l, d, m)
                if (!err) setCambiando(null)
                return err
              }} />
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

function CambioRuta({ destinos, onCancelar, onHacer }: { destinos: RutaSeg[]; onCancelar: () => void; onHacer: (d: RutaSeg, motivo: string) => Promise<string | null> }) {
  const [dest, setDest] = useState('')
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const d = destinos.find((x) => `${x.tienda}-${x.numero}` === dest)
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1.5 border-t border-[var(--gw-border-light)] pt-1 text-[12px]">
      <b>Pasar a:</b>
      <select className="gw-input" value={dest} onChange={(e) => setDest(e.target.value)}>
        <option value="">Elige ruta…</option>
        {destinos.map((x) => (
          <option key={`${x.tienda}-${x.numero}`} value={`${x.tienda}-${x.numero}`}>
            {x.ruta_nombre ?? x.ruta} · {x.repartidor_nombre ?? 'sin repartidor'} · nº {x.numero}
          </option>
        ))}
      </select>
      <input className="gw-input w-[220px]" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo (obligatorio)" maxLength={500} />
      <button
        type="button"
        className="gw-btn font-bold"
        disabled={!d || !motivo.trim() || ocupado}
        onClick={async () => {
          if (!d) return
          setOcupado(true)
          setError(await onHacer(d, motivo.trim()))
          setOcupado(false)
        }}
      >
        Pasar
      </button>
      <button type="button" className="gw-btn" onClick={onCancelar}>
        Cancelar
      </button>
      {error && <span className="font-bold text-[#c42b1c]">{error}</span>}
    </div>
  )
}

function CuadroPorCobrar({ titulo, cobros, onValidar }: { titulo: string; cobros: PorCobrar[] | null; onValidar: (c: PorCobrar) => void }) {
  if (!cobros) return <div>Cargando…</div>
  const grupos = gruposPorCobrar(cobros)
  const total = grupos.reduce((t, x) => t + sumaPorCobrar(x.filas), 0)
  return (
    <div className="border border-[#1f6fb2] bg-[#eef5fc] p-1.5">
      <div className="flex items-baseline gap-2">
        <b className="flex-1 text-[#1f6fb2]">{titulo}</b>
        <b className="text-[#1f6fb2]">{eur(total)}</b>
      </div>
      <div className="text-[12px] text-[#555]">
        Por cobrar (facturas entregadas con importe pendiente, sin los albaranes a crédito), y abonos y nulos que el almacén aún no ha validado. El cobro se
        apunta en GeminisWin y la factura sale sola de aquí cuando allí queda pagada.
      </div>
      {!grupos.length && <div className="mt-1">No hay nada por cobrar ni abonos o nulos por validar.</div>}
      {grupos.map((x) => (
        <div key={x.g} className="mt-1.5">
          <div className={`flex items-baseline border-b-2 pb-0.5 ${x.g === GRUPO_ABONOS || x.g === GRUPO_NULOS ? 'border-[#c42b1c]' : 'border-[#1f6fb2]'}`}>
            <b className={`flex-1 ${x.g.includes('no cobró') || x.g === GRUPO_ABONOS || x.g === GRUPO_NULOS ? 'text-[#c42b1c]' : 'text-[#1f6fb2]'}`}>
              {x.g} ({x.filas.length})
            </b>
            <b>{eur(x.g === GRUPO_ABONOS || x.g === GRUPO_NULOS ? x.filas.reduce((t, c) => t + (c.total ?? 0), 0) : sumaPorCobrar(x.filas))}</b>
          </div>
          <table className="w-full border-collapse bg-white text-[12px]">
            <tbody>
              {x.filas.map((c) => (
                <tr key={`${c.vt}-${c.vn}`} className="border-b border-[var(--gw-border-light)]">
                  <td className="px-1.5 py-0.5 font-bold">{c.cliente}</td>
                  <td className="px-1.5 text-[#555]">{c.factura ? `Factura ${c.factura}` : `Albarán ${c.vt}/${c.vn}`}</td>
                  <td className="px-1.5 text-[#555]">
                    {c.ruta ? `Ruta ${/^\d+$/.test(c.ruta) ? Number(c.ruta) : c.ruta}` : ''}
                    {c.repartidor ? ` · ${c.repartidor}` : ''}
                    {c.hora ? ` · ${c.abono ? 'recogido ' : c.nulo ? 'anulado ' : ''}${c.hora}` : ''}
                  </td>
                  <td className="px-1.5">{c.forma_pago ?? ''}</td>
                  <td className="px-1.5 font-bold text-[#c42b1c]">{c.no_cobro ? `No cobró: ${c.no_cobro}` : c.nota ?? ''}</td>
                  <td className="whitespace-nowrap px-1.5 text-right font-bold">{eur(c.abono || c.nulo ? c.total : c.pendiente)}</td>
                  <td className="w-[100px] whitespace-nowrap px-1.5 text-right">
                    {(c.abono || c.nulo) && (
                      <button type="button" className="gw-btn h-[22px] whitespace-nowrap font-bold" title="La mercancía ha llegado al almacén y está bien" onClick={() => onValidar(c)}>
                        ✔ Validar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}

function Leyenda({ color, children }: { color: string; children: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className="inline-block h-[10px] w-[10px] rounded-full" style={{ background: color }} />
      {children}
    </span>
  )
}

function Modal({ titulo, onCerrar, children }: { titulo: string; onCerrar: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-[320] flex items-start justify-center bg-black/25 pt-16" onKeyDown={(e) => e.key === 'Escape' && onCerrar()}>
      <GwWindow title={titulo} onClose={onCerrar} className="w-[520px] max-w-[95vw]">
        <div className="flex flex-col gap-2 p-2 text-[13px]">
          {children}
          <div className="text-right">
            <button type="button" className="gw-btn" onClick={onCerrar}>
              Cerrar
            </button>
          </div>
        </div>
      </GwWindow>
    </div>
  )
}

// ------------------------------------------------------------------ Pantalla de la TV
function DialogoTv({ onCerrar }: { onCerrar: () => void }) {
  const [enlace, setEnlace] = useState<string | null>(null)
  const [qr, setQr] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const generar = async () => {
    if (!confirm('Se crea un enlace nuevo y el anterior deja de funcionar (habrá que abrir el nuevo en la TV). ¿Seguir?')) return
    const { data, error } = await supabase.rpc('fn_reparto_tv_generar')
    if (error) return setMsg(error.message)
    const url = `${location.origin}${import.meta.env.BASE_URL}reparto-tv?k=${data as string}`
    setEnlace(url)
    setQr(await QRCode.toDataURL(url, { margin: 1, width: 220 }))
  }
  return (
    <Modal titulo="Pantalla de la TV" onCerrar={onCerrar}>
      <div>
        La TV no usa el ERP: crea el enlace, cópialo o mándalo por correo, y ábrelo en el navegador de la TV en pantalla completa (o escanea el
        código con el móvil). Solo se crea desde aquí: los repartidores no tienen acceso. Allí se ven las rutas, el mapa, el ranking y los totales, y se alternan solos. El enlace solo se enseña una vez: guárdalo
        en la TV. Si se pierde, crea otro y el anterior deja de valer.
      </div>
      {!enlace ? (
        <button type="button" className="gw-btn self-start font-bold" onClick={() => void generar()}>
          Crear enlace para la TV
        </button>
      ) : (
        <div className="flex items-center gap-3">
          {qr && <img src={qr} alt="Código QR del enlace" className="h-[150px] w-[150px]" />}
          <div className="min-w-0 flex-1">
            <div className="break-all border border-[var(--gw-border)] bg-white p-1 text-[12px]">{enlace}</div>
            <div className="mt-1 flex gap-1">
              <button type="button" className="gw-btn" onClick={() => void navigator.clipboard.writeText(enlace).then(() => setMsg('Enlace copiado.'))}>
                Copiar enlace
              </button>
              <a
                className="gw-btn"
                href={`mailto:?subject=${encodeURIComponent('Pantalla de repartos (TV)')}&body=${encodeURIComponent(`Ábrelo en el navegador de la TV y ponlo en pantalla completa:\n\n${enlace}\n\nNo lo reenvíes: quien lo tenga ve los repartos de hoy.`)}`}
              >
                ✉ Enviar por correo
              </a>
            </div>
          </div>
        </div>
      )}
      {msg && <div className="font-bold text-[#127a12]">{msg}</div>}
    </Modal>
  )
}

// ------------------------------------------------------------------ PIN de la app de reparto
function DialogoPines({ onCerrar }: { onCerrar: () => void }) {
  const [lista, setLista] = useState<{ codigo: string; nombre: string; con_pin: boolean; puede_cambiar_ruta: boolean }[] | null>(null)
  const [quien, setQuien] = useState('')
  const [pin, setPin] = useState('')
  const [cambiar, setCambiar] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const cargar = useCallback(() => {
    void supabase.rpc('fn_repartidores_app').then(({ data, error }) => (error ? setMsg(error.message) : setLista((data ?? []) as typeof lista)))
  }, [])
  useEffect(cargar, [cargar])
  const guardar = async () => {
    const { error } = await supabase.rpc('fn_repartidor_pin_poner', { p_repartidor: quien, p_pin: pin, p_puede_cambiar_ruta: cambiar })
    if (error) return setMsg(error.message)
    setMsg('PIN guardado. Si tenía la app abierta, tendrá que volver a entrar.')
    setPin('')
    cargar()
  }
  return (
    <Modal titulo="PIN de la app de reparto" onCerrar={onCerrar}>
      <div>
        Los repartidores entran en <b>{`${location.origin}${import.meta.env.BASE_URL}repartidor`}</b> con su nombre y este PIN de 4 cifras (o directamente
        desde Fichaje con «🚚 Mi reparto»).
      </div>
      <select
        className="gw-input"
        value={quien}
        onChange={(e) => {
          setQuien(e.target.value)
          setCambiar(lista?.find((x) => x.codigo === e.target.value)?.puede_cambiar_ruta ?? false)
        }}
      >
        <option value="">Elige repartidor…</option>
        {lista?.map((r) => (
          <option key={r.codigo} value={r.codigo}>
            {r.nombre} {r.con_pin ? '· tiene PIN' : ''}
          </option>
        ))}
      </select>
      <input
        className="gw-input w-[160px]"
        value={pin}
        onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
        inputMode="numeric"
        placeholder="PIN nuevo (4 cifras)"
      />
      <label className="flex items-center gap-1">
        <input type="checkbox" checked={cambiar} onChange={(e) => setCambiar(e.target.checked)} /> Puede cambiar pedidos de ruta él mismo (queda anotado)
      </label>
      <button type="button" className="gw-btn self-start font-bold" disabled={!quien || pin.length !== 4} onClick={() => void guardar()}>
        Guardar PIN
      </button>
      {msg && <div className="font-bold text-[#127a12]">{msg}</div>}
    </Modal>
  )
}
