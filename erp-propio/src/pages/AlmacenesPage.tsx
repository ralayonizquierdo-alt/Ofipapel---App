import { useCallback, useEffect, useMemo, useState } from 'react'
import { FolderOpen } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { GwDate, GwField, GwGroup, GwInline, GwInput, GwLookupButton, GwNumber, GwRadio, GwSelect, GwTabs, GwTextArea, formatGw, type GwTabDef } from '../components/gw'
import { GwCampoBusqueda } from '../components/gw/GwCampoBusqueda'
import { GwLookupDialog } from '../components/gw/GwLookupDialog'
import { GwOperativa } from '../components/gw/GwOperativa'
import { GwRecordBar } from '../components/gw/GwRecordBar'
import { TabArticulosAlmacen } from './almacen/almacenes/TabArticulosAlmacen'

// Ficha de Almacenes calcada de GeminisWin (Almacén → Almacenes, capturas del 12/11/2026):
// cabecera Cód. · Nombre · F_alta · F_baja · Pers_cargo, pestañas «Datos Generales»,
// «Observaciones e Imagen» y «Artículos», y la barra de registro de todas las fichas.
// La ruta es «/almacenes» sin comodín, así que el almacén que se está viendo va en «?cod=».

interface Almacen {
  codigo: string
  nombre: string
  fecha_alta: string | null
  fecha_baja: string | null
  persona_cargo: string | null
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
  tope_compra: number | null
  tope_periodo: number | null
  tope_por_fecha_llegada: boolean
  observaciones: string | null
  imagen_url: string | null
  imagen_modo: number
  activo: boolean
}

const VACIO: Almacen = {
  codigo: '',
  nombre: '',
  fecha_alta: null,
  fecha_baja: null,
  persona_cargo: null,
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
  tope_compra: null,
  tope_periodo: null,
  tope_por_fecha_llegada: false,
  observaciones: null,
  imagen_url: null,
  imagen_modo: 1,
  activo: true,
}

const COLUMNAS = Object.keys(VACIO).join(', ')

const TABS: GwTabDef[][] = [
  [
    { key: 'generales', label: 'Datos Generales' },
    { key: 'obs', label: 'Observaciones e Imagen' },
    { key: 'articulos', label: 'Artículos' },
    { key: 'operativa', label: 'Operativa' },
  ],
]

// SUPUESTO: la captura no deja ver las opciones de «Para» (el desplegable sale en blanco). Se
// ponen los periodos que cuadran con el rótulo; el código es el TOPEPERIOD que trae GeminisWin
// (en los datos cargados hay almacenes con 1 y con 3). Pendiente de confirmar con Luis.
const PERIODOS = [
  { valor: 1, label: 'Día' },
  { valor: 2, label: 'Semana' },
  { valor: 3, label: 'Mes' },
  { valor: 4, label: 'Trimestre' },
  { valor: 5, label: 'Año' },
]

const MODOS_IMAGEN = [
  { valor: 0, label: 'Tamaño real', fit: 'object-none' },
  { valor: 1, label: 'Tamaño ajustado', fit: 'object-contain' },
  { valor: 2, label: 'Rellenar marco', fit: 'object-fill' },
]

const OPERATIVA = [
  {
    titulo: 'Para qué sirve',
    notas: [
      'Aquí están los almacenes de la empresa: el de cada tienda, el de devoluciones y roturas, etc. El código del almacén es el que se elige después en ventas, compras, traspasos e inventarios.',
      'Para moverte por los almacenes usa las flechas de abajo, o escribe el código o el nombre arriba y pulsa Intro. El botón de los prismáticos abre la lista para elegir uno.',
    ],
  },
  {
    titulo: 'Dar de alta o cambiar un almacén',
    pasos: [
      'Pulsa Nuevo: el código se propone solo (el primero libre, con 2 cifras; se puede cambiar) y la fecha de alta es la de hoy. Escribe el nombre y, si quieres, la persona a cargo.',
      'En Datos Generales rellena la dirección (los botones «…» buscan el código postal, la provincia y el país), los teléfonos, el correo y la web.',
      'Pulsa Aceptar. Para cambiarlo después: Modificar, cambia lo que haga falta y Aceptar. Cancelar deja la ficha como estaba.',
    ],
  },
  {
    titulo: 'Tope de Compras por Almacen',
    notas: [
      '«Tope» es el importe máximo en euros que se quiere comprar para este almacén en el periodo que se elige en «Para». Con 0,00 € no hay tope.',
      '«Por Fecha Pedido» cuenta las compras por el día en que se hizo el pedido; «Por Fecha Llegada», por el día en que llega la mercancía.',
      'Hoy estos datos solo se guardan en la ficha: el ERP todavía no avisa al hacer una compra que pase del tope.',
    ],
  },
  {
    titulo: 'Pestaña Artículos',
    pasos: [
      'Al entrar la rejilla está vacía. Elige si quieres ver los artículos genéricos y los anulados (el que tiene la marca verde es el elegido) y pulsa Aplicar.',
      'Si quieres solo los artículos de unas fechas, elige qué fecha mirar (por ejemplo «Fecha Última Compra»), cómo filtrar (Igual a, Desde, Hasta, Entre), pon las fechas y pulsa Aplicar.',
      'Salen los artículos que tienen stock anotado en este almacén: código, descripción, stock de ahora, stock inicial y la fecha de ese stock inicial. Doble clic en una fila abre la ficha del artículo.',
    ],
    notas: ['Aquí el stock solo se consulta. Para cambiarlo: Regularización de Stock, Traspasos o Inventarios.'],
  },
  {
    titulo: 'Bueno es saber',
    notas: [
      'Eliminar no borra el almacén: lo da de baja con la fecha de hoy (F_baja), porque puede tener stock y documentos. Para volver a activarlo, pulsa Modificar, borra la F_baja y Aceptar.',
      'Observaciones e Imagen: a la izquierda las notas del almacén; debajo de la imagen se escribe su dirección (URL). «Ver Imagen a ...» decide cómo se encaja en el marco.',
    ],
  },
]

const hoy = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Primer código numérico libre con 2 cifras (01, 02, 03…), como los de GeminisWin. */
function siguienteCodigo(codigos: string[]) {
  const usados = new Set(codigos.filter((c) => /^\d+$/.test(c)).map(Number))
  let n = 1
  while (usados.has(n)) n++
  return String(n).padStart(2, '0')
}

interface Opcion {
  codigo: string
  nombre: string
}

export function AlmacenesPage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const codParam = params.get('cod') ?? ''

  const [lista, setLista] = useState<Almacen[]>([])
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState<'consulta' | 'edicion' | 'alta'>('consulta')
  const [draft, setDraft] = useState<Almacen>(VACIO)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [orden, setOrden] = useState<'codigo' | 'nombre'>('codigo')
  const [tab, setTab] = useState('generales')
  const [buscar, setBuscar] = useState(false)
  const [buscarCp, setBuscarCp] = useState(false)
  const [buscarGeo, setBuscarGeo] = useState<'provincia' | 'pais' | null>(null)
  const [provincias, setProvincias] = useState<Opcion[]>([])
  const [paises, setPaises] = useState<Opcion[]>([])
  const [imagenRota, setImagenRota] = useState<string | null>(null)

  // Son muy pocos almacenes: se leen todos de una vez y se navega en memoria.
  const cargar = useCallback(async () => {
    const { data, error: err } = await supabase.from('almacen').select(COLUMNAS).order('codigo')
    if (err) setError(`No se han podido leer los almacenes (${err.message}). Vuelve a entrar en la pantalla.`)
    const filas = ((data ?? []) as unknown as Almacen[]).map((a) => ({ ...VACIO, ...a }))
    setLista(filas)
    setLoading(false)
    return filas
  }, [])

  useEffect(() => {
    void cargar()
    Promise.all([supabase.from('provincia').select('codigo, nombre').order('nombre'), supabase.from('pais').select('codigo, nombre').order('nombre')]).then(([pr, pa]) => {
      setProvincias((pr.data ?? []) as Opcion[])
      setPaises((pa.data ?? []) as Opcion[])
    })
  }, [cargar])

  const ordenada = useMemo(
    () => (orden === 'codigo' ? lista : [...lista].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es') || a.codigo.localeCompare(b.codigo))),
    [lista, orden],
  )
  // El almacén que se ve: el de «?cod=», o el primero si no se pide ninguno (o ya no existe).
  const registro = useMemo(() => lista.find((a) => a.codigo === codParam) ?? ordenada[0] ?? null, [lista, ordenada, codParam])
  const vacio = !loading && lista.length === 0
  const editing = mode !== 'consulta'
  const ro = !editing

  // En consulta la ficha enseña siempre el registro actual.
  useEffect(() => {
    if (mode === 'consulta') setDraft(registro ?? VACIO)
  }, [registro, mode])

  const goTo = (c?: string) => {
    if (!c) return
    setError(null)
    setParams({ cod: c }, { replace: true })
  }
  const idx = registro ? ordenada.findIndex((a) => a.codigo === registro.codigo) : -1

  function patch(p: Partial<Almacen>) {
    setDraft((d) => ({ ...d, ...p }))
  }

  function nuevo() {
    setError(null)
    setDraft({ ...VACIO, codigo: siguienteCodigo(lista.map((a) => a.codigo)), fecha_alta: hoy() })
    setTab('generales')
    setMode('alta')
  }

  function cancelar() {
    setError(null)
    setDraft(registro ?? VACIO)
    setMode('consulta')
  }

  async function guardar() {
    setError(null)
    const cod = draft.codigo.trim()
    const nombre = draft.nombre.trim()
    if (!cod || !nombre) {
      setError('Faltan datos: el código y el nombre del almacén son obligatorios. Escríbelos y pulsa Aceptar.')
      return
    }
    if (mode === 'alta' && lista.some((a) => a.codigo === cod)) {
      setError(`Ya existe un almacén con el código ${cod}. Pon otro código (el primero libre es el ${siguienteCodigo(lista.map((a) => a.codigo))}).`)
      return
    }
    if (draft.fecha_alta && draft.fecha_baja && draft.fecha_baja < draft.fecha_alta) {
      setError('La F_baja no puede ser anterior a la F_alta. Corrige una de las dos fechas.')
      return
    }
    setSaving(true)
    // Un almacén con fecha de baja deja de estar activo; sin ella, vuelve a estarlo.
    const payload = { ...draft, codigo: cod, nombre, activo: !draft.fecha_baja }
    const res = mode === 'alta' ? await supabase.from('almacen').insert(payload) : await supabase.from('almacen').update(payload).eq('codigo', registro?.codigo ?? cod)
    setSaving(false)
    if (res.error) {
      setError(
        res.error.code === '23505'
          ? `Ya existe un almacén con el código ${cod}. Pon otro código.`
          : res.error.code === '42501'
            ? 'No tienes permiso para cambiar almacenes. Pídeselo a un administrador (permiso de la pantalla Almacenes).'
            : `No se ha podido guardar el almacén (${res.error.message}). Revisa los datos y vuelve a pulsar Aceptar.`,
      )
      return
    }
    await cargar()
    setMode('consulta')
    goTo(cod)
  }

  async function darDeBaja() {
    if (!registro) return
    if (registro.fecha_baja) {
      setError(`El almacén ${registro.codigo} ya está dado de baja. Para volver a activarlo: Modificar, borra la F_baja y Aceptar.`)
      return
    }
    if (!confirm(`¿Dar de baja el almacén ${registro.codigo} ${registro.nombre}? No se borra: queda con la fecha de baja de hoy y se puede volver a activar.`)) return
    const { data, error: err } = await supabase.from('almacen').update({ activo: false, fecha_baja: hoy() }).eq('codigo', registro.codigo).select('codigo')
    if (err || !data?.length) {
      setError(`No se ha podido dar de baja el almacén${err ? ` (${err.message})` : ''}. Si no tienes permiso para cambiar almacenes, pídeselo a un administrador.`)
      return
    }
    await cargar()
  }

  /** Intro en Cód. o Nombre (en consulta): salta al almacén que coincide. */
  function buscarPor(campo: 'codigo' | 'nombre', texto: string) {
    const t = texto.trim().toUpperCase()
    const hallado =
      campo === 'codigo'
        ? lista.find((a) => a.codigo.toUpperCase() === t) ?? lista.find((a) => a.codigo.toUpperCase() === t.padStart(2, '0'))
        : ordenada.find((a) => a.nombre.toUpperCase().startsWith(t)) ?? ordenada.find((a) => a.nombre.toUpperCase().includes(t))
    if (hallado) goTo(hallado.codigo)
    else setError(campo === 'codigo' ? `No existe el almacén ${texto}. Pulsa el botón de buscar para ver la lista.` : `No existe ningún almacén cuyo nombre contenga «${texto}». Pulsa el botón de buscar para ver la lista.`)
  }

  if (loading) return <div className="p-4 text-[13px]">Cargando…</div>

  const txt = (key: keyof Almacen, title: string, max?: number) => (
    <GwInput
      value={(draft[key] ?? '') as string}
      disabled={ro}
      title={title}
      maxLength={max}
      onChange={(e) => patch({ [key]: e.target.value === '' ? null : e.target.value } as Partial<Almacen>)}
    />
  )
  const opciones = (ops: Opcion[], actual: string | null) => (
    <>
      <option value="" />
      {ops.map((o) => (
        <option key={o.codigo} value={o.codigo}>
          {o.nombre}
        </option>
      ))}
      {actual && !ops.some((o) => o.codigo === actual) && <option value={actual}>{actual}</option>}
    </>
  )
  const url = draft.imagen_url?.trim() || null
  const modoImagen = MODOS_IMAGEN.find((m) => m.valor === draft.imagen_modo) ?? MODOS_IMAGEN[1]

  return (
    <div className="flex flex-col gap-1">
      <div className="grid grid-cols-[84px_minmax(0,1.15fr)_160px_160px_minmax(0,1fr)] gap-x-2.5">
        <GwField label="Cód.">
          <GwCampoBusqueda
            value={draft.codigo}
            editable={mode === 'alta'}
            disabled={mode === 'edicion'}
            title="CODIGO"
            maxLength={4}
            onChange={(v) => patch({ codigo: v })}
            onBuscar={(t) => buscarPor('codigo', t)}
          />
        </GwField>
        <GwField label="Nombre">
          <GwCampoBusqueda value={draft.nombre} editable={editing} title="NOMBRE" maxLength={40} onChange={(v) => patch({ nombre: v })} onBuscar={(t) => buscarPor('nombre', t)} />
        </GwField>
        <GwField label="F_alta">
          <GwDate title="F_ALTA" value={draft.fecha_alta} disabled={ro} onChange={(v) => patch({ fecha_alta: v })} />
        </GwField>
        <GwField label="F_baja">
          <GwDate title="F_BAJA" value={draft.fecha_baja} disabled={ro} onChange={(v) => patch({ fecha_baja: v })} />
        </GwField>
        <GwField label="Pers_cargo">{txt('persona_cargo', 'PERS_CARGO: persona a cargo del almacén')}</GwField>
      </div>

      {(error || (mode === 'consulta' && registro?.fecha_baja)) && (
        <div className="text-[13px] text-[#c42b1c]">{error ?? 'Almacén dado de baja.'}</div>
      )}

      <div className="mt-1">
        <GwTabs rows={TABS} active={tab} onChange={setTab}>
          {vacio && mode !== 'alta' && tab !== 'operativa' ? (
            <div className="p-3 text-[13px]">No hay ningún almacén. Pulsa Nuevo para dar de alta el primero.</div>
          ) : (
            <div className="min-h-[300px]">
              {tab === 'generales' && (
                <div className="flex flex-col gap-1.5">
                  <GwGroup className="flex flex-col gap-1.5">
                    <div className="grid grid-cols-[250px_minmax(0,1fr)] gap-x-5">
                      <GwField label="Cod. Postal">
                        <span className="flex">
                          {txt('codigo_postal', 'CODPOSTAL', 10)}
                          <GwLookupButton disabled={ro} onClick={() => setBuscarCp(true)} title="Buscar código postal" />
                        </span>
                      </GwField>
                      <GwField label="Dirección">
                        <span className="flex">
                          {txt('direccion', 'DIRECCION')}
                          <GwLookupButton disabled={ro} onClick={() => setBuscarCp(true)} title="Buscar calle" />
                        </span>
                      </GwField>
                    </div>
                    <div className="grid grid-cols-[minmax(0,1.28fr)_minmax(0,1fr)_minmax(0,0.62fr)] gap-x-2">
                      <GwField label="Población">
                        <span className="flex">
                          {txt('poblacion', 'POBLACION')}
                          <GwLookupButton disabled={ro} onClick={() => setBuscarCp(true)} title="Buscar población" />
                        </span>
                      </GwField>
                      <GwField label="Província">
                        <span className="flex">
                          <GwSelect value={draft.provincia_codigo ?? ''} disabled={ro} title="PROVINCIA" onChange={(e) => patch({ provincia_codigo: e.target.value || null })}>
                            {opciones(provincias, draft.provincia_codigo)}
                          </GwSelect>
                          <GwLookupButton disabled={ro} onClick={() => setBuscarGeo('provincia')} title="Buscar provincia" />
                        </span>
                      </GwField>
                      <GwField label="País">
                        <span className="flex">
                          <GwSelect value={draft.pais_codigo ?? ''} disabled={ro} title="PAIS" onChange={(e) => patch({ pais_codigo: e.target.value || null })}>
                            {opciones(paises, draft.pais_codigo)}
                          </GwSelect>
                          <GwLookupButton disabled={ro} onClick={() => setBuscarGeo('pais')} title="Buscar país" />
                        </span>
                      </GwField>
                    </div>
                    <GwGroup title="Teléfonos" className="mr-[80px] flex items-center gap-6">
                      <GwInline label="Tlf. Fijo:" className="flex-1">
                        {txt('telefono_fijo', 'TELEFONO', 20)}
                      </GwInline>
                      <GwInline label="Tlf. Móvil:" className="flex-1">
                        {txt('telefono_movil', 'MOVIL', 20)}
                      </GwInline>
                      <GwInline label="Fax:" className="flex-1">
                        {txt('fax', 'FAX', 20)}
                      </GwInline>
                    </GwGroup>
                    <div className="grid grid-cols-2 gap-x-2">
                      <GwField label="Dirección E-mail (Correo Electrónico)">{txt('email', 'EMAIL')}</GwField>
                      <GwField label="Dirección Web (URL)">{txt('web', 'WEB')}</GwField>
                    </div>
                  </GwGroup>

                  <GwGroup title="Tope de Compras por Almacen" className="flex items-center gap-8">
                    <GwInline label="Tope:">
                      <span className="w-[230px]" title="TOPE: importe máximo de compras para este almacén, en euros">
                        {ro ? (
                          <GwInput disabled className="text-right" value={`${formatGw(draft.tope_compra ?? 0, 2)} €`} />
                        ) : (
                          <GwNumber value={draft.tope_compra} decimals={2} emptyAsZero onChange={(v) => patch({ tope_compra: v })} />
                        )}
                      </span>
                    </GwInline>
                    <GwInline label="Para:">
                      <span className="w-[290px]">
                        <GwSelect
                          value={draft.tope_periodo ?? ''}
                          disabled={ro}
                          title="TOPEPERIOD: periodo al que se aplica el tope"
                          onChange={(e) => patch({ tope_periodo: e.target.value === '' ? null : Number(e.target.value) })}
                        >
                          <option value="" />
                          {PERIODOS.map((p) => (
                            <option key={p.valor} value={p.valor}>
                              {p.label}
                            </option>
                          ))}
                          {draft.tope_periodo != null && !PERIODOS.some((p) => p.valor === draft.tope_periodo) && (
                            <option value={draft.tope_periodo}>Código {draft.tope_periodo}</option>
                          )}
                        </GwSelect>
                      </span>
                    </GwInline>
                    <div className="ml-auto flex w-[560px] items-center justify-around border border-[var(--gw-border-light)] px-2 py-1.5">
                      <GwRadio name="almacen-tope-fecha" label="Por Fecha Pedido" checked={!draft.tope_por_fecha_llegada} disabled={ro} onChange={() => patch({ tope_por_fecha_llegada: false })} />
                      <GwRadio name="almacen-tope-fecha" label="Por Fecha Llegada" checked={draft.tope_por_fecha_llegada} disabled={ro} onChange={() => patch({ tope_por_fecha_llegada: true })} />
                    </div>
                  </GwGroup>
                </div>
              )}

              {tab === 'obs' && (
                <div className="grid grid-cols-[minmax(0,0.38fr)_minmax(0,1fr)] gap-3">
                  <GwTextArea
                    title="OBSERV: observaciones del almacén"
                    className="h-[296px]! resize-none!"
                    disabled={ro}
                    value={draft.observaciones ?? ''}
                    onChange={(e) => patch({ observaciones: e.target.value === '' ? null : e.target.value })}
                  />
                  <div className="flex flex-col gap-1">
                    <div className="grid grid-cols-[minmax(0,1fr)_270px] gap-1.5">
                      <div className="relative h-[256px] overflow-hidden border border-[var(--gw-border)] bg-[var(--gw-face)]" title="IMAGEN">
                        {url && imagenRota !== url ? (
                          <img src={url} alt="" className={`h-full w-full ${modoImagen.fit}`} onError={() => setImagenRota(url)} />
                        ) : (
                          <svg className="absolute inset-0 h-full w-full" preserveAspectRatio="none" viewBox="0 0 100 100" aria-label="Sin imagen">
                            <line x1="0" y1="0" x2="100" y2="100" stroke="#9a9a9a" strokeWidth="0.5" vectorEffect="non-scaling-stroke" />
                            <line x1="100" y1="0" x2="0" y2="100" stroke="#9a9a9a" strokeWidth="0.5" vectorEffect="non-scaling-stroke" />
                          </svg>
                        )}
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[15px]">Ver Imagen a ...</span>
                        <div className="flex flex-col gap-1 border border-[var(--gw-border-light)] px-1.5 py-1">
                          {MODOS_IMAGEN.map((m) => (
                            <GwRadio key={m.valor} name="almacen-imagen-modo" label={m.label} checked={modoImagen.valor === m.valor} disabled={ro} onChange={() => patch({ imagen_modo: m.valor })} />
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <GwTextArea
                        rows={1}
                        className="h-[34px]! resize-none!"
                        title="IMAGEN: dirección (URL) de la imagen del almacén"
                        disabled={ro}
                        value={draft.imagen_url ?? ''}
                        onChange={(e) => patch({ imagen_url: e.target.value === '' ? null : e.target.value })}
                      />
                      <button
                        type="button"
                        className="gw-btn h-[34px]! w-[56px] flex-none"
                        disabled={ro}
                        title="Escribir la dirección (URL) de la imagen"
                        onClick={() => {
                          const v = prompt('Dirección (URL) de la imagen del almacén', draft.imagen_url ?? '')
                          if (v !== null) patch({ imagen_url: v.trim() || null })
                        }}
                      >
                        <FolderOpen size={15} className="text-[#b58a1a]" />
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* En alta el almacén aún no existe: la rejilla se ve vacía y apagada, como en GeminisWin. */}
              {tab === 'articulos' && <TabArticulosAlmacen almacen={mode === 'alta' ? '' : (registro?.codigo ?? '')} />}

              {tab === 'operativa' && <GwOperativa bloques={OPERATIVA} />}
            </div>
          )}
        </GwTabs>
      </div>

      <GwRecordBar
        mode={mode}
        canNavigate={mode === 'consulta' && ordenada.length > 0}
        saving={saving}
        onFirst={() => goTo(ordenada[0]?.codigo)}
        onPrev={() => goTo(ordenada[idx - 1]?.codigo)}
        onNext={() => goTo(ordenada[idx + 1]?.codigo)}
        onLast={() => goTo(ordenada[ordenada.length - 1]?.codigo)}
        onSort={() => setOrden((o) => (o === 'codigo' ? 'nombre' : 'codigo'))}
        onSearch={() => setBuscar(true)}
        onPrint={() => window.print()}
        onNew={nuevo}
        onEdit={() => {
          if (!registro) return
          setError(null)
          setMode('edicion')
        }}
        onDelete={darDeBaja}
        onSave={guardar}
        onCancel={cancelar}
        onExit={() => navigate('/')}
      />
      <div className="text-[11px] text-[#444]">
        Orden: {orden === 'codigo' ? 'por código' : 'por nombre'}
        {idx >= 0 && mode !== 'alta' ? ` · Registro ${idx + 1} de ${ordenada.length}` : ''}
        {mode === 'alta' ? ' · Alta de almacén' : mode === 'edicion' ? ' · Modificando' : ''}
      </div>

      {buscar && (
        <GwLookupDialog<{ codigo: string; nombre: string; poblacion: string | null }>
          title="Buscar Almacén"
          table="almacen"
          columns={[
            { key: 'codigo', label: 'Cód.', width: 70 },
            { key: 'nombre', label: 'Nombre' },
            { key: 'poblacion', label: 'Población', width: 180 },
          ]}
          searchColumns={['codigo', 'nombre', 'poblacion']}
          orderBy={orden === 'codigo' ? 'codigo' : 'nombre'}
          keyColumn="codigo"
          onPick={(r) => {
            setBuscar(false)
            goTo(r.codigo)
          }}
          onClose={() => setBuscar(false)}
        />
      )}
      {buscarGeo && (
        <GwLookupDialog<Opcion & Record<string, unknown>>
          title={buscarGeo === 'provincia' ? 'Provincias' : 'Países'}
          table={buscarGeo}
          columns={[
            { key: 'codigo', label: 'Código', width: 80 },
            { key: 'nombre', label: 'Nombre' },
          ]}
          searchColumns={['codigo', 'nombre']}
          orderBy="nombre"
          keyColumn="codigo"
          onPick={(r) => {
            patch(buscarGeo === 'provincia' ? { provincia_codigo: r.codigo } : { pais_codigo: r.codigo })
            setBuscarGeo(null)
          }}
          onClose={() => setBuscarGeo(null)}
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
          onPick={(r) => {
            patch({
              codigo_postal: r.codigo_postal,
              poblacion: r.poblacion,
              provincia_codigo: r.provincia_codigo ?? draft.provincia_codigo,
              pais_codigo: r.pais_codigo ?? draft.pais_codigo,
            })
            setBuscarCp(false)
          }}
          onClose={() => setBuscarCp(false)}
        />
      )}
    </div>
  )
}
