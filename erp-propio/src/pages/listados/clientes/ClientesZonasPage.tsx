import { useState } from 'react'
import { BotonOpcion, LstCheck, LstGrupo, ListadoVentana, useInforme, type ColumnaInforme, type Destino } from '../../../components/gw/GwListado'
import { rpc } from '../comun'
import { ErrorListado, GruposCliente, useFiltrosCliente } from './comunClientes'

// Clientes → Listados → Por Zonas Terr., Vendedores, Facturas y Artículos Pend. SIN CAPTURA de
// GeminisWin. Cuatro informes en fn_lst_clientes_zonas: clientes por zona territorial o por
// vendedor (pendiente de cobro y pendiente de servir de cada uno), facturas/ventas pendientes de
// cobro por cliente y artículos pendientes de servir de sus pedidos.

const INFORMES = [
  { value: 'zona', label: 'Clientes por Zona Territorial (pendiente de cobro y de servir)' },
  { value: 'vendedor', label: 'Clientes por Vendedor (pendiente de cobro y de servir)' },
  { value: 'facturas', label: 'Facturas y Ventas Pendientes de Cobro por Cliente' },
  { value: 'articulos', label: 'Artículos Pendientes de Servir por Cliente' },
]

const ORDENES = [
  { value: 'codigo', label: 'Clientes.Codigo / Fecha' },
  { value: 'nombre', label: 'Clientes.Nombre / Descripción' },
  { value: 'importe', label: 'Importe pendiente (de mayor a menor)' },
]

export function ClientesZonasPage() {
  const inf = useInforme()
  const fc = useFiltrosCliente()
  const [informe, setInforme] = useState('zona')
  const [orden, setOrden] = useState('codigo')
  const [destino, setDestino] = useState<Destino>('pantalla')
  const [soloTotales, setSoloTotales] = useState(false)
  const [soloPendientes, setSoloPendientes] = useState(true)

  function procesar() {
    const p = { informe, orden, ...fc.sql(), soloPendientes }
    const columnas: ColumnaInforme[] =
      informe === 'facturas'
        ? [
            { key: 'descripcion', titulo: 'Tipo', ancho: 65 },
            { key: 'documento', titulo: 'Documento' },
            { key: 'fecha', titulo: 'Fecha', tipo: 'fecha', ancho: 70 },
            { key: 'vencimiento', titulo: 'Vencimiento', tipo: 'fecha', ancho: 75 },
            { key: 'importe', titulo: 'Importe Doc.', tipo: 'num', ancho: 80, suma: false },
            { key: 'pend_cobro', titulo: 'Pendiente', tipo: 'num', ancho: 80 },
          ]
        : informe === 'articulos'
          ? [
              { key: 'documento', titulo: 'Pedido', ancho: 75 },
              { key: 'fecha', titulo: 'Fecha', tipo: 'fecha', ancho: 70 },
              { key: 'descripcion', titulo: 'Artículo' },
              { key: 'cantidad', titulo: 'Pedida', tipo: 'num', dec: 3, ancho: 60 },
              { key: 'servida', titulo: 'Servida', tipo: 'num', dec: 3, ancho: 60 },
              { key: 'pend_cantidad', titulo: 'Pendiente', tipo: 'num', dec: 3, ancho: 65 },
              { key: 'pend_servir', titulo: 'Importe Pend.', tipo: 'num', ancho: 80 },
            ]
          : [
              { key: 'clave', titulo: 'Cliente', ancho: 55 },
              { key: 'descripcion', titulo: 'Nombre' },
              { key: 'poblacion', titulo: 'Población', ancho: 110 },
              { key: 'n_docs', titulo: 'Nº Doc. Pend.', tipo: 'entero', ancho: 70 },
              { key: 'pend_cobro', titulo: 'Pend. de Cobro', tipo: 'num', ancho: 85 },
              { key: 'pend_cantidad', titulo: 'Uds. Pend. Servir', tipo: 'num', dec: 3, ancho: 85 },
              { key: 'pend_servir', titulo: 'Importe Pend. Servir', tipo: 'num', ancho: 95 },
            ]
    inf.procesar(
      {
        titulo: INFORMES.find((i) => i.value === informe)?.label ?? 'Clientes',
        sinCaptura: true,
        soloTotales,
        apaisado: informe === 'zona' || informe === 'vendedor',
        columnas,
        filtros: [
          ...fc.describir(),
          (informe === 'zona' || informe === 'vendedor') && soloPendientes && 'Solo clientes con algo pendiente de cobro o de servir',
        ],
        aviso:
          informe === 'articulos' || informe === 'zona' || informe === 'vendedor'
            ? 'Pendiente de servir: líneas de pedidos no anulados ni entregados, cantidad pedida menos unidades liquidadas.'
            : undefined,
        cargar: () => rpc('fn_lst_clientes_zonas', p),
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
        <GruposCliente fc={fc} prefijo="lz" />
        <div className="grid grid-cols-2 gap-2">
          <LstGrupo titulo="Clientes a Listar" disabled={informe !== 'zona' && informe !== 'vendedor'}>
            <div className="pt-1">
              <BotonOpcion
                label="Solo con algo pendiente de cobro o de servir"
                on={soloPendientes}
                set={setSoloPendientes}
                disabled={informe !== 'zona' && informe !== 'vendedor'}
                className="w-full"
              />
            </div>
          </LstGrupo>
        </div>
      </ListadoVentana>
      {inf.vista}
    </>
  )
}
