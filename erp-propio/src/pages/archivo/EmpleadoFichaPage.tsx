import { useEffect, useState } from 'react'
import { Eye, EyeOff, KeyRound, UserPlus } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { GwCheck, GwDate, GwField, GwGroup, GwInline, GwInput, GwTabs, type GwTabDef } from '../../components/gw'
import { GwRecordBar } from '../../components/gw/GwRecordBar'
import { GwCampoBusqueda } from '../../components/gw/GwCampoBusqueda'
import { GwLookupDialog } from '../../components/gw/GwLookupDialog'
import { GwOperativa } from '../../components/gw/GwOperativa'
import { useFichaMaestro } from '../almacen/useFichaMaestro'
import { PieEstado } from '../almacen/piezas'
import { BloqueDireccion, CampoEnlace, ObservacionesImagen, PestanaPendiente, hoy, useEsAdministrador, useEsSuperAdministrador } from './comun'

interface Empleado {
  codigo: string
  nombre: string
  nombre_corto: string | null
  dni: string | null
  codigo_postal: string | null
  direccion: string | null
  poblacion: string | null
  provincia_codigo: string | null
  pais_codigo: string | null
  telefono_fijo: string | null
  telefono_movil: string | null
  fax: string | null
  email: string | null
  web: string | null
  fecha_alta: string | null
  fecha_baja: string | null
  activo: boolean
  rol_id: number | null
  /** Consulta periodos cerrados y gestiona Archivo → Periodos (solo lo cambia otro super administrador). */
  super_administrador: boolean
  auth_user_id: string | null
  sugerencia_clave: string | null
  vendedor_codigo: string | null
  tecnico_codigo: string | null
  cliente_codigo: string | null
  observaciones: string | null
  imagen_url: string | null
  imagen_modo: number
  actualizado_en?: string
}

const VACIO: Empleado = {
  codigo: '',
  nombre: '',
  nombre_corto: null,
  dni: null,
  codigo_postal: null,
  direccion: null,
  poblacion: null,
  provincia_codigo: null,
  pais_codigo: null,
  telefono_fijo: null,
  telefono_movil: null,
  fax: null,
  email: null,
  web: null,
  fecha_alta: null,
  fecha_baja: null,
  activo: true,
  rol_id: null,
  super_administrador: false,
  auth_user_id: null,
  sugerencia_clave: null,
  vendedor_codigo: null,
  tecnico_codigo: null,
  cliente_codigo: null,
  observaciones: null,
  imagen_url: null,
  imagen_modo: 1,
}

const TABS: GwTabDef[][] = [
  [
    { key: 'generales', label: 'Datos Generales' },
    { key: 'seguridad', label: 'Seguridad' },
    { key: 'enlaces', label: 'Enlaces' },
    { key: 'bancos', label: 'Bancos' },
    { key: 'obs', label: 'Observaciones e Imagen' },
    { key: 'operativa', label: 'Operativa' },
  ],
]

const ALTO = 410
type Patch = (p: Partial<Empleado>) => void

/** Archivo → Empleados, calcada de GeminisWin (capturas 05-11, 05-12 y 05-13). */
export function EmpleadoFichaPage() {
  const f = useFichaMaestro<Empleado>({
    tabla: 'empleado',
    base: '/empleados',
    vacio: VACIO,
    campoNombre: 'nombre',
    // auth_user_id lo pone solo la Edge Function empleados-acceso: la ficha no lo manda nunca.
    sinColumnas: ['actualizado_en', 'auth_user_id', 'baja_orden'],
    que: 'el empleado',
    titulo: 'Empleados',
    etiquetaNombre: 'Nombre',
    rpc: 'gw_lista_ordenada_maestros',
    // Los de baja, siempre al final (y en rojo).
    bajasAlFinal: 'baja_orden',
  })
  const { draft: d, patch, editing, mode } = f
  const admin = useEsAdministrador()
  const [tab, setTab] = useState('generales')
  const [buscar, setBuscar] = useState(false)
  const [recarga, setRecarga] = useState(0)

  if (f.loading) return <div className="p-4 text-[13px]">Cargando…</div>
  const ro = !editing
  const deBaja = !f.sinRegistros && mode !== 'alta' && (Boolean(f.registro.fecha_baja) || f.registro.activo === false)
  const txt = (k: keyof Empleado, title: string) => (
    <GwInput value={(d[k] as string | null) ?? ''} disabled={ro} title={title} onChange={(e) => patch({ [k]: e.target.value || null } as Partial<Empleado>)} />
  )

  async function baja() {
    if (f.sinRegistros || !f.registro.codigo) return
    if (!confirm(`¿Dar de baja el empleado ${f.registro.codigo} ${f.registro.nombre}? Queda marcado como baja, no se borra.`)) return
    const { error } = await supabase.from('empleado').update({ activo: false, fecha_baja: hoy() }).eq('codigo', f.registro.codigo)
    if (error) return f.setError(error.message)
    window.location.reload()
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="grid grid-cols-[96px_minmax(0,1fr)_180px_205px] gap-x-3">
        <GwField label="Código">
          <GwCampoBusqueda value={d.codigo} editable={mode === 'alta'} disabled={mode === 'edicion'} title="CODIGO" maxLength={10} onChange={(v) => patch({ codigo: v.toUpperCase() })} {...f.busqueda('codigo')} />
        </GwField>
        <GwField
          label={
            deBaja ? (
              <span className="font-bold text-[#c42b1c]">Nombre — DE BAJA{d.fecha_baja ? ` desde ${d.fecha_baja.split('-').reverse().join('/')}` : ''}</span>
            ) : (
              'Nombre'
            )
          }
        >
          <GwCampoBusqueda className={deBaja ? '!font-bold !text-[#c42b1c]' : undefined} value={d.nombre} editable={editing} title="NOMBRE" onChange={(v) => patch({ nombre: v })} {...f.busqueda('nombre')} />
        </GwField>
        <GwField label="Alias">{txt('nombre_corto', 'ALIAS')}</GwField>
        <GwField label="Dni/Nif">{txt('dni', 'DNI')}</GwField>
      </div>
      {(f.error || (!f.registro.activo && !f.sinRegistros && mode !== 'alta')) && (
        <div className="text-[13px] text-[#c42b1c]">{f.error ?? 'Empleado dado de baja.'}</div>
      )}

      <GwTabs rows={TABS} active={tab} onChange={setTab}>
        {f.sinRegistros ? (
          <PestanaPendiente texto="No hay ningún empleado. Pulsa Nuevo para dar de alta el primero." alto={ALTO} />
        ) : (
          <div style={{ height: ALTO }} className="overflow-hidden">
            {tab === 'generales' && (
              <div className="flex flex-col gap-2 px-1 pt-3">
                <GwGroup className="flex flex-col gap-1.5">
                  <BloqueDireccion r={d} ro={ro} onChange={patch} />
                  <div className="grid grid-cols-[minmax(0,665fr)_minmax(0,660fr)] gap-x-2">
                    <GwField label="Dirección E-mail (Correo Electrónico)">{txt('email', 'DIREMAIL')}</GwField>
                    <GwField label="Dirección Web (URL)">{txt('web', 'DIRWEB')}</GwField>
                  </div>
                </GwGroup>
                <div className="flex items-center gap-5 px-1 text-[17px]">
                  <GwInline label={<span className="text-[17px]">Fecha de Alta:</span>}>
                    <GwDate className="!w-[200px]" value={d.fecha_alta} disabled={ro} title="F_ALTA" onChange={(v) => patch({ fecha_alta: v })} />
                  </GwInline>
                  <GwInline label={<span className="ml-4 text-[17px]">Fecha de Baja:</span>}>
                    <GwDate className="!w-[200px]" value={d.fecha_baja} disabled={ro} title="F_BAJA" onChange={(v) => patch({ fecha_baja: v })} />
                  </GwInline>
                </div>
              </div>
            )}
            {tab === 'seguridad' && (
              <Seguridad
                key={`${f.registro.codigo}-${recarga}`}
                d={d}
                alta={mode === 'alta'}
                editando={editing}
                admin={admin === true}
                onChange={patch}
                onCreado={() => window.location.reload()}
                onClave={() => setRecarga((n) => n + 1)}
              />
            )}
            {tab === 'enlaces' && <Enlaces d={d} ro={ro} onChange={patch} />}
            {tab === 'operativa' && (
              <GwOperativa
                bloques={[
                  {
                    titulo: 'Empleados de baja',
                    notas: [
                      'Un empleado con Fecha de Baja sale en rojo, con «DE BAJA» junto al nombre.',
                      'Siempre van al final: al recorrer con las flechas, en Ctrl+Intro y en el buscador.',
                      'Dar de baja: botón Eliminar (no se borra, queda la fecha de baja).',
                    ],
                  },
                  {
                    titulo: 'Ventanas (en todo el programa)',
                    notas: [
                      '— Minimizar: la ventana queda solo con su título. Vuelve a pulsarlo para recuperarla.',
                      '▢ Maximizar / restaurar (o doble clic en el título).',
                      'Moverla: arrastra la barra de título.',
                      'Agrandar o achicar: arrastra la esquina de abajo a la derecha.',
                    ],
                  },
                ]}
              />
            )}
            {tab === 'bancos' && <PestanaPendiente texto="Bancos del empleado: pendiente. Las cuentas bancarias no se cargan ni se muestran en el ERP." alto={ALTO} />}
            {tab === 'obs' && (
              <ObservacionesImagen nombre="empleado" observaciones={d.observaciones} imagenUrl={d.imagen_url} imagenModo={d.imagen_modo ?? 1} ro={ro} alto={ALTO - 12} onChange={(p) => patch(p)} />
            )}
          </div>
        )}
      </GwTabs>

      <GwRecordBar
        mode={mode}
        canNavigate={f.canNavigate}
        saving={f.saving}
        onFirst={() => f.irA('primero')}
        onPrev={() => f.irA('anterior')}
        onNext={() => f.irA('siguiente')}
        onLast={() => f.irA('ultimo')}
        onSort={() => f.setOrden((o) => (o === 'codigo' ? 'nombre' : 'codigo'))}
        onSearch={() => setBuscar(true)}
        onPrint={() => window.print()}
        onNew={() => f.navigate('/empleados/nuevo')}
        onEdit={() => !f.sinRegistros && f.setMode('edicion')}
        onDelete={baja}
        onSave={() =>
          f.guardar(() => {
            if (!d.codigo.trim() || !d.nombre.trim()) return 'El código y el nombre son obligatorios.'
            if (d.rol_id !== f.registro.rol_id && admin !== true) return 'Solo un administrador puede cambiar el grupo del empleado.'
            return null
          })
        }
        onCancel={f.cancelar}
        onExit={() => f.navigate('/')}
      />
      <PieEstado orden={f.orden} idx={f.idx} total={f.total} mode={mode} que="empleado" porNombre="por nombre" />

      {buscar && (
        <GwLookupDialog<{ codigo: string; nombre: string; nombre_corto: string | null }>
          title="Buscar Empleado"
          table="empleado"
          columns={[
            { key: 'codigo', label: 'Código', width: 90 },
            { key: 'nombre', label: 'Nombre' },
            { key: 'nombre_corto', label: 'Alias', width: 140 },
          ]}
          searchColumns={['codigo', 'nombre', 'nombre_corto']}
          orderBy={f.orden === 'codigo' ? 'codigo' : 'nombre'}
          ordenPrevio="baja_orden"
          filaRoja={(r) => (r as unknown as { baja_orden?: number }).baja_orden === 1}
          keyColumn="codigo"
          onPick={(r) => {
            setBuscar(false)
            f.goTo(r.codigo)
          }}
          onClose={() => setBuscar(false)}
        />
      )}
      {f.dialogoLista}
    </div>
  )
}

/** Mensaje de error de la Edge Function (viene en el cuerpo JSON aunque el estado sea 403/409…). */
async function errorFuncion(error: unknown): Promise<string> {
  const ctx = (error as { context?: Response })?.context
  if (ctx && typeof ctx.json === 'function') {
    try {
      const j = (await ctx.json()) as { error?: string }
      if (j?.error) return j.error
    } catch {
      /* sin cuerpo */
    }
  }
  return (error as Error)?.message ?? 'Error desconocido'
}

/**
 * Pestaña «Seguridad»: en GeminisWin, grupo al que pertenece y clave. En el ERP la clave es la
 * del usuario de acceso (usuario@ofipapel.local) y la pone la Edge Function empleados-acceso,
 * que solo atiende a un administrador. La clave nunca se guarda en la ficha ni se puede ver.
 */
function Seguridad({
  d,
  alta,
  editando,
  admin,
  onChange,
  onCreado,
  onClave,
}: {
  d: Empleado
  alta: boolean
  editando: boolean
  admin: boolean
  onChange: Patch
  onCreado: () => void
  onClave: () => void
}) {
  const [acceso, setAcceso] = useState<{ usuario: string; ultimo_acceso: string | null } | null>(null)
  const [usuario, setUsuario] = useState(d.codigo.toLowerCase())
  const [clave, setClave] = useState('')
  const [ver, setVer] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null)
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    if (!d.auth_user_id) return setAcceso(null)
    supabase.rpc('fn_empleado_usuarios_acceso').then(({ data }) => {
      const fila = ((data ?? []) as { empleado_codigo: string; usuario: string; ultimo_acceso: string | null }[]).find((x) => x.empleado_codigo === d.codigo)
      setAcceso(fila ? { usuario: fila.usuario, ultimo_acceso: fila.ultimo_acceso } : null)
    })
  }, [d.auth_user_id, d.codigo])

  const puede = admin && !alta
  const superAdmin = useEsSuperAdministrador()
  const tieneUsuario = Boolean(d.auth_user_id)

  async function enviar() {
    setMsg(null)
    if (clave.length < 8) return setMsg({ ok: false, texto: 'La contraseña tiene que tener al menos 8 caracteres.' })
    if (tieneUsuario && !confirm(`¿Poner una contraseña nueva al usuario «${acceso?.usuario ?? d.codigo}»? La anterior deja de valer.`)) return
    setEnviando(true)
    const body = tieneUsuario
      ? { accion: 'cambiar_clave', empleado: d.codigo, clave }
      : { accion: 'crear_usuario', empleado: d.codigo, usuario: usuario.trim().toLowerCase(), clave }
    const { data, error } = await supabase.functions.invoke('empleados-acceso', { body })
    setEnviando(false)
    setClave('')
    setVer(false)
    if (error) return setMsg({ ok: false, texto: await errorFuncion(error) })
    if (!(data as { ok?: boolean })?.ok) return setMsg({ ok: false, texto: (data as { error?: string })?.error ?? 'No se ha podido.' })
    if (tieneUsuario) {
      setMsg({ ok: true, texto: 'Contraseña cambiada. Dísela al empleado: en el ERP nadie puede volver a verla.' })
      onClave()
    } else {
      alert(`Usuario «${(data as { usuario?: string }).usuario}» creado. El empleado ya puede entrar con ese usuario y la contraseña puesta.`)
      onCreado()
    }
  }

  const fecha = (v: string | null) => (v ? new Date(v).toLocaleString('es-ES') : 'nunca')

  return (
    <div className="flex flex-col gap-4 px-3 pt-5 text-[17px]">
      <GwGroup title={<span className="text-[17px]">Grupo al que Pertenece:</span>} className="w-[705px]">
        <CampoEnlace
          tabla="rol"
          campoNombre="nombre"
          titulo="Grupos de acceso"
          claveNumerica
          desplegable
          anchoCodigo={88}
          title="GRUPO"
          value={d.rol_id == null ? null : String(d.rol_id)}
          disabled={!editando || !admin}
          onChange={(v) => onChange({ rol_id: v == null ? null : Number(v) })}
        />
        <GwCheck
          className="mt-2"
          label={<span className="text-[16px]">Super administrador (consulta periodos cerrados y gestiona Archivo → Periodos)</span>}
          checked={d.super_administrador}
          disabled={!editando || superAdmin !== true}
          onChange={(v) => onChange({ super_administrador: v })}
        />
      </GwGroup>

      <GwGroup title={<span className="text-[17px]">Clave de acceso</span>} className="grid grid-cols-[290px_545px_minmax(0,1fr)] gap-x-3 gap-y-1">
        <GwField label={<span className="text-[17px]">{tieneUsuario ? 'Usuario de acceso' : 'Usuario a crear'}</span>}>
          <GwInput
            value={tieneUsuario ? (acceso?.usuario ?? '…') : usuario}
            disabled={tieneUsuario || !puede}
            title="Nombre de usuario con el que entra en el ERP"
            onChange={(e) => setUsuario(e.target.value.toLowerCase())}
          />
        </GwField>
        <GwField label={<span className="text-[17px]">Sugerencia de Contraseña</span>}>
          <GwInput value={d.sugerencia_clave ?? ''} disabled={!editando} title="SUGERENCIA — pista para recordarla, nunca la contraseña" onChange={(e) => onChange({ sugerencia_clave: e.target.value || null })} />
        </GwField>
        <div className="row-span-3 text-[15px] leading-[19px]">
          En el ERP la contraseña no se guarda en la ficha: la guarda cifrada el sistema de acceso y nadie puede verla.
          {tieneUsuario ? ` Último acceso: ${fecha(acceso?.ultimo_acceso ?? null)}.` : ' Este empleado aún no tiene usuario de acceso.'}
          {!admin && <span className="mt-1 block text-[#8a5a00]">Solo un administrador puede crear el usuario o ponerle contraseña.</span>}
        </div>
        <GwField label={<span className="text-[17px]">{tieneUsuario ? 'Contraseña nueva' : 'Contraseña'}</span>}>
          <span className="flex">
            <GwInput
              type={ver ? 'text' : 'password'}
              autoComplete="new-password"
              value={clave}
              disabled={!puede || enviando}
              placeholder={tieneUsuario ? '****************' : ''}
              title="Contraseña (mínimo 8 caracteres)"
              onChange={(e) => setClave(e.target.value)}
            />
          </span>
        </GwField>
        <div className="flex items-end gap-1">
          <button type="button" className="gw-btn flex h-[44px] w-[190px] items-center justify-center gap-2 text-[15px]" disabled={!puede || !clave} onClick={() => setVer((v) => !v)}>
            {ver ? <EyeOff size={16} /> : <Eye size={16} />} Ver Contraseña
          </button>
          <button
            type="button"
            className="gw-btn flex h-[44px] flex-1 items-center justify-center gap-2 text-[15px]"
            disabled={!puede || enviando || !clave || (!tieneUsuario && !usuario.trim())}
            onClick={enviar}
            title={tieneUsuario ? 'Pone la contraseña nueva al usuario de acceso' : 'Crea el usuario de acceso del empleado con esta contraseña'}
          >
            {tieneUsuario ? <KeyRound size={16} className="text-[#c42b1c]" /> : <UserPlus size={16} className="text-[#127a12]" />}
            {enviando ? 'Enviando…' : tieneUsuario ? 'Poner contraseña' : 'Crear usuario de acceso'}
          </button>
        </div>
        <div className="col-span-2">
          <button
            type="button"
            className="gw-btn h-[30px] px-3 text-[14px]"
            disabled
            title="Pendiente: en el ERP siempre se pide la contraseña al entrar"
          >
            Aunque no haya contraseña, Preguntar siempre por ella
          </button>
        </div>
      </GwGroup>
      {msg && <div className={`text-[14px] ${msg.ok ? 'text-[#1d5a1d]' : 'text-[#c42b1c]'}`}>{msg.texto}</div>}
    </div>
  )
}

function Enlaces({ d, ro, onChange }: { d: Empleado; ro: boolean; onChange: Patch }) {
  return (
    <div className="flex flex-col gap-6 px-1.5 pt-6">
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
        <GwGroup title={<span className="text-[17px]">Vendedor predeterminado asignado a este empleado</span>}>
          <CampoEnlace tabla="vendedor" campoNombre="nombre" titulo="Vendedores" anchoCodigo={120} title="VENDEDOR" value={d.vendedor_codigo} disabled={ro} onChange={(v) => onChange({ vendedor_codigo: v })} />
        </GwGroup>
        <GwGroup title={<span className="text-[17px]">Técnico predeterminado asignado a este empleado</span>}>
          <CampoEnlace tabla="tecnico" campoNombre="nombre" titulo="Técnicos" anchoCodigo={120} title="TECNICO" value={d.tecnico_codigo} disabled={ro} onChange={(v) => onChange({ tecnico_codigo: v })} />
        </GwGroup>
      </div>
      <GwGroup title={<span className="text-[17px]">Cliente predeterminado asignado a este empleado.</span>} className="w-[66%]">
        <CampoEnlace tabla="cliente" campoNombre="nombre" titulo="Clientes" anchoCodigo={130} title="CLIENTE" value={d.cliente_codigo} disabled={ro} onChange={(v) => onChange({ cliente_codigo: v })} />
      </GwGroup>
    </div>
  )
}
