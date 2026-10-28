import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'
import { GwDate, GwInput, GwLookupButton, GwNumber, GwRadio, GwSelect, GwTextArea, GwWindow } from '../../../components/gw'
import { GwRecordBar } from '../../../components/gw/GwRecordBar'
import { GwLookupDialog } from '../../../components/gw/GwLookupDialog'
import { useNavRegistro, type NavDir } from '../../../components/gw/useNavRegistro'
import { emptyArticulo, type Articulo, type ArticuloPrecioNivel } from '../../articulos/types'
import { COSTE_FIELDS, aplicarCambioNivel, costeBase, margenReal, recalcularTodos, type NivelPatch } from '../../articulos/pricing'
import { msgError, useTiendas } from './comun'
import { esEan13 } from './codigoBarras'
import { igicDefecto } from '../../../lib/parametros'

// Almacén → Creación Ráp. de Artic. Calcada de las capturas 06-21 (abre en alta) y 06-22
// (consulta de uno existente): ficha reducida de artículos con Código Interno, Descripción,
// Campo Libre, Código Venta, Códigos de Compra y de Barras (con «+» para añadir más), Marca,
// Fecha baja, Proveedor, Familia y las pestañas Características (costes, stock, % IGIC, PVPs,
// Dto. Max. y Tipo Pvp) y Observaciones. Los PVP se calculan como en la ficha de Artículos
// (pricing.ts) y, al elegir familia en el alta, se cargan los márgenes de su plantilla de tarifas.
// En el alta, «Stock Actual» genera un movimiento de regularización en el almacén de la tienda
// (confirmar con Luis si GeminisWin lo hace así).

type Modo = 'consulta' | 'edicion' | 'alta'
type Art = Omit<Articulo, 'actualizado_en'>

const NOMBRES = ['General:', 'MAYOR  M-1:', 'MAYOR  M-2:', 'MAYOR  M-3:', 'Tarifa Dcto -4:', 'Tarifa Dcto -5:', 'Tarifa Dcto -6:']
const nivelesVacios = (c: string): ArticuloPrecioNivel[] =>
  NOMBRES.map((_, i) => ({
    articulo_codigo: c,
    nivel_tarifa: i,
    pvp: 0,
    incremento_pct: null,
    modo_calculo: 'P',
    permite_descuento_linea: false,
  }))

const LBL = 'text-[17px] leading-[20px] whitespace-nowrap'
const INP = '!h-[28px] !text-[17px]'

/** «+» grande de Códigos de Compra / de Barras (captura 06-21). */
function BotonMas({ title, onClick }: { title: string; onClick: () => void }) {
  return (
    <button type="button" className="gw-btn !h-[28px] !w-[56px] flex-none !px-0 !text-[26px] font-bold !leading-none" title={title} onClick={onClick}>
      +
    </button>
  )
}

function Campo({ label, children, className = '' }: { label: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={`flex min-w-0 flex-col ${className}`}>
      <span className={LBL}>{label}</span>
      {children}
    </label>
  )
}

export function CreacionRapidaArticulosPage() {
  const navigate = useNavigate()
  const codigoRuta = decodeURIComponent((useParams()['*'] ?? '').replace(/\/+$/, ''))
  const tiendas = useTiendas()
  const [modo, setModo] = useState<Modo>(codigoRuta ? 'consulta' : 'alta')
  const [art, setArt] = useState<Art>({ ...emptyArticulo })
  const [orig, setOrig] = useState<Art>({ ...emptyArticulo })
  const [niveles, setNiveles] = useState<ArticuloPrecioNivel[]>(nivelesVacios(''))
  const [nivelesOrig, setNivelesOrig] = useState<ArticuloPrecioNivel[]>(nivelesVacios(''))
  const [stock, setStock] = useState(0)
  const [stockAlta, setStockAlta] = useState<number | null>(0)
  const [nomProv, setNomProv] = useState('')
  const [descFam, setDescFam] = useState('')
  const [tab, setTab] = useState<'car' | 'obs'>('car')
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [dialogo, setDialogo] = useState<null | 'marca' | 'proveedor' | 'proveedor_nombre' | 'familia' | 'familia_desc' | 'buscar' | 'barras' | 'compra'>(null)
  const [barrasExtra, setBarrasExtra] = useState<string[]>([])
  const [compraExtra, setCompraExtra] = useState<string[]>([])
  const editable = modo !== 'consulta'

  const cargar = useCallback(async (codigo: string) => {
    setError(null)
    setAviso(null)
    const [{ data: a }, { data: n }, { data: s }] = await Promise.all([
      supabase.from('articulo').select('*').eq('codigo_interno', codigo).maybeSingle(),
      supabase.from('articulo_precio_nivel').select('*').eq('articulo_codigo', codigo).order('nivel_tarifa'),
      supabase.from('articulo_almacen_stock').select('cantidad_actual').eq('articulo_codigo', codigo),
    ])
    if (!a) {
      setError(`No existe el artículo ${codigo}.`)
      return
    }
    const { actualizado_en: _x, ...resto } = a as Articulo
    void _x
    setArt(resto)
    setOrig(resto)
    const base = nivelesVacios(codigo)
    const nv = base.map((b) => ((n ?? []) as ArticuloPrecioNivel[]).find((x) => x.nivel_tarifa === b.nivel_tarifa) ?? b)
    setNiveles(nv)
    setNivelesOrig(nv)
    setStock(((s ?? []) as { cantidad_actual: number }[]).reduce((t, r) => t + Number(r.cantidad_actual), 0))
    setBarrasExtra([])
    setCompraExtra([])
    setModo('consulta')
  }, [])

  useEffect(() => {
    if (codigoRuta) cargar(codigoRuta)
    else nuevo()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codigoRuta])

  function nuevo() {
    const a = {
      ...emptyArticulo,
      tipo_igic_codigo: 0,
      igic_pct: igicDefecto(),
      descuento_maximo_cliente_pct: 100,
      fecha_alta: new Date().toISOString().slice(0, 10),
    }
    setArt(a)
    setOrig(a)
    setNiveles(nivelesVacios(''))
    setNivelesOrig(nivelesVacios(''))
    setStock(0)
    setStockAlta(0)
    setBarrasExtra([])
    setCompraExtra([])
    setError(null)
    setModo('alta')
  }

  useEffect(() => {
    if (!art.proveedor_habitual_codigo) return setNomProv('')
    supabase
      .from('proveedor')
      .select('nombre')
      .eq('codigo', art.proveedor_habitual_codigo)
      .maybeSingle()
      .then(({ data }) => setNomProv((data as { nombre: string } | null)?.nombre ?? ''))
  }, [art.proveedor_habitual_codigo])
  useEffect(() => {
    if (!art.familia_codigo) return setDescFam('')
    supabase
      .from('familia')
      .select('descripcion')
      .eq('codigo', art.familia_codigo)
      .maybeSingle()
      .then(({ data }) => setDescFam((data as { descripcion: string } | null)?.descripcion ?? ''))
  }, [art.familia_codigo])

  const nav = useNavRegistro<{ codigo_interno: string }>({
    tabla: 'articulo',
    orden: ['codigo_interno'],
    actual: modo === 'alta' || !orig.codigo_interno ? null : [orig.codigo_interno],
    select: 'codigo_interno',
  })
  const irA = async (d: NavDir) => {
    const r = await nav.ir(d)
    if (r) navigate(`/almacen/creacion-rapida/${encodeURIComponent(r.codigo_interno)}`)
  }

  function patch(p: Partial<Art>) {
    const next = { ...art, ...p }
    if (Object.keys(p).some((k) => COSTE_FIELDS.includes(k as keyof Articulo)) && !next.no_calcular_pvp_auto) {
      const base = costeBase(next as Articulo)
      if (base != null) {
        const r = recalcularTodos(niveles, base)
        setNiveles(r)
        next.coste_usado_calculo_pvp = base
        next.pvp = r[0]?.pvp ?? next.pvp
      }
    }
    setArt(next)
  }

  /** Al elegir familia en el alta: su plantilla de tarifas da los márgenes de cada nivel. */
  async function cambiarFamilia(codigo: string) {
    patch({ familia_codigo: codigo || null })
    if (modo !== 'alta' || !codigo) return
    const { data: fam } = await supabase.from('familia').select('plantilla_tarifa_codigo').eq('codigo', codigo).maybeSingle()
    const plantilla = (fam as { plantilla_tarifa_codigo: string | null } | null)?.plantilla_tarifa_codigo
    if (!plantilla) return
    const { data: pn } = await supabase
      .from('plantilla_tarifa_nivel')
      .select('nivel_tarifa, incremento_pct, modo_calculo, permite_descuento_linea')
      .eq('plantilla_tarifa_codigo', plantilla)
    const filas = (pn ?? []) as {
      nivel_tarifa: number
      incremento_pct: number | null
      modo_calculo: string | null
      permite_descuento_linea: boolean | null
    }[]
    setArt((a) => ({
      ...a,
      familia_codigo: codigo,
      plantilla_tarifa_codigo: plantilla,
    }))
    setNiveles((ns) => {
      const conPlantilla = ns.map((n) => {
        const p = filas.find((x) => x.nivel_tarifa === n.nivel_tarifa)
        return p
          ? {
              ...n,
              incremento_pct: p.incremento_pct,
              modo_calculo: p.modo_calculo ?? 'P',
              permite_descuento_linea: !!p.permite_descuento_linea,
            }
          : n
      })
      return recalcularTodos(conPlantilla, costeBase({ ...art, familia_codigo: codigo } as Articulo))
    })
  }

  function cambiarNivel(nivel: number, p: NivelPatch) {
    const next = aplicarCambioNivel(niveles, nivel, p, costeBase(art as Articulo))
    setNiveles(next)
    setArt((a) => ({ ...a, pvp: next[0]?.pvp ?? a.pvp }))
  }

  async function validar(): Promise<string | null> {
    const cod = art.codigo_interno.trim()
    if (!cod) return 'Falta el Código Interno.'
    if (!art.descripcion.trim()) return 'Falta la Descripción.'
    if (modo === 'alta') {
      const { data } = await supabase.from('articulo').select('codigo_interno').eq('codigo_interno', cod).maybeSingle()
      if (data) return `Ya existe un artículo con el código ${cod}.`
    }
    const barras = [art.codigo_barras_principal, ...barrasExtra].map((b) => (b ?? '').trim()).filter(Boolean)
    for (const b of barras) {
      if (/^\d{13}$/.test(b) && !esEan13(b)) return `El código de barras ${b} tiene mal el dígito de control (EAN-13).`
      const [{ data: p }, { data: x }] = await Promise.all([
        supabase.from('articulo').select('codigo_interno').eq('codigo_barras_principal', b).neq('codigo_interno', cod).limit(1),
        supabase.from('articulo_codigo_barras').select('articulo_codigo').eq('codigo_barras', b).neq('articulo_codigo', cod).limit(1),
      ])
      const otro = (p as { codigo_interno: string }[] | null)?.[0]?.codigo_interno ?? (x as { articulo_codigo: string }[] | null)?.[0]?.articulo_codigo
      if (otro) return `El código de barras ${b} ya es del artículo ${otro}.`
    }
    if (new Set(barras).size !== barras.length) return 'Hay códigos de barras repetidos.'
    return null
  }

  async function guardar() {
    if (guardando) return
    setError(null)
    setGuardando(true)
    try {
      const fallo = await validar()
      if (fallo) throw new Error(fallo)
      const cod = art.codigo_interno.trim()
      const preciosCambiados = niveles.some((n, i) => JSON.stringify(n) !== JSON.stringify(nivelesOrig[i]))
      const payload: Art = {
        ...art,
        codigo_interno: cod,
        codigo_barras_principal: art.codigo_barras_principal?.trim() || null,
        codigo_compra_habitual: art.codigo_compra_habitual?.trim() || null,
        pvp: niveles[0]?.pvp ?? art.pvp,
        fecha_ultima_modificacion_pvp: preciosCambiados || modo === 'alta' ? new Date().toISOString() : art.fecha_ultima_modificacion_pvp,
      }
      const r = modo === 'alta' ? await supabase.from('articulo').insert(payload) : await supabase.from('articulo').update(payload).eq('codigo_interno', orig.codigo_interno)
      if (r.error) throw r.error
      if (preciosCambiados || modo === 'alta') {
        const { error: e } = await supabase.from('articulo_precio_nivel').upsert(
          niveles.map((n) => ({
            ...n,
            articulo_codigo: cod,
            pvp: n.pvp ?? 0,
          })),
          { onConflict: 'articulo_codigo,nivel_tarifa' },
        )
        if (e) throw new Error(`Artículo guardado, pero los precios no: ${e.message}`)
      }
      // Códigos de barras: el principal y los añadidos con «+» también en articulo_codigo_barras.
      const barras = [payload.codigo_barras_principal, ...barrasExtra].filter((b): b is string => !!b)
      for (const b of barras) {
        const { data } = await supabase.from('articulo_codigo_barras').select('id').eq('codigo_barras', b).maybeSingle()
        if (!data) {
          const { error: e } = await supabase.from('articulo_codigo_barras').insert({
            articulo_codigo: cod,
            codigo_barras: b,
            digitos_barras: b.length,
            unidades_por_codigo: 1,
            proveedor_codigo: payload.proveedor_habitual_codigo,
          })
          if (e) throw new Error(`Artículo guardado, pero el código de barras ${b} no: ${e.message}`)
        }
      }
      // Códigos de compra del proveedor (el habitual y los añadidos con «+»).
      if (payload.proveedor_habitual_codigo) {
        const compras = [payload.codigo_compra_habitual, ...compraExtra].filter((c): c is string => !!c)
        const { data: ya } = await supabase.from('articulo_proveedor').select('codigo_compra').eq('articulo_codigo', cod).eq('proveedor_codigo', payload.proveedor_habitual_codigo)
        const existentes = new Set(((ya ?? []) as { codigo_compra: string | null }[]).map((x) => x.codigo_compra ?? ''))
        const filas = (compras.length ? compras : [null]).filter((c) => !existentes.has(c ?? ''))
        if (filas.length && !(compras.length === 0 && existentes.size)) {
          const { error: e } = await supabase.from('articulo_proveedor').insert(
            filas.map((c) => ({
              articulo_codigo: cod,
              proveedor_codigo: payload.proveedor_habitual_codigo,
              codigo_compra: c,
              coste_puro: payload.coste_puro,
              coste_neto: payload.coste_neto,
              coste_bruto: payload.coste_bruto,
            })),
          )
          if (e) throw new Error(`Artículo guardado, pero el código de compra no: ${e.message}`)
        }
      }
      if (modo === 'alta' && stockAlta) {
        const tienda = tiendas.find((t) => t.almacen_codigo) ?? tiendas[0]
        if (tienda?.almacen_codigo) {
          const { error: e } = await supabase.from('movimiento_stock').insert({
            tipo_movimiento: 'regularizacion',
            sentido: stockAlta > 0 ? 1 : -1,
            almacen_codigo: tienda.almacen_codigo,
            articulo_codigo: cod,
            cantidad: Math.abs(stockAlta),
            costo_unitario: payload.coste_bruto,
            documento_origen_tipo: 'alta_articulo',
            tienda_terminal_codigo: tienda.codigo,
            observaciones: 'Stock inicial en la Creación Rápida de Artículos',
          })
          if (e) throw new Error(`Artículo guardado, pero el stock inicial no: ${e.message}`)
        }
      }
      if (modo === 'alta') navigate(`/almacen/creacion-rapida/${encodeURIComponent(cod)}`)
      else await cargar(cod)
      nav.refrescar()
      setAviso(modo === 'alta' ? `Artículo ${cod} creado.` : 'Cambios guardados.')
    } catch (e) {
      setError(msgError(e))
    } finally {
      setGuardando(false)
    }
  }

  function cancelar() {
    setError(null)
    if (modo === 'alta') {
      if (orig.codigo_interno) return cargar(orig.codigo_interno)
      return nuevo()
    }
    setArt(orig)
    setNiveles(nivelesOrig)
    setModo('consulta')
  }

  async function eliminar() {
    if (!orig.codigo_interno) return
    if (!confirm(`¿Dar de baja el artículo ${orig.codigo_interno}? (Se marca como anulado con la fecha de hoy; no se borra.)`)) return
    const { error: e } = await supabase
      .from('articulo')
      .update({
        activo: false,
        fecha_baja: new Date().toISOString().slice(0, 10),
      })
      .eq('codigo_interno', orig.codigo_interno)
    if (e) return setError(e.message)
    cargar(orig.codigo_interno)
  }

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (!editable) return
      if (e.key === 'F1') {
        e.preventDefault()
        guardar()
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  })

  const base = costeBase(art as Articulo)
  const num = (k: keyof Art, d = 3) => (
    <GwNumber className={INP} decimals={d} disabled={!editable} value={art[k] as number | null} emptyAsZero onChange={(v) => patch({ [k]: v } as Partial<Art>)} />
  )

  return (
    <div className="flex h-full min-h-0 flex-col gap-1">
      <div className="grid grid-cols-[210px_minmax(0,1fr)_240px] gap-x-3 gap-y-0.5">
        <Campo label="Código Interno">
          <GwInput
            className={INP}
            value={art.codigo_interno}
            disabled={modo !== 'alta'}
            maxLength={20}
            onChange={(e) =>
              patch({
                codigo_interno: e.target.value.toUpperCase(),
                codigo_venta: art.codigo_venta && art.codigo_venta !== art.codigo_interno ? art.codigo_venta : e.target.value.toUpperCase(),
              })
            }
          />
        </Campo>
        <Campo label="Descripción">
          <GwInput className={INP} value={art.descripcion} disabled={!editable} maxLength={100} onChange={(e) => patch({ descripcion: e.target.value })} />
        </Campo>
        <Campo label="Campo Libre">
          <GwInput className={INP} value={art.campo_libre ?? ''} disabled={!editable} onChange={(e) => patch({ campo_libre: e.target.value || null })} />
        </Campo>
      </div>
      <div className="grid grid-cols-[210px_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.9fr)_150px] gap-x-3">
        <Campo label="Código Venta">
          <GwInput className={INP} value={art.codigo_venta ?? ''} disabled={!editable} onChange={(e) => patch({ codigo_venta: e.target.value || null })} />
        </Campo>
        <Campo label="Códigos de Compra">
          <span className="flex">
            <GwInput className={INP} value={art.codigo_compra_habitual ?? ''} disabled={!editable} onChange={(e) => patch({ codigo_compra_habitual: e.target.value || null })} />
            <BotonMas title="Más códigos de compra" onClick={() => setDialogo('compra')} />
          </span>
        </Campo>
        <Campo label="Códigos de Barras">
          <span className="flex">
            <GwInput
              className={INP}
              value={art.codigo_barras_principal ?? ''}
              disabled={!editable}
              onChange={(e) =>
                patch({
                  codigo_barras_principal: e.target.value.trim() || null,
                })
              }
            />
            <BotonMas title="Más códigos de barras" onClick={() => setDialogo('barras')} />
          </span>
        </Campo>
        <Campo label="Marca">
          <span className="flex">
            <GwInput className={INP} value={art.marca_codigo ?? ''} disabled={!editable} onChange={(e) => patch({ marca_codigo: e.target.value || null })} />
            <GwLookupButton disabled={!editable} onClick={() => setDialogo('marca')} />
          </span>
        </Campo>
        <Campo label="Fecha baja">
          <GwDate className={INP} value={art.fecha_baja} disabled={!editable} onChange={(v) => patch({ fecha_baja: v })} />
        </Campo>
      </div>
      <div className="grid grid-cols-[190px_minmax(0,1.6fr)_220px_minmax(0,1.2fr)] gap-x-3">
        <Campo label="Proveedor">
          <span className="flex">
            <GwInput
              className={INP}
              value={art.proveedor_habitual_codigo ?? ''}
              disabled={!editable}
              onChange={(e) => patch({ proveedor_habitual_codigo: e.target.value || null })}
            />
            <GwLookupButton disabled={!editable} onClick={() => setDialogo('proveedor')} />
          </span>
        </Campo>
        <Campo label="Nombre Proveedor">
          <span className="flex">
            <GwInput className={INP} value={nomProv} readOnly tabIndex={-1} />
            <GwLookupButton disabled={!editable} onClick={() => setDialogo('proveedor_nombre')} />
          </span>
        </Campo>
        <Campo label="Familia">
          <span className="flex">
            <GwInput
              className={INP}
              value={art.familia_codigo ?? ''}
              disabled={!editable}
              onChange={(e) => patch({ familia_codigo: e.target.value || null })}
              onBlur={(e) => modo === 'alta' && e.target.value && cambiarFamilia(e.target.value)}
            />
            <GwLookupButton disabled={!editable} onClick={() => setDialogo('familia')} />
          </span>
        </Campo>
        <Campo label="Descripción Familia">
          <span className="flex">
            <GwInput className={INP} value={descFam} readOnly tabIndex={-1} />
            <GwLookupButton disabled={!editable} onClick={() => setDialogo('familia_desc')} />
          </span>
        </Campo>
      </div>

      <div className="mt-1 flex">
        {(
          [
            ['car', 'Características'],
            ['obs', 'Observaciones'],
          ] as const
        ).map(([k, l]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={`-mb-px border border-[var(--gw-border)] px-3 text-[18px] ${tab === k ? 'z-10 h-[34px] border-b-transparent bg-[var(--gw-face)] font-bold' : 'mt-[3px] h-[31px] bg-[#f6f6f6]'}`}
          >
            {l}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-auto border border-[var(--gw-border)] p-1.5">
        {tab === 'obs' ? (
          <GwTextArea
            className="h-full !text-[15px]"
            rows={12}
            value={art.observaciones ?? ''}
            disabled={!editable}
            onChange={(e) => patch({ observaciones: e.target.value || null })}
          />
        ) : (
          <div className="grid grid-cols-[minmax(0,0.75fr)_minmax(0,1fr)] gap-3">
            <div className="flex flex-col gap-1.5">
              <fieldset className="gw-group !pt-0">
                <legend className={LBL}>Precios de coste</legend>
                <div className="grid grid-cols-2 gap-x-3">
                  <Campo label="Coste Puro Prov.">{num('coste_puro')}</Campo>
                  <Campo label="Coste Neto:">{num('coste_neto')}</Campo>
                  <Campo label="Coste Bruto:">{num('coste_bruto')}</Campo>
                  <Campo label="Coste Líquido:">{num('precio_liquidado')}</Campo>
                  <Campo label="Precio Liq. Medio:">{num('precio_medio_compra')}</Campo>
                  <Campo label="Proveedor Local:">{num('coste_local')}</Campo>
                </div>
              </fieldset>
              <fieldset className="gw-group !pt-0">
                <legend className={LBL}>Stock</legend>
                <div className="grid grid-cols-3 gap-x-1">
                  <Campo label={<span className="block text-center">Actual</span>}>
                    {modo === 'alta' ? (
                      <GwNumber className={INP} decimals={3} value={stockAlta} emptyAsZero onChange={setStockAlta} />
                    ) : (
                      <GwNumber className={`${INP} !text-[#8a8a8a]`} decimals={3} disabled value={stock} />
                    )}
                  </Campo>
                  <Campo label={<span className="block text-center">Mínimo</span>}>{num('stock_minimo')}</Campo>
                  <Campo label={<span className="block text-center">Máximo</span>}>{num('stock_maximo')}</Campo>
                </div>
              </fieldset>
              <fieldset className="gw-group !pt-0">
                <legend className={LBL}>% IGIC</legend>
                <div className="grid grid-cols-[100px_minmax(0,1fr)] items-center gap-2">
                  {num('igic_pct', 2)}
                  <div className="flex justify-around border border-[var(--gw-border-light)] py-0.5">
                    <GwRadio
                      name="cr-igic"
                      label={<span className={LBL}>Soportado</span>}
                      disabled={!editable}
                      checked={art.tipo_igic_codigo === 1}
                      onChange={() => patch({ tipo_igic_codigo: 1 })}
                    />
                    <GwRadio
                      name="cr-igic"
                      label={<span className={LBL}>Repercutido</span>}
                      disabled={!editable}
                      checked={art.tipo_igic_codigo === 0}
                      onChange={() => patch({ tipo_igic_codigo: 0 })}
                    />
                  </div>
                </div>
              </fieldset>
            </div>
            <div className="flex flex-col gap-1.5">
              <fieldset className="gw-group !pt-0">
                <legend className={LBL}>Pvps</legend>
                <div className="flex flex-col gap-[3px]">
                  {niveles.map((n) => (
                    <div key={n.nivel_tarifa} className="grid grid-cols-[minmax(0,1fr)_74px_74px_110px_190px_74px] items-center gap-1">
                      <span className={LBL}>{NOMBRES[n.nivel_tarifa]}</span>
                      <GwSelect
                        className={INP}
                        disabled={!editable}
                        value={n.modo_calculo ?? 'P'}
                        title="P = % sobre coste · D = % de descuento sobre la General"
                        onChange={(e) =>
                          cambiarNivel(n.nivel_tarifa, {
                            modo_calculo: e.target.value,
                          })
                        }
                      >
                        <option value="P">P</option>
                        <option value="D">D</option>
                      </GwSelect>
                      <GwSelect
                        className={INP}
                        disabled={!editable}
                        value={n.permite_descuento_linea ? 'S' : 'N'}
                        title="Permite descuento en línea"
                        onChange={(e) =>
                          cambiarNivel(n.nivel_tarifa, {
                            permite_descuento_linea: e.target.value === 'S',
                          })
                        }
                      >
                        <option value="N">N</option>
                        <option value="S">S</option>
                      </GwSelect>
                      <GwNumber
                        className={INP}
                        decimals={2}
                        disabled={!editable}
                        value={n.incremento_pct}
                        emptyAsZero
                        onChange={(v) => cambiarNivel(n.nivel_tarifa, { incremento_pct: v })}
                      />
                      <GwNumber className={INP} decimals={3} disabled={!editable} value={n.pvp} emptyAsZero onChange={(v) => cambiarNivel(n.nivel_tarifa, { pvp: v ?? 0 })} />
                      <span className={LBL}>{margenReal(n.pvp, base) || (n.pvp ? '' : '100%')}</span>
                    </div>
                  ))}
                </div>
              </fieldset>
              <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] gap-3">
                <div className="flex items-center gap-2 border border-[var(--gw-border-light)] px-2 py-1">
                  <span className={LBL}>Dto. Max.:</span>
                  <span className="w-[120px]">{num('descuento_maximo_cliente_pct', 2)}</span>
                </div>
                <div className="flex items-center gap-3 border border-[var(--gw-border-light)] px-2 py-1">
                  <span className={LBL}>Tipo Pvp:</span>
                  <span className="flex flex-1 justify-around border border-[var(--gw-border-light)] py-0.5">
                    <GwRadio name="cr-tpvp" label={<span className={LBL}>Fijo</span>} disabled={!editable} checked={art.pvp_fijo} onChange={() => patch({ pvp_fijo: true })} />
                    <GwRadio
                      name="cr-tpvp"
                      label={<span className={LBL}>Variable</span>}
                      disabled={!editable}
                      checked={!art.pvp_fijo}
                      onChange={() => patch({ pvp_fijo: false })}
                    />
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      {(error || aviso) && <div className={`text-[13px] ${error ? 'text-[#c42b1c]' : 'text-[#127a12]'}`}>{error ?? aviso}</div>}
      <div className="pr-[64px]">
        <GwRecordBar
          grande
          mode={modo}
          canNavigate={modo === 'consulta' && !!orig.codigo_interno}
          saving={guardando}
          onFirst={() => irA('primero')}
          onPrev={() => irA('anterior')}
          onNext={() => irA('siguiente')}
          onLast={() => irA('ultimo')}
          onSort={() => undefined}
          onSearch={() => setDialogo('buscar')}
          onPrint={() => window.print()}
          onNew={() => {
            navigate('/almacen/creacion-rapida')
            nuevo()
          }}
          onEdit={() => orig.codigo_interno && setModo('edicion')}
          onDelete={eliminar}
          onSave={guardar}
          onCancel={cancelar}
          onExit={() => navigate('/')}
        />
      </div>

      {dialogo === 'marca' && (
        <GwLookupDialog<Record<string, unknown>>
          title="Marcas"
          table="marca"
          columns={[{ key: 'codigo', label: 'Marca' }]}
          searchColumns={['codigo']}
          orderBy="codigo"
          keyColumn="codigo"
          onPick={(r) => (setDialogo(null), patch({ marca_codigo: String(r.codigo) }))}
          onClose={() => setDialogo(null)}
        />
      )}
      {(dialogo === 'proveedor' || dialogo === 'proveedor_nombre') && (
        <GwLookupDialog<Record<string, unknown>>
          title="Proveedores"
          table="proveedor"
          columns={[
            { key: 'codigo', label: 'Código', width: 90 },
            { key: 'nombre', label: 'Nombre' },
          ]}
          searchColumns={['codigo', 'nombre']}
          orderBy={dialogo === 'proveedor' ? 'codigo' : 'nombre'}
          keyColumn="codigo"
          onPick={(r) => (setDialogo(null), patch({ proveedor_habitual_codigo: String(r.codigo) }))}
          onClose={() => setDialogo(null)}
        />
      )}
      {(dialogo === 'familia' || dialogo === 'familia_desc') && (
        <GwLookupDialog<Record<string, unknown>>
          title="Familias"
          table="familia"
          columns={[
            { key: 'codigo', label: 'Código', width: 100 },
            { key: 'descripcion', label: 'Descripción' },
          ]}
          searchColumns={['codigo', 'descripcion']}
          orderBy={dialogo === 'familia' ? 'codigo' : 'descripcion'}
          keyColumn="codigo"
          onPick={(r) => (setDialogo(null), cambiarFamilia(String(r.codigo)))}
          onClose={() => setDialogo(null)}
        />
      )}
      {dialogo === 'buscar' && (
        <GwLookupDialog<Record<string, unknown>>
          title="Buscar artículo"
          table="articulo"
          columns={[
            { key: 'codigo_interno', label: 'Código', width: 130 },
            { key: 'descripcion', label: 'Descripción' },
            {
              key: 'codigo_barras_principal',
              label: 'Cód. barras',
              width: 140,
            },
          ]}
          searchColumns={['codigo_interno', 'descripcion', 'codigo_barras_principal']}
          orderBy="codigo_interno"
          keyColumn="codigo_interno"
          onPick={(r) => (setDialogo(null), navigate(`/almacen/creacion-rapida/${encodeURIComponent(String(r.codigo_interno))}`))}
          onClose={() => setDialogo(null)}
        />
      )}
      {(dialogo === 'barras' || dialogo === 'compra') && (
        <CodigosDialog
          tipo={dialogo}
          articulo={orig.codigo_interno && modo !== 'alta' ? orig.codigo_interno : null}
          pendientes={dialogo === 'barras' ? barrasExtra : compraExtra}
          editable={editable}
          onAnadir={(c) => (dialogo === 'barras' ? setBarrasExtra((x) => [...x, c]) : setCompraExtra((x) => [...x, c]))}
          onClose={() => setDialogo(null)}
        />
      )}
    </div>
  )
}

/** «+» de Códigos de Barras / Códigos de Compra: lista los que tiene el artículo y añade otros (se guardan con la ficha). */
function CodigosDialog({
  tipo,
  articulo,
  pendientes,
  editable,
  onAnadir,
  onClose,
}: {
  tipo: 'barras' | 'compra'
  articulo: string | null
  pendientes: string[]
  editable: boolean
  onAnadir: (c: string) => void
  onClose: () => void
}) {
  const [filas, setFilas] = useState<{ codigo: string; extra: string }[]>([])
  const [nuevo, setNuevo] = useState('')
  useEffect(() => {
    if (!articulo) return
    if (tipo === 'barras')
      supabase
        .from('articulo_codigo_barras')
        .select('codigo_barras, proveedor_codigo')
        .eq('articulo_codigo', articulo)
        .then(({ data }) =>
          setFilas(
            (
              (data ?? []) as {
                codigo_barras: string
                proveedor_codigo: string | null
              }[]
            ).map((r) => ({
              codigo: r.codigo_barras,
              extra: r.proveedor_codigo ?? '',
            })),
          ),
        )
    else
      supabase
        .from('articulo_proveedor')
        .select('codigo_compra, proveedor_codigo')
        .eq('articulo_codigo', articulo)
        .then(({ data }) =>
          setFilas(
            (
              (data ?? []) as {
                codigo_compra: string | null
                proveedor_codigo: string
              }[]
            ).map((r) => ({
              codigo: r.codigo_compra ?? '',
              extra: r.proveedor_codigo,
            })),
          ),
        )
  }, [articulo, tipo])
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/20 pt-24" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <GwWindow title={tipo === 'barras' ? 'Códigos de Barras' : 'Códigos de Compra'} onClose={onClose} className="w-[520px]">
        <div className="flex flex-col gap-1.5">
          <div className="max-h-[260px] overflow-y-auto border border-[var(--gw-border)]">
            <table className="gw-grid">
              <thead className="sticky top-0">
                <tr>
                  <th>{tipo === 'barras' ? 'Código de barras' : 'Código de compra'}</th>
                  <th style={{ width: 120 }}>Proveedor</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ...filas,
                  ...pendientes.map((c) => ({
                    codigo: c,
                    extra: '(se añade al guardar)',
                  })),
                ].map((r, i) => (
                  <tr key={r.codigo + i}>
                    <td>{r.codigo}</td>
                    <td>{r.extra}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex gap-1.5">
            <GwInput
              autoFocus
              disabled={!editable}
              value={nuevo}
              placeholder={editable ? 'Nuevo código y Intro' : 'Pulsa Modificar para añadir códigos'}
              onChange={(e) => setNuevo(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && nuevo.trim()) {
                  onAnadir(nuevo.trim())
                  setNuevo('')
                }
              }}
            />
            <button type="button" className="gw-btn" disabled={!editable || !nuevo.trim()} onClick={() => (onAnadir(nuevo.trim()), setNuevo(''))}>
              Añadir
            </button>
            <button type="button" className="gw-btn" onClick={onClose}>
              Cerrar
            </button>
          </div>
        </div>
      </GwWindow>
    </div>,
    document.body,
  )
}
