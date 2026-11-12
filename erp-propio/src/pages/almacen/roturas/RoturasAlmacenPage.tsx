// Almacén → Roturas (/roturas-peticion; /roturas-destruccion abre la misma pantalla en «Para destruir»).
// Una sola entrada de menú: registrar lo ve todo el mundo; destruir y separados, quien tiene ese permiso.
// Parte de Almacén del Gestor de Roturas (tarea 32, docs/ROTURAS.md), que sustituye a la app RAX-OS:
//   · Registrar rotura: el artículo roto, cuántos, por qué y fotos. Vale sin cobertura (se guarda en
//     el móvil y se envía solo). Al registrar, el ERP pasa las unidades al Almacén 06.
//   · Para destruir: lo que Compras ya ha resuelto. Al confirmar, queda destruido (y de baja si era obsoleto).
//   · Separados: lo que el proveedor ha dicho que recogerá, con la etiqueta para pegar en la caja.
// Datos: migraciones 20261112_roturas_*.sql (fn_rotura_crear, fn_rotura_destruir).

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { supabase } from '../../../lib/supabase'
import { GwField, GwInput, GwSelect } from '../../../components/gw'
import { GwOperativa } from '../../../components/gw/GwOperativa'
import { usePermisos } from '../../../lib/PermisosContext'
import { ORIGENES_ROTURA, type EstadoRotura, type EstadoRoturaInfo, type ExpedienteRotura, type OrigenRotura, estadosRotura } from '../../../lib/roturas'
import { enviarRotura, esFalloDeRed, guardarPendienteRotura, pendientesRotura, quitarPendienteRotura, sincronizarRoturas, type RoturaPendiente } from '../../../lib/roturasPendientes'

type Pestana = 'registrar' | 'destruir' | 'separados' | 'operativa'
const PESTANAS: [Pestana, string][] = [
  ['registrar', 'Registrar rotura'],
  ['destruir', 'Para destruir'],
  ['separados', 'Separados'],
  ['operativa', 'Operativa'],
]

const MOTIVOS = ['Caja aplastada', 'Producto roto', 'Producto derramado / manchado', 'Mal estado de fábrica', 'Otro']
const ALMACEN_ROTURAS = '06'
const POR_DESTRUIR: EstadoRotura[] = ['OBSOLETO_DESTRUIR', 'ABONADO_DESTRUIR', 'COMPENSADO_DESTRUIR', 'RECHAZADO']
const COLS =
  'id, numero, fecha, estado, articulo_codigo, articulo_referencia, articulo_descripcion, proveedor_codigo, almacen_codigo, cantidad, motivo, descripcion, origen_rotura, actualizado_en, creado_en'

const th = 'border border-[var(--gw-border-light)] bg-[var(--gw-face)] px-1.5 py-0.5 text-left font-bold'
const td = 'border border-[var(--gw-border-light)] px-1.5 py-0.5'
const html = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
const cant = (n: number) => new Intl.NumberFormat('es-ES', { maximumFractionDigits: 3 }).format(n)
const fecha = (iso: string) => new Date(iso).toLocaleDateString('es-ES')
const dias = (iso: string) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000))

function Caja({ children, titulo }: { children: ReactNode; titulo?: ReactNode }) {
  return (
    <div className="border border-[var(--gw-border)] bg-white p-2">
      {titulo && <div className="mb-1 text-[14px] font-bold text-[#1d3a8a]">{titulo}</div>}
      {children}
    </div>
  )
}

/** Abre una ventana con el HTML dado y lanza la impresión (etiquetas y listados). */
function imprimir(titulo: string, cuerpo: string, estilos = '') {
  const w = window.open('', '_blank')
  if (!w) return alert('El navegador ha bloqueado la ventana de impresión. Permite las ventanas emergentes para esta página.')
  w.document.write(
    `<!doctype html><html><head><meta charset="utf-8"><title>${html(titulo)}</title><style>` +
      `body{font-family:Arial,Helvetica,sans-serif;color:#000;margin:10mm}table{border-collapse:collapse;width:100%}` +
      `th,td{border:1px solid #000;padding:3px 6px;font-size:12px;text-align:left}th{background:#eee}${estilos}` +
      `</style></head><body>${cuerpo}</body></html>`,
  )
  w.document.close()
  w.focus()
  setTimeout(() => w.print(), 300)
}

async function nombresProveedor(codigos: string[]): Promise<Record<string, string>> {
  const unicos = [...new Set(codigos)].filter(Boolean)
  if (!unicos.length) return {}
  const { data } = await supabase.from('proveedor').select('codigo, nombre').in('codigo', unicos)
  return Object.fromEntries(((data ?? []) as { codigo: string; nombre: string }[]).map((p) => [p.codigo, p.nombre]))
}

export function RoturasAlmacenPage({ inicial = 'registrar' }: { inicial?: Pestana }) {
  const [pestana, setPestana] = useState<Pestana>(inicial)
  const [estados, setEstados] = useState<EstadoRoturaInfo[]>([])
  // Registrar lo ve todo el mundo; destruir y separados, solo Almacén, Compras y Gerencia.
  const { tiene } = usePermisos()
  const destruye = tiene('/roturas-destruccion')
  const visibles = PESTANAS.filter(([p]) => destruye || p === 'registrar' || p === 'operativa')
  useEffect(() => setPestana(inicial !== 'registrar' && !destruye ? 'registrar' : inicial), [inicial, destruye])
  useEffect(() => {
    estadosRotura().then(setEstados).catch(() => setEstados([]))
  }, [])
  return (
    <div className="flex min-w-0 flex-col gap-1.5 text-[13px]">
      <div className="flex flex-wrap items-center gap-1 border border-[var(--gw-border-light)] bg-[var(--gw-face)] p-1.5">
        {visibles.map(([p, t]) => (
          <button key={p} type="button" className={`gw-btn h-[28px] ${pestana === p ? 'bg-[#91c9f7] font-bold' : ''}`} onClick={() => setPestana(p)}>
            {t}
          </button>
        ))}
      </div>
      {pestana === 'registrar' && <Registrar />}
      {pestana === 'destruir' && destruye && <ParaDestruir estados={estados} />}
      {pestana === 'separados' && destruye && <Separados />}
      {pestana === 'operativa' && <Operativa />}
    </div>
  )
}

// ------------------------------------------------------------------ Registrar rotura
interface ArticuloElegido {
  codigo_interno: string
  descripcion: string
  proveedor_habitual_codigo: string | null
  codigo_compra_habitual: string | null
}
const ART = 'codigo_interno, descripcion, proveedor_habitual_codigo, codigo_compra_habitual'

async function buscarArticulos(texto: string): Promise<ArticuloElegido[]> {
  const t = texto.trim()
  if (t.length < 2) return []
  const exacto = await supabase.from('articulo').select(ART).or(`codigo_interno.eq.${t},codigo_barras_principal.eq.${t}`).limit(5)
  if (exacto.data?.length) return exacto.data as ArticuloElegido[]
  const { data: barra } = await supabase.from('articulo_codigo_barras').select('articulo_codigo').eq('codigo_barras', t).limit(1)
  if (barra?.[0]?.articulo_codigo) {
    const { data } = await supabase.from('articulo').select(ART).eq('codigo_interno', barra[0].articulo_codigo as string).limit(1)
    if (data?.length) return data as ArticuloElegido[]
  }
  const palabras = t.split(/\s+/).filter(Boolean).slice(0, 4)
  let q = supabase.from('articulo').select(ART).neq('activo', false).order('descripcion').limit(20)
  for (const p of palabras) q = q.ilike('descripcion', `%${p.replace(/[%,()]/g, ' ')}%`)
  const { data } = await q
  return (data ?? []) as ArticuloElegido[]
}

function Registrar() {
  const [almacenes, setAlmacenes] = useState<{ codigo: string; nombre: string }[]>([])
  const [texto, setTexto] = useState('')
  const [resultados, setResultados] = useState<ArticuloElegido[]>([])
  const [buscando, setBuscando] = useState(false)
  const [articulo, setArticulo] = useState<ArticuloElegido | null>(null)
  const [codigoManual, setCodigoManual] = useState('')
  const [proveedor, setProveedor] = useState('')
  const [proveedorNombre, setProveedorNombre] = useState('')
  const [almacen, setAlmacen] = useState('04')
  const [cantidad, setCantidad] = useState('1')
  const [origen, setOrigen] = useState<OrigenRotura>('ALMACEN')
  const [motivo, setMotivo] = useState(MOTIVOS[0])
  const [motivoLibre, setMotivoLibre] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [entrega, setEntrega] = useState('')
  const [fotos, setFotos] = useState<File[]>([])
  const [ocupado, setOcupado] = useState(false)
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null)
  const [pendientes, setPendientes] = useState<RoturaPendiente[]>([])
  const [enLinea, setEnLinea] = useState(navigator.onLine)
  const refFotos = useRef<HTMLInputElement>(null)

  const recargarPendientes = useCallback(() => pendientesRotura().then(setPendientes).catch(() => setPendientes([])), [])

  const sincronizar = useCallback(async () => {
    try {
      const r = await sincronizarRoturas()
      if (r.enviadas.length) setAviso({ ok: true, texto: `Enviadas las roturas guardadas: ${r.enviadas.join(', ')}.` })
    } finally {
      void recargarPendientes()
    }
  }, [recargarPendientes])

  useEffect(() => {
    supabase
      .from('almacen')
      .select('codigo, nombre')
      .order('codigo')
      .then(({ data }) => setAlmacenes(((data ?? []) as { codigo: string; nombre: string }[]).filter((a) => a.codigo !== ALMACEN_ROTURAS)))
    void sincronizar()
    const alVolver = () => {
      setEnLinea(true)
      void sincronizar()
    }
    const alCaer = () => setEnLinea(false)
    window.addEventListener('online', alVolver)
    window.addEventListener('offline', alCaer)
    return () => {
      window.removeEventListener('online', alVolver)
      window.removeEventListener('offline', alCaer)
    }
  }, [sincronizar])

  // Búsqueda de artículo mientras se escribe (código, código de barras o palabras de la descripción).
  useEffect(() => {
    if (articulo || texto.trim().length < 2) {
      setResultados([])
      return
    }
    let vigente = true
    setBuscando(true)
    const t = setTimeout(() => {
      buscarArticulos(texto)
        .then((r) => vigente && setResultados(r))
        .catch(() => vigente && setResultados([]))
        .finally(() => vigente && setBuscando(false))
    }, 300)
    return () => {
      vigente = false
      clearTimeout(t)
    }
  }, [texto, articulo])

  useEffect(() => {
    if (!proveedor.trim()) return setProveedorNombre('')
    let vigente = true
    nombresProveedor([proveedor.trim()])
      .then((n) => vigente && setProveedorNombre(n[proveedor.trim()] ?? ''))
      .catch(() => undefined)
    return () => {
      vigente = false
    }
  }, [proveedor])

  function elegir(a: ArticuloElegido) {
    setArticulo(a)
    setResultados([])
    setTexto('')
    setProveedor(a.proveedor_habitual_codigo ?? '')
  }

  function limpiar() {
    setArticulo(null)
    setCodigoManual('')
    setTexto('')
    setProveedor('')
    setCantidad('1')
    setMotivo(MOTIVOS[0])
    setMotivoLibre('')
    setDescripcion('')
    setFotos([])
    if (refFotos.current) refFotos.current.value = ''
  }

  async function guardar() {
    setAviso(null)
    const codigo = articulo?.codigo_interno ?? codigoManual.trim()
    const n = Number(cantidad.replace(',', '.'))
    const motivoFinal = (motivo === 'Otro' ? motivoLibre : motivo).trim()
    if (!codigo) return setAviso({ ok: false, texto: 'Elige el artículo roto (o escribe su código si no hay cobertura).' })
    if (!Number.isFinite(n) || n <= 0) return setAviso({ ok: false, texto: 'La cantidad tiene que ser mayor que cero.' })
    if (!motivoFinal) return setAviso({ ok: false, texto: 'Escribe el motivo de la rotura.' })
    const pendiente: RoturaPendiente = {
      clave: crypto.randomUUID(),
      datos: {
        articulo_codigo: codigo,
        proveedor_codigo: proveedor.trim() || null,
        almacen_codigo: almacen,
        cantidad: n,
        motivo: motivoFinal,
        descripcion: descripcion.trim() || null,
        origen_rotura: origen,
        empleado_entrega: entrega.trim() || null,
        creado_offline: !navigator.onLine,
      },
      resumen: `${cant(n)} × ${articulo ? articulo.descripcion : codigo}`,
      fotos,
      guardada_en: new Date().toISOString(),
    }
    setOcupado(true)
    try {
      // Primero se guarda en el móvil: si se corta la conexión a medias, no se pierde nada.
      await guardarPendienteRotura(pendiente)
      try {
        const numero = await enviarRotura(pendiente)
        setAviso({ ok: true, texto: `Rotura registrada: ${numero}. Las unidades han pasado al Almacén 06.` })
        limpiar()
      } catch (e) {
        if (esFalloDeRed(e)) {
          setAviso({ ok: true, texto: 'Sin cobertura: la rotura queda guardada en este móvil y se enviará sola cuando vuelva la conexión.' })
          limpiar()
        } else {
          // El servidor la ha rechazado (artículo inexistente, sin proveedor…): no se guarda, se corrige aquí.
          await quitarPendienteRotura(pendiente.clave)
          setAviso({ ok: false, texto: e instanceof Error ? e.message : 'No se ha podido registrar la rotura.' })
        }
      }
    } catch {
      setAviso({ ok: false, texto: 'Este navegador no deja guardar datos: no se puede registrar sin conexión.' })
    } finally {
      setOcupado(false)
      void recargarPendientes()
    }
  }

  const grande = '!h-[40px] !text-[16px]'
  return (
    <div className="flex flex-col gap-1.5">
      {!enLinea && (
        <div className="border border-[#e0b400] bg-[#fff8e1] px-2 py-1 font-bold text-[#8a5a00]">
          Sin conexión. Puedes seguir registrando: se guarda en este móvil y se envía solo al volver la cobertura.
        </div>
      )}
      {pendientes.length > 0 && (
        <Caja titulo={`Guardadas en este móvil, sin enviar (${pendientes.length})`}>
          <ul className="flex flex-col gap-1">
            {pendientes.map((p) => (
              <li key={p.clave} className="flex flex-wrap items-center gap-2 border border-[var(--gw-border-light)] px-1.5 py-1">
                <span className="font-bold">{p.resumen}</span>
                <span className="text-[#555]">
                  {new Date(p.guardada_en).toLocaleString('es-ES')} · {p.fotos.length} foto(s){p.numero ? ` · ${p.numero} (faltan fotos)` : ''}
                </span>
                {p.error && <span className="font-bold text-[#c42b1c]">{p.error}</span>}
                {p.error && !p.expediente_id && (
                  <button type="button" className="gw-btn h-[24px]" onClick={() => void quitarPendienteRotura(p.clave).then(recargarPendientes)}>
                    Descartar
                  </button>
                )}
              </li>
            ))}
          </ul>
          <button type="button" className="gw-btn mt-1 h-[28px]" disabled={!enLinea} onClick={() => void sincronizar()}>
            Enviar ahora
          </button>
        </Caja>
      )}

      <Caja titulo="1 · ¿Qué artículo es?">
        {articulo ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[16px] font-bold">{articulo.codigo_interno}</span>
            <span className="text-[16px]">{articulo.descripcion}</span>
            <button type="button" className="gw-btn h-[28px]" onClick={() => setArticulo(null)}>
              Cambiar
            </button>
          </div>
        ) : (
          <>
            <GwInput
              className={`${grande} w-full`}
              placeholder="Código, código de barras o descripción"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              autoFocus
              inputMode="search"
            />
            {buscando && <div className="mt-1 text-[#555]">Buscando…</div>}
            {resultados.length > 0 && (
              <ul className="mt-1 max-h-[260px] overflow-auto border border-[var(--gw-border-light)]">
                {resultados.map((a) => (
                  <li key={a.codigo_interno}>
                    <button type="button" className="flex w-full gap-2 border-b border-[var(--gw-border-light)] px-2 py-1.5 text-left hover:bg-[#dbeeff]" onClick={() => elegir(a)}>
                      <b className="w-[90px] shrink-0">{a.codigo_interno}</b>
                      <span>{a.descripcion}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {!enLinea && (
              <div className="mt-1.5">
                <GwField label="Sin cobertura no se puede buscar: escribe el código del artículo">
                  <GwInput className={`${grande} w-[220px]`} value={codigoManual} onChange={(e) => setCodigoManual(e.target.value)} />
                </GwField>
              </div>
            )}
          </>
        )}
      </Caja>

      <Caja titulo="2 · ¿Cuántos y dónde?">
        <div className="flex flex-wrap items-end gap-2">
          <GwField label="Cantidad">
            <GwInput className={`${grande} w-[110px] font-bold`} inputMode="decimal" value={cantidad} onChange={(e) => setCantidad(e.target.value)} onFocus={(e) => e.currentTarget.select()} />
          </GwField>
          <GwField label="Almacén donde estaba">
            <GwSelect className={`${grande} w-[240px]`} value={almacen} onChange={(e) => setAlmacen(e.target.value)}>
              {(almacenes.length ? almacenes : [{ codigo: almacen, nombre: '' }]).map((a) => (
                <option key={a.codigo} value={a.codigo}>
                  {a.codigo} {a.nombre}
                </option>
              ))}
            </GwSelect>
          </GwField>
          <GwField label="Dónde se rompió">
            <GwSelect className={`${grande} w-[220px]`} value={origen} onChange={(e) => setOrigen(e.target.value as OrigenRotura)}>
              {ORIGENES_ROTURA.map((o) => (
                <option key={o.codigo} value={o.codigo}>
                  {o.nombre}
                </option>
              ))}
            </GwSelect>
          </GwField>
          <GwField label="Proveedor (código)">
            <GwInput className={`${grande} w-[110px]`} value={proveedor} onChange={(e) => setProveedor(e.target.value)} />
          </GwField>
          <span className="pb-2 text-[14px]">{proveedorNombre || (proveedor.trim() && enLinea ? 'No existe ese proveedor' : '')}</span>
        </div>
      </Caja>

      <Caja titulo="3 · ¿Qué le ha pasado?">
        <div className="flex flex-wrap gap-1">
          {MOTIVOS.map((m) => (
            <button key={m} type="button" className={`gw-btn h-[34px] !text-[14px] ${motivo === m ? 'bg-[#91c9f7] font-bold' : ''}`} onClick={() => setMotivo(m)}>
              {m}
            </button>
          ))}
        </div>
        {motivo === 'Otro' && <GwInput className={`${grande} mt-1 w-full`} placeholder="Escribe el motivo" value={motivoLibre} onChange={(e) => setMotivoLibre(e.target.value)} />}
        <div className="mt-1.5 flex flex-wrap items-end gap-2">
          <div className="min-w-[240px] flex-1">
            <GwField label="Detalle del desperfecto (opcional)">
              <GwInput className={`${grande} w-full`} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
            </GwField>
          </div>
          <GwField label="Quién entrega la mercancía (opcional)">
            <GwInput className={`${grande} w-[240px]`} value={entrega} onChange={(e) => setEntrega(e.target.value)} />
          </GwField>
        </div>
      </Caja>

      <Caja titulo="4 · Fotos">
        <input
          ref={refFotos}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          className="text-[14px]"
          onChange={(e) => setFotos((f) => [...f, ...Array.from(e.target.files ?? [])].slice(0, 8))}
        />
        {fotos.length > 0 && (
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className="font-bold">{fotos.length} foto(s) preparadas</span>
            <button
              type="button"
              className="gw-btn h-[24px]"
              onClick={() => {
                setFotos([])
                if (refFotos.current) refFotos.current.value = ''
              }}
            >
              Quitar fotos
            </button>
          </div>
        )}
        <div className="mt-0.5 text-[12px] text-[#555]">Hasta 8. Se reducen solas antes de subir. Sirven para la reclamación al proveedor.</div>
      </Caja>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="gw-btn !h-[44px] !px-5 !text-[16px] font-bold" disabled={ocupado} onClick={() => void guardar()}>
          {ocupado ? 'Guardando…' : 'Registrar rotura'}
        </button>
        {aviso && <span className={`text-[14px] font-bold ${aviso.ok ? 'text-[#127a12]' : 'text-[#c42b1c]'}`}>{aviso.texto}</span>}
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ Para destruir
function ParaDestruir({ estados }: { estados: EstadoRoturaInfo[] }) {
  const [filas, setFilas] = useState<ExpedienteRotura[]>([])
  const [nombres, setNombres] = useState<Record<string, string>>({})
  const [marcados, setMarcados] = useState<Set<number>>(new Set())
  const [cargando, setCargando] = useState(true)
  const [ocupado, setOcupado] = useState(false)
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null)
  const info = useMemo(() => Object.fromEntries(estados.map((e) => [e.codigo, e])), [estados])

  const cargar = useCallback(async () => {
    setCargando(true)
    const { data, error } = await supabase.from('rotura_expediente').select(COLS).in('estado', POR_DESTRUIR).is('anulado_en', null).order('proveedor_codigo').order('id')
    const lista = (data ?? []) as unknown as ExpedienteRotura[]
    setFilas(lista)
    setMarcados(new Set())
    setNombres(await nombresProveedor(lista.map((f) => f.proveedor_codigo)))
    if (error) setAviso({ ok: false, texto: error.message })
    setCargando(false)
  }, [])
  useEffect(() => void cargar(), [cargar])

  const marcar = (id: number) =>
    setMarcados((m) => {
      const n = new Set(m)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  async function confirmar() {
    if (!marcados.size) return
    if (!confirm(`¿Confirmas que has destruido físicamente ${marcados.size} expediente(s)? No se puede deshacer.`)) return
    setOcupado(true)
    setAviso(null)
    const { data, error } = await supabase.rpc('fn_rotura_destruir', { p_ids: [...marcados], p_observaciones: null })
    setOcupado(false)
    if (error) return setAviso({ ok: false, texto: error.message })
    setAviso({ ok: true, texto: `Destrucción confirmada: ${(data as { destruidos: number }).destruidos} expediente(s).` })
    void cargar()
  }

  function listado() {
    const cuerpo =
      `<h2>Roturas para destruir</h2><p>${new Date().toLocaleString('es-ES')} · ${filas.length} expediente(s)</p>` +
      `<table><thead><tr><th>Nº</th><th>Código</th><th>Artículo</th><th>Cant.</th><th>Proveedor</th><th>Situación</th><th>Destruido ✓</th></tr></thead><tbody>` +
      filas
        .map(
          (f) =>
            `<tr><td>${html(f.numero)}</td><td>${html(f.articulo_codigo)}</td><td>${html(f.articulo_descripcion)}</td><td>${cant(f.cantidad)}</td>` +
            `<td>${html(nombres[f.proveedor_codigo] ?? f.proveedor_codigo)}</td><td>${html(info[f.estado]?.nombre ?? f.estado)}</td><td></td></tr>`,
        )
        .join('') +
      `</tbody></table>`
    imprimir('Roturas para destruir', cuerpo)
  }

  return (
    <Caja titulo={`Para destruir (${filas.length})`}>
      <div className="mb-1 flex flex-wrap items-center gap-1">
        <button type="button" className="gw-btn h-[28px] font-bold" disabled={!marcados.size || ocupado} onClick={() => void confirmar()}>
          {ocupado ? 'Confirmando…' : `Confirmar destrucción (${marcados.size})`}
        </button>
        <button type="button" className="gw-btn h-[28px]" disabled={!filas.length} onClick={() => setMarcados(new Set(marcados.size === filas.length ? [] : filas.map((f) => f.id)))}>
          {marcados.size === filas.length && filas.length ? 'Desmarcar todo' : 'Marcar todo'}
        </button>
        <button type="button" className="gw-btn h-[28px]" disabled={!filas.length} onClick={listado}>
          Imprimir listado
        </button>
        <button type="button" className="gw-btn h-[28px]" onClick={() => void cargar()}>
          Actualizar
        </button>
        {aviso && <span className={`font-bold ${aviso.ok ? 'text-[#127a12]' : 'text-[#c42b1c]'}`}>{aviso.texto}</span>}
      </div>
      {cargando ? (
        <div>Cargando…</div>
      ) : !filas.length ? (
        <div className="text-[#555]">No hay nada pendiente de destruir.</div>
      ) : (
        <div className="overflow-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={th} />
                <th className={th}>Nº</th>
                <th className={th}>Código</th>
                <th className={th}>Artículo</th>
                <th className={`${th} text-right`}>Cant.</th>
                <th className={th}>Proveedor</th>
                <th className={th}>Situación</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.id} className={`cursor-pointer ${marcados.has(f.id) ? 'bg-[#dbeeff]' : ''}`} onClick={() => marcar(f.id)}>
                  <td className={`${td} text-center`}>
                    <input type="checkbox" checked={marcados.has(f.id)} readOnly aria-label={`Marcar ${f.numero}`} />
                  </td>
                  <td className={`${td} whitespace-nowrap font-bold`}>{f.numero}</td>
                  <td className={td}>{f.articulo_codigo}</td>
                  <td className={td}>{f.articulo_descripcion}</td>
                  <td className={`${td} text-right`}>{cant(f.cantidad)}</td>
                  <td className={td}>{nombres[f.proveedor_codigo] ?? f.proveedor_codigo}</td>
                  <td className={td}>
                    <span className="font-bold" style={{ color: info[f.estado]?.color }}>
                      {info[f.estado]?.nombre ?? f.estado}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Caja>
  )
}

// ------------------------------------------------------------------ Separados para el proveedor
function Separados() {
  const [filas, setFilas] = useState<ExpedienteRotura[]>([])
  const [nombres, setNombres] = useState<Record<string, string>>({})
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    setCargando(true)
    const { data, error: e } = await supabase.from('rotura_expediente').select(COLS).eq('estado', 'SEPARADO_PROVEEDOR').is('anulado_en', null).order('proveedor_codigo').order('id')
    const lista = (data ?? []) as unknown as ExpedienteRotura[]
    setFilas(lista)
    setNombres(await nombresProveedor(lista.map((f) => f.proveedor_codigo)))
    setError(e?.message ?? null)
    setCargando(false)
  }, [])
  useEffect(() => void cargar(), [cargar])

  const grupos = useMemo(() => {
    const g = new Map<string, ExpedienteRotura[]>()
    for (const f of filas) g.set(f.proveedor_codigo, [...(g.get(f.proveedor_codigo) ?? []), f])
    return [...g.entries()]
  }, [filas])

  /** Una etiqueta por proveedor (una por hoja) para pegar por fuera de la caja. */
  function etiquetas(soloProveedor?: string) {
    const cuerpo = grupos
      .filter(([p]) => !soloProveedor || p === soloProveedor)
      .map(
        ([p, lista]) =>
          `<div class="etiqueta"><div class="rot">ROTURAS · SEPARADO PARA EL PROVEEDOR</div>` +
          `<div class="prov">${html(nombres[p] ?? p)}</div><div class="sub">Proveedor ${html(p)} · Ofipapel · ${new Date().toLocaleDateString('es-ES')}</div>` +
          `<table><thead><tr><th>Nº expediente</th><th>Código</th><th>Ref. proveedor</th><th>Artículo</th><th>Cant.</th></tr></thead><tbody>` +
          lista
            .map(
              (f) =>
                `<tr><td>${html(f.numero)}</td><td>${html(f.articulo_codigo)}</td><td>${html(f.articulo_referencia ?? '')}</td><td>${html(f.articulo_descripcion)}</td><td>${cant(f.cantidad)}</td></tr>`,
            )
            .join('') +
          `</tbody></table><div class="pie">${lista.length} expediente(s) · NO TIRAR: lo recoge el proveedor</div></div>`,
      )
      .join('')
    imprimir(
      'Etiquetas · Separado para el proveedor',
      cuerpo,
      `.etiqueta{border:3px solid #000;padding:6mm;max-width:16cm;page-break-after:always;margin-bottom:8mm}.etiqueta:last-child{page-break-after:auto}` +
        `.rot{font-size:13px;font-weight:bold;letter-spacing:1px}.prov{font-size:30px;font-weight:bold;margin:2mm 0}.sub{font-size:12px;margin-bottom:3mm}.pie{font-size:13px;font-weight:bold;margin-top:3mm}`,
    )
  }

  return (
    <Caja titulo={`Separados esperando al proveedor (${filas.length})`}>
      <div className="mb-1 flex flex-wrap items-center gap-1">
        <button type="button" className="gw-btn h-[28px] font-bold" disabled={!filas.length} onClick={() => etiquetas()}>
          Imprimir etiquetas (una por proveedor)
        </button>
        <button type="button" className="gw-btn h-[28px]" onClick={() => void cargar()}>
          Actualizar
        </button>
        {error && <span className="font-bold text-[#c42b1c]">{error}</span>}
      </div>
      {cargando ? (
        <div>Cargando…</div>
      ) : !filas.length ? (
        <div className="text-[#555]">No hay nada separado. Aquí sale lo que Compras marca como «Separado para el proveedor».</div>
      ) : (
        <div className="flex flex-col gap-2">
          {grupos.map(([p, lista]) => (
            <div key={p} className="border border-[var(--gw-border-light)]">
              <div className="flex flex-wrap items-center gap-2 bg-[var(--gw-face)] px-1.5 py-1">
                <b className="text-[14px]">{nombres[p] ?? p}</b>
                <span className="text-[#555]">
                  {lista.length} expediente(s) · el más antiguo lleva {Math.max(...lista.map((f) => dias(f.actualizado_en)))} día(s)
                </span>
                <span className="flex-1" />
                <button type="button" className="gw-btn h-[24px]" onClick={() => etiquetas(p)}>
                  Etiqueta
                </button>
              </div>
              <table className="w-full border-collapse">
                <tbody>
                  {lista.map((f) => (
                    <tr key={f.id}>
                      <td className={`${td} w-[140px] whitespace-nowrap font-bold`}>{f.numero}</td>
                      <td className={`${td} w-[90px]`}>{f.articulo_codigo}</td>
                      <td className={td}>{f.articulo_descripcion}</td>
                      <td className={`${td} w-[70px] text-right`}>{cant(f.cantidad)}</td>
                      <td className={`${td} w-[150px] whitespace-nowrap ${dias(f.actualizado_en) > 30 ? 'font-bold text-[#c42b1c]' : ''}`}>
                        desde {fecha(f.actualizado_en)} · {dias(f.actualizado_en)} día(s)
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </Caja>
  )
}

// ------------------------------------------------------------------ Operativa
function Operativa() {
  return (
    <Caja>
      <GwOperativa
        bloques={[
          {
            titulo: 'Registrar una rotura',
            pasos: [
              'Busca el artículo por su código, por el código de barras o escribiendo parte de la descripción, y tócalo.',
              'Pon cuántas unidades hay rotas, en qué almacén estaban y dónde se rompió.',
              'Elige el motivo y, si puedes, haz fotos con el móvil.',
              'Pulsa «Registrar rotura». Te da el número de expediente (EXP-año-número).',
            ],
            notas: [
              'Al registrar, el programa pasa esas unidades al Almacén 06 (roturas) él solo. No hay que hacer ningún traspaso.',
              'El proveedor sale del artículo; cámbialo solo si esa mercancía vino de otro.',
            ],
          },
          {
            titulo: 'Sin cobertura en el almacén',
            notas: [
              'Si no hay señal, registra igual: la rotura y las fotos se guardan en ese móvil y se envían solas cuando vuelve la cobertura. Sale arriba, en «Guardadas en este móvil».',
              'Sin cobertura no se puede buscar el artículo: escribe su código. Si el código no existe, al enviarla saldrá el aviso y podrás descartarla.',
              'Tiene que estar esta pantalla abierta: el programa no se puede abrir desde cero sin conexión. No borres los datos del navegador con roturas sin enviar.',
            ],
          },
          {
            titulo: 'Para destruir',
            pasos: ['Marca lo que has destruido de verdad.', 'Pulsa «Confirmar destrucción».'],
            notas: [
              'Aquí sale lo que Compras ya ha resuelto: obsoletos, rechazados por el proveedor, abonados y compensados.',
              'Los obsoletos y rechazados se dan de baja del Almacén 06 al confirmar. Los abonados y compensados ya se dieron de baja cuando Compras cuadró el documento del proveedor.',
              'Una destrucción confirmada no se puede deshacer.',
            ],
          },
          {
            titulo: 'Separados para el proveedor',
            notas: [
              'Cuando el proveedor contesta «separadlo, que lo recogemos», Compras lo marca y aparece aquí. Empaquétalo y pega la etiqueta por fuera de la caja.',
              'La etiqueta lleva el proveedor en grande y la lista de lo que hay dentro. Sale una por proveedor, cada una en su hoja.',
              'Se queda aquí hasta que el proveedor lo recoge y abona. En rojo, lo que lleva más de 30 días.',
            ],
          },
        ]}
      />
    </Caja>
  )
}
