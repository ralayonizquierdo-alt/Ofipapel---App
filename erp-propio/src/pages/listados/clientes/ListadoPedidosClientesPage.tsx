import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { sesionTrabajo } from '../../../lib/sesionTrabajo'
import {
  BotonOpcion,
  CampoFechaHora,
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
  type Rango,
  type RangoFecha,
} from '../../../components/gw/GwListado'
import { GrupoTiendaNumero, describirTiendaNumero, rpc, tiendaNumero, tiendaNumeroSql, type TiendaNumero } from '../comun'
import { ErrorListado } from './comunClientes'

// Ventas → Listados → List Pedidos (pedidos de clientes): ventana «Informes» calcada de GeminisWin
// (capturas ZIP 7, nº 69-72, 04/11/2026). Cálculo en fn_lst_pedidos_gw (migración
// 20261104_informes_listados_gw.sql). Columnas sacadas de los .FRX de GeminisWin (gw_informe):
// Lispedid (Listado de Pedidos), LISPEDDE (Desglosado), lisPedCl (por Cliente), Lispedet
// (Listado detallado) y Lispedfa (por familias).

const INFORMES = [
  { value: 'pedidos', label: 'Listado de Pedidos' },
  { value: 'desglosado', label: 'Listado de Pedidos Desglosado' },
  { value: 'cliente', label: 'Listado de Pedidos por Cliente' },
  { value: 'cliente_resumido', label: 'Listado de Pedidos por Cliente Resumido' },
  { value: 'tiendas', label: 'Listado de Pedidos por Tiendas' },
  { value: 'vendedor', label: 'Listado de Pedidos por Vendedor' },
  { value: 'detallado', label: 'Listado detallado de Pedidos' },
  { value: 'familias', label: 'Listado de Pedidos por familias' },
]

// La lista de GeminisWin tiene barra de desplazamiento: estos son los campos que se ven en la captura.
const ORDENES = [
  { value: 'fecha', label: 'Pedidos.Fecha' },
  { value: 'fecha_entrega', label: 'Pedidos.Fecha_entr' },
  { value: 'hora', label: 'Pedidos.Hora' },
  { value: 'cliente', label: 'Pedidos.Idcliente' },
  { value: 'nombre', label: 'Pedidos.Nombre' },
  { value: 'nif', label: 'Pedidos.Nif' },
  { value: 'sucursal', label: 'Pedidos.Idclisucur' },
]

type Estado = 'aceptado' | 'preparado' | 'entregado' | 'presupuesto' | 'reparaciones' | 'anulado'

interface Filtros {
  campoFecha: 'pedido' | 'entrega'
  fecha: RangoFecha
  filtroPor: 'vendedor' | 'tecnico' | 'empleado'
  personas: Rango
  clientes: Rango
  tipos: Rango
  tiendas: Rango
  tNum: TiendaNumero
  formasPago: Rango
  albaraneado: Par
  facturadas: Par
  pagadas: Par
  aplazadas: boolean
  conDc: boolean
  dc: string
  estados: Record<Estado, Par>
}

const inicial = (tienda: string): Filtros => ({
  campoFecha: 'pedido',
  fecha: { modo: 'desdeHasta', desde: '', hasta: '' },
  filtroPor: 'vendedor',
  personas: rango(),
  clientes: rango(),
  tipos: rango(),
  tiendas: rango(),
  tNum: { ...tiendaNumero(), desdeTienda: tienda, hastaTienda: tienda },
  formasPago: rango(),
  albaraneado: par(),
  facturadas: par(),
  pagadas: par(),
  aplazadas: false,
  conDc: false,
  dc: '',
  // Sin anulados por defecto (en la captura además salían «Presupuesto» y «No Aceptado» marcados:
  // es lo último que se usó en ese puesto, no el valor de inicio).
  estados: {
    aceptado: par(),
    preparado: par(),
    entregado: par(),
    presupuesto: par(),
    reparaciones: par(),
    anulado: { si: false, no: true },
  },
})

const BUSC = { vendedor: 'vendedor', tecnico: 'tecnico', empleado: 'empleado' } as const

function columnasDe(informe: string): { columnas: ColumnaInforme[]; apaisado: boolean } {
  const lineas: ColumnaInforme[] = [
    { key: 'codigo', titulo: 'Cod. Venta', ancho: 85 },
    { key: 'descripcion', titulo: 'Descripción' },
    { key: 'hora', titulo: 'Hora', ancho: 45 },
    { key: 'cantidad', titulo: 'Cantidad', tipo: 'num', ancho: 60 },
    { key: 'pvp', titulo: 'Pvp', tipo: 'num', dec: 3, ancho: 65, suma: false },
    { key: 'dto', titulo: 'Dto', tipo: 'num', ancho: 40, suma: false },
    { key: 'subtotal', titulo: 'Subtotal', tipo: 'num', ancho: 75 },
  ]
  const importes: ColumnaInforme[] = [
    { key: 'subtotal', titulo: 'Subtotal', tipo: 'num', ancho: 70 },
    { key: 'descuento', titulo: 'Descuento', tipo: 'num', ancho: 65 },
    { key: 'base', titulo: 'Base Imp', tipo: 'num', ancho: 70 },
    { key: 'impuestos', titulo: 'Impuestos', tipo: 'num', ancho: 65 },
    { key: 'total', titulo: 'Total', tipo: 'num', ancho: 75 },
    { key: 'entregado', titulo: 'Entr. Cta.', tipo: 'num', ancho: 70 },
  ]
  switch (informe) {
    case 'pedidos':
      return { apaisado: false, columnas: lineas }
    case 'desglosado':
    case 'detallado':
    case 'familias':
      return {
        apaisado: true,
        columnas: [
          { key: 'fecha', titulo: 'Fecha', tipo: 'fecha', ancho: 66 },
          { key: 'tienda', titulo: 'Tie.', ancho: 32 },
          { key: 'vendedor', titulo: 'Vend.', ancho: 40 },
          { key: 'documento', titulo: 'Nº Pedido', ancho: 70 },
          ...lineas,
        ],
      }
    case 'cliente_resumido':
      return { apaisado: true, columnas: [{ key: 'cliente', titulo: 'Cliente' }, { key: 'n', titulo: 'Nº Ped.', tipo: 'entero', ancho: 50 }, ...importes] }
    default: // cliente, tiendas, vendedor
      return {
        apaisado: true,
        columnas: [
          { key: 'documento', titulo: 'NºPed.', ancho: 65 },
          { key: 'cliente', titulo: 'Cliente' },
          { key: 'fecha', titulo: 'Fecha', tipo: 'fecha', ancho: 66 },
          ...importes,
        ],
      }
  }
}

export function ListadoPedidosClientesPage() {
  const inf = useInforme()
  const [informe, setInforme] = useState('pedidos')
  const [orden, setOrden] = useState('fecha')
  const [destino, setDestino] = useState<Destino>('pantalla')
  const [soloTotales, setSoloTotales] = useState(false)
  const [f, setF] = useState<Filtros>(() => inicial(sesionTrabajo().tienda ?? ''))
  const [dcs, setDcs] = useState<string[]>([])
  const set = (p: Partial<Filtros>) => setF((x) => ({ ...x, ...p }))

  useEffect(() => {
    supabase
      .from('serie_facturacion')
      .select('digito_control')
      .order('digito_control')
      .then(({ data }) => setDcs([...new Set((data ?? []).map((r) => String(r.digito_control ?? '')).filter(Boolean))]))
  }, [])

  function procesar() {
    const p = {
      informe,
      orden,
      campoFecha: f.campoFecha,
      fecha: f.fecha,
      filtroPor: f.filtroPor,
      personas: rangoSql(f.personas),
      clientes: rangoSql(f.clientes),
      tiposCliente: rangoSql(f.tipos),
      tiendas: rangoSql(f.tiendas),
      tiendaNumero: tiendaNumeroSql(f.tNum),
      formasPago: rangoSql(f.formasPago),
      albaraneado: f.albaraneado,
      facturadas: f.facturadas,
      pagadas: f.pagadas,
      aplazadas: f.aplazadas,
      dc: f.conDc ? f.dc : '',
      ...f.estados,
    }
    const { columnas, apaisado } = columnasDe(informe)
    const e = f.estados
    const porNombre = { vendedor: 'Vendedores', tecnico: 'Técnicos', empleado: 'Empleados' }[f.filtroPor]
    inf.procesar(
      {
        titulo: INFORMES.find((i) => i.value === informe)?.label ?? 'Listado de Pedidos',
        soloTotales,
        apaisado,
        columnas,
        filtros: [
          describirFecha(f.campoFecha === 'entrega' ? 'Fecha de entrega' : 'Fecha del pedido', f.fecha),
          describirRango(porNombre, f.personas),
          describirRango('Clientes', f.clientes),
          describirRango('Tipos de cliente', f.tipos),
          describirRango('Tiendas', f.tiendas),
          describirTiendaNumero('Tienda y número de pedido', f.tNum),
          describirRango('Formas de pago', f.formasPago),
          describirPar('Albaraneados', 'No albaraneados', f.albaraneado),
          describirPar('Facturadas', 'No facturadas', f.facturadas),
          describirPar('Pagadas', 'No pagadas', f.pagadas),
          f.aplazadas && 'Solo ventas aplazadas',
          f.conDc && f.dc && `D.C. de la factura: ${f.dc}`,
          describirPar('Aceptados', 'No aceptados', e.aceptado),
          describirPar('Preparados', 'No preparados', e.preparado),
          describirPar('Entregados', 'No entregados', e.entregado),
          describirPar('Presupuestos', 'Sin presupuestos', e.presupuesto),
          describirPar('Reparaciones', 'Sin reparaciones', e.reparaciones),
          describirPar('Anulados', 'No anulados', e.anulado),
        ],
        cargar: () => rpc('fn_lst_pedidos_gw', p),
      },
      destino,
    )
  }

  const par2 = (label: string, v: Par, lado: 'si' | 'no', cambiar: (p: Par) => void, title?: string) => (
    <BotonOpcion label={label} title={title} on={v[lado]} set={(on) => cambiar({ ...v, [lado]: on })} />
  )
  const est = (label: string, k: Estado, lado: 'si' | 'no') => par2(label, f.estados[k], lado, (p) => set({ estados: { ...f.estados, [k]: p } }))
  const fechaOff = f.fecha.modo !== 'desdeHasta'

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
        operativa={[
          {
            titulo: 'Sacar un listado de pedidos de clientes',
            pasos: [
              'Elige el informe en «Informe a procesar» y el orden en «Orden de salida».',
              'En «Filtrar Según Fecha» elige qué fecha (del pedido o de entrega) y el tramo; con las fechas vacías no se limita.',
              'Pon el resto de filtros (vendedor, técnico o empleado; clientes; tiendas; número de pedido…).',
              'En «Estado del Pedido» y «Estado de la venta» marca con ✓ lo que quieras ver. Sin marca en una pareja, no se filtra por ella.',
              'Elige el destino y pulsa Procesar.',
            ],
            notas: [
              'Por defecto salen todos menos los anulados (✓ No Anulado).',
              '«Albaraneado» = el pedido ya tiene su venta (albarán). «Estado de la venta» mira esa venta: si está facturada, pagada o aplazada.',
              '«Sólo Ver los Totales del informe» quita las líneas y deja los subtotales y el total.',
              'F4 cierra la ventana.',
            ],
          },
        ]}
      >
        <ErrorListado error={inf.error} />
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2">
          <LstGrupo titulo="Filtrar Según Fecha">
            <div className="grid grid-cols-2 gap-x-3 gap-y-[6px] pt-[2px]">
              <select className={LST_INPUT} value={f.campoFecha} onChange={(e) => set({ campoFecha: e.target.value as Filtros['campoFecha'] })}>
                <option value="pedido">Fecha Pedido</option>
                <option value="entrega">Fecha Entrega</option>
              </select>
              <select
                className={LST_INPUT}
                value={f.fecha.modo}
                onChange={(e) => set({ fecha: { ...f.fecha, modo: e.target.value as RangoFecha['modo'] } })}
              >
                <option value="desdeHasta">Desde / Hasta</option>
                <option value="cualquiera">Cualquiera</option>
              </select>
              <CampoFechaHora soloFecha valor={f.fecha.desde} disabled={fechaOff} onChange={(v) => set({ fecha: { ...f.fecha, desde: v } })} />
              <CampoFechaHora soloFecha finDeDia valor={f.fecha.hasta} disabled={fechaOff} onChange={(v) => set({ fecha: { ...f.fecha, hasta: v } })} />
            </div>
          </LstGrupo>
          <GrupoRango
            nombre="lpg-per"
            titulo={
              <span className="flex items-center gap-6">
                <span>Filtrar por:</span>
                {(['vendedor', 'tecnico', 'empleado'] as const).map((k) => (
                  <LstRadio
                    key={k}
                    nombre="lpg-por"
                    label={{ vendedor: 'Vendedor', tecnico: 'Técnico', empleado: 'Empleado' }[k]}
                    on={f.filtroPor === k}
                    set={() => set({ filtroPor: k, personas: rango() })}
                  />
                ))}
              </span>
            }
            valor={f.personas}
            onChange={(personas) => set({ personas })}
            buscador={BUSC[f.filtroPor]}
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <GrupoRango nombre="lpg-cli" titulo="Clientes" valor={f.clientes} onChange={(clientes) => set({ clientes })} buscador="cliente" />
          <GrupoRango nombre="lpg-tip" titulo="Tipo Cliente" valor={f.tipos} onChange={(tipos) => set({ tipos })} buscador="tipoCliente" />
        </div>
        <div className="grid grid-cols-[minmax(0,300fr)_minmax(0,600fr)] gap-2">
          <GrupoRango nombre="lpg-tie" titulo="Tiendas" valor={f.tiendas} onChange={(tiendas) => set({ tiendas })} buscador="tienda" />
          <GrupoTiendaNumero nombre="lpg-tnum" titulo="Tienda y Número de Pedido" valor={f.tNum} onChange={(tNum) => set({ tNum })} />
        </div>
        <div className="grid grid-cols-[minmax(0,312fr)_minmax(0,128fr)_minmax(0,455fr)] gap-2">
          <GrupoRango nombre="lpg-fp" titulo="Formas de pago" valor={f.formasPago} onChange={(formasPago) => set({ formasPago })} buscador="formaPago" />
          <LstGrupo titulo="Albaraneado">
            <div className="flex flex-col gap-1.5 pt-1">
              {par2('Si', f.albaraneado, 'si', (albaraneado) => set({ albaraneado }), 'El pedido ya tiene su venta (albarán)')}
              {par2('No', f.albaraneado, 'no', (albaraneado) => set({ albaraneado }), 'El pedido aún no tiene venta')}
            </div>
          </LstGrupo>
          <LstGrupo titulo="Estado de la venta">
            <div className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)] gap-1.5 pt-1">
              {par2('No Facturadas', f.facturadas, 'no', (facturadas) => set({ facturadas }))}
              {par2('Facturadas', f.facturadas, 'si', (facturadas) => set({ facturadas }))}
              <div className="flex gap-1">
                <BotonOpcion label="D.C." on={f.conDc} set={(conDc) => set({ conDc })} className="flex-1" title="Solo los facturados con este dígito de control" />
                <select className={`${LST_INPUT} w-[60px]! flex-none`} value={f.dc} disabled={!f.conDc} onChange={(e) => set({ dc: e.target.value })} title="Dígito de control de la factura">
                  <option value="" />
                  {dcs.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
              {par2('No Pagadas', f.pagadas, 'no', (pagadas) => set({ pagadas }))}
              {par2('Pagadas', f.pagadas, 'si', (pagadas) => set({ pagadas }))}
              <BotonOpcion label="Aplazadas" on={f.aplazadas} set={(aplazadas) => set({ aplazadas })} title="Solo las ventas aplazadas" />
            </div>
          </LstGrupo>
        </div>
        <LstGrupo titulo="Estado del Pedido">
          <div className="grid grid-cols-[repeat(4,minmax(0,1fr))_minmax(0,1.2fr)_minmax(0,1fr)] gap-x-0 gap-y-1.5 pt-1">
            {est('Aceptado', 'aceptado', 'si')}
            {est('Preparado', 'preparado', 'si')}
            {est('Entregado', 'entregado', 'si')}
            {est('Presupuesto', 'presupuesto', 'si')}
            {est('Reparaciones', 'reparaciones', 'si')}
            {est('Anulado', 'anulado', 'si')}
            {est('No Aceptado', 'aceptado', 'no')}
            {est('No Preparado', 'preparado', 'no')}
            {est('No Entregado', 'entregado', 'no')}
            {est('Sin Presupu.', 'presupuesto', 'no')}
            {est('Sin Reparaciones', 'reparaciones', 'no')}
            {est('No Anulado', 'anulado', 'no')}
          </div>
        </LstGrupo>
      </ListadoVentana>
      {inf.vista}
    </>
  )
}
