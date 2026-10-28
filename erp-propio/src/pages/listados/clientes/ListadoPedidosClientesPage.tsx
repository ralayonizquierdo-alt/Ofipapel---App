import { useState } from 'react'
import {
  BotonOpcion,
  GrupoFecha,
  GrupoRango,
  LstCheck,
  LstGrupo,
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
  type RangoFecha,
} from '../../../components/gw/GwListado'
import { GrupoTiendaNumero, describirTiendaNumero, mesEnCurso, rpc, tiendaNumero, tiendaNumeroSql } from '../comun'
import { ErrorListado } from './comunClientes'

// Ventas → Listados → List Pedidos (pedidos de clientes). SIN CAPTURA de GeminisWin: filtros
// al estilo de «Informes de Pedidos» de Compras y columnas a confirmar con Luis. Cálculo en
// fn_lst_pedidos_clientes. Estado: Pendiente · Parcial (alguna unidad liquidada) · Servido
// (entregado o liquidado) · Anulado. «Pend. Servir» = importe de lo que falta por servir.

const INFORMES = [
  { value: 'resumido', label: 'Relación de Pedidos' },
  { value: 'cliente', label: 'Pedidos Agrupados por Cliente' },
  { value: 'vendedor', label: 'Pedidos Agrupados por Vendedor' },
  { value: 'tienda', label: 'Pedidos Agrupados por Tienda' },
  { value: 'desglosado', label: 'Pedidos Desglosados (con líneas)' },
  { value: 'totales_cliente', label: 'Totales de Pedidos por Cliente' },
]

const ORDENES = [
  { value: 'numero', label: 'Pedidcab.Numero' },
  { value: 'fecha', label: 'Pedidcab.Fecha' },
  { value: 'cliente', label: 'Cliente (nombre)' },
  { value: 'total', label: 'Total (de mayor a menor)' },
]

type Estado = 'pendiente' | 'parcial' | 'servido' | 'anulado'

export function ListadoPedidosClientesPage() {
  const inf = useInforme()
  const [informe, setInforme] = useState('resumido')
  const [orden, setOrden] = useState('numero')
  const [destino, setDestino] = useState<Destino>('pantalla')
  const [soloTotales, setSoloTotales] = useState(false)
  const [tNum, setTNum] = useState(tiendaNumero())
  const [tiendas, setTiendas] = useState(rango())
  const [fecha, setFecha] = useState<RangoFecha>(() => ({ modo: 'desdeHasta', ...mesEnCurso() }))
  const [fechaEnt, setFechaEnt] = useState<RangoFecha>({ modo: 'cualquiera', desde: '', hasta: '' })
  const [estados, setEstados] = useState<Record<Estado, boolean>>({ pendiente: false, parcial: false, servido: false, anulado: false })
  const [reparaciones, setReparaciones] = useState(par())
  const [web, setWeb] = useState(par())
  const [clientes, setClientes] = useState(rango())
  const [vendedores, setVendedores] = useState(rango())

  function procesar() {
    const p = {
      informe,
      orden,
      tiendaNumero: tiendaNumeroSql(tNum),
      tiendas: rangoSql(tiendas),
      fecha,
      fechaEntrega: fechaEnt,
      estados,
      reparaciones,
      web,
      clientes: rangoSql(clientes),
      vendedores: rangoSql(vendedores),
    }
    const imp: ColumnaInforme[] = [
      { key: 'base', titulo: 'Base Imp.', tipo: 'num', ancho: 75 },
      { key: 'igic', titulo: 'IGIC', tipo: 'num', ancho: 60 },
      { key: 'total', titulo: 'Total', tipo: 'num', ancho: 80 },
      { key: 'pend_servir', titulo: 'Pend. Servir', tipo: 'num', ancho: 80 },
    ]
    const columnas: ColumnaInforme[] =
      informe === 'totales_cliente'
        ? [{ key: 'clave', titulo: 'Cliente', ancho: 60 }, { key: 'descripcion', titulo: 'Nombre' }, { key: 'n', titulo: 'Nº Ped.', tipo: 'entero', ancho: 55 }, ...imp]
        : informe === 'desglosado'
          ? [{ key: 'descripcion', titulo: 'Artículo' }, { key: 'estado', titulo: 'Servida', ancho: 85 }, ...imp]
          : [
              { key: 'descripcion', titulo: 'Pedido / Cliente' },
              { key: 'fecha', titulo: 'Fecha', tipo: 'fecha', ancho: 68 },
              { key: 'fecha_entrega', titulo: 'F. Entrega', tipo: 'fecha', ancho: 68 },
              { key: 'estado', titulo: 'Estado', ancho: 65 },
              ...imp,
            ]
    const sel = (Object.keys(estados) as Estado[]).filter((k) => estados[k])
    inf.procesar(
      {
        titulo: `Listado de Pedidos de Clientes - ${INFORMES.find((i) => i.value === informe)?.label}`,
        sinCaptura: true,
        soloTotales,
        apaisado: informe !== 'desglosado' && informe !== 'totales_cliente',
        columnas,
        filtros: [
          describirTiendaNumero('Tienda y número', tNum),
          describirRango('Tiendas', tiendas),
          describirFecha('Fecha del pedido', fecha),
          describirFecha('Fecha de entrega', fechaEnt),
          sel.length ? `Estado: ${sel.join(', ')}` : 'Estado: todos menos anulados',
          describirPar('Solo reparaciones', 'Sin reparaciones', reparaciones),
          describirPar('Solo pedidos web', 'Sin pedidos web', web),
          describirRango('Clientes', clientes),
          describirRango('Vendedores', vendedores),
        ],
        cargar: () => rpc('fn_lst_pedidos_clientes', p),
      },
      destino,
    )
  }

  const est = (label: string, k: Estado) => <BotonOpcion label={label} on={estados[k]} set={(v) => setEstados({ ...estados, [k]: v })} />

  return (
    <>
      <ListadoVentana
        informes={INFORMES}
        informe={informe}
        onInforme={setInforme}
        cabeceraExtra={<LstCheck label="Sólo Ver los Totales del informe" on={soloTotales} set={setSoloTotales} />}
        ordenes={ORDENES}
        orden={orden}
        onOrden={setOrden}
        destino={destino}
        onDestino={setDestino}
        onProcesar={procesar}
        procesando={inf.cargando}
      >
        <ErrorListado error={inf.error} />
        <div className="grid grid-cols-[minmax(0,2.25fr)_minmax(0,1fr)] gap-2">
          <GrupoTiendaNumero nombre="lpcl-tnum" titulo="Tienda y Número" valor={tNum} onChange={setTNum} />
          <GrupoRango nombre="lpcl-tiendas" titulo="Tiendas" valor={tiendas} onChange={setTiendas} buscador="tienda" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <GrupoFecha nombre="lpcl-fecha" titulo="Fecha y Hora del Pedido" valor={fecha} onChange={setFecha} />
          <GrupoFecha nombre="lpcl-fent" titulo="Fecha de Entrega" soloFecha valor={fechaEnt} onChange={setFechaEnt} />
        </div>
        <div className="grid grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] items-start gap-2">
          <LstGrupo titulo="Estado del Pedido">
            <div className="grid grid-cols-4 gap-1.5 pt-1">
              {est('Pendientes', 'pendiente')}
              {est('Parciales', 'parcial')}
              {est('Servidos', 'servido')}
              {est('Anulados', 'anulado')}
            </div>
          </LstGrupo>
          <LstGrupo titulo="Tipo de Pedido">
            <div className="grid grid-cols-2 gap-1.5 pt-1">
              <BotonOpcion label="Reparaciones" on={reparaciones.si} set={(v) => setReparaciones({ ...reparaciones, si: v })} />
              <BotonOpcion label="Web" on={web.si} set={(v) => setWeb({ ...web, si: v })} />
              <BotonOpcion label="Sin Reparac." on={reparaciones.no} set={(v) => setReparaciones({ ...reparaciones, no: v })} />
              <BotonOpcion label="Sin Web" on={web.no} set={(v) => setWeb({ ...web, no: v })} />
            </div>
          </LstGrupo>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <GrupoRango nombre="lpcl-cli" titulo="Clientes" valor={clientes} onChange={setClientes} buscador="cliente" />
          <GrupoRango nombre="lpcl-ven" titulo="Vendedores" valor={vendedores} onChange={setVendedores} buscador="vendedor" />
        </div>
      </ListadoVentana>
      {inf.vista}
    </>
  )
}
