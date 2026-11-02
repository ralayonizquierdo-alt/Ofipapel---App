// Archivo → Registro de incidencias (Luis, 01/11/2026): fallos de programación, mejoras y dudas, los
// apunten los empleados (botón 🐞 de la cabecera, en cualquier pantalla) o los Claude. Cada una con su
// estado (Abierta → En curso → Resuelta → Comprobada), quién la lleva, la solución y comentarios.
// Los Claude la revisan al empezar a trabajar. Tablas incidencia / incidencia_comentario (migración
// 20261101_devoluciones_e_incidencias).

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Bug, MessageSquarePlus, Paperclip, Plus, Save } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { usePermisos } from '../../lib/PermisosContext'
import { GwField, GwGroup, GwInput, GwSelect, GwTextArea, GwWindow } from '../../components/gw'
import { GwOperativa } from '../../components/gw/GwOperativa'
import { windowTitle } from '../../components/shell/menus'

export interface Incidencia {
  id: number
  tipo: 'fallo' | 'mejora' | 'duda' | 'tarea'
  titulo: string
  descripcion: string | null
  pantalla: string | null
  prioridad: 'alta' | 'normal' | 'baja'
  estado: 'abierta' | 'en_curso' | 'resuelta' | 'comprobada' | 'descartada'
  reportado_por: string
  reportado_en: string
  asignado: string | null
  solucion: string | null
  commit_ref: string | null
  resuelta_en: string | null
  comprobada_por: string | null
  comprobada_en: string | null
  adjunto_nombre: string | null
  adjunto_base64: string | null
}
interface Comentario {
  id: number
  autor: string
  texto: string
  creado_en: string
}

export const TIPOS: Record<Incidencia['tipo'], string> = { fallo: '🐞 Fallo', mejora: '💡 Mejora', duda: '❓ Duda', tarea: '📌 Tarea' }
export const ESTADOS: Record<Incidencia['estado'], string> = {
  abierta: '🔴 Abierta',
  en_curso: '🟡 En curso',
  resuelta: '🟢 Resuelta',
  comprobada: '✔ Comprobada',
  descartada: '⚪ Descartada',
}
const ASIGNADOS = ['Luis', 'Rober', 'David', 'Claude-Luis', 'Claude-Rober', 'Claude-Code', 'Cowork']
// Tareas compartidas (Luis, 02/11/2026): «Le toca a…» las enseña a cada uno de los dos.
const COMPARTIDOS = ['Luis / Rober', 'Rober / Cowork', 'Luis / Claude-Luis']
const fechaHora = (t: string | null) => (t ? new Date(t).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' }) : '')

async function aBase64(f: File) {
  const buf = new Uint8Array(await f.arrayBuffer())
  let s = ''
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000))
  return btoa(s)
}

/** Ventana para apuntar una incidencia nueva (desde la cabecera o desde la pantalla del registro). */
export function NuevaIncidencia({ pantalla, onCerrar, onCreada }: { pantalla: string; onCerrar: () => void; onCreada?: () => void }) {
  const [tipo, setTipo] = useState<Incidencia['tipo']>('fallo')
  const [titulo, setTitulo] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [prioridad, setPrioridad] = useState<Incidencia['prioridad']>('normal')
  const [adjunto, setAdjunto] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState(false)

  const guardar = async () => {
    setError(null)
    if (adjunto && adjunto.size > 3 * 1024 * 1024) return setError('La captura es demasiado grande (máximo 3 MB).')
    const { error: e } = await supabase.from('incidencia').insert({
      tipo,
      titulo: titulo.trim(),
      descripcion: descripcion.trim() || null,
      pantalla,
      prioridad,
      adjunto_nombre: adjunto?.name ?? null,
      adjunto_base64: adjunto ? await aBase64(adjunto) : null,
    })
    if (e) return setError(e.message)
    setOk(true)
    onCreada?.()
  }

  return (
    <div className="fixed inset-0 z-[320] flex items-start justify-center bg-black/25 pt-16" onKeyDown={(e) => e.key === 'Escape' && onCerrar()}>
      <GwWindow title="Avisar de un fallo, una mejora o una duda" onClose={onCerrar} className="w-[560px] max-w-[95vw]">
        {ok ? (
          <div className="flex flex-col gap-2 p-2 text-[13px]">
            <b className="text-[#127a12]">✔ Apuntado en el Registro de incidencias. Gracias.</b>
            <span>Lo verás en Archivo → Registro de incidencias, con su estado y la solución cuando esté.</span>
            <button type="button" className="gw-btn self-end" onClick={onCerrar}>
              Cerrar
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5 text-[13px]">
            <div className="text-[12px] text-[#555]">
              Pantalla: <b>{windowTitle(pantalla) || pantalla}</b>
            </div>
            <div className="flex gap-2">
              {(Object.keys(TIPOS) as Incidencia['tipo'][]).map((t) => (
                <button key={t} type="button" className={`gw-btn ${tipo === t ? 'bg-[#91c9f7] font-bold' : ''}`} onClick={() => setTipo(t)}>
                  {TIPOS[t]}
                </button>
              ))}
              <span className="flex-1" />
              <GwSelect value={prioridad} onChange={(e) => setPrioridad(e.target.value as Incidencia['prioridad'])} className="w-[110px]">
                <option value="alta">Urgente</option>
                <option value="normal">Normal</option>
                <option value="baja">Cuando se pueda</option>
              </GwSelect>
            </div>
            <GwField label="En pocas palabras">
              <GwInput
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                maxLength={150}
                autoFocus
                placeholder="p. ej. Al guardar la factura sale un error"
              />
            </GwField>
            <GwField label="Qué estabas haciendo y qué ha pasado (el mensaje de error, si salió)">
              <GwTextArea rows={5} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
            </GwField>
            <label className="gw-btn cursor-pointer self-start">
              <Paperclip size={14} /> {adjunto ? adjunto.name : 'Adjuntar una captura (opcional)'}
              <input type="file" accept="image/*,.pdf" className="hidden" onChange={(e) => setAdjunto(e.target.files?.[0] ?? null)} />
            </label>
            {error && <div className="font-bold text-[#c42b1c]">{error}</div>}
            <div className="flex justify-end gap-2">
              <button type="button" className="gw-btn" onClick={onCerrar}>
                Cancelar
              </button>
              <button type="button" className="gw-btn font-bold" disabled={!titulo.trim()} onClick={() => void guardar()}>
                <Save size={14} /> Apuntar
              </button>
            </div>
          </div>
        )}
      </GwWindow>
    </div>
  )
}

export function IncidenciasPage() {
  const { superAdmin, realAdmin } = usePermisos()
  const [lista, setLista] = useState<Incidencia[]>([])
  const [filtro, setFiltro] = useState<'vivas' | 'todas' | Incidencia['estado']>('vivas')
  // Desde el globo 📌 y el Panel de Control llega ya filtrado: ?tipo=tarea&quien=Luis(&id=…).
  const [params] = useSearchParams()
  const [tipo, setTipo] = useState<'' | Incidencia['tipo']>(() => (params.get('tipo') as Incidencia['tipo'] | null) ?? '')
  const [quien, setQuien] = useState(() => params.get('quien') ?? '')
  const [sel, setSel] = useState<number | null>(() => Number(params.get('id')) || null)
  const [nueva, setNueva] = useState(false)
  const [comentarios, setComentarios] = useState<Comentario[]>([])
  const [comentario, setComentario] = useState('')
  const [edicion, setEdicion] = useState<Partial<Incidencia>>({})
  const [error, setError] = useState<string | null>(null)
  const [ayuda, setAyuda] = useState(false)
  const puedeGestionar = superAdmin || realAdmin

  const cargar = useCallback(async () => {
    const { data, error: e } = await supabase
      .from('incidencia')
      .select(
        'id, tipo, titulo, descripcion, pantalla, prioridad, estado, reportado_por, reportado_en, asignado, solucion, commit_ref, resuelta_en, comprobada_por, comprobada_en, adjunto_nombre, adjunto_base64',
      )
      .order('reportado_en', { ascending: false })
      .limit(500)
    if (e) return setError(e.message)
    setLista((data ?? []) as Incidencia[])
  }, [])
  useEffect(() => {
    void cargar()
  }, [cargar])

  const actual = lista.find((x) => x.id === sel) ?? null
  useEffect(() => {
    setEdicion(actual ? { estado: actual.estado, asignado: actual.asignado, solucion: actual.solucion, prioridad: actual.prioridad } : {})
    setComentario('')
    if (!actual) return setComentarios([])
    supabase
      .from('incidencia_comentario')
      .select('id, autor, texto, creado_en')
      .eq('incidencia_id', actual.id)
      .order('id')
      .then(({ data }) => setComentarios((data ?? []) as Comentario[]))
  }, [actual])

  const filas = useMemo(
    () =>
      lista.filter(
        (x) =>
          (filtro === 'todas' ||
            (filtro === 'vivas' ? ['abierta', 'en_curso'].includes(x.estado) || (x.estado === 'resuelta' && x.tipo !== 'tarea') : x.estado === filtro)) &&
          (!quien || (x.asignado ?? '').split(' / ').includes(quien)) &&
          (!tipo || x.tipo === tipo),
      ),
    [lista, filtro, tipo, quien],
  )
  const cuenta = (e: Incidencia['estado']) => lista.filter((x) => x.estado === e).length

  const guardar = async () => {
    if (!actual) return
    const cambios: Record<string, unknown> = { ...edicion, actualizado_en: new Date().toISOString() }
    if (edicion.estado === 'resuelta' && actual.estado !== 'resuelta') cambios.resuelta_en = new Date().toISOString()
    if (edicion.estado === 'comprobada' && actual.estado !== 'comprobada') cambios.comprobada_en = new Date().toISOString()
    const { error: e } = await supabase.from('incidencia').update(cambios).eq('id', actual.id)
    if (e) return setError(e.message)
    setError(null)
    void cargar()
  }
  const comentar = async () => {
    if (!actual || !comentario.trim()) return
    const { error: e } = await supabase.from('incidencia_comentario').insert({ incidencia_id: actual.id, texto: comentario.trim() })
    if (e) return setError(e.message)
    setComentario('')
    const { data } = await supabase.from('incidencia_comentario').select('id, autor, texto, creado_en').eq('incidencia_id', actual.id).order('id')
    setComentarios((data ?? []) as Comentario[])
  }
  const verAdjunto = () => {
    if (!actual?.adjunto_base64) return
    const bin = atob(actual.adjunto_base64)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    const tipoMime = /\.pdf$/i.test(actual.adjunto_nombre ?? '') ? 'application/pdf' : 'image/png'
    window.open(URL.createObjectURL(new Blob([bytes], { type: tipoMime })), '_blank')
  }

  return (
    <div className="flex min-w-0 flex-col gap-1.5 text-[13px]">
      <div className="flex flex-wrap items-center gap-1.5 border border-[var(--gw-border-light)] bg-[var(--gw-face)] p-1.5">
        <button type="button" className="gw-btn font-bold" onClick={() => setNueva(true)}>
          <Plus size={14} /> Nueva incidencia
        </button>
        {(
          [
            ['vivas', 'Pendientes'],
            ['abierta', ESTADOS.abierta],
            ['en_curso', ESTADOS.en_curso],
            ['resuelta', ESTADOS.resuelta],
            ['comprobada', ESTADOS.comprobada],
            ['todas', 'Todas'],
          ] as const
        ).map(([f, t]) => (
          <button key={f} type="button" className={`gw-btn h-[24px] ${filtro === f ? 'bg-[#91c9f7] font-bold' : ''}`} onClick={() => setFiltro(f)}>
            {t}
            {f !== 'vivas' && f !== 'todas' ? ` (${cuenta(f)})` : ''}
          </button>
        ))}
        <GwSelect value={tipo} onChange={(e) => setTipo(e.target.value as '' | Incidencia['tipo'])} className="w-[120px]">
          <option value="">Todos los tipos</option>
          {(Object.keys(TIPOS) as Incidencia['tipo'][]).map((t) => (
            <option key={t} value={t}>
              {TIPOS[t]}
            </option>
          ))}
        </GwSelect>
        <GwSelect value={quien} onChange={(e) => setQuien(e.target.value)} className="w-[150px]" title="A quién le toca">
          <option value="">Le toque a quien le toque</option>
          {ASIGNADOS.map((a) => (
            <option key={a} value={a}>
              Le toca a {a}
            </option>
          ))}
        </GwSelect>
        <span className="flex-1" />
        <button type="button" className="gw-btn" onClick={() => setAyuda((a) => !a)}>
          Operativa
        </button>
      </div>
      {error && <div className="font-bold text-[#c42b1c]">{error}</div>}
      {ayuda && (
        <div className="border border-[var(--gw-border)] bg-white p-2">
          <GwOperativa
            bloques={[
              {
                titulo: 'Avisar de algo',
                pasos: [
                  'Desde cualquier pantalla, pulsa el 🐞 de la cabecera (arriba): se apunta con la pantalla en la que estás. También con «Nueva incidencia» aquí.',
                  'Elige si es un Fallo (algo no funciona como debe), una Mejora (algo que queréis distinto o nuevo), una Duda o una 📌 Tarea pendiente (algo que alguien tiene que hacer: configurar, traer datos, preguntar a la asesoría…). Cuenta qué hacías y qué pasó; si salió un mensaje de error, cópialo. Puedes adjuntar una captura.',
                ],
              },
              {
                titulo: 'Seguimiento',
                pasos: [
                  'Estados: 🔴 Abierta → 🟡 En curso → 🟢 Resuelta (con la solución) → ✔ Comprobada (cuando quien la apuntó ve que ya va bien).',
                  'Pincha una incidencia para ver el detalle, la solución y los comentarios, y para añadir uno.',
                  'Los administradores cambian el estado, quién la lleva y la solución. Quien la apuntó puede marcarla como comprobada.',
                  'Tareas: filtra «Le toca a …» para ver lo tuyo. Cuando la hagas, pon el estado 🟢 Resuelta (y en Solución, qué se hizo): desaparece de «Pendientes». Claude revisa las tareas y quita las que ya están hechas.',
                ],
              },
              {
                titulo: 'Bueno es saber',
                notas: [
                  'Los Claude revisan este registro al empezar a trabajar y apuntan aquí también los fallos que encuentran ellos.',
                  'Los fallos de programación los corrigen los Claude; vosotros solo tenéis que avisar y, al final, comprobar.',
                ],
              },
            ]}
          />
        </div>
      )}
      <div className="grid grid-cols-[minmax(0,1fr)_440px] gap-2 max-lg:grid-cols-1">
        <div className="min-h-[160px] overflow-auto border border-[var(--gw-border)] bg-white" style={{ maxHeight: 'calc(100vh - 250px)' }}>
          <table className="gw-grid">
            <thead className="sticky top-0">
              <tr>
                <th className="w-[45px]">Nº</th>
                <th className="w-[85px]">Tipo</th>
                <th>Qué pasa</th>
                <th className="w-[115px]">Estado</th>
                <th className="w-[95px]">Lo lleva</th>
                <th className="w-[95px]">Apuntado</th>
              </tr>
            </thead>
            <tbody>
              {filas.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-2 text-center text-[#666]">
                    No hay incidencias con este filtro.
                  </td>
                </tr>
              )}
              {filas.map((x) => (
                <tr
                  key={x.id}
                  className={`${sel === x.id ? 'gw-selected' : ''} ${x.prioridad === 'alta' && x.estado === 'abierta' ? 'font-bold text-[#c42b1c]' : ''}`}
                  onClick={() => setSel(x.id)}
                >
                  <td>{x.id}</td>
                  <td>{TIPOS[x.tipo]}</td>
                  <td className="truncate" title={x.descripcion ?? ''}>
                    {x.titulo}
                  </td>
                  <td>{ESTADOS[x.estado]}</td>
                  <td className="truncate">{x.asignado}</td>
                  <td>{fechaHora(x.reportado_en).split(',')[0]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {actual ? (
          <GwGroup title={`Incidencia Nº ${actual.id} · ${TIPOS[actual.tipo]}`}>
            <div className="flex flex-col gap-1.5">
              <b className="text-[14px]">{actual.titulo}</b>
              <div className="text-[12px] text-[#555]">
                Apuntada por {actual.reportado_por} el {fechaHora(actual.reportado_en)}
                {actual.pantalla ? ` · pantalla ${windowTitle(actual.pantalla) || actual.pantalla}` : ''}
              </div>
              {actual.descripcion && <div className="whitespace-pre-wrap border border-[var(--gw-border-light)] bg-[#fafafa] p-1.5">{actual.descripcion}</div>}
              {actual.adjunto_base64 && (
                <button type="button" className="gw-btn self-start" onClick={verAdjunto}>
                  <Paperclip size={14} /> Ver la captura ({actual.adjunto_nombre})
                </button>
              )}
              <div className="grid grid-cols-2 gap-1.5">
                <GwField label="Estado">
                  <GwSelect
                    value={edicion.estado ?? actual.estado}
                    disabled={!puedeGestionar && actual.estado !== 'resuelta'}
                    onChange={(e) => setEdicion({ ...edicion, estado: e.target.value as Incidencia['estado'] })}
                  >
                    {(Object.keys(ESTADOS) as Incidencia['estado'][]).map((s) => (
                      <option key={s} value={s} disabled={!puedeGestionar && s !== 'comprobada' && s !== actual.estado}>
                        {ESTADOS[s]}
                      </option>
                    ))}
                  </GwSelect>
                </GwField>
                <GwField label="Lo lleva">
                  <GwSelect
                    value={edicion.asignado ?? ''}
                    disabled={!puedeGestionar}
                    onChange={(e) => setEdicion({ ...edicion, asignado: e.target.value || null })}
                  >
                    <option value="">(sin asignar)</option>
                    {[...ASIGNADOS, ...COMPARTIDOS].map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </GwSelect>
                </GwField>
              </div>
              <GwField label="Solución">
                <GwTextArea
                  rows={3}
                  value={edicion.solucion ?? ''}
                  disabled={!puedeGestionar}
                  onChange={(e) => setEdicion({ ...edicion, solucion: e.target.value })}
                />
              </GwField>
              {actual.resuelta_en && <div className="text-[12px] text-[#127a12]">Resuelta el {fechaHora(actual.resuelta_en)}</div>}
              <button type="button" className="gw-btn self-end font-bold" onClick={() => void guardar()}>
                <Save size={14} /> Guardar
              </button>
              <b className="mt-1 flex items-center gap-1">
                <MessageSquarePlus size={15} /> Comentarios
              </b>
              <div className="flex max-h-[180px] flex-col gap-1 overflow-auto">
                {comentarios.length === 0 && <span className="text-[12px] text-[#666]">Sin comentarios.</span>}
                {comentarios.map((c) => (
                  <div key={c.id} className="border-l-2 border-[#91c9f7] pl-1.5">
                    <span className="text-[11px] text-[#555]">
                      {c.autor} · {fechaHora(c.creado_en)}
                    </span>
                    <div className="whitespace-pre-wrap">{c.texto}</div>
                  </div>
                ))}
              </div>
              <div className="flex gap-1.5">
                <GwInput value={comentario} onChange={(e) => setComentario(e.target.value)} placeholder="Añadir un comentario…" className="flex-1" />
                <button type="button" className="gw-btn" disabled={!comentario.trim()} onClick={() => void comentar()}>
                  Añadir
                </button>
              </div>
            </div>
          </GwGroup>
        ) : (
          <div className="flex flex-col items-center gap-2 p-4 text-center text-[#555]">
            <Bug size={28} />
            Pincha una incidencia para ver el detalle.
          </div>
        )}
      </div>
      {nueva && <NuevaIncidencia pantalla="/archivo/incidencias" onCerrar={() => setNueva(false)} onCreada={() => void cargar()} />}
    </div>
  )
}
