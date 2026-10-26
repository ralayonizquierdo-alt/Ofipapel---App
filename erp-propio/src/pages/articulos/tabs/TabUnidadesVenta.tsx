import { useEffect, useState, type ReactNode } from 'react'
import { Binoculars, Check, ChevronFirst, ChevronLast, FilePen, FilePlus2, Play, Trash2, X } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { GwCheck, GwField, GwGroup, GwInput, GwNumber, GwRadio } from '../../../components/gw'
import type { Articulo, ArticuloUnidadVenta } from '../types'

type Unidad = Omit<ArticuloUnidadVenta, 'precios'>
type Precios = Record<number, number | null>

const PVPS_IZQ = [
  { nivel: 0, label: 'P.V.P. General:' },
  { nivel: 1, label: 'MAYOR  M-1:' },
  { nivel: 2, label: 'MAYOR  M-2:' },
  { nivel: 3, label: 'MAYOR  M-3:' },
]
const PVPS_DER = [
  { nivel: 4, label: 'Tarifa Dcto -4:' },
  { nivel: 5, label: 'Tarifa Dcto -5:' },
  { nivel: 6, label: 'Tarifa Dcto -6:' },
  { nivel: 7, label: 'Pvp Oferta:' },
]

/** Casilla dibujada como botón, como las de GeminisWin («× Vender Cajas»). */
function CheckBoton({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button type="button" className="gw-btn !justify-start !px-2" disabled={disabled} onClick={() => onChange(!checked)}>
      {checked ? <Check size={13} strokeWidth={3} className="text-[#127a12]" /> : <X size={13} strokeWidth={3} className="text-[#c42b1c]" />}
      {label}
    </button>
  )
}

function MiniBtn({ title, onClick, disabled, children }: { title: string; onClick?: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className="flex h-[22px] w-[66px] items-center justify-center border-r border-[var(--gw-border-light)] text-[#1d3a8a] last:border-r-0 hover:bg-[#e5f1fb] disabled:text-[#9a9a9a] disabled:hover:bg-transparent"
    >
      {children}
    </button>
  )
}

const unidadVacia = (codigo: string): Unidad => ({
  articulo_codigo: codigo,
  descripcion: '',
  factor_conversion: 1,
  tipo_calculo_precio: 0,
  incremento_pct: null,
  no_vender: false,
})

export function TabUnidadesVenta({
  articuloCodigo,
  articulo,
  editing,
  onChange,
}: {
  articuloCodigo: string
  articulo: Articulo
  editing: boolean
  onChange: (patch: Partial<Articulo>) => void
}) {
  const [rows, setRows] = useState<Unidad[]>([])
  const [idx, setIdx] = useState(0)
  const [precios, setPrecios] = useState<Precios>({})
  const [edit, setEdit] = useState<{ unidad: Unidad; precios: Precios } | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function load(irA?: number) {
    const { data, error: err } = await supabase
      .from('articulo_unidad_venta')
      .select('id, articulo_codigo, descripcion, factor_conversion, tipo_calculo_precio, incremento_pct, no_vender')
      .eq('articulo_codigo', articuloCodigo)
      .order('id')
    if (err) setError(err.message)
    const lista = (data ?? []) as Unidad[]
    setRows(lista)
    const i = irA != null ? lista.findIndex((u) => u.id === irA) : -1
    setIdx(i >= 0 ? i : Math.min(idx, Math.max(lista.length - 1, 0)))
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [articuloCodigo])

  const actual = rows[idx]

  useEffect(() => {
    if (actual?.id == null) {
      setPrecios({})
      return
    }
    supabase
      .from('articulo_unidad_venta_precio_nivel')
      .select('nivel_tarifa, pvp')
      .eq('articulo_unidad_venta_id', actual.id)
      .then(({ data }) => {
        const map: Precios = {}
        for (const r of data ?? []) map[r.nivel_tarifa] = Number(r.pvp)
        setPrecios(map)
      })
  }, [actual?.id])

  const u = edit?.unidad ?? actual ?? null
  const p = edit?.precios ?? precios
  const enEdicion = edit != null
  const dis = !editing
  const setU = (patch: Partial<Unidad>) => edit && setEdit({ ...edit, unidad: { ...edit.unidad, ...patch } })

  async function aceptar() {
    if (!edit) return
    setError(null)
    const d = edit.unidad
    if (!d.descripcion.trim()) return setError('La unidad necesita una descripción (p. ej. Caja).')
    const payload = {
      articulo_codigo: articuloCodigo,
      descripcion: d.descripcion,
      factor_conversion: d.factor_conversion,
      tipo_calculo_precio: d.tipo_calculo_precio,
      incremento_pct: d.incremento_pct,
      no_vender: d.no_vender,
    }
    const res =
      d.id != null
        ? await supabase.from('articulo_unidad_venta').update(payload).eq('id', d.id).select('id').single()
        : await supabase.from('articulo_unidad_venta').insert(payload).select('id').single()
    if (res.error) return setError(res.error.message)
    const id = res.data.id as number
    const conPrecio = Object.entries(edit.precios).filter(([, v]) => v != null)
    const sinPrecio = Object.entries(edit.precios).filter(([, v]) => v == null).map(([k]) => Number(k))
    if (conPrecio.length) {
      const { error: err } = await supabase
        .from('articulo_unidad_venta_precio_nivel')
        .upsert(conPrecio.map(([k, v]) => ({ articulo_unidad_venta_id: id, nivel_tarifa: Number(k), pvp: Number(v) })), {
          onConflict: 'articulo_unidad_venta_id,nivel_tarifa',
        })
      if (err) return setError(err.message)
    }
    if (sinPrecio.length) {
      await supabase.from('articulo_unidad_venta_precio_nivel').delete().eq('articulo_unidad_venta_id', id).in('nivel_tarifa', sinPrecio)
    }
    setEdit(null)
    await load(id)
  }

  async function borrar() {
    if (!actual?.id) return
    if (!confirm(`¿Borrar la unidad de venta «${actual.descripcion}» y sus precios?`)) return
    await supabase.from('articulo_unidad_venta_precio_nivel').delete().eq('articulo_unidad_venta_id', actual.id)
    const { error: err } = await supabase.from('articulo_unidad_venta').delete().eq('id', actual.id)
    if (err) return setError(err.message)
    load()
  }

  const fila = (n: { nivel: number; label: string }) => (
    <div key={n.nivel} className="grid grid-cols-[110px_96px_12px] items-center gap-1">
      <span className="gw-label text-[12px]">{n.label}</span>
      <GwNumber
        value={p[n.nivel] ?? null}
        decimals={3}
        disabled={!enEdicion}
        onChange={(v) => edit && setEdit({ ...edit, precios: { ...edit.precios, [n.nivel]: v } })}
      />
      <span className="text-[12px]">%</span>
    </div>
  )

  return (
    <div className="flex h-[250px] flex-col gap-1" title="ARTUNDVT">
      <fieldset className="gw-group flex-1">
        <legend>
          <GwCheck
            label="Asignar valores a la Unidad de Stock y de Venta"
            checked={articulo.und_asignar}
            onChange={(v) => onChange({ und_asignar: v })}
            disabled={dis}
            className="text-[12px]"
          />
        </legend>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-start gap-3">
            <GwGroup title="Valor de la Unidad de Stock" className="w-[360px] flex-none">
              <div className="grid grid-cols-[96px_minmax(0,1fr)] items-end gap-x-2">
                <GwField label="Unidad Stock">
                  <GwNumber
                    value={articulo.und_stock_valor}
                    decimals={4}
                    disabled={dis}
                    onChange={(v) => onChange({ und_stock_valor: v ?? 1 })}
                  />
                </GwField>
                <div className="flex flex-col gap-0.5">
                  <GwCheck
                    label="Permitir Vender por la Und. de Stock"
                    checked={articulo.und_vender_por_stock}
                    onChange={(v) => onChange({ und_vender_por_stock: v })}
                    disabled={dis}
                    className="text-[12px]"
                  />
                  <div className="flex items-center gap-1">
                    <span className="gw-label text-[12px]">Descripción:</span>
                    <GwInput
                      title="UNDDESCRST"
                      value={articulo.und_stock_descripcion ?? ''}
                      onChange={(e) => onChange({ und_stock_descripcion: e.target.value === '' ? null : e.target.value })}
                      disabled={dis}
                    />
                  </div>
                </div>
              </div>
            </GwGroup>
            <div className="pt-2">
              <CheckBoton
                label="Confirmar Siempre la Unidad de Venta al Vender en el Tpv Táctil"
                checked={articulo.und_confirmar_tpv}
                onChange={(v) => onChange({ und_confirmar_tpv: v })}
                disabled={dis}
              />
            </div>
          </div>

          <GwGroup title="Valores de la Unidad de Venta">
            <div className="flex flex-col gap-1">
              <div className="grid grid-cols-[80px_80px_160px_auto] items-end gap-1.5">
                <GwField label="Id. Und. Vta.">
                  <GwInput readOnly value={u?.id ?? ''} className="text-right" title="UND_ID" />
                </GwField>
                <GwField label="Valor Unidad">
                  <GwNumber value={u?.factor_conversion ?? null} decimals={4} disabled={!enEdicion} onChange={(v) => setU({ factor_conversion: v ?? 0 })} />
                </GwField>
                <GwField label="Descripción de la Unidad">
                  <GwInput value={u?.descripcion ?? ''} disabled={!enEdicion} onChange={(e) => setU({ descripcion: e.target.value })} />
                </GwField>
                <GwCheck
                  label="No Usar al Vender"
                  checked={u?.no_vender ?? false}
                  onChange={(v) => setU({ no_vender: v })}
                  disabled={!enEdicion}
                  className="pb-1 text-[12px]"
                />
              </div>
              <div className="flex items-start gap-2">
                <GwGroup title="Calculo del PVP" className="w-[285px] flex-none">
                  <div className="flex flex-col text-[12px]" title="UNDTIPCALC">
                    <GwRadio name="und-calc" label="Calcular (PVP * (Und. Venta / Und. Stock))" checked={u?.tipo_calculo_precio === 0} onChange={() => setU({ tipo_calculo_precio: 0 })} disabled={!enEdicion} />
                    <GwRadio name="und-calc" label="Incrementar un % sobre el calculo anterior" checked={u?.tipo_calculo_precio === 1} onChange={() => setU({ tipo_calculo_precio: 1 })} disabled={!enEdicion} />
                    <div className="flex items-center gap-1 pl-4">
                      <GwNumber className="!w-[70px]" value={u?.incremento_pct ?? null} decimals={2} emptyAsZero disabled={!enEdicion || u?.tipo_calculo_precio !== 1} onChange={(v) => setU({ incremento_pct: v })} />
                      <span>%</span>
                    </div>
                    <GwRadio name="und-calc" label="Aplicar un PVP fijo" checked={u?.tipo_calculo_precio === 2} onChange={() => setU({ tipo_calculo_precio: 2 })} disabled={!enEdicion} />
                    <GwRadio name="und-calc" label="Aplicar las tarifas de la ficha sin cambios" checked={u?.tipo_calculo_precio === 3} onChange={() => setU({ tipo_calculo_precio: 3 })} disabled={!enEdicion} />
                  </div>
                </GwGroup>
                <GwGroup title="Pvps para la unidad de venta" className="flex-1">
                  <div className="grid grid-cols-2 gap-x-6 gap-y-0.5" title="UNDPVP_0 … UNDPVP_7">
                    <div className="flex flex-col gap-0.5">{PVPS_IZQ.map(fila)}</div>
                    <div className="flex flex-col gap-0.5">{PVPS_DER.map(fila)}</div>
                  </div>
                </GwGroup>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex border border-[var(--gw-border)]">
                  <MiniBtn title="Primera unidad" disabled={enEdicion || idx === 0} onClick={() => setIdx(0)}>
                    <ChevronFirst size={13} strokeWidth={3} />
                  </MiniBtn>
                  <MiniBtn title="Anterior" disabled={enEdicion || idx === 0} onClick={() => setIdx(idx - 1)}>
                    <Play size={9} className="rotate-180" fill="currentColor" />
                  </MiniBtn>
                  <MiniBtn title="Siguiente" disabled={enEdicion || idx >= rows.length - 1} onClick={() => setIdx(idx + 1)}>
                    <Play size={9} fill="currentColor" />
                  </MiniBtn>
                  <MiniBtn title="Última unidad" disabled={enEdicion || idx >= rows.length - 1} onClick={() => setIdx(rows.length - 1)}>
                    <ChevronLast size={13} strokeWidth={3} />
                  </MiniBtn>
                  <MiniBtn title="Nueva unidad de venta" disabled={dis || enEdicion} onClick={() => setEdit({ unidad: unidadVacia(articuloCodigo), precios: {} })}>
                    <FilePlus2 size={13} />
                  </MiniBtn>
                  {enEdicion ? (
                    <>
                      <MiniBtn title="Aceptar" onClick={aceptar}>
                        <Check size={14} strokeWidth={3} className="text-[#127a12]" />
                      </MiniBtn>
                      <MiniBtn title="Cancelar" onClick={() => setEdit(null)}>
                        <X size={14} strokeWidth={3} className="text-[#c42b1c]" />
                      </MiniBtn>
                    </>
                  ) : (
                    <>
                      <MiniBtn title="Modificar unidad" disabled={dis || !actual} onClick={() => actual && setEdit({ unidad: { ...actual }, precios: { ...precios } })}>
                        <FilePen size={13} />
                      </MiniBtn>
                      <MiniBtn title="Borrar unidad" disabled={dis || !actual} onClick={borrar}>
                        <Trash2 size={13} />
                      </MiniBtn>
                    </>
                  )}
                  <MiniBtn title="Buscar" disabled>
                    <Binoculars size={13} />
                  </MiniBtn>
                </div>
                <span className="text-[12px] text-[#1a4fd0]">Nº de Unidades de Venta: {rows.length}</span>
                {error && <span className="text-[12px] text-[#a4262c]">{error}</span>}
              </div>
            </div>
          </GwGroup>
        </div>
      </fieldset>
    </div>
  )
}
