// Parámetros → Condiciones de Programación (Luis, 03/11/2026). Las reglas que cumple todo el que programa
// (Rober, los Claude, Cowork), a la vista de los super administradores:
//  · Condiciones: por apartado, con el porqué. Solo cambian con un Acuerdo de Dirección.
//  · Cumplimiento: semáforo que se comprueba solo (fn_condiciones_cumplimiento).
//  · Seguridad de Ofipapel: qué protege cada aplicación, qué le falta, copias y qué hacer si pasa algo.
//  · Historial: altas, cambios y bajas de condiciones (auditoría).
// Copia para los Claude en erp-propio/docs/CONDICIONES_PROGRAMACION.md («Descargar para el repositorio»).

import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'
import { usePermisos } from '../../../lib/PermisosContext'
import { GwTabs } from '../../../components/gw'
import { GwOperativa } from '../../../components/gw/GwOperativa'

interface Condicion {
  id: number
  apartado: string
  regla: string
  porque: string | null
  orden: number
  activa: boolean
  creado_en: string
  acuerdo_id: number | null
}
interface Punto {
  punto: string
  estado: 'verde' | 'ambar' | 'rojo' | 'gris'
  detalle: string
}

const COLOR: Record<Punto['estado'], { fondo: string; borde: string; icono: string; texto: string }> = {
  verde: { fondo: '#eaf6ec', borde: '#1a7f37', icono: '🟢', texto: 'Bien' },
  ambar: { fondo: '#fff4ce', borde: '#b07d0a', icono: '🟡', texto: 'Revisar' },
  rojo: { fondo: '#fdecea', borde: '#c42b1c', icono: '🔴', texto: 'Mal' },
  gris: { fondo: '#f2f2f2', borde: '#888', icono: '⚪', texto: 'A mano' },
}

export function AreaCondiciones({ apartado }: { apartado: string | null }) {
  const { superAdmin, cargando } = usePermisos()
  const [tab, setTab] = useState('condiciones')
  if (cargando) return <div className="p-3 text-[13px]">Cargando…</div>
  if (!superAdmin) return <div className="p-3 text-[13px]">Las Condiciones de Programación solo las ven los super administradores.</div>
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <GwTabs
        rows={[
          [
            { key: 'condiciones', label: 'Condiciones' },
            { key: 'cumplimiento', label: 'Cumplimiento' },
            { key: 'seguridad', label: 'Seguridad de Ofipapel' },
            { key: 'historial', label: 'Historial' },
            { key: 'operativa', label: 'Operativa' },
          ],
        ]}
        active={tab}
        onChange={setTab}
      >
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto p-2 text-[13px]">
          {tab === 'condiciones' && <Condiciones apartado={apartado} />}
          {tab === 'cumplimiento' && <Cumplimiento />}
          {tab === 'seguridad' && <Seguridad />}
          {tab === 'historial' && <Historial />}
          {tab === 'operativa' && <Operativa />}
        </div>
      </GwTabs>
    </div>
  )
}

/** Apartados para el árbol de la izquierda de Parámetros. */
export function useApartadosCondiciones(activo: boolean) {
  const [apartados, setApartados] = useState<string[]>([])
  useEffect(() => {
    if (!activo) return
    void supabase
      .from('condicion_programacion')
      .select('apartado')
      .eq('activa', true)
      .then(({ data }) => setApartados([...new Set(((data ?? []) as { apartado: string }[]).map((x) => x.apartado))]))
  }, [activo])
  return apartados
}

function Condiciones({ apartado }: { apartado: string | null }) {
  const navigate = useNavigate()
  const [lista, setLista] = useState<Condicion[]>([])
  const [verBajas, setVerBajas] = useState(false)
  useEffect(() => {
    void supabase
      .from('condicion_programacion')
      .select('*')
      .order('apartado')
      .order('orden')
      .then(({ data }) => setLista((data ?? []) as Condicion[]))
  }, [])

  const vistas = lista.filter((c) => (verBajas || c.activa) && (!apartado || c.apartado === apartado))
  const grupos = [...new Set(vistas.map((c) => c.apartado))]

  function descargar() {
    const activas = lista.filter((c) => c.activa)
    const aps = [...new Set(activas.map((c) => c.apartado))]
    const md = [
      '# Condiciones de Programación de Ofipapel',
      '',
      'OBLIGATORIAS para todo el que programa en este repositorio (Rober, los Claude, Cowork). Las fija la gerencia y solo',
      'cambian con un Acuerdo de Dirección (ERP → Archivo → Parámetros → Condiciones de Programación). Este fichero es una',
      `copia sacada del ERP el ${new Date().toLocaleDateString('es-ES')}: si no coincide con el ERP, manda el ERP.`,
      '',
      ...aps.flatMap((a) => [
        `## ${a}`,
        '',
        ...activas.filter((c) => c.apartado === a).map((c, i) => `${i + 1}. **${c.regla}**${c.porque ? ` — ${c.porque}` : ''}`),
        '',
      ]),
    ].join('\n')
    const enlace = document.createElement('a')
    enlace.href = URL.createObjectURL(new Blob([md], { type: 'text/markdown;charset=utf-8' }))
    enlace.download = 'CONDICIONES_PROGRAMACION.md'
    enlace.click()
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex-1 text-[12px] text-[#555]">
          Las cumple todo el que programa: Rober, los Claude y Cowork. Solo cambian con un Acuerdo de Dirección, para que nadie se rebaje sus propias reglas.
        </span>
        <label className="flex items-center gap-1 text-[12px]">
          <input type="checkbox" checked={verBajas} onChange={(e) => setVerBajas(e.target.checked)} /> Ver las dadas de baja
        </label>
        <button type="button" className="gw-btn" onClick={() => navigate('/archivo/acuerdos')}>
          Proponer un cambio (Acuerdo)
        </button>
        <button type="button" className="gw-btn" onClick={descargar} title="Copia para el repositorio, para que los Claude la lean al empezar">
          Descargar para el repositorio
        </button>
      </div>
      {grupos.map((g) => (
        <section key={g} className="flex flex-col gap-1">
          <h3 className="m-0 text-[15px] font-bold text-[#1d3a8a]">{g}</h3>
          {vistas
            .filter((c) => c.apartado === g)
            .map((c, i) => (
              <div key={c.id} className={`border-l-4 bg-white px-2 py-1.5 ${c.activa ? 'border-[#1d3a8a]' : 'border-[#999] opacity-60'}`}>
                <div className="font-semibold">
                  {i + 1}. {c.regla}
                  {!c.activa && <span className="ml-2 text-[11px] text-[#c42b1c]">(dada de baja)</span>}
                </div>
                {c.porque && <div className="text-[12px] text-[#555]">Por qué: {c.porque}</div>}
                <div className="text-[10px] text-[#999]">
                  Nº {c.id}
                  {c.acuerdo_id ? ` · Acuerdo nº ${c.acuerdo_id}` : ' · Condición de partida'}
                </div>
              </div>
            ))}
        </section>
      ))}
    </div>
  )
}

function Cumplimiento() {
  const [puntos, setPuntos] = useState<Punto[]>([])
  const [cuando, setCuando] = useState<string | null>(null)
  const [mirando, setMirando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const mirar = useCallback(async () => {
    setMirando(true)
    setError(null)
    const { data, error: e } = await supabase.rpc('fn_condiciones_cumplimiento')
    setMirando(false)
    if (e) return setError(e.message)
    const d = data as { comprobado_en: string; puntos: Punto[] }
    setPuntos(d.puntos)
    setCuando(d.comprobado_en)
  }, [])
  useEffect(() => {
    void mirar()
  }, [mirar])

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="flex-1 text-[12px] text-[#555]">
          Se comprueba solo al abrir esta pestaña. {cuando ? `Última comprobación: ${new Date(cuando).toLocaleString('es-ES')}.` : ''}
        </span>
        <button type="button" className="gw-btn" disabled={mirando} onClick={() => void mirar()}>
          {mirando ? 'Comprobando…' : 'Comprobar ahora'}
        </button>
      </div>
      {error && <div className="text-[12px] text-[#c42b1c]">{error}</div>}
      {puntos.map((p) => {
        const c = COLOR[p.estado]
        return (
          <div key={p.punto} className="flex items-start gap-2 border px-2 py-1.5" style={{ background: c.fondo, borderColor: c.borde }}>
            <span aria-hidden="true">{c.icono}</span>
            <div className="flex-1">
              <b>{p.punto}</b> <span className="text-[11px] text-[#555]">({c.texto})</span>
              <div className="text-[12px]">{p.detalle}</div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function Seguridad() {
  const filas: { app: string; estado: Punto['estado']; protege: string; falta: string }[] = [
    {
      app: 'ERP Avatar',
      estado: 'verde',
      protege:
        'Usuario y clave segura, bloqueo tras 5 fallos, doble verificación opcional, permisos por grupo y en la base de datos, auditoría sellada, controles contables, horario y teletrabajo.',
      falta: 'Cerrar las funciones abiertas sin sesión (tarea 26); «No soy un robot» (tarea 14); auditoría en 7 tablas.',
    },
    {
      app: 'Finanzas, Alquileres, Vacaciones y Fichaje',
      estado: 'rojo',
      protege: 'Pantalla de entrada.',
      falta: 'Según la auditoría de agosto, sus datos se podían leer sin clave (y en Finanzas modificar). Tarea 23 (Rober).',
    },
    { app: 'Joe App', estado: 'verde', protege: 'Cuenta real por dispositivo y permisos en la base de datos (comprobado el 08/09/2026).', falta: '—' },
    {
      app: 'Bot de WhatsApp y su panel',
      estado: 'ambar',
      protege: 'Claves solo en el servidor (Netlify) y firma de Meta en cada mensaje.',
      falta: 'Sin revisar en esta auditoría: revisarlo con Rober.',
    },
    {
      app: 'Web ofipapel.net',
      estado: 'ambar',
      protege: 'La lleva la empresa externa; el ERP solo la lee.',
      falta: 'Fuera de nuestro control hasta la web nueva.',
    },
  ]
  return (
    <div className="flex max-w-[980px] flex-col gap-3">
      <section className="flex flex-col gap-1">
        <h3 className="m-0 text-[15px] font-bold text-[#1d3a8a]">Cada aplicación</h3>
        <table className="gw-grid w-full bg-white">
          <thead>
            <tr>
              <th>Aplicación</th>
              <th>Estado</th>
              <th>Qué la protege</th>
              <th>Qué le falta</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.app}>
                <td className="font-bold">{f.app}</td>
                <td className="whitespace-nowrap">
                  {COLOR[f.estado].icono} {COLOR[f.estado].texto}
                </td>
                <td>{f.protege}</td>
                <td>{f.falta}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="flex flex-col gap-1">
        <h3 className="m-0 text-[15px] font-bold text-[#1d3a8a]">Copias de seguridad</h3>
        <ul className="m-0 ml-5 list-disc">
          <li>ERP: Utilidades → Hacer Copia (Alt+F8) descarga los datos en un ZIP.</li>
          <li>Copias automáticas de Supabase: dependen del plan contratado (tarea 24). Recomendado: plan de pago con copias diarias.</li>
          <li>Además, una copia semanal fuera de Supabase (disco o nube propia), por si pasara algo con la cuenta.</li>
          <li>Huella de la auditoría por correo cada domingo a la gerencia (cuando esté el correo de la empresa).</li>
        </ul>
      </section>
      <section className="flex flex-col gap-1">
        <h3 className="m-0 text-[15px] font-bold text-[#1d3a8a]">Quién tiene las llaves</h3>
        <ul className="m-0 ml-5 list-disc">
          <li>Programa: cada persona con su usuario; super administradores Luis (gerencia), David y Rober.</li>
          <li>Llaves técnicas (panel de Supabase, Netlify, GitHub): el programador. Por eso la auditoría se sella y se comprueba su integridad.</li>
          <li>Claves de servicios (correo, WooCommerce, IA, WhatsApp): solo en los secretos del servidor.</li>
        </ul>
      </section>
      <section className="flex flex-col gap-1">
        <h3 className="m-0 text-[15px] font-bold text-[#1d3a8a]">Si pasa algo</h3>
        <ol className="m-0 ml-5 list-decimal">
          <li>No borrar ni tocar nada.</li>
          <li>Avisar a la gerencia y a los demás super administradores.</li>
          <li>Comprobar la integridad (Archivo → Auditoría y Contabilidad → Control y Firmas).</li>
          <li>Si hay sospecha de clave robada: cambiarla y quitar el acceso a ese usuario hasta aclararlo.</li>
          <li>Si se han perdido datos: recuperar desde la última copia.</li>
        </ol>
      </section>
    </div>
  )
}

interface Movimiento {
  id: number
  ocurrido_en: string
  operacion: string
  datos_antes: Record<string, unknown> | null
  datos_despues: Record<string, unknown> | null
  campos: string[] | null
}

function Historial() {
  const [lista, setLista] = useState<Movimiento[]>([])
  useEffect(() => {
    void supabase
      .from('auditoria')
      .select('id, ocurrido_en, operacion, datos_antes, datos_despues, campos')
      .eq('tabla', 'condicion_programacion')
      .order('ocurrido_en', { ascending: false })
      .limit(200)
      .then(({ data }) => setLista((data ?? []) as Movimiento[]))
  }, [])
  const txt = (v: unknown) => (v == null ? '' : String(v))
  return (
    <table className="gw-grid w-full bg-white">
      <thead>
        <tr>
          <th>Cuándo</th>
          <th>Qué</th>
          <th>Condición</th>
          <th>Acuerdo</th>
        </tr>
      </thead>
      <tbody>
        {lista.map((m) => {
          const d = m.datos_despues ?? m.datos_antes ?? {}
          const que =
            m.operacion === 'INSERT'
              ? 'Alta'
              : d.activa === false && m.datos_antes?.activa === true
                ? 'Baja'
                : m.operacion === 'UPDATE'
                  ? 'Cambio'
                  : m.operacion
          return (
            <tr key={m.id}>
              <td className="whitespace-nowrap">{new Date(m.ocurrido_en).toLocaleString('es-ES')}</td>
              <td>{que}</td>
              <td>
                <b>{txt(d.apartado)}</b>: {txt(d.regla)}
              </td>
              <td>{d.acuerdo_id ? `Nº ${txt(d.acuerdo_id)}` : 'De partida'}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function Operativa() {
  return (
    <GwOperativa
      bloques={[
        {
          titulo: 'Para qué sirve',
          notas: [
            'Aquí están las reglas que cumple todo el que programa el ERP y las demás aplicaciones (Rober, los Claude, Cowork), y cómo está la seguridad.',
            'Solo las ven los super administradores. Solo cambian con un Acuerdo de Dirección: nadie, tampoco el programador, se rebaja sus propias reglas. Las de la auditoría no se pueden dar de baja.',
          ],
        },
        {
          titulo: 'Cómo se usa',
          pasos: [
            '«Condiciones»: las reglas por apartado, cada una con su porqué. A la izquierda puedes elegir un apartado.',
            '«Cumplimiento»: el semáforo se comprueba solo al abrirlo. Rojo = hay que actuar; gris = se comprueba a mano (dice qué tarea lo lleva).',
            '«Seguridad de Ofipapel»: qué protege cada aplicación, qué le falta, las copias de seguridad, quién tiene las llaves y qué hacer si pasa algo.',
            'Para añadir, cambiar o dar de baja una condición: «Proponer un cambio (Acuerdo)» → Nuevo acuerdo → «Condición de programación».',
            '«Descargar para el repositorio»: saca la copia que leen los Claude al empezar; se le pasa a Claude o a Rober para que la ponga en el repositorio.',
          ],
          notas: ['Conviene revisarlo una vez al mes.'],
        },
      ]}
    />
  )
}
