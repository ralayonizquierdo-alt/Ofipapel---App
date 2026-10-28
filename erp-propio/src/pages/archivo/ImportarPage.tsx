// Archivo → Importar. SIN CAPTURA de GeminisWin: importación de artículos, clientes o
// proveedores desde Excel (.xlsx) o CSV, con plantilla descargable, vista previa, validación
// (campos obligatorios, códigos repetidos en el fichero, números, códigos de familia, marca,
// provincia, forma de pago y tipo de cliente que existan) e inserción o actualización por
// lotes. Con «Solo comprobar» no se escribe nada.
//
// Al actualizar un registro que ya existe, las celdas vacías NO borran el dato que tenga: solo
// se cambian las columnas que traen valor. Sin dependencias: XLSX/CSV con src/lib/hojaCalculo.

import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileDown, FileUp, Play } from 'lucide-react'
import { GwCheck, GwGroup, GwRadio } from '../../components/gw'
import { supabase } from '../../lib/supabase'
import { filasPorTrozos } from '../../lib/todasLasFilas'
import { crearXlsx, descargar, leerHoja, type Tabla } from '../../lib/hojaCalculo'
import { Mensaje } from '../utilidades/comun'

type TipoCampo = 'texto' | 'numero'

interface Campo {
  col: string
  etiqueta: string
  obligatorio?: boolean
  tipo?: TipoCampo
  /** Tabla y columna que debe contener el valor. */
  ref?: { tabla: string; col: string; que: string }
  max?: number
}

interface Entidad {
  tabla: 'articulo' | 'cliente' | 'proveedor'
  nombre: string
  clave: string
  campos: Campo[]
}

const REF = {
  familia: { tabla: 'familia', col: 'codigo', que: 'la familia' },
  marca: { tabla: 'marca', col: 'codigo', que: 'la marca' },
  provincia: { tabla: 'provincia', col: 'codigo', que: 'la provincia' },
  formaPago: { tabla: 'forma_pago', col: 'codigo', que: 'la forma de pago' },
  tipoCliente: { tabla: 'tipo_cliente', col: 'codigo', que: 'el tipo de cliente' },
}

const DIRECCION: Campo[] = [
  { col: 'nif', etiqueta: 'NIF', max: 20 },
  { col: 'direccion', etiqueta: 'Dirección' },
  { col: 'codigo_postal', etiqueta: 'Código Postal', max: 10 },
  { col: 'poblacion', etiqueta: 'Población' },
  { col: 'provincia_codigo', etiqueta: 'Provincia', ref: REF.provincia },
  { col: 'telefono_fijo', etiqueta: 'Teléfono' },
  { col: 'telefono_movil', etiqueta: 'Móvil' },
  { col: 'email', etiqueta: 'E-mail' },
  { col: 'web', etiqueta: 'Web' },
  { col: 'forma_pago_codigo', etiqueta: 'Forma de Pago', ref: REF.formaPago },
]

const ENTIDADES: Entidad[] = [
  {
    tabla: 'articulo',
    nombre: 'Artículos',
    clave: 'codigo_interno',
    campos: [
      { col: 'codigo_interno', etiqueta: 'Código', obligatorio: true, max: 20 },
      { col: 'descripcion', etiqueta: 'Descripción', obligatorio: true },
      { col: 'descripcion_corta', etiqueta: 'Descripción Corta' },
      { col: 'familia_codigo', etiqueta: 'Familia', ref: REF.familia },
      { col: 'marca_codigo', etiqueta: 'Marca', ref: REF.marca },
      { col: 'codigo_barras_principal', etiqueta: 'Código de Barras' },
      { col: 'unidad_medida', etiqueta: 'Unidad de Medida' },
      { col: 'pvp', etiqueta: 'PVP', tipo: 'numero' },
      { col: 'coste_neto', etiqueta: 'Coste Neto', tipo: 'numero' },
      { col: 'igic_pct', etiqueta: 'IGIC %', tipo: 'numero' },
      { col: 'stock_minimo', etiqueta: 'Stock Mínimo', tipo: 'numero' },
      { col: 'observaciones', etiqueta: 'Observaciones' },
    ],
  },
  {
    tabla: 'cliente',
    nombre: 'Clientes',
    clave: 'codigo',
    campos: [
      { col: 'codigo', etiqueta: 'Código', obligatorio: true, max: 10 },
      { col: 'nombre', etiqueta: 'Nombre', obligatorio: true },
      ...DIRECCION,
      { col: 'tipo_cliente_codigo', etiqueta: 'Tipo Cliente', ref: REF.tipoCliente },
      { col: 'descuento_pct', etiqueta: 'Descuento %', tipo: 'numero' },
      { col: 'observaciones', etiqueta: 'Observaciones' },
    ],
  },
  {
    tabla: 'proveedor',
    nombre: 'Proveedores',
    clave: 'codigo',
    campos: [
      { col: 'codigo', etiqueta: 'Código', obligatorio: true, max: 10 },
      { col: 'nombre', etiqueta: 'Nombre', obligatorio: true },
      ...DIRECCION,
      { col: 'observaciones', etiqueta: 'Observaciones' },
    ],
  },
]

const LOTE = 500

/** «Descripción Corta» y «descripcion_corta» casan con la misma columna. */
const normal = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9%]+/g, '')

/** «1.234,56», «1234,56» o «1234.56» → número. */
function numeroEs(t: string): number | null {
  const s = t.trim().replace(/\s|€/g, '')
  if (!s) return null
  const n = s.includes(',') ? Number(s.replace(/\./g, '').replace(',', '.')) : Number(s)
  return Number.isFinite(n) ? n : NaN
}

interface FilaRevisada {
  linea: number
  valores: Record<string, string | number | null>
  errores: string[]
  existe: boolean
}

interface Revision {
  entidad: Entidad
  columnas: Campo[]
  ignoradas: string[]
  filas: FilaRevisada[]
}

async function revisar(entidad: Entidad, tabla: Tabla): Promise<Revision> {
  const [cab, ...datos] = tabla
  if (!cab) throw new Error('El fichero está vacío')
  const indice = new Map<string, number>()
  const ignoradas: string[] = []
  cab.forEach((h, i) => {
    const c = entidad.campos.find((x) => normal(x.etiqueta) === normal(h) || normal(x.col) === normal(h))
    if (c && !indice.has(c.col)) indice.set(c.col, i)
    else if (h.trim()) ignoradas.push(h.trim())
  })
  const faltan = entidad.campos.filter((c) => c.obligatorio && !indice.has(c.col))
  if (faltan.length) throw new Error(`Faltan columnas obligatorias: ${faltan.map((c) => c.etiqueta).join(', ')}. Descargue la plantilla.`)
  const columnas = entidad.campos.filter((c) => indice.has(c.col))

  const filas: FilaRevisada[] = datos.map((f, n) => {
    const valores: FilaRevisada['valores'] = {}
    const errores: string[] = []
    for (const c of columnas) {
      const crudo = (f[indice.get(c.col)!] ?? '').trim()
      if (!crudo) {
        if (c.obligatorio) errores.push(`${c.etiqueta} vacío`)
        valores[c.col] = null
        continue
      }
      if (c.tipo === 'numero') {
        const v = numeroEs(crudo)
        if (v == null || Number.isNaN(v)) errores.push(`${c.etiqueta}: «${crudo}» no es un número`)
        valores[c.col] = v == null || Number.isNaN(v) ? null : v
      } else {
        const v = c.col === entidad.clave || c.ref ? crudo.toUpperCase() : crudo
        if (c.max && v.length > c.max) errores.push(`${c.etiqueta}: más de ${c.max} caracteres`)
        valores[c.col] = v
      }
    }
    return { linea: n + 2, valores, errores, existe: false }
  })

  // Códigos repetidos dentro del fichero.
  const vistos = new Map<string, number>()
  for (const f of filas) {
    const k = String(f.valores[entidad.clave] ?? '')
    if (!k) continue
    if (vistos.has(k)) f.errores.push(`Código ${k} repetido (también en la línea ${vistos.get(k)})`)
    else vistos.set(k, f.linea)
  }

  // Códigos de otras tablas que no existen.
  for (const c of columnas.filter((x) => x.ref)) {
    const valores = [...new Set(filas.map((f) => f.valores[c.col]).filter((v): v is string => typeof v === 'string'))]
    if (!valores.length) continue
    const { data, error } = await filasPorTrozos<Record<string, string>>(valores, (t) => supabase.from(c.ref!.tabla).select(c.ref!.col).in(c.ref!.col, t).order(c.ref!.col))
    if (error) throw new Error(error)
    const hay = new Set(data.map((r) => r[c.ref!.col]))
    for (const f of filas) {
      const v = f.valores[c.col]
      if (typeof v === 'string' && !hay.has(v)) f.errores.push(`No existe ${c.ref!.que} ${v}`)
    }
  }

  // ¿Alta o modificación?
  const codigos = [...vistos.keys()]
  if (codigos.length) {
    const { data, error } = await filasPorTrozos<Record<string, string>>(codigos, (t) => supabase.from(entidad.tabla).select(entidad.clave).in(entidad.clave, t).order(entidad.clave))
    if (error) throw new Error(error)
    const existen = new Set(data.map((r) => r[entidad.clave]))
    for (const f of filas) f.existe = existen.has(String(f.valores[entidad.clave] ?? ''))
  }
  return { entidad, columnas, ignoradas, filas }
}

export function ImportarPage() {
  const navigate = useNavigate()
  const [tabla, setTabla] = useState<Entidad['tabla']>('articulo')
  const entidad = ENTIDADES.find((e) => e.tabla === tabla)!
  const [fichero, setFichero] = useState<File | null>(null)
  const [revision, setRevision] = useState<Revision | null>(null)
  const [soloComprobar, setSoloComprobar] = useState(true)
  const [soloAltas, setSoloAltas] = useState(false)
  const [verSoloErrores, setVerSoloErrores] = useState(false)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [mensaje, setMensaje] = useState<{ texto: string; error?: boolean } | null>(null)

  const resumen = useMemo(() => {
    if (!revision) return null
    const err = revision.filas.filter((f) => f.errores.length).length
    const ok = revision.filas.filter((f) => !f.errores.length)
    return { total: revision.filas.length, err, altas: ok.filter((f) => !f.existe).length, mods: ok.filter((f) => f.existe).length }
  }, [revision])

  async function plantilla() {
    const blob = await crearXlsx(
      entidad.nombre,
      [entidad.campos.map((c) => c.etiqueta)],
      entidad.campos.map((c) => Math.max(12, c.etiqueta.length + 4)),
    )
    descargar(blob, `plantilla_${entidad.tabla}.xlsx`)
  }

  async function comprobar(f: File | null = fichero) {
    if (!f) return setMensaje({ texto: 'Elija primero un fichero .xlsx o .csv.', error: true })
    setOcupado('Comprobando…')
    setMensaje(null)
    try {
      const r = await revisar(entidad, await leerHoja(f))
      setRevision(r)
      const malas = r.filas.filter((x) => x.errores.length).length
      setMensaje({
        texto: `${r.filas.length} línea(s) leídas: ${malas ? `${malas} con errores (no se importarán)` : 'sin errores'}.${r.ignoradas.length ? ` Columnas que no se usan: ${r.ignoradas.join(', ')}.` : ''}`,
        error: malas > 0,
      })
    } catch (e) {
      setRevision(null)
      setMensaje({ texto: e instanceof Error ? e.message : String(e), error: true })
    } finally {
      setOcupado(null)
    }
  }

  async function importar() {
    if (!revision || !resumen) return
    if (soloComprobar) return comprobar()
    const validas = revision.filas.filter((f) => !f.errores.length && !(soloAltas && f.existe))
    if (!validas.length) return setMensaje({ texto: 'No hay líneas válidas que importar.', error: true })
    const altas = validas.filter((f) => !f.existe).length
    if (!confirm(`¿Importar ${validas.length} ${entidad.nombre.toLowerCase()}? ${altas} alta(s) y ${validas.length - altas} modificación(es).${resumen.err ? ` Se saltan ${resumen.err} línea(s) con errores.` : ''}`)) return
    const { clave } = revision.entidad
    const cols = revision.columnas.map((c) => c.col)
    setMensaje(null)
    try {
      // Las celdas vacías no borran lo que ya hay: se completan con el valor actual del registro.
      setOcupado('Leyendo los registros existentes…')
      const existentes = validas.filter((f) => f.existe).map((f) => String(f.valores[clave]))
      const actuales = new Map<string, Record<string, unknown>>()
      if (existentes.length) {
        const { data, error } = await filasPorTrozos<Record<string, unknown>>(existentes, (t) => supabase.from(revision.entidad.tabla).select(cols.join(', ')).in(clave, t).order(clave))
        if (error) throw new Error(error)
        for (const r of data) actuales.set(String(r[clave]), r)
      }
      const filas = validas.map((f) => {
        const act = actuales.get(String(f.valores[clave]))
        return Object.fromEntries(cols.map((c) => [c, f.valores[c] ?? (act ? (act[c] ?? null) : null)]))
      })
      let hechas = 0
      for (let i = 0; i < filas.length; i += LOTE) {
        setOcupado(`Importando ${Math.min(i + LOTE, filas.length)} de ${filas.length}…`)
        const lote = filas.slice(i, i + LOTE)
        const { error } = await supabase.from(revision.entidad.tabla).upsert(lote, { onConflict: clave, defaultToNull: false })
        if (error) throw new Error(`Lote desde la línea ${validas[i].linea}: ${error.message}. Importadas ${hechas} hasta aquí.`)
        hechas += lote.length
      }
      setMensaje({ texto: `Importación terminada: ${hechas} ${entidad.nombre.toLowerCase()} (${altas} alta(s), ${hechas - altas} modificación(es)).` })
      setRevision(null)
      setFichero(null)
    } catch (e) {
      setMensaje({ texto: e instanceof Error ? e.message : String(e), error: true })
    } finally {
      setOcupado(null)
    }
  }

  const filasVista = revision ? revision.filas.filter((f) => !verSoloErrores || f.errores.length).slice(0, 500) : []

  return (
    <div className="flex w-[1180px] max-w-full flex-col gap-1.5 text-[12px]">
      <div className="flex gap-2">
        <GwGroup title="Qué se importa" className="flex-none">
          <div className="flex gap-4 py-0.5">
            {ENTIDADES.map((e) => (
              <GwRadio
                key={e.tabla}
                name="importar-entidad"
                label={e.nombre}
                checked={tabla === e.tabla}
                onChange={() => {
                  setTabla(e.tabla)
                  setRevision(null)
                  setMensaje(null)
                }}
              />
            ))}
          </div>
        </GwGroup>
        <GwGroup title="Fichero (Excel .xlsx o CSV)" className="min-w-0 flex-1">
          <div className="flex items-center gap-2 py-0.5">
            <button type="button" className="gw-btn" onClick={plantilla} title="Excel con la fila de cabeceras que entiende la importación">
              <FileDown size={14} className="text-[#1d6f42]" /> Plantilla
            </button>
            <label className="gw-btn cursor-pointer">
              <FileUp size={14} /> Elegir fichero…
              <input
                type="file"
                accept=".xlsx,.csv,.txt"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null
                  e.target.value = ''
                  setFichero(f)
                  setRevision(null)
                  if (f) comprobar(f)
                }}
              />
            </label>
            <span className="min-w-0 flex-1 truncate">{fichero ? fichero.name : 'Ningún fichero elegido'}</span>
          </div>
        </GwGroup>
        <GwGroup title="Opciones" className="flex-none">
          <div className="flex flex-col gap-0.5">
            <GwCheck label="Solo comprobar (no escribe nada)" checked={soloComprobar} onChange={setSoloComprobar} />
            <GwCheck label="Solo altas (no modificar los que ya existen)" checked={soloAltas} onChange={setSoloAltas} />
          </div>
        </GwGroup>
      </div>
      <div className="text-[12px] text-[#555]">
        Columnas de {entidad.nombre}: {entidad.campos.map((c) => `${c.etiqueta}${c.obligatorio ? ' *' : ''}`).join(' · ')}. La primera fila son las cabeceras. Al modificar, una celda vacía deja el dato que ya
        tenía.
      </div>
      {mensaje && <Mensaje texto={mensaje.texto} error={mensaje.error} />}
      <div className="h-[360px] overflow-auto border border-[var(--gw-border)] bg-white">
        {revision ? (
          <table className="gw-grid">
            <thead className="sticky top-0 z-10">
              <tr>
                <th className="w-[46px]">Línea</th>
                <th className="w-[70px]">Acción</th>
                {revision.columnas.map((c) => (
                  <th key={c.col} className={c.tipo === 'numero' ? 'text-right!' : ''}>
                    {c.etiqueta}
                  </th>
                ))}
                <th className="min-w-[220px]">Errores</th>
              </tr>
            </thead>
            <tbody>
              {filasVista.map((f) => (
                <tr key={f.linea} className={f.errores.length ? 'bg-[#fdeaea]' : ''}>
                  <td className="text-right">{f.linea}</td>
                  <td>{f.errores.length ? 'Error' : f.existe ? (soloAltas ? 'Se salta' : 'Modificar') : 'Alta'}</td>
                  {revision.columnas.map((c) => (
                    <td key={c.col} className={`max-w-[220px] truncate ${c.tipo === 'numero' ? 'text-right tabular-nums' : ''}`}>
                      {f.valores[c.col] == null ? '' : String(f.valores[c.col]).replace('.', c.tipo === 'numero' ? ',' : '.')}
                    </td>
                  ))}
                  <td className="text-[#a00]">{f.errores.join('; ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="p-4 text-[13px] text-[#666]">
            Descargue la plantilla, rellénela en Excel y elija el fichero: se comprueba al momento y aquí verá la vista previa con lo que se dará de alta, lo que se
            modificará y los errores.
          </div>
        )}
      </div>
      <div className="flex items-center gap-2">
        {resumen && (
          <span className="gw-label">
            {resumen.total} líneas · {resumen.altas} altas · {resumen.mods} modificaciones · {resumen.err} con errores
            {revision && revision.filas.length > 500 && ' · (vista previa de las 500 primeras)'}
          </span>
        )}
        <GwCheck label="Ver solo las líneas con errores" checked={verSoloErrores} onChange={setVerSoloErrores} />
        <span className="flex-1" />
        {ocupado && <span className="gw-label">{ocupado}</span>}
        <button type="button" className="gw-btn w-[170px] whitespace-nowrap" disabled={!revision || !!ocupado} onClick={importar}>
          <Play size={13} className="text-[#2a9d2a]" /> {soloComprobar ? 'Comprobar de nuevo' : 'Importar'}
        </button>
        <button type="button" className="gw-btn w-[90px]" onClick={() => navigate('/')}>
          Salir
        </button>
      </div>
    </div>
  )
}
