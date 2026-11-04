// Archivo → Parámetros de Avatar, calcado de Utilidades → Parámetros de GeminisWin (todas las
// capturas del ZIP 7 «Parametros», 04/11/2026): a la izquierda el árbol del apartado elegido y
// abajo los tres apartados grandes (Parámetros, Configuración, Control de Accesos); a la derecha
// las pestañas de la sección con sus recuadros; abajo Aplicar · Aceptar · Cancelar.
//
// Mejoras sobre GeminisWin:
//  · Cada parámetro marcado «por empleado» puede tener un valor distinto para cada empleado (lo
//    que en GeminisWin eran los Parámetros Locales de cada equipo): «Valores de: …».
//  · Control de Accesos → Usuarios o Empleados → «Editar Actual»: tiendas y almacenes donde puede
//    trabajar, descuento máximo, precios, horario y permisos de menú por encima de su grupo.
//  · Se ve si el programa ya usa cada parámetro (punto verde) o solo lo guarda (punto gris); lo que
//    no tiene sentido en el navegador sale en gris con el motivo al pasar el ratón.
// Solo los administradores modifican (lo impone la RLS de las tablas).

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { GwGroup, GwInput, GwNumber, GwSelect, GwTabs, GwTextArea } from '../../../components/gw'
import { supabase } from '../../../lib/supabase'
import { cargarParametros } from '../../../lib/parametros'
import {
  COLORES_DEFECTO,
  SECCIONES_CONFIGURACION,
  SECCIONES_PARAMETROS,
  type DefParametro,
  type PestanaParametros,
  type SeccionParametros,
} from '../../../lib/catalogoParametros'
import type { MapaColores } from '../../../lib/coloresPantallas'
import { ColoresVista } from './ColoresVista'
import { GwOperativa } from '../../../components/gw/GwOperativa'
import { Mensaje } from '../../utilidades/comun'
import { useEsAdministrador } from '../comun'
import { AreaAccesos } from './AreaAccesos'
import { AreaConfiguracion } from './AreaConfiguracion'
import { AreaCondiciones, useApartadosCondiciones } from './AreaCondiciones'
import { ControlAccesosGW, SUBAREAS_ACCESOS, type SubAccesos } from './AreaAccesosGW'
import { usePermisos } from '../../../lib/PermisosContext'
import { ContadoresVista, ImpuestosVista, ProgramadorVista, TarifasVista } from './Vistas'

type Area = 'parametros' | 'configuracion' | 'accesos' | 'condiciones'

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

/** Registra lo que hay que guardar con Aplicar (una entrada por clave). */
export type Registrar = (clave: string, g: Guardable) => void

/** Pinta el control de un parámetro del catálogo (lo usan las vistas especiales). */
export type Celda = (clave: string, o?: { sinEtiqueta?: boolean }) => ReactNode

const igual = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

export function ParametrosAvatarPage() {
  const navigate = useNavigate()
  const admin = useEsAdministrador() === true
  const [area, setArea] = useState<Area>('parametros')
  const [seccion, setSeccion] = useState(SECCIONES_PARAMETROS[0].clave)
  const [seccionCfg, setSeccionCfg] = useState(SECCIONES_CONFIGURACION[0].clave)
  const [subAcc, setSubAcc] = useState<SubAccesos>('grupos')
  const [empleados, setEmpleados] = useState<Empleado[]>([])
  const [empSel, setEmpSel] = useState<string | null>(null)
  const [tiendas, setTiendas] = useState<Opcion[]>([])
  const [almacenes, setAlmacenes] = useState<Opcion[]>([])
  const [mensaje, setMensaje] = useState<{ texto: string; error?: boolean } | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [guardables, setGuardables] = useState<Record<string, Guardable>>({})
  // Condiciones de Programación (Luis, 03/11/2026): solo super administradores.
  const { superAdmin } = usePermisos()
  const apartados = useApartadosCondiciones(area === 'condiciones')
  const [apartado, setApartado] = useState<string | null>(null)

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

  const registrar = useCallback<Registrar>((k, g) => setGuardables((x) => (x[k] === g ? x : { ...x, [k]: g })), [])
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

  const seccionParam = SECCIONES_PARAMETROS.find((s) => s.clave === seccion) ?? SECCIONES_PARAMETROS[0]
  const seccionConf = SECCIONES_CONFIGURACION.find((s) => s.clave === seccionCfg) ?? SECCIONES_CONFIGURACION[0]
  const verParametros = area === 'parametros' || area === 'configuracion'

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
            {area === 'configuracion' &&
              SECCIONES_CONFIGURACION.map((s) => (
                <ElementoArbol key={s.clave} activo={s.clave === seccionCfg} icono={s.icono} onClick={() => setSeccionCfg(s.clave)}>
                  {s.titulo}
                </ElementoArbol>
              ))}
            {area === 'accesos' &&
              SUBAREAS_ACCESOS.map((s) => (
                <ElementoArbol
                  key={s.clave}
                  activo={s.clave === subAcc || (subAcc === 'empleado' && s.clave === 'usuarios')}
                  icono={s.icono}
                  onClick={() => setSubAcc(s.clave)}
                >
                  {s.titulo}
                </ElementoArbol>
              ))}
            {area === 'condiciones' && (
              <>
                <ElementoArbol activo={apartado == null} icono="📜" onClick={() => setApartado(null)}>
                  Todas
                </ElementoArbol>
                {apartados.map((a) => (
                  <ElementoArbol key={a} activo={a === apartado} icono="•" onClick={() => setApartado(a)}>
                    {a}
                  </ElementoArbol>
                ))}
              </>
            )}
          </div>
          <BotonArea activo={area === 'parametros'} icono="🛠️" onClick={() => setArea('parametros')}>
            Parámetros
          </BotonArea>
          <BotonArea activo={area === 'configuracion'} icono="🔧" onClick={() => setArea('configuracion')}>
            Configuración
          </BotonArea>
          <BotonArea activo={area === 'accesos'} icono="🔐" onClick={() => setArea('accesos')}>
            Control de Accesos
          </BotonArea>
          {superAdmin && (
            <BotonArea activo={area === 'condiciones'} icono="📜" onClick={() => setArea('condiciones')}>
              Condiciones de Programación
            </BotonArea>
          )}
        </div>

        {/* Zona derecha */}
        <div className="flex min-w-0 flex-1 flex-col border border-[var(--gw-border)] bg-[var(--gw-face)] p-1.5">
          {/* Las zonas quedan montadas: lo cambiado en una no se pierde al pasar a otra. */}
          <div className={verParametros ? 'flex min-h-0 flex-1 flex-col' : 'hidden'}>
            <AreaParametros
              seccion={area === 'configuracion' ? seccionConf : seccionParam}
              admin={admin}
              empleados={empleados}
              tiendas={tiendas}
              almacenes={almacenes}
              registrar={registrar}
            />
          </div>
          {area === 'condiciones' && <AreaCondiciones apartado={apartado} />}
          <div className={area === 'accesos' && subAcc !== 'empleado' ? 'flex min-h-0 flex-1 flex-col' : 'hidden'}>
            <ControlAccesosGW
              sub={subAcc === 'empleado' ? 'usuarios' : subAcc}
              admin={admin}
              registrar={registrar}
              onEditarEmpleado={(c) => {
                setEmpSel(c)
                setSubAcc('empleado')
              }}
            />
          </div>
          <div className={area === 'accesos' && subAcc === 'empleado' ? 'flex min-h-0 flex-1 flex-col gap-1.5' : 'hidden'}>
            <div>
              <button type="button" className="gw-btn" onClick={() => setSubAcc('usuarios')}>
                ◀ Volver a Usuarios o Empleados
              </button>
            </div>
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
      className={`gw-boton-barra h-[52px] w-full flex-none justify-start gap-3 px-3 text-left text-[20px] leading-tight ${activo ? 'text-[#0033cc]' : 'text-[#555]'}`}
    >
      <span className="text-[26px]">{icono}</span>
      {children}
    </button>
  )
}

/* ----------------------------------------------------------------------------- Parámetros */

/** Trozos seguidos con el mismo recuadro. */
function enRecuadros(defs: DefParametro[]): { grupo?: string; ancho: number; defs: DefParametro[] }[] {
  const out: { grupo?: string; ancho: number; defs: DefParametro[] }[] = []
  for (const d of defs) {
    const ult = out[out.length - 1]
    if (ult && ult.grupo === d.grupo && d.grupo != null && d.anchoGrupo == null) ult.defs.push(d)
    else if (ult && ult.grupo == null && d.grupo == null) ult.defs.push(d)
    else out.push({ grupo: d.grupo, ancho: d.anchoGrupo ?? 12, defs: [d] })
  }
  return out
}

const anchoPorDefecto = (d: DefParametro) =>
  d.ancho ?? (d.tipo === 'bool' ? (d.estilo === 'casilla' ? 6 : 12) : d.tipo === 'num' ? 4 : d.tipo === 'color' ? 3 : d.tipo === 'textoLargo' || d.tipo === 'radio' ? 12 : 6)

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
  registrar: Registrar
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
  useEffect(() => registrar('parametros', guardable), [guardable, registrar])

  const pestana: PestanaParametros = seccion.pestanas.find((p) => p.clave === tab) ?? seccion.pestanas[0]
  const hayPorEmpleado = seccion.pestanas.some((p) => p.parametros.some((d) => d.porEmpleado))
  const nombreEmp = (c: string) => empleados.find((e) => e.codigo === c)?.nombre ?? c
  const porClave = useMemo(() => Object.fromEntries(seccion.pestanas.flatMap((p) => p.parametros.map((d) => [d.clave, d]))), [seccion])

  /** Valor que se ve, si se puede tocar aquí y cómo cambiarlo. */
  const estado = (d: DefParametro) => {
    const general = d.clave in bGen ? bGen[d.clave] : d.defecto
    const tienePropio = quien !== '' && d.clave in (bEmp[quien] ?? {})
    const valor = tienePropio ? bEmp[quien][d.clave] : general
    const editable = admin && !d.deshabilitado && (quien === '' || (d.porEmpleado === true && tienePropio))
    const cambiar = (v: unknown) => {
      if (quien) setBEmp((x) => ({ ...x, [quien]: { ...(x[quien] ?? {}), [d.clave]: v } }))
      else setBGen((x) => ({ ...x, [d.clave]: v }))
    }
    const propio =
      quien && d.porEmpleado ? (
        <label className="flex flex-none items-center gap-1 text-[12px] font-normal not-italic" title={`Valor propio de ${nombreEmp(quien)}`}>
          <input
            type="checkbox"
            disabled={!admin || !!d.deshabilitado}
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
      ) : null
    return { valor, editable, cambiar, heredado: quien !== '' && !tienePropio, propio }
  }

  const titulo = (d: DefParametro) =>
    [
      d.deshabilitado ? `No se usa en Avatar: ${d.deshabilitado}` : '',
      d.ayuda,
      d.usa ? `Lo usa: ${d.usa}` : d.deshabilitado ? '' : 'Se guarda; todavía no lo usa ninguna pantalla',
      d.porEmpleado ? 'Se puede dar un valor distinto a cada empleado («Valores de:»).' : '',
      d.gw ? `En GeminisWin: ${d.gw}` : '',
    ]
      .filter(Boolean)
      .join('\n')

  const punto = (d: DefParametro) => (
    <span className={`inline-block h-[8px] w-[8px] flex-none rounded-full ${d.usa ? 'bg-[#2e9e3e]' : d.deshabilitado ? 'bg-transparent' : 'bg-[#b5b5b5]'}`} />
  )

  /** Control de un parámetro (con su etiqueta encima, salvo botones y casillas). */
  function control(d: DefParametro, apagado: boolean, sinEtiqueta = false): ReactNode {
    const { valor, editable: ed, cambiar, heredado, propio } = estado(d)
    const editable = ed && !apagado
    const cls = `${heredado ? 'opacity-60' : ''} ${d.deshabilitado ? 'opacity-50' : ''}`
    const tt = titulo(d)
    const etiqueta = !sinEtiqueta && d.etiqueta ? (
      <span className="flex min-w-0 items-center gap-1.5 text-[14px] leading-[18px]" title={tt}>
        {punto(d)}
        <span className="truncate">{d.etiqueta}</span>
        {propio}
      </span>
    ) : propio ? (
      <span className="flex items-center gap-1.5">{propio}</span>
    ) : null
    if (d.tipo === 'bool' && d.estilo !== 'titulo') {
      const on = valor === true
      if (d.estilo === 'casilla')
        return (
          <label className={`flex min-w-0 items-center gap-1.5 text-[14px] ${cls}`} title={tt}>
            <input type="checkbox" className="m-0 h-[13px] w-[13px] flex-none accent-[#0078d7]" disabled={!editable} checked={on} onChange={(e) => cambiar(e.target.checked)} />
            <span className="min-w-0">{d.etiqueta}</span>
            {punto(d)}
            {propio}
          </label>
        )
      return (
        <div className="flex items-center gap-1.5" title={tt}>
          <button
            type="button"
            disabled={!editable}
            onClick={() => cambiar(!on)}
            className={`gw-boton-barra min-h-[30px] flex-1 justify-center gap-1.5 px-2 py-[3px] text-center text-[14px] leading-[18px] ${cls}`}
          >
            <span className={`text-[15px] font-bold ${on ? 'text-[#127a12]' : 'text-[#c42b1c]'}`}>{on ? '✔' : '✖'}</span>
            {d.etiqueta}
          </button>
          {punto(d)}
          {propio}
        </div>
      )
    }
    let campo: ReactNode
    if (d.tipo === 'num') {
      campo = (
        <GwNumber
          className={cls}
          value={valor == null ? null : Number(valor)}
          decimals={d.decimales ?? 0}
          disabled={!editable}
          onChange={(v) => cambiar(v == null ? d.defecto : Math.min(d.max ?? Infinity, Math.max(d.min ?? -Infinity, v)))}
        />
      )
    } else if (d.tipo === 'texto') {
      campo = <GwInput className={cls} value={String(valor ?? '')} disabled={!editable} onChange={(e) => cambiar(e.target.value)} />
    } else if (d.tipo === 'textoLargo') {
      campo = <GwTextArea className={`h-[84px] w-full resize-y ${cls}`} value={String(valor ?? '')} disabled={!editable} onChange={(e) => cambiar(e.target.value)} />
    } else if (d.tipo === 'color') {
      const hex = typeof valor === 'string' && /^#[0-9a-f]{6}$/i.test(valor) ? valor : null
      campo = (
        <div className={`flex items-center gap-1 ${cls}`}>
          <span className="gw-input flex h-[24px] flex-1 items-center justify-end px-1 text-[12px] text-[#555]" style={hex ? { background: hex } : undefined}>
            {hex ? '' : '0'}
          </span>
          <label className={`gw-btn h-[24px] w-[34px] justify-center px-0 font-bold ${editable ? 'cursor-pointer' : 'pointer-events-none opacity-60'}`} title="Elegir color">
            ···
            <input type="color" className="sr-only" disabled={!editable} value={hex ?? '#ffffff'} onChange={(e) => cambiar(e.target.value)} />
          </label>
          {hex && editable && (
            <button type="button" className="text-[13px] text-[#c42b1c]" title="Quitar el color" onClick={() => cambiar(null)}>
              ✖
            </button>
          )}
        </div>
      )
    } else if (d.tipo === 'radio') {
      const opciones = d.opciones ?? []
      campo =
        d.estilo === 'botones' ? (
          <div className={`flex ${cls}`}>
            {opciones.map((o) => {
              const on = valor === o.valor
              return (
                <button
                  key={o.valor}
                  type="button"
                  disabled={!editable}
                  onClick={() => cambiar(o.valor)}
                  className={`gw-boton-barra h-[32px] flex-1 justify-center gap-1 px-1 text-[14px] ${on ? 'bg-white! font-bold shadow-[inset_1px_1px_2px_#999]' : ''}`}
                >
                  {on && <span className="text-[#127a12]">✔</span>}
                  {o.texto}
                </button>
              )
            })}
          </div>
        ) : (
          <div className={`flex flex-wrap gap-x-5 gap-y-1 ${cls}`}>
            {opciones.map((o) => (
              <label key={o.valor} className="flex items-center gap-1.5 text-[14px]">
                <input type="radio" className="m-0 accent-[#0078d7]" disabled={!editable} checked={valor === o.valor} onChange={() => cambiar(o.valor)} />
                {o.texto}
              </label>
            ))}
          </div>
        )
    } else {
      const opciones =
        d.tipo === 'tienda'
          ? [{ valor: '', texto: '(ninguna)' }, ...tiendas.map((t) => ({ valor: t.codigo, texto: `${t.codigo} · ${t.nombre}` }))]
          : d.tipo === 'almacen'
            ? almacenes.map((a) => ({ valor: a.codigo, texto: `${a.codigo} · ${a.nombre}` }))
            : d.tipo === 'empleado'
              ? [{ valor: '', texto: '(ninguno)' }, ...empleados.filter((e) => e.activo).map((e) => ({ valor: e.codigo, texto: `${e.codigo} · ${e.nombre}` }))]
              : (d.opciones ?? [])
      const nulo = d.tipo === 'tienda' || d.tipo === 'empleado'
      campo = (
        <GwSelect className={`w-full ${cls}`} value={String(valor ?? '')} disabled={!editable} onChange={(e) => cambiar(e.target.value === '' && nulo ? null : e.target.value)}>
          {opciones.map((o) => (
            <option key={o.valor} value={o.valor}>
              {o.texto}
            </option>
          ))}
        </GwSelect>
      )
    }
    return (
      <div className="flex min-w-0 flex-col gap-[2px]" title={d.deshabilitado ? tt : undefined}>
        {etiqueta}
        {campo}
      </div>
    )
  }

  const celda: Celda = (clave, o) => {
    const d = porClave[clave]
    return d ? control(d, false, o?.sinEtiqueta) : null
  }

  /** Lista de parámetros con sus recuadros, como en GeminisWin. */
  function lista(defs: DefParametro[]): ReactNode {
    return (
      <div className="grid grid-cols-12 items-start gap-x-2 gap-y-1.5">
        {enRecuadros(defs).map((r, i) => {
          const cab = r.defs[0]
          const conTitulo = cab.estilo === 'titulo'
          const est = conTitulo ? estado(cab) : null
          const activo = !conTitulo || (cab.tipo === 'radio' ? est?.valor !== 'no' : est?.valor === true)
          const resto = conTitulo && cab.tipo !== 'radio' ? r.defs.slice(1) : r.defs
          const cuerpo = (
            <div className="grid grid-cols-12 items-end gap-x-2 gap-y-1.5">
              {resto.map((d) => (
                <div key={d.clave} style={{ gridColumn: `span ${anchoPorDefecto(d)} / span ${anchoPorDefecto(d)}` }} className="min-w-0">
                  {d.tipo === 'radio' && d.estilo === 'titulo' ? control({ ...d, etiqueta: '', estilo: undefined }, !activo) : control(d, !activo && !d.usa)}
                </div>
              ))}
            </div>
          )
          const leyenda =
            conTitulo && est ? (
              <label className="flex items-center gap-1.5" title={titulo(cab)}>
                <input
                  type="checkbox"
                  className="m-0 accent-[#0078d7]"
                  disabled={!est.editable}
                  checked={activo}
                  onChange={(e) => est.cambiar(cab.tipo === 'radio' ? (e.target.checked ? (cab.opciones?.[0]?.valor ?? 'si') : 'no') : e.target.checked)}
                />
                {cab.grupo ?? cab.etiqueta}
                {est.propio}
              </label>
            ) : (
              r.grupo
            )
          return (
            <div key={i} style={{ gridColumn: `span ${r.ancho} / span ${r.ancho}` }} className="min-w-0">
              {r.grupo != null || conTitulo ? <GwGroup title={leyenda}>{cuerpo}</GwGroup> : cuerpo}
            </div>
          )
        })}
      </div>
    )
  }

  const unaSola = seccion.pestanas.length === 1
  const contenido = (
    <div className="min-h-[360px] overflow-y-auto p-2">
      {pestana.nota && <div className="mb-2 text-[13px] text-[#555]">{pestana.nota}</div>}
      {pestana.especial === 'contadores' && <ContadoresVista tiendas={tiendas} celda={celda} />}
      {pestana.especial === 'impuestos' && <ImpuestosVista admin={admin} celda={celda} registrar={registrar} />}
      {pestana.especial === 'tarifas' && <TarifasVista admin={admin} registrar={registrar} />}
      {pestana.especial === 'programador' && <ProgramadorVista />}
      {pestana.especial === 'fichas' && <AreaConfiguracion />}
      {pestana.especial === 'operativa' && pestana.operativa && <GwOperativa bloques={pestana.operativa} />}
      {pestana.especial === 'colores' && (
        <ColoresVista
          valor={(bGen['apariencia.colores'] as MapaColores | undefined) ?? COLORES_DEFECTO}
          editable={admin}
          onChange={(m) => setBGen((x) => ({ ...x, 'apariencia.colores': m }))}
        />
      )}
      {(!pestana.especial || pestana.especial === 'tarifas') && pestana.parametros.length > 0 && <div className={pestana.especial ? 'mt-2' : ''}>{lista(pestana.parametros)}</div>}
    </div>
  )

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
          {quien && <span className="text-[13px] text-[#555]">Marca «Propio» en los que tengan un valor distinto; los demás usan el de toda la empresa.</span>}
        </div>
      )}
      {unaSola ? (
        <div className="min-h-0 flex-1 overflow-y-auto border border-[var(--gw-border)] bg-[var(--gw-face)]">{contenido}</div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <GwTabs rows={[seccion.pestanas.map((p) => ({ key: p.clave, label: p.titulo }))]} active={pestana.clave} onChange={setTab}>
            {contenido}
          </GwTabs>
        </div>
      )}
    </div>
  )
}
