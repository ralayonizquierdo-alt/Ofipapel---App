// Archivo → Parámetros de Avatar, a partir de Utilidades → Parámetros de GeminisWin (captura del
// 29/10/2026): a la izquierda el árbol de secciones y abajo los tres apartados grandes
// (Parámetros, Configuración, Control de Accesos); a la derecha las pestañas de la sección; abajo
// Aplicar · Aceptar · Cancelar.
//
// Mejoras sobre GeminisWin:
//  · Cada parámetro marcado «por empleado» puede tener un valor distinto para cada empleado (lo
//    que en GeminisWin eran los Parámetros Locales de cada equipo): «Valores de: …».
//  · Control de Accesos por empleado: tiendas y almacenes donde puede trabajar, descuento máximo,
//    precios, horario y permisos de menú por encima de su grupo (permitir / denegar).
//  · Se ve qué valor tenía en GeminisWin y si el programa ya lo usa (punto verde) o solo se guarda
//    (punto gris).
// Solo los administradores modifican (lo impone la RLS de las tablas).

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { GwInput, GwNumber, GwSelect, GwTabs } from '../../../components/gw'
import { supabase } from '../../../lib/supabase'
import { cargarParametros } from '../../../lib/parametros'
import { COLORES_DEFECTO, SECCIONES_PARAMETROS, type DefParametro, type SeccionParametros } from '../../../lib/catalogoParametros'
import type { MapaColores } from '../../../lib/coloresPantallas'
import { ColoresVista } from './ColoresVista'
import { GwOperativa } from '../../../components/gw/GwOperativa'
import { Mensaje } from '../../utilidades/comun'
import { useEsAdministrador } from '../comun'
import { AreaAccesos } from './AreaAccesos'
import { AreaConfiguracion } from './AreaConfiguracion'
import { ContadoresVista, ImpuestosVista } from './Vistas'

type Area = 'parametros' | 'configuracion' | 'accesos'

export interface Empleado {
  codigo: string
  nombre: string
  rol_id: number | null
  activo: boolean
  super_administrador: boolean
}

export interface Opcion {
  codigo: string
  nombre: string
}

/** Lo que tienen las áreas con cambios sin guardar: guardar y descartar. */
export interface Guardable {
  pendiente: boolean
  guardar: () => Promise<string | null>
  descartar: () => void
}

const igual = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

export function ParametrosAvatarPage() {
  const navigate = useNavigate()
  const admin = useEsAdministrador() === true
  const [area, setArea] = useState<Area>('parametros')
  const [seccion, setSeccion] = useState(SECCIONES_PARAMETROS[0].clave)
  const [empleados, setEmpleados] = useState<Empleado[]>([])
  const [empSel, setEmpSel] = useState<string | null>(null)
  const [tiendas, setTiendas] = useState<Opcion[]>([])
  const [almacenes, setAlmacenes] = useState<Opcion[]>([])
  const [mensaje, setMensaje] = useState<{ texto: string; error?: boolean } | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [guardables, setGuardables] = useState<Partial<Record<Area, Guardable>>>({})

  useEffect(() => {
    Promise.all([
      supabase.from('empleado').select('codigo, nombre, rol_id, activo, super_administrador').order('codigo'),
      supabase.from('tienda_terminal').select('codigo, descripcion').order('codigo'),
      supabase.from('almacen').select('codigo, nombre').order('codigo'),
    ]).then(([e, t, a]) => {
      setEmpleados((e.data ?? []) as Empleado[])
      setTiendas(((t.data ?? []) as { codigo: string; descripcion: string | null }[]).map((x) => ({ codigo: x.codigo, nombre: (x.descripcion ?? '').trim() })))
      setAlmacenes(((a.data ?? []) as { codigo: string; nombre: string | null }[]).map((x) => ({ codigo: x.codigo, nombre: x.nombre ?? '' })))
    })
  }, [])

  const registrar = useCallback((a: Area, g: Guardable) => setGuardables((x) => (x[a] === g ? x : { ...x, [a]: g })), [])
  const registrarParametros = useCallback((g: Guardable) => registrar('parametros', g), [registrar])
  const registrarAccesos = useCallback((g: Guardable) => registrar('accesos', g), [registrar])
  const pendiente = Object.values(guardables).some((g) => g?.pendiente)

  async function aplicar(): Promise<boolean> {
    setMensaje(null)
    setGuardando(true)
    for (const g of Object.values(guardables)) {
      if (!g?.pendiente) continue
      const err = await g.guardar()
      if (err) {
        setGuardando(false)
        setMensaje({ texto: err, error: true })
        return false
      }
    }
    await cargarParametros()
    setGuardando(false)
    setMensaje({ texto: 'Cambios guardados.' })
    return true
  }

  const seccionActual = SECCIONES_PARAMETROS.find((s) => s.clave === seccion) ?? SECCIONES_PARAMETROS[0]

  return (
    <div className="flex h-full min-h-[560px] flex-col gap-1.5 text-[14px]">
      <div className="flex min-h-0 flex-1 gap-1.5">
        {/* Columna izquierda: árbol de la zona elegida y los tres apartados grandes */}
        <div className="flex w-[290px] flex-none flex-col border border-[var(--gw-border)] bg-white">
          <div className="min-h-0 flex-1 overflow-y-auto">
            {area === 'parametros' &&
              SECCIONES_PARAMETROS.map((s) => (
                <ElementoArbol key={s.clave} activo={s.clave === seccion} icono={s.icono} onClick={() => setSeccion(s.clave)}>
                  {s.titulo}
                </ElementoArbol>
              ))}
            {area === 'accesos' &&
              empleados.map((e) => (
                <ElementoArbol key={e.codigo} activo={e.codigo === empSel} icono={e.super_administrador ? '👑' : '👤'} onClick={() => setEmpSel(e.codigo)}>
                  <span className={e.activo ? '' : 'text-[#999] line-through'}>
                    {e.codigo} · {e.nombre}
                  </span>
                </ElementoArbol>
              ))}
            {area === 'configuracion' && <div className="p-3 text-[13px] text-[#555]">Configuración de la empresa, tiendas y programa.</div>}
          </div>
          <BotonArea activo={area === 'parametros'} icono="🛠️" onClick={() => setArea('parametros')}>
            Parámetros
          </BotonArea>
          <BotonArea activo={area === 'configuracion'} icono="🔧" onClick={() => setArea('configuracion')}>
            Configuración
          </BotonArea>
          <BotonArea
            activo={area === 'accesos'}
            icono="🔐"
            onClick={() => {
              setArea('accesos')
              setEmpSel((s) => s ?? empleados[0]?.codigo ?? null)
            }}
          >
            Control de Accesos
          </BotonArea>
        </div>

        {/* Zona derecha */}
        <div className="flex min-w-0 flex-1 flex-col border border-[var(--gw-border)] bg-[var(--gw-face)] p-1.5">
          {/* Las tres zonas quedan montadas: lo cambiado en una no se pierde al pasar a otra. */}
          <div className={area === 'parametros' ? 'flex min-h-0 flex-1 flex-col' : 'hidden'}>
            <AreaParametros
              seccion={seccionActual}
              admin={admin}
              empleados={empleados}
              tiendas={tiendas}
              almacenes={almacenes}
              registrar={registrarParametros}
            />
          </div>
          {area === 'configuracion' && <AreaConfiguracion />}
          <div className={area === 'accesos' ? 'flex min-h-0 flex-1 flex-col' : 'hidden'}>
            <AreaAccesos
              empleado={empleados.find((e) => e.codigo === empSel) ?? null}
              admin={admin}
              tiendas={tiendas}
              almacenes={almacenes}
              registrar={registrarAccesos}
            />
          </div>
        </div>
      </div>

      {mensaje && <Mensaje {...mensaje} />}
      <div className="flex flex-none items-center justify-end gap-1.5 border-t border-[var(--gw-border-light)] pt-1.5">
        {!admin && <span className="mr-auto text-[13px] text-[#8a5a00]">Solo los administradores pueden cambiar los parámetros.</span>}
        <button type="button" className="gw-btn h-[34px] w-[120px] gap-1.5 text-[15px]" disabled={!pendiente || guardando || !admin} onClick={aplicar}>
          <span className="text-[#127a12]">✔</span> Aplicar
        </button>
        <button
          type="button"
          className="gw-btn h-[34px] w-[120px] gap-1.5 text-[15px]"
          disabled={guardando}
          onClick={async () => {
            if (!pendiente || (await aplicar())) navigate('/')
          }}
        >
          <span className="text-[#127a12]">✔</span> Aceptar
        </button>
        <button
          type="button"
          className="gw-btn h-[34px] w-[120px] gap-1.5 text-[15px]"
          onClick={() => {
            if (pendiente && !confirm('Hay cambios sin guardar. ¿Salir sin guardarlos?')) return
            Object.values(guardables).forEach((g) => g?.descartar())
            navigate('/')
          }}
        >
          <span className="text-[#c42b1c]">✖</span> Cancelar
        </button>
      </div>
    </div>
  )
}

function ElementoArbol({ activo, icono, onClick, children }: { activo: boolean; icono: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2 px-2 py-[5px] text-left text-[17px] ${activo ? 'bg-[#0078d7] text-white' : 'hover:bg-[#e5f1fb]'}`}
    >
      <span className="w-[24px] text-center text-[18px]">{icono}</span>
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </button>
  )
}

function BotonArea({ activo, icono, onClick, children }: { activo: boolean; icono: string; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`gw-boton-barra h-[52px] w-full flex-none justify-start gap-3 px-3 text-[20px] ${activo ? 'text-[#0033cc]' : 'text-[#555]'}`}
    >
      <span className="text-[26px]">{icono}</span>
      {children}
    </button>
  )
}

/* ----------------------------------------------------------------------------- Parámetros */

function AreaParametros({
  seccion,
  admin,
  empleados,
  tiendas,
  almacenes,
  registrar,
}: {
  seccion: SeccionParametros
  admin: boolean
  empleados: Empleado[]
  tiendas: Opcion[]
  almacenes: Opcion[]
  registrar: (g: Guardable) => void
}) {
  const [tab, setTab] = useState(seccion.pestanas[0].clave)
  const [quien, setQuien] = useState<string>('') // '' = toda la empresa
  const [generales, setGenerales] = useState<Record<string, unknown>>({})
  const [porEmpleado, setPorEmpleado] = useState<Record<string, Record<string, unknown>>>({})
  const [bGen, setBGen] = useState<Record<string, unknown>>({})
  const [bEmp, setBEmp] = useState<Record<string, Record<string, unknown>>>({})

  useEffect(() => setTab(seccion.pestanas[0].clave), [seccion])

  const cargar = useCallback(async () => {
    const [g, e] = await Promise.all([supabase.from('parametro').select('clave, valor'), supabase.from('parametro_empleado').select('empleado_codigo, clave, valor')])
    const mg = Object.fromEntries(((g.data ?? []) as { clave: string; valor: unknown }[]).map((r) => [r.clave, r.valor]))
    const me: Record<string, Record<string, unknown>> = {}
    for (const r of (e.data ?? []) as { empleado_codigo: string; clave: string; valor: unknown }[]) (me[r.empleado_codigo] ??= {})[r.clave] = r.valor
    setGenerales(mg)
    setPorEmpleado(me)
    setBGen(mg)
    setBEmp(me)
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  const pendiente = !igual(generales, bGen) || !igual(porEmpleado, bEmp)

  const guardable = useMemo<Guardable>(
    () => ({
      pendiente,
      descartar: () => {
        setBGen(generales)
        setBEmp(porEmpleado)
      },
      guardar: async () => {
        // Generales: los cambiados se guardan; los que vuelven a «por defecto» se borran.
        for (const clave of new Set([...Object.keys(generales), ...Object.keys(bGen)])) {
          if (igual(generales[clave], bGen[clave])) continue
          const r = clave in bGen ? await supabase.from('parametro').upsert({ clave, valor: bGen[clave] }) : await supabase.from('parametro').delete().eq('clave', clave)
          if (r.error) return `${clave}: ${r.error.message}`
        }
        for (const emp of new Set([...Object.keys(porEmpleado), ...Object.keys(bEmp)])) {
          const antes = porEmpleado[emp] ?? {}
          const ahora = bEmp[emp] ?? {}
          for (const clave of new Set([...Object.keys(antes), ...Object.keys(ahora)])) {
            if (igual(antes[clave], ahora[clave])) continue
            const r =
              clave in ahora
                ? await supabase.from('parametro_empleado').upsert({ empleado_codigo: emp, clave, valor: ahora[clave] })
                : await supabase.from('parametro_empleado').delete().eq('empleado_codigo', emp).eq('clave', clave)
            if (r.error) return `${clave} (${emp}): ${r.error.message}`
          }
        }
        await cargar()
        return null
      },
    }),
    [pendiente, generales, porEmpleado, bGen, bEmp, cargar],
  )
  useEffect(() => registrar(guardable), [guardable, registrar])

  const pestana = seccion.pestanas.find((p) => p.clave === tab) ?? seccion.pestanas[0]
  const hayPorEmpleado = seccion.pestanas.some((p) => p.parametros.some((d) => d.porEmpleado))
  const nombreEmp = (c: string) => empleados.find((e) => e.codigo === c)?.nombre ?? c

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1.5">
      {hayPorEmpleado && (
        <div className="flex items-center gap-2">
          <span className="gw-label">Valores de:</span>
          <GwSelect value={quien} onChange={(e) => setQuien(e.target.value)} className="w-[320px]">
            <option value="">Toda la empresa (valor general)</option>
            {empleados.map((e) => (
              <option key={e.codigo} value={e.codigo}>
                Empleado {e.codigo} · {e.nombre}
                {Object.keys(bEmp[e.codigo] ?? {}).length ? ` (${Object.keys(bEmp[e.codigo] ?? {}).length} propios)` : ''}
              </option>
            ))}
          </GwSelect>
          {quien && <span className="text-[13px] text-[#555]">Los que no tengan valor propio usan el de toda la empresa.</span>}
        </div>
      )}
      <GwTabs rows={[seccion.pestanas.map((p) => ({ key: p.clave, label: p.titulo }))]} active={pestana.clave} onChange={setTab}>
        <div className="min-h-[360px] overflow-y-auto p-2">
          {pestana.especial === 'contadores' && <ContadoresVista tiendas={tiendas} />}
          {pestana.especial === 'impuestos' && <ImpuestosVista admin={admin} />}
          {pestana.especial === 'operativa' && pestana.operativa && <GwOperativa bloques={pestana.operativa} />}
          {pestana.especial === 'colores' && (
            <ColoresVista
              valor={(bGen['apariencia.colores'] as MapaColores | undefined) ?? COLORES_DEFECTO}
              editable={admin}
              onChange={(m) => setBGen((x) => ({ ...x, 'apariencia.colores': m }))}
            />
          )}
          {pestana.especial === 'carpetas' && (
            <div className="max-w-[640px] text-[14px] leading-[20px]">
              En GeminisWin aquí se elegían las carpetas del periodo y de cada equipo (\\SERVER-OFIPAPEL\GEMINISW…). Avatar no usa carpetas: los
              datos están en la base de datos en la nube y cada periodo se gestiona en Archivo → Periodos.
            </div>
          )}
          {!pestana.especial && (
            <div className="grid grid-cols-[minmax(0,1fr)_300px_150px] items-center gap-x-3 gap-y-2">
              {pestana.parametros.map((d) => {
                const general = d.clave in bGen ? bGen[d.clave] : d.defecto
                const propio = quien ? bEmp[quien]?.[d.clave] : undefined
                const tienePropio = quien !== '' && bEmp[quien] != null && d.clave in (bEmp[quien] ?? {})
                const editableAqui = admin && (quien === '' || d.porEmpleado === true)
                const valor = quien && tienePropio ? propio : general
                const cambiar = (v: unknown) => {
                  if (quien) setBEmp((x) => ({ ...x, [quien]: { ...(x[quien] ?? {}), [d.clave]: v } }))
                  else setBGen((x) => ({ ...x, [d.clave]: v }))
                }
                return (
                  <FilaParametro
                    key={d.clave}
                    def={d}
                    valor={valor}
                    heredado={quien !== '' && !tienePropio}
                    editable={editableAqui && (quien === '' || tienePropio)}
                    onChange={cambiar}
                    tiendas={tiendas}
                    almacenes={almacenes}
                    extra={
                      quien && d.porEmpleado ? (
                        <label className="flex items-center gap-1 text-[13px]" title={`Valor propio de ${nombreEmp(quien)}`}>
                          <input
                            type="checkbox"
                            disabled={!admin}
                            checked={tienePropio}
                            onChange={(e) =>
                              setBEmp((x) => {
                                const m = { ...(x[quien] ?? {}) }
                                if (e.target.checked) m[d.clave] = general
                                else delete m[d.clave]
                                return { ...x, [quien]: m }
                              })
                            }
                          />
                          Propio
                        </label>
                      ) : quien ? (
                        <span className="text-[12px] text-[#888]">Solo general</span>
                      ) : !(d.clave in bGen) ? (
                        <span className="text-[12px] text-[#888]">Por defecto</span>
                      ) : null
                    }
                  />
                )
              })}
            </div>
          )}
        </div>
      </GwTabs>
    </div>
  )
}

function FilaParametro({
  def,
  valor,
  heredado,
  editable,
  onChange,
  tiendas,
  almacenes,
  extra,
}: {
  def: DefParametro
  valor: unknown
  heredado: boolean
  editable: boolean
  onChange: (v: unknown) => void
  tiendas: Opcion[]
  almacenes: Opcion[]
  extra: React.ReactNode
}) {
  const titulo = [def.ayuda, def.usa ? `Lo usa: ${def.usa}` : 'Se guarda; todavía no lo usa ninguna pantalla', def.gw ? `En GeminisWin: ${def.gw}` : ''].filter(Boolean).join('\n')
  let control: React.ReactNode
  const cls = heredado ? 'opacity-60' : ''
  if (def.tipo === 'bool') {
    const on = valor === true
    control = (
      <button
        type="button"
        aria-disabled={!editable}
        onClick={() => editable && onChange(!on)}
        className={`gw-boton-barra h-[30px] w-full justify-start gap-2 px-2 text-[14px] ${!editable ? 'pointer-events-none' : ''} ${cls}`}
      >
        <span className={`text-[16px] font-bold ${on ? 'text-[#127a12]' : 'text-[#c42b1c]'}`}>{on ? '✔' : '✖'}</span>
        {on ? 'Sí' : 'No'}
      </button>
    )
  } else if (def.tipo === 'num') {
    control = (
      <div className={cls}>
        <GwNumber value={valor == null ? null : Number(valor)} decimals={0} disabled={!editable} onChange={(v) => onChange(v == null ? def.defecto : Math.min(def.max ?? Infinity, Math.max(def.min ?? -Infinity, v)))} />
      </div>
    )
  } else if (def.tipo === 'texto') {
    control = <GwInput className={cls} value={String(valor ?? '')} disabled={!editable} onChange={(e) => onChange(e.target.value)} />
  } else {
    const opciones =
      def.tipo === 'tienda'
        ? [{ valor: '', texto: '(ninguna)' }, ...tiendas.map((t) => ({ valor: t.codigo, texto: `${t.codigo} · ${t.nombre}` }))]
        : def.tipo === 'almacen'
          ? almacenes.map((a) => ({ valor: a.codigo, texto: `${a.codigo} · ${a.nombre}` }))
          : (def.opciones ?? [])
    control = (
      <GwSelect className={`w-full ${cls}`} value={String(valor ?? '')} disabled={!editable} onChange={(e) => onChange(e.target.value === '' && def.tipo === 'tienda' ? null : e.target.value)}>
        {opciones.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.texto}
          </option>
        ))}
      </GwSelect>
    )
  }
  return (
    <>
      <span className="flex items-center gap-2" title={titulo}>
        <span className={`inline-block h-[9px] w-[9px] flex-none rounded-full ${def.usa ? 'bg-[#2e9e3e]' : 'bg-[#b5b5b5]'}`} />
        <span>{def.etiqueta}</span>
        {def.gw && <span className="truncate text-[12px] text-[#777]">(GeminisWin: {def.gw})</span>}
      </span>
      {control}
      <span>{extra}</span>
    </>
  )
}
