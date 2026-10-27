import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, ShoppingCart, X } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { GwField, GwSelect, GwWindow, formatGw } from '../../../components/gw'
import { colorProveedor } from '../gestor/opciones'
import { cargarTramitables, tramitarPeticiones, TIENDA_PETICION, type PeticionATramitar } from './peticiones'

// «Tramitar peticiones» (SIN CAPTURA de GeminisWin): convierte las peticiones pendientes o
// atendidas en pedidos a proveedor, uno por proveedor (el de la petición o el habitual del artículo).

export function TramitarPeticionesDialog({
  claves,
  onClose,
  onHecho,
}: {
  /** Si se indica, solo salen marcadas estas peticiones (las demás se ven, sin marcar). */
  claves?: { t: string; n: number }[]
  onClose: () => void
  onHecho?: () => void
}) {
  const navigate = useNavigate()
  const [rows, setRows] = useState<(PeticionATramitar & { marcado: boolean })[]>([])
  const [tiendas, setTiendas] = useState<string[]>([])
  const [almacenes, setAlmacenes] = useState<{ codigo: string; nombre: string }[]>([])
  const [tienda, setTienda] = useState(TIENDA_PETICION)
  const [almacen, setAlmacen] = useState('')
  const [sel, setSel] = useState(0)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [hecho, setHecho] = useState<{ tienda: string; numero: number; proveedor: string; lineas: number }[] | null>(null)

  useEffect(() => {
    supabase
      .from('tienda_terminal')
      .select('codigo')
      .order('codigo')
      .then(({ data }) => setTiendas((data ?? []).map((t) => t.codigo as string)))
    supabase
      .from('almacen')
      .select('codigo, nombre')
      .order('codigo')
      .then(({ data }) => setAlmacenes((data ?? []) as { codigo: string; nombre: string }[]))
    const marcar = claves ? new Set(claves.map((k) => `${k.t}/${k.n}`)) : null
    cargarTramitables()
      .then((l) => {
        const out = l.map((r) => ({ ...r, marcado: marcar ? marcar.has(`${r.tienda}/${r.numero}`) : true }))
        out.sort((a, b) => (a.proveedor ?? '~').localeCompare(b.proveedor ?? '~') || a.articulo.localeCompare(b.articulo, 'es', { numeric: true }))
        setRows(out)
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setCargando(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const marcados = rows.filter((r) => r.marcado)
  const proveedores = useMemo(() => new Set(marcados.filter((r) => r.proveedor).map((r) => r.proveedor)), [marcados])
  const sinProv = marcados.filter((r) => !r.proveedor).length

  async function tramitar() {
    if (!proveedores.size) {
      setError(sinProv ? 'Las peticiones marcadas no tienen proveedor (ni el artículo proveedor habitual).' : 'No hay peticiones marcadas.')
      return
    }
    setCargando(true)
    setError(null)
    try {
      const r = await tramitarPeticiones(marcados, { tienda, almacen: almacen || null })
      setHecho(r.pedidos)
      const hechas = new Set(marcados.filter((m) => m.proveedor).map((m) => `${m.tienda}/${m.numero}`))
      setRows((rs) => rs.filter((x) => !hechas.has(`${x.tienda}/${x.numero}`)))
      onHecho?.()
    } catch (e) {
      setError((e as Error).message)
    }
    setCargando(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/20 pt-10" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <GwWindow title="Tramitar Peticiones de Artículos a Pedidos de Proveedor" onClose={onClose} className="w-[1000px] max-w-[96vw]">
        <div className="flex flex-col gap-1.5 text-[13px]">
          <div className="flex items-end gap-2">
            <GwField label="Tienda del pedido" className="w-[130px]">
              <GwSelect value={tienda} onChange={(e) => setTienda(e.target.value)} title="Tienda en la que se crean los pedidos a proveedor">
                {tiendas.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </GwSelect>
            </GwField>
            <GwField label="Almacén de recepción" className="w-[260px]">
              <GwSelect value={almacen} onChange={(e) => setAlmacen(e.target.value)} title="Vacío: el almacén por defecto del proveedor o el de la tienda">
                <option value="">(el del proveedor o la tienda)</option>
                {almacenes.map((a) => (
                  <option key={a.codigo} value={a.codigo}>
                    {a.codigo} {a.nombre}
                  </option>
                ))}
              </GwSelect>
            </GwField>
            <span className="flex-1" />
            <button type="button" className="gw-btn w-[120px]" disabled={cargando || !rows.length} onClick={() => setRows((rs) => rs.map((r) => ({ ...r, marcado: true })))}>
              Marcar todas
            </button>
            <button type="button" className="gw-btn w-[120px]" disabled={cargando || !rows.length} onClick={() => setRows((rs) => rs.map((r) => ({ ...r, marcado: false })))}>
              Desmarcar
            </button>
          </div>

          <div className="h-[330px] overflow-y-auto border border-[var(--gw-border)] bg-white">
            <table className="gw-grid">
              <thead className="sticky top-0">
                <tr>
                  <th style={{ width: 30 }} />
                  <th style={{ width: 90 }}>Proveedor</th>
                  <th style={{ width: 90 }}>Petición</th>
                  <th style={{ width: 130 }}>Artículo</th>
                  <th>Descripción</th>
                  <th style={{ width: 110 }}>A Pedir</th>
                </tr>
              </thead>
              <tbody>
                {!cargando && rows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-center text-[#6d6d6d]">
                      No hay peticiones pendientes de tramitar.
                    </td>
                  </tr>
                )}
                {rows.map((r, i) => (
                  <tr
                    key={`${r.tienda}/${r.numero}`}
                    className={i === sel ? 'gw-selected' : ''}
                    style={i === sel ? undefined : { background: colorProveedor(r.proveedor) }}
                    onClick={() => setSel(i)}
                    onDoubleClick={() => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, marcado: !x.marcado } : x)))}
                  >
                    <td className="text-center">
                      <input
                        type="checkbox"
                        className="m-0 h-[13px] w-[13px] accent-[#0078d7]"
                        checked={r.marcado}
                        onChange={() => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, marcado: !x.marcado } : x)))}
                      />
                    </td>
                    <td>{r.proveedor ?? <span className="text-[#c42b1c]">Sin prov.</span>}</td>
                    <td>
                      {r.tienda}/{r.numero}
                    </td>
                    <td>{r.articulo}</td>
                    <td className="truncate">{r.descripcion}</td>
                    <td className="text-right">{formatGw(r.falta, 3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {error && <div className="border border-[#c42b1c] bg-[#fde7e9] px-2 py-1 text-[#a4262c]">{error}</div>}
          {hecho && (
            <div className="flex flex-wrap items-center gap-1.5 border border-[#2a9d2a] bg-[#e7f6e7] px-2 py-1">
              {hecho.length ? 'Pedidos creados:' : 'No se ha creado ningún pedido.'}
              {hecho.map((p) => (
                <button
                  key={`${p.tienda}/${p.numero}`}
                  type="button"
                  className="text-[#1a4fd0] underline"
                  onClick={() => navigate(`/pedidos-proveedor/${encodeURIComponent(p.tienda)}/${p.numero}`)}
                >
                  {p.tienda}/{p.numero} ({p.proveedor}, {p.lineas} lín.)
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center gap-1.5">
            <span className="flex-1 text-[#1a4fd0]">
              Marcadas: {marcados.length} · Pedidos a crear: {proveedores.size}
              {sinProv ? ` · ${sinProv} sin proveedor (no se tramitan)` : ''}
            </span>
            <button type="button" className="gw-btn w-[170px]" disabled={cargando || !proveedores.size} onClick={tramitar}>
              <ShoppingCart size={15} className="text-[#2a9d2a]" /> {cargando ? 'Procesando…' : 'Generar Pedidos'}
            </button>
            <button type="button" className="gw-btn w-[110px]" onClick={onClose}>
              {hecho ? <Check size={15} className="text-[#127a12]" /> : <X size={15} className="text-[#c42b1c]" />} {hecho ? 'Cerrar' : 'Cancelar'}
            </button>
          </div>
        </div>
      </GwWindow>
    </div>
  )
}
