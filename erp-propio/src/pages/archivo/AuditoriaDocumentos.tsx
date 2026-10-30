// Auditoría → Documentos legales (Luis, 30/10/2026): el texto que informa a los empleados del
// registro de cambios (art. 87 LOPDGDD) y los documentos que se quieran añadir (copias firmadas,
// actualizaciones…), con texto y/o un archivo adjunto (máx. 8 MB). Solo super administradores.
// No se borran: se retiran. Tabla auditoria_documento (migración 20261030_auditoria_documentos).

import { useCallback, useEffect, useState } from 'react'
import { GwInput, GwTextArea } from '../../components/gw'
import { supabase } from '../../lib/supabase'

interface Documento {
  id: number
  titulo: string
  contenido: string | null
  archivo_nombre: string | null
  archivo_tipo: string | null
  activo: boolean
  creado_por: string | null
  creado_en: string
  actualizado_en: string
}

interface Borrador {
  id: number | null
  titulo: string
  contenido: string
  archivo: { nombre: string; tipo: string; base64: string } | null
}

const MAX_BYTES = 8 * 1024 * 1024
const COLUMNAS = 'id, titulo, contenido, archivo_nombre, archivo_tipo, activo, creado_por, creado_en, actualizado_en'
const fecha = (iso: string) => new Date(iso).toLocaleDateString('es-ES')

function leerArchivo(f: File): Promise<string> {
  return new Promise((ok, mal) => {
    const fr = new FileReader()
    fr.onload = () => ok(String(fr.result).split(',')[1] ?? '')
    fr.onerror = () => mal(new Error('No se pudo leer el archivo'))
    fr.readAsDataURL(f)
  })
}

function imprimirTexto(titulo: string, texto: string) {
  const w = window.open('', '_blank')
  if (!w) return
  const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c] as string)
  w.document.write(
    `<!doctype html><html><head><meta charset="utf-8"><title>${esc(titulo)}</title>` +
      `<style>body{font:12pt/1.45 Arial,sans-serif;margin:18mm}pre{white-space:pre-wrap;font:inherit}</style></head>` +
      `<body><pre>${esc(texto)}</pre></body></html>`,
  )
  w.document.close()
  w.focus()
  w.print()
}

export function AuditoriaDocumentos() {
  const [docs, setDocs] = useState<Documento[]>([])
  const [sel, setSel] = useState<number | null>(null)
  const [verRetirados, setVerRetirados] = useState(false)
  const [borrador, setBorrador] = useState<Borrador | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState<{
    texto: string
    error?: boolean
  } | null>(null)

  const cargar = useCallback(async (elegir?: number) => {
    const { data, error } = await supabase.from('auditoria_documento').select(COLUMNAS).order('creado_en')
    if (error) return setMensaje({ texto: error.message, error: true })
    const l = (data ?? []) as Documento[]
    setDocs(l)
    setSel((s) => elegir ?? s ?? l[0]?.id ?? null)
  }, [])

  useEffect(() => {
    void cargar()
  }, [cargar])

  const lista = docs.filter((d) => verRetirados || d.activo)
  const doc = docs.find((d) => d.id === sel) ?? null

  const adjuntar = async (f: File | undefined) => {
    if (!f || !borrador) return
    if (f.size > MAX_BYTES) return setMensaje({ texto: 'El archivo pasa de 8 MB.', error: true })
    const base64 = await leerArchivo(f)
    setBorrador({
      ...borrador,
      archivo: {
        nombre: f.name,
        tipo: f.type || 'application/octet-stream',
        base64,
      },
    })
  }

  const guardar = async () => {
    if (!borrador) return
    if (!borrador.titulo.trim()) return setMensaje({ texto: 'Pon un título.', error: true })
    setGuardando(true)
    const fila: Record<string, unknown> = {
      titulo: borrador.titulo.trim(),
      contenido: borrador.contenido.trim() || null,
    }
    if (borrador.archivo)
      Object.assign(fila, {
        archivo_nombre: borrador.archivo.nombre,
        archivo_tipo: borrador.archivo.tipo,
        archivo_base64: borrador.archivo.base64,
      })
    const r = borrador.id
      ? await supabase.from('auditoria_documento').update(fila).eq('id', borrador.id).select('id').single()
      : await supabase.from('auditoria_documento').insert(fila).select('id').single()
    setGuardando(false)
    if (r.error) return setMensaje({ texto: r.error.message, error: true })
    setBorrador(null)
    setMensaje({ texto: 'Documento guardado.' })
    void cargar((r.data as { id: number }).id)
  }

  const descargar = async (d: Documento) => {
    const { data, error } = await supabase.from('auditoria_documento').select('archivo_base64').eq('id', d.id).single()
    if (error || !data?.archivo_base64)
      return setMensaje({
        texto: error?.message ?? 'Sin archivo.',
        error: true,
      })
    const bytes = Uint8Array.from(atob(data.archivo_base64 as string), (c) => c.charCodeAt(0))
    const url = URL.createObjectURL(new Blob([bytes], { type: d.archivo_tipo ?? 'application/octet-stream' }))
    const a = document.createElement('a')
    a.href = url
    a.download = d.archivo_nombre ?? 'documento'
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 10000)
  }

  const retirar = async (d: Documento) => {
    const { error } = await supabase.from('auditoria_documento').update({ activo: !d.activo }).eq('id', d.id)
    if (error) return setMensaje({ texto: error.message, error: true })
    setMensaje({
      texto: d.activo ? 'Documento retirado (sigue guardado; marca «Ver retirados» para verlo).' : 'Documento vuelto a activar.',
    })
    void cargar(d.id)
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="gw-btn font-bold"
          disabled={!!borrador}
          onClick={() => setBorrador({ id: null, titulo: '', contenido: '', archivo: null })}
        >
          ＋ Nuevo documento
        </button>
        <button
          type="button"
          className="gw-btn"
          disabled={!doc || !!borrador}
          onClick={() =>
            doc &&
            setBorrador({
              id: doc.id,
              titulo: doc.titulo,
              contenido: doc.contenido ?? '',
              archivo: null,
            })
          }
        >
          Modificar / adjuntar archivo
        </button>
        <button
          type="button"
          className="gw-btn"
          disabled={!doc?.contenido || !!borrador}
          onClick={() => doc?.contenido && imprimirTexto(doc.titulo, doc.contenido)}
        >
          🖨 Imprimir texto
        </button>
        <button type="button" className="gw-btn" disabled={!doc?.archivo_nombre} onClick={() => doc && void descargar(doc)}>
          📎 Descargar archivo
        </button>
        <button type="button" className="gw-btn" disabled={!doc || !!borrador} onClick={() => doc && void retirar(doc)}>
          {doc && !doc.activo ? 'Volver a activar' : 'Retirar'}
        </button>
        <span className="flex-1" />
        <label className="flex items-center gap-1 text-[12px]">
          <input type="checkbox" checked={verRetirados} onChange={(e) => setVerRetirados(e.target.checked)} /> Ver retirados
        </label>
      </div>
      {mensaje && <div className={`text-[12px] font-bold ${mensaje.error ? 'text-[#c42b1c]' : 'text-[#185a18]'}`}>{mensaje.texto}</div>}

      <div className="grid grid-cols-[340px_minmax(0,1fr)] gap-2">
        <div className="max-h-[62vh] overflow-auto border border-[var(--gw-border)] bg-white">
          <table className="gw-grid">
            <thead>
              <tr>
                <th>Documento</th>
                <th className="w-[80px]">Fecha</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((d) => (
                <tr
                  key={d.id}
                  className={`cursor-pointer ${d.id === sel ? 'gw-selected' : 'hover:bg-[#e5f1fb]'} ${d.activo ? '' : 'text-[#999] line-through'}`}
                  onClick={() => setSel(d.id)}
                >
                  <td className="truncate" title={d.titulo}>
                    {d.archivo_nombre ? '📎 ' : ''}
                    {d.titulo}
                  </td>
                  <td>{fecha(d.creado_en)}</td>
                </tr>
              ))}
              {!lista.length && (
                <tr>
                  <td colSpan={2} className="text-center text-[#777]">
                    Ningún documento.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {borrador ? (
          <div className="flex flex-col gap-1.5 border border-[var(--gw-border)] bg-white p-2">
            <label className="flex flex-col">
              <span className="gw-label">Título</span>
              <GwInput value={borrador.titulo} onChange={(e) => setBorrador({ ...borrador, titulo: e.target.value })} autoFocus />
            </label>
            <label className="flex flex-col">
              <span className="gw-label">Texto (opcional si adjuntas un archivo)</span>
              <GwTextArea
                className="h-[40vh] font-mono text-[12px]"
                value={borrador.contenido}
                onChange={(e) => setBorrador({ ...borrador, contenido: e.target.value })}
              />
            </label>
            <label className="flex flex-wrap items-center gap-2 text-[12px]">
              <span className="gw-label">Archivo (PDF, foto, Word… máx. 8 MB):</span>
              <input type="file" onChange={(e) => void adjuntar(e.target.files?.[0])} />
              {borrador.archivo && <b>{borrador.archivo.nombre}</b>}
              {!borrador.archivo && borrador.id && docs.find((d) => d.id === borrador.id)?.archivo_nombre && (
                <span className="text-[#555]">Actual: {docs.find((d) => d.id === borrador.id)?.archivo_nombre} (se cambia si eliges otro)</span>
              )}
            </label>
            <div className="flex gap-2">
              <button type="button" className="gw-btn font-bold" disabled={guardando} onClick={() => void guardar()}>
                {guardando ? 'Guardando…' : '💾 Guardar'}
              </button>
              <button type="button" className="gw-btn" disabled={guardando} onClick={() => setBorrador(null)}>
                Cancelar
              </button>
            </div>
          </div>
        ) : doc ? (
          <div className="flex flex-col gap-1 border border-[var(--gw-border)] bg-white p-2">
            <div className="font-bold text-[#1d3a8a]">{doc.titulo}</div>
            <div className="text-[11px] text-[#666]">
              Creado el {fecha(doc.creado_en)} por {doc.creado_por ?? '—'}
              {doc.actualizado_en !== doc.creado_en ? ` · modificado el ${fecha(doc.actualizado_en)}` : ''}
              {doc.archivo_nombre ? ` · archivo: ${doc.archivo_nombre}` : ''}
              {doc.activo ? '' : ' · RETIRADO'}
            </div>
            {doc.contenido ? (
              <pre className="max-h-[56vh] overflow-auto whitespace-pre-wrap font-[inherit] text-[13px] leading-[19px]">{doc.contenido}</pre>
            ) : (
              <div className="text-[#777]">Sin texto: pulsa «Descargar archivo».</div>
            )}
          </div>
        ) : (
          <div />
        )}
      </div>
    </div>
  )
}
