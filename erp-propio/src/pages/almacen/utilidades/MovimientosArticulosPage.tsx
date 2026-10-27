import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { GwDate, GwRadio, formatGw } from '../../../components/gw'
import {
  AlmacenStock,
  ArtAnulados,
  BarraSalida,
  CAMPOS_CODIGO,
  CAMPOS_COSTE,
  CAMPOS_FECHA,
  CAMPOS_VARIOS,
  CabeceraInforme,
  Caracteristicas,
  CondicionCampo,
  FiltrarPor,
  Grupo,
  IN,
  L,
  NIVELES_PVP,
  RangoCodigos,
  aJson,
  filtroInicial,
  rangoJson,
  rangoVacio,
  type FiltroArticulos,
  type Rango,
  type Salida,
} from '../../../components/gw/GwInformeArticulos'
import { GwSelect } from '../../../components/gw'
import { ImpresionInforme, NOMBRE_DOC, VisorInforme, fechaEs, msgError, rpcPagina, rpcTodas, rutaDocumento, useAlmacenes, useF4, type ColInforme } from './comun'

// Almacén → List. de Movimientos de Artículos. Calcada de la captura 06-23 («Listados de
// Movimientos de los Artículos»): mismos grupos de filtro y barra de salida. El informe sale de
// movimiento_stock (fn_informe_movimientos / fn_informe_movimientos_resumen), agregado y paginado
// en el servidor, con el saldo acumulado por artículo y almacén y el documento de origen.
// La lista de informes del desplegable no se ve en la captura: confirmar con Luis.

const INFORMES = [
  { v: 'venta', l: 'Movimientos de Ventas de Artículos' },
  { v: 'compra', l: 'Movimientos de Compras de Artículos' },
  { v: 'traspaso', l: 'Movimientos de Traspasos entre Almacenes' },
  { v: 'regularizacion', l: 'Movimientos de Regularizaciones e Inventarios' },
  { v: 'todos', l: 'Movimientos de Artículos (todos)' },
  { v: 'resumen', l: 'Resumen de Movimientos por Artículo y Almacén' },
]
const ORDENES = [
  { v: 'articulo', l: 'Articulo.Cod_intern;Ventas.Fecha' },
  { v: 'descripcion', l: 'Articulo.Descripcion;Ventas.Fecha' },
  { v: 'fecha', l: 'Ventas.Fecha;Articulo.Cod_intern' },
  { v: 'documento', l: 'Documento;Ventas.Fecha' },
]

interface Mov {
  id: number
  ocurrido_en: string
  fecha_documento: string | null
  articulo_codigo: string
  descripcion: string
  almacen_codigo: string
  tipo_movimiento: string
  documento_origen_tipo: string
  documento_origen_tienda_codigo: string | null
  documento_origen_numero: number | null
  documento_origen_linea: number | null
  tercero_codigo: string | null
  tercero_nombre: string | null
  empleado_codigo: string | null
  entrada: number
  salida: number
  saldo: number
  costo_unitario: number | null
  observaciones: string | null
  total_filas: number
  total_entradas: number
  total_salidas: number
}
interface Res {
  articulo_codigo: string
  descripcion: string
  almacen_codigo: string
  saldo_inicial: number
  entradas: number
  salidas: number
  saldo_final: number
  movimientos: number
  total_filas: number
  total_entradas: number
  total_salidas: number
}

const TIPO: Record<string, string> = {
  venta: 'Venta',
  compra: 'Compra',
  traspaso: 'Traspaso',
  regularizacion: 'Regulariz.',
  inventario: 'Inventario',
  devolucion_cliente: 'Dev. Cliente',
  devolucion_proveedor: 'Dev. Prov.',
  consumo_kit: 'Consumo Kit',
  produccion_kit: 'Prod. Kit',
}

const docTexto = (m: Mov) =>
  `${NOMBRE_DOC[m.documento_origen_tipo] ?? m.documento_origen_tipo}${m.documento_origen_numero != null ? ` ${m.documento_origen_tienda_codigo ?? ''}/${m.documento_origen_numero}` : ''}`

export function MovimientosArticulosPage() {
  const navigate = useNavigate()
  const almacenes = useAlmacenes()
  const [informe, setInforme] = useState('venta')
  const [soloTotales, setSoloTotales] = useState(false)
  const [orden, setOrden] = useState('articulo')
  const [f, setF] = useState<FiltroArticulos>(() =>
    filtroInicial({
      alm_stock: { almacen: '*', op: 'no', v1: '', v2: '' },
      anulados: { no: false, si: false },
    }),
  )
  const [tiendas, setTiendas] = useState<Rango>(rangoVacio())
  const [fecha, setFecha] = useState<{
    tipo: 'pedido' | 'llegada' | 'factura'
    modo: 'rango' | 'cualquiera'
    desde: string | null
    hasta: string | null
  }>({
    tipo: 'llegada',
    modo: 'cualquiera',
    desde: null,
    hasta: null,
  })
  const [sinMovs, setSinMovs] = useState(false)
  const [filtrandoStock, setFiltrandoStock] = useState(false)
  const [tercero, setTercero] = useState<Rango & { tipo: 'proveedor' | 'vendedor' | 'empleado' }>({ ...rangoVacio(), tipo: 'proveedor' })
  const [cliente, setCliente] = useState<Rango>(rangoVacio())
  const [salida, setSalida] = useState<Salida>('pantalla')
  const [procesando, setProcesando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [visor, setVisor] = useState<null | {
    p: Record<string, unknown>
    modo: 'pantalla' | 'examinar'
  }>(null)
  const [impMov, setImpMov] = useState<Mov[] | null>(null)
  const [impRes, setImpRes] = useState<Res[] | null>(null)
  const set = (p: Partial<FiltroArticulos>) => setF((x) => ({ ...x, ...p }))
  const cerrar = useCallback(() => navigate('/'), [navigate])
  useF4(cerrar)

  const resumen = informe === 'resumen'
  const titulo = INFORMES.find((i) => i.v === informe)?.l ?? ''
  const subtitulo = [
    fecha.modo === 'rango' ? `Fechas ${fechaEs(fecha.desde) || '…'} a ${fechaEs(fecha.hasta) || '…'}` : 'Todas las fechas',
    f.articulos.modo === 'rango' && (f.articulos.desde || f.articulos.hasta) ? `Artículos ${f.articulos.desde || '…'} a ${f.articulos.hasta || '…'}` : '',
  ]
    .filter(Boolean)
    .join(' · ')

  function payload(): Record<string, unknown> {
    return {
      ...aJson(f),
      informe,
      orden,
      tiendas: rangoJson(tiendas),
      fecha: { ...fecha, desde: fecha.desde ?? '', hasta: fecha.hasta ?? '' },
      tercero: { ...rangoJson(tercero), tipo: tercero.tipo },
      cliente: rangoJson(cliente),
      sin_movimientos: sinMovs,
      filtrando_stock: filtrandoStock,
    }
  }
  const fn = resumen ? 'fn_informe_movimientos_resumen' : 'fn_informe_movimientos'

  async function procesar() {
    setError(null)
    const p = payload()
    if (salida === 'pantalla' || salida === 'examinar') {
      setVisor({ p, modo: salida })
      return
    }
    setProcesando(true)
    try {
      const filas = await rpcTodas<Mov | Res>(fn, p)
      if (resumen) setImpRes(filas as Res[])
      else setImpMov(filas as Mov[])
      setTimeout(() => {
        window.print()
        setImpMov(null)
        setImpRes(null)
      }, 400)
    } catch (e) {
      setError(msgError(e))
    } finally {
      setProcesando(false)
    }
  }

  const colsMov: ColInforme<Mov>[] = [
    { k: 'fecha', l: 'Fecha', w: 118, v: (m) => fechaEs(m.ocurrido_en, true) },
    { k: 'articulo_codigo', l: 'Cod. Interno', w: 110 },
    { k: 'descripcion', l: 'Descripción', w: 280 },
    { k: 'almacen_codigo', l: 'Alm.', w: 40 },
    {
      k: 'tipo',
      l: 'Tipo',
      w: 80,
      v: (m) => TIPO[m.tipo_movimiento] ?? m.tipo_movimiento,
    },
    {
      k: 'documento',
      l: 'Documento',
      w: 130,
      v: docTexto,
      render: (m) => {
        const r = rutaDocumento(m.documento_origen_tipo, m.documento_origen_tienda_codigo, m.documento_origen_numero)
        return r ? (
          <button type="button" className="text-[#1a4fd0] underline" onClick={() => navigate(r)} title="Abrir el documento">
            {docTexto(m)}
          </button>
        ) : (
          docTexto(m)
        )
      },
    },
    { k: 'tercero_codigo', l: 'Cli./Prov.', w: 70 },
    { k: 'tercero_nombre', l: 'Nombre', w: 170 },
    {
      k: 'entrada',
      l: 'Entradas',
      w: 78,
      d: 3,
      v: (m) => (m.entrada ? m.entrada : null),
    },
    {
      k: 'salida',
      l: 'Salidas',
      w: 78,
      d: 3,
      v: (m) => (m.salida ? m.salida : null),
    },
    { k: 'saldo', l: 'Saldo', w: 84, d: 3 },
    { k: 'costo_unitario', l: 'Coste', w: 72, d: 3 },
  ]
  const colsRes: ColInforme<Res>[] = [
    { k: 'articulo_codigo', l: 'Cod. Interno', w: 120 },
    { k: 'descripcion', l: 'Descripción', w: 380 },
    { k: 'almacen_codigo', l: 'Alm.', w: 50 },
    { k: 'saldo_inicial', l: 'Saldo Inicial', w: 100, d: 3 },
    { k: 'entradas', l: 'Entradas', w: 100, d: 3 },
    { k: 'salidas', l: 'Salidas', w: 100, d: 3 },
    { k: 'saldo_final', l: 'Saldo Final', w: 100, d: 3 },
    { k: 'movimientos', l: 'Nº Movs.', w: 70, d: 0 },
  ]
  const lineaTotales = (r: { total_filas: number; total_entradas: number; total_salidas: number } | undefined) =>
    r ? (
      <span>
        {resumen ? 'Artículos/almacén' : 'Movimientos'}: <b>{Number(r.total_filas).toLocaleString('es-ES')}</b> · Entradas <b>{formatGw(r.total_entradas, 3)}</b> · Salidas{' '}
        <b>{formatGw(r.total_salidas, 3)}</b> · Diferencia <b>{formatGw(Number(r.total_entradas) - Number(r.total_salidas), 3)}</b>
      </span>
    ) : (
      <span>Sin movimientos con esos filtros.</span>
    )

  return (
    <div className="flex h-full min-h-0 flex-col gap-1">
      <CabeceraInforme
        informes={INFORMES}
        informe={informe}
        setInforme={setInforme}
        soloTotales={soloTotales}
        setSoloTotales={setSoloTotales}
        ordenes={ORDENES}
        orden={orden}
        setOrden={setOrden}
      />
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden border border-[var(--gw-border-light)] p-1">
        <div className="flex flex-col gap-1">
          <div className="grid grid-cols-2 gap-3">
            <Grupo titulo={<FiltrarPor f={f} set={set} name="mov" />}>
              <RangoCodigos value={f.articulos} onChange={(r) => set({ articulos: r })} lookup={f.por === 'familia' ? 'familia' : 'articulo'} name="mov-art" />
            </Grupo>
            <Grupo titulo="Elegir Almacen y/o Filtrar por el Stock del Artículo">
              <AlmacenStock value={f.alm_stock} onChange={(v) => set({ alm_stock: v })} almacenes={almacenes} />
            </Grupo>
          </div>

          <div className="grid grid-cols-[minmax(0,400px)_minmax(0,400px)_minmax(0,1fr)_150px] items-end gap-3">
            <Grupo titulo="Almacenes">
              <RangoCodigos value={f.almacenes} onChange={(r) => set({ almacenes: r })} lookup="almacen" name="mov-alm" anchoCodigo={110} />
            </Grupo>
            <Grupo titulo="Tiendas">
              <RangoCodigos value={tiendas} onChange={setTiendas} lookup="tienda" name="mov-tie" anchoCodigo={110} />
            </Grupo>
            <div />
            <ArtAnulados value={f.anulados} onChange={(v) => set({ anulados: v })} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Grupo titulo="Elegir y/o Filtrar Según Código o Descripción del Art.">
              <CondicionCampo value={f.texto} onChange={(v) => set({ texto: v })} campos={CAMPOS_CODIGO} />
            </Grupo>
            <Grupo
              titulo="Fecha"
              derecha={
                <span className={`ml-auto flex gap-6 ${L}`}>
                  {(['pedido', 'llegada', 'factura'] as const).map((t) => (
                    <GwRadio
                      key={t}
                      name="mov-ftipo"
                      label={<span className={L}>{t === 'pedido' ? 'De Pedido' : t === 'llegada' ? 'De Llegada' : 'De Factura'}</span>}
                      checked={fecha.tipo === t}
                      onChange={() => setFecha((x) => ({ ...x, tipo: t }))}
                    />
                  ))}
                </span>
              }
            >
              <div className="flex items-center gap-2">
                <div className={`flex w-[118px] flex-none flex-col ${L}`}>
                  <GwRadio
                    name="mov-fmodo"
                    label={<span className={L}>Desde/Hasta</span>}
                    checked={fecha.modo === 'rango'}
                    onChange={() => setFecha((x) => ({ ...x, modo: 'rango' }))}
                  />
                  <GwRadio
                    name="mov-fmodo"
                    label={<span className={L}>Cualquiera</span>}
                    checked={fecha.modo === 'cualquiera'}
                    onChange={() => setFecha((x) => ({ ...x, modo: 'cualquiera' }))}
                  />
                </div>
                <span className="min-w-0 flex-1">
                  <GwDate className={IN} value={fecha.desde} disabled={fecha.modo !== 'rango'} onChange={(v) => setFecha((x) => ({ ...x, desde: v }))} />
                </span>
                <span className="min-w-0 flex-1">
                  <GwDate className={IN} value={fecha.hasta} disabled={fecha.modo !== 'rango'} onChange={(v) => setFecha((x) => ({ ...x, hasta: v }))} />
                </span>
              </div>
              <div className={`mt-0.5 flex justify-between ${L}`}>
                <label className="flex items-center gap-1">
                  <input type="checkbox" className="h-[12px] w-[12px]" checked={sinMovs} onChange={(e) => setSinMovs(e.target.checked)} />
                  Incluir artículos sin movimientos
                </label>
                <label className="flex items-center gap-1" title="Aplica el filtro de stock de «Elegir Almacén y/o Filtrar por el Stock»">
                  <input type="checkbox" className="h-[12px] w-[12px]" checked={filtrandoStock} onChange={(e) => setFiltrandoStock(e.target.checked)} />
                  Filtrando Stock
                </label>
              </div>
            </Grupo>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Grupo
              titulo={
                <span className={`flex items-center gap-6 ${L}`}>
                  <span className="text-[16px]">Filtrar Por:</span>
                  {(['proveedor', 'vendedor', 'empleado'] as const).map((t) => (
                    <GwRadio
                      key={t}
                      name="mov-ter"
                      label={<span className={L}>{t[0].toUpperCase() + t.slice(1)}</span>}
                      checked={tercero.tipo === t}
                      onChange={() =>
                        setTercero((x) => ({
                          ...x,
                          tipo: t,
                          desde: '',
                          hasta: '',
                          lista: '',
                        }))
                      }
                    />
                  ))}
                </span>
              }
            >
              <RangoCodigos value={tercero} onChange={(r) => setTercero((x) => ({ ...x, ...r }))} lookup={tercero.tipo} name="mov-terr" />
            </Grupo>
            <Grupo
              titulo="Filtrar Según Campo"
              derecha={
                <button
                  type="button"
                  className="ml-auto text-[16px] text-[#1a4fd0]"
                  title="Varios valores separados por comas"
                  onClick={() => set({ campo: { ...f.campo, op: 'lista' } })}
                >
                  Múltiple
                </button>
              }
            >
              <CondicionCampo value={f.campo} onChange={(v) => set({ campo: v })} campos={CAMPOS_VARIOS} />
            </Grupo>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Grupo titulo="Filtrar Según Fecha">
              <CondicionCampo value={f.fecha2} onChange={(v) => set({ fecha2: v })} campos={CAMPOS_FECHA} />
            </Grupo>
            <Grupo titulo="Cliente">
              <RangoCodigos value={cliente} onChange={setCliente} lookup="cliente" name="mov-cli" />
            </Grupo>
          </div>

          <Caracteristicas value={f.caract} onChange={(v) => set({ caract: v })} />

          <div className="grid grid-cols-2 gap-3">
            <Grupo titulo="Elegir y/o Filtrar Según el Pvp del Artículo">
              <CondicionCampo
                value={{
                  campo: String(f.pvp.nivel),
                  op: f.pvp.op,
                  v1: f.pvp.v1,
                  v2: f.pvp.v2,
                }}
                tipoFijo="num"
                onChange={(c) =>
                  set({
                    pvp: {
                      nivel: Number(c.campo),
                      op: c.op,
                      v1: c.v1,
                      v2: c.v2,
                    },
                  })
                }
                sinCampo={
                  <GwSelect className={IN} value={f.pvp.nivel} onChange={(e) => set({ pvp: { ...f.pvp, nivel: Number(e.target.value) } })}>
                    {NIVELES_PVP.map((n, i) => (
                      <option key={i} value={i}>
                        {n}
                      </option>
                    ))}
                  </GwSelect>
                }
              />
            </Grupo>
            <Grupo titulo="Elegir y/o Filtrar Según el Precio de Coste del Artículo">
              <CondicionCampo value={f.coste} onChange={(v) => set({ coste: v })} campos={CAMPOS_COSTE} />
            </Grupo>
          </div>
        </div>
      </div>
      {error && <div className="text-[13px] text-[#c42b1c]">{error}</div>}
      <BarraSalida salida={salida} setSalida={setSalida} onProcesar={procesar} onCerrar={cerrar} procesando={procesando} />

      {visor && !resumen && (
        <VisorInforme<Mov>
          titulo={titulo}
          subtitulo={subtitulo}
          modo={visor.modo}
          cols={colsMov}
          cargar={(d, l) => rpcPagina<Mov>('fn_informe_movimientos', visor.p, d, l)}
          todas={() => rpcTodas<Mov>('fn_informe_movimientos', visor.p)}
          totales={lineaTotales}
          clave={(m) => String(m.id)}
          soloTotales={soloTotales}
          onAbrir={(m) => {
            const r = rutaDocumento(m.documento_origen_tipo, m.documento_origen_tienda_codigo, m.documento_origen_numero)
            if (r) navigate(r)
          }}
          onCerrar={() => setVisor(null)}
          nombreCsv="movimientos_articulos.csv"
        />
      )}
      {visor && resumen && (
        <VisorInforme<Res>
          titulo={titulo}
          subtitulo={subtitulo}
          modo={visor.modo}
          cols={colsRes}
          cargar={(d, l) => rpcPagina<Res>('fn_informe_movimientos_resumen', visor.p, d, l)}
          todas={() => rpcTodas<Res>('fn_informe_movimientos_resumen', visor.p)}
          totales={lineaTotales}
          clave={(r) => `${r.articulo_codigo}|${r.almacen_codigo}`}
          soloTotales={soloTotales}
          onAbrir={(r) => navigate(`/articulos/${encodeURIComponent(r.articulo_codigo)}`)}
          onCerrar={() => setVisor(null)}
          nombreCsv="resumen_movimientos.csv"
        />
      )}
      {impMov && (
        <ImpresionInforme
          titulo={titulo}
          subtitulo={subtitulo}
          cols={colsMov}
          filas={impMov}
          totales={lineaTotales(impMov[0])}
          clave={(m) => String(m.id)}
          soloTotales={soloTotales}
        />
      )}
      {impRes && (
        <ImpresionInforme
          titulo={titulo}
          subtitulo={subtitulo}
          cols={colsRes}
          filas={impRes}
          totales={lineaTotales(impRes[0])}
          clave={(r) => `${r.articulo_codigo}|${r.almacen_codigo}`}
          soloTotales={soloTotales}
        />
      )}
    </div>
  )
}
