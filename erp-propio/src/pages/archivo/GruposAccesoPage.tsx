import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { catalogoPermisos, type OpcionPermiso } from '../../lib/permisos'
import { usePermisos } from '../../lib/PermisosContext'
import { GwCheck, GwField, GwGroup, GwInput } from '../../components/gw'
import { GwRecordBar } from '../../components/gw/GwRecordBar'
import { FilasVacias } from '../../components/gw/GwGridParts'

// Archivo → Grupos de Acceso. En GeminisWin cada empleado pertenece a un grupo (Empleados →
// Seguridad → «Grupo al que Pertenece») y el grupo decide qué opciones de menú puede usar; las
// demás salen en gris. Aquí se mantienen los grupos (tabla rol) y sus opciones (rol_permiso).
// Solo un administrador puede modificar; en la base de datos lo exigen las políticas
// restrictivas admin_* de rol, rol_permiso y permiso.

interface Grupo {
  id: number | null
  codigo: string
  nombre: string
  nivel_acceso: string | null
  es_administrador: boolean
}

const VACIO: Grupo = { id: null, codigo: '', nombre: '', nivel_acceso: null, es_administrador: false }
type Modo = 'consulta' | 'edicion' | 'alta'

/** Opciones del catálogo agrupadas por menú superior, en el orden de los menús. */
function porMenu(cat: OpcionPermiso[]) {
  const m = new Map<string, OpcionPermiso[]>()
  for (const o of cat) m.set(o.modulo, [...(m.get(o.modulo) ?? []), o])
  return [...m.entries()]
}

export function GruposAccesoPage() {
  const navigate = useNavigate()
  const permisos = usePermisos()
  const admin = permisos.admin
  const catalogo = useMemo(() => catalogoPermisos(), [])
  const menus = useMemo(() => porMenu(catalogo), [catalogo])
  const codigosCatalogo = useMemo(() => new Set(catalogo.map((o) => o.codigo)), [catalogo])

  const [grupos, setGrupos] = useState<Grupo[]>([])
  const [empleados, setEmpleados] = useState<Map<number, number>>(new Map())
  const [asignados, setAsignados] = useState<Map<number, Set<string>>>(new Map())
  const [sel, setSel] = useState<number | null>(null)
  const [modo, setModo] = useState<Modo>('consulta')
  const [draft, setDraft] = useState<Grupo>(VACIO)
  const [marcados, setMarcados] = useState<Set<string>>(new Set())
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  const cargar = useCallback(async (seleccionar?: number) => {
    const [g, rp, e] = await Promise.all([
      supabase.from('rol').select('id, codigo, nombre, nivel_acceso, es_administrador').order('codigo'),
      supabase.from('rol_permiso').select('rol_id, permiso_codigo'),
      supabase.from('empleado').select('rol_id').eq('activo', true).not('rol_id', 'is', null),
    ])
    if (g.error || rp.error) {
      setError((g.error ?? rp.error)!.message)
      setCargando(false)
      return
    }
    const lista = (g.data ?? []) as Grupo[]
    const mapa = new Map<number, Set<string>>()
    for (const r of (rp.data ?? []) as { rol_id: number; permiso_codigo: string }[]) {
      if (!mapa.has(r.rol_id)) mapa.set(r.rol_id, new Set())
      mapa.get(r.rol_id)!.add(r.permiso_codigo)
    }
    const cuenta = new Map<number, number>()
    for (const r of (e.data ?? []) as { rol_id: number }[]) cuenta.set(r.rol_id, (cuenta.get(r.rol_id) ?? 0) + 1)
    setGrupos(lista)
    setAsignados(mapa)
    setEmpleados(cuenta)
    setSel((s) => seleccionar ?? (s != null && lista.some((x) => x.id === s) ? s : (lista[0]?.id ?? null)))
    setCargando(false)
  }, [])

  // Al abrirla un administrador, da de alta en `permiso` las opciones de menú nuevas que aún no
  // están (p. ej. una pantalla construida después de la última migración).
  useEffect(() => {
    if (!admin) return
    supabase
      .from('permiso')
      .select('codigo')
      .then(({ data }) => {
        const hay = new Set(((data ?? []) as { codigo: string }[]).map((x) => x.codigo))
        const faltan = catalogo
          .map((o, i) => ({ o, i }))
          .filter(({ o }) => !hay.has(o.codigo))
          .map(({ o, i }) => ({ codigo: o.codigo, descripcion: o.descripcion, modulo: o.modulo, tipo: 'menu', orden: i + 1 }))
        if (faltan.length) supabase.from('permiso').upsert(faltan, { onConflict: 'codigo', ignoreDuplicates: true }).then(() => undefined)
      })
  }, [admin, catalogo])

  useEffect(() => {
    void cargar()
  }, [cargar])

  const actual = grupos.find((g) => g.id === sel) ?? null
  const editando = modo !== 'consulta'
  const g = editando ? draft : (actual ?? VACIO)
  const marcas = editando ? marcados : actual?.id != null ? (asignados.get(actual.id) ?? new Set<string>()) : new Set<string>()
  const idx = grupos.findIndex((x) => x.id === sel)
  const totalMarcadas = catalogo.filter((o) => marcas.has(o.codigo)).length

  function soloAdmin() {
    if (admin) return true
    alert('Solo un administrador puede modificar los grupos de acceso.')
    return false
  }

  function nuevo() {
    if (!soloAdmin()) return
    setDraft(VACIO)
    setMarcados(new Set())
    setModo('alta')
    setError(null)
    setAviso(null)
  }
  function modificar() {
    if (!actual || !soloAdmin()) return
    setDraft({ ...actual })
    setMarcados(new Set(asignados.get(actual.id!) ?? []))
    setModo('edicion')
    setError(null)
    setAviso(null)
  }
  function cancelar() {
    setModo('consulta')
    setError(null)
  }

  async function guardar() {
    const codigo = draft.codigo.trim().toUpperCase()
    const nombre = draft.nombre.trim()
    if (!codigo || !nombre) return setError('El código y el nombre del grupo son obligatorios.')
    if (grupos.some((x) => x.codigo === codigo && x.id !== draft.id)) return setError(`Ya existe un grupo con el código ${codigo}.`)
    setGuardando(true)
    setError(null)
    const fila = { codigo, nombre, nivel_acceso: draft.nivel_acceso?.trim() || null, es_administrador: draft.es_administrador }
    let id = draft.id
    if (modo === 'alta') {
      const { data, error } = await supabase.from('rol').insert(fila).select('id').single()
      if (error) return fallo(error.message)
      id = (data as { id: number }).id
    } else {
      const { error } = await supabase.from('rol').update(fila).eq('id', id!)
      if (error) return fallo(error.message)
    }
    // Solo se tocan las opciones de menú; los permisos genéricos del grupo se dejan como están.
    const antes = new Set([...(asignados.get(id!) ?? [])].filter((c) => codigosCatalogo.has(c)))
    const poner = [...marcados].filter((c) => codigosCatalogo.has(c) && !antes.has(c))
    const quitar = [...antes].filter((c) => !marcados.has(c))
    if (poner.length) {
      const { error } = await supabase.from('rol_permiso').upsert(
        poner.map((c) => ({ rol_id: id!, permiso_codigo: c })),
        { onConflict: 'rol_id,permiso_codigo', ignoreDuplicates: true },
      )
      if (error) return fallo(error.message)
    }
    if (quitar.length) {
      const { error } = await supabase.from('rol_permiso').delete().eq('rol_id', id!).in('permiso_codigo', quitar)
      if (error) return fallo(error.message)
    }
    setGuardando(false)
    setModo('consulta')
    setAviso(`Grupo ${codigo} guardado. Los empleados del grupo ven los cambios al volver a entrar o al recargar la página.`)
    await cargar(id!)
    permisos.recargar()
  }
  function fallo(msg: string) {
    setGuardando(false)
    setError(msg.includes('row-level security') ? 'Solo un administrador puede modificar los grupos de acceso.' : msg)
  }

  function marcar(codigos: string[], v: boolean) {
    setMarcados((m) => {
      const n = new Set(m)
      for (const c of codigos) {
        if (v) n.add(c)
        else n.delete(c)
      }
      return n
    })
  }

  const irA = (i: number) => {
    const x = grupos[Math.max(0, Math.min(grupos.length - 1, i))]
    if (x) setSel(x.id)
  }

  if (cargando) return <div className="p-4 text-[13px]">Cargando…</div>

  return (
    <div className="flex h-full min-h-0 flex-col gap-1 text-[13px]">
      <div className="grid min-h-0 flex-1 grid-cols-[300px_minmax(0,1fr)] gap-2">
        {/* Lista de grupos */}
        <GwGroup title="Grupos de acceso" className="flex min-h-0 flex-col">
          <div className="min-h-0 flex-1 overflow-auto border border-[var(--gw-border)] bg-white">
            <table className="gw-grid w-full table-fixed">
              <thead>
                <tr>
                  <th className="w-[108px] text-left">Código</th>
                  <th className="text-left">Nombre</th>
                  <th className="w-[46px]" title="Empleados activos del grupo">Empl.</th>
                </tr>
              </thead>
              <tbody>
                {grupos.map((x) => (
                  <tr
                    key={x.id}
                    className={`${x.id === sel ? 'gw-selected' : ''} ${editando ? '' : 'cursor-pointer'}`}
                    onClick={() => !editando && setSel(x.id)}
                    title={x.es_administrador ? 'Grupo administrador: lo puede todo' : undefined}
                  >
                    <td className="truncate">{x.codigo}</td>
                    <td className="truncate">
                      {x.nombre}
                      {x.es_administrador && <b className="ml-1 text-[#1d3a8a]">(Adm.)</b>}
                    </td>
                    <td className="text-right tabular-nums">{empleados.get(x.id!) ?? 0}</td>
                  </tr>
                ))}
                <FilasVacias cols={3} ocupadas={grupos.length} total={14} />
              </tbody>
            </table>
          </div>
          <p className="mt-1 text-[11px] leading-[14px] text-[#444]">
            El grupo de cada empleado se elige en Archivo → Empleados → Seguridad.
          </p>
        </GwGroup>

        {/* Ficha del grupo y sus opciones */}
        <div className="flex min-h-0 flex-col gap-1">
          <div className="grid grid-cols-[120px_minmax(0,1fr)_200px_auto] items-end gap-x-3">
            <GwField label="Código">
              <GwInput
                value={g.codigo}
                disabled={!editando}
                maxLength={20}
                title="CODIGO"
                onChange={(e) => setDraft((d) => ({ ...d, codigo: e.target.value.toUpperCase() }))}
              />
            </GwField>
            <GwField label="Nombre">
              <GwInput value={g.nombre} disabled={!editando} title="NOMBRE" onChange={(e) => setDraft((d) => ({ ...d, nombre: e.target.value }))} />
            </GwField>
            <GwField label="Nivel de acceso">
              <GwInput
                value={g.nivel_acceso ?? ''}
                disabled={!editando}
                title="Texto libre (total, operativo…): solo informativo"
                onChange={(e) => setDraft((d) => ({ ...d, nivel_acceso: e.target.value || null }))}
              />
            </GwField>
            <GwCheck
              className="mb-[3px]"
              label="Administrador (lo puede todo)"
              checked={g.es_administrador}
              disabled={!editando}
              onChange={(v) => setDraft((d) => ({ ...d, es_administrador: v }))}
            />
          </div>

          <GwGroup
            title={`Opciones de menú permitidas · ${totalMarcadas} de ${catalogo.length}`}
            className="flex min-h-0 flex-1 flex-col"
          >
            <div className="mb-1 flex items-center gap-2">
              <button type="button" className="gw-btn whitespace-nowrap px-2" disabled={!editando} onClick={() => marcar([...codigosCatalogo], true)}>
                Marcar todo
              </button>
              <button type="button" className="gw-btn whitespace-nowrap px-2" disabled={!editando} onClick={() => marcar([...codigosCatalogo], false)}>
                Desmarcar todo
              </button>
              <span className="truncate text-[12px] text-[#444]">
                {g.es_administrador
                  ? 'Grupo administrador: puede usar todas las opciones aunque no estén marcadas.'
                  : 'Lo no marcado sale en gris en los menús, la barra lateral, el Panel y NEXA. Panel de Control y Cambiar Contraseña los tiene todo el mundo.'}
              </span>
            </div>
            <div className="min-h-0 flex-1 overflow-auto border border-[var(--gw-border)] bg-white px-2 py-1">
              <div className="gap-x-4 [column-width:230px]">
                {menus.map(([menu, opciones]) => (
                  <BloqueMenu key={menu} menu={menu} opciones={opciones} marcas={marcas} editando={editando} onMarcar={marcar} />
                ))}
              </div>
            </div>
          </GwGroup>
          {(error || aviso) && (
            <div className={`border px-2 py-1 text-[12px] ${error ? 'border-[#d03b3b] bg-[#fdecec] text-[#8a1f1f]' : 'border-[#2a9d2a] bg-[#e7f6e7]'}`}>
              {error ?? aviso}
            </div>
          )}
        </div>
      </div>

      <GwRecordBar
        mode={modo}
        canNavigate={!editando && grupos.length > 0}
        saving={guardando}
        onFirst={() => irA(0)}
        onPrev={() => irA(idx - 1)}
        onNext={() => irA(idx + 1)}
        onLast={() => irA(grupos.length - 1)}
        onPrint={() => window.print()}
        onNew={nuevo}
        onEdit={modificar}
        onDelete={() =>
          alert('Los grupos de acceso no se borran: quítale las opciones o pasa sus empleados a otro grupo (Empleados → Seguridad).')
        }
        onSave={() => void guardar()}
        onCancel={cancelar}
        onExit={() => navigate('/')}
      />
      <div className="text-[11px] text-[#444]">
        {idx >= 0 && !editando ? `Grupo ${idx + 1} de ${grupos.length}` : ''}
        {modo === 'alta' ? 'Alta de grupo' : modo === 'edicion' ? 'Modificando' : ''}
        {!admin && ' · Solo un administrador puede modificar los grupos de acceso.'}
      </div>
    </div>
  )
}

function BloqueMenu({
  menu,
  opciones,
  marcas,
  editando,
  onMarcar,
}: {
  menu: string
  opciones: OpcionPermiso[]
  marcas: ReadonlySet<string>
  editando: boolean
  onMarcar: (codigos: string[], v: boolean) => void
}) {
  const n = opciones.filter((o) => marcas.has(o.codigo)).length
  const todos = opciones.map((o) => o.codigo)
  return (
    <div className="mb-2 break-inside-avoid">
      <CasillaTri
        label={<b>{menu}</b>}
        estado={n === 0 ? 'no' : n === opciones.length ? 'si' : 'parcial'}
        disabled={!editando}
        title={`Marcar o desmarcar todo el menú ${menu}`}
        onChange={(v) => onMarcar(todos, v)}
      />
      <div className="ml-[7px] border-l border-dotted border-[#9a9a9a] pl-2">
        {opciones.map((o, i) => (
          <div key={o.codigo}>
            {/* Submenú (Listados › List. Ventas): rótulo antes de su primera opción. */}
            {o.grupo && o.grupo !== opciones[i - 1]?.grupo && (
              <div className="truncate pl-[2px] text-[12px] italic leading-[18px] text-[#555]" style={{ paddingLeft: (o.nivel - 1) * 12 }}>
                {o.grupo.split(' › ').slice(-1)[0]} ▸
              </div>
            )}
            <div style={{ paddingLeft: o.nivel * 12 }} title={`${o.descripcion} (${o.codigo})`}>
              <GwCheck
                className="leading-[18px]"
                label={<span className="truncate">{o.etiqueta}</span>}
                checked={marcas.has(o.codigo)}
                disabled={!editando}
                onChange={(v) => onMarcar([o.codigo], v)}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Casilla de tres estados (marcado, desmarcado, a medias) para el menú entero. */
function CasillaTri({
  label,
  estado,
  disabled,
  title,
  onChange,
}: {
  label: ReactNode
  estado: 'si' | 'no' | 'parcial'
  disabled: boolean
  title: string
  onChange: (v: boolean) => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = estado === 'parcial'
  }, [estado])
  return (
    <label className="flex select-none items-center gap-1 whitespace-nowrap text-[13px] leading-[20px]" title={title}>
      <input
        ref={ref}
        type="checkbox"
        className="m-0 h-[13px] w-[13px] accent-[#0078d7]"
        checked={estado === 'si'}
        disabled={disabled}
        onChange={() => onChange(estado !== 'si')}
      />
      {label}
    </label>
  )
}
