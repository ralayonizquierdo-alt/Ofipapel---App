import { Fragment, useEffect, useState } from 'react'
import { Folder, Mail, Printer, Send } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { GwCheck, GwField, GwGroup, GwInput, GwLookupButton, GwNumber, GwRadio, GwSelect, GwTabs, GwTextArea, formatGw, type GwTabDef } from '../../components/gw'
import { GwRecordBar } from '../../components/gw/GwRecordBar'
import { GwLookupDialog } from '../../components/gw/GwLookupDialog'
import { FilasVacias, GridMiniBar } from '../../components/gw/GwGridParts'
import { useFichaMaestro } from './useFichaMaestro'
import { BotonMarca, NOMBRES_TARIFA, PieFicha, horaActual, hoyISO, redondear, siguienteCodigo } from './modPreciosComun'
import { aplicarModificacionPrecios, type CabeceraMod, type NivelMod } from './modPreciosAplicar'

// Almacén → Modificación de Precios: lotes de cambios de PVP que, al marcarse «Actualizado»,
// se vuelcan en artículos, ofertas por cantidades y precios pactados de clientes.

interface Modificacion extends CabeceraMod {
  fecha: string | null
  hora: string | null
  observaciones: string | null
  actualizado: boolean
  buscar_por_codigo_compra: boolean
  ver_ultimo_coste: boolean
  notificar: boolean
  notificar_coste_puro: boolean
  notificar_coste_neto: boolean
  notificar_coste_bruto: boolean
  notificar_coste_liquido: boolean
  notificar_liquido_medio: boolean
  notificar_ultimo_coste: boolean
  notificar_fecha_mod_pvp: boolean
  margen_tolerancia: number
  margen_es_porcentaje: boolean
  enviar_email: boolean
  email: string | null
  enviar_informe_pdf: boolean
  imprimir_informe: boolean
  salida_informe: number
  nombre_informe: string | null
}

const VACIA: Modificacion = {
  codigo: '',
  concepto: '',
  fecha: null,
  hora: null,
  observaciones: null,
  actualizado: false,
  son_precios_oferta: false,
  fecha_desde: null,
  fecha_hasta: null,
  actualizar_articulos: true,
  actualizar_ofertas_cantidad: false,
  cant_min_menor2_en_principales: false,
  tipo_actualizacion_articulos: 0,
  actualizar_clientes: false,
  tipo_actualizacion_clientes: 0,
  clientes_segun_tarifa_cliente: true,
  clientes_tarifa_nivel: 0,
  es_pacto_tarifas: false,
  pacto_tienda_codigo: null,
  pacto_pedido_numero: null,
  buscar_por_codigo_compra: false,
  ver_ultimo_coste: true,
  notificar: false,
  notificar_coste_puro: false,
  notificar_coste_neto: false,
  notificar_coste_bruto: false,
  notificar_coste_liquido: false,
  notificar_liquido_medio: false,
  notificar_ultimo_coste: false,
  notificar_fecha_mod_pvp: false,
  margen_tolerancia: 0,
  margen_es_porcentaje: true,
  enviar_email: false,
  email: null,
  enviar_informe_pdf: false,
  imprimir_informe: false,
  salida_informe: 0,
  nombre_informe: null,
}

interface Linea {
  id?: number
  articulo_codigo: string
  descripcion: string
  codigo_compra: string | null
  coste_puro: number | null
  coste_neto: number | null
  coste_bruto: number | null
  precio_medio_compra: number | null
  precio_liquido: number | null
  ultimo_coste: number | null
  cantidad: number
  descuento_maximo_pct: number | null
  pvp_fijo: boolean
  niveles: NivelMod[]
}

type ArticuloFila = {
  codigo_interno: string
  descripcion: string
  codigo_compra_habitual: string | null
  coste_puro: number | null
  coste_neto: number | null
  coste_bruto: number | null
  precio_medio_compra: number | null
  precio_liquidado: number | null
  coste_usado_calculo_pvp: number | null
  descuento_maximo_cliente_pct: number | null
  pvp_fijo: boolean | null
  pvp: number | null
  precios: { nivel_tarifa: number; pvp: number; incremento_pct: number | null; modo_calculo: string | null }[]
}

const TABS: GwTabDef[][] = [
  [
    { key: 'articulos', label: 'Artículos' },
    { key: 'act_articulos', label: 'Actualización en Artículos' },
    { key: 'act_clientes', label: 'Actualización en Clientes' },
    { key: 'opciones', label: 'Opciones' },
  ],
]

const num = (v: unknown) => (v == null ? null : Number(v))

/** PVP de un nivel a partir de su %: «D» es descuento sobre la General; si no, margen sobre el último coste. */
function pvpDesdePct(l: Linea, i: number, pct: number | null) {
  if (pct == null) return l.niveles[i].pvp
  const n = l.niveles[i]
  if (i > 0 && n.modo === 'D') return redondear((l.niveles[0]?.pvp ?? 0) * (1 - pct / 100), 2)
  return redondear((l.ultimo_coste ?? 0) * (1 + pct / 100), 2)
}
function pctDesdePvp(l: Linea, i: number, pvp: number) {
  const n = l.niveles[i]
  if (i > 0 && n.modo === 'D') return l.niveles[0]?.pvp ? redondear((1 - pvp / l.niveles[0].pvp) * 100, 2) : null
  return l.ultimo_coste ? redondear((pvp / l.ultimo_coste - 1) * 100, 2) : null
}

function lineaDeArticulo(a: ArticuloFila): Linea {
  const niveles = NOMBRES_TARIFA.map<NivelMod>((_, i) => {
    const p = a.precios.find((x) => x.nivel_tarifa === i)
    return { pvp: p ? Number(p.pvp) : i === 0 ? Number(a.pvp ?? 0) : 0, pct: p ? num(p.incremento_pct) : null, modo: p?.modo_calculo ?? null }
  })
  return {
    articulo_codigo: a.codigo_interno,
    descripcion: a.descripcion,
    codigo_compra: a.codigo_compra_habitual,
    coste_puro: num(a.coste_puro),
    coste_neto: num(a.coste_neto),
    coste_bruto: num(a.coste_bruto),
    precio_medio_compra: num(a.precio_medio_compra),
    precio_liquido: num(a.precio_liquidado),
    ultimo_coste: num(a.coste_usado_calculo_pvp) ?? num(a.coste_neto),
    cantidad: 0,
    descuento_maximo_pct: num(a.descuento_maximo_cliente_pct),
    pvp_fijo: !!a.pvp_fijo,
    niveles,
  }
}

export function ModificacionPreciosFichaPage() {
  const f = useFichaMaestro<Modificacion>({ tabla: 'modificacion_precio', base: '/modificacion-precios', vacio: VACIA, campoNombre: 'concepto' })
  const { draft, patch, editing, mode } = f
  const [tab, setTab] = useState('articulos')
  const [lineas, setLineas] = useState<Linea[]>([])
  const [guardadas, setGuardadas] = useState<Linea[]>([])
  const [sel, setSel] = useState(0)
  const [editIdx, setEditIdx] = useState<number | null>(null)
  const [buscarFicha, setBuscarFicha] = useState(false)
  const [buscarArticulo, setBuscarArticulo] = useState<'nueva' | 'localizar' | null>(null)
  const [buscarPedido, setBuscarPedido] = useState(false)
  const [tiendas, setTiendas] = useState<string[]>([])
  const [aplicando, setAplicando] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)

  useEffect(() => {
    supabase
      .from('tienda_terminal')
      .select('codigo')
      .order('codigo')
      .then(({ data }) => setTiendas(((data ?? []) as { codigo: string }[]).map((t) => t.codigo)))
  }, [])

  useEffect(() => {
    setEditIdx(null)
    setSel(0)
    setAviso(null)
    if (mode === 'alta') {
      setLineas([])
      setGuardadas([])
      return
    }
    if (!f.registro.codigo) return
    let cancel = false
    supabase
      .from('modificacion_precio_linea')
      .select('*, niveles:modificacion_precio_linea_nivel(nivel_tarifa, pvp, incremento_pct, modo_calculo)')
      .eq('modificacion_codigo', f.registro.codigo)
      .order('id')
      .then(({ data }) => {
        if (cancel) return
        const ls = ((data ?? []) as (Record<string, unknown> & { niveles: { nivel_tarifa: number; pvp: number; incremento_pct: number | null; modo_calculo: string | null }[] })[]).map<Linea>((r) => ({
          id: r.id as number,
          articulo_codigo: r.articulo_codigo as string,
          descripcion: (r.descripcion as string) ?? '',
          codigo_compra: r.codigo_compra as string | null,
          coste_puro: num(r.coste_puro),
          coste_neto: num(r.coste_neto),
          coste_bruto: num(r.coste_bruto),
          precio_medio_compra: num(r.precio_medio_compra),
          precio_liquido: num(r.precio_liquido),
          ultimo_coste: num(r.ultimo_coste),
          cantidad: Number(r.cantidad ?? 0),
          descuento_maximo_pct: num(r.descuento_maximo_pct),
          pvp_fijo: !!r.pvp_fijo,
          niveles: NOMBRES_TARIFA.map((_, i) => {
            const n = r.niveles.find((x) => x.nivel_tarifa === i)
            return { pvp: n ? Number(n.pvp) : 0, pct: n ? num(n.incremento_pct) : null, modo: n?.modo_calculo ?? null }
          }),
        }))
        setLineas(ls)
        setGuardadas(ls)
      })
    return () => {
      cancel = true
    }
  }, [f.registro.codigo, mode])

  useEffect(() => {
    if (mode === 'alta' && f.listaCargada && !draft.codigo)
      patch({ codigo: siguienteCodigo(f.lista.map((l) => l.codigo), 10), fecha: hoyISO(), hora: horaActual() })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, f.listaCargada, draft.codigo])

  const ro = !editing
  const setLinea = (i: number, fn: (l: Linea) => Linea) => setLineas((ls) => ls.map((l, j) => (j === i ? fn(l) : l)))
  const setNivel = (i: number, n: number, p: Partial<NivelMod>) =>
    setLinea(i, (l) => ({ ...l, niveles: l.niveles.map((x, k) => (k === n ? { ...x, ...p } : x)) }))

  async function anadirArticulo(codigo: string) {
    const { data } = await supabase
      .from('articulo')
      .select(
        'codigo_interno, descripcion, codigo_compra_habitual, coste_puro, coste_neto, coste_bruto, precio_medio_compra, precio_liquidado, coste_usado_calculo_pvp, descuento_maximo_cliente_pct, pvp_fijo, pvp, precios:articulo_precio_nivel(nivel_tarifa, pvp, incremento_pct, modo_calculo)',
      )
      .eq('codigo_interno', codigo)
      .maybeSingle()
    if (!data) return
    setLineas((ls) => [...ls, lineaDeArticulo(data as unknown as ArticuloFila)])
    setSel(lineas.length)
    setEditIdx(lineas.length)
  }

  async function guardarLineas(cod: string): Promise<string | null> {
    const quitadas = guardadas.filter((g) => g.id && !lineas.some((l) => l.id === g.id)).map((g) => g.id as number)
    if (quitadas.length) {
      await supabase.from('modificacion_precio_linea_nivel').delete().in('linea_id', quitadas)
      const { error } = await supabase.from('modificacion_precio_linea').delete().in('id', quitadas)
      if (error) return `Lote guardado, pero no se pudieron quitar líneas: ${error.message}`
    }
    const nuevas: Linea[] = []
    for (const l of lineas) {
      const fila = {
        modificacion_codigo: cod,
        articulo_codigo: l.articulo_codigo,
        descripcion: l.descripcion,
        codigo_compra: l.codigo_compra,
        coste_puro: l.coste_puro,
        coste_neto: l.coste_neto,
        coste_bruto: l.coste_bruto,
        precio_medio_compra: l.precio_medio_compra,
        precio_liquido: l.precio_liquido,
        ultimo_coste: l.ultimo_coste,
        cantidad: l.cantidad,
        descuento_maximo_pct: l.descuento_maximo_pct,
        pvp_fijo: l.pvp_fijo,
      }
      let id = l.id
      if (id) {
        const { error } = await supabase.from('modificacion_precio_linea').update(fila).eq('id', id)
        if (error) return `Error en la línea ${l.articulo_codigo}: ${error.message}`
      } else {
        const { data, error } = await supabase.from('modificacion_precio_linea').insert(fila).select('id').single()
        if (error) return `Error en la línea ${l.articulo_codigo}: ${error.message}`
        id = (data as { id: number }).id
      }
      const { error: errN } = await supabase
        .from('modificacion_precio_linea_nivel')
        .upsert(l.niveles.map((n, k) => ({ linea_id: id, nivel_tarifa: k, pvp: n.pvp ?? 0, incremento_pct: n.pct, modo_calculo: n.modo })), { onConflict: 'linea_id,nivel_tarifa' })
      if (errN) return `Error en los precios de ${l.articulo_codigo}: ${errN.message}`
      nuevas.push({ ...l, id })
    }
    setLineas(nuevas)
    setGuardadas(nuevas)
    setEditIdx(null)
    return null
  }

  async function aplicar() {
    if (editing || !f.registro.codigo || !guardadas.length) return
    const yaAplicado = f.registro.actualizado
    const destinos = [
      draft.actualizar_articulos && (draft.son_precios_oferta && draft.actualizar_ofertas_cantidad ? 'artículos y ofertas por cantidades' : 'artículos'),
      draft.actualizar_clientes && 'precios de clientes',
    ].filter(Boolean)
    if (!destinos.length) {
      setAviso('No hay nada marcado para actualizar (pestañas «Actualización en Artículos / Clientes»).')
      return
    }
    if (
      !confirm(
        `${yaAplicado ? 'Este lote YA se aplicó. ¿Volver a aplicarlo' : '¿Aplicar'} los precios de ${guardadas.length} artículos en ${destinos.join(' y ')}?\nSe sobrescribirán los PVP actuales.`,
      )
    )
      return
    setAplicando(true)
    try {
      const resumen = await aplicarModificacionPrecios(f.registro, guardadas)
      setAviso(resumen)
      f.goTo(f.registro.codigo, true)
    } catch (e) {
      setAviso(`Error al aplicar: ${(e as Error).message}`)
    } finally {
      setAplicando(false)
    }
  }

  const lineaSel = lineas[sel]
  const verOferta = draft.son_precios_oferta
  const nCols = 5 + (verOferta ? 1 : 0) + NOMBRES_TARIFA.length * 2

  if (f.loading) return <div className="p-4 text-[13px]">Cargando…</div>

  return (
    <div className="flex flex-col gap-1">
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,500px)] gap-x-2">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="grid grid-cols-[120px_100px_56px_minmax(0,1fr)] gap-x-1.5">
            <GwField label="Codigo">
              <GwInput value={draft.codigo} disabled={mode !== 'alta'} maxLength={10} title="CODIGO" onChange={(e) => patch({ codigo: e.target.value })} />
            </GwField>
            <GwField label="Fecha">
              <GwInput type="date" value={draft.fecha ?? ''} disabled={ro} title="FECHA" onChange={(e) => patch({ fecha: e.target.value || null })} />
            </GwField>
            <GwField label="Hora">
              <GwInput value={draft.hora ?? ''} disabled={ro} maxLength={5} title="HORA" onChange={(e) => patch({ hora: e.target.value || null })} />
            </GwField>
            <GwField label="Concepto">
              <GwInput value={draft.concepto} disabled={ro} maxLength={40} title="CONCEPTO" onChange={(e) => patch({ concepto: e.target.value })} />
            </GwField>
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_250px] items-end gap-x-2">
            <BotonMarca checked={draft.son_precios_oferta} disabled={ro} title="Precios de oferta entre fechas y por cantidad" onChange={(v) => patch({ son_precios_oferta: v })}>
              Son precios de oferta entre fechas y varían según la cantidad
            </BotonMarca>
            <GwGroup title="Periodo activo de la Oferta">
              <div className="grid grid-cols-2 gap-x-1.5">
                <GwField label="Fecha Inicio">
                  <GwInput type="date" value={draft.fecha_desde ?? ''} disabled={ro || !verOferta} onChange={(e) => patch({ fecha_desde: e.target.value || null })} />
                </GwField>
                <GwField label="Fecha Fin">
                  <GwInput type="date" value={draft.fecha_hasta ?? ''} disabled={ro || !verOferta} onChange={(e) => patch({ fecha_hasta: e.target.value || null })} />
                </GwField>
              </div>
            </GwGroup>
          </div>
        </div>
        <GwField label="Observaciones">
          <GwTextArea rows={5} value={draft.observaciones ?? ''} disabled={ro} onChange={(e) => patch({ observaciones: e.target.value || null })} />
        </GwField>
      </div>
      {f.error && <div className="text-[13px] text-[#c42b1c]">{f.error}</div>}
      {aviso && <div className={`text-[13px] ${aviso.startsWith('Error') ? 'text-[#c42b1c]' : 'text-[#127a12]'}`}>{aviso}</div>}

      <GwTabs rows={TABS} active={tab} onChange={setTab}>
        {f.sinRegistros ? (
          <div className="min-h-[250px] p-3 text-[13px]">No hay ninguna modificación de precios. Pulsa Nuevo para crear el primer lote.</div>
        ) : tab === 'articulos' ? (
          <div className="flex min-h-[250px] flex-col gap-1">
            <div className="h-[230px] overflow-auto border border-[var(--gw-border)] bg-white">
              <table className="gw-grid" style={{ minWidth: 560 + (verOferta ? 60 : 0) + NOMBRES_TARIFA.length * 150 }}>
                <thead className="sticky top-0 z-10">
                  <tr>
                    <th style={{ width: 110 }}>Cod. Interno</th>
                    <th style={{ minWidth: 220 }}>Descripción</th>
                    <th style={{ width: 40 }}>Tipo</th>
                    {verOferta && <th style={{ width: 60 }}>Cant.</th>}
                    <th style={{ width: 84 }}>Coste Neto</th>
                    <th style={{ width: 84 }}>Ult. Coste</th>
                    {NOMBRES_TARIFA.map((n, i) => (
                      <Fragment key={i}>
                        <th style={{ width: 64 }}>%Pvp{i || ''}</th>
                        <th style={{ width: 86 }}>{n}</th>
                      </Fragment>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lineas.map((l, i) => {
                    const ed = editing && editIdx === i
                    return (
                      <tr key={l.id ?? `n${i}`} className={!ed && i === sel ? 'gw-selected' : ''} onClick={() => setSel(i)} onDoubleClick={() => editing && setEditIdx(i)}>
                        <td>{l.articulo_codigo}</td>
                        <td className="max-w-0 truncate">{l.descripcion}</td>
                        <td className={ed ? 'cursor-pointer underline' : ''} title={ed ? 'Clic: cambiar Var/Fij' : undefined} onClick={() => ed && setLinea(i, (x) => ({ ...x, pvp_fijo: !x.pvp_fijo }))}>
                          {l.pvp_fijo ? 'Fij' : 'Var'}
                        </td>
                        {verOferta && (
                          <td className="text-right">
                            {ed ? <GwNumber value={l.cantidad} decimals={2} emptyAsZero onChange={(v) => setLinea(i, (x) => ({ ...x, cantidad: v ?? 0 }))} /> : formatGw(l.cantidad, 2)}
                          </td>
                        )}
                        <td className="text-right">{formatGw(l.coste_neto ?? 0, 3)}</td>
                        <td className="text-right">
                          {ed ? (
                            <GwNumber
                              value={l.ultimo_coste}
                              decimals={3}
                              onChange={(v) => setLinea(i, (x) => ({ ...x, ultimo_coste: v, niveles: x.niveles.map((n, k) => ({ ...n, pct: pctDesdePvp({ ...x, ultimo_coste: v }, k, n.pvp) })) }))}
                            />
                          ) : (
                            formatGw(l.ultimo_coste ?? 0, 3)
                          )}
                        </td>
                        {l.niveles.map((n, k) => (
                          <Fragment key={k}>
                            <td className="text-right">
                              {ed ? <GwNumber value={n.pct} decimals={2} onChange={(v) => setNivel(i, k, { pct: v, pvp: pvpDesdePct(l, k, v) })} /> : formatGw(n.pct ?? 0, 2)}
                            </td>
                            <td className="text-right">
                              {ed ? <GwNumber value={n.pvp} decimals={3} emptyAsZero onChange={(v) => setNivel(i, k, { pvp: v ?? 0, pct: pctDesdePvp(l, k, v ?? 0) })} /> : formatGw(n.pvp, 3)}
                            </td>
                          </Fragment>
                        ))}
                      </tr>
                    )
                  })}
                  <FilasVacias cols={nCols} ocupadas={lineas.length} total={10} />
                </tbody>
              </table>
            </div>
            <GridMiniBar
              nuevo={editing}
              modificar={editing && !!lineaSel}
              borrar={editing && !!lineaSel}
              buscar={lineas.length > 0}
              onNuevo={() => setBuscarArticulo('nueva')}
              onModificar={() => setEditIdx(sel)}
              onBorrar={() => {
                if (!lineaSel || !confirm(`¿Quitar ${lineaSel.articulo_codigo} del lote?`)) return
                setLineas((ls) => ls.filter((_, j) => j !== sel))
                setEditIdx(null)
                setSel((s) => Math.max(0, s - 1))
              }}
              onBuscar={() => setBuscarArticulo('localizar')}
            >
              <BotonMarca
                className="w-[130px]"
                checked={draft.actualizado}
                disabled={editing || aplicando || !guardadas.length}
                title="Aplica los precios del lote (pide confirmación)"
                onChange={aplicar}
              >
                {aplicando ? 'Aplicando…' : 'Actualizado'}
              </BotonMarca>
              <span className="gw-label ml-auto text-[15px] text-[#1a4fd0]">Prec. Líquido: {formatGw(lineaSel?.precio_liquido ?? 0, 3)}</span>
              <span className="gw-label text-[15px] text-[#1a4fd0]">Nº Lineas: {lineas.length}</span>
            </GridMiniBar>
          </div>
        ) : tab === 'act_articulos' ? (
          <div className="flex min-h-[250px] flex-col gap-2 p-1">
            <GwCheck checked={draft.actualizar_articulos} disabled={ro} label="Actualizar precios en Artículos" onChange={(v) => patch({ actualizar_articulos: v })} />
            <GwGroup
              className="w-[640px]"
              title={
                <GwCheck
                  checked={draft.actualizar_ofertas_cantidad}
                  disabled={ro || !draft.actualizar_articulos}
                  label="Actualización en las Ofertas por Cantidades"
                  onChange={(v) => patch({ actualizar_ofertas_cantidad: v })}
                />
              }
            >
              <div className="flex flex-col gap-1.5 p-1">
                <GwCheck
                  checked={draft.cant_min_menor2_en_principales}
                  disabled={ro || !draft.actualizar_ofertas_cantidad}
                  label="Si la Cant. Min. de la oferta es menor de 2, actualizar en tarifas principales"
                  onChange={(v) => patch({ cant_min_menor2_en_principales: v })}
                />
                {[
                  'Actualizar sólo las tarifas que coincidan en la cantidad Mínima de la oferta',
                  'Las que coincidan en la cantidad Mínima de la oferta y las nuevas',
                  'Eliminar las tarifas viejas y añadir las nuevas',
                  'Añadir todas las tarifas como nuevas, sin tocar las viejas',
                ].map((t, i) => (
                  <GwRadio
                    key={i}
                    name="tipo_act_art"
                    checked={draft.tipo_actualizacion_articulos === i}
                    disabled={ro || !draft.actualizar_ofertas_cantidad}
                    label={t}
                    onChange={() => patch({ tipo_actualizacion_articulos: i })}
                  />
                ))}
              </div>
            </GwGroup>
          </div>
        ) : tab === 'act_clientes' ? (
          <div className="flex min-h-[250px] flex-col gap-2 p-1">
            <GwGroup
              className="w-[640px]"
              title={<GwCheck checked={draft.actualizar_clientes} disabled={ro} label="Actualizar precios en clientes" onChange={(v) => patch({ actualizar_clientes: v })} />}
            >
              <div className="grid grid-cols-[300px_minmax(0,1fr)] gap-x-4 p-1">
                <div className="flex flex-col gap-1.5">
                  {['Sólo los artículos que coincidan', 'Los que coincidan y los nuevos', 'Eliminar los viejos y añadir los nuevos'].map((t, i) => (
                    <GwRadio
                      key={i}
                      name="tipo_act_cli"
                      checked={draft.tipo_actualizacion_clientes === i}
                      disabled={ro || !draft.actualizar_clientes}
                      label={t}
                      onChange={() => patch({ tipo_actualizacion_clientes: i })}
                    />
                  ))}
                </div>
                <div className="flex flex-col gap-1.5">
                  <GwRadio
                    name="tarifa_cli"
                    checked={draft.clientes_segun_tarifa_cliente}
                    disabled={ro || !draft.actualizar_clientes}
                    label="Act. según la tarifa del cliente"
                    onChange={() => patch({ clientes_segun_tarifa_cliente: true })}
                  />
                  <div className="flex items-center gap-2">
                    <GwRadio
                      name="tarifa_cli"
                      checked={!draft.clientes_segun_tarifa_cliente}
                      disabled={ro || !draft.actualizar_clientes}
                      label="Actualizar con la tarifa:"
                      onChange={() => patch({ clientes_segun_tarifa_cliente: false })}
                    />
                    <GwSelect
                      className="w-[150px]"
                      value={draft.clientes_tarifa_nivel ?? 0}
                      disabled={ro || !draft.actualizar_clientes || draft.clientes_segun_tarifa_cliente}
                      onChange={(e) => patch({ clientes_tarifa_nivel: Number(e.target.value) })}
                    >
                      {NOMBRES_TARIFA.map((n, i) => (
                        <option key={i} value={i}>
                          {n}
                        </option>
                      ))}
                    </GwSelect>
                  </div>
                </div>
              </div>
            </GwGroup>
            <GwGroup
              className="w-[640px]"
              title={
                <GwCheck checked={draft.es_pacto_tarifas} disabled={ro || !draft.actualizar_clientes} label="Pacto de Tarifas" onChange={(v) => patch({ es_pacto_tarifas: v })} />
              }
            >
              <div className="flex items-end gap-1.5 p-1">
                <GwField label="Tienda y Nº pedido del pacto">
                  <div className="flex gap-1.5">
                    <GwSelect
                      className="w-[90px]"
                      value={draft.pacto_tienda_codigo ?? ''}
                      disabled={ro || !draft.es_pacto_tarifas}
                      onChange={(e) => patch({ pacto_tienda_codigo: e.target.value || null })}
                    >
                      <option value="" />
                      {tiendas.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </GwSelect>
                    <div className="flex w-[130px]">
                      <GwNumber value={draft.pacto_pedido_numero} decimals={0} disabled={ro || !draft.es_pacto_tarifas} onChange={(v) => patch({ pacto_pedido_numero: v })} />
                      <GwLookupButton disabled={ro || !draft.es_pacto_tarifas} title="Buscar pedido de cliente" onClick={() => setBuscarPedido(true)} />
                    </div>
                  </div>
                </GwField>
              </div>
            </GwGroup>
          </div>
        ) : (
          <div className="flex min-h-[250px] flex-col gap-1.5 p-1">
            <div className="flex gap-2">
              <BotonMarca className="w-[430px]" checked={draft.buscar_por_codigo_compra} disabled={ro} onChange={(v) => patch({ buscar_por_codigo_compra: v })}>
                Hacer la busqueda de los artículos por el código de compra
              </BotonMarca>
              <BotonMarca className="w-[430px]" checked={draft.ver_ultimo_coste} disabled={ro} onChange={(v) => patch({ ver_ultimo_coste: v })}>
                Ver el Precio de Coste usado en el último calculo del PVP
              </BotonMarca>
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-x-3">
              <GwGroup
                title={
                  <GwCheck checked={draft.notificar} disabled={ro} label="Notificar Variaciones de Precios en Artículos" onChange={(v) => patch({ notificar: v })} />
                }
              >
                <div className="flex flex-col gap-1 p-1" title="Solo se guarda la configuración: el aviso por email aún no está activo (confirmar con Luis)">
                  {(
                    [
                      ['notificar_coste_puro', 'Del Coste Puro'],
                      ['notificar_coste_neto', 'Del Coste Neto'],
                      ['notificar_coste_bruto', 'Del Coste Bruto'],
                      ['notificar_coste_liquido', 'Del Coste Líquido'],
                      ['notificar_liquido_medio', 'Del Coste Líquido Médio'],
                      ['notificar_ultimo_coste', 'Del Último Coste Usado en el cálculo del PVP'],
                    ] as const
                  ).map(([k, t]) => (
                    <GwCheck key={k} checked={draft[k]} disabled={ro || !draft.notificar} label={t} onChange={(v) => patch({ [k]: v } as Partial<Modificacion>)} />
                  ))}
                  <div className="flex items-center gap-1.5">
                    <span className="gw-label">Margen de Tolerancia Variación del Coste:</span>
                    <div className="w-[80px]">
                      <GwNumber value={draft.margen_tolerancia} decimals={3} emptyAsZero disabled={ro || !draft.notificar} onChange={(v) => patch({ margen_tolerancia: v ?? 0 })} />
                    </div>
                    <BotonMarca checked={draft.margen_es_porcentaje} disabled={ro || !draft.notificar} title="Margen en %" onChange={(v) => patch({ margen_es_porcentaje: v })}>
                      %
                    </BotonMarca>
                  </div>
                  <GwCheck
                    checked={draft.notificar_fecha_mod_pvp}
                    disabled={ro || !draft.notificar}
                    label="De la Fecha de la Última Modificación de los PVPs en Artículos"
                    onChange={(v) => patch({ notificar_fecha_mod_pvp: v })}
                  />
                </div>
              </GwGroup>
              <div className="flex flex-col gap-1.5" title="Envío e impresión pendientes de activar (confirmar con Luis)">
                <div className="flex items-center gap-1.5">
                  <GwCheck checked={draft.enviar_email} disabled={ro} label="Enviar un Email a:" onChange={(v) => patch({ enviar_email: v })} />
                  <GwInput className="flex-1" value={draft.email ?? ''} disabled={ro || !draft.enviar_email} onChange={(e) => patch({ email: e.target.value || null })} />
                  <button type="button" className="gw-btn w-[30px] px-0" disabled title="Enviar (pendiente)">
                    <Mail size={13} />
                  </button>
                </div>
                <GwCheck checked={draft.enviar_informe_pdf} disabled={ro} label="Enviar Informe en formato Pdf por Email" onChange={(v) => patch({ enviar_informe_pdf: v })} />
                <div className="flex items-center gap-3">
                  <GwCheck checked={draft.imprimir_informe} disabled={ro} label="Imprimir Informe Por" onChange={(v) => patch({ imprimir_informe: v })} />
                  <GwRadio name="salida_inf" checked={draft.salida_informe === 0} disabled={ro || !draft.imprimir_informe} label="Pantalla" onChange={() => patch({ salida_informe: 0 })} />
                  <GwRadio name="salida_inf" checked={draft.salida_informe === 1} disabled={ro || !draft.imprimir_informe} label="Impresora" onChange={() => patch({ salida_informe: 1 })} />
                </div>
                <div className="flex items-center gap-1">
                  <GwInput className="flex-1" value={draft.nombre_informe ?? ''} disabled={ro} placeholder="Informe" onChange={(e) => patch({ nombre_informe: e.target.value || null })} />
                  <button type="button" className="gw-btn w-[30px] px-0" disabled title="Carpeta (pendiente)">
                    <Folder size={13} />
                  </button>
                  <button type="button" className="gw-btn w-[30px] px-0" disabled title="Impresora (pendiente)">
                    <Printer size={13} />
                  </button>
                </div>
                <button type="button" className="gw-btn" disabled title="Pendiente de activar">
                  <Send size={13} /> Enviar Variaciones de todos los registros
                </button>
                <button type="button" className="gw-btn" disabled title="Pendiente de activar">
                  <Printer size={13} /> Imprimir Variaciones de todos los registros
                </button>
                <button type="button" className="gw-btn" disabled title="Pendiente de activar">
                  <Send size={13} /> Enviar o Imprimir las Variaciones de todos los registros
                </button>
              </div>
            </div>
          </div>
        )}
      </GwTabs>

      <GwRecordBar
        mode={mode}
        canNavigate={f.canNavigate}
        saving={f.saving || aplicando}
        onFirst={() => f.goTo(f.ordenada[0]?.codigo)}
        onPrev={() => f.goTo(f.ordenada[f.idx - 1]?.codigo)}
        onNext={() => f.goTo(f.ordenada[f.idx + 1]?.codigo)}
        onLast={() => f.goTo(f.ordenada[f.ordenada.length - 1]?.codigo)}
        onSort={() => f.setOrden((o) => (o === 'codigo' ? 'nombre' : 'codigo'))}
        onSearch={() => setBuscarFicha(true)}
        onPrint={() => window.print()}
        onNew={() => f.navigate('/modificacion-precios/nuevo')}
        onEdit={() => !f.sinRegistros && f.setMode('edicion')}
        onDelete={() =>
          f.eliminar(
            `el lote ${f.registro.codigo} ${f.registro.concepto} y sus ${guardadas.length} líneas`,
            async () => null,
            async () => {
              const ids = guardadas.map((g) => g.id).filter(Boolean) as number[]
              if (ids.length) await supabase.from('modificacion_precio_linea_nivel').delete().in('linea_id', ids)
              const { error } = await supabase.from('modificacion_precio_linea').delete().eq('modificacion_codigo', f.registro.codigo)
              return error ? error.message : null
            },
          )
        }
        onSave={() => f.guardar(() => (!draft.codigo.trim() || !draft.concepto.trim() ? 'El código y el concepto son obligatorios.' : null), guardarLineas)}
        onCancel={() => {
          setLineas(guardadas)
          setEditIdx(null)
          f.cancelar()
        }}
        onExit={() => f.navigate('/')}
      />
      <PieFicha
        texto={`Orden: ${f.orden === 'codigo' ? 'por código' : 'por concepto'}${f.idx >= 0 ? ` · Registro ${f.idx + 1} de ${f.ordenada.length}` : ''}${
          mode === 'alta' ? ' · Alta de modificación de precios' : mode === 'edicion' ? ' · Modificando' : draft.actualizado ? ' · Lote ya aplicado' : ''
        }`}
      />

      {buscarFicha && (
        <GwLookupDialog<{ codigo: string; concepto: string; fecha: string | null; actualizado: boolean }>
          title="Buscar Modificación de Precios"
          table="modificacion_precio"
          columns={[
            { key: 'codigo', label: 'Código', width: 110 },
            { key: 'fecha', label: 'Fecha', width: 100 },
            { key: 'concepto', label: 'Concepto' },
          ]}
          searchColumns={['codigo', 'concepto']}
          orderBy={f.orden === 'codigo' ? 'codigo' : 'concepto'}
          keyColumn="codigo"
          onPick={(r) => {
            setBuscarFicha(false)
            f.goTo(r.codigo)
          }}
          onClose={() => setBuscarFicha(false)}
        />
      )}
      {buscarArticulo && (
        <GwLookupDialog<{ codigo_interno: string; descripcion: string; codigo_compra_habitual: string | null }>
          title={buscarArticulo === 'nueva' ? 'Añadir artículo al lote' : 'Localizar artículo en el lote'}
          table="articulo"
          columns={[
            { key: 'codigo_interno', label: 'Cod. Interno', width: 120 },
            { key: 'descripcion', label: 'Descripción' },
            { key: 'codigo_compra_habitual', label: 'Cód. Compra', width: 110 },
          ]}
          searchColumns={draft.buscar_por_codigo_compra ? ['codigo_compra_habitual', 'codigo_interno'] : ['codigo_interno', 'descripcion', 'codigo_barras_principal']}
          orderBy="codigo_interno"
          keyColumn="codigo_interno"
          onPick={(a) => {
            const modo = buscarArticulo
            setBuscarArticulo(null)
            if (modo === 'localizar') {
              const i = lineas.findIndex((l) => l.articulo_codigo === a.codigo_interno)
              if (i >= 0) setSel(i)
              else alert(`${a.codigo_interno} no está en este lote.`)
              return
            }
            void anadirArticulo(a.codigo_interno)
          }}
          onClose={() => setBuscarArticulo(null)}
        />
      )}
      {buscarPedido && (
        <GwLookupDialog<{ tienda_terminal_codigo: string; numero: number; cliente_codigo: string | null }>
          title="Pedido del pacto de tarifas"
          table="pedido_cliente"
          columns={[
            { key: 'tienda_terminal_codigo', label: 'Tienda', width: 70 },
            { key: 'numero', label: 'Número', width: 100 },
            { key: 'cliente_codigo', label: 'Cliente' },
          ]}
          searchColumns={['cliente_codigo']}
          orderBy="numero"
          keyColumn="numero"
          onPick={(p) => {
            setBuscarPedido(false)
            patch({ pacto_tienda_codigo: p.tienda_terminal_codigo, pacto_pedido_numero: Number(p.numero) })
          }}
          onClose={() => setBuscarPedido(false)}
        />
      )}
    </div>
  )
}
