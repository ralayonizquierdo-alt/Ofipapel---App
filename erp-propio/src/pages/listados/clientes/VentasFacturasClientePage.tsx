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
import { mesEnCurso, rpc } from '../comun'
import { ErrorListado, GruposCliente, useFiltrosCliente } from './comunClientes'

// Clientes → Listados → List. de Ventas y Facturas por Cliente. SIN CAPTURA de GeminisWin.
// Documentos de cada cliente entre fechas: facturas y ventas (tickets y albaranes) SIN facturar;
// un albarán ya facturado está dentro de su factura y no se cuenta dos veces. Cálculo en
// fn_lst_ventas_facturas_cliente.

const INFORMES = [
  { value: 'detalle', label: 'Ventas y Facturas por Cliente (documento a documento)' },
  { value: 'mensual', label: 'Totales Mensuales por Cliente' },
  { value: 'totales', label: 'Totales por Cliente' },
]

const ORDENES = [
  { value: 'codigo', label: 'Clientes.Codigo' },
  { value: 'nombre', label: 'Clientes.Nombre' },
  { value: 'total', label: 'Total (de mayor a menor, en Totales por Cliente)' },
]

export function VentasFacturasClientePage() {
  const inf = useInforme()
  const fc = useFiltrosCliente(false)
  const [informe, setInforme] = useState('detalle')
  const [orden, setOrden] = useState('codigo')
  const [destino, setDestino] = useState<Destino>('pantalla')
  const [soloTotales, setSoloTotales] = useState(false)
  const [fecha, setFecha] = useState<RangoFecha>(() => ({ modo: 'desdeHasta', ...mesEnCurso() }))
  const [tiendas, setTiendas] = useState(rango())
  const [docs, setDocs] = useState(par())
  const [pendientes, setPendientes] = useState(par())

  function procesar() {
    const p = { informe, orden, ...fc.sql(), fecha, tiendas: rangoSql(tiendas), docs, pendientes }
    const imp: ColumnaInforme[] = [
      { key: 'base', titulo: 'Base Imp.', tipo: 'num', ancho: 75 },
      { key: 'igic', titulo: 'IGIC', tipo: 'num', ancho: 60 },
      { key: 'total', titulo: 'Total', tipo: 'num', ancho: 80 },
      { key: 'pagado', titulo: 'Cobrado', tipo: 'num', ancho: 75 },
      { key: 'pendiente', titulo: 'Pendiente', tipo: 'num', ancho: 75 },
    ]
    const columnas: ColumnaInforme[] =
      informe === 'totales'
        ? [{ key: 'clave', titulo: 'Cliente', ancho: 60 }, { key: 'descripcion', titulo: 'Nombre' }, { key: 'n', titulo: 'Nº Doc.', tipo: 'entero', ancho: 50 }, ...imp]
        : informe === 'mensual'
          ? [{ key: 'descripcion', titulo: 'Mes' }, { key: 'n', titulo: 'Nº Doc.', tipo: 'entero', ancho: 50 }, ...imp]
          : [
              { key: 'descripcion', titulo: 'Documento' },
              { key: 'tipo', titulo: 'Tipo', ancho: 65 },
              { key: 'fecha', titulo: 'Fecha', tipo: 'fecha', ancho: 70 },
              ...imp,
            ]
    inf.procesar(
      {
        titulo: INFORMES.find((i) => i.value === informe)?.label ?? 'Ventas y Facturas por Cliente',
        sinCaptura: true,
        soloTotales,
        columnas,
        aviso: 'Los albaranes ya facturados no salen sueltos: se cuentan dentro de su factura.',
        filtros: [
          describirFecha('Fecha del documento', fecha),
          describirRango('Tiendas', tiendas),
          describirPar('Solo facturas', 'Solo ventas sin facturar', docs),
          describirPar('Pendientes de cobro', 'Cobrados', pendientes),
          ...fc.describir(),
        ],
        cargar: () => rpc('fn_lst_ventas_facturas_cliente', p),
      },
      destino,
    )
  }

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
        <div className="grid grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-2">
          <GrupoFecha nombre="vfc-fecha" titulo="Fecha del Documento" valor={fecha} onChange={setFecha} />
          <GrupoRango nombre="vfc-tiendas" titulo="Tiendas" valor={tiendas} onChange={setTiendas} buscador="tienda" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <LstGrupo titulo="Documentos">
            <div className="grid grid-cols-2 gap-2 pt-1">
              <BotonOpcion label="Facturas" on={docs.si} set={(v) => setDocs({ ...docs, si: v })} />
              <BotonOpcion label="Ventas sin Facturar" on={docs.no} set={(v) => setDocs({ ...docs, no: v })} />
            </div>
          </LstGrupo>
          <LstGrupo titulo="Estado del Cobro">
            <div className="grid grid-cols-2 gap-2 pt-1">
              <BotonOpcion label="Pendientes" on={pendientes.si} set={(v) => setPendientes({ ...pendientes, si: v })} />
              <BotonOpcion label="Cobrados" on={pendientes.no} set={(v) => setPendientes({ ...pendientes, no: v })} />
            </div>
          </LstGrupo>
        </div>
        <GruposCliente fc={fc} prefijo="vfc" />
      </ListadoVentana>
      {inf.vista}
    </>
  )
}
