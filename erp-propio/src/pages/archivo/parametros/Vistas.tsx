// Parámetros → Contadores, Definición de Impuestos, Parametrización de las Tarifas (Almacén) y
// Configuración → Programador de Tareas, calcados de GeminisWin (ZIP 7, 04/11/2026).

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { GwGroup, GwInput, GwNumber, GwSelect } from '../../../components/gw'
import { supabase } from '../../../lib/supabase'
import { Mensaje } from '../../utilidades/comun'
import type { Celda, Guardable, Opcion, Registrar } from './ParametrosAvatarPage'

const FALTA_MIGRACION = 'Falta aplicar en la base de datos la migración 20261104_parametros_calcados.sql (pídeselo a Luis o a Rober).'

/* ------------------------------------------------------------------------------- Contadores */

/** Contadores Internos de GeminisWin → tipo de documento de secuencia_numeracion (null: no existe en Avatar). */
const INTERNOS: [string, string | null][] = [
  ['Facturas', 'factura'],
  ['Ventas', 'venta'],
  ['Ped. Client.', 'pedido_cliente'],
  ['Pagos de cli.', 'pago'],
  ['Mov. Caja', 'caja'],
  ['Cod. Cliente y Long.', null],
  ['Repartos', 'reparto'],
  ['Fact. Provd.', 'factura_proveedor'],
  ['Ped. a Provd.', 'pedido_proveedor'],
  ['Pagos a Prov.', 'pago_proveedor'],
  ['Trasp. Almac.', 'traspaso_almacen'],
  ['Reg. Stock', 'regularizacion_stock'],
  ['Nº de Lote', null],
]

export function ContadoresVista({ tiendas, celda }: { tiendas: Opcion[]; celda: Celda }) {
  const [tienda, setTienda] = useState('')
  const [filas, setFilas] = useState<{ tipo_documento_codigo: string; serie: string; siguiente_numero: number }[]>([])
  useEffect(() => {
    if (!tienda && tiendas[0]) setTienda(tiendas[0].codigo)
  }, [tiendas, tienda])
  useEffect(() => {
    if (!tienda) return
    supabase
      .from('secuencia_numeracion')
      .select('tipo_documento_codigo, serie, siguiente_numero')
      .eq('tienda_terminal_codigo', tienda)
      .order('serie')
      .then(({ data }) => setFilas((data ?? []) as typeof filas))
  }, [tienda])
  const valor = (tipo: string | null) => {
    if (!tipo) return { texto: '', title: 'Avatar no lleva este contador.' }
    const l = filas.filter((f) => f.tipo_documento_codigo === tipo)
    if (!l.length) return { texto: '', title: 'Esta tienda aún no ha numerado este documento.' }
    return { texto: String(l[0].siguiente_numero), title: l.map((f) => `Serie ${f.serie || '(sin serie)'}: siguiente nº ${f.siguiente_numero}`).join('\n') }
  }
  const ext: [string, string][] = [
    ['Variable', 'variable'],
    ['Fijo 1', 'fijo1'],
    ['Fijo 2', 'fijo2'],
  ]
  const COLS = ['dc', 'numero', 'incrementa_deuda', 'emitir_pagada', 'cambiar_numero', 'eliminar', 'predeterminado']
  return (
    <div className="flex flex-col gap-2">
      <GwGroup
        title={
          <span className="flex items-center gap-2">
            Contadores Internos
            <span className="text-[12px] font-normal text-[#555]">de la tienda / terminal</span>
            <GwSelect value={tienda} onChange={(e) => setTienda(e.target.value)} className="h-[22px] w-[260px] text-[13px]">
              {tiendas.map((t) => (
                <option key={t.codigo} value={t.codigo}>
                  {t.codigo} · {t.nombre}
                </option>
              ))}
            </GwSelect>
          </span>
        }
      >
        <div className="grid grid-cols-7 gap-x-1.5 gap-y-1">
          {INTERNOS.map(([etq, tipo]) => {
            const v = valor(tipo)
            return (
              <div key={etq} className="flex min-w-0 flex-col" title={v.title}>
                <span className="truncate text-[14px]">{etq}</span>
                <GwInput className="text-right" value={v.texto} disabled readOnly />
              </div>
            )
          })}
        </div>
        <div className="mt-1 text-[12px] text-[#555]">En Avatar cada tienda numera por separado: para cambiar un contador, Archivo → Tiendas → la tienda → Contadores.</div>
      </GwGroup>
      <GwGroup title="Contadores Externos Para la Facturación">
        <div className="grid grid-cols-[80px_80px_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.5fr)_minmax(0,1fr)] items-end gap-x-1.5 gap-y-1">
          <span />
          {['Dígito Control', 'Nº Factura', 'Incrementa Deuda', 'Emitir Pagada', 'Cambiar Núm. Fra', 'Eliminar Facturas'].map((h) => (
            <span key={h} className="text-center text-[14px] leading-[16px]">
              {h}
            </span>
          ))}
          <span className="flex flex-col text-[14px]">
            DC Predet.
            {celda('cont.ext.dc_predeterminado', { sinEtiqueta: true })}
          </span>
          {ext.map(([etq, k]) => (
            <Fila key={k} etq={etq}>
              {COLS.map((c) => (
                <div key={c} className="min-w-0">
                  {celda(`cont.ext.${k}.${c}`, { sinEtiqueta: true })}
                </div>
              ))}
            </Fila>
          ))}
        </div>
      </GwGroup>
      <div className="flex flex-col gap-1">{celda('cont.bloqueo')}</div>
    </div>
  )
}

function Fila({ etq, children }: { etq: string; children: ReactNode }) {
  return (
    <>
      <span className="pb-1 text-[14px]">{etq}</span>
      {children}
    </>
  )
}

/* ------------------------------------------------------------------------ Definición de Impuestos */

interface TipoIgic {
  tipo_pct: number | null
  descripcion: string | null
  cuenta_repercutido: string | null
  cuenta_soportado: string | null
  activo: boolean
  cod_cw_repercutido?: number | null
  cuenta_soportado_importacion?: string | null
  cod_cw_importacion?: number | null
  /** Fila nueva (aún no está en la base de datos). */
  nueva?: boolean
}

const FILAS_IVA = 9
const soloCifras = (v: string) => v.replace(/\D/g, '') || null
const vacia = (): TipoIgic => ({ tipo_pct: null, descripcion: null, cuenta_repercutido: null, cuenta_soportado: null, activo: true, nueva: true })

/** Impuestos Lineales (parámetros) y la rejilla de IGIC (tabla configuracion_contable_igic). */
export function ImpuestosVista({ admin, celda, registrar }: { admin: boolean; celda: Celda; registrar: Registrar }) {
  const [filas, setFilas] = useState<TipoIgic[]>([])
  const [edit, setEdit] = useState<TipoIgic[]>([])
  const [conColumnas, setConColumnas] = useState(true)
  const [mensaje, setMensaje] = useState<{ texto: string; error?: boolean } | null>(null)
  const cargar = useCallback(async () => {
    const { data, error } = await supabase.from('configuracion_contable_igic').select('*').order('tipo_pct')
    if (error) return setMensaje({ texto: error.message, error: true })
    const l = ((data ?? []) as TipoIgic[]).map((r) => ({ ...r, tipo_pct: Number(r.tipo_pct) }))
    setConColumnas(l.length === 0 || 'cod_cw_repercutido' in (data?.[0] ?? {}))
    const relleno = [...l, ...Array.from({ length: Math.max(0, FILAS_IVA - l.length) }, vacia)]
    setFilas(relleno)
    setEdit(relleno)
  }, [])
  useEffect(() => {
    cargar()
  }, [cargar])
  const set = (i: number, p: Partial<TipoIgic>) => setEdit((l) => l.map((r, j) => (j === i ? { ...r, ...p } : r)))
  const pendiente = JSON.stringify(filas) !== JSON.stringify(edit)

  const guardable = useMemo<Guardable>(
    () => ({
      pendiente,
      descartar: () => setEdit(filas),
      guardar: async () => {
        for (const [i, r] of edit.entries()) {
          if (JSON.stringify(filas[i]) === JSON.stringify(r)) continue
          if (r.tipo_pct == null) continue
          const fila: Record<string, unknown> = {
            descripcion: r.descripcion,
            cuenta_repercutido: r.cuenta_repercutido,
            cuenta_soportado: r.cuenta_soportado,
            activo: r.activo,
          }
          if (conColumnas) {
            fila.cod_cw_repercutido = r.cod_cw_repercutido ?? null
            fila.cuenta_soportado_importacion = r.cuenta_soportado_importacion ?? null
            fila.cod_cw_importacion = r.cod_cw_importacion ?? null
          }
          const q = r.nueva
            ? await supabase.from('configuracion_contable_igic').insert({ ...fila, tipo_pct: r.tipo_pct })
            : await supabase.from('configuracion_contable_igic').update(fila).eq('tipo_pct', r.tipo_pct)
          if (q.error) return `IGIC ${r.tipo_pct.toLocaleString('es-ES')} %: ${q.error.message}`
        }
        await cargar()
        return null
      },
    }),
    [pendiente, filas, edit, conColumnas, cargar],
  )
  useEffect(() => registrar('impuestos', guardable), [guardable, registrar])

  const repetido = (i: number, v: number | null) => v != null && edit.some((r, j) => j !== i && r.tipo_pct === v)
  const nuevaCol = (title?: string) => ({ disabled: !admin || !conColumnas, title: conColumnas ? title : FALTA_MIGRACION })

  return (
    <div className="flex flex-col gap-2">
      <GwGroup title="Impuestos Lineales">
        <div className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1.4fr)_minmax(0,1.2fr)_90px_minmax(0,1.3fr)_minmax(0,1fr)] items-end gap-x-1.5 gap-y-1">
          {[1, 2].flatMap((i) =>
            ['nomenclatura', 'aplicable', 'tipo', 'importe', 'imputable', 'cuenta'].map((k) => (
              <div key={`${i}${k}`} className={`min-w-0 ${k === 'imputable' ? 'pb-1' : ''}`}>
                {celda(`imp.lineal${i}.${k}`)}
              </div>
            )),
          )}
        </div>
      </GwGroup>
      <GwGroup title="Impuestos sobre el Valor Añadido">
        <div className="mb-1.5 flex items-end gap-4">
          <div className="w-[380px]">{celda('imp.nomenclatura')}</div>
          <div className="w-[220px]">{celda('imp.defecto_pct')}</div>
        </div>
        <table className="gw-grid w-full">
          <thead>
            <tr>
              <th className="w-[26px]" />
              <th>Descripción</th>
              <th className="w-[80px] text-right!">Tipo</th>
              <th className="w-[120px]">Repercutido Cta. 477</th>
              <th className="w-[120px]">Soportado (Cta. 472)</th>
              <th className="w-[64px]">Cod. CW.</th>
              <th className="w-[120px]">Soportado Importación</th>
              <th className="w-[64px]">Cod. CW.</th>
              <th className="w-[54px]" title="Avatar: los tipos que no están activos no se proponen al vender ni al comprar.">
                Activo
              </th>
            </tr>
          </thead>
          <tbody>
            {edit.map((r, i) => (
              <tr key={i}>
                <td className="text-center font-bold">{i + 1}</td>
                <td>
                  <GwInput value={r.descripcion ?? ''} disabled={!admin || r.tipo_pct == null} onChange={(e) => set(i, { descripcion: e.target.value || null })} />
                </td>
                <td>
                  {r.nueva ? (
                    <GwNumber
                      value={r.tipo_pct}
                      decimals={2}
                      disabled={!admin}
                      onChange={(v) => {
                        if (repetido(i, v)) return setMensaje({ texto: `Ya hay un tipo del ${v?.toLocaleString('es-ES')} %: cambia ese en lugar de repetirlo.`, error: true })
                        setMensaje(null)
                        set(i, { tipo_pct: v, descripcion: r.descripcion ?? (v != null ? `IGIC ${v.toLocaleString('es-ES')} %` : null) })
                      }}
                    />
                  ) : (
                    <GwNumber value={r.tipo_pct} decimals={2} disabled />
                  )}
                </td>
                <td>
                  <GwInput value={r.cuenta_repercutido ?? ''} disabled={!admin || r.tipo_pct == null} onChange={(e) => set(i, { cuenta_repercutido: soloCifras(e.target.value) })} />
                </td>
                <td>
                  <GwInput value={r.cuenta_soportado ?? ''} disabled={!admin || r.tipo_pct == null} onChange={(e) => set(i, { cuenta_soportado: soloCifras(e.target.value) })} />
                </td>
                <td>
                  <GwNumber value={r.cod_cw_repercutido ?? null} decimals={0} {...nuevaCol()} disabled={nuevaCol().disabled || r.tipo_pct == null} onChange={(v) => set(i, { cod_cw_repercutido: v })} />
                </td>
                <td>
                  <GwInput
                    value={r.cuenta_soportado_importacion ?? ''}
                    {...nuevaCol()}
                    disabled={nuevaCol().disabled || r.tipo_pct == null}
                    onChange={(e) => set(i, { cuenta_soportado_importacion: soloCifras(e.target.value) })}
                  />
                </td>
                <td>
                  <GwNumber value={r.cod_cw_importacion ?? null} decimals={0} {...nuevaCol()} disabled={nuevaCol().disabled || r.tipo_pct == null} onChange={(v) => set(i, { cod_cw_importacion: v })} />
                </td>
                <td className="text-center">
                  <input type="checkbox" checked={r.activo} disabled={!admin || r.tipo_pct == null} onChange={(e) => set(i, { activo: e.target.checked })} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-1 text-[12px] text-[#555]">Para añadir un tipo, escribe su % en una fila vacía. El tipo de una fila ya guardada no se cambia (lo usan los documentos).</div>
      </GwGroup>
      {mensaje && <Mensaje {...mensaje} />}
    </div>
  )
}

/* ------------------------------------------------------------------ Parametrización de las Tarifas */

interface Tarifa {
  nivel: number
  nombre: string | null
  permitir_acceso?: string
  igic_incluido?: boolean
}

/** Rejilla de tarifas (tabla nivel_tarifa): descripción, quién puede usarla y si lleva el IGIC incluido. */
export function TarifasVista({ admin, registrar }: { admin: boolean; registrar: Registrar }) {
  const [filas, setFilas] = useState<Tarifa[]>([])
  const [edit, setEdit] = useState<Tarifa[]>([])
  const [mensaje, setMensaje] = useState<string | null>(null)
  const cargar = useCallback(async () => {
    const { data, error } = await supabase.from('nivel_tarifa').select('*').order('nivel')
    if (error) return setMensaje(error.message)
    const l = (data ?? []) as Tarifa[]
    setFilas(l)
    setEdit(l)
  }, [])
  useEffect(() => {
    cargar()
  }, [cargar])
  const conColumnas = edit.length === 0 || 'permitir_acceso' in edit[0]
  const pendiente = JSON.stringify(filas) !== JSON.stringify(edit)
  const guardable = useMemo<Guardable>(
    () => ({
      pendiente,
      descartar: () => setEdit(filas),
      guardar: async () => {
        for (const [i, r] of edit.entries()) {
          if (JSON.stringify(filas[i]) === JSON.stringify(r)) continue
          const fila: Record<string, unknown> = { nombre: r.nombre }
          if (conColumnas) {
            fila.permitir_acceso = r.permitir_acceso
            fila.igic_incluido = r.igic_incluido
          }
          const { error } = await supabase.from('nivel_tarifa').update(fila).eq('nivel', r.nivel)
          if (error) return `Tarifa ${r.nivel}: ${error.message}`
        }
        await cargar()
        return null
      },
    }),
    [pendiente, filas, edit, conColumnas, cargar],
  )
  useEffect(() => registrar('tarifas', guardable), [guardable, registrar])
  const set = (i: number, p: Partial<Tarifa>) => setEdit((l) => l.map((r, j) => (j === i ? { ...r, ...p } : r)))
  const tt = conColumnas ? 'Se guarda; todavía no lo aplica la venta' : FALTA_MIGRACION
  return (
    <div className="grid max-w-[640px] grid-cols-[minmax(0,1fr)_200px_80px] items-center gap-x-1.5 gap-y-1">
      <span className="text-center text-[14px]">Descripción de las tarifas</span>
      <span className="text-center text-[14px]">Permitir Acceso</span>
      <span className="text-center text-[14px]">IGIC Incluido</span>
      {edit.map((r, i) => (
        <Fila3 key={r.nivel}>
          <GwInput value={r.nombre ?? ''} disabled={!admin} onChange={(e) => set(i, { nombre: e.target.value })} title={`Tarifa ${r.nivel}`} />
          <GwSelect value={r.permitir_acceso ?? 'todos'} disabled={!admin || !conColumnas} title={tt} onChange={(e) => set(i, { permitir_acceso: e.target.value })}>
            <option value="todos">A Todos</option>
            <option value="avanzados">Usuar. Avanzados</option>
          </GwSelect>
          <button type="button" className="gw-boton-barra h-[26px] justify-center" disabled={!admin || !conColumnas} title={tt} onClick={() => set(i, { igic_incluido: !r.igic_incluido })}>
            <span className={`font-bold ${r.igic_incluido ? 'text-[#127a12]' : 'text-[#c42b1c]'}`}>{r.igic_incluido ? '✔' : '✖'}</span>
          </button>
        </Fila3>
      ))}
      {mensaje && <span className="col-span-3 text-[#c42b1c]">{mensaje}</span>}
    </div>
  )
}

function Fila3({ children }: { children: ReactNode }) {
  return <>{children}</>
}

/* ------------------------------------------------------------------------ Programador de Tareas */

const SIN_TAREAS = 'Avatar no ejecuta tareas en el equipo: la copia de seguridad se hace con Utilidades → Copia de Seguridad (Alt+F8).'

/** Programador de Tareas de GeminisWin: se ve igual, pero en gris (no hay tareas en el equipo). */
export function ProgramadorVista() {
  const campo = (etq: string, w = '') => (
    <div className={`flex min-w-0 flex-col ${w}`}>
      <span className="text-[14px] text-[#777]">{etq}</span>
      <GwInput disabled title={SIN_TAREAS} />
    </div>
  )
  const casilla = (etq: string) => (
    <label className="flex items-center gap-1.5 text-[14px] text-[#777]" title={SIN_TAREAS}>
      <input type="checkbox" disabled /> {etq}
    </label>
  )
  const area = (etq: string) => (
    <div className="flex flex-col gap-0.5">
      {casilla(etq)}
      <textarea className="gw-input h-[44px] resize-none" disabled title={SIN_TAREAS} />
    </div>
  )
  return (
    <div className="flex flex-col gap-1.5" title={SIN_TAREAS}>
      <div className="text-[13px] text-[#8a5a00]">{SIN_TAREAS}</div>
      <div className="grid grid-cols-[80px_minmax(0,1fr)_150px_minmax(0,1fr)] items-end gap-1.5">
        {campo('Id Tar.')}
        {campo('Título de la Tarea')}
        <div className="pb-1">{casilla('Deshabilitada')}</div>
        <div className="flex flex-col">
          <span className="text-[14px] text-[#777]">Tareas Predefinidas</span>
          <GwSelect disabled title={SIN_TAREAS}>
            <option>Copia de Seguridad Personalizada</option>
          </GwSelect>
        </div>
      </div>
      <GwGroup title="Datos de Ejecución">
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1">
            <GwSelect disabled title={SIN_TAREAS}>
              <option>Siempre</option>
            </GwSelect>
            <span className="text-[14px] text-[#777]">Modos de Generar la Copia de Seg.</span>
            <GwSelect disabled title={SIN_TAREAS}>
              <option>Generar Fichero según el Día o el Mes</option>
            </GwSelect>
          </div>
          <div className="flex flex-col gap-1">
            {area('Ejecutar éste Script al empezar')}
            {area('Ejecutar éste Script al terminar')}
            {casilla('Ejecutar la tarea en modo Oculto')}
            {casilla('Ejecutar la tarea en Segundo Plano')}
            {casilla('Cerrar Avatar al terminar')}
            {casilla('Cerrar Windows al terminar')}
          </div>
        </div>
      </GwGroup>
      <GwGroup title="Programador">
        <div className="grid grid-cols-2 gap-2">
          {area('Enviar un Email al Empezar el Proceso')}
          {area('Enviar un Email al Terminar el Proceso')}
        </div>
        <div className="mt-1 grid grid-cols-[minmax(0,1fr)_160px] items-end gap-1.5">
          {campo('Para:')}
          <button type="button" className="gw-btn h-[26px]" disabled title={SIN_TAREAS}>
            ✖ Copiar Imágenes
          </button>
        </div>
        <div className="mt-1 grid grid-cols-6 gap-1.5">
          {campo('Destino')}
          {campo('Carpeta')}
          {campo('Servidor')}
          {campo('Usuario')}
          {campo('Clave')}
          {campo('Carpeta Local')}
        </div>
      </GwGroup>
      <div className="flex gap-1">
        {['⏮', '◀', '▶', '⏭', 'Localizar', 'Nuevo', 'Modificar', 'Borrar'].map((b) => (
          <button key={b} type="button" className="gw-btn h-[28px] flex-1" disabled title={SIN_TAREAS}>
            {b}
          </button>
        ))}
        <button type="button" className="gw-btn h-[28px] w-[120px]" disabled title={SIN_TAREAS}>
          Probar
        </button>
      </div>
    </div>
  )
}
