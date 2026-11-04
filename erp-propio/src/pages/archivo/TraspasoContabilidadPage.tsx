// Archivo → Traspaso a Contabilidad, calcada de GeminisWin (capturas ZIP 7, 87-89, 04/11/2026).
// En GeminisWin pasa ventas, facturas, cobros, compras y pagos a un programa de contabilidad
// externo (ContaPlus, A3, ContaWin, ContaNet) en ficheros DBF de diario y subcuentas.
//
// En el ERP la contabilidad es propia y la lleva el plan de contabilidad de Luis
// (Contabilidad → Generar Asientos Automáticos). Esta ventana es SOLO LA INTERFAZ: no genera
// asientos, no escribe ficheros y no toca tablas ni funciones de contabilidad (fn_contab_*).
// Los filtros se pueden marcar, pero Procesar y Generar salen apagados explicando por qué.

import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, DoorOpen, FolderOpen, Monitor, Printer, Search, Settings, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { sesionTrabajo } from '../../lib/sesionTrabajo'
import { BotonOpcion, CampoFechaHora, GrupoRango, LST_INPUT, LstCheck, LstGrupo, LstRadio, rango, type Rango } from '../../components/gw/GwListado'
import { GwOperativa } from '../../components/gw/GwOperativa'

/** Opciones del desplegable «Proceso a Generar», en el orden de GeminisWin (captura 89). */
const PROCESOS = ['Traspaso a Conta Plus', 'Traspaso a Contabilidad  A3', 'Traspaso a ContaWin por OLE', 'Traspaso a ContaNet', 'Traspaso a ContaNet por OLE']

const NO_PROCESA =
  'Pendiente del plan de contabilidad (lo lleva Luis): este traspaso todavía no genera asientos ni ficheros. Los asientos del ERP se generan en Contabilidad → Generar Asientos Automáticos.'
const NO_FICHEROS = 'No aplica en el ERP web: la contabilidad es propia, no se escriben ficheros DBF para otro programa. Ver Contabilidad → Exportar a Gestoría.'

type Destino = 'pantalla' | 'impresora' | 'examinar' | 'generar'
const DESTINOS: { k: Destino; label: string; icono: ReactNode }[] = [
  { k: 'pantalla', label: 'Pantalla', icono: <Monitor size={14} /> },
  { k: 'impresora', label: 'Impresora', icono: <Printer size={14} /> },
  { k: 'examinar', label: 'Examinar', icono: <Search size={14} /> },
  { k: 'generar', label: 'Generar', icono: <Settings size={14} /> },
]

const tiendaRango = (t: string): Rango => rango('cualquiera', t, t)

export function TraspasoContabilidadPage() {
  const navigate = useNavigate()
  const cerrar = () => navigate('/')
  const [pestana, setPestana] = useState<'traspaso' | 'operativa'>('traspaso')
  const t0 = sesionTrabajo().tienda ?? ''

  const [proceso, setProceso] = useState(PROCESOS[0])
  const [orden, setOrden] = useState('fecha')
  const [aTexto, setATexto] = useState(false)
  const [campoFecha, setCampoFecha] = useState('modif')
  const [porFechaVenta, setPorFechaVenta] = useState(false)
  const [filtroFecha, setFiltroFecha] = useState('no')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [tiendas, setTiendas] = useState(() => tiendaRango(t0))

  const [contado, setContado] = useState(true)
  const [sinCaja, setSinCaja] = useState(false)
  const [tContado, setTContado] = useState(() => tiendaRango(t0))
  const [facturas, setFacturas] = useState(true)
  const [series, setSeries] = useState<string[]>([])
  const [seriesOn, setSeriesOn] = useState<Record<string, boolean>>({})
  const [cobros, setCobros] = useState(true)
  const [tCobros, setTCobros] = useState(() => tiendaRango(t0))
  const [cobrosSinFactura, setCobrosSinFactura] = useState(true)
  const [cobrosEfect, setCobrosEfect] = useState(false)

  const [compras, setCompras] = useState(true)
  const [comprasPor, setComprasPor] = useState<'tiendas' | 'almacenes'>('tiendas')
  const [tCompras, setTCompras] = useState(() => tiendaRango(t0))
  const [pedidos, setPedidos] = useState(true)
  const [transportes, setTransportes] = useState(true)
  const [gastos, setGastos] = useState(true)
  const [factProv, setFactProv] = useState(true)
  const [filtrarAlm, setFiltrarAlm] = useState(false)
  const [proveedores, setProveedores] = useState(() => rango())
  const [provExcluir, setProvExcluir] = useState(false)
  const [pagos, setPagos] = useState(true)
  const [tPagos, setTPagos] = useState(() => tiendaRango(t0))
  const [pagosSinFactura, setPagosSinFactura] = useState(true)
  const [pagosEfect, setPagosEfect] = useState(false)

  const [diario, setDiario] = useState('XDIARIO.DBF')
  const [subcuentas, setSubcuentas] = useState('XSUBCTA.DBF')
  const [copiarA, setCopiarA] = useState('')
  const [destino, setDestino] = useState<Destino>('pantalla')

  // «D.C. Fact.»: un botón por serie de facturación.
  useEffect(() => {
    supabase
      .from('serie_facturacion')
      .select('serie')
      .order('serie')
      .then(({ data }) => setSeries([...new Set((data ?? []).map((r) => r.serie as string))]))
  }, [])

  const tituloCheck = (on: boolean, set: (v: boolean) => void, label: string, extra?: ReactNode) => (
    <span className="flex items-center gap-8">
      <LstCheck label={label} on={on} set={set} />
      {extra}
    </span>
  )
  const lado = (sinFact: boolean, setSinFact: (v: boolean) => void, efect: boolean, setEfect: (v: boolean) => void, disabled: boolean) => (
    <div className="flex w-[118px] flex-none flex-col gap-1 pt-2">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setSinFact(!sinFact)}
        className="flex h-[48px] items-center justify-center gap-1 border border-[var(--gw-border)] bg-[#f3f3f3] px-1 text-left text-[15px] leading-[17px] hover:bg-[#e5f1fb] disabled:text-[#9a9a9a]"
      >
        {sinFact ? <Check size={13} strokeWidth={3} className="flex-none text-[#2a9d2a]" /> : <X size={13} strokeWidth={3} className="flex-none text-[#c42b1c]" />}
        <span>Incluir Pagos sin Factura</span>
      </button>
      <BotonOpcion label="Efect. Pend." on={efect} set={setEfect} disabled={disabled} title="Efectos pendientes" className="text-[15px]!" />
    </div>
  )

  return (
    <div
      className="flex h-full min-h-[600px] min-w-[1180px] flex-col gap-1"
      onKeyDown={(e) => {
        if (e.key === 'F4' && !e.defaultPrevented && !e.altKey) {
          e.preventDefault()
          cerrar()
        }
      }}
    >
      {/* Cabecera: Proceso a Generar · Orden de salida · Al terminar Convertir a Fichero de Texto */}
      <div className="flex flex-none items-end gap-2">
        <fieldset className="min-w-0 flex-[1.1] border border-[var(--gw-border-light)] px-2 pb-1.5 pt-0">
          <legend className="px-1 text-[19px] font-bold leading-[22px]">Proceso a Generar</legend>
          <select className={`${LST_INPUT} h-[30px]! text-[18px]!`} value={proceso} onChange={(e) => setProceso(e.target.value)}>
            {PROCESOS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </fieldset>
        <fieldset className="min-w-0 flex-[0.9] border border-[var(--gw-border-light)] px-2 pb-1.5 pt-0">
          <legend className="px-1 text-[19px] font-bold leading-[22px]">Orden de salida</legend>
          <div className="flex gap-1">
            <select className={`${LST_INPUT} h-[30px]! text-[18px]!`} value={orden} onChange={(e) => setOrden(e.target.value)}>
              <option value="fecha">Fecha</option>
            </select>
            <button type="button" className="gw-btn h-[30px]! w-[56px] flex-none px-0! text-[17px] font-bold tracking-[2px]" disabled title="Orden personalizado (expresión de FoxPro): no disponible en el ERP">
              ···
            </button>
          </div>
        </fieldset>
        <BotonOpcion label="Al terminar Convertir a Fichero de Texto" on={aTexto} set={setATexto} className="mb-1.5 h-[34px]! flex-[1.1]" />
        <div className="mb-1.5 flex flex-none border border-[var(--gw-border)]">
          {(['traspaso', 'operativa'] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPestana(p)}
              className={`h-[34px] px-3 text-[15px] ${pestana === p ? 'bg-[var(--gw-face)] font-bold' : 'bg-[#f3f3f3] hover:bg-[#e5f1fb]'}`}
            >
              {p === 'traspaso' ? 'Traspaso' : 'Operativa'}
            </button>
          ))}
        </div>
      </div>

      <div className="border border-[#c9a400] bg-[#fff7cc] px-2 py-0.5 text-[13px]">
        Solo la ventana: el traspaso lo prepara el plan de contabilidad (Luis). Aún no genera asientos ni ficheros.
      </div>

      {pestana === 'operativa' ? (
        <div className="min-h-0 flex-1 overflow-y-auto border border-[var(--gw-border)] p-2">
          <GwOperativa
            bloques={[
              {
                titulo: 'Para qué sirve',
                notas: [
                  'En GeminisWin pasaba las ventas, facturas, cobros, compras y pagos a un programa de contabilidad de fuera (ContaPlus, A3, ContaWin o ContaNet) en dos ficheros: diario y subcuentas.',
                  'En el ERP la contabilidad es propia: los asientos se generan en Contabilidad → Generar Asientos Automáticos. Esta ventana se deja igual que en GeminisWin para cuando el plan de contabilidad decida si hace falta pasar datos a otro programa.',
                ],
              },
              {
                titulo: 'Cómo se usaría',
                pasos: [
                  'Elegir el programa de destino en «Proceso a Generar».',
                  'Marcar qué se traspasa (Ventas de Contado, Facturas y sus series, Cobros, Compras, Pagos) y las tiendas de cada cosa.',
                  'Poner las fechas en «Filtrar Según Fecha» (o «No Filtrar»).',
                  'Elegir Pantalla, Impresora o Examinar para ver el resultado, o Generar para escribir los ficheros, y pulsar Procesar.',
                ],
              },
              {
                titulo: 'Bueno es saber',
                notas: [
                  'Procesar y los botones de los ficheros están apagados: no se genera nada todavía. Si necesitas pasar datos a la gestoría, usa Contabilidad → Exportar a Gestoría.',
                  'F4 cierra la ventana.',
                ],
              },
            ]}
          />
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto border border-[var(--gw-border)] px-1.5 py-1">
          <div className="flex flex-col gap-1 text-[16px]">
            {/* Filtrar Según Fecha + Tiendas */}
            <div className="flex gap-2">
              <LstGrupo
                className="flex-[1.7]"
                titulo={
                  <>
                    <span>Filtrar Según Fecha</span>
                    <LstCheck label="En Ventas filtrar por Fecha Venta" on={porFechaVenta} set={setPorFechaVenta} />
                    <span className="ml-auto text-[17px] text-[#1a3fd0]" title="Filtro de fecha múltiple: no disponible en el ERP">
                      Múltiple
                    </span>
                  </>
                }
              >
                <div className="grid grid-cols-2 gap-x-2 gap-y-1.5">
                  <select className={LST_INPUT} value={campoFecha} onChange={(e) => setCampoFecha(e.target.value)}>
                    <option value="modif">Última Modif. o Fecha Doc.</option>
                  </select>
                  <select className={LST_INPUT} value={filtroFecha} onChange={(e) => setFiltroFecha(e.target.value)}>
                    <option value="no">No Filtrar</option>
                    <option value="desdeHasta">Desde/Hasta</option>
                  </select>
                  <CampoFechaHora className="w-[230px]" valor={desde} onChange={setDesde} disabled={filtroFecha === 'no'} />
                  <CampoFechaHora className="w-[230px]" valor={hasta} onChange={setHasta} disabled={filtroFecha === 'no'} finDeDia />
                </div>
              </LstGrupo>
              <GrupoRango className="flex-1" titulo="Tiendas" nombre="tc-tiendas" valor={tiendas} onChange={setTiendas} buscador="tienda" anchoCodigo={120} />
            </div>

            {/* Ventas de Contado · Facturas · Pagos de Clientes (Cobros) */}
            <div className="flex gap-2">
              <LstGrupo className="flex-1" titulo={tituloCheck(contado, setContado, 'Ventas de Contado', <LstCheck label="Sin Caja" on={sinCaja} set={setSinCaja} disabled={!contado} />)}>
                <GrupoRango titulo="Tiendas" nombre="tc-contado" valor={tContado} onChange={setTContado} buscador="tienda" anchoCodigo={120} disabled={!contado} className="border-0! px-0!" />
              </LstGrupo>
              <LstGrupo className="w-[150px] flex-none" titulo={<LstCheck label="Facturas" on={facturas} set={setFacturas} />}>
                <div className="text-center">D.C. Fact.</div>
                <div className="flex max-h-[110px] flex-col gap-[2px] overflow-y-auto">
                  {series.map((s) => (
                    <BotonOpcion key={s} label={s} on={!!seriesOn[s]} set={(v) => setSeriesOn((x) => ({ ...x, [s]: v }))} disabled={!facturas} className="h-[24px]! text-[16px]!" />
                  ))}
                  {!series.length && <span className="text-center text-[13px] text-[#777]">Sin series</span>}
                </div>
              </LstGrupo>
              <LstGrupo className="flex-1" titulo={tituloCheck(cobros, setCobros, 'Pagos de Clientes (Cobros)')}>
                <div className="flex gap-2">
                  <GrupoRango titulo="Tiendas" nombre="tc-cobros" valor={tCobros} onChange={setTCobros} buscador="tienda" anchoCodigo={120} disabled={!cobros} className="flex-1 border-0! px-0!" />
                  {lado(cobrosSinFactura, setCobrosSinFactura, cobrosEfect, setCobrosEfect, !cobros)}
                </div>
              </LstGrupo>
            </div>

            {/* Compras (+ Proveedores) · Pagos a Proveed., Transp., etc. */}
            <div className="flex gap-2">
              <div className="flex flex-[1.25] flex-col gap-1">
                <LstGrupo titulo={tituloCheck(compras, setCompras, 'Compras')}>
                  <div className="flex gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-4">
                        <span>Filtrar:</span>
                        <LstRadio nombre="tc-compras-por" label="Tiendas" on={comprasPor === 'tiendas'} set={() => setComprasPor('tiendas')} disabled={!compras} />
                        <LstRadio nombre="tc-compras-por" label="Almacenes" on={comprasPor === 'almacenes'} set={() => setComprasPor('almacenes')} disabled={!compras} />
                      </div>
                      <GrupoRango
                        titulo={null}
                        nombre="tc-compras"
                        valor={tCompras}
                        onChange={setTCompras}
                        buscador={comprasPor === 'tiendas' ? 'tienda' : 'almacen'}
                        anchoCodigo={120}
                        disabled={!compras}
                        className="border-0! px-0!"
                      />
                    </div>
                    <div className="flex w-[150px] flex-none flex-col gap-[3px] pt-1">
                      <LstCheck label="Pedidos" on={pedidos} set={setPedidos} disabled={!compras} />
                      <LstCheck label="Transportes" on={transportes} set={setTransportes} disabled={!compras} />
                      <LstCheck label="Gastos Adicc." on={gastos} set={setGastos} disabled={!compras} title="Gastos adicionales" />
                      <LstCheck label="Facturas Prov." on={factProv} set={setFactProv} disabled={!compras} />
                      <LstCheck label="Filtrar Alm." on={filtrarAlm} set={setFiltrarAlm} disabled={!compras || !factProv} className="pl-5 text-[14px]" />
                    </div>
                  </div>
                </LstGrupo>
                <div className="flex gap-2">
                  <GrupoRango className="flex-1" titulo="Proveedores" nombre="tc-prov" valor={proveedores} onChange={setProveedores} buscador="proveedor" anchoCodigo={150} disabled={!compras} />
                  <div className="flex w-[78px] flex-none flex-col gap-1 pt-3">
                    <button
                      type="button"
                      disabled={!compras}
                      onClick={() => setProvExcluir(false)}
                      className={`flex h-[34px] flex-col items-center justify-center border text-[16px] leading-[16px] ${!provExcluir ? 'border-[#5a5a5a] bg-[#dcdcdc] shadow-[inset_1px_1px_2px_rgba(0,0,0,0.35)]' : 'border-[var(--gw-border)] bg-[#f3f3f3]'}`}
                      title="Traspasar solo los proveedores elegidos"
                    >
                      {!provExcluir && <Check size={12} strokeWidth={3} className="text-[#2a9d2a]" />}
                      Filtrar
                    </button>
                    <button
                      type="button"
                      disabled={!compras}
                      onClick={() => setProvExcluir(true)}
                      className={`flex h-[30px] items-center justify-center gap-0.5 border text-[16px] ${provExcluir ? 'border-[#5a5a5a] bg-[#dcdcdc] shadow-[inset_1px_1px_2px_rgba(0,0,0,0.35)]' : 'border-[var(--gw-border)] bg-[#f3f3f3]'}`}
                      title="Traspasar todos menos los proveedores elegidos"
                    >
                      {provExcluir && <Check size={12} strokeWidth={3} className="text-[#2a9d2a]" />}
                      Excluir
                    </button>
                  </div>
                </div>
              </div>
              <LstGrupo className="flex-1 self-start" titulo={tituloCheck(pagos, setPagos, 'Pagos a Proveed., Transp., etc.')}>
                <div className="flex gap-2">
                  <GrupoRango titulo="Tiendas" nombre="tc-pagos" valor={tPagos} onChange={setTPagos} buscador="tienda" anchoCodigo={120} disabled={!pagos} className="flex-1 border-0! px-0!" />
                  {lado(pagosSinFactura, setPagosSinFactura, pagosEfect, setPagosEfect, !pagos)}
                </div>
              </LstGrupo>
            </div>
          </div>
        </div>
      )}

      {/* Ficheros */}
      <LstGrupo titulo="Ficheros" className="flex-none text-[16px]">
        <div className="grid grid-cols-[110px_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1">
          <span>Diario...........:</span>
          <input className={LST_INPUT} value={diario} onChange={(e) => setDiario(e.target.value)} />
          <BotonesFichero examinar />
          <span>Subcuentas:</span>
          <input className={LST_INPUT} value={subcuentas} onChange={(e) => setSubcuentas(e.target.value)} />
          <BotonesFichero examinar />
          <span>Copiar a Dir.:</span>
          <input className={LST_INPUT} value={copiarA} onChange={(e) => setCopiarA(e.target.value)} />
          <BotonesFichero />
        </div>
      </LstGrupo>

      {/* Pie: destino · Procesar · Cerrar */}
      <div className="flex flex-none items-stretch gap-2 border border-[var(--gw-border-light)] p-1">
        <div className="flex w-[160px] flex-none items-center px-1 text-[17px] leading-[20px]">Pulse F4 para cerrar la ventana</div>
        <div className="flex flex-1 border border-[var(--gw-border-light)] p-[3px]">
          {DESTINOS.map((d) => (
            <button
              key={d.k}
              type="button"
              onClick={() => setDestino(d.k)}
              className={`flex h-[42px] flex-1 items-center justify-center gap-1.5 border text-[18px] ${
                destino === d.k
                  ? 'border-[#8a8a8a] border-b-white border-r-white bg-[#f7f7f7] shadow-[inset_1px_1px_2px_rgba(0,0,0,0.3)]'
                  : 'border-[var(--gw-border)] bg-[#ececec] hover:bg-[#e5f1fb]'
              }`}
            >
              {d.icono}
              {d.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          disabled
          title={NO_PROCESA}
          className="flex h-[50px] w-[180px] flex-none items-center justify-center gap-1.5 border border-[var(--gw-border)] bg-[#f3f3f3] text-[19px] disabled:text-[#8a8a8a]"
        >
          <Check size={15} strokeWidth={3} className="text-[#9a9a9a]" />
          Procesar
        </button>
        <button
          type="button"
          onClick={cerrar}
          className="flex h-[50px] w-[180px] flex-none items-center justify-center gap-1.5 border border-[var(--gw-border)] bg-[#f3f3f3] text-[19px] hover:bg-[#e5f1fb]"
        >
          <DoorOpen size={15} className="text-[#7a5a1a]" />
          Cerrar
        </button>
      </div>
    </div>
  )
}

/** Botones de la derecha de cada fichero: carpeta (y examinar), apagados en el ERP web. */
function BotonesFichero({ examinar }: { examinar?: boolean }) {
  return (
    <div className="flex gap-1">
      <button type="button" className="gw-btn h-[26px]! w-[46px] px-0!" disabled title={NO_FICHEROS}>
        <FolderOpen size={14} />
      </button>
      {examinar ? (
        <button type="button" className="gw-btn h-[26px]! w-[46px] px-0!" disabled title={NO_FICHEROS}>
          <Search size={14} />
        </button>
      ) : (
        <span className="w-[46px]" />
      )}
    </div>
  )
}

