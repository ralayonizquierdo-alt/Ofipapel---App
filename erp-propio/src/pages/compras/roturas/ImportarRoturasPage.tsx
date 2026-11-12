// TEMPORAL · Gestor de Roturas, fase 6 (Rober, 12/11/2026). Se usa UNA vez, el día de la migración, y
// después se BORRA entera: esta pantalla, su ruta en App.tsx, la función del servidor
// «rotura-importar-archivo» y las funciones fn_rotura_importar* (ver docs/ROTURAS.md, fase 6).
// No está en el menú: se entra por /importar-roturas-antiguas y solo un administrador.
//
// Trae los expedientes de la app antigua «Devoluciones y Roturas» (Firebase) con la sesión de la
// persona en esa app: aquí no se guarda ni su contraseña ni ninguna clave. Primero un ENSAYO que no
// guarda nada (qué hay, cómo queda cada estado, qué proveedores o artículos no casan) y después se
// importa. Se puede repetir: lo ya traído no se duplica.

import { useMemo, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { GwField, GwInput } from '../../../components/gw'
import { usePermisos } from '../../../lib/PermisosContext'

const PROYECTO = 'devoluciones-y-roturas'
const ALMACENES = [`${PROYECTO}.appspot.com`, `${PROYECTO}.firebasestorage.app`]
const BASE = `https://firestore.googleapis.com/v1/projects/${PROYECTO}/databases/(default)/documents`

type Doc = Record<string, unknown> & { id: string }
interface Antiguo {
  exp: Doc
  historial: Doc[]
  documentos: Doc[]
}
interface Ensayo {
  antiguos: Antiguo[]
  /** id del proveedor antiguo → código en el ERP (vacío si no casa). */
  provs: Record<string, { nombre: string; cif: string; codigo: string; n: number }>
  articulosQueFaltan: string[]
  almacen: string
}

const ESTADO_NUEVO: Record<string, string> = {
  EN_ESTUDIO: 'PENDIENTE',
  RETIRADO_POR_PROVEEDOR: 'SEPARADO_PROVEEDOR',
  A_ESPERA_DE_ABONO: 'SEPARADO_PROVEEDOR',
  PROVEEDOR_ENVIA_RECAMBIO: 'PENDIENTE',
  A_ESPERA_DE_RECAMBIO: 'PENDIENTE',
  CERRADO: 'ABONADO o DESTRUIDO',
}

// ---- Lectura de Firestore por su API (sin instalar nada de Firebase en el ERP)
function valor(v: Record<string, unknown> | undefined): unknown {
  if (!v) return null
  if ('stringValue' in v) return v.stringValue
  if ('integerValue' in v) return Number(v.integerValue)
  if ('doubleValue' in v) return Number(v.doubleValue)
  if ('booleanValue' in v) return v.booleanValue
  if ('timestampValue' in v) return v.timestampValue
  if ('nullValue' in v) return null
  if ('arrayValue' in v) return (((v.arrayValue as { values?: Record<string, unknown>[] }).values ?? []) as Record<string, unknown>[]).map(valor)
  if ('mapValue' in v) return campos((v.mapValue as { fields?: Record<string, Record<string, unknown>> }).fields)
  return null
}
function campos(f: Record<string, Record<string, unknown>> | undefined): Record<string, unknown> {
  return Object.fromEntries(Object.entries(f ?? {}).map(([k, v]) => [k, valor(v)]))
}
async function listar(ruta: string, token: string): Promise<Doc[]> {
  const out: Doc[] = []
  let pagina = ''
  do {
    const r = await fetch(`${BASE}/${ruta}?pageSize=300${pagina ? `&pageToken=${encodeURIComponent(pagina)}` : ''}`, { headers: { Authorization: `Bearer ${token}` } })
    const j = await r.json()
    if (!r.ok) throw new Error(`La app antigua no deja leer «${ruta}»: ${j?.error?.message ?? r.status}`)
    for (const d of (j.documents ?? []) as { name: string; fields?: Record<string, Record<string, unknown>> }[]) out.push({ id: d.name.split('/').pop()!, ...campos(d.fields) })
    pagina = j.nextPageToken ?? ''
  } while (pagina)
  return out
}
/** Ejecuta en tandas de 6 para no saturar. */
async function enTandas<T, R>(items: T[], hacer: (x: T, i: number) => Promise<R>, cada?: (hechos: number) => void): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let i = 0
  let hechos = 0
  await Promise.all(
    Array.from({ length: Math.min(6, items.length) }, async () => {
      while (i < items.length) {
        const k = i++
        out[k] = await hacer(items[k], k)
        cada?.(++hechos)
      }
    }),
  )
  return out
}

const s = (x: unknown) => (x == null ? '' : String(x))
const norm = (x: unknown) => s(x).normalize('NFD').replace(/[^\p{L}\p{N}]+/gu, '').toUpperCase()
const fechaIso = (x: unknown) => (s(x) ? s(x) : null)
const mensaje = (e: unknown) => (e instanceof Error ? e.message : String(e))

export function ImportarRoturasPage() {
  const { admin, cargando } = usePermisos()
  const [clave, setClave] = useState('')
  const [correo, setCorreo] = useState('')
  const [contrasena, setContrasena] = useState('')
  const [token, setToken] = useState<string | null>(null)
  const [paso, setPaso] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ensayo, setEnsayo] = useState<Ensayo | null>(null)
  const [resultado, setResultado] = useState<{ nuevos: number; yaEstaban: number; saltados: number; adjuntos: number; fallos: string[]; contador: string } | null>(null)

  async function entrar() {
    setError(null)
    setPaso('Entrando en la app antigua…')
    try {
      const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(clave.trim())}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: correo.trim(), password: contrasena, returnSecureToken: true }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j?.error?.message === 'INVALID_LOGIN_CREDENTIALS' ? 'Correo o contraseña incorrectos.' : `No se ha podido entrar: ${j?.error?.message ?? r.status}`)
      setToken(j.idToken)
      setContrasena('')
    } catch (e) {
      setError(mensaje(e))
    } finally {
      setPaso(null)
    }
  }

  async function ensayar() {
    if (!token) return
    setError(null)
    setResultado(null)
    try {
      setPaso('Leyendo proveedores y expedientes de la app antigua…')
      const [provsAnt, exps] = await Promise.all([listar('proveedores', token), listar('expedientes', token)])
      const antiguos = await enTandas(
        exps,
        async (exp) => {
          const [historial, documentos] = await Promise.all([listar(`expedientes/${exp.id}/historialEstados`, token), listar(`expedientes/${exp.id}/documentos`, token)])
          return { exp, historial: historial.sort((a, b) => s(a.fecha).localeCompare(s(b.fecha))), documentos }
        },
        (n) => setPaso(`Leyendo historial y adjuntos: ${n} de ${exps.length}…`),
      )

      setPaso('Comparando con el ERP…')
      const { data: provsErp, error: e1 } = await supabase.from('proveedor').select('codigo, nombre, razon_social, nif').limit(5000)
      if (e1) throw new Error(e1.message)
      const porNif = new Map<string, string>()
      const porNombre = new Map<string, string>()
      for (const p of provsErp ?? []) {
        if (norm(p.nif)) porNif.set(norm(p.nif), p.codigo)
        for (const n of [p.nombre, p.razon_social]) if (norm(n)) porNombre.set(norm(n), p.codigo)
      }
      const provs: Ensayo['provs'] = {}
      for (const a of antiguos) {
        const id = s(a.exp.proveedorId)
        if (!provs[id]) {
          const p = provsAnt.find((x) => x.id === id)
          const nombre = s(p?.nombre ?? a.exp.proveedorNombre)
          const cif = s(p?.cif)
          provs[id] = { nombre, cif, codigo: porNif.get(norm(cif)) ?? porNombre.get(norm(nombre)) ?? '', n: 0 }
        }
        provs[id].n++
      }
      const codigos = [...new Set(antiguos.map((a) => s(a.exp.articuloCodigoInterno)).filter(Boolean))]
      const existen = new Set<string>()
      for (let i = 0; i < codigos.length; i += 200) {
        const { data, error: e2 } = await supabase.from('articulo').select('codigo_interno').in('codigo_interno', codigos.slice(i, i + 200))
        if (e2) throw new Error(e2.message)
        for (const x of data ?? []) existen.add(x.codigo_interno)
      }
      setEnsayo({ antiguos, provs, articulosQueFaltan: codigos.filter((c) => !existen.has(c)), almacen: ALMACENES[0] })
    } catch (e) {
      setError(mensaje(e))
    } finally {
      setPaso(null)
    }
  }

  const resumen = useMemo(() => {
    if (!ensayo) return null
    const porEstado: Record<string, number> = {}
    let adjuntos = 0
    let listos = 0
    const faltan = new Set(ensayo.articulosQueFaltan)
    for (const a of ensayo.antiguos) {
      porEstado[s(a.exp.estadoActual)] = (porEstado[s(a.exp.estadoActual)] ?? 0) + 1
      adjuntos += a.documentos.length
      if (ensayo.provs[s(a.exp.proveedorId)]?.codigo && !faltan.has(s(a.exp.articuloCodigoInterno))) listos++
    }
    return { porEstado, adjuntos, listos }
  }, [ensayo])

  async function importar() {
    if (!ensayo || !token || !resumen) return
    if (!confirm(`Se van a traer ${resumen.listos} expedientes y sus adjuntos al ERP.\n\n¿Seguir?`)) return
    setError(null)
    const faltan = new Set(ensayo.articulosQueFaltan)
    const r = { nuevos: 0, yaEstaban: 0, saltados: 0, adjuntos: 0, fallos: [] as string[], contador: '' }
    try {
      let n = 0
      for (const a of ensayo.antiguos) {
        setPaso(`Importando ${++n} de ${ensayo.antiguos.length}…`)
        const x = a.exp
        const proveedor = ensayo.provs[s(x.proveedorId)]?.codigo
        if (!proveedor || faltan.has(s(x.articuloCodigoInterno))) {
          r.saltados++
          continue
        }
        const extra = [x.numeroTraspaso && `Traspaso: ${s(x.numeroTraspaso)}`, x.traspasoAlmacen4Numero && `Traspaso 6→04: ${s(x.traspasoAlmacen4Numero)}`, x.numeroPeticion && `Petición: ${s(x.numeroPeticion)}`].filter(Boolean).join(' · ')
        const { data, error: err } = await supabase.rpc('fn_rotura_importar', {
          p: {
            origen_id: x.id,
            numero: x.numero,
            fecha: s(x.fechaCreacion).slice(0, 10),
            estado: x.estadoActual,
            articulo_codigo: x.articuloCodigoInterno,
            articulo_referencia: x.articuloReferencia,
            articulo_descripcion: x.articuloDescripcion,
            proveedor_codigo: proveedor,
            cantidad: x.cantidad,
            motivo: x.motivo,
            descripcion: x.descripcion,
            origen_rotura: x.origenRotura,
            procedencia: x.procedenciaNombre,
            empleado_entrega: [x.numeroEmpleadoEntrega, x.nombreEmpleadoEntrega].filter(Boolean).join(' '),
            fecha_compra: s(x.fechaCompra).slice(0, 10),
            importe_estimado: x.importeEstimado,
            observaciones: [x.observaciones, extra, x.ubicacionNombre && `Ubicación: ${s(x.ubicacionNombre)}`].filter(Boolean).join(' · '),
            reclamacion_enviada_en: fechaIso(x.reclamacionEnviadaAt),
            tipo_cuadre: x.tipoCuadre,
            compensacion_observaciones: x.compensacionObservaciones,
            creado_offline: x.creadoOffline === true,
            anulado_en: fechaIso(x.anuladoAt),
            anulado_motivo: x.anuladoMotivo,
            creado_por: x.empleadoSolicitanteNombre,
            creado_en: fechaIso(x.createdAt) ?? fechaIso(x.fechaCreacion),
            historial: a.historial.map((h) => ({ estado_anterior: h.estadoAnterior, estado_nuevo: h.estadoNuevo, quien: h.usuarioNombre, observaciones: h.observaciones, en: fechaIso(h.fecha) })),
          },
        })
        if (err) {
          r.fallos.push(`${s(x.numero)}: ${err.message}`)
          continue
        }
        const res = data as { id: number; nuevo: boolean }
        if (res.nuevo) r.nuevos++
        else r.yaEstaban++
        // Adjuntos: los del listado y los del cuadre (abono o compensación) y el PDF de la reclamación.
        const adjuntos = [
          ...a.documentos.map((d) => ({ ruta: s(d.storagePath), nombre: s(d.nombreOriginal), tipo: s(d.tipo) })),
          ...((x.abonoProveedorArchivos as { storagePath: string; nombreArchivo: string }[] | null) ?? []).map((d) => ({ ruta: s(d.storagePath), nombre: s(d.nombreArchivo), tipo: 'ABONO' })),
          ...(x.reclamacionPdfPath ? [{ ruta: s(x.reclamacionPdfPath), nombre: 'reclamacion.pdf', tipo: 'PDF' }] : []),
        ].filter((d, i, todos) => d.ruta && todos.findIndex((y) => y.ruta === d.ruta) === i)
        for (const d of adjuntos) {
          let ultimo = ''
          let hecho = false
          for (const almacen of [ensayo.almacen, ...ALMACENES.filter((b) => b !== ensayo.almacen)]) {
            const { data: f, error: ef } = await supabase.functions.invoke('rotura-importar-archivo', { body: { expediente_id: res.id, almacen, ruta: d.ruta, nombre: d.nombre, tipo: d.tipo, id_token: token } })
            if (!ef && f?.ok) {
              hecho = true
              if (f.nuevo) r.adjuntos++
              ensayo.almacen = almacen
              break
            }
            ultimo = ef?.message ?? f?.error ?? 'sin respuesta'
          }
          if (!hecho) r.fallos.push(`${s(x.numero)} · ${d.nombre || d.ruta}: ${ultimo}`)
        }
      }
      setPaso('Ajustando la numeración…')
      const { data: cont, error: ec } = await supabase.rpc('fn_rotura_importar_fin')
      r.contador = ec ? `no se ha podido ajustar (${ec.message})` : JSON.stringify(cont)
      setResultado(r)
    } catch (e) {
      setError(mensaje(e))
      setResultado(r)
    } finally {
      setPaso(null)
    }
  }

  if (cargando) return null
  if (!admin) return <div className="p-3 font-bold text-[#c42b1c]">Esta pantalla es solo para administradores.</div>

  const sinCasar = ensayo ? Object.entries(ensayo.provs).filter(([, p]) => !p.codigo) : []
  return (
    <div className="flex max-w-[900px] flex-col gap-2 p-1 text-[13px]">
      <div className="border border-[#e0b400] bg-[#fff8dc] p-2">
        <b>Herramienta temporal.</b> Trae los expedientes de la app antigua de Devoluciones y Roturas. Se usa una vez y después se quita del programa. El ensayo no guarda nada.
      </div>

      {!token ? (
        <div className="flex flex-col gap-1.5 border border-[var(--gw-border)] bg-white p-2">
          <div className="text-[14px] font-bold text-[#1d3a8a]">1 · Entra con tu usuario de la app antigua</div>
          <GwField label="Clave web de Firebase (empieza por AIza; no es secreta)">
            <GwInput className="w-[420px]" value={clave} onChange={(e) => setClave(e.target.value)} autoComplete="off" />
          </GwField>
          <GwField label="Correo de la app antigua">
            <GwInput className="w-[320px]" type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} autoComplete="off" />
          </GwField>
          <GwField label="Contraseña de la app antigua (no se guarda)">
            <GwInput className="w-[320px]" type="password" value={contrasena} onChange={(e) => setContrasena(e.target.value)} autoComplete="off" />
          </GwField>
          <div>
            <button type="button" className="gw-btn h-[28px] w-[120px] font-bold" disabled={!!paso || !clave.trim() || !correo.trim() || !contrasena} onClick={() => void entrar()}>
              Entrar
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5 border border-[var(--gw-border)] bg-white p-2">
          <div className="text-[14px] font-bold text-[#1d3a8a]">2 · Ensayo</div>
          <div>
            <button type="button" className="gw-btn h-[28px] font-bold" disabled={!!paso} onClick={() => void ensayar()}>
              Hacer el ensayo (no guarda nada)
            </button>
          </div>
        </div>
      )}
      {paso && <div className="font-bold text-[#1d3a8a]">{paso}</div>}
      {error && <div className="font-bold text-[#c42b1c]">{error}</div>}

      {ensayo && resumen && (
        <div className="flex flex-col gap-1.5 border border-[var(--gw-border)] bg-white p-2">
          <div className="text-[14px] font-bold text-[#1d3a8a]">Resultado del ensayo</div>
          <div>
            Expedientes en la app antigua: <b>{ensayo.antiguos.length}</b> · Adjuntos: <b>{resumen.adjuntos}</b> · Listos para traer: <b className={resumen.listos === ensayo.antiguos.length ? 'text-[#127a12]' : 'text-[#8a5a00]'}>{resumen.listos}</b>
          </div>
          <table className="w-[520px] border-collapse">
            <tbody>
              {Object.entries(resumen.porEstado)
                .sort()
                .map(([e, n]) => (
                  <tr key={e}>
                    <td className="border border-[var(--gw-border-light)] px-1.5">{e}</td>
                    <td className="border border-[var(--gw-border-light)] px-1.5 text-right">{n}</td>
                    <td className="border border-[var(--gw-border-light)] px-1.5">{ESTADO_NUEVO[e] ? `→ ${ESTADO_NUEVO[e]}` : 'igual'}</td>
                  </tr>
                ))}
            </tbody>
          </table>

          {!!sinCasar.length && (
            <div>
              <div className="font-bold text-[#8a5a00]">Proveedores que no encuentro en el ERP ({sinCasar.length}): escribe su código del ERP</div>
              {sinCasar.map(([id, p]) => (
                <div key={id} className="flex items-center gap-2">
                  <GwInput
                    className="w-[90px]"
                    placeholder="Código"
                    aria-label={`Código ERP de ${p.nombre}`}
                    onBlur={(e) => {
                      const codigo = e.target.value.trim()
                      if (codigo) setEnsayo((x) => (x ? { ...x, provs: { ...x.provs, [id]: { ...p, codigo } } } : x))
                    }}
                  />
                  <span>
                    {p.nombre} {p.cif && `(${p.cif})`} · {p.n} expediente(s)
                  </span>
                </div>
              ))}
            </div>
          )}
          {!!ensayo.articulosQueFaltan.length && (
            <div>
              <div className="font-bold text-[#8a5a00]">Artículos que no existen en el ERP ({ensayo.articulosQueFaltan.length}): sus expedientes se saltan</div>
              <div className="max-h-[90px] overflow-auto text-[#555]">{ensayo.articulosQueFaltan.join(', ')}</div>
            </div>
          )}

          <div className="text-[14px] font-bold text-[#1d3a8a]">3 · Importar</div>
          <div>
            <button type="button" className="gw-btn h-[30px] font-bold" disabled={!!paso || !resumen.listos} onClick={() => void importar()}>
              Importar {resumen.listos} expedientes
            </button>
          </div>
        </div>
      )}

      {resultado && (
        <div className="border border-[var(--gw-border)] bg-white p-2">
          <div className="text-[14px] font-bold text-[#1d3a8a]">Importación terminada</div>
          <div>
            Nuevos: <b>{resultado.nuevos}</b> · Ya estaban: <b>{resultado.yaEstaban}</b> · Saltados: <b>{resultado.saltados}</b> · Adjuntos copiados: <b>{resultado.adjuntos}</b>
          </div>
          <div>Numeración (último número por año): {resultado.contador}</div>
          {!!resultado.fallos.length && (
            <div className="mt-1">
              <div className="font-bold text-[#c42b1c]">Fallos ({resultado.fallos.length}). Puedes volver a pulsar Importar: lo ya traído no se duplica.</div>
              <div className="max-h-[160px] overflow-auto">
                {resultado.fallos.map((f, i) => (
                  <div key={i}>{f}</div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
