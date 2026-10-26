import { useEffect, useState, type ReactNode } from 'react'
import { supabase } from '../../../lib/supabase'
import { GwInput, GwNumber, GwSelect, GwWindow } from '../../../components/gw'

function DialogShell({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/20 pt-24" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <GwWindow title={title} onClose={onClose} className="w-[620px] max-w-[95vw]">
        {children}
      </GwWindow>
    </div>
  )
}

interface CodigoCompra {
  proveedor_codigo: string
  codigo_compra: string | null
}

/** Botón «+» de «Códigos de Compra»: un código de compra por proveedor (ARTPROV). */
export function CodigosCompraDialog({
  articuloCodigo,
  proveedores,
  editable,
  onClose,
}: {
  articuloCodigo: string
  proveedores: { codigo: string; nombre: string }[]
  editable: boolean
  onClose: () => void
}) {
  const [rows, setRows] = useState<CodigoCompra[]>([])
  const [sel, setSel] = useState(-1)
  const [prov, setProv] = useState('')
  const [codigo, setCodigo] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function load() {
    const { data } = await supabase
      .from('articulo_proveedor')
      .select('proveedor_codigo, codigo_compra')
      .eq('articulo_codigo', articuloCodigo)
      .not('codigo_compra', 'is', null)
      .order('proveedor_codigo')
    setRows((data ?? []) as CodigoCompra[])
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [articuloCodigo])

  async function add() {
    setError(null)
    if (!prov || !codigo.trim()) {
      setError('Elige el proveedor y escribe el código de compra.')
      return
    }
    const { error: err } = await supabase
      .from('articulo_proveedor')
      .upsert({ articulo_codigo: articuloCodigo, proveedor_codigo: prov, codigo_compra: codigo.trim() }, { onConflict: 'articulo_codigo,proveedor_codigo' })
    if (err) {
      setError(err.message)
      return
    }
    setCodigo('')
    setProv('')
    load()
  }

  async function remove() {
    const r = rows[sel]
    if (!r) return
    if (!confirm(`¿Quitar el código de compra ${r.codigo_compra} del proveedor ${r.proveedor_codigo}?`)) return
    const { error: err } = await supabase
      .from('articulo_proveedor')
      .update({ codigo_compra: null })
      .eq('articulo_codigo', articuloCodigo)
      .eq('proveedor_codigo', r.proveedor_codigo)
    if (err) setError(err.message)
    setSel(-1)
    load()
  }

  const nombre = (c: string) => proveedores.find((p) => p.codigo === c)?.nombre ?? ''

  return (
    <DialogShell title="Códigos de Compra" onClose={onClose}>
      <div className="flex flex-col gap-1.5">
        <div className="max-h-[300px] overflow-y-auto border border-[var(--gw-border)]">
          <table className="gw-grid">
            <thead>
              <tr>
                <th style={{ width: 90 }}>Proveedor</th>
                <th>Nombre Proveedor</th>
                <th style={{ width: 170 }}>Código de Compra</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={3} className="text-center text-[#6d6d6d]">
                    Sin códigos de compra.
                  </td>
                </tr>
              )}
              {rows.map((r, i) => (
                <tr key={r.proveedor_codigo} className={i === sel ? 'gw-selected' : ''} onClick={() => setSel(i)}>
                  <td>{r.proveedor_codigo}</td>
                  <td>{nombre(r.proveedor_codigo)}</td>
                  <td>{r.codigo_compra}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {editable && (
          <div className="flex items-center gap-1.5">
            <GwSelect value={prov} onChange={(e) => setProv(e.target.value)} className="!w-[260px]">
              <option value="">— Proveedor —</option>
              {proveedores.map((p) => (
                <option key={p.codigo} value={p.codigo}>
                  {p.codigo} {p.nombre}
                </option>
              ))}
            </GwSelect>
            <GwInput placeholder="Código de compra" value={codigo} onChange={(e) => setCodigo(e.target.value)} />
            <button type="button" className="gw-btn" onClick={add}>
              Añadir
            </button>
            <button type="button" className="gw-btn" disabled={sel < 0} onClick={remove}>
              Borrar
            </button>
          </div>
        )}
        {error && <p className="text-[#c42b1c]">{error}</p>}
        <div className="flex justify-end">
          <button type="button" className="gw-btn" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </DialogShell>
  )
}

interface CodigoBarras {
  id: number
  codigo_barras: string
  unidades_por_codigo: number | null
  unidad_descripcion: string | null
}

/** Botón «+» de «Códigos de Barras»: varios códigos por artículo (ARTBARRA). */
export function CodigosBarrasDialog({
  articuloCodigo,
  editable,
  onClose,
}: {
  articuloCodigo: string
  editable: boolean
  onClose: () => void
}) {
  const [rows, setRows] = useState<CodigoBarras[]>([])
  const [sel, setSel] = useState(-1)
  const [codigo, setCodigo] = useState('')
  const [unidades, setUnidades] = useState<number | null>(null)
  const [unidad, setUnidad] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function load() {
    const { data } = await supabase
      .from('articulo_codigo_barras')
      .select('id, codigo_barras, unidades_por_codigo, unidad_descripcion')
      .eq('articulo_codigo', articuloCodigo)
      .order('id')
    setRows((data ?? []) as CodigoBarras[])
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [articuloCodigo])

  async function add() {
    setError(null)
    const c = codigo.trim()
    if (!c) return
    const { error: err } = await supabase.from('articulo_codigo_barras').insert({
      articulo_codigo: articuloCodigo,
      codigo_barras: c,
      digitos_barras: c.length,
      unidades_por_codigo: unidades,
      unidad_descripcion: unidad.trim() || null,
    })
    if (err) {
      setError(err.code === '23505' ? `El código de barras ${c} ya está asignado a otro artículo.` : err.message)
      return
    }
    setCodigo('')
    setUnidades(null)
    setUnidad('')
    load()
  }

  async function remove() {
    const r = rows[sel]
    if (!r) return
    if (!confirm(`¿Borrar el código de barras ${r.codigo_barras}?`)) return
    const { error: err } = await supabase.from('articulo_codigo_barras').delete().eq('id', r.id)
    if (err) setError(err.message)
    setSel(-1)
    load()
  }

  return (
    <DialogShell title="Códigos de Barras" onClose={onClose}>
      <div className="flex flex-col gap-1.5">
        <div className="max-h-[300px] overflow-y-auto border border-[var(--gw-border)]">
          <table className="gw-grid">
            <thead>
              <tr>
                <th>Código de Barras</th>
                <th style={{ width: 110 }}>Unidades</th>
                <th style={{ width: 150 }}>Unidad</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={3} className="text-center text-[#6d6d6d]">
                    Sin códigos de barras adicionales.
                  </td>
                </tr>
              )}
              {rows.map((r, i) => (
                <tr key={r.id} className={i === sel ? 'gw-selected' : ''} onClick={() => setSel(i)}>
                  <td>{r.codigo_barras}</td>
                  <td className="text-right">{r.unidades_por_codigo ?? ''}</td>
                  <td>{r.unidad_descripcion ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {editable && (
          <div className="flex items-center gap-1.5">
            <GwInput placeholder="Código de barras" value={codigo} onChange={(e) => setCodigo(e.target.value)} />
            <GwNumber value={unidades} onChange={setUnidades} decimals={0} className="!w-[90px]" />
            <GwInput placeholder="Unidad" value={unidad} onChange={(e) => setUnidad(e.target.value)} className="!w-[130px]" />
            <button type="button" className="gw-btn" onClick={add}>
              Añadir
            </button>
            <button type="button" className="gw-btn" disabled={sel < 0} onClick={remove}>
              Borrar
            </button>
          </div>
        )}
        {error && <p className="text-[#c42b1c]">{error}</p>}
        <div className="flex justify-end">
          <button type="button" className="gw-btn" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </DialogShell>
  )
}
