// Archivo → Textos legales → Por empleado (Luis, 30/10/2026): qué empleados han dado su conformidad al texto
// legal de la auditoría (versión vigente) y cuáles hacen cambios en el programa. Solo super
// administradores (fn_auditoria_conformidades).

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'

interface Empleado {
  codigo: string
  nombre: string
  numero: string | null
  usuario: boolean
  super: boolean
  /** Sin conformidad no puede modificar (si es false, un super administrador le deja trabajar igual). */
  obligatoria: boolean
  cambios: number
  ultimo_cambio: string | null
  conformidades: {
    documento: number
    aceptado_en: string | null
    version_anterior: string | null
    /** Veces que pulsó «Ahora no» con el texto vigente. */
    denegaciones: number
  }[]
}

interface Datos {
  documentos: { id: number; titulo: string }[]
  empleados: Empleado[]
}

const fechaHora = (iso: string) =>
  new Date(iso).toLocaleString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

export function AuditoriaConformidades() {
  const [datos, setDatos] = useState<Datos | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [soloConUsuario, setSoloConUsuario] = useState(true)
  const [soloPendientes, setSoloPendientes] = useState(false)

  const cargar = () =>
    supabase.rpc('fn_auditoria_conformidades').then(({ data, error: e }) => {
      if (e) setError(e.message)
      else setDatos(data as Datos)
    })
  useEffect(() => {
    void cargar()
  }, [])

  const cambiarObligatoria = async (e: Empleado, obligatoria: boolean) => {
    const { error: err } = await supabase.rpc('fn_conformidad_obligatoria', { p_empleado: e.codigo, p_obligatoria: obligatoria })
    if (err) return setError(err.message)
    void cargar()
  }

  const pendiente = (e: Empleado) => e.conformidades.some((c) => !c.aceptado_en)
  const lista = useMemo(
    () => (datos?.empleados ?? []).filter((e) => (!soloConUsuario || e.usuario || e.cambios > 0) && (!soloPendientes || pendiente(e))),
    [datos, soloConUsuario, soloPendientes],
  )
  const conCambiosSinFirmar = (datos?.empleados ?? []).filter((e) => e.cambios > 0 && pendiente(e)).length

  const imprimir = () => {
    const tabla = document.getElementById('tabla-conformidades')
    const w = window.open('', '_blank')
    if (!tabla || !w) return
    w.document.write(
      `<!doctype html><html><head><meta charset="utf-8"><title>Conformidades auditoría</title><style>` +
        `body{font:11pt Arial,sans-serif;margin:12mm}table{border-collapse:collapse;width:100%}th,td{border:1px solid #999;padding:3px 6px;text-align:left}th{background:#e8ecf4}</style></head>` +
        `<body><h3>Conformidades con el texto legal de la auditoría · ${new Date().toLocaleString('es-ES')}</h3>${tabla.outerHTML}</body></html>`,
    )
    w.document.close()
    w.focus()
    w.print()
  }

  if (error) return <div className="font-bold text-[#c42b1c]">{error}</div>
  if (!datos) return <div className="text-[#555]">Cargando…</div>
  if (!datos.documentos.length) return <div className="text-[#555]">No hay ningún documento que pida conformidad (Documentos legales).</div>

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1 text-[12px]">
          <input type="checkbox" checked={soloConUsuario} onChange={(e) => setSoloConUsuario(e.target.checked)} /> Solo los que entran al programa o han hecho
          cambios
        </label>
        <label className="flex items-center gap-1 text-[12px]">
          <input type="checkbox" checked={soloPendientes} onChange={(e) => setSoloPendientes(e.target.checked)} /> Solo los que no la han dado
        </label>
        {conCambiosSinFirmar > 0 && <b className="text-[#c42b1c]">⚠ {conCambiosSinFirmar} empleado(s) hacen cambios sin haber dado su conformidad</b>}
        <span className="flex-1" />
        <button type="button" className="gw-btn" onClick={imprimir}>
          🖨 Imprimir listado
        </button>
      </div>
      <div className="max-h-[64vh] overflow-auto border border-[var(--gw-border)]">
        <table id="tabla-conformidades" className="gw-grid">
          <thead>
            <tr>
              <th className="w-[60px]">Nº</th>
              <th>Empleado</th>
              <th className="w-[80px]">Entra al ERP</th>
              <th className="w-[80px] !text-right">Cambios</th>
              <th className="w-[140px]">Último cambio</th>
              {datos.documentos.map((d) => (
                <th key={d.id} className="w-[230px]" title={d.titulo}>
                  Conformidad: {d.titulo.length > 28 ? `${d.titulo.slice(0, 28)}…` : d.titulo}
                </th>
              ))}
              <th className="w-[190px]" title="Qué pasa mientras no da su conformidad">
                Sin conformidad
              </th>
            </tr>
          </thead>
          <tbody>
            {lista.map((e) => (
              <tr key={e.codigo}>
                <td>{e.numero ?? '—'}</td>
                <td>
                  {e.nombre}
                  {e.super ? ' 👑' : ''}
                </td>
                <td>{e.usuario ? 'Sí' : 'No'}</td>
                <td className="text-right">{e.cambios}</td>
                <td>{e.ultimo_cambio ? fechaHora(e.ultimo_cambio) : '—'}</td>
                {datos.documentos.map((d) => {
                  const c = e.conformidades.find((x) => x.documento === d.id)
                  return (
                    <td key={d.id} className={c?.aceptado_en ? 'text-[#127a12]' : 'font-bold text-[#c42b1c]'}>
                      {c?.aceptado_en
                        ? `✔ ${fechaHora(c.aceptado_en)}`
                        : c?.version_anterior
                          ? `PENDIENTE (dio la del ${fechaHora(c.version_anterior)}, el texto cambió)`
                          : `PENDIENTE${c?.denegaciones ? ` · denegado ${c.denegaciones} ${c.denegaciones === 1 ? 'vez' : 'veces'}` : ''}`}
                    </td>
                  )
                })}
                <td className="p-0!">
                  <select
                    className={`h-[22px] w-full border-0 bg-transparent ${e.obligatoria ? 'text-[#c42b1c]' : 'text-[#127a12]'}`}
                    value={e.obligatoria ? 'si' : 'no'}
                    onChange={(ev) => void cambiarObligatoria(e, ev.target.value === 'si')}
                  >
                    <option value="si">🔒 No puede modificar</option>
                    <option value="no">✔ Le dejo trabajar</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
