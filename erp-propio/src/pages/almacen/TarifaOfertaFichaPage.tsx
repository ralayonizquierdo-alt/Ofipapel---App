import { useEffect, useState } from 'react'
import { Calculator } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { GwField, GwGroup, GwInput, GwNumber, GwSelect, GwTabs, GwTextArea, formatGw, type GwTabDef } from '../../components/gw'
import { GwRecordBar } from '../../components/gw/GwRecordBar'
import { GwLookupDialog } from '../../components/gw/GwLookupDialog'
import { FilasVacias, GridMiniBar } from '../../components/gw/GwGridParts'
import { useFichaMaestro } from './useFichaMaestro'
import { BotonMarca, NOMBRES_TARIFA, PieFicha, horaActual, hoyISO, redondear, siguienteCodigo } from './modPreciosComun'

// Almacén → Tarifas de Oferta (ARTTAROF cabecera; líneas en articulo_tarifa_cantidad,
// enlazadas por oferta_codigo, con su precio en articulo_tarifa_cantidad_nivel).

interface Oferta {
  codigo: string
  concepto: string
  descripcion: string | null
  fecha: string | null
  hora: string | null
  fecha_desde: string | null
  hora_desde: string | null
  fecha_hasta: string | null
  hora_hasta: string | null
  buscar_por_codigo_compra: boolean
  observaciones: string | null
  tipo_calculo: number
  reflejar_dto: number
  un_pvp_para_todas: boolean
  tarifa_oferta: number
}

const VACIA: Oferta = {
  codigo: '',
  concepto: '',
  descripcion: null,
  fecha: null,
  hora: null,
  fecha_desde: null,
  hora_desde: null,
  fecha_hasta: null,
  hora_hasta: null,
  buscar_por_codigo_compra: false,
  observaciones: null,
  tipo_calculo: 0,
  reflejar_dto: 0,
  un_pvp_para_todas: true,
  tarifa_oferta: 0,
}

interface Linea {
  id?: number
  articulo_codigo: string
  descripcion: string
  almacen_oferta_codigo: string | null
  stock_minimo_oferta: number | null
  cantidad_desde: number
  coste_neto: number | null
  precio_liquidado: number | null
  /** PVP del artículo en la tarifa usada como oferta: base del %Pvp. */
  pvp_base: number | null
  pct: number | null
  precio: number | null
}

type ArticuloBase = {
  codigo_interno: string
  descripcion: string
  coste_neto: number | null
  precio_liquidado: number | null
  pvp: number | null
}

const TABS: GwTabDef[][] = [
  [
    { key: 'tarifas', label: 'Tarifas' },
    { key: 'opciones', label: 'Opciones Adicionales' },
  ],
]

const num = (v: unknown) => (v == null ? null : Number(v))
const pctDe = (precio: number | null, base: number | null) =>
  precio == null || !base ? null : redondear((precio / base - 1) * 100, 2)
const precioDe = (pct: number | null, base: number | null) => (pct == null || base == null ? null : redondear(base * (1 + pct / 100), 3))

async function pvpsBase(codigos: string[], nivel: number) {
  const mapa = new Map<string, number>()
  if (!codigos.length) return mapa
  const { data } = await supabase.from('articulo_precio_nivel').select('articulo_codigo, pvp').in('articulo_codigo', codigos).eq('nivel_tarifa', nivel)
  for (const r of (data ?? []) as { articulo_codigo: string; pvp: number }[]) mapa.set(r.articulo_codigo, Number(r.pvp))
  return mapa
}

export function TarifaOfertaFichaPage() {
  const f = useFichaMaestro<Oferta>({ tabla: 'oferta_tarifa', base: '/tarifas-oferta', vacio: VACIA, campoNombre: 'concepto' })
  const { draft, patch, editing, mode } = f
  const [tab, setTab] = useState('tarifas')
  const [lineas, setLineas] = useState<Linea[]>([])
  const [guardadas, setGuardadas] = useState<Linea[]>([])
  const [sel, setSel] = useState(0)
  const [editIdx, setEditIdx] = useState<number | null>(null)
  const [buscarFicha, setBuscarFicha] = useState(false)
  const [buscarArticulo, setBuscarArticulo] = useState<'nueva' | 'localizar' | null>(null)

  useEffect(() => {
    setEditIdx(null)
    setSel(0)
    if (mode === 'alta') {
      setLineas([])
      setGuardadas([])
      return
    }
    if (!f.registro.codigo) return
    let cancel = false
    ;(async () => {
      const { data } = await supabase
        .from('articulo_tarifa_cantidad')
        .select(
          'id, articulo_codigo, cantidad_desde, almacen_oferta_codigo, stock_minimo_oferta, articulo:articulo_codigo(descripcion, coste_neto, precio_liquidado, pvp), niveles:articulo_tarifa_cantidad_nivel(nivel_tarifa, pvp, incremento_pct)',
        )
        .eq('oferta_codigo', f.registro.codigo)
        .order('id')
      const filas = (data ?? []) as unknown as {
        id: number
        articulo_codigo: string
        cantidad_desde: number
        almacen_oferta_codigo: string | null
        stock_minimo_oferta: number | null
        articulo: { descripcion: string; coste_neto: number | null; precio_liquidado: number | null; pvp: number | null } | null
        niveles: { nivel_tarifa: number; pvp: number; incremento_pct: number | null }[]
      }[]
      const tarifa = f.registro.tarifa_oferta ?? 0
      const bases = await pvpsBase([...new Set(filas.map((r) => r.articulo_codigo))], tarifa)
      if (cancel) return
      const ls = filas.map<Linea>((r) => {
        const nv = r.niveles.find((n) => n.nivel_tarifa === tarifa) ?? r.niveles[0]
        return {
          id: r.id,
          articulo_codigo: r.articulo_codigo,
          descripcion: r.articulo?.descripcion ?? '',
          almacen_oferta_codigo: r.almacen_oferta_codigo,
          stock_minimo_oferta: num(r.stock_minimo_oferta),
          cantidad_desde: Number(r.cantidad_desde),
          coste_neto: num(r.articulo?.coste_neto),
          precio_liquidado: num(r.articulo?.precio_liquidado),
          pvp_base: bases.get(r.articulo_codigo) ?? num(r.articulo?.pvp),
          pct: nv ? num(nv.incremento_pct) : null,
          precio: nv ? Number(nv.pvp) : null,
        }
      })
      setLineas(ls)
      setGuardadas(ls)
    })()
    return () => {
      cancel = true
    }
  }, [f.registro.codigo, f.registro.tarifa_oferta, mode])

  useEffect(() => {
    if (mode === 'alta' && f.listaCargada && !draft.codigo)
      patch({ codigo: siguienteCodigo(f.lista.map((l) => l.codigo), 4), fecha: hoyISO(), hora: horaActual() })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, f.listaCargada, draft.codigo])

  const ro = !editing
  const setLinea = (i: number, p: Partial<Linea>) => setLineas((ls) => ls.map((l, j) => (j === i ? { ...l, ...p } : l)))

  async function anadirArticulo(a: ArticuloBase) {
    const bases = await pvpsBase([a.codigo_interno], draft.tarifa_oferta)
    const base = bases.get(a.codigo_interno) ?? num(a.pvp)
    const nueva: Linea = {
      articulo_codigo: a.codigo_interno,
      descripcion: a.descripcion,
      almacen_oferta_codigo: null,
      stock_minimo_oferta: 0,
      cantidad_desde: 0,
      coste_neto: num(a.coste_neto),
      precio_liquidado: num(a.precio_liquidado),
      pvp_base: base,
      pct: 0,
      precio: base,
    }
    setLineas((ls) => [...ls, nueva])
    setSel(lineas.length)
    setEditIdx(lineas.length)
  }

  async function recalcularTarifas() {
    const bases = await pvpsBase([...new Set(lineas.map((l) => l.articulo_codigo))], draft.tarifa_oferta)
    setLineas((ls) => ls.map((l) => ({ ...l, pvp_base: bases.get(l.articulo_codigo) ?? l.pvp_base, pct: pctDe(l.precio, bases.get(l.articulo_codigo) ?? l.pvp_base) })))
  }

  async function guardarLineas(cod: string): Promise<string | null> {
    const quitadas = guardadas.filter((g) => g.id && !lineas.some((l) => l.id === g.id)).map((g) => g.id as number)
    if (quitadas.length) {
      await supabase.from('articulo_tarifa_cantidad_nivel').delete().in('articulo_tarifa_cantidad_id', quitadas)
      const { error } = await supabase.from('articulo_tarifa_cantidad').delete().in('id', quitadas)
      if (error) return `Oferta guardada, pero no se pudieron quitar líneas: ${error.message}`
    }
    const niveles = draft.un_pvp_para_todas ? [0, 1, 2, 3, 4, 5, 6] : [draft.tarifa_oferta]
    const nuevas: Linea[] = []
    for (const l of lineas) {
      const fila = {
        articulo_codigo: l.articulo_codigo,
        cantidad_desde: l.cantidad_desde ?? 0,
        oferta_codigo: cod,
        descripcion_oferta: draft.descripcion,
        fecha_desde: draft.fecha_desde,
        hora_desde: draft.hora_desde,
        fecha_hasta: draft.fecha_hasta,
        hora_hasta: draft.hora_hasta,
        stock_minimo_oferta: l.stock_minimo_oferta,
        almacen_oferta_codigo: l.almacen_oferta_codigo || null,
        es_un_pvp_para_toda_la_oferta: draft.un_pvp_para_todas,
        es_tarifa_de_oferta: String(draft.tarifa_oferta),
      }
      let id = l.id
      if (id) {
        const { error } = await supabase.from('articulo_tarifa_cantidad').update(fila).eq('id', id)
        if (error) return `Error en la línea ${l.articulo_codigo}: ${error.message}`
      } else {
        const { data, error } = await supabase.from('articulo_tarifa_cantidad').insert(fila).select('id').single()
        if (error) return `Error en la línea ${l.articulo_codigo}: ${error.message}`
        id = (data as { id: number }).id
      }
      await supabase.from('articulo_tarifa_cantidad_nivel').delete().eq('articulo_tarifa_cantidad_id', id)
      const { error: errN } = await supabase.from('articulo_tarifa_cantidad_nivel').insert(
        niveles.map((n) => ({
          articulo_tarifa_cantidad_id: id,
          nivel_tarifa: n,
          pvp: l.precio ?? 0,
          incremento_pct: l.pct,
          permite_descuento_linea: draft.reflejar_dto !== 2,
        })),
      )
      if (errN) return `Error en el precio de la línea ${l.articulo_codigo}: ${errN.message}`
      nuevas.push({ ...l, id })
    }
    setLineas(nuevas)
    setGuardadas(nuevas)
    setEditIdx(null)
    return null
  }

  async function aceptar() {
    await f.guardar(() => (!draft.codigo.trim() || !draft.concepto.trim() ? 'El código y el concepto son obligatorios.' : null), guardarLineas)
  }

  const lineaSel = lineas[sel]

  if (f.loading) return <div className="p-4 text-[13px]">Cargando…</div>

  return (
    <div className="flex flex-col gap-1">
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,540px)] gap-x-2">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="grid grid-cols-[110px_100px_56px_minmax(0,1fr)] gap-x-1.5">
            <GwField label="Codigo">
              <GwInput value={draft.codigo} disabled={mode !== 'alta'} maxLength={10} title="ARTTAROF.CODIGO" onChange={(e) => patch({ codigo: e.target.value })} />
            </GwField>
            <GwField label="Fecha">
              <GwInput type="date" value={draft.fecha ?? ''} disabled={ro} title="FECHA" onChange={(e) => patch({ fecha: e.target.value || null })} />
            </GwField>
            <GwField label="Hora">
              <GwInput value={draft.hora ?? ''} disabled={ro} maxLength={5} title="HORA" onChange={(e) => patch({ hora: e.target.value || null })} />
            </GwField>
            <GwField label="Concepto">
              <GwInput value={draft.concepto} disabled={ro} maxLength={30} title="CONCEPTO" onChange={(e) => patch({ concepto: e.target.value })} />
            </GwField>
          </div>
          <GwGroup title="Datos de la Oferta">
            <div className="grid grid-cols-[minmax(0,1fr)_100px_100px_56px_56px] gap-x-1.5">
              <GwField label="Descripción de la Oferta">
                <GwInput value={draft.descripcion ?? ''} disabled={ro} maxLength={20} title="OFERT_DESC" onChange={(e) => patch({ descripcion: e.target.value || null })} />
              </GwField>
              <GwField label="Fecha Inicio">
                <GwInput type="date" value={draft.fecha_desde ?? ''} disabled={ro} title="FECHA_OFD" onChange={(e) => patch({ fecha_desde: e.target.value || null })} />
              </GwField>
              <GwField label="Fecha Fin">
                <GwInput type="date" value={draft.fecha_hasta ?? ''} disabled={ro} title="FECHA_OFH" onChange={(e) => patch({ fecha_hasta: e.target.value || null })} />
              </GwField>
              <GwField label="Rango Horario" className="col-span-2">
                <div className="grid grid-cols-2 gap-x-1.5">
                  <GwInput value={draft.hora_desde ?? ''} placeholder=" :" disabled={ro} maxLength={5} title="HORA_OFD" onChange={(e) => patch({ hora_desde: e.target.value || null })} />
                  <GwInput value={draft.hora_hasta ?? ''} placeholder=" :" disabled={ro} maxLength={5} title="HORA_OFH" onChange={(e) => patch({ hora_hasta: e.target.value || null })} />
                </div>
              </GwField>
            </div>
          </GwGroup>
        </div>
        <GwField label="Observaciones">
          <GwTextArea rows={5} value={draft.observaciones ?? ''} disabled={ro} title="OBSERV" onChange={(e) => patch({ observaciones: e.target.value || null })} />
        </GwField>
      </div>
      {f.error && <div className="text-[13px] text-[#c42b1c]">{f.error}</div>}

      <GwTabs rows={TABS} active={tab} onChange={setTab}>
        {f.sinRegistros ? (
          <div className="min-h-[250px] p-3 text-[13px]">No hay ninguna tarifa de oferta. Pulsa Nuevo para dar de alta la primera.</div>
        ) : tab === 'tarifas' ? (
          <div className="flex min-h-[250px] flex-col gap-1">
            <div className="h-[230px] overflow-auto border border-[var(--gw-border)] bg-white">
              <table className="gw-grid">
                <thead className="sticky top-0 z-10">
                  <tr>
                    <th style={{ width: 120 }}>Cod. Interno</th>
                    <th>Descripción</th>
                    <th style={{ width: 52 }}>Almac.</th>
                    <th style={{ width: 92 }}>Stock Ofer.</th>
                    <th style={{ width: 92 }}>Precio Neto</th>
                    <th style={{ width: 92 }}>Precio Liq.</th>
                    <th style={{ width: 80 }}>Cant. Min.</th>
                    <th style={{ width: 72 }}>%Pvp</th>
                    <th style={{ width: 92 }}>Precio</th>
                  </tr>
                </thead>
                <tbody>
                  {lineas.map((l, i) => {
                    const ed = editing && editIdx === i
                    return (
                      <tr key={l.id ?? `n${i}`} className={!ed && i === sel ? 'gw-selected' : ''} onClick={() => setSel(i)} onDoubleClick={() => editing && setEditIdx(i)}>
                        <td>{l.articulo_codigo}</td>
                        <td className="max-w-0 truncate">{l.descripcion}</td>
                        <td>
                          {ed ? (
                            <GwInput value={l.almacen_oferta_codigo ?? ''} maxLength={2} title="OFERTALMAC" onChange={(e) => setLinea(i, { almacen_oferta_codigo: e.target.value || null })} />
                          ) : (
                            l.almacen_oferta_codigo
                          )}
                        </td>
                        <td className="text-right">
                          {ed ? (
                            <GwNumber value={l.stock_minimo_oferta} decimals={3} emptyAsZero onChange={(v) => setLinea(i, { stock_minimo_oferta: v })} />
                          ) : (
                            formatGw(l.stock_minimo_oferta ?? 0, 3)
                          )}
                        </td>
                        <td className="text-right">{formatGw(l.coste_neto ?? 0, 3)}</td>
                        <td className="text-right">{formatGw(l.precio_liquidado ?? 0, 3)}</td>
                        <td className="text-right">
                          {ed ? <GwNumber value={l.cantidad_desde} decimals={2} emptyAsZero onChange={(v) => setLinea(i, { cantidad_desde: v ?? 0 })} /> : formatGw(l.cantidad_desde, 2)}
                        </td>
                        <td className="text-right">
                          {ed ? (
                            <GwNumber value={l.pct} decimals={2} onChange={(v) => setLinea(i, { pct: v, precio: precioDe(v, l.pvp_base) ?? l.precio })} />
                          ) : (
                            formatGw(l.pct ?? 0, 2)
                          )}
                        </td>
                        <td className="text-right">
                          {ed ? (
                            <GwNumber value={l.precio} decimals={3} onChange={(v) => setLinea(i, { precio: v, pct: pctDe(v, l.pvp_base) })} />
                          ) : (
                            formatGw(l.precio ?? 0, 3)
                          )}
                        </td>
                      </tr>
                    )
                  })}
                  <FilasVacias cols={9} ocupadas={lineas.length} total={10} />
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
                if (!lineaSel || !confirm(`¿Quitar ${lineaSel.articulo_codigo} de la oferta?`)) return
                setLineas((ls) => ls.filter((_, j) => j !== sel))
                setEditIdx(null)
                setSel((s) => Math.max(0, s - 1))
              }}
              onBuscar={() => setBuscarArticulo('localizar')}
            >
              <span className="gw-label text-[15px] text-[#1a4fd0]">Nº Lineas: {lineas.length}</span>
            </GridMiniBar>
          </div>
        ) : (
          <div className="flex min-h-[250px] flex-col gap-2 p-1">
            <div className="grid grid-cols-[440px_minmax(0,1fr)] items-end gap-x-4">
              <GwField label="Tipo Cálculo de la Tarifa">
                <GwSelect value={draft.tipo_calculo} disabled={ro} title="ARTTAROF.POD — solo está confirmado el 0; confirmar con Luis" onChange={(e) => patch({ tipo_calculo: Number(e.target.value) })}>
                  <option value={0}>Aplicar según estén definidas las tarifas Generales</option>
                  <option value={1}>Tipo 1 (confirmar con Luis)</option>
                  <option value={2}>Tipo 2 (confirmar con Luis)</option>
                </GwSelect>
              </GwField>
              <div className="flex flex-wrap gap-3">
                <button type="button" className="gw-btn w-[150px]" disabled={ro || !lineas.length} title="Vuelve a leer el PVP de la tarifa de cada artículo y recalcula los %" onClick={recalcularTarifas}>
                  <Calculator size={13} /> ReCalcular Tarifas
                </button>
                <button
                  type="button"
                  className="gw-btn w-[180px]"
                  disabled={ro || !lineas.length}
                  title="Recalcula el %Pvp a partir del precio"
                  onClick={() => setLineas((ls) => ls.map((l) => ({ ...l, pct: pctDe(l.precio, l.pvp_base) })))}
                >
                  <Calculator size={13} /> ReCalcular Porcentages
                </button>
                <button
                  type="button"
                  className="gw-btn w-[150px]"
                  disabled={ro || !lineas.length}
                  title="Recalcula el precio a partir del %Pvp"
                  onClick={() => setLineas((ls) => ls.map((l) => ({ ...l, precio: precioDe(l.pct, l.pvp_base) ?? l.precio })))}
                >
                  <Calculator size={13} /> ReCalcular Precios
                </button>
              </div>
            </div>
            <GwField label="Reflejar el Dto. en la venta" className="w-[260px]">
              <GwSelect value={draft.reflejar_dto} disabled={ro} title="ARTTAROF.VERDTO — confirmar códigos con Luis" onChange={(e) => patch({ reflejar_dto: Number(e.target.value) })}>
                <option value={0}>Predeterminado</option>
                <option value={1}>Sí</option>
                <option value={2}>No</option>
              </GwSelect>
            </GwField>
            <div className="grid grid-cols-[440px_270px] gap-x-4">
              <GwField label="Tipo de Oferta">
                <GwSelect value={draft.un_pvp_para_todas ? 1 : 0} disabled={ro} title="ARTTAROF.UNPVPOFERT" onChange={(e) => patch({ un_pvp_para_todas: e.target.value === '1' })}>
                  <option value={1}>Usar un mismo Pvp de Oferta para todas las Tarifas</option>
                  <option value={0}>Usar el Pvp de Oferta solo en la tarifa elegida</option>
                </GwSelect>
              </GwField>
              <GwField label="Tarifa a usar como Oferta">
                <GwSelect value={draft.tarifa_oferta} disabled={ro} title="ARTTAROF.TAROFERT" onChange={(e) => patch({ tarifa_oferta: Number(e.target.value) })}>
                  {NOMBRES_TARIFA.map((n, i) => (
                    <option key={i} value={i}>
                      {n}
                    </option>
                  ))}
                </GwSelect>
              </GwField>
            </div>
            <BotonMarca
              className="w-[500px] justify-center"
              checked={draft.buscar_por_codigo_compra}
              disabled={ro}
              title="ARTTAROF.BUSCCODCOM"
              onChange={(v) => patch({ buscar_por_codigo_compra: v })}
            >
              Hacer la busqueda de los artículos por el código de compra
            </BotonMarca>
          </div>
        )}
      </GwTabs>

      <GwRecordBar
        mode={mode}
        canNavigate={f.canNavigate}
        saving={f.saving}
        onFirst={() => f.goTo(f.ordenada[0]?.codigo)}
        onPrev={() => f.goTo(f.ordenada[f.idx - 1]?.codigo)}
        onNext={() => f.goTo(f.ordenada[f.idx + 1]?.codigo)}
        onLast={() => f.goTo(f.ordenada[f.ordenada.length - 1]?.codigo)}
        onSort={() => f.setOrden((o) => (o === 'codigo' ? 'nombre' : 'codigo'))}
        onSearch={() => setBuscarFicha(true)}
        onPrint={() => window.print()}
        onNew={() => f.navigate('/tarifas-oferta/nuevo')}
        onEdit={() => !f.sinRegistros && f.setMode('edicion')}
        onDelete={() =>
          f.eliminar(
            `la tarifa de oferta ${f.registro.codigo} ${f.registro.concepto} y sus ${guardadas.length} líneas`,
            async () => null,
            async () => {
              const ids = guardadas.map((g) => g.id).filter(Boolean) as number[]
              if (ids.length) await supabase.from('articulo_tarifa_cantidad_nivel').delete().in('articulo_tarifa_cantidad_id', ids)
              const { error } = await supabase.from('articulo_tarifa_cantidad').delete().eq('oferta_codigo', f.registro.codigo)
              return error ? error.message : null
            },
          )
        }
        onSave={aceptar}
        onCancel={() => {
          setLineas(guardadas)
          setEditIdx(null)
          f.cancelar()
        }}
        onExit={() => f.navigate('/')}
      />
      <PieFicha
        texto={`Orden: ${f.orden === 'codigo' ? 'por código' : 'por concepto'}${f.idx >= 0 ? ` · Registro ${f.idx + 1} de ${f.ordenada.length}` : ''}${
          mode === 'alta' ? ' · Alta de tarifa de oferta' : mode === 'edicion' ? ' · Modificando' : ''
        }`}
      />

      {buscarFicha && (
        <GwLookupDialog<{ codigo: string; concepto: string; fecha_desde: string | null; fecha_hasta: string | null }>
          title="Buscar Tarifa de Oferta"
          table="oferta_tarifa"
          columns={[
            { key: 'codigo', label: 'Código', width: 80 },
            { key: 'concepto', label: 'Concepto' },
            { key: 'fecha_desde', label: 'Desde', width: 100 },
            { key: 'fecha_hasta', label: 'Hasta', width: 100 },
          ]}
          searchColumns={['codigo', 'concepto', 'descripcion']}
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
          title={buscarArticulo === 'nueva' ? 'Añadir artículo a la oferta' : 'Localizar artículo en la oferta'}
          table="articulo"
          columns={[
            { key: 'codigo_interno', label: 'Cod. Interno', width: 120 },
            { key: 'descripcion', label: 'Descripción' },
            { key: 'codigo_compra_habitual', label: 'Cód. Compra', width: 110 },
          ]}
          searchColumns={draft.buscar_por_codigo_compra ? ['codigo_compra_habitual', 'codigo_interno'] : ['codigo_interno', 'descripcion', 'codigo_barras_principal']}
          orderBy="codigo_interno"
          keyColumn="codigo_interno"
          onPick={async (a) => {
            const modo = buscarArticulo
            setBuscarArticulo(null)
            if (modo === 'localizar') {
              const i = lineas.findIndex((l) => l.articulo_codigo === a.codigo_interno)
              if (i >= 0) setSel(i)
              else alert(`${a.codigo_interno} no está en esta oferta.`)
              return
            }
            const { data } = await supabase.from('articulo').select('codigo_interno, descripcion, coste_neto, precio_liquidado, pvp').eq('codigo_interno', a.codigo_interno).maybeSingle()
            if (data) await anadirArticulo(data as ArticuloBase)
          }}
          onClose={() => setBuscarArticulo(null)}
        />
      )}
    </div>
  )
}
