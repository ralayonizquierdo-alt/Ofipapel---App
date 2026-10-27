import { useState } from 'react'
import { Check } from 'lucide-react'
import {
  BotonOpcion,
  BotonPulsado,
  GrupoFecha,
  GrupoRango,
  LstCheck,
  LstGrupo,
  ListadoVentana,
  describirFecha,
  describirPar,
  describirRango,
  hoyIso,
  par,
  rango,
  rangoSql,
  useInforme,
  type ColumnaInforme,
  type Destino,
  type Par,
  type Rango,
  type RangoFecha,
} from '../../components/gw/GwListado'
import { rpc } from './comun'

// Ventas → Listados → L. Reparaciones (captura 06-03, ventana «Informes»). Filtros calcados;
// columnas del informe sin captura: confirmar con Luis. Cálculo en fn_lst_reparaciones.
// «Realizada» = marca Realizada de la ficha (preparado); fecha de realización = fecha_fin.

const INFORMES = [
  { value: 'desglosado', label: 'Desglosado' },
  { value: 'tecnico', label: 'Desglosado Agrupado por Técnico' },
  { value: 'cliente', label: 'Desglosado Agrupado por Cliente' },
  { value: 'resumen_tecnico', label: 'Resumen por Técnico' },
]

interface Filtros {
  campoFecha: 'entrada' | 'realizacion'
  fecha: RangoFecha
  tecnicos: Rango
  clientes: Rango
  realizadas: Par
  entregadas: Par
  presupuesto: Par
  pedidos: Par
  facturadas: Par
  anuladas: Par
  serie: Rango
  tiendas: Rango
}

const inicial = (): Filtros => ({
  campoFecha: 'entrada',
  fecha: {
    modo: 'cualquiera',
    desde: `${hoyIso()}T00:00:00`,
    hasta: `${hoyIso()}T23:59:59`,
  },
  tecnicos: rango(),
  clientes: rango(),
  realizadas: par(),
  entregadas: par(),
  presupuesto: par(),
  pedidos: par(),
  facturadas: par(),
  anuladas: par(),
  serie: rango(),
  tiendas: rango(),
})

export function ListadoReparacionesPage() {
  const inf = useInforme()
  const [informe, setInforme] = useState('desglosado')
  const [destino, setDestino] = useState<Destino>('pantalla')
  const [f, setF] = useState<Filtros>(inicial)
  const set = (p: Partial<Filtros>) => setF((x) => ({ ...x, ...p }))

  function procesar(fl: Filtros = f) {
    const p = {
      informe,
      campoFecha: fl.campoFecha,
      fecha: fl.fecha,
      tecnicos: rangoSql(fl.tecnicos),
      clientes: rangoSql(fl.clientes),
      realizadas: fl.realizadas,
      entregadas: fl.entregadas,
      presupuesto: fl.presupuesto,
      pedidos: fl.pedidos,
      facturadas: fl.facturadas,
      anuladas: fl.anuladas,
      serie: rangoSql(fl.serie),
      tiendas: rangoSql(fl.tiendas),
    }
    const columnas: ColumnaInforme[] =
      informe === 'resumen_tecnico'
        ? [
            { key: 'documento', titulo: 'Técnico' },
            { key: 'n', titulo: 'Nº Reparaciones', tipo: 'entero', ancho: 90 },
            { key: 'total', titulo: 'Total', tipo: 'num', ancho: 90 },
          ]
        : [
            { key: 'documento', titulo: 'Nº', ancho: 60 },
            { key: 'fecha', titulo: 'F. Entrada', tipo: 'fecha', ancho: 66 },
            {
              key: 'fecha_realizacion',
              titulo: 'F. Realiz.',
              tipo: 'fecha',
              ancho: 66,
            },
            { key: 'cliente', titulo: 'Cliente' },
            { key: 'tecnico', titulo: 'Téc.', ancho: 34 },
            { key: 'numero_serie', titulo: 'Nº Serie', ancho: 80 },
            { key: 'averia', titulo: 'Avería' },
            { key: 'estado', titulo: 'Estado', ancho: 80 },
            { key: 'total', titulo: 'Total', tipo: 'num', ancho: 70 },
          ]
    inf.procesar(
      {
        titulo: `Listado de Reparaciones - ${INFORMES.find((i) => i.value === informe)?.label}`,
        sinCaptura: true,
        apaisado: informe !== 'resumen_tecnico',
        columnas,
        filtros: [
          describirFecha(fl.campoFecha === 'entrada' ? 'Fecha de entrada' : 'Fecha de realización', fl.fecha),
          describirRango('Técnicos', fl.tecnicos),
          describirRango('Clientes', fl.clientes),
          describirPar('Realizadas', 'No realizadas', fl.realizadas),
          describirPar('Entregadas', 'No entregadas', fl.entregadas),
          describirPar('Con presupuesto', 'Sin presupuesto', fl.presupuesto),
          describirPar('Incluye pedidos', 'Sólo pedidos', fl.pedidos),
          describirPar('Facturadas', 'No facturadas', fl.facturadas),
          describirPar('Incluye anuladas', 'Sólo anuladas', fl.anuladas),
          describirRango('Nº de serie', fl.serie),
          describirRango('Tiendas', fl.tiendas),
        ],
        cargar: () => rpc('fn_lst_reparaciones', p),
      },
      destino,
    )
  }

  const boton = (label: string, k: keyof Filtros, lado: 'si' | 'no', title?: string) => {
    const v = f[k] as Par
    return <BotonPulsado label={label} title={title} on={v[lado]} set={(on) => set({ [k]: { ...v, [lado]: on } } as Partial<Filtros>)} className="flex-1" />
  }

  return (
    <>
      <ListadoVentana
        informes={INFORMES}
        informe={informe}
        onInforme={setInforme}
        cabeceraDebajo={
          <LstCheck
            label="Emitir informe simple"
            on={false}
            set={() => undefined}
            disabled
            className="text-[#8a8a8a]"
            title="Informe simple de GeminisWin: sin captura"
          />
        }
        ordenes={[{ value: '', label: '' }]}
        orden=""
        onOrden={() => undefined}
        destino={destino}
        onDestino={setDestino}
        onProcesar={() => procesar()}
        procesando={inf.cargando}
      >
        {inf.error && <div className="border border-[#c42b1c] bg-[#fde7e9] px-2 py-1 text-[14px] text-[#c42b1c]">{inf.error}</div>}
        <GrupoFecha
          nombre="lr-fecha"
          titulo="Fecha y Hora"
          soloFecha
          campos={[
            { value: 'entrada', label: 'De Entrada' },
            { value: 'realizacion', label: 'De Realización' },
          ]}
          campo={f.campoFecha}
          onCampo={(c) => set({ campoFecha: c as Filtros['campoFecha'] })}
          valor={f.fecha}
          onChange={(fecha) => set({ fecha })}
          extra={
            <button
              type="button"
              className="relative ml-10 flex h-[58px] w-[400px] flex-none items-center justify-center border border-[var(--gw-border)] bg-[#f3f3f3] px-3 text-[18px] leading-[22px] hover:bg-[#e5f1fb]"
              onClick={() => {
                const hoy = hoyIso()
                const nuevo = {
                  ...inicial(),
                  fecha: {
                    modo: 'desdeHasta' as const,
                    desde: `${hoy}T00:00:00`,
                    hasta: `${hoy}T23:59:59`,
                  },
                }
                setF(nuevo)
                procesar(nuevo)
              }}
            >
              Eliminar todos los Filtros y procesar los de Hoy
              <Check size={13} strokeWidth={3} className="absolute bottom-1 right-1 text-[#2a9d2a]" />
            </button>
          }
        />
        <div className="grid grid-cols-2 gap-2">
          <GrupoRango nombre="lr-tec" titulo="Técnicos" valor={f.tecnicos} onChange={(tecnicos) => set({ tecnicos })} buscador="tecnico" />
          <GrupoRango nombre="lr-cli" titulo="Clientes" valor={f.clientes} onChange={(clientes) => set({ clientes })} buscador="cliente" />
        </div>
        <div className="flex gap-2">
          <LstGrupo titulo="Estado" className="flex-1">
            <div className="grid grid-cols-3 gap-2 pt-1">
              <div className="flex flex-col gap-1 border border-[var(--gw-border-light)] p-1">
                <div className="flex">
                  {boton('Realizadas', 'realizadas', 'si')}
                  {boton('No Realizadas', 'realizadas', 'no')}
                </div>
                <div className="flex">
                  {boton('Entregadas', 'entregadas', 'si')}
                  {boton('No Entregadas', 'entregadas', 'no')}
                </div>
              </div>
              <div className="flex flex-col gap-1 border border-[var(--gw-border-light)] p-1">
                <div className="flex">
                  {boton('Con Presupuest.', 'presupuesto', 'si')}
                  {boton('Sin Presup.', 'presupuesto', 'no')}
                </div>
                <div className="flex">
                  {boton('Incluir Pedidos', 'pedidos', 'si', 'Lista también los pedidos que no son reparación')}
                  {boton('Sólo Pedidos', 'pedidos', 'no', 'Solo pedidos (no reparaciones)')}
                </div>
              </div>
              <div className="flex flex-col gap-1 border border-[var(--gw-border-light)] p-1">
                <div className="flex">
                  {boton('Facturadas', 'facturadas', 'si')}
                  {boton('No Facturadas', 'facturadas', 'no')}
                </div>
                <div className="flex">
                  {boton('Incl. Anuladas', 'anuladas', 'si')}
                  {boton('Sólo Anuladas', 'anuladas', 'no')}
                </div>
              </div>
            </div>
          </LstGrupo>
          <LstGrupo titulo="D.C. Fra" disabled className="w-[118px] flex-none">
            <div className="flex flex-col gap-[3px]" title="Dígito de control de facturación de GeminisWin: no se usa en el ERP">
              {['1-04', '2-01', '3-02'].map((x) => (
                <BotonOpcion key={x} label={x} on={false} disabled />
              ))}
            </div>
          </LstGrupo>
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,0.6fr)_minmax(0,0.4fr)] gap-2">
          <GrupoRango nombre="lr-serie" titulo="Serie" valor={f.serie} onChange={(serie) => set({ serie })} />
          <GrupoRango nombre="lr-tiendas" titulo="Tiendas" valor={f.tiendas} onChange={(tiendas) => set({ tiendas })} buscador="tienda" />
        </div>
      </ListadoVentana>
      {inf.vista}
    </>
  )
}
