// Piezas comunes de las fichas del menú Archivo calcadas de GeminisWin (Tiendas, Datos de
// Empresa, Formas de Pago y Empleados): bloque de dirección, servidor SMTP, campo «código +
// descripción + ···», observaciones con imagen y el aviso de grupo administrador.

import { useEffect, useState, type ReactNode } from 'react'
import { ChevronDown, ChevronUp, FolderOpen } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { GwCheck, GwField, GwGroup, GwInline, GwInput, GwLookupButton, GwRadio, GwSelect, GwTextArea } from '../../components/gw'
import { GwLookupDialog } from '../../components/gw/GwLookupDialog'
import { seleccionAlPulsar, seleccionAlSoltar, useSeleccionAlEntrar } from '../../components/gw/seleccionEntrada'

export const hoy = () => new Date().toISOString().slice(0, 10)

/** ¿El empleado conectado pertenece a un grupo administrador? (rol.es_administrador). */
export function useEsAdministrador() {
  const [admin, setAdmin] = useState<boolean | null>(null)
  useEffect(() => {
    supabase.rpc('fn_es_administrador').then(({ data }) => setAdmin(data === true))
  }, [])
  return admin
}

interface Opcion {
  codigo: string
  nombre: string
}

/** Provincias y países para los desplegables (se piden una vez). */
function useProvinciasPaises() {
  const [provincias, setProvincias] = useState<Opcion[]>([])
  const [paises, setPaises] = useState<Opcion[]>([])
  useEffect(() => {
    Promise.all([
      supabase.from('provincia').select('codigo, nombre').order('nombre'),
      supabase.from('pais').select('codigo, nombre').order('nombre'),
    ]).then(([pr, pa]) => {
      setProvincias((pr.data ?? []) as Opcion[])
      setPaises((pa.data ?? []) as Opcion[])
    })
  }, [])
  return { provincias, paises }
}

function opciones(lista: Opcion[], actual: string | null) {
  return (
    <>
      <option value="" />
      {lista.map((o) => (
        <option key={o.codigo} value={o.codigo}>
          {o.nombre}
        </option>
      ))}
      {actual && !lista.some((o) => o.codigo === actual) && <option value={actual}>{actual}</option>}
    </>
  )
}

export interface Direccion {
  codigo_postal: string | null
  direccion: string | null
  poblacion: string | null
  provincia_codigo: string | null
  pais_codigo: string | null
  telefono_fijo: string | null
  telefono_movil: string | null
  fax: string | null
}

/**
 * Cod. Postal · Dirección (· algo más a la derecha) / Población · Província · País / Teléfonos,
 * como en Tiendas, Empresa y Empleados de GeminisWin. Los «···» abren códigos postales,
 * provincias y países.
 */
export function BloqueDireccion<T extends Direccion>({
  r,
  ro,
  onChange,
  derechaFila1,
}: {
  r: T
  ro: boolean
  onChange: (p: Partial<Direccion>) => void
  /** Campo a la derecha de la dirección (Fecha de Baja en Tiendas). */
  derechaFila1?: ReactNode
}) {
  const { provincias, paises } = useProvinciasPaises()
  const [buscarCp, setBuscarCp] = useState(false)
  const [buscar, setBuscar] = useState<'provincia' | 'pais' | null>(null)
  const txt = (key: keyof Direccion, title: string) => (
    <GwInput value={r[key] ?? ''} disabled={ro} title={title} onChange={(e) => onChange({ [key]: e.target.value === '' ? null : e.target.value })} />
  )
  return (
    <div className="flex flex-col gap-1">
      <div className={`grid gap-x-2 ${derechaFila1 ? 'grid-cols-[240px_minmax(0,1fr)_200px]' : 'grid-cols-[240px_minmax(0,1fr)]'}`}>
        <GwField label="Cod. Postal">
          <span className="flex">
            {txt('codigo_postal', 'CODPOSTAL')}
            <GwLookupButton disabled={ro} onClick={() => setBuscarCp(true)} title="Buscar código postal" />
          </span>
        </GwField>
        <GwField label="Dirección">
          <span className="flex">
            {txt('direccion', 'DIRECCION')}
            <GwLookupButton disabled={ro} onClick={() => setBuscarCp(true)} title="Buscar calle" />
          </span>
        </GwField>
        {derechaFila1}
      </div>
      <div className="grid grid-cols-[minmax(0,575fr)_minmax(0,450fr)_minmax(0,275fr)] gap-x-2">
        <GwField label="Población">
          <span className="flex">
            {txt('poblacion', 'POBLACION')}
            <GwLookupButton disabled={ro} onClick={() => setBuscarCp(true)} title="Buscar población" />
          </span>
        </GwField>
        <GwField label="Província">
          <span className="flex">
            <GwSelect value={r.provincia_codigo ?? ''} disabled={ro} title="PROVINCIA" onChange={(e) => onChange({ provincia_codigo: e.target.value || null })}>
              {opciones(provincias, r.provincia_codigo)}
            </GwSelect>
            <GwLookupButton disabled={ro} onClick={() => setBuscar('provincia')} title="Buscar provincia" />
          </span>
        </GwField>
        <GwField label="País">
          <span className="flex">
            <GwSelect value={r.pais_codigo ?? ''} disabled={ro} title="PAIS" onChange={(e) => onChange({ pais_codigo: e.target.value || null })}>
              {opciones(paises, r.pais_codigo)}
            </GwSelect>
            <GwLookupButton disabled={ro} onClick={() => setBuscar('pais')} title="Buscar país" />
          </span>
        </GwField>
      </div>
      <GwGroup title="Teléfonos" className="mr-[90px] flex items-center gap-3">
        <GwInline label="Tlf. Fijo:" className="flex-1">
          {txt('telefono_fijo', 'TLF_FIJO')}
        </GwInline>
        <GwInline label="Tlf. Móvil:" className="flex-1">
          {txt('telefono_movil', 'TLF_MOVIL')}
        </GwInline>
        <GwInline label="Fax:" className="flex-1">
          {txt('fax', 'TLF_FAX')}
        </GwInline>
      </GwGroup>

      {buscar && (
        <GwLookupDialog<Opcion & Record<string, unknown>>
          title={buscar === 'provincia' ? 'Provincias' : 'Países'}
          table={buscar}
          columns={[
            { key: 'codigo', label: 'Código', width: 80 },
            { key: 'nombre', label: 'Nombre' },
          ]}
          searchColumns={['codigo', 'nombre']}
          orderBy="nombre"
          keyColumn="codigo"
          onPick={(o) => {
            onChange(buscar === 'provincia' ? { provincia_codigo: o.codigo } : { pais_codigo: o.codigo })
            setBuscar(null)
          }}
          onClose={() => setBuscar(null)}
        />
      )}
      {buscarCp && (
        <GwLookupDialog<{ codigo_postal: string; poblacion: string; calle: string | null; provincia_codigo: string | null; pais_codigo: string | null }>
          title="Códigos Postales"
          table="codigo_postal"
          columns={[
            { key: 'codigo_postal', label: 'C. Postal', width: 80 },
            { key: 'poblacion', label: 'Población' },
            { key: 'calle', label: 'Calle' },
            { key: 'provincia_codigo', label: 'Prov.', width: 60 },
          ]}
          searchColumns={['codigo_postal', 'poblacion', 'calle']}
          orderBy="codigo_postal"
          keyColumn="codigo_postal"
          onPick={(cp) => {
            onChange({
              codigo_postal: cp.codigo_postal,
              poblacion: cp.poblacion,
              provincia_codigo: cp.provincia_codigo ?? r.provincia_codigo,
              pais_codigo: cp.pais_codigo ?? r.pais_codigo,
            })
            setBuscarCp(false)
          }}
          onClose={() => setBuscarCp(false)}
        />
      )}
    </div>
  )
}

export interface Smtp {
  smtp_servidor: string | null
  smtp_usuario: string | null
  smtp_puerto: number | null
  smtp_ssl: boolean
}

/**
 * «Servidor SMTP, Enviar corrreo» (sic, así sale en GeminisWin). La contraseña del correo NO se
 * guarda en la base de datos (la leería cualquier empleado): queda en gris hasta que el envío
 * de correo se haga desde el servidor con la clave como secreto.
 */
export function GrupoSmtp({ r, ro, onChange }: { r: Smtp; ro: boolean; onChange: (p: Partial<Smtp>) => void }) {
  return (
    <GwGroup title="Servidor SMTP, Enviar corrreo" className="grid grid-cols-[minmax(0,445fr)_minmax(0,485fr)_145px_85px_auto] items-end gap-x-2">
      <GwField>
        <GwInput value={r.smtp_servidor ?? ''} disabled={ro} title="SMTP_SERVER" onChange={(e) => onChange({ smtp_servidor: e.target.value || null })} />
      </GwField>
      <GwField label="Usuario">
        <GwInput value={r.smtp_usuario ?? ''} disabled={ro} title="SMTP_USER" onChange={(e) => onChange({ smtp_usuario: e.target.value || null })} />
      </GwField>
      <GwField label="Contraseña">
        <GwInput
          type="password"
          value=""
          disabled
          title="La contraseña del correo no se guarda en la ficha: irá como secreto del servidor cuando se active el envío de correo."
          onChange={() => undefined}
        />
      </GwField>
      <GwField label="Puerto">
        <GwInput
          className="text-right"
          inputMode="numeric"
          value={r.smtp_puerto ?? 0}
          disabled={ro}
          title="SMTP_PORT"
          onChange={(e) => onChange({ smtp_puerto: e.target.value === '' ? null : Number(e.target.value.replace(/\D/g, '')) || 0 })}
        />
      </GwField>
      <GwCheck className="mb-[3px] text-[15px]" label="SSL" checked={r.smtp_ssl} disabled={ro} onChange={(v) => onChange({ smtp_ssl: v })} />
    </GwGroup>
  )
}

/**
 * «Código + descripción + ···» enlazado a otra tabla (forma de pago, almacén, zona, vendedor…).
 * `desplegable`: la descripción es un desplegable con todos (formas de pago, grupos), si no
 * es un texto de solo lectura.
 */
export function CampoEnlace({
  tabla,
  campoNombre,
  titulo,
  value,
  onChange,
  disabled,
  desplegable = false,
  anchoCodigo = 88,
  title,
  claveNumerica = false,
}: {
  tabla: string
  campoNombre: string
  titulo: string
  value: string | null
  onChange: (v: string | null) => void
  disabled?: boolean
  desplegable?: boolean
  anchoCodigo?: number
  title?: string
  /** La clave es un número (rol.id): se busca y se muestra igual, pero en la tabla es «id». */
  claveNumerica?: boolean
}) {
  const clave = claveNumerica ? 'id' : 'codigo'
  const [nombre, setNombre] = useState('')
  const [todos, setTodos] = useState<Opcion[]>([])
  const [buscar, setBuscar] = useState(false)
  const [texto, setTexto] = useState<string | null>(null)

  useEffect(() => {
    if (!desplegable) return
    supabase
      .from(tabla)
      .select(`${clave}, ${campoNombre}`)
      .order(clave)
      .then(({ data }) => setTodos(((data ?? []) as unknown as Record<string, unknown>[]).map((d) => ({ codigo: String(d[clave]), nombre: String(d[campoNombre] ?? '') }))))
  }, [desplegable, tabla, campoNombre, clave])

  useEffect(() => {
    if (!value) return setNombre('')
    if (desplegable) return
    supabase
      .from(tabla)
      .select(campoNombre)
      .eq(clave, value)
      .maybeSingle()
      .then(({ data }) => setNombre(String((data as Record<string, unknown> | null)?.[campoNombre] ?? '')))
  }, [value, desplegable, tabla, campoNombre, clave])

  async function confirmarCodigo() {
    if (texto == null) return
    const t = texto.trim()
    setTexto(null)
    if (t === (value ?? '')) return
    if (!t) return onChange(null)
    const { data } = await supabase.from(tabla).select(clave).in(clave, claveNumerica ? [t] : [t, t.toUpperCase()]).limit(1)
    const c = (data as Record<string, unknown>[] | null)?.[0]?.[clave]
    if (c != null) onChange(String(c))
    else alert(`No existe el código ${t} en ${titulo}.`)
  }

  const nombreMostrado = desplegable ? (todos.find((o) => o.codigo === value)?.nombre ?? '') : nombre
  return (
    <span className="flex min-w-0 gap-1">
      <GwInput
        style={{ width: anchoCodigo, flex: 'none' }}
        className={claveNumerica ? 'text-right' : ''}
        value={texto ?? value ?? ''}
        disabled={disabled}
        title={title}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={confirmarCodigo}
        onKeyDown={(e) => e.key === 'Enter' && confirmarCodigo()}
      />
      <span className="flex min-w-0 flex-1">
        {desplegable ? (
          <GwSelect value={value ?? ''} disabled={disabled} title={titulo} onChange={(e) => onChange(e.target.value || null)}>
            <option value="" />
            {todos.map((o) => (
              <option key={o.codigo} value={o.codigo}>
                {o.nombre}
              </option>
            ))}
          </GwSelect>
        ) : (
          <GwInput readOnly value={nombreMostrado} tabIndex={-1} title={titulo} />
        )}
        <GwLookupButton disabled={disabled} onClick={() => setBuscar(true)} title={`Buscar en ${titulo}`} />
      </span>
      {buscar && (
        <GwLookupDialog<Record<string, unknown>>
          title={titulo}
          table={tabla}
          columns={[
            { key: clave, label: 'Código', width: 90 },
            { key: campoNombre, label: campoNombre === 'nombre' ? 'Nombre' : 'Descripción' },
          ]}
          searchColumns={claveNumerica ? [campoNombre] : ['codigo', campoNombre]}
          orderBy={clave}
          keyColumn={clave}
          onPick={(r) => {
            onChange(String(r[clave]))
            setBuscar(false)
          }}
          onClose={() => setBuscar(false)}
        />
      )}
    </span>
  )
}

const MODOS_IMAGEN = ['Tamaño real', 'Tamaño ajustado', 'Rellenar marco']

/**
 * Pestaña «Observaciones e Imagen» / «Observaciones y Logotipo» de GeminisWin: observaciones a
 * la izquierda, la imagen en el centro, «Ver Imagen a …» a la derecha y la ruta con la carpeta
 * debajo de la imagen.
 */
export function ObservacionesImagen({
  observaciones,
  imagenUrl,
  imagenModo,
  ro,
  onChange,
  nombre,
  tituloImagen,
  porDefecto,
  alto = 450,
  sinObservaciones = false,
}: {
  observaciones: string | null
  imagenUrl: string | null
  imagenModo: number
  ro: boolean
  onChange: (p: { observaciones?: string | null; imagen_url?: string | null; imagen_modo?: number }) => void
  nombre: string
  /** «Logotipo» en Datos de Empresa. */
  tituloImagen?: string
  /** Imagen que se ve si no hay ninguna puesta (logotipo del ERP). */
  porDefecto?: string
  alto?: number
  /** Solo la imagen (pestaña «Imagen» de Formas de Pago). */
  sinObservaciones?: boolean
}) {
  const [rota, setRota] = useState<string | null>(null)
  const url = imagenUrl?.trim() || porDefecto || null
  const ajuste = imagenModo === 0 ? 'object-none' : imagenModo === 2 ? 'object-fill' : 'object-contain'
  return (
    <div className={`grid gap-x-[10px] ${sinObservaciones ? 'grid-cols-1' : 'grid-cols-[minmax(0,375fr)_minmax(0,1000fr)]'}`} style={{ height: alto }}>
      {!sinObservaciones && (
        <GwField label="Observaciones" className="h-full">
          <GwTextArea
            title="OBSERV"
            className="min-h-0 flex-1 resize-none"
            disabled={ro}
            value={observaciones ?? ''}
            onChange={(e) => onChange({ observaciones: e.target.value === '' ? null : e.target.value })}
          />
        </GwField>
      )}
      <div className="flex min-h-0 flex-col">
        {tituloImagen ? <span className="gw-label">{tituloImagen}</span> : <span className="h-[4px]" />}
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_265px] gap-x-1.5 border-t border-[var(--gw-border-light)] pt-0.5">
          <div className="relative overflow-hidden border-2 border-[var(--gw-border-light)] bg-[var(--gw-face)]" title="IMAGEN">
            {url && rota !== url ? (
              <img src={url} alt="" className={`h-full w-full ${ajuste}`} onError={() => setRota(url)} />
            ) : (
              <svg className="absolute inset-0 h-full w-full" preserveAspectRatio="none" viewBox="0 0 100 100" aria-label="Sin imagen">
                <line x1="0" y1="0" x2="100" y2="100" stroke="#9a9a9a" strokeWidth="0.5" vectorEffect="non-scaling-stroke" />
                <line x1="100" y1="0" x2="0" y2="100" stroke="#9a9a9a" strokeWidth="0.5" vectorEffect="non-scaling-stroke" />
              </svg>
            )}
          </div>
          <div className="flex flex-col pt-3">
            <span className="gw-label text-[15px]">Ver Imagen a ...</span>
            <div className="flex flex-col gap-1 border border-[var(--gw-border-light)] px-1.5 py-1">
              {MODOS_IMAGEN.map((l, i) => (
                <GwRadio key={l} name={`${nombre}-imagen-modo`} label={<span className="text-[15px]">{l}</span>} checked={imagenModo === i} disabled={ro} onChange={() => onChange({ imagen_modo: i })} />
              ))}
            </div>
          </div>
        </div>
        <div className="mt-1.5 flex">
          <GwInput
            value={imagenUrl ?? ''}
            disabled={ro}
            placeholder={porDefecto && !imagenUrl ? 'Logotipo por defecto del ERP (marca/logo-ofipapel.png)' : undefined}
            title="Ruta o dirección (URL) de la imagen"
            onChange={(e) => onChange({ imagen_url: e.target.value === '' ? null : e.target.value })}
          />
          <button
            type="button"
            className="gw-btn flex-none px-0"
            style={{ width: 58, height: 22 }}
            disabled={ro}
            title="Elegir imagen (dirección de la imagen)"
            onClick={() => {
              const v = prompt('Dirección (URL) de la imagen', imagenUrl ?? '')
              if (v !== null) onChange({ imagen_url: v.trim() || null })
            }}
          >
            <FolderOpen size={14} className="text-[#b8860b]" />
          </button>
        </div>
      </div>
    </div>
  )
}

/** Campo numérico entero con flechas arriba/abajo (los «spinner» de GeminisWin). */
export function GwSpin({
  value,
  onChange,
  disabled,
  min = 0,
  max = 9999,
  decimales = 0,
  paso = 1,
  title,
  className = '',
}: {
  value: number | null
  onChange: (v: number | null) => void
  disabled?: boolean
  min?: number
  max?: number
  decimales?: number
  paso?: number
  title?: string
  className?: string
}) {
  // Con el foco, valor en bruto; `texto` es lo tecleado (null sin teclear: al salir no cambia nada).
  const [enfocado, setEnfocado] = useState(false)
  const [texto, setTexto] = useState<string | null>(null)
  const v = value ?? 0
  const mostrar = (n: number) => n.toLocaleString('es-ES', { minimumFractionDigits: decimales, maximumFractionDigits: decimales })
  const mostrado = texto ?? (enfocado ? String(v).replace('.', ',') : mostrar(v))
  // Sin teclear, todo seleccionado: lo que se escribe sustituye al valor (seleccionEntrada.ts).
  const campoNum = useSeleccionAlEntrar(enfocado && texto == null, mostrado)
  const fijar = (n: number) => onChange(Math.min(max, Math.max(min, Math.round(n * 10 ** decimales) / 10 ** decimales)))
  return (
    <span className={`flex min-w-0 ${className}`}>
      <input
        className="gw-input gw-num min-w-0 flex-1"
        value={mostrado}
        disabled={disabled}
        title={title}
        ref={campoNum}
        onMouseDown={seleccionAlPulsar}
        onMouseUp={seleccionAlSoltar}
        onFocus={() => setEnfocado(true)}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={() => {
          setEnfocado(false)
          if (texto == null) return
          const n = Number(texto.replace(/\./g, '').replace(',', '.'))
          setTexto(null)
          if (!Number.isNaN(n)) fijar(n)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            setTexto(null)
            fijar(v + (e.key === 'ArrowUp' ? paso : -paso))
          }
        }}
      />
      <span className="flex w-[13px] flex-none flex-col border border-l-0 border-[var(--gw-border)] bg-[var(--gw-face)]">
        <button type="button" tabIndex={-1} disabled={disabled} className="flex h-1/2 items-center justify-center disabled:text-[#9a9a9a]" onClick={() => fijar(v + paso)}>
          <ChevronUp size={9} />
        </button>
        <button type="button" tabIndex={-1} disabled={disabled} className="flex h-1/2 items-center justify-center disabled:text-[#9a9a9a]" onClick={() => fijar(v - paso)}>
          <ChevronDown size={9} />
        </button>
      </span>
    </span>
  )
}

/** Pestaña sin captura todavía (Bancos): en gris, como las opciones de menú pendientes. */
export function PestanaPendiente({ texto, alto = 300 }: { texto: string; alto?: number }) {
  return (
    <div className="flex items-start p-3 text-[13px] text-[#8a8a8a]" style={{ minHeight: alto }}>
      {texto}
    </div>
  )
}

/** Fila de pestañas abajo del panel (Parámetros de Tiendas: Generales · Contadores · Tarifas). */
export function PestanasAbajo({ tabs, active, onChange }: { tabs: { key: string; label: string }[]; active: string; onChange: (k: string) => void }) {
  return (
    <div className="flex">
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          onClick={() => onChange(t.key)}
          className={`-mt-px flex-auto whitespace-nowrap border border-[var(--gw-border)] px-2 text-[15px] ${
            t.key === active ? 'z-10 h-[30px] border-t-transparent bg-[var(--gw-face)] font-bold' : 'mb-[2px] h-[28px] bg-[#f6f6f6] hover:bg-[#e5f1fb]'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}
