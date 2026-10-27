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
import { INFORMES_COMPRA } from './ListadoPedidosProveedorPage'

// Compras → Listados de Facturas (captura 06-11: «Informes de Facturas de Proveedores»).
// Filtros calcados; columnas del informe sin captura: confirmar con Luis. Cálculo en
// fn_lst_facturas_proveedor (tabla factura_proveedor; el «número» es su id).

const ORDENES = [
  { value: 'fechahora', label: 'FactProv.Fechahora' },
  { value: 'fechafactura', label: 'FactProv.Fecha_Factura' },
  { value: 'numero', label: 'FactProv.Numero' },
  { value: 'proveedor', label: 'Proveedor (nombre)' },
  { value: 'total', label: 'Total (de mayor a menor)' },
]

export function ListadoFacturasProveedorPage() {
  const inf = useInforme()
  const [informe, setInforme] = useState('factura_resumida')
  const [soloTotales, setSoloTotales] = useState(false)
  const [orden, setOrden] = useState('fechahora')
  const [destino, setDestino] = useState<Destino>('pantalla')
  const [tNum, setTNum] = useState(tiendaNumero())
  const [almacenes, setAlmacenes] = useState(rango())
  const [campoFecha, setCampoFecha] = useState('alta')
  const [fecha, setFecha] = useState<RangoFecha>({ modo: 'cualquiera', desde: '', hasta: '' })
  const [formas, setFormas] = useState(rango())
  const [pendientes, setPendientes] = useState(par())
  const [negativas, setNegativas] = useState(par())
  const [fechaPago, setFechaPago] = useState<RangoFecha>({ modo: 'cualquiera', desde: '', hasta: '' })
  const [totProv, setTotProv] = useState(totalProveedor())
  const [proveedores, setProveedores] = useState(rango())

  function procesar() {
    const p = {
      informe,
      orden,
      tiendaNumero: tiendaNumeroSql(tNum),
      almacenes: rangoSql(almacenes),
      campoFecha,
      fecha,
      formasPago: rangoSql(formas),
      pendientes,
      negativas,
      fechaPago,
      totalProveedor: totalProveedorSql(totProv),
      proveedores: rangoSql(proveedores),
    }
    const imp: ColumnaInforme[] = [
      { key: 'base', titulo: 'Base Imp.', tipo: 'num', ancho: 80 },
      { key: 'igic', titulo: 'IGIC', tipo: 'num', ancho: 65 },
      { key: 'total', titulo: 'Total', tipo: 'num', ancho: 85 },
      { key: 'pendiente', titulo: 'Pendiente', tipo: 'num', ancho: 80 },
    ]
    const columnas: ColumnaInforme[] =
      informe === 'totales_proveedor'
        ? [{ key: 'clave', titulo: 'Proveedor', ancho: 70 }, { key: 'descripcion', titulo: 'Nombre' }, { key: 'n', titulo: 'Nº Facturas', tipo: 'entero', ancho: 70 }, ...imp]
        : informe === 'mensual_proveedor'
          ? [{ key: 'descripcion', titulo: 'Mes' }, { key: 'n', titulo: 'Nº Facturas', tipo: 'entero', ancho: 70 }, ...imp]
          : [
              { key: 'descripcion', titulo: 'Factura' },
              { key: 'fecha', titulo: 'F. Factura', tipo: 'fecha', ancho: 66 },
              { key: 'documento', titulo: 'Nº Fact. Prov.', ancho: 95 },
              { key: 'fecha_pago', titulo: 'F. Pago', tipo: 'fecha', ancho: 66 },
              { key: 'estado', titulo: 'Estado', ancho: 60 },
              ...imp,
            ]
    inf.procesar(
      {
        titulo: `Listado de Facturas de Proveedores - ${INFORMES_COMPRA.find((i) => i.value === informe)?.label}`,
        sinCaptura: true,
        soloTotales,
        apaisado: informe === 'factura_resumida' || informe === 'relacion',
        columnas,
        filtros: [
          describirTiendaNumero('Tienda y número', tNum),
          describirRango('Almacenes', almacenes),
          describirFecha(campoFecha === 'alta' ? 'Fecha de alta' : 'Fecha de factura', fecha),
          describirRango('Formas de pago', formas),
          describirPar('Pendientes de pago', 'Pagadas', pendientes),
          describirPar('Negativas', 'Positivas', negativas),
          describirFecha('Fecha de pago al proveedor', fechaPago),
          describirTotalProveedor(totProv),
          describirRango('Proveedores', proveedores),
        ],
        cargar: () => rpc('fn_lst_facturas_proveedor', p),
      },
      destino,
    )
  }

  return (
    <>
      <ListadoVentana
        informes={INFORMES_COMPRA}
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
        {inf.error && <div className="border border-[#c42b1c] bg-[#fde7e9] px-2 py-1 text-[14px] text-[#c42b1c]">{inf.error}</div>}
        <div className="grid grid-cols-[minmax(0,2.25fr)_minmax(0,1fr)] gap-2">
          <GrupoTiendaNumero nombre="fp-tnum" titulo="Tienda y Número" valor={tNum} onChange={setTNum} />
          <GrupoRango nombre="fp-alm" titulo="Almacen" valor={almacenes} onChange={setAlmacenes} buscador="almacen" />
        </div>
        <div className="grid grid-cols-[minmax(0,2.05fr)_minmax(0,1fr)] gap-2">
          <GrupoFecha
            nombre="fp-fecha"
            campos={[
              { value: 'alta', label: 'De Alta' },
              { value: 'factura', label: 'De Factura' },
            ]}
            campo={campoFecha}
            onCampo={setCampoFecha}
            valor={fecha}
            onChange={setFecha}
          />
          <GrupoRango nombre="fp-formas" titulo="Formas de pago" valor={formas} onChange={setFormas} buscador="formaPago" />
        </div>
        <div className="grid grid-cols-[minmax(0,0.75fr)_minmax(0,0.6fr)_minmax(0,1.35fr)] items-start gap-2">
          <LstGrupo titulo="Estado de la Factura">
            <div className="grid grid-cols-2 gap-y-1.5 pt-1">
              <BotonOpcion label="Pendientes" on={pendientes.si} set={(v) => setPendientes({ ...pendientes, si: v })} />
              <BotonOpcion label="Negativas" on={negativas.si} set={(v) => setNegativas({ ...negativas, si: v })} />
              <BotonOpcion label="Pagadas" on={pendientes.no} set={(v) => setPendientes({ ...pendientes, no: v })} />
              <BotonOpcion label="Positivas" on={negativas.no} set={(v) => setNegativas({ ...negativas, no: v })} />
            </div>
          </LstGrupo>
          <span />
          <GrupoFecha nombre="fp-fpago" titulo="Fecha de Pago del Proveedor" soloFecha valor={fechaPago} onChange={setFechaPago} className="mt-6" />
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,0.92fr)] gap-2">
          <GrupoTotalProveedor valor={totProv} onChange={setTotProv} />
          <GrupoRango nombre="fp-prov" titulo="Proveedores" valor={proveedores} onChange={setProveedores} buscador="proveedor" />
        </div>
      </ListadoVentana>
      {inf.vista}
    </>
  )
}
