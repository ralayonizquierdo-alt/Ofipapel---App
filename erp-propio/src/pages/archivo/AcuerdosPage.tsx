// Archivo → Acuerdos de Dirección (Luis, 02/11/2026: «¿qué pasa con la auditoría el día que me jubile?»).
// Los protocolos de la empresa (quién es super administrador, qué avisos recibe cada uno, quién es la
// gerencia, importe de la doble firma, control de teletrabajo) solo cambian con un acuerdo firmado; al
// entrar en vigor, el programa aplica los cambios solo. De momento solo entra la gerencia, que decide
// cuándo abrirlo a los demás super administradores. La auditoría queda por encima: los acuerdos no la
// pueden tocar y todo lo que pasa aquí queda registrado en ella.
// Si la gerencia no puede firmar: acuerdo de sucesión (los demás, con el documento legal; 7 días de espera).
// Datos: migración 20261102_acuerdos_direccion.

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { usePermisos } from '../../lib/PermisosContext'
import { GwField, GwGroup, GwInput, GwSelect, GwTabs, GwTextArea } from '../../components/gw'
import { GwOperativa } from '../../components/gw/GwOperativa'

interface Cambio {
  accion: 'super_administrador' | 'avisos_grupos' | 'gerencia' | 'parametro' | 'acuerdos_abiertos' | 'condicion'
  empleado?: string
  valor?: boolean | number
  grupos?: string[]
  clave?: string
  /** Condición de programación (Parámetros → Condiciones de Programación). */
  operacion?: 'alta' | 'cambio' | 'baja'
  id?: number
  apartado?: string
  regla?: string
  porque?: string
}

interface Acuerdo {
  id: number
  titulo: string
  texto: string
  tipo: 'protocolo' | 'gerencia' | 'sucesion' | 'otro'
  cambios: Cambio[]
  estado: 'borrador' | 'pendiente' | 'en_vigor' | 'rechazado' | 'retirado'
  creado_por: string
  creado_nombre?: string
  creado_en: string
  propuesto_en?: string
  efecto_en?: string
  en_vigor_en?: string
  adjunto_nombre?: string
  motivo_rechazo?: string
  huella?: string
  mio: boolean
  firmantes?: string[]
  firmas?: { empleado: string; nombre?: string; decision: string; comentario?: string; firmado_en: string }[]
  me_toca: boolean
}

interface Vigentes {
  gerente: { codigo: string; nombre: string }
  acuerdos_abiertos: boolean
  soy_gerente: boolean
  acceso: boolean
  super_administradores: { codigo: string; nombre: string; grupos: string[]; horas: string[]; correo: boolean }[] | null
  empleados: { codigo: string; nombre: string; super: boolean }[] | null
  doble_firma: number
  control_remoto: boolean
  redes: number
  teletrabajo: string[] | null
  ultimo_acuerdo?: { id: number; titulo: string; en_vigor_en: string } | null
}

const GRUPOS: Record<string, string> = { todo: 'Todo', ventas: 'Ventas', compras: 'Compras', contabilidad: 'Contabilidad', seguridad: 'Seguridad' }
const TIPOS: Record<Acuerdo['tipo'], string> = {
  protocolo: 'Cambio de protocolo',
  gerencia: 'Cambio de gerencia',
  sucesion: 'Sucesión (la gerencia no puede firmar)',
  otro: 'Otro (solo dejar constancia)',
}
const ESTADO: Record<Acuerdo['estado'], string> = {
  borrador: '📝 Borrador',
  pendiente: '⏳ Pendiente de firma',
  en_vigor: '✅ En vigor',
  rechazado: '❌ Rechazado',
  retirado: 'Retirado',
}
const fecha = (v?: string) => (v ? new Date(v).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' }) : '')
const eur = (n: number) => n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })

function textoCambio(c: Cambio, nombre: (cod?: string) => string): string {
  switch (c.accion) {
    case 'super_administrador':
      return `${nombre(c.empleado)}: ${c.valor ? 'pasa a ser' : 'deja de ser'} super administrador`
    case 'avisos_grupos':
      return `${nombre(c.empleado)}: recibe los avisos de ${(c.grupos ?? []).map((g) => GRUPOS[g] ?? g).join(', ') || 'todo'}`
    case 'gerencia':
      return `${nombre(c.empleado)} pasa a ser la gerencia`
    case 'parametro':
      return c.clave === 'contab.importe_doble_firma'
        ? `Doble firma de asientos desde ${eur(Number(c.valor))}`
        : `Control de teletrabajo ${c.valor ? 'activado (bloquea)' : 'desactivado (solo apunta)'}`
    case 'acuerdos_abiertos':
      return c.valor ? 'Los Acuerdos se abren a todos los super administradores' : 'Los Acuerdos vuelven a ser solo de la gerencia'
    case 'condicion':
      return c.operacion === 'baja'
        ? `Condición de programación nº ${c.id}: se da de baja`
        : `Condición de programación${c.operacion === 'cambio' ? ` nº ${c.id} cambia` : ' nueva'} (${c.apartado ?? ''}): ${c.regla ?? ''}`
  }
}

export function AcuerdosPage() {
  const { superAdmin, cargando } = usePermisos()
  const [tab, setTab] = useState('vigentes')
  const [v, setV] = useState<Vigentes | null>(null)
  const [lista, setLista] = useState<Acuerdo[]>([])
  const [msg, setMsg] = useState<{ texto: string; error: boolean } | null>(null)

  const cargar = useCallback(async () => {
    const [a, b] = await Promise.all([supabase.rpc('fn_protocolos_vigentes'), supabase.rpc('fn_acuerdos_lista')])
    if (a.data) setV(a.data as Vigentes)
    setLista((b.data ?? []) as Acuerdo[])
  }, [])
  useEffect(() => {
    if (superAdmin) void cargar()
  }, [superAdmin, cargar])

  if (cargando) return <div className="p-3 text-[13px]">Cargando…</div>
  if (!superAdmin) return <div className="p-3 text-[13px]">Solo para super administradores.</div>
  if (!v) return <div className="p-3 text-[13px]">Cargando…</div>

  const nombre = (cod?: string) => v.empleados?.find((e) => e.codigo === cod)?.nombre ?? cod ?? '?'

  // Sin acceso (todavía cerrado): solo la sucesión, por si la gerencia no puede firmar.
  if (!v.acceso)
    return (
      <div className="flex max-w-[760px] flex-col gap-2 p-3 text-[13px]">
        <b className="text-[15px] text-[#1d3a8a]">Acuerdos de Dirección</b>
        <div>
          Los Acuerdos de Dirección los lleva por ahora la gerencia (<b>{v.gerente.nombre}</b>), que decidirá cuándo abrirlos al resto de super administradores.
          Todo lo que se acuerda queda en la Auditoría.
        </div>
        <GwGroup title="Solo si la gerencia no puede firmar (sucesión)">
          <div className="flex flex-col gap-1.5">
            <span className="text-[12px]">
              Si la gerencia no puede firmar (baja larga, incapacidad…), los demás super administradores pueden proponer quién la asume, con el documento legal
              adjunto (acta, escritura o certificado). Entra en vigor 7 días después de la última firma, salvo que la gerencia lo rechace. Avisa a todos al
              momento.
            </span>
            <NuevoAcuerdo
              v={v}
              soloSucesion
              onHecho={(t) => (setMsg({ texto: t, error: false }), void cargar())}
              onError={(t) => setMsg({ texto: t, error: true })}
            />
          </div>
        </GwGroup>
        {lista.length > 0 && <ListaAcuerdos lista={lista} nombre={nombre} onCambio={cargar} setMsg={setMsg} />}
        {msg && <div className={`text-[12px] ${msg.error ? 'text-[#c42b1c]' : 'text-[#1a7f37]'}`}>{msg.texto}</div>}
      </div>
    )

  const pendientes = lista.filter((a) => a.me_toca).length
  return (
    <div className="p-2">
      <GwTabs
        rows={[
          [
            { key: 'vigentes', label: 'Protocolos vigentes' },
            { key: 'acuerdos', label: `Acuerdos${pendientes ? ` (${pendientes} por firmar)` : ''}` },
            { key: 'nuevo', label: 'Nuevo acuerdo' },
            { key: 'operativa', label: 'Operativa' },
          ],
        ]}
        active={tab}
        onChange={(t) => (setTab(t), setMsg(null))}
      >
        <div className="flex flex-col gap-2 p-2 text-[13px]">
          {msg && <div className={`text-[12px] ${msg.error ? 'text-[#c42b1c]' : 'text-[#1a7f37]'}`}>{msg.texto}</div>}
          {tab === 'vigentes' && <ProtocolosVigentes v={v} onCambio={cargar} setMsg={setMsg} />}
          {tab === 'acuerdos' && <ListaAcuerdos lista={lista} nombre={nombre} onCambio={cargar} setMsg={setMsg} />}
          {tab === 'nuevo' && (
            <NuevoAcuerdo
              v={v}
              onHecho={(t) => (setMsg({ texto: t, error: false }), setTab('acuerdos'), void cargar())}
              onError={(t) => setMsg({ texto: t, error: true })}
            />
          )}
          {tab === 'operativa' && <Operativa />}
        </div>
      </GwTabs>
    </div>
  )
}

function ProtocolosVigentes({ v, onCambio, setMsg }: { v: Vigentes; onCambio: () => void; setMsg: (m: { texto: string; error: boolean }) => void }) {
  async function abrir(abrir: boolean) {
    if (
      !confirm(
        abrir
          ? '¿Abrir los Acuerdos de Dirección a todos los super administradores? Desde entonces, cada acuerdo lo tendrán que firmar todos.'
          : '¿Volver a dejar los Acuerdos solo para la gerencia?',
      )
    )
      return
    const { error } = await supabase.rpc('fn_acuerdos_abrir', { p_abrir: abrir })
    if (error) return setMsg({ texto: error.message, error: true })
    setMsg({ texto: abrir ? 'Acuerdos abiertos a todos los super administradores.' : 'Acuerdos solo para la gerencia.', error: false })
    onCambio()
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        <GwGroup title="Gobierno">
          <div className="flex flex-col gap-1">
            <div>
              Gerencia: <b>{v.gerente.nombre}</b>
            </div>
            <div>
              Acuerdos de Dirección: <b>{v.acuerdos_abiertos ? 'abiertos a todos los super administradores (firman todos)' : 'solo la gerencia'}</b>
            </div>
            {v.soy_gerente && (
              <button type="button" className="gw-btn self-start" onClick={() => void abrir(!v.acuerdos_abiertos)}>
                {v.acuerdos_abiertos ? 'Cerrar a los demás' : 'Abrir a los demás super administradores'}
              </button>
            )}
            {v.ultimo_acuerdo && (
              <div className="text-[12px] text-[#555]">
                Último acuerdo en vigor: nº {v.ultimo_acuerdo.id} «{v.ultimo_acuerdo.titulo}» ({fecha(v.ultimo_acuerdo.en_vigor_en)})
              </div>
            )}
          </div>
        </GwGroup>
        <GwGroup title="Controles">
          <div className="flex flex-col gap-1">
            <div>
              Doble firma de asientos manuales desde: <b>{eur(v.doble_firma)}</b>
            </div>
            <div>
              Teletrabajo: <b>{v.control_remoto ? 'se bloquea a quien no tiene permiso' : 'solo se apunta (no se bloquea)'}</b> · {v.redes} red(es) de tienda
            </div>
            <div className="text-[12px]">Con permiso de teletrabajo: {v.teletrabajo?.join(', ') || 'nadie'}</div>
          </div>
        </GwGroup>
      </div>
      <GwGroup title="Super administradores y avisos de auditoría">
        <table className="gw-grid w-full bg-white">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Avisos que recibe</th>
              <th>Horas del globo</th>
              <th>Resumen por correo</th>
            </tr>
          </thead>
          <tbody>
            {(v.super_administradores ?? []).map((s) => (
              <tr key={s.codigo}>
                <td>
                  {s.nombre}
                  {s.codigo === v.gerente.codigo ? ' (gerencia)' : ''}
                </td>
                <td>{s.grupos.map((g) => GRUPOS[g] ?? g).join(', ')}</td>
                <td>{s.horas.join(', ')}</td>
                <td>{s.correo ? 'Sí' : 'No'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </GwGroup>
      <div className="text-[12px] text-[#555]">
        Todo esto solo cambia con un acuerdo firmado (pestaña «Nuevo acuerdo»). La auditoría está por encima: ningún acuerdo puede tocarla, y todos, también la
        gerencia, quedan registrados.
      </div>
    </div>
  )
}

function ListaAcuerdos({
  lista,
  nombre,
  onCambio,
  setMsg,
}: {
  lista: Acuerdo[]
  nombre: (cod?: string) => string
  onCambio: () => void
  setMsg: (m: { texto: string; error: boolean }) => void
}) {
  const [abierto, setAbierto] = useState<number | null>(lista.find((a) => a.me_toca)?.id ?? null)

  async function firmar(a: Acuerdo, firma: boolean) {
    let comentario: string | null = null
    if (!firma) {
      comentario = prompt('¿Por qué lo rechazas?')
      if (!comentario) return
    } else if (!confirm(`¿Firmas el acuerdo «${a.titulo}»? Si eres el último en firmar, entra en vigor y se aplican sus cambios.`)) return
    const { data, error } = await supabase.rpc('fn_acuerdo_firmar', { p_id: a.id, p_firma: firma, p_comentario: comentario })
    if (error) return setMsg({ texto: error.message, error: true })
    setMsg({
      texto:
        data === 'en_vigor'
          ? 'Firmado: el acuerdo está en vigor y sus cambios ya se han aplicado.'
          : data === 'en_espera'
            ? 'Firmado: la sucesión entrará en vigor dentro de 7 días si la gerencia no la rechaza.'
            : data === 'rechazado'
              ? 'Rechazado.'
              : 'Firmado. Faltan otras firmas.',
      error: false,
    })
    onCambio()
  }

  async function proponer(a: Acuerdo) {
    const { error } = await supabase.rpc('fn_acuerdo_proponer', { p_id: a.id })
    if (error) return setMsg({ texto: error.message, error: true })
    setMsg({ texto: 'Propuesto para firma.', error: false })
    onCambio()
  }

  async function retirar(a: Acuerdo) {
    if (!confirm('¿Retirar este acuerdo? Quedará registrado como retirado.')) return
    const { error } = await supabase.rpc('fn_acuerdo_retirar', { p_id: a.id })
    if (error) return setMsg({ texto: error.message, error: true })
    onCambio()
  }

  async function verAdjunto(a: Acuerdo) {
    const { data } = await supabase.from('acuerdo_adjunto').select('nombre, base64').eq('acuerdo_id', a.id).maybeSingle()
    if (!data) return
    const enlace = document.createElement('a')
    enlace.href = data.base64.startsWith('data:') ? data.base64 : `data:application/pdf;base64,${data.base64}`
    enlace.download = data.nombre
    enlace.click()
  }

  if (!lista.length) return <div className="text-[#777]">Todavía no hay acuerdos.</div>
  return (
    <div className="flex flex-col gap-1">
      {lista.map((a) => (
        <div key={a.id} className={`border ${a.me_toca ? 'border-[#b07d0a] bg-[#fff8e1]' : 'border-[var(--gw-border)] bg-white'}`}>
          <button
            type="button"
            className="flex w-full items-center gap-2 px-2 py-1 text-left hover:bg-[#e8f0fb]"
            onClick={() => setAbierto(abierto === a.id ? null : a.id)}
          >
            <b>Nº {a.id}</b>
            <span className="flex-1">{a.titulo}</span>
            <span className="text-[12px]">{TIPOS[a.tipo]}</span>
            <span className="w-[150px] text-right">{a.me_toca ? '✍️ Te toca firmar' : ESTADO[a.estado]}</span>
          </button>
          {abierto === a.id && (
            <div className="flex flex-col gap-1.5 border-t border-[var(--gw-border)] p-2">
              {a.texto && <div className="whitespace-pre-wrap">{a.texto}</div>}
              {a.cambios.length > 0 && (
                <div>
                  <b>Qué cambia:</b>
                  <ul className="ml-5 list-disc">
                    {a.cambios.map((c, i) => (
                      <li key={i}>{textoCambio(c, nombre)}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="text-[12px] text-[#555]">
                Propuesto por {a.creado_nombre ?? a.creado_por} · {fecha(a.propuesto_en ?? a.creado_en)}
                {a.en_vigor_en ? ` · en vigor desde ${fecha(a.en_vigor_en)}` : ''}
                {a.efecto_en && a.estado === 'pendiente' ? ` · entrará en vigor el ${fecha(a.efecto_en)} si la gerencia no lo rechaza` : ''}
                {a.motivo_rechazo ? ` · motivo del rechazo: ${a.motivo_rechazo}` : ''}
              </div>
              {(a.firmas?.length || a.firmantes?.length) && (
                <div className="text-[12px]">
                  Firmas:{' '}
                  {(a.firmas ?? []).map((f) => `${f.nombre ?? f.empleado} ${f.decision === 'firma' ? '✅' : '❌'} ${fecha(f.firmado_en)}`).join(' · ') ||
                    'ninguna'}
                  {a.estado === 'pendiente' && a.firmantes && (
                    <>
                      {' '}
                      · Faltan:{' '}
                      {a.firmantes
                        .filter((f) => !(a.firmas ?? []).some((x) => x.empleado === f))
                        .map((f) => nombre(f))
                        .join(', ') || 'nadie'}
                    </>
                  )}
                </div>
              )}
              {a.huella && <div className="break-all font-mono text-[10px] text-[#777]">Huella: {a.huella}</div>}
              <div className="flex flex-wrap gap-1.5">
                {a.adjunto_nombre && (
                  <button type="button" className="gw-btn" onClick={() => void verAdjunto(a)}>
                    📎 {a.adjunto_nombre}
                  </button>
                )}
                {a.estado === 'borrador' && a.mio && (
                  <button type="button" className="gw-btn" onClick={() => void proponer(a)}>
                    Proponer para firma
                  </button>
                )}
                {a.me_toca && (
                  <>
                    <button type="button" className="gw-btn font-bold" onClick={() => void firmar(a, true)}>
                      ✍️ Firmar
                    </button>
                    <button type="button" className="gw-btn" onClick={() => void firmar(a, false)}>
                      Rechazar
                    </button>
                  </>
                )}
                {a.estado === 'pendiente' && a.tipo === 'sucesion' && !a.me_toca && a.efecto_en && (
                  <button type="button" className="gw-btn" onClick={() => void firmar(a, false)} title="Solo la gerencia puede rechazar una sucesión en espera">
                    Rechazar la sucesión
                  </button>
                )}
                {(a.estado === 'borrador' || a.estado === 'pendiente') && a.mio && (
                  <button type="button" className="gw-btn" onClick={() => void retirar(a)}>
                    Retirar
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function NuevoAcuerdo({
  v,
  soloSucesion = false,
  onHecho,
  onError,
}: {
  v: Vigentes
  soloSucesion?: boolean
  onHecho: (t: string) => void
  onError: (t: string) => void
}) {
  const [titulo, setTitulo] = useState(soloSucesion ? 'Sucesión en la gerencia' : '')
  const [texto, setTexto] = useState('')
  const [tipo, setTipo] = useState<Acuerdo['tipo']>(soloSucesion ? 'sucesion' : 'protocolo')
  const [cambios, setCambios] = useState<Cambio[]>([])
  const [adjunto, setAdjunto] = useState<{ nombre: string; base64: string } | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const empleados = v.empleados ?? []
  const [condiciones, setCondiciones] = useState<{ id: number; apartado: string; regla: string; porque: string | null }[]>([])
  useEffect(() => {
    if (soloSucesion) return
    void supabase
      .from('condicion_programacion')
      .select('id, apartado, regla, porque')
      .eq('activa', true)
      .order('apartado')
      .order('orden')
      .then(({ data }) => setCondiciones((data ?? []) as { id: number; apartado: string; regla: string; porque: string | null }[]))
  }, [soloSucesion])

  const poner = (i: number, c: Partial<Cambio>) => setCambios((cs) => cs.map((x, j) => (j === i ? { ...x, ...c } : x)))
  const nuevoCambio = (accion: Cambio['accion']): Cambio =>
    accion === 'condicion'
      ? { accion, operacion: 'alta', apartado: 'Seguridad', regla: '', porque: '' }
      : accion === 'parametro'
        ? { accion, clave: 'contab.importe_doble_firma', valor: v.doble_firma }
        : accion === 'acuerdos_abiertos'
          ? { accion, valor: true }
          : accion === 'avisos_grupos'
            ? { accion, empleado: empleados[0]?.codigo, grupos: ['todo'] }
            : accion === 'super_administrador'
              ? { accion, empleado: empleados[0]?.codigo, valor: true }
              : { accion, empleado: empleados[0]?.codigo }

  function leerAdjunto(f: File | undefined) {
    if (!f) return setAdjunto(null)
    if (f.size > 8 * 1024 * 1024) return onError('El documento es demasiado grande (máximo 8 MB).')
    const r = new FileReader()
    r.onload = () => setAdjunto({ nombre: f.name, base64: String(r.result) })
    r.readAsDataURL(f)
  }

  async function guardar(proponerYa: boolean) {
    setOcupado(true)
    const { data, error } = await supabase.rpc('fn_acuerdo_guardar', {
      p_id: null,
      p_titulo: titulo,
      p_texto: texto,
      p_tipo: tipo,
      p_cambios: cambios,
      p_adjunto_nombre: adjunto?.nombre ?? null,
      p_adjunto_base64: adjunto?.base64 ?? null,
    })
    if (error) {
      setOcupado(false)
      return onError(error.message)
    }
    if (proponerYa) {
      const { error: e2 } = await supabase.rpc('fn_acuerdo_proponer', { p_id: data })
      setOcupado(false)
      if (e2) return onError(`Guardado como borrador, pero no se ha podido proponer: ${e2.message}`)
      onHecho(
        v.acuerdos_abiertos || tipo === 'sucesion'
          ? 'Acuerdo propuesto: ya lo pueden firmar los demás.'
          : 'Acuerdo firmado y en vigor: sus cambios ya se han aplicado.',
      )
    } else {
      setOcupado(false)
      onHecho('Borrador guardado. Para que cuente, pulsa «Proponer para firma» en la lista.')
    }
    setTitulo('')
    setTexto('')
    setCambios([])
    setAdjunto(null)
  }

  const acciones: { id: Cambio['accion']; texto: string }[] = soloSucesion
    ? [{ id: 'gerencia', texto: 'Quién asume la gerencia' }]
    : [
        { id: 'super_administrador', texto: 'Nombrar o quitar super administrador' },
        { id: 'avisos_grupos', texto: 'Avisos que recibe un super administrador' },
        { id: 'gerencia', texto: 'Cambio de gerencia' },
        { id: 'parametro', texto: 'Doble firma o control de teletrabajo' },
        { id: 'acuerdos_abiertos', texto: 'Abrir o cerrar los Acuerdos' },
        { id: 'condicion', texto: 'Condición de programación' },
      ]

  return (
    <div className="flex max-w-[900px] flex-col gap-2">
      <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_260px]">
        <GwField label="Título">
          <GwInput value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ej.: Protocolo inicial, Cambio de gerencia por jubilación…" />
        </GwField>
        {!soloSucesion && (
          <GwField label="Tipo">
            <GwSelect value={tipo} onChange={(e) => setTipo(e.target.value as Acuerdo['tipo'])}>
              {(['protocolo', 'gerencia', 'otro'] as const).map((t) => (
                <option key={t} value={t}>
                  {TIPOS[t]}
                </option>
              ))}
            </GwSelect>
          </GwField>
        )}
      </div>
      <GwField label="Texto del acuerdo (qué se acuerda y por qué)">
        <GwTextArea rows={5} value={texto} onChange={(e) => setTexto(e.target.value)} />
      </GwField>
      <GwGroup title="Qué cambia (el programa lo aplica solo al entrar en vigor)">
        <div className="flex flex-col gap-1.5">
          {cambios.map((c, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2 border-b border-dashed border-[var(--gw-border)] pb-1">
              <b className="w-[220px]">{acciones.find((x) => x.id === c.accion)?.texto ?? c.accion}</b>
              {(c.accion === 'super_administrador' || c.accion === 'avisos_grupos' || c.accion === 'gerencia') && (
                <GwSelect value={c.empleado ?? ''} onChange={(e) => poner(i, { empleado: e.target.value })}>
                  {empleados.map((e) => (
                    <option key={e.codigo} value={e.codigo}>
                      {e.nombre}
                    </option>
                  ))}
                </GwSelect>
              )}
              {c.accion === 'super_administrador' && (
                <GwSelect value={c.valor ? 'si' : 'no'} onChange={(e) => poner(i, { valor: e.target.value === 'si' })}>
                  <option value="si">pasa a ser super administrador</option>
                  <option value="no">deja de ser super administrador</option>
                </GwSelect>
              )}
              {c.accion === 'avisos_grupos' &&
                Object.entries(GRUPOS).map(([g, t]) => (
                  <label key={g} className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={(c.grupos ?? []).includes(g)}
                      onChange={(e) => poner(i, { grupos: e.target.checked ? [...(c.grupos ?? []), g] : (c.grupos ?? []).filter((x) => x !== g) })}
                    />
                    {t}
                  </label>
                ))}
              {c.accion === 'parametro' && (
                <>
                  <GwSelect
                    value={c.clave}
                    onChange={(e) =>
                      poner(i, { clave: e.target.value, valor: e.target.value === 'contab.importe_doble_firma' ? v.doble_firma : !v.control_remoto })
                    }
                  >
                    <option value="contab.importe_doble_firma">Importe de la doble firma</option>
                    <option value="acceso.control_remoto">Control de teletrabajo</option>
                  </GwSelect>
                  {c.clave === 'contab.importe_doble_firma' ? (
                    <GwInput type="number" className="w-[110px]" value={Number(c.valor ?? 0)} onChange={(e) => poner(i, { valor: Number(e.target.value) })} />
                  ) : (
                    <GwSelect value={c.valor ? 'si' : 'no'} onChange={(e) => poner(i, { valor: e.target.value === 'si' })}>
                      <option value="si">activado (bloquea)</option>
                      <option value="no">desactivado (solo apunta)</option>
                    </GwSelect>
                  )}
                </>
              )}
              {c.accion === 'condicion' && (
                <div className="flex w-full flex-col gap-1.5">
                  <div className="flex flex-wrap gap-2">
                    <GwSelect value={c.operacion} onChange={(e) => poner(i, { operacion: e.target.value as Cambio['operacion'] })}>
                      <option value="alta">añadir una condición</option>
                      <option value="cambio">cambiar una condición</option>
                      <option value="baja">dar de baja una condición</option>
                    </GwSelect>
                    {c.operacion !== 'alta' && (
                      <GwSelect
                        value={c.id ?? ''}
                        onChange={(e) => {
                          const sel = condiciones.find((x) => x.id === Number(e.target.value))
                          poner(i, { id: Number(e.target.value), apartado: sel?.apartado, regla: sel?.regla, porque: sel?.porque ?? '' })
                        }}
                      >
                        <option value="">— elige —</option>
                        {condiciones.map((x) => (
                          <option key={x.id} value={x.id}>
                            {x.apartado} · {x.regla.slice(0, 80)}
                          </option>
                        ))}
                      </GwSelect>
                    )}
                  </div>
                  {c.operacion !== 'baja' && (
                    <>
                      <GwInput
                        placeholder="Apartado (Seguridad, Auditoría, Pantallas…)"
                        value={c.apartado ?? ''}
                        onChange={(e) => poner(i, { apartado: e.target.value })}
                      />
                      <GwInput placeholder="La regla" value={c.regla ?? ''} onChange={(e) => poner(i, { regla: e.target.value })} />
                      <GwInput placeholder="Por qué (una línea)" value={c.porque ?? ''} onChange={(e) => poner(i, { porque: e.target.value })} />
                    </>
                  )}
                </div>
              )}
              {c.accion === 'acuerdos_abiertos' && (
                <GwSelect value={c.valor ? 'si' : 'no'} onChange={(e) => poner(i, { valor: e.target.value === 'si' })}>
                  <option value="si">abrir a todos los super administradores</option>
                  <option value="no">solo la gerencia</option>
                </GwSelect>
              )}
              <button type="button" className="gw-btn ml-auto" onClick={() => setCambios((cs) => cs.filter((_, j) => j !== i))}>
                Quitar
              </button>
            </div>
          ))}
          <div className="flex flex-wrap gap-1.5">
            {acciones.map((a) => (
              <button key={a.id} type="button" className="gw-btn" onClick={() => setCambios((cs) => [...cs, nuevoCambio(a.id)])}>
                + {a.texto}
              </button>
            ))}
          </div>
          {tipo === 'otro' && <span className="text-[12px] text-[#555]">«Otro»: el acuerdo solo deja constancia; no hace falta añadir cambios.</span>}
        </div>
      </GwGroup>
      <GwField label={tipo === 'sucesion' ? 'Documento legal (obligatorio: acta, escritura o certificado, en PDF)' : 'Documento (opcional: acta en PDF)'}>
        <input type="file" accept="application/pdf,image/*" onChange={(e) => leerAdjunto(e.target.files?.[0])} />
      </GwField>
      <div className="flex gap-1.5">
        <button type="button" className="gw-btn" disabled={ocupado} onClick={() => void guardar(false)}>
          Guardar borrador
        </button>
        <button type="button" className="gw-btn font-bold" disabled={ocupado} onClick={() => void guardar(true)}>
          {v.acuerdos_abiertos || tipo === 'sucesion' ? 'Proponer para firma' : 'Firmar y poner en vigor'}
        </button>
      </div>
      <span className="text-[12px] text-[#555]">
        Un acuerdo en vigor no se puede cambiar ni borrar: si algo cambia, se hace otro acuerdo que lo sustituya. Los acuerdos no pueden tocar la auditoría.
      </span>
    </div>
  )
}

function Operativa() {
  return (
    <GwOperativa
      bloques={[
        {
          titulo: 'Para qué sirve',
          notas: [
            'Las reglas de control de la empresa (quién es super administrador, qué avisos recibe cada uno, quién es la gerencia, la doble firma y el teletrabajo) solo cambian con un acuerdo firmado. Ni la gerencia las cambia directamente.',
            'La auditoría está por encima de todo: ningún acuerdo puede desactivarla ni dejar fuera a nadie, y todo lo que se hace aquí queda registrado en ella.',
          ],
        },
        {
          titulo: 'Hacer un acuerdo',
          pasos: [
            'Pestaña «Nuevo acuerdo»: título, texto (qué se acuerda y por qué) y, en «Qué cambia», los cambios con los botones «+».',
            'Si hay acta, adjúntala en PDF.',
            '«Firmar y poner en vigor» (mientras los Acuerdos son solo de la gerencia) o «Proponer para firma» (cuando están abiertos: firman todos los super administradores).',
            'Cuando están todas las firmas, el acuerdo entra en vigor y el programa aplica los cambios solo.',
          ],
          notas: ['Un acuerdo en vigor no se cambia ni se borra: se hace otro que lo sustituya. Cada uno lleva su huella, encadenada con la del anterior.'],
        },
        {
          titulo: 'Abrir los Acuerdos a los demás',
          pasos: ['En «Protocolos vigentes», la gerencia pulsa «Abrir a los demás super administradores». Desde entonces, cada acuerdo lo firman todos.'],
        },
        {
          titulo: 'Si la gerencia no puede firmar (sucesión)',
          pasos: [
            'Cualquier super administrador, desde esta pantalla, propone un acuerdo de sucesión con el documento legal adjunto.',
            'Lo firman todos los super administradores menos la gerencia. Avisa a todos al momento.',
            'Entra en vigor 7 días después de la última firma, salvo que la gerencia lo rechace antes.',
          ],
          notas: ['Esto ordena el control dentro del programa; los poderes y escrituras de la empresa van al notario o a la asesoría, y aquí se adjuntan.'],
        },
      ]}
    />
  )
}
