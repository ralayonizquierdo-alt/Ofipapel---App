import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { DoorOpen, FileDown, Link2, RefreshCw } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { wc, type WcCliente } from '../../lib/woocommerce'
import { descargarCsv, telefono9, type ClienteCruce } from '../../lib/webMapeo'
import { GwLookupDialog } from '../../components/gw/GwLookupDialog'
import { fechaEs } from '../ventas/gestores/comun'
import { cargarClientes, eur, ESTILO_FALTA, Nota, Tabla, WebError, type Col } from './comun'

interface Tarifa {
  nivel: number | null
  dto: number | null
  credito: string | null
  formaPago: string | null
  preciosFijos: number
  dtosFamilia: number
}

interface Fila {
  clave: string
  web: WcCliente | null
  erp: ClienteCruce | null
  via: string
}

/** Cliente del ERP de un cliente web: id web enlazado, email o teléfono. */
function enlazar(w: WcCliente, clientes: ClienteCruce[]): { erp: ClienteCruce; via: string } | null {
  const c1 = clientes.find((c) => c.web_id_cliente === w.id)
  if (c1) return { erp: c1, via: 'enlazado' }
  const email = (w.email ?? '').trim().toLowerCase()
  const c2 = email ? clientes.find((c) => (c.email ?? '').trim().toLowerCase() === email) : undefined
  if (c2) return { erp: c2, via: 'email (sin enlazar)' }
  const tel = telefono9(w.billing?.phone)
  const c3 = tel.length === 9 ? clientes.find((c) => telefono9(c.telefono_movil) === tel || telefono9(c.telefono_fijo) === tel) : undefined
  if (c3) return { erp: c3, via: 'teléfono (sin enlazar)' }
  return null
}

/**
 * Web → Clientes Web y Clientes de Empresa. Las tarifas NO se gestionan aquí: salen de la ficha del
 * cliente (pestaña Tarifas) y se muestran solo en lectura; desde aquí solo se enlaza el cliente web
 * con su cliente del ERP (campo «Id cliente web» de la ficha).
 */
export function ClientesWebPage({ empresa = false }: { empresa?: boolean }) {
  const navigate = useNavigate()
  const [webs, setWebs] = useState<WcCliente[] | null>(null)
  const [clientes, setClientes] = useState<ClienteCruce[]>([])
  const [tarifas, setTarifas] = useState<Map<string, Tarifa>>(new Map())
  const [error, setError] = useState<unknown>(null)
  const [cargando, setCargando] = useState(false)
  const [vista, setVista] = useState<'todos' | 'enlazados' | 'sin'>('todos')
  const [texto, setTexto] = useState('')
  const [sel, setSel] = useState(0)
  const [enlazando, setEnlazando] = useState<WcCliente | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  async function cargarTarifas(codigos: string[]) {
    const m = new Map<string, Tarifa>()
    if (!codigos.length) return m
    const { data: cs } = await supabase.from('cliente').select('codigo, tarifa_nivel_defecto, descuento_pct, tipo_credito, forma_pago_codigo').in('codigo', codigos)
    const { data: pf } = await supabase.from('cliente_articulo_precio').select('cliente_codigo').in('cliente_codigo', codigos)
    const { data: df } = await supabase.from('cliente_descuento_familia').select('cliente_codigo').in('cliente_codigo', codigos)
    for (const c of cs ?? [])
      m.set(c.codigo, {
        nivel: c.tarifa_nivel_defecto,
        dto: c.descuento_pct == null ? null : Number(c.descuento_pct),
        credito: c.tipo_credito,
        formaPago: c.forma_pago_codigo,
        preciosFijos: (pf ?? []).filter((x) => x.cliente_codigo === c.codigo).length,
        dtosFamilia: (df ?? []).filter((x) => x.cliente_codigo === c.codigo).length,
      })
    return m
  }

  async function cargar() {
    setCargando(true)
    setError(null)
    try {
      const cl = await cargarClientes()
      setClientes(cl)
      let w: WcCliente[] = []
      try {
        w = (await wc.todos<WcCliente>('customers', { role: 'all', orderby: 'registered_date', order: 'desc' }, 20)).data ?? []
      } catch (e) {
        setError(e)
      }
      setWebs(w)
      if (empresa) {
        const cods = new Set(cl.filter((c) => c.web_id_cliente).map((c) => c.codigo))
        for (const x of w) {
          const e = enlazar(x, cl)
          if (e) cods.add(e.erp.codigo)
        }
        setTarifas(await cargarTarifas([...cods]))
      }
    } catch (e) {
      setError(e)
    }
    setCargando(false)
  }
  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const todas: Fila[] = useMemo(() => {
    const out: Fila[] = (webs ?? []).map((w) => {
      const e = enlazar(w, clientes)
      return { clave: `w${w.id}`, web: w, erp: e?.erp ?? null, via: e?.via ?? '' }
    })
    // Clientes del ERP enlazados a un id web que no ha venido (p. ej. sin claves todavía)
    const vistos = new Set((webs ?? []).map((w) => w.id))
    for (const c of clientes) if (c.web_id_cliente && !vistos.has(c.web_id_cliente)) out.push({ clave: `e${c.codigo}`, web: null, erp: c, via: 'enlazado' })
    return out
  }, [webs, clientes])

  const filas = useMemo(() => {
    const t = texto.trim().toLowerCase()
    return todas.filter(
      (f) =>
        (vista === 'todos' || (vista === 'enlazados' ? f.via === 'enlazado' : f.via !== 'enlazado')) &&
        (!t || `${f.web?.email ?? ''} ${f.web?.first_name ?? ''} ${f.web?.last_name ?? ''} ${f.web?.billing?.company ?? ''} ${f.erp?.codigo ?? ''} ${f.erp?.nombre ?? ''}`.toLowerCase().includes(t)),
    )
  }, [todas, vista, texto])

  const cols: Col<Fila>[] = useMemo(() => {
    const base: Col<Fila>[] = [
      { key: 'id', label: 'Id web', width: 65, align: 'right', value: (f) => f.web?.id ?? f.erp?.web_id_cliente ?? null },
      { key: 'nombre', label: 'Nombre en la web', width: 190, value: (f) => (f.web ? `${f.web.first_name ?? ''} ${f.web.last_name ?? ''}`.trim() || f.web.username || '' : '') },
      { key: 'empresa', label: 'Empresa', width: 150, value: (f) => f.web?.billing?.company ?? '' },
      { key: 'email', label: 'Email', width: 200, value: (f) => f.web?.email ?? f.erp?.email ?? '' },
      { key: 'tel', label: 'Teléfono', width: 95, value: (f) => f.web?.billing?.phone ?? '' },
    ]
    const resto: Col<Fila>[] = empresa
      ? [
          { key: 'erp', label: 'Cliente ERP', width: 75, value: (f) => f.erp?.codigo ?? '', cellStyle: (f) => (!f.erp ? ESTILO_FALTA : undefined) },
          { key: 'nerp', label: 'Nombre ERP', width: 190, value: (f) => f.erp?.nombre ?? '' },
          { key: 'niv', label: 'Tarifa', width: 55, align: 'right', value: (f) => (f.erp ? tarifas.get(f.erp.codigo)?.nivel ?? null : null) },
          { key: 'dto', label: '% Dto.', width: 60, align: 'right', value: (f) => (f.erp ? tarifas.get(f.erp.codigo)?.dto ?? null : null), render: (f) => (f.erp ? eur(tarifas.get(f.erp.codigo)?.dto) : '') },
          { key: 'pf', label: 'Precios fijos', width: 85, align: 'right', value: (f) => (f.erp ? tarifas.get(f.erp.codigo)?.preciosFijos ?? 0 : null) },
          { key: 'df', label: 'Dtos. familia', width: 85, align: 'right', value: (f) => (f.erp ? tarifas.get(f.erp.codigo)?.dtosFamilia ?? 0 : null) },
          { key: 'cred', label: 'Crédito', width: 70, value: (f) => (f.erp ? tarifas.get(f.erp.codigo)?.credito ?? '' : '') },
          { key: 'via', label: 'Enlace', width: 140, value: (f) => f.via || 'sin cliente ERP' },
        ]
      : [
          { key: 'alta', label: 'Alta', width: 85, value: (f) => f.web?.date_created ?? null, render: (f) => fechaEs(f.web?.date_created) },
          { key: 'ciudad', label: 'Población', width: 120, value: (f) => f.web?.billing?.city ?? '' },
          { key: 'paga', label: 'Ha comprado', width: 85, value: (f) => (f.web ? (f.web.is_paying_customer ? 'Sí' : 'No') : '') },
          { key: 'erp', label: 'Cliente ERP', width: 220, value: (f) => (f.erp ? `${f.erp.codigo} ${f.erp.nombre}` : ''), cellStyle: (f) => (!f.erp ? ESTILO_FALTA : undefined) },
          { key: 'via', label: 'Enlace', width: 140, value: (f) => f.via || 'sin cliente ERP' },
        ]
    return [...base, ...resto]
  }, [empresa, tarifas])

  const actual = filas[sel]

  async function guardarEnlace(w: WcCliente, codigo: string) {
    // Un cliente web solo puede estar enlazado a un cliente del ERP.
    await supabase.from('cliente').update({ web_id_cliente: null }).eq('web_id_cliente', w.id).neq('codigo', codigo)
    const { error: e } = await supabase.from('cliente').update({ web_id_cliente: w.id }).eq('codigo', codigo)
    setMsg(e ? `No se ha podido enlazar: ${e.message}` : `Cliente web ${w.id} enlazado con el cliente ${codigo} del ERP (solo en el ERP).`)
    setEnlazando(null)
    if (!e) {
      setClientes((cs) => cs.map((c) => (c.codigo === codigo ? { ...c, web_id_cliente: w.id } : c.web_id_cliente === w.id ? { ...c, web_id_cliente: null } : c)))
      if (empresa) {
        const t = await cargarTarifas([codigo])
        setTarifas((m) => new Map([...m, ...t]))
      }
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-1.5 text-[13px]">
      <div className="flex flex-none flex-wrap items-center gap-2">
        <span className="gw-label">Ver:</span>
        <select className="gw-input w-[230px]! flex-none" value={vista} onChange={(e) => setVista(e.target.value as typeof vista)}>
          <option value="todos">Todos ({todas.length})</option>
          <option value="enlazados">Enlazados a un cliente del ERP ({todas.filter((f) => f.via === 'enlazado').length})</option>
          <option value="sin">Sin enlazar ({todas.filter((f) => f.via !== 'enlazado').length})</option>
        </select>
        <span className="gw-label">Buscar:</span>
        <input className="gw-input w-[180px]! flex-none" value={texto} onChange={(e) => setTexto(e.target.value)} />
        <button type="button" className="gw-btn" onClick={cargar} disabled={cargando}>
          <RefreshCw size={14} /> {cargando ? 'Cargando…' : 'Actualizar'}
        </button>
        <button type="button" className="gw-btn" disabled={!filas.length} onClick={() => descargarCsv(empresa ? 'clientes-empresa-web.csv' : 'clientes-web.csv', cols.map((c) => c.label), filas.map((r) => cols.map((c) => c.value(r))))}>
          <FileDown size={14} /> Exportar CSV
        </button>
      </div>
      <WebError error={error} />
      <Nota>
        {empresa
          ? 'Tarifa, descuentos, precios fijos y crédito salen de la ficha del cliente (pestaña Tarifas) y aquí solo se consultan. Cuando se sincronice con la web, los precios saldrán de esa ficha.'
          : 'Clientes registrados en la tienda online y su cliente del ERP (por id web enlazado, email o teléfono).'}
      </Nota>
      <Tabla rows={filas} cols={cols} rowKey={(f) => f.clave} sel={sel} onSel={setSel} vacio={webs ? 'Sin clientes.' : 'Cargando…'} onOpen={(f) => f.erp && navigate(`/clientes/${encodeURIComponent(f.erp.codigo)}`)} />
      {msg && <div className="flex-none font-bold">{msg}</div>}
      <div className="flex flex-none items-center gap-2">
        <button type="button" className="gw-btn" disabled={!actual?.erp} onClick={() => actual?.erp && navigate(`/clientes/${encodeURIComponent(actual.erp.codigo)}`)}>
          Abrir ficha del cliente
        </button>
        <button
          type="button"
          className="gw-btn"
          disabled={!actual?.web || actual.via === 'enlazado'}
          title="Guarda el id del cliente web en la ficha del cliente del ERP (no cambia nada en la web)"
          onClick={() => {
            if (!actual?.web) return
            if (actual.erp && confirm(`¿Enlazar el cliente web ${actual.web.id} con ${actual.erp.codigo} ${actual.erp.nombre}?`)) guardarEnlace(actual.web, actual.erp.codigo)
            else if (!actual.erp) setEnlazando(actual.web)
          }}
        >
          <Link2 size={14} /> {actual?.erp && actual.via !== 'enlazado' ? 'Confirmar enlace' : 'Enlazar con cliente del ERP'}
        </button>
        <button type="button" className="gw-btn" disabled={!actual?.web} onClick={() => actual?.web && setEnlazando(actual.web)}>
          Enlazar con otro…
        </button>
        <button type="button" className="gw-btn ml-auto" onClick={() => navigate('/')}>
          <DoorOpen size={14} /> Salir
        </button>
      </div>
      {enlazando && (
        <GwLookupDialog<{ codigo: string; nombre: string; email: string | null }>
          title={`Cliente del ERP para el cliente web ${enlazando.id} (${enlazando.email})`}
          table="cliente"
          columns={[
            { key: 'codigo', label: 'Código', width: 90 },
            { key: 'nombre', label: 'Nombre' },
            { key: 'email', label: 'Email', width: 200 },
          ]}
          searchColumns={['codigo', 'nombre', 'email']}
          orderBy="nombre"
          keyColumn="codigo"
          onClose={() => setEnlazando(null)}
          onPick={(r) => guardarEnlace(enlazando, r.codigo)}
        />
      )}
    </div>
  )
}
