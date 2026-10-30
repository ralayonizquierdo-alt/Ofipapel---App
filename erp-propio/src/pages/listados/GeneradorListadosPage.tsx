// Utilidades → Generador de listados (Luis, 29/10/2026): una sola pantalla para sacar cualquier
// listado del ERP. Se elige qué listar (fuente), las columnas, los filtros, si se agrupa y qué se
// suma, y el orden; se ve en pantalla, se imprime (o PDF) y se pasa a Excel. Se guarda con nombre
// y se comparte con los grupos de acceso que se quiera.
// La consulta la hace fn_listado_ejecutar en la base de datos (solo columnas de la fuente, sin SQL
// libre) y cada uno ve solo lo que su RLS le deja ver.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { GwDate, GwField, GwInput, GwSelect, GwTabs, GwWindow, formatGw } from '../../components/gw'
import { GwOperativa } from '../../components/gw/GwOperativa'
import { supabase } from '../../lib/supabase'
import { usePermisos } from '../../lib/PermisosContext'
import { FUENTES, FUENTE_POR_CLAVE, OPERADORES, definicionNueva, type ColumnaFuente, type DefinicionListado, type FiltroListado } from '../../lib/listados/fuentes'

interface Guardado {
  id: number
  nombre: string
  fuente: string
  definicion: DefinicionListado
  grupos: number[] | null
  creado_por: string | null
  /** Código único e inmutable (CLI-0012, ART-0007…), lo pone la base de datos al guardar. */
  codigo: string | null
  /** «Para qué sirve». */
  descripcion: string | null
  archivado: boolean
  usos?: number
  ultimo_uso?: string | null
}

type Fila = Record<string, unknown>

export function GeneradorListadosPage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [guardados, setGuardados] = useState<Guardado[]>([])
  const [grupos, setGrupos] = useState<{ id: number; nombre: string }[]>([])
  const [id, setId] = useState<number | null>(null)
  const [nombre, setNombre] = useState('')
  const [fuente, setFuente] = useState(FUENTES[0].clave)
  const [def, setDef] = useState<DefinicionListado>(definicionNueva(FUENTES[0]))
  const [compartir, setCompartir] = useState<number[] | null>(null)
  const [tab, setTab] = useState('columnas')
  const [ayuda, setAyuda] = useState(false)
  const [filas, setFilas] = useState<Fila[] | null>(null)
  const [truncado, setTruncado] = useState(false)
  const [cargando, setCargando] = useState(false)
  const [mensaje, setMensaje] = useState<{ texto: string; error?: boolean } | null>(null)
  const [ultimaDef, setUltimaDef] = useState<DefinicionListado | null>(null)
  const [operarios, setOperarios] = useState<Record<string, string>>({})
  const [numeros, setNumeros] = useState<Record<string, string>>({})
  const [yo, setYo] = useState<string | null>(null)
  const [agruparPor, setAgruparPor] = useState<'operario' | 'tipo'>('operario')
  const [cerrados, setCerrados] = useState<Set<string>>(new Set())
  const [completa, setCompleta] = useState(false)
  const [sacado, setSacado] = useState<Date | null>(null)
  const [operario, setOperario] = useState('')
  const [buscarListado, setBuscarListado] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [bajas, setBajas] = useState<Set<string>>(new Set())
  const [gestionar, setGestionar] = useState<string | null>(null)
  const { realAdmin, superAdmin } = usePermisos()
  const puedeGestionar = realAdmin || superAdmin

  // Pantalla completa: Esc la cierra (antes que cualquier otro Esc de la ventana).
  useEffect(() => {
    if (!completa) return
    const tecla = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      setCompleta(false)
    }
    window.addEventListener('keydown', tecla, true)
    return () => window.removeEventListener('keydown', tecla, true)
  }, [completa])

  const F = FUENTE_POR_CLAVE[fuente]
  // Todos los campos de la ficha: los principales (fuentes.ts) y el resto de la vista, que se
  // piden a la base de datos (fn_listado_columnas) con su nombre puesto bonito.
  const [extras, setExtras] = useState<ColumnaFuente[]>([])
  useEffect(() => {
    let vivo = true
    setExtras([])
    supabase.rpc('fn_listado_columnas', { p_fuente: fuente }).then(({ data }) => {
      if (!vivo) return
      const principales = new Set(FUENTE_POR_CLAVE[fuente].columnas.map((c) => c.clave))
      setExtras(
        ((data ?? []) as { columna: string; tipo: string }[])
          .filter((c) => !principales.has(c.columna))
          .map((c) => ({ clave: c.columna, etiqueta: etiquetaCampo(c.columna), tipo: tipoCampo(c.tipo), dec: c.tipo === 'numeric' ? 2 : 0 })),
      )
    })
    return () => {
      vivo = false
    }
  }, [fuente])
  const todas = useMemo(() => [...F.columnas, ...extras], [F, extras])
  const col = useCallback((c: string): ColumnaFuente | undefined => todas.find((x) => x.clave === c), [todas])

  const cargarGuardados = useCallback(async () => {
    const [{ data }, { data: usos }] = await Promise.all([
      supabase.from('listado_guardado').select('id, nombre, fuente, definicion, grupos, creado_por, codigo, descripcion, archivado').order('nombre'),
      supabase.from('v_listado_uso_resumen').select('listado_id, usos, ultimo_uso'),
    ])
    const u = new Map(((usos ?? []) as { listado_id: number; usos: number; ultimo_uso: string }[]).map((x) => [x.listado_id, x]))
    setGuardados(((data ?? []) as Guardado[]).map((g) => ({ ...g, usos: Number(u.get(g.id)?.usos ?? 0), ultimo_uso: u.get(g.id)?.ultimo_uso ?? null })))
  }, [])

  useEffect(() => {
    cargarGuardados()
    supabase.rpc('fn_empleado_actual').then(({ data }) => setYo(typeof data === 'string' ? data : null))
    supabase
      .from('empleado')
      .select('codigo, nombre, numero_operario, activo')
      .then(({ data }) => {
        const l = (data ?? []) as { codigo: string; nombre: string; numero_operario: string | null; activo: boolean | null }[]
        setBajas(new Set(l.filter((e) => e.activo === false).map((e) => e.codigo)))
        setOperarios(Object.fromEntries(l.map((e) => [e.codigo, e.nombre])))
        setNumeros(Object.fromEntries(l.map((e) => [e.codigo, e.numero_operario || e.codigo])))
      })
    supabase
      .from('rol')
      .select('id, nombre')
      .order('nombre')
      .then(({ data }) => setGrupos((data ?? []) as { id: number; nombre: string }[]))
  }, [cargarGuardados])

  const abrir = useCallback((g: Guardado) => {
    setId(g.id)
    setNombre(g.nombre)
    setFuente(g.fuente)
    setDef({ ...definicionNueva(FUENTE_POR_CLAVE[g.fuente] ?? FUENTES[0]), ...g.definicion })
    setCompartir(g.grupos)
    setDescripcion(g.descripcion ?? '')
    setFilas(null)
    setMensaje(null)
  }, [])

  // ?id=… abre un listado guardado (desde el menú o un enlace); ?fuente=… empieza uno nuevo de
  // esa fuente (accesos desde los menús Listados de cada módulo).
  useEffect(() => {
    const p = Number(params.get('id'))
    const fu = params.get('fuente')
    if (!p && fu && FUENTE_POR_CLAVE[fu]) {
      setFuente(fu)
      // ?filtro=col:valor (uno o varios): filtros «igual a» ya puestos (p. ej. las ventas de un cliente).
      const filtros = params
        .getAll('filtro')
        .map((x) => {
          const i = x.indexOf(':')
          return i > 0 ? { col: x.slice(0, i), op: '=', valor: x.slice(i + 1) } : null
        })
        .filter((x): x is { col: string; op: string; valor: string } => x != null)
      setDef({ ...definicionNueva(FUENTE_POR_CLAVE[fu]), filtros })
      setId(null)
      setNombre('')
      setFilas(null)
      return
    }
    if (!p) return
    const g = guardados.find((x) => x.id === p)
    if (g) abrir(g)
  }, [params, guardados, abrir])

  function nuevo(clave = fuente) {
    setId(null)
    setNombre('')
    setFuente(clave)
    setDef(definicionNueva(FUENTE_POR_CLAVE[clave]))
    setCompartir(null)
    setDescripcion('')
    setFilas(null)
    setMensaje(null)
    setParams({})
  }

  async function ejecutar() {
    setMensaje(null)
    if (!def.columnas.length && !def.agrupar.length) return setMensaje({ texto: 'Marca al menos una columna.', error: true })
    setCargando(true)
    const filtros = def.filtros.filter((f) => f.col && f.op)
    const { data, error } = await supabase.rpc('fn_listado_ejecutar', {
      p_fuente: fuente,
      p_columnas: def.columnas,
      p_filtros: filtros,
      p_agrupar: def.agrupar,
      p_sumar: def.agrupar.length ? def.sumar : [],
      p_orden: def.orden,
      p_limite: 5000,
    })
    setCargando(false)
    if (error) return setMensaje({ texto: error.message, error: true })
    const r = data as { filas: Fila[]; truncado: boolean }
    setFilas(r.filas)
    setTruncado(r.truncado)
    setUltimaDef(def)
    setSacado(new Date())
    // Uso del listado guardado (último uso y nº de usos en la lista de la izquierda).
    if (id) void supabase.rpc('fn_listado_usado', { p_id: id })
  }

  async function guardar(comoNuevo: boolean) {
    const n = (comoNuevo || !nombre.trim() ? prompt('Nombre del listado:', nombre || F.titulo) : nombre)?.trim()
    if (!n) return
    const fila = { nombre: n, fuente, definicion: def, grupos: compartir, descripcion: descripcion.trim() || null, actualizado_en: new Date().toISOString() }
    const r = id && !comoNuevo ? await supabase.from('listado_guardado').update(fila).eq('id', id).select('id').single() : await supabase.from('listado_guardado').insert(fila).select('id').single()
    if (r.error) return setMensaje({ texto: r.error.message, error: true })
    setId((r.data as { id: number }).id)
    setNombre(n)
    const { data: g } = await supabase.from('listado_guardado').select('codigo').eq('id', (r.data as { id: number }).id).single()
    setMensaje({ texto: `Listado ${g?.codigo ?? ''} «${n}» guardado.` })
    cargarGuardados()
  }

  async function eliminar() {
    if (!id || !confirm(`¿Borrar el listado guardado «${nombre}»?`)) return
    const { error } = await supabase.from('listado_guardado').delete().eq('id', id)
    if (error) return setMensaje({ texto: error.message, error: true })
    nuevo()
    cargarGuardados()
  }

  // Columnas del resultado (las de la última ejecución).
  const d = ultimaDef ?? def
  const columnasResultado: { clave: string; etiqueta: string; tipo: string; dec?: number }[] = d.agrupar.length
    ? [
        ...d.agrupar.map((c) => ({ clave: c, etiqueta: col(c)?.etiqueta ?? c, tipo: col(c)?.tipo ?? 'texto', dec: col(c)?.dec })),
        { clave: 'registros', etiqueta: 'Registros', tipo: 'num', dec: 0 },
        ...d.sumar.map((c) => ({ clave: c, etiqueta: `Σ ${col(c)?.etiqueta ?? c}`, tipo: 'num', dec: col(c)?.dec ?? 2 })),
      ]
    : d.columnas.map((c) => ({ clave: c, etiqueta: col(c)?.etiqueta ?? c, tipo: col(c)?.tipo ?? 'texto', dec: col(c)?.dec }))

  const totales = useMemo(() => {
    const t: Record<string, number> = {}
    for (const c of columnasResultado) {
      if (c.tipo !== 'num' || ['numero', 'n_factura', 'anio', 'tarifa'].includes(c.clave)) continue
      t[c.clave] = (filas ?? []).reduce((s, r) => s + (Number(r[c.clave]) || 0), 0)
    }
    return t
  }, [filas, columnasResultado])

  const mostrar = (v: unknown, c: { tipo: string; dec?: number }) => {
    if (v == null || v === '') return ''
    if (c.tipo === 'num') return formatGw(Number(v), c.dec ?? 2)
    if (c.tipo === 'fecha') return String(v).slice(0, 10).split('-').reverse().join('/')
    if (c.tipo === 'bool') return v === true ? 'Sí' : 'No'
    return String(v)
  }

  function excel() {
    if (!filas) return
    const esc = (s: string) => (/[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)
    const lineas = [
      ...identificacion().map(([k, v]) => `${esc(k)};${esc(v)}`),
      '',
      columnasResultado.map((c) => esc(c.etiqueta)).join(';'),
      ...filas.map((r) =>
        columnasResultado
          .map((c) => {
            const v = r[c.clave]
            if (v == null) return ''
            if (c.tipo === 'num') return String(v).replace('.', ',')
            return esc(mostrar(v, c))
          })
          .join(';'),
      ),
    ]
    const blob = new Blob(['﻿' + lineas.join('\r\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${actual?.codigo ? `${actual.codigo} ` : ''}${(nombre || F.titulo).replace(/[^\w\- áéíóúñÁÉÍÓÚÑ]/g, '')}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  // Identificación del listado: sale arriba en lo impreso / PDF y al principio del Excel.
  const actual = id ? guardados.find((g) => g.id === id) : undefined
  const numDe = (c: string | null | undefined) => (c ? (numeros[c] ?? c) : '')
  const resumenDe = (fu: string, dd: DefinicionListado) => {
    const fte = FUENTE_POR_CLAVE[fu]
    const et = (c: string) => fte?.columnas.find((x) => x.clave === c)?.etiqueta ?? etiquetaCampo(c)
    const opTxt = (o: string) => OPERADORES.find((x) => x.op === o)?.texto ?? o
    const partes = [
      fte?.titulo ?? fu,
      `${dd.columnas.length} columnas`,
      dd.filtros.length ? `filtros: ${dd.filtros.map((f) => `${et(f.col)} ${opTxt(f.op)}${f.valor ? ` ${f.valor}` : ''}${f.valor2 ? ` y ${f.valor2}` : ''}`).join(', ')}` : 'sin filtros',
      dd.agrupar.length ? `agrupado por ${dd.agrupar.map(et).join(', ')}` : '',
      dd.orden.length ? `orden: ${dd.orden.map((o) => et(o.col) + (o.desc ? ' ↓' : '')).join(', ')}` : '',
    ]
    return partes.filter(Boolean).join(' · ')
  }
  const identificacion = (): [string, string][] =>
    [
      ['Listado', `${actual?.codigo ? `${actual.codigo} · ` : ''}${nombre || F.titulo}${actual ? '' : ' (sin guardar)'}`],
      ['Qué incluye', resumenDe(fuente, ultimaDef ?? def)],
      ['Para qué sirve', descripcion.trim()],
      ['Creado por', actual ? (actual.creado_por ? `Nº ${numDe(actual.creado_por)} · ${operarios[actual.creado_por] ?? ''}` : 'De serie') : ''],
      ['Sacado por', `Nº ${numDe(yo)} · ${yo ? (operarios[yo] ?? '') : ''} · ${(sacado ?? new Date()).toLocaleString('es-ES')}`],
    ].filter(([, v]) => v) as [string, string][]

  async function accionVendedor(emp: string | null, accion: string, destino: string | null, ids: number[] | null) {
    const { data, error } = await supabase.rpc('fn_listados_vendedor', { p_empleado: emp, p_accion: accion, p_destino: destino, p_ids: ids })
    if (error) return setMensaje({ texto: error.message, error: true })
    setMensaje({ texto: `${Number(data ?? 0)} listado(s): hecho.` })
    setGestionar(null)
    cargarGuardados()
  }

  const setD = (p: Partial<DefinicionListado>) => setDef((x) => ({ ...x, ...p }))
  // Guardados agrupados por operario (los míos primero; los de serie, al final) o por tipo.
  const nombreFuente = (c: string) => FUENTE_POR_CLAVE[c]?.titulo ?? c
  // Filtro por nº de operario (código de empleado de quien lo hizo).
  const op = operario.trim().toUpperCase()
  const num = (c: string | null) => (c ? (numeros[c] ?? c) : '')
  // Buscar por código, nombre, «para qué sirve» o lo que incluye (Luis, 30/10/2026).
  const tb = buscarListado.trim().toLowerCase()
  const coincide = (g: Guardado) =>
    !tb || [g.codigo, g.nombre, g.descripcion, resumenDe(g.fuente, g.definicion)].some((x) => (x ?? '').toLowerCase().includes(tb))
  const visibles = guardados.filter(
    (g) => coincide(g) && (!op || num(g.creado_por).toUpperCase().startsWith(op) || (g.creado_por ?? '').toUpperCase().startsWith(op)),
  )
  const activos = visibles.filter((g) => !g.archivado)
  const otros = [...new Set(activos.map((g) => g.creado_por).filter((c): c is string => !!c && c !== yo))].sort((a, b) =>
    num(a).localeCompare(num(b), 'es', { numeric: true }),
  )
  const gruposGuardados: { clave: string; titulo: string; lista: Guardado[]; emp?: string; baja?: boolean; archivados?: boolean }[] =
    agruparPor === 'tipo'
      ? FUENTES.map((fu) => ({ clave: fu.clave, titulo: fu.titulo, lista: activos.filter((g) => g.fuente === fu.clave) })).filter((x) => x.lista.length)
      : [
          { clave: 'yo', titulo: `Mis listados${yo ? ` · Nº ${num(yo)}` : ''}`, lista: activos.filter((g) => g.creado_por && g.creado_por === yo), emp: yo ?? undefined },
          ...otros
            .filter((c) => !bajas.has(c))
            .map((c) => ({ clave: c, titulo: `Vend. Nº ${num(c)}`, lista: activos.filter((g) => g.creado_por === c), emp: c })),
          { clave: 'serie', titulo: 'De serie (para todos)', lista: activos.filter((g) => !g.creado_por) },
          // Los de quien ya no trabaja aquí: al final y en rojo, para decidir qué hacer con ellos.
          ...otros
            .filter((c) => bajas.has(c))
            .map((c) => ({ clave: c, titulo: `Nº ${num(c)} · BAJA`, lista: activos.filter((g) => g.creado_por === c), emp: c, baja: true })),
          ...(puedeGestionar
            ? [{ clave: 'archivados', titulo: 'Archivados (solo administradores)', lista: visibles.filter((g) => g.archivado), archivados: true }]
            : []),
          // «Mis listados» sale siempre (aunque esté vacío), para que se vea dónde van los tuyos.
        ].filter((x) => x.lista.length || (x.clave === 'yo' && !op && !tb))
  const alternarGrupo = (c: string) =>
    setCerrados((x) => {
      const n = new Set(x)
      if (n.has(c)) n.delete(c)
      else n.add(c)
      return n
    })

  return (
    <div className="flex h-full min-h-[600px] gap-1.5 text-[14px]">
      {/* Listados guardados */}
      <div className="flex w-[250px] flex-none flex-col border border-[var(--gw-border)] bg-white">
        {/* Arriba del todo, para que se vea siempre (Luis no lo encontraba abajo). */}
        <button type="button" className="gw-boton-barra h-[36px] flex-none text-[15px] font-bold text-[#1d3a8a]" onClick={() => nuevo()}>
          ➕ Listado nuevo
        </button>
        <div className="flex items-center gap-1 border-b border-[var(--gw-border)] bg-[var(--gw-face)] px-2 py-1">
          <b className="flex-1">Listados guardados</b>
          <input
            className="h-[20px] w-[64px] border border-[var(--gw-border)] bg-white px-1 text-[12px]"
            placeholder="Ver Nº…"
            title="Solo para ver los listados de OTRO vendedor: escribe su nº. Los tuyos ya salen arriba, en «Mis listados»"
            value={operario}
            onChange={(e) => setOperario(e.target.value)}
          />
          {operario && (
            <button type="button" className="h-[20px] px-1 text-[13px] font-bold text-[#c42b1c]" title="Quitar el número y volver a verlos todos" onClick={() => setOperario('')}>
              ✖
            </button>
          )}
          <select className="h-[20px] border border-[var(--gw-border)] bg-white text-[12px]" value={agruparPor} onChange={(e) => setAgruparPor(e.target.value as 'operario' | 'tipo')} title="Cómo agrupar la lista">
            <option value="operario">Por vendedor</option>
            <option value="tipo">Por tipo</option>
          </select>
        </div>
        <div className="border-b border-[var(--gw-border)] px-2 py-1">
          <input
            className="h-[22px] w-full border border-[var(--gw-border)] bg-white px-1 text-[13px]"
            placeholder="🔍 Buscar: código, nombre, para qué sirve…"
            title="Escribe el código (p. ej. CLI-0012) o parte del nombre, de «para qué sirve» o de lo que incluye"
            value={buscarListado}
            onChange={(e) => setBuscarListado(e.target.value)}
          />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {gruposGuardados.length === 0 && <div className="p-2 text-[13px] text-[#777]">{op ? `El vendedor ${op} no tiene listados guardados.` : 'Todavía no hay ninguno: haz uno y pulsa Guardar.'}</div>}
          {gruposGuardados.map((gr) => (
            <div key={gr.clave}>
              <div className={`flex w-full items-center ${gr.baja ? 'bg-[#fdeaea]' : 'bg-[#eef1f5]'}`}>
                <button
                  type="button"
                  className={`flex min-w-0 flex-1 items-center gap-1 px-2 py-0.5 text-left text-[13px] font-bold ${gr.baja ? 'text-[#c42b1c]' : 'text-[#333]'}`}
                  title={gr.baja ? `${operarios[gr.clave] ?? ''}: ya no trabaja aquí. Un administrador decide qué hacer con sus listados (⚙).` : (operarios[gr.clave] ?? (gr.clave === 'yo' && yo ? operarios[yo] : undefined))}
                  onClick={() => alternarGrupo(gr.clave)}
                >
                  <span className="w-[12px]">{cerrados.has(gr.clave) ? '▸' : '▾'}</span>
                  <span className="flex-1 truncate">{gr.titulo}</span>
                  <span className="text-[11px] font-normal text-[#777]">{gr.lista.length}</span>
                </button>
                {puedeGestionar && (gr.emp || gr.archivados) && gr.lista.length > 0 && (
                  <button
                    type="button"
                    className="px-1.5 text-[13px]"
                    title="Qué hacer con estos listados: pasarlos a otro vendedor, a «De serie», archivarlos o borrarlos"
                    onClick={() => setGestionar(gr.clave)}
                  >
                    ⚙
                  </button>
                )}
              </div>
              {!cerrados.has(gr.clave) && gr.clave === 'yo' && !gr.lista.length && (
                <div className="px-3 py-1 text-[12px] text-[#777]">Aún no has guardado ninguno: haz un listado y pulsa «Guardar». Saldrá aquí.</div>
              )}
              {!cerrados.has(gr.clave) &&
                gr.lista.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => setParams({ id: String(g.id) })}
                    className={`flex w-full items-baseline gap-1 px-3 py-[3px] text-left ${g.id === id ? 'bg-[#0078d7] text-white' : 'hover:bg-[#e5f1fb]'}`}
                  >
                    <span
                      className="min-w-0 flex-1 truncate"
                      title={[
                        `${g.codigo ?? ''} · ${g.nombre}`,
                        g.descripcion ? `Para qué sirve: ${g.descripcion}` : '',
                        resumenDe(g.fuente, g.definicion),
                        g.usos ? `Usado ${g.usos} ${g.usos === 1 ? 'vez' : 'veces'} · último: ${new Date(g.ultimo_uso ?? '').toLocaleDateString('es-ES')}` : 'Aún no se ha usado',
                      ]
                        .filter(Boolean)
                        .join('\n')}
                    >
                      <b className={`mr-1 text-[11px] ${g.id === id ? 'text-white' : 'text-[#1d3a8a]'}`}>{g.codigo}</b>
                      {g.nombre}
                    </span>
                    <span className={`flex-none text-[11px] ${g.id === id ? 'text-white/80' : 'text-[#888]'}`}>
                      {agruparPor === 'operario' ? nombreFuente(g.fuente) : g.creado_por ? `Nº ${num(g.creado_por)}` : 'serie'}
                    </span>
                  </button>
                ))}
            </div>
          ))}
        </div>
      </div>

      {/* Definición y resultado */}
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex flex-wrap items-end gap-2">
          <GwField label="Nombre del listado" className="w-[300px]">
            <GwInput value={nombre} placeholder="(sin guardar)" onChange={(e) => setNombre(e.target.value)} />
          </GwField>
          <GwField label="Qué listar" className="w-[260px]">
            <GwSelect value={fuente} onChange={(e) => nuevo(e.target.value)}>
              {FUENTES.map((x) => (
                <option key={x.clave} value={x.clave}>
                  {x.titulo}
                </option>
              ))}
            </GwSelect>
          </GwField>
          <span className="flex-1" />
          <button type="button" className="gw-btn h-[30px] px-3 font-bold" disabled={cargando} onClick={ejecutar} title="F9">
            ▶ {cargando ? 'Buscando…' : 'Ver listado'}
          </button>
          <button type="button" className="gw-btn h-[30px]" disabled={!filas} onClick={() => setCompleta(true)} title="Ver el listado a pantalla completa">
            ⛶ Pantalla
          </button>
          <button type="button" className="gw-btn h-[30px]" disabled={!filas?.length} onClick={() => window.print()}>
            🖨️ Imprimir / PDF
          </button>
          <button type="button" className="gw-btn h-[30px]" disabled={!filas?.length} onClick={excel}>
            📊 Excel
          </button>
        </div>
        {/* Segunda fila: guardar a la izquierda y Operativa a la derecha, debajo de Excel (Luis, 30/10/2026). */}
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="gw-btn h-[30px] font-bold text-[#1d3a8a]" onClick={() => nuevo()} title="Empieza un listado nuevo (igual que «➕ Listado nuevo» de la izquierda)">
            ➕ Crear listado
          </button>
          <button type="button" className="gw-btn h-[30px]" onClick={() => guardar(false)}>
            💾 Guardar
          </button>
          <button type="button" className="gw-btn h-[30px]" onClick={() => guardar(true)}>
            Guardar como…
          </button>
          <button type="button" className="gw-btn h-[30px]" disabled={!id} onClick={eliminar}>
            🗑️
          </button>
          <button type="button" className="gw-btn h-[30px]" onClick={() => navigate('/')}>
            Salir
          </button>
          <span className="flex-1" />
          <button type="button" className="gw-btn h-[30px] w-[95px]" onClick={() => setAyuda(true)}>
            Operativa
          </button>
        </div>

        {/* Identificación del listado: código, para qué sirve y uso (Luis, 30/10/2026). */}
        <div className="flex flex-wrap items-center gap-2 border border-[#c9d7ee] bg-[#eef3fb] px-2 py-1 text-[13px]">
          <span className="rounded-[3px] bg-[#1d3a8a] px-2 py-[1px] font-bold text-white" title="Código del listado: no cambia nunca, sale impreso">
            {actual?.codigo ?? 'Sin código (se pone al guardar)'}
          </span>
          <span className="text-[#1d3a8a]">Para qué sirve:</span>
          <GwInput
            className="min-w-[220px] flex-1"
            placeholder="p. ej. «Los lunes, para llamar a los que deben»"
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            title="Se guarda al pulsar Guardar"
          />
          {actual && (
            <span className="text-[12px] text-[#555]">
              {actual.creado_por ? `Creado por Nº ${numDe(actual.creado_por)}` : 'De serie'} ·{' '}
              {actual.usos ? `usado ${actual.usos} ${actual.usos === 1 ? 'vez' : 'veces'}, último ${new Date(actual.ultimo_uso ?? '').toLocaleDateString('es-ES')}` : 'aún no se ha usado'}
            </span>
          )}
        </div>
        <div className="truncate text-[12px] text-[#555]" title={resumenDe(fuente, def)}>
          Qué incluye: {resumenDe(fuente, def)}
        </div>

        {gestionar && (
          <GestionarListados
            titulo={gruposGuardados.find((x) => x.clave === gestionar)?.titulo ?? ''}
            emp={gestionar === 'archivados' ? null : gestionar}
            lista={gruposGuardados.find((x) => x.clave === gestionar)?.lista ?? []}
            archivados={gestionar === 'archivados'}
            empleados={Object.keys(operarios)
              .filter((c) => !bajas.has(c) && c !== gestionar)
              .map((c) => ({ codigo: c, texto: `Nº ${numDe(c)} · ${operarios[c]}` }))}
            onAccion={(accion, destino, ids, empLista) => void accionVendedor(empLista, accion, destino, ids)}
            onClose={() => setGestionar(null)}
          />
        )}

        {ayuda && (
          <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/25 pt-16" onKeyDown={(e) => e.key === 'Escape' && setAyuda(false)}>
            <GwWindow title="Generador de listados · Operativa" onClose={() => setAyuda(false)} className="w-[720px] max-w-[95vw]">
              <GwOperativa
                  bloques={[
                    {
                      titulo: 'Hacer un listado',
                      pasos: [
                        'Elige «Qué listar» (clientes, artículos, ventas…).',
                        'Columnas: marca las que quieras y ordénalas con ↑ ↓.',
                        'Filtros: «Añadir filtro», elige columna, condición y valor.',
                        'Pulsa ▶ Ver listado (o F9).',
                        'Imprimir / PDF o Excel para sacarlo; 💾 Guardar para tenerlo a mano.',
                      ],
                    },
                    {
                      titulo: 'Bueno es saber',
                      notas: [
                        'Agrupar y sumar: por ejemplo, agrupar por Familia y sumar Base = ventas por familia.',
                        'Los guardados salen a la izquierda, agrupados por nº de vendedor (o por tipo); pulsa uno para abrirlo.',
                        'Tus listados salen solos arriba, en «Mis listados · Nº (tu número)»: no hace falta escribir nada.',
                      'Cada listado tiene un código que no cambia (CLI-0012, ART-0007, COM-0003…): sale en la lista, al imprimir, en el PDF y en el Excel. Búscalo en «🔍 Buscar».',
                      '«Para qué sirve»: una frase para acordarte; se guarda con Guardar. Debajo, «Qué incluye» lo resume solo.',
                      'Al imprimir o en PDF sale arriba el código, el nombre, qué incluye, quién lo creó y quién lo saca (con fecha y hora), y abajo «Página X de Y».',
                      'Vendedor de baja: su grupo sale al final en rojo («Nº … · BAJA»). Un administrador pulsa ⚙ y elige: pasarlos a otro vendedor, a «De serie», archivarlos o borrarlos.',
                        'Ver Nº…: solo para ver los listados de OTRO vendedor; escribe su número. La ✖ de al lado lo borra y vuelven a salir todos.',
                        'Pestaña «Todos los campos de la ficha»: cualquier campo, con buscador.',
                        '⛶ Pantalla: el listado a pantalla completa. Esc o «Cerrar pantalla» para volver.',
                        'Acceso directo: botón «📋 Listados» en la barra de título de cada pantalla (abre el generador con lo de esa pantalla), icono «Listados» de la barra de accesos y «Generador de listados» en cada menú Listados.',
                        'Compartir: elige qué grupos de empleados ven el listado.',
                        'Cada uno solo ve los datos que su permiso le deja ver.',
                      ],
                    },
                  ]}
                />
            </GwWindow>
          </div>
        )}
        <GwTabs
          rows={[
            [
              { key: 'columnas', label: `Columnas (${def.columnas.length})` },
              { key: 'filtros', label: `Filtros (${def.filtros.length})` },
              { key: 'agrupar', label: def.agrupar.length ? `Agrupar (${def.agrupar.length})` : 'Agrupar' },
              { key: 'orden', label: 'Orden' },
              { key: 'compartir', label: 'Compartir' },
              // Luis (30/10/2026): aquí, en el sitio de «Operativa» (que pasa a la barra de arriba).
              { key: 'todos', label: `Todos los campos de la ficha (${extras.length})` },
            ],
          ]}
          active={tab}
          // «Todos los campos de la ficha» se abre y se cierra como un botón: pulsarla otra vez vuelve a Columnas.
          onChange={(k) => setTab(k === 'todos' && tab === 'todos' ? 'columnas' : k)}
        >
          <div className="h-[200px] overflow-y-auto p-2" onKeyDown={(e) => e.key === 'F9' && (e.preventDefault(), ejecutar())}>
            {tab === 'columnas' && <Columnas principales={F.columnas} extras={extras} sel={def.columnas} onChange={(c) => setD({ columnas: c })} />}
            {tab === 'todos' && <Columnas principales={F.columnas} extras={extras} sel={def.columnas} onChange={(c) => setD({ columnas: c })} soloTodos />}
            {tab === 'filtros' && <Filtros fuente={todas} filtros={def.filtros} onChange={(f) => setD({ filtros: f })} />}
            {tab === 'agrupar' && <Agrupar fuente={todas} def={def} onChange={setD} />}
            {tab === 'orden' && <Orden fuente={todas} def={def} onChange={(o) => setD({ orden: o })} />}
            {tab === 'compartir' && (
              <div className="flex flex-col gap-1">
                <label className="flex items-center gap-1.5 font-bold">
                  <input type="checkbox" checked={compartir == null} onChange={(e) => setCompartir(e.target.checked ? null : [])} />
                  Lo pueden ver todos los grupos
                </label>
                {compartir != null &&
                  grupos.map((g) => (
                    <label key={g.id} className="ml-5 flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        checked={compartir.includes(g.id)}
                        onChange={(e) => setCompartir(e.target.checked ? [...compartir, g.id] : compartir.filter((x) => x !== g.id))}
                      />
                      {g.nombre}
                    </label>
                  ))}
                <span className="text-[13px] text-[#555]">Tú y los administradores lo veis siempre. Se aplica al pulsar Guardar.</span>
              </div>
            )}
          </div>
        </GwTabs>

        {mensaje && <div className={`px-2 py-1 ${mensaje.error ? 'bg-[#fdeaea] text-[#a00]' : 'bg-[#eef8ee] text-[#185a18]'}`}>{mensaje.texto}</div>}

        {/* Resultado (lo único que sale al imprimir: .informe-impresion) */}
        <div
          className={`informe-impresion flex min-h-0 flex-col border border-[var(--gw-border)] bg-white ${completa ? 'fixed inset-0 z-[150] shadow-2xl' : 'flex-1'}`}
        >
          <div className="flex items-center gap-3 border-b border-[var(--gw-border)] px-2 py-1">
            <b>
              {actual?.codigo ? `${actual.codigo} · ` : ''}
              {nombre || F.titulo}
            </b>
            <span className="text-[13px] text-[#555]">
              {filas ? `${filas.length} filas${truncado ? ' (hay más: afina los filtros; se muestran 5.000)' : ''}` : 'Pulsa ▶ Ver listado'}
            </span>
            <span className="flex-1" />
            <span className="text-[12px] text-[#777]">{new Date().toLocaleString('es-ES')}</span>
            {completa && (
              <span className="flex gap-1 print:hidden">
                <button type="button" className="gw-btn" onClick={() => window.print()}>
                  🖨️ Imprimir / PDF
                </button>
                <button type="button" className="gw-btn" onClick={excel}>
                  📊 Excel
                </button>
                <button type="button" className="gw-btn font-bold" onClick={() => setCompleta(false)} title="Esc">
                  ✖ Cerrar pantalla
                </button>
              </span>
            )}
          </div>
          {/* Solo al imprimir / PDF: quién, qué y cuándo (y «Página X de Y» al pie). */}
          <div className="hidden border-b border-[#999] px-1 pb-1 text-[10pt] print:block">
            {identificacion().map(([k, v]) => (
              <div key={k}>
                <b>{k}:</b> {v}
              </div>
            ))}
          </div>
          <style media="print">{`@page { @bottom-right { content: "Página " counter(page) " de " counter(pages); font: 9pt Arial; } @bottom-left { content: "${(actual?.codigo ?? '').replace(/"/g, '')} ${(nombre || F.titulo).replace(/"/g, '')}"; font: 9pt Arial; } }`}</style>
          <div className="informe-scroll min-h-[220px] flex-1 overflow-auto">
            {filas && (
              <table className="gw-grid">
                <thead className="sticky top-0">
                  <tr>
                    {columnasResultado.map((c) => (
                      <th key={c.clave} className={c.tipo === 'num' ? 'text-right!' : ''}>
                        {c.etiqueta}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filas.map((r, i) => (
                    <tr key={i}>
                      {columnasResultado.map((c) => (
                        <td key={c.clave} className={c.tipo === 'num' ? 'text-right' : ''}>
                          {mostrar(r[c.clave], c)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
                {filas.length > 0 && Object.keys(totales).length > 0 && (
                  <tfoot className="sticky bottom-0 bg-[#f0f0f0] font-bold">
                    <tr>
                      {columnasResultado.map((c, i) => (
                        <td key={c.clave} className={c.tipo === 'num' ? 'text-right' : ''}>
                          {c.clave in totales ? formatGw(totales[c.clave], c.dec ?? 2) : i === 0 ? 'TOTAL' : ''}
                        </td>
                      ))}
                    </tr>
                  </tfoot>
                )}
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function Columnas({
  principales,
  extras,
  sel,
  onChange,
  soloTodos = false,
}: {
  principales: ColumnaFuente[]
  extras: ColumnaFuente[]
  sel: string[]
  onChange: (c: string[]) => void
  /** Pestaña «Todos los campos de la ficha»: todos los campos con buscador, en vez de los principales. */
  soloTodos?: boolean
}) {
  const [buscar, setBuscar] = useState('')
  const fuente = [...principales, ...extras]
  const mover = (i: number, d: number) => {
    const j = i + d
    if (j < 0 || j >= sel.length) return
    const n = [...sel]
    ;[n[i], n[j]] = [n[j], n[i]]
    onChange(n)
  }
  const casilla = (c: ColumnaFuente) => (
    <label key={c.clave} className="flex items-center gap-1.5 truncate" title={c.clave}>
      <input type="checkbox" checked={sel.includes(c.clave)} onChange={(e) => onChange(e.target.checked ? [...sel, c.clave] : sel.filter((x) => x !== c.clave))} />
      {c.etiqueta}
    </label>
  )
  const t = buscar.trim().toLowerCase()
  const encontrados = extras.filter((c) => !t || c.etiqueta.toLowerCase().includes(t) || c.clave.includes(t))
  return (
    <div className="grid grid-cols-2 gap-3">
      <div>
        {soloTodos ? (
          <>
            <div className="mb-1 flex items-center gap-2">
              <span className="gw-label">Todos los campos de la ficha (marca para añadir):</span>
              <GwInput className="w-[200px]" placeholder="buscar campo…" value={buscar} onChange={(e) => setBuscar(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-x-3">{encontrados.map(casilla)}</div>
          </>
        ) : (
          <>
            <div className="gw-label mb-1">Principales (marca para añadir):</div>
            <div className="grid grid-cols-2 gap-x-3">{principales.map(casilla)}</div>
            <div className="mt-2 text-[12px] text-[#777]">Más campos en la pestaña «Todos los campos de la ficha».</div>
          </>
        )}
      </div>
      <div>
        <div className="gw-label mb-1">En el listado, en este orden:</div>
        {sel.map((c, i) => (
          <div key={c} className="flex items-center gap-1 border-b border-[#eee] py-[1px]">
            <span className="w-[22px] text-right text-[#777]">{i + 1}.</span>
            <span className="flex-1 truncate">{fuente.find((x) => x.clave === c)?.etiqueta ?? c}</span>
            <button type="button" className="gw-btn !h-[20px] !px-1" onClick={() => mover(i, -1)}>
              ↑
            </button>
            <button type="button" className="gw-btn !h-[20px] !px-1" onClick={() => mover(i, 1)}>
              ↓
            </button>
            <button type="button" className="gw-btn !h-[20px] !px-1 text-[#c42b1c]" onClick={() => onChange(sel.filter((x) => x !== c))}>
              ✖
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

function Filtros({ fuente, filtros, onChange }: { fuente: ColumnaFuente[]; filtros: FiltroListado[]; onChange: (f: FiltroListado[]) => void }) {
  const set = (i: number, p: Partial<FiltroListado>) => onChange(filtros.map((f, j) => (j === i ? { ...f, ...p } : f)))
  return (
    <div className="flex flex-col gap-1">
      {filtros.map((f, i) => {
        const c = fuente.find((x) => x.clave === f.col) ?? fuente[0]
        const ops = OPERADORES.filter((o) => o.tipos.includes(c.tipo))
        const op = ops.find((o) => o.op === f.op) ?? ops[0]
        const valor = (v: string | undefined, k: 'valor' | 'valor2') =>
          c.tipo === 'fecha' ? (
            <div className="w-[130px]">
              <GwDate value={v ?? ''} onChange={(x) => set(i, { [k]: x ?? '' })} />
            </div>
          ) : (
            <GwInput className="w-[180px]" value={v ?? ''} onChange={(e) => set(i, { [k]: e.target.value })} />
          )
        return (
          <div key={i} className="flex items-center gap-1.5">
            <GwSelect className="w-[220px]" value={c.clave} onChange={(e) => {
                const nc = fuente.find((x) => x.clave === e.target.value) ?? fuente[0]
                set(i, { col: nc.clave, op: OPERADORES.find((o) => o.tipos.includes(nc.tipo))!.op, valor: '', valor2: '' })
              }}>
              {fuente.map((x) => (
                <option key={x.clave} value={x.clave}>
                  {x.etiqueta}
                </option>
              ))}
            </GwSelect>
            <GwSelect className="w-[230px]" value={op.op} onChange={(e) => set(i, { op: e.target.value })}>
              {ops.map((o) => (
                <option key={o.op} value={o.op}>
                  {o.texto}
                </option>
              ))}
            </GwSelect>
            {op.valores >= 1 && valor(f.valor, 'valor')}
            {op.valores === 2 && <span>y</span>}
            {op.valores === 2 && valor(f.valor2, 'valor2')}
            <button type="button" className="gw-btn !h-[22px] text-[#c42b1c]" onClick={() => onChange(filtros.filter((_, j) => j !== i))}>
              ✖
            </button>
          </div>
        )
      })}
      <button
        type="button"
        className="gw-btn w-fit"
        onClick={() => {
          const c = fuente[0]
          onChange([...filtros, { col: c.clave, op: OPERADORES.find((o) => o.tipos.includes(c.tipo))!.op, valor: '' }])
        }}
      >
        ➕ Añadir filtro
      </button>
    </div>
  )
}

function Agrupar({ fuente, def, onChange }: { fuente: ColumnaFuente[]; def: DefinicionListado; onChange: (p: Partial<DefinicionListado>) => void }) {
  const nums = fuente.filter((c) => c.tipo === 'num' && !['numero', 'n_factura', 'anio', 'tarifa'].includes(c.clave))
  return (
    <div className="grid grid-cols-2 gap-4">
      <div>
        <div className="gw-label mb-1">Agrupar por (hasta 3; vacío = sin agrupar):</div>
        {[0, 1, 2].map((i) => (
          <GwSelect
            key={i}
            className="mb-1 w-[260px]"
            value={def.agrupar[i] ?? ''}
            disabled={i > def.agrupar.length}
            onChange={(e) => {
              const a = [...def.agrupar]
              if (e.target.value) a[i] = e.target.value
              else a.splice(i)
              onChange({ agrupar: a.filter(Boolean) })
            }}
          >
            <option value="">—</option>
            {fuente
              .filter((c) => c.tipo !== 'num' || ['anio', 'tarifa'].includes(c.clave))
              .map((c) => (
                <option key={c.clave} value={c.clave}>
                  {c.etiqueta}
                </option>
              ))}
          </GwSelect>
        ))}
      </div>
      <div>
        <div className="gw-label mb-1">Sumar (al agrupar):</div>
        <div className="grid grid-cols-2 gap-x-3">
          {nums.map((c) => (
            <label key={c.clave} className={`flex items-center gap-1.5 ${def.agrupar.length ? '' : 'opacity-50'}`}>
              <input
                type="checkbox"
                disabled={!def.agrupar.length}
                checked={def.sumar.includes(c.clave)}
                onChange={(e) => onChange({ sumar: e.target.checked ? [...def.sumar, c.clave] : def.sumar.filter((x) => x !== c.clave) })}
              />
              {c.etiqueta}
            </label>
          ))}
        </div>
      </div>
    </div>
  )
}

function Orden({ fuente, def, onChange }: { fuente: ColumnaFuente[]; def: DefinicionListado; onChange: (o: DefinicionListado['orden']) => void }) {
  const opciones = def.agrupar.length
    ? [...def.agrupar.map((c) => fuente.find((x) => x.clave === c)!), { clave: 'registros', etiqueta: 'Registros', tipo: 'num' as const }, ...def.sumar.map((c) => fuente.find((x) => x.clave === c)!)]
    : fuente
  return (
    <div className="flex flex-col gap-1">
      <div className="gw-label">Ordenar por (hasta 3):</div>
      {[0, 1, 2].map((i) => {
        const o = def.orden[i]
        return (
          <div key={i} className="flex items-center gap-1.5">
            <GwSelect
              className="w-[260px]"
              value={o?.col ?? ''}
              disabled={i > def.orden.length}
              onChange={(e) => {
                const n = [...def.orden]
                if (e.target.value) n[i] = { col: e.target.value, desc: o?.desc ?? false }
                else n.splice(i)
                onChange(n)
              }}
            >
              <option value="">—</option>
              {opciones.map((c) => (
                <option key={c.clave} value={c.clave}>
                  {c.etiqueta}
                </option>
              ))}
            </GwSelect>
            {o && (
              <GwSelect className="w-[150px]" value={o.desc ? 'desc' : 'asc'} onChange={(e) => onChange(def.orden.map((x, j) => (j === i ? { ...x, desc: e.target.value === 'desc' } : x)))}>
                <option value="asc">De menor a mayor</option>
                <option value="desc">De mayor a menor</option>
              </GwSelect>
            )}
          </div>
        )
      })}
    </div>
  )
}

/** Nombre legible de un campo de la base de datos: «fecha_ultima_venta» → «Fecha ultima venta». */
function etiquetaCampo(c: string) {
  const t = c.replace(/_codigo$/, '').replace(/_pct$/, ' %').replace(/_/g, ' ').trim()
  return t.charAt(0).toUpperCase() + t.slice(1)
}

/** Tipo de columna según el tipo de la base de datos. */
function tipoCampo(t: string): ColumnaFuente['tipo'] {
  if (['numeric', 'integer', 'bigint', 'smallint', 'double precision', 'real'].includes(t)) return 'num'
  if (t === 'date' || t.startsWith('timestamp')) return 'fecha'
  if (t === 'boolean') return 'bool'
  return 'texto'
}

/** ⚙ de un grupo: qué hacer con los listados de un vendedor (p. ej. cuando deja la empresa). Solo administradores. */
function GestionarListados({
  titulo,
  emp,
  lista,
  archivados,
  empleados,
  onAccion,
  onClose,
}: {
  titulo: string
  emp: string | null
  lista: Guardado[]
  archivados: boolean
  empleados: { codigo: string; texto: string }[]
  onAccion: (accion: string, destino: string | null, ids: number[] | null, emp: string | null) => void
  onClose: () => void
}) {
  const [marcados, setMarcados] = useState<Set<number>>(() => new Set(lista.map((g) => g.id)))
  const [accion, setAccion] = useState(archivados ? 'recuperar' : 'reasignar')
  const [destino, setDestino] = useState('')
  const ids = lista.filter((g) => marcados.has(g.id))
  const aplicar = () => {
    if (!ids.length) return
    if (accion === 'reasignar' && !destino) return alert('Elige a qué vendedor se pasan.')
    if (accion === 'borrar' && !confirm(`¿Borrar ${ids.length} listado(s) para siempre? No se puede deshacer.`)) return
    // En «Archivados» puede haber listados de varios vendedores: se aplica a cada uno con su dueño.
    const porDueno = new Map<string | null, number[]>()
    for (const g of ids) porDueno.set(archivados ? g.creado_por : emp, [...(porDueno.get(archivados ? g.creado_por : emp) ?? []), g.id])
    for (const [dueno, l] of porDueno) onAccion(accion, accion === 'reasignar' ? destino : null, l, dueno)
  }
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/25 pt-16" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <GwWindow title={`Listados de ${titulo}`} onClose={onClose} className="w-[620px] max-w-[95vw]">
        <div className="flex flex-col gap-2 text-[13px]">
          <div className="max-h-[40vh] overflow-auto border border-[var(--gw-border)] bg-white p-1">
            {lista.map((g) => (
              <label key={g.id} className="flex items-center gap-2 py-[2px]">
                <input
                  type="checkbox"
                  checked={marcados.has(g.id)}
                  onChange={(e) =>
                    setMarcados((m) => {
                      const n = new Set(m)
                      if (e.target.checked) n.add(g.id)
                      else n.delete(g.id)
                      return n
                    })
                  }
                />
                <b className="w-[70px] text-[#1d3a8a]">{g.codigo}</b>
                <span className="flex-1 truncate">{g.nombre}</span>
              </label>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-bold">Qué hacer con los {ids.length} marcados:</span>
            <GwSelect className="w-[230px]" value={accion} onChange={(e) => setAccion(e.target.value)}>
              {archivados && <option value="recuperar">Recuperarlos (volver a verlos)</option>}
              <option value="reasignar">Pasarlos a otro vendedor</option>
              <option value="serie">Pasarlos a «De serie» (para todos)</option>
              {!archivados && <option value="archivar">Archivarlos (no se ven, se recuperan)</option>}
              <option value="borrar">Borrarlos para siempre</option>
            </GwSelect>
            {accion === 'reasignar' && (
              <GwSelect className="w-[200px]" value={destino} onChange={(e) => setDestino(e.target.value)}>
                <option value="">— elige vendedor —</option>
                {empleados.map((e) => (
                  <option key={e.codigo} value={e.codigo}>
                    {e.texto}
                  </option>
                ))}
              </GwSelect>
            )}
          </div>
          <div className="text-[12px] text-[#666]">Queda apuntado en la Auditoría. El código de cada listado no cambia.</div>
          <div className="flex justify-end gap-2">
            <button type="button" className="gw-btn" onClick={onClose}>
              Cancelar
            </button>
            <button type="button" className={`gw-btn font-bold ${accion === 'borrar' ? 'text-[#c42b1c]' : ''}`} disabled={!ids.length} onClick={aplicar}>
              Aplicar
            </button>
          </div>
        </div>
      </GwWindow>
    </div>
  )
}

