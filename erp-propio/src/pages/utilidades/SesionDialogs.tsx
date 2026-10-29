// SIN CAPTURA de GeminisWin: Utilidades → Cambio de Tienda, Cambio de Fecha, Cambio de Fecha y
// Hora y Archivo → Seleccionar Periodo. Diálogos pequeños sobre la sesión de trabajo del puesto
// (src/lib/sesionTrabajo.ts). Ajustar cuando lleguen las capturas.

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { GwDate, GwField } from '../../components/gw'
import { GwDateTime } from '../../components/gw/GwDateTime'
import { supabase } from '../../lib/supabase'
import {
  ahoraTrabajo,
  entrarPeriodoCerrado,
  elegirFecha,
  elegirFechaHora,
  elegirTienda,
  fechaTrabajo,
  isoLocal,
  restablecerFecha,
  tiendaDeTrabajo,
  useSesionTrabajo,
  volverPeriodoEnCurso,
} from '../../lib/sesionTrabajo'
import { Botones, Dialogo, Mensaje } from './comun'
import { fechaEs } from './datos'

interface Tienda {
  codigo: string
  descripcion: string | null
  almacen_codigo: string | null
}

/* ------------------------------------------------------------------ Cambio de Tienda */

export function CambioTiendaDialog({ onClose }: { onClose: () => void }) {
  const [tiendas, setTiendas] = useState<Tienda[] | null>(null)
  const [sel, setSel] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    supabase
      .from('tienda_terminal')
      .select('codigo, descripcion, almacen_codigo')
      .order('codigo')
      .then(({ data, error: e }) => {
        if (e) setError(e.message)
        const lista = (data ?? []) as Tienda[]
        setTiendas(lista)
        setSel(tiendaDeTrabajo(lista))
      })
  }, [])

  // La fila elegida, a la vista al abrir.
  useEffect(() => {
    if (tiendas) document.getElementById(`tienda-${sel}`)?.scrollIntoView({ block: 'nearest' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tiendas])

  function aceptar(codigo = sel) {
    if (!codigo) return
    elegirTienda(codigo)
    onClose()
  }

  function teclas(e: React.KeyboardEvent) {
    if (!tiendas?.length) return
    const i = tiendas.findIndex((t) => t.codigo === sel)
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const j = Math.min(tiendas.length - 1, Math.max(0, i + (e.key === 'ArrowDown' ? 1 : -1)))
      setSel(tiendas[j].codigo)
      document.getElementById(`tienda-${tiendas[j].codigo}`)?.scrollIntoView({ block: 'nearest' })
    } else if (e.key === 'Enter') aceptar()
  }

  return (
    <Dialogo titulo="Cambio de Tienda" onClose={onClose} ancho={420}>
      <span className="gw-label">Tienda / terminal con la que se trabaja en este puesto:</span>
      <div tabIndex={0} autoFocus onKeyDown={teclas} className="h-[260px] overflow-auto border border-[var(--gw-border)] bg-white outline-none focus:border-[var(--gw-select)]">
        <table className="gw-grid">
          <thead className="sticky top-0">
            <tr>
              <th className="w-[60px]">Código</th>
              <th>Descripción</th>
              <th className="w-[64px]">Almacén</th>
            </tr>
          </thead>
          <tbody>
            {tiendas?.map((t) => (
              <tr
                key={t.codigo}
                id={`tienda-${t.codigo}`}
                className={t.codigo === sel ? 'gw-selected' : ''}
                onClick={() => setSel(t.codigo)}
                onDoubleClick={() => aceptar(t.codigo)}
              >
                <td>{t.codigo}</td>
                <td className="truncate">{t.descripcion}</td>
                <td>{t.almacen_codigo}</td>
              </tr>
            ))}
            {tiendas == null && (
              <tr>
                <td colSpan={3}>Cargando…</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {error && <Mensaje texto={error} error />}
      <span className="text-[#444]">Se recuerda en este navegador. TPV, caja, pedidos y compras la proponen en los documentos nuevos.</span>
      <Botones>
        <button type="button" className="gw-btn w-[90px]" disabled={!sel} onClick={() => aceptar()}>
          Aceptar
        </button>
        <button type="button" className="gw-btn w-[90px]" onClick={onClose}>
          Cancelar
        </button>
      </Botones>
    </Dialogo>
  )
}

/* ------------------------------------------------------------------ Cambio de Fecha (y Hora) */

interface Ejercicio {
  anio: number
  descripcion: string | null
  fecha_inicio: string
  fecha_fin: string
  cerrado: boolean
  activo: boolean
}

export function CambioFechaDialog({ conHora, onClose }: { conHora: boolean; onClose: () => void }) {
  const { desfaseMs } = useSesionTrabajo()
  const [fecha, setFecha] = useState<string | null>(() => fechaTrabajo())
  const [fechaHora, setFechaHora] = useState<string | null>(() => ahoraTrabajo().toISOString())
  const [ejercicios, setEjercicios] = useState<Ejercicio[]>([])
  const [error, setError] = useState<string | null>(null)
  const [hoyReal] = useState(() => isoLocal(new Date()))

  useEffect(() => {
    supabase
      .from('ejercicio')
      .select('anio, descripcion, fecha_inicio, fecha_fin, cerrado, activo')
      .then(({ data }) => setEjercicios((data ?? []) as Ejercicio[]))
  }, [])

  const dia = conHora ? (fechaHora ? isoLocal(new Date(fechaHora)) : null) : fecha
  const cerrado = dia ? ejercicios.find((e) => dia >= e.fecha_inicio && dia <= e.fecha_fin && e.cerrado) : undefined

  function aceptar() {
    setError(null)
    if (conHora) {
      if (!fechaHora) return setError('Escribe una fecha y hora válidas.')
      elegirFechaHora(new Date(fechaHora))
    } else {
      if (!fecha) return setError('Escribe una fecha válida.')
      elegirFecha(fecha)
    }
    onClose()
  }

  return (
    <Dialogo titulo={conHora ? 'Cambio de Fecha y Hora' : 'Cambio de Fecha'} onClose={onClose} ancho={360}>
      <div className="flex items-end gap-3">
        <GwField label={conHora ? 'Fecha y hora de trabajo' : 'Fecha de trabajo'}>
          {conHora ? (
            <GwDateTime value={fechaHora} onChange={setFechaHora} autoFocus style={{ width: 150 }} />
          ) : (
            <GwDate value={fecha} onChange={setFecha} autoFocus style={{ width: 100 }} />
          )}
        </GwField>
        <span className="pb-1 text-[#444]">Hoy es {fechaEs(hoyReal)}</span>
      </div>
      <span className="text-[#444]">
        Los documentos nuevos de esta sesión (TPV, ventas, pedidos, presupuestos, compras y caja) se grabarán con esta fecha
        {conHora ? ' y hora' : ''}. Se olvida al cerrar la pestaña. VeriFactu registra siempre la fecha y hora reales.
      </span>
      {cerrado && <Mensaje texto={`Atención: la fecha cae en el ejercicio ${cerrado.anio}, que está cerrado.`} error />}
      {error && <Mensaje texto={error} error />}
      <Botones>
        <button type="button" className="gw-btn mr-auto" disabled={desfaseMs === 0} onClick={() => {
            restablecerFecha()
            onClose()
          }} title="Volver a la fecha y hora reales">
          Fecha real
        </button>
        <button type="button" className="gw-btn w-[90px]" onClick={aceptar}>
          Aceptar
        </button>
        <button type="button" className="gw-btn w-[90px]" onClick={onClose}>
          Cancelar
        </button>
      </Botones>
    </Dialogo>
  )
}

/* ------------------------------------------------------------------ Seleccionar Periodo */

/**
 * Archivo → Seleccionar Periodo. Solo salen los periodos CERRADOS: el periodo en curso es con el
 * que se trabaja siempre y no está en la lista. Abrir uno es para consultarlo (todo queda en solo
 * consulta) y lo pueden hacer solo los super administradores, escribiendo su contraseña.
 */
export function SeleccionarPeriodoDialog({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const { consulta } = useSesionTrabajo()
  const [lista, setLista] = useState<Ejercicio[] | null>(null)
  const [sel, setSel] = useState<number | null>(consulta?.anio ?? null)
  const [error, setError] = useState<string | null>(null)
  const [pidiendoClave, setPidiendoClave] = useState(false)
  const [clave, setClave] = useState('')
  const [comprobando, setComprobando] = useState(false)
  const [superAdmin, setSuperAdmin] = useState(false)

  useEffect(() => {
    supabase
      .from('ejercicio')
      .select('anio, descripcion, fecha_inicio, fecha_fin, cerrado, activo')
      .eq('cerrado', true)
      .order('fecha_inicio', { ascending: true })
      .then(({ data, error: e }) => {
        if (e) setError(e.message)
        const l = (data ?? []) as Ejercicio[]
        setLista(l)
        setSel((s) => s ?? l[l.length - 1]?.anio ?? null)
      })
    supabase.rpc('fn_es_super_administrador').then(({ data }) => setSuperAdmin(data === true))
  }, [])

  const elegido = lista?.find((x) => x.anio === sel) ?? null

  async function comprobarYEntrar() {
    if (!elegido) return
    setError(null)
    setComprobando(true)
    try {
      const { data: s } = await supabase.auth.getSession()
      const email = s.session?.user.email
      if (!email) throw new Error('No hay sesión abierta.')
      const { error: e } = await supabase.auth.signInWithPassword({ email, password: clave })
      if (e) throw new Error('Contraseña incorrecta.')
      const { data: es } = await supabase.rpc('fn_es_super_administrador')
      if (es !== true) throw new Error('Solo los super administradores pueden consultar periodos cerrados.')
      entrarPeriodoCerrado({ anio: elegido.anio, desde: elegido.fecha_inicio, hasta: elegido.fecha_fin, descripcion: elegido.descripcion })
      onClose()
      navigate('/')
    } catch (e) {
      setError((e as Error).message)
      setClave('')
    } finally {
      setComprobando(false)
    }
  }

  return (
    <Dialogo titulo="Selecciona Periodo" onClose={onClose} ancho={480}>
      <span className="gw-label">Periodos cerrados (solo consulta):</span>
      <div className="h-[200px] overflow-auto border border-[var(--gw-border)] bg-white">
        <table className="gw-grid">
          <thead className="sticky top-0">
            <tr>
              <th className="w-[70px]">Código</th>
              <th>Descripción</th>
              <th className="w-[85px]">Inicio</th>
              <th className="w-[85px]">Final</th>
            </tr>
          </thead>
          <tbody>
            {lista?.map((e) => (
              <tr
                key={e.anio}
                className={e.anio === sel ? 'gw-selected' : ''}
                onClick={() => setSel(e.anio)}
                onDoubleClick={() => {
                  setSel(e.anio)
                  setPidiendoClave(true)
                }}
              >
                <td>{String(e.anio).padStart(6, '0')}</td>
                <td className="truncate">
                  {e.descripcion}
                  {consulta?.anio === e.anio ? ' (consultando)' : ''}
                </td>
                <td>{fechaEs(e.fecha_inicio)}</td>
                <td>{fechaEs(e.fecha_fin)}</td>
              </tr>
            ))}
            {lista?.length === 0 && (
              <tr>
                <td colSpan={4}>Todavía no hay periodos cerrados.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {pidiendoClave && elegido && (
        <div className="flex flex-col gap-1 border border-[var(--gw-border)] bg-[#fff8e0] p-2">
          <span className="font-bold">
            Consultar «{elegido.descripcion ?? elegido.anio}»: contraseña de super administrador
          </span>
          <div className="flex items-center gap-1.5">
            <input
              type="password"
              autoFocus
              className="gw-input w-[200px]"
              value={clave}
              onChange={(e) => setClave(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && clave && comprobarYEntrar()}
            />
            <button type="button" className="gw-btn w-[90px]" disabled={!clave || comprobando} onClick={comprobarYEntrar}>
              {comprobando ? 'Comprobando…' : 'Entrar'}
            </button>
          </div>
        </div>
      )}
      {error && <Mensaje texto={error} error />}
      <Botones>
        {superAdmin && (
          <button
            type="button"
            className="gw-btn mr-auto"
            onClick={() => {
              onClose()
              navigate('/utilidades/ejercicios')
            }}
          >
            Periodos…
          </button>
        )}
        {consulta && (
          <button
            type="button"
            className="gw-btn"
            onClick={() => {
              volverPeriodoEnCurso()
              onClose()
            }}
          >
            Volver al periodo en curso
          </button>
        )}
        <button type="button" className="gw-btn w-[90px]" disabled={!elegido} onClick={() => setPidiendoClave(true)}>
          Aceptar
        </button>
        <button type="button" className="gw-btn w-[90px]" onClick={onClose}>
          Cancelar
        </button>
      </Botones>
    </Dialogo>
  )
}
