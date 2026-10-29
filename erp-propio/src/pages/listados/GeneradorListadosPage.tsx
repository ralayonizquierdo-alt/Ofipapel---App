// Utilidades → Generador de listados (Luis, 29/10/2026): una sola pantalla para sacar cualquier
// listado del ERP. Se elige qué listar (fuente), las columnas, los filtros, si se agrupa y qué se
// suma, y el orden; se ve en pantalla, se imprime (o PDF) y se pasa a Excel. Se guarda con nombre
// y se comparte con los grupos de acceso que se quiera.
// La consulta la hace fn_listado_ejecutar en la base de datos (solo columnas de la fuente, sin SQL
// libre) y cada uno ve solo lo que su RLS le deja ver.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { GwDate, GwField, GwInput, GwSelect, GwTabs, formatGw } from '../../components/gw'
import { GwOperativa } from '../../components/gw/GwOperativa'
import { supabase } from '../../lib/supabase'
import { FUENTES, FUENTE_POR_CLAVE, OPERADORES, definicionNueva, type ColumnaFuente, type DefinicionListado, type FiltroListado } from '../../lib/listados/fuentes'

interface Guardado {
  id: number
  nombre: string
  fuente: string
  definicion: DefinicionListado
  grupos: number[] | null
  creado_por: string | null
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
  const [filas, setFilas] = useState<Fila[] | null>(null)
  const [truncado, setTruncado] = useState(false)
  const [cargando, setCargando] = useState(false)
  const [mensaje, setMensaje] = useState<{ texto: string; error?: boolean } | null>(null)
  const [ultimaDef, setUltimaDef] = useState<DefinicionListado | null>(null)
  const [operarios, setOperarios] = useState<Record<string, string>>({})
  const [yo, setYo] = useState<string | null>(null)
  const [agruparPor, setAgruparPor] = useState<'operario' | 'tipo'>('operario')
  const [cerrados, setCerrados] = useState<Set<string>>(new Set())
  const [completa, setCompleta] = useState(false)

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
  const col = useCallback((c: string): ColumnaFuente | undefined => F.columnas.find((x) => x.clave === c), [F])

  const cargarGuardados = useCallback(async () => {
    const { data } = await supabase.from('listado_guardado').select('id, nombre, fuente, definicion, grupos, creado_por').order('nombre')
    setGuardados((data ?? []) as Guardado[])
  }, [])

  useEffect(() => {
    cargarGuardados()
    supabase.rpc('fn_empleado_actual').then(({ data }) => setYo(typeof data === 'string' ? data : null))
    supabase
      .from('empleado')
      .select('codigo, nombre')
      .then(({ data }) => setOperarios(Object.fromEntries(((data ?? []) as { codigo: string; nombre: string }[]).map((e) => [e.codigo, e.nombre]))))
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
      setDef(definicionNueva(FUENTE_POR_CLAVE[fu]))
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
  }

  async function guardar(comoNuevo: boolean) {
    const n = (comoNuevo || !nombre.trim() ? prompt('Nombre del listado:', nombre || F.titulo) : nombre)?.trim()
    if (!n) return
    const fila = { nombre: n, fuente, definicion: def, grupos: compartir, actualizado_en: new Date().toISOString() }
    const r = id && !comoNuevo ? await supabase.from('listado_guardado').update(fila).eq('id', id).select('id').single() : await supabase.from('listado_guardado').insert(fila).select('id').single()
    if (r.error) return setMensaje({ texto: r.error.message, error: true })
    setId((r.data as { id: number }).id)
    setNombre(n)
    setMensaje({ texto: `Listado «${n}» guardado.` })
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
    a.download = `${(nombre || F.titulo).replace(/[^\w\- áéíóúñÁÉÍÓÚÑ]/g, '')}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const setD = (p: Partial<DefinicionListado>) => setDef((x) => ({ ...x, ...p }))
  // Guardados agrupados por operario (los míos primero; los de serie, al final) o por tipo.
  const nombreFuente = (c: string) => FUENTE_POR_CLAVE[c]?.titulo ?? c
  const gruposGuardados: { clave: string; titulo: string; lista: Guardado[] }[] =
    agruparPor === 'tipo'
      ? FUENTES.map((fu) => ({ clave: fu.clave, titulo: fu.titulo, lista: guardados.filter((g) => g.fuente === fu.clave) })).filter((x) => x.lista.length)
      : [
          { clave: 'yo', titulo: 'Mis listados', lista: guardados.filter((g) => g.creado_por && g.creado_por === yo) },
          ...[...new Set(guardados.map((g) => g.creado_por).filter((c): c is string => !!c && c !== yo))]
            .sort((a, b) => (operarios[a] ?? a).localeCompare(operarios[b] ?? b))
            .map((c) => ({ clave: c, titulo: operarios[c] ?? c, lista: guardados.filter((g) => g.creado_por === c) })),
          { clave: 'serie', titulo: 'De serie (para todos)', lista: guardados.filter((g) => !g.creado_por) },
        ].filter((x) => x.lista.length)
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
        <div className="flex items-center gap-1 border-b border-[var(--gw-border)] bg-[var(--gw-face)] px-2 py-1">
          <b className="flex-1">Listados guardados</b>
          <select className="h-[20px] border border-[var(--gw-border)] bg-white text-[12px]" value={agruparPor} onChange={(e) => setAgruparPor(e.target.value as 'operario' | 'tipo')} title="Cómo agrupar la lista">
            <option value="operario">Por operario</option>
            <option value="tipo">Por tipo</option>
          </select>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {gruposGuardados.length === 0 && <div className="p-2 text-[13px] text-[#777]">Todavía no hay ninguno: haz uno y pulsa Guardar.</div>}
          {gruposGuardados.map((gr) => (
            <div key={gr.clave}>
              <button type="button" className="flex w-full items-center gap-1 bg-[#eef1f5] px-2 py-0.5 text-left text-[13px] font-bold text-[#333]" onClick={() => alternarGrupo(gr.clave)}>
                <span className="w-[12px]">{cerrados.has(gr.clave) ? '▸' : '▾'}</span>
                <span className="flex-1 truncate">{gr.titulo}</span>
                <span className="text-[11px] font-normal text-[#777]">{gr.lista.length}</span>
              </button>
              {!cerrados.has(gr.clave) &&
                gr.lista.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => setParams({ id: String(g.id) })}
                    className={`flex w-full items-baseline gap-1 px-3 py-[3px] text-left ${g.id === id ? 'bg-[#0078d7] text-white' : 'hover:bg-[#e5f1fb]'}`}
                  >
                    <span className="min-w-0 flex-1 truncate">{g.nombre}</span>
                    {agruparPor === 'operario' && <span className={`flex-none text-[11px] ${g.id === id ? 'text-white/80' : 'text-[#888]'}`}>{nombreFuente(g.fuente)}</span>}
                  </button>
                ))}
            </div>
          ))}
        </div>
        <button type="button" className="gw-boton-barra h-[34px] flex-none" onClick={() => nuevo()}>
          ➕ Listado nuevo
        </button>
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
        </div>

        <GwTabs
          rows={[
            [
              { key: 'columnas', label: `Columnas (${def.columnas.length})` },
              { key: 'filtros', label: `Filtros (${def.filtros.length})` },
              { key: 'agrupar', label: def.agrupar.length ? `Agrupar y sumar (${def.agrupar.length})` : 'Agrupar y sumar' },
              { key: 'orden', label: 'Orden' },
              { key: 'compartir', label: 'Compartir' },
              { key: 'operativa', label: 'Operativa' },
            ],
          ]}
          active={tab}
          onChange={setTab}
        >
          <div className="h-[200px] overflow-y-auto p-2" onKeyDown={(e) => e.key === 'F9' && (e.preventDefault(), ejecutar())}>
            {tab === 'columnas' && <Columnas fuente={F.columnas} sel={def.columnas} onChange={(c) => setD({ columnas: c })} />}
            {tab === 'filtros' && <Filtros fuente={F.columnas} filtros={def.filtros} onChange={(f) => setD({ filtros: f })} />}
            {tab === 'agrupar' && <Agrupar fuente={F.columnas} def={def} onChange={setD} />}
            {tab === 'orden' && <Orden fuente={F.columnas} def={def} onChange={(o) => setD({ orden: o })} />}
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
            {tab === 'operativa' && (
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
                      'Los guardados salen a la izquierda, agrupados por operario (o por tipo); pulsa uno para abrirlo.',
                      '⛶ Pantalla: el listado a pantalla completa. Esc o «Cerrar pantalla» para volver.',
                      'Acceso directo: icono «Listados» de la barra y «Generador de listados» en cada menú Listados.',
                      'Compartir: elige qué grupos de empleados ven el listado.',
                      'Cada uno solo ve los datos que su permiso le deja ver.',
                    ],
                  },
                ]}
              />
            )}
          </div>
        </GwTabs>

        {mensaje && <div className={`px-2 py-1 ${mensaje.error ? 'bg-[#fdeaea] text-[#a00]' : 'bg-[#eef8ee] text-[#185a18]'}`}>{mensaje.texto}</div>}

        {/* Resultado (lo único que sale al imprimir: .informe-impresion) */}
        <div
          className={`informe-impresion flex min-h-0 flex-col border border-[var(--gw-border)] bg-white ${completa ? 'fixed inset-0 z-[150] shadow-2xl' : 'flex-1'}`}
        >
          <div className="flex items-center gap-3 border-b border-[var(--gw-border)] px-2 py-1">
            <b>{nombre || F.titulo}</b>
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
          <div className="min-h-[220px] flex-1 overflow-auto">
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

function Columnas({ fuente, sel, onChange }: { fuente: ColumnaFuente[]; sel: string[]; onChange: (c: string[]) => void }) {
  const mover = (i: number, d: number) => {
    const j = i + d
    if (j < 0 || j >= sel.length) return
    const n = [...sel]
    ;[n[i], n[j]] = [n[j], n[i]]
    onChange(n)
  }
  return (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <div className="gw-label mb-1">Disponibles (marca para añadir):</div>
        <div className="grid grid-cols-2 gap-x-3">
          {fuente.map((c) => (
            <label key={c.clave} className="flex items-center gap-1.5 truncate">
              <input type="checkbox" checked={sel.includes(c.clave)} onChange={(e) => onChange(e.target.checked ? [...sel, c.clave] : sel.filter((x) => x !== c.clave))} />
              {c.etiqueta}
            </label>
          ))}
        </div>
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
