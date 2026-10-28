// SIN CAPTURA de GeminisWin: Utilidades → Copia de Seguridad (Hacer Copia, Testear Copia) y
// Eliminar Ficheros Temporales. Restaurar Copia queda en gris: la restauración se hace desde
// Supabase (copias diarias automáticas).
//
// La copia es un ZIP con `manifiesto.json` (fecha, usuario, filas por tabla) y un
// `tablas/<tabla>.json` por tabla, leído con los permisos del usuario, de 1000 en 1000 filas y
// ordenado por la clave primaria. Solo para administradores.

import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../../lib/AuthContext'
import { supabase } from '../../lib/supabase'
import { esPreferencia, isoLocal } from '../../lib/sesionTrabajo'
import { useEsAdministrador } from '../archivo/comun'
import { Botones, Dialogo, Mensaje } from './comun'
import { cargarTablasErp, type TablaErp } from './datos'
import { crearZip, leerZip } from './zip'

/** Tablas que no van en la copia: la carga en bruto de los DBF de GeminisWin (se puede volver a subir). */
const EXCLUIDAS = new Set(['carga_dbf'])
const PAGINA = 1000

interface Manifiesto {
  programa: string
  version: string
  creada: string
  usuario: string
  tablas: { tabla: string; filas: number; pk: string[] }[]
}

function Progreso({ valor, total }: { valor: number; total: number }) {
  const pct = total > 0 ? Math.min(100, Math.round((valor * 100) / total)) : 0
  return (
    <div className="h-[16px] border border-[var(--gw-border)] bg-white p-[1px]">
      <div className="h-full bg-[#06b025]" style={{ width: `${pct}%` }} />
    </div>
  )
}

function descargar(blob: Blob, nombre: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

async function leerTabla(t: TablaErp, cancelado: () => boolean, alAvanzar: (n: number) => void) {
  const filas: unknown[] = []
  for (let desde = 0; ; desde += PAGINA) {
    if (cancelado()) throw new Error('Copia cancelada')
    let q = supabase.from(t.tabla).select('*')
    for (const c of t.pk) q = q.order(c, { ascending: true })
    const { data, error } = await q.range(desde, desde + PAGINA - 1)
    if (error) throw new Error(`${t.tabla}: ${error.message}`)
    filas.push(...(data ?? []))
    alAvanzar(filas.length)
    if (!data || data.length < PAGINA) break
  }
  return filas
}

/* ------------------------------------------------------------------ Hacer Copia */

export function HacerCopiaDialog({ onClose }: { onClose: () => void }) {
  const admin = useEsAdministrador()
  const { session } = useAuth()
  const [tablas, setTablas] = useState<TablaErp[] | null>(null)
  const [estado, setEstado] = useState<{ tabla: string; hechas: number; filas: number } | null>(null)
  const [mensaje, setMensaje] = useState<{ texto: string; error?: boolean } | null>(null)
  const [trabajando, setTrabajando] = useState(false)
  const cancelar = useRef(false)

  useEffect(() => {
    cargarTablasErp()
      .then((t) => setTablas(t.filter((x) => !EXCLUIDAS.has(x.tabla))))
      .catch((e: Error) => setMensaje({ texto: e.message, error: true }))
  }, [])

  async function hacer() {
    if (!tablas) return
    setTrabajando(true)
    setMensaje(null)
    cancelar.current = false
    try {
      const ahora = new Date()
      const ficheros: { nombre: string; contenido: string }[] = []
      const resumen: Manifiesto['tablas'] = []
      let total = 0
      for (let i = 0; i < tablas.length; i++) {
        const t = tablas[i]
        setEstado({ tabla: t.tabla, hechas: i, filas: total })
        const filas = await leerTabla(t, () => cancelar.current, (n) => setEstado({ tabla: t.tabla, hechas: i, filas: total + n }))
        total += filas.length
        resumen.push({ tabla: t.tabla, filas: filas.length, pk: t.pk })
        ficheros.push({ nombre: `tablas/${t.tabla}.json`, contenido: JSON.stringify(filas) })
      }
      setEstado({ tabla: 'Comprimiendo…', hechas: tablas.length, filas: total })
      const manifiesto: Manifiesto = {
        programa: 'Ofipapel ERP',
        version: __APP_VERSION__,
        creada: ahora.toISOString(),
        usuario: session?.user.email ?? '',
        tablas: resumen,
      }
      const zip = await crearZip([{ nombre: 'manifiesto.json', contenido: JSON.stringify(manifiesto, null, 1) }, ...ficheros], ahora)
      const p = (n: number) => String(n).padStart(2, '0')
      const nombre = `copia-erp-${isoLocal(ahora).replaceAll('-', '')}-${p(ahora.getHours())}${p(ahora.getMinutes())}.zip`
      descargar(zip, nombre)
      setMensaje({ texto: `Copia hecha: ${tablas.length} tablas, ${total.toLocaleString('es-ES')} filas (${(zip.size / 1048576).toFixed(1)} MB) en «${nombre}».` })
    } catch (e) {
      setMensaje({ texto: (e as Error).message, error: true })
    } finally {
      setTrabajando(false)
    }
  }

  const filasEstimadas = tablas?.reduce((s, t) => s + (t.filas_estimadas ?? 0), 0) ?? 0

  return (
    <Dialogo titulo="Hacer Copia de Seguridad" onClose={() => {
        cancelar.current = true
        onClose()
      }} ancho={440}>
      {admin === false ? (
        <Mensaje texto="La copia de seguridad solo la pueden hacer los administradores." error />
      ) : (
        <>
          <span>
            Descarga un fichero ZIP con los datos de {tablas ? tablas.length : '…'} tablas del ERP (maestros, documentos, caja, VeriFactu,
            contabilidad…), unas {filasEstimadas.toLocaleString('es-ES')} filas. Queda fuera la carga en bruto de GeminisWin (carga_dbf).
          </span>
          <span className="text-[#444]">
            Supabase hace además copias diarias automáticas de toda la base de datos; esta copia sirve para guardarla aparte o consultarla.
          </span>
          {estado && (
            <div className="flex flex-col gap-1">
              <Progreso valor={estado.hechas} total={tablas?.length ?? 0} />
              <span className="truncate">
                {estado.tabla} · {estado.filas.toLocaleString('es-ES')} filas leídas
              </span>
            </div>
          )}
        </>
      )}
      {mensaje && <Mensaje {...mensaje} />}
      <Botones>
        <button type="button" className="gw-btn w-[110px]" disabled={!admin || !tablas || trabajando} onClick={hacer}>
          Hacer Copia
        </button>
        <button type="button" className="gw-btn w-[90px]" onClick={() => {
            if (trabajando) cancelar.current = true
            else onClose()
          }}>
          {trabajando ? 'Detener' : 'Cerrar'}
        </button>
      </Botones>
    </Dialogo>
  )
}

/* ------------------------------------------------------------------ Testear Copia */

interface Resultado {
  tabla: string
  esperadas: number | null
  leidas: number | null
  error: string | null
}

export function TestearCopiaDialog({ onClose }: { onClose: () => void }) {
  const [fichero, setFichero] = useState<File | null>(null)
  const [cabecera, setCabecera] = useState<Manifiesto | null>(null)
  const [resultados, setResultados] = useState<Resultado[]>([])
  const [mensaje, setMensaje] = useState<{ texto: string; error?: boolean } | null>(null)
  const [trabajando, setTrabajando] = useState(false)

  async function testear(f: File) {
    setFichero(f)
    setTrabajando(true)
    setMensaje(null)
    setResultados([])
    setCabecera(null)
    try {
      const entradas = leerZip(await f.arrayBuffer())
      const dec = new TextDecoder()
      const man = entradas.find((e) => e.nombre === 'manifiesto.json')
      if (!man) throw new Error('El ZIP no tiene manifiesto.json: no es una copia del ERP.')
      const m = JSON.parse(dec.decode(await man.leer())) as Manifiesto
      setCabecera(m)
      const esperadas = new Map(m.tablas.map((t) => [t.tabla, t.filas]))
      const res: Resultado[] = []
      for (const e of entradas.filter((x) => x.nombre.startsWith('tablas/') && x.nombre.endsWith('.json'))) {
        const tabla = e.nombre.slice(7, -5)
        let leidas: number | null = null
        let error: string | null = null
        try {
          const filas = JSON.parse(dec.decode(await e.leer()))
          if (!Array.isArray(filas)) throw new Error('no es una lista de filas')
          leidas = filas.length
          if (esperadas.has(tabla) && esperadas.get(tabla) !== leidas) error = 'No coincide con el manifiesto'
        } catch (err) {
          error = (err as Error).message
        }
        res.push({ tabla, esperadas: esperadas.get(tabla) ?? null, leidas, error })
        esperadas.delete(tabla)
        setResultados([...res])
      }
      for (const [tabla, n] of esperadas) res.push({ tabla, esperadas: n, leidas: null, error: 'Falta en el ZIP' })
      setResultados(res)
      const malas = res.filter((r) => r.error).length
      const filas = res.reduce((s, r) => s + (r.leidas ?? 0), 0)
      setMensaje(
        malas
          ? { texto: `La copia tiene ${malas} tabla(s) con errores.`, error: true }
          : { texto: `Copia correcta: ${res.length} tablas legibles, ${filas.toLocaleString('es-ES')} filas.` },
      )
    } catch (e) {
      setMensaje({ texto: (e as Error).message, error: true })
    } finally {
      setTrabajando(false)
    }
  }

  return (
    <Dialogo titulo="Testear Copia de Seguridad" onClose={onClose} ancho={480}>
      <span>Abre un ZIP hecho con «Hacer Copia» y comprueba que se puede leer entero y que cada tabla tiene las filas que dice el manifiesto.</span>
      <label className="flex items-center gap-2">
        <span className="gw-btn inline-flex cursor-pointer items-center px-2">Abrir copia…</span>
        <input
          type="file"
          accept=".zip,application/zip"
          className="hidden"
          disabled={trabajando}
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) testear(f)
            e.target.value = ''
          }}
        />
        <span className="truncate text-[#444]">{fichero ? `${fichero.name} (${(fichero.size / 1048576).toFixed(1)} MB)` : 'Ningún fichero'}</span>
      </label>
      {cabecera && (
        <span className="text-[#444]">
          Hecha el {new Date(cabecera.creada).toLocaleString('es-ES')} por {cabecera.usuario || '—'} · versión {cabecera.version}
        </span>
      )}
      <div className="h-[220px] overflow-auto border border-[var(--gw-border)] bg-white">
        <table className="gw-grid">
          <thead className="sticky top-0">
            <tr>
              <th>Tabla</th>
              <th className="w-[80px] text-right">Manifiesto</th>
              <th className="w-[80px] text-right">Leídas</th>
              <th className="w-[150px]">Estado</th>
            </tr>
          </thead>
          <tbody>
            {resultados.map((r) => (
              <tr key={r.tabla}>
                <td>{r.tabla}</td>
                <td className="text-right">{r.esperadas?.toLocaleString('es-ES') ?? ''}</td>
                <td className="text-right">{r.leidas?.toLocaleString('es-ES') ?? ''}</td>
                <td className={`truncate ${r.error ? 'text-[#a00]' : ''}`} title={r.error ?? ''}>
                  {r.error ?? 'Correcta'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {trabajando && <span>Comprobando…</span>}
      {mensaje && <Mensaje {...mensaje} />}
      <Botones>
        <button type="button" className="gw-btn w-[90px]" onClick={onClose}>
          Cerrar
        </button>
      </Botones>
    </Dialogo>
  )
}

/* ------------------------------------------------------------------ Eliminar Ficheros Temporales */

function clavesTemporales() {
  const de = (s: Storage | null) => {
    const r: string[] = []
    try {
      if (!s) return r
      for (let i = 0; i < s.length; i++) {
        const k = s.key(i)
        if (k && !esPreferencia(k)) r.push(k)
      }
    } catch {
      /* almacenamiento bloqueado */
    }
    return r
  }
  return { local: de(window.localStorage), sesion: de(window.sessionStorage) }
}

export function EliminarTemporalesDialog({ onClose }: { onClose: () => void }) {
  const [claves, setClaves] = useState(clavesTemporales)
  const [hecho, setHecho] = useState<number | null>(null)
  const total = claves.local.length + claves.sesion.length

  function eliminar() {
    let n = 0
    for (const [s, ks] of [
      [window.localStorage, claves.local],
      [window.sessionStorage, claves.sesion],
    ] as const) {
      for (const k of ks) {
        try {
          s.removeItem(k)
          n++
        } catch {
          /* nada */
        }
      }
    }
    setHecho(n)
    setClaves(clavesTemporales())
  }

  return (
    <Dialogo titulo="Eliminar Ficheros Temporales" onClose={onClose} ancho={400}>
      <span>
        Borra los datos temporales que el ERP guarda en este navegador (conversación de NEXA, listas y búsquedas en memoria…). Se
        conservan la sesión iniciada, la tienda, el periodo y la fecha de trabajo, la voz de NEXA y las opciones de los gestores y del
        panel.
      </span>
      {hecho == null ? (
        <span className="font-bold">{total ? `¿Eliminar ${total} dato(s) temporal(es)?` : 'No hay datos temporales que eliminar.'}</span>
      ) : (
        <Mensaje texto={`Eliminados ${hecho} dato(s) temporal(es). Algunos se notarán al recargar la página (F5).`} />
      )}
      <Botones>
        {hecho == null && (
          <button type="button" className="gw-btn w-[90px]" disabled={!total} onClick={eliminar}>
            Sí
          </button>
        )}
        <button type="button" className="gw-btn w-[90px]" onClick={onClose}>
          {hecho == null ? 'No' : 'Cerrar'}
        </button>
      </Botones>
    </Dialogo>
  )
}

