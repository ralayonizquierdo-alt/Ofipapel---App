import { useMemo, useState } from 'react'
import { Download, History, Paperclip } from 'lucide-react'
import { useData } from '../contexts/DataContext'
import { ORIGEN_LABEL, type ImportLog, type OrigenSubida } from '../types'
import { rolDe, usuarioActual } from '../lib/auth'
import PageHeader from '../components/ui/PageHeader'

/**
 * El registro de todo lo que ha entrado en la aplicación.
 *
 * Cada vía de entrada —los dos Excel, lo que se pega, los justificantes y las
 * correcciones puntuales— deja aquí una línea con quién, cuándo, por dónde y
 * qué. Es un histórico: no se edita ni se borra desde la aplicación.
 *
 * Sirve para responder a «¿de dónde salió esta cifra?» meses después, que es
 * justo lo que hace falta cuando el asesor pregunta o algo no cuadra.
 *
 * Quien entra con el rol «gastos» lo ve entero salvo una cosa: la frase de
 * resumen de las subidas ajenas. Ahí es donde asoma algún importe —«1.240,00 €
 * en APART.104», de un cobro que pegó otro— y ellas no ven el dinero del
 * negocio. De lo suyo sí lo ven: lo han subido ellas. Lo demás —quién, cuándo,
 * por dónde y cuántas cosas entraron— no lleva ni un euro y se enseña igual.
 */

/** Las cosas que puede traer una subida, en el orden en que se enseñan. */
const CONCEPTOS: { clave: keyof ImportLog; uno: string; varios: string; color: string }[] = [
  { clave: 'reservas',     uno: 'reserva',     varios: 'reservas',     color: 'bg-blue-100 text-blue-800' },
  { clave: 'cobros',       uno: 'cobro',       varios: 'cobros',       color: 'bg-green-100 text-green-800' },
  { clave: 'gastos',       uno: 'gasto',       varios: 'gastos',       color: 'bg-red-100 text-red-800' },
  { clave: 'ingresos',     uno: 'ingreso',     varios: 'ingresos',     color: 'bg-emerald-100 text-emerald-800' },
  { clave: 'ocupaciones',  uno: 'ocupación',   varios: 'ocupaciones',  color: 'bg-slate-100 text-slate-700' },
  { clave: 'reparaciones', uno: 'reparación',  varios: 'reparaciones', color: 'bg-amber-100 text-amber-800' },
]

/** «1 reserva» / «3 reservas». */
const cuenta = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`

const COLOR_ORIGEN: Record<OrigenSubida, string> = {
  'excel-gastos': 'bg-red-50 text-red-700 border-red-200',
  'excel-limpieza': 'bg-sky-50 text-sky-700 border-sky-200',
  'excel-calendario': 'bg-blue-50 text-blue-700 border-blue-200',
  'pegado-whatsapp': 'bg-green-50 text-green-700 border-green-200',
  'pegado-airbnb': 'bg-rose-50 text-rose-700 border-rose-200',
  'justificante': 'bg-violet-50 text-violet-700 border-violet-200',
  'correcciones': 'bg-amber-50 text-amber-800 border-amber-200',
}

function cuando(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('es-ES', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

/** Los registros viejos no traen origen: todos eran del Excel de gastos. */
const origenDe = (l: ImportLog): OrigenSubida => l.origen ?? 'excel-gastos'

export default function Registro() {
  const { importLogs } = useData()
  const [filtro, setFiltro] = useState<'todo' | OrigenSubida>('todo')
  const yo = usuarioActual()
  const conImportes = rolDe(yo) !== 'gastos'
  /** ¿Se le puede enseñar la frase de resumen de esta subida? */
  const resumenDe = (l: ImportLog) =>
    conImportes || l.by === yo ? l.resumen : undefined

  const ordenados = useMemo(
    () => [...importLogs].sort((a, b) => b.at.localeCompare(a.at)),
    [importLogs],
  )
  const visibles = filtro === 'todo' ? ordenados : ordenados.filter(l => origenDe(l) === filtro)

  /** Cuántas subidas hay de cada vía, para el desplegable. */
  const porOrigen = useMemo(() => {
    const m = new Map<OrigenSubida, number>()
    for (const l of ordenados) m.set(origenDe(l), (m.get(origenDe(l)) ?? 0) + 1)
    return m
  }, [ordenados])

  /** El total de apuntes que ha entrado por cada concepto. */
  const totales = useMemo(() => CONCEPTOS.map(c => ({
    ...c,
    n: visibles.reduce((s, l) => s + (Number(l[c.clave]) || 0), 0),
  })).filter(c => c.n), [visibles])

  /** El registro entero en CSV, por si hay que enseñárselo a alguien de fuera. */
  function descargar() {
    const cab = ['Fecha', 'Quién', 'Por dónde', 'Fichero', 'Ejercicio', 'Qué entró',
      'Reservas', 'Cobros', 'Gastos', 'Ingresos', 'Ocupaciones', 'Reparaciones', 'Retirados',
      'Justificante']
    const fila = (l: ImportLog) => [
      cuando(l.at), l.by, ORIGEN_LABEL[origenDe(l)], l.fileName ?? '', l.year ?? '', resumenDe(l) ?? '',
      l.reservas ?? '', l.cobros ?? '', l.gastos ?? '', l.ingresos ?? '',
      l.ocupaciones ?? '', l.reparaciones ?? '', l.borrados ?? '', l.justificanteUrl ?? '',
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(';')

    // El punto y coma y el BOM son para que Excel en español lo abra bien.
    const csv = '﻿' + [cab.join(';'), ...ordenados.map(fila)].join('\r\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `registro-subidas-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="p-6">
      <PageHeader
        title="Registro de subidas"
        subtitle={`${ordenados.length} ${ordenados.length === 1 ? 'entrada' : 'entradas'} desde que se lleva la cuenta`}
        actions={
          <div className="flex flex-wrap gap-2">
            <select value={filtro} onChange={e => setFiltro(e.target.value as typeof filtro)}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white">
              <option value="todo">Todo ({ordenados.length})</option>
              {[...porOrigen.entries()].map(([o, n]) => (
                <option key={o} value={o}>{ORIGEN_LABEL[o]} ({n})</option>
              ))}
            </select>
            <button onClick={descargar} disabled={!ordenados.length}
              className="flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-700 hover:border-blue-300 hover:text-blue-700 disabled:opacity-40 whitespace-nowrap">
              <Download size={15} /> Descargar
            </button>
          </div>
        }
      />

      {totales.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-5">
          {totales.map(t => (
            <span key={String(t.clave)} className={`text-xs font-medium px-2.5 py-1 rounded-full ${t.color}`}>
              {cuenta(t.n, t.uno, t.varios)}
            </span>
          ))}
        </div>
      )}

      {visibles.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
          <History size={28} className="text-slate-300 mx-auto mb-3" />
          <p className="text-sm text-slate-500">
            {ordenados.length
              ? 'No hay subidas de ese tipo.'
              : 'Todavía no hay ninguna subida registrada. Se irá llenando solo a partir de ahora.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {visibles.map(l => <Entrada key={l.id} log={l} resumen={resumenDe(l)} />)}
        </div>
      )}
    </div>
  )
}

function Entrada({ log, resumen }: { log: ImportLog; resumen?: string }) {
  const o = origenDe(log)
  const cosas = CONCEPTOS.map(c => ({ ...c, n: Number(log[c.clave]) || 0 })).filter(c => c.n)

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-1.5">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <span className={`text-xs font-medium px-2 py-0.5 rounded border ${COLOR_ORIGEN[o]}`}>
            {ORIGEN_LABEL[o]}
          </span>
          {log.year && <span className="text-xs text-slate-500">ejercicio {log.year}</span>}
          {log.fileName && (
            <span className="text-xs text-slate-500 truncate max-w-[16rem]" title={log.fileName}>
              {log.fileName}
            </span>
          )}
          {/* El documento guardado. Se abre en otra pestaña, no se descarga a
              la fuerza: casi siempre es un PDF y el navegador ya lo enseña. */}
          {log.justificanteUrl && (
            <a href={log.justificanteUrl} target="_blank" rel="noopener noreferrer"
              className="text-xs inline-flex items-center gap-1 px-2 py-0.5 rounded border border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100">
              <Paperclip size={11} />
              {log.justificanteNombre ? log.justificanteNombre.slice(0, 28) : 'ver justificante'}
            </a>
          )}
        </div>
        <div className="text-xs text-slate-500 text-right shrink-0">
          <span className="tabular-nums">{cuando(log.at)}</span>
          <span className="mx-1.5 text-slate-300">·</span>
          <b className="text-slate-700">{log.by}</b>
        </div>
      </div>

      {resumen && <p className="text-sm text-slate-700 mb-2">{resumen}</p>}

      <div className="flex flex-wrap gap-1.5">
        {cosas.map(c => (
          <span key={String(c.clave)} className={`text-xs px-2 py-0.5 rounded ${c.color}`}>
            {cuenta(c.n, c.uno, c.varios)}
          </span>
        ))}
        {!!log.borrados && (
          <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-600">
            {cuenta(log.borrados, 'retirado', 'retirados')}
          </span>
        )}
      </div>
    </div>
  )
}
