import { useState } from 'react'
import {
  BotonOpcion,
  CampoCodigo,
  CampoFechaHora,
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
  fechaHoraEs,
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
  GrupoTiendaNumero,
  GrupoTotalProveedor,
  describirTiendaNumero,
  describirTotalProveedor,
  rpc,
  tiendaNumero,
  tiendaNumeroSql,
  totalProveedor,
  totalProveedorSql,
} from './comun'

// Compras → Listados de Pedidos (captura 06-10: «Informes de Pedidos»). Filtros calcados;
// columnas del informe sin captura: confirmar con Luis. Cálculo en fn_lst_pedidos_proveedor.
// Fechas: Alta = fecha/hora del pedido, Solicitud, Llegada (F. Llegada de la ficha), Factura y
// Albarán (fecha de recepción). Estado: Pedid. = sin recibir, Albar. = recibido.

export const INFORMES_COMPRA = [
  { value: 'factura_resumida', label: 'Factura Resumida' },
  { value: 'relacion', label: 'Relación sin Agrupar' },
  { value: 'totales_proveedor', label: 'Totales por Proveedor' },
  { value: 'mensual_proveedor', label: 'Totales Mensuales por Proveedor' },
]

const INFORMES = [INFORMES_COMPRA[0], { value: 'desglosado', label: 'Pedidos Desglosados (con líneas)' }, ...INFORMES_COMPRA.slice(1)]

const ORDENES = [
  { value: 'fechahora', label: 'Pedidcab.Fechahora' },
  { value: 'numero', label: 'Pedidcab.Numero' },
  { value: 'proveedor', label: 'Proveedor (nombre)' },
  { value: 'total', label: 'Total (de mayor a menor)' },
]

const CAMPOS_FECHA = [
  { value: 'alta', label: 'Alta' },
  { value: 'solicitud', label: 'Solicitud' },
  { value: 'llegada', label: 'Llegada' },
  { value: 'factura', label: 'Factura' },
  { value: 'albaran', label: 'Albarán' },
]

interface FiltroFecha {
  modo: 'no' | 'desdeHasta'
  desde: string
  hasta: string
}

/** «Filtrar Según Fecha»: campo, No Filtrar / Desde-Hasta y dos fechas. */
export function GrupoFiltroFecha({
  campo,
  valor,
  onChange,
  conHora,
  campoGris,
}: {
  campo: string
  valor: FiltroFecha
  onChange: (v: FiltroFecha) => void
  conHora?: boolean
  campoGris?: boolean
}) {
  const set = (p: Partial<FiltroFecha>) => onChange({ ...valor, ...p })
  return (
    <LstGrupo titulo={<span className={campoGris ? 'text-[#8a8a8a]' : ''}>Filtrar Según Fecha</span>}>
      <div className="grid grid-cols-2 gap-x-4 gap-y-[6px] pt-1">
        <select className={`${LST_INPUT} h-[30px]! text-[18px]!`} disabled={campoGris} defaultValue="c">
          <option value="c">{campo}</option>
        </select>
        <select className={`${LST_INPUT} h-[30px]! text-[18px]!`} value={valor.modo} onChange={(e) => set({ modo: e.target.value as FiltroFecha['modo'] })}>
          <option value="no">No Filtrar</option>
          <option value="desdeHasta">Desde/Hasta</option>
        </select>
        <CampoFechaHora valor={valor.desde} onChange={(v) => set({ desde: v })} disabled={valor.modo === 'no'} soloFecha={!conHora} alto={28} />
        <CampoFechaHora valor={valor.hasta} onChange={(v) => set({ hasta: v })} disabled={valor.modo === 'no'} soloFecha={!conHora} finDeDia alto={28} />
      </div>
    </LstGrupo>
  )
}

export function ListadoPedidosProveedorPage() {
  const inf = useInforme()
  const [informe, setInforme] = useState('factura_resumida')
  const [tallas, setTallas] = useState(false)
  const [orden, setOrden] = useState('fechahora')
  const [destino, setDestino] = useState<Destino>('pantalla')
  const [tNum, setTNum] = useState(tiendaNumero())
  const [almacenes, setAlmacenes] = useState(rango())
  const [campoFecha, setCampoFecha] = useState('llegada')
  const [fecha, setFecha] = useState<RangoFecha>({
    modo: 'cualquiera',
    desde: '',
    hasta: '',
  })
  const [fePor, setFePor] = useState<'formaPago' | 'estado'>('formaPago')
  const [formaEstado, setFormaEstado] = useState(rango())
  const [est, setEst] = useState<Record<'pendientes' | 'actualizados' | 'negativos' | 'pedidos' | 'facturados', Par>>({
    pendientes: par(),
    actualizados: par(),
    negativos: par(),
    pedidos: par(),
    facturados: par(),
  })
  const [proveedores, setProveedores] = useState(rango())
  const [totProv, setTotProv] = useState(totalProveedor())
  const [campoArt, setCampoArt] = useState({
    modo: 'no',
    desde: '',
    hasta: '',
  })
  const [fechaPago, setFechaPago] = useState<FiltroFecha>({
    modo: 'no',
    desde: '',
    hasta: '',
  })
  const [fechaMod, setFechaMod] = useState<FiltroFecha>({
    modo: 'no',
    desde: '',
    hasta: '',
  })

  function procesar() {
    const p = {
      informe,
      orden,
      tiendaNumero: tiendaNumeroSql(tNum),
      almacenes: rangoSql(almacenes),
      campoFecha,
      fecha,
      formaEstadoPor: fePor,
      formaEstado: rangoSql(formaEstado),
      ...est,
      proveedores: rangoSql(proveedores),
      totalProveedor: totalProveedorSql(totProv),
      campoArticulo: campoArt,
      fechaPago: {
        ...fechaPago,
        desde: fechaPago.desde.slice(0, 10),
        hasta: fechaPago.hasta.slice(0, 10),
      },
      fechaModPrecios: fechaMod,
    }
    const imp: ColumnaInforme[] = [
      { key: 'base', titulo: 'Base Imp.', tipo: 'num', ancho: 80 },
      { key: 'igic', titulo: 'IGIC', tipo: 'num', ancho: 65 },
      { key: 'total', titulo: 'Total', tipo: 'num', ancho: 85 },
    ]
    const columnas: ColumnaInforme[] =
      informe === 'desglosado'
        ? [
            { key: 'descripcion', titulo: 'Artículo' },
            {
              key: 'cantidad',
              titulo: 'Cantidad',
              tipo: 'num',
              dec: 3,
              ancho: 65,
              suma: false,
            },
            {
              key: 'precio',
              titulo: 'Precio',
              tipo: 'num',
              dec: 3,
              ancho: 65,
              suma: false,
            },
            {
              key: 'dto',
              titulo: 'Dto. %',
              tipo: 'num',
              ancho: 50,
              suma: false,
            },
            ...imp,
          ]
        : informe === 'totales_proveedor'
          ? [
              { key: 'clave', titulo: 'Proveedor', ancho: 70 },
              { key: 'descripcion', titulo: 'Nombre' },
              { key: 'n', titulo: 'Nº Pedidos', tipo: 'entero', ancho: 70 },
              ...imp,
            ]
          : informe === 'mensual_proveedor'
            ? [{ key: 'descripcion', titulo: 'Mes' }, { key: 'n', titulo: 'Nº Pedidos', tipo: 'entero', ancho: 70 }, ...imp]
            : [
                { key: 'descripcion', titulo: 'Pedido' },
                { key: 'fecha', titulo: `F. ${CAMPOS_FECHA.find((c) => c.value === campoFecha)?.label}`, tipo: 'fecha', ancho: 70 },
                { key: 'documento', titulo: 'Nº Alb./Fact. Prov.', ancho: 110 },
                { key: 'estado', titulo: 'Estado', ancho: 80 },
                ...imp,
              ]
    const etiquetaFecha = CAMPOS_FECHA.find((c) => c.value === campoFecha)?.label.toLowerCase()
    inf.procesar(
      {
        titulo: `Listado de Pedidos a Proveedores - ${INFORMES.find((i) => i.value === informe)?.label}`,
        sinCaptura: true,
        columnas,
        filtros: [
          describirTiendaNumero('Tienda y número', tNum),
          describirRango('Almacenes', almacenes),
          describirFecha(`Fecha de ${etiquetaFecha}`, fecha),
          describirRango(fePor === 'estado' ? 'Estado del pedido' : 'Formas de pago', formaEstado),
          describirPar('Pendientes de pago', 'Pagados', est.pendientes),
          describirPar('Actualizados (stock movido)', 'Sin actualizar', est.actualizados),
          describirPar('Negativos', 'Positivos', est.negativos),
          describirPar('Pedidos (sin recibir)', 'Albaranes (recibidos)', est.pedidos),
          describirPar('Facturados', 'Sin facturar', est.facturados),
          describirRango('Proveedores', proveedores),
          describirTotalProveedor(totProv),
          campoArt.modo !== 'no' && `Marca de los artículos: ${campoArt.desde || '…'} a ${campoArt.hasta || '…'}`,
          fechaPago.modo !== 'no' &&
            `Fecha de pago al proveedor: ${fechaHoraEs(fechaPago.desde).split(' ')[0] || '…'} a ${fechaHoraEs(fechaPago.hasta).split(' ')[0] || '…'}`,
          fechaMod.modo !== 'no' && `Última modificación de precios: ${fechaHoraEs(fechaMod.desde) || '…'} a ${fechaHoraEs(fechaMod.hasta) || '…'}`,
          tallas && 'Desglosar tallas y colores: el ERP no maneja tallas en los pedidos (sin efecto)',
        ],
        cargar: () => rpc('fn_lst_pedidos_proveedor', p),
      },
      destino,
    )
  }

  const boton = (label: string, k: keyof typeof est, lado: 'si' | 'no') => (
    <BotonOpcion label={label} on={est[k][lado]} set={(v) => setEst({ ...est, [k]: { ...est[k], [lado]: v } })} />
  )

  return (
    <>
      <ListadoVentana
        informes={INFORMES}
        informe={informe}
        onInforme={setInforme}
        cabeceraExtra={<LstCheck label="Desglosar Tallas y Colores" on={tallas} set={setTallas} title="El ERP no maneja tallas y colores en los pedidos" />}
        ordenes={ORDENES}
        orden={orden}
        onOrden={setOrden}
        destino={destino}
        onDestino={setDestino}
        onProcesar={procesar}
        procesando={inf.cargando}
      >
        {inf.error && <div className="border border-[#c42b1c] bg-[#fde7e9] px-2 py-1 text-[14px] text-[#c42b1c]">{inf.error}</div>}
        <div className="grid grid-cols-[minmax(0,2.25fr)_minmax(0,1fr)] gap-2">
          <GrupoTiendaNumero nombre="pp-tnum" titulo="Tienda y Número" valor={tNum} onChange={setTNum} />
          <GrupoRango nombre="pp-alm" titulo="Almacen" valor={almacenes} onChange={setAlmacenes} buscador="almacen" />
        </div>
        <div className="grid grid-cols-[minmax(0,2.25fr)_minmax(0,1fr)] gap-2">
          <GrupoFecha nombre="pp-fecha" campos={CAMPOS_FECHA} campo={campoFecha} onCampo={setCampoFecha} valor={fecha} onChange={setFecha} />
          <GrupoRango
            nombre="pp-fe"
            titulo={
              <>
                <LstRadio nombre="pp-fepor" label="Formas de Pago" on={fePor === 'formaPago'} set={() => setFePor('formaPago')} />
                <LstRadio nombre="pp-fepor" label="Estado Ped." on={fePor === 'estado'} set={() => setFePor('estado')} />
              </>
            }
            valor={formaEstado}
            onChange={setFormaEstado}
            buscador={fePor === 'formaPago' ? 'formaPago' : undefined}
          />
        </div>
        <div className="grid grid-cols-[minmax(0,1.95fr)_minmax(0,1.3fr)] gap-2">
          <LstGrupo titulo="Filtros según estado">
            <div className="grid grid-cols-5 gap-y-1.5 pt-1">
              {boton('Pendientes', 'pendientes', 'si')}
              {boton('Actualiz.', 'actualizados', 'si')}
              {boton('Negativ.', 'negativos', 'si')}
              {boton('Pedid.', 'pedidos', 'si')}
              {boton('Factur.', 'facturados', 'si')}
              {boton('Pagados', 'pendientes', 'no')}
              {boton('Sin Act.', 'actualizados', 'no')}
              {boton('Positiv.', 'negativos', 'no')}
              {boton('Albar.', 'pedidos', 'no')}
              {boton('Sin Fact.', 'facturados', 'no')}
            </div>
          </LstGrupo>
          <GrupoRango nombre="pp-prov" titulo="Proveedores" valor={proveedores} onChange={setProveedores} buscador="proveedor" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <GrupoTotalProveedor valor={totProv} onChange={setTotProv} />
          <LstGrupo titulo={<span className="text-[#8a8a8a]">Filtrar Según Campo</span>}>
            <div className="grid grid-cols-2 gap-x-4 gap-y-[6px] pt-1">
              <select className={`${LST_INPUT} h-[30px]! text-[18px]!`} disabled defaultValue="marca" title="Campo de los artículos del pedido">
                <option value="marca">Marca</option>
              </select>
              <select
                className={`${LST_INPUT} h-[30px]! text-[18px]!`}
                value={campoArt.modo}
                onChange={(e) => setCampoArt({ ...campoArt, modo: e.target.value })}
              >
                <option value="no">No Filtrar</option>
                <option value="desdeHasta">Desde/Hasta</option>
              </select>
              <CampoCodigo valor={campoArt.desde} onChange={(v) => setCampoArt({ ...campoArt, desde: v })} buscador="marca" disabled={campoArt.modo === 'no'} />
              <CampoCodigo valor={campoArt.hasta} onChange={(v) => setCampoArt({ ...campoArt, hasta: v })} buscador="marca" disabled={campoArt.modo === 'no'} />
            </div>
          </LstGrupo>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <GrupoFiltroFecha campo="Fecha pago Prov." valor={fechaPago} onChange={setFechaPago} />
          <GrupoFiltroFecha campo="F. Últ. Mod. de precios" valor={fechaMod} onChange={setFechaMod} conHora campoGris />
        </div>
      </ListadoVentana>
      {inf.vista}
    </>
  )
}
