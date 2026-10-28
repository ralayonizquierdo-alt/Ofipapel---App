import { useState } from 'react'
import { BotonOpcion, LstCheck, LstGrupo, ListadoVentana, describirPar, par, useInforme, type ColumnaInforme, type Destino } from '../../../components/gw/GwListado'
import { rpc } from '../comun'
import { ErrorListado, GruposCliente, useFiltrosCliente } from './comunClientes'

// Clientes → Listados → List. de Clientes. SIN CAPTURA de GeminisWin: filtros y columnas a
// confirmar con Luis. Cálculo en fn_lst_clientes (la deuda es la de la ficha, cliente.deuda_actual;
// se pone al día con Clientes → Recalcular deuda).

const INFORMES = [
  { value: 'general', label: 'Listado General de Clientes' },
  { value: 'zona', label: 'Clientes Agrupados por Zona Territorial' },
  { value: 'vendedor', label: 'Clientes Agrupados por Vendedor' },
  { value: 'tipo', label: 'Clientes Agrupados por Tipo de Cliente' },
  { value: 'ruta', label: 'Clientes Agrupados por Ruta de Reparto' },
  { value: 'poblacion', label: 'Clientes Agrupados por Población' },
]

const ORDENES = [
  { value: 'codigo', label: 'Clientes.Codigo' },
  { value: 'nombre', label: 'Clientes.Nombre' },
  { value: 'poblacion', label: 'Clientes.Poblacion' },
  { value: 'deuda', label: 'Deuda actual (de mayor a menor)' },
]

export function ListadoClientesPage() {
  const inf = useInforme()
  const fc = useFiltrosCliente()
  const [informe, setInforme] = useState('general')
  const [orden, setOrden] = useState('codigo')
  const [destino, setDestino] = useState<Destino>('pantalla')
  const [soloTotales, setSoloTotales] = useState(false)
  const [conDeuda, setConDeuda] = useState(par())
  const [bloqueados, setBloqueados] = useState(par())
  const [excede, setExcede] = useState(false)

  function procesar() {
    const p = { informe, orden, ...fc.sql(), conDeuda, bloqueados, excedeLimite: excede }
    const columnas: ColumnaInforme[] = [
      { key: 'clave', titulo: 'Código', ancho: 55 },
      { key: 'descripcion', titulo: 'Nombre' },
      { key: 'nif', titulo: 'N.I.F.', ancho: 75 },
      { key: 'poblacion', titulo: 'Población', ancho: 100 },
      { key: 'telefono', titulo: 'Teléfono', ancho: 110 },
      { key: 'vendedor', titulo: 'Vendedor', ancho: 95 },
      { key: 'forma_pago', titulo: 'Forma de Pago', ancho: 95 },
      { key: 'limite_deuda', titulo: 'Lím. Deuda', tipo: 'num', ancho: 70 },
      { key: 'deuda_actual', titulo: 'Deuda Actual', tipo: 'num', ancho: 75 },
      { key: 'n', titulo: 'Nº', tipo: 'entero', ancho: 35 },
    ]
    inf.procesar(
      {
        titulo: `Listado de Clientes - ${INFORMES.find((i) => i.value === informe)?.label}`,
        sinCaptura: true,
        apaisado: true,
        soloTotales,
        columnas,
        filtros: [
          ...fc.describir(),
          describirPar('Con deuda', 'Sin deuda', conDeuda),
          describirPar('Bloqueados', 'No bloqueados', bloqueados),
          excede && 'Solo los que superan su límite de deuda',
        ],
        cargar: () => rpc('fn_lst_clientes', p),
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
        <GruposCliente fc={fc} prefijo="lc" />
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-start gap-2">
          <LstGrupo titulo="Deuda del Cliente">
            <div className="grid grid-cols-2 gap-2 pt-1">
              <BotonOpcion label="Con Deuda" on={conDeuda.si} set={(v) => setConDeuda({ ...conDeuda, si: v })} />
              <BotonOpcion label="Sin Deuda" on={conDeuda.no} set={(v) => setConDeuda({ ...conDeuda, no: v })} />
              <BotonOpcion label="Bloqueados" on={bloqueados.si} set={(v) => setBloqueados({ ...bloqueados, si: v })} />
              <BotonOpcion label="No Bloqueados" on={bloqueados.no} set={(v) => setBloqueados({ ...bloqueados, no: v })} />
            </div>
          </LstGrupo>
          <LstGrupo titulo="Límite de Deuda">
            <div className="pt-1">
              <BotonOpcion
                label="Solo los que superan su límite de deuda"
                on={excede}
                set={setExcede}
                className="w-full"
                title="Clientes con límite de deuda puesto y deuda actual mayor que ese límite"
              />
            </div>
          </LstGrupo>
        </div>
      </ListadoVentana>
      {inf.vista}
    </>
  )
}
