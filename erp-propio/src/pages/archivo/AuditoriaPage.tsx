// Archivo → Auditoría (Luis, 30/10/2026): quién cambió qué y cuándo, entradas y salidas del
// programa, contraseñas fallidas y consultas de la propia auditoría. Solo super administradores
// (Luis, David y Rober); para el resto la opción sale apagada y la base de datos tampoco les deja
// leerla. Se guarda 5 años y no se puede modificar ni borrar. Cada consulta queda registrada.
// Diseño del boceto de Luis: cabecera fija, una línea por campo cambiado y detalle a la derecha.
// «🔔 Avisos»: borrados, precios por debajo del coste, cambios de permisos, contraseñas fallidas…
// Datos: fn_auditoria_consultar y fn_auditoria_avisos (migración 20261030_auditoria_accesos_avisos).

import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { GwDate, GwInput, GwSelect } from '../../components/gw'
import { GwOperativa } from '../../components/gw/GwOperativa'
import { supabase } from '../../lib/supabase'
import { usePermisos } from '../../lib/PermisosContext'
import { DetalleAuditoria, TablaAuditoria, exportarExcel, haceDias, hoy, imprimirAuditoria, pantalla, type Fila } from './auditoriaComun'

const POR_PAGINA = 200

export function AuditoriaPage() {
  const { superAdmin, cargando } = usePermisos()
  const [params, setParams] = useSearchParams()
  const [desde, setDesde] = useState(haceDias(7))
  const [hasta, setHasta] = useState(hoy())
  const [empleado, setEmpleado] = useState('')
  const [tabla, setTabla] = useState('')
  const [modifico, setModifico] = useState('')
  const [texto, setTexto] = useState('')
  const [empleados, setEmpleados] = useState<{ codigo: string; nombre: string; numero_operario: string | null }[]>([])
  const [tablas, setTablas] = useState<string[]>([])
  const [filas, setFilas] = useState<Fila[]>([])
  const [total, setTotal] = useState<number | null>(null)
  const [sel, setSel] = useState<Fila | null>(null)
  const [buscando, setBuscando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ayuda, setAyuda] = useState(false)
  const [modoAvisos, setModoAvisos] = useState(params.get('avisos') === '1')
  const [avisosPendientes, setAvisosPendientes] = useState(0)

  useEffect(() => {
    if (!superAdmin) return
    supabase
      .from('empleado')
      .select('codigo, nombre, numero_operario')
      .order('nombre')
      .then(({ data }) => setEmpleados((data ?? []) as typeof empleados))
    supabase
      .rpc('fn_auditoria_tablas')
      .then(({ data }) => setTablas(['acceso', ...((data as string[]) ?? [])].sort((a, b) => pantalla(a).localeCompare(pantalla(b), 'es'))))
    supabase.rpc('fn_auditoria_avisos', { p_dias: 30 }).then(({ data }) => setAvisosPendientes(Number((data as { pendientes?: number })?.pendientes ?? 0)))
  }, [superAdmin])

  const buscar = async (mas = false) => {
    setBuscando(true)
    setError(null)
    setModoAvisos(false)
    if (params.has('avisos')) setParams({}, { replace: true })
    const { data, error: e } = await supabase.rpc('fn_auditoria_consultar', {
      p_desde: desde,
      p_hasta: hasta,
      p_empleado: empleado || null,
      p_tabla: tabla || null,
      p_operacion: null,
      p_texto: texto || null,
      p_limite: POR_PAGINA,
      p_desplazamiento: mas ? filas.length : 0,
      p_modifico: modifico === '' ? null : modifico === 'si',
    })
    setBuscando(false)
    if (e) return setError(e.message)
    const r = data as { total: number; filas: Fila[] }
    setTotal(r.total)
    setFilas((prev) => (mas ? [...prev, ...r.filas] : r.filas))
    if (!mas) setSel(r.filas[0] ?? null)
  }

  const verAvisos = async () => {
    setBuscando(true)
    setError(null)
    const { data, error: e } = await supabase.rpc('fn_auditoria_avisos', { p_dias: 30 })
    setBuscando(false)
    if (e) return setError(e.message)
    const r = data as { pendientes: number; lista: Fila[] }
    setModoAvisos(true)
    setFilas(r.lista)
    setTotal(r.lista.length)
    setSel(r.lista[0] ?? null)
    setAvisosPendientes(0)
    void supabase.rpc('fn_auditoria_avisos_vistos')
    window.dispatchEvent(new Event('erp:avisos-auditoria-vistos'))
  }

  // Al entrar: los avisos si se viene del aviso rojo; si no, los últimos 7 días.
  useEffect(() => {
    if (!superAdmin) return
    if (modoAvisos) void verAvisos()
    else void buscar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [superAdmin])

  if (cargando) return <div className="p-3 text-[13px]">Comprobando permisos…</div>
  if (!superAdmin) return <div className="p-3 text-[13px] font-bold text-[#c42b1c]">La auditoría solo la pueden ver los super administradores.</div>

  const titulo = modoAvisos
    ? 'Avisos de la auditoría (últimos 30 días)'
    : `Auditoría del ${desde.split('-').reverse().join('/')} al ${hasta.split('-').reverse().join('/')}`

  return (
    <div className="flex w-[1500px] max-w-full flex-col gap-2 text-[13px]">
      <div className="flex flex-wrap items-end gap-2.5 border-b border-[#c8c8c8] bg-[#f7f7f7] p-2">
        <label className="flex flex-col">
          <span className="gw-label">Desde</span>
          <GwDate value={desde} onChange={(v) => setDesde(v ?? hoy())} style={{ width: 105 }} />
        </label>
        <label className="flex flex-col">
          <span className="gw-label">Hasta</span>
          <GwDate value={hasta} onChange={(v) => setHasta(v ?? hoy())} style={{ width: 105 }} />
        </label>
        <label className="flex flex-col">
          <span className="gw-label">Empleado</span>
          <GwSelect className="w-[190px]" value={empleado} onChange={(e) => setEmpleado(e.target.value)}>
            <option value="">Todos</option>
            {empleados.map((e) => (
              <option key={e.codigo} value={e.codigo}>
                {e.numero_operario ?? e.codigo} · {e.nombre}
              </option>
            ))}
          </GwSelect>
        </label>
        <label className="flex flex-col">
          <span className="gw-label">Pantalla</span>
          <GwSelect className="w-[220px]" value={tabla} onChange={(e) => setTabla(e.target.value)}>
            <option value="">Todas</option>
            {tablas.map((t) => (
              <option key={t} value={t}>
                {pantalla(t)}
              </option>
            ))}
          </GwSelect>
        </label>
        <label className="flex flex-col">
          <span className="gw-label">¿Hubo modificación?</span>
          <GwSelect className="w-[200px]" value={modifico} onChange={(e) => setModifico(e.target.value)}>
            <option value="">Todo</option>
            <option value="si">Sí (altas, cambios, bajas)</option>
            <option value="no">No (entradas, consultas…)</option>
          </GwSelect>
        </label>
        <label className="flex flex-col">
          <span className="gw-label">Buscar (nº, código, nombre o valor)</span>
          <GwInput className="w-[190px]" value={texto} onChange={(e) => setTexto(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void buscar()} />
        </label>
        <button type="button" className="gw-btn h-[28px] px-4 font-bold" disabled={buscando} onClick={() => void buscar()}>
          {buscando ? 'Buscando…' : 'Buscar'}
        </button>
        <button
          type="button"
          className={`gw-btn h-[28px] font-bold ${avisosPendientes ? 'text-[#c42b1c]' : ''}`}
          disabled={buscando}
          onClick={() => void verAvisos()}
          title="Borrados, precios por debajo del coste, cambios de permisos, contraseñas fallidas… (últimos 30 días)"
        >
          🔔 Avisos{avisosPendientes ? ` (${avisosPendientes} nuevos)` : ''}
        </button>
        <span className="flex-1" />
        <button type="button" className="gw-btn h-[28px]" disabled={!filas.length} onClick={() => exportarExcel(filas, 'auditoria')}>
          📊 Excel
        </button>
        <button type="button" className="gw-btn h-[28px]" disabled={!filas.length} onClick={() => imprimirAuditoria(filas, titulo)}>
          🖨 Imprimir / PDF
        </button>
        <button type="button" className="gw-btn h-[28px]" onClick={() => setAyuda((a) => !a)}>
          Operativa
        </button>
      </div>

      {ayuda && (
        <div className="border border-[var(--gw-border)] bg-white p-2">
          <GwOperativa
            bloques={[
              {
                titulo: 'Consultar la auditoría',
                pasos: [
                  'Elige las fechas y, si quieres, el empleado, la pantalla, si hubo modificación o un nº / código / nombre / valor.',
                  'Pulsa Buscar (o Intro en el cuadro de buscar). Al bajar por la lista, los títulos se quedan arriba.',
                  'Cada cambio sale en una línea por campo: «Campo modificado» y su valor de antes (tachado, en rojo) y el de ahora (en verde).',
                  'Pulsa una línea: a la derecha sale todo el apunte, con la conexión y el equipo desde el que se hizo.',
                  '📊 Excel descarga la lista; 🖨 Imprimir / PDF la saca en papel o en PDF («Guardar como PDF»).',
                ],
              },
              {
                titulo: '🔔 Avisos',
                pasos: [
                  'Lo que conviene revisar de los últimos 30 días: borrados, precios por debajo del coste, cambios de permisos, grupos, super administradores o periodos, contraseñas incorrectas e intentos fuera de horario.',
                  'Cuando hay avisos nuevos, sale arriba un aviso rojo en todo el programa (solo a los super administradores). Al abrirlos, dejan de ser nuevos.',
                ],
              },
              {
                titulo: 'Cómo se lee',
                notas: [
                  'Tipo clave acceso: el grupo con el que entra el empleado (👑 Super admin, Administrador, Dependiente…).',
                  'Registro utilizado: el nº del documento o el código de la ficha, y su nombre.',
                  '¿Modificó?: Sí en altas, cambios y bajas; No en entradas, salidas, contraseñas incorrectas y consultas de la auditoría.',
                  '«Sistema»: lo hizo el propio programa o la web, no una persona.',
                  'Desde cada ficha (cliente, pedido, artículo…), el botón «🕘 Historial» de la ventana enseña solo los cambios de esa ficha.',
                ],
              },
              {
                titulo: 'Bueno es saber',
                notas: [
                  'Mirar una ficha no se apunta; sí las entradas y salidas del programa y las contraseñas incorrectas.',
                  'Nadie puede modificar ni borrar la auditoría, tampoco un super administrador. Se guarda 5 años.',
                  'Solo la ven los super administradores (Luis, David y Rober). Cada consulta queda también apuntada.',
                  'El aviso legal a los empleados, quién lo ha aceptado o denegado y los documentos están en Archivo → Textos legales.',
                ],
              },
            ]}
          />
        </div>
      )}
      {error && <div className="font-bold text-[#c42b1c]">{error}</div>}

      <div className="flex items-center gap-3 text-[12px] text-[#555]">
        <b className="text-[13px] text-[#1d3a8a]">{modoAvisos ? '🔔 Avisos de los últimos 30 días' : 'REGISTROS AUDITORÍA'}</b>
        {total == null ? '' : `${total} apunte(s)${filas.length < total ? ` · se ven ${filas.length}` : ''}`}
      </div>
      <div className="flex min-h-0 gap-0">
        <div className="min-w-0 flex-1">
          <TablaAuditoria filas={filas} sel={sel} onSel={setSel} conMotivo={modoAvisos} className="h-[58vh]" />
          {!modoAvisos && total != null && filas.length < total && (
            <button type="button" className="gw-btn mt-1" disabled={buscando} onClick={() => void buscar(true)}>
              Ver más
            </button>
          )}
        </div>
        <div className="h-[58vh] w-[340px] flex-none overflow-auto border border-l-2 border-[var(--gw-border)] border-l-[#1d3a8a] bg-white">
          <DetalleAuditoria fila={sel} />
        </div>
      </div>
    </div>
  )
}
