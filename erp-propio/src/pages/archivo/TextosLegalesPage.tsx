// Archivo → Textos legales (Luis, 30/10/2026). Solo super administradores. Tres pestañas:
//  · Registro: fichero de textos legales AUTORIZADOS y DENEGADOS. Cada vez que un empleado da su
//    conformidad («Doy mi conformidad») o la deniega («Ahora no») al aviso de entrada, con su nº,
//    nombre, día y hora, y enlace al texto exacto que se le enseñó (fn_textos_legales_registro).
//  · Por empleado: quién la tiene dada y quién no, cuántos cambios hace, y si se le deja trabajar
//    sin ella (AuditoriaConformidades).
//  · Documentos: los textos legales y los adjuntos (AuditoriaDocumentos).

import { useEffect, useState } from 'react'
import { GwDate, GwSelect, GwWindow } from '../../components/gw'
import { GwOperativa } from '../../components/gw/GwOperativa'
import { supabase } from '../../lib/supabase'
import { usePermisos } from '../../lib/PermisosContext'
import { AuditoriaConformidades } from './AuditoriaConformidades'
import { AuditoriaDocumentos } from './AuditoriaDocumentos'
import { pdfJustificante, pdfTextoLegal } from './textosLegalesPdf'

interface Apunte {
  id: number
  fecha: string
  resultado: 'aceptado' | 'denegado'
  empleado: string
  empleado_nombre: string | null
  empleado_numero: string | null
  documento: number
  version: string
  titulo: string
  vigente: boolean
  grupo: string | null
  ip: string | null
  dispositivo: string | null
}

const hoy = () => new Date().toLocaleDateString('sv-SE')
const haceDias = (n: number) => new Date(Date.now() - n * 86400000).toLocaleDateString('sv-SE')
const fechaHora = (iso: string) =>
  new Date(iso).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })

function Registro() {
  const [desde, setDesde] = useState(haceDias(365))
  const [hasta, setHasta] = useState(hoy())
  const [empleado, setEmpleado] = useState('')
  const [resultado, setResultado] = useState('')
  const [empleados, setEmpleados] = useState<{ codigo: string; nombre: string; numero_operario: string | null }[]>([])
  const [filas, setFilas] = useState<Apunte[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [texto, setTexto] = useState<{ titulo: string; contenido: string | null; apunte: Apunte } | null>(null)

  const buscar = async () => {
    setError(null)
    const { data, error: e } = await supabase.rpc('fn_textos_legales_registro', {
      p_desde: desde,
      p_hasta: hasta,
      p_empleado: empleado || null,
      p_resultado: resultado || null,
    })
    if (e) return setError(e.message)
    setFilas((data as Apunte[]) ?? [])
  }

  useEffect(() => {
    supabase
      .from('empleado')
      .select('codigo, nombre, numero_operario')
      .order('nombre')
      .then(({ data }) => setEmpleados((data ?? []) as typeof empleados))
    void buscar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const leerVersion = async (a: Apunte) => {
    const { data, error: e } = await supabase
      .from('auditoria_documento_version')
      .select('titulo, contenido')
      .eq('documento_id', a.documento)
      .eq('version', a.version)
      .maybeSingle()
    if (e || !data) {
      setError(e?.message ?? 'No se encuentra esa versión del texto.')
      return null
    }
    return data as { titulo: string; contenido: string | null }
  }
  const verPdf = async (a: Apunte) => {
    const v = await leerVersion(a)
    if (v) pdfTextoLegal({ ...v, version: a.version })
  }
  const verJustificante = async (a: Apunte) => {
    const v = await leerVersion(a)
    if (v)
      pdfJustificante({
        ...v,
        version: a.version,
        resultado: a.resultado,
        fecha: a.fecha,
        empleado: a.empleado,
        empleadoNombre: a.empleado_nombre,
        empleadoNumero: a.empleado_numero,
        grupo: a.grupo,
        ip: a.ip,
        dispositivo: a.dispositivo,
      })
  }

  const verTexto = async (a: Apunte) => {
    const { data, error: e } = await supabase
      .from('auditoria_documento_version')
      .select('titulo, contenido')
      .eq('documento_id', a.documento)
      .eq('version', a.version)
      .maybeSingle()
    if (e || !data) return setError(e?.message ?? 'No se encuentra esa versión del texto.')
    setTexto({ ...(data as { titulo: string; contenido: string | null }), apunte: a })
  }

  const imprimir = () => {
    const tabla = document.getElementById('tabla-textos-legales')
    const w = window.open('', '_blank')
    if (!tabla || !w) return
    w.document.write(
      `<!doctype html><html><head><meta charset="utf-8"><title>Textos legales autorizados y denegados</title><style>` +
        `body{font:11pt Arial,sans-serif;margin:12mm}table{border-collapse:collapse;width:100%}th,td{border:1px solid #999;padding:3px 6px;text-align:left}th{background:#e8ecf4}button{display:none}</style></head>` +
        `<body><h3>Textos legales autorizados y denegados · ${new Date().toLocaleString('es-ES')}</h3>${tabla.outerHTML}</body></html>`,
    )
    w.document.close()
    w.focus()
    w.print()
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col">
          <span className="gw-label">Desde</span>
          <GwDate value={desde} onChange={(v) => setDesde(v ?? hoy())} style={{ width: 100 }} />
        </label>
        <label className="flex flex-col">
          <span className="gw-label">Hasta</span>
          <GwDate value={hasta} onChange={(v) => setHasta(v ?? hoy())} style={{ width: 100 }} />
        </label>
        <label className="flex flex-col">
          <span className="gw-label">Empleado</span>
          <GwSelect className="w-[200px]" value={empleado} onChange={(e) => setEmpleado(e.target.value)}>
            <option value="">Todos</option>
            {empleados.map((e) => (
              <option key={e.codigo} value={e.codigo}>
                {e.numero_operario ?? e.codigo} · {e.nombre}
              </option>
            ))}
          </GwSelect>
        </label>
        <label className="flex flex-col">
          <span className="gw-label">Resultado</span>
          <GwSelect className="w-[150px]" value={resultado} onChange={(e) => setResultado(e.target.value)}>
            <option value="">Todos</option>
            <option value="aceptado">Autorizados</option>
            <option value="denegado">Denegados</option>
          </GwSelect>
        </label>
        <button type="button" className="gw-btn h-[26px] font-bold" onClick={() => void buscar()}>
          Buscar
        </button>
        <span className="flex-1" />
        <button type="button" className="gw-btn h-[26px]" disabled={!filas?.length} onClick={imprimir}>
          🖨 Imprimir
        </button>
      </div>
      {error && <div className="font-bold text-[#c42b1c]">{error}</div>}
      <div className="text-[13px] font-bold text-[#1d3a8a]">TEXTOS LEGALES · {filas ? `${filas.length} registro(s)` : 'Cargando…'}</div>
      <div className="h-[60vh] overflow-auto border border-[var(--gw-border)] bg-white">
        <table id="tabla-textos-legales" className="w-full border-separate border-spacing-0 text-[13.5px] leading-[18px]">
          <thead>
            <tr>
              {[
                ['Fecha y hora', '#1d3a8a'],
                ['Empleado', '#1d3a8a'],
                ['Tipo clave acceso', '#1d3a8a'],
                ['Texto legal (PDF)', '#1d3a8a'],
                ['ACEPTADOS', '#5f9a2a'],
                ['NO ACEPTADOS', '#c98a00'],
                ['Registro (archivo) aceptación', '#1d3a8a'],
              ].map(([t, color]) => (
                <th
                  key={t}
                  className="sticky top-0 z-[1] whitespace-nowrap border-r border-[#3c5aa8] px-2.5 py-2 text-left text-[13px] font-bold text-white"
                  style={{ background: color }}
                >
                  {t}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(filas ?? []).map((a, i) => {
              const td = 'border-b border-r border-[#e6e6e6] px-2.5 py-1.5'
              const fondo = i % 2 ? '#f6f9fd' : '#fff'
              return (
                <tr key={a.id} style={{ background: fondo }}>
                  <td className={`${td} whitespace-nowrap tabular-nums`}>{fechaHora(a.fecha)}</td>
                  <td className={`${td} whitespace-nowrap`}>
                    {a.empleado_numero ?? a.empleado} · {a.empleado_nombre ?? ''}
                  </td>
                  <td className={td}>
                    {a.grupo ? (
                      <span className="whitespace-nowrap rounded-[3px] border border-[#c9d7ee] bg-[#eef3fb] px-1.5 text-[12px] text-[#1d3a8a]">
                        {a.grupo === 'Super admin' ? '👑 ' : ''}
                        {a.grupo}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className={td}>
                    <button type="button" className="text-left font-bold text-[#c42b1c] hover:underline" title={a.titulo} onClick={() => void verPdf(a)}>
                      📄 Ver PDF · {a.vigente ? 'versión vigente' : 'versión anterior'}
                    </button>
                    <button type="button" className="ml-2 text-[12px] text-[#1d5fb4] underline" onClick={() => void verTexto(a)}>
                      leer aquí
                    </button>
                  </td>
                  <td className={`${td} text-center font-bold`} style={a.resultado === 'aceptado' ? { background: '#92d050', color: '#0b3d0b' } : undefined}>
                    {a.resultado === 'aceptado' ? '✔ Sí' : ''}
                  </td>
                  <td className={`${td} text-center font-bold`} style={a.resultado === 'denegado' ? { background: '#ffc000', color: '#5a3a00' } : undefined}>
                    {a.resultado === 'denegado' ? '✖ No (Ahora no)' : ''}
                  </td>
                  <td className={td}>
                    <button
                      type="button"
                      className="text-left text-[#1d3a8a] hover:underline"
                      title={`Conexión ${a.ip ?? '—'}`}
                      onClick={() => void verJustificante(a)}
                    >
                      📎 Justificante {a.empleado_numero ?? a.empleado}-{fechaHora(a.fecha).slice(0, 10).replace(/\//g, '')}.pdf
                    </button>
                  </td>
                </tr>
              )
            })}
            {filas && !filas.length && (
              <tr>
                <td colSpan={7} className="p-3 text-center text-[#777]">
                  Nadie ha aceptado ni denegado todavía en esas fechas.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {texto && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/25 pt-10" onKeyDown={(e) => e.key === 'Escape' && setTexto(null)}>
          <GwWindow
            title={`Texto ${texto.apunte.resultado === 'aceptado' ? 'autorizado' : 'denegado'} por ${texto.apunte.empleado_nombre ?? texto.apunte.empleado} · ${fechaHora(texto.apunte.fecha)}`}
            onClose={() => setTexto(null)}
            className="w-[780px] max-w-[97vw]"
          >
            <div className="flex flex-col gap-2">
              <div className="font-bold text-[#1d3a8a]">{texto.titulo}</div>
              <pre className="max-h-[65vh] overflow-auto whitespace-pre-wrap border border-[var(--gw-border)] bg-white p-3 font-[inherit] text-[13px] leading-[19px]">
                {texto.contenido}
              </pre>
              <div className="text-[11px] text-[#666]">
                Versión {texto.apunte.version} {texto.apunte.vigente ? '(la vigente)' : '(anterior: el texto se cambió después)'}
              </div>
            </div>
          </GwWindow>
        </div>
      )}
    </div>
  )
}

export function TextosLegalesPage() {
  const { superAdmin, cargando } = usePermisos()
  const [pestana, setPestana] = useState<'registro' | 'empleados' | 'documentos'>('registro')
  const [ayuda, setAyuda] = useState(false)

  if (cargando) return <div className="p-3 text-[13px]">Comprobando permisos…</div>
  if (!superAdmin) return <div className="p-3 text-[13px] font-bold text-[#c42b1c]">Los textos legales solo los pueden ver los super administradores.</div>

  return (
    <div className="flex w-[1180px] max-w-full flex-col gap-1.5 text-[13px]">
      <div className="flex items-end gap-1 border-b border-[var(--gw-border)]">
        {(
          [
            ['registro', 'Autorizados y denegados'],
            ['empleados', 'Por empleado'],
            ['documentos', 'Documentos'],
          ] as const
        ).map(([v, t]) => (
          <button
            key={v}
            type="button"
            className={`-mb-px border border-[var(--gw-border)] px-3 py-1 ${pestana === v ? 'border-b-white bg-white font-bold' : 'bg-[var(--gw-face)]'}`}
            onClick={() => setPestana(v)}
          >
            {t}
          </button>
        ))}
        <span className="flex-1" />
        <button type="button" className="gw-btn mb-1 h-[24px]" onClick={() => setAyuda((a) => !a)}>
          Operativa
        </button>
      </div>
      {ayuda && (
        <div className="border border-[var(--gw-border)] bg-white p-2">
          <GwOperativa
            bloques={[
              {
                titulo: 'Autorizados y denegados',
                pasos: [
                  'Cada vez que un empleado entra y le sale el aviso legal queda apuntado aquí: «✔ Autorizado» si pulsa «Doy mi conformidad», «✖ Denegado» si pulsa «Ahora no».',
                  'Sale su nº de empleado, nombre, grupo de acceso, día y hora. «📄 Ver PDF» abre el texto exacto que se le enseñó; «📎 Justificante» saca un PDF con quién, cuándo, desde qué conexión y equipo, y el texto completo.',
                  'Filtra por fechas, empleado o resultado y pulsa Buscar. 🖨 Imprimir lo saca en papel.',
                ],
              },
              {
                titulo: 'Por empleado',
                pasos: [
                  'Cada empleado: si entra al programa, cuántos cambios ha hecho y el último, y si tiene la conformidad dada (fecha) o PENDIENTE (en rojo).',
                  'Columna «Sin conformidad»: «🔒 No puede modificar» (solo consulta hasta que la dé) o «✔ Le dejo trabajar». Lo eligen los super administradores.',
                ],
              },
              {
                titulo: 'Documentos',
                pasos: [
                  'El texto del aviso legal y los demás documentos (copias firmadas, actualizaciones…), con archivo adjunto si se quiere (PDF o foto, máx. 8 MB).',
                  'Si se cambia el texto del aviso, a todos les vuelve a salir al entrar; lo que aceptaron antes queda guardado tal cual.',
                  'Los documentos no se borran: «Retirar» los quita de la lista.',
                ],
              },
              {
                titulo: 'Bueno es saber',
                notas: [
                  'Nada de esto se puede modificar ni borrar. Solo lo ven los super administradores (Luis, David y Rober).',
                  'Los cambios que hace cada empleado en el programa están en Archivo → Auditoría.',
                ],
              },
            ]}
          />
        </div>
      )}
      {pestana === 'registro' ? <Registro /> : pestana === 'empleados' ? <AuditoriaConformidades /> : <AuditoriaDocumentos />}
    </div>
  )
}
