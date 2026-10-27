import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { DoorOpen, FileDown, RefreshCw } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { descargarCsv } from '../../lib/webMapeo'
import { fechaHoraEs, Nota, Tabla, WebError, type Col } from './comun'

interface Registro {
  id: number
  creado_en: string
  usuario_email: string | null
  origen: string
  operacion: string
  recurso: string | null
  parametros: Record<string, unknown> | null
  resultado: string
  mensaje: string | null
  registros: number | null
  duracion_ms: number | null
  web_pedido_id: number | null
  pedido_tienda_codigo: string | null
  pedido_numero: number | null
}

/** Web → Registro de Sincronización: cada llamada a la web y cada importación en el ERP. */
export function RegistroSincronizacionPage() {
  const navigate = useNavigate()
  const [filas, setFilas] = useState<Registro[] | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [resultado, setResultado] = useState('')
  const [origen, setOrigen] = useState('')
  const [sel, setSel] = useState(0)

  const cargar = useCallback(async () => {
    setError(null)
    let q = supabase.from('web_sincronizacion_log').select('*').order('id', { ascending: false }).limit(1000)
    if (resultado) q = q.eq('resultado', resultado)
    if (origen) q = q.eq('origen', origen)
    const { data, error: e } = await q
    if (e) setError(new Error(e.message))
    setFilas((data ?? []) as Registro[])
  }, [resultado, origen])
  useEffect(() => {
    cargar()
  }, [cargar])

  const cols: Col<Registro>[] = useMemo(
    () => [
      { key: 'fecha', label: 'Fecha y hora', width: 125, value: (r) => r.creado_en, render: (r) => fechaHoraEs(new Date(r.creado_en).toLocaleString('sv-SE')) },
      { key: 'usr', label: 'Usuario', width: 160, value: (r) => r.usuario_email },
      { key: 'origen', label: 'Origen', width: 70, value: (r) => (r.origen === 'edge' ? 'Web' : 'ERP') },
      { key: 'op', label: 'Operación', width: 120, value: (r) => r.operacion },
      { key: 'rec', label: 'Recurso', width: 140, value: (r) => r.recurso },
      { key: 'res', label: 'Resultado', width: 75, value: (r) => r.resultado, cellStyle: (r) => (r.resultado === 'error' ? { color: '#c42b1c', fontWeight: 700 } : r.resultado === 'aviso' ? { color: '#b05a00' } : { color: '#127a12' }) },
      { key: 'n', label: 'Registros', width: 70, align: 'right', value: (r) => r.registros },
      { key: 'ms', label: 'ms', width: 60, align: 'right', value: (r) => r.duracion_ms },
      { key: 'ped', label: 'Pedido', width: 140, value: (r) => (r.web_pedido_id ? `web ${r.web_pedido_id}${r.pedido_numero ? ` → ${r.pedido_tienda_codigo}/${r.pedido_numero}` : ''}` : '') },
      { key: 'msg', label: 'Mensaje', width: 360, value: (r) => r.mensaje ?? (r.parametros ? JSON.stringify(r.parametros) : '') },
    ],
    [],
  )
  const actual = (filas ?? [])[sel]

  return (
    <div className="flex h-full min-h-0 flex-col gap-1.5 text-[13px]">
      <div className="flex flex-none flex-wrap items-center gap-2">
        <span className="gw-label">Resultado:</span>
        <select className="gw-input w-[110px]! flex-none" value={resultado} onChange={(e) => setResultado(e.target.value)}>
          <option value="">Todos</option>
          <option value="ok">ok</option>
          <option value="aviso">aviso</option>
          <option value="error">error</option>
        </select>
        <span className="gw-label">Origen:</span>
        <select className="gw-input w-[150px]! flex-none" value={origen} onChange={(e) => setOrigen(e.target.value)}>
          <option value="">Todos</option>
          <option value="edge">Lecturas de la web</option>
          <option value="erp">Importaciones ERP</option>
        </select>
        <button type="button" className="gw-btn" onClick={cargar}>
          <RefreshCw size={14} /> Actualizar
        </button>
        <button type="button" className="gw-btn" disabled={!filas?.length} onClick={() => descargarCsv('registro-sincronizacion-web.csv', cols.map((c) => c.label), (filas ?? []).map((r) => cols.map((c) => c.value(r))))}>
          <FileDown size={14} /> Exportar CSV
        </button>
        <Nota>Últimos 1.000 movimientos. Todas las llamadas a la web son de lectura (GET).</Nota>
      </div>
      <WebError error={error} />
      <Tabla rows={filas ?? []} cols={cols} rowKey={(r) => String(r.id)} sel={sel} onSel={setSel} vacio={filas ? 'Sin movimientos.' : 'Cargando…'} />
      {actual && (
        <div className="max-h-[80px] flex-none overflow-auto whitespace-pre-wrap break-all border border-[var(--gw-border-light)] bg-white p-1 font-mono text-[11px]">
          {actual.mensaje ?? ''} {actual.parametros ? JSON.stringify(actual.parametros) : ''}
        </div>
      )}
      <div className="flex flex-none items-center gap-2">
        <button type="button" className="gw-btn ml-auto" onClick={() => navigate('/')}>
          <DoorOpen size={14} /> Salir
        </button>
      </div>
    </div>
  )
}
