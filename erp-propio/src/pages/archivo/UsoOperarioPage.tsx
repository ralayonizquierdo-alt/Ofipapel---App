// Archivo → Uso por Operario (Luis, 01/11/2026; solo super administradores): por empleado y día, la
// hora de entrada y salida, los minutos de uso real (teclado o ratón), en qué área, cuánto en
// teletrabajo, cuántas pantallas abrió y qué sacó fuera (descargas e impresiones). Pulsando un día se
// ve el detalle minuto a minuto. En «Redes de las tiendas» se dan de alta las conexiones propias: lo
// que no entra por ellas es teletrabajo (remoto). Datos: fn_uso_informe, fn_uso_detalle, red_tienda.

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { usePermisos } from '../../lib/PermisosContext'
import { GwField, GwGroup, GwInput, GwSelect, GwTabs } from '../../components/gw'
import { GwOperativa } from '../../components/gw/GwOperativa'

interface FilaUso {
  empleado: string
  nombre: string
  numero?: string
  dia: string
  entrada?: string
  salida?: string
  primera?: string
  ultima?: string
  minutos: number
  minutos_remoto: number
  por_area?: Record<string, number>
  pantallas: number
  salidas_datos: number
  remoto?: boolean
  incidencias: number
}

interface Evento {
  hora: string
  operacion: string
  area?: string
  ruta?: string
  nombre?: string
  detalle?: string
  ip?: string
  remoto?: boolean
}

interface Red {
  id: number
  ip: string
  nombre: string
  tienda_codigo: string | null
  creado_en: string
}

const hora = (v?: string) => (v ? new Date(v).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : '')
const hm = (min: number) => (min ? `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min` : '—')
const fechaCorta = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('es-ES', { weekday: 'short', day: '2-digit', month: '2-digit' })
const haceDias = (n: number) => {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toLocaleDateString('sv-SE')
}

const OPERACION: Record<string, string> = {
  ENTRADA: '🔓 Entrada',
  SALIDA: '🔒 Salida',
  PANTALLA: '🪟 Pantalla',
  EXPORTA: '📤 Descarga',
  IMPRIME: '🖨️ Impresión',
  FALLO_CLAVE: '🔑 Clave incorrecta',
  FUERA_HORARIO: '🕐 Fuera de horario',
  REMOTO_DENEGADO: '🏠 Remoto sin permiso',
  USO_RARO: '⏱️ Uso fuera de lo normal',
}
const AREA: Record<string, string> = { contabilidad: 'Contabilidad', gestion: 'Gestión', web: 'Web', avatar: 'Avatar' }

export function UsoOperarioPage() {
  const { superAdmin, cargando } = usePermisos()
  const [tab, setTab] = useState('uso')
  if (cargando) return <div className="p-3 text-[13px]">Cargando…</div>
  if (!superAdmin) return <div className="p-3 text-[13px]">Solo los super administradores pueden ver el uso del programa.</div>
  return (
    <div className="p-2">
      <GwTabs
        rows={[
          [
            { key: 'uso', label: 'Uso por operario' },
            { key: 'redes', label: 'Redes de las tiendas' },
            { key: 'operativa', label: 'Operativa' },
          ],
        ]}
        active={tab}
        onChange={setTab}
      >
        <div className="p-2">
          {tab === 'uso' && <Uso />}
          {tab === 'redes' && <Redes />}
          {tab === 'operativa' && <Operativa />}
        </div>
      </GwTabs>
    </div>
  )
}

function Uso() {
  const [desde, setDesde] = useState(haceDias(6))
  const [hasta, setHasta] = useState(haceDias(0))
  const [empleado, setEmpleado] = useState('')
  const [area, setArea] = useState('')
  const [filas, setFilas] = useState<FilaUso[]>([])
  const [empleados, setEmpleados] = useState<{ codigo: string; nombre: string }[]>([])
  const [error, setError] = useState<string | null>(null)
  const [cargandoDatos, setCargandoDatos] = useState(false)
  const [detalle, setDetalle] = useState<{ fila: FilaUso; eventos: Evento[] } | null>(null)

  useEffect(() => {
    void supabase
      .from('empleado')
      .select('codigo, nombre')
      .not('auth_user_id', 'is', null)
      .order('nombre')
      .then(({ data }) => setEmpleados((data ?? []) as { codigo: string; nombre: string }[]))
  }, [])

  const cargar = useCallback(async () => {
    setCargandoDatos(true)
    setError(null)
    const { data, error: e } = await supabase.rpc('fn_uso_informe', { p_desde: desde, p_hasta: hasta, p_empleado: empleado || null, p_area: area || null })
    setCargandoDatos(false)
    if (e) return setError(e.message)
    setFilas((data ?? []) as FilaUso[])
  }, [desde, hasta, empleado, area])

  useEffect(() => {
    void cargar()
  }, [cargar])

  async function verDetalle(f: FilaUso) {
    const { data } = await supabase.rpc('fn_uso_detalle', { p_empleado: f.empleado, p_dia: f.dia })
    setDetalle({ fila: f, eventos: (data ?? []) as Evento[] })
  }

  function exportar() {
    const cab = [
      'Día',
      'Nº',
      'Empleado',
      'Entrada',
      'Salida',
      'Primera actividad',
      'Última actividad',
      'Minutos activos',
      'Minutos en remoto',
      'Pantallas',
      'Descargas/impresiones',
      'Incidencias',
    ]
    const lineas = filas.map((f) =>
      [
        f.dia,
        f.numero ?? '',
        f.nombre,
        hora(f.entrada),
        hora(f.salida),
        hora(f.primera),
        hora(f.ultima),
        f.minutos,
        f.minutos_remoto,
        f.pantallas,
        f.salidas_datos,
        f.incidencias,
      ]
        .map((x) => `"${String(x).replace(/"/g, '""')}"`)
        .join(';'),
    )
    const blob = new Blob(['﻿' + [cab.join(';'), ...lineas].join('\r\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `uso-operarios-${desde}-${hasta}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const total = filas.reduce((s, f) => s + f.minutos, 0)

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-2">
        <GwField label="Desde">
          <GwInput type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
        </GwField>
        <GwField label="Hasta">
          <GwInput type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
        </GwField>
        <GwField label="Empleado">
          <GwSelect value={empleado} onChange={(e) => setEmpleado(e.target.value)}>
            <option value="">Todos</option>
            {empleados.map((e) => (
              <option key={e.codigo} value={e.codigo}>
                {e.nombre}
              </option>
            ))}
          </GwSelect>
        </GwField>
        <GwField label="Área">
          <GwSelect value={area} onChange={(e) => setArea(e.target.value)}>
            <option value="">Todas</option>
            <option value="contabilidad">Contabilidad</option>
            <option value="gestion">Gestión</option>
            <option value="web">Web</option>
          </GwSelect>
        </GwField>
        <button type="button" className="gw-btn" onClick={() => void cargar()} disabled={cargandoDatos}>
          {cargandoDatos ? 'Mirando…' : 'Actualizar'}
        </button>
        <button type="button" className="gw-btn" onClick={exportar} disabled={!filas.length}>
          Excel (CSV)
        </button>
        <span className="ml-auto text-[12px] text-[#555]">Total: {hm(total)}</span>
      </div>
      {error && <div className="text-[12px] text-[#c42b1c]">{error}</div>}
      <div className="max-h-[60vh] overflow-auto border border-[var(--gw-border)] bg-white">
        <table className="gw-grid w-full">
          <thead className="sticky top-0">
            <tr>
              <th>Día</th>
              <th>Empleado</th>
              <th>Entrada</th>
              <th>Salida</th>
              <th>Uso real</th>
              <th>Por área</th>
              <th>Remoto</th>
              <th>Pantallas</th>
              <th>Descargas / impr.</th>
              <th>Incidencias</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr
                key={`${f.empleado}-${f.dia}`}
                className="cursor-pointer hover:bg-[#e8f0fb]"
                onClick={() => void verDetalle(f)}
                title="Ver el detalle del día"
              >
                <td>{fechaCorta(f.dia)}</td>
                <td>
                  {f.numero ? `${f.numero} · ` : ''}
                  {f.nombre}
                </td>
                <td>{hora(f.entrada ?? f.primera)}</td>
                <td>{hora(f.salida ?? f.ultima)}</td>
                <td className="text-right">{hm(f.minutos)}</td>
                <td className="text-[11px]">
                  {Object.entries(f.por_area ?? {})
                    .map(([k, v]) => `${AREA[k.split(' ')[0]] ?? k}${k.includes('remoto') ? ' (remoto)' : ''} ${hm(v)}`)
                    .join(' · ')}
                </td>
                <td className="text-right">{f.minutos_remoto ? `🏠 ${hm(f.minutos_remoto)}` : f.remoto ? '🏠' : ''}</td>
                <td className="text-right">{f.pantallas || ''}</td>
                <td className="text-right">{f.salidas_datos ? `📤 ${f.salidas_datos}` : ''}</td>
                <td className="text-right">{f.incidencias ? <b className="text-[#c42b1c]">⚠ {f.incidencias}</b> : ''}</td>
              </tr>
            ))}
            {!filas.length && (
              <tr>
                <td colSpan={10} className="p-3 text-center text-[#777]">
                  Sin uso en esas fechas.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {detalle && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/25 pt-12" onClick={() => setDetalle(null)}>
          <div
            className="flex max-h-[80vh] w-[760px] max-w-[95vw] flex-col border border-[#6f6f6f] bg-[var(--gw-face)] shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center bg-[#1d3a8a] px-2 py-1 text-[13px] font-bold text-white">
              {detalle.fila.nombre} · {fechaCorta(detalle.fila.dia)} · uso real {hm(detalle.fila.minutos)}
              <button type="button" className="ml-auto px-1" onClick={() => setDetalle(null)} aria-label="Cerrar">
                ✕
              </button>
            </div>
            <div className="overflow-auto bg-white">
              <table className="gw-grid w-full">
                <thead className="sticky top-0">
                  <tr>
                    <th>Hora</th>
                    <th>Qué</th>
                    <th>Área</th>
                    <th>Pantalla / detalle</th>
                    <th>Desde</th>
                  </tr>
                </thead>
                <tbody>
                  {detalle.eventos.map((e, i) => (
                    <tr key={i}>
                      <td>{hora(e.hora)}</td>
                      <td>{OPERACION[e.operacion] ?? e.operacion}</td>
                      <td>{e.area ? (AREA[e.area] ?? e.area) : ''}</td>
                      <td>
                        {e.nombre ?? e.ruta ?? ''}
                        {e.detalle ? <span className="text-[#555]"> · {e.detalle}</span> : ''}
                      </td>
                      <td className="text-[11px]">{e.remoto ? `🏠 remoto ${e.ip ?? ''}` : e.remoto === false ? 'Tienda' : (e.ip ?? '')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Redes() {
  const [redes, setRedes] = useState<Red[]>([])
  const [tiendas, setTiendas] = useState<{ codigo: string; descripcion: string }[]>([])
  const [aqui, setAqui] = useState<{ ip: string | null; red: string | null } | null>(null)
  const [nombre, setNombre] = useState('')
  const [tienda, setTienda] = useState('')
  const [controlActivo, setControlActivo] = useState(false)
  const [msg, setMsg] = useState<{ texto: string; error: boolean } | null>(null)

  const cargar = useCallback(async () => {
    const [r, t, c, p] = await Promise.all([
      supabase.from('red_tienda').select('*').order('nombre'),
      supabase.from('tienda_terminal').select('codigo, descripcion').order('codigo'),
      supabase.rpc('fn_mi_control'),
      supabase.from('parametro').select('valor').eq('clave', 'acceso.control_remoto').maybeSingle(),
    ])
    setRedes((r.data ?? []) as Red[])
    setTiendas((t.data ?? []) as { codigo: string; descripcion: string }[])
    setAqui((c.data as { ip: string | null; red: string | null }) ?? null)
    setControlActivo(p.data?.valor === true)
  }, [])

  useEffect(() => {
    void cargar()
  }, [cargar])

  async function guardarAqui() {
    setMsg(null)
    const { error } = await supabase.rpc('fn_red_guardar', { p_ip: aqui?.ip ?? '', p_nombre: nombre, p_tienda: tienda || null })
    if (error) return setMsg({ texto: error.message, error: true })
    setNombre('')
    setMsg({ texto: 'Red guardada.', error: false })
    void cargar()
  }

  async function quitar(r: Red) {
    if (!confirm(`¿Quitar la red «${r.nombre}» (${r.ip})? Quien entre desde ella pasará a contar como remoto.`)) return
    const { error } = await supabase.rpc('fn_red_borrar', { p_id: r.id })
    if (error) return setMsg({ texto: error.message, error: true })
    void cargar()
  }

  async function cambiarControl(activar: boolean) {
    if (activar && !redes.length) return setMsg({ texto: 'Antes da de alta al menos la red de una tienda: si no, todos contarían como remotos.', error: true })
    if (
      activar &&
      !confirm(
        'Desde ahora, quien entre desde fuera de las tiendas sin permiso de teletrabajo NO podrá trabajar (también administradores).\n\n¿Has dado ya el permiso de teletrabajo a quien lo necesita (Archivo → Parámetros → Control de Accesos → Teletrabajo)?',
      )
    )
      return
    const { error } = await supabase.from('parametro').upsert({ clave: 'acceso.control_remoto', valor: activar })
    if (error) return setMsg({ texto: `No se pudo cambiar: ${error.message}`, error: true })
    setControlActivo(activar)
    setMsg({ texto: activar ? 'Control de teletrabajo activado.' : 'Control de teletrabajo desactivado: solo se apunta, no se bloquea.', error: false })
  }

  return (
    <div className="flex flex-col gap-3">
      <GwGroup title="Esta conexión">
        <div className="flex flex-col gap-1.5 text-[13px]">
          <div>
            IP de aquí: <b>{aqui?.ip ?? 'no se sabe'}</b> {aqui?.red ? `· es la red «${aqui.red}»` : redes.length ? '· no es de ninguna tienda (remoto)' : ''}
          </div>
          {!aqui?.red && aqui?.ip && (
            <div className="flex flex-wrap items-end gap-2">
              <GwField label="Nombre">
                <GwInput value={nombre} placeholder="Tienda Arguineguín, Oficina…" onChange={(e) => setNombre(e.target.value)} />
              </GwField>
              <GwField label="Tienda">
                <GwSelect value={tienda} onChange={(e) => setTienda(e.target.value)}>
                  <option value="">—</option>
                  {tiendas.map((t) => (
                    <option key={t.codigo} value={t.codigo}>
                      {t.codigo} · {t.descripcion}
                    </option>
                  ))}
                </GwSelect>
              </GwField>
              <button type="button" className="gw-btn" onClick={() => void guardarAqui()}>
                Esta es la red de aquí
              </button>
            </div>
          )}
        </div>
      </GwGroup>
      <GwGroup title="Redes de las tiendas y oficinas">
        <table className="gw-grid w-full bg-white">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>IP</th>
              <th>Tienda</th>
              <th>Alta</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {redes.map((r) => (
              <tr key={r.id}>
                <td>{r.nombre}</td>
                <td>{r.ip}</td>
                <td>{r.tienda_codigo ?? ''}</td>
                <td>{new Date(r.creado_en).toLocaleDateString('es-ES')}</td>
                <td>
                  <button type="button" className="gw-btn" onClick={() => void quitar(r)}>
                    Quitar
                  </button>
                </td>
              </tr>
            ))}
            {!redes.length && (
              <tr>
                <td colSpan={5} className="p-2 text-center text-[#777]">
                  Ninguna todavía. Entra desde cada tienda y pulsa «Esta es la red de aquí».
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </GwGroup>
      <GwGroup title="Control de teletrabajo">
        <div className="flex flex-col gap-1.5 text-[13px]">
          <div>
            Ahora: <b>{controlActivo ? '🔒 Activado: quien entra desde fuera sin permiso no puede trabajar' : '👁 Solo se apunta (no se bloquea)'}</b>
          </div>
          <div className="flex gap-2">
            <button type="button" className="gw-btn" onClick={() => void cambiarControl(!controlActivo)}>
              {controlActivo ? 'Desactivar' : 'Activar'}
            </button>
          </div>
          <div className="text-[12px] text-[#555]">
            Quién puede teletrabajar y en qué horario se decide en Archivo → Parámetros → Control de Accesos → Teletrabajo. Vale para todos, también los
            administradores.
          </div>
        </div>
      </GwGroup>
      {msg && <div className={`text-[12px] ${msg.error ? 'text-[#c42b1c]' : 'text-[#1a7f37]'}`}>{msg.texto}</div>}
    </div>
  )
}

function Operativa() {
  return (
    <GwOperativa
      bloques={[
        {
          titulo: 'Ver el uso de cada operario',
          pasos: [
            'Elige las fechas y, si quieres, un empleado y un área (Contabilidad, Gestión, Web). Pulsa Actualizar.',
            'Cada fila es un empleado y un día: entrada, salida, minutos de uso real, en qué área, cuánto en teletrabajo, pantallas abiertas, descargas e impresiones e incidencias.',
            'Pulsa una fila para ver el detalle del día, hora a hora.',
            '«Excel (CSV)» saca la tabla.',
          ],
          notas: [
            'Uso real = minutos en los que se tocó el teclado o el ratón. Tener el programa abierto sin tocarlo no cuenta.',
            'No se graba lo que se escribe ni la pantalla: solo qué pantalla se abre, cuándo y qué se descarga o imprime.',
            'Se aplica a todos, también a administradores y super administradores.',
          ],
        },
        {
          titulo: 'Redes de las tiendas y teletrabajo',
          pasos: [
            'Entra en el programa desde cada tienda y desde la oficina, abre esta pestaña y pulsa «Esta es la red de aquí» (ponle nombre).',
            'En Archivo → Parámetros → Control de Accesos → Teletrabajo, marca quién puede trabajar desde fuera y, si quieres, su horario de teletrabajo.',
            'Cuando estén todas las redes y los permisos, pulsa «Activar» en «Control de teletrabajo».',
          ],
          notas: [
            'Mientras no se active, solo se apunta quién entra desde fuera; no se bloquea a nadie.',
            'Si una tienda cambia de compañía de internet, cambia su IP: entra desde allí y vuelve a pulsar «Esta es la red de aquí».',
          ],
        },
        {
          titulo: 'Avisos (globo 🛡️)',
          notas: [
            'Claves incorrectas, fuera de horario, entradas remotas sin permiso, uso de madrugada o en domingo, más de 10 horas en un día y datos de Contabilidad descargados o impresos salen en el globo 🛡️ de arriba.',
            'Antes de empezar a registrar, cada empleado acepta el aviso legal al entrar (Archivo → Textos legales).',
          ],
        },
      ]}
    />
  )
}
