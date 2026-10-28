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
import { rpc } from '../comun'
import { ErrorListado, GruposCliente, useFiltrosCliente } from './comunClientes'

// Facturación → Listados → L. Pend. de Cobro. SIN CAPTURA de GeminisWin. Vencimientos y
// documentos pendientes de cobro: facturas no anuladas y ventas sin facturar con pendiente; si
// tienen vencimientos (Gestor de Pagos de Clientes) sale cada plazo con su fecha. Cálculo en
// fn_lst_pendiente_cobro (sobre fn_cli_pendientes).

const INFORMES = [
  { value: 'cliente', label: 'Pendiente de Cobro por Cliente' },
  { value: 'vencimiento', label: 'Pendiente de Cobro por Fecha de Vencimiento' },
  { value: 'totales', label: 'Totales Pendientes por Cliente' },
]

const ORDENES = [
  { value: 'vencimiento', label: 'Fecha de Vencimiento' },
  { value: 'nombre', label: 'Clientes.Nombre' },
  { value: 'importe', label: 'Pendiente (de mayor a menor)' },
]

const sinFecha = (): RangoFecha => ({ modo: 'cualquiera', desde: '', hasta: '' })

export function PendienteCobroPage() {
  const inf = useInforme()
  const fc = useFiltrosCliente(false)
  const [informe, setInforme] = useState('cliente')
  const [orden, setOrden] = useState('vencimiento')
  const [destino, setDestino] = useState<Destino>('pantalla')
  const [soloTotales, setSoloTotales] = useState(false)
  const [fechaVenc, setFechaVenc] = useState<RangoFecha>(sinFecha)
  const [fechaDoc, setFechaDoc] = useState<RangoFecha>(sinFecha)
  const [formas, setFormas] = useState(rango())
  const [docs, setDocs] = useState(par())
  const [vencidos, setVencidos] = useState(par())

  function procesar() {
    const p = { informe, orden, ...fc.sql(), fechaVenc, fechaDoc, formasPago: rangoSql(formas), docs, vencidos }
    const columnas: ColumnaInforme[] =
      informe === 'totales'
        ? [
            { key: 'clave', titulo: 'Cliente', ancho: 60 },
            { key: 'descripcion', titulo: 'Nombre' },
            { key: 'vencimiento', titulo: 'Vto. más antiguo', tipo: 'fecha', ancho: 80 },
            { key: 'n', titulo: 'Nº Vtos.', tipo: 'entero', ancho: 55 },
            { key: 'pendiente', titulo: 'Pendiente', tipo: 'num', ancho: 85 },
          ]
        : [
            { key: 'descripcion', titulo: informe === 'vencimiento' ? 'Documento / Cliente' : 'Documento' },
            { key: 'tipo', titulo: 'Tipo', ancho: 60 },
            { key: 'fecha', titulo: 'Fecha', tipo: 'fecha', ancho: 68 },
            { key: 'vencimiento', titulo: 'Vencim.', tipo: 'fecha', ancho: 68 },
            { key: 'dias', titulo: 'Días venc.', tipo: 'entero', ancho: 55, suma: false },
            { key: 'forma_pago', titulo: 'Forma de Pago', ancho: 100 },
            { key: 'importe', titulo: 'Importe Doc.', tipo: 'num', ancho: 75, suma: false },
            { key: 'pendiente', titulo: 'Pendiente', tipo: 'num', ancho: 80 },
          ]
    inf.procesar(
      {
        titulo: `Listado de Pendiente de Cobro - ${INFORMES.find((i) => i.value === informe)?.label}`,
        sinCaptura: true,
        soloTotales,
        apaisado: informe === 'vencimiento',
        columnas,
        filtros: [
          describirFecha('Fecha de vencimiento', fechaVenc),
          describirFecha('Fecha del documento', fechaDoc),
          describirRango('Formas de pago', formas),
          describirPar('Solo facturas', 'Solo ventas sin facturar', docs),
          describirPar('Vencidos a hoy', 'Sin vencer', vencidos),
          ...fc.describir(),
        ],
        cargar: () => rpc('fn_lst_pendiente_cobro', p),
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
        <div className="grid grid-cols-2 gap-2">
          <GrupoFecha nombre="lpc-fv" titulo="Fecha de Vencimiento" soloFecha valor={fechaVenc} onChange={setFechaVenc} />
          <GrupoFecha nombre="lpc-fd" titulo="Fecha del Documento" soloFecha valor={fechaDoc} onChange={setFechaDoc} />
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,0.55fr)_minmax(0,0.55fr)] items-start gap-2">
          <GrupoRango nombre="lpc-fp" titulo="Formas de Pago" valor={formas} onChange={setFormas} buscador="formaPago" />
          <LstGrupo titulo="Documentos">
            <div className="grid grid-cols-1 gap-1.5 pt-1">
              <BotonOpcion label="Facturas" on={docs.si} set={(v) => setDocs({ ...docs, si: v })} />
              <BotonOpcion label="Ventas sin Facturar" on={docs.no} set={(v) => setDocs({ ...docs, no: v })} />
            </div>
          </LstGrupo>
          <LstGrupo titulo="Vencimiento (a hoy)">
            <div className="grid grid-cols-1 gap-1.5 pt-1">
              <BotonOpcion label="Vencidos" on={vencidos.si} set={(v) => setVencidos({ ...vencidos, si: v })} />
              <BotonOpcion label="Sin Vencer" on={vencidos.no} set={(v) => setVencidos({ ...vencidos, no: v })} />
            </div>
          </LstGrupo>
        </div>
        <GruposCliente fc={fc} prefijo="lpc" sinTipos />
      </ListadoVentana>
      {inf.vista}
    </>
  )
}
