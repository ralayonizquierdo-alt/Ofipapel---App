import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { GwDate, GwInput, GwLookupButton, GwNumber, GwSelect, GwTextArea } from '../../components/gw'
import { GwRecordBar } from '../../components/gw/GwRecordBar'
import { GwLookupDialog } from '../../components/gw/GwLookupDialog'
import { GwCampoBusqueda } from '../../components/gw/GwCampoBusqueda'
import { useListaOrdenada, type GwListaOrdenadaDef } from '../../components/gw/GwListaOrdenada'
import { Campo, Grupo, I, L, RadioFijo } from './piezasCaja'
import {
  MOV_COLS,
  TIPOS_MOV,
  cajaAbiertaDe,
  cargarMaestrosCaja,
  descripcionTipo,
  errorTexto,
  hoyISO,
  horaActual,
  nombreEmpleado,
  r3,
  rutaDocumento,
  textoDocumento,
  tiendaPuesto,
  type FormaPagoCaja,
  type MovimientoCaja,
  type TiendaCaja,
} from './cajaModel'

// Caja → Mov. de Caja (Alt+F5), calcada de la ventana «Caja» de GeminisWin (tabla CAJA →
// movimiento_caja). Desde el menú abre en alta, como GeminisWin. El número se asigna al
// guardar (fn_siguiente_numero 'caja'). Los movimientos que generan las ventas, cobros y
// pagos solo dejan cambiar el concepto y el empleado; la baja es lógica (activo = false).

type Modo = 'consulta' | 'edicion' | 'alta'

const LISTA_NUMERO: GwListaOrdenadaDef = {
  fuente: 'movimiento_caja',
  campo: 'numero',
  etiqueta: 'Número',
  que: 'Movimientos de caja',
  rpc: 'gw_lista_ordenada_caja',
  numerico: true,
  columnas: [
    { key: 'tienda_terminal_codigo', label: 'Tienda', width: 60 },
    { key: 'numero', label: 'Número', width: 100 },
    { key: 'fecha', label: 'Fecha', width: 95 },
    { key: 'hora', label: 'Hora', width: 75 },
    { key: 'tipo_movimiento', label: 'Tipo', width: 50 },
    { key: 'ingreso', label: 'Ingreso', width: 95, decimales: 3 },
    { key: 'gasto', label: 'Gasto', width: 95, decimales: 3 },
    { key: 'concepto', label: 'Concepto' },
  ],
}

const LISTA_EMPLEADO: GwListaOrdenadaDef = {
  fuente: 'empleado',
  campo: 'codigo',
  etiqueta: 'Empleado',
  que: 'Empleados',
  rpc: 'gw_lista_ordenada_caja',
  columnas: [
    { key: 'codigo', label: 'Código', width: 120 },
    { key: 'nombre', label: 'Nombre' },
  ],
}

function vacio(tienda: string, empleado: string | null, fp: FormaPagoCaja | undefined): MovimientoCaja {
  return {
    tienda_terminal_codigo: tienda,
    numero: null,
    fecha: hoyISO(),
    hora: horaActual(),
    documento: null,
    es_ingreso: true,
    ingreso: null,
    gasto: null,
    concepto: null,
    tipo_movimiento: 'USU',
    descripcion_tipo: 'Usuario',
    ajeno_tienda_codigo: null,
    ajeno_codigo: null,
    forma_pago_codigo: fp?.codigo ?? null,
    tipo_contado: fp?.tipo_contado ?? null,
    tipo_forma_pago: fp?.tipo ?? null,
    cliente_codigo: null,
    empleado_codigo: empleado,
    turno_tienda_codigo: null,
    turno_numero: null,
    activo: true,
  }
}

export function MovimientoCajaFichaPage() {
  const params = useParams()
  const navigate = useNavigate()
  const ruta = (params['*'] ?? '').split('/').filter(Boolean).map(decodeURIComponent)
  const esNuevo = ruta[0] === 'nuevo'
  const claveTienda = !esNuevo && ruta.length >= 2 ? ruta[0] : null
  const claveNumero = !esNuevo && ruta.length >= 2 ? Number(ruta[1]) : null

  const [tiendas, setTiendas] = useState<TiendaCaja[]>([])
  const [formas, setFormas] = useState<FormaPagoCaja[]>([])
  const [empleadoActual, setEmpleadoActual] = useState<string | null>(null)
  const [maestros, setMaestros] = useState(false)
  const [mov, setMov] = useState<MovimientoCaja | null>(null)
  const [orig, setOrig] = useState<MovimientoCaja | null>(null)
  const [nombreEmp, setNombreEmp] = useState('')
  const [modo, setModo] = useState<Modo>('consulta')
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [hay, setHay] = useState({ antes: false, despues: false })
  const [buscar, setBuscar] = useState<'empleado' | null>(null)
  const lista = useListaOrdenada()

  const editable = modo !== 'consulta'
  const manual = mov?.tipo_movimiento === 'USU' || modo === 'alta'
  const fp = formas.find((f) => f.codigo === mov?.forma_pago_codigo)
  const tipoFp = fp?.tipo ?? mov?.tipo_forma_pago ?? null
  const tipoCont = tipoFp === 4 ? (fp?.tipo_contado ?? mov?.tipo_contado ?? null) : null

  useEffect(() => {
    cargarMaestrosCaja().then(({ tiendas: t, formas: f, empleado }) => {
      setTiendas(t)
      setFormas(f)
      setEmpleadoActual(empleado)
      setMaestros(true)
    })
  }, [])

  const vecinos = useCallback(async (m: MovimientoCaja | null) => {
    if (!m || m.numero == null) return setHay({ antes: false, despues: false })
    const [a, d] = await Promise.all([
      supabase.from('movimiento_caja').select('numero').eq('tienda_terminal_codigo', m.tienda_terminal_codigo).lt('numero', m.numero).limit(1),
      supabase.from('movimiento_caja').select('numero').eq('tienda_terminal_codigo', m.tienda_terminal_codigo).gt('numero', m.numero).limit(1),
    ])
    setHay({ antes: (a.data ?? []).length > 0, despues: (d.data ?? []).length > 0 })
  }, [])

  // Carga: alta, el movimiento de la URL o el último de la tienda del puesto.
  useEffect(() => {
    if (!maestros) return
    let cancel = false
    async function run() {
      setCargando(true)
      setMensaje(null)
      if (esNuevo) {
        const t = tiendaPuesto(tiendas)
        const fpDef = formas.find((f) => f.codigo === 'CON') ?? formas.find((f) => f.tipo === 4)
        const m = vacio(t, empleadoActual, fpDef)
        setMov(m)
        setOrig(null)
        setModo('alta')
        setNombreEmp(await nombreEmpleado(empleadoActual))
        if (!cancel) setCargando(false)
        return
      }
      let q = supabase.from('movimiento_caja').select(MOV_COLS)
      if (claveTienda && claveNumero != null) q = q.eq('tienda_terminal_codigo', claveTienda).eq('numero', claveNumero)
      else q = q.eq('tienda_terminal_codigo', tiendaPuesto(tiendas)).order('numero', { ascending: false })
      const { data } = await q.limit(1)
      if (cancel) return
      const m = ((data ?? [])[0] as MovimientoCaja | undefined) ?? null
      setMov(m)
      setOrig(m)
      setModo('consulta')
      setNombreEmp(await nombreEmpleado(m?.empleado_codigo ?? null))
      vecinos(m)
      if (!cancel) setCargando(false)
    }
    run()
    return () => {
      cancel = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params['*'], maestros])

  function patch(c: Partial<MovimientoCaja>) {
    setMov((m) => (m ? { ...m, ...c } : m))
  }

  const ir = (t: string, n: number) => navigate(`/caja/movimientos/${encodeURIComponent(t)}/${n}`)

  async function saltar(donde: 'primero' | 'anterior' | 'siguiente' | 'ultimo') {
    const t = mov?.tienda_terminal_codigo ?? tiendaPuesto(tiendas)
    let q = supabase.from('movimiento_caja').select('numero').eq('tienda_terminal_codigo', t)
    if (donde === 'anterior' && mov?.numero != null) q = q.lt('numero', mov.numero)
    if (donde === 'siguiente' && mov?.numero != null) q = q.gt('numero', mov.numero)
    const { data } = await q.order('numero', { ascending: donde === 'primero' || donde === 'siguiente' }).limit(1)
    const n = (data ?? [])[0]?.numero
    if (n != null) ir(t, Number(n))
  }

  async function cambiarTienda(t: string) {
    if (modo === 'alta') return patch({ tienda_terminal_codigo: t })
    const { data } = await supabase.from('movimiento_caja').select('numero').eq('tienda_terminal_codigo', t).order('numero', { ascending: false }).limit(1)
    const n = (data ?? [])[0]?.numero
    if (n != null) ir(t, Number(n))
    else setMensaje(`La tienda ${t} no tiene movimientos de caja.`)
  }

  async function buscarNumero(texto: string) {
    const n = Number(texto.replace(/\D/g, ''))
    if (!n || !mov) return
    const { data } = await supabase
      .from('movimiento_caja')
      .select('numero')
      .eq('tienda_terminal_codigo', mov.tienda_terminal_codigo)
      .eq('numero', n)
      .maybeSingle()
    if (data) ir(mov.tienda_terminal_codigo, n)
    else setMensaje(`No existe el movimiento ${n} en la tienda ${mov.tienda_terminal_codigo}.`)
  }

  async function aplicarEmpleado(codigo: string) {
    const c = codigo.trim().toUpperCase()
    if (!c) {
      patch({ empleado_codigo: null })
      setNombreEmp('')
      return
    }
    const { data } = await supabase.from('empleado').select('codigo, nombre').eq('codigo', c).maybeSingle()
    if (data) {
      patch({ empleado_codigo: data.codigo as string })
      setNombreEmp((data.nombre as string) ?? '')
    } else setMensaje(`No existe el empleado ${c}.`)
  }

  /** La caja en la que entró el movimiento: si ya está cerrada, no se toca. */
  async function cajaCerrada(m: MovimientoCaja) {
    if (m.turno_numero == null || !m.turno_tienda_codigo) return false
    const { data } = await supabase
      .from('caja_apertura_cierre')
      .select('cerrado')
      .eq('tienda_terminal_codigo', m.turno_tienda_codigo)
      .eq('ejercicio', m.turno_numero)
      .maybeSingle()
    return Boolean(data?.cerrado)
  }

  async function modificar() {
    if (!mov) return
    if (!mov.activo) return setMensaje('El movimiento está anulado.')
    if (await cajaCerrada(mov)) return setMensaje(`El movimiento entra en la caja Nº ${mov.turno_numero} de la tienda ${mov.turno_tienda_codigo}, que ya está cerrada.`)
    setMensaje(mov.tipo_movimiento === 'USU' ? null : 'Movimiento generado por un documento: solo se pueden cambiar el concepto y el empleado.')
    setModo('edicion')
  }

  async function guardar() {
    if (!mov) return
    const ing = r3(Number(mov.ingreso ?? 0))
    const gas = r3(Number(mov.gasto ?? 0))
    if (manual) {
      if (ing < 0 || gas < 0) return setMensaje('El ingreso y el gasto no pueden ser negativos.')
      if (ing === 0 && gas === 0) return setMensaje('Indica el importe del ingreso o del gasto.')
      if (ing !== 0 && gas !== 0) return setMensaje('Un movimiento es un ingreso o un gasto, no los dos.')
      if (!mov.forma_pago_codigo) return setMensaje('Indica la forma de pago.')
    }
    if (!(mov.concepto ?? '').trim()) return setMensaje('Escribe el concepto del movimiento.')
    setGuardando(true)
    setMensaje(null)
    try {
      if (modo === 'alta') {
        const abierta = await cajaAbiertaDe(mov.tienda_terminal_codigo)
        if (abierta == null) throw new Error(`No hay caja abierta en la tienda ${mov.tienda_terminal_codigo}: ábrela en Caja → Apertura de Caja.`)
        const { data: num, error: eNum } = await supabase.rpc('fn_siguiente_numero', { p_tienda: mov.tienda_terminal_codigo, p_tipo_documento: 'caja', p_serie: '' })
        if (eNum) throw new Error(eNum.message)
        const { error } = await supabase.from('movimiento_caja').insert({
          tienda_terminal_codigo: mov.tienda_terminal_codigo,
          numero: Number(num),
          fecha: mov.fecha ?? hoyISO(),
          hora: mov.hora || horaActual(),
          documento: mov.documento,
          es_ingreso: ing > 0,
          ingreso: ing,
          gasto: gas,
          concepto: mov.concepto,
          tipo_movimiento: 'USU',
          descripcion_tipo: 'Usuario',
          forma_pago_codigo: mov.forma_pago_codigo,
          tipo_forma_pago: fp?.tipo ?? null,
          tipo_contado: fp?.tipo === 4 ? fp.tipo_contado : null,
          empleado_codigo: mov.empleado_codigo,
          turno_tienda_codigo: mov.tienda_terminal_codigo,
          turno_numero: abierta,
        })
        if (error) throw new Error(error.message)
        setGuardando(false)
        ir(mov.tienda_terminal_codigo, Number(num))
        return
      }
      const cambios: Partial<MovimientoCaja> = { concepto: mov.concepto, empleado_codigo: mov.empleado_codigo }
      if (manual)
        Object.assign(cambios, {
          fecha: mov.fecha,
          hora: mov.hora,
          documento: mov.documento,
          es_ingreso: ing > 0,
          ingreso: ing,
          gasto: gas,
          forma_pago_codigo: mov.forma_pago_codigo,
          tipo_forma_pago: fp?.tipo ?? null,
          tipo_contado: fp?.tipo === 4 ? fp.tipo_contado : null,
        })
      const { error } = await supabase
        .from('movimiento_caja')
        .update(cambios)
        .eq('tienda_terminal_codigo', mov.tienda_terminal_codigo)
        .eq('numero', mov.numero!)
      if (error) throw new Error(error.message)
      const { data } = await supabase.from('movimiento_caja').select(MOV_COLS).eq('tienda_terminal_codigo', mov.tienda_terminal_codigo).eq('numero', mov.numero!).maybeSingle()
      const m = (data as MovimientoCaja | null) ?? mov
      setMov(m)
      setOrig(m)
      setModo('consulta')
    } catch (e) {
      setMensaje(errorTexto(e))
    } finally {
      setGuardando(false)
    }
  }

  async function eliminar() {
    if (!mov || mov.numero == null) return
    if (!mov.activo) return setMensaje('El movimiento ya está anulado.')
    if (mov.tipo_movimiento !== 'USU')
      return setMensaje('Este movimiento lo generó un documento (venta, cobro o pago): se anula desde ese documento.')
    if (await cajaCerrada(mov)) return setMensaje(`La caja Nº ${mov.turno_numero} de la tienda ${mov.turno_tienda_codigo} ya está cerrada: no se puede anular el movimiento.`)
    if (!confirm(`¿Eliminar el movimiento ${mov.tienda_terminal_codigo}-${mov.numero}? Queda anulado y su importe pasa a 0.`)) return
    const era = Number(mov.ingreso ?? 0) ? `ingreso ${Number(mov.ingreso).toFixed(3).replace('.', ',')}` : `gasto ${Number(mov.gasto ?? 0).toFixed(3).replace('.', ',')}`
    const { error } = await supabase
      .from('movimiento_caja')
      .update({ activo: false, ingreso: 0, gasto: 0, concepto: `ANULADO (${era}) — ${mov.concepto ?? ''}`.trim() })
      .eq('tienda_terminal_codigo', mov.tienda_terminal_codigo)
      .eq('numero', mov.numero)
    if (error) return setMensaje(error.message)
    const { data } = await supabase.from('movimiento_caja').select(MOV_COLS).eq('tienda_terminal_codigo', mov.tienda_terminal_codigo).eq('numero', mov.numero).maybeSingle()
    setMov(data as MovimientoCaja)
    setOrig(data as MovimientoCaja)
  }

  if (cargando) return <div className="gw-label p-2">Cargando…</div>

  const m = mov
  const ro = !editable
  const roImporte = ro || !manual
  const rutaDoc = m ? rutaDocumento(m) : null
  const docInterno = m ? Boolean(rutaDoc) || (m.documento ?? '') in { venta: 1, cobro: 1, pago_proveedor: 1, pago: 1 } : false
  const tiendasOpc = tiendas.length ? tiendas.map((t) => t.codigo) : m ? [m.tienda_terminal_codigo] : []

  return (
    <div className="flex flex-col gap-1.5 px-1 pt-1 text-[18px]">
      {!m ? (
        <p className={`${L} p-2`}>No hay movimientos de caja en esta tienda. Pulsa «Nuevo» para dar de alta el primero.</p>
      ) : (
        <div className="flex flex-col gap-2" title="CAJA">
          {/* Fila 1: Tienda · Número · Fecha · Hora · Documento | Tipo Movimiento */}
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,398px)] items-end gap-3">
            <Grupo className="grid grid-cols-[86px_minmax(0,166px)_minmax(0,150px)_minmax(0,118px)_minmax(0,1fr)] gap-x-2 pt-0.5">
              <Campo label="Tienda">
                <GwSelect className={I} value={m.tienda_terminal_codigo} disabled={modo === 'edicion'} title="TIENDA" onChange={(e) => cambiarTienda(e.target.value)}>
                  {tiendasOpc.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </GwSelect>
              </Campo>
              <Campo label={<><u>N</u>úmero</>}>
                <GwCampoBusqueda
                  className={`${I} gw-num`}
                  value={m.numero != null ? String(m.numero) : ''}
                  disabled={editable}
                  title="NUMERO — se asigna al guardar"
                  onBuscar={buscarNumero}
                  onLista={(texto) =>
                    lista.abrir(LISTA_NUMERO, {
                      texto,
                      ancla: m.numero != null ? `${m.tienda_terminal_codigo}|${m.numero}` : null,
                      onPick: (f) => ir(String(f.tienda_terminal_codigo), Number(f.numero)),
                    })
                  }
                />
              </Campo>
              <Campo label="Fecha">
                <GwDate className={I} value={m.fecha} disabled={roImporte} onChange={(v) => patch({ fecha: v })} />
              </Campo>
              <Campo label="Hora">
                <GwInput className={I} value={m.hora ?? ''} disabled={roImporte} maxLength={8} title="HORA" onChange={(e) => patch({ hora: e.target.value })} />
              </Campo>
              <Campo label="Documento">
                <span className="flex">
                  <GwInput
                    className={I}
                    value={textoDocumento(m)}
                    disabled={roImporte || docInterno}
                    title="DOCUMENTO"
                    onChange={(e) => patch({ documento: e.target.value || null })}
                  />
                  <GwLookupButton
                    disabled={!rutaDoc}
                    onClick={() => rutaDoc && navigate(rutaDoc)}
                    title={rutaDoc ? 'Abrir el documento que generó el movimiento' : 'Sin documento relacionado'}
                  />
                </span>
              </Campo>
            </Grupo>
            <Grupo title="Tipo Movimiento" apagado={modo === 'alta'} className="grid grid-cols-[110px_minmax(0,1fr)] gap-x-2">
              <Campo label="Tipo" className={modo === 'alta' ? 'text-[#8a8a8a]' : ''}>
                <GwSelect className={`${I} ${modo === 'alta' ? '!text-[#8a8a8a] ![-webkit-text-fill-color:#8a8a8a]' : ''}`} value={m.tipo_movimiento ?? ''} disabled title="TIPOMOV">
                  <option value="" />
                  {TIPOS_MOV.map((t) => (
                    <option key={t.codigo} value={t.codigo}>
                      {t.codigo}
                    </option>
                  ))}
                </GwSelect>
              </Campo>
              <Campo label="Descripción" className={modo === 'alta' ? 'text-[#8a8a8a]' : ''}>
                <GwInput
                  className={`${I} ${modo === 'alta' ? '!text-[#8a8a8a] ![-webkit-text-fill-color:#8a8a8a]' : ''}`}
                  readOnly
                  value={m.descripcion_tipo ?? descripcionTipo(m.tipo_movimiento)}
                />
              </Campo>
            </Grupo>
          </div>

          {/* Fila 2: Forma de Pago | Datos del Movimiento */}
          <div className="grid grid-cols-[minmax(0,526px)_minmax(0,1fr)] items-stretch gap-6">
            <Grupo title="Forma de Pago" className="flex flex-col gap-1">
              <GwSelect
                className={`${I} w-[442px]!`}
                value={m.forma_pago_codigo ?? ''}
                disabled={roImporte}
                title="FORMAPAGO"
                onChange={(e) => {
                  const f = formas.find((x) => x.codigo === e.target.value)
                  patch({ forma_pago_codigo: e.target.value || null, tipo_forma_pago: f?.tipo ?? null, tipo_contado: f?.tipo === 4 ? f.tipo_contado : null })
                }}
              >
                <option value="" />
                {formas.map((f) => (
                  <option key={f.codigo} value={f.codigo}>
                    {f.descripcion}
                  </option>
                ))}
              </GwSelect>
              <span className={`${L} mt-1`}>Tipo Forma De Pago</span>
              <div className="flex h-[34px] w-[488px] items-center justify-between border border-[var(--gw-border-light)] px-2">
                {(
                  [
                    [1, 'Crédito'],
                    [2, 'Efecto'],
                    [3, 'Banco'],
                    [4, 'Contado'],
                  ] as const
                ).map(([v, l]) => (
                  <RadioFijo key={v} label={l} checked={tipoFp === v} apagado={editable} />
                ))}
              </div>
              <span className={`${L} mt-1`}>Tipo Contado</span>
              <div className="flex h-[34px] w-[378px] items-center justify-between border border-[var(--gw-border-light)] px-2">
                {(
                  [
                    [1, 'Efectivo'],
                    [2, 'Tarjeta'],
                    [3, 'Cheque'],
                  ] as const
                ).map(([v, l]) => (
                  <RadioFijo key={v} label={l} checked={tipoCont === v} apagado={editable} />
                ))}
              </div>
            </Grupo>
            <Grupo title="Datos del Movimiento" className="flex flex-col gap-1">
              <div className="grid grid-cols-[194px_194px] gap-x-6">
                <Campo label="Ingreso">
                  <GwNumber className={I} value={m.ingreso} decimals={3} emptyAsZero={modo === 'consulta'} disabled={roImporte} onChange={roImporte ? undefined : (v) => patch({ ingreso: v })} />
                </Campo>
                <Campo label="Gasto">
                  <GwNumber className={I} value={m.gasto} decimals={3} emptyAsZero={modo === 'consulta'} disabled={roImporte} onChange={roImporte ? undefined : (v) => patch({ gasto: v })} />
                </Campo>
              </div>
              <Campo label="Concepto" className="mt-2">
                <GwTextArea
                  className="!h-[66px] resize-none !text-[18px] leading-[24px]"
                  value={m.concepto ?? ''}
                  disabled={ro}
                  title="CONCEPTO"
                  maxLength={250}
                  onChange={(e) => patch({ concepto: e.target.value || null })}
                />
              </Campo>
            </Grupo>
          </div>

          {/* Fila 3: Empleado */}
          <div className="grid grid-cols-[minmax(0,526px)_minmax(0,1fr)] gap-6">
            <Grupo title={<><u>E</u>mpleado</>} className="grid grid-cols-[92px_minmax(0,1fr)] gap-x-2 pt-0.5">
              <GwCampoBusqueda
                className={I}
                value={m.empleado_codigo ?? ''}
                editable={editable}
                title="EMPLEADO"
                maxLength={10}
                onChange={(v) => patch({ empleado_codigo: v.toUpperCase() || null })}
                onBlur={(e) => editable && aplicarEmpleado(e.target.value)}
                onLista={
                  editable
                    ? (texto) =>
                        lista.abrir(LISTA_EMPLEADO, {
                          texto,
                          ancla: m.empleado_codigo,
                          onPick: (f) => aplicarEmpleado(String(f.codigo)),
                        })
                    : undefined
                }
              />
              <span className="flex">
                <GwInput className={I} readOnly value={nombreEmp} />
                <GwLookupButton disabled={!editable} onClick={() => setBuscar('empleado')} title="Buscar empleado" />
              </span>
            </Grupo>
            <div className="flex items-end">
              {!m.activo && <span className={`${L} font-bold text-[#c42b1c]`}>MOVIMIENTO ANULADO</span>}
              {m.turno_numero != null && m.activo && (
                <span className="gw-label !text-[#1a4fd0]">
                  Caja Nº {m.turno_numero} de la tienda {m.turno_tienda_codigo}
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {mensaje && <p className="gw-label px-1 !text-[#c42b1c]">{mensaje}</p>}

      <GwRecordBar
        grande
        mode={modo}
        canNavigate={modo === 'consulta' && !!m}
        saving={guardando}
        onFirst={() => hay.antes && saltar('primero')}
        onPrev={() => hay.antes && saltar('anterior')}
        onNext={() => hay.despues && saltar('siguiente')}
        onLast={() => hay.despues && saltar('ultimo')}
        onSort={() =>
          m &&
          lista.abrir(LISTA_NUMERO, {
            ancla: m.numero != null ? `${m.tienda_terminal_codigo}|${m.numero}` : null,
            onPick: (f) => ir(String(f.tienda_terminal_codigo), Number(f.numero)),
          })
        }
        onSearch={() =>
          lista.abrir(
            { ...LISTA_NUMERO, campo: 'concepto', etiqueta: 'Concepto', numerico: false },
            { ancla: m?.numero != null ? `${m.tienda_terminal_codigo}|${m.numero}` : null, onPick: (f) => ir(String(f.tienda_terminal_codigo), Number(f.numero)) },
          )
        }
        onPrint={() => window.print()}
        onNew={() => navigate('/caja/movimientos/nuevo')}
        onEdit={modificar}
        onDelete={eliminar}
        onSave={guardar}
        onCancel={() => {
          setMensaje(null)
          if (modo === 'alta') navigate('/caja/movimientos', { replace: true })
          else {
            setMov(orig)
            setModo('consulta')
            nombreEmpleado(orig?.empleado_codigo ?? null).then(setNombreEmp)
          }
        }}
        onExit={() => navigate('/')}
      />

      {buscar === 'empleado' && (
        <GwLookupDialog<Record<string, unknown>>
          title="Empleados"
          table="empleado"
          columns={[
            { key: 'codigo', label: 'Código', width: 100 },
            { key: 'nombre', label: 'Nombre' },
          ]}
          searchColumns={['codigo', 'nombre']}
          orderBy="nombre"
          keyColumn="codigo"
          onPick={(r) => {
            setBuscar(null)
            aplicarEmpleado(String(r.codigo))
          }}
          onClose={() => setBuscar(null)}
        />
      )}
      {lista.dialogo}
    </div>
  )
}
