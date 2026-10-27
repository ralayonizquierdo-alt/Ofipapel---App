import { useState } from 'react'
import {
  BotonOpcion,
  CampoCodigo,
  GrupoFecha,
  GrupoRango,
  LST_INPUT,
  LstCheck,
  LstGrupo,
  LstRadio,
  ListadoVentana,
  describirFecha,
  describirPar,
  describirRango,
  par,
  rango,
  rangoSql,
  useInforme,
  type ColumnaInforme,
  type Destino,
  type Par,
  type RangoFecha,
} from '../../components/gw/GwListado'
import {
  GrupoCampoCliente,
  GrupoTiendaNumero,
  campoCliente,
  describirCampoCliente,
  describirTiendaNumero,
  mesEnCurso,
  rpc,
  tiendaNumero,
  tiendaNumeroSql,
} from './comun'

// Ventas → Listados → List. Ventas → List. de Ventas (captura 06-01: «Listados de Ventas»).
// Filtros calcados de la captura; el informe (columnas) no tiene captura: confirmar con Luis.
// Todo se calcula en fn_lst_ventas (subtotales y total en SQL).

const INFORMES = [
  { value: 'mensual_vendedor', label: 'Totales Mensuales de Ventas Agrupado por Vendedor' },
  { value: 'desglosado', label: 'Relación de Ventas Desglosada' },
  { value: 'diario', label: 'Totales Diarios de Ventas' },
  { value: 'mensual', label: 'Totales Mensuales de Ventas' },
  { value: 'vendedor', label: 'Totales de Ventas por Vendedor' },
  { value: 'cliente', label: 'Totales de Ventas por Cliente' },
  { value: 'tienda', label: 'Totales de Ventas por Tienda' },
  { value: 'forma_pago', label: 'Totales de Ventas por Forma de Pago' },
]

const ORDENES = [
  { value: 'clave', label: 'Idvendedor' },
  { value: 'descripcion', label: 'Nombre / Descripción' },
  { value: 'total', label: 'Total (de mayor a menor)' },
  { value: 'nventas', label: 'Nº de ventas (de mayor a menor)' },
]

const CAMPOS_FECHA = [
  { value: 'venta', label: 'Venta' },
  { value: 'factura', label: 'Factura' },
  { value: 'pagoVenta', label: 'Pago Venta' },
  { value: 'pagoFactura', label: 'Pago Factura' },
]

type Por = 'vendedor' | 'tecnico' | 'empleado'

export function ListadoVentasPage() {
  const inf = useInforme()
  const [informe, setInforme] = useState('mensual_vendedor')
  const [sinIgic, setSinIgic] = useState(true)
  const [comisiones, setComisiones] = useState(false)
  const [orden, setOrden] = useState('clave')
  const [destino, setDestino] = useState<Destino>('pantalla')
  const [campoFecha, setCampoFecha] = useState('venta')
  const [fecha, setFecha] = useState<RangoFecha>(() => ({ modo: 'desdeHasta', ...mesEnCurso() }))
  const [hora, setHora] = useState({ modo: 'cualquiera' as 'desdeHasta' | 'cualquiera', desde: '', hasta: '' })
  const [tiendas, setTiendas] = useState(rango())
  const [por, setPor] = useState<Por>('vendedor')
  const [personas, setPersonas] = useState(rango())
  const [tarifa, setTarifa] = useState({ modo: 'no', desde: '', hasta: '' })
  const [clientes, setClientes] = useState(rango())
  const [campoCli, setCampoCli] = useState(campoCliente())
  const [genericos, setGenericos] = useState<Par>(par())
  const [tNum, setTNum] = useState(tiendaNumero())
  const [almacenes, setAlmacenes] = useState(rango())
  const [pagadas, setPagadas] = useState<Par>(par())
  const [credito, setCredito] = useState<Par>(par())
  const [aplazadas, setAplazadas] = useState<Par>(par())
  const [facturadas, setFacturadas] = useState<Par>(par())
  const [reparto, setReparto] = useState({ sinReparto: false, entregado: false, pendiente: false, devuelto: false })
  const [reparaciones, setReparaciones] = useState<Par>(par())
  const [formas, setFormas] = useState(rango())
  const [fraccionados, setFraccionados] = useState(false)
  const [ranking, setRanking] = useState({ activo: false, por: 'total', n: 10 })

  const nombrePor = por === 'tecnico' ? 'Técnico' : por === 'empleado' ? 'Empleado' : 'Vendedor'

  function procesar() {
    const p = {
      informe,
      orden,
      campoFecha,
      fecha: { modo: fecha.modo, desde: fecha.desde, hasta: fecha.hasta },
      hora: { modo: hora.modo, desde: hora.desde.trim(), hasta: hora.hasta.trim() },
      tiendas: rangoSql(tiendas),
      filtrarPor: por,
      personas: rangoSql(personas),
      tarifa,
      clientes: rangoSql(clientes),
      campoCliente: campoCli,
      genericos,
      tiendaNumero: tiendaNumeroSql(tNum),
      almacenes: rangoSql(almacenes),
      pagadas,
      credito,
      aplazadas,
      facturadas,
      reparto,
      reparaciones,
      formasPago: rangoSql(formas),
      fraccionados,
      ranking,
    }
    const etiqueta = INFORMES.find((i) => i.value === informe)?.label ?? ''
    const cols: ColumnaInforme[] =
      informe === 'desglosado'
        ? [
            { key: 'descripcion', titulo: 'Venta  Cliente' },
            { key: 'fecha', titulo: 'Fecha', tipo: 'fecha', ancho: 70 },
          ]
        : ['vendedor', 'cliente', 'tienda', 'forma_pago'].includes(informe)
          ? [
              { key: 'clave', titulo: 'Código', ancho: 70 },
              { key: 'descripcion', titulo: informe === 'vendedor' ? nombrePor : 'Descripción' },
              { key: 'n_ventas', titulo: 'Nº Ventas', tipo: 'entero', ancho: 60 },
            ]
          : [
              { key: 'descripcion', titulo: informe === 'diario' ? 'Día' : 'Mes' },
              { key: 'n_ventas', titulo: 'Nº Ventas', tipo: 'entero', ancho: 60 },
            ]
    const importes: ColumnaInforme[] = sinIgic
      ? [{ key: 'base', titulo: 'Base Imponible', tipo: 'num', ancho: 95 }]
      : [
          { key: 'base', titulo: 'Base Imp.', tipo: 'num', ancho: 80 },
          { key: 'igic', titulo: 'IGIC', tipo: 'num', ancho: 70 },
          { key: 'total', titulo: 'Total', tipo: 'num', ancho: 85 },
          { key: 'pagado', titulo: 'Pagado', tipo: 'num', ancho: 80 },
          { key: 'pendiente', titulo: 'Pendiente', tipo: 'num', ancho: 80 },
        ]
    if (comisiones) importes.push({ key: 'comision', titulo: 'Comisión', tipo: 'num', ancho: 75 })
    inf.procesar(
      {
        titulo: etiqueta,
        sinCaptura: true,
        columnas: [...cols, ...importes],
        filtros: [
          describirFecha(`Fecha de ${CAMPOS_FECHA.find((c) => c.value === campoFecha)?.label.toLowerCase()}`, fecha),
          hora.modo === 'desdeHasta' && `Hora: ${hora.desde || '…'} a ${hora.hasta || '…'}`,
          describirRango('Tiendas', tiendas),
          describirRango(nombrePor + 'es', personas),
          tarifa.modo !== 'no' && `Tarifa de venta: ${tarifa.desde || '…'} a ${tarifa.hasta || '…'}`,
          describirRango('Clientes', clientes),
          describirCampoCliente(campoCli),
          describirPar('Solo clientes genéricos', 'Sin clientes genéricos', genericos),
          describirTiendaNumero('Tienda y número de venta', tNum),
          describirRango('Almacenes', almacenes),
          describirPar('Pagadas', 'No pagadas', pagadas),
          describirPar('Crédito', 'Contado', credito),
          describirPar('Aplazadas', 'No aplazadas', aplazadas),
          describirPar('Facturadas', 'No facturadas', facturadas),
          Object.values(reparto).some(Boolean) &&
            `Reparto: ${[reparto.sinReparto && 'sin reparto', reparto.pendiente && 'pendiente', reparto.entregado && 'entregado', reparto.devuelto && 'devuelto'].filter(Boolean).join(', ')}`,
          describirPar('Sólo reparaciones', 'Sin reparaciones', reparaciones),
          describirRango('Formas de pago', formas),
          fraccionados && 'Solo pagos fraccionados',
          ranking.activo && `Ranking: las ${ranking.n} primeras según ${ranking.por === 'base' ? 'base imponible' : ranking.por === 'comision' ? 'comisión' : 'total'}`,
          sinIgic && 'Importes sin IGIC',
        ],
        cargar: () => rpc('fn_lst_ventas', p),
      },
      destino,
    )
  }

  const opt = (label: string, p: Par, set: (p: Par) => void, k: 'si' | 'no') => (
    <BotonOpcion label={label} on={p[k]} set={(v) => set({ ...p, [k]: v })} />
  )

  return (
    <>
      <ListadoVentana
        informes={INFORMES}
        informe={informe}
        onInforme={setInforme}
        cabeceraExtra={
          <>
            <LstCheck label="Listar sin Igics" on={sinIgic} set={setSinIgic} />
            <LstCheck label="Listar Comisiones" on={comisiones} set={setComisiones} />
          </>
        }
        ordenes={ORDENES}
        orden={orden}
        onOrden={setOrden}
        destino={destino}
        onDestino={setDestino}
        onProcesar={procesar}
        procesando={inf.cargando}
      >
        {inf.error && <div className="border border-[#c42b1c] bg-[#fde7e9] px-2 py-1 text-[14px] text-[#c42b1c]">{inf.error}</div>}
        <div className="grid grid-cols-[minmax(0,2.7fr)_minmax(0,1fr)] gap-2">
          <GrupoFecha nombre="lv-fecha" campos={CAMPOS_FECHA} campo={campoFecha} onCampo={setCampoFecha} valor={fecha} onChange={setFecha} />
          <LstGrupo titulo="Hora">
            <div className="flex items-start gap-3">
              <div className="flex flex-col gap-[2px]">
                <LstRadio nombre="lv-hora" label="Desde/Hasta" on={hora.modo === 'desdeHasta'} set={() => setHora({ ...hora, modo: 'desdeHasta' })} />
                <LstRadio nombre="lv-hora" label="Cualquiera" on={hora.modo === 'cualquiera'} set={() => setHora({ ...hora, modo: 'cualquiera' })} />
              </div>
              <input className={`${LST_INPUT} mt-[2px]`} value={hora.desde} placeholder=" :" disabled={hora.modo !== 'desdeHasta'} title="Hora desde (hh:mm)" onChange={(e) => setHora({ ...hora, desde: e.target.value })} />
              <input className={`${LST_INPUT} mt-[2px]`} value={hora.hasta} placeholder=" :" disabled={hora.modo !== 'desdeHasta'} title="Hora hasta (hh:mm)" onChange={(e) => setHora({ ...hora, hasta: e.target.value })} />
            </div>
          </LstGrupo>
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)_minmax(0,0.5fr)] gap-2">
          <GrupoRango nombre="lv-tiendas" titulo="Tiendas" valor={tiendas} onChange={setTiendas} buscador="tienda" />
          <GrupoRango
            nombre="lv-personas"
            titulo={
              <>
                <span>Filtrar por:</span>
                {(['vendedor', 'tecnico', 'empleado'] as Por[]).map((k) => (
                  <LstRadio key={k} nombre="lv-por" label={k === 'vendedor' ? 'Vendedor' : k === 'tecnico' ? 'Técnico' : 'Empleado'} on={por === k} set={() => setPor(k)} />
                ))}
              </>
            }
            valor={personas}
            onChange={setPersonas}
            buscador={por}
          />
          <LstGrupo titulo="Tarifa de venta">
            <div className="flex flex-col gap-[6px] pt-[2px]">
              <select className={LST_INPUT} value={tarifa.modo} onChange={(e) => setTarifa({ ...tarifa, modo: e.target.value })}>
                <option value="no">No Filtrar</option>
                <option value="desdeHasta">Desde/Hasta</option>
              </select>
              <div className="flex gap-2">
                <CampoCodigo valor={tarifa.desde} onChange={(v) => setTarifa({ ...tarifa, desde: v.replace(/\D/g, '') })} disabled={tarifa.modo === 'no'} className="flex-1" numerico title="Nivel de tarifa desde (0-6)" />
                <CampoCodigo valor={tarifa.hasta} onChange={(v) => setTarifa({ ...tarifa, hasta: v.replace(/\D/g, '') })} disabled={tarifa.modo === 'no'} className="flex-1" numerico title="Nivel de tarifa hasta (0-6)" />
              </div>
            </div>
          </LstGrupo>
        </div>
        <div className="grid grid-cols-[minmax(0,1.55fr)_minmax(0,1.25fr)_minmax(0,0.33fr)] gap-2">
          <GrupoRango nombre="lv-clientes" titulo="Clientes" valor={clientes} onChange={setClientes} buscador="cliente" />
          <GrupoCampoCliente titulo="Filtrar Según Campo de Cliente" multiple="Múltiple" valor={campoCli} onChange={setCampoCli} />
          <LstGrupo titulo="Tipo Cli.">
            <div className="flex flex-col gap-1 pt-1">
              <BotonOpcion label="Genér." on={genericos.si} set={(v) => setGenericos({ ...genericos, si: v })} title="Solo clientes genéricos" />
              <BotonOpcion label="No Ge." on={genericos.no} set={(v) => setGenericos({ ...genericos, no: v })} title="Sin clientes genéricos" />
            </div>
          </LstGrupo>
        </div>
        <div className="grid grid-cols-[minmax(0,2.3fr)_minmax(0,1fr)] gap-2">
          <GrupoTiendaNumero nombre="lv-tnum" titulo="Tienda y Número de Venta" valor={tNum} onChange={setTNum} />
          <GrupoRango nombre="lv-alm" titulo="Almacenes" valor={almacenes} onChange={setAlmacenes} buscador="almacen" />
        </div>
        <div className="grid grid-cols-[minmax(0,2.15fr)_minmax(0,0.33fr)_minmax(0,0.9fr)] gap-2">
          <LstGrupo titulo="Estado de la venta">
            <div className="grid grid-cols-4 gap-x-0 gap-y-1 pt-1">
              {opt('Pagadas', pagadas, setPagadas, 'si')}
              {opt('Crédito', credito, setCredito, 'si')}
              {opt('Aplazadas', aplazadas, setAplazadas, 'si')}
              {opt('Facturadas', facturadas, setFacturadas, 'si')}
              {opt('No Pagadas', pagadas, setPagadas, 'no')}
              {opt('Contado', credito, setCredito, 'no')}
              {opt('No Aplazadas', aplazadas, setAplazadas, 'no')}
              {opt('No Facturadas', facturadas, setFacturadas, 'no')}
            </div>
          </LstGrupo>
          <LstGrupo titulo="D.C. Fact." disabled>
            <div className="flex flex-col pt-[2px]" title="Dígito de control de facturación de GeminisWin: no se usa en el ERP">
              {['1-04', '2-01', '3-02'].map((x) => (
                <BotonOpcion key={x} label={x} on={false} disabled className="h-[22px]! text-[14px]!" />
              ))}
            </div>
          </LstGrupo>
          <LstGrupo titulo="Estado según el reparto">
            <div className="grid grid-cols-2 gap-y-1 pt-1">
              <BotonOpcion label="Sin Reparto" on={reparto.sinReparto} set={(v) => setReparto({ ...reparto, sinReparto: v })} />
              <BotonOpcion label="Entregado" on={reparto.entregado} set={(v) => setReparto({ ...reparto, entregado: v })} />
              <BotonOpcion label="Pendiente" on={reparto.pendiente} set={(v) => setReparto({ ...reparto, pendiente: v })} />
              <BotonOpcion label="Devuelto" on={reparto.devuelto} set={(v) => setReparto({ ...reparto, devuelto: v })} />
            </div>
          </LstGrupo>
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,1.4fr)] gap-2">
          <LstGrupo titulo="Reparaciones">
            <div className="flex flex-col gap-1 pt-1">
              <BotonOpcion label="Sólo  Reparaciones" on={reparaciones.si} set={(v) => setReparaciones({ ...reparaciones, si: v })} />
              <BotonOpcion label="Sin Reparaciones" on={reparaciones.no} set={(v) => setReparaciones({ ...reparaciones, no: v })} />
            </div>
          </LstGrupo>
          <GrupoRango
            nombre="lv-formas"
            titulo={
              <>
                <span>Formas de pago</span>
                <LstCheck label="Fraccionados" on={fraccionados} set={setFraccionados} className="text-[17px]" title="Solo ventas cobradas con más de una forma de pago" />
              </>
            }
            valor={formas}
            onChange={setFormas}
            buscador="formaPago"
          />
          <LstGrupo
            titulo={<LstCheck label="Filtrar Ranking de ventas Según su..." on={ranking.activo} set={(v) => setRanking({ ...ranking, activo: v })} />}
            disabled={!ranking.activo}
          >
            <div className="flex flex-col gap-1.5 pt-1">
              <div className="flex">
                {[
                  ['total', 'Total'],
                  ['base', 'Base. Imp.'],
                  ['comision', 'Comisión'],
                ].map(([k, l]) => (
                  <button
                    key={k}
                    type="button"
                    disabled={!ranking.activo}
                    onClick={() => setRanking({ ...ranking, por: k })}
                    className={`h-[30px] flex-1 border text-[17px] disabled:text-[#8a8a8a] ${
                      ranking.por === k ? 'border-[#8a8a8a] border-b-white border-r-white bg-[#f7f7f7] shadow-[inset_1px_1px_2px_rgba(0,0,0,0.3)]' : 'border-[var(--gw-border)] bg-[#ececec]'
                    }`}
                  >
                    {l}
                  </button>
                ))}
              </div>
              <div className="flex gap-1">
                <select className={LST_INPUT} disabled={!ranking.activo} defaultValue="n">
                  <option value="n">Nº de ventas a mostrar</option>
                </select>
                <input
                  type="number"
                  min={1}
                  className={`${LST_INPUT} w-[130px]! flex-none text-right`}
                  disabled={!ranking.activo}
                  value={ranking.n}
                  onChange={(e) => setRanking({ ...ranking, n: Math.max(1, Number(e.target.value) || 1) })}
                />
              </div>
            </div>
          </LstGrupo>
        </div>
      </ListadoVentana>
      {inf.vista}
    </>
  )
}
