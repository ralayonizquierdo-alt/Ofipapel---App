// Compras → Gestor de Roturas (/gestor-roturas). Parte de Compras del Gestor de Roturas (tarea 32,
// docs/ROTURAS.md), que sustituye a la app RAX-OS «Devoluciones y Roturas»:
//   · Pendientes: lo que Almacén ha registrado. Compras decide: reclamar al proveedor (correo con
//     PDF y fotos, desde el buzón de Compras), separarlo para el proveedor o destruirlo como obsoleto.
//   · Reclamadas: a la espera de la respuesta del proveedor.
//   · Todos: cualquier expediente, con su historial, fotos y documentos.
// El cuadre del abono / compensación con género llega en la fase 5.
// Datos: migraciones 20261112_roturas_*.sql (fn_rotura_*).

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { supabase } from '../../../lib/supabase'
import { GwField, GwInput, GwSelect, GwWindow } from '../../../components/gw'
import { GwOperativa } from '../../../components/gw/GwOperativa'
import {
  anularRotura,
  cambiarEstadoRotura,
  destinosRotura,
  documentosRotura,
  enlaceDocumentoRotura,
  estadosRotura,
  subirDocumentoRotura,
  type DocumentoRotura,
  type EstadoRotura,
  type EstadoRoturaInfo,
  type ExpedienteRotura,
  type TipoDocumentoRotura,
} from '../../../lib/roturas'
import { asuntoReclamacion, cuerpoReclamacion, generarPdfReclamacion, type ItemReclamacion } from './reclamacionPdf'

type Pestana = 'pendientes' | 'reclamadas' | 'todos' | 'operativa'
const EN_CURSO: EstadoRotura[] = ['ABONO_PROVEEDOR', 'SEPARADO_PROVEEDOR', 'PENDIENTE', 'RECHAZADO']
const COLS =
  'id, numero, fecha, estado, articulo_codigo, articulo_referencia, articulo_descripcion, proveedor_codigo, almacen_codigo, cantidad, motivo, descripcion, origen_rotura, procedencia, empleado_solicitante_codigo, empleado_entrega, fecha_compra, importe_estimado, observaciones, reclamacion_enviada_en, reclamacion_correo_id, tipo_cuadre, pendiente_contabilizar, creado_offline, anulado_en, anulado_motivo, creado_por, creado_en, actualizado_en'

type Expediente = ExpedienteRotura & { reclamacion_correo_id: number | null }
interface Proveedor {
  codigo: string
  nombre: string
  email: string | null
}
interface CorreoEstado {
  id: number
  para: string
  enviado_en: string | null
  intentos: number
  error: string | null
}
interface Historial {
  id: number
  estado_anterior: EstadoRotura | null
  estado_nuevo: EstadoRotura
  empleado_codigo: string | null
  observaciones: string | null
  en: string
}

const th = 'border border-[var(--gw-border-light)] bg-[var(--gw-face)] px-1.5 py-0.5 text-left font-bold'
const td = 'border border-[var(--gw-border-light)] px-1.5 py-0.5'
const cant = (n: number) => new Intl.NumberFormat('es-ES', { maximumFractionDigits: 3 }).format(n)
const euros = (n: number | null) => (n == null ? '' : new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n))
const fecha = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('es-ES') : '')
const fechaHora = (iso: string) => new Date(iso).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })
const dias = (iso: string) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000))
const mensaje = (e: unknown) => (e instanceof Error ? e.message : String(e))

function Caja({ children, titulo }: { children: ReactNode; titulo?: ReactNode }) {
  return (
    <div className="border border-[var(--gw-border)] bg-white p-2">
      {titulo && <div className="mb-1 text-[14px] font-bold text-[#1d3a8a]">{titulo}</div>}
      {children}
    </div>
  )
}

export function GestorRoturasPage() {
  const [pestana, setPestana] = useState<Pestana>('pendientes')
  const [estados, setEstados] = useState<EstadoRoturaInfo[]>([])
  const [filas, setFilas] = useState<Expediente[]>([])
  const [proveedores, setProveedores] = useState<Record<string, Proveedor>>({})
  const [correos, setCorreos] = useState<Record<number, CorreoEstado>>({})
  const [cargando, setCargando] = useState(true)
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null)
  const [marcados, setMarcados] = useState<Set<number>>(new Set())
  const [abierto, setAbierto] = useState<number | null>(null)
  const [reclamando, setReclamando] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [filtroEstado, setFiltroEstado] = useState('')
  const [buscar, setBuscar] = useState('')

  const cargar = useCallback(async () => {
    setCargando(true)
    const { data, error } = await supabase.from('rotura_expediente').select(COLS).order('id', { ascending: false }).limit(2000)
    if (error) setAviso({ ok: false, texto: error.message })
    const lista = (data ?? []) as unknown as Expediente[]
    setFilas(lista)
    const codigos = [...new Set(lista.map((f) => f.proveedor_codigo))]
    if (codigos.length) {
      const { data: provs } = await supabase.from('proveedor').select('codigo, nombre, email').in('codigo', codigos)
      setProveedores(Object.fromEntries(((provs ?? []) as Proveedor[]).map((p) => [p.codigo, p])))
    }
    const idsCorreo = [...new Set(lista.map((f) => f.reclamacion_correo_id).filter((x): x is number => x != null))]
    if (idsCorreo.length) {
      const { data: cs } = await supabase.rpc('fn_rotura_correos', { p_ids: idsCorreo })
      setCorreos(Object.fromEntries(((cs ?? []) as CorreoEstado[]).map((c) => [c.id, c])))
    }
    setCargando(false)
  }, [])

  useEffect(() => {
    estadosRotura().then(setEstados).catch(() => setEstados([]))
    void cargar()
  }, [cargar])

  const info = useMemo(() => Object.fromEntries(estados.map((e) => [e.codigo, e])), [estados])
  const nombreProv = useCallback((c: string) => proveedores[c]?.nombre ?? c, [proveedores])
  const vivos = useMemo(() => filas.filter((f) => !f.anulado_en), [filas])
  const pendientes = useMemo(() => vivos.filter((f) => f.estado === 'PENDIENTE_COMPRAS').sort((a, b) => nombreProv(a.proveedor_codigo).localeCompare(nombreProv(b.proveedor_codigo)) || a.id - b.id), [vivos, nombreProv])
  const reclamadas = useMemo(() => vivos.filter((f) => EN_CURSO.includes(f.estado)), [vivos])
  const todos = useMemo(() => {
    const t = buscar.trim().toLowerCase()
    return filas.filter(
      (f) =>
        (!filtroEstado || (filtroEstado === 'ANULADO' ? !!f.anulado_en : f.estado === filtroEstado && !f.anulado_en)) &&
        (!t || [f.numero, f.articulo_codigo, f.articulo_descripcion, f.articulo_referencia ?? '', nombreProv(f.proveedor_codigo)].some((x) => x.toLowerCase().includes(t))),
    )
  }, [filas, filtroEstado, buscar, nombreProv])

  const elegidos = useMemo(() => pendientes.filter((f) => marcados.has(f.id)), [pendientes, marcados])
  const proveedorElegido = elegidos.length && new Set(elegidos.map((f) => f.proveedor_codigo)).size === 1 ? elegidos[0].proveedor_codigo : null

  const marcar = (id: number) =>
    setMarcados((m) => {
      const n = new Set(m)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  /** Mueve los marcados al mismo estado (sin correo): separar para el proveedor o destruir como obsoleto. */
  async function moverMarcados(destino: EstadoRotura, pregunta: string) {
    if (!elegidos.length || !confirm(pregunta)) return
    setOcupado(true)
    setAviso(null)
    let hechos = 0
    try {
      for (const f of elegidos) {
        await cambiarEstadoRotura(f.id, destino)
        hechos++
      }
      setAviso({ ok: true, texto: `${hechos} expediente(s) pasados a «${info[destino]?.nombre ?? destino}».` })
    } catch (e) {
      setAviso({ ok: false, texto: `${mensaje(e)} (${hechos} hechos antes del fallo).` })
    } finally {
      setOcupado(false)
      setMarcados(new Set())
      void cargar()
    }
  }

  const estadoCorreo = (f: Expediente) => {
    const c = f.reclamacion_correo_id != null ? correos[f.reclamacion_correo_id] : null
    if (!c) return f.reclamacion_enviada_en ? { texto: 'Reclamado', color: '#555', c: null } : null
    if (c.enviado_en) return { texto: `Correo enviado ${fecha(c.enviado_en)}`, color: '#127a12', c }
    if (c.error) return { texto: `Correo NO enviado: ${c.error}`, color: '#c42b1c', c }
    return { texto: 'Correo en la cola', color: '#8a5a00', c }
  }

  async function reintentar(correoId: number) {
    setAviso(null)
    const { error } = await supabase.rpc('fn_rotura_correo_reintentar', { p_correo: correoId })
    if (error) return setAviso({ ok: false, texto: error.message })
    await supabase.functions.invoke('correo-enviar', { body: {} }).catch(() => null)
    setAviso({ ok: true, texto: 'Reintento lanzado. Mira el estado del correo en la lista.' })
    void cargar()
  }

  const tabla = (lista: Expediente[], conMarca: boolean, conCorreo: boolean) => (
    <div className="max-h-[46vh] overflow-auto">
      <table className="w-full border-collapse">
        <thead className="sticky top-0">
          <tr>
            {conMarca && <th className={th} />}
            <th className={th}>Nº</th>
            <th className={th}>Fecha</th>
            <th className={th}>Proveedor</th>
            <th className={th}>Código</th>
            <th className={th}>Artículo</th>
            <th className={`${th} text-right`}>Cant.</th>
            <th className={`${th} text-right`}>Importe est.</th>
            <th className={th}>Motivo</th>
            <th className={th}>Situación</th>
            {conCorreo && <th className={th}>Reclamación</th>}
          </tr>
        </thead>
        <tbody>
          {lista.map((f) => {
            const ec = conCorreo ? estadoCorreo(f) : null
            return (
              <tr key={f.id} className={`cursor-pointer ${abierto === f.id ? 'bg-[#91c9f7]' : marcados.has(f.id) && conMarca ? 'bg-[#dbeeff]' : 'hover:bg-[#eef6ff]'}`} onClick={() => setAbierto(f.id)}>
                {conMarca && (
                  <td
                    className={`${td} text-center`}
                    onClick={(e) => {
                      e.stopPropagation()
                      marcar(f.id)
                    }}
                  >
                    <input type="checkbox" checked={marcados.has(f.id)} readOnly aria-label={`Marcar ${f.numero}`} />
                  </td>
                )}
                <td className={`${td} whitespace-nowrap font-bold`}>{f.numero}</td>
                <td className={`${td} whitespace-nowrap`}>{fecha(f.fecha)}</td>
                <td className={td}>{nombreProv(f.proveedor_codigo)}</td>
                <td className={td}>{f.articulo_codigo}</td>
                <td className={td}>{f.articulo_descripcion}</td>
                <td className={`${td} text-right`}>{cant(f.cantidad)}</td>
                <td className={`${td} text-right`}>{euros(f.importe_estimado)}</td>
                <td className={td}>{f.motivo}</td>
                <td className={`${td} whitespace-nowrap`}>
                  {f.anulado_en ? (
                    <span className="font-bold text-[#c42b1c]">ANULADO</span>
                  ) : (
                    <span className="font-bold" style={{ color: info[f.estado]?.color }}>
                      {info[f.estado]?.nombre ?? f.estado}
                    </span>
                  )}
                  {!f.anulado_en && !info[f.estado]?.final && <span className="text-[#555]"> · {dias(f.actualizado_en)} d</span>}
                </td>
                {conCorreo && (
                  <td className={td}>
                    {ec && <span style={{ color: ec.color }}>{ec.texto}</span>}
                    {ec?.c && !ec.c.enviado_en && ec.c.error && (
                      <button
                        type="button"
                        className="gw-btn ml-1 h-[22px]"
                        onClick={(e) => {
                          e.stopPropagation()
                          void reintentar(ec.c!.id)
                        }}
                      >
                        Reintentar
                      </button>
                    )}
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )

  const PESTANAS: [Pestana, string][] = [
    ['pendientes', `Pendientes de Compras (${pendientes.length})`],
    ['reclamadas', `Reclamadas (${reclamadas.length})`],
    ['todos', 'Todos'],
    ['operativa', 'Operativa'],
  ]
  const abiertoFila = filas.find((f) => f.id === abierto) ?? null

  return (
    <div className="flex min-w-0 flex-col gap-1.5 text-[13px]">
      <div className="flex flex-wrap items-center gap-1 border border-[var(--gw-border-light)] bg-[var(--gw-face)] p-1.5">
        {PESTANAS.map(([p, t]) => (
          <button
            key={p}
            type="button"
            className={`gw-btn h-[26px] ${pestana === p ? 'bg-[#91c9f7] font-bold' : ''}`}
            onClick={() => {
              setPestana(p)
              setAbierto(null)
            }}
          >
            {t}
          </button>
        ))}
        <span className="flex-1" />
        <button type="button" className="gw-btn h-[26px]" onClick={() => void cargar()}>
          Actualizar
        </button>
      </div>
      {aviso && <div className={`font-bold ${aviso.ok ? 'text-[#127a12]' : 'text-[#c42b1c]'}`}>{aviso.texto}</div>}

      {pestana === 'pendientes' && (
        <Caja titulo="Roturas registradas por Almacén: decide qué se hace con cada una">
          <div className="mb-1 flex flex-wrap items-center gap-1">
            <button
              type="button"
              className="gw-btn h-[28px] font-bold"
              disabled={!proveedorElegido || ocupado}
              title={elegidos.length && !proveedorElegido ? 'Una reclamación es de un solo proveedor: marca expedientes del mismo' : 'Envía el correo de reclamación con el PDF y las fotos'}
              onClick={() => setReclamando(true)}
            >
              ✉ Reclamar al proveedor ({elegidos.length})
            </button>
            <button type="button" className="gw-btn h-[28px]" disabled={!elegidos.length || ocupado} onClick={() => void moverMarcados('SEPARADO_PROVEEDOR', `¿Separar ${elegidos.length} expediente(s) para que los recoja el proveedor? (Sin enviar correo.)`)}>
              Separar para el proveedor
            </button>
            <button type="button" className="gw-btn h-[28px]" disabled={!elegidos.length || ocupado} onClick={() => void moverMarcados('OBSOLETO_DESTRUIR', `¿Destruir ${elegidos.length} expediente(s) como obsoletos, sin reclamar al proveedor?`)}>
              Destruir como obsoleto
            </button>
            {elegidos.length > 0 && !proveedorElegido && <span className="text-[#8a5a00]">Para reclamar, marca expedientes de un solo proveedor.</span>}
          </div>
          {cargando ? <div>Cargando…</div> : pendientes.length ? tabla(pendientes, true, false) : <div className="text-[#555]">No hay roturas pendientes de decidir.</div>}
        </Caja>
      )}

      {pestana === 'reclamadas' && (
        <Caja titulo="A la espera del proveedor">
          {cargando ? <div>Cargando…</div> : reclamadas.length ? tabla(reclamadas, false, true) : <div className="text-[#555]">No hay nada reclamado ni separado.</div>}
          <div className="mt-1 text-[12px] text-[#555]">Pulsa un expediente para ver su historial y cambiar su situación según lo que conteste el proveedor.</div>
        </Caja>
      )}

      {pestana === 'todos' && (
        <Caja titulo={`Todos los expedientes (${todos.length})`}>
          <div className="mb-1 flex flex-wrap items-end gap-2">
            <GwField label="Situación">
              <GwSelect className="w-[230px]" value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)}>
                <option value="">Todas</option>
                {estados.map((e) => (
                  <option key={e.codigo} value={e.codigo}>
                    {e.nombre}
                  </option>
                ))}
                <option value="ANULADO">Anulados</option>
              </GwSelect>
            </GwField>
            <GwField label="Buscar (nº, artículo, proveedor)">
              <GwInput className="w-[280px]" value={buscar} onChange={(e) => setBuscar(e.target.value)} />
            </GwField>
          </div>
          {cargando ? <div>Cargando…</div> : todos.length ? tabla(todos, false, true) : <div className="text-[#555]">No hay expedientes con ese filtro.</div>}
        </Caja>
      )}

      {pestana === 'operativa' && <Operativa />}

      {abiertoFila && pestana !== 'operativa' && (
        <Detalle
          key={abiertoFila.id}
          f={abiertoFila}
          info={info}
          proveedor={nombreProv(abiertoFila.proveedor_codigo)}
          onCambio={(texto) => {
            setAviso({ ok: true, texto })
            void cargar()
          }}
          onCerrar={() => setAbierto(null)}
        />
      )}

      {reclamando && proveedorElegido && (
        <Reclamar
          expedientes={elegidos}
          proveedor={proveedores[proveedorElegido] ?? { codigo: proveedorElegido, nombre: proveedorElegido, email: null }}
          onCerrar={() => setReclamando(false)}
          onHecho={(texto, ok) => {
            setReclamando(false)
            setMarcados(new Set())
            setAviso({ ok, texto })
            void cargar()
          }}
        />
      )}
    </div>
  )
}

// ------------------------------------------------------------------ Ficha del expediente
function Detalle({ f, info, proveedor, onCambio, onCerrar }: { f: Expediente; info: Record<string, EstadoRoturaInfo>; proveedor: string; onCambio: (texto: string) => void; onCerrar: () => void }) {
  const [docs, setDocs] = useState<DocumentoRotura[]>([])
  const [miniaturas, setMiniaturas] = useState<Record<string, string>>({})
  const [historial, setHistorial] = useState<Historial[]>([])
  const [destinos, setDestinos] = useState<{ estado: EstadoRotura; nombre: string; solo_proceso: boolean }[]>([])
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [tipoDoc, setTipoDoc] = useState<TipoDocumentoRotura>('FACTURA')

  const cargar = useCallback(async () => {
    try {
      const [d, h, dest] = await Promise.all([
        documentosRotura(f.id),
        supabase.from('rotura_historial').select('id, estado_anterior, estado_nuevo, empleado_codigo, observaciones, en').eq('expediente_id', f.id).order('id'),
        f.anulado_en ? Promise.resolve([]) : destinosRotura(f.id),
      ])
      setDocs(d)
      setHistorial((h.data ?? []) as Historial[])
      setDestinos(dest)
      const fotos = d.filter((x) => x.tipo === 'FOTO').slice(0, 8)
      const enlaces = await Promise.all(fotos.map((x) => enlaceDocumentoRotura(x.ruta).catch(() => '')))
      setMiniaturas(Object.fromEntries(fotos.map((x, i) => [x.ruta, enlaces[i]])))
    } catch (e) {
      setError(mensaje(e))
    }
  }, [f.id, f.anulado_en])
  useEffect(() => void cargar(), [cargar])

  async function mover(destino: EstadoRotura, nombre: string) {
    const obs = prompt(`Pasar ${f.numero} a «${nombre}».\nObservaciones (opcional): lo que ha contestado el proveedor, etc.`)
    if (obs === null) return
    setOcupado(true)
    setError(null)
    try {
      await cambiarEstadoRotura(f.id, destino, obs)
      onCambio(`${f.numero} pasa a «${nombre}».`)
    } catch (e) {
      setError(mensaje(e))
    } finally {
      setOcupado(false)
    }
  }

  async function anular() {
    const motivo = prompt(`Anular ${f.numero}. Las unidades vuelven del Almacén 06 a su almacén.\nMotivo (obligatorio):`)
    if (!motivo?.trim()) return
    setOcupado(true)
    setError(null)
    try {
      await anularRotura(f.id, motivo)
      onCambio(`${f.numero} anulado.`)
    } catch (e) {
      setError(mensaje(e))
    } finally {
      setOcupado(false)
    }
  }

  async function abrir(ruta: string) {
    try {
      window.open(await enlaceDocumentoRotura(ruta), '_blank', 'noopener')
    } catch (e) {
      setError(mensaje(e))
    }
  }

  async function subir(archivos: FileList | null) {
    if (!archivos?.length) return
    setOcupado(true)
    setError(null)
    try {
      for (const a of Array.from(archivos)) await subirDocumentoRotura(f.id, a, tipoDoc)
      await cargar()
    } catch (e) {
      setError(mensaje(e))
    } finally {
      setOcupado(false)
    }
  }

  const dato = (etiqueta: string, valor: ReactNode) =>
    valor ? (
      <div>
        <span className="text-[#555]">{etiqueta}: </span>
        <b>{valor}</b>
      </div>
    ) : null
  const directos = destinos.filter((d) => !d.solo_proceso)

  return (
    <Caja
      titulo={
        <span className="flex flex-wrap items-center gap-2">
          {f.numero}
          {f.anulado_en ? (
            <span className="text-[#c42b1c]">ANULADO</span>
          ) : (
            <span style={{ color: info[f.estado]?.color }}>{info[f.estado]?.nombre ?? f.estado}</span>
          )}
          <span className="flex-1" />
          <button type="button" className="gw-btn h-[24px] font-normal text-black" onClick={onCerrar}>
            Cerrar ficha
          </button>
        </span>
      }
    >
      {error && <div className="mb-1 font-bold text-[#c42b1c]">{error}</div>}
      <div className="grid gap-x-6 gap-y-0.5 md:grid-cols-2">
        {dato('Artículo', `${f.articulo_codigo} · ${f.articulo_descripcion}`)}
        {dato('Proveedor', `${proveedor} (${f.proveedor_codigo})`)}
        {dato('Cantidad', cant(f.cantidad))}
        {dato('Importe estimado', euros(f.importe_estimado))}
        {dato('Motivo', f.descripcion ? `${f.motivo}. ${f.descripcion}` : f.motivo)}
        {dato('Dónde se rompió', f.origen_rotura)}
        {dato('Almacén de origen', f.almacen_codigo)}
        {dato('Ref. proveedor', f.articulo_referencia)}
        {dato('Registrado por', f.creado_por)}
        {dato('Entrega la mercancía', f.empleado_entrega)}
        {dato('Registrado', `${fechaHora(f.creado_en)}${f.creado_offline ? ' (sin cobertura)' : ''}`)}
        {dato('Reclamación enviada', f.reclamacion_enviada_en ? fechaHora(f.reclamacion_enviada_en) : null)}
        {dato('Observaciones', f.observaciones)}
        {dato('Anulado', f.anulado_en ? `${fechaHora(f.anulado_en)} · ${f.anulado_motivo ?? ''}` : null)}
      </div>

      {!f.anulado_en && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1 border-t border-[var(--gw-border-light)] pt-1.5">
          <span className="text-[#555]">Pasar a:</span>
          {directos.map((d) => (
            <button key={d.estado} type="button" className="gw-btn h-[26px]" disabled={ocupado} onClick={() => void mover(d.estado, d.nombre)}>
              {d.nombre}
            </button>
          ))}
          {!directos.length && <span className="text-[#555]">(ningún cambio directo desde aquí)</span>}
          {destinos.some((d) => d.solo_proceso) && <span className="text-[12px] text-[#555]">· El abono, la compensación y la destrucción tienen su propia pantalla.</span>}
          <span className="flex-1" />
          {!info[f.estado]?.final && !f.tipo_cuadre && (
            <button type="button" className="gw-btn h-[26px] text-[#c42b1c]" disabled={ocupado} onClick={() => void anular()}>
              Anular expediente
            </button>
          )}
        </div>
      )}

      <div className="mt-1.5 grid gap-2 md:grid-cols-2">
        <div>
          <div className="font-bold">Fotos y documentos ({docs.length})</div>
          <div className="flex flex-wrap gap-1">
            {docs
              .filter((d) => d.tipo === 'FOTO' && miniaturas[d.ruta])
              .map((d) => (
                <button key={d.id} type="button" title={d.nombre} onClick={() => void abrir(d.ruta)}>
                  <img src={miniaturas[d.ruta]} alt={d.nombre} className="h-[84px] w-[84px] border border-[var(--gw-border)] object-cover" />
                </button>
              ))}
          </div>
          <ul>
            {docs
              .filter((d) => d.tipo !== 'FOTO')
              .map((d) => (
                <li key={d.id}>
                  <button type="button" className="text-[#1d3a8a] underline" onClick={() => void abrir(d.ruta)}>
                    [{d.tipo}] {d.nombre}
                  </button>{' '}
                  <span className="text-[#555]">{fechaHora(d.creado_en)}</span>
                </li>
              ))}
          </ul>
          {!f.anulado_en && (
            <div className="mt-1 flex flex-wrap items-center gap-1">
              <GwSelect className="w-[120px]" value={tipoDoc} onChange={(e) => setTipoDoc(e.target.value as TipoDocumentoRotura)}>
                {(['FACTURA', 'ABONO', 'ALBARAN', 'EMAIL', 'FOTO', 'PDF', 'OTRO'] as TipoDocumentoRotura[]).map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </GwSelect>
              <input type="file" multiple disabled={ocupado} onChange={(e) => void subir(e.target.files)} />
            </div>
          )}
        </div>
        <div>
          <div className="font-bold">Historial (no se puede modificar)</div>
          <table className="w-full border-collapse">
            <tbody>
              {historial.map((h) => (
                <tr key={h.id}>
                  <td className={`${td} whitespace-nowrap`}>{fechaHora(h.en)}</td>
                  <td className={td}>{h.empleado_codigo ?? ''}</td>
                  <td className={td}>
                    <b>{info[h.estado_nuevo]?.nombre ?? h.estado_nuevo}</b>
                    {h.observaciones ? ` · ${h.observaciones}` : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Caja>
  )
}

// ------------------------------------------------------------------ Reclamar por correo
function Reclamar({ expedientes, proveedor, onCerrar, onHecho }: { expedientes: Expediente[]; proveedor: Proveedor; onCerrar: () => void; onHecho: (texto: string, ok: boolean) => void }) {
  const hoy = new Date().toLocaleDateString('es-ES')
  const [para, setPara] = useState(proveedor.email ?? '')
  const [asunto, setAsunto] = useState(asuntoReclamacion(hoy))
  const [cuerpo, setCuerpo] = useState(cuerpoReclamacion(proveedor.nombre, expedientes.length))
  const [conFotos, setConFotos] = useState(true)
  const [paso, setPaso] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function enviar() {
    setError(null)
    if (!para.trim()) return setError('Escribe el correo del proveedor.')
    try {
      setPaso('Preparando el PDF…')
      const items: ItemReclamacion[] = []
      for (const f of expedientes) {
        let fotos: string[] = []
        if (conFotos) {
          const docs = (await documentosRotura(f.id)).filter((d) => d.tipo === 'FOTO')
          fotos = (await Promise.all(docs.map((d) => enlaceDocumentoRotura(d.ruta).catch(() => '')))).filter(Boolean)
        }
        items.push({ numero: f.numero, codigo: f.articulo_codigo, referencia: f.articulo_referencia, descripcion: f.articulo_descripcion, cantidad: f.cantidad, motivo: f.motivo, detalle: f.descripcion, fotos })
      }
      const { pdf, aviso } = await generarPdfReclamacion(proveedor.nombre, hoy, items)
      // El PDF se guarda en la carpeta del primer expediente (el de menor id): así lo exige el servidor.
      const primero = Math.min(...expedientes.map((f) => f.id))
      const ruta = `${primero}/${crypto.randomUUID()}-reclamacion.pdf`
      setPaso('Guardando el PDF…')
      const { error: errSubida } = await supabase.storage.from('roturas').upload(ruta, pdf, { contentType: 'application/pdf', upsert: false })
      if (errSubida) throw new Error(`No se ha podido guardar el PDF: ${errSubida.message}`)
      setPaso('Enviando el correo…')
      const { data, error: errRpc } = await supabase.rpc('fn_rotura_reclamar', { p_ids: expedientes.map((f) => f.id), p_para: para, p_asunto: asunto, p_cuerpo: cuerpo, p_pdf_ruta: ruta })
      if (errRpc) throw new Error(errRpc.message)
      // Que salga ya, sin esperar a los 10 minutos del programador de la cola.
      await supabase.functions.invoke('correo-enviar', { body: {} }).catch(() => null)
      const correoId = (data as { correo_id: number }).correo_id
      const { data: cs } = await supabase.rpc('fn_rotura_correos', { p_ids: [correoId] })
      const c = ((cs ?? []) as CorreoEstado[])[0]
      const n = expedientes.length
      if (c?.enviado_en) onHecho(`Reclamación enviada a ${para}: ${n} expediente(s).${aviso ? ' ' + aviso : ''}`, true)
      else if (c?.error) onHecho(`Los ${n} expediente(s) quedan como reclamados, pero el correo NO ha salido: ${c.error} Mira «Reclamadas» y pulsa Reintentar.`, false)
      else onHecho(`Reclamación preparada para ${para} (${n} expediente(s)). El correo está en la cola y saldrá en unos minutos.${aviso ? ' ' + aviso : ''}`, true)
    } catch (e) {
      setError(mensaje(e))
      setPaso(null)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-black/20 p-3">
      <GwWindow title={`Reclamar a ${proveedor.nombre}`} onClose={paso ? undefined : onCerrar} className="w-[720px] max-w-full">
        <div className="flex flex-col gap-1.5 p-1 text-[13px]">
          <div className="max-h-[130px] overflow-auto border border-[var(--gw-border-light)]">
            <table className="w-full border-collapse">
              <tbody>
                {expedientes.map((f) => (
                  <tr key={f.id}>
                    <td className={`${td} whitespace-nowrap font-bold`}>{f.numero}</td>
                    <td className={td}>{f.articulo_codigo}</td>
                    <td className={td}>{f.articulo_descripcion}</td>
                    <td className={`${td} text-right`}>{cant(f.cantidad)}</td>
                    <td className={td}>{f.motivo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <GwField label="Para (correo del proveedor; varios separados por ;)">
            <GwInput className="w-full" value={para} onChange={(e) => setPara(e.target.value)} placeholder="reclamaciones@proveedor.com" />
          </GwField>
          {!proveedor.email && <div className="text-[#8a5a00]">Este proveedor no tiene correo en su ficha: escríbelo aquí (y conviene ponerlo en Compras → Proveedores).</div>}
          <GwField label="Asunto">
            <GwInput className="w-full" value={asunto} onChange={(e) => setAsunto(e.target.value)} />
          </GwField>
          <GwField label="Texto del correo">
            <textarea className="gw-input min-h-[190px] w-full resize-y p-1" value={cuerpo} onChange={(e) => setCuerpo(e.target.value)} />
          </GwField>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={conFotos} onChange={(e) => setConFotos(e.target.checked)} /> Incluir las fotos en el PDF
          </label>
          <div className="text-[12px] text-[#555]">Sale desde el buzón de Compras, con el PDF adjunto, y las respuestas vuelven a Compras. Los expedientes pasan a «Reclamado al proveedor».</div>
          {error && <div className="font-bold text-[#c42b1c]">{error}</div>}
          <div className="flex items-center justify-end gap-1.5">
            {paso && <span className="font-bold text-[#1d3a8a]">{paso}</span>}
            <button type="button" className="gw-btn w-[150px] font-bold" disabled={!!paso} onClick={() => void enviar()}>
              Enviar reclamación
            </button>
            <button type="button" className="gw-btn w-[90px]" disabled={!!paso} onClick={onCerrar}>
              Cancelar
            </button>
          </div>
        </div>
      </GwWindow>
    </div>
  )
}

// ------------------------------------------------------------------ Operativa
function Operativa() {
  return (
    <Caja>
      <GwOperativa
        bloques={[
          {
            titulo: 'Qué es',
            notas: [
              'Aquí llegan las roturas que registra Almacén (Almacén → Petición de Abono). Las unidades ya están en el Almacén 06: el programa las pasa solo.',
              'Compras decide qué se hace con cada una y sigue la respuesta del proveedor hasta que se abona, se compensa o se destruye.',
            ],
          },
          {
            titulo: 'Pendientes de Compras',
            pasos: [
              'Marca los expedientes de UN proveedor y pulsa «Reclamar al proveedor».',
              'Revisa el correo (para, asunto y texto) y pulsa «Enviar reclamación».',
            ],
            notas: [
              'El programa hace un PDF con la lista de artículos y las fotos, y lo manda adjunto desde el buzón de Compras. Las respuestas vuelven a Compras.',
              'Si el proveedor no tiene correo en su ficha, escríbelo en la ventana. Mejor ponerlo en Compras → Proveedores.',
              '«Separar para el proveedor»: si ya has hablado con él y va a venir a recogerlo. No manda correo. Almacén lo ve en «Separados» y saca la etiqueta de la caja.',
              '«Destruir como obsoleto»: cuando no merece la pena reclamar. Pasa a Almacén para destruir y se da de baja del 06 al confirmarlo.',
            ],
          },
          {
            titulo: 'Reclamadas',
            notas: [
              'La columna «Reclamación» dice si el correo ha salido. Si pone «NO enviado», lee el motivo, corrígelo y pulsa «Reintentar».',
              'Pulsa un expediente para abrir su ficha. Con «Pasar a» apuntas lo que conteste el proveedor: pendiente de respuesta, separado (vendrá a recogerlo) o rechazado.',
              'Un rechazado se puede pasar a «Obsoleto: destruir».',
              'El abono y la compensación con género se apuntarán desde el cuadre del documento del proveedor (pantalla en preparación).',
            ],
          },
          {
            titulo: 'La ficha del expediente',
            notas: [
              'Fotos, documentos e historial. El historial no se puede cambiar ni borrar: cada paso queda con su fecha y quién lo hizo.',
              'Puedes adjuntar la factura de abono, el albarán o el correo del proveedor.',
              'Un expediente no se borra: se anula, con motivo. Al anularlo, las unidades vuelven del Almacén 06 a su almacén.',
            ],
          },
        ]}
      />
    </Caja>
  )
}
