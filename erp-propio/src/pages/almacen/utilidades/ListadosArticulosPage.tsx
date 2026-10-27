import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { GwRadio, GwSelect, formatGw } from '../../../components/gw'
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
  type FiltroArticulos,
  type Salida,
} from '../../../components/gw/GwInformeArticulos'
import { ImpresionInforme, VisorInforme, fechaEs, msgError, rpcPagina, rpcTodas, useAlmacenes, useF4, type ColInforme } from './comun'

// Almacén → Listados Artículos. Calcada de la captura 06-20 («Listados de Artículos»): sustituye
// a la pantalla antigua /stock. Informe en el servidor (fn_informe_articulos), paginado, con
// totales de stock y valoración. Los informes del desplegable salvo «Listado con todos los PVPs»
// no se ven en la captura: confirmar con Luis.

export interface FilaArt {
  codigo_interno: string
  descripcion: string
  codigo_venta: string | null
  codigo_barras: string | null
  codigo_compra: string | null
  familia_codigo: string | null
  marca_codigo: string | null
  proveedor_codigo: string | null
  igic_pct: number | null
  pvp0: number | null
  pvp1: number | null
  pvp2: number | null
  pvp3: number | null
  pvp4: number | null
  pvp5: number | null
  pvp6: number | null
  coste: number | null
  stock: number
  stock_minimo: number | null
  stock_maximo: number | null
  valor: number
  ultima_compra: string | null
  ultima_venta: string | null
  fecha_mod_pvp: string | null
  activo: boolean
  unidades_pedido: number | null
  stocks: Record<string, number> | null
  total_filas: number
  total_stock: number
  total_valor: number
}

const INFORMES = [
  { v: 'pvps', l: 'Listado con todos los PVPs de los Artículos' },
  { v: 'basico', l: 'Listado de Artículos' },
  { v: 'stock', l: 'Listado de Stock de los Artículos por Almacén' },
  { v: 'valorado', l: 'Listado de Stock Valorado' },
  { v: 'minimo', l: 'Listado de Artículos bajo Stock Mínimo' },
  { v: 'igic', l: 'Listado de Artículos con PVP e IGIC' },
]
export const ORDENES_ART = [
  { v: 'codigo', l: 'Cod_intern' },
  { v: 'descripcion', l: 'Descripcion' },
  { v: 'familia', l: 'Familia;Cod_intern' },
  { v: 'familia_desc', l: 'Familia;Descripcion' },
  { v: 'marca', l: 'Marca;Cod_intern' },
  { v: 'proveedor', l: 'Proveedor;Cod_intern' },
  { v: 'codigo_compra', l: 'Cod_compra' },
  { v: 'stock', l: 'Stock (de mayor a menor)' },
]

const pvpIgic = (r: FilaArt) => (r.pvp0 == null ? null : Math.round(Number(r.pvp0) * (1 + Number(r.igic_pct ?? 0) / 100) * 100) / 100)

export function ListadosArticulosPage() {
  const navigate = useNavigate()
  const almacenes = useAlmacenes()
  const [informe, setInforme] = useState('pvps')
  const [soloTotales, setSoloTotales] = useState(false)
  const [orden, setOrden] = useState('codigo')
  const [f, setF] = useState<FiltroArticulos>(() => filtroInicial())
  const [salida, setSalida] = useState<Salida>('pantalla')
  const [procesando, setProcesando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [visor, setVisor] = useState<null | {
    p: Record<string, unknown>
    modo: 'pantalla' | 'examinar'
  }>(null)
  const [imprimir, setImprimir] = useState<FilaArt[] | null>(null)
  const set = (p: Partial<FiltroArticulos>) => setF((x) => ({ ...x, ...p }))
  const cerrar = useCallback(() => navigate('/'), [navigate])
  useF4(cerrar)

  const titulo = INFORMES.find((i) => i.v === informe)?.l ?? ''
  const conAlmacen = f.alm_stock.almacen !== ''
  // Almacenes que salen como columnas en el listado de stock por almacén.
  const almCols = almacenes.filter((a) => {
    if (f.alm_stock.almacen && f.alm_stock.almacen !== '*') return a.codigo === f.alm_stock.almacen
    if (f.almacenes.modo === 'rango') return (!f.almacenes.desde || a.codigo >= f.almacenes.desde) && (!f.almacenes.hasta || a.codigo <= f.almacenes.hasta)
    if (f.almacenes.modo === 'seleccionar')
      return f.almacenes.lista
        .split(',')
        .map((x) => x.trim())
        .includes(a.codigo)
    return true
  })

  function payload(): Record<string, unknown> {
    return {
      ...aJson(f),
      orden,
      con_stocks: informe === 'stock',
      bajo_minimo: informe === 'minimo',
    }
  }

  const base: ColInforme<FilaArt>[] = [
    { k: 'codigo_interno', l: 'Cod. Interno', w: 110 },
    { k: 'descripcion', l: 'Descripción', w: 300 },
  ]
  const cols: ColInforme<FilaArt>[] =
    informe === 'pvps'
      ? [
          ...base,
          ...NIVELES_PVP.map((n, i) => ({
            k: `pvp${i}`,
            l: n.replace(/\s+/g, ' '),
            w: 84,
            d: 3,
          })),
          { k: 'coste', l: 'Coste', w: 80, d: 3 },
        ]
      : informe === 'stock'
        ? [
            ...base,
            ...almCols.map((a) => ({
              k: `alm_${a.codigo}`,
              l: `Alm. ${a.codigo}`,
              w: 80,
              d: 3,
              v: (r: FilaArt) => r.stocks?.[a.codigo] ?? null,
            })),
            { k: 'stock', l: 'Total', w: 90, d: 3 },
          ]
        : informe === 'valorado'
          ? [
              ...base,
              { k: 'familia_codigo', l: 'Familia', w: 70 },
              { k: 'stock', l: 'Stock', w: 90, d: 3 },
              { k: 'coste', l: 'Coste', w: 90, d: 3 },
              { k: 'valor', l: 'Valor', w: 100, d: 2 },
            ]
          : informe === 'minimo'
            ? [
                ...base,
                { k: 'proveedor_codigo', l: 'Proveedor', w: 80 },
                { k: 'stock', l: 'Stock', w: 90, d: 3 },
                { k: 'stock_minimo', l: 'Stock Mín.', w: 90, d: 3 },
                { k: 'stock_maximo', l: 'Stock Máx.', w: 90, d: 3 },
                {
                  k: 'pedir',
                  l: 'A Pedir',
                  w: 90,
                  d: 3,
                  v: (r) => Math.max(0, Number(r.stock_maximo ?? r.stock_minimo ?? 0) - Number(r.stock)),
                },
              ]
            : informe === 'igic'
              ? [
                  ...base,
                  { k: 'codigo_barras', l: 'Cód. Barras', w: 120 },
                  { k: 'pvp0', l: 'PVP', w: 84, d: 3 },
                  { k: 'igic_pct', l: '% IGIC', w: 60, d: 2 },
                  { k: 'pvp_igic', l: 'PVP + IGIC', w: 90, d: 2, v: pvpIgic },
                ]
              : [
                  ...base,
                  { k: 'familia_codigo', l: 'Familia', w: 70 },
                  { k: 'marca_codigo', l: 'Marca', w: 110 },
                  { k: 'proveedor_codigo', l: 'Proveedor', w: 70 },
                  { k: 'codigo_compra', l: 'Cód. Compra', w: 110 },
                  { k: 'pvp0', l: 'PVP General', w: 84, d: 3 },
                  ...(conAlmacen ? [{ k: 'stock', l: 'Stock', w: 84, d: 3 }] : []),
                  {
                    k: 'ultima_compra',
                    l: 'Últ. Compra',
                    w: 86,
                    v: (r: FilaArt) => fechaEs(r.ultima_compra),
                  },
                  {
                    k: 'ultima_venta',
                    l: 'Últ. Venta',
                    w: 86,
                    v: (r: FilaArt) => fechaEs(r.ultima_venta),
                  },
                ]

  const totales = (r: FilaArt | undefined) =>
    r ? (
      <span>
        Artículos: <b>{Number(r.total_filas).toLocaleString('es-ES')}</b>
        {(conAlmacen || informe === 'stock' || informe === 'valorado' || informe === 'minimo') && (
          <>
            {' '}
            · Stock <b>{formatGw(r.total_stock, 3)}</b> · Valoración <b>{formatGw(r.total_valor, 2)} €</b>
          </>
        )}
      </span>
    ) : (
      <span>Ningún artículo cumple los filtros.</span>
    )

  async function procesar() {
    setError(null)
    const p = payload()
    if (informe === 'stock' || informe === 'valorado' || informe === 'minimo') {
      if (!conAlmacen) p.alm_stock = { ...f.alm_stock, almacen: '*' }
    }
    if (salida === 'pantalla' || salida === 'examinar') return setVisor({ p, modo: salida })
    setProcesando(true)
    try {
      const filas = await rpcTodas<FilaArt>('fn_informe_articulos', p)
      setImprimir(filas)
      setTimeout(() => {
        window.print()
        setImprimir(null)
      }, 400)
    } catch (e) {
      setError(msgError(e))
    } finally {
      setProcesando(false)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-1">
      <CabeceraInforme
        informes={INFORMES}
        informe={informe}
        setInforme={setInforme}
        soloTotales={soloTotales}
        setSoloTotales={setSoloTotales}
        ordenes={ORDENES_ART}
        orden={orden}
        setOrden={setOrden}
      />
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden border border-[var(--gw-border-light)] p-1">
        <FiltrosArticulo f={f} set={set} almacenes={almacenes} name="lart" />
      </div>
      {error && <div className="text-[13px] text-[#c42b1c]">{error}</div>}
      <BarraSalida salida={salida} setSalida={setSalida} onProcesar={procesar} onCerrar={cerrar} procesando={procesando} />

      {visor && (
        <VisorInforme<FilaArt>
          titulo={titulo}
          modo={visor.modo}
          cols={cols}
          cargar={(d, l) => rpcPagina<FilaArt>('fn_informe_articulos', visor.p, d, l)}
          todas={() => rpcTodas<FilaArt>('fn_informe_articulos', visor.p)}
          totales={totales}
          clave={(r) => r.codigo_interno}
          soloTotales={soloTotales}
          onAbrir={(r) => navigate(`/articulos/${encodeURIComponent(r.codigo_interno)}`)}
          onCerrar={() => setVisor(null)}
          nombreCsv="listado_articulos.csv"
        />
      )}
      {imprimir && <ImpresionInforme titulo={titulo} cols={cols} filas={imprimir} totales={totales(imprimir[0])} clave={(r) => r.codigo_interno} soloTotales={soloTotales} />}
    </div>
  )
}

/** Bloque de filtros de artículo de la captura 06-20 (también lo usa Etiquetas, debajo de los suyos). */
export function FiltrosArticulo({
  f,
  set,
  almacenes,
  name,
  sinCabecera = false,
  sinAlmacenes = false,
}: {
  f: FiltroArticulos
  set: (p: Partial<FiltroArticulos>) => void
  almacenes: { codigo: string; nombre: string }[]
  name: string
  /** Etiquetas ya pinta «Filtrar por» y «Elegir Almacén» arriba con sus propios grupos. */
  sinCabecera?: boolean
  /** Etiquetas pinta «Almacenes» junto a «Tienda y Número del Pedido». */
  sinAlmacenes?: boolean
}) {
  return (
    <div className="flex flex-col gap-1">
      {!sinCabecera && (
        <div className="grid grid-cols-2 gap-3">
          <Grupo titulo={<FiltrarPor f={f} set={set} name={name} />}>
            <RangoCodigos value={f.articulos} onChange={(r) => set({ articulos: r })} lookup={f.por === 'familia' ? 'familia' : 'articulo'} name={`${name}-art`} />
          </Grupo>
          <Grupo titulo="Elegir Almacen y/o Filtrar por el Stock del Artículo">
            <AlmacenStock value={f.alm_stock} onChange={(v) => set({ alm_stock: v })} almacenes={almacenes} />
          </Grupo>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Grupo titulo="Elegir y/o Filtrar Según Código o Descripción del Art.">
          <CondicionCampo value={f.texto} onChange={(v) => set({ texto: v })} campos={CAMPOS_CODIGO} />
        </Grupo>
        <div className="grid grid-cols-[minmax(0,1fr)_150px] items-end gap-2">
          {sinAlmacenes ? (
            <div />
          ) : (
            <Grupo titulo="Almacenes">
              <RangoCodigos value={f.almacenes} onChange={(r) => set({ almacenes: r })} lookup="almacen" name={`${name}-alm`} anchoCodigo={120} />
            </Grupo>
          )}
          <ArtAnulados value={f.anulados} onChange={(v) => set({ anulados: v })} />
        </div>
      </div>

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
            onChange={(c) => set({ pvp: { nivel: f.pvp.nivel, op: c.op, v1: c.v1, v2: c.v2 } })}
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

      <div className="grid grid-cols-2 gap-3">
        <Grupo
          titulo={
            <span className={`flex items-center gap-8 ${L}`}>
              <span className="text-[16px]">Proveedor</span>
              {(
                [
                  ['principal', 'Principal'],
                  ['articulo', 'Del Artic.'],
                  ['codigo', 'Con código'],
                ] as const
              ).map(([t, l]) => (
                <GwRadio
                  key={t}
                  name={`${name}-prov`}
                  label={<span className={L}>{l}</span>}
                  checked={f.proveedor.tipo === t}
                  onChange={() => set({ proveedor: { ...f.proveedor, tipo: t } })}
                />
              ))}
            </span>
          }
        >
          <RangoCodigos value={f.proveedor} onChange={(r) => set({ proveedor: { ...f.proveedor, ...r } })} lookup="proveedor" name={`${name}-provr`} />
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
          <CondicionCampo value={f.fecha1} onChange={(v) => set({ fecha1: v })} campos={CAMPOS_FECHA} />
        </Grupo>
        <Grupo titulo="Filtrar Según Fecha">
          <CondicionCampo value={f.fecha2} onChange={(v) => set({ fecha2: v })} campos={CAMPOS_FECHA} />
        </Grupo>
      </div>

      <Caracteristicas value={f.caract} onChange={(v) => set({ caract: v })} />
    </div>
  )
}
