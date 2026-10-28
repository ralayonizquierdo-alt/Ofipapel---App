import { useState } from 'react'
import { BotonOpcion, GrupoFecha, LstGrupo, ListadoVentana, describirFecha, useInforme, type ColumnaInforme, type Destino, type RangoFecha } from '../../../components/gw/GwListado'
import { rpc } from '../comun'
import { ErrorListado, GruposCliente, soloFecha, useFiltrosCliente } from './comunClientes'

// Facturación → Listados → Extracto clientes. SIN CAPTURA de GeminisWin. Por cliente entre dos
// fechas: saldo anterior, cargos (facturas y ventas sin facturar), abonos (cobros) y saldo
// acumulado. El saldo final de cada cliente es su pendiente de cobro. Cálculo en
// fn_lst_extracto_clientes.

const INFORMES = [{ value: 'extracto', label: 'Extracto de Cuenta de Clientes' }]
const ORDENES = [{ value: 'codigo', label: 'Clientes.Codigo, Fecha' }]

export function ExtractoClientesPage() {
  const inf = useInforme()
  const fc = useFiltrosCliente(false)
  const [informe, setInforme] = useState('extracto')
  const [orden, setOrden] = useState('codigo')
  const [destino, setDestino] = useState<Destino>('pantalla')
  const [fecha, setFecha] = useState<RangoFecha>(() => {
    const y = new Date().getFullYear()
    return { modo: 'desdeHasta', desde: `${y}-01-01T00:00:00`, hasta: `${y}-12-31T23:59:59` }
  })
  const [soloMov, setSoloMov] = useState(true)

  function procesar() {
    const conFechas = fecha.modo === 'desdeHasta'
    const p = { ...fc.sql(), desde: conFechas ? soloFecha(fecha.desde) : '', hasta: conFechas ? soloFecha(fecha.hasta) : '', soloConMovimientos: soloMov }
    const columnas: ColumnaInforme[] = [
      { key: 'fecha', titulo: 'Fecha', tipo: 'fecha', ancho: 68 },
      { key: 'documento', titulo: 'Documento', ancho: 95 },
      { key: 'descripcion', titulo: 'Concepto' },
      { key: 'cargo', titulo: 'Cargo', tipo: 'num', ancho: 80 },
      { key: 'abono', titulo: 'Abono', tipo: 'num', ancho: 80 },
      { key: 'saldo', titulo: 'Saldo', tipo: 'num', ancho: 85 },
    ]
    inf.procesar(
      {
        titulo: 'Extracto de Clientes',
        sinCaptura: true,
        columnas,
        filtros: [describirFecha('Periodo', fecha), soloMov ? 'Solo clientes con movimientos en el periodo' : 'Incluye clientes sin movimientos con saldo anterior', ...fc.describir()],
        aviso: 'Cargos: facturas y ventas sin facturar (un albarán facturado va en su factura). Abonos: cobros. En las filas de total, «Saldo» es el saldo final.',
        cargar: () => rpc('fn_lst_extracto_clientes', p),
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
        ordenes={ORDENES}
        orden={orden}
        onOrden={setOrden}
        destino={destino}
        onDestino={setDestino}
        onProcesar={procesar}
        procesando={inf.cargando}
      >
        <ErrorListado error={inf.error} />
        <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] items-start gap-2">
          <GrupoFecha nombre="ext-fecha" titulo="Periodo del Extracto" soloFecha valor={fecha} onChange={setFecha} />
          <LstGrupo titulo="Clientes a Listar">
            <div className="pt-1">
              <BotonOpcion label="Solo con movimientos en el periodo" on={soloMov} set={setSoloMov} className="w-full" />
            </div>
          </LstGrupo>
        </div>
        <GruposCliente fc={fc} prefijo="ext" />
      </ListadoVentana>
      {inf.vista}
    </>
  )
}
