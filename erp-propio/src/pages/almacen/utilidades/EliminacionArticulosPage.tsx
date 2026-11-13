import { useCallback, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, Cog, Pencil, Printer, Search } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { usePermisos } from '../../../lib/PermisosContext'
import { GwCheck, GwDate, GwRadio, GwSelect } from '../../../components/gw'
import { GwOperativa } from '../../../components/gw/GwOperativa'
import {
  ArtAnulados,
  CAMPOS_CODIGO,
  CAMPOS_FECHA,
  Caracteristicas,
  CondicionCampo,
  Conmutador,
  Grupo,
  IN,
  L,
  RangoCodigos,
  rangoJson,
  rangoVacio,
  type CampoOp,
  type Rango,
} from '../../../components/gw/GwInformeArticulos'
import { BotonCerrar, ImpresionInforme, ModalGw, VisorInforme, fechaEs, msgError, rpcPagina, rpcTodas, useAlmacenes, useF4, type ColInforme } from './comun'

// Almacén → Eliminación de Artículos. Calcada de GeminisWin (capturas 9, 12/11/2026: «Eliminar
// Artículos», filtros y restricciones + características). En GeminisWin solo se activa con la
// clave especial: aquí es solo para administradores y lo exige también la base de datos.
//  · Pantalla / Impresora / Examinar: fn_eliminar_articulos_listado (solo lectura).
//  · Procesar: fn_eliminar_articulos_baja (da de baja a partir de la fecha) o, sin la marca «No Eliminar»,
//    fn_eliminar_articulos_borrar (borra solo los que no tienen nada; el resto se da de baja).
//  · El BORRADO DEFINITIVO no está programado: pendiente de decidir por la gerencia.
// Migración: supabase/migrations/20261113_eliminacion_articulos.sql.

const FN_LISTADO = 'fn_eliminar_articulos_listado'

interface FechaRango {
  modo: 'rango' | 'cualquiera'
  desde: string
  hasta: string
}
type TipoTercero = 'marca' | 'campo_libre' | 'proveedor'
interface Filtro {
  por: 'articulo' | 'familia'
  /** Nivel de familia: 1º, 2º, 3º o el código de la familia en la web. */
  nivel: 1 | 2 | 3 | 'web'
  articulos: Rango
  alm_stock: { almacen: string; op: string; v1: string; v2: string }
  f_compra: FechaRango
  f_venta: FechaRango
  f_alta: FechaRango
  f_baja: FechaRango
  texto: CampoOp
  tercero: Rango & { tipo: TipoTercero }
  caract: Record<string, boolean>
  anulados: { no: boolean; si: boolean }
  tallas: { modo: 'excluir' | 'filtrar'; padre_mismo: boolean; padre_distinto: boolean; hijo_padre: boolean; hijo_propio: boolean }
  fecha1: CampoOp
  fecha2: CampoOp
  restr: { ventas: boolean; compras: boolean; traspasos: boolean; stock: boolean; pvp_cero: boolean }
}

const fechaVacia = (): FechaRango => ({ modo: 'cualquiera', desde: '', hasta: '' })
const sinFiltro = (campo: string): CampoOp => ({ campo, op: 'no', v1: '', v2: '' })

// Como abre GeminisWin: todo en «Cualquiera» / «No Filtrar» y las restricciones marcadas.
function filtroInicial(): Filtro {
  return {
    por: 'articulo',
    nivel: 1,
    articulos: rangoVacio(),
    alm_stock: { almacen: '*', op: 'no', v1: '', v2: '' },
    f_compra: fechaVacia(),
    f_venta: fechaVacia(),
    f_alta: fechaVacia(),
    f_baja: fechaVacia(),
    texto: sinFiltro('codigo_interno'),
    tercero: { ...rangoVacio(), tipo: 'marca' },
    caract: {},
    anulados: { no: false, si: false },
    tallas: { modo: 'excluir', padre_mismo: false, padre_distinto: false, hijo_padre: false, hijo_propio: false },
    fecha1: sinFiltro('ultima_compra_fecha'),
    fecha2: sinFiltro('ultima_venta_fecha'),
    restr: { ventas: true, compras: true, traspasos: true, stock: true, pvp_cero: false },
  }
}

/** Estado de pantalla → jsonb de fn_eliminar_articulos_* . */
function aJson(f: Filtro): Record<string, unknown> {
  return {
    ...f,
    nivel: f.nivel === 'web' ? 3 : f.nivel,
    familia_web: f.nivel === 'web',
    articulos: rangoJson(f.articulos),
    tercero: { ...rangoJson(f.tercero), tipo: f.tercero.tipo },
  }
}

const hoyCanarias = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Atlantic/Canary' })

interface Fila {
  codigo_interno: string
  descripcion: string
  familia_codigo: string | null
  marca_codigo: string | null
  proveedor_codigo: string | null
  pvp: number | null
  stock: number
  ultima_compra: string | null
  ultima_venta: string | null
  fecha_alta: string | null
  fecha_baja: string | null
  activo: boolean
  web_publicado: boolean
  tiene_ventas: boolean
  tiene_compras: boolean
  tiene_traspasos: boolean
  total_filas: number
}

const siNo = (v: boolean) => (v ? 'Sí' : 'No')
const COLS: ColInforme<Fila>[] = [
  { k: 'codigo_interno', l: 'Cod. Interno', w: 110 },
  { k: 'descripcion', l: 'Descripción', w: 300 },
  { k: 'familia_codigo', l: 'Familia', w: 70 },
  { k: 'marca_codigo', l: 'Marca', w: 100 },
  { k: 'proveedor_codigo', l: 'Proveedor', w: 70 },
  { k: 'pvp', l: 'PVP General', w: 84, d: 3 },
  { k: 'stock', l: 'Stock', w: 80, d: 3 },
  { k: 'ultima_compra', l: 'Últ. Compra', w: 86, v: (r) => fechaEs(r.ultima_compra) },
  { k: 'ultima_venta', l: 'Últ. Venta', w: 86, v: (r) => fechaEs(r.ultima_venta) },
  { k: 'fecha_alta', l: 'F. Alta', w: 86, v: (r) => fechaEs(r.fecha_alta) },
  { k: 'fecha_baja', l: 'F. Baja', w: 86, v: (r) => fechaEs(r.fecha_baja) },
  { k: 'anulado', l: 'Anulado', w: 62, v: (r) => siNo(!r.activo) },
  { k: 'web', l: 'Web', w: 44, v: (r) => siNo(r.web_publicado) },
  { k: 'ventas', l: 'Ventas', w: 54, v: (r) => siNo(r.tiene_ventas) },
  { k: 'compras', l: 'Compras', w: 62, v: (r) => siNo(r.tiene_compras) },
  { k: 'traspasos', l: 'Traspasos', w: 70, v: (r) => siNo(r.tiene_traspasos) },
]

const TITULO = 'Eliminar Artículos: artículos que cumplen los filtros y las restricciones'
const AVISO_BORRADO =
  'Si quitas la marca, se BORRAN de verdad los artículos que no tengan nada (ni ventas, compras, pedidos, presupuestos, traspasos, movimientos ni stock). Los que tengan algo no se borran: se dan de baja.'
const CHK = '!text-[15px] leading-[19px]'

type Salida = 'pantalla' | 'impresora' | 'examinar' | 'procesar'

interface Resultado {
  total: number
  dados_de_baja: number
  ya_de_baja: number
  baja_web: number
  fecha: string
  anulados: boolean
}

export function EliminacionArticulosPage() {
  const navigate = useNavigate()
  const { realAdmin, cargando } = usePermisos()
  const almacenes = useAlmacenes()
  const cerrar = useCallback(() => navigate('/'), [navigate])
  useF4(cerrar)

  const [f, setF] = useState<Filtro>(filtroInicial)
  const set = (p: Partial<Filtro>) => setF((x) => ({ ...x, ...p }))
  const [fecha, setFecha] = useState<string | null>(hoyCanarias)
  const [web, setWeb] = useState(true)
  // Marcada (como abre GeminisWin): dar de baja. Sin marcar: borrado definitivo de los que no tienen nada.
  const [noEliminar, setNoEliminar] = useState(true)
  const [textoBorrar, setTextoBorrar] = useState('')
  const [salida, setSalida] = useState<Salida>('pantalla')
  const [procesando, setProcesando] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null)
  const [visor, setVisor] = useState<null | { p: Record<string, unknown>; modo: 'pantalla' | 'examinar' }>(null)
  const [imprimir, setImprimir] = useState<Fila[] | null>(null)
  const [confirmar, setConfirmar] = useState<null | { p: Record<string, unknown>; n: number }>(null)

  const totales = (r: Fila | undefined) =>
    r ? (
      <span>
        Artículos que cumplen los filtros y las restricciones: <b>{Number(r.total_filas).toLocaleString('es-ES')}</b> · No se ha cambiado nada.
      </span>
    ) : (
      <span>Ningún artículo cumple los filtros y las restricciones.</span>
    )

  async function procesar() {
    setMsg(null)
    const p = aJson(f)
    if (salida === 'pantalla' || salida === 'examinar') return setVisor({ p, modo: salida })
    if (salida === 'procesar' && noEliminar && !fecha) {
      return setMsg({ ok: false, texto: 'Falta la fecha de baja: escríbela en «Dar de Baja a partir de la fecha» y vuelve a pulsar Procesar.' })
    }
    setProcesando(true)
    try {
      if (salida === 'impresora') {
        const filas = await rpcTodas<Fila>(FN_LISTADO, p)
        setImprimir(filas)
        setTimeout(() => {
          window.print()
          setImprimir(null)
        }, 400)
      } else {
        // Procesar: primero se cuenta (sin cambiar nada) y se pide confirmación con el número.
        const filas = await rpcPagina<Fila>(FN_LISTADO, p, 0, 1)
        const n = Number(filas[0]?.total_filas ?? 0)
        if (!n) setMsg({ ok: false, texto: 'Ningún artículo cumple los filtros y las restricciones: no hay nada que dar de baja. Revisa los filtros con «Examinar».' })
        else {
          setTextoBorrar('')
          setConfirmar({ p, n })
        }
      }
    } catch (e) {
      setMsg({ ok: false, texto: `No se ha podido procesar: ${msgError(e)}` })
    } finally {
      setProcesando(false)
    }
  }

  /** Borrado definitivo: solo los que no tienen nada; el resto se da de baja (lo decide la base de datos). */
  async function borrar() {
    if (!confirmar) return
    const { p, n } = confirmar
    setConfirmar(null)
    setProcesando(true)
    try {
      const { data, error } = await supabase.rpc('fn_eliminar_articulos_borrar', { p, p_esperados: n })
      if (error) throw error
      const r = data as { total: number; borrados: number; dados_de_baja: number }
      setMsg({
        ok: true,
        texto:
          `Proceso terminado: ${r.borrados} artículo(s) borrados del todo` +
          (r.dados_de_baja ? `; ${r.dados_de_baja} tenían ventas, compras, pedidos, movimientos o stock y se han dado de baja en vez de borrarse.` : '.'),
      })
    } catch (e) {
      setMsg({ ok: false, texto: `No se ha borrado ningún artículo: ${msgError(e)}` })
    } finally {
      setProcesando(false)
    }
  }

  async function darDeBaja() {
    if (!confirmar || !fecha) return
    const { p, n } = confirmar
    setConfirmar(null)
    setProcesando(true)
    try {
      const { data, error } = await supabase.rpc('fn_eliminar_articulos_baja', { p, p_fecha: fecha, p_web: web, p_esperados: n })
      if (error) throw error
      const r = data as Resultado
      setMsg({
        ok: true,
        texto:
          `Proceso terminado: ${r.dados_de_baja} artículo(s) con fecha de baja ${fechaEs(r.fecha)}` +
          (r.anulados ? ' y anulados' : ' (siguen activos: la fecha todavía no ha llegado)') +
          (r.ya_de_baja ? `; ${r.ya_de_baja} ya estaban de baja` : '') +
          (web ? `; ${r.baja_web} dado(s) de baja en la web` : '') +
          '. No se ha borrado ninguno.',
      })
    } catch (e) {
      setMsg({ ok: false, texto: `No se ha dado de baja ningún artículo: ${msgError(e)}` })
    } finally {
      setProcesando(false)
    }
  }

  if (cargando) return <div className="p-3 text-[15px]">Cargando…</div>
  if (!realAdmin) {
    return (
      <div className="flex h-full flex-col gap-3 p-3">
        <div className="max-w-[760px] border border-[#c42b1c] bg-[#fde7e9] px-3 py-2 text-[15px] leading-[22px] text-[#a4262c]">
          La Eliminación de Artículos es solo para administradores (en GeminisWin pide la clave especial). Si necesitas dar de baja artículos en bloque, pídeselo a un
          administrador; para uno solo, puedes anularlo desde su ficha (Artículos).
        </div>
        <div>
          <BotonCerrar onClick={cerrar} />
        </div>
      </div>
    )
  }

  const bSalida = (s: Salida, icono: ReactNode, texto: string) => (
    <button
      type="button"
      className={`gw-btn !h-[40px] flex-1 !gap-1.5 !text-[17px] ${salida === s ? '!border-[#7a7a7a] !bg-[#f7f7f7] shadow-[inset_1px_1px_2px_rgba(0,0,0,0.25)]' : ''}`}
      aria-pressed={salida === s}
      onClick={() => setSalida(s)}
    >
      {icono}
      {texto}
    </button>
  )
  const tallas = (k: 'padre_mismo' | 'padre_distinto' | 'hijo_padre' | 'hijo_propio', texto: string) => (
    <Conmutador className="w-full justify-center" on={f.tallas[k]} onChange={(v) => set({ tallas: { ...f.tallas, [k]: v } })}>
      {texto}
    </Conmutador>
  )
  const restr = (k: keyof Filtro['restr'], texto: string) => (
    <GwCheck className={CHK} label={texto} checked={f.restr[k]} onChange={(v) => set({ restr: { ...f.restr, [k]: v } })} />
  )

  return (
    <div className="flex h-full min-h-0 flex-col gap-1">
      {/* Zona de filtros (en GeminisWin también lleva su propia barra de desplazamiento). */}
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden border border-[var(--gw-border-light)] p-1">
        <div className="flex flex-col gap-1">
          <div className="grid grid-cols-2 gap-3">
            <Grupo
              titulo={
                <span className={`flex items-center gap-4 ${L}`}>
                  <span className="text-[16px]">Filtrar por:</span>
                  <GwRadio name="elim-por" label={<span className={L}>Artículo</span>} checked={f.por === 'articulo'} onChange={() => set({ por: 'articulo' })} />
                  <GwRadio name="elim-por" label={<span className={L}>Familia:</span>} checked={f.por === 'familia'} onChange={() => set({ por: 'familia' })} />
                  {([1, 2, 3, 'web'] as const).map((n) => (
                    <GwRadio
                      key={n}
                      name="elim-nivel"
                      disabled={f.por !== 'familia'}
                      label={<span className={L}>{n === 'web' ? 'Web' : `${n}º`}</span>}
                      checked={f.nivel === n}
                      onChange={() => set({ nivel: n })}
                    />
                  ))}
                </span>
              }
            >
              <RangoCodigos value={f.articulos} onChange={(r) => set({ articulos: r })} lookup={f.por === 'familia' ? 'familia' : 'articulo'} name="elim-art" />
            </Grupo>
            <Grupo titulo="Filtrar por el Stock del Artículo">
              <CondicionCampo
                value={{ campo: f.alm_stock.almacen, op: f.alm_stock.op, v1: f.alm_stock.v1, v2: f.alm_stock.v2 }}
                tipoFijo="num"
                onChange={(c) => set({ alm_stock: { almacen: f.alm_stock.almacen, op: c.op, v1: c.v1, v2: c.v2 } })}
                sinCampo={
                  <GwSelect className={IN} value={f.alm_stock.almacen} title="Almacén del que se mira el stock" onChange={(e) => set({ alm_stock: { ...f.alm_stock, almacen: e.target.value } })}>
                    <option value="*">Todos los Almacenes</option>
                    {almacenes.map((a) => (
                      <option key={a.codigo} value={a.codigo}>
                        {a.codigo} {a.nombre}
                      </option>
                    ))}
                  </GwSelect>
                }
              />
            </Grupo>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Grupo titulo="Fecha Ultima Compra">
              <FechaDesdeHasta name="elim-fc" value={f.f_compra} onChange={(v) => set({ f_compra: v })} />
            </Grupo>
            <Grupo titulo="Fecha Ultima Venta">
              <FechaDesdeHasta name="elim-fv" value={f.f_venta} onChange={(v) => set({ f_venta: v })} />
            </Grupo>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Grupo titulo="Fecha de Alta del Artículo">
              <FechaDesdeHasta name="elim-fa" value={f.f_alta} onChange={(v) => set({ f_alta: v })} />
            </Grupo>
            <Grupo titulo="Fecha de Baja del Artículo">
              <FechaDesdeHasta name="elim-fb" value={f.f_baja} onChange={(v) => set({ f_baja: v })} />
            </Grupo>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Grupo titulo="Elegir y/o Filtrar y Ordenar según Código, ...">
              <CondicionCampo value={f.texto} onChange={(v) => set({ texto: v })} campos={CAMPOS_CODIGO} />
            </Grupo>
            <Grupo
              titulo={
                <span className={`flex items-center gap-8 ${L}`}>
                  <span className="text-[16px]">Filtrar por:</span>
                  {(
                    [
                      ['marca', 'Marca'],
                      ['campo_libre', 'Campo Libre'],
                      ['proveedor', 'Proveedor'],
                    ] as const
                  ).map(([t, l]) => (
                    <GwRadio
                      key={t}
                      name="elim-tercero"
                      label={<span className={L}>{l}</span>}
                      checked={f.tercero.tipo === t}
                      onChange={() => set({ tercero: { ...f.tercero, tipo: t, desde: '', hasta: '', lista: '' } })}
                    />
                  ))}
                </span>
              }
            >
              <RangoCodigos
                value={f.tercero}
                onChange={(r) => set({ tercero: { ...f.tercero, ...r } })}
                lookup={f.tercero.tipo === 'campo_libre' ? undefined : f.tercero.tipo}
                name="elim-ter"
              />
            </Grupo>
          </div>

          <Caracteristicas value={f.caract} onChange={(v) => set({ caract: v })} />

          <div className="grid grid-cols-[150px_minmax(0,1fr)] gap-3">
            <ArtAnulados value={f.anulados} onChange={(v) => set({ anulados: v })} />
            <Grupo
              titulo="Tallas y Colores"
              derecha={
                <span className={`flex flex-1 items-center justify-around ${L}`}>
                  <GwRadio
                    name="elim-tallas"
                    label={<span className={L}>Excluir los artículos Seleccionados</span>}
                    checked={f.tallas.modo === 'excluir'}
                    onChange={() => set({ tallas: { ...f.tallas, modo: 'excluir' } })}
                  />
                  <GwRadio
                    name="elim-tallas"
                    label={<span className={L}>Filtrar los Artículos Seleccionados</span>}
                    checked={f.tallas.modo === 'filtrar'}
                    onChange={() => set({ tallas: { ...f.tallas, modo: 'filtrar' } })}
                  />
                </span>
              }
            >
              <div className="grid grid-cols-[1.55fr_1fr] gap-x-3 gap-y-1 py-0.5">
                {tallas('padre_mismo', 'Artic. Padre con el mismo PVP para todos los Hijos')}
                {tallas('hijo_padre', 'Artic. Hijo con el PVP del Padre')}
                {tallas('padre_distinto', 'Artic. Padre con diferente PVP para cada Hijo')}
                {tallas('hijo_propio', 'Artic. Hijo con PVP Propio')}
              </div>
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

          <Grupo titulo="Operativa">
            <GwOperativa
              bloques={[
                {
                  titulo: 'Cómo se usa',
                  pasos: [
                    'Elige los artículos con los filtros de arriba (rango de artículos o familias, stock, fechas, marca, proveedor, características…). Lo que se deja en «Cualquiera» o «No Filtrar» no filtra.',
                    'Deja marcadas las restricciones de abajo: son las que protegen a los artículos con ventas, compras, traspasos o stock.',
                    'Pulsa «Examinar» (o «Pantalla») y después el botón grande «Procesar»: sale la lista de artículos que cumplen y cuántos son. Ahí no se cambia nada. «Impresora» la saca en papel.',
                    'Cuando la lista sea la buena, pon la fecha en «Dar de Baja a partir de la fecha», elige «Procesar» en la barra de salida y pulsa el botón grande «Procesar». El programa dice cuántos artículos son y pide confirmación.',
                  ],
                  notas: [
                    'Solo para administradores (en GeminisWin pide la clave especial). La base de datos también lo comprueba.',
                    'Con la casilla «Al Procesar, No Eliminar Artículos» marcada (como abre), no se borra nada: se les pone la fecha de baja y quedan anulados. Si la fecha es futura, el artículo sigue activo hasta ese día y entonces se da de baja solo (cada noche).',
                    'Si quitas esa marca, es BORRADO DEFINITIVO: se borran del todo solo los artículos que no tienen nada (ni ventas, compras, pedidos, presupuestos, traspasos, movimientos ni stock) y no se pueden recuperar. Los que tengan algo no se borran: se dan de baja. Pide escribir BORRAR para confirmar.',
                    '«Darlos de baja en la Web» quita «publicar en web» a los que estaban publicados y les pone la fecha de baja web; la web se actualiza en la siguiente sincronización del catálogo.',
                    '«No Eliminar Artículos que tengan Ventas» mira las ventas y los pedidos de clientes; «Compras», los pedidos a proveedores; «Traspasos», los traspasos entre almacenes.',
                    'Cada artículo dado de baja queda en la Auditoría con quién lo hizo. Para deshacerlo, vuelve a activar el artículo desde su ficha.',
                  ],
                },
              ]}
            />
          </Grupo>
        </div>
      </div>

      <Grupo titulo="Restricciones para la Eliminación de los Artículos" className="flex-none">
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] gap-x-4 gap-y-1">
          {restr('ventas', 'No Eliminar Artículos que tengan Ventas')}
          {restr('stock', 'No Eliminar Artículos que tengan el Stock >0 en Algún Almacen')}
          {restr('compras', 'No Eliminar Artículos que tengan Compras')}
          {restr('pvp_cero', 'Sólo Eliminar Artículos que tengan el PVP General =0')}
          {restr('traspasos', 'No Eliminar Artículos que tengan Traspasos entre Almacenes')}
        </div>
      </Grupo>

      <div className="flex flex-none flex-wrap items-center gap-x-3 gap-y-0.5 px-1">
        <span title={AVISO_BORRADO}>
          <GwCheck className={CHK} label="Al Procesar, No Eliminar Artículos, Dar de Baja a partir de la fecha:" checked={noEliminar} onChange={setNoEliminar} />
        </span>
        <span className="ml-auto w-[170px] flex-none">
          <GwDate className={IN} title="Fecha de baja" value={fecha} onChange={setFecha} />
        </span>
        <GwCheck className={`${CHK} w-[300px] flex-none`} label="Darlos de baja en la Web" checked={web} onChange={setWeb} />
        <span className={`w-full text-[12px] leading-[14px] ${noEliminar ? 'italic text-[#6d6d6d]' : 'font-bold text-[#c42b1c]'}`}>
          {noEliminar ? AVISO_BORRADO : 'BORRADO DEFINITIVO activado: los artículos que no tengan nada se borran y no se pueden recuperar. Los que tengan algo se dan de baja.'}
        </span>
      </div>

      {msg && (
        <div className={`flex-none border px-2 py-1 text-[14px] ${msg.ok ? 'border-[#127a12] bg-[#e7f6e7] text-[#0b5a0b]' : 'border-[#c42b1c] bg-[#fde7e9] text-[#a4262c]'}`} role="status">
          {msg.texto}
        </div>
      )}

      <div className="flex flex-none items-stretch gap-2 border-t border-[var(--gw-border-light)] pr-[64px] pt-1">
        <div className="flex w-[175px] flex-none items-center px-1 text-[16px] leading-[19px]">Pulse F4 para cerrar la ventana</div>
        <div className="flex flex-1 gap-0.5 border border-[var(--gw-border-light)] p-0.5">
          {bSalida('pantalla', <Pencil size={14} />, 'Pantalla')}
          {bSalida('impresora', <Printer size={15} />, 'Impresora')}
          {bSalida('examinar', <Search size={15} />, 'Examinar')}
          {bSalida('procesar', <Cog size={15} />, 'Procesar')}
        </div>
        <button type="button" className="gw-btn !h-[46px] !w-[150px] !gap-1.5 !text-[18px]" onClick={procesar} disabled={procesando}>
          <Check size={17} strokeWidth={3} className="text-[#127a12]" />
          {procesando ? 'Procesando…' : 'Procesar'}
        </button>
        <BotonCerrar onClick={cerrar} />
      </div>

      {visor && (
        <VisorInforme<Fila>
          titulo={TITULO}
          modo={visor.modo}
          cols={COLS}
          cargar={(d, l) => rpcPagina<Fila>(FN_LISTADO, visor.p, d, l)}
          todas={() => rpcTodas<Fila>(FN_LISTADO, visor.p)}
          totales={totales}
          clave={(r) => r.codigo_interno}
          onAbrir={(r) => navigate(`/articulos/${encodeURIComponent(r.codigo_interno)}`)}
          onCerrar={() => setVisor(null)}
          nombreCsv="eliminar_articulos.csv"
        />
      )}
      {imprimir && <ImpresionInforme titulo={TITULO} cols={COLS} filas={imprimir} totales={totales(imprimir[0])} clave={(r) => r.codigo_interno} />}

      {confirmar && (
        <ModalGw titulo="Eliminar Artículos" onClose={() => setConfirmar(null)} ancho={560}>
          <div className="flex flex-col gap-2 p-1 text-[15px] leading-[21px]">
            {noEliminar ? (
              <>
                <p>
                  Se van a dar de baja <b>{confirmar.n.toLocaleString('es-ES')}</b> artículo(s) a partir del <b>{fechaEs(fecha)}</b>
                  {web ? ', y también en la web los que estén publicados' : ''}.
                </p>
                <p>No se borra ninguno: quedan con la fecha de baja y anulados, y cada uno queda apuntado en la Auditoría.</p>
              </>
            ) : (
              <>
                <p className="font-bold text-[#c42b1c]">
                  BORRADO DEFINITIVO de <b>{confirmar.n.toLocaleString('es-ES')}</b> artículo(s).
                </p>
                <p>
                  Se borran del todo los que no tengan nada (ni ventas, compras, pedidos, presupuestos, traspasos, movimientos ni stock) y <b>no se pueden recuperar</b>. Los que tengan
                  algo no se borran: se dan de baja. Cada uno queda apuntado en la Auditoría.
                </p>
                <label className="flex items-center gap-2">
                  Para confirmar, escribe BORRAR:
                  <input className="gw-input h-[28px] w-[120px] px-1 uppercase" value={textoBorrar} onChange={(e) => setTextoBorrar(e.target.value)} />
                </label>
              </>
            )}
            <div className="mt-1 flex justify-end gap-2">
              <button
                type="button"
                className="gw-btn !h-[34px] !gap-1.5 !px-3 !text-[15px]"
                onClick={() => {
                  setVisor({ p: confirmar.p, modo: 'examinar' })
                  setConfirmar(null)
                }}
              >
                <Search size={15} /> Examinar la lista
              </button>
              {noEliminar ? (
                <button type="button" className="gw-btn !h-[34px] !gap-1.5 !px-3 !text-[15px]" onClick={darDeBaja}>
                  <Check size={16} strokeWidth={3} className="text-[#127a12]" /> Dar de baja {confirmar.n.toLocaleString('es-ES')} artículo(s)
                </button>
              ) : (
                <button type="button" className="gw-btn !h-[34px] !gap-1.5 !px-3 !text-[15px] text-[#c42b1c]" disabled={textoBorrar.trim().toUpperCase() !== 'BORRAR'} onClick={borrar}>
                  Borrar {confirmar.n.toLocaleString('es-ES')} artículo(s)
                </button>
              )}
              <button type="button" className="gw-btn !h-[34px] !px-3 !text-[15px]" onClick={() => setConfirmar(null)}>
                Cancelar
              </button>
            </div>
          </div>
        </ModalGw>
      )}
    </div>
  )
}

/** «Desde/Hasta · Cualquiera» con dos fechas (Fecha Ultima Compra, Ultima Venta, de Alta y de Baja). */
function FechaDesdeHasta({ value, onChange, name }: { value: FechaRango; onChange: (v: FechaRango) => void; name: string }) {
  const p = (x: Partial<FechaRango>) => onChange({ ...value, ...x })
  const off = value.modo !== 'rango'
  return (
    <div className="flex items-center gap-2">
      <div className={`flex w-[118px] flex-none flex-col ${L}`}>
        <GwRadio name={name} label={<span className={L}>Desde/Hasta</span>} checked={!off} onChange={() => p({ modo: 'rango' })} />
        <GwRadio name={name} label={<span className={L}>Cualquiera</span>} checked={off} onChange={() => p({ modo: 'cualquiera' })} />
      </div>
      <span className="min-w-0 flex-1">
        <GwDate className={IN} title="Desde" value={value.desde || null} disabled={off} onChange={(v) => p({ desde: v ?? '' })} />
      </span>
      <span className="min-w-0 flex-1">
        <GwDate className={IN} title="Hasta" value={value.hasta || null} disabled={off} onChange={(v) => p({ hasta: v ?? '' })} />
      </span>
    </div>
  )
}
