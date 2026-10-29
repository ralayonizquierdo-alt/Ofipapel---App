// Parámetros → Control de Accesos: lo que puede y no puede hacer cada empleado, por encima de su
// grupo de acceso (rol):
//  · Límites (tabla empleado_acceso): tiendas y almacenes donde puede trabajar, descuento máximo,
//    cambiar precios, vender sin caja, anular, ver costes y horario. La tienda y el descuento los
//    impone también la base de datos (fn_limite_tienda_empleado, fn_limite_descuento_empleado).
//  · Permisos (tabla empleado_permiso): cada opción de menú «como su grupo», «permitir» o
//    «denegar». Los aplica fn_mis_permisos (menús en gris, rutas bloqueadas) y fn_tiene_permiso.
// Un administrador no tiene límites ni se le pueden quitar opciones.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { GwGroup, GwInput, GwNumber, GwTabs } from '../../../components/gw'
import { supabase } from '../../../lib/supabase'
import { catalogoPermisos } from '../../../lib/permisos'
import type { Empleado, Guardable, Opcion } from './ParametrosAvatarPage'

export interface Acceso {
  empleado_codigo: string
  tiendas: string[] | null
  almacenes: string[] | null
  solo_datos_tienda: boolean
  dto_maximo_pct: number | null
  puede_modificar_precio: boolean
  puede_vender_sin_caja: boolean
  puede_anular: boolean
  puede_ver_costes: boolean
  horario: { dias: number[]; desde: string; hasta: string } | null
  observaciones: string | null
}

const sinLimites = (codigo: string): Acceso => ({
  empleado_codigo: codigo,
  tiendas: null,
  almacenes: null,
  solo_datos_tienda: false,
  dto_maximo_pct: null,
  puede_modificar_precio: true,
  puede_vender_sin_caja: true,
  puede_anular: true,
  puede_ver_costes: true,
  horario: null,
  observaciones: null,
})

const DIAS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
const igual = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

export function AreaAccesos({
  empleado,
  admin,
  tiendas,
  almacenes,
  registrar,
}: {
  empleado: Empleado | null
  admin: boolean
  tiendas: Opcion[]
  almacenes: Opcion[]
  registrar: (g: Guardable) => void
}) {
  const navigate = useNavigate()
  const [tab, setTab] = useState('limites')
  const [grupo, setGrupo] = useState<{ nombre: string; es_administrador: boolean; permisos: Set<string> } | null>(null)
  const [acceso, setAcceso] = useState<Acceso | null>(null)
  const [bAcceso, setBAcceso] = useState<Acceso | null>(null)
  const [excepciones, setExcepciones] = useState<Record<string, boolean>>({})
  const [bExc, setBExc] = useState<Record<string, boolean>>({})
  const [filtro, setFiltro] = useState('')
  const catalogo = useMemo(() => catalogoPermisos(), [])
  const codigo = empleado?.codigo ?? null
  const rolId = empleado?.rol_id ?? null

  const cargar = useCallback(async () => {
    if (!codigo) return
    const [a, p, g] = await Promise.all([
      supabase.from('empleado_acceso').select('*').eq('empleado_codigo', codigo).maybeSingle(),
      supabase.from('empleado_permiso').select('permiso_codigo, permitido').eq('empleado_codigo', codigo),
      rolId != null
        ? Promise.all([
            supabase.from('rol').select('nombre, es_administrador').eq('id', rolId).maybeSingle(),
            supabase.from('rol_permiso').select('permiso_codigo').eq('rol_id', rolId),
          ])
        : Promise.resolve(null),
    ])
    const ac = a.data ? ({ ...(a.data as Acceso), dto_maximo_pct: a.data.dto_maximo_pct == null ? null : Number(a.data.dto_maximo_pct) } as Acceso) : sinLimites(codigo)
    setAcceso(ac)
    setBAcceso(ac)
    const ex = Object.fromEntries(((p.data ?? []) as { permiso_codigo: string; permitido: boolean }[]).map((r) => [r.permiso_codigo, r.permitido]))
    setExcepciones(ex)
    setBExc(ex)
    if (g) {
      const [r, rp] = g
      setGrupo({
        nombre: (r.data?.nombre as string | undefined) ?? '',
        es_administrador: r.data?.es_administrador === true,
        permisos: new Set(((rp.data ?? []) as { permiso_codigo: string }[]).map((x) => x.permiso_codigo)),
      })
    } else setGrupo(null)
  }, [codigo, rolId])

  useEffect(() => {
    cargar()
  }, [cargar])

  const pendiente = !igual(acceso, bAcceso) || !igual(excepciones, bExc)
  const guardable = useMemo<Guardable>(
    () => ({
      pendiente,
      descartar: () => {
        setBAcceso(acceso)
        setBExc(excepciones)
      },
      guardar: async () => {
        if (!codigo || !bAcceso) return null
        if (!igual(acceso, bAcceso)) {
          const { error } = await supabase.from('empleado_acceso').upsert({ ...bAcceso, empleado_codigo: codigo })
          if (error) return `Límites de ${codigo}: ${error.message}`
        }
        for (const k of new Set([...Object.keys(excepciones), ...Object.keys(bExc)])) {
          if (excepciones[k] === bExc[k]) continue
          const r =
            k in bExc
              ? await supabase.from('empleado_permiso').upsert({ empleado_codigo: codigo, permiso_codigo: k, permitido: bExc[k] })
              : await supabase.from('empleado_permiso').delete().eq('empleado_codigo', codigo).eq('permiso_codigo', k)
          if (r.error) return `Permiso ${k}: ${r.error.message}`
        }
        await cargar()
        return null
      },
    }),
    [pendiente, codigo, acceso, bAcceso, excepciones, bExc, cargar],
  )
  useEffect(() => registrar(guardable), [guardable, registrar])

  if (!empleado || !bAcceso) return <div className="p-3 text-[14px] text-[#555]">Elige un empleado en la lista de la izquierda.</div>

  const esAdmin = grupo?.es_administrador === true
  const ro = !admin
  const set = (p: Partial<Acceso>) => setBAcceso((a) => (a ? { ...a, ...p } : a))
  const lista = (sel: string[] | null, todos: Opcion[], onChange: (v: string[] | null) => void) => (
    <div className="flex flex-col gap-1">
      <label className="flex items-center gap-1.5 font-bold">
        <input type="checkbox" disabled={ro} checked={sel == null} onChange={(e) => onChange(e.target.checked ? null : [])} />
        Todas
      </label>
      {sel != null && (
        <div className="grid max-h-[180px] grid-cols-2 gap-x-3 overflow-y-auto border border-[var(--gw-border-light)] bg-white p-1">
          {todos.map((t) => (
            <label key={t.codigo} className="flex items-center gap-1.5 truncate text-[13px]">
              <input
                type="checkbox"
                disabled={ro}
                checked={sel.includes(t.codigo)}
                onChange={(e) => onChange(e.target.checked ? [...sel, t.codigo] : sel.filter((x) => x !== t.codigo))}
              />
              <span className="truncate">
                {t.codigo} · {t.nombre}
              </span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
  const casilla = (clave: keyof Acceso, texto: string) => (
    <label className="flex items-center gap-1.5">
      <input type="checkbox" disabled={ro} checked={bAcceso[clave] === true} onChange={(e) => set({ [clave]: e.target.checked } as Partial<Acceso>)} />
      {texto}
    </label>
  )

  const opcionesFiltradas = catalogo.filter((o) => !filtro || `${o.modulo} ${o.descripcion}`.toLowerCase().includes(filtro.toLowerCase()))
  const nExc = Object.keys(bExc).length

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-3 text-[15px]">
        <b className="text-[18px]">
          {empleado.codigo} · {empleado.nombre}
        </b>
        <span>
          Grupo: <b>{grupo?.nombre || '(sin grupo)'}</b>
          {esAdmin ? ' — administrador: lo puede todo' : ''}
        </span>
        {empleado.super_administrador && <span className="font-bold text-[#8a5a00]">👑 Super administrador</span>}
        <span className="flex-1" />
        <button type="button" className="gw-btn" onClick={() => navigate(`/empleados/${encodeURIComponent(empleado.codigo)}`)}>
          Ficha del empleado
        </button>
        <button type="button" className="gw-btn" onClick={() => navigate('/grupos-acceso')}>
          Grupos de acceso
        </button>
      </div>
      <GwTabs
        rows={[
          [
            { key: 'limites', label: 'Límites' },
            { key: 'permisos', label: `Permisos de menú${nExc ? ` (${nExc} excepciones)` : ''}` },
          ],
        ]}
        active={tab}
        onChange={setTab}
      >
        <div className="min-h-[380px] overflow-y-auto p-2">
          {esAdmin && <div className="mb-2 text-[13px] text-[#8a5a00]">Su grupo es administrador: estos límites y excepciones no se le aplican.</div>}
          {tab === 'limites' && (
            <div className="grid grid-cols-2 gap-2">
              <GwGroup title="Tiendas / terminales donde puede trabajar">{lista(bAcceso.tiendas, tiendas, (v) => set({ tiendas: v }))}</GwGroup>
              <GwGroup title="Almacenes que puede usar">{lista(bAcceso.almacenes, almacenes, (v) => set({ almacenes: v }))}</GwGroup>
              <GwGroup title="Ventas">
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <span>Descuento máximo por línea (%):</span>
                    <div className="w-[90px]">
                      <GwNumber value={bAcceso.dto_maximo_pct} decimals={2} disabled={ro} onChange={(v) => set({ dto_maximo_pct: v })} />
                    </div>
                    <span className="text-[12px] text-[#777]">vacío = sin límite</span>
                  </div>
                  {casilla('puede_modificar_precio', 'Puede cambiar el precio de venta en las líneas')}
                  {casilla('puede_vender_sin_caja', 'Puede vender sin caja abierta')}
                  {casilla('puede_anular', 'Puede anular y borrar documentos')}
                  {casilla('puede_ver_costes', 'Puede ver costes y márgenes')}
                  {casilla('solo_datos_tienda', 'En los formularios, mostrar sólo los datos de su tienda')}
                </div>
              </GwGroup>
              <GwGroup title="Horario de acceso">
                <div className="flex flex-col gap-1.5">
                  <label className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      disabled={ro}
                      checked={bAcceso.horario == null}
                      onChange={(e) => set({ horario: e.target.checked ? null : { dias: [1, 2, 3, 4, 5, 6], desde: '08:00', hasta: '21:00' } })}
                    />
                    Sin límite de horario
                  </label>
                  {bAcceso.horario && (
                    <>
                      <div className="flex gap-1">
                        {DIAS.map((d, i) => {
                          const n = i + 1
                          const on = bAcceso.horario!.dias.includes(n)
                          return (
                            <button
                              key={d}
                              type="button"
                              disabled={ro}
                              onClick={() => set({ horario: { ...bAcceso.horario!, dias: on ? bAcceso.horario!.dias.filter((x) => x !== n) : [...bAcceso.horario!.dias, n].sort() } })}
                              className={`h-[28px] w-[34px] border border-[var(--gw-border)] font-bold ${on ? 'bg-[#0078d7] text-white' : 'bg-white text-[#777]'}`}
                            >
                              {d}
                            </button>
                          )
                        })}
                      </div>
                      <div className="flex items-center gap-2">
                        de
                        <GwInput type="time" className="w-[100px]" disabled={ro} value={bAcceso.horario.desde} onChange={(e) => set({ horario: { ...bAcceso.horario!, desde: e.target.value } })} />
                        a
                        <GwInput type="time" className="w-[100px]" disabled={ro} value={bAcceso.horario.hasta} onChange={(e) => set({ horario: { ...bAcceso.horario!, hasta: e.target.value } })} />
                      </div>
                      <span className="text-[12px] text-[#777]">Fuera de ese horario no puede entrar en el programa.</span>
                    </>
                  )}
                </div>
              </GwGroup>
              <GwGroup title="Observaciones" className="col-span-2">
                <GwInput value={bAcceso.observaciones ?? ''} disabled={ro} onChange={(e) => set({ observaciones: e.target.value || null })} />
              </GwGroup>
            </div>
          )}
          {tab === 'permisos' && (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <GwInput placeholder="Buscar opción…" className="w-[280px]" value={filtro} onChange={(e) => setFiltro(e.target.value)} />
                <span className="text-[13px] text-[#555]">Por defecto cada opción va «como su grupo». Permitir o denegar solo afecta a este empleado.</span>
              </div>
              <div className="max-h-[420px] overflow-y-auto border border-[var(--gw-border)] bg-white">
                <table className="gw-grid">
                  <thead className="sticky top-0">
                    <tr>
                      <th className="w-[110px]">Menú</th>
                      <th>Opción</th>
                      <th className="w-[90px]">Su grupo</th>
                      <th className="w-[260px]">Este empleado</th>
                      <th className="w-[80px]">Resultado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {opcionesFiltradas.map((o) => {
                      const deGrupo = esAdmin || (grupo?.permisos.has(o.codigo) ?? false)
                      const exc = bExc[o.codigo]
                      const final = esAdmin || (exc === undefined ? deGrupo : exc)
                      const poner = (v: boolean | undefined) =>
                        setBExc((x) => {
                          const m = { ...x }
                          if (v === undefined) delete m[o.codigo]
                          else m[o.codigo] = v
                          return m
                        })
                      return (
                        <tr key={o.codigo} className={exc !== undefined ? 'bg-[#fff6d6]' : ''}>
                          <td>{o.modulo}</td>
                          <td className="truncate" title={o.codigo}>
                            {o.descripcion}
                          </td>
                          <td className={deGrupo ? 'text-[#127a12]' : 'text-[#999]'}>{deGrupo ? '✔ Sí' : '— No'}</td>
                          <td>
                            <div className="flex gap-1">
                              {(
                                [
                                  [undefined, 'Como su grupo'],
                                  [true, 'Permitir'],
                                  [false, 'Denegar'],
                                ] as const
                              ).map(([v, t]) => (
                                <button
                                  key={t}
                                  type="button"
                                  disabled={ro || esAdmin}
                                  onClick={() => poner(v)}
                                  className={`h-[22px] border border-[var(--gw-border)] px-1.5 text-[12px] ${
                                    exc === v ? (v === true ? 'bg-[#127a12] text-white' : v === false ? 'bg-[#c42b1c] text-white' : 'bg-[#0078d7] text-white') : 'bg-white'
                                  }`}
                                >
                                  {t}
                                </button>
                              ))}
                            </div>
                          </td>
                          <td className={final ? 'font-bold text-[#127a12]' : 'font-bold text-[#c42b1c]'}>{final ? 'Puede' : 'No puede'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </GwTabs>
    </div>
  )
}
