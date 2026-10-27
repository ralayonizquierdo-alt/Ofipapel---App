import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { GwDate } from '../../components/gw'
import { DLG, DialogoListado, DlgCodigoNombre, DlgDestino, fechaEs, hoyIso, useInforme, type ColumnaInforme } from '../../components/gw/GwListado'
import { rpc } from './comun'

// Ventas → Listados → List. Presupuestos (captura 06-04: diálogo pequeño «Listado de
// presupuestos»). Los campos vienen rellenos con el primer y el último código, como en
// GeminisWin. La segunda columna de «Tienda» son los vendedores (desde/hasta).
// Columnas del informe sin captura: confirmar con Luis. Cálculo en fn_lst_presupuestos.

const AGRUPADO = [
  { value: 'secuencial', label: 'Secuencial' },
  { value: 'cliente', label: 'Cliente' },
  { value: 'vendedor', label: 'Vendedor' },
  { value: 'tienda', label: 'Tienda' },
  { value: 'fecha', label: 'Fecha' },
]

async function extremo(tabla: string, col: string, asc: boolean, soloPresupuestos = false) {
  let q = supabase.from(tabla).select(col)
  if (soloPresupuestos) q = q.eq('es_presupuesto', true)
  const { data } = await q.order(col, { ascending: asc }).limit(1)
  const fila = data?.[0] as Record<string, unknown> | undefined
  return fila ? String(fila[col] ?? '') : ''
}

export function ListadoPresupuestosPage() {
  const inf = useInforme()
  const [f, setF] = useState({
    fechaDesde: null as string | null,
    fechaHasta: hoyIso() as string | null,
    numeroDesde: '',
    numeroHasta: '',
    tiendaDesde: '',
    tiendaHasta: '',
    vendedorDesde: '',
    vendedorHasta: '',
    clienteDesde: '0',
    clienteHasta: '',
    agrupado: 'secuencial',
  })
  const [destino, setDestino] = useState<'pantalla' | 'impresora'>('pantalla')
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }))

  useEffect(() => {
    Promise.all([
      extremo('pedido_cliente', 'numero', true, true),
      extremo('pedido_cliente', 'numero', false, true),
      extremo('tienda_terminal', 'codigo', true),
      extremo('tienda_terminal', 'codigo', false),
      extremo('vendedor', 'codigo', true),
      extremo('vendedor', 'codigo', false),
      extremo('cliente', 'codigo', false),
    ]).then(([nd, nh, td, th, vd, vh, ch]) =>
      setF((x) => ({ ...x, numeroDesde: nd, numeroHasta: nh, tiendaDesde: td, tiendaHasta: th, vendedorDesde: vd, vendedorHasta: vh, clienteHasta: ch })),
    )
  }, [])

  function aceptar() {
    const columnas: ColumnaInforme[] = [
      { key: 'documento', titulo: 'Nº Presup.', ancho: 70 },
      { key: 'fecha', titulo: 'Fecha', tipo: 'fecha', ancho: 66 },
      { key: 'cliente', titulo: 'Cliente' },
      { key: 'vendedor', titulo: 'Vend.', ancho: 40 },
      { key: 'estado', titulo: 'Estado', ancho: 80 },
      { key: 'base', titulo: 'Base Imp.', tipo: 'num', ancho: 75 },
      { key: 'igic', titulo: 'IGIC', tipo: 'num', ancho: 60 },
      { key: 'total', titulo: 'Total', tipo: 'num', ancho: 75 },
    ]
    inf.procesar(
      {
        titulo: `Listado de Presupuestos${f.agrupado !== 'secuencial' ? ` agrupado por ${AGRUPADO.find((a) => a.value === f.agrupado)?.label}` : ''}`,
        sinCaptura: true,
        columnas,
        filtros: [
          `Periodo: ${fechaEs(f.fechaDesde) || '…'} a ${fechaEs(f.fechaHasta) || '…'}`,
          `Nº presupuesto: ${f.numeroDesde || '…'} a ${f.numeroHasta || '…'}`,
          `Tiendas: ${f.tiendaDesde || '…'} a ${f.tiendaHasta || '…'} · Vendedores: ${f.vendedorDesde || '…'} a ${f.vendedorHasta || '…'}`,
          `Clientes: ${f.clienteDesde || '…'} a ${f.clienteHasta || '…'}`,
        ],
        cargar: () =>
          rpc('fn_lst_presupuestos', {
            ...f,
            fechaDesde: f.fechaDesde ?? '',
            fechaHasta: f.fechaHasta ?? '',
            numeroDesde: f.numeroDesde.replace(/\D/g, ''),
            numeroHasta: f.numeroHasta.replace(/\D/g, ''),
            clienteDesde: f.clienteDesde === '0' ? '' : f.clienteDesde,
          }),
      },
      destino,
    )
  }

  return (
    <>
      <DialogoListado titulo="Listado de presupuestos" ancho={322} onAceptar={aceptar} procesando={inf.cargando}>
        {inf.error && <div className="text-[11px] text-[#c42b1c]">{inf.error}</div>}
        <div className="flex justify-between gap-2">
          <div>
            <div className={DLG.etiqueta}>Periodo:</div>
            <div className={`${DLG.marco} flex gap-[3px] bg-transparent! p-[2px]!`}>
              <GwDate className={DLG.fecha} value={f.fechaDesde} onChange={(v) => set({ fechaDesde: v })} title="Desde" />
              <GwDate className={DLG.fecha} value={f.fechaHasta} onChange={(v) => set({ fechaHasta: v })} title="Hasta" />
            </div>
          </div>
          <div>
            <div className={DLG.etiqueta}>Nº Presupuesto</div>
            <div className={`${DLG.marco} flex gap-[3px] p-[2px]!`}>
              <input className={`${DLG.input} w-[62px] text-right`} value={f.numeroDesde} onChange={(e) => set({ numeroDesde: e.target.value })} title="Desde" />
              <input className={`${DLG.input} w-[62px] text-right`} value={f.numeroHasta} onChange={(e) => set({ numeroHasta: e.target.value })} title="Hasta" />
            </div>
          </div>
        </div>
        <div>
          <div className={DLG.etiqueta}>Tienda</div>
          <div className="flex gap-1.5">
            <div className={`${DLG.marco} flex flex-col gap-[2px]`}>
              <DlgCodigoNombre valor={f.tiendaDesde} onChange={(v) => set({ tiendaDesde: v })} buscador="tienda" anchoCodigo={18} anchoNombre={118} title="Tienda desde" />
              <DlgCodigoNombre valor={f.tiendaHasta} onChange={(v) => set({ tiendaHasta: v })} buscador="tienda" anchoCodigo={18} anchoNombre={118} title="Tienda hasta" />
            </div>
            <div className={`${DLG.marco} flex flex-col gap-[2px]`}>
              <DlgCodigoNombre valor={f.vendedorDesde} onChange={(v) => set({ vendedorDesde: v })} buscador="vendedor" anchoCodigo={26} anchoNombre={106} title="Vendedor desde" />
              <DlgCodigoNombre valor={f.vendedorHasta} onChange={(v) => set({ vendedorHasta: v })} buscador="vendedor" anchoCodigo={26} anchoNombre={106} title="Vendedor hasta" />
            </div>
          </div>
        </div>
        <div className="ml-7">
          <div className={DLG.etiqueta}>Cliente</div>
          <div className={`${DLG.marco} inline-grid grid-cols-[auto_auto] items-center gap-x-1 gap-y-[2px]`}>
            <span className={DLG.etiqueta}>Desde</span>
            <DlgCodigoNombre valor={f.clienteDesde} onChange={(v) => set({ clienteDesde: v })} buscador="cliente" anchoCodigo={62} anchoNombre={150} title="Cliente desde" />
            <span className={DLG.etiqueta}>Hasta</span>
            <DlgCodigoNombre valor={f.clienteHasta} onChange={(v) => set({ clienteHasta: v })} buscador="cliente" anchoCodigo={62} anchoNombre={150} title="Cliente hasta" />
          </div>
        </div>
        <div className="flex items-center justify-center gap-1.5 pt-1">
          <span className={DLG.etiqueta}>Agrupado por :</span>
          <select className="h-[19px] border border-[#7f7f7f] bg-white text-[12px]" value={f.agrupado} onChange={(e) => set({ agrupado: e.target.value })}>
            {AGRUPADO.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex justify-center [&>div]:flex-row! [&>div]:gap-10! [&>div]:border-0! [&>div]:bg-transparent!">
          <DlgDestino nombre="pres-dest" valor={destino} onChange={setDestino} />
        </div>
      </DialogoListado>
      {inf.vista}
    </>
  )
}
