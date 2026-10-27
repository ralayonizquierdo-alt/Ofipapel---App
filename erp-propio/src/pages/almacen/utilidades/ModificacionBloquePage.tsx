import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, X } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { GwCheck, GwDate, GwInput, GwSelect, GwTextArea, GwWindow, formatGw } from '../../../components/gw'
import { GwRecordBar } from '../../../components/gw/GwRecordBar'
import { GwLookupDialog } from '../../../components/gw/GwLookupDialog'
import { GwCampoBusqueda } from '../../../components/gw/GwCampoBusqueda'
import { GridMiniBar } from '../../../components/gw/GwGridParts'
import { useFichaMaestro } from '../useFichaMaestro'
import { horaActual, hoyISO, siguienteCodigo } from '../modPreciosComun'
import { CodigoBuscar, IN, L } from '../../../components/gw/GwInformeArticulos'
import { msgError } from './comun'

// Almacén → Modif. de Artículos en bloque. Calcada de las capturas 06-26 (pestaña Artículos de
// un registro existente) y 06-27 (pestaña Opciones, «Parametrización de los Campos de los
// Artículos»): lote con Código, Fecha, Hora, Concepto y Observaciones; en Artículos, una línea por
// artículo con las columnas de los campos marcados «Visible»; en Opciones, qué campos se ven y
// cuáles se «Actualizan». El botón «Actualizado» vuelca en las fichas SOLO los campos marcados
// «Actualizar», en una transacción (fn_modificacion_articulos_aplicar).
// La lista completa de campos de GeminisWin no se ve entera en la captura (sigue tras «Stock
// Mín.»): el resto es propuesta; confirmar con Luis, igual que «Sin Desc. Corta» (web_descripcion_corta_envio).

type Tipo = 't' | 'n' | 'b' | 'd'
interface CampoDef {
  k: string
  l: string
  t: Tipo
  w: number
}

export const CAMPOS: CampoDef[] = [
  { k: 'codigo_interno', l: 'Cod. Interno', t: 't', w: 110 },
  { k: 'codigo_compra_habitual', l: 'Cód. Compra', t: 't', w: 110 },
  { k: 'descripcion', l: 'Descripción', t: 't', w: 300 },
  { k: 'familia_codigo', l: 'Família', t: 't', w: 80 },
  { k: 'proveedor_habitual_codigo', l: 'Proveedor', t: 't', w: 80 },
  { k: 'control_lotes', l: 'Control Lotes', t: 'n', w: 80 },
  { k: 'unidades_por_caja', l: 'Und. Caja', t: 'n', w: 80 },
  { k: 'cajas_por_bulto', l: 'Caj. Bulto', t: 'n', w: 80 },
  { k: 'unidad_medida', l: 'Und. Medida', t: 't', w: 90 },
  { k: 'unidad_medida_base', l: 'Und. Básica', t: 't', w: 90 },
  { k: 'unidad_medida_valor', l: 'Valor Und. Med.', t: 'n', w: 100 },
  { k: 'sin_control_stock', l: 'Sin Stock', t: 'b', w: 70 },
  { k: 'stock_minimo', l: 'Stock Mín.', t: 'n', w: 85 },
  { k: 'stock_maximo', l: 'Stock Máx.', t: 'n', w: 85 },
  { k: 'pedido_recomendado', l: 'Ped. Recom.', t: 'n', w: 85 },
  { k: 'ubicacion_1', l: 'Ubicación 1', t: 't', w: 90 },
  { k: 'ubicacion_2', l: 'Ubicación 2', t: 't', w: 90 },
  { k: 'marca_codigo', l: 'Marca', t: 't', w: 110 },
  { k: 'codigo_venta', l: 'Cód. Venta', t: 't', w: 100 },
  { k: 'descripcion_corta', l: 'Desc. Corta', t: 't', w: 160 },
  { k: 'campo_libre', l: 'Campo Libre', t: 't', w: 100 },
  { k: 'igic_pct', l: '% IGIC', t: 'n', w: 70 },
  { k: 'plantilla_tarifa_codigo', l: 'Plantilla Tar.', t: 't', w: 90 },
  { k: 'descuento_maximo_cliente_pct', l: 'Dto. Máx.', t: 'n', w: 75 },
  { k: 'pvp_fijo', l: 'Pvp Fijo', t: 'b', w: 65 },
  { k: 'generico', l: 'Genérico', t: 'b', w: 70 },
  { k: 'no_ver_en_venta', l: 'No Ver Venta', t: 'b', w: 85 },
  { k: 'no_ver_en_compra', l: 'No Ver Compra', t: 'b', w: 95 },
  { k: 'garantia_meses', l: 'Garantía', t: 'n', w: 70 },
  { k: 'fecha_baja', l: 'F. Baja', t: 'd', w: 90 },
  { k: 'activo', l: 'Activo', t: 'b', w: 60 },
  { k: 'imagen_url', l: 'Imagen', t: 't', w: 220 },
  { k: 'web_publicado', l: 'Web', t: 'b', w: 50 },
  { k: 'web_fecha_baja', l: 'F. Baja Web', t: 'd', w: 100 },
  { k: 'web_sin_imagen', l: 'Sin Img.', t: 'b', w: 85 },
  { k: 'web_sin_observaciones', l: 'Sin Obs.', t: 'b', w: 85 },
  { k: 'web_sin_oferta', l: 'Sin Ofert.', t: 'b', w: 90 },
  { k: 'web_descripcion_corta_envio', l: 'Sin Desc. Corta', t: 'b', w: 150 },
  { k: 'web_descripcion', l: 'Desc. Web', t: 't', w: 200 },
  { k: 'web_categoria', l: 'Categoría Web', t: 't', w: 140 },
  { k: 'web_fabricante', l: 'Fabricante Web', t: 't', w: 140 },
  { k: 'observaciones', l: 'Observaciones', t: 't', w: 220 },
]
const SELECT_CAMPOS = CAMPOS.map((c) => c.k).join(', ')

type Param = Record<string, { v: boolean; a: boolean }>
interface Lote {
  codigo: string
  fecha: string | null
  hora: string | null
  concepto: string | null
  observaciones: string | null
  actualizado: boolean
  fecha_hora_actualizacion: string | null
  campos: Param
}
const VACIO: Lote = {
  codigo: '',
  fecha: null,
  hora: null,
  concepto: '',
  observaciones: null,
  actualizado: false,
  fecha_hora_actualizacion: null,
  campos: { codigo_interno: { v: true, a: false }, descripcion: { v: true, a: false } },
}
interface Linea {
  id?: number
  articulo_codigo: string
  datos: Record<string, unknown>
}

const fecha = (v: unknown) => {
  if (!v) return '  /  /'
  const s = String(v)
  const d = new Date(s.length === 10 ? `${s}T00:00:00` : s)
  return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function ModificacionBloquePage() {
  const f = useFichaMaestro<Lote>({
    tabla: 'modificacion_articulo',
    base: '/almacen/modificacion-bloque',
    vacio: VACIO,
    campoNombre: 'concepto',
    que: 'la modificación',
    titulo: 'Modificaciones de artículos',
    etiquetaNombre: 'Concepto',
    rpc: 'gw_lista_ordenada_almacen',
    sinColumnas: ['actualizado_en', 'creado_en'],
  })
  const { draft, patch, editing, mode } = f
  const [tab, setTab] = useState<'articulos' | 'opciones'>('articulos')
  const [lineas, setLineas] = useState<Linea[]>([])
  const [guardadas, setGuardadas] = useState<Linea[]>([])
  const [sel, setSel] = useState(0)
  const [editIdx, setEditIdx] = useState<number | null>(null)
  const [campoSel, setCampoSel] = useState(0)
  const [dialogo, setDialogo] = useState<null | 'nueva' | 'buscarLinea' | 'buscarFicha'>(null)
  const [aplicando, setAplicando] = useState(false)
  const [info, setInfo] = useState<string | null>(null)

  const param: Param = draft.campos ?? {}
  const visibles = CAMPOS.filter((c) => c.k === 'codigo_interno' || param[c.k]?.v)
  const aActualizar = CAMPOS.filter((c) => param[c.k]?.a)

  useEffect(() => {
    setEditIdx(null)
    setSel(0)
    setInfo(null)
    if (mode === 'alta') {
      setLineas([])
      setGuardadas([])
      return
    }
    if (!f.registro.codigo) return
    let vivo = true
    supabase
      .from('modificacion_articulo_linea')
      .select('id, articulo_codigo, datos')
      .eq('modificacion_codigo', f.registro.codigo)
      .order('id')
      .then(({ data }) => {
        if (!vivo) return
        const ls = (data ?? []) as Linea[]
        setLineas(ls)
        setGuardadas(ls)
      })
    return () => {
      vivo = false
    }
  }, [f.registro.codigo, mode])

  useEffect(() => {
    if (mode === 'alta' && f.listaCargada && !draft.codigo)
      patch({
        codigo: siguienteCodigo(
          f.lista.map((l) => l.codigo),
          4,
        ),
        fecha: hoyISO(),
        hora: horaActual(),
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, f.listaCargada, draft.codigo])

  const setParam = (k: string, p: Partial<{ v: boolean; a: boolean }>) => patch({ campos: { ...param, [k]: { v: !!param[k]?.v, a: !!param[k]?.a, ...p } } })
  const todos = (p: Partial<{ v: boolean; a: boolean }>) =>
    patch({ campos: Object.fromEntries(CAMPOS.map((c) => [c.k, { v: !!param[c.k]?.v, a: !!param[c.k]?.a, ...p, ...(c.k === 'codigo_interno' ? { a: false } : {}) }])) })

  async function anadirArticulos(codigos: string[]) {
    const nuevos = codigos.filter((c) => !lineas.some((l) => l.articulo_codigo === c))
    if (!nuevos.length) return setInfo('Esos artículos ya están en la modificación.')
    const filas: Linea[] = []
    for (let i = 0; i < nuevos.length; i += 300) {
      const { data, error } = await supabase
        .from('articulo')
        .select(SELECT_CAMPOS)
        .in('codigo_interno', nuevos.slice(i, i + 300))
      if (error) return setInfo(`Error: ${error.message}`)
      for (const r of (data ?? []) as unknown as Record<string, unknown>[]) filas.push({ articulo_codigo: String(r.codigo_interno), datos: r })
    }
    filas.sort((a, b) => a.articulo_codigo.localeCompare(b.articulo_codigo))
    setLineas((ls) => [...ls, ...filas])
    setSel(lineas.length)
    setInfo(`${filas.length} artículo(s) añadido(s).`)
  }

  const setDato = (i: number, k: string, v: unknown) => setLineas((ls) => ls.map((l, j) => (j === i ? { ...l, datos: { ...l.datos, [k]: v } } : l)))

  async function guardarLineas(cod: string): Promise<string | null> {
    const quitadas = guardadas.filter((g) => g.id && !lineas.some((l) => l.id === g.id)).map((g) => g.id as number)
    if (quitadas.length) {
      const { error } = await supabase.from('modificacion_articulo_linea').delete().in('id', quitadas)
      if (error) return `No se pudieron quitar líneas: ${error.message}`
    }
    const nuevas = lineas.filter((l) => !l.id).map((l) => ({ modificacion_codigo: cod, articulo_codigo: l.articulo_codigo, datos: l.datos }))
    for (let i = 0; i < nuevas.length; i += 500) {
      const { error } = await supabase.from('modificacion_articulo_linea').insert(nuevas.slice(i, i + 500))
      if (error) return `Error al guardar líneas: ${error.message}`
    }
    for (const l of lineas.filter((x) => x.id)) {
      const g = guardadas.find((x) => x.id === l.id)
      if (g && JSON.stringify(g.datos) === JSON.stringify(l.datos)) continue
      const { error } = await supabase.from('modificacion_articulo_linea').update({ datos: l.datos }).eq('id', l.id!)
      if (error) return `Error en la línea ${l.articulo_codigo}: ${error.message}`
    }
    const { data } = await supabase.from('modificacion_articulo_linea').select('id, articulo_codigo, datos').eq('modificacion_codigo', cod).order('id')
    setLineas((data ?? []) as Linea[])
    setGuardadas((data ?? []) as Linea[])
    setEditIdx(null)
    return null
  }

  async function actualizar() {
    if (editing || !f.registro.codigo) return
    if (!guardadas.length) return setInfo('No hay artículos en la modificación.')
    if (!aActualizar.length) return setInfo('No hay ningún campo marcado «Actualizar» en la pestaña Opciones.')
    const ya = draft.actualizado
    if (
      !confirm(
        `${ya ? 'Esta modificación YA se actualizó. ¿Volver a actualizar' : '¿Actualizar'} ${guardadas.length} artículo(s) con estos campos?\n\n${aActualizar.map((c) => c.l).join(', ')}\n\nSe sobrescriben en la ficha de cada artículo.`,
      )
    )
      return
    setAplicando(true)
    try {
      const { data, error } = await supabase.rpc('fn_modificacion_articulos_aplicar', { p_codigo: f.registro.codigo })
      if (error) throw error
      patch({ actualizado: true })
      setInfo(`Actualizados ${data} artículo(s): ${aActualizar.map((c) => c.l).join(', ')}.`)
    } catch (e) {
      setInfo(`Error: ${msgError(e)}`)
    } finally {
      setAplicando(false)
    }
  }

  const labInfo =
    info ??
    (draft.actualizado
      ? `Actualizado${draft.fecha_hora_actualizacion ? ` el ${new Date(draft.fecha_hora_actualizacion).toLocaleString('es-ES')}` : ''} · ${lineas.length} artículo(s)`
      : `${lineas.length} artículo(s) · ${aActualizar.length ? `actualiza: ${aActualizar.map((c) => c.l).join(', ')}` : 'ningún campo marcado para actualizar'}`)

  const anchoTabla = useMemo(() => visibles.reduce((t, c) => t + c.w, 14), [visibles])

  function celda(l: Linea, i: number, c: CampoDef) {
    const v = l.datos[c.k]
    const edita = editing && c.k !== 'codigo_interno' && (c.t === 'b' || editIdx === i)
    if (c.t === 'b')
      return (
        <input
          type="checkbox"
          className="m-0 h-[12px] w-[12px] align-middle"
          checked={!!v}
          disabled={!edita}
          onChange={(e) => setDato(i, c.k, e.target.checked)}
          onClick={(e) => e.stopPropagation()}
        />
      )
    if (!edita) return c.t === 'd' ? fecha(v) : c.t === 'n' ? (v == null ? '' : formatGw(Number(v), c.k === 'igic_pct' || c.k.endsWith('_pct') ? 2 : 3)) : String(v ?? '')
    if (c.t === 'd') return <GwDate className="!h-[20px]" value={(v as string) || null} onChange={(x) => setDato(i, c.k, x)} />
    return (
      <input
        className={`gw-input !h-[20px] ${c.t === 'n' ? 'text-right' : ''}`}
        value={v == null ? '' : String(v)}
        onChange={(e) => setDato(i, c.k, c.t === 'n' ? (e.target.value === '' ? null : e.target.value.replace(',', '.')) : e.target.value || null)}
      />
    )
  }

  if (f.loading) return <div className="p-4 text-[13px]">Cargando…</div>
  const ro = !editing
  const lbl = 'text-[17px] leading-[20px]'

  return (
    <div className="flex h-full min-h-0 flex-col gap-1">
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
        <div className="grid grid-cols-[140px_125px_70px_minmax(0,1fr)] items-start gap-x-1.5">
          <label className="flex flex-col">
            <span className={lbl}>Codigo</span>
            <GwCampoBusqueda
              className="!h-[28px] !text-[17px]"
              value={draft.codigo}
              editable={mode === 'alta'}
              disabled={mode === 'edicion'}
              maxLength={10}
              title="CODIGO"
              onChange={(v) => patch({ codigo: v })}
              {...f.busqueda('codigo')}
            />
          </label>
          <label className="flex flex-col">
            <span className={lbl}>Fecha</span>
            <GwDate className="!h-[28px] !text-[17px]" value={draft.fecha} disabled={ro} onChange={(v) => patch({ fecha: v })} />
          </label>
          <label className="flex flex-col">
            <span className={lbl}>Hora</span>
            <GwInput className="!h-[28px] !text-[17px]" value={draft.hora ?? ''} disabled={ro} maxLength={5} onChange={(e) => patch({ hora: e.target.value || null })} />
          </label>
          <label className="flex flex-col">
            <span className={lbl}>Concepto</span>
            <GwCampoBusqueda
              className="!h-[28px] !text-[17px]"
              value={draft.concepto}
              editable={editing}
              maxLength={40}
              title="CONCEPTO"
              onChange={(v) => patch({ concepto: v })}
              {...f.busqueda('nombre')}
            />
          </label>
        </div>
        <label className="flex flex-col">
          <span className={lbl}>Observaciones</span>
          <GwTextArea rows={3} className="!text-[16px]" value={draft.observaciones ?? ''} disabled={ro} onChange={(e) => patch({ observaciones: e.target.value || null })} />
        </label>
      </div>
      {f.error && <div className="text-[13px] text-[#c42b1c]">{f.error}</div>}

      <div className="grid grid-cols-2">
        {(
          [
            ['articulos', 'Artículos'],
            ['opciones', 'Opciones'],
          ] as const
        ).map(([k, l]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={`h-[38px] border border-[var(--gw-border-light)] text-[18px] ${tab === k ? 'border-b-transparent bg-[var(--gw-face)] font-bold' : 'bg-[#ececec]'}`}
          >
            {l}
          </button>
        ))}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-1">
        {f.sinRegistros && mode === 'consulta' ? (
          <div className="p-3 text-[14px]">No hay ninguna modificación de artículos. Pulsa Nuevo para crear la primera.</div>
        ) : tab === 'articulos' ? (
          <>
            <div className="min-h-0 flex-1 overflow-auto border border-[var(--gw-border)] bg-white">
              <table className="gw-grid table-fixed" style={{ width: Math.max(anchoTabla, 600) }}>
                <thead className="sticky top-0 z-10">
                  <tr>
                    <th style={{ width: 14 }} />
                    {visibles.map((c) => (
                      <th key={c.k} style={{ width: c.w }} className="!text-[15px]">
                        {c.l}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lineas.map((l, i) => (
                    <tr
                      key={l.id ?? `n${l.articulo_codigo}`}
                      className={i === sel && editIdx !== i ? 'gw-selected' : ''}
                      onClick={() => setSel(i)}
                      onDoubleClick={() => editing && setEditIdx(i)}
                    >
                      <td className="!px-0 text-center text-[10px]">{i === sel ? '▸' : ''}</td>
                      {visibles.map((c) => (
                        <td key={c.k} className={`truncate !text-[15px] ${c.t === 'b' ? 'text-center' : c.t === 'n' ? 'text-right' : ''}`}>
                          {celda(l, i, c)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center gap-3 pr-[64px]">
              <GridMiniBar
                nuevo={editing}
                modificar={editing && lineas.length > 0}
                borrar={editing && lineas.length > 0}
                buscar={lineas.length > 0}
                onNuevo={() => setDialogo('nueva')}
                onModificar={() => setEditIdx(sel)}
                onBorrar={() => {
                  setLineas((ls) => ls.filter((_, j) => j !== sel))
                  setSel((s) => Math.max(0, s - 1))
                  setEditIdx(null)
                }}
                onBuscar={() => setDialogo('buscarLinea')}
              >
                <button
                  type="button"
                  className="gw-btn !h-[30px] !w-[185px] !gap-1 !text-[18px]"
                  disabled={editing || aplicando || f.sinRegistros}
                  title="Actualizar las fichas de los artículos con los campos marcados"
                  onClick={actualizar}
                >
                  {draft.actualizado ? <Check size={16} strokeWidth={3} className="text-[#127a12]" /> : <X size={16} strokeWidth={3} className="text-[#c42b1c]" />}
                  {aplicando ? 'Actualizando…' : 'Actualizado'}
                </button>
                <span className={`truncate text-[17px] ${labInfo.startsWith('Error') ? 'text-[#c42b1c]' : 'text-[#1a4fd0]'}`}>{labInfo}</span>
              </GridMiniBar>
            </div>
          </>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            <span className="text-[17px]">Parametrización de los Campos de los Artículos</span>
            <div className="flex min-h-0 flex-1 gap-0">
              <div className="w-[340px] overflow-y-auto border border-[var(--gw-border)] bg-white" role="listbox">
                {CAMPOS.map((c, i) => (
                  <div
                    key={c.k}
                    role="option"
                    aria-selected={i === campoSel}
                    onClick={() => setCampoSel(i)}
                    className={`flex cursor-default justify-between px-1 text-[17px] leading-[22px] ${i === campoSel ? 'bg-[var(--gw-select)] text-white' : ''}`}
                  >
                    <span>{c.l}</span>
                    <span className="text-[12px]">
                      {param[c.k]?.v || c.k === 'codigo_interno' ? 'V' : ''}
                      {param[c.k]?.a ? ' A' : ''}
                    </span>
                  </div>
                ))}
              </div>
              <div className="flex w-[130px] flex-col gap-2 border-y border-r border-[var(--gw-border-light)] p-2">
                <GwCheck
                  label={<span className={lbl}>Visible</span>}
                  disabled={ro || CAMPOS[campoSel].k === 'codigo_interno'}
                  checked={CAMPOS[campoSel].k === 'codigo_interno' || !!param[CAMPOS[campoSel].k]?.v}
                  onChange={(v) => setParam(CAMPOS[campoSel].k, { v })}
                />
                <GwCheck
                  label={<span className={lbl}>Actualizar</span>}
                  disabled={ro || CAMPOS[campoSel].k === 'codigo_interno'}
                  checked={!!param[CAMPOS[campoSel].k]?.a}
                  onChange={(a) => setParam(CAMPOS[campoSel].k, { a, ...(a ? { v: true } : {}) })}
                />
              </div>
              <div className="flex w-[450px] flex-col gap-1.5 border-y border-r border-[var(--gw-border-light)] p-2">
                {(
                  [
                    ['Activar todos los campos como visibles', { v: true }],
                    ['Desactivar todos los campos como visibles', { v: false }],
                    ['Activar todos los campos para Actualizar', { a: true, v: true }],
                    ['Desactivar todos los campos para Actualizar', { a: false }],
                  ] as const
                ).map(([t, p]) => (
                  <button key={t} type="button" className="gw-btn !h-[36px] !justify-start !text-[17px]" disabled={ro} onClick={() => todos(p)}>
                    {t}
                  </button>
                ))}
                <button type="button" className="gw-btn !h-[36px] !justify-start !text-[17px]" disabled={ro} onClick={() => patch({ campos: VACIO.campos })}>
                  Eliminar parametrización de los campos
                </button>
                <span className={`${L} mt-1 text-[#444]`}>Marca «Actualizar» solo en los campos que quieras cambiar en las fichas; los demás se ven pero no se tocan.</span>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="pr-[64px]">
        <GwRecordBar
          grande
          mode={mode}
          canNavigate={f.canNavigate}
          saving={f.saving || aplicando}
          onFirst={() => f.irA('primero')}
          onPrev={() => f.irA('anterior')}
          onNext={() => f.irA('siguiente')}
          onLast={() => f.irA('ultimo')}
          onSort={() => f.setOrden((o) => (o === 'codigo' ? 'nombre' : 'codigo'))}
          onSearch={() => setDialogo('buscarFicha')}
          onPrint={() => window.print()}
          onNew={() => f.navigate('/almacen/modificacion-bloque/nuevo')}
          onEdit={() => !f.sinRegistros && f.setMode('edicion')}
          onDelete={() =>
            f.eliminar(
              `la modificación ${f.registro.codigo}`,
              async () => null,
              async () => {
                const { error } = await supabase.from('modificacion_articulo_linea').delete().eq('modificacion_codigo', f.registro.codigo)
                return error ? error.message : null
              },
            )
          }
          onSave={() => f.guardar(() => (draft.codigo.trim() ? null : 'Falta el código.'), guardarLineas)}
          onCancel={() => {
            setLineas(guardadas)
            setEditIdx(null)
            f.cancelar()
          }}
          onExit={() => f.navigate('/')}
        />
      </div>

      {dialogo === 'buscarFicha' && (
        <GwLookupDialog<Record<string, unknown>>
          title="Modificaciones de artículos"
          table="modificacion_articulo"
          columns={[
            { key: 'codigo', label: 'Código', width: 90 },
            { key: 'fecha', label: 'Fecha', width: 100 },
            { key: 'concepto', label: 'Concepto' },
          ]}
          searchColumns={['codigo', 'concepto']}
          orderBy="codigo"
          keyColumn="codigo"
          onPick={(r) => (setDialogo(null), f.goTo(String(r.codigo)))}
          onClose={() => setDialogo(null)}
        />
      )}
      {dialogo === 'buscarLinea' && (
        <BuscarLinea
          lineas={lineas}
          onPick={(i) => {
            setSel(i)
            setDialogo(null)
          }}
          onClose={() => setDialogo(null)}
        />
      )}
      {dialogo === 'nueva' && (
        <NuevasLineas
          onAnadir={async (cods) => {
            await anadirArticulos(cods)
            setDialogo(null)
          }}
          onClose={() => setDialogo(null)}
        />
      )}
      {f.dialogoLista}
    </div>
  )
}

function BuscarLinea({ lineas, onPick, onClose }: { lineas: Linea[]; onPick: (i: number) => void; onClose: () => void }) {
  const [t, setT] = useState('')
  const i = t.trim()
    ? lineas.findIndex(
        (l) =>
          l.articulo_codigo.toUpperCase().startsWith(t.trim().toUpperCase()) ||
          String(l.datos.descripcion ?? '')
            .toUpperCase()
            .includes(t.trim().toUpperCase()),
      )
    : -1
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/20 pt-32" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <GwWindow title="Buscar artículo en la modificación" onClose={onClose} className="w-[440px]">
        <div className="flex flex-col gap-1.5">
          <GwInput
            autoFocus
            placeholder="Código o parte de la descripción"
            value={t}
            onChange={(e) => setT(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && i >= 0 && onPick(i)}
          />
          <span className="text-[13px]">{i >= 0 ? `${lineas[i].articulo_codigo} · ${String(lineas[i].datos.descripcion ?? '')}` : t ? 'No está en la modificación.' : ''}</span>
          <div className="flex justify-end gap-1.5">
            <button type="button" className="gw-btn" disabled={i < 0} onClick={() => onPick(i)}>
              Aceptar
            </button>
            <button type="button" className="gw-btn" onClick={onClose}>
              Cancelar
            </button>
          </div>
        </div>
      </GwWindow>
    </div>,
    document.body,
  )
}

/** «Nueva línea»: un artículo, o varios a la vez por familia, marca, proveedor, rango o texto (vista previa del nº). */
function NuevasLineas({ onAnadir, onClose }: { onAnadir: (codigos: string[]) => Promise<void>; onClose: () => void }) {
  const [uno, setUno] = useState('')
  const [fil, setFil] = useState({ familia: '', marca: '', proveedor: '', desde: '', hasta: '', texto: '', estado: 'activos' })
  const [prev, setPrev] = useState<{ n: number; codigos: string[] } | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const hayFiltro = Object.entries(fil).some(([k, v]) => k !== 'estado' && v.trim())

  async function vistaPrevia() {
    setMsg(null)
    const { data, error } = await supabase.rpc('fn_articulos_bloque', { p_filtro: fil, p_cambios: {}, p_aplicar: false, p_limite: 1000 })
    if (error) return setMsg(error.message)
    const filas = (data ?? []) as { codigo_interno: string; total: number }[]
    setPrev({ n: Number(filas[0]?.total ?? 0), codigos: filas.map((r) => r.codigo_interno) })
  }

  const campo = (k: keyof typeof fil, l: string, lookup?: string) => (
    <label className="flex flex-col">
      <span className={L}>{l}</span>
      {lookup ? (
        <CodigoBuscar value={fil[k]} lookup={lookup} onChange={(v) => (setFil((x) => ({ ...x, [k]: v })), setPrev(null))} />
      ) : (
        <GwInput className={IN} value={fil[k]} onChange={(e) => (setFil((x) => ({ ...x, [k]: e.target.value })), setPrev(null))} />
      )}
    </label>
  )

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/20 pt-16" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <GwWindow title="Añadir artículos a la modificación" onClose={onClose} className="w-[720px]">
        <div className="flex flex-col gap-2">
          <fieldset className="gw-group">
            <legend className={L}>Un artículo</legend>
            <div className="flex items-end gap-2">
              <span className="w-[260px]">
                <CodigoBuscar value={uno} lookup="articulo" onChange={setUno} />
              </span>
              <button
                type="button"
                className="gw-btn !h-[26px] !text-[15px]"
                disabled={!uno.trim() || ocupado}
                onClick={async () => {
                  setOcupado(true)
                  const { data } = await supabase.from('articulo').select('codigo_interno').eq('codigo_interno', uno.trim()).maybeSingle()
                  if (!data) {
                    setMsg(`No existe el artículo ${uno}.`)
                    setOcupado(false)
                    return
                  }
                  await onAnadir([uno.trim()])
                }}
              >
                Añadir
              </button>
            </div>
          </fieldset>
          <fieldset className="gw-group">
            <legend className={L}>Varios a la vez (filtro)</legend>
            <div className="grid grid-cols-3 gap-2">
              {campo('familia', 'Familia', 'familia')}
              {campo('marca', 'Marca', 'marca')}
              {campo('proveedor', 'Proveedor', 'proveedor')}
              {campo('desde', 'Artículo desde', 'articulo')}
              {campo('hasta', 'Artículo hasta', 'articulo')}
              {campo('texto', 'Código o descripción contiene')}
              <label className="flex flex-col">
                <span className={L}>Artículos</span>
                <GwSelect className={IN} value={fil.estado} onChange={(e) => (setFil((x) => ({ ...x, estado: e.target.value })), setPrev(null))}>
                  <option value="activos">Solo activos</option>
                  <option value="bajas">Solo anulados</option>
                  <option value="todos">Todos</option>
                </GwSelect>
              </label>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <button type="button" className="gw-btn !h-[28px] !text-[15px]" disabled={!hayFiltro} onClick={vistaPrevia}>
                Vista previa
              </button>
              {prev && (
                <span className="text-[14px]">
                  Cumplen el filtro <b>{prev.n.toLocaleString('es-ES')}</b> artículo(s){prev.n > 1000 ? ' (se añaden los 1.000 primeros)' : ''}.
                </span>
              )}
              <button
                type="button"
                className="gw-btn ml-auto !h-[28px] !text-[15px]"
                disabled={!prev?.codigos.length || ocupado}
                onClick={async () => {
                  if (!prev) return
                  if (!confirm(`¿Añadir ${prev.codigos.length} artículo(s) a la modificación?`)) return
                  setOcupado(true)
                  await onAnadir(prev.codigos)
                }}
              >
                Añadir {prev?.codigos.length ?? ''} artículo(s)
              </button>
            </div>
          </fieldset>
          {msg && <span className="text-[13px] text-[#c42b1c]">{msg}</span>}
        </div>
      </GwWindow>
    </div>,
    document.body,
  )
}
