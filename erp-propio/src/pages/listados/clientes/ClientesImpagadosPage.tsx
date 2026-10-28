import { useState } from 'react'
import {
  CampoFechaHora,
  LST_INPUT,
  LstCheck,
  LstGrupo,
  ListadoVentana,
  fechaEs,
  hoyIso,
  useInforme,
  type ColumnaInforme,
  type Destino,
} from '../../../components/gw/GwListado'
import { rpc } from '../comun'
import { ErrorListado, GruposCliente, soloFecha, useFiltrosCliente } from './comunClientes'

// Clientes → Listados → Cli. que no han pagado. SIN CAPTURA de GeminisWin. Clientes con importe
// VENCIDO sin cobrar a la fecha de corte, con la antigüedad de la deuda (días desde el
// vencimiento de cada factura o plazo). Cálculo en fn_lst_clientes_impagados.

const INFORMES = [
  { value: 'resumen', label: 'Clientes que no han pagado (resumen por antigüedad)' },
  { value: 'detalle', label: 'Clientes que no han pagado (documentos vencidos)' },
]

const ORDENES = [
  { value: 'codigo', label: 'Clientes.Codigo / Vencimiento' },
  { value: 'nombre', label: 'Clientes.Nombre' },
  { value: 'importe', label: 'Importe vencido (de mayor a menor)' },
  { value: 'antiguedad', label: 'Antigüedad (de más a menos días)' },
]

const num = (s: string) => s.replace(/\./g, '').replace(',', '.').trim()

export function ClientesImpagadosPage() {
  const inf = useInforme()
  const fc = useFiltrosCliente(false)
  const [informe, setInforme] = useState('resumen')
  const [orden, setOrden] = useState('codigo')
  const [destino, setDestino] = useState<Destino>('pantalla')
  const [soloTotales, setSoloTotales] = useState(false)
  const [corte, setCorte] = useState(`${hoyIso()}T23:59:59`)
  const [dias, setDias] = useState('0')
  const [minimo, setMinimo] = useState('0,00')

  function procesar() {
    const p = { informe, orden, ...fc.sql(), corte: soloFecha(corte), diasMinimo: dias.trim() || '0', importeMinimo: num(minimo) || '0' }
    const tramos: ColumnaInforme[] = [
      { key: 't0_30', titulo: '0-30 días', tipo: 'num', ancho: 70 },
      { key: 't31_60', titulo: '31-60 días', tipo: 'num', ancho: 70 },
      { key: 't61_90', titulo: '61-90 días', tipo: 'num', ancho: 70 },
      { key: 't90', titulo: '+90 días', tipo: 'num', ancho: 70 },
      { key: 'vencido', titulo: 'Total Vencido', tipo: 'num', ancho: 80 },
    ]
    const columnas: ColumnaInforme[] =
      informe === 'detalle'
        ? [
            { key: 'descripcion', titulo: 'Documento' },
            { key: 'fecha', titulo: 'Fecha', tipo: 'fecha', ancho: 68 },
            { key: 'vencimiento', titulo: 'Vencim.', tipo: 'fecha', ancho: 68 },
            { key: 'dias', titulo: 'Días', tipo: 'entero', ancho: 40, suma: false },
            ...tramos,
          ]
        : [
            { key: 'clave', titulo: 'Cliente', ancho: 50 },
            { key: 'descripcion', titulo: 'Nombre' },
            { key: 'telefono', titulo: 'Teléfono', ancho: 100 },
            { key: 'vencimiento', titulo: 'Vto. más antiguo', tipo: 'fecha', ancho: 75 },
            { key: 'dias', titulo: 'Días', tipo: 'entero', ancho: 40, suma: false },
            ...tramos,
            { key: 'no_vencido', titulo: 'No Vencido', tipo: 'num', ancho: 75 },
            { key: 'limite_deuda', titulo: 'Lím. Deuda', tipo: 'num', ancho: 70, suma: false },
          ]
    inf.procesar(
      {
        titulo: `${INFORMES.find((i) => i.value === informe)?.label} a ${fechaEs(soloFecha(corte))}`,
        sinCaptura: true,
        soloTotales,
        apaisado: true,
        columnas,
        filtros: [
          `Fecha de corte: ${fechaEs(soloFecha(corte))} (vencido = vencimiento hasta esa fecha)`,
          Number(dias) > 0 && `Antigüedad mínima: ${dias} días`,
          Number(num(minimo)) > 0 && `Importe vencido mínimo: ${minimo}`,
          ...fc.describir(),
        ],
        cargar: () => rpc('fn_lst_clientes_impagados', p),
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
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] gap-2">
          <LstGrupo titulo="Deuda Vencida a Fecha">
            <div className="flex items-center gap-2 pt-1">
              <CampoFechaHora className="w-[230px] flex-none" valor={corte} onChange={setCorte} soloFecha finDeDia />
            </div>
          </LstGrupo>
          <LstGrupo titulo="Antigüedad Mínima (días)">
            <div className="flex items-center gap-2 pt-1">
              <input className={`${LST_INPUT} w-[110px]! text-right`} value={dias} onChange={(e) => setDias(e.target.value.replace(/\D/g, ''))} />
              <span className="text-[15px] text-[#555]">desde el vencimiento</span>
            </div>
          </LstGrupo>
          <LstGrupo titulo="Importe Vencido Mínimo">
            <div className="pt-1">
              <input className={`${LST_INPUT} w-[150px]! text-right`} value={minimo} onChange={(e) => setMinimo(e.target.value)} />
            </div>
          </LstGrupo>
        </div>
        <GruposCliente fc={fc} prefijo="lim" />
      </ListadoVentana>
      {inf.vista}
    </>
  )
}
